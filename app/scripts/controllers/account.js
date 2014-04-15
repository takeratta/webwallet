'use strict';

angular.module('webwalletApp')
    .controller('AccountCtrl', function (trezorService, utils, flash,
      $document, $scope, $timeout, $location, $rootScope, $routeParams) {

    $scope.device = trezorService.get($routeParams.deviceId);
    if (!$scope.device)
      return $location.path('/');

    $scope.forgetDevice = function () {
      trezorService.forget($scope.device);
      $location.path('/');
    };

    $scope.account = $scope.device.account($routeParams.accountId);
    if (!$scope.account)
      return $location.path('/');

    $scope.hideAccount = function () {
      $scope.account.deregisterAndUnsubscribe();
      $scope.device.hideAccount($scope.account);
      $location.path('/device/' + $scope.device.id + '/account/'
        + ($scope.device.accounts.length - 1));
    };

    $scope.reload = function () {
      window.location.reload();
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

      // select the address text
      $timeout(function () {
        var addr = address.address,
            elem = $document.find('.address-list-address:contains('+addr+')');
        if (elem.length)
          select(elem[0]);
      });
    };

    function select(elem) {
      var selection, range,
          document = window.document,
          body = document.body;

      if (body.createTextRange) { // ms
        range = body.createTextRange();
        range.moveToElementText(elem);
        range.select();
        return;
      }

      if (window.getSelection) { // moz, opera, webkit
        selection = window.getSelection();
        range = document.createRange();
        range.selectNodeContents(elem);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
    }

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
      $scope.account.sendTx(tx, $scope.device).then(
        function () {
          $location.path('/device/' + $scope.device.id
            + '/account/' + $scope.account.id);
          flash.success('Transaction successfully sent.');
        },
        function (err) {
          flash.error(err.message || 'Failed to send transaction.');
        }
      );
    };

    // Output confirmation

    $scope.outputIndex = null; // Gets inicialized in send()

    $rootScope.$on('modalShow.button', function (event, code) {
      var modScope = event.targetScope;

      if (code !== 'ButtonRequest_ConfirmOutput')
        return;

      modScope.$apply(function () {
        var account = $scope.account,
            prepared = $scope.transaction.prepared,
            output = prepared ? prepared.outputs[$scope.outputIndex++] : null;

        modScope.account = account;
        modScope.output = output;
      });
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

    // Send address auto-suggest

    $scope.suggestAddresses = function () {
      return suggestHistory().concat(suggestAccounts());
    };

    function suggestHistory() {
      return []; // TODO
    }

    function suggestAccounts() {
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
    }
  });
