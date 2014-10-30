#!/bin/bash

set -e
export LC_ALL=C

cd `dirname $0`

git pull --ff-only
git submodule update --recursive
git rev-parse HEAD > app/revision.txt

cd app/data
./check_releases.py
cd ../../

rm -rf app/bower_components
bower install -F || $(npm bin)/bower install -F
#npm install

grunt build || $(npm bin)/grunt build
cp -r app/data dist/data

echo "DONE. Please run ./deploy.sh"
exit 0
