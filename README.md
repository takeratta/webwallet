Bitcoin web wallet with Trezor support
======================================

Bitcoin web wallet using Bitcoin Trezor as a private key storage.

Usage
-----

Application expects a signed Trezor configuration file at
`/data/config_signed.bin`. You can change the url at `app/scripts/app.js`.

Installation
------------
npm install -g grunt-cli bower
git clone git@github.com:trezor/webwallet.git
cd webwallet
git submodule update --recursive --init
bower install
npm install
grunt build
cp -r app/data dist/data
