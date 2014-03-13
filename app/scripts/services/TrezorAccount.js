'use strict';

angular.module('webwalletApp')
  .factory('TrezorAccount', function (utils, trezor, versions, TrezorBackend, TrezorBranch,
      _, BigInteger, Bitcoin, $q) {

    function TrezorAccount(id, coin, nodes) {
      this.id = ''+id;
      this.coin = coin;
      this.utxos = null;
      this.balance = null;
      this.transactions = null;
      this.node = nodes.main;

      this._feePerKb = 10000;
      this._wallet = new Bitcoin.Wallet(coin.address_type);
      this._backend = new TrezorBackend(coin);
      this._external = new TrezorBranch(nodes.external, this._backend);
      this._change = new TrezorBranch(nodes.change, this._backend);
    }

    TrezorAccount.deserialize = function (data) {
      return new TrezorAccount(
        data.id,
        data.coin,
        data.nodes
      );
    };

    TrezorAccount.prototype.serialize = function () {
      return {
        id: this.id,
        coin: this.coin,
        nodes: {
          main: this.node,
          external: this._external.node,
          change: this._change.node
        }
      };
    };

    TrezorAccount.prototype.isEmpty = function () {
      return !this.transactions || !this.transactions.length;
    };

    TrezorAccount.prototype.label = function () {
      return 'Account #' + (+this.id + 1);
    };

    TrezorAccount.prototype.address = function (n) {
      return this._external.address(n, this.coin);
    };

    TrezorAccount.prototype.publicKey = function () {
      return utils.node2xpub(this.node, versions[this.coin.coin_name]);
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
          var val = utxo.value.toString();
          return bal.add(new BigInteger(val));
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
        var hash = inp.prev_hash,
            branch = [self._external, self._change]
              [inp.address_n[inp.address_n.length-2]];
        return self._backend.lookupTx(branch.node, hash);
      });

      // convert to trezor structures
      txs = $q.all(txs).then(function (txs) {
        return txs.map(function (res) {
          var tx = res.data;
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
            outputs: tx.outputs.map(function (out) {
              return {
                amount: out.value,
                script_pubkey: utils.bytesToHex(utils.base64ToBytes(out.script))
              };
            })
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
          minAmount = 5430;

      if (!utils.validateAddress(address, self.coin.address_type))
        return $q.reject(new Error('Invalid address'));

      if (amount < minAmount)
        return $q.reject(new Error('Amount is too low'));

      return buildTx(0);

      function buildTx(feeAttempt) {
        var tx = self._constructTx(address, amount, feeAttempt);

        if (!tx)
          return $q.reject(new Error('Not enough funds'));

        return device.measureTx(tx, self.coin).then(function (res) {
          var bytes = parseInt(res.message.tx_size, 10),
              kbytes = Math.ceil(bytes / 1000),
              space = tx.total - amount,
              fee = kbytes * self._feePerKb;

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

    TrezorAccount.prototype._constructTx = function (address, amount, fee) {
      var tx = {},
          utxos = this._selectUtxos(amount + fee),
          chnode = this._change.node,
          choffset = this._change._offset,
          chpath = chnode.path.concat([choffset]),
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
          address: address,
          amount: amount,
          script_type: 'PAYTOADDRESS'
        },
        { // change output
          address_n: chpath,
          amount: change,
          script_type: 'PAYTOADDRESS'
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

    TrezorAccount.prototype.registerAndSubscribe = function () {
      var self = this;

      return self.register().then(function () {
        return self.subscribe();
      });
    };

    TrezorAccount.prototype.deregisterAndUnsubscribe = function () {
      this.unsubscribe();
      return this.deregister();
    };

    TrezorAccount.prototype.register = function () {
      return $q.all([
        this._external.register(),
        this._change.register()
      ]);
    };

    TrezorAccount.prototype.deregister = function () {
      return $q.all([
        this._external.deregister(),
        this._change.deregister()
      ]);
    };

    TrezorAccount.prototype.subscribe = function () {
      var handlers = {
        transactions: this._rollupTransactions.bind(this),
        utxos: this._rollupUtxos.bind(this)
      };

      return $q.all([
        this._external.subscribe(handlers),
        this._change.subscribe(handlers)
      ]);
    };

    TrezorAccount.prototype.unsubscribe = function () {
      this._external.unsubscribe();
      this._change.unsubscribe();
    };

    TrezorAccount.prototype._rollupUtxos = function () {
      var external = this._external._utxos,
          change = this._change._utxos;

      if (external && change) {
        this.utxos = external.concat(change);
        this.balance = this._constructBalance(this.utxos);
      }
    };

    TrezorAccount.prototype._rollupTransactions = function () {
      var external = this._external._transactions,
          change = this._change._transactions;

      if (external && change) {
        this.transactions = external.concat(change);
        this.transactions = this._mergeTxs(this.transactions);
        this.transactions = this._indexTxs(this.transactions, this._wallet);
      }
    };

    TrezorAccount.prototype._constructBalance = function (utxos) {
      return utxos.reduce(function (bal, txo) {
        return bal.add(new BigInteger(txo.value.toString()));
      }, BigInteger.ZERO);
    };

    TrezorAccount.prototype._mergeTxs = function (txs) {
      txs.sort(hashCmp);
      return txs.reduce(merge, []);

      function merge(txs, tx) {
        var prev = txs[txs.length - 1];
        if (prev && prev.hash === tx.hash) {
          tx.outs.forEach(function (out, i) {
            if (out.path != null)
              prev.outs[i].path = out.path;
          });
        } else
          txs.push(tx);
        return txs;
      }

      function hashCmp(a, b) {
        if (a.hash > b.hash) return 1;
        if (a.hash < b.hash) return -1;
        return 0;
      }
    };

    TrezorAccount.prototype._indexTxs = function (txs, wallet) {
      txs.forEach(index);
      txs.forEach(analyze);
      txs.sort(timestampCmp);
      txs.reduceRight(balance, null);

      return txs;

      function index(tx) {
        if (wallet.txIndex[tx.hash]) return;
        wallet.txIndex[tx.hash] = tx; // index tx by hash
        tx.outs
          .filter(function (out) {return out.path;})
          .forEach(function (out) { // register sendable outputs
            var hash = utils.bytesToBase64(out.script.simpleOutPubKeyHash());
            wallet.addressHashes.push(hash);
          });
      }

      function analyze(tx) {
        if (tx.analysis) return;
        try {
          tx.analysis = tx.analyze(wallet);
        } catch (e) {
          tx.analysis = null;
        }
      }

      function balance(prev, curr) {
        var sign, val;
        if (!curr.analysis) return prev;
        sign = new BigInteger(curr.analysis.impact.sign.toString());
        val = curr.analysis.impact.value.multiply(sign);
        curr.balance = val.add(prev ? prev.balance : BigInteger.ZERO);
        return curr;
      }

      function timestampCmp(a, b) { // compares in reverse
        var ta = +a.timestamp,
            tb = +b.timestamp;
        if (!ta) return -1;
        if (!tb) return 1;
        if (ta > tb) return -1;
        if (ta < tb) return 1;
        return 0;
      }
    };

    return TrezorAccount;

  });
