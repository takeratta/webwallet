'use strict';

angular.module('webwalletApp')
  .value('firmwareListUrl', '/data/firmware/releases.json')
  .service('firmwareService', function FirmwareService(firmwareListUrl, $http) {

    var self = this;

    self.get = get;
    self.latest = latest;
    self.check = check;
    self.download = download;
    self.firmwareList = $http.get(firmwareListUrl);

    function get(features) {
      return [
        +features.major_version,
        +features.minor_version,
        +features.patch_version
      ];
    }

    function latest() {
      return self.firmwareList.then(function (res) {
        return res.data[0];
      });
    }

    function check(features) {
      return self.firmwareList.then(function (res) {
        return pick(features, res.data);
      });
    }

    function download(firmware) {
      return $http.get(firmware.url).then(function (res) {
        if (!validate(res.data))
          throw new Error('Downloaded firmware is invalid');
        return res.data;
      });
    }

    // Private

    function validate(firmware) {
      var magic = '54525a52'; // 'TRZR' in hex

      return (firmware.substr(0, magic.length) === magic) &&
             // * 2 because of hex
             (firmware.length >= 4096 * 2) &&
             (firmware.length <= 1024 * (512-64) * 2);
    }

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
