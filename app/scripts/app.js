'use strict';

angular.module('webwalletApp', [
  'ngRoute',
  'ngAnimate',
  'ngSanitize',
  'mgcrea.ngStrap',
  'ja.qr'
])
  .config(function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .when('/device/:deviceId', {
        templateUrl: 'views/device.html',
        controller: 'DeviceCtrl'
      })
      .when('/device/:deviceId/setup', {
        templateUrl: 'views/setup.html',
        controller: 'DeviceCtrl'
      })
      .when('/device/:deviceId/load', {
        templateUrl: 'views/load.html',
        controller: 'DeviceCtrl'
      })
      .when('/device/:deviceId/recovery', {
        templateUrl: 'views/recovery.html',
        controller: 'DeviceCtrl'
      })
      .when('/device/:deviceId/wipe', {
        templateUrl: 'views/wipe.html',
        controller: 'DeviceCtrl'
      })
      .when('/device/:deviceId/account/:accountId', {
        templateUrl: 'views/account.html',
        controller: 'AccountCtrl'
      })
      .when('/device/:deviceId/account/:accountId/send', {
        templateUrl: 'views/send.html',
        controller: 'AccountCtrl'
      })
      .when('/device/:deviceId/account/:accountId/receive', {
        templateUrl: 'views/receive.html',
        controller: 'AccountCtrl'
      })
      .otherwise({
        redirectTo: '/'
      });
  });

angular.module('errorApp', [
  'ngSanitize',
  'mgcrea.ngStrap'
])
  .controller('ErrorCtrl', function (error, trezorApi, $scope) {
    $scope.error = error;
    $scope.installed = error.installed;
    $scope.installers = trezorApi.installers();
    $scope.selected = preferred($scope.installers);
    $scope.download = download;

    function preferred(is) {
      var i = is.filter(function (i) { return i.preferred; })[0];
      return (i || is[0]);
    }

    function download(selected) {
      window.location.href = selected.url;
    }
  });

// load trezor plugin and bootstrap application
angular.element(document).ready(function () {
  window.trezor.load({ configUrl: '/data/plugin/config_signed.bin' }).then(
    webwalletApp,
    errorApp
  );

  function webwalletApp(trezorObject) {
    var container = document.getElementById('webwalletApp-container');

    angular.module('webwalletApp')
      .value('trezorApi', window.trezor)
      .value('trezor', trezorObject);
    angular.bootstrap(container, ['webwalletApp']);
  }

  function errorApp(error) {
    var container = document.getElementById('errorApp-container');

    angular.module('errorApp')
      .value('trezorApi', window.trezor)
      .value('error', error);
    angular.bootstrap(container, ['errorApp']);
  }
});
