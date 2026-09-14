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
  const isLogin = target.indexOf('/login/') === 0
  const opts = {
    hostname: '127.0.0.1',
    port: API_PORT,
    path: target,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: '127.0.0.1:' + API_PORT }),
  }
  const up = http.request(opts, r => {
    if (!isLogin) {
      res.writeHead(r.statusCode, r.headers)
      return r.pipe(res)
    }
    // login endpoints: inject the cookie string into the JSON body from Set-Cookie
    // headers, so the web client can store it explicitly and replay it via ?cookie=.
    // Needed on the car (http, non-localhost) where Secure browser cookies won't persist.
    const setCookies = r.headers['set-cookie'] || []
    const chunks = []
    r.on('data', c => chunks.push(c))
    r.on('end', () => {
      let body = Buffer.concat(chunks)
      const ct = r.headers['content-type'] || ''
      if (ct.indexOf('json') >= 0) {
        try {
          const json = JSON.parse(body.toString('utf8'))
          const ck = setCookies.map(h => h.split(';')[0].trim()).filter(Boolean).join('; ')
          if (ck && !json.cookie) json.cookie = ck
          body = Buffer.from(JSON.stringify(json), 'utf8')
        } catch (e) {}
      }
      const h = Object.assign({}, r.headers)
      delete h['set-cookie']
      h['content-length'] = String(body.length)
      res.writeHead(r.statusCode, h)
      res.end(body)
    })
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
    const ext = path.extname(fp).toLowerCase()
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' }
    if (ext === '.html' || ext === '.js' || ext === '.css') headers['cache-control'] = 'no-store'
    res.writeHead(200, headers)
    res.end(data)
  })
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxy(req, res)
  return serveStatic(req, res)
}).listen(PORT, '0.0.0.0', () => {
  console.log('gateway on http://0.0.0.0:' + PORT + '  (web -> ' + WEB_ROOT + ', api -> 127.0.0.1:' + API_PORT + ')')
})