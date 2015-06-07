# wpa_state

Get the connection state of wpa_supplicant

## Example

```js
var WpaState = require('wpa_state')
new WpaState('wlan0')
.on('state', function (state) {
	if (state == 'completed') {
		console.log('internet')
	} else if (state == 'disconnected') {
		console.log('no internet')
	}
})
.connect()

```

## CLI

There is a command-line program included, `wpa_state`, which prints the
connection state and SSID on a line each time they change. This is intended to
be suitable for piping through shell scripts.

## License

MIT
