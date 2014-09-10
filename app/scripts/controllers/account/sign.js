/*global angular*/

angular.module('webwalletApp')
  .controller('AccountSignCtrl', function (
    flash, storage, utils, config, trezorService,
    $filter, $scope, $rootScope, $routeParams) {
    'use strict';


        $scope.activeAddress = null;
        $scope.addresses = [];
        $scope.lookAhead = 20;
        $scope.signedMsg = '';

        $scope.more = function () {
            var index = $scope.addresses.length,
                address = $scope.account.address(index);
            $scope.addresses[index] = address;
        };

        $scope.more();

        $scope.signWith = function (address) {
            var message = document.getElementById('message').value;
            message = utils.bytesToHex(utils.stringToBytes(message));
            var coin = $scope.device.defaultCoin();
            $scope.device.signMessage(address.path, message, coin).then(
                function (res) {
                    $scope.signature = utils.bytesToBase64(utils.hexToBytes(res.message.signature));
                },
                function (err) {
                    flash.error([
                        'Failed to sign message: ',
                        err.message,
                        '.'
                    ].join(''));
                }
            );
        }


  });
