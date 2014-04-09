'use strict';

angular.module('webwalletApp')
  .factory('TrezorAccount', function (config, utils, trezor, TrezorBackend,
      _, BigInteger, Bitcoin, $log, $q) {

    function TrezorAccount(id, coin, node) {
      this.id = ''+id;
      this.coin = coin;
      this.node = node;
      this.utxos = null;
      this.balance = null;
      this.transactions = null;

      this._deferred = null;
      this._offset = null;
      this._wallet = new Bitcoin.Wallet(coin.address_type);
      this._backend = TrezorBackend.singleton(coin);
    }

    TrezorAccount.deserialize = function (data) {
      return new TrezorAccount(
        data.id,
        data.coin,
        data.node
      );
    };

    TrezorAccount.prototype.serialize = function () {
      return {
        id: this.id,
        coin: this.coin,
        node: this.node
      };
    };

    TrezorAccount.prototype.isEmpty = function () {
      return !this.transactions || !this.transactions.length;
    };

    TrezorAccount.prototype.isInconsistent = function () {
      return !this.isEmpty() // is not empty
        && this.transactions // has txs loaded
        && this.balance // has balance loaded
        // balance of newest tx does not equal balance from server
        && !this.transactions[0].balance.equals(this.balance);
    };

    TrezorAccount.prototype.label = function () {
      return 'Account #' + (+this.id + 1);
    };

    TrezorAccount.prototype.address = function (n) {
      var index = this._offset + n,
          child = trezor.deriveChildNode(this.node, index),
          address = utils.node2address(child, this.coin.address_type);

      return {
        path: child.path,
        address: address,
        index: index
      };
    };

    TrezorAccount.prototype.publicKey = function () {
      return utils.node2xpub(this.node, config.versions[this.coin.coin_name]);
    };

    TrezorAccount.prototype.usedAddresses = function () {
      // TODO: rewrite this completely when we get rid if Bitcoin.Transaction
      var self = this,
          ret;

      // credit outputs
      ret = (self.transactions || []).filter(function (tx) {
        return tx.analysis && tx.analysis.type === 'recv';
      });

      // zip with summed matching utxos
      ret = ret.map(function (tx) {
        // TODO: consider taking utxos directly from the tx by looking up in
        // the wallet, instead of loading from the balance
        var utxos, balance;

        utxos = (self.utxos || []).filter(function (utxo) {
          return utxo.transactionHash === tx.hash;
        });

        balance = utxos.reduce(function (bal, utxo) {
          return bal.add(new BigInteger(
            utxo.value.toString()
          ));
        }, BigInteger.ZERO);

        return {
          path: utxos[0] ? utxos[0].path : null,
          address: tx.analysis.addr.toString(),
          timestamp: tx.timestamp,
          balance: balance
        };
      });

      // sort by address
      ret = ret.sort(function (a, b) {
        if (a.address > b.address) return 1;
        if (a.address < b.address) return -1;
        return 0;
      });

      // aggregate by address, sum balances
      ret = ret.reduce(function (xs, x) {
        var prev = xs[xs.length - 1];
        if (prev && prev.address === x.address)
          prev.balance = prev.balance.add(x.balance);
        else
          xs.push(x);
        return xs;
      }, []);

      // sort by timestamp in reverse
      ret = ret.sort(function (a, b) {
        if (a.timestamp > b.timestamp) return -1;
        if (a.timestamp < b.timestamp) return 1;
        return 0;
      });

      return ret;
    };

    //
    // Tx sending
    //

    TrezorAccount.prototype.sendTx = function (tx, device) {
      var self = this,
          uins, txs;

      // find unique inputs by tx hash
      uins = _.uniq(tx.inputs, 'prev_hash');

      // lookup txs referenced by inputs
      txs = uins.map(function (inp) {
        return self._backend.transaction(self.node, inp.prev_hash);
      });

      // convert to trezor structures
      txs = $q.all(txs).then(function (txs) {
        return txs.map(function (tx) {
          return {
            version: tx.version,
            inputs: tx.inputs.map(function (inp) {
              var val = {
                prev_hash: inp.sourceHash,
                prev_index: inp.ix,
                script_sig: utils.bytesToHex(utils.base64ToBytes(inp.script)),
              };
              if (inp.sequence > 0)
                val.sequence = inp.sequence;
              return val;
            }),
            bin_outputs: tx.outputs.map(function (out) {
              return {
                amount: out.value,
                script_pubkey: utils.bytesToHex(utils.base64ToBytes(out.script))
              };
            }),
            lock_time: tx.lockTime
          };
        });
      });

      // sign by device
      return txs.then(function (txs) {
        return device.signTx(tx, self.coin, txs).then(function (res) {
          var message = res.message,
              serializedTx = message.serialized_tx;
          return self._backend.send(serializedTx);
        });
      });
    };

    TrezorAccount.prototype.buildTx = function (address, amount, device) {
      var self = this,
          minAmount = 5430,
          scriptTypes = config.scriptTypes[self.coin.coin_name],
          addrVals, scriptType;

      addrVals = utils.decodeAddress(address);
      if (!addrVals)
        return $q.reject(new Error('Invalid address'));

      if (addrVals.version === +self.coin.address_type)
        scriptType = 'PAYTOADDRESS';
      if (!scriptType && scriptTypes && scriptTypes[addrVals.version])
        scriptType = scriptTypes[addrVals.version];
      if (!scriptType)
        return $q.reject(new Error('Invalid address version'));

      if (amount < minAmount)
        return $q.reject(new Error('Amount is too low'));

      return buildTx(0);

      function buildTx(feeAttempt) {
        var tx = self._constructTx(address, amount, scriptType, feeAttempt);

        if (!tx)
          return $q.reject(new Error('Not enough funds'));

        return device.measureTx(tx, self.coin).then(function (res) {
          var bytes = parseInt(res.message.tx_size, 10),
              kbytes = Math.ceil(bytes / 1000),
              space = tx.total - amount,
              fee = kbytes * config.feePerKb;

          if (fee <= space) { // we have a space for the fee, set it and return
            if (space - fee < minAmount) { // there is no need for a change address
              tx.outputs.pop();
              tx.fee = space;
            } else {
              tx.outputs[1].amount = space - fee;
              tx.fee = fee;
            }
            return tx;
          }

          return buildTx(fee); // try again with more inputs
        });
      }
    };

    TrezorAccount.prototype._constructTx = function (address, amount, stype, fee) {
      var tx = {},
          utxos = this._selectUtxos(amount + fee),
          chpath = this.node.path.concat([1]),
          total, change;

      if (!utxos)
        return;

      total = utxos.reduce(function (val, utxo) {return val + utxo.value;}, 0);
      change = total - amount - fee;

      tx.fee = fee;
      tx.total = total;
      tx.inputs = utxos.map(function (utxo) {
        return {
          prev_hash: utxo.transactionHash,
          prev_index: utxo.ix,
          address_n: utxo.path
        };
      });
      tx.outputs = [
        { // external output
          script_type: stype,
          address: address,
          amount: amount
        },
        { // change output
          script_type: 'PAYTOADDRESS',
          address_n: chpath,
          amount: change
        }
      ];

      return tx;
    };

    // selects utxos for a tx
    // with a block hash first, smallest first
    TrezorAccount.prototype._selectUtxos = function (amount) {
      var self = this,
          utxos = this.utxos.slice(),
          ret = [],
          retval = 0,
          i;

      utxos = utxos.sort(function (a, b) { // sort in reverse
        var txa = self._wallet.txIndex[a.transactionHash],
            txb = self._wallet.txIndex[b.transactionHash],
            hba = !!txa.block,
            hbb = !!txb.block,
            hd = hbb - hba,
            vd = b.value - a.value;
        return hd !== 0 ? hd : vd;
      });

      for (i = 0; i < utxos.length && retval < amount; i++) {
        ret.push(utxos[i]);
        retval += utxos[i].value;
      }

      if (retval >= amount)
        return ret;
    };

    //
    // Backend communication
    //

    TrezorAccount.prototype.subscribe = function () {
      var self = this;

      this._deferred = $q.defer();
      this._backend.connect()
        .then(
          function () {
            self._backend.subscribe(self.node,
              self._processBalanceDetailsUpdate.bind(self));
          },
          function (err) {
            self._deferred.reject(err);
          }
        );

      return this._deferred.promise;
    };

    TrezorAccount.prototype.unsubscribe = function () {
      this._backend.unsubscribe(this.node);
      this._deferred = null;
      return $q.when();
    };

    TrezorAccount.prototype._processBalanceDetailsUpdate = function (details) {
      $log.log('[account] Received', details.status, 'balance update for', this.label());

      // ignore pending balance details
      if (details.status === 'PENDING')
        return;

      // update the utxos and balance
      this.utxos = this._constructUtxos(details, this.node.path);
      this.balance = this._constructBalance(details);

      // load transactions
      this._backend.transactions(this.node).then(
        this._processTransactionsUpdate.bind(this));
    };

    TrezorAccount.prototype._processTransactionsUpdate = function (txs) {
      $log.log('[account] Received txs update for', this.label());

      // update the transactions, add them into the wallet
      this.transactions = this._constructTransactions(txs, this.node.path);
      this.transactions = this._indexTxs(this.transactions, this._wallet);
      this.transactions = this._analyzeTxs(this.transactions, this._wallet);
      this.transactions = this._balanceTxs(this.transactions);

      // update the address offset
      this._offset = this._incrementOffset(this.transactions, this._offset || 0);

      // the subscription is considered initialized now
      this._deferred.resolve();
    };

    TrezorAccount.prototype._constructUtxos = function (details, basePath) {
      return ['confirmed', 'change', 'sending', 'receiving']
        .map(function (k) {
          return details[k].map(function (out) {
            out.state = k;
            if (out.keyPathForAddress)
              out.path = basePath.concat(out.keyPathForAddress);
            return out;
          });
        })
        .reduce(function (xss, xs) { return xss.concat(xs); });
    };

    TrezorAccount.prototype._constructBalance = function (details) {
      return ['confirmed', 'change', 'receiving']
        .map(function (k) { return details[k]; })
        .reduce(function (xss, xs) { return xss.concat(xs); })
        .reduce(function (bal, out) {
          return bal.add(
            new BigInteger(out.value.toString())
          );
        }, BigInteger.ZERO);
    };

    TrezorAccount.prototype._constructTransactions = function (txs, basePath) {
      return txs.map(transaction);

      function transaction(tx) {
        var ret = new Bitcoin.Transaction({
          hash: tx.hash,
          version: tx.version,
          lock_time: tx.lockTime,
          timestamp: new Date(tx.blockTime).getTime(),
          block: tx.blockHash
        });
        ret.ins = tx.inputs.map(input);
        ret.outs = tx.outputs.map(output);
        return ret;
      }

      function input(inp) {
        return new Bitcoin.TransactionIn({
          outpoint: {
            hash: inp.sourceHash,
            index: inp.ix
          },
          script: inp.script,
          sequence: inp.sequence
        });
      }

      function output(out) {
        return new TrezorTransactionOut({
          script: out.script,
          value: out.value.toString(),
          index: out.ix,
          path: out.keyPathForAddress
            ? basePath.concat(out.keyPathForAddress)
            : null
        });
      }
    };

    TrezorAccount.prototype._indexTxs = function (txs, wallet) {
      txs.forEach(function (tx) {
        if (wallet.txIndex[tx.hash])
          return;

        // index tx by hash
        wallet.txIndex[tx.hash] = tx;

        // register sendable outputs
        tx.outs
          .filter(function (out) {return out.path;})
          .forEach(function (out) {
            var hash = utils.bytesToBase64(out.script.simpleOutPubKeyHash());
            wallet.addressHashes.push(hash);
          });
      });

      return txs;
    };

    TrezorAccount.prototype._analyzeTxs = function (txs, wallet) {
      txs.forEach(function (tx) {
        if (tx.analysis)
          return;
        try {
          // compute the impact of the tx on the wallet
          tx.analysis = tx.analyze(wallet);
          // compute the signed impact value
          if (tx.analysis.impact.value)
            tx.analysis.impact.signedValue = tx.analysis.impact.value.multiply(
              new BigInteger(tx.analysis.impact.sign.toString()));
        } catch (e) {
          tx.analysis = null;
        }
      });

      return txs;
    };

    TrezorAccount.prototype._balanceTxs = function (txs) {
      txs.sort(combineCmp([timestampCmp, typeCmp]));
      txs = _.uniq(txs, 'hash'); // HACK: backend returns duplicit txs
      txs.reduceRight(function (prev, curr) {
        if (!curr.analysis)
          return prev;
        curr.balance = curr.analysis.impact.signedValue.add(
          prev ? prev.balance : BigInteger.ZERO);
        return curr;
      }, null);

      return txs;

      function combineCmp(fns) {
        return function (a, b) {
          return fns.reduce(function (c, f) {
            return c ? c : f(a, b);
          }, 0);
        };
      }

      function timestampCmp(a, b) { // compares in reverse
        var x = +a.timestamp || Number.MAX_VALUE,
            y = +b.timestamp || Number.MAX_VALUE;
        if (x > y) return -1;
        if (x < y) return 1;
        return 0;
      }

      function typeCmp(a, b) {
        var map = ['sent', 'self', 'recv'],
            x = map.indexOf(a.analysis.type),
            y = map.indexOf(b.analysis.type);
        if (x > y) return 1;
        if (x < y) return -1;
        return 0;
      }
    };

    TrezorAccount.prototype._incrementOffset = function (txs, offset) {
      txs.forEach(function (tx) {
        tx.outs
          .filter(function (out) { return out.path; })
          .forEach(function (out) {
            var id = out.path[out.path.length-1];
            if (id >= offset)
              offset = id + 1;
          });
      });

      return offset;
    };

    // Decorator around Bitcoin.Transaction, contains BIP32 index and path

    function TrezorTransactionOut(data) {
      Bitcoin.TransactionOut.call(this, data);
      this.index = data.index;
      this.path = data.path;
    }

    TrezorTransactionOut.prototype = Object.create(Bitcoin.TransactionOut.prototype);

    TrezorTransactionOut.prototype.clone = function () {
      var val = Bitcoin.TransactionOut.clone.call(this);
      val.index = this.index;
      val.path = this.path;
      return val;
    };

    return TrezorAccount;

  });
