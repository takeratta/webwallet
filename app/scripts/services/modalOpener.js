/*global angular*/

angular.module('webwalletApp').service('modalOpener', function (
    $rootScope,
    $modal) {

    'use strict';
    
    /**
     * Opens modal window. 
     *
     * Modal window should have options "yes" and "no" (or similar), where
     * "yes" is binded to "close()" and "no" to "dismiss()".
     *
     * Returns a promise that is resolved if the user chooses "yes"
     * and failed if the user chooses "no"
     *
     * @return {Promise}
     */
    this.openModal=function(scope, name,size,extendScope,allowBackspace) {

        
        var windowClass=name.replace(".","-","g")+"modal";
        if (typeof extendScope==="undefined") {
            extendScope={};
        }
        if (typeof allowBackspace==="undefined") {
            allowBackspace=false;
        }

        scope = angular.extend(scope.$new(),extendScope);
        var modal = $modal.open({
            templateUrl: 'views/modal/'+name+'.html',
            backdrop: 'static',
            keyboard: false,
            scope:scope,
            size:size,
            windowClass:windowClass
        });
        modal.opened.then(function () {
            scope.$emit('modal.'+name+'.show');
        });
        modal.result.finally(function () {
            scope.$emit('modal.'+name+'.hide');
        });

        if (!allowBackspace) {
            this.stopBackpaceOnModal(modal)
        }

        return {result: modal.result, modal:modal, scope:scope};
    }

    /****
     * Stop backspace on already existing modal window
     *
     * It is called in openModal, but can be called from anywhere else
     * (for example, it's called in firmware.js or setup.js)
     */
    this.stopBackpaceOnModal=function(modal){
        modal.opened.then(function(){
            stopBackspace();
        })
        modal.result.finally(function () {
            resumeBackspace();
        })
    }

    function stopBackspace()  {
        $(document).unbind('keydown.modalOpener').bind('keydown.modalOpener', function (event) { 
            var doPrevent = false;
            if (event.keyCode === 8) {
                var d = event.srcElement || event.target;
                if ((d.tagName.toUpperCase() === 'INPUT' && 
                    (
                        d.type.toUpperCase() === 'TEXT' ||
                        d.type.toUpperCase() === 'PASSWORD' || 
                        d.type.toUpperCase() === 'FILE' || 
                        d.type.toUpperCase() === 'EMAIL' || 
                        d.type.toUpperCase() === 'SEARCH' || 
                        d.type.toUpperCase() === 'DATE' )
                    ) || 
                    d.tagName.toUpperCase() === 'TEXTAREA') {
                    doPrevent = d.readOnly || d.disabled;
                }
                else {
                    doPrevent = true;
                }
            }

            if (doPrevent) {
                event.preventDefault();
            }
        })
    }

    function resumeBackspace()  {
        $(document).unbind('keydown.modalOpener').bind('keydown.modalOpener', function (event) { 
        })
    }
});
