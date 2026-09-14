// Car music app: views + HTML5 audio player. Native APK shell (phase 3) owns 方控/MediaSession
// and calls window.__bridge.onMediaKey(key) for play/pause/next/prev — see onMediaKey below.
'use strict'

var App = (function () {
  var audio = document.getElementById('audio')
  var state = {
    view: 'playlists',
    queue: [],        // [{id,name,ar,al,pic,url}]
    index: -1,
    mode: 'list',     // 'list' | 'fm'
    fmBuffer: [],
    quality: localStorage.getItem('ncm_quality') || 'exhigh',
  }

  // ---------- utils ----------
  function fmt(s) { s = s || 0; var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild }
  function empty(n) { while (n.firstChild) n.removeChild(n.firstChild) }

  function trackArtist(t) {
    var a = t.ar || t.artists || []; return a.map(function (x) { return x.name || x }).join('/')
  }
  function trackName(t) { return t.name || (t.al && t.al.name) || '-' }
  function trackPic(t) {
    var p = t.al && t.al.picUrl; if (p) return API.httpsPic(p)
    p = t.picUrl; return p ? API.httpsPic(p) : ''
  }

  // ---------- routing ----------
  function go(view) {
    state.view = view
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view)
    })
    if (view === 'login') return renderLogin()
    if (!API.isLogged()) { return renderLogin() }
    if (view === 'playlists') renderPlaylists()
    else if (view === 'fm') renderFm()
    else if (view === 'search') renderSearch()
    else if (view === 'settings') renderSettings()
  }

  // ---------- login (QR) ----------
  var qrTimer = null
  function renderLogin() {
    var c = document.getElementById('content')
    empty(c)
    c.appendChild(el('<h2>登录网易云音乐</h2>'))
    var wrap = el('<div class="login-wrap"></div>')
    var img = el('<img id="qr-img" alt="二维码">')
    var status = el('<div id="qr-status">生成二维码中…</div>')
    var tip = el('<div class="login-tip">打开手机网易云音乐 App → 扫一扫，确认登录。无需输入密码。</div>')
    wrap.appendChild(img); wrap.appendChild(status); wrap.appendChild(tip)
    c.appendChild(wrap)
    if (API.isLogged()) {
      status.textContent = '已登录，正在获取信息…'
      img.style.display = 'none'; tip.style.display = 'none'
      API.loginStatus().then(function (r) {
        var p = r.data && r.data.profile
        if (p) { API.saveProfile(p.userId, p.nickname); updateLoginBtn(); go('playlists') }
        else { status.textContent = '凭证已失效，请重新扫码'; API.clearAuth(); startQr() }
      }).catch(function () { status.textContent = '获取信息失败，请重试' })
      return
    }
    startQr()
  }

  function startQr() {
    var img = document.getElementById('qr-img')
    var status = document.getElementById('qr-status')
    API.qrKey().then(function (r) {
      var key = r.data && r.data.unikey
      if (!key) throw new Error('无 key')
      return API.qrCreate(key).then(function (r2) {
        img.src = r2.data.qrimg
        status.textContent = '请用手机网易云 App 扫码'
        pollQr(key)
      })
    }).catch(function (e) { status.textContent = '生成失败：' + e.message })
  }

  function pollQr(key) {
    clearInterval(qrTimer)
    var status = document.getElementById('qr-status')
    qrTimer = setInterval(function () {
      API.qrCheck(key).then(function (r) {
        var code = r.code
        if (code === 801) status.textContent = '请用手机网易云 App 扫码'
        else if (code === 802) status.textContent = '已扫码，请在手机确认'
        else if (code === 800) { status.textContent = '二维码过期，重新生成'; clearInterval(qrTimer); startQr() }
        else if (code === 803) {
          status.textContent = '登录成功，正在读取账户…'
          clearInterval(qrTimer)
          if (r.cookie) API.setCookie(r.cookie)   // 803 body.cookie = Set-Cookie 拼接，必须存
          API.loginStatus().then(function (s) {
            var p = s.data && s.data.profile
            if (p) { API.saveProfile(p.userId, p.nickname); updateLoginBtn(); go('playlists') }
            else { status.textContent = '已授权但未取到账户，点左侧「歌单」重试' }
          }).catch(function (e) { status.textContent = '读取账户失败：' + e.message })
        }
      }).catch(function () {})
    }, 2000)
  }

  function updateLoginBtn() {
    var b = document.getElementById('nav-login')
    b.textContent = API.name() ? API.name() : (API.isLogged() ? '已登录' : '未登录')
  }

  // ---------- playlists ----------
  function renderPlaylists() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>我的歌单</h2>'))
    c.appendChild(el('<div class="loading" id="pl-load">加载中…</div>'))
    API.userPlaylist(API.uid()).then(function (r) {
      var list = r.playlist || []
      var load = document.getElementById('pl-load'); if (load) load.remove()
      if (!list.length) { c.appendChild(el('<div class="empty">没有歌单</div>')); return }
      var grid = el('<div class="grid"></div>')
      list.forEach(function (pl) {
        var card = el('<div class="card"></div>')
        card.appendChild(el('<img src="' + API.httpsPic(pl.coverImgUrl) + '" alt="">'))
        var info = el('<div class="c-info"></div>')
        info.appendChild(el('<div class="c-name">' + pl.name + '</div>'))
        info.appendChild(el('<div class="c-cnt">' + (pl.trackCount || 0) + ' 首</div>'))
        card.appendChild(info)
        card.onclick = function () { renderPlaylistDetail(pl.id, pl.name) }
        grid.appendChild(card)
      })
      c.appendChild(grid)
    }).catch(function (e) {
      var load = document.getElementById('pl-load')
      if (load) load.textContent = '加载失败：' + e.message
    })
  }

  function renderPlaylistDetail(id, name) {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>' + name + '</h2>'))
    c.appendChild(el('<div class="loading" id="pd-load">加载中…</div>'))
    API.playlistTracks(id).then(function (r) {
      var songs = r.songs || []
      var load = document.getElementById('pd-load'); if (load) load.remove()
      var playAll = el('<button class="ctrl" style="margin-bottom:12px">▶ 播放全部</button>')
      c.appendChild(playAll)
      var list = el('<div class="list"></div>')
      songs.forEach(function (s, i) {
        var row = el('<div class="row"></div>')
        row.appendChild(el('<div class="idx">' + (i + 1) + '</div>'))
        var cv = trackPic(s) ? '<img class="cv" src="' + trackPic(s) + '">' : '<div class="cv"></div>'
        row.appendChild(el(cv))
        var m = el('<div style="flex:1;min-width:0"></div>')
        m.appendChild(el('<div class="ttl">' + trackName(s) + '</div>'))
        m.appendChild(el('<div class="art">' + trackArtist(s) + '</div>'))
        row.appendChild(m)
        row.onclick = function () { state.mode = 'list'; playQueue(songs, i) }
        list.appendChild(row)
      })
      c.appendChild(list)
      playAll.onclick = function () { if (songs.length) { state.mode = 'list'; playQueue(songs, 0) } }
    }).catch(function (e) {
      var load = document.getElementById('pd-load')
      if (load) load.textContent = '加载失败：' + e.message
    })
  }

  // ---------- search ----------
  function renderSearch() {
    var c = document.getElementById('content'); empty(c)
    var bar = el('<div class="search-bar"><input id="skw" placeholder="搜索歌曲/歌手" autofocus><button id="sgo">搜索</button></div>')
    c.appendChild(bar)
    var results = el('<div class="list" id="sres"></div>')
    c.appendChild(results)
    function doSearch() {
      var kw = document.getElementById('skw').value.trim()
      if (!kw) return
      empty(results); results.appendChild(el('<div class="loading">搜索中…</div>'))
      API.search(kw).then(function (r) {
        var songs = (r.result && r.result.songs) || []
        empty(results)
        if (!songs.length) { results.appendChild(el('<div class="empty">无结果</div>')); return }
        songs.forEach(function (s, i) {
          var row = el('<div class="row"></div>')
          row.appendChild(el('<div class="idx">' + (i + 1) + '</div>'))
          var m = el('<div style="flex:1;min-width:0"></div>')
          m.appendChild(el('<div class="ttl">' + s.name + '</div>'))
          m.appendChild(el('<div class="art">' + (s.artists || []).map(function (a) { return a.name }).join('/') + '</div>'))
          row.appendChild(m)
          row.onclick = function () { state.mode = 'list'; playQueue(songs, i) }
          results.appendChild(row)
        })
      }).catch(function (e) { empty(results); results.appendChild(el('<div class="empty">' + e.message + '</div>')) })
    }
    document.getElementById('sgo').onclick = doSearch
    document.getElementById('skw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch() })
  }

  // ---------- private FM ----------
  function renderFm() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>私人 FM</h2>'))
    c.appendChild(el('<div class="loading" id="fm-load">加载中…</div>'))
    state.mode = 'fm'
    API.personalFm().then(function (r) {
      var data = r.data || []
      state.fmBuffer = data.slice()
      var load = document.getElementById('fm-load'); if (load) load.remove()
      if (!data.length) { c.appendChild(el('<div class="empty">没有推荐，稍后再试</div>')); return }
      playFromFm()
    }).catch(function (e) {
      var load = document.getElementById('fm-load')
      if (load) load.textContent = '加载失败：' + e.message
    })
  }

  function playFromFm() {
    if (!state.fmBuffer.length) {
      API.personalFm().then(function (r) { state.fmBuffer = r.data || []; if (state.fmBuffer.length) playFromFm() })
      return
    }
    var t = state.fmBuffer.shift()
    state.queue = [t]; state.index = 0; state.mode = 'fm'
    playTrack(t)
  }

  // ---------- playback core ----------
  function playQueue(songs, i) {
    state.queue = songs.slice(); state.index = i
    playTrack(state.queue[i])
  }

  function playTrack(t) {
    if (!t || !t.id) return
    showBarLoading(t)
    API.songUrl(t.id, state.quality).then(function (r) {
      var d = r.data && r.data[0]
      var url = d && d.url
      if (!url) { next(); return }  // 无版权/VIP，跳下一首（解灰已由后端尝试）
      audio.src = url
      audio.play().then(function () {}).catch(function () {})
      updateBar(t)
      loadLyric(t.id)
    }).catch(function () { next() })
  }

  function cur() { return state.index >= 0 ? state.queue[state.index] : null }

  function next() {
    if (state.mode === 'fm') return playFromFm()
    if (state.index < state.queue.length - 1) { state.index++; playTrack(state.queue[state.index]) }
    else { audio.pause(); updateBar(null) }
  }
  function prev() {
    if (state.mode === 'fm') return
    if (audio.currentTime > 3) { audio.currentTime = 0; return }
    if (state.index > 0) { state.index--; playTrack(state.queue[state.index]) }
  }
  function toggle() { if (audio.paused) audio.play(); else audio.pause() }

  // ---------- UI sync ----------
  function showBarLoading(t) {
    var bar = document.getElementById('player-bar'); bar.hidden = false
    document.getElementById('pb-title').textContent = trackName(t)
    document.getElementById('pb-artist').textContent = trackArtist(t)
  }
  function updateBar(t) {
    var bar = document.getElementById('player-bar'); bar.hidden = false
    if (!t) { document.getElementById('pb-title').textContent = '-'; return }
    document.getElementById('pb-title').textContent = trackName(t)
    document.getElementById('pb-artist').textContent = trackArtist(t)
    var cv = document.getElementById('pb-cover'); cv.src = trackPic(t) || ''
    document.getElementById('pb-play').textContent = '▶'
  }

  function loadLyric(id) {
    API.lyric(id).then(function (r) {
      var lrc = r.lrc && r.lrc.lyric
      var box = document.getElementById('np-lyric')
      if (!lrc || !box) return
      var lines = Lrc.parse(lrc)
      box._lines = lines
      box._active = -1
      empty(box)
      lines.forEach(function (ln, i) {
        var d = el('<div data-i="' + i + '">' + (ln.text || '…') + '</div>')
        box.appendChild(d)
      })
    }).catch(function () {})
  }

  // ---------- now playing overlay ----------
  function openNowPlaying() {
    var t = cur(); if (!t) return
    var ov = document.getElementById('now-playing'); ov.hidden = false
    document.getElementById('np-title').textContent = trackName(t)
    document.getElementById('np-artist').textContent = trackArtist(t)
    var cv = document.getElementById('np-cover'); cv.src = trackPic(t) || ''
    document.getElementById('np-bg').style.backgroundImage = 'url("' + (trackPic(t) || '') + '")'
  }
  function closeNowPlaying() { document.getElementById('now-playing').hidden = true }

  // ---------- bindings ----------
  function bind() {
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.onclick = function () { go(b.dataset.view) }
    })
    document.getElementById('pb-play').onclick = toggle
    document.getElementById('pb-next').onclick = next
    document.getElementById('pb-prev').onclick = prev
    document.getElementById('pb-info').onclick = openNowPlaying
    document.getElementById('pb-cover').onclick = openNowPlaying

    document.getElementById('np-play').onclick = toggle
    document.getElementById('np-next').onclick = next
    document.getElementById('np-prev').onclick = prev
    document.getElementById('np-close').onclick = closeNowPlaying
    document.getElementById('np-seek').oninput = function (e) {
      if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration
    }

    audio.addEventListener('play', function () {
      document.getElementById('pb-play').textContent = '⏸'
      var np = document.getElementById('np-play'); if (np) np.textContent = '⏸'
    })
    audio.addEventListener('pause', function () {
      document.getElementById('pb-play').textContent = '▶'
      var np = document.getElementById('np-play'); if (np) np.textContent = '▶'
    })
    audio.addEventListener('ended', next)
    audio.addEventListener('timeupdate', function () {
      var cur = fmt(audio.currentTime), dur = fmt(audio.duration)
      document.getElementById('pb-cur').textContent = cur
      document.getElementById('pb-dur').textContent = dur
      var npcur = document.getElementById('np-cur'), npdur = document.getElementById('np-dur')
      if (npcur) npcur.textContent = cur
      if (npdur) npdur.textContent = dur
      var seek = document.getElementById('np-seek')
      if (seek && audio.duration) seek.value = String((audio.currentTime / audio.duration) * 1000)
      syncLyric()
    })

    // keyboard (dev convenience)
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
      else if (e.code === 'ArrowRight') next()
      else if (e.code === 'ArrowLeft') prev()
    })
  }

  function syncLyric() {
    var box = document.getElementById('np-lyric'); if (!box || !box._lines) return
    var t = audio.currentTime, lines = box._lines, active = -1
    for (var i = 0; i < lines.length; i++) { if (lines[i].t <= t) active = i; else break }
    if (active === box._active) return
    box._active = active
    Array.prototype.forEach.call(box.children, function (d, i) { d.className = i === active ? 'cur' : '' })
    if (active >= 0 && box.children[active]) {
      box.children[active].scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  // ---------- settings ----------
  function renderSettings() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>设置</h2>'))
    var qRow = el('<div class="set-row"><div>音质</div><select id="q-sel">' +
      '<option value="standard">标准</option><option value="higher">较高</option>' +
      '<option value="exhigh">极高</option><option value="lossless">无损 (VIP)</option>' +
      '<option value="hires">Hi-Res (VIP)</option></select></div>')
    c.appendChild(qRow)
    var sel = document.getElementById('q-sel'); sel.value = state.quality
    sel.onchange = function () { state.quality = sel.value; localStorage.setItem('ncm_quality', sel.value) }
    var acct = el('<div class="set-row"><div class="acct"><img src=""></div>' +
      '<div><div id="set-name"></div><div id="set-uid" class="muted"></div></div>' +
      '<button class="ctrl" id="logout">退出登录</button></div>')
    c.appendChild(acct)
    document.getElementById('set-name').textContent = API.name() || '已登录'
    document.getElementById('set-uid').textContent = 'UID: ' + API.uid()
    API.loginStatus().then(function (r) {
      var p = r.data && r.data.profile
      if (p) { API.saveProfile(p.userId, p.nickname); document.getElementById('set-name').textContent = p.nickname }
      var img = acct.querySelector('img'); img.src = p && p.avatarUrl ? API.httpsPic(p.avatarUrl) : ''
    })
    document.getElementById('logout').onclick = function () { API.clearAuth(); updateLoginBtn(); go('login') }
    c.appendChild(el('<div class="muted" style="margin-top:12px">后端：NeteaseCloudMusicApi Enhanced v4.40.1，经 /api 同源代理。音质受账号会员与版权限制，无版权歌曲由后端解灰自动尝试。</div>'))
  }

  // ---------- bridge for native APK shell (phase 3) ----------
  window.__bridge = {
    onMediaKey: function (key) {
      if (key === 'play' || key === 'pause') toggle()
      else if (key === 'next') next()
      else if (key === 'prev') prev()
    },
    getState: function () {
      var t = cur()
      return JSON.stringify({ playing: !audio.paused, title: t ? trackName(t) : '', artist: t ? trackArtist(t) : '', pic: t ? trackPic(t) : '' })
    },
  }

  // ---------- init ----------
  function init() {
    bind(); updateLoginBtn()
    if (API.isLogged()) {
      API.loginStatus().then(function (r) {
        var p = r.data && r.data.profile
        if (p) API.saveProfile(p.userId, p.nickname)
        go(p ? 'playlists' : 'login')
      }).catch(function () { go('login') })
    } else go('login')
  }

  return { init: init }
})()

// tiny LRC parser
var Lrc = (function () {
  function parse(text) {
    var out = [], re = /\[(\d+):(\d+(?:\.\d+)?)\]/g
    text.split(/\r?\n/).forEach(function (line) {
      var m, base = 0, tags = []
      re.lastIndex = 0
      while ((m = re.exec(line))) { tags.push(parseInt(m[1], 10) * 60 + parseFloat(m[2])) }
      var txt = line.replace(re, '')
      tags.forEach(function (t) { out.push({ t: t, text: txt }) })
    })
    out.sort(function (a, b) { return a.t - b.t })
    return out
  }
  return { parse: parse }
})()

App.init()