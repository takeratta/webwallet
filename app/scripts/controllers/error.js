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
angular.module('webwalletApp').controller('ErrorCtrl', function (
    config,
    trezor,
    trezorApi,
    trezorError,
    $scope) {

    'use strict';

    try {
        $scope.installers = trezorApi.installers();
        $scope.installers.forEach(function (inst) {
            if (inst.preferred) {
                $scope.selectedInstaller = inst;
            }
        });
    } catch (e) {
        trezorError = trezorError || e;

        console.error('[ErrorCtrl] Error occured while rendering the error ' +
            'view.');
        console.error(e.message);
    }

    if (trezorError === null) {
        $scope.error = false;

        if (trezor instanceof trezorApi.PluginTransport) {
            $scope.deprecatePlugin = config.deprecatePlugin;
            $scope.usingPluginTransport = true;
        }
    } else {
        $scope.error = true;
        $scope.installed = trezorError.installed !== false;
    }
});
