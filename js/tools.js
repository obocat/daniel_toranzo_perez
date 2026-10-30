// Herramientas para desarrolladores iOS: permisos, DateFormatter y color.

(function () {
  'use strict';

  function currentLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* ==========================================
     PORTAPAPELES
     ========================================== */

  var copyTimers = new WeakMap();
  var copyLabels = new WeakMap();

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();

      try {
        var copied = document.execCommand('copy');
        document.body.removeChild(area);
        copied ? resolve() : reject(new Error('copy failed'));
      } catch (error) {
        document.body.removeChild(area);
        reject(error);
      }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }

    return legacyCopy(text);
  }

  function setCopyState(button, ok) {
    var labels = copyLabels.get(button);

    if (!labels) return;

    labels.forEach(function (item) {
      var lang = item.element.classList.contains('lang-en') ? 'en' : 'es';
      var attribute = ok ? 'data-copied-' + lang : 'data-error-' + lang;
      var fallback = ok
        ? (lang === 'en' ? 'Copied' : 'Copiado')
        : (lang === 'en' ? 'Copy manually' : 'Copia manualmente');
      item.element.textContent = button.getAttribute(attribute) || fallback;
    });

    button.classList.toggle('is-copied', ok);
    button.classList.toggle('is-error', !ok);

    window.clearTimeout(copyTimers.get(button));
    copyTimers.set(button, window.setTimeout(function () {
      labels.forEach(function (item) {
        item.element.textContent = item.text;
      });
      button.classList.remove('is-copied', 'is-error');
    }, 2000));
  }

  function initCopyButtons() {
    $all('[data-copy-target]').forEach(function (button) {
      copyLabels.set(button, $all('.tool-copy-label', button).map(function (element) {
        return { element: element, text: element.textContent };
      }));

      button.addEventListener('click', function () {
        var target = document.getElementById(button.getAttribute('data-copy-target'));

        if (!target) return;

        copyText(target.textContent).then(function () {
          setCopyState(button, true);
        }).catch(function () {
          setCopyState(button, false);
        });
      });
    });
  }

  /* ==========================================
     PERMISOS DE INFO.PLIST
     ========================================== */

  var permissionInputs = $all('.permission-checkbox');
  var permissionOutput = $('#permission-output');

  function escapeXml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function updatePermissionOptionState(input) {
    var option = input.closest('.permission-option');
    if (option) option.classList.toggle('is-checked', input.checked);
  }

  function updatePermissions() {
    if (!permissionOutput) return;

    var lang = currentLang();
    var lines = [];

    permissionInputs.forEach(function (input) {
      updatePermissionOptionState(input);

      if (!input.checked) return;

      var key = input.getAttribute('data-key');
      var text = input.getAttribute('data-text-' + lang) || input.getAttribute('data-text-es') || '';

      if (key) {
        lines.push('<key>' + key + '</key>');
        lines.push('<string>' + escapeXml(text) + '</string>');
      } else {
        lines.push('<!-- ' + escapeXml(text) + ' -->');
      }

      lines.push('');
    });

    if (!lines.length) {
      lines.push(lang === 'en'
        ? '<!-- Select at least one permission. -->'
        : '<!-- Selecciona al menos un permiso. -->');
    }

    permissionOutput.textContent = lines.join('\n').replace(/\n+$/, '');
  }

  permissionInputs.forEach(function (input) {
    input.addEventListener('change', updatePermissions);
  });

  /* ==========================================
     DATEFORMATTER
     ========================================== */

  var dateFormatInput = $('#date-format');
  var dateValueInput = $('#date-value');
  var dateResult = $('#date-result');
  var dateWarnings = $('#date-warnings');

  var dateMessages = {
    empty: {
      es: 'Escribe un patrón de fecha.',
      en: 'Enter a date pattern.'
    },
    unclosedQuote: {
      es: 'Hay una comilla simple sin cerrar. Usa dos comillas para una comilla literal.',
      en: 'There is an unclosed single quote. Use two quotes for a literal quote.'
    },
    weekYear: {
      es: '`YYYY` es el año basado en semana. Para el año calendario usa `yyyy`.',
      en: '`YYYY` is the week-based year. Use `yyyy` for the calendar year.'
    },
    dayOfYear: {
      es: '`DD` es el día del año. Para el día del mes usa `dd`.',
      en: '`DD` is the day of the year. Use `dd` for the day of the month.'
    },
    hour12: {
      es: '`hh` usa un reloj de 12 horas. Añade `a` para mostrar AM/PM.',
      en: '`hh` uses a 12-hour clock. Add `a` to show AM/PM.'
    },
    hour24WithPeriod: {
      es: '`HH` ya usa un reloj de 24 horas; `a` no es necesario.',
      en: '`HH` already uses a 24-hour clock; `a` is not needed.'
    },
    unsupported: {
      es: 'Tokens no soportados por este probador: ',
      en: 'Tokens not supported by this tester: '
    },
    ok: {
      es: 'Sin avisos. El patrón usa tokens compatibles con DateFormatter.',
      en: 'No warnings. The pattern uses DateFormatter-compatible tokens.'
    }
  };

  function message(key, lang) {
    return dateMessages[key][lang];
  }

  function pad(value, count) {
    var text = String(Math.abs(value));

    while (text.length < count) text = '0' + text;

    return text;
  }

  function formatYear(year, count) {
    return count === 2 ? pad(year % 100, 2) : String(year);
  }

  function tokenizePattern(pattern) {
    var tokens = [];
    var unclosedQuote = false;
    var index = 0;

    while (index < pattern.length) {
      var character = pattern.charAt(index);

      if (character === "'") {
        if (pattern.charAt(index + 1) === "'") {
          tokens.push({ type: 'literal', value: "'" });
          index += 2;
          continue;
        }

        var end = pattern.indexOf("'", index + 1);

        if (end === -1) {
          tokens.push({ type: 'literal', value: pattern.slice(index + 1) });
          unclosedQuote = true;
          break;
        }

        tokens.push({ type: 'literal', value: pattern.slice(index + 1, end) });
        index = end + 1;
        continue;
      }

      if (/[A-Za-z]/.test(character)) {
        var next = index + 1;

        while (next < pattern.length && pattern.charAt(next) === character) {
          next += 1;
        }

        tokens.push({ type: 'field', symbol: character, count: next - index });
        index = next;
        continue;
      }

      tokens.push({ type: 'literal', value: character });
      index += 1;
    }

    return { tokens: tokens, unclosedQuote: unclosedQuote };
  }

  function dayOfYear(date) {
    var start = Date.UTC(date.getFullYear(), 0, 0);
    var current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((current - start) / 86400000);
  }

  function isoWeekInfo(date) {
    var copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - day);

    var yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);

    return { year: copy.getUTCFullYear(), week: week };
  }

  function monthName(date, count, locale) {
    if (count <= 2) return pad(date.getMonth() + 1, count);

    var width = count === 3 ? 'short' : count === 5 ? 'narrow' : 'long';
    return new Intl.DateTimeFormat(locale, { month: width }).format(date);
  }

  function weekdayName(date, count, locale) {
    var width = count <= 3 ? 'short' : count === 5 ? 'narrow' : 'long';
    return new Intl.DateTimeFormat(locale, { weekday: width }).format(date);
  }

  function dayPeriod(date, locale) {
    var parts = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      hour12: true
    }).formatToParts(date);

    for (var index = 0; index < parts.length; index += 1) {
      if (parts[index].type === 'dayPeriod') return parts[index].value;
    }

    return date.getHours() < 12 ? 'AM' : 'PM';
  }

  function timeZoneOffset(date) {
    var minutes = -date.getTimezoneOffset();
    var sign = minutes >= 0 ? '+' : '-';
    var absolute = Math.abs(minutes);

    return {
      sign: sign,
      hours: Math.floor(absolute / 60),
      minutes: absolute % 60
    };
  }

  function formatTimeZone(date, count) {
    var offset = timeZoneOffset(date);

    if (count >= 5) {
      return offset.sign + pad(offset.hours, 2) + ':' + pad(offset.minutes, 2);
    }

    if (count === 4) {
      return 'GMT' + offset.sign + offset.hours + (offset.minutes ? ':' + pad(offset.minutes, 2) : '');
    }

    return offset.sign + pad(offset.hours, 2) + pad(offset.minutes, 2);
  }

  function formatTimeZoneName(date, count, locale) {
    if (count >= 4) {
      var parts = new Intl.DateTimeFormat(locale, {
        timeZoneName: count >= 5 ? 'short' : 'long'
      }).formatToParts(date);

      for (var index = 0; index < parts.length; index += 1) {
        if (parts[index].type === 'timeZoneName') return parts[index].value;
      }
    }

    return formatTimeZone(date, 4);
  }

  function formatField(date, symbol, count, locale) {
    switch (symbol) {
      case 'y':
        return formatYear(date.getFullYear(), count);
      case 'Y':
        return formatYear(isoWeekInfo(date).year, count);
      case 'M':
        return monthName(date, count, locale);
      case 'd':
        return pad(date.getDate(), count);
      case 'D':
        return pad(dayOfYear(date), count);
      case 'E':
        return weekdayName(date, count, locale);
      case 'H':
        return pad(date.getHours(), count);
      case 'h':
        return pad(date.getHours() % 12 || 12, count);
      case 'k':
        return pad(date.getHours() || 24, count);
      case 'K':
        return pad(date.getHours() % 12, count);
      case 'm':
        return pad(date.getMinutes(), count);
      case 's':
        return pad(date.getSeconds(), count);
      case 'S':
        return String(date.getMilliseconds()).slice(-3).padStart(3, '0').slice(0, count);
      case 'a':
        return dayPeriod(date, locale);
      case 'w':
        return pad(isoWeekInfo(date).week, count);
      case 'Q':
      case 'q':
        return pad(Math.floor(date.getMonth() / 3) + 1, count);
      case 'Z':
        return formatTimeZone(date, count);
      case 'z':
        return formatTimeZoneName(date, count, locale);
      default:
        return null;
    }
  }

  function formatDate(pattern, date, lang) {
    var locale = lang === 'en' ? 'en-US' : 'es-ES';
    var tokenized = tokenizePattern(pattern);
    var unsupported = [];
    var output = tokenized.tokens.map(function (token) {
      if (token.type === 'literal') return token.value;

      var value = formatField(date, token.symbol, token.count, locale);

      if (value === null) {
        unsupported.push(token.symbol.repeat(token.count));
        return token.symbol.repeat(token.count);
      }

      return value;
    }).join('');

    return {
      output: output,
      tokens: tokenized.tokens,
      unclosedQuote: tokenized.unclosedQuote,
      unsupported: unsupported
    };
  }

  function hasSymbol(result, symbol) {
    return result.tokens.some(function (token) {
      return token.type === 'field' && token.symbol === symbol;
    });
  }

  function unique(values) {
    return values.filter(function (value, index) {
      return values.indexOf(value) === index;
    });
  }

  function buildWarnings(pattern, result, lang) {
    var warnings = [];

    if (!pattern.trim()) {
      warnings.push({ level: 'warn', text: message('empty', lang) });
    }

    if (result.unclosedQuote) {
      warnings.push({ level: 'warn', text: message('unclosedQuote', lang) });
    }

    if (hasSymbol(result, 'Y') && !hasSymbol(result, 'w')) {
      warnings.push({ level: 'warn', text: message('weekYear', lang) });
    }

    if (hasSymbol(result, 'D') && !hasSymbol(result, 'd')) {
      warnings.push({ level: 'warn', text: message('dayOfYear', lang) });
    }

    if (hasSymbol(result, 'h') && !hasSymbol(result, 'a')) {
      warnings.push({ level: 'warn', text: message('hour12', lang) });
    }

    if (hasSymbol(result, 'H') && hasSymbol(result, 'a')) {
      warnings.push({ level: 'warn', text: message('hour24WithPeriod', lang) });
    }

    if (result.unsupported.length) {
      warnings.push({
        level: 'warn',
        text: message('unsupported', lang) + unique(result.unsupported).join(', ')
      });
    }

    if (!warnings.length) {
      warnings.push({ level: 'ok', text: message('ok', lang) });
    }

    return warnings;
  }

  function renderDateWarnings(warnings) {
    if (!dateWarnings) return;

    dateWarnings.innerHTML = '';

    warnings.forEach(function (warning) {
      var item = document.createElement('li');
      item.className = 'tool-warning' + (warning.level === 'ok' ? ' is-ok' : '');
      item.textContent = warning.text;
      dateWarnings.appendChild(item);
    });
  }

  function dateFromInput() {
    var value = dateValueInput ? dateValueInput.value : '';
    var match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);

      if (!isNaN(date.getTime())) return date;
    }

    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  function updateDateTool() {
    if (!dateFormatInput || !dateResult || !dateWarnings) return;

    var pattern = dateFormatInput.value;
    var result = formatDate(pattern, dateFromInput(), currentLang());

    dateResult.textContent = result.output || '—';
    renderDateWarnings(buildWarnings(pattern, result, currentLang()));
  }

  if (dateFormatInput) {
    dateFormatInput.addEventListener('input', updateDateTool);
  }

  if (dateValueInput) {
    dateValueInput.addEventListener('input', updateDateTool);
    dateValueInput.addEventListener('change', updateDateTool);
  }

  $all('.tool-preset').forEach(function (button) {
    button.addEventListener('click', function () {
      if (!dateFormatInput) return;

      dateFormatInput.value = button.getAttribute('data-format') || '';
      updateDateTool();
      dateFormatInput.focus();
    });
  });

  /* ==========================================
     COLOR
     ========================================== */

  var colorHexInput = $('#color-hex');
  var colorPicker = $('#color-picker');
  var colorError = $('#color-error');
  var colorSwatchSrgb = $('#color-swatch-srgb');
  var colorSwatchP3 = $('#color-swatch-p3');

  var colorOutputs = {
    hex: $('#color-hex-output'),
    rgb: $('#color-rgb-output'),
    uicolor: $('#color-uicolor-output'),
    uicolorP3: $('#color-uicolor-p3-output'),
    swiftui: $('#color-swiftui-output'),
    swiftuiP3: $('#color-swiftui-p3-output')
  };

  var colorErrorMessage = {
    es: 'Introduce un color HEX válido: 3, 4, 6 u 8 dígitos, con o sin #.',
    en: 'Enter a valid HEX color: 3, 4, 6, or 8 digits, with or without #.'
  };

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function parseHexColor(value) {
    var hex = String(value || '').trim().replace(/^#/, '');

    if (!/^[0-9a-f]+$/i.test(hex) || [3, 4, 6, 8].indexOf(hex.length) === -1) {
      return null;
    }

    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map(function (character) {
        return character + character;
      }).join('');
    }

    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }

  function hexByte(value) {
    return Math.round(clamp01(value) * 255).toString(16).padStart(2, '0').toUpperCase();
  }

  function rgbHex(color) {
    return '#' + hexByte(color.r) + hexByte(color.g) + hexByte(color.b);
  }

  function hexWithAlpha(color) {
    var hex = rgbHex(color);
    return color.a < 1 ? hex + hexByte(color.a) : hex;
  }

  function formatComponent(value) {
    return clamp01(value).toFixed(4);
  }

  function formatAlpha(value) {
    return clamp01(value).toFixed(4);
  }

  function srgbToLinear(value) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(value) {
    return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  }

  function srgbToP3(color) {
    var red = srgbToLinear(color.r);
    var green = srgbToLinear(color.g);
    var blue = srgbToLinear(color.b);

    var x = 0.4124564 * red + 0.3575761 * green + 0.1804375 * blue;
    var y = 0.2126729 * red + 0.7151522 * green + 0.0721750 * blue;
    var z = 0.0193339 * red + 0.1191920 * green + 0.9503041 * blue;

    return {
      r: clamp01(linearToSrgb(2.4934969 * x - 0.9313836 * y - 0.4027108 * z)),
      g: clamp01(linearToSrgb(-0.8294890 * x + 1.7626641 * y + 0.0236247 * z)),
      b: clamp01(linearToSrgb(0.0358458 * x - 0.0761724 * y + 0.9568845 * z))
    };
  }

  function setColorError(show) {
    if (!colorError || !colorHexInput) return;

    colorError.hidden = !show;
    colorError.textContent = show ? colorErrorMessage[currentLang()] : '';
    colorHexInput.classList.toggle('is-invalid', show);

    if (show) {
      colorHexInput.setAttribute('aria-invalid', 'true');
    } else {
      colorHexInput.removeAttribute('aria-invalid');
    }
  }

  function clearColorOutputs() {
    Object.keys(colorOutputs).forEach(function (key) {
      if (colorOutputs[key]) colorOutputs[key].textContent = '—';
    });
  }

  function updateColor() {
    if (!colorHexInput) return;

    var color = parseHexColor(colorHexInput.value);

    if (!color) {
      setColorError(true);
      clearColorOutputs();

      if (colorSwatchSrgb) colorSwatchSrgb.style.backgroundColor = 'var(--bg-subtle-strong)';
      if (colorSwatchP3) colorSwatchP3.style.backgroundColor = 'var(--bg-subtle-strong)';

      return;
    }

    setColorError(false);

    var p3 = srgbToP3(color);
    var red = Math.round(color.r * 255);
    var green = Math.round(color.g * 255);
    var blue = Math.round(color.b * 255);
    var alpha = formatAlpha(color.a);

    if (colorOutputs.hex) colorOutputs.hex.textContent = hexWithAlpha(color);
    if (colorOutputs.rgb) colorOutputs.rgb.textContent = red + ', ' + green + ', ' + blue;
    if (colorOutputs.uicolor) {
      colorOutputs.uicolor.textContent =
        'UIColor(red: ' + formatComponent(color.r) +
        ', green: ' + formatComponent(color.g) +
        ', blue: ' + formatComponent(color.b) +
        ', alpha: ' + alpha + ')';
    }
    if (colorOutputs.uicolorP3) {
      colorOutputs.uicolorP3.textContent =
        'UIColor(displayP3Red: ' + formatComponent(p3.r) +
        ', green: ' + formatComponent(p3.g) +
        ', blue: ' + formatComponent(p3.b) +
        ', alpha: ' + alpha + ')';
    }
    if (colorOutputs.swiftui) {
      colorOutputs.swiftui.textContent =
        'Color(.sRGB, red: ' + formatComponent(color.r) +
        ', green: ' + formatComponent(color.g) +
        ', blue: ' + formatComponent(color.b) +
        ', opacity: ' + alpha + ')';
    }
    if (colorOutputs.swiftuiP3) {
      colorOutputs.swiftuiP3.textContent =
        'Color(.displayP3, red: ' + formatComponent(p3.r) +
        ', green: ' + formatComponent(p3.g) +
        ', blue: ' + formatComponent(p3.b) +
        ', opacity: ' + alpha + ')';
    }

    if (colorSwatchSrgb) {
      colorSwatchSrgb.style.backgroundColor =
        'rgba(' + red + ', ' + green + ', ' + blue + ', ' + color.a + ')';
    }

    if (colorSwatchP3) {
      colorSwatchP3.style.backgroundColor =
        'rgba(' + red + ', ' + green + ', ' + blue + ', ' + color.a + ')';
      colorSwatchP3.style.backgroundColor =
        'color(display-p3 ' + p3.r + ' ' + p3.g + ' ' + p3.b + ' / ' + color.a + ')';
    }

    if (colorPicker) colorPicker.value = rgbHex(color).toLowerCase();
  }

  if (colorHexInput) {
    colorHexInput.addEventListener('input', updateColor);
  }

  if (colorPicker) {
    colorPicker.addEventListener('input', function () {
      if (!colorHexInput) return;

      colorHexInput.value = colorPicker.value.toUpperCase();
      updateColor();
    });
  }

  /* ==========================================
     IDIOMA E INICIALIZACIÓN
     ========================================== */

  document.addEventListener('cv:langchange', function () {
    updatePermissions();
    updateDateTool();
    updateColor();
  });

  initCopyButtons();
  updatePermissions();
  updateDateTool();
  updateColor();
})();
