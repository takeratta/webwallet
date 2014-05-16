'use strict';

angular.module('webwalletApp')
  .factory('flash', function($rootScope, $timeout) {
    var messages = [];

    var reset;
    var cleanup = function() {
      $timeout.cancel(reset);
      reset = $timeout(function() { messages = []; });
    };

    var emit = function() {
      $rootScope.$emit('flash:message', messages, cleanup);
    };

    $rootScope.$on('$locationChangeSuccess', emit);

    var asMessage = function(level, text) {
      if (!text) {
        text = level;
        level = 'success';
      }
      return { level: level, text: text };
    };

    var asArrayOfMessages = function(level, text) {
      if (level instanceof Array) return level.map(function(message) {
        return message.text ? message : asMessage(message);
      });
      return text ? [{ level: level, text: text }] : [asMessage(level)];
    };

    var flash = function(level, text) {
      emit(messages = asArrayOfMessages(level, text));
    };

    ['error', 'warning', 'info', 'success'].forEach(function (level) {
      flash[level] = function (text) { flash(level, text); };
    });

    return flash;
  })

  .directive('flashMessages', function() {
    return {
      controller: function ($scope, $rootScope) {
        $rootScope.$on('flash:message', function (_, messages, done) {
          $scope.messages = messages;
          done();
        });
      },
      restrict: 'EA',
      replace: true,
      template:
        '<div ng-repeat="m in messages"' +
        '     ng-switch="m.level">' +
        '  <div class="alert alert-flash alert-danger"' +
        '       ng-switch-when="error"><h4 class="text-capitals">{{m.level}}!</h4> {{m.text}}</div>' +
        '  <div class="alert alert-flash alert-{{m.level}}"' +
        '       ng-switch-default><h4 class="text-capitals">{{m.level}}</h4> {{m.text}}</div>' +
        '</div>'
    };
  });