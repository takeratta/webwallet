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

Copy `app/scripts/config.sample.js` to `app/scripts/config.js` and adjust to
your needs (i.e. point backend URIs to your own server or change the
location of signed plugin configuration).

## Run development server

To run web wallet locally, please make sure your hosts file includes
the following line:

    127.0.0.1 localhost.mytrezor.com

Afterwards you can run the local server. It'll be available on
`http://localhost.mytrezor.com:8000`:

    grunt server

## Build production package

	grunt build
	cp -r app/data dist/data
