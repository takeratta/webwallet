/*global angular*/

angular.module('webwalletApp').service('forgetModalService', function (
    $rootScope,
    modalOpener,
    $modal) {

    'use strict';

    
    this.openModal=null;

    this.closeOpen=function(device) {
        if (this.openModal!=null) {
            //note - this window can be already closed, but it doesn't matter
            //if it's closed once, the result is already set
            if (this.openModal.device.id!==device.id) {
                this.openModal.modal.close('force-other');
            } else {
                this.openModal.modal.close('force-same');
            }
        }
        this.openModal=null;

    }

    this.showDisconnectedModal=function($scope, device, deviceList){

        var shouldOpen=true;
        if (this.openModal!=null){
            if (device.id===this.openModal.device.id && this.openModal.type==="requested") {
                //dont open disconnect modal when requested one device and then the same one disconnected
                shouldOpen=false;
            }
        }

        this.closeOpen(device);
        if (!shouldOpen) {
            return; 
        }

        var opened= modalOpener.openModal($scope, 'forget.disconnected',"md",{"device":device});
        this.openModal={modal:opened.modal,device:device, type:"disconnected"}
         
        opened.modal.result
                .then(function (result) {
                    if (result==='force-other' || result==='force-same') {
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

    this.showRequestedModal=function($scope, device, deviceList) {
        this.closeOpen(device);

        var opened= modalOpener.openModal($scope, "forget.requested","md",{"device":device});
        this.openModal={modal:opened.modal,device:device, type:"requested"}
 
        opened.modal.result
            .then(function (result) {
                if (result==='forget' || result==='force-same') {
                    //forget -> just forget
                    //force-same -> if you click on "forget" and then disconnect, you should assume the user wants to forget 
                    device.forgetOnDisconnect = true;
                    deviceList.forget(device);
                } else if (result==='dont-forget' || result==='force-other') {
                    //not forget=>nothing happens (not even setting "remember")
                    //other device disconnected => hell if I know how to interpret that 
                    //      (user clicks on "forget" then connect and disconnect ANOTHER device)
                    //          it wont happen often=>just dont do anything
                }
            });
  
    }

});
