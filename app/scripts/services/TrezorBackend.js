'use strict';

angular.module('webwalletApp')
  .config(function ($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
  });

angular.module('webwalletApp')
  .value('backends', {})
  .factory('TrezorBackend', function (backends, config, utils, $http, $log) {

    function TrezorBackend(coin) {
      this.version = config.versions[coin.coin_name];
      this.endpoint = config.backends[coin.coin_name].endpoint;
      this.request = config.backends[coin.coin_name].request || {};
      this._clientIdP = null;
      this._stream = null;
      this._handlers = {};
    }

    TrezorBackend.singleton = function (coin) {
      if (!backends[coin.coin_name])
        backends[coin.coin_name] = new TrezorBackend(coin);
      return backends[coin.coin_name];
    };

    TrezorBackend.prototype._streamUrl = function (id) {
      if (id != null)
        return this.endpoint + '/lp/' + id;
      else
        return this.endpoint + '/lp';
    };

    TrezorBackend.prototype._apiUrl = function (path) {
      return this.endpoint + '/trezor/' + path;
    };

    // Stream

    TrezorBackend.prototype.connect = function () {
      if (!this._clientIdP)
        this._openStream();
      return this._clientIdP;
    };

    TrezorBackend.prototype._openStream = function () {
      var self = this;

      // setup client ID promise
      $log.log('[backend] Requesting client ID');
      this._clientIdP = $http.post(this._streamUrl(), {}).then(function (res) {
        if (!res.data || res.data.clientId == null)
          throw new Error('Invalid client ID');
        $log.log('[backend] Client ID received');
        return res.data.clientId;
      });

      // reset if the request fails
      this._clientIdP.catch(function () {
        // $log.error('[backed] Client ID error', err);
        self._clientIdP = null;
      });

      // listen after the stream is opened
      this._clientIdP.then(function (id) {
        self._listenOnStream(id);
      });
    };

    TrezorBackend.prototype._listenOnStream = function (id) {
      var self = this,
          url = this._streamUrl(id),
          throttle = 1000; // polling throttle in msec

      // setup long-polling loop that gets notified with messages
      $log.log('[backend] Listening on client ID', id);
      this._stream = utils.httpPoll({
        method: 'GET',
        url: url
      }, throttle);

      // reset on stream error
      this._stream.catch(function () {
        // $log.error('[backed] Stream error', err);
        self._stream = null;
        self._clientIdP = null;
      });

      // process received messages
      this._stream.then(null, null, function (res) {
        if (res.status !== 204 && res.data.forEach)
          res.data.forEach(self._processMessage.bind(self));
      });
    };

    TrezorBackend.prototype._processMessage = function (msg) {
      var key = msg.publicMaster;
      if (this._handlers[key])
        this._handlers[key](msg);
    };

    TrezorBackend.prototype.disconnect = function () {
      $log.log('[backend] Closing stream');
      if (this._stream)
        this._stream.cancel();
      this._stream = null;
      this._clientIdP = null;
    };

    TrezorBackend.prototype.subscribe = function (node, handler) {
      var self = this,
          xpub = utils.node2xpub(node, this.version),
          req = {
            publicMaster: xpub,
            after: this.request.after || '2014-01-01',
            lookAhead: this.request.lookAhead || 20,
            firstIndex: this.request.firstIndex || 0
          };

      if (this._handlers[xpub])
        return;
      this._handlers[xpub] = handler;

      $log.log('[backend] Subscribing', xpub);
      return this.connect().then(function (id) {
        return $http.post(self._streamUrl(id), req).then(function (res) {
          self._processMessage(res.data);
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
