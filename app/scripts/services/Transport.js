/*global angular*/

angular.module('webwalletApp')
    .factory('transport', function (
            $q, $rootScope,
            config, trezor, trezorApi) {

        'use strict';

        /**
         * Trezor Transport
         *
         * Plugin and Bridge wrapper that is prepared to handle Plugin / Bridge
         * not being present al all times.
         */
        var Transport = function () {};

        Transport.prototype._api = null;
        Transport.prototype._trezor = null;

        /**
         * Load transport and store the reference to `window.trezor` and to the
         * `trezorApi` to private properties `this#_api` and `this#_trezor`.
         *
         * @return {Promise}  Promise resolved when both properties are filled
         */
        Transport.prototype._load = function () {
            var deferred = $q.defer();
            if (this._api === null || this._trezor === null) {
                this._api = trezorApi;
                this._trezor = trezor;

                if (trezor instanceof trezorApi.PluginTransport) {
                    $rootScope.deprecatePlugin = config.deprecatePlugin;
                    $rootScope.usingPluginTransport = true;
                    $rootScope.installers = trezorApi.installers();
                    $rootScope.installers.forEach(function (inst) {
                        if (inst.preferred) {
                            $rootScope.selectedInstaller = inst;
                        }
                    });
                }
            }
            deferred.resolve();
            return deferred.promise;
        };

        /**
         * Get trezor transport API -- `window.trezor` and `trezorApi`.
         *
         * @return {Promise}  Resolved with value:
         *                    {api: trezorApi, trezor: window.trezor}
         */
        Transport.prototype._getApi = function () {
            return this._load().then(function () {
                return {api: this._api, trezor: this._trezor};
            }.bind(this));
        };

        /**
         * Get trezor transport session to be used in `TrezorDevice#connect()`
         * for example.
         *
         * @param {String} sessionId  Session ID
         * @return {Promise}          Resolved with value: Session object
         */
        Transport.prototype.getSession = function (sessionId) {
            return this._getApi().then(function (res) {
                return new res.api.Session(res.trezor, sessionId);
            });
        };

        /**
         * Enumerate devices -- `trezor.enumerate()` wrapper.
         *
         * @return {Promise}  Same as `trezor.enumerate()`
         */
        Transport.prototype.enumerate = function () {
            return this._getApi().then(function (res) {
                return res.trezor.enumerate();
            });
        };

        /**
         * Acquire transport -- `trezor.acquire()` wrapper.
         *
         * @param {Object} desc  Device descriptor
         * @return {Promise}     Same as `trezor.acquire()`
         */
        Transport.prototype.acquire = function (desc) {
            return this._getApi().then(function (res) {
                return res.trezor.acquire(desc);
            });
        };

        return new Transport();

    });
