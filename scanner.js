/* Автономный сканер: использует встроенный BarcodeDetector Chrome/Android.
   Не обращается к сети. Не загружает сторонних скриптов. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const video = $('scan-video');
  const wrap = $('video-wrap');
  const status = $('scan-status');
  const controls = $('camera-controls');
  const start = $('scan-start');
  const stop = $('scan-stop');
  const picker = $('pick-image');
  const fileInput = $('scan-file');
  let detector = null, stream = null, running = false, rafId = 0, busy = false;
  let lastAttempt = 0;
  function say(msg, err = false) { status.textContent = msg; status.className = 'status' + (err ? ' error' : ''); status.hidden = !msg; }
  async function getDetector() {
    if (detector) return detector;
    if (!('BarcodeDetector' in window)) throw new Error('Этот браузер не поддерживает BarcodeDetector. Для сканирования попробуйте актуальный Chrome на Android.');
    if (typeof BarcodeDetector.getSupportedFormats === 'function') {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes('data_matrix')) throw new Error('Браузер поддерживает сканирование штрихкодов, но DataMatrix недоступен.');
    }
    detector = new BarcodeDetector({ formats: ['data_matrix'] });
    return detector;
  }
  function closeCamera() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
    video.pause(); video.srcObject = null; wrap.hidden = true; controls.hidden = true;
    start.disabled = false; stop.disabled = true;
  }
  function decoded(value) {
    if (!value) return false;
    closeCamera();
    // Вставляем ровно строку, возвращенную декодером, включая ASCII 29.
    // Парсер генератора уже умеет работать с GS и начальными разделителями.
    $('code').value = value;
    $('generate').click();
    if ($('result').hidden) {
      say('DataMatrix считан, но его структура отличается от ожидаемых групп 01/21/91/92. Исходная строка оставлена в поле.', true);
    } else {
      say('');
    }
    if (navigator.vibrate) navigator.vibrate(100);
    $('result').hidden ? $('code').scrollIntoView({ behavior: 'smooth', block: 'nearest' }) : $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  }
  async function loop(timestamp) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (busy || video.readyState < 2 || timestamp - lastAttempt < 180) return;
    lastAttempt = timestamp; busy = true;
    try {
      const found = await detector.detect(video);
      if (running) {
        const match = found.find(x => x.format === 'data_matrix' && x.rawValue);
        if (match) decoded(match.rawValue);
      }
    } catch (e) {
      if (running) { closeCamera(); say('Ошибка чтения камеры: ' + (e.message || e), true); }
    } finally { busy = false; }
  }
  start.addEventListener('click', async () => {
    if (running) return;
    start.disabled = true;
    say('Проверка поддержки DataMatrix…');
    try {
      await getDetector();
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна из этого контекста. Откройте приложение по HTTPS или localhost вместо file://.');
      say('Запрашиваю доступ к задней камере…');
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = stream;
      wrap.hidden = false; controls.hidden = false;
      await video.play();
      running = true; stop.disabled = false;
      say('');
      rafId = requestAnimationFrame(loop);
    } catch (e) {
      closeCamera();
      const message = e.name === 'NotAllowedError' ? 'Доступ к камере запрещён. Разрешите камеру для сайта или попробуйте HTTPS.' : (e.message || String(e));
      say(message, true);
    }
  });
  stop.addEventListener('click', () => { closeCamera(); say(''); });
  picker.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; if (!file) return;
    closeCamera(); say('Распознаю DataMatrix на изображении…');
    let bitmap;
    try {
      const d = await getDetector();
      bitmap = await createImageBitmap(file);
      const found = await d.detect(bitmap);
      const match = found.find(x => x.format === 'data_matrix' && x.rawValue);
      if (!match) throw new Error('DataMatrix на фотографии не найден. Попробуйте приблизить код, убрать блики и переснять.');
      decoded(match.rawValue);
    } catch(e) { say('Не удалось распознать: ' + (e.message || e), true); }
    finally { if (bitmap) bitmap.close(); fileInput.value = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) { closeCamera(); say('Камера остановлена при сворачивании.'); } });
  window.addEventListener('pagehide', closeCamera);
})();
