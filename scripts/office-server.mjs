import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { Client } from 'eve/client';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.POGEUN_PORT || 4173);
const runtimePort = Number(process.env.POGEUN_RUNTIME_PORT || 4174);
const localOrigin = `http://127.0.0.1:${port}`;
const githubOrigin = 'https://gahyeon06.github.io';
const origins = new Set([localOrigin, githubOrigin]);
const token = randomBytes(32).toString('hex');
const stateDir = process.env.POGEUN_STATE_DIR ? pathToFileURL(resolve(process.env.POGEUN_STATE_DIR) + sep) : new URL('../.eve/office/', import.meta.url);
const client = new Client({ baseUrl: `http://127.0.0.1:${runtimePort}` });
const agentIds = new Set(['manager', 'researcher', 'planner', 'designer', 'developer', 'qa', 'security']);
const active = new Map();
let key = '', config = { model: 'gpt-6-luna-fast' }, jobs = [], child, runtimeError = '', configBusy = false;
let persistQueue = Promise.resolve();
await mkdir(stateDir, { recursive: true });
const file = name => new URL(name, stateDir);
const clean = value => String(value || '').replaceAll(key || '\u0000', '[비밀키 숨김]').replace(/sk-[A-Za-z0-9_-]{10,}/g, '[비밀키 숨김]').slice(0, 1500);

function vault(operation, value) {
  if (process.platform !== 'win32') throw new Error('이 키 저장 방식은 Windows 전용입니다.');
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./protect-key.ps1', import.meta.url)), '-Operation', operation], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', chunk => { output += chunk; });
    proc.stderr.resume();
    proc.on('error', () => reject(new Error('Windows 암호화 저장소를 실행하지 못했어요.')));
    proc.on('close', code => code === 0 ? resolve(output) : reject(new Error('Windows 계정 암호화 처리에 실패했어요.')));
    proc.stdin.end(value);
  });
}
try { config = { ...config, ...JSON.parse(await readFile(file('config.json'), 'utf8')) }; } catch {}
try { key = await vault('unprotect', await readFile(file('key.dpapi'), 'utf8')); } catch {}
if (!key && process.env.OPENAI_API_KEY) key = process.env.OPENAI_API_KEY;
try {
  const saved = JSON.parse(await readFile(file('jobs.json'), 'utf8'));
  if (Array.isArray(saved)) jobs = saved.slice(-200).map(job => ['running', 'queued', 'waiting'].includes(job.status) ? { ...job, status: 'interrupted', error: '연결 프로그램이 재시작되어 작업을 중단했어요. 자동으로 재전송하지 않았어요.' } : job);
} catch {}

