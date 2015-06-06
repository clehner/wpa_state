# wpa_state

Get the connection state of wpa_supplicant

## Usage

```js
require('wpa_state')('wlan0', function (state) {
	if (state == 'completed') {
		console.log('internet')
	} else if (state == 'disconnected') {
		console.log('no internet')
	}
})
```

## License

MIT
