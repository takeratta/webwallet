'use strict';

angular.module('webwalletApp')
  .factory('TrezorDevice', function (trezor, utils, firmwareService, TrezorAccount, $q) {

    function TrezorDevice(id) {
      this.id = ''+id;
      this.accounts = [];
      this.callbacks = {}; // pin, passphrase callbacks
      this.features = null;
      this.node = null;
      this._desc = null;
      this._session = null;
      this._loading = null;
      this._error = null;
    }

    TrezorDevice.deserialize = function (data) {
      var dev = new TrezorDevice(data.id);

      dev.node = data.node;
      dev.features = data.features;
      dev.accounts = data.accounts.map(function (item) {
        return TrezorAccount.deserialize(item);
      });

      return dev;
    };

    TrezorDevice.prototype.serialize = function () {
      return {
        id: this.id,
        node: this.node,
        features: this.features,
        accounts: this.accounts.map(function (acc) {
          return acc.serialize();
        })
      };
    };

    // Device status, connection with hw

    TrezorDevice.prototype.status = function () {
      if (this._loading) return 'loading';
      if (this._desc) return 'connected';
      return 'disconnected';
    };

    TrezorDevice.prototype.is = function (status) {
      return this.status() === status;
    };

    TrezorDevice.prototype.label = function () {
      if (this.features && this.features.label)
        return this.features.label;
      else
        return 'My TREZOR';
    };

    TrezorDevice.prototype.connect = function (desc) {
      this._desc = desc;
      this._session = trezor.open(this._desc);
      this.on = this._session.on.bind(this._session);
      this.once = this._session.once.bind(this._session);
    };

    TrezorDevice.prototype.disconnect = function () {
      if (this._session)
        this._session.close();
      this._session = null;
      this._desc = null;
    };

    // Initialization

    TrezorDevice.prototype.hasKey = function () {
      return this.features && this.node;
    };

    TrezorDevice.prototype.initialize = function () {
      var self = this;

      return self.initializeDevice()
        .then(function () { return self.initializeKey(); })
        .then(function () { return self.initializeAccounts(); });
    };

    TrezorDevice.prototype.initializeDevice = function () {
      var self = this,
          delay = 3000, // delay between attempts
          max = 60; // give up after n attempts

      return utils.endure(initialize, delay, max) // keep trying to initialize
        .then(
          function (res) {
            self.features = res.message;
            return self.features;
          },
          function (err) {
            self.features = null;
            throw err;
          }
        );

      function initialize() {
        if (!self._session) return; // returns falsey to cancel the trapolining
        return self._session.initialize();
      }
    };

    TrezorDevice.prototype.initializeKey = function () {
      var self = this;

      return self._session.getPublicKey().then(
        function (res) { // setup master node
          self.node = res.message.node;
          return self.node;
        },
        function (err) {
          self.node = null;
          self.accounts = [];
          throw err;
        }
      );
    };

    TrezorDevice.prototype.initializeAccounts = function () {
      if (this.hasKey() && !this.accounts.length)
        return this.discoverAccounts();
    };

    TrezorDevice.prototype.subscribe = function () {
      return $q.all(this.accounts.map(function (acc) {
        return acc.registerAndSubscribe();
      }));
    };

    TrezorDevice.prototype.unsubscribe = function (deregister) {
      this.accounts.forEach(function (acc) {
        acc.unsubscribe();
        if (deregister) acc.deregister();
      });
    };

    //
    // Account management
    //

    TrezorDevice.prototype.addAccountAllowed = function () {
      return this.is('connected')
        && this.accounts.length < 10
        && this.hasKey();
    };

    TrezorDevice.prototype.account = function (id) {
      return utils.find(this.accounts, id, function (acc, id) {
        return acc.id === id;
      });
    };

    TrezorDevice.prototype.addAccount = function () {
      var self = this,
          pacc = this.accounts[this.accounts.length-1],
          id = pacc ? +pacc.id + 1 : 0;

      if (!self.addAccountAllowed()) return;

      return self._createAccount(id).then(function (acc) {
        self.accounts.push(acc);
        acc.registerAndSubscribe(); // we do not wait until this finishes
        return acc;
      });
    };

    TrezorDevice.prototype.discoverAccounts = function () {
      var self = this;

      return discoverAccount(self.accounts.length);

      function discoverAccount(n) {
        return self._createAccount(n).then(function (acc) {
          return acc.registerAndSubscribe().then(function () {
            if (acc.isEmpty() && self.accounts.length > 0)
              return acc.deregisterAndUnsubscribe();
            self.accounts.push(acc);
            return discoverAccount(n + 1);
          });
        });
      }
    };

    TrezorDevice.prototype.removeAccount = function (account) {
      var idx = utils.findIndex(this.accounts, account.id, function (acc, id) {
        return acc.id === id;
      });

      if (idx > 0) this.accounts.splice(idx, 1);
    };

    TrezorDevice.prototype._getCoin = function (name) {
      return utils.find(this.features.coins, name, function (coin, name) {
        return coin.coin_name === name;
      });
    };

    TrezorDevice.prototype._getPathForAccount = function (id, coin) {
      var cointypes = {
        'Bitcoin': 0,
        'Testnet': 0
      };

      return [
        cointypes[coin.coin_name], // cointype
        (0 | 0x80000000) >>> 0, // reserved'
        (id | 0x80000000) >>> 0 // account'
      ];
    };

    TrezorDevice.prototype._createAccount = function (id) {
      var coin = this._getCoin('Testnet'),
          path = this._getPathForAccount(id, coin);

      return this._session.getPublicKey(path).then(function (res) {
        var node = res.message.node;

        return new TrezorAccount(id, coin, {
          external: trezor.deriveChildNode(node, 0),
          change: trezor.deriveChildNode(node, 1)
        });
      });
    };

    //
    // Device calls
    //

    TrezorDevice.prototype.measureTx = function (tx, coin) {
      return this._session.measureTx(tx.inputs, tx.outputs, coin);
    };

    TrezorDevice.prototype.signTx = function (tx, coin, refTxs) {
      return this._session.simpleSignTx(tx.inputs, tx.outputs, coin, refTxs);
    };

    TrezorDevice.prototype.flash = function (firmware) {
      var self = this;

      return self._session.eraseFirmware().then(function () {
        return self._session.uploadFirmware(firmware);
      });
    };

    TrezorDevice.prototype.wipe = function () {
      var self = this;

      return self._session.wipeDevice().then(function () {
        self.unsubscribe();
        self.node = null;
        self.accounts = [];
        return self.initializeDevice();
      });
    };

    TrezorDevice.prototype.reset = function (settings) {
      var self = this,
          sett = angular.copy(settings);

      return self._session.resetDevice(sett).then(function () {
        self.unsubscribe();
        return self.initialize();
      });
    };

    TrezorDevice.prototype.load = function (settings) {
      var self = this,
          sett = angular.copy(settings);

      try { // try to decode as xprv
        sett.node = utils.xprv2node(sett.payload);
      } catch (e) { // use as mnemonic on fail
        sett.mnemonic = sett.payload;
      }
      delete sett.payload;

      return self._session.loadDevice(sett).then(function () {
        self.unsubscribe();
        return self.initialize();
      });
    };

    TrezorDevice.prototype.recover = function (settings) {
      var self = this,
          sett = angular.copy(settings);

      sett.enforce_wordlist = true;

      return self._session.recoverDevice(sett).then(function () {
        self.unsubscribe();
        return self.initialize();
      });
    };

    // Helpers

    TrezorDevice.prototype.withLoading = function (fn) {
      var self = this;

      self._loading = true;
      self._error = null;
      return fn().then(
        function () {
          self._loading = false;
          self._error = null;
        },
        function (err) {
          self._loading = false;
          self._error = err;
        }
      );
    };

    return TrezorDevice;

  });