function persist() {
  const content = JSON.stringify(jobs);
  persistQueue = persistQueue.catch(() => {}).then(async () => {
    await writeFile(file('jobs.tmp'), content, { mode: 0o600 });
    await rename(file('jobs.tmp'), file('jobs.json'));
  });
  return persistQueue;
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(value)); }
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw httpError(415, 'JSON 요청만 받을 수 있어요.');
  let data = '';
  for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 24000) throw httpError(413, '요청이 너무 커요.'); }
  try { return JSON.parse(data); } catch { throw httpError(400, '요청 형식이 올바르지 않아요.'); }
}
function authorized(req) {
  const candidate = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function isLocalPage(req) { return req.headers.origin === localOrigin || (!req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin'); }
async function runtimeReady() {
  try {
    const response = await client.fetch('/eve/v1/health', { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).status === 'ready';
  } catch { return false; }
}
async function startRuntime() {
  if (!key || child) return;
  // 포트 충돌 시 기존의 알 수 없는 프로세스를 재사용하거나 종료하지 않습니다.
  if (await runtimeReady()) { runtimeError = `${runtimePort} 포트를 다른 AI 서버가 사용 중이에요. 기존 실행을 종료한 뒤 다시 시작해주세요.`; return; }
  await writeFile(new URL('../.eve/provider.json', import.meta.url), JSON.stringify({ selected: 'openai', keySource: 'environment' }));
  const env = { ...process.env, OPENAI_API_KEY: key, POGEUN_OPENAI_MODEL: config.model, EVE_TELEMETRY_DISABLED: '1' };
  delete env.AI_GATEWAY_API_KEY;
  delete env.VERCEL_OIDC_TOKEN;
  runtimeError = '';
  child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/eve/bin/eve.js', import.meta.url)), 'dev', '--no-ui', '--no-default-extensions', '--host', '127.0.0.1', '--port', String(runtimePort)], { cwd: root, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  child.stderr.on('data', chunk => { const message = clean(chunk.toString()); if (/EPERM|EADDRINUSE|Error:/i.test(message)) runtimeError = message; });
  child.on('error', () => { runtimeError = 'AI 실행 프로그램을 시작하지 못했어요.'; child = undefined; });
  child.on('exit', code => { if (code && !runtimeError) runtimeError = `AI 실행 프로그램이 종료됐어요 (코드 ${code}).`; child = undefined; });
}
async function status() {
  const ready = Boolean(key) && Boolean(child) && await runtimeReady();
  return { service: 'pogeun-office', version: 2, keyConfigured: Boolean(key), ready, model: config.model, runtimeError: clean(runtimeError), activeJobs: active.size };
}
async function models(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length < 15 || apiKey.length > 2000 || /\s/.test(apiKey)) throw httpError(400, 'API 키를 다시 확인해주세요.');
  const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw httpError(400, response.status === 401 ? 'API 키 인증에 실패했어요. OpenAI에서 발급한 키인지 확인해주세요.' : `OpenAI 모델 목록을 확인하지 못했어요 (HTTP ${response.status}). 키 권한과 네트워크를 확인해주세요.`);
  const data = await response.json();
  return (data.data || []).map(item => item.id).filter(id => /^(gpt-|o[134]-|o[134]$)/.test(id) && !/audio|realtime|transcribe|tts|image|search/.test(id)).sort().slice(0, 150);
}
function safeInteractions(items = []) {
  return items.map(item => ({ interactionId: item.interactionId, request: { kind: item.request?.kind, title: clean(item.request?.title), prompt: clean(item.request?.prompt), allowFreeform: Boolean(item.request?.allowFreeform), options: item.request?.options?.map(option => ({ id: option.id, label: clean(option.label) })) || [] } }));
}
function safeJob(job) { const { sessionId, ...publicJob } = job; return publicJob; }
function addActivity(job, text, agent) {
  if (job.activity.at(-1)?.text === text) return;
  job.activity.push({ text: clean(text), agent, at: new Date().toISOString() });
  job.activity = job.activity.slice(-50);
}
async function consume(job, session, delivery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  active.set(job.id, { session, controller });
  try {
    for await (const event of delivery.stream({ signal: controller.signal })) {
      if (event.type === 'model.started') addActivity(job, 'AI가 업무를 검토하고 있어요.', 'manager');
      if (event.type === 'call.requested' && event.data.capability?.kind === 'agent') {
        const name = event.data.capability.name;
        addActivity(job, `${name} 담당에게 업무를 전달했어요.`, agentIds.has(name) ? name : 'manager');
      }
      if (event.type === 'call.settled') addActivity(job, event.data.outcome === 'completed' ? '담당 업무의 결과가 도착했어요.' : '담당 업무의 처리 상태를 확인하고 있어요.', 'manager');
      if (event.type === 'content.completed' && event.data.kind === 'text' && event.data.phase === 'reply') job.reply = String(event.data.value || '').slice(0, 160000);
    }
    const result = await delivery.result({ signal: controller.signal });
    job.reply = String(result.reply || job.reply || '').slice(0, 160000);
    job.status = result.status === 'completed' ? 'completed' : result.status === 'awaiting-input' ? 'waiting' : result.status === 'cancelled' ? 'cancelled' : 'failed';
    job.interactions = safeInteractions(result.interactions);
    if (result.error) job.error = clean(result.error.message);
    addActivity(job, job.status === 'completed' ? '최종 답변이 준비됐어요.' : job.status === 'waiting' ? '대표님의 확인을 기다리고 있어요.' : '작업이 종료됐어요.', 'manager');
  } catch (error) {
    job.status = controller.signal.aborted ? 'cancelled' : 'failed';
    job.error = controller.signal.aborted ? '작업을 중지했거나 15분 실행 시간을 초과했어요.' : clean(error.message);
    await session.cancel().catch(() => {});
  } finally {
    clearTimeout(timer);
    active.delete(job.id);
    job.updated = new Date().toISOString();
    await persist();
  }
}
async function submit(job) {
  try {
    job.status = 'running';
    addActivity(job, '총괄 매니저에게 브리핑을 전달하고 있어요.', 'manager');
    const requested = job.agents.filter(id => id !== 'manager');
    const message = `웹 사무실에서 대표가 보낸 업무입니다.\n선택한 담당자: ${job.agents.join(', ')}\n${requested.length ? `선택된 전문 담당자(${requested.join(', ')})에게 필요한 업무를 실제 subagent 도구로 위임하세요. 선택되지 않은 전문 담당자를 호출하지 마세요. 인계할 문맥과 작업 결과를 전달하세요.` : '총괄이 직접 답변하세요. 전문 담당자 도구는 호출하지 마세요.'}\n아직 외부 저장소, 브라우저, Docker가 연결되어 있지 않으므로 실제 실행할 수 없는 항목은 미검증으로 표시하고, 가능한 코드나 문서 결과물을 답변에 포함하세요.\n\n대표의 업무:\n${job.title}`;
    const { session, delivery } = await client.sessions.create({ message });
    job.sessionId = session.sessionId || delivery.sessionId;
    await persist();
    await consume(job, session, delivery);
  } catch (error) { job.status = 'failed'; job.error = clean(error.message); await persist(); }
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const origin = req.headers.origin;
  if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, { error: '허용되지 않은 호스트예요.' });
  if (origin && !origins.has(origin)) return json(res, 403, { error: '허용되지 않은 웹사이트예요.' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url, localOrigin);
  try {
    if (req.method === 'GET' && ['/', '/index.html', '/connect', '/bridge-setup.js', '/office-connection.js'].includes(url.pathname)) {
      const path = url.pathname === '/connect' ? './connect.html' : url.pathname === '/bridge-setup.js' ? './bridge-setup.js' : url.pathname === '/office-connection.js' ? '../office-connection.js' : '../index.html';
      const content = await readFile(new URL(path, import.meta.url));
      res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
      if (url.pathname === '/connect') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
      return res.end(content);
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { service: 'pogeun-office', version: 2 });
    if (req.method === 'GET' && url.pathname === '/api/session') {
      if (!isLocalPage(req)) throw httpError(403, '이 PC의 설정 화면에서 연결해주세요.');
      return json(res, 200, { token, baseUrl: localOrigin });
    }
    if (!url.pathname.startsWith('/api/')) throw httpError(404, '찾을 수 없어요.');
    if (!authorized(req)) throw httpError(401, 'PC 연결을 다시 해주세요.');
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, await status());
    if (req.method === 'POST' && ['/api/models', '/api/configure'].includes(url.pathname)) {
      if (!isLocalPage(req)) throw httpError(403, 'API 키 설정은 이 PC의 설정 화면에서만 가능해요.');
      if (configBusy || active.size || jobs.some(job => ['queued', 'running', 'waiting'].includes(job.status))) throw httpError(409, '진행 중인 설정 또는 작업이 끝난 뒤 다시 시도해주세요.');
      configBusy = true;
      try {
        const input = await body(req);
        const apiKey = input.apiKey || key;
        const available = await models(apiKey);
        if (url.pathname === '/api/models') return json(res, 200, { models: available, model: config.model });
        if (typeof input.model !== 'string' || !available.includes(input.model)) throw httpError(400, '목록에서 사용할 모델을 선택해주세요.');
        const encrypted = await vault('protect', apiKey);
        await writeFile(file('key.dpapi'), encrypted, { mode: 0o600 });
        config = { model: input.model };
        await writeFile(file('config.json'), JSON.stringify(config), { mode: 0o600 });
        key = apiKey;
        if (child) { child.kill(); child = undefined; await new Promise(resolve => setTimeout(resolve, 1000)); }
        await startRuntime();
        return json(res, 200, { saved: true, model: config.model });
      } finally { configBusy = false; }
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const input = await body(req);
      if (!input || !/^[a-zA-Z0-9-]{8,100}$/.test(input.id || '') || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 2000 || !Array.isArray(input.agents) || !input.agents.length || input.agents.some(id => !agentIds.has(id))) throw httpError(400, '업무 내용과 담당자를 확인해주세요.');
      const existing = jobs.find(job => job.clientId === input.id);
      if (existing) return json(res, 200, safeJob(existing));
      if (/sk-[A-Za-z0-9_-]{15,}/.test(input.title)) throw httpError(400, 'API 키로 보이는 내용이 있어요. 비밀키를 업무 내용에 넣지 마세요.');
      if (!(await status()).ready) throw httpError(503, runtimeError || 'API 키 설정과 AI 서버 시작을 먼저 완료해주세요.');
      if (active.size || jobs.some(job => ['queued', 'running', 'waiting'].includes(job.status))) throw httpError(409, '현재 업무가 끝난 뒤 다음 업무를 실행해주세요.');
      const job = { id: randomUUID(), clientId: input.id, title: input.title.trim(), agents: [...new Set(input.agents)], status: 'queued', reply: '', activity: [], interactions: [], created: new Date().toISOString() };
      jobs.push(job); jobs = jobs.slice(-200);
      await persist();
      json(res, 202, safeJob(job));
      void submit(job);
      return;
    }
    const match = url.pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]{8,100})(?:\/(cancel|respond))?$/);
    if (match) {
      const job = jobs.find(job => job.id === match[1]);
      if (!job) throw httpError(404, '업무를 찾을 수 없어요.');
      if (req.method === 'GET' && !match[2]) return json(res, 200, safeJob(job));
      if (req.method === 'POST' && match[2] === 'cancel') {
        const current = active.get(job.id);
        if (current) { await current.session.cancel(); current.controller.abort(); }
        else if (job.status === 'waiting' && job.sessionId) { await client.sessions.attach(job.sessionId).cancel(); job.status = 'cancelled'; await persist(); }
        return json(res, 200, safeJob(job));
      }
      if (req.method === 'POST' && match[2] === 'respond') {
        if (job.status !== 'waiting' || !job.sessionId || active.size) throw httpError(409, '응답을 받을 수 있는 상태가 아니에요.');
        const input = await body(req);
        const request = job.interactions.find(item => item.interactionId === input.interactionId);
        if (!request) throw httpError(400, '확인 요청을 찾을 수 없어요.');
        const answer = { interactionId: input.interactionId };
        if (input.optionId && request.request.options.some(option => option.id === input.optionId)) answer.optionId = input.optionId;
        else if (request.request.allowFreeform && typeof input.text === 'string' && input.text.trim() && input.text.length <= 2000) answer.text = input.text;
        else throw httpError(400, '답변을 선택하거나 입력해주세요.');
        const session = client.sessions.attach(job.sessionId);
        const delivery = await session.respond([answer]);
        job.status = 'running'; job.interactions = []; await persist();
        json(res, 202, safeJob(job)); void consume(job, session, delivery); return;
      }
    }
    throw httpError(404, '지원하지 않는 요청이에요.');
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? clean(error.message) : '연결 프로그램에서 오류가 발생했어요. 다시 확인해주세요.' });
    else res.end();
  }
});
server.requestTimeout = 30000;
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `${port} 포트가 사용 중이에요. 기존 연결 프로그램을 확인해주세요.` : '연결 프로그램을 시작하지 못했어요.'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', async () => {
  console.log(`포근 컴퍼니 연결 프로그램: ${localOrigin}`);
  console.log(`API 키 설정: ${localOrigin}/connect`);
  console.log('키는 이 PC의 설정 화면에서만 입력하세요. 이 창을 유지해주세요.');
  if (key) await startRuntime();
});
const shutdown = () => { for (const work of active.values()) work.controller.abort(); child?.kill(); server.close(() => process.exit()); setTimeout(() => process.exit(), 1500).unref(); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
