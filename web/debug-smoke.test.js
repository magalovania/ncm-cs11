'use strict'

var fs = require('fs')
var path = require('path')

var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
var style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')
var activity = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'ncmcs11', 'MainActivity.java'), 'utf8')
var gateway = fs.readFileSync(path.join(__dirname, '..', 'server', 'gateway.js'), 'utf8')

if (html.indexOf('id="debug-shot"') < 0 || style.indexOf('#debug-shot') < 0) {
  throw new Error('debug screenshot button missing')
}

if (app.indexOf("localStorage.getItem('ncm_debug_on') === '1'") < 0
  || app.indexOf('window.Android.captureScreenshot') < 0
  || app.indexOf('function captureDebugScreenshot()') < 0) {
  throw new Error('debug mode or screenshot bridge missing')
}

if (activity.indexOf('Bitmap.CompressFormat.JPEG') < 0
  || activity.indexOf('DEBUG_SCREENSHOT_JPEG_QUALITY = 72') < 0
  || activity.indexOf('DEBUG_SCREENSHOT_MAX_WIDTH = 1280') < 0
  || activity.indexOf('DEBUG_SCREENSHOT_MAX_HEIGHT = 720') < 0) {
  throw new Error('native screenshot compression settings missing')
}

if (gateway.indexOf("contentType !== 'image/jpeg'") < 0 || gateway.indexOf("base + '.jpg'") < 0) {
  throw new Error('gateway JPEG upload validation missing')
}

console.log('debug mode smoke test passed')
