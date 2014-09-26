/*global angular*/

/**
 * Error Controller
 *
 * Assign properties that show if the Transport was loaded successfully and
 * if the plugin is up to date to the Angular scope.
 *
 * @see  index.html
 * @see  error.html
 * @see  error.install.html
 */
angular.module('webwalletApp')
    .controller('ErrorCtrl', function (config, trezor, trezorApi,
            trezorError, $scope) {

        'use strict';

        if (trezorError === null) {
            $scope.error = false;

            if (trezor instanceof trezorApi.PluginTransport) {
                $scope.deprecatePlugin = config.deprecatePlugin;
                $scope.usingPluginTransport = true;
                $scope.installers = trezorApi.installers();
                $scope.installers.forEach(function (inst) {
                    if (inst.preferred) {
                        $scope.selectedInstaller = inst;
                    }
                });
            }
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
