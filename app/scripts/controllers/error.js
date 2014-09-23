/*global angular*/

/**
 * Error Controller
 *
 * Assign properties that show if the Transport was loaded successfully or not
 * to the Angular scope.
 *
 * @see index.html
 * @see error.html
 * @see error.install.html
 */
angular.module('webwalletApp')
    .controller('ErrorCtrl', function (trezorError, trezorApi, $scope) {

        'use strict';

        if (trezorError === null) {
            $scope.error = false;
        } else {
            $scope.error = true;
            $scope.installed = trezorError.installed !== false;
            $scope.installers = trezorApi.installers();

            $scope.installers.forEach(function (inst) {
                if (inst.preferred) {
                    $scope.selected = inst;
                }
            });
        }
    });
