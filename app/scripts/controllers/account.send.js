'use strict';

angular.module('webwalletApp')
  .controller('AccountSendCtrl', function (flash, $scope, $location, $rootScope) {

    $scope.transaction = {};

    $scope.estimate = function () {
      var tx = $scope.transaction,
          dev = $scope.device,
          amount = Math.round(tx.amount * 100000000);

      if (!tx.address || !amount) {
        tx.fee = null;
        $scope.transaction.prepared = null;
        $scope.transaction.error = null;
        $scope.form.$valid = false;
        $scope.form.$invalid = true;
        return;
      }

      $scope.account.buildTx(tx.address, amount, dev).then(
        function (preparedTx) {
          tx.fee = preparedTx.fee / 100000000;
          $scope.transaction.prepared = preparedTx;
          $scope.transaction.error = null;
          $scope.form.$valid = true;
          $scope.form.$invalid = false;
        },
        function (err) {
          tx.fee = null;
          $scope.transaction.prepared = null;
          $scope.transaction.error = err.message
            || 'Failed to prepare transaction.';
          $scope.form.$valid = false;
          $scope.form.$invalid = true;
        }
      );
    };

    $scope.send = function () {
      var tx = $scope.transaction.prepared;
      if (!tx) return;
      $scope.outputIndex = 0;
      $scope.sending = true;
      $scope.account.sendTx(tx, $scope.device).then(
        function () {
          $scope.sending = false;
          $location.path('/device/' + $scope.device.id
            + '/account/' + $scope.account.id);
          flash.success('Transaction successfully sent.');
        },
        function (err) {
          $scope.sending = false;
          flash.error(err.message || 'Failed to send transaction.');
        }
      );
    };

    $scope.suggestAddresses = function () {
      var current = $scope.account,
          accounts = $scope.device.accounts.filter(function (acc) {
            return acc.id !== current.id;
          });

      return accounts.map(function (acc) {
        var address = acc.address(0).address,
            label = acc.label();

        return {
          label: label + ': ' + address,
          address: address,
          source: 'Accounts'
        };
      });
    };

    // Output confirmation

    $scope.outputIndex = null; // Gets initialized in send()

    $rootScope.$on('modal.button.show', function (event, code) {
      var account = $scope.account,
          prepared = $scope.transaction.prepared,
          output = prepared ? prepared.outputs[$scope.outputIndex++] : null;

      if (code === 'ButtonRequest_ConfirmOutput') {
        event.targetScope.account = account;
        event.targetScope.output = output;
      }
    });

    // Send address scan

    $scope.qrScanEnabled = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                           navigator.mozGetUserMedia || navigator.msGetUserMedia;
    $scope.qrScanning = false;
    $scope.qrAddress = undefined;

    $scope.$watch('qrAddress', function (val) {
      var values;

      if (!$scope.qrScanning) return;
      $scope.qrScanning = false;

      if (!val) {
        $scope.qrAddress = undefined;
        return;
      }

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
  });
