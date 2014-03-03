'use strict';

angular.module('webwalletApp')
    .controller('AccountCtrl', function (trezorService, utils, flash,
      $document, $scope, $location, $routeParams) {

    $scope.device = trezorService.get($routeParams.deviceId);
    if (!$scope.device)
      return $location.path('/');

    $scope.forgetDevice = function () {
      trezorService.forget($scope.device.id);
      $location.path('/');
    };

    $scope.account = $scope.device.account($routeParams.accountId);
    if (!$scope.account)
      return $location.path('/');

    $scope.forgetAccount = function () {
      $scope.account.unsubscribe();
      $scope.account.deregister();
      $scope.device.removeAccount($scope.account);
      $location.path('/device/' + $scope.device.id);
    };

    //
    // Receive
    //

    $scope.activeAddress = null;
    $scope.usedAddresses = [];
    $scope.addresses = [];
    $scope.lookAhead = 10;

    $scope.activate = function (address) {
      $scope.activeAddress = address;
    };

    $scope.more = function () {
      var index = $scope.addresses.length,
          address = $scope.account.address(index);
      $scope.addresses[index] = address;
      $scope.activate(address);
    };

    $scope.more();

    //
    // Send
    //

    $scope.transaction = {};

    $scope.estimate = function (tx) {
      var address = tx.address,
          amount = Math.round(tx.amount * 100000000);
      if (!address || !amount) return;
      $scope.account.buildTx(address, amount, $scope.device).then(
        function (builtTx) {
          $scope.builtTx = builtTx;
          tx.fee = builtTx.fee / 100000000;
        },
        function (err) {
          flash.error(err.message || 'Failed to compose transaction.');
        }
      );
    };

    $scope.send = function () {
      var tx = $scope.builtTx;
      $scope.account.sendTx(tx, $scope.device).then(
        function () {
          var path = '/device/' + $scope.device.id + '/account/' + $scope.account.id;
          $location.path(path);
        },
        function (err) {
          flash.error(err.message || 'Failed to send transaction.');
        }
      );
    };

    // Send address scan

    $scope.qrScanEnabled = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                           navigator.mozGetUserMedia || navigator.msGetUserMedia;
    $scope.qrAddress = null;
    $scope.qrScanning = false;

    $scope.$watch('qrAddress', function (val) {
      var values;

      if (!$scope.qrScanning) return;
      $scope.qrScanning = false;

      values = parseQr(val);
      if (!values)
        return flash.error('Provided QR code does not contain valid address');

      if (values.address) $scope.transaction.address = values.address;
      if (values.amount) $scope.transaction.amount = values.amount;
    });

    function parseQr(str) {
      var vals, query;

      if (str.indexOf('bitcoin:') === 0)
        str = str.substring(8);

      query = str.split('?');
      vals = (query.length > 1) ? parseQuery(query[1]) : {};
      vals.address = query[0];

      if (vals.address.length < 27 || vals.address.length > 34)
        return;

      return vals;
    }

    function parseQuery(str) {
      return str.split('&')
        .map(function (val) {
          return val.split('=');
        })
        .reduce(function (vals, pair) {
          if (pair.length > 1)
            vals[pair[0]] = pair[1];
          return vals;
        }, {});
    }

    $scope.scanQr = function () { $scope.qrScanning = true; };
    $scope.cancelQr = function () { $scope.qrScanning = false; };

    // Send address auto-suggest

    $scope.suggestAddresses = function () {
      return suggestHistory().concat(suggestAccounts());
    };

    function suggestHistory() {
      return []; // TODO
    }

    function suggestAccounts() {
      var accounts = $scope.device.accounts;

      return accounts.map(function (acc) {
        var address = acc.address(0).address,
            label = acc.label();

        return {
          label: label + ': ' + address,
          address: address,
          source: 'Accounts'
        };
      });
    }
  });
