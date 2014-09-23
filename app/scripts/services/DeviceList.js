/*global angular*/

angular.module('webwalletApp')
.factory('deviceList', function (
        _, $q, config, utils, flash,
        transport,
        TrezorDevice, DeviceStorage, $location) {

    'use strict';

    /**
     * Device list
     */
    function DeviceList() {
        // Load devices from localStorage
        this._restore();

        // Watch for newly connected and disconnected devices
        this._watch(this.POLLING_PERIOD);
    }

    DeviceList.prototype.STORAGE_DEVICES = 'trezorDevices';
    DeviceList.prototype.STORAGE_VERSION = 'trezorVersion';
    DeviceList.prototype.POLLING_PERIOD = 1000;

    DeviceList.prototype.DEFAULT_HOOK_PRIORITY = 50;
    DeviceList.prototype.DEFAULT_HOOK_NAME = 'anonymouse';

    DeviceList.prototype._devices = [];

    DeviceList.prototype._watchPaused = false;

    DeviceList.prototype._beforeInitHooks = [];
    DeviceList.prototype._afterInitHooks = [];
    DeviceList.prototype._disconnectHooks = [];

    DeviceList.prototype._restore = function () {
        // Initialize the device storage
        this._storage = new DeviceStorage({
            type: TrezorDevice,
            version: config.storageVersion,
            keyItems: this.STORAGE_DEVICES,
            keyVersion: this.STORAGE_VERSION
        });

        // Load devices from the storage
        this._devices = this._storage.init();

        // Initialize all devices
        this._devices.forEach(function (dev) {
            dev.init();
        });
    };

    /**
     * Find a device by passed device ID or device descriptor
     *
     * @param {String|Object} id         Device ID or descriptor in format
     *                                   {id: String, path: String}
     * @return {TrezorDevice|undefined}  Device or undefined if not found
     */
    DeviceList.prototype.get = function (desc) {
        var search;
        if (desc.id) {
            search = {id: desc.id};
        } else if (desc.path) {
            /*
             * The TrezorDevice object is structured in such a way that
             * the descriptor path is stored in the `id` property, that is
             * why we are assigning `desc.path` to `id` here.
             */
            search = {id: desc.path};
        } else if (desc) {
            search = {id: desc};
        } else {
            return;
        }
        return _.find(this._devices, search);
    };

    /**
     * Add a new device to the device list
     *
     * @param {TrezorDevice} dev  Device to add
     */
    DeviceList.prototype.add = function (dev) {
        this._devices.push(dev);
    };

    /**
     * Get the default device
     *
     * That is currently the first device.
     *
     * @return {TrezorDevice}  Default device
     */
    DeviceList.prototype.getDefault = function () {
        return this._devices[0];
    };

    /**
     * Get all devices
     *
     * @return {Array of TrezorDevice}  All devices
     */
    DeviceList.prototype.all = function () {
        return this._devices;
    };

    /**
     * Get the total number devices
     *
     * @return {Number}  Number of devices
     */
    DeviceList.prototype.count = function () {
        return this._devices.length;
    };

    /**
     * Remove a device from the device list (and subsequently from the storage)
     *
     * @param {TrezorDevice} dev  Device to remove
     */
    DeviceList.prototype.remove = function (dev) {
        dev.destroy();
        _.remove(this._devices, { id: dev.id });
    };

    /**
     * Alias to `DeviceList#remove()`
     *
     * @see DeviceList#remove()
     */
    DeviceList.prototype.forget = DeviceList.prototype.remove;

    /**
     * Start auto-updating the device list -- watch for newly connected
     * and disconnected devices.
     *
     * Broadcast event `device.connect(devId)` or `device.disconnect(devId)`
     * everytime a device is connected / disconnected.  We pass only ID of the
     * Device and not the whole Device object as a param to these events on
     * purpose, because if we pass the Device object it gets spoiled by
     * Angular.js and it needs to be retreived from `TrezorService#get()`
     * anyway.
     *
     * @param {Number} n  Polling period in miliseconds
     * @return {Promise}  Ticking Promise
     */
    DeviceList.prototype._watch = function (n) {
        var tick = utils.tick(n),
            delta = this._progressWithDescriptorDelta(
                this._progressWithConnected(tick)
            );

        delta.then(null, null, function (dd) {
            if (!dd) {
                return;
            }
            dd.added.forEach(this._connect.bind(this));
            dd.removed.forEach(this._disconnect.bind(this));
        }.bind(this));

        return tick;
    };

    DeviceList.prototype.pauseWatch = function () {
        this._watchPaused = true;
    };

    DeviceList.prototype.resumeWatch = function () {
        this._watchPaused = false;
    };

    /**
     * Maps a promise notifications with connected device descriptors.
     *
     * Expects a Promise as an argument and returns a new Promise.  Each time
     * passed Promise is fulfilled, the returned Promise is fulfilled aswell
     * with a list of devices as a result.
     *
     * Passed Promise is expected to tick -- get periodically fulfilled over
     * and over again.
     *
     * @see DeviceList#_progressWithDescriptorDelta()
     *
     * @param {Promise} pr  Promise expected to tick
     * @return {Promise}  Promise fulfilled with a list of devices as a result
     */
    DeviceList.prototype._progressWithConnected = function (pr) {
        var res = $q.defer(),
            inProgress = false;

        pr.then(null, null, function () {
            if (this._watchPaused || inProgress) {
                return;
            }

            inProgress = true;
            transport.enumerate()
                .then(function (devices) {
                    res.notify(devices.map(function (dev) {
                        if (!dev.id && dev.serialNumber) {
                            dev.id = dev.serialNumber;
                        }
                        return dev;
                    }));
                })
                .then(
                    function () {
                        inProgress = false;
                    },
                    function () {
                        inProgress = false;
                    }
                );
        }.bind(this));

        return res.promise;
    };

    /**
     * Maps a promise notifications with a delta between the current and
     * previous device descriptors.
     *
     * Expects a Promise as an argument and returns a new Promise.  Passed
     * Promise is expected to return a current list of device as its result.
     * Each time passed Promise is fulfilled, the returned Promise is fulfilled
     * aswell with an Object describing the difference between the current list
     * of devices and the list of devices that was passed to this method when
     * it was previously called.
     *
     * @see DeviceList#_progressWithConnected()
     * @see DeviceList#_computeDescriptorDelta()
     *
     * @param {Promise} pr  Promise expected to have a list of device
     *                      descriptors as a result
     * @return {Promise}    Promise fulfilled with an Object describing the
     *                      added and removed devices as a result
     */
    DeviceList.prototype._progressWithDescriptorDelta = function (pr) {
        var prev = [],
            tmp;

        return pr.then(null, null, function (curr) {
            if (!curr) {
                return;
            }
            tmp = prev;
            prev = curr;
            return this._computeDescriptorDelta(tmp, curr);
        }.bind(this));
    };

    /**
     * Computes which devices were added and which were removed in current tick
     *
     * Returns an Object with two properties:
     * `added`: Array of added device descriptors
     * `removed`: Array of removed device descriptors
     *
     * @param {Array} xs  Old list of device descriptors
     * @param {Array} ys  New list of device descriptors
     * @return {Object}   Difference in format {added: Array, removed: Array}
     */
    DeviceList.prototype._computeDescriptorDelta = function (xs, ys) {
        return {
            added: _.filter(ys, function (y) {
                return !_.find(xs, { id: y.id });
            }),
            removed: _.filter(xs, function (x) {
                return !_.find(ys, { id: x.id });
            })
        };
    };

    /**
     * Marks the device of the passed descriptor as connected and calls the
     * before initialize and after initialize hooks.
     *
     * @param {Object} desc  Device descriptor in format
     *                       {id: String, path: String}
     */
    DeviceList.prototype._connect = function (desc) {
        // Get device object...
        var dev = this.get(desc);
        // or create a new one.
        if (!dev) {
            dev = this._create(desc);
            this.add(dev);
        }

        dev.withLoading(function () {
            return transport.acquire(desc)
                // Get session object from the transport service.
                .then(function (res) {
                    return transport.getSession(res.session);
                })

                // Run low-level connect routine.
                .then(function (session) {
                    dev.connect(session);
                    return {device: dev, feature: null};
                })

                // Execute before initialize hooks.
                .then(this._execHooks(this._beforeInitHooks))

                // Run low-level initialize routine.
                .then(function (obj) {
                    return obj.device.initializeDevice();
                })

                // Was low-level initialization succesfull?
                .then(
                    // If it was, then set params for the following hooks.
                    function (features) {
                        return {device: dev, features: features};
                    },
                    // If it wasn't, then disconnect the device.
                    function (e) {
                        dev.disconnect();
                        throw e;
                    }
                )

                // Execute after initialize hooks.
                .then(this._execHooks(this._afterInitHooks))

                // Show error message if something failed.
                .catch(function (err) {
                    flash.error(err.message || 'Loading device failed');
                });
        }.bind(this));
    };

    /**
     * Register hook
     *
     * @param {Array} list         List of hooks to which the new hook will be
     *                             added
     * @param {Function} fn        Function
     * @param {Number} [priority]  Hooks with lower priority are executed first
     * @param {Name} [name]        Hook name
     */
    DeviceList.prototype._registerHook = function (list, fn, priority, name) {
        list.push({
            fn: fn,
            priority: priority || this.DEFAULT_HOOK_PRIORITY,
            name: name || fn.name || this.DEFAULT_HOOK_NAME
        });
    };

    /**
     * Execute passed hooks
     *
     * @param {Array} hooks  Hooks
     */
    DeviceList.prototype._execHooks = function (hooks) {
        return function (param) {
            var deferred = $q.defer(),
                len = hooks.length;

            hooks = this._sortHooks(hooks);

            function next(i) {
                var res;

                if (i === len) {
                    deferred.resolve(param);
                    return;
                }

                res = hooks[i].fn.apply(window, [param]);
                if (res !== undefined) {
                    $q.when(res).then(function () {
                        next(i + 1);
                    },
                    function (e) {
                        deferred.reject(e);
                    });
                } else {
                    next(i + 1);
                }
            }

            next(0);

            return deferred.promise;
        }.bind(this);
    };

    /**
     * Register before initialize hook
     *
     * @param {Function} fn        Function
     * @param {Number} [priority]  Hooks with lower priority are executed first
     * @param {Name} [name]        Hook name
     */
    DeviceList.prototype.registerBeforeInitHook =
        function (fn, priority, name) {
            this._registerHook(this._beforeInitHooks, fn, priority, name);
        };

    /**
     * Register after initialize hook
     *
     * @param {Function} fn        Function
     * @param {Number} [priority]  Hooks with lower priority are executed first
     * @param {Name} [name]        Hook name
     */
    DeviceList.prototype.registerAfterInitHook =
        function (fn, priority, name) {
            this._registerHook(this._afterInitHooks, fn, priority, name);
        };

    /**
     * Register disconnect hook
     *
     * @param {Function} fn        Function
     * @param {Number} [priority]  Hooks with lower priority are executed first
     * @param {Name} [name]        Hook name
     */
    DeviceList.prototype.registerDisconnectHook =
        function (fn, priority, name) {
            this._registerHook(this._disconnectHooks, fn, priority, name);
        };

    /**
     * Create new device from passed descriptor.
     *
     * @param {Object} desc    Device descriptor in format
     *                         {id: String, path: String}
     * @return {TrezorDevice}  Created device
     */
    DeviceList.prototype._create = function (desc) {
        return new TrezorDevice(desc.id || desc.path);
    };

    /**
     * Marks a device of the passed descriptor as disconnected.
     *
     * Execute disconnect hooks.
     *
     * @param {String} desc  Device descriptor
     */
    DeviceList.prototype._disconnect = function (desc) {
        var dev = this.get(desc);
        if (!dev) {
            return;
        }
        dev.disconnect();
        return $q.when({device: dev, features: dev.features})
            .then(this._execHooks(this._disconnectHooks));
    };

    /**
     * Go to the URL of passed device.
     *
     * Do nothing if we are already on that URL.
     *
     * @param {TrezorDevice} dev  Device
     */
    DeviceList.prototype.navigateTo = function (dev) {
        var path = '/device/' + dev.id;

        if ($location.path().indexOf(path) !== 0) {
            $location.path(path);
        }
    };

    /**
     * Sort passed hooks by priority in ascending order -- lowest priority
     * first.
     *
     * @param {Array} hooks  Hooks
     * @return {Array}       Hooks sorted by priority
     */
    DeviceList.prototype._sortHooks = function (hooks) {
        return _.sortBy(hooks, function (hook) {
            return hook.priority;
        });
    };

    return new DeviceList();

});
