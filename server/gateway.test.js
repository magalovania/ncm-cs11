'use strict'

var assert = require('assert')
var http = require('http')
var path = require('path')
var childProcess = require('child_process')

var gatewayPort = 39502
var apiPort = 39501
var upstreamRequests = []
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
      GATE_KEY: 'test-gate'
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
    console.log('gateway tests passed')
  }).catch(function (error) {
    console.error(error.stack || error)
    process.exitCode = 1
  }).then(function () {
    gateway.kill()
    upstream.close()
  })
})
