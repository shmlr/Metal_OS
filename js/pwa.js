(function(){
  'use strict';
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./service-worker.js').catch(function(err){
        console.warn('Metal OS service worker registration failed:', err);
      });
    });
  }
})();
