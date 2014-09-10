/*global angular*/

'use strict';

angular.module('webwalletApp', [
    'ngRoute',
    'ngSanitize',
    'ui.bootstrap',
    'ja.qr'
  ]);

// load trezor plugin and bootstrap application
angular.element(document).ready(function () {
  var injector = angular.injector(['webwalletApp']),
      config = injector.get('config');

  var trezor = window.trezor,
      bridgeUrl = config.bridge.url,
      bridgeConfigUrl = config.bridge.configUrl,
      bridgeConfigPromise = trezor.http(bridgeConfigUrl);

  acquireTransport()
    .then(function (transport) {
      return bridgeConfigPromise
        .then(function (config) {
          return transport.configure(config);
        })
        .then(function () {
          return webwalletApp(null, transport);
        });
    })
    .catch(function (err) {
      return webwalletApp(err);
    });

  registerUriHandler();

  function acquireTransport() {
    return loadHttp().catch(loadPlugin);

    function loadHttp() {
      return trezor.HttpTransport.connect(bridgeUrl)
        .then(
          function (info) {
            console.log('[app] Loading http transport successful', info);
            return new trezor.HttpTransport(bridgeUrl);
          },
          function (err) {
            console.error('[app] Loading http transport failed', err);
            throw err;
          });
    }

    function loadPlugin() {
      return trezor.PluginTransport.loadPlugin().then(function (plugin) {
        return new trezor.PluginTransport(plugin);
      });
    }
  }

  function webwalletApp(err, transport) {
    var app,
        container = document.getElementById('webwalletApp-container');

    if (!err) {
      app = initApp();
    } else {
      app = initAppError();
    }
    app
      .value('trezorError', err)
      .value('trezorApi', window.trezor)
      .value('trezor', transport);

    angular.bootstrap(container, ['webwalletApp']);
  }

  function initApp() {
    return angular.module('webwalletApp')
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
          .when('/device/:deviceId/account/:accountId/send/:output', {
            templateUrl: 'views/account/send.html'
          })
          .when('/device/:deviceId/account/:accountId/send/:output/amount/:amount', {
            templateUrl: 'views/account/send.html'
          })
          .when('/device/:deviceId/account/:accountId/receive', {
            templateUrl: 'views/account/receive.html'
          })
          .when('/send/:uri*', {
            resolve: {
              uriRedirect: 'uriRedirect'
            }
          })
          .when('/device/:deviceId/account/:accountId/sign', {
            templateUrl: 'views/account/sign.html'
          })
          .when('/device/:deviceId/account/:accountId/verify', {
            templateUrl: 'views/account/verify.html'
          })
          .otherwise({
            redirectTo: '/'
          });
      });
  }

  function initAppError() {
    return angular.module('webwalletApp');
  }

  /**
   * Register Bitcoin URI handler
   */
  function registerUriHandler() {
    var URI_PROTOCOL = 'bitcoin',
        URI_TEMPLATE = '/#/send/%s',
        URI_NAME = 'MyTrezor: Send Bitcoins to address',
        url;

    url = location.protocol + '//' + location.host + URI_TEMPLATE;
    if (navigator.registerProtocolHandler &&
        (!navigator.isProtocolHandlerRegistered ||
         !navigator.isProtocolHandlerRegistered(URI_PROTOCOL, url))) {
      navigator.registerProtocolHandler(
        URI_PROTOCOL,
        url,
        URI_NAME
      );
    }
  }
});
