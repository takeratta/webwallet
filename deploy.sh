#!/bin/bash

set -e
cd `dirname $0`

rm -rf www-old
mv www www-old
cp -r dist www
