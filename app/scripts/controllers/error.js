'use strict';

angular.module('errorApp')
  .controller('ErrorCtrl', function (error, trezorApi, $scope) {
    $scope.error = error;
    $scope.installed = error.installed !== false;
    $scope.installers = trezorApi.installers();

    $scope.installers.forEach(function (inst) {
      if (inst.preferred)
        $scope.selected = inst;
    });
  });
