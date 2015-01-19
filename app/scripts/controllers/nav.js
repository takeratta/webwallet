/*global angular*/

/**
 * Navigation Controller
 *
 * Manage device and account navigation and account adding.
 *
 * @see  nav.html
 */
angular.module('webwalletApp').controller('NavCtrl', function (
    $scope,
    $location,
    deviceList,
    $modal,
    flash) {

    'use strict';

    $scope.devices = function () {
        return deviceList.all();
    };

    $scope.isActive = function (path) {
        return $location.path().match(path);
    };

    $scope.addingInProgress = false;

    $scope.addAccount = function (dev) {
        $scope.addingInProgress = true;
        dev.addAccount().then(
            function (acc) {
                $location.path('/device/' + dev.id + '/account/' + acc.id);
                $scope.addingInProgress = false;
            },
            function (err) {
                flash.error(err.message || 'Failed to add account.');
            }
        );
    };

    $scope.accountLink = function (dev, acc) {
        var link = '#/device/' + dev.id + '/account/' + acc.id;
        if ($scope.isActive('/receive$')) link += '/receive';
        if ($scope.isActive('/send$')) link += '/send';
        return link;
    };



    /**
     * When user clicks on trash icon, ask again (to be sure).
     *
     * @param {TrezorDevice} device  Device that was disconnected
     */
    $scope.forget = function (device) {
        promptForget()
            .then(function () {
                device.forgetOnDisconnect = true;
                deviceList.forget(device);
            }, function () {
                device.forgetOnDisconnect = false;
            });
    }

    /**
     * Ask the user if he/she wants to forget or remember the device.
     *
     * Returns a promise that is resolved if the user chooses to forget the
     * device and failed if the user chooses to remember it.
     *
     * @see  `forgetOnDisconnect()`
     *
     * @return {Promise}
     */
    function promptForget() {
        var modal = $modal.open({
            templateUrl: 'views/modal/forget.requested.html',
            backdrop: 'static',
            keyboard: false
        });
        modal.opened.then(function () {
            $scope.$emit('modal.forget.show');
        });
        modal.result.finally(function () {
            $scope.$emit('modal.forget.hide');
        });

        return modal.result;
    }


});
