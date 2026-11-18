'use strict';
const $ = selector => document.querySelector(selector);
let token = '', configured = false, checking;
const requestedOrigin = new URLSearchParams(location.hash.slice(1)).get('origin');
const allowedOrigin = requestedOrigin === 'https://gahyeon06.github.io' ? requestedOrigin : null;
async function api(path, input) {
  const response = await fetch(path, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '연결에 실패했어요.');
  return data;
}
function message(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
async function refresh() {
  try {
    const status = await api('/api/status');
    configured = status.keyConfigured;
    $('#api-key').placeholder = configured ? '암호화된 키가 저장돼 있어요. 변경할 때만 입력' : 'sk-…';
    if (status.runtimeError) message(status.runtimeError, true);
    else if (status.ready) message(`AI 실행 서버가 준비됐어요. 모델: ${status.model}`);
    else if (configured) message('API 키가 저장됐어요. AI 실행 서버를 준비하고 있어요.');
    else message('아래에 API 키를 입력하고 사용할 모델을 선택해주세요.');
    $('#pair-section').classList.toggle('hidden', !allowedOrigin || !status.ready);
    $('#open-office').classList.toggle('hidden', !status.ready);
  } catch { message('연결 프로그램이 종료됐어요. 다시 실행해주세요.', true); clearInterval(checking); }
}
$('#load-models').onclick = async () => {
  const button = $('#load-models');
  if (!$('#api-key').value.trim() && !configured) { message('OpenAI API 키를 먼저 입력해주세요.', true); return; }
  button.disabled = true; message('OpenAI에서 사용 가능한 모델을 확인하고 있어요.');
  try {
    const data = await api('/api/models', { apiKey: $('#api-key').value.trim() });
    if (!data.models.length) throw new Error('사용할 수 있는 텍스트 모델이 없어요. API 키의 모델 조회 권한을 확인해주세요.');
    $('#model').replaceChildren(...data.models.map(id => { const option = document.createElement('option'); option.value = id; option.textContent = id; return option; }));
    $('#model').value = data.models.includes(data.model) ? data.model : data.models[0];
    $('#model-area').classList.remove('hidden');
    message('모델 목록을 확인했어요. 사용할 모델을 선택하고 저장해주세요.');
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
};
$('#setup-form').onsubmit = async event => {
  event.preventDefault(); $('#save-config').disabled = true; clearInterval(checking);
  try {
    await api('/api/configure', { apiKey: $('#api-key').value.trim(), model: $('#model').value });
    $('#api-key').value = ''; $('#model-area').classList.add('hidden'); configured = true;
    await refresh(); checking = setInterval(refresh, 3000);
  } catch (error) { message(error.message, true); }
  finally { $('#save-config').disabled = false; }
};
$('#pair-button').onclick = () => {
  if (!allowedOrigin || !window.opener) { message('사무실의 PC 연결 버튼으로 이 창을 다시 열어주세요.', true); return; }
  window.opener.postMessage({ type: 'pogeun-connected', token, baseUrl: location.origin }, allowedOrigin);
  message('사무실에 연결 정보를 보냈어요. 원래 사무실 화면으로 돌아가주세요.');
};
$('#pair-target').textContent = allowedOrigin || '이 PC의 사무실';
(async () => {
  try {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error();
    token = (await response.json()).token;
    await refresh(); checking = setInterval(refresh, 3000);
  } catch { message('이 PC에서 실행한 연결 프로그램으로 접속해주세요.', true); }
})();
