'use strict';

angular.module('errorApp')
  .controller('ErrorCtrl', function (error, trezorApi, $scope) {
  	$scope.error = error;
  	$scope.installed = error.installed;
  	$scope.installers = trezorApi.installers();
  });
