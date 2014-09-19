'use strict';

angular.module('webwalletApp')
  .value('storage', this.localStorage);

angular.module('webwalletApp')
    .value('temporaryStorage', {});
