(function () {
  'use strict'

  function PromisePolyfill(executor) {
    if (!(this instanceof PromisePolyfill)) throw new TypeError('Promises must be constructed')
    if (typeof executor !== 'function') throw new TypeError('executor is not a function')
    this._state = 0
    this._value = null
    this._handlers = []
    doResolve(executor, this)
  }

  function doResolve(executor, promise) {
    var done = false
    try {
      executor(function (value) {
        if (done) return
        done = true
        resolve(promise, value)
      }, function (reason) {
        if (done) return
        done = true
        reject(promise, reason)
      })
    } catch (error) {
      if (done) return
      done = true
      reject(promise, error)
    }
  }

  function resolve(promise, value) {
    if (value === promise) return reject(promise, new TypeError('A promise cannot resolve itself'))
    if (value && (typeof value === 'object' || typeof value === 'function')) {
      var then
      try { then = value.then } catch (error) { return reject(promise, error) }
      if (typeof then === 'function') {
        return doResolve(function (resolveNext, rejectNext) {
          then.call(value, resolveNext, rejectNext)
        }, promise)
      }
    }
    promise._state = 1
    promise._value = value
    finish(promise)
  }

  function reject(promise, reason) {
    promise._state = 2
    promise._value = reason
    finish(promise)
  }

  function finish(promise) {
    setTimeout(function () {
      var handlers = promise._handlers.splice(0)
      for (var i = 0; i < handlers.length; i++) handle(promise, handlers[i])
    }, 0)
  }

  function handle(promise, handler) {
    if (!promise._state) {
      promise._handlers.push(handler)
      return
    }
    setTimeout(function () {
      var callback = promise._state === 1 ? handler.onFulfilled : handler.onRejected
      if (!callback) {
        if (promise._state === 1) handler.resolve(promise._value)
        else handler.reject(promise._value)
        return
      }
      try { handler.resolve(callback(promise._value)) }
      catch (error) { handler.reject(error) }
    }, 0)
  }

  PromisePolyfill.prototype.then = function (onFulfilled, onRejected) {
    var current = this
    return new PromisePolyfill(function (resolveNext, rejectNext) {
      handle(current, {
        onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : null,
        onRejected: typeof onRejected === 'function' ? onRejected : null,
        resolve: resolveNext,
        reject: rejectNext
      })
    })
  }

  PromisePolyfill.prototype.catch = function (onRejected) {
    return this.then(null, onRejected)
  }

  if (!window.Promise) window.Promise = PromisePolyfill

  if (!Element.prototype.remove) {
    Element.prototype.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this)
    }
  }

})()
