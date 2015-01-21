/*global angular*/

angular.module('webwalletApp').controller('AccountSignCtrl', function (
    utils,
//    deviceList,
    $scope) {

    'use strict';

    var _suggestedAddressesCache = [];

    function getAddressPath(address) {
        var i,
            l,
            addresses = $scope.suggestAddressesWithCache(),
            a;

        for (i = 0, l = addresses.length; i < l; i = i + 1) {
            a = addresses[i];
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

    $scope.signSaveAddress = function () {
        if (!$scope.sign.address) {
            $scope.sign.address_n = null;
            $scope.sign.address_status = null;
            return false;
        }
        $scope.sign.address_n = getAddressPath($scope.sign.address);
        if (!$scope.sign.address_n) {
            $scope.sign.address_status = 'error';
            return false;
        }
        $scope.sign.address_status = 'success';
        return true;
    };

    $scope.sign = function () {
        var message,
            address_n,
            coin;

        message = utils.bytesToHex(utils.stringToBytes(
            $scope.sign.message
        ));
        address_n = $scope.sign.address_n;
        coin = $scope.device.defaultCoin();

        $scope.device.signMessage(address_n, message, coin).then(
            function (res) {
                $scope.sign.res = null;
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

        if (!address) {
            $scope.verify.res = {
                status: 'error',
                message: [
                    'Please fill the address.'
                ].join('')
            };
            return;
        }

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
        var UNUSED_COUNT = 20,
            addresses = [];

        $scope.device.accounts.forEach(function (acc) {
            acc.usedAddresses()

                .map(_suggestAddress)
                .forEach(function (a) { addresses.push(a); });
            acc.unusedAddresses(UNUSED_COUNT)
                .map(_suggestAddress)
                .forEach(function (a) { addresses.push(a); });

            function _suggestAddress(address) {
                return {
                    address: address.address,
                    path: address.path,
                    acc: acc
                };
            }
        });

        return addresses;
    };

    $scope.suggestAddressesWithCache = function () {
        if (!_suggestedAddressesCache.length) {
            _suggestedAddressesCache = $scope.suggestAddresses();
        }
        return _suggestedAddressesCache;
    };

    $scope.resetSign = function () {
        $scope.sign.signature = '';
        $scope.sign.res = null;
    };

    $scope.resetVerify = function () {
        $scope.verify.res = null;
    };

    $scope.isSignInputValid = function () {
        return $scope.sign.message && $scope.sign.address_n;
    };

    $scope.hasErrorMessage = function (type) {
        return $scope[type] && $scope[type].res &&
            $scope[type].res.message;
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

    $scope.getSignAddressClass = function () {
        if ($scope.sign.address_status === 'error') {
            return 'has-error';
        }
        if ($scope.sign.address_status === 'success') {
            return 'has-success';
        }
    };

    $scope.isUnicode = function(s) {
        if (typeof s === "undefined") {
            return false
        }
        return s.split("").some(function(char) { return char.charCodeAt(0) > 127 });
    }

    $scope.nonAsciiCharacter = function(s) {
        if (typeof s === "undefined") {
            return "";
        }

        var arr= s.split("").filter(function(char) { return char.charCodeAt(0) > 127 });
        if (arr.length==0) {
            return "";
        }
        return arr[0]
    }

});
