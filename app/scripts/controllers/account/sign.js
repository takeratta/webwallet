/*global angular*/

angular.module('webwalletApp').controller('AccountSignCtrl', function (
    utils,
    deviceList,
    $scope) {

    'use strict';

    var _suggestedAddressesCache = [];

    function getAddressPath(address) {
        var i, a, len;

        if (!_suggestedAddressesCache.length) {
            $scope.suggestAddresses();
        }

        len = _suggestedAddressesCache.length;
        for (i = 0; i < len; i = i + 1) {
            a = _suggestedAddressesCache[i];
            if (a.address === address) {
                if (a.path) {
                    return a.path;
                } else {
                    return a.acc.getOutPath(a.tx);
                }
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
        try {
            signature = utils.bytesToHex(utils.base64ToBytes(
                $scope.verify.signature
            ));
        } catch (e) {
            $scope.verify.res = {
                status: 'error',
                message: 'Failed to verify message: Invalid signature.'
            };
            return;
        }

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
        var UNUSED_COUNT = 10,
            multipleDevices = deviceList.count() > 1,
            addresses = [];

        deviceList.all().forEach(function (dev) {
            dev.accounts.forEach(function (acc) {
                var label;

                if (multipleDevices) {
                    label = [dev.label(), '/', acc.label()].join(' ');
                } else {
                    label = acc.label();
                }

                acc.usedAddresses()
                    .map(_suggestAddress)
                    .forEach(function (a) { addresses.push(a); });
                acc.unusedAddresses(UNUSED_COUNT)
                    .map(_suggestAddress)
                    .forEach(function (a) { addresses.push(a); });

                function _suggestAddress(address) {
                    return {
                        label: label + ': ' + address.address,
                        address: address.address,
                        tx: address.tx,
                        acc: acc,
                        source: 'Account'
                    };
                }
            });
        });

        _suggestedAddressesCache = addresses;
        return addresses;
    };

    $scope.suggestAddressesWithCache = function () {
        if (_suggestedAddressesCache.length) {
            return _suggestedAddressesCache;
        } else {
            return $scope.suggestAddresses();
        }
    };

    $scope.isAlertVisible = function (type) {
        return $scope[type] && $scope[type].res &&
            ($scope[type].res.status === 'success' ||
             $scope[type].res.status === 'error');
    };

    $scope.resetSign = function () {
        $scope.sign.signature = '';
        $scope.hideAlert('sign');
    };

    $scope.resetVerify = function () {
        $scope.hideAlert('verify');
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
