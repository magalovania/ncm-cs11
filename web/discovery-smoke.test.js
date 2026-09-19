'use strict'

var fs = require('fs')
var path = require('path')

var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
var search = app.slice(app.indexOf('function renderSearch()'), app.indexOf('function renderFm()'))
var fmStart = app.indexOf('function renderFm()')
var fmEnd = app.indexOf('// ---------- playback core ----------')
var fm = app.slice(fmStart, fmEnd)

if (/topPlaylist|推荐歌单|rec-refresh|rec-grid/.test(search)) {
  throw new Error('random playlists must not remain in the search tab')
}

if (fm.indexOf('grid.appendChild(personalFmCard())') < 0 || fm.indexOf('API.topPlaylist') < 0) {
  throw new Error('FM tab must contain the fixed personal FM card and random playlists')
}

if (fm.indexOf('grid.appendChild(personalFmCard())') > fm.indexOf('API.topPlaylist')) {
  throw new Error('personal FM must be inserted before random playlists')
}

console.log('discovery tab smoke test passed')
