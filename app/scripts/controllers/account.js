'use strict';

angular.module('webwalletApp')
  .controller('AccountCtrl', function (trezorService, $scope, $location, $routeParams) {

    $scope.account = $scope.device.account($routeParams.accountId);
    if (!$scope.account) {
      $location.path('/');
      return;
    }

    $scope.hideAccount = function () {
      $scope.account.unsubscribe();
      $scope.device.hideAccount($scope.account);
      $location.path('/device/' + $scope.device.id + '/account/'
        + ($scope.device.accounts.length - 1));
    };

  });
