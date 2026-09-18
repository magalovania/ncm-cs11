'use strict'

var fs = require('fs')
var path = require('path')

var compat = fs.readFileSync(path.join(__dirname, 'compat.js'), 'utf8')

if (/if\s*\([^)]*\)\s*\{\s*function\s+/.test(compat)) {
  throw new Error('Android 4.4 strict mode rejects block-level function declarations')
}

console.log('Android 4.4 JavaScript syntax smoke test passed')
