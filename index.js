var unix = require('unix-dgram'),
  inherits = require('inherits'),
  EventEmitter = require('events').EventEmitter

inherits(WpaState, EventEmitter)

function WpaState (ifname) {
  if (!(this instanceof WpaState)) return new WpaState(ifname)

  if (typeof ifname !== 'string') {
    throw new Error('ifname should be a string')
  }

  EventEmitter.call(this)
  this.ifname = ifname
}

WpaState.prototype.connect = function () {
  var serverPath = '/var/run/wpa_supplicant/' + this.ifname
  var clientPath = '/tmp/wpa_ctrl' + Math.random().toString(36).substr(1)
  var error = this._onError.bind(this)

  this.client = unix.createSocket('unix_dgram')
  .on('message', this._onMessage.bind(this))
  .on('error', error)

  this._connect(serverPath, function (err) {
    if (err) return error('unable to connect to interface')
    this.listen(clientPath, function (err) {
      if (err) return error('unable to listen for events')
      this.attach(function (err) {
        if (err) return error('unable to attach to events')
        this.setLevel(2, function (err) {
          if (err) return error('unable to set level')
          this.getState(function (err, state) {
            if (err) return error(err)
          })
        })
      })
    })
  })
}

WpaState.prototype._onError = function (err) {
  if (this._handleError) this._handleError(err)
  else this.emit('error', err)
}

WpaState.prototype._connect = function (path, cb) {
  var done = function (err) {
    this.client.removeListener('connect', done)
    delete this._handleError
    cb.call(this, err)
  }.bind(this)
  this._handleError = done
  this.client.once('connect', done)
    .connect(path)
}

WpaState.prototype.listen = function (clientPath, cb) {
  var done = function (err) {
    this.client.removeListener('listening', done)
    delete this._handleError
    cb.call(this, err)
  }.bind(this)
  this._handleError = done
  this.client.once('listening', done)
    .bind(clientPath)
}

WpaState.prototype.request = function (req, cb) {
  this._handleReply = cb
  this.client.send(new Buffer(req))
}

WpaState.prototype._onMessage = function (msg) {
  var handleReply
  if (msg[0] === /*<*/60 && msg[2] === /*>*/62) {
    this._onCtrlEvent(msg[1] - /*0*/48, msg.slice(3))
  } else if ((handleReply = this._handleReply)) {
    delete this._handleReply
    handleReply.call(this, msg.toString().trim())
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
    if (msg === 'OK') cb.call(this, null)
    else cb.call(this, 'level: ' + msg)
  })
}

WpaState.prototype.attach = function (cb) {
  this.request('ATTACH', function (msg) {
    if (msg === 'OK') cb.call(this, null)
    else cb.call(this, 'attach: ' + msg)
  })
}

WpaState.prototype.getState = function (cb) {
  this.request('STATUS', function (msg) {
    var match = /wpa_state=(\S*)/.exec(msg.toString())
    if (match) {
      this._onStateChange(match[1])
      cb.call(this, null, match[1])
    } else cb.call(this, 'unable to get state')
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
