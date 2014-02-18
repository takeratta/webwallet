'use strict';

// jshint curly:false, camelcase:false, latedef:nofunc

angular.module('webwalletApp')
  .value('firmwareListUrl', '/data/firmware.json')
  .service('firmwareService', function FirmwareService(firmwareListUrl, $http) {

    var self = this;

    self.get = get;
    self.check = check;
    self.download = download;
    self.firmwareList = $http.get(firmwareListUrl);

    function get(features) {
      return [
        +features.major_version,
        +features.minor_version,
        +features.bugfix_version
      ];
    }

    function check(features) {
      return self.firmwareList.then(function (res) {
        return pick(features, res.data);
      });
    }

    function download(firmware) {
      return $http.get(firmware.url).then(function (res) {
        return res.data;
      });
    }

    // Private

    function pick(features, list) {
      var firmware = list[0],
          version = get(features),
          i;

      if (!firmware) // no firmware available
        return;

      if (versionCmp(firmware.version, version) < 1) // features are up to date
        return;

      for (i = 0; i < list.length; i++) { // collect required flags
        if (versionCmp(list[i], features) === 0)
          break;
        if (list[i].required) {
          firmware.required = true;
          break;
        }
      }

      return firmware;
    }

    function versionCmp(a, b) {
      if (a[0]-b[0]) return a[0]-b[0];
      if (a[1]-b[1]) return a[1]-b[1];
      if (a[2]-b[2]) return a[2]-b[2];
      return 0;
    }

  });