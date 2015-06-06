var unix = require('unix-dgram'),
  inherits = require('inherits'),
  EventEmitter = require('events').EventEmitter

inherits(WpaState, EventEmitter)

function WpaState (ifname) {
  if (!(this instanceof WpaState)) return new WpaState(ifname)
  EventEmitter.call(this)

  this.ifname = ifname

  process.nextTick(this._start.bind(this))
}

WpaState.prototype._start = function () {
  var clientPath = '/tmp/wpa_ctrl' + Math.random().toString(36).substr(1)
  var error = this._error.bind(this)

  this.client = unix.createSocket('unix_dgram')
  .on('message', this.onMessage.bind(this))
  .on('error', this._error.bind(this))

  this.listen(clientPath, function (err) {
    if (err) return error(err)
    this.connect('/var/run/wpa_supplicant/' + this.ifname, function (err) {
      if (err) return error(err)
      this.attach(function (err) {
        if (err) return error(err)
        this.setLevel(2, function (err) {
          if (err) return error(err)
          this.getState(function (err, state) {
            if (err) return error(err)
          })
        })
      })
    })
  })
}

WpaState.prototype._error = function (err) {
  this.emit('error', err)
}

WpaState.prototype.connect = function (path, cb) {
  this.client.on('connect', cb.bind(this))
  this.client.connect(path)
}

WpaState.prototype.listen = function (clientPath, cb) {
  this.client.on('listening', cb.bind(this))
  this.client.bind(clientPath)
}

WpaState.prototype.request = function (req, cb) {
  this._handleReply = cb
  this.client.send(new Buffer(req))
}

WpaState.prototype.onMessage = function (msg) {
  var handleReply
  if (msg[0] === /*<*/60 && msg[2] === /*>*/62) {
    this._onCtrlEvent(msg[1] - /*0*/48, msg.slice(3))
  } else if ((handleReply = this._handleReply)) {
    delete this._handleReply
    handleReply.call(this, msg.toString())
  }
}

WpaState.prototype._onCtrlEvent = function (level, msg) {
  var m
  if (msg[0] === /*S*/83) {
    if ((m = /^State: .* -> (.*)$/.exec(msg.toString()))) {
      this._onStateChange(m[1])
    }
  }
}

WpaState.prototype.setLevel = function (level, cb) {
  this.request('LEVEL ' + level, function (msg) {
    if (msg !== 'OK\n') cb.call(this, new Error('unable to set level'))
    else cb.call(this, null)
  })
}

WpaState.prototype.attach = function (cb) {
  this.request('ATTACH', function (msg) {
    if (msg !== 'OK\n') cb.call(this, new Error('unable to attach'))
    else cb.call(this, null)
  })
}

WpaState.prototype.getState = function (cb) {
  this.request('STATUS', function (msg) {
    var match = /wpa_state=(\S*)/.exec(msg.toString())
    if (!match) return cb.call(this, new Error('unable to get state'))
    this._onStateChange(match[1])
    cb.call(this, null, match[1])
  })
}

WpaState.prototype._onStateChange = function (state) {
  state = state.toLowerCase()
  if (state === this.state) return
  this.state = state
  this.emit('state', state)
}

var monitors = {}

module.exports = function (ifname, onState) {
  if (typeof ifname !== 'string') {
    throw new Error('ifname should be a string')
  }
  var monitor = monitors[ifname] || (monitors[ifname] = new WpaState(ifname))
  if (onState) {
    if (monitor.state) onState(monitor.state)
    monitor.on('state', onState)
  }
  return monitor
}

module.exports.WpaState = WpaState

/* http://w1.fi/wpa_supplicant/devel/ctrl_iface_page.html
 * states
 * disconnected inactive scanning authenticating associating associated
 * 4way_handshake group_handshake completed unknown interface_disabled */
