'use strict';

angular.module('webwalletApp')
  .controller('AccountSendCtrl', function (
      flash, storage, utils,
      $log, $scope, $rootScope, $location) {

    var STORAGE_TXVALUES = 'trezorSendValues:'
          + $scope.account.publicKey();

    $scope.tx = {
      values: restoreTxValues(),
      prepared: null,
      error: null,
      fee: null
    };
    $scope.sending = false;
    $scope.outputIndex = null;

    // TODO: make this work
    // prepareTx($scope.tx.values); // we may have restored some values

    // Tx values save/restore

    function saveTxValues() {
      storage[STORAGE_TXVALUES] = JSON.stringify($scope.tx.values);
    }

    function cancelTxValues() {
      delete storage[STORAGE_TXVALUES];
    }

    function restoreTxValues() {
      if (storage[STORAGE_TXVALUES])
        return JSON.parse(storage[STORAGE_TXVALUES]);
      return {};
    }

    $scope.cancelTxValues = cancelTxValues;

    // Tx preparing

    $scope.$watch('tx.values', maybePrepareTx, true);

    function maybePrepareTx(nval, oval) {
      if (nval !== oval)
        prepareTx(nval);
    }

    function prepareTx(vals) {
      var amount, address;

      if (!vals.address || !vals.amount) {
        $scope.tx.prepared = null;
        $scope.tx.error = null;
        $scope.tx.fee = null;
        return;
      }

      amount = utils.str2amount(vals.amount);
      address = vals.address.trim();

      $scope.account.buildTx(address, amount, $scope.device).then(
        function (tx) {
          saveTxValues();
          $scope.tx.fee = utils.amount2str(tx.fee);
          $scope.tx.prepared = tx;
          $scope.tx.error = null;
        },
        function (err) {
          cancelTxValues();
          $scope.tx.fee = null;
          $scope.tx.prepared = null;
          $scope.tx.error = err.message || 'Failed to prepare transaction.';
        }
      );
    }

    // QR scan

    $scope.qr = {
      address: undefined,
      scanning: false,
      enabled:
        navigator.getUserMedia || navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia || navigator.msGetUserMedia
    };

    $scope.$watch('qr.address', qrAddressModified);

    function qrAddressModified(val) {
      var values;

      if (!$scope.qr.scanning) return;
      $scope.qr.scanning = false;

      if (!val) {
        $scope.qr.address = undefined;
        return;
      }

      values = parseQr(val);
      if (!values)
        return flash.error('Provided QR code does not contain valid address');

      if (values.address) $scope.txValues.address = values.address;
      if (values.amount) $scope.txValues.amount = values.amount;
    }

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

    $scope.scanQr = function () { $scope.qr.scanning = true; };
    $scope.cancelQr = function () { $scope.qr.scanning = false; };

    // Output confirmation

    $rootScope.$on('modal.button.show', modalShown);

    function modalShown(event, code) {
      if (code === 'ButtonRequest_ConfirmOutput')
        injectTxInfo(event.targetScope);
    }

    function injectTxInfo(scope) {
      scope.account = $scope.account;

      if ($scope.tx.prepared)
        scope.tx = $scope.tx.prepared;

      if ($scope.tx.prepared && $scope.tx.prepared.outputs[$scope.outputIndex]) {
        scope.output = $scope.tx.prepared.outputs[$scope.outputIndex];
        $scope.outputIndex++;
      }
    }

    // Scope methods

    $scope.send = function () {
      var tx = $scope.tx.prepared;
      if (!tx) return;

      $scope.sending = true;
      $scope.outputIndex = 0;

      $scope.account.sendTx(tx, $scope.device).then(
        function () {
          var off;

          cancelTxValues();
          $scope.sending = false;
          $location.path(
            '/device/' + $scope.device.id +
            '/account/' + $scope.account.id);

          off = $rootScope.$on('$locationChangeSuccess', function () {
            flash.success('Transaction successfully sent.');
            off();
          });
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

  });
