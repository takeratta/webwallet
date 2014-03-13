'use strict';

angular.module('webwalletApp')
  .factory('TrezorDevice', function (config, trezor, utils, firmwareService, TrezorAccount, _, $q) {

    function TrezorDevice(id) {
      this.id = ''+id;
      this.accounts = [];
      this.features = null;
      this._desc = null;
      this._session = null;
      this._loading = null;
    }

    TrezorDevice.deserialize = function (data) {
      var dev = new TrezorDevice(data.id);

      dev.features = data.features;
      dev.accounts = data.accounts.map(function (item) {
        return TrezorAccount.deserialize(item);
      });

      return dev;
    };

    TrezorDevice.prototype.serialize = function () {
      return {
        id: this.id,
        features: this.features,
        accounts: this.accounts.map(function (acc) {
          return acc.serialize();
        })
      };
    };

    //
    // Status & features
    //

    TrezorDevice.prototype.isLoading = function () { return this._loading; };
    TrezorDevice.prototype.withLoading = function (fn) {
      var self = this;

      self._loading = true;
      return $q.when(fn()).finally(function () {
        self._loading = false;
      });
    };

    TrezorDevice.prototype.status = function () {
      if (this.isLoading()) return 'loading';
      if (this.isConnected()) return 'connected';
      return 'disconnected';
    };

    TrezorDevice.prototype.label = function () {
      if (this.features && this.features.label)
        return this.features.label;
      else
        return 'My TREZOR';
    };

    //
    // HW connections
    //

    TrezorDevice.prototype.isConnected = function () {
      return this._desc && this._session;
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

    //
    // HW initialization
    //

    TrezorDevice.prototype.isEmpty = function () {
      return !this.features || !this.features.initialized;
    };

    TrezorDevice.prototype.initializeDevice = function () {
      var self = this,
          delay = 3000, // delay between attempts
          max = 60; // give up after n attempts

      // keep trying to initialize
      return utils.endure(callInitialize, delay, max)
        .then(
          function (res) {
            return (self.features = res.message);
          },
          function (err) {
            self.features = null;
            throw err;
          }
        );

      function callInitialize() {
        if (self.isConnected())
          return self._session.initialize();
        // return falsey to cancel endure()
        return false;
      }
    };

    TrezorDevice.prototype.initializeAccounts = function () {
      var self = this;

      // reset accounts if the device is empty, make sure to deregister
      // existing accounts first
      if (this.isEmpty())
        return this.deregisterAndUnsubscribe().then(function () {
          return (self.accounts = []);
        });

      // if the device is not empty and no accounts are present, add the first
      // account and start the account discovery
      if (!this.accounts.length)
        return this.addAccount().then(function () {
          return self.discoverAccounts();
        });

      return $q.when(this.accounts);
    };

    //
    // Account management
    //

    TrezorDevice.prototype.registerAndSubscribe = function () {
      return $q.all(this.accounts.map(function (acc) {
        return acc.registerAndSubscribe();
      }));
    };

    TrezorDevice.prototype.deregisterAndUnsubscribe = function () {
      return $q.all(this.accounts.map(function (acc) {
        return acc.deregisterAndUnsubscribe();
      }));
    };

    TrezorDevice.prototype.account = function (id) {
      return _.find(this.accounts, { id: id });
    };

    // Account adding

    TrezorDevice.prototype.canAddAccount = function () {
      var lastAcc = this.accounts[this.accounts.length-1];

      return this.isConnected() // hw is available
        && !this.isEmpty() // hw is not empty
        && (!lastAcc || !lastAcc.isEmpty()); // last account is not empty
    };

    TrezorDevice.prototype.addAccount = function () {
      var self = this;

      if (!this.canAddAccount())
        return $q.reject(new Error('Cannot add any more accounts'));

      return this._createAccount(this.accounts.length).then(function (acc) {
        self.accounts.push(acc);
        acc.registerAndSubscribe();
        return acc;
      });
    };

    // Account hiding

    TrezorDevice.prototype.canHideAccount = function (acc) {
      var lastAcc = this.accounts[this.accounts.length-1];

      return acc.isEmpty() // is empty
        && acc.id === lastAcc.id // is the last
        && this.accounts.length > 1; // is not the only one
    };

    TrezorDevice.prototype.hideAccount = function (acc) {
      if (!this.canHideAccount(acc))
        throw new Error('Cannot hide this account');

      return _.remove(this.accounts, { id: acc.id });
    };

    // Account discovery

    TrezorDevice.prototype.discoverAccounts = function () {
      var self = this,
          start = this.accounts.length;

      return discoverAccount(start).then(function () {
        return self.accounts;
      });

      function discoverAccount(n) {
        return self._createAccount(n).then(function (acc) {
          return acc.registerAndSubscribe().then(function () {
            // stop the discovery if empty
            if (acc.isEmpty())
              return acc.deregisterAndUnsubscribe();

            // add to list and continue
            self.accounts.push(acc);
            return discoverAccount(n + 1);
          });
        });
      }
    };

    // Private methods for creating accounts

    TrezorDevice.prototype._createAccount = function (id) {
      var coin = this._getCoin(config.coin),
          path = this._getPathForAccount(id, coin);

      return this._session.getPublicKey(path).then(function (res) {
        var node = res.message.node;

        return new TrezorAccount(id, coin, {
          main: node,
          external: trezor.deriveChildNode(node, 0),
          change: trezor.deriveChildNode(node, 1)
        });
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

    TrezorDevice.prototype._getCoin = function (name) {
      return _.find(this.features.coins, { coin_name: name });
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

      return self.withLoading(function () {
        return self._session.wipeDevice().then(function () {
          return self.deregisterAndUnsubscribe();
        });
      });
    };

    TrezorDevice.prototype.reset = function (settings) {
      var self = this,
          sett = angular.copy(settings);

      return self.withLoading(function () {
        return self._session.resetDevice(sett)
          .then(function () { return self.initializeDevice(); })
          .then(function () { return self.initializeAccounts(); });
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

      return self.withLoading(function () {
        return self._session.loadDevice(sett)
          .then(function () { return self.initializeDevice(); })
          .then(function () { return self.initializeAccounts(); });
      });
    };

    TrezorDevice.prototype.recover = function (settings) {
      var self = this,
          sett = angular.copy(settings);

      sett.enforce_wordlist = true;

      return self.withLoading(function () {
        return self._session.recoverDevice(sett)
          .then(function () { return self.initializeDevice(); })
          .then(function () { return self.initializeAccounts(); });
      });
    };

    return TrezorDevice;

  });
