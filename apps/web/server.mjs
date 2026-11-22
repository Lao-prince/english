import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';

const contentTypes = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
};

function proxyApi(incoming, outgoing) {
  const headers = {};
  for (const name of ['authorization', 'content-type', 'content-length']) {
    if (incoming.headers[name] !== undefined) headers[name] = incoming.headers[name];
  }
  const upstream = request({
    hostname: 'api',
    port: 3000,
    method: incoming.method,
    path: incoming.url,
    headers,
  }, (response) => {
    outgoing.statusCode = response.statusCode;
    for (const name of ['cache-control', 'content-type', 'content-length']) {
      if (response.headers[name] !== undefined) outgoing.setHeader(name, response.headers[name]);
    }
    response.on('error', () => outgoing.destroy());
    response.pipe(outgoing);
  });

  const deadline = setTimeout(() => upstream.destroy(new Error('API timeout')), 15_000);
  upstream.on('error', () => {
    if (outgoing.headersSent) outgoing.destroy();
    else outgoing.writeHead(502).end();
  });
  outgoing.on('close', () => {
    clearTimeout(deadline);
    upstream.destroy();
  });
  incoming.on('error', () => upstream.destroy());
  incoming.pipe(upstream);
}

createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (incoming, outgoing) => {
  const path = incoming.url.split('?', 1)[0];
  outgoing.setHeader('X-Content-Type-Options', 'nosniff');
  if (path === '/api' || path.startsWith('/api/')) {
    proxyApi(incoming, outgoing);
    return;
  }
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    outgoing.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const file = path === '/' ? '/index.html' : path;
  if (file !== '/index.html' && !/^\/assets\/[\w.-]+\.(css|js)$/.test(file)) {
    outgoing.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(new URL(`./dist${file}`, import.meta.url));
    outgoing.writeHead(200, {
      'Content-Type': contentTypes[file.split('.').at(-1)],
      'Content-Length': data.length,
      'Cache-Control': file === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    }).end(incoming.method === 'HEAD' ? undefined : data);
  } catch (error) {
    outgoing.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
}).listen(8080, '0.0.0.0');
