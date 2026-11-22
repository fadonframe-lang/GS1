/* PWA registration: fetch SW updates without relying on browser HTTP cache. */
'use strict';
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    // Avoid losing a pasted, unsaved marking code during automatic upgrades.
    const input = document.getElementById('code');
    if (input && input.value.trim()) {
      const status = document.getElementById('status');
      if (status) {
        status.textContent = 'Доступно обновление. Обновите страницу после сохранения кода.';
        status.hidden = false;
      }
      return;
    }
    refreshing = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {
      scope: './',
      updateViaCache: 'none'
    }).then(registration => registration.update()).catch(err => {
      console.warn('Offline cache unavailable:', err);
    });
  });
}
