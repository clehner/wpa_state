#!/usr/bin/env node

require('./')(process.argv[2] || 'wlan0')
.on('state', console.log)
.on('error', function (err) {
  console.error('wpa_state:', err)
  process.exit(1)
})
