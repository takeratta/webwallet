'use strict';

angular.module('webwalletApp')
  .value('atmosphere', window.jQuery.atmosphere);

angular.module('webwalletApp')
  .config(function ($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  });

angular.module('webwalletApp')
  // coin name -> backend endpoint
  .value('backends', {
    'Bitcoin': 'https://mytrezor.com:80',
    'Testnet': 'http://test-api.bitsofproof.com:8080'
  })
  // coin name -> public address version
  .value('versions', {
    'Bitcoin': 76067358,
    'Testnet': 70617039
  });

angular.module('webwalletApp')
  .factory('TrezorBackend', function (backends, versions, utils,
      atmosphere, Crypto, $http, $log) {

    function TrezorBackend(coin) {
      this.endpoint = backends[coin.coin_name];
      this.version = versions[coin.coin_name];

      if (!this.endpoint)
        throw new Error('Endpoint for given coin type "'
          + coin.coin_name + '" does not exist');
    }

    TrezorBackend.prototype.apiUrl = function (path) {
      return this.endpoint + '/trezor/' + path;
    };

    TrezorBackend.prototype.streamUrl = function (path) {
      return this.endpoint + '/ws/' + path;
    };

    // POST

    TrezorBackend.prototype.register = function (node) {
      var xpub = utils.node2xpub(node, this.version),
          data = {
            after: '2013-12-01',
            publicMaster: xpub,
            lookAhead: 10,
            firstIndex: 0
          };

      $log.debug('Registering public key', xpub);
      return $http.post(this.apiUrl('register'), data);
    };

    TrezorBackend.prototype.deregister = function (node) {
      var xpub = utils.node2xpub(node, this.version);

      $log.debug('Deregistering public key', xpub);
      return $http.delete(this.apiUrl(xpub));
    };

    TrezorBackend.prototype.send = function (rawTx) {
      var txbytes = utils.hexToBytes(rawTx),
          txhash = Crypto.SHA256(Crypto.SHA256(txbytes, {asBytes: true}), {asBytes: true}),
          data = {
            transaction: utils.bytesToBase64(txbytes),
            transactionHash: utils.bytesToBase64(txhash)
          };
      $log.debug('Sending', rawTx);
      return $http.post(this.apiUrl('send'), data);
    };

    // GET

    TrezorBackend.prototype.balance = function (node) {
      var xpub = utils.node2xpub(node, this.version);

      $log.debug('Requesting balance for', xpub);
      return $http.get(this.apiUrl(xpub + '?details'));
    };

    TrezorBackend.prototype.transactions = function (node) {
      var xpub = utils.node2xpub(node, this.version);

      $log.debug('Requesting tx history for', xpub);
      return $http.get(this.apiUrl(xpub + '/transactions'));
    };

    TrezorBackend.prototype.lookupTx = function (node, hash) {
      var xpub = utils.node2xpub(node, this.version);

      $log.debug('Looking up tx', hash, 'for', xpub);
      return $http.get(this.apiUrl(xpub + '/transactions/' + hash));
    };

    // Stream

    TrezorBackend.prototype.subscribe = function (node, callback) {
      var xpub = utils.node2xpub(node, this.version),
          req = new atmosphere.AtmosphereRequest();

      req.url = this.streamUrl(xpub);
      req.contentType = 'application/json';
      req.transport = 'websocket';
      req.fallbackTransport = 'long-polling';
      req.trackMessageLength = true;
      req.enableXDR = true;

      req.onMessage = function (res) {
        var msg = res.responseBody,
            ret;
        try {
          ret = JSON.parse(msg);
        } catch (e) {
          $log.error('Error parsing JSON response:', msg);
        }
        if (ret) callback(ret);
      };

      $log.debug('Subscribing to balance updates for', xpub);
      atmosphere.subscribe(req);
    };

    return TrezorBackend;

  });
