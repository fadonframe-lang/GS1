/* Install support. No extra permanent UI elements (keeps the v4 layout). */
'use strict';
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(err => {
      console.warn('Offline cache unavailable:', err);
    });
  });
}
