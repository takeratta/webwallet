/*global angular*/

angular.module('webwalletApp')
  .controller('DeviceWipeCtrl', function (trezorService, flash, $scope) {
    'use strict';

    /**
     * Wipe device
     *
     * Wipe the device and then ask the user if he/she wants to forget it using
     * the same modal that is show when the user clicks the Forget device link.
     *
     * When a device is wiped the device ID changes, therefore
     * the `device.connect` and then the `device.disconnect` events are
     * fired.  That means we have to take care of two problems:
     *
     * (1) We need to make sure that these events don't trigger the opening of
     * the Disconnect modal (see `DeviceCtrl.handleDisconnect()`).  To
     * achieve such a behaviour, we set the `forgetInProgress` flag to true.
     * The Disconnect modal knows, that it should not open, if this flag is
     * true.
     *
     * (2) We need to make sure that these events are fired before we open the
     * Forget modal.  Otherwise the modal would close the moment the events get
     * fired.  To achieve such a behaviour, we check that the device ID changed
     * and if not, then we wait for the events to fire.
     *
     * @see  DeviceCtrl.handleDisconnect()
     */
    $scope.wipeDevice = function () {
      var oldDevId = $scope.device.id;

      trezorService.setForgetInProgress(true);

      $scope.device.wipe().then(
        function () {
          if (!trezorService.get(oldDevId).isConnected()) {
            $scope.forgetDevice();
          } else {
            var off = $scope.$on('device.disconnect', function (event, devId) {
              if (devId === oldDevId) {
                $scope.forgetDevice();
                off();
              }
            });
          }
        },
        function (err) {
          trezorService.setForgetInProgress(true);
          flash.error(err.message || 'Wiping failed');
        }
      );
    };

  });
