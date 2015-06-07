# wpa_state

Get the connection state of wpa_supplicant

## Example

```js
require('wpa_state')('wlan0', function (state) {
	if (state == 'completed') {
		console.log('internet')
	} else if (state == 'disconnected') {
		console.log('no internet')
	}
})
```

## CLI

There is a command-line program included, `wpa_state`, which prints the
connection state on a line each time it changes. This is intended to be
suitable for piping through shell scripts.

## License

MIT
