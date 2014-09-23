/*global angular*/

angular.module('webwalletApp')
    .controller('DeviceWipeCtrl', function (
            flash, $scope,
            deviceList, deviceService) {

        'use strict';

        /**
         * Wipe device
         *
         * Wipe the device and then ask the user if he/she wants to forget it
         * using the same modal that is shown when the user clicks the
         * 'Forget device' link.
         *
         * When a device is wiped on Windows or Linux systems, the device ID
         * changes, therefore the `device.connect` and then the
         * `device.disconnect` events are fired.  That means we have to take
         * care of three problems:
         *
         * (1) We need to make sure that these events don't trigger the opening
         * of the Disconnect modal (see `DeviceCtrl.handleDisconnect()`).  To
         * achieve such a behaviour, we set the
         * `deviceService.forgetInProgress` flag.  The Disconnect modal knows,
         * that it should not open, if this flag is set.
         *
         * (2) We need to make sure that these events are fired before we open
         * the Forget modal.  Otherwise the modal would close the moment the
         * events get fired.  To achieve such a behaviour, we check that the
         * device ID changed.  If it didn't, then we wait for the events to
         * fire.
         *
         * (3) On OS X, the events won't fire at all, so we need to make sure
         * user disconnects the device.
         *
         * @see  DeviceCtrl.handleDisconnect()
         */
        $scope.wipeDevice = function () {
            var oldDevId = $scope.device.id;

            deviceService.setForgetInProgress(true);

            $scope.device.wipe().then(
                function () {
                    if (window.navigator.userAgent.match(/Mac/)) {
                        // User needs to disconnect the device.
                        $scope.forgetDevice(true);
                    } else if (!deviceList.get(oldDevId).isConnected()) {
                        $scope.forgetDevice();
                    } else {
                        var off = $scope.$on(
                                deviceService.EVENT_DISCONNECT,
                                function (e, devId) {
                                    if (devId === oldDevId) {
                                        $scope.forgetDevice();
                                        off();
                                    }
                                }
                            );
                    }
                },
                function (err) {
                    deviceService.setForgetInProgress(false);
                    flash.error(err.message || 'Wiping failed');
                }
            );
        };

    });
