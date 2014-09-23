/*global angular*/

/**
 * Device Service
 */
angular.module('webwalletApp')
    .service('deviceService', function (
            TrezorDevice, deviceList, $rootScope, $location) {

        'use strict';

        var _forgetModal = null,
            _forgetInProgress = false;

        this.EVENT_CONNECT = 'device.connect';
        this.EVENT_DISCONNECT = 'device.disconnect';

        // Broadcast connect and disconnect events for the Controller.
        deviceList.registerAfterInitHook(function sendConnectEvent(obj) {
            $rootScope.$broadcast(this.EVENT_CONNECT, obj.device);
        }.bind(this));
        deviceList.registerDisconnectHook(function sendDisconnectEvent(obj) {
            $rootScope.$broadcast(this.EVENT_DISCONNECT, obj.device);
        }.bind(this));

        // Before initialize hooks
        deviceList.registerBeforeInitHook(setupWatchPausing);
        deviceList.registerBeforeInitHook(setupEventBroadcast);

        // After initialize hooks
        deviceList.registerAfterInitHook(navigateToDeviceFromHomepage, 20);
        deviceList.registerAfterInitHook(initAccounts, 30);

        /**
         * Pause refreshing of the passed device list.  While the watching is
         * passed, webwallet will not register newly connected devices or
         * unregister the disconnected ones.
         *
         * TODO Explain why we need to pause watching dev. when sending events.
         *
         * @see DeviceList#_watch()
         * @see DeviceList#_progressWithConnected()
         * @see DeviceList#pauseWatch()
         * @see DeviceList#resumeWatch()
         *
         * @param {Object} obj  Device object:
         *                      {device: TrezorDevice, features: Object}
         */
        function setupWatchPausing(obj) {
            obj.device.on(TrezorDevice.EVENT_SEND,
                deviceList.pauseWatch.bind(deviceList));
            obj.device.on(TrezorDevice.EVENT_ERROR,
                deviceList.resumeWatch.bind(deviceList));
            obj.device.on(TrezorDevice.EVENT_RECEIVE,
                deviceList.resumeWatch.bind(deviceList));
        }

        /**
         * Broadcast all events on passed device to the Angular scope.
         *
         * @see broadcastEvent()
         *
         * @param {Object} obj  Device object:
         *                      {device: TrezorDevice, features: Object}
         */
        function setupEventBroadcast(obj) {
            TrezorDevice.EVENT_TYPES.forEach(function (type) {
                _broadcastEvent($rootScope, obj.device, type);
            });
        }

        /**
         * Broadcast an event on passed device to the Angular scope.
         *
         * The event type is prefixed with `TrezorDevice#EVENT_PREFIX`.
         *
         * @param {$scope} scope      Angular scope
         * @param {TrezorDevice} dev  Device
         * @param {String} type       Event type
         */
        function _broadcastEvent(scope, dev, type) {
            dev.on(type, function () {
                var args = [].slice.call(arguments);
                args.unshift(dev);
                args.unshift(TrezorDevice.EVENT_PREFIX + type);
                scope.$broadcast.apply(scope, args);
            });
        }

        /**
         * Initialize accounts on passed device.
         *
         * Throws Error if the initialization fails, thus aborting the flow.
         *
         * @param {Object} obj  Device object:
         *                      {device: TrezorDevice, features: Object}
         * @return {Promise}    Return value of
         *                      `TrezorDevice#initializeAccounts()`
         */
        function initAccounts(obj) {
            return obj.device.initializeAccounts();
        }

        /**
         * Navigate to a URL of passed device if the current URL is not
         * a device URL.
         *
         * @param {Object} obj  Device object:
         *                      {device: TrezorDevice, features: Object}
         */
        function navigateToDeviceFromHomepage(obj) {
            if ($location.path().indexOf('/device/') !== 0) {
                deviceList.navigateTo(obj.device);
            }
        }

        /**
         * Get previously stored reference to the Forget modal dialog.
         *
         * Forget modal is the dialog that is shown when the user disconnects
         * the device.  This dialog asks the user if he/she wants to forget the
         * device now that it is disconnected.
         *
         * @return {Object}  Angular modal dialog object
         */
        this.getForgetModal = function () {
            return _forgetModal;
        };

        /**
         * Store reference to the Forget modal dialog.
         *
         * @param {Object} forgetModal  Angular modal dialog object
         */
        this.setForgetModal = function (forgetModal) {
            _forgetModal = forgetModal;
        };

        /**
         * Set flag that marks if the Forget process is in progress.
         *
         * @param {Boolean} modalOpen  True if the process is in progress
         */
        this.isForgetInProgress = function () {
            return _forgetInProgress;
        };

        /**
         * Is the Forget process is in progress.?
         *
         * @return {Boolean}  True if the process is in progress
         */
        this.setForgetInProgress = function (forgetInProgress) {
            _forgetInProgress = forgetInProgress;
        };

    });
