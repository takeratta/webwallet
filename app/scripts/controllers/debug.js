/*global angular, $*/

angular.module('webwalletApp')
  .controller('DebugCtrl', function ($rootScope) {
    'use strict';

    $rootScope.debug = {};

    $rootScope.debug.toggle = function () {
      if ($rootScope.debug.visible) {
        $rootScope.debug.visible = false;
        return;
      }
      $rootScope.debug.logs = debugLogsString();
      $rootScope.debug.visible = true;
    };

    $rootScope.debug.focus = function (e) {
      $(e.target).select();
    };

    function debugLogsString() {
      return (window.console.logs || [])
        .map(JSON.stringify)
        .join('\n');
    }
  });
