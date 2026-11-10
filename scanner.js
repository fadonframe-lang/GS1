/* GS1 scanner v6.7: local ZXing-C++ WASM + native BarcodeDetector fallback. */
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
  const frameCanvas = document.createElement('canvas');
  const frameCtx = frameCanvas.getContext('2d', {willReadFrequently: true});
  let detector = null, stream = null, running = false, rafId = 0;
  let busy = false, lastNative = 0, lastWasm = 0, zxingReady = false;
  let zxingBroken = false, nativeBroken = false, generation = 0;

  function say(msg, err = false) {
    status.textContent = msg;
    status.className = 'status' + (err ? ' error' : '');
    status.hidden = !msg;
  }

  async function nativeDetector() {
    if (nativeBroken || !('BarcodeDetector' in window)) return null;
    if (detector) return detector;
    try {
      if (typeof BarcodeDetector.getSupportedFormats === 'function') {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (!formats.includes('data_matrix')) { nativeBroken = true; return null; }
      }
      detector = new BarcodeDetector({formats: ['data_matrix']});
      return detector;
    } catch (e) {
      nativeBroken = true;
      console.warn('Native DataMatrix unavailable:', e);
      return null;
    }
  }

  async function wasmDecoder() {
    if (zxingBroken) return null;
    if (!window.ZXingWASM || typeof window.ZXingWASM.readBarcodes !== 'function') {
      zxingBroken = true;
      return null;
    }
    try {
      if (!zxingReady) {
        window.ZXingWASM.prepareZXingModule({
          overrides: {
            locateFile: filename => filename.endsWith('.wasm')
              ? new URL('./vendor/zxing/zxing_reader.wasm', document.baseURI).href
              : filename
          }
        });
        zxingReady = true;
      }
      return window.ZXingWASM;
    } catch (e) {
      console.warn('ZXing setup failed:', e);
      zxingBroken = true;
      return null;
    }
  }

  function closeCamera() {
    running = false;
    generation++;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
    video.pause();
    video.srcObject = null;
    wrap.hidden = true;
    controls.hidden = true;
    start.disabled = false;
    stop.disabled = true;
  }

  function decoded(value) {
    if (!value) return false;
    // GS1 symbology prefix ]d2 may be returned by some decoders.
    const normalized = value.startsWith(']d2') ? value.slice(3) : value;
    closeCamera();
    $('code').value = normalized;
    $('generate').click();
    if ($('result').hidden) {
      say('DataMatrix считан, но структура отличается от 01/21/91/92. Исходный текст сохранён.', true);
    } else {
      say('');
    }
    if (navigator.vibrate) navigator.vibrate(100);
    ($('result').hidden ? $('code') : $('result')).scrollIntoView({
      behavior: 'smooth', block: 'nearest'
    });
    return true;
  }

  function firstNative(found) {
    return found.find(item => item.format === 'data_matrix' && item.rawValue)?.rawValue || '';
  }

  function firstWasm(found) {
    const item = found.find(entry =>
      (entry.format === 'DataMatrix' || entry.symbology === 'DataMatrix') &&
      !entry.error && typeof entry.text === 'string' && entry.text.length
    );
    return item?.text || '';
  }

  async function detectWasm(image) {
    const z = await wasmDecoder();
    if (!z) return '';
    try {
      const found = await z.readBarcodes(image, {
        formats: ['DataMatrix'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1
      });
      return firstWasm(found);
    } catch (e) {
      console.warn('ZXing detection failed:', e);
      // Keep the native scanner available if WASM cannot run on this device.
      zxingBroken = true;
      return '';
    }
  }

  function captureFrame() {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    // Bound CPU/RAM use on mobile. Scan the whole frame rather than a fragile crop.
    const scale = Math.min(1, 960 / Math.max(w, h));
    frameCanvas.width = Math.max(1, Math.round(w * scale));
    frameCanvas.height = Math.max(1, Math.round(h * scale));
    frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    return frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  }

  async function scanFrame(timestamp) {
    if (!running || busy || video.readyState < 2) return;
    const doNative = timestamp - lastNative >= 220;
    const doWasm = timestamp - lastWasm >= 850;
    if (!doNative && !doWasm) return;
    busy = true;
    const myGeneration = generation;
    try {
      let value = '';
      if (doNative && detector && !nativeBroken) {
        lastNative = timestamp;
        try { value = firstNative(await detector.detect(video)); }
        catch (e) { nativeBroken = true; console.warn('Native scan failed:', e); }
      }
      if (value && running && myGeneration === generation) { decoded(value); return; }
      if (doWasm && !zxingBroken && running && myGeneration === generation) {
        lastWasm = timestamp;
        const frame = captureFrame();
        if (frame) value = await detectWasm(frame);
        if (value && running && myGeneration === generation) decoded(value);
      }
      if (nativeBroken && zxingBroken && running) {
        closeCamera();
        say('Оба движка сканирования недоступны. Попробуйте фотографию.', true);
      }
    } finally {
      busy = false;
    }
  }

  function loop(timestamp) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (!busy) scanFrame(timestamp).catch(e => {
      console.error('Scanner loop:', e);
      if (running) { closeCamera(); say('Ошибка сканирования: ' + (e.message || e), true); }
    });
  }

  start.addEventListener('click', async () => {
    if (running) return;
    start.disabled = true;
    say('Подготовка сканера…');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Камера требует HTTPS или localhost.');
      const d = await nativeDetector();
      const z = await wasmDecoder();
      if (!d && !z) throw new Error('На этом устройстве нет доступного движка DataMatrix.');
      say('Запрашиваю доступ к камере…');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: {
          facingMode: {ideal: 'environment'},
          width: {ideal: 1920}, height: {ideal: 1080}
        }
      });
      video.srcObject = stream;
      wrap.hidden = false;
      controls.hidden = false;
      await video.play();
      running = true;
      lastNative = 0;
      lastWasm = 0;
      stop.disabled = false;
      say('');
      rafId = requestAnimationFrame(loop);
    } catch (e) {
      closeCamera();
      say(e.name === 'NotAllowedError'
        ? 'Доступ к камере запрещён. Разрешите камеру для сайта.'
        : (e.message || String(e)), true);
    }
  });

  stop.addEventListener('click', () => { closeCamera(); say(''); });
  picker.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    closeCamera();
    say('Распознаю DataMatrix…');
    let bitmap;
    try {
      let value = await detectWasm(file);
      if (!value) {
        const d = await nativeDetector();
        if (d) {
          bitmap = await createImageBitmap(file);
          value = firstNative(await d.detect(bitmap));
        }
      }
      if (!value) throw new Error('DataMatrix на изображении не найден. Уберите блики или приблизьте код.');
      decoded(value);
    } catch (e) {
      say('Не удалось распознать: ' + (e.message || e), true);
    } finally {
      if (bitmap) bitmap.close();
      fileInput.value = '';
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) { closeCamera(); say('Камера остановлена при сворачивании.'); }
  });
  window.addEventListener('pagehide', closeCamera);
})();
