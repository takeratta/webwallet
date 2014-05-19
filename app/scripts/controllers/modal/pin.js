'use strict';

angular.module('webwalletApp')
  .controller('ModalPinCtrl', function ($scope) {

    $scope.ratePin = function (pin) {
      var strength = $scope.device.ratePin(pin);

      if (strength < 3000) return 'weak';
      if (strength < 60000) return 'fine';
      if (strength < 360000) return 'strong';
      return 'ultimate';
    };

  });