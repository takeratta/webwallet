/*global angular*/

/**
 * Device Controller
 */
angular.module('webwalletApp')
  .controller('DeviceCtrl', function (
            $modal, $scope, $location, $routeParams, $document, $q,
            flash,
            TrezorDevice, deviceList,
            deviceService) {

    'use strict';

        // Get current device or go to homepage.
        $scope.device = deviceList.get($routeParams.deviceId);
    if (!$scope.device) {
      $location.path('/');
      return;
    }

        // Handle device events -- buttons and disconnect.
        $scope.$on(TrezorDevice.EVENT_PREFIX + TrezorDevice.EVENT_PIN,
            promptPin);
        $scope.$on(TrezorDevice.EVENT_PREFIX + TrezorDevice.EVENT_BUTTON,
            handleButton);
        $scope.$on(TrezorDevice.EVENT_PREFIX + TrezorDevice.EVENT_PASSPHRASE,
            promptPassphrase);
        $scope.$on(deviceService.EVENT_DISCONNECT, forgetOnDisconnect);
        $scope.$on(deviceService.EVENT_FORGET_MODAL, askToDisconnectOnForget);

    /**
         * When a device is disconnected, ask the user if he/she wants to
         * forget it.
     *
         * Read from the localStorage the setting which says whether the user
         * wants to forget devices whenever they are disconnected.
     * - If the setting says yes, then forget the device.
     * - If the setting says no, then don't do anything.
         * - If the setting isn't set at all, ask the user how would he/she
         * like the app to behave using a modal dialog.  User's answer is
         * stored to localStorage for all devices.
     *
         * If the Forget modal is already shown, close it and forget the device
         * immediately.
     *
         * @param {Object} e             Event object
         * @param {TrezorDevice} device  Device that was disconnected
     */
        function forgetOnDisconnect(e, device) {
            if (deviceService.isForgetInProgress()) {
                if ($scope.device.id === device.id &&
                        deviceService.getForgetModal()) {
                    deviceService.getForgetModal().close();
                    deviceList.forget($scope.device);
                    deviceService.setForgetInProgress(false);
        }
        return;
      }
            if (device.forgetOnDisconnect === null ||
                    device.forgetOnDisconnect === undefined) {
        promptDisconnect()
          .then(function () {
                        device.forgetOnDisconnect = true;
                        deviceList.forget(device);
          }, function () {
                        device.forgetOnDisconnect = false;
          });
            } else if (device.forgetOnDisconnect) {
                deviceList.forget(device);
      }
    }

    /**
         * Ask the user to disconnect the device before it can be forgotten.
         *
         * Communicate with deviceService using the `forgetInProgress` flag.
     *
         * Passed `param` object has these mandatory properties:
         * - {TrezorDevice} `dev`: Device instance
         * - {Boolean} `requireDisconnect`: Can the user allowed to cancel the
         *      modal, or does he/she have to disconnect the device?
     *
         * @see  deviceService.forget()
         *
         * @param {Object} param  Parameters in format:
         *                        {dev: TrezorDevice,
         *                        requireDisconnect: Boolean}
     */
        function askToDisconnectOnForget(e, param) {
            promptForget(param.requireDisconnect)
        .then(function () {
                    /*
                     * TODO Explain this
                     */
                    if (deviceService.isForgetInProgress()) {
                    deviceService.setForgetInProgress(false);
                        deviceList.forget();
                    }
        }, function () {
                    deviceService.setForgetInProgress(false);
        });
    };

    /**
     * Change device PIN
     *
     * Ask the user to set the PIN and then save the value.
     */
    $scope.changePin = function () {
      $scope.device.changePin().then(
        function () {
          flash.success('PIN was successfully changed');
        },
        function (err) {
          flash.error(err.message || 'PIN change failed');
        }
      );
    };

    /**
     * Change device label
     *
     * Ask the user to set the label.  If he/she fills in an empty value, the
     * default label is used.  The default label is read from
     * `TrezorDevice#DEFAULT_LABEL`.
     */
    $scope.changeLabel = function () {
      promptLabel()
        .then(function (label) {
          label = label.trim() || $scope.device.DEFAULT_LABEL;
          return $scope.device.changeLabel(label);
        })
        .then(
          function () {
            flash.success('Label was successfully changed');
          },
          function (err) {
                        /*
                         * Show error message only if there actually was an
                         * error.  Closing the label modal triggers rejection
                         * as well, but without an error.
                         */
            if (err) {
                            flash.error(err.message ||
                                'Failed to change the device label');
            }
          }
        );
    };

    /**
         * Forget the device
         */
        $scope.forget = function () {
            deviceList.forget($scope.device);
        };

        /**
     * Prompt forget
     *
         * Ask the user to disconnect the device using a modal dialog.  If the
         * user then disconnects the device, the Promise -- which this function
         * returns -- is resolved, if the user closes the modal dialog or hits
         * Cancel, the Promise is failed.
     *
     * @param {Boolean} disableCancel Forbid closing/cancelling the modal
     *
     * @return {Promise}
     */
    function promptForget(disableCancel) {
            var scope,
                modal;

      scope = angular.extend($scope.$new(), {
        disableCancel: disableCancel
      });

      modal = $modal.open({
        templateUrl: 'views/modal/forget.html',
        size: 'sm',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });

            deviceService.setForgetModal(modal);

      modal.opened.then(function () {
        $scope.$emit('modal.forget.show');
      });
      modal.result.finally(function () {
                deviceService.setForgetModal(null);
        $scope.$emit('modal.forget.hide');
      });

      return modal.result;
    }

    /**
     * Prompt label
     *
     * Ask the user to set the device label using a modal dialog.
     */
    function promptLabel() {
            var scope,
                modal;

      scope = angular.extend($scope.$new(), {
        label: $scope.device.features.label || ''
      });

      modal = $modal.open({
        templateUrl: 'views/modal/label.html',
        size: 'sm',
        windowClass: 'labelmodal',
        backdrop: 'static',
        keyboard: false,
                scope: scope,
            });
            modal.opened.then(function () {
                scope.$emit('modal.label.show');
            });
            modal.result.finally(function () {
                scope.$emit('modal.label.hide');
      });

      return modal.result;
    }

    /**
     * Prompt PIN
     *
     * Ask the user to set the device PIN using a modal dialog.  Bind keypress
     * events that allow the user to control the number buttons (dial) using
     * a keyboard.
     *
     * @param {Event} event        Event object
     * @param {TrezorDevice} dev   Device
     * @param {String} type        Action type.  Possible values:
     *                                 - 'PinMatrixRequestType_Current'
     *                                 - 'PinMatrixRequestType_NewFirst'
     *                                 - 'PinMatrixRequestType_NewSecond'
     * @param {Function} callback  Called as `callback(err, res)`
     */
        function promptPin(e, dev, type, callback) {
      var scope, modal;

      if (dev.id !== $scope.device.id)
        return;

      scope = angular.extend($scope.$new(), {
        pin: '',
        type: type
      });

      scope.addPin = function (num) {
        scope.pin = scope.pin + num.toString();
        /*
         * When the user clicks a number button, the button gets focus.
         * Then when the user presses Enter it triggers another click on the
         * button instead of submiting the whole Pin Modal.  Therefore we need
         * to focus the document after each click on a number button.
         */
        $document.focus();
      };

      scope.delPin = function () {
        scope.pin = scope.pin.slice(0, -1);
      };

      scope.isPinSet = function () {
        return scope.pin.length > 0;
      };

      modal = $modal.open({
        templateUrl: 'views/modal/pin.html',
        size: 'sm',
        windowClass: 'pinmodal',
        backdrop: 'static',
        keyboard: false,
        scope: scope
      });
            modal.opened.then(function () {
                scope.$emit('modal.pin.show', type);
            });
            modal.result.finally(function () {
                scope.$emit('modal.pin.hide');
            });

      $document.on('keydown', _pinKeydownHandler);
      $document.focus();

      modal.result.then(
        function (res) {
          $document.off('keydown', _pinKeydownHandler);
          callback(null, res);
        },
        function (err) {
          $document.off('keydown', _pinKeydownHandler);
          callback(err);
        }
      );

      function _pinKeydownHandler(e) {
                var k = e.which,
                    num;
        if (k === 8) { // Backspace
          scope.delPin();
          scope.$digest();
          return false;
        } else if (k === 13) { // Enter
          modal.close(scope.pin);
          return false;
        } else if (_isNumericKey(k)) {
          num = _getNumberFromKey(k);
          scope.addPin(String.fromCharCode(num));
          scope.$digest();
        }
      }

      function _isNumericKey(k) {
        return (k >= 49 && k <= 57) || (k >= 97 && k <= 105);
      }

      function _getNumberFromKey(k) {
        return (k >= 97) ? (k - (97 - 49)) : k;
      }
    }

    /**
     * Prompt disconnect
     *
         * Ask the user if he/she wants to forget or remember devices whenever
         * they are disconnected.  User's answer is stored to localStorage for
         * all devices.  The user is never asked again.
     *
     * Returns a Promise that is resolved if the user wants to forget the
     * device, and failed if the user wants to remember the device.
     *
     * @return {Promise}
     */
    function promptDisconnect() {
      var modal = $modal.open({
        templateUrl: 'views/modal/disconnect.html',
        backdrop: 'static',
        keyboard: false
      });
      modal.opened.then(function () {
        $scope.$emit('modal.disconnect.show');
      });
      modal.result.finally(function () {
        $scope.$emit('modal.disconnect.hide');
      });

      return modal.result;
    }

        function promptPassphrase(e, dev, callback) {
            var scope,
                modal;

            if (dev.id !== $scope.device.id) {
        return;
            }

      scope = angular.extend($scope.$new(), {
        check: !$scope.device.hasSavedPassphrase(),
        checkCorrect: false,
        values: {
          passphrase: '',
          passphraseCheck: ''
        },
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
            modal.opened.then(function () {
                scope.$emit('modal.passphrase.show');
            });
            modal.result.finally(function () {
                scope.$emit('modal.passphrase.hide');
            });

      modal.result.then(
        function (res) {
                    if (!$scope.device.checkPassphraseAndSave(res)) {
            callback(new Error('Invalid passphrase'));
                    } else {
            callback(null, res);
                    }
        },
                function (err) {
                    callback(err);
                }
      );

      scope.$watch('values.passphrase', checkPassphrase);
      scope.$watch('values.passphraseCheck', checkPassphrase);

      function checkPassphrase() {
        var v = scope.values;
        if (!scope.check) {
          scope.checkCorrect = true;
          return;
        }
        scope.checkCorrect =
          (v.passphrase === v.passphraseCheck) &&
          (v.passphrase.length <= 50);
      }

      function installSubmitHandlers() {
        var submit = document.getElementById('passphrase-submit'),
            form = document.getElementById('passphrase-form');

        submit.addEventListener('submit', submitModal, false);
        submit.addEventListener('click', submitModal, false);
        form.addEventListener('submit', submitModal, false);
        form.addEventListener('keypress', function (e) {
            if (e.keyCode === 13 && scope.checkCorrect) {
                submitModal();
            }
        }, true);

        function submitModal () {
            modal.close(scope.values.passphrase);
            return false;
        }
      }
    }

    function handleButton(e, dev, code) {
      if (dev.id !== $scope.device.id) {
        return;
      }

      if (code === 'ButtonRequest_FeeOverThreshold') {
        promptButton(code);
      } else if (code === 'ButtonRequest_ConfirmOutput') {
        promptButton(code);
      } else if (code === 'ButtonRequest_SignTx') {
        promptButton(code);
      } else if (code === 'ButtonRequest_WipeDevice') {
        promptButton(code);
      } else if (code !== 'ButtonRequest_ConfirmWord') {
        promptButton(code);
      }
    }

    function promptButton(code) {
      var scope,
          modal;

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
      modal.opened.then(function () {
        scope.$emit('modal.button.show', code);
      });
      modal.result.finally(function () {
        scope.$emit('modal.button.hide');
      });

            $scope.device.once(TrezorDevice.EVENT_RECEIVE, function () {
        modal.close();
      });
            $scope.device.once(TrezorDevice.EVENT_ERROR, function () {
        modal.close();
      });
    }
  });
