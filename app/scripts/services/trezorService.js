'use strict';

angular.module('webwalletApp')
  .service('trezorService', function TrezorService(utils, storage, trezor, firmwareService, TrezorDevice,
      _, $modal, $q, $location, $rootScope) {

    var self = this,
        STORAGE_DEVICES = 'trezorServiceDevices';

    var enumeratePaused = false,
        connectFn = connect,
        disconnectFn = disconnect;

    self.devices = deserialize(restore()); // the list of available devices
    self.devices.forEach(function (dev) {
      dev.registerAndSubscribe();
    });

    storeWhenChanged();
    watchDevices(1000);

    //
    // public
    //

    // find a device by id
    self.get = function (id) {
      return _.find(self.devices, { id: id });
    };

    // find a device by id and remove it from the dev list and storage
    self.forget = function (id) {
      var dev = _.find(self.devices, { id: id });

      if (!dev) return;
      dev.disconnect();
      dev.deregisterAndUnsubscribe();
      _.remove(self.devices, { id: id });
    };

    //
    // private
    //

    // serialize a device list
    function serialize(devices) {
      return devices.map(function (dev) {
        return dev.serialize();
      });
    }

    // deserialize a device list
    function deserialize(data) {
      return data.map(function (item) {
        return TrezorDevice.deserialize(item);
      });
    }

    // takes serialized device list, puts it to storage
    function store(data) {
      storage[STORAGE_DEVICES] = JSON.stringify(data);
    }

    // loads a serialized device list from storage
    function restore() {
      return storage[STORAGE_DEVICES]
        ? JSON.parse(storage[STORAGE_DEVICES])
        : [];
    }

    // watches the device list and persist it to storage on change
    function storeWhenChanged() {
      $rootScope.$watch(
        function () {
          return serialize(self.devices);
        },
        function (data) {
          store(data);
        },
        true // deep compare
      );
    }

    // starts auto-updating the device list
    function watchDevices(n) {
      var tick = utils.tick(n),
          desc = progressWithConnected(tick),
          delta = progressWithDescriptorDelta(desc);

      // handle added/removed devices
      delta.then(null, null, function (dd) {
        if (!dd)
          return;
        dd.added.forEach(connectFn);
        dd.removed.forEach(disconnectFn);
      });

      return tick;
    }

    // marks the device of the given descriptor as connected and starting the
    // correct workflow
    function connect(desc) {
      var dev;

      if (desc.id) {
        dev = _.find(self.devices, { id: desc.id });
        if (!dev) {
          dev = new TrezorDevice(desc.id);
          self.devices.push(dev);
        }
      } else
        dev = new TrezorDevice(desc.path);

      dev.withLoading(function () {
        dev.connect(desc);
        setupCallbacks(dev);
        return dev.initializeDevice().then(
          function (features) {
            return features.bootloader_mode
              ? bootloaderWorkflow(dev)
              : normalWorkflow(dev);
          },
          function () {
            dev.disconnect();
          }
        );
      });
    }

    // marks a device of the given descriptor as disconnected
    function disconnect(desc) {
      var dev;

      if (desc.id) {
        dev = _.find(self.devices, { id: desc.id });
        if (dev)
          dev.disconnect();
      }
    }

    //
    // normal workflow
    //

    function normalWorkflow(dev) {
      return firmwareService.check(dev.features)
        .then(function (firmware) {
          if (!firmware)
            return;
          return outdatedFirmware(firmware,
            firmwareService.get(dev.features));
        })
        .then(function () { return dev.initializeAccounts(); })
        .then(function () {
          if (dev.accounts.length)
            $location.path('/device/' + dev.id
              + '/account/' + dev.accounts[0].id + '/receive');
          else
            $location.path('/device/' + dev.id);
        });
    }

    // setups various callbacks, usually information prompts
    // FIXME: this doesnt belong here
    function setupCallbacks(dev) {
      dev.on('pin', function (message, callback) {
        var scope = $rootScope.$new(),
            modal;
        scope.pin = '';
        scope.message = message;
        scope.callback = callback;
        modal = $modal({
          template: 'views/modal.pin.html',
          backdrop: 'static',
          keyboard: false,
          scope: scope
        });
        modal.$promise.then(null, function () {
          callback();
        });
      });

      dev.on('passphrase', function (callback) {
        var scope = $rootScope.$new(),
            modal;
        scope.passphrase = '';
        scope.callback = scopeCallback;
        modal = $modal({
          template: 'views/modal.passphrase.html',
          backdrop: 'static',
          keyboard: false,
          scope: scope
        });
        modal.$promise.then(null, function () {
          scopeCallback();
        });

        function scopeCallback(passphrase) {
          if (passphrase)
            passphrase = passphrase.normalize('NFKD');
          callback(passphrase);
        }
      });

      dev.on('send', function () { enumeratePaused = true; });
      dev.on('error', function () { enumeratePaused = false; });
      dev.on('receive', function () { enumeratePaused = false; });

      dev.on('button', function (code) {
        var scope = $rootScope.$new(),
            modal;
        scope.code = code;
        scope.$emit('modalShow.button', code);
        modal = $modal({
          template: 'views/modal.button.html',
          backdrop: 'static',
          keyboard: false,
          scope: scope
        });
        dev.once('receive', hide);
        dev.once('error', hide);

        function hide() {
          scope.$emit('modalHide.button');
          modal.hide();
          modal.destroy();
        }
      });

      dev.on('word', function (callback) {
        $rootScope.seedWord = '';
        $rootScope.wordCallback = function (word) {
          $rootScope.wordCallback = null;
          $rootScope.seedWord = '';
          callback(word);
        };
      });
    }

    function outdatedFirmware(firmware, version) {
      var dfd = $q.defer(),
          modal = firmwareModal({
            state: 'initial',
            firmware: firmware,
            version: version,
            update: update,
            cancel: cancel,
            device: null
          });

      connectFn = connected;
      disconnectFn = disconnected;
      return dfd.promise;

      function connected(desc) {
        var dev = new TrezorDevice(desc.path);

        dev.connect(desc);
        setupCallbacks(dev);
        dev.initializeDevice().then(
          function (features) {
            modal.$scope.state = features.bootloader_mode
              ? 'device-bootloader'
              : 'device-normal';
            modal.$scope.device = dev;
          },
          function () {
            dev.disconect();
          }
        );
      }

      function disconnected(desc) {
        var dev = modal.$scope.device,
            state = modal.$scope.state;

        if (!dev || dev.id !== desc.path)
          return disconnect(desc);
        dev.disconnect();
        modal.$scope.device = null;

        if (state === 'update-success' || state === 'update-error')
          return cancel();
        modal.$scope.state = 'initial';
      }

      function update() {
        updateFirmware(modal, firmware);
      }

      function cancel() {
        connectFn = connect;
        disconnectFn = disconnect;
        dfd.resolve();
        modal.hide();
        modal.destroy();
      }
    }

    //
    // booloader workflow
    //

    function bootloaderWorkflow(dev) {
      return firmwareService.latest().then(function (firmware) {
        return candidateFirmware(firmware, dev);
      });
    }

    function candidateFirmware(firmware, dev) {
      var dfd = $q.defer(),
          modal = firmwareModal({
            state: 'device-bootloader',
            firmware: firmware,
            update: update,
            cancel: cancel,
            device: dev
          });

      disconnectFn = cancel;
      return dfd.promise;

      function update() {
        updateFirmware(modal, firmware);
      }

      function cancel(desc) {
        if (desc && desc.path !== dev.id)
          return disconnect(desc);
        disconnectFn = disconnect;
        dev.disconnect();
        modal.hide();
        modal.destroy();
        dfd.resolve();
      }
    }

    //
    // utils
    //

    function firmwareModal(params) {
      var scope = $rootScope.$new(),
          k;

      for (k in params)
        if (params.hasOwnProperty(k))
          scope[k] = params[k];

      return $modal({
        template: 'views/modal.firmware.html',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });
    }

    function updateFirmware(modal, firmware) {
      var dev = modal.$scope.device;

      modal.$scope.state = 'update-downloading';

      firmwareService.download(firmware)
        .then(function (data) {
          modal.$scope.state = 'update-flashing';
          return dev.flash(data);
        })
        .then(
          function () {
            modal.$scope.state = 'update-success';
          },
          function (err) {
            modal.$scope.state = 'update-error';
            modal.$scope.error = err.message;
          }
        );
    }

    // maps a promise notifications with connected device descriptors
    function progressWithConnected(pr) {
      return pr.then(null, null, function () { // ignores the value
        if (!enumeratePaused)
          return trezor.devices();
      });
    }

    // maps a promise notifications with a delta between the current and
    // previous device descriptors
    function progressWithDescriptorDelta(pr) {
      var prev = [],
          tmp;

      return pr.then(null, null, function (curr) {
        if (!curr)
          return;
        tmp = prev;
        prev = curr;
        return descriptorDelta(tmp, curr);
      });
    }

    // computes added and removed device descriptors in current tick
    function descriptorDelta(xs, ys) {
      return {
        added: _.filter(ys, function (y) { return !_.find(xs, { id: y.id }); }),
        removed: _.filter(xs, function (x) { return !_.find(ys, { id: x.id }); })
      };
    }

  });
