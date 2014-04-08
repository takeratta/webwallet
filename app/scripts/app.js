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
]);

// load trezor plugin and bootstrap application
angular.element(document).ready(function () {
  var injector = angular.injector(['webwalletApp']),
      config = injector.get('config');

  window.trezor.load({ configUrl: config.pluginConfigUrl })
    .then(webwalletApp)
    .catch(errorApp);

  function webwalletApp(trezorObject) {
    var container = document.getElementById('webwalletApp-container'),
        minVersion = config.pluginMinVersion,
        err;

    if (minVersion && trezorObject.version() < minVersion) {
      err = new Error('The plugin is outdated');
      err.installed = false;
      throw err;
    }

    angular.module('webwalletApp')
      .value('trezorApi', window.trezor)
      .value('trezor', trezorObject);
    angular.bootstrap(container, ['webwalletApp']);
  }

  function errorApp(error) {
    var container = document.getElementById('errorApp-container');

    angular.module('errorApp')
      .value('trezorApi', window.trezor)
      .value('trezorError', error);
    angular.bootstrap(container, ['errorApp']);
  }
});
