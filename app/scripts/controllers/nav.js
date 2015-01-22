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
    modalOpener,
    forgetModalService,
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
        forgetModalService.showRequestedModal($scope, device,deviceList);
    }

});
