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
      var logs = [];
      window.console.logs.forEach(function (log) {
        logs.push(JSON.stringify(log));
      });
      $rootScope.debug.logs = logs.join('\r\n');
      $rootScope.debug.visible = true;
    };

    $rootScope.debug.focus = function (e) {
      $(e.currentTarget).select();
    };
  });
