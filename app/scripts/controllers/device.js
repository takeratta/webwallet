'use strict';

angular.module('webwalletApp')
  .controller('DeviceCtrl', function (trezorService, bip39, flash,
      $q, $modal, $scope, $location, $routeParams) {
    $scope.device = trezorService.get($routeParams.deviceId);
    if (!$scope.device)
      return $location.path('/');

    $scope.forgetDevice = function () {
      trezorService.forget($scope.device);
      $location.path('/');
    };

    $scope.wipe = function (dev) {
      dev.wipe()
        .then(
          function (res) { $scope.forgetDevice(); },
          function (err) { flash.error(err.message || 'Wiping failed'); }
        );
    };

    $scope.settings = {
      pin_protection: true,
      language: 'english'
    };

    $scope.setup = function (dev, settings) {
      if (settings.label)
        settings.label = settings.label.trim();
      dev.reset(settings)
        .then(
          function (res) { $location.path('/device/' + dev.id); },
          function (err) { flash.error(err.message || 'Setup failed'); }
        );
    };

    $scope.load = function (dev, settings) {
      if (settings.label)
        settings.label = settings.label.trim();
      settings.payload = settings.payload.trim();
      dev.load(settings)
        .then(
          function (res) { $location.path('/device/' + dev.id); },
          function (err) { flash.error(err.message || 'Importing failed'); }
        );
    };

    $scope.seedWord = '';
    $scope.seedWords = [];
    $scope.seedWordlist = bip39.english;

    $scope.startsWith = function(state, viewValue) {
        return state.substr(0, viewValue.length).toLowerCase() == viewValue.toLowerCase();
    }

    $scope.recover = function (dev, settings) {
      if (settings.label)
        settings.label = settings.label.trim();
      $scope.recovering = true;
      dev.recover(settings)
        .then(
          function (res) { $location.path('/device/' + dev.id); },
          function (err) { flash.error(err.message || 'Recovery failed'); }
        );
    };

    $scope.recoverWord = function () {
      $scope.seedWords.push($scope.seedWord);
      $scope.wordCallback($scope.seedWord);
      $scope.seedWord = '';
    };

    $scope.ratePin = function (pin) {
      var strength = $scope.device.ratePin(pin);

      if (strength < 3000) return 'weak';
      if (strength < 60000) return 'fine';
      if (strength < 360000) return 'strong';
      return 'ultimate';
    };

    $scope.changePin = function (dev) {
      dev.changePin().then(
        function (res) { flash.success('PIN was successfully changed'); },
        function (err) { flash.error(err.message || 'PIN change failed'); }
      );
    };

    $scope.changeLabel = function (dev) {
      promptLabel(dev)
        .then(function (label) { return dev.changeLabel(label); })
        .then(
          function (res) { flash.success('Label was successfully changed'); },
          function (err) {
            if (err) // closing the label modal triggers rejection without error
              flash.error(err.message || 'Failed to change the device label');
          }
        );
    };

    function promptLabel(dev) {
      var dfd = $q.defer(),
          scope = $scope.$new(),
          modal;

      scope.label = dev.features.label;
      scope.callback = function (label) {
        if (label != null)
          dfd.resolve(label.trim());
        else
          dfd.reject();
      };
      modal = $modal({
        template: 'views/modal.label.html',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });
      modal.$promise.then(null, dfd.reject);

      return dfd.promise;
    }

  });
