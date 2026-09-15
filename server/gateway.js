// Minimal gateway: serve web/ static + proxy /api/* to NeteaseCloudMusicApi (default :3000).
// One process, same-origin, no CORS needed. Dev and prod use the same layout.
//
// Access gate (optional): set GATE_KEY and every request must carry the key —
// via query param `?key=` or the `ncm_gate` cookie (set on first successful entry).
// Strangers/scanners only ever see 403. Without GATE_KEY the gateway stays open (dev).
//
// Usage:  node gateway.js                     (PORT=8080, API_PORT=3000)
//         GATE_KEY=secret node gateway.js      (gated)
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')

const WEB_ROOT = path.resolve(__dirname, '..', 'web')
const API_PORT = Number(process.env.API_PORT) || 3000
const API_HOST = process.env.API_HOST || '127.0.0.1'
const PORT = Number(process.env.PORT) || 8080
const GATE_KEY = process.env.GATE_KEY || ''

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

// ---------- access gate ----------
function reqKey(req) {
  const m = /[?&]key=([^&]*)/.exec(req.url)
  if (m) return decodeURIComponent(m[1])
  const ck = /(?:^|;\s*)ncm_gate=([^;]*)/.exec(req.headers.cookie || '')
  return ck ? decodeURIComponent(ck[1]) : ''
}
function gateOk(req) { return !GATE_KEY || reqKey(req) === GATE_KEY }

// Self-contained password page. Touch-sized, dark, numeric keyboard.
// - Arrived WITH ?key= in URL → previous attempt failed: drop the stored key, show error
//   (prevents a self-heal redirect loop). Arrived WITHOUT ?key= → if localStorage has a
//   key, auto-redirect with it (cookie may just have expired; no typing needed).
const GATE_PAGE = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<title>访问验证</title><style>*{box-sizing:border-box;margin:0}'
+ 'body{background:#0d0d10;color:#eee;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}'
+ '.card{text-align:center;padding:40px}h1{font-size:64px;margin-bottom:16px}'
+ 'p{color:#999;font-size:20px;margin-bottom:28px}'
+ 'input{width:300px;padding:18px;font-size:32px;text-align:center;border:2px solid #333;border-radius:14px;background:#1a1a1e;color:#fff;outline:none}'
+ 'input:focus{border-color:#ec4141}button{display:block;width:300px;margin:22px auto 0;padding:18px;font-size:22px;border:0;border-radius:14px;background:#ec4141;color:#fff}'
+ '.err{color:#ec4141;margin-top:18px;font-size:18px;min-height:24px}'
+ '</style></head><body><div class="card"><h1>&#128274;</h1>'
+ '<p id="hint">请输入访问口令</p>'
+ '<input id="k" type="password" inputmode="numeric" autofocus autocomplete="off">'
+ '<button id="go">进入</button><div class="err" id="err"></div></div>'
+ '<script>(function () {'
+ 'var had = /[?&]key=/.test(location.search);'
+ 'if (had) { try { localStorage.removeItem(\'ncm_key\') } catch (e) {} }'
+ 'else { try { var s = localStorage.getItem(\'ncm_key\');'
+ '  if (s) { location.replace(\'/?key=\' + encodeURIComponent(s)); return } } catch (e) {} }'
+ 'if (had) { document.getElementById(\'hint\').textContent = \'口令不正确，请重试\' }'
+ 'var k = document.getElementById(\'k\'), go = document.getElementById(\'go\');'
+ 'function submit() { var v = k.value.trim(); if (!v) return;'
+ '  try { localStorage.setItem(\'ncm_key\', v) } catch (e) {}'
+ '  location.replace(\'/?key=\' + encodeURIComponent(v)) }'
+ 'go.onclick = submit;'
+ 'k.addEventListener(\'keydown\', function (e) { if (e.key === \'Enter\') submit() });'
+ '})()</script></body></html>'

function gateDeny(req, res) {
  if (/^\/api\//.test(req.url)) {
    res.writeHead(403, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
    return res.end('{"code":403,"message":"gate denied"}')
  }
  res.writeHead(403, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' })
  res.end(GATE_PAGE)
}

function proxy(req, res) {
  const target = req.url.replace(/^\/api/, '') || '/'
  const isLogin = target.indexOf('/login/') === 0
  const opts = {
    hostname: API_HOST,
    port: API_PORT,
    path: target,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: API_HOST + ':' + API_PORT }),
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
    // Entry with ?key= → the browser just typed the password: set the cookie so
    // subsequent static fetches (script/link/img) pass the gate without a query param.
    if (GATE_KEY && /[?&]key=/.test(req.url)) {
      headers['set-cookie'] = 'ncm_gate=' + encodeURIComponent(GATE_KEY) + '; Path=/; Max-Age=31536000'
    }
    res.writeHead(200, headers)
    res.end(data)
  })
}

http.createServer((req, res) => {
  if (!gateOk(req)) return gateDeny(req, res)
  if (req.url.startsWith('/api/')) return proxy(req, res)
  return serveStatic(req, res)
}).listen(PORT, '0.0.0.0', () => {
  console.log('gateway on http://0.0.0.0:' + PORT + '  (web -> ' + WEB_ROOT + ', api -> ' + API_HOST + ':' + API_PORT + ')')
  console.log(GATE_KEY ? 'gate: ON (GATE_KEY set)' : 'gate: OFF (open, set GATE_KEY to enable)')
})