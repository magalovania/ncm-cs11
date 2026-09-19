'use strict'

var fs = require('fs')
var path = require('path')

var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
var style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')

if (html.indexOf('id="debug-shot"') < 0 || style.indexOf('#debug-shot') < 0) {
  throw new Error('debug screenshot button missing')
}

if (app.indexOf("localStorage.getItem('ncm_debug_on') === '1'") < 0
  || app.indexOf('window.Android.captureScreenshot') < 0
  || app.indexOf('function captureDebugScreenshot()') < 0) {
  throw new Error('debug mode or screenshot bridge missing')
}

console.log('debug mode smoke test passed')
