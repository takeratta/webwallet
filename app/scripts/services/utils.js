'use strict';

// External modules

angular.module('webwalletApp')
  .value('_', window._)
  .value('BigInteger', window.BigInteger)
  .value('Crypto', window.Crypto)
  .value('Bitcoin', window.Bitcoin);

// Filters

angular.module('webwalletApp')
  .filter('sign', function () {
    return function (sign) {
      if (sign > 0) return '+';
      if (sign < 0) return '-';
      return '';
    };
  })
  .filter('amount', function (Bitcoin) {
    return function (val) {
      if (val)
        return Bitcoin.Util.formatValue(val);
    };
  })
  .filter('bip32Path', function () {
    return function (val) {
      return 'm/' + val.map(function(x) {
        return (x & 0x80000000) ? (x & 0x7FFFFFFF) + "'" : x;
      }).join('/');
    };
  });

// Utils module

angular.module('webwalletApp')
  .service('utils', function Utils(Crypto, Bitcoin, $q, $interval, $timeout) {

    //
    // codecs
    //

    var stringToBytes = Crypto.charenc.Binary.stringToBytes,
        bytesToString = Crypto.charenc.Binary.bytesToString,
        base64ToBytes = Crypto.util.base64ToBytes,
        bytesToBase64 = Crypto.util.bytesToBase64,
        hexToBytes = Bitcoin.Util.hexToBytes,
        bytesToHex = Bitcoin.Util.bytesToHex;

    function utf8ToHex(utf8) {
      var str = unescape(encodeURIComponent(utf8));
      return bytesToHex(stringToBytes(str));
    }

    function hexToUtf8(hex) {
      var str = bytesToString(hexToBytes(hex));
      return decodeURIComponent(escape(str));
    }

    this.stringToBytes = stringToBytes;
    this.bytesToString = bytesToString;

    this.base64ToBytes = base64ToBytes;
    this.bytesToBase64 = bytesToBase64;

    this.hexToBytes = hexToBytes;
    this.bytesToHex = bytesToHex;

    this.utf8ToHex = utf8ToHex;
    this.hexToUtf8 = hexToUtf8;

    //
    // hdnode
    //

    // decode private key from xprv base58 string to hdnode structure
    function xprv2node(xprv) {
      var bytes = Bitcoin.Base58.decode(xprv),
          hex = bytesToHex(bytes),
          node = {};

      if (hex.substring(90, 92) !== '00')
        throw new Error('Contains invalid private key');

      node.depth = parseInt(hex.substring(8, 10), 16);
      node.fingerprint = parseInt(hex.substring(10, 18), 16);
      node.child_num = parseInt(hex.substring(18, 26), 16);
      node.chain_code = hex.substring(26, 90);
      node.private_key = hex.substring(92, 156); // skip 0x00 indicating privkey

      return node;
    }

    // encode public key hdnode to xpub base58 string
    function node2xpub(node, version) {
      var hex, bytes, chck, xpub;

      hex = hexpad(version, 8)
        + hexpad(node.depth, 2)
        + hexpad(node.fingerprint, 8)
        + hexpad(node.child_num, 8)
        + node.chain_code
        + node.public_key;

      bytes = hexToBytes(hex);
      chck = Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true});
      xpub = Bitcoin.Base58.encode(bytes.concat(chck.slice(0, 4)));

      return xpub;

      function hexpad(n, l) {
        var s = parseInt(n).toString(16);
        while (s.length < l) s = '0' + s;
        return s;
      }
    }

    function node2address(node, type) {
      var pubkey = node.public_key,
          bytes = hexToBytes(pubkey),
          hash = Bitcoin.Util.sha256ripe160(bytes);

      return address2str(hash, type);
    }

    function address2str(hash, version) {
      var csum, bytes;

      hash.unshift(+version);
      csum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
      bytes = hash.concat(csum.slice(0, 4));

      return Bitcoin.Base58.encode(bytes);
    }

    function validateAddress(address, version) {
      var bytes, hash, csum;

      bytes = Bitcoin.Base58.decode(address);
      hash = bytes.slice(0, 21);
      csum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});

      return (csum[0] === bytes[21] &&
              csum[1] === bytes[22] &&
              csum[2] === bytes[23] &&
              csum[3] === bytes[24] &&
              hash[0] === +version);
    }

    this.xprv2node = xprv2node;
    this.node2xpub = node2xpub;
    this.node2address = node2address;
    this.validateAddress = validateAddress;

    //
    // promise utils
    //

    // returns a promise that gets notified every n msec
    function tick(n) {
      return $interval(null, n);
    }

    // keeps calling fn while the returned promise is being rejected
    // fn can cancel by returning falsey
    // if given delay, waits for delay msec before calling again
    // if given max, gives up after max attempts and rejects with
    // the latest error
    function endure(fn, delay, max) {
      var pr = fn();

      if (!pr)
        return $q.reject('Cancelled');

      return pr.then(null, function (err) {

        if (max !== undefined && max < 1) // we have no attempt left
          throw err;

        var retry = function () {
          return endure(fn, delay, max ? max - 1 : max);
        };

        return $timeout(retry, delay); // retry after delay
      });
    }

    this.tick = tick;
    this.endure = endure;

  });

