# Bitcoin web wallet with Trezor support

Bitcoin web wallet using Bitcoin Trezor as a private key storage.

## Installation

	sudo npm install -g grunt-cli bower
	git clone git@github.com:trezor/webwallet.git
	cd webwallet
	git submodule update --recursive --init
	bower install
	npm install

## Configuration

Application expects a signed Trezor configuration file at
`/data/plugin/config_signed.bin`. You can change the URL at
`app/scripts/app.js`.

Copy `app/scripts/config.sample.js` to `app/scripts/config.js` and adjust to
your needs (i.e. point backend URIs to your own server).

## Build production package

	grunt build
	cp -r app/data dist/data

## Run development server

	grunt server
