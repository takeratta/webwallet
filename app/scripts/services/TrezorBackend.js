'use strict';

angular.module('webwalletApp')
  .value('backends', {})
  .factory('TrezorBackend', function (backends, config, utils, $http, $log, $q) {

    function TrezorBackend(coin) {
      this.version = config.versions[coin.coin_name];
      this.endpoint = config.backends[coin.coin_name].endpoint;
      this._streamUrlP = null;
      this._stream = null;
      this._handlers = {};
    }

    TrezorBackend.singleton = function (coin) {
      if (!backends[coin.coin_name])
        backends[coin.coin_name] = new TrezorBackend(coin);
      return backends[coin.coin_name];
    };

    TrezorBackend.prototype._connectUrl = function () {
      return this.endpoint + '/ws/lp';
    };

    TrezorBackend.prototype._apiUrl = function (path) {
      return this.endpoint + '/trezor/' + path;
    };

    // Stream

    TrezorBackend.prototype.connect = function () {
      if (!this._streamUrlP)
        this._openStream();
      return this._streamUrlP;
    };

    TrezorBackend.prototype._openStream = function () {
      var self = this;

      // setup stream url promise
      $log.log('[backend] Requesting stream url');
      this._streamUrlP = $http.post(this._connectUrl()).then(function (res) {
        $log.log('[backend] Stream url received');
        return res.data;
      });

      // reset if the request fails
      this._streamUrlP.catch(function (err) {
        $log.error('[backed] Stream url error', err);
        self._streamUrlP = null;
      });

      // listen after the stream is opened
      this._streamUrlP.then(function (url) {
        self._listenOnStream(url);
      });
    };

    TrezorBackend.prototype._listenOnStream = function (url) {
      var self = this;

      // setup long-polling loop that gets notified with messages
      $log.log('[backend] Listening on stream url', url);
      this._stream = utils.httpPoll({
        method: 'GET',
        url: url
      });

      // reset on stream error
      this._stream.catch(function (err) {
        $log.error('[backed] Stream error', err);
        self._stream = null;
        self._streamUrlP = null;
      });

      // process received messages
      this._stream.then(null, null, function (res) {
        var msg = res.data,
            key = msg.publicMaster;
        if (self._handlers[key])
          self._handlers[key](msg);
      });
    };

    TrezorBackend.prototype.disconnect = function () {
      $log.log('[backend] Closing stream');
      if (this._stream)
        this._stream.cancel();
      this._stream = null;
      this._streamUrlP = null;
    };

    TrezorBackend.prototype.subscribe = function (node, handler) {
      var xpub = utils.node2xpub(node, this.version);

      if (this._handlers[xpub])
        return;
      this._handlers[xpub] = handler;

      $log.log('[backend] Subscribing', xpub);
      return this.connect().then(function (url) {
        return $http.post(url, {
          publicMaster: xpub,
          after: '2014-01-01',
          lookAhead: 10,
          firstIndex: 0
        });
      });
    };

    TrezorBackend.prototype.unsubscribe = function (node) {
      var xpub = utils.node2xpub(node, this.version);
      delete this._handlers[xpub];
    };

    // POST

    TrezorBackend.prototype.send = function (rawTx) {
      var txbytes = utils.hexToBytes(rawTx),
          txhash = utils.sha256x2(txbytes, { asBytes: true });

      $log.log('[backend] Sending', rawTx);
      return $http.post(this._apiUrl('send'), {
        transaction: utils.bytesToBase64(txbytes),
        transactionHash: utils.bytesToBase64(txhash)
      });
    };

    // GET

    TrezorBackend.prototype.transactions = function (node) {
      var xpub = utils.node2xpub(node, this.version);

      $log.log('[backend] Requesting tx history for', xpub);
      return $http.get(this._apiUrl(xpub + '/transactions')).then(function (res) {
        return res.data;
      });
    };

    TrezorBackend.prototype.transaction = function (node, hash) {
      var xpub = utils.node2xpub(node, this.version);

      $log.log('[backend] Looking up tx', hash, 'for', xpub);
      return $http.get(this._apiUrl(xpub + '/transactions/' + hash)).then(function (res) {
        return res.data;
      });
    };

    return TrezorBackend;

  });
