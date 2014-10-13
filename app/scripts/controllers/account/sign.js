/*global angular*/

angular.module('webwalletApp')
    .controller('AccountSignCtrl', function (utils, trezorService,
        $scope) {

        'use strict';

        var _addressPaths = {};

        // TODO Implement proper path calculation.
        function getAddressPath(address) {
            return _addressPaths[address];
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
            var currentDevice = $scope.device,
                currentAccount = $scope.account,
                suggestedAccounts = [],
                multipleDevices = trezorService.devices.length > 1;

            trezorService.devices.forEach(function (dev) {
                dev.accounts.forEach(function (acc) {
                    if (dev.id === currentDevice.id &&
                            acc.id === currentAccount.id) {
                        return;
                    }
                    suggestedAccounts.push([dev, acc]);
                });
            });

            return suggestedAccounts.map(function (item) {
                var dev = item[0],
                    acc = item[1],
                    address = acc.address(0),
                    label;

                if (multipleDevices) {
                    label = dev.label() + ' / ' + acc.label();
                } else {
                    label = acc.label();
                }

                _addressPaths[address.address] = address.path; // TODO Implement proper path calculation.

                return {
                    label: label + ': ' + address.address,
                    address: address.address,
                    path: address.path,
                    source: 'Accounts',
                    toString: function () {
                        return this.address;
                    }
                };
            });
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
