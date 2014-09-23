'use strict';

angular.module('webwalletApp')
  .controller('ImportCtrl', function (
    deviceList, TrezorDevice, TrezorAccount, config, utils, $scope) {

    $scope.coins = {
      Bitcoin: {
        address_type: "0",
        coin_name: "Bitcoin",
        coin_shortcut: "BTC",
        maxfee_kb: "10000"
      },
      Testnet: {
        address_type: "111",
        coin_name: "Testnet",
        coin_shortcut: "TEST",
        maxfee_kb: "10000000"
      }
    };

    $scope.settings = {
      id: randId()
    };

    function randId() {
      return '42';
    }

    $scope.importDevice = function () {
      var id = $scope.settings.id,
          pl = $scope.settings.payload,
          dev = new TrezorDevice(id),
          keys;

      console.log('[import] Importing device', id);
      deviceList.add(dev);

      keys = pl.match(/[^\r\n]+/g);
      if (!keys)
        return;
      keys = keys.map(function (k) {
        k = k.split(':');
        k = k[k.length - 1];
        k = k.trim();
        if (k.match(/\w+/))
          return k;
        return null;
      });

      keys.forEach(function (k, i) {
        console.log('[import] Importing account', k);

        var coin = $scope.coins[config.coin],
            path = dev.accountPath(i, coin),
            node = utils.xpub2node(k),
            acc;

        if (!node)
          return;
        node.path = path;
        acc = new TrezorAccount(i, coin, node);
        dev.accounts.push(acc);
        acc.subscribe();
      });
    };

  });
