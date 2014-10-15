/*global angular*/

angular.module('webwalletApp')
    .controller('AccountSignCtrl', function (utils, trezorService,
        $scope) {

        'use strict';

        var _usedAddressesCache = [];

        function getAddressPath(address) {
            var i,
                len,
                usedAddress;

            if (!_usedAddressesCache) {
                $scope.suggestAddresses();
            }

            len = _usedAddressesCache.length;
            for (i = 0; i < len; i = i + 1) {
                usedAddress = _usedAddressesCache[i];
                if (usedAddress.address === address) {
                    return usedAddress.acc.getOutPath(usedAddress.tx);
                }
            }
            return null;
        }

        $scope.sign = function () {
            var message,
                address_n,
                coin;

            message = utils.bytesToHex(utils.stringToBytes(
                $scope.sign.message
            ));
            address_n = getAddressPath($scope.sign.address);
            coin = $scope.device.defaultCoin();

            $scope.device.signMessage(address_n, message, coin).then(
                function (res) {
                    $scope.sign.signature =
                        utils.bytesToBase64(utils.hexToBytes(
                            res.message.signature
                        ));
                },
                function (err) {
                    $scope.sign.res = {
                        status: 'error',
                        message: [
                            'Failed to sign message: ',
                            err.message,
                            '.'
                        ].join('')
                    };
                }
            );
        };

        $scope.verify = function () {
            var message,
                address,
                signature;

            message = utils.bytesToHex(utils.stringToBytes(
                $scope.verify.message
            ));
            address = $scope.verify.address;
            signature = utils.bytesToHex(utils.base64ToBytes(
                $scope.verify.signature
            ));

            $scope.device.verifyMessage(address, signature, message).then(
                function () {
                    $scope.verify.res = {
                        status: 'success',
                        message: 'Message verified.'
                    };
                },
                function (err) {
                    $scope.verify.res = {
                        status: 'error',
                        message: [
                            'Failed to verify message: ',
                            err.message,
                            '.'
                        ].join('')
                    };
                }
            );
        };

        $scope.suggestAddresses = function () {
            var multipleDevices = trezorService.devices.length > 1,
                usedAddresses = [];

            trezorService.devices.forEach(function (dev) {
                dev.accounts.forEach(function (acc) {
                    var label;

                    if (multipleDevices) {
                        label = [dev.label(), '/', acc.label()].join(' ');
                    } else {
                        label = acc.label();
                    }

                    acc.usedAddresses().forEach(function (address) {
                        usedAddresses.push({
                            label: label + ': ' + address.address,
                            address: address.address,
                            tx: address.tx,
                            acc: acc,
                            source: 'Account'
                        });
                    });
                });
            });

            _usedAddressesCache = usedAddresses;
            return usedAddresses;
        };

        $scope.isAlertVisible = function (type) {
            return $scope[type] && $scope[type].res &&
                ($scope[type].res.status === 'success' ||
                $scope[type].res.status === 'error');
        };

        $scope.hideAlert = function (type) {
            if ($scope[type] && $scope[type].res) {
                $scope[type].res.status = null;
            }
        };

        $scope.getAlertClass = function (type) {
            if ($scope[type] && $scope[type].res) {
                if ($scope[type].res.status === 'error') {
                    return 'alert-danger';
                }
                if ($scope[type].res.status === 'success') {
                    return 'alert-success';
                }
            }
        };
    });
