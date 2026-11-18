import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:http';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4188, base = `http://127.0.0.1:${port}`, github = 'https://gahyeon06.github.io';
let processHandle, state, token;
before(async () => {
  state = await mkdtemp(join(tmpdir(), 'pogeun-bridge-test-'));
  processHandle = spawn(process.execPath, ['scripts/office-server.mjs'], { cwd: root, env: { ...process.env, OPENAI_API_KEY: '', POGEUN_PORT: String(port), POGEUN_RUNTIME_PORT: '4189', POGEUN_STATE_DIR: state }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Bridge startup timed out')), 15000);
    processHandle.stdout.on('data', data => { if (data.toString().includes(base)) { clearTimeout(timer); resolve(); } });
    processHandle.on('error', reject);
    processHandle.on('exit', code => { clearTimeout(timer); reject(new Error(`Bridge exited: ${code}`)); });
  });
  const response = await fetch(base + '/api/session', { headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(response.status, 200);
  token = (await response.json()).token;
});
after(async () => {
  if (processHandle && processHandle.exitCode === null) { processHandle.kill(); await new Promise(resolve => processHandle.once('exit', resolve)); }
  // mkdtemp이 반환한 이번 테스트 전용 디렉터리만 정리합니다.
  if (state && state.startsWith(join(tmpdir(), 'pogeun-bridge-test-'))) await rm(state, { recursive: true, force: true });
});
test('health is public, but status and jobs require pairing', async () => {
  const health = await fetch(base + '/api/health');
  assert.deepEqual(await health.json(), { service: 'pogeun-office', version: 2 });
  assert.equal((await fetch(base + '/api/status')).status, 401);
  assert.equal((await fetch(base + '/api/jobs/test-unknown')).status, 401);
  const status = await fetch(base + '/api/status', { headers: { Authorization: `Bearer ${token}` } });
  const data = await status.json();
  assert.equal(data.keyConfigured, false);
  assert.equal(data.ready, false);
  assert.equal(JSON.stringify(data).includes(token), false);
});
test('untrusted origins and hosts are rejected', async () => {
  const response = await fetch(base + '/api/health', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const hostStatus = await new Promise((resolve, reject) => get(base + '/api/health', { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(hostStatus, 403);
});
test('remote page cannot acquire pairing token or configure API key', async () => {
  assert.equal((await fetch(base + '/api/session', { headers: { Origin: github } })).status, 403);
  const response = await fetch(base + '/api/configure', { method: 'POST', headers: { Origin: github, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403);
});
test('only UI assets are served; key files and source directories stay private', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  const script = await fetch(base + '/office-connection.js');
  assert.match(script.headers.get('content-type'), /javascript/);
  for (const path of ['/.eve/office/key.dpapi', '/package.json', '/node_modules/eve/package.json']) assert.equal((await fetch(base + path)).status, 404);
});
test('allowed website receives explicit preflight permissions', async () => {
  const response = await fetch(base + '/api/jobs', { method: 'OPTIONS', headers: { Origin: github, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), github);
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
});
test('invalid requests and unconfigured runtime never report successful work', async () => {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/jobs', { method: 'POST', headers, body: '{}' })).status, 400);
  const response = await fetch(base + '/api/jobs', { method: 'POST', headers, body: JSON.stringify({ id: 'test-task-12345', title: 'Say hello', agents: ['manager'] }) });
  assert.equal(response.status, 503);
  assert.equal((await fetch(base + '/api/jobs', { method: 'POST', headers, body: JSON.stringify({ id: 'test-task-12345', title: 'x'.repeat(30000), agents: ['manager'] }) })).status, 413);
});
test('Windows vault round-trip encrypts without plaintext key files', { skip: process.platform !== 'win32' }, async () => {
  const transform = (operation, value) => new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'protect-key.ps1'), '-Operation', operation], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let result = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { result += chunk; }); child.stderr.resume();
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(result) : reject(new Error('Vault process failed')));
    child.stdin.end(value);
  });
  const fixture = 'not-a-real-key-vault-roundtrip-test';
  const encrypted = await transform('protect', fixture);
  assert.equal(encrypted.includes(fixture), false);
  assert.equal(await transform('unprotect', encrypted), fixture);
});
