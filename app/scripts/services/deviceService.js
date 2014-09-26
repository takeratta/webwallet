/*global angular*/

/**
 * Device Service
 *
 * Perform various actions when a device is connected / disconnected.
 *
 * Device-related actions that should be performed as a result of a direct
 * user interaction are (and always should be) handled the Device Controller.
 *
 * The only way how this Device Service communicates with the Device Controller
 * is by broadcasting events to Angular's scope.
 *
 * On device connect:
 *
 * - Navigate to the Device URL (if we are on homepage).
 * - Initialize accounts.
 * - Pause device list watching while we communicate with the device.
 *
 * On device disconnect:
 *
 * - Do nothing.
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
        deviceList.registerAfterInitHook(function sendConnectEvent(dev) {
            $rootScope.$broadcast(this.EVENT_CONNECT, dev);
        }.bind(this));
        deviceList.registerDisconnectHook(function sendDisconnectEvent(dev) {
            $rootScope.$broadcast(this.EVENT_DISCONNECT, dev);
        }.bind(this));

        // Before initialize hooks
        deviceList.registerBeforeInitHook(setupWatchPausing);
        deviceList.registerBeforeInitHook(setupEventBroadcast);

        // After initialize hooks
        deviceList.registerAfterInitHook(navigateToDeviceFromHomepage, 20);
        deviceList.registerAfterInitHook(initAccounts, 30);

        /**
         * Pause refreshing of the passed device while a communicate with the
         * device is in progress.  While the watching is passed, webwallet will
         * not add / remove the device from the device when
         * it's connected / disconnected, nor will it execute any hooks.
         *
         * @see DeviceList#_connnect()
         * @see DeviceList#_disconnect()
         * @see DeviceList#_progressWithConnected()
         *
         * @param {TrezorDevice} dev  Device object
         */
        function setupWatchPausing(dev) {
            dev.on(TrezorDevice.EVENT_SEND,
                deviceList.pauseWatch.bind(deviceList));
            dev.on(TrezorDevice.EVENT_ERROR,
                deviceList.resumeWatch.bind(deviceList));
            dev.on(TrezorDevice.EVENT_RECEIVE,
                deviceList.resumeWatch.bind(deviceList));
        }

        /**
         * Broadcast all events on passed device to the Angular scope.
         *
         * @see  _broadcastEvent()
         *
         * @param {TrezorDevice} dev  Device
         */
        function setupEventBroadcast(dev) {
            TrezorDevice.EVENT_TYPES.forEach(function (type) {
                _broadcastEvent($rootScope, dev, type);
            });
        }

        /**
         * Broadcast an event of passed type on passed device to
         * the Angular scope.
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
         * @param {TrezorDevice} dev  Device object
         * @return {Promise}          Return value of
         *                            `TrezorDevice#initializeAccounts()`
         */
        function initAccounts(dev) {
            return dev.initializeAccounts();
        }

        /**
         * Navigate to a URL of passed device if the current URL is not
         * a device URL (that means we are on the homepage).
         *
         * @param {TrezorDevice} dev  Device object
         */
        function navigateToDeviceFromHomepage(dev) {
            if ($location.path().indexOf('/device/') !== 0) {
                deviceList.navigateTo(dev);
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
         * Is the Forget process is in progress?
         *
         * @return {Boolean}  True if the forget process is in progress
         */
        this.setForgetInProgress = function (forgetInProgress) {
            _forgetInProgress = forgetInProgress;
        };

    });
