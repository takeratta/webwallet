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
            var multipleDevices = trezorService.devices.length > 1,
                suggestedAddresses = [];

            trezorService.devices.forEach(function (dev) {
                dev.accounts.forEach(function (acc) {
                    var label,
                        accAddresses,
                        addrHash;

                    if (multipleDevices) {
                        label = dev.label() + ' / ' + acc.label();
                    } else {
                        label = acc.label();
                    }

                    accAddresses = getUsedAddresses(acc);
                    for (addrHash in accAddresses) {
                        if (accAddresses.hasOwnProperty(addrHash)) {
                            suggestedAddresses.push({
                                label: label + ': ' + addrHash,
                                address: addrHash,
                                path: accAddresses[addrHash],
                                source: 'Accounts',
                                // TODO Is this toString working?
                                toString: function () {
                                    return this.address;
                                }
                            });
                        }
                    }
                });
            });

            return suggestedAddresses;
        };

        /**
         * Get all used addresses on passed account
         *
         * @param {TrezorAccount} account  Account
         */
        function getUsedAddresses(account) {
            var i,
                j,
                lenTxs,
                tx,
                lenOuts,
                out,
                addrHash,
                addrType,
                usedAddrs = {};

            lenTxs = account.transactions.length;
            for (i = 0; i < lenTxs; i = i + 1) {
                tx = account.transactions[i];

                lenOuts = tx.outs.length;
                for (j = 0; j < lenOuts; j = j + 1) {
                    out = tx.outs[j];
                    if (!out.path) {
                        continue;
                    }
                    try {
                        switch (out.script.getOutType()) {
                            case 'Scripthash':
                                addrType = account._wallet.scriptHashVersion;
                            default:
                                addrType = account._wallet.addressVersion;
                        }
                        addrHash = utils.address2str(
                            out.script.simpleOutPubKeyHash(),
                            addrType
                        );
                    } catch (e) {
                        // non-standard output, skipping
                        continue;
                    }
                    usedAddrs[addrHash] = usedAddrs[addrHash] || out.path;
                }
            }

            return usedAddrs;
        }

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
