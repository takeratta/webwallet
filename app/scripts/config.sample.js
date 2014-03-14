'use strict';

angular.module('webwalletApp').value('config', {
  // default coin name for new accounts
  coin: 'Bitcoin',
  // coin name -> backend endpoint
  backends: {
    'Bitcoin': 'https://mytrezor.com',
    'Testnet': 'http://test-api.bitsofproof.com:8080'
  },
  // coin name -> public address version
  versions: {
    'Bitcoin': 76067358,
    'Testnet': 70617039
  }
});
