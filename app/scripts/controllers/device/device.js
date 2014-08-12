/*global angular*/

angular.module('webwalletApp')
  .controller('DeviceCtrl', function (
      trezorService, flash,
      $modal, $scope, $location, $routeParams) {

    'use strict';

    $scope.device = trezorService.get($routeParams.deviceId);
    if (!$scope.device) {
      $location.path('/');
      return;
    }

    $scope.$on('device.pin', promptPin);
    $scope.$on('device.button', promptButton);
    $scope.$on('device.passphrase', promptPassphrase);

    $scope.forgetDevice = function () {
      if (!$scope.device.isConnected()) {
        _forgetDevice($scope.device);
      }

      promptForget()
        .then(function () {
          _forgetDevice($scope.device);
        });
    };

    function _forgetDevice(device) {
      trezorService.forget(device);
      $location.path('/');
      return;
    }

    $scope.changePin = function () {
      $scope.device.changePin().then(
        function () { flash.success('PIN was successfully changed'); },
        function (err) { flash.error(err.message || 'PIN change failed'); }
      );
    };

    $scope.changeLabel = function () {
      promptLabel()
        .then(function (label) {
          return $scope.device.changeLabel(label);
        })
        .then(
          function () { flash.success('Label was successfully changed'); },
          function (err) {
            if (err) // closing the label modal triggers rejection without error
              flash.error(err.message || 'Failed to change the device label');
          }
        );
    };

    function promptForget() {
      var scope, modal;

      modal = $modal.open({
        templateUrl: 'views/modal/forget.html',
        size: 'sm',
        windowClass: '',
        backdrop: 'static',
        keyboard: false,
        scope: $scope,
      });
      modal.opened.then(function () { $scope.$emit('modal.forget.show'); });
      modal.result.finally(function () { $scope.$emit('modal.forget.hide'); });

      $scope.$on('device.disconnect', function (event, dev) {
        if ($scope.device.id === dev.id) {
          modal.close();
        }
      });

      return modal.result;
    }

    function promptLabel() {
      var scope, modal;

      scope = angular.extend($scope.$new(), {
        label: $scope.device.features.label
      });

      modal = $modal.open({
        templateUrl: 'views/modal/label.html',
        size: 'sm',
        windowClass: 'labelmodal',
        backdrop: 'static',
        keyboard: false,
        scope: scope,
      });
      modal.opened.then(function () { scope.$emit('modal.label.show'); });
      modal.result.finally(function () { scope.$emit('modal.label.hide'); });

      return modal.result;
    }

    function promptPin(event, dev, type, callback) {
      var scope, modal;

      if (dev.id !== $scope.device.id)
        return;

      scope = angular.extend($scope.$new(), {
        pin: '',
        type: type
      });

      modal = $modal.open({
        templateUrl: 'views/modal/pin.html',
        size: 'sm',
        windowClass: 'pinmodal',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });
      modal.opened.then(function () { scope.$emit('modal.pin.show', type); });
      modal.result.finally(function () { scope.$emit('modal.pin.hide'); });

      modal.result.then(
        function (res) { callback(null, res); },
        function (err) { callback(err); }
      );
    }

    function promptPassphrase(event, dev, callback) {
      var scope, modal;

      if (dev.id !== $scope.device.id)
        return;

      scope = angular.extend($scope.$new(), {
        check: !$scope.device.hasSavedPassphrase(),
        passphrase: '',
        passphraseCheck: '',
        installHandler: installSubmitHandlers
      });

      modal = $modal.open({
        templateUrl: 'views/modal/passphrase.html',
        size: 'sm',
        windowClass: 'passphrasemodal',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });
      modal.opened.then(function () { scope.$emit('modal.passphrase.show'); });
      modal.result.finally(function () { scope.$emit('modal.passphrase.hide'); });

      modal.result.then(
        function (res) {
          if (!$scope.device.checkPassphraseAndSave(res))
            callback(new Error('Invalid passphrase'));
          else
            callback(null, res);
        },
        function (err) { callback(err); }
      );

      function installSubmitHandlers() {
        var submit = document.getElementById('passphrase-submit');
        var form = document.getElementById('passphrase-form');

        submit.addEventListener('submit', submitModal, false);
        submit.addEventListener('click', submitModal, false);
        form.addEventListener('submit', submitModal, false);
        form.addEventListener('keypress', function (e) {
          if (e.keyCode === 13) submitModal();
        }, true);
      }

      function submitModal() {
        var ppScope = scope.$$childHead.$$childHead.$$nextSibling; // sad panda :(
        modal.close(ppScope.passphrase);
        return false;
      }
    }

    function promptButton(event, dev, code) {
      var scope, modal;

      if (dev.id !== $scope.device.id)
        return;

      scope = angular.extend($scope.$new(), {
        code: code
      });

      modal = $modal.open({
        templateUrl: 'views/modal/button.html',
        windowClass: 'buttonmodal',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });
      modal.opened.then(function () { scope.$emit('modal.button.show', code); });
      modal.result.finally(function () { scope.$emit('modal.button.hide'); });

      $scope.device.once('receive', function () { modal.close(); });
      $scope.device.once('error', function () { modal.close(); });
    }

  });
