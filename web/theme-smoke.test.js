'use strict'

var fs = require('fs')
var path = require('path')

var css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')
var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message)
}

if (/var\(--|--[a-zA-Z0-9_-]+\s*:/.test(css)) {
  throw new Error('Android 4.4 WebView does not support CSS custom properties')
}

requireMatch(css, /html,body\{[^}]*background:#0e0e12;[^}]*color:#f2f2f5;/, 'dark page colors missing')
requireMatch(css, /\.nav-btn\.active\{[^}]*color:#ec4141;/, 'red navigation accent missing')
requireMatch(css, /#pb-fill\{[^}]*background:#ec4141;/, 'red progress accent missing')
requireMatch(app, /getElementById\('player-bar'\)\.style\.bottom = safe/, 'legacy safe-bottom fallback missing')

console.log('Android 4.4 theme smoke test passed')
