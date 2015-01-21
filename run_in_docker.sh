#!/usr/bin/env bash 
#this script is run only when running from Docker!

#this file is created in Docker script
#why is this here? if we mount app directly, we don't want pull
if [ -e /srv/webwallet/app/is_cloned ] ; then
    cd /srv/webwallet
    git pull --ff-only
    cd /
fi

if [ "$RUN_TEST" == "1"  ] ; then
    sed -i 's/coin: '"'"'Bitcoin/coin: '"'"'Testnet/' \
        /srv/webwallet/app/scripts/config.js
else
    sed -i 's/coin: '"'"'Testnet/coin: '"'"'Bitcoin/' \
        /srv/webwallet/app/scripts/config.js
fi

cd /srv/webwallet
grunt build
sed -i "s:@@GITREV@@:$(git rev-parse HEAD):" dist/index.html
cp -a app/data/ dist/data/



cd /srv/webwallet/dist
echo "Starting the server!"

if [ "$RUN_GRUNT" == "1" ] ; then
    grunt server
else
    python -m SimpleHTTPServer
fi
