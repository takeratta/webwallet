'use strict';

angular.module('webwalletApp')
  .value('atmosphere', window.atmosphere);

angular.module('webwalletApp')
  .config(function ($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  });

angular.module('webwalletApp')
  .value('backends', {})
  .factory('TrezorBackend', function (backends, config, utils, atmosphere, $http, $log, $q) {

    function TrezorBackend(coin) {
      this.version = config.versions[coin.coin_name];
      this.endpoint = config.backends[coin.coin_name].endpoint;
      this._handlers = {};
      this._socket = null;
      this._deferred = null;
    }

    TrezorBackend.singleton = function (coin) {
      if (!backends[coin.coin_name])
        backends[coin.coin_name] = new TrezorBackend(coin);
      return backends[coin.coin_name];
    };

    TrezorBackend.prototype.apiUrl = function (path) {
      return this.endpoint + '/trezor/' + path;
    };

    TrezorBackend.prototype.streamUrl = function () {
      return this.endpoint + '/ws/lp';
    };

    // Stream

    TrezorBackend.prototype.connect = function () {
      var url = this.streamUrl();

      if (this._deferred)
        return this._deferred.promise;

      $log.log('[backend] Opening connection to', url);
      this._deferred = $q.defer();
      this._socket = atmosphere.subscribe({
        url: url,
        enableXDR: true,
        trackMessageLength: true,
        executeCallbackBeforeReconnect: true,
        contentType: 'application/json',

        onOpen: this._onOpen.bind(this),
        onClose: this._onClose.bind(this),
        onError: this._onError.bind(this),
        onMessage: this._onMessage.bind(this)
      });

      return this._deferred.promise;
    };

    TrezorBackend.prototype.disconnect = function () {
      if (!this._socket)
        return;

      $log.log('[backend] Closing connection');
      this._socket.close();
    };

    TrezorBackend.prototype._onOpen = function () {
      if (this._deferred)
        this._deferred.resolve();
      $log.log('[backend] Connection opened');
    };

    TrezorBackend.prototype._onClose = function () {
      this._socket = null;
      this._deferred = null;
      $log.log('[backend] Connection closed');
    };

    TrezorBackend.prototype._onError = function (res) {
      if (this._deferred)
        this._deferred.reject();
      $log.error('[backend] Connection error occured', res);
    };

    TrezorBackend.prototype._onMessage = function (res) {
      var body = res.responseBody,
          json;

      try {
        json = atmosphere.util.parseJSON(body);
      } catch (e) {
        $log.error('[backend] Error parsing JSON response:', body);
      }

      if (json)
        this._processMessage(json);
    };

    TrezorBackend.prototype._processMessage = function (msg) {
      var key;

      if (typeof msg === 'object') { // balance update
        key = msg.publicMaster;
        if (this._handlers[key])
          this._handlers[key](msg);
      }

      if (typeof msg === 'string') // version report
        $log.log('[backend] Backend version', msg);
    };

    TrezorBackend.prototype.subscribe = function (node, handler) {
      var xpub = utils.node2xpub(node, this.version);

      if (this._handlers[xpub])
        return;
      this._handlers[xpub] = handler;

      $log.log('[backend] Subscribing', xpub);
      this._socket.push(atmosphere.util.stringifyJSON({
        publicMaster: xpub,
        after: '2014-01-01',
        lookAhead: 10,
        firstIndex: 0
      }));
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
      return $http.post(this.apiUrl('send'), {
        transaction: utils.bytesToBase64(txbytes),
        transactionHash: utils.bytesToBase64(txhash)
      });
    };

    // GET

    TrezorBackend.prototype.transactions = function (node) {
      var xpub = utils.node2xpub(node, this.version);

      $log.log('[backend] Requesting tx history for', xpub);
      return $http.get(this.apiUrl(xpub + '/transactions')).then(function (res) {
        return res.data;
      });
    };

    TrezorBackend.prototype.transaction = function (node, hash) {
      var xpub = utils.node2xpub(node, this.version);

      $log.log('[backend] Looking up tx', hash, 'for', xpub);
      return $http.get(this.apiUrl(xpub + '/transactions/' + hash)).then(function (res) {
        return res.data;
      });
    };

    return TrezorBackend;

  });
