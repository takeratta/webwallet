/*global angular*/

angular.module('webwalletApp')
  .controller('ErrorCtrl', function (trezorError, trezorApi, $scope) {
    'use strict';

    $scope.installed = trezorError.installed !== false;
    $scope.installers = trezorApi.installers();

    $scope.installers.forEach(function (inst) {
      if (inst.preferred)
        $scope.selected = inst;
    });
  });
