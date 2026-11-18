/* 웹 사무실과 이 PC의 실행 서버를 연결합니다. API 키는 이 파일이나 웹 저장소에 보관하지 않습니다. */
(() => {
  'use strict';
  const baseUrl = 'http://127.0.0.1:4173';
  const connectionKey = 'pogeun-office-session-v2';
  let accessToken = '', popup, currentStatus = null, polling = false;
  try { accessToken = sessionStorage.getItem(connectionKey) || ''; } catch {}
  const previousRender = renderTasks, previousBriefing = briefing;
  const labels = { queued: '접수됨', running: 'AI 작업 중', waiting: '대표님 확인 필요', completed: 'AI 답변 완료', failed: '실행 오류', cancelled: '중지됨', interrupted: '실행 중단됨' };
  const connectionDialog = document.getElementById('connection-dialog');
  connectionDialog.querySelector('.dialog-inner').innerHTML = `<button class="close-dialog" id="close-connection" aria-label="연결 안내 닫기">×</button><div style="font-size:35px;margin-bottom:17px" aria-hidden="true">🔌</div><h2 id="connection-dialog-title">AI와 사무실 연결하기</h2><p>PC 연결 프로그램을 켜두면 웹에서 업무를 보내고 실제 AI 답변을 받을 수 있어요.</p><div class="bridge-status" id="bridge-status" role="status">연결 상태를 확인하고 있어요.</div><p>처음 한 번 프로젝트 폴더에서 실행해주세요.</p><code>npm run office</code><button class="primary" id="connect-pc">이 PC 연결 · API 키 설정</button><p>버튼을 누르면 이 PC의 설정 창이 열려요. API 키는 그 창에만 입력하고, 사용할 모델을 선택해주세요.</p><p class="small">브라우저가 로컬 네트워크 연결 권한을 물으면 이 PC의 실행 프로그램에 연결하는 요청인지 확인해주세요. 다른 기기에서는 해당 기기의 연결 프로그램이 필요해요.</p><a class="secondary" href="https://github.com/GAHYEON06/ai-company#readme" target="_blank" rel="noopener noreferrer">실행 안내 ↗</a>`;
  const style = document.createElement('style');
  style.textContent = `.bridge-status{padding:12px;background:#f2edf9;color:#89749e;border-radius:10px;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.bridge-status.ok{background:#eaf3eb;color:#58836b}.task-row:has(.ai-result){grid-template-columns:1fr}.ai-result{margin-top:14px;border-top:1px solid #ede6ef;padding-top:14px;grid-column:1/-1;min-width:0}.ai-result summary{font-size:12px;color:#7b6593;cursor:pointer;font-weight:700}.ai-result pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.9 "Malgun Gothic",sans-serif;color:#65566f;max-height:600px;overflow:auto;padding:16px;background:#f8f5fb;border-radius:10px}.ai-activity{font-size:10px;color:#9c8ca8;line-height:1.8;margin:10px 0 0}.ai-error{font-size:11px;color:#b06e7b;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px}.ai-status{font-size:10px;border-radius:7px;padding:7px 10px;background:#eee8fa;color:#8c71a9;display:inline-block;margin-right:6px}.staff-card.busy{box-shadow:inset 0 0 0 2px #ab91cf;background:#efe4fe99}.staff-card.busy .staff-bubble{background:#e6daf7;color:#8f6db0}.staff-card.busy .staff-bubble:after{background:#e6daf7}.ai-question{padding:14px;border:1px solid #e2d5ec;border-radius:10px;background:#faf6ff;margin-top:12px;grid-column:1/-1}.ai-question p{font-size:12px;color:#8b759f;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}.ai-question .options{display:flex;gap:8px;flex-wrap:wrap}.ai-question textarea{display:block;width:100%;min-height:70px;border:1px solid #ddd1e7;border-radius:7px;padding:10px;margin:10px 0;font:12px/1.7 inherit}.connection.connected{border-color:#d0e2d0;background:#f8fcf5}.connection.connected strong{color:#698a65}.connection.connected .amber-dot{background:#87ab7a}.task-actions .primary{padding:9px 12px;font-size:11px}.task-actions .secondary{padding:9px 12px}`;
  document.head.append(style);
  document.getElementById('close-connection').onclick = () => connectionDialog.close();
  document.getElementById('connect-pc').onclick = () => {
    if (location.origin === baseUrl) {
      popup = window.open(baseUrl + '/connect', 'pogeun-pc-connection', 'width=560,height=850');
    } else {
      popup = window.open(baseUrl + '/connect#origin=' + encodeURIComponent(location.origin), 'pogeun-pc-connection', 'width=560,height=850');
    }
    if (!popup) toast('설정 창을 열 수 없어요. 팝업 차단 여부를 확인해주세요.');
  };
  async function request(path, input) {
    const response = await fetch(baseUrl + path, {
      method: input ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, ...(input ? { 'Content-Type': 'application/json' } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(path.includes('/respond') || path.includes('/cancel') ? 30000 : 12000),
    });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || '요청을 처리하지 못했어요.'); error.status = response.status; throw error; }
    return result;
  }
  function statusView() {
    const ready = Boolean(currentStatus?.ready);
    const label = ready ? 'AI 연결됨' : currentStatus?.keyConfigured ? 'AI 서버 준비 중' : accessToken ? 'API 키 설정 필요' : 'PC 연결 필요';
    document.getElementById('top-connection').textContent = '✦ ' + label;
    const box = document.getElementById('connection-info');
    box.classList.toggle('connected', ready);
    box.innerHTML = `<strong><span class="amber-dot"></span>${label}</strong><p>${ready ? esc(currentStatus.model) + '<br>업무를 보내면 실제 AI가 답변해요.' : '연결 프로그램을 켜고<br>이 PC 연결 버튼을 눌러주세요.'}</p>`;
    const detail = document.getElementById('bridge-status');
    detail.classList.toggle('ok', ready);
    detail.textContent = currentStatus?.runtimeError || (ready ? `연결됐어요. 사용 모델: ${currentStatus.model}` : currentStatus?.keyConfigured ? '키가 저장됐어요. AI 서버가 준비될 때까지 잠시 기다려주세요.' : accessToken ? 'PC 연결은 됐어요. PC 설정 창에서 API 키와 사용할 모델을 설정해주세요.' : 'PC 연결 프로그램을 켠 뒤 아래 버튼을 눌러주세요.');
    document.querySelector('#task-form button[type="submit"]').innerHTML = ready ? 'AI에게 업무 보내기 <svg class="icon"><use href="#i-arrow"/></svg>' : '업무 등록하기 <svg class="icon"><use href="#i-arrow"/></svg>';
    document.querySelector('.local-note').innerHTML = ready ? '이 PC의 AI가 업무를 처리해요.<br>실행 결과는 업무 보드에서 확인할 수 있어요.' : '업무는 브라우저에 보관돼요.<br>PC를 연결하면 AI에게 전송할 수 있어요.';
  }
  async function refreshStatus() {
    if (!accessToken) { currentStatus = null; statusView(); return; }
    try { currentStatus = await request('/api/status'); }
    catch (error) { currentStatus = null; if (error.status === 401) { accessToken = ''; try { sessionStorage.removeItem(connectionKey); } catch {} } }
    statusView();
  }
  window.addEventListener('message', async event => {
    if (event.origin !== baseUrl || event.source !== popup || event.data?.type !== 'pogeun-connected' || event.data.baseUrl !== baseUrl || !/^[a-f0-9]{64}$/.test(event.data.token || '')) return;
    accessToken = event.data.token;
    try { sessionStorage.setItem(connectionKey, accessToken); } catch {}
    await refreshStatus();
    renderTasks();
    if (currentStatus?.ready) { connectionDialog.close(); toast('AI와 연결됐어요. 이제 업무를 보낼 수 있어요.'); }
  });
  function storePatch(id, patch) {
    const next = tasks.map(task => task.id === id ? { ...task, ...patch } : task);
    if (!save(next)) { tasks = next; toast('브라우저 저장 공간이 부족해요. 결과를 따로 보관해주세요.'); }
    renderTasks();
  }
  async function runTask(id) {
    const task = tasks.find(task => task.id === id);
    if (!task || task.sending) return;
    if (!currentStatus?.ready) { connectionDialog.showModal(); await refreshStatus(); return; }
    storePatch(id, { sending: true, sendError: '' });
    try {
      const job = await request('/api/jobs', { id: task.id, title: task.title, agents: task.agents });
      storePatch(id, { sending: false, job, status: job.status === 'completed' ? 'done' : 'pending' });
      toast('AI에게 브리핑을 전달했어요. 실제 진행 상황을 보여드릴게요.');
    } catch (error) {
      storePatch(id, { sending: false, sendError: error.message === 'Failed to fetch' ? 'PC 연결을 확인해주세요. 연결 권한이 필요한 경우 브라우저 알림을 확인해주세요.' : error.message });
    }
  }
  async function answer(taskId, requestId, answer) {
    const task = tasks.find(task => task.id === taskId);
    try {
      const job = await request(`/api/jobs/${encodeURIComponent(task.job.id)}/respond`, { interactionId: requestId, ...answer });
      storePatch(taskId, { job });
    } catch (error) { toast(error.message); }
  }
  function activityView() {
    const working = tasks.find(task => task.job?.status === 'running');
    const currentAgent = working?.job.activity?.at(-1)?.agent;
    document.querySelectorAll('.staff-card').forEach(card => {
      const active = Boolean(working && card.dataset.agent === (currentAgent || 'manager'));
      card.classList.toggle('busy', active);
      const agent = agents.find(agent => agent.id === card.dataset.agent);
      card.querySelector('.staff-bubble').textContent = active ? '실제로 작업 중이에요' : agent.bubble;
    });
  }
  renderTasks = function () {
    previousRender();
    document.querySelectorAll('.task-row').forEach((row, index) => {
      const task = tasks[index], actions = row.querySelector('.task-actions'), job = task.job;
      if (!job) {
        const button = document.createElement('button'); button.className = 'primary'; button.textContent = task.sending ? '전송 확인 중…' : 'AI에게 실행 요청'; button.disabled = Boolean(task.sending); button.onclick = () => runTask(task.id); actions.prepend(button);
      } else {
        row.querySelector('[data-status]')?.remove();
        const tag = document.createElement('span'); tag.className = 'ai-status'; tag.textContent = labels[job.status] || '상태 확인 중'; actions.prepend(tag);
        row.querySelector('.task-meta').textContent = task.agents.map(id => { const agent = agents.find(agent => agent.id === id); return `${agent.emoji} ${agent.name}`; }).join(' · ') + ' · ' + (labels[job.status] || job.status);
        if (['queued', 'running', 'waiting'].includes(job.status)) {
          const stop = document.createElement('button'); stop.className = 'secondary'; stop.textContent = '작업 중지'; stop.onclick = async () => { stop.disabled = true; try { const next = await request(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, {}); storePatch(task.id, { job: next }); } catch (error) { toast(error.message); stop.disabled = false; } }; actions.append(stop);
        }
        if (job.activity?.length) {
          const activity = document.createElement('div'); activity.className = 'ai-activity'; activity.textContent = job.activity.slice(-4).map(item => item.text).join(' → '); row.append(activity);
        }
        if (job.reply) {
          const details = document.createElement('details'); details.className = 'ai-result'; details.open = true;
          const summary = document.createElement('summary'); summary.textContent = 'AI가 작성한 결과';
          const result = document.createElement('pre'); result.textContent = job.reply;
          details.append(summary, result); row.append(details);
        }
        if (job.error) { const error = document.createElement('p'); error.className = 'ai-error'; error.textContent = job.error; row.append(error); }
        if (job.status === 'waiting') for (const item of job.interactions || []) {
          const question = document.createElement('section'); question.className = 'ai-question';
          const title = document.createElement('p'); title.textContent = [item.request.title, item.request.prompt].filter(Boolean).join('\n'); question.append(title);
          const options = document.createElement('div'); options.className = 'options';
          for (const option of item.request.options || []) {
            const button = document.createElement('button'); button.className = 'secondary'; button.textContent = option.label; button.onclick = () => { button.disabled = true; void answer(task.id, item.interactionId, { optionId: option.id }); }; options.append(button);
          }
          question.append(options);
          if (item.request.allowFreeform) {
            const input = document.createElement('textarea'); input.maxLength = 2000; input.setAttribute('aria-label', 'AI에게 답변');
            const send = document.createElement('button'); send.className = 'secondary'; send.textContent = '답변 보내기'; send.onclick = () => { if (input.value.trim()) { send.disabled = true; void answer(task.id, item.interactionId, { text: input.value.trim() }); } }; question.append(input, send);
          }
          row.append(question);
        }
      }
      if (task.sendError) { const error = document.createElement('p'); error.className = 'ai-error'; error.textContent = task.sendError; row.append(error); }
    });
    if (tasks[0]?.job) document.querySelector('#latest-task .status-tag').textContent = labels[tasks[0].job.status] || 'AI 상태 확인';
    activityView();
  };
  briefing = task => previousBriefing(task) + (task.job?.reply ? `\n\nAI 결과:\n${task.job.reply}` : '');
  document.getElementById('task-form').onsubmit = async event => {
    event.preventDefault();
    const input = document.getElementById('task-prompt'), title = input.value.trim(), error = document.getElementById('form-error');
    error.classList.add('hidden');
    if (!title || !selected.size || tasks.length >= 200 || /sk-[A-Za-z0-9_-]{15,}/.test(title)) {
      error.textContent = !title ? '맡기고 싶은 일을 적어주세요.' : !selected.size ? '함께할 동료를 선택해주세요.' : tasks.length >= 200 ? '업무는 200개까지 보관할 수 있어요.' : 'API 키로 보이는 내용이 있어요. 비밀키는 PC 설정 창에만 입력해주세요.';
      error.classList.remove('hidden'); return;
    }
    const task = { id: crypto.randomUUID(), title, agents: [...selected], status: 'pending', created: new Date().toISOString() };
    if (!save([task, ...tasks])) { error.textContent = '브라우저에 저장하지 못했어요. 브리핑을 따로 보관해주세요.'; error.classList.remove('hidden'); return; }
    input.value = ''; renderTasks(); setView('tasks');
    if (currentStatus?.ready) await runTask(task.id);
    else toast('업무를 보관했어요. PC를 연결한 뒤 실행 요청을 눌러주세요.');
  };
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      await refreshStatus();
      if (!currentStatus?.ready) return;
      for (const task of tasks.filter(task => task.job && ['queued', 'running', 'waiting'].includes(task.job.status))) {
        try {
          const job = await request('/api/jobs/' + encodeURIComponent(task.job.id));
          if (JSON.stringify(job) !== JSON.stringify(task.job)) storePatch(task.id, { job, status: job.status === 'completed' ? 'done' : 'pending' });
        } catch (error) { if (error.status === 404) storePatch(task.id, { job: { ...task.job, status: 'interrupted', error: '현재 PC 연결 프로그램에서 이 업무를 찾을 수 없어요.' } }); }
      }
    } finally { polling = false; }
  }
  (async () => {
    tasks = tasks.map(task => ({ ...task, sending: false }));
    if (location.origin === baseUrl) {
      try { const response = await fetch('/api/session'); if (response.ok) { accessToken = (await response.json()).token; try { sessionStorage.setItem(connectionKey, accessToken); } catch {} } } catch {}
    }
    renderTasks(); await poll(); setInterval(poll, 2500);
  })();
})();
