Bitcoin web wallet with Trezor support
======================================

Bitcoin web wallet using Bitcoin Trezor as a private key storage.

Usage
-----

Application expects a signed Trezor configuration file at
`/data/plugin/config_signed.bin`. You can change the url at `app/scripts/app.js`.

Also copy `app/scripts/config.sample.js` to `app/scripts/config.js`
and adjust to your needs (i.e. point backend URIs to your own server).

Installation
------------

	sudo npm install -g grunt-cli bower
	git clone git@github.com:trezor/webwallet.git
	cd webwallet
	git submodule update --recursive --init
	bower install
	npm install

	# for production use
	grunt build
	cp -r app/data dist/data

	# for development use
	cd app
	python -m SimpleHTTPServer
