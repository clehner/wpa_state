var unix = require('unix-dgram'),
    inherits = require('inherits'),
    EventEmitter = require('events').EventEmitter;

inherits(WpaCLI, EventEmitter);

function WpaCLI(ifname) {
    if (!(this instanceof WpaCLI)) return new WpaCLI(ifname);

    if (typeof ifname !== 'string') {
        throw new Error('ifname should be a string')
    }

    EventEmitter.call(this);
    this.ifname = ifname
}

WpaCLI.prototype.connect = function () {
    var serverPath = '/var/run/wpa_supplicant/' + this.ifname;
    var clientPath = '/tmp/wpa_ctrl' + Math.random().toString(36).substr(1);
    var error = this._onError.bind(this);

    this.client = unix.createSocket('unix_dgram')
        .on('message', this._onMessage.bind(this))
        .on('error', error);

    // I should probably rewrite this using promises..
    this._connect(serverPath, function (err) {
        if (err) return error('unable to connect to interface');
        this.listen(clientPath, function (err) {
            if (err) return error('unable to listen for events');
            this.attach(function (err) {
                if (err) return error('unable to attach to events');
                this.setLevel(2, function (err) {
                    if (err) return error('unable to set level');


                });
            });
        });
    });
};

WpaCLI.prototype._onError = function (err) {
    if (this._handleError)
        this._handleError(err);
    else
        this.emit('error', err);
};

WpaCLI.prototype._connect = function (path, cb) {
    var done = function (err) {
        this.client.removeListener('connect', done);
        delete this._handleError;
        cb.call(this, err)
    }.bind(this);

    this._handleError = done;
    this.client.once('connect', done)
        .connect(path)
};

WpaCLI.prototype.listen = function (clientPath, cb) {
    var done = function (err) {
        this.client.removeListener('listening', done);
        delete this._handleError;
        cb.call(this, err)
    }.bind(this);

    this._handleError = done;
    this.client.once('listening', done)
        .bind(clientPath)
};

WpaCLI.prototype.request = function (req, cb) {
    this._handleReply = cb;
    this.client.send(new Buffer(req))
};

WpaCLI.prototype._onMessage = function (msg) {
    var handleReply;
    if (msg[0] === /*<*/60 && msg[2] === /*>*/62) {
        this._onCtrlEvent(msg[1] - /*0*/48, msg.slice(3))
    } else if ((handleReply = this._handleReply)) {
        delete this._handleReply;
        handleReply.call(this, msg.toString().trim())
    }
};

WpaCLI.prototype._onCtrlEvent = function (level, msg) {
    var m;
    switch (String.fromCharCode(msg[0])) {
        case 'S':
            if ((m = /^State: .* -> (.*)$/.exec(msg.toString()))) {
                this._onStatusChange({state: m[1].toLowerCase()});
                break;
            }
        /* fall through */
        case 'T':
            if ((m = /^(?:SMT: )?Trying to .* \(SSID='(.*?)'/.exec(msg.toString()))) {
                this._onStatusChange({ssid: m[1]})
            }
            break;
        case 'C':
            if (level === 3 && /^CTRL-EVENT-DISCONNECTED/.test(msg.toString())) {
                this._onStatusChange({ssid: null})
            }
    }
};

WpaCLI.prototype.setLevel = function (level, cb) {
    this.request('LEVEL ' + level, function (msg) {
        if (msg === 'OK')
            cb.call(this, null);
        else
            cb.call(this, 'level: ' + msg);
    })
};

WpaCLI.prototype.attach = function (cb) {
    this.request('ATTACH', function (msg) {
        if (msg === 'OK')
            cb.call(this, null);
        else
            cb.call(this, 'attach: ' + msg);
    })
};

WpaCLI.prototype.detach = function (cb) {
    this.request('DETACH', function (msg) {
        if (msg === 'OK')
            cb.call(this, null);
        else
            cb.call(this, 'detach: ' + msg);
    })
};

WpaCLI.prototype.getStatus = function (cb) {
    this.request('STATUS', function (msg) {
        var status = {};
        var lines = msg.toString().split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var j = line.indexOf('=');
            if (j > 0) {
                status[line.substr(0, j)] = line.substr(j + 1)
            }
        }
        if (status.wpa_state)
            cb.call(this, null, status);
        else
            cb.call(this, 'unable to get status');
    })
};

WpaCLI.prototype._onStatusChange = function (status) {
    var change = false;
    if ('state' in status && status.state !== this.state) {
        change = true;
        this.state = status.state;
        this.emit('state', status.state);
    }
    if ('ssid' in status && status.ssid !== this.ssid) {
        change = true;
        this.ssid = status.ssid;
        this.emit('ssid', status.ssid);
    }
    if (change) {
        this.emit('status', {ssid: this.ssid, state: this.state});
    }
};

module.exports = WpaCLI;

/* http://w1.fi/wpa_supplicant/devel/ctrl_iface_page.html
 * states
 * disconnected inactive scanning authenticating associating associated
 * 4way_handshake group_handshake completed unknown interface_disabled */
