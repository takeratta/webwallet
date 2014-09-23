/*global angular*/

/**
 * Main Controller
 *
 * - Load deviceList, deviceService, and firmwareService.  These modules
 * immediately start listening to device events.  They are responsible for most
 * of the functionality of the app, that is not triggered by the user.
 *
 * - Fill Angular scope with the list of all devices.
 */
angular.module('webwalletApp')
    .controller('MainCtrl', function (
            $scope,
            deviceList,
            deviceService,
            firmwareService) {

        'use strict';

        $scope.devices = deviceList.all();

    });
