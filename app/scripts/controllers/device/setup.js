'use strict';

angular.module('webwalletApp')
  .controller('DeviceSetupCtrl', function (flash, $scope, $location) {

    $scope.advanced = false;
    $scope.settings = {
      pin_protection: true
    };

    $scope.setupDevice = function () {
      var set = $scope.settings,
          dev = $scope.device;

      if (set.label) {
        set.label = set.label.trim() || dev.getDefaultLabel();
      } else {
        set.label = dev.getDefaultLabel();
      }

      dev.reset(set).then(
        function () { $location.path('/device/' + dev.id); },
        function (err) { flash.error(err.message || 'Setup failed'); }
      );
    };
  });
