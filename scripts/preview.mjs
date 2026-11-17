import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// 저장소의 비밀 파일이나 실행 기록을 공개하지 않고 UI 파일 하나만 제공합니다.
const page = new URL('../index.html', import.meta.url);
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (!['/', '/index.html', '/ai-company/', '/ai-company/index.html'].includes(new URL(req.url, 'http://localhost').pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  try {
    const body = await readFile(page);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500).end('Unable to load UI');
  }
});
server.listen(4173, '127.0.0.1', () => console.log('AI office UI: http://127.0.0.1:4173'));
