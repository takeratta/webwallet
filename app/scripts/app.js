'use strict';

angular.module('errorApp', []);

angular.module('webwalletApp', [
  'ngRoute',
  'ui.bootstrap',
  'ja.qr'
])
  .config(function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html'
      })
      .when('/import', {
        templateUrl: 'views/import.html'
      })
      .when('/device/:deviceId', {
        templateUrl: 'views/device/index.html'
      })
      .when('/device/:deviceId/load', {
        templateUrl: 'views/device/load.html'
      })
      .when('/device/:deviceId/recovery', {
        templateUrl: 'views/device/recovery.html'
      })
      .when('/device/:deviceId/wipe', {
        templateUrl: 'views/device/wipe.html'
      })
      .when('/device/:deviceId/account/:accountId', {
        templateUrl: 'views/account/index.html'
      })
      .when('/device/:deviceId/account/:accountId/send', {
        templateUrl: 'views/account/send.html'
      })
      .when('/device/:deviceId/account/:accountId/receive', {
        templateUrl: 'views/account/receive.html'
      })
      .otherwise({
        redirectTo: '/'
      });
  });

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
