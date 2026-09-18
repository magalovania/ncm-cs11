(function () {
  'use strict'
  try {
    App.init()
  } catch (error) {
    var content = document.getElementById('content')
    if (!content) return
    content.innerHTML = '<h2>页面启动失败</h2><div class="empty" id="boot-error"></div>'
    document.getElementById('boot-error').textContent = error && error.message ? error.message : String(error)
  }
})()
