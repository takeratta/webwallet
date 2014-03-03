'use strict';

angular.module('webwalletApp')
  .controller('NavCtrl', function (trezorService, $scope, $location, $routeParams) {

    $scope.devices = trezorService.devices;

    $scope.isActive = function (path) {
      return $location.path().match(path);
    };

    $scope.addAccount = function (dev) {
      dev.addAccount();
      $location.path('/device/' + dev.id + '/account/'
        + dev.accounts[dev.accounts.length - 1].id);
    };
  });
