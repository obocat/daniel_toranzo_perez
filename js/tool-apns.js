// Constructor y validador de payloads APNs.

(function () {
  'use strict';

  var input = document.getElementById('apns-payload');
  var formatButton = document.getElementById('apns-format');
  var sizeOutput = document.getElementById('apns-size');
  var meter = document.getElementById('apns-meter');
  var meterFill = document.getElementById('apns-meter-fill');
  var errorOutput = document.getElementById('apns-error');
  var warningsOutput = document.getElementById('apns-warnings');

  if (!input) return;

  var LIMIT = 4096;

  function currentLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function byteLength(value) {
    if (window.TextEncoder) {
      return new TextEncoder().encode(value).length;
    }

    return unescape(encodeURIComponent(value)).length;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(currentLang() === 'en' ? 'en-US' : 'es-ES').format(value);
  }

  function messages() {
    return {
      invalid: currentLang() === 'en'
        ? 'The payload is not valid JSON: '
        : 'El payload no es JSON válido: ',
      object: currentLang() === 'en'
        ? 'The payload must be a JSON object.'
        : 'El payload debe ser un objeto JSON.',
      aps: currentLang() === 'en'
        ? 'The payload does not contain an "aps" key.'
        : 'El payload no contiene una clave "aps".',
      limit: currentLang() === 'en'
        ? 'The payload exceeds the 4096-byte limit.'
        : 'El payload supera el límite de 4096 bytes.',
      ok: currentLang() === 'en'
        ? 'Valid JSON and within the limit.'
        : 'JSON válido y dentro del límite.'
    };
  }

  function setError(message) {
    if (!errorOutput) return;

    errorOutput.hidden = !message;
    errorOutput.textContent = message || '';
    input.classList.toggle('is-invalid', Boolean(message));

    if (message) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function renderWarnings(warnings) {
    if (!warningsOutput) return;

    warningsOutput.innerHTML = '';

    warnings.forEach(function (warning) {
      var item = document.createElement('li');
      item.className = 'tool-warning' + (warning.level === 'ok' ? ' is-ok' : '');
      item.textContent = warning.text;
      warningsOutput.appendChild(item);
    });
  }

  function updateMeter(bytes) {
    var ratio = Math.min(bytes / LIMIT, 1);

    if (sizeOutput) {
      sizeOutput.textContent = formatNumber(bytes) + ' / ' + formatNumber(LIMIT) + ' bytes';
    }

    if (meterFill) {
      meterFill.style.width = (ratio * 100) + '%';
      meterFill.classList.toggle('is-warning', bytes > LIMIT * 0.9 && bytes <= LIMIT);
      meterFill.classList.toggle('is-over', bytes > LIMIT);
    }

    if (meter) {
      meter.setAttribute('aria-valuenow', String(Math.min(bytes, LIMIT)));
    }
  }

  function update() {
    var text = input.value;
    var bytes = byteLength(text);
    var textMessages = messages();
    var warnings = [];
    var parsed = null;
    var parseError = null;

    updateMeter(bytes);

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      parseError = error;
    }

    if (parseError) {
      setError(textMessages.invalid + parseError.message);
    } else {
      setError('');

      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        warnings.push({ level: 'warn', text: textMessages.object });
      } else if (!Object.prototype.hasOwnProperty.call(parsed, 'aps')) {
        warnings.push({ level: 'warn', text: textMessages.aps });
      }
    }

    if (bytes > LIMIT) {
      warnings.push({ level: 'warn', text: textMessages.limit });
    }

    if (!parseError && !warnings.length) {
      warnings.push({ level: 'ok', text: textMessages.ok });
    }

    renderWarnings(warnings);
  }

  input.addEventListener('input', update);

  if (formatButton) {
    formatButton.addEventListener('click', function () {
      try {
        input.value = JSON.stringify(JSON.parse(input.value), null, 2);
        update();
      } catch (error) {
        setError(messages().invalid + error.message);
      }
    });
  }

  document.addEventListener('cv:langchange', update);

  update();
})();
