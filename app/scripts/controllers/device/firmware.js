/*global angular*/

angular.module('webwalletApp')
    .controller('FirmwareCtrl', function (
            $modal, $scope, $rootScope,
            firmwareService,
            TrezorDevice) {

        'use strict';

        var _modal = null,
            _state = null,
            STATE_INITIAL = 'initial',
            STATE_NORMAL = 'device-normal',
            STATE_BOOTLOADER = 'device-bootloader',
            STATE_UPDATE_DOWNLOADING = 'update-downloading',
            STATE_UPDATE_FLASHING = 'update-flashing',
            STATE_UPDATE_SUCCESS = 'update-success',
            STATE_UPDATE_ERROR = 'update-error',
            STATE_UPDATE_CHECK = 'update-check';

        // On device connect
        $scope.$on(firmwareService.EVENT_CONNECT, resetOutdatedFirmwareBar);

        // On device disconnect
        $scope.$on(firmwareService.EVENT_DISCONNECT, resetOutdatedFirmwareBar);
        $scope.$on(firmwareService.EVENT_DISCONNECT, closeFirmwareModal);

        // States
        $scope.$on(firmwareService.EVENT_BOOTLOADER, function () {
            setState(STATE_BOOTLOADER);
        });
        $scope.$on(firmwareService.EVENT_NORMAL, function () {
            setState(STATE_NORMAL);
        });

        // Modals
        $scope.$on(firmwareService.EVENT_CANDIDATE,
            function (e, params) {
                showCandidateFirmwareModal(
                    params.dev,
                    params.firmware
                );
            });
        $scope.$on(firmwareService.EVENT_OUTDATED,
            function (e, params) {
                showOutdatedFirmware(
                    params.dev,
                    params.firmware,
                    params.version
                );
            });

        function showOutdatedFirmware(dev, firmware, version) {
            if (firmware.required) {
                return showOutdatedFirmwareModal(dev, firmware, version);
            }
            return showOutdatedFirmwareBar(dev, firmware, version);
        }

        function showOutdatedFirmwareBar(dev, firmware, version) {
            $rootScope.optionalFirmware = {
                device: dev,
                firmware: firmware,
                version: version,
                update: function () {
                    showOutdatedFirmwareModal(dev, firmware, version);
                }
            };
        }

        function resetOutdatedFirmwareBar(e, devId) {
            if ($rootScope.optionalFirmware &&
                    $rootScope.optionalFirmware.device.id === devId &&
                    !firmwareService.isModalOpen()) {
                delete $rootScope.optionalFirmware;
            }
        }

        function showOutdatedFirmwareModal(dev, firmware, version) {
            _showFirmwareModal(dev, firmware, version, STATE_INITIAL);
        }

        function showCandidateFirmwareModal(dev, firmware) {
            _showFirmwareModal(dev, firmware, undefined, STATE_BOOTLOADER);
        }

        function _showFirmwareModal(dev, firmware, version, state) {
            var scope = angular.extend($rootScope.$new(), {
                    firmware: firmware,
                    version: version,
                    device: dev,
                    update: function () {
                        updateFirmware(scope, firmware);
                    }
                });

            setState(state, scope);

            _modal = $modal.open({
                templateUrl: 'views/modal/firmware.html',
                backdrop: 'static',
                keyboard: false,
                scope: scope
            });

            _modal.opened.then(function () {
                firmwareService.setModalOpen(true);
            });
            _modal.result.finally(function () {
                firmwareService.setModalOpen(false);
            });

            return _modal.result;
        }

        function updateFirmware(scope, firmware) {
            var deregister;

            scope.firmware = firmware;
            setState(STATE_UPDATE_DOWNLOADING, scope);

            firmwareService.download(firmware)
                .then(function (data) {
                    deregister = $rootScope.$on(
                        TrezorDevice.EVENT_PREFIX + TrezorDevice.EVENT_BUTTON,
                        promptButton
                    );
                    setState(STATE_UPDATE_FLASHING, scope);
                    return scope.device.flash(data);
                })
                .then(
                    function () {
                        setState(STATE_UPDATE_SUCCESS, scope);
                        deregister();
                    },
                    function (err) {
                        setState(STATE_UPDATE_ERROR, scope);
                        scope.error = err.message;
                        deregister();
                    }
                );

            function promptButton(e, dev, code) {
                if (code === TrezorDevice.REQ_BUTTON_FIRMWARE) {
                    setState(STATE_UPDATE_CHECK, scope);
                }
            }
        }

        /**
         * Close the firmware modal if the update is already finished or
         * if it hasn't started at all.
         */
        function closeFirmwareModal() {
            if (_state === STATE_UPDATE_SUCCESS ||
                    _state === STATE_UPDATE_ERROR ||
                    _state === STATE_INITIAL) {
                _modal.close();
                return;
            }
            setState(STATE_INITIAL);
        }

        function setState(state, scope) {
            _state = $scope.state = state;
            if (scope) {
                scope.state = state;
            }
        }
  });
