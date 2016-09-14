var unix = require('unix-dgram'),
    inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter;

inherits(WpaCLI, EventEmitter);

function WpaCLI(ifname) {
    if (!(this instanceof WpaCLI)) return new WpaCLI(ifname);

    if (typeof ifname !== 'string') {
        throw new Error('ifname should be a string')
    }

    this.ignoreAck = false;

    EventEmitter.call(this);
    this.ifname = ifname
}

WpaCLI.prototype.connect = function (callback) {
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

                this.emit('connect');
                if (typeof callback === 'function')
                    callback();
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
    this.client.send(new Buffer(req));
};

WpaCLI.prototype._onMessage = function (msg) {
    var handleReply;
    this.emit('rawMsg', msg);

    if (msg.length > 3 && msg[0] === 60 && msg[2] === 62) {
        this._onCtrlEvent(msg[1] - 48, msg.slice(3))
    } else if (this.ignoreAck && msg.toString().substr(0, 3).indexOf('OK') != -1) { // This is just an ack message, ignoring it...
        this.ignoreAck = false;
    } else if ((handleReply = this._handleReply)) {
        delete this._handleReply;
        handleReply.call(this, msg.toString().trim())
    }
};

WpaCLI.prototype._onCtrlEvent = function (level, msg) {
    var messageParts = msg.toString().split(' ');

    var messageName = messageParts[0];
    messageParts.splice(1);

    this.emit(messageParts);
    this.emit('event-' + level, messageName, messageParts);
};

WpaCLI.prototype.setLevel = function (level, cb) {
    this.request('LEVEL ' + level, function (msg) {
        if (msg === 'OK')
            cb.call(this, null);
        else
            cb.call(this, 'level: ' + msg);
    });
};

WpaCLI.prototype.attach = function (cb) {
    this.request('ATTACH', function (msg) {
        if (msg === 'OK')
            cb.call(this, null);
        else
            cb.call(this, 'attach: ' + msg);
    });
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
    this.ignoreAck = true;
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
    });
};

function APStation(bssid, frequency, signal, encryption, ssid) {
    var encRegex = /\[([A-Z0-9\-]+)\]/g;

    var encArray = [];
    var match;

    while ((match = encRegex.exec(encryption)) != null)
        encArray.push(match[1]);

    return {
        bssid: bssid,
        frequency: frequency,
        encryption: encArray,
        signal: signal,
        ssid: ssid
    };
}

WpaCLI.prototype.getScanResults = function (cb) {
    this.ignoreAck = true;
    this.request('SCAN_RESULTS', function (msg) {
        var stations = [];
        var lines = msg.toString().split('\n');

        for (var i = 1; i < lines.length; i++) {
            var lineSplit = lines[i].split('\t');
            stations.push(new APStation(lineSplit[0], lineSplit[1], lineSplit[2], lineSplit[3], lineSplit[4]));
        }

        cb.call(this, null, stations);
    });
};

WpaCLI.prototype.scan = function (cb) {
    this.ignoreAck = true;
    this.request('SCAN');

    this.once('CTRL-EVENT-SCAN-RESULTS', cb);
};

WpaCLI.prototype.addNetwork = function (params, cb) {
    if (typeof params !== 'object') {
        cb.call(this, 'wrong params type');
        return false;
    }

    this.ignoreAck = true;
    var done = false;

    this.request('ADD_NETWORK', function (network_id) {
        for (var key in params)
            if (done) {
                break;
            } else if (params.hasOwnProperty(key)) {
                this.request('SET_NETWORK ' + network_id + ' ' + key + ' "' + params[key] + '"', function (status) {
                    if (status != 'OK') {
                        if (typeof cb === 'function')
                            cb.call(this, 'Param error');
                        done = true;
                    }

                });
            }

        if (!done && typeof cb === 'function')
            cb.call(this, null, network_id);
    });
};

WpaCLI.prototype.removeNetwork = function (netId, cb) {
    this.request('REMOVE_NETOWRK ' + netId, cb);
};

WpaCLI.prototype.disableNetwork = function (netId, cb) {
    this.request('DISABLE_NETOWRK ' + netId, cb);
};

WpaCLI.prototype.enableNetwork = function (netId, cb) {
    this.request('ENABLE_NETWORK ' + netId, cb);
};

module.exports = WpaCLI;

/* http://w1.fi/wpa_supplicant/devel/ctrl_iface_page.html
 * states
 * disconnected inactive scanning authenticating associating associated
 * 4way_handshake group_handshake completed unknown interface_disabled */
