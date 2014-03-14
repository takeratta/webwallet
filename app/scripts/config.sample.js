'use strict';

angular.module('webwalletApp').value('config', {
  // default coin name for new accounts
  coin: 'Bitcoin',

  // coin name -> backend config
  backends: {
    Bitcoin: {
      endpoint: 'https://mytrezor.com',
      transport: 'long-polling'
    },
    Testnet: {
      endpoint: 'http://test-api.bitsofproof.com:8080',
      transport: 'websocket'
    }
  },

  // coin name -> public address version
  versions: {
    Bitcoin: 76067358,
    Testnet: 70617039
  }
});