// Flash messages

angular.module('webwalletApp')
  .factory('flash', function($rootScope, $timeout) {
    var messages = [];

    var reset;
    var cleanup = function() {
      $timeout.cancel(reset);
      reset = $timeout(function() { messages = []; });
    };

    var emit = function() {
      $rootScope.$emit('flash:message', messages, cleanup);
    };

    $rootScope.$on('$locationChangeSuccess', emit);

    var asMessage = function(level, text) {
      if (!text) {
        text = level;
        level = 'success';
      }
      return { level: level, text: text };
    };

    var asArrayOfMessages = function(level, text) {
      if (level instanceof Array) return level.map(function(message) {
        return message.text ? message : asMessage(message);
      });
      return text ? [{ level: level, text: text }] : [asMessage(level)];
    };

    var flash = function(level, text) {
      emit(messages = asArrayOfMessages(level, text));
    };

    ['error', 'warning', 'info', 'success'].forEach(function (level) {
      flash[level] = function (text) { flash(level, text); };
    });

    return flash;
  })

  .directive('flashMessages', function() {
    return {
      controller: function ($scope, $rootScope) {
        $rootScope.$on('flash:message', function (_, messages, done) {
          $scope.messages = messages;
          done();
        });
      },
      restrict: 'EA',
      replace: true,
      template:
        '<div ng-repeat="m in messages"' +
        '     ng-switch="m.level">' +
        '  <div class="alert alert-flash alert-danger"' +
        '       ng-switch-when="error"><h4 class="text-capitals">{{m.level}}!</h4> {{m.text}}</div>' +
        '  <div class="alert alert-flash alert-{{m.level}}"' +
        '       ng-switch-default><h4 class="text-capitals">{{m.level}}</h4> {{m.text}}</div>' +
        '</div>'
    };
  });

// QR code scanning

angular.module('webwalletApp')
  .value('jsqrcode', window.qrcode)
  .directive('qrScan', function (jsqrcode) {

    // TODO: do this locally
    window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                             navigator.mozGetUserMedia || navigator.msGetUserMedia;

    return {
      link: link,
      restrict: 'E',
      require: '?ngModel',
      template: '<video class="qrscan-video"></video>',
      scope: {
        interval: '='
      }
    };

    function link(scope, element, attrs, ngModel) {
      var interval = scope.interval || 1000,
          video = element.find('.qrscan-video')[0],
          canvas = document.createElement('canvas'),
          context = canvas.getContext('2d'),
          stream, value;

      if (!ngModel)
        throw new Error('ng-model attribute is required');

      if (!navigator.getUserMedia)
        throw new Error('getUserMedia is not supported');

      initVideo();

      scope.$on('$destroy', function() {
        if (!stream) return;
        stream.stop();
        stream = null;
      });

      function initVideo() {
        navigator.getUserMedia({ video: true },
          function (vs) {
            stream = vs;
            window.addEventListener('loadedmetadata', initCanvas, true);
            video.src = (window.URL && window.URL.createObjectURL(vs)) || vs;
          },
          function () {
            ngModel.$setViewValue(null);
          }
        );
      }

      function initCanvas() {
        video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        jsqrcode.callback = function (val) {
          value = val;
        };
        setTimeout(intervalTick, interval);
        window.removeEventListener('loadedmetadata', initCanvas, true);
      }

      function intervalTick() {
        if (value && value !== 'error decoding QR Code') {
          video.pause();
          stream.stop();
          scope.$apply(function () {
            ngModel.$setViewValue(value);
          });
        } else if (stream) {
          snapshotVideo();
          setTimeout(intervalTick, interval);
        }
      }

      function snapshotVideo() {
        context.drawImage(
          video,
          0, 0, video.videoWidth, video.videoHeight,
          0, 0, canvas.width, canvas.height
        );
        jsqrcode.decode(canvas.toDataURL());
      }
    }
  });
