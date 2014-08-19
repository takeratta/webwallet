/*global angular*/

angular.module('webwalletApp')
  .controller('DeviceSetupCtrl', function (utils, flash, $scope, $modal) {

    'use strict';

    var modal;

    $scope.advanced = false;
    $scope.settings = {
      pin_protection: true
    };

    $scope.recoveryStarted = false;
    $scope.RECOVERY_WORDS = 24;
    $scope.recoveryWordsDone = 0;
    $scope.recoveryCurrentWord = 1;

    $scope.$on('device.button', function (event, dev, code) {
      if (dev.id === $scope.device.id &&
          code === 'ButtonRequest_ConfirmWord') {
        $scope.setupRecoveryNext();
      }
    });

    $scope.setupDevice = function () {
      var set = $scope.settings,
          dev = $scope.device;

      if (set.label) {
        set.label = set.label.trim() || dev.getDefaultLabel();
      } else {
        set.label = dev.getDefaultLabel();
      }

      dev.reset(set).then(
        function () {
          utils.redirect('/device/' + dev.id).then(function () {
            flash.success('Congratulations! Your device is now ready to use.');
          });
        },
        function (err) {
          flash.error(err.message || 'Setup failed');
        }
      );
    };

    $scope.setupRecoveryNext = function () {

      // First write
      if (!$scope.recoveryStarted) {
        $scope.recoveryStarted = true;
        $scope.stage = 'writeFirst';
        openModal();
        return;
      }

      $scope.recoveryWordsDone = $scope.recoveryWordsDone + 1;
      $scope.recoveryCurrentWord = $scope.recoveryCurrentWord + 1;

      // Write
      if ($scope.recoveryWordsDone < $scope.RECOVERY_WORDS) {
        $scope.stage = 'write';

      // First check
      } else if ($scope.recoveryWordsDone === $scope.RECOVERY_WORDS) {
        $scope.recoveryCurrentWord = 1;
        $scope.stage = 'checkFirst';

      // Check
      } else if ($scope.recoveryWordsDone < 2 * $scope.RECOVERY_WORDS - 1) {
        $scope.stage = 'check';

      // Last check
      } else {
        $scope.device.once('receive', function () {
          closeModal();
        });
      }
    };

    function closeModal() {
      modal.close();
    }

    function openModal() {
      modal = $modal.open({
        templateUrl: 'views/modal/setup.html',
        windowClass: 'buttonmodal',
        backdrop: 'static',
        keyboard: false,
        scope: $scope
      });
    }
  });
