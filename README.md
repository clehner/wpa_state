# Node WPA CLI

An event-oriented library to interact with `wpa_supplicant`. The aim of the project is to offer a simple interface to control
your wifi antenna(s) through Node.JS, by supporting all the 'offical' command line interface commands. I'll start adding 
most of the p2p commands first.

## Example

```js
var WpaState = require('node_wpa_cli')
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

## License

MIT
