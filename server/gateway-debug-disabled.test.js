'use strict'

var assert = require('assert')
var http = require('http')
var path = require('path')
var childProcess = require('child_process')

var port = 39512
var gateway = childProcess.spawn(process.execPath, [path.join(__dirname, 'gateway.js')], {
  env: Object.assign({}, process.env, {
    PORT: String(port),
    GATE_KEY: 'test-gate',
    DEBUG_UPLOAD_ENABLED: 'false'
  }),
  stdio: 'ignore'
})

function attempt(remaining) {
  var request = http.request({
    hostname: '127.0.0.1',
    port: port,
    path: '/debug/screenshot?gate_key=test-gate&view=fm',
    method: 'POST',
    headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
  }, function (response) {
    response.resume()
    response.on('end', function () {
      assert.strictEqual(response.statusCode, 404)
      console.log('gateway disabled-debug test passed')
      gateway.kill()
    })
  })
  request.on('error', function (error) {
    if (!remaining) {
      gateway.kill()
      throw error
    }
    setTimeout(function () { attempt(remaining - 1) }, 100)
  })
  request.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
}

attempt(30)
