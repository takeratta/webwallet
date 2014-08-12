/*global angular*/

angular.module('webwalletApp')
  .service('trezorService', function TrezorService(
      utils, config, storage, trezor, firmwareService, TrezorDevice,
      _, $modal, $q, $location, $rootScope) {

    'use strict';

    var self = this,
        STORAGE_DEVICES = 'trezorServiceDevices',
        STORAGE_VERSION = 'trezorStorageVersion';

    var enumeratePaused = false,
        connectFn = connect,
        disconnectFn = disconnect;

    self.devices = deserialize(restore()); // the list of available devices
    self.devices.forEach(function (dev) { dev.subscribe(); });

    storeWhenChanged();
    watchDevices(1000);

    //
    // public
    //

    // find a device by id
    self.get = function (id) {
      return _.find(self.devices, { id: id });
    };

    /**
     * Get the default device
     *
     * That is currently the first device.
     */
    self.getDefaultDevice = function () {
      return self.devices[0];
    };

    // remove device from the dev list and storage
    self.forget = function (dev) {
      dev.disconnect();
      dev.unsubscribe();
      _.remove(self.devices, { id: dev.id });
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
      storage[STORAGE_VERSION] = config.storageVersion;
    }

    // loads a serialized device list from storage
    function restore() {
      var devices = storage[STORAGE_DEVICES],
          version = storage[STORAGE_VERSION];

      if (devices && version === config.storageVersion)
        return JSON.parse(devices);
      else
        return [];
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
        dd.added.forEach(function (dev) {
          $rootScope.$broadcast('device.connect', dev);
          connectFn(dev);
        });
        dd.removed.forEach(function (dev) {
          $rootScope.$broadcast('device.disconnect', dev);
          disconnectFn(dev);
        });
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
        resetOutdatedFirmwareBar(dev);
        return dev.initializeDevice().then(
          function (features) {
            navigateTo(dev);
            return features.bootloader_mode ?
              bootloaderWorkflow(dev) :
              normalWorkflow(dev);
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
        resetOutdatedFirmwareBar(desc);
      }
    }

    //
    // normal workflow
    //

    function navigateTo(dev) {
      var path = '/device/' + dev.id;

      if ($location.path().indexOf(path) !== 0)
        $location.path(path);
    }

    function normalWorkflow(dev) {
      return firmwareService.check(dev.features)
        .then(function (firmware) {
          if (!firmware)
            return;
          return outdatedFirmware(
            firmware,
            firmwareService.get(dev.features),
            dev
          );
        })
        .then(function () { return dev.initializeAccounts(); })
        .then(function () {
          navigateTo(dev);
        });
    }

    function setupCallbacks(dev) {
      setupEnumerationPausing(dev);
      setupEventForwarding(dev);
    }

    function setupEnumerationPausing(dev) {
      dev.on('send', function () { enumeratePaused = true; });
      dev.on('error', function () { enumeratePaused = false; });
      dev.on('receive', function () { enumeratePaused = false; });
    }

    function setupEventForwarding(dev) {
      ['pin', 'passphrase', 'button', 'word', 'send', 'error', 'receive']
        .forEach(function (type) {
          forwardEventsOfType($rootScope, dev, type);
        });
    }

    function forwardEventsOfType(scope, dev, type) {
      dev.on(type, function () {
        var args = [].slice.call(arguments);
        args.unshift(dev);
        args.unshift('device.' + type);
        scope.$broadcast.apply(scope, args);
      });
    }

    function outdatedFirmware(firmware, version, dev) {
      if (firmware.required)
        return outdatedFirmwareModal(firmware, version);
      else
        return outdatedFirmwareBar(firmware, version, dev);
    }

    function outdatedFirmwareBar(firmware, version, dev) {
      $rootScope.optionalFirmware = {
        device: dev,
        firmware: firmware,
        version: version,
        update: function () {
          outdatedFirmwareModal(firmware, version);
        }
      };
    }

    function resetOutdatedFirmwareBar(dev) {
      if ($rootScope.optionalFirmware &&
          $rootScope.optionalFirmware.device.id === dev.id) {
        delete $rootScope.optionalFirmware;
      }
    }

    function outdatedFirmwareModal(firmware, version) {
      var scope, modal;

      scope = angular.extend($rootScope.$new(), {
        state: 'initial',
        firmware: firmware,
        version: version,
        device: null,
        update: function () {
          updateFirmware(scope, firmware);
        }
      });

      modal = $modal.open({
        templateUrl: 'views/modal/firmware.html',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });

      modal.opened.then(function () {
        connectFn = myConnect;
        disconnectFn = myDisconnect;
      });
      modal.result.finally(function () {
        connectFn = connect;
        disconnectFn = disconnect;
      });

      return modal.result;

      function myConnect(desc) {
        var dev = new TrezorDevice(desc.path);

        dev.connect(desc);
        setupCallbacks(dev);
        dev.initializeDevice().then(
          function (features) {
            scope.state = features.bootloader_mode ?
              'device-bootloader' :
              'device-normal';
            scope.device = dev;
          },
          function () { dev.disconnect(); }
        );
      }

      function myDisconnect(desc) {
        if (!scope.device || scope.device.id !== desc.path) {
          disconnect(desc);
          return;
        }
        scope.device.disconnect();
        scope.device = null;

        if (scope.state === 'update-success' || scope.state === 'update-error') {
          modal.close();
          return;
        }
        scope.state = 'initial';
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
      var scope, modal;

      scope = angular.extend($rootScope.$new(), {
        state: 'device-bootloader',
        firmware: firmware,
        device: dev,
        update: function () {
          updateFirmware(scope, firmware);
        }
      });

      modal = $modal.open({
        templateUrl: 'views/modal/firmware.html',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });

      modal.opened.then(function () { disconnectFn = myDisconnect; });
      modal.result.finally(function () { disconnectFn = disconnect; });

      return modal.result;

      function myDisconnect(desc) {
        if (desc && desc.path !== dev.id) {
          disconnect(desc);
          return;
        }
        dev.disconnect();
        modal.close();
      }
    }

    //
    // utils
    //

    function updateFirmware(scope, firmware) {
      var deregister;

      scope.firmware = firmware;
      scope.state = 'update-downloading';

      firmwareService.download(firmware)
        .then(function (data) {
          deregister = $rootScope.$on('device.button', promptButton);
          scope.state = 'update-flashing';
          return scope.device.flash(data);
        })
        .then(
          function () {
            scope.state = 'update-success';
            deregister();
          },
          function (err) {
            scope.state = 'update-error';
            scope.error = err.message;
            deregister();
          }
        );

      function promptButton(event, dev, code) {
        if (code === 'ButtonRequest_FirmwareCheck')
          scope.state = 'update-check';
      }
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
