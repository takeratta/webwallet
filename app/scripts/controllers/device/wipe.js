'use strict';

angular.module('webwalletApp')
  .controller('DeviceWipeCtrl', function (flash, $scope) {

    $scope.wipeDevice = function () {
      $scope.device.wipe().then(
        function () { $scope.forgetDevice(); },
        function (err) { flash.error(err.message || 'Wiping failed'); }
      );
    };

  });
