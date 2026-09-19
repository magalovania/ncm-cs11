'use strict'

var assert = require('assert')
var http = require('http')
var path = require('path')
var fs = require('fs')
var os = require('os')
var childProcess = require('child_process')

var gatewayPort = 39502
var apiPort = 39501
var upstreamRequests = []
var debugRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ncm-debug-'))
var onePixelPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex')
var upstream = http.createServer(function (request, response) {
  upstreamRequests.push({ url: request.url, cookie: request.headers.cookie || '' })
  var body = JSON.stringify({ code: 200, path: request.url })
  response.writeHead(200, {
    'content-type': 'application/json',
    'transfer-encoding': 'chunked',
    'set-cookie': ['MUSIC_U=test; Path=/']
  })
  response.end(body)
})

function request(pathname, headers) {
  return new Promise(function (resolve, reject) {
    var request = http.get({
      hostname: '127.0.0.1',
      port: gatewayPort,
      path: pathname,
      headers: headers || {}
    }, function (response) {
      var chunks = []
      response.on('data', function (chunk) { chunks.push(chunk) })
      response.on('end', function () {
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    request.on('error', reject)
  })
}

function post(pathname, body, headers) {
  return new Promise(function (resolve, reject) {
    var request = http.request({
      hostname: '127.0.0.1',
      port: gatewayPort,
      path: pathname,
      method: 'POST',
      headers: Object.assign({ 'content-length': body.length }, headers || {})
    }, function (response) {
      var chunks = []
      response.on('data', function (chunk) { chunks.push(chunk) })
      response.on('end', function () {
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    request.on('error', reject)
    request.end(body)
  })
}

function waitForGateway(attempts) {
  return request('/api/ping?gate_key=test-gate').catch(function (error) {
    if (!attempts) throw error
    return new Promise(function (resolve) { setTimeout(resolve, 100) }).then(function () {
      return waitForGateway(attempts - 1)
    })
  })
}

upstream.listen(apiPort, '127.0.0.1', function () {
  var gateway = childProcess.spawn(process.execPath, [path.join(__dirname, 'gateway.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(gatewayPort),
      API_PORT: String(apiPort),
      API_HOST: '127.0.0.1',
      GATE_KEY: 'test-gate',
      DEBUG_ROOT: debugRoot
    }),
    stdio: 'ignore'
  })

  waitForGateway(30).then(function () {
    return request('/api/login/qr/create?key=qr-key&gate_key=test-gate', { cookie: 'ncm_gate=stale; MUSIC_U=secret' })
  }).then(function (response) {
    assert.strictEqual(response.status, 200)
    assert.strictEqual(upstreamRequests[upstreamRequests.length - 1].url, '/login/qr/create?key=qr-key')
    assert.strictEqual(upstreamRequests[upstreamRequests.length - 1].cookie, '')
    assert.strictEqual(response.headers['transfer-encoding'], undefined)
    return request('/api/login/qr/key')
  }).then(function (response) {
    assert.strictEqual(response.status, 403)
    return request('/../server/gateway.js?gate_key=test-gate')
  }).then(function (response) {
    assert.strictEqual(response.status, 403)
    return request('/%E0%A4%A?gate_key=test-gate')
  }).then(function (response) {
    assert.strictEqual(response.status, 400)
    return post('/debug/screenshot?gate_key=test-gate&view=fm&zoom=1.2&width=720&height=1080', onePixelPng, { 'content-type': 'image/png' })
  }).then(function (response) {
    assert.strictEqual(response.status, 201)
    var saved = fs.readdirSync(debugRoot)
    assert.strictEqual(saved.filter(function (name) { return /-fm\.png$/.test(name) }).length, 1)
    assert.strictEqual(saved.filter(function (name) { return /-fm\.json$/.test(name) }).length, 1)
    return post('/debug/screenshot?gate_key=test-gate&view=fm', Buffer.from('not png'), { 'content-type': 'image/png' })
  }).then(function (response) {
    assert.strictEqual(response.status, 400)
    console.log('gateway tests passed')
  }).catch(function (error) {
    console.error(error.stack || error)
    process.exitCode = 1
  }).then(function () {
    gateway.kill()
    upstream.close()
    fs.rmSync(debugRoot, { recursive: true, force: true })
  })
})
