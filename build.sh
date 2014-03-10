#!/bin/bash

set -e
export LC_ALL=C

cd `dirname $0`

git pull
git submodule update --recursive

cd app/data
./check_releases.py
cd ../../

rm -rf app/bower_components
bower install
#npm install

grunt build
cp -r app/data dist/data

# Put current revision to http://mytrezor.com/revision.txt
git rev-parse HEAD > app/revision.txt

echo "DONE"
exit 0
