// Minimal gateway: serve web/ static + proxy /api/* to NeteaseCloudMusicApi (default :3000).
// One process, same-origin, no CORS needed. Dev and prod use the same layout.
//
// Access gate (optional): set GATE_KEY and every request must carry the key via the
// `ncm_gate` cookie (set by the password page) or the `gate_key` API parameter.
// Without GATE_KEY the gateway stays open (dev).
//
// Usage:  node gateway.js                     (PORT=8080, API_PORT=3000)
//         GATE_KEY=secret node gateway.js      (gated)
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const WEB_ROOT = process.env.WEB_ROOT || path.resolve(__dirname, '..', 'web')
const API_PORT = Number(process.env.API_PORT) || 3000
const API_HOST = process.env.API_HOST || '127.0.0.1'
const PORT = Number(process.env.PORT) || 8080
const GATE_KEY = process.env.GATE_KEY || ''
const DEBUG_UPLOAD_ENABLED = process.env.DEBUG_UPLOAD_ENABLED === 'true'
const DEBUG_ROOT = path.resolve(process.env.DEBUG_ROOT || path.join(__dirname, 'debug-screenshots'))
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
const SCREENSHOT_VIEWS = new Set(['nowplaying', 'playlists', 'fm', 'search', 'login', 'settings'])

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
function gateKey(req) {
  const ck = /(?:^|;\s*)ncm_gate=([^;]*)/.exec(req.headers.cookie || '')
  const header = req.headers['x-gate-key']
  const query = /[?&]gate_key=([^&]*)/.exec(req.url || '')
  if (header) return String(header)
  if (query) return decodeURIComponent(query[1])
  if (ck) return decodeURIComponent(ck[1])
  if (!/^\/api\//.test(req.url || '')) {
    const legacy = /[?&]key=([^&]*)/.exec(req.url || '')
    if (legacy) return decodeURIComponent(legacy[1])
  }
  return ''
}
function gateOk(req) { return !GATE_KEY || safeEqual(gateKey(req), GATE_KEY) }

