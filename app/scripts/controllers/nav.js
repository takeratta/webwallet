'use strict';

angular.module('webwalletApp')
  .controller('NavCtrl', function (trezorService, flash, $scope, $location) {

    $scope.devices = trezorService.devices;

    $scope.isActive = function (path) {
      return $location.path().match(path);
    };

    $scope.addAccount = function (dev) {
      dev.addAccount().then(
        function (acc) {
          $location.path('/device/' + dev.id + '/account/' + acc.id);
        },
        function (err) {
          flash.error(err.message || 'Failed to add account.');
        }
      );

    };
  });
