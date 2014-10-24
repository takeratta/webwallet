/*global angular, CSV*/

angular.module('webwalletApp').controller('AccountSendCtrl', function (
    temporaryStorage,
    flash,
    utils,
    config,
    deviceList,
    $filter,
    $scope,
    $rootScope,
    $routeParams,
    $modal,
    $http) {

    'use strict';

    var STORAGE_TXVALUES = 'trezorSendValues',
        DEFAULT_CURRENCY = 'USD';

    $scope.tx = {
        values: initialTxValues(),
        prepared: null,
        error: null,
        fee: null
    };
    $scope.sending = false;

    getSupportedAltCurrencies().then(function (currencies) {
        $scope.currenciesAlt = currencies;
    });

    /*
     * If a transaction output was specified in an HTTP GET param, use that
     * value first.  Otherwise load previously filled output values from
     * localStorage.
     */
    function initialTxValues() {
        var values,
            output;

        if ($routeParams.output) {
            output = {
                address: $routeParams.output
            };
            if ($routeParams.amount) {
                output.amount = $routeParams.amount;
            }
            values = {
                outputs: [output]
            };
        } else {
            values = restoreTxValues();
        }

        return values;
    }

    // Tx values save/restore

    function saveTxValues() {
        temporaryStorage[STORAGE_TXVALUES] = JSON.stringify($scope.tx.values);
    }

    function cancelTxValues() {
        delete temporaryStorage[STORAGE_TXVALUES];
    }

    function restoreTxValues() {
        if (temporaryStorage[STORAGE_TXVALUES])
            return JSON.parse(temporaryStorage[STORAGE_TXVALUES]);
        return { outputs: [createNewOutput()] };
    }

    $scope.cancelTxValues = cancelTxValues;

    // Tx preparing

    $scope.$watch(
        function () {
            return $scope.account.balance !== null;
        },
        function (hasBalance) {
            if (hasBalance)
                prepareTx($scope.tx.values);
        }
    );

    $scope.$watch('tx.values', function (nval, oval) {
        if (nval !== oval) {
            saveTxValues();
            prepareTx(nval);
        }
    }, true);

    function prepareTx(vals) {
        var preparedOuts = [],
            outsOk = true;

        vals.outputs.forEach(prepareOutput);
        if (outsOk && preparedOuts.length)
            $scope.account.buildTx(preparedOuts, $scope.device).then(success, cancel);
        else
            cancel();

        function prepareOutput(out) {
            var address = out.address,
                amount = out.amount,
                pout;

            address = address ? address.trim() : '';
            amount = amount ? amount.trim() : '';
            if (!address || !amount)
                return; // skip empty fields in silence
            amount = utils.str2amount(amount);

            try {
                pout = $scope.account.buildTxOutput(address, amount);
            } catch (e) {
                if (e.field === $scope.account.FIELD_ADDRESS) {
                    out.error = out.error || {};
                    out.error.address = e.message;
                } else if (e.field === $scope.account.FIELD_AMOUNT) {
                    out.error = out.error || {};
                    out.error.amount = e.message;
                } else {
                    out.error = e.message;
                }
            }

            if (pout) {
                preparedOuts.push(pout);
                out.error = null;
            }
            else
                outsOk = false;
        }

        function success(tx) {
            $scope.tx.fee = utils.amount2str(tx.fee);
            $scope.tx.prepared = tx;
            $scope.tx.error = null;
        }

        function cancel(err) {
            $scope.tx.fee = null;
            $scope.tx.prepared = null;
            if (err)
                $scope.tx.error = err.message || 'Failed to prepare transaction.';
        }
    }

    // QR scan

    $scope.qr = {
        outputIndex: undefined,
        address: undefined,
        scanning: false,
        enabled:
        navigator.getUserMedia || navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia || navigator.msGetUserMedia
    };

    $scope.$watch('qr.address', qrAddressModified);

    function qrAddressModified(val) {
        var values, output;

        if (!$scope.qr.scanning) return;
        $scope.qr.scanning = false;

        if (!val) {
            $scope.qr.address = undefined;
            return;
        }

        values = parseQr(val);
        if (!values)
            return flash.error('Provided QR code does not contain valid address');

        output = $scope.tx.values.outputs[$scope.qr.outputIndex];
        if (values.address) output.address = values.address;
        if (values.amount) output.amount = values.amount;
        $scope.qr.address = undefined;
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

    // Output/tx confirmation

    $rootScope.$on('modal.button.show', modalShown);

    function modalShown(event, code) {
        if (code === 'ButtonRequest_ConfirmOutput')
            injectTxInfo(event.targetScope, true);
        if (code === 'ButtonRequest_SignTx')
            injectTxInfo(event.targetScope, false);
    }

    function injectTxInfo(scope, injectOutput) {
        var prepared = $scope.tx.prepared;

        scope.account = $scope.account;
        scope.tx = prepared;

        if (!prepared || !injectOutput)
            return;

        // detect internal output
        if (prepared.outputs[$scope.outputIndex] &&
            prepared.outputs[$scope.outputIndex].address_n)
            $scope.outputIndex++;

        if (prepared.outputs[$scope.outputIndex]) {
            scope.output = prepared.outputs[$scope.outputIndex];
            $scope.outputIndex++;
        }
    }

    // Sending

    $scope.send = function () {
        var tx = $scope.tx.prepared;
        if (!tx) return;

        $scope.sending = true;
        $scope.outputIndex = 0;

        $scope.account.sendTx(tx, $scope.device).then(
            function (res) {

                cancelTxValues();
                $scope.sending = false;

                utils.redirect('/device/' + $scope.device.id +
                               '/account/' + $scope.account.id).then(function () {
                                   res.hashRev = res.hash.slice();
                                   res.hashRev.reverse();
                                   var hashHex = utils.bytesToHex(res.hashRev);
                                   flash.success(
                                       {
                                           template: [
                                               'Transaction <a href="{{url}}" target="_blank" ',
                                               'title="Transaction info at {{title}}">{{hashHex}}</a> ',
                                               'was successfully sent.'
                                           ].join(''),
                                           hashHex: hashHex,
                                           url: config.blockExplorers[config.coin].urlTx + hashHex,
                                           title: config.blockExplorers[config.coin].name
                                       }
                                   );
                               });
            },
            function (err) {
                $scope.sending = false;

                if (err.value && err.value.bytes) {
                    flash.error({
                        template: [
                            'Failed to send transaction: {{message}}.<br><br>',
                            'Raw transaction in hex format:<br>',
                            '<span class="text-monospace">{{bytes}}</span><br>',
                            'You can try to resend this transaction using',
                            '<a href="https://blockchain.info/pushtx" target="_blank">',
                            'Blockchain.info\'s Broadcast Transaction tool</a>.'
                        ].join('\n'),
                        bytes: utils.bytesToHex(err.value.bytes),
                        message: err.message,
                        show_raw_tx: false
                    });
                    return;
                }

                flash.error([
                    'Failed to send transaction: ',
                    err.message,
                    '.'
                ].join(''));
            }
        );
    };

    $scope.removeOutput = function (i) {
        $scope.tx.values.outputs.splice(i, 1);
    };

    $scope.addOutput = function () {
        $scope.tx.values.outputs.push(createNewOutput());
    };

    $scope.removeAllOutputs = function () {
        $scope.tx.values.outputs = [createNewOutput()];
    };

    function createNewOutput() {
        return {
            amount: '',
            amountAlt: '',
            currencyAlt: DEFAULT_CURRENCY
        };
    }

    // Suggest the highest possible amount to pay, taking filled
    // amounts in consideration

    $scope.suggestAmount = function () {
        var ptx = $scope.tx.prepared,
            account = $scope.account,
            outputSum = ptx ? ptx.outputSum : 0,
            available = parseInt(account.balance.toString());

        return $filter('amount')(available - outputSum);
    };

    // Address suggestion

    $scope.suggestAddresses = function () {
        var currentDevice = $scope.device,
            currentAccount = $scope.account,
            suggestedAccounts = [],
            multipleDevices = deviceList.count() > 1;
        deviceList.all().forEach(function (dev) {
            dev.accounts.forEach(function (acc) {
                if (dev.id === currentDevice.id &&
                    acc.id === currentAccount.id) {
                    return;
                }
                suggestedAccounts.push([dev, acc]);
            });
        });

        return suggestedAccounts.map(function (item) {
            var dev = item[0],
                acc = item[1],
                address = acc.address(0).address,
                label;
            if (multipleDevices) {
                label = dev.label() + ' / ' + acc.label();
            } else {
                label = acc.label();
            }

            return {
                label: label + ': ' + address,
                address: address,
                source: 'Accounts'
            };
        });
    };

    /**
     * Scan QR
     */
    $scope.scanQr = function (i) {
        promptQr()
            .then(function () {
                $scope.qr.scanning = true;
                $scope.qr.outputIndex = i;
            }, function () {
                $scope.qr.scanning = false;
            });
    };

    /**
     * Prompt QR
     */
    function promptQr() {
        var scope,
            modal;

        scope = angular.extend($scope.$new(), {});

        modal = $modal.open({
            templateUrl: 'views/modal/qr.html',
            size: '',
            windowClass: '',
            backdrop: 'static',
            keyboard: false,
            scope: scope,
        });
        modal.opened.then(function () { scope.$emit('modal.qr.show'); });
        modal.result.finally(function () { scope.$emit('modal.qr.hide'); });

        return modal.result;
    }

    /**
     * Import CSV
     */
    $scope.importCsv = function () {
        promptCsv()
            .then(function (form) {
                var data = form.data.replace('\r', '\n').replace('\n\n', '\n'),
                    options = {
                        cellDelimiter: (form.delimiter || '')[0] || ',',
                        header: !!form.header,
                        lineDelimiter: '\n'
                    },
                    colAddress,
                    colAmount;
                if (options.header) {
                    colAddress = 'address';
                    colAmount = 'amount';
                } else {
                    colAddress = 0;
                    colAmount = 1;
                }
                /*
                 * Can't use CSV#forEach() because of a bug in the library:
                 * `data is undefined`.
                 */
                new CSV(data, options).parse().forEach(function (line) {
                    $scope.tx.values.outputs.push({
                        address: line[colAddress].toString(),
                        amount: line[colAmount].toString()
                    });
                });
            });
    };

    /**
     * Prompt CSV
     */
    function promptCsv() {
        var scope,
            modal;

        scope = angular.extend($scope.$new(), {});

        modal = $modal.open({
            templateUrl: 'views/modal/csv.html',
            size: '',
            windowClass: '',
            backdrop: 'static',
            keyboard: false,
            scope: scope,
            delimiter: ',',
            header: true
        });
        modal.opened.then(function () { scope.$emit('modal.csv.show'); });
        modal.result.finally(function () { scope.$emit('modal.csv.hide'); });

        $scope.$on('qr.address', function () {
            modal.close();
        });

        return modal.result;
    }

    /**
     * Convert amount on passed transaction output from BTC to another
     * currency.
     *
     * Fills the `amountAlt` property on the passed tx output object.
     *
     * @param {Object} output  Output in format:
     *              {amount: String, amountAlt: String, currencyAlt: String...}
     * @return {Promise}       Fulfilled when finished
     */
    $scope.convertToBtc = function (output) {
        var amountAlt = +output.amountAlt;
        if (!amountAlt) {
            output.amount = '';
            return;
        }
        getConversionRate(output.currencyAlt).then(function (rate) {
            output.amount = Math.round10(amountAlt / rate, -5).toString();
        });
    };

    /**
     * Convert amount on passed transaction output from another currency to
     * BTC.
     *
     * Fills the `amount` property on the passed tx output object.
     *
     * @param {Object} output  Output in format:
     *              {amount: String, amountAlt: String, currencyAlt: String...}
     * @return {Promise}       Fulfilled when finished
     */
    $scope.convertToAltCurrency = function (output) {
        var amount = +output.amount;
        if (!amount) {
            output.amountAlt = '';
            return;
        }
        getConversionRate(output.currencyAlt).then(function (rate) {
            output.amountAlt = Math.round10(amount * rate, -2).toString();
        });
    };

    /**
     * Get conversion rate between BTC and passed currency.
     *
     * @param {String} currency  Currency abbreviation; example: "USD"
     * @return {Float}           Convertsion rate
     */
    function getConversionRate(currency) {
        var url = [
            'https://api.coindesk.com/v1/bpi/currentprice/',
            currency,
            '.json'
        ].join('');
        return $http.get(url).then(function (res) {
            return res.data.bpi[currency].rate_float;
        });
    }

    /**
     * Get all currencies that we are able to convert to and from BTC.
     *
     * @return {Array}  List of currency abbrevs; example: ["USD", "GBP" ...]
     */
    function getSupportedAltCurrencies() {
        var url = 'https://api.coindesk.com/v1/bpi/supported-currencies.json';
        return $http.get(url).then(function (res) {
            return res.data.map(function (currency) {
                return currency.currency;
            });
        });
    }

});
