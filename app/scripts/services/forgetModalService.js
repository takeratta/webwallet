/*global angular*/

angular.module('webwalletApp').service('forgetModalService', function (
    $rootScope,
    modalOpener,
    $modal) {

    'use strict';

    
    this.openModal=null;

    this.showDisconnectedModal=function($scope, device, deviceList){
        if (this.openModal!=null) {
            //note - this window can be already closed, but it doesn't matter
            //if it's closed once, it's already 
            this.openModal.close('other');
        }

        var opened= modalOpener.openModal($scope, 'forget.disconnected');
        var modal=opened.modal;
        this.openModal=modal;
        
        var self=this;
        modal.result
                .then(function (result) {
                    if (result==='other') {
                        //closed by other forget window
                        //=>nothing happens (not forgetting, but also not remembering "remember")
                        //device.forgetOnDisconnect should stay null
                    } else if (result==='remember') {
                        device.forgetOnDisconnect = false;
                        //user clicked on "remember"
                    } else if (result==='forget') {
                        //user clicked on "forget"
                        device.forgetOnDisconnect = true;
                        deviceList.forget(device);
                    }

                });
        
    }

});
