/*global angular*/

angular.module('webwalletApp')
  .controller('AccountVerifyCtrl', function (
    flash, storage, utils, config, trezorService,
    $filter, $scope, $rootScope, $routeParams) {
    'use strict';

        $scope.verifyMsg = function () {
            var message = utils.bytesToHex(utils.stringToBytes(document.getElementById('message').value));
            var address = document.getElementById('address').value;
            var signature = utils.bytesToHex(utils.base64ToBytes(document.getElementById('signature').value));

            $scope.device.verifyMessage(address, signature, message).then(
                function (res) {
                    flash.success('Message verified.')
                },
                function (err) {
                    flash.error([
                        'Failed to verify message: ',
                        err.message,
                        '.'
                    ].join(''));
                }
            );
        }

  });
