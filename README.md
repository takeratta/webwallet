# Bitcoin web wallet with Trezor support

Bitcoin web wallet using Bitcoin Trezor as a private key storage.

## Installation option 1 - Docker

First option is easier and requires just docker.

    echo 127.0.0.1 localhost.mytrezor.com >> /etc/hosts
    docker build -t mytrezor-webwallet .
    docker run -p 8000:8000 mytrezor-webwallet

And that's it. Now you can visit <http://localhost.mytrezor.com:8000>. The first part is important and not only "aesthetic"; without it, the backend on mytrezor won't load because of cross-site-scripting prevention.

Note: the whole repo is cloned into the docker (and pulled again when running it), so all changes will be ignored

If you want to run testnet instead of main blockchain, just run the docker like this

    docker run -p 8000:8000 -e "RUN_TEST=1" mytrezor-webwallet

If you want to run grunt server instead of python http server, just run it like this

    docker run -p 8000:8000 -e "RUN_GRUNT=1" mytrezor-webwallet

(Grunt server automatically reloads changes in app, python's server does not; however, due to some grunt bug, the .deb packages with the plugins are transferred wrong)


## Installation option 2

You can also install and set up everything yourself.

	sudo npm install -g grunt-cli bower
	git clone git@github.com:trezor/webwallet.git
	cd webwallet
	git submodule update --recursive --init
	bower install
	npm install

### Configuration

Copy `app/scripts/config.sample.js` to `app/scripts/config.js` and adjust to
your needs (i.e. point backend URIs to your own server or change the
location of signed plugin configuration).

### Run development server

To run web wallet locally, please make sure your hosts file includes
the following line:

    127.0.0.1 localhost.mytrezor.com

Afterwards you can run the local server. It'll be available on
`http://localhost.mytrezor.com:8000`:

    grunt server

### Build production package

	grunt build
	cp -r app/data dist/data
