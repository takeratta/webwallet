/*global angular*/

angular.module('webwalletApp').controller('DeviceLoadCtrl', function (
    flash,
    $scope,
    $location) {

    'use strict';

    $scope.settings = {
        pin_protection: true
    };

    $scope.loadDevice = function () {
        var set = $scope.settings,
            dev = $scope.device;

        if (set.label)
            set.label = set.label.trim();
        set.payload = set.payload.trim();

        dev.load(set).then(
            function () { $location.path('/device/' + dev.id); },
            function (err) { flash.error(err.message || 'Importing failed'); }
        );
    };

});
