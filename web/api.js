// API client for NeteaseCloudMusicApi (Enhanced), reached same-origin via /api proxy.
// XHR-based (robust on old WebViews). Cookie kept in localStorage and appended to every call.
'use strict'

var API = (function () {
  var BASE = '/api'

  function store(k, v) {
    if (v === undefined) { try { return localStorage.getItem(k) } catch (e) { return null } }
    try { localStorage.setItem(k, v) } catch (e) {}
  }

  function getCookie() { return store('ncm_cookie') || '' }
  function setCookie(c) { store('ncm_cookie', c || '') }

  function call(endpoint, params) {
    return new Promise(function (resolve, reject) {
      var parts = []
      var p = params || {}
      p._t = String(Date.now())   // cache-buster: API caches GET for 2min; QR login must not get a stale key
      var ck = getCookie()
      if (ck) p.cookie = ck
      Object.keys(p).forEach(function (k) {
        if (p[k] === undefined || p[k] === null || p[k] === '') return
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(p[k]))
      })
      var url = BASE + '/' + endpoint + (parts.length ? '?' + parts.join('&') : '')
      var xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.timeout = 20000
      xhr.onload = function () {
        try { resolve(JSON.parse(xhr.responseText)) }
        catch (e) { reject(new Error('解析失败: ' + xhr.responseText.slice(0, 120))) }
      }
      xhr.onerror = function () { reject(new Error('网络错误（后端未启动或不可达）')) }
      xhr.ontimeout = function () { reject(new Error('请求超时')) }
      xhr.send()
    })
  }

  function httpsPic(u) {
    if (!u) return ''
    return u.replace(/^http:\/\//, 'https://')
  }

  return {
    call: call,
    getCookie: getCookie,
    setCookie: setCookie,
    clearAuth: function () { setCookie(''); store('ncm_uid', ''); store('ncm_name', ''); store('ncm_avatar', '') },
    httpsPic: httpsPic,

    // ---- login (QR) ----
    qrKey: function () { return call('login/qr/key') },
    qrCreate: function (key) { return call('login/qr/create', { key: key, qrimg: true }) },
    qrCheck: function (key) { return call('login/qr/check', { key: key }) },
    loginStatus: function () { return call('login/status') },

    // ---- library ----
    userPlaylist: function (uid, offset, limit) {
      return call('user/playlist', { uid: uid, offset: offset || 0, limit: limit || 100 })
    },
    playlistTracks: function (id, offset, limit) {
      return call('playlist/track/all', { id: id, offset: offset || 0, limit: limit || 300 })
    },
    songDetail: function (ids) { return call('song/detail', { ids: ids }) },
    songUrl: function (id, level) {
      return call('song/url/v1', { id: id, level: level || 'exhigh' })
    },
    lyric: function (id) { return call('lyric', { id: id }) },
    personalFm: function () { return call('personal_fm') },
    likelist: function (uid) { return call('likelist', { uid: uid }) },
    like: function (id, t) { return call('like', { id: id, t: t ? 'true' : 'false' }) },
    search: function (kw, offset, limit) {
      return call('search', { keywords: kw, type: 1, offset: offset || 0, limit: limit || 40 })
    },

    // ---- helpers ----
    isLogged: function () { return !!getCookie() },
    uid: function () { return store('ncm_uid') || '' },
    name: function () { return store('ncm_name') || '' },
    saveProfile: function (uid, name, avatar) { store('ncm_uid', String(uid || '')); store('ncm_name', name || ''); store('ncm_avatar', avatar ? httpsPic(avatar) : '') },
    avatar: function () { return store('ncm_avatar') || '' },
  }
})()