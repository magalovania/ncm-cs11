'use strict'

var fs = require('fs')
var path = require('path')

var compat = fs.readFileSync(path.join(__dirname, 'compat.js'), 'utf8')
var css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')

if (/if\s*\([^)]*\)\s*\{\s*function\s+/.test(compat)) {
  throw new Error('Android 4.4 strict mode rejects block-level function declarations')
}

if (!/Android 4\\\./.test(compat) || !/html\.legacy-webview #content\{position:absolute;/.test(css)) {
  throw new Error('Android 4.4 layout fallback missing')
}

console.log('Android 4.4 JavaScript syntax smoke test passed')
