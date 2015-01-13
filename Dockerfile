# echo 127.0.0.1 localhost.mytrezor.com >> /etc/hosts
# docker build -t mytrezor-webwallet .
# docker run -p 8000:8000 mytrezor-webwallet grunt server
# $BROWSER http://localhost.mytrezor.com:8000/

FROM ubuntu:latest

RUN apt-get update
RUN apt-get install -y git npm nodejs-legacy
RUN npm install -g grunt-cli bower

WORKDIR /srv
RUN git clone --recursive https://github.com/trezor/webwallet.git

WORKDIR /srv/webwallet
RUN cp app/scripts/config.sample.js app/scripts/config.js
RUN bower --allow-root install
RUN npm install
RUN grunt build

EXPOSE 8000