function safeEqual(actual, expected) {
  const left = Buffer.from(actual || '')
  const right = Buffer.from(expected || '')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

// Self-contained password page. Dark, numeric keyboard, touch-sized.
// On entry: write the ncm_gate cookie via document.cookie + redirect to '/' (NO query).
// The page URL stays clean so the car WebView doesn't clobber XHR query strings.
// If we are on the gate page but already have a stored key → the cookie was wrong/expired.
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
+ 'var stored = localStorage.getItem(\'ncm_gk\');'
+ 'if (stored) { document.getElementById(\'hint\').textContent = \'口令不正确或已过期，请重新输入\';'
+ '  try { localStorage.removeItem(\'ncm_gk\') } catch (e) {} document.cookie = \'ncm_gate=; Path=/; Max-Age=0\' }'
+ 'var k = document.getElementById(\'k\'), go = document.getElementById(\'go\');'
+ 'function submit() { var v = k.value.trim(); if (!v) return;'
+ '  try { localStorage.setItem(\'ncm_gk\', v) } catch (e) {}'
+ '  document.cookie = \'ncm_gate=\' + encodeURIComponent(v) + \'; Path=/; Max-Age=31536000\';'
+ '  location.replace(\'/\') }'
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

function saveDebugScreenshot(req, res) {
  const requestUrl = new URL(req.url, 'http://gateway.local')
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const length = Number(req.headers['content-length'])
  const view = SCREENSHOT_VIEWS.has(requestUrl.searchParams.get('view')) ? requestUrl.searchParams.get('view') : 'unknown'
  if (req.method !== 'POST' || contentType !== 'image/jpeg' || !Number.isFinite(length) || length <= 0 || length > MAX_SCREENSHOT_BYTES) {
    res.writeHead(400, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
    return res.end('{"ok":false,"error":"invalid screenshot"}')
  }

  const chunks = []
  let received = 0
  let aborted = false
  req.on('data', chunk => {
    received += chunk.length
    if (received > MAX_SCREENSHOT_BYTES) {
      aborted = true
      res.writeHead(413, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
      res.end('{"ok":false,"error":"screenshot too large"}')
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (aborted) return
    const body = Buffer.concat(chunks)
    if (body.length !== length || body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8 || body[body.length - 2] !== 0xff || body[body.length - 1] !== 0xd9) {
      res.writeHead(400, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
      return res.end('{"ok":false,"error":"invalid jpeg"}')
    }
    fs.mkdir(DEBUG_ROOT, { recursive: true }, error => {
      if (error) {
        res.writeHead(500, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
        return res.end('{"ok":false,"error":"write failed"}')
      }
      const id = new Date().toISOString().replace(/[-:.TZ]/g, '') + '-' + crypto.randomBytes(4).toString('hex')
      const base = id + '-' + view
      const metadata = {
        id,
        view,
        zoom: safeMeta(requestUrl.searchParams.get('zoom')),
        width: safeMeta(requestUrl.searchParams.get('width')),
        height: safeMeta(requestUrl.searchParams.get('height')),
        device: safeMeta(requestUrl.searchParams.get('device')),
        android: safeMeta(requestUrl.searchParams.get('android')),
        app: safeMeta(requestUrl.searchParams.get('app')),
        createdAt: new Date().toISOString()
      }
      fs.writeFile(path.join(DEBUG_ROOT, base + '.jpg'), body, { flag: 'wx' }, imageError => {
        if (imageError) {
          res.writeHead(500, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
          return res.end('{"ok":false,"error":"write failed"}')
        }
        fs.writeFile(path.join(DEBUG_ROOT, base + '.json'), JSON.stringify(metadata, null, 2), { flag: 'wx' }, metadataError => {
          if (metadataError) {
            fs.unlink(path.join(DEBUG_ROOT, base + '.jpg'), () => {})
            res.writeHead(500, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
            return res.end('{"ok":false,"error":"write failed"}')
          }
          res.writeHead(201, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: true, id, file: base + '.jpg' }))
        })
      })
    })
  })
}

function safeMeta(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 128)
}

function proxy(req, res) {
  const target = removeGateKey(req.url.replace(/^\/api/, '') || '/')
  const isLogin = target.indexOf('/login/') === 0
  const opts = {
    hostname: API_HOST,
    port: API_PORT,
    path: target,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: API_HOST + ':' + API_PORT }),
  }
  delete opts.headers.cookie
  const up = http.request(opts, r => {
    if (!isLogin) {
      res.writeHead(r.statusCode, r.headers)
      return r.pipe(res)
    }
    // login endpoints: inject the cookie string into the JSON body from Set-Cookie
    // headers, so the web client can store it explicitly and replay it via ?cookie=.
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
      delete h['transfer-encoding']
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

function removeGateKey(url) {
  const parts = url.split('?')
  if (parts.length < 2) return url
  const query = parts.slice(1).join('?').split('&').filter(part => !/^gate_key=/.test(part))
  return parts[0] + (query.length ? '?' + query.join('&') : '')
}

function serveStatic(req, res) {
  let p
  try {
    p = decodeURIComponent(req.url.split('?')[0])
  } catch (error) {
    res.writeHead(400)
    return res.end('bad request')
  }
  if (p === '/') p = '/index.html'
  const root = path.resolve(WEB_ROOT)
  const fp = path.resolve(root, '.' + p)
  if (fp !== root && !fp.startsWith(root + path.sep)) {
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
  if (!gateOk(req)) return gateDeny(req, res)
  if (req.url.startsWith('/debug/screenshot')) {
    if (!DEBUG_UPLOAD_ENABLED) {
      res.writeHead(404, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' })
      return res.end('{"ok":false,"error":"not found"}')
    }
    return saveDebugScreenshot(req, res)
  }
  if (req.url.startsWith('/api/')) return proxy(req, res)
  return serveStatic(req, res)
}).listen(PORT, '0.0.0.0', () => {
  console.log('gateway on http://0.0.0.0:' + PORT + '  (web -> ' + WEB_ROOT + ', api -> ' + API_HOST + ':' + API_PORT + ')')
  console.log(GATE_KEY ? 'gate: ON (GATE_KEY set)' : 'gate: OFF (open, set GATE_KEY to enable)')
})
