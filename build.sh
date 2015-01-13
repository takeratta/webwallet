#!/bin/bash

set -e
export LC_ALL=C

cd `dirname $0`

git pull --ff-only
git submodule update --recursive
GITREV=$(git rev-parse HEAD)
echo $GITREV > app/revision.txt

cd app/data
./check_releases.py
cd ../../

rm -rf app/bower_components
bower install || $(npm bin)/bower install
#npm install

grunt build || $(npm bin)/grunt build
cp -r app/data dist/data
sed -i "s:@@GITREV@@:$GITREV:" dist/index.html

echo "DONE. Please run ./deploy.sh"
exit 0
