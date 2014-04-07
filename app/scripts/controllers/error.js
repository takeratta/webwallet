'use strict';

angular.module('errorApp')
  .controller('ErrorCtrl', function (trezorError, trezorApi, $scope) {
    $scope.error = trezorError;
    $scope.installed = trezorError.installed !== false;
    $scope.installers = trezorApi.installers();

    $scope.installers.forEach(function (inst) {
      if (inst.preferred)
        $scope.selected = inst;
    });
  });
