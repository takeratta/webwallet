/*global angular*/

/**
 * Device Controller
 */
angular.module('webwalletApp').controller('DeviceCtrl', function (
    $scope,
    $location,
    $routeParams,
    $document,
    flash,
    TrezorDevice,
    deviceList,
    modalOpener,
    forgetModalService,
    deviceService) {

    'use strict';

    var disconnectModal = null;

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
    $scope.$on(deviceService.EVENT_ASK_FORGET, forgetOnDisconnect);
    $scope.$on(deviceService.EVENT_ASK_DISCONNECT, askToDisconnectOnForget);
    $scope.$on(deviceService.EVENT_CLOSE_DISCONNECT, closeDisconnect);

    /**
     * When a initialized device is disconnected, ask the user if
     * he/she wants to forget it or remember. Empty devices are
     * forgotten right away.
     *
     * If the user chooses to forget the device, forget it immediately.
     *
     * If the user chooses to remember the device, keep the device and store
     * this answer to localStorage so that the next time the device is
     * disconnected it is automatically remembered without asking the user
     * again.
     *
     * @param {Object} e             Event object
     * @param {TrezorDevice} device  Device that was disconnected
     */
    function forgetOnDisconnect(e, device) {
        if (device.forgetOnDisconnect == null || device.isEmpty()) {
            deviceList.forget(device);
        } else {
            forgetModalService.showDisconnectedModal($scope, device,deviceList);
        }
    }

    /**
     * Ask the user to disconnect the device and then forget it when it's
     * disconnected.
     *
     * Passed `param` object has these mandatory properties:
     * - {TrezorDevice} `dev`: Device instance
     * - {Boolean} `requireDisconnect`: Is the user allowed to cancel the
     *      modal, or does he/she have to disconnect the device?
     *
     * @see  deviceService.forget()
     *
     * @param {Object} param  Parameters in format:
     *                        {dev: TrezorDevice,
     *                        requireDisconnect: Boolean}
     */
    function askToDisconnectOnForget(e, param) {
        promptDisconnect(param.requireDisconnect)
            .then(function () {
                deviceList.forget(param.dev, param.requireDisconnect);
            }, function () {
                deviceService.forgetRequestCancelled();
            });
    }

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
     * Ask the user to set the device label and then store filled value.
     *
     * If he/she fills in an empty value, the default label is used (read from
     * `TrezorDevice#DEFAULT_LABEL`).
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
     * Ask the user to disconnect the device.
     *
     * Returns a Promise which is resolved if the user disconnects the device
     * and failed if the user closes the modal dialog.
     *
     * @see  `askToDisconnectOnForget()`
     *
     * @param {Boolean} disableCancel  Forbid closing/cancelling the modal
     *
     * @return {Promise}
     */
    function promptDisconnect(disableCancel) {

        var opened = modalOpener.openModal($scope,'disconnect',"sm",{disableCancel:disableCancel});

        disconnectModal = opened.modal;

        return opened.result;
    }

    /**
     * Close the modal dialog asking the user to disconnect the device.
     */
    function closeDisconnect() {
        if (disconnectModal) {
            disconnectModal.close();
        }
    }


    /**
     * Ask the user to set the device label.
     */
    function promptLabel() {

        return modalOpener.openModal($scope, 'label','sm', {
            label: $scope.device.features.label || ''
        }).result;
    }

    /**
     * Ask the user to set the device PIN.
     *
     * Bind keypress events that allow the user to control the number
     * buttons (dial) using a keyboard.
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

        if (dev.id !== $scope.device.id)
            return;

        var modal=modalOpener.openModal($scope, 'pin','sm',{
            pin: '',
            type: type
        },true);


        modal.scope.addPin = function (num) {
            modal.scope.pin = modal.scope.pin + num.toString();
            /*
             * When the user clicks a number button, the button gets focus.
             * Then when the user presses Enter it triggers another click on the
             * button instead of submiting the whole Pin Modal.  Therefore we need
             * to focus the document after each click on a number button.
             */
            $document.focus();
        };

        modal.scope.delPin = function () {
            modal.scope.pin = modal.scope.pin.slice(0, -1);
        };

        modal.scope.isPinSet = function () {
            return modal.scope.pin.length > 0;
        };


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
                modal.scope.delPin();
                modal.scope.$digest();
                return false;
            } else if (k === 13) { // Enter
                modal.modal.close(modal.scope.pin);
                return false;
            } else if (_isNumericKey(k)) {
                num = _getNumberFromKey(k);
                modal.scope.addPin(String.fromCharCode(num));
                modal.scope.$digest();
            }
        }

        function _isNumericKey(k) {
            return (k >= 49 && k <= 57) || (k >= 97 && k <= 105);
        }

        function _getNumberFromKey(k) {
            return (k >= 97) ? (k - (97 - 49)) : k;
        }
    }

    function promptPassphrase(e, dev, callback) {

        if (dev.id !== $scope.device.id) {
            return;
        }

        var modal=modalOpener.openModal($scope, 'passphrase', 'sm', {
            check: !$scope.device.hasSavedPassphrase(),
            checkCorrect: false,
            values: {
                passphrase: '',
                passphraseCheck: ''
            },
            installHandler: installSubmitHandlers
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

        modal.scope.$watch('values.passphrase', checkPassphrase);
        modal.scope.$watch('values.passphraseCheck', checkPassphrase);

        function checkPassphrase() {
            var v = modal.scope.values;
            if (!modal.scope.check) {
                modal.scope.checkCorrect = true;
                return;
            }
            modal.scope.checkCorrect =
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
                if (e.keyCode === 13 && modal.scope.checkCorrect) {
                    submitModal();
                }
            }, true);

            function submitModal () {
                modal.modal.close(modal.scope.values.passphrase);
                return false;
            }
        }
    }

    function handleButton(event, dev, code) {
        if (dev.id !== $scope.device.id) {
            return;
        }

        if (code !== 'ButtonRequest_ConfirmWord') {
            promptButton(code);
        }
    }

    function promptButton(code) {

        var modal = modalOpener.openModal($scope, 'button', buttonModalSize(code), {
            code:code
        });
        modal.modal.opened.then(function () {
            modal.scope.$emit('modal.button.show', code);
        });

        $scope.device.once(TrezorDevice.EVENT_RECEIVE, function () {
            modal.modal.close();
        });
        $scope.device.once(TrezorDevice.EVENT_ERROR, function () {
            modal.modal.close();
        });
    }


    function buttonModalSize(code) {
        if (code === 'ButtonRequest_Address') {
            return 'md';
        } else {
            return 'lg';
        }
    }
});
