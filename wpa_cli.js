var wpa = require('./');

var handle = new wpa('wlan1');
handle.connect();

handle.on('event-3', function (evt) { // Log all the level 3 messages
    console.log(evt);
});

function addNetwork() {
    handle.addNetwork({ssid: 'MySuperNetwork', psk: 'password123'}, function (err, newId) {
        if (err) {
            console.error(err);
            return false;
        }

        console.log('New network id:', newId);

        handle.enableNetwork(newId, function (status) {
            console.log('Enable status:', status);

            handle.removeNetwork(newId, function (status) {
                if (status === 'OK')
                    console.log('Network removed');
                else
                    console.log('Could not remove the network ', newId);
            })
        });
    });
}

handle.scan(function () {
    handle.getScanResults(function (err, data) {
        console.log(err, data);

        addNetwork(); // I made a separate function just not to add all of the code above in this callback.
    });
});