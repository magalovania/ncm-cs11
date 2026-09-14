// Minimal gateway: serve web/ static + proxy /api/* to NeteaseCloudMusicApi (default :3000).
// One process, same-origin, no CORS needed. Dev and prod use the same layout.
// Usage:  node gateway.js            (PORT=8080, API_PORT=3000)
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')

const WEB_ROOT = path.resolve(__dirname, '..', 'web')
const API_PORT = Number(process.env.API_PORT) || 3000
const PORT = Number(process.env.PORT) || 8080

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function proxy(req, res) {
  const target = req.url.replace(/^\/api/, '') || '/'
  const opts = {
    hostname: '127.0.0.1',
    port: API_PORT,
    path: target,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: '127.0.0.1:' + API_PORT }),
  }
  const up = http.request(opts, r => {
    res.writeHead(r.statusCode, r.headers)
    r.pipe(res)
  })
  up.on('error', e => {
    res.writeHead(502, { 'content-type': 'text/plain;charset=utf-8' })
    res.end('API proxy error: ' + e.message + '\nIs the NeteaseCloudMusicApi running on :' + API_PORT + '?')
  })
  req.pipe(up)
}

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const fp = path.join(WEB_ROOT, p)
  if (!fp.startsWith(WEB_ROOT)) {
    res.writeHead(403)
    return res.end('forbidden')
  }
  fs.readFile(fp, (e, data) => {
    if (e) {
      res.writeHead(404)
      return res.end('not found: ' + p)
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  })
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxy(req, res)
  return serveStatic(req, res)
}).listen(PORT, '0.0.0.0', () => {
  console.log('gateway on http://0.0.0.0:' + PORT + '  (web -> ' + WEB_ROOT + ', api -> 127.0.0.1:' + API_PORT + ')')
})