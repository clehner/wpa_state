#!/usr/bin/env node

var WpaState = require('./')

new WpaState(process.argv[2] || 'wlan0')
.on('error', function (err) {
  console.error('wpa_state:', err)
  process.exit(1)
})
.on('status', function (status) {
  console.log(status.state, status.ssid || '')
})
.connect()
