// Visualizador de springs de SwiftUI.

(function () {
  'use strict';

  var chart = document.getElementById('spring-chart');
  var modesContainer = document.getElementById('spring-modes');
  var modeInfo = document.getElementById('spring-mode-info');
  var controlsContainer = document.getElementById('spring-controls');
  var presetsContainer = document.getElementById('spring-presets');
  var statsOutput = document.getElementById('spring-stats');
  var codeOutput = document.getElementById('spring-code');
  var track = document.getElementById('spring-track');
  var ball = document.getElementById('spring-ball');
  var playButton = document.getElementById('spring-play');

  if (!chart || !modesContainer || !modeInfo || !controlsContainer || !presetsContainer || !statsOutput || !codeOutput) return;

  var modes = {
    db: 'duration / bounce',
    rd: 'response / damping',
    ip: 'interpolating'
  };

  var controls = {
    db: [
      ['duration', 0.1, 3, 0.01, null, 's'],
      ['bounce', -0.99, 1, 0.01]
    ],
    rd: [
      ['response', 0.1, 3, 0.01, null, 's'],
      ['damping', 0.05, 1.5, 0.01, 'dampingFraction']
    ],
    ip: [
      ['mass', 0.1, 5, 0.1],
      ['stiffness', 1, 500, 1],
      ['c', 0.5, 60, 0.5, 'damping'],
      ['v0', -10, 10, 0.1, 'initialVelocity']
    ]
  };

  var presets = [
    ['.smooth', 0],
    ['.snappy', 0.15],
    ['.bouncy', 0.3]
  ];

  var state = {
    mode: 'db',
    duration: 0.5,
    bounce: 0.3,
    response: 0.5,
    damping: 0.7,
    mass: 1,
    stiffness: 100,
    c: 10,
    v0: 0
  };

  var animation = {
    frame: 0,
    chart: null,
    playing: false,
    startedAt: 0,
    elapsed: 0
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function currentLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function number(value) {
    return String(Number(Number(value).toFixed(3)));
  }

  // SwiftUI's spring model:
  // - duration/bounce: ω = 2π / duration; ζ = 1 - bounce (bounce >= 0)
  //   or ζ = 1 / (1 + bounce) (bounce < 0).
  // - response/dampingFraction: ω = 2π / response; ζ = dampingFraction.
  // - interpolatingSpring: ω = √(stiffness / mass);
  //   ζ = damping / (2√(stiffness · mass)).
  // initialVelocity is positive toward the target, so y'(0) = v.
  function params() {
    if (state.mode === 'db') {
      // The UI stops at -0.99; keep the curve finite if state is edited elsewhere.
      var bounce = Math.max(-0.99, state.bounce);

      return {
        w: 2 * Math.PI / state.duration,
        z: bounce >= 0 ? 1 - bounce : 1 / (1 + bounce),
        v: 0
      };
    }

    if (state.mode === 'rd') {
      return {
        w: 2 * Math.PI / state.response,
        z: state.damping,
        v: 0
      };
    }

    return {
      w: Math.sqrt(state.stiffness / state.mass),
      z: state.c / (2 * Math.sqrt(state.stiffness * state.mass)),
      v: state.v0
    };
  }

  function spring(w, z, v) {
    var y0 = -1;
    var yd = v;

    if (Math.abs(z - 1) < 1e-4) {
      var b = yd + w * y0;
      return function (t) {
        return 1 + (y0 + b * t) * Math.exp(-w * t);
      };
    }

    if (z < 1) {
      var wd = w * Math.sqrt(1 - z * z);
      var underB = (yd + z * w * y0) / wd;

      return function (t) {
        return 1 + Math.exp(-z * w * t) * (y0 * Math.cos(wd * t) + underB * Math.sin(wd * t));
      };
    }

    var s = Math.sqrt(z * z - 1);
    var r1 = -w * (z - s);
    var r2 = -w * (z + s);
    var c2 = (yd - r1 * y0) / (r2 - r1);
    var c1 = y0 - c2;

    return function (t) {
      return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    };
  }

  function indent(text, spaces) {
    var prefix = new Array(spaces + 1).join(' ');
    return text.split('\n').map(function (line) {
      return prefix + line;
    }).join('\n');
  }

  function expression() {
    if (state.mode === 'db') {
      return '.spring(duration: ' + number(state.duration) + ', bounce: ' + number(state.bounce) + ')';
    }

    if (state.mode === 'rd') {
      return '.spring(response: ' + number(state.response) + ', dampingFraction: ' + number(state.damping) + ')';
    }

    return '.interpolatingSpring(\n' +
      '    mass: ' + number(state.mass) + ',\n' +
      '    stiffness: ' + number(state.stiffness) + ',\n' +
      '    damping: ' + number(state.c) + ',\n' +
      '    initialVelocity: ' + number(state.v0) + '\n' +
      ')';
  }

  function codeText() {
    var expressionText = expression();
    var alternative = currentLang() === 'en' ? 'or' : 'o bien';
    var prefix = '';

    if (state.mode === 'db' && state.duration === 0.5) {
      for (var index = 0; index < presets.length; index += 1) {
        if (Math.abs(presets[index][1] - state.bounce) < 0.001) {
          prefix = '// = ' + presets[index][0] + '\n';
          break;
        }
      }
    }

    if (state.mode === 'ip') {
      return prefix +
        'withAnimation(\n' + indent(expressionText, 4) + '\n) {\n' +
        '    isExpanded.toggle()\n' +
        '}\n\n' +
        '// ' + alternative + '\n' +
        '.animation(\n' + indent(expressionText, 4) + ',\n' +
        '    value: isExpanded\n' +
        ')';
    }

    return prefix +
      'withAnimation(' + expressionText + ') {\n' +
      '    isExpanded.toggle()\n' +
      '}\n\n' +
      '// ' + alternative + '\n' +
      '.animation(' + expressionText + ', value: isExpanded)';
  }

  function modeInfoText() {
    var english = currentLang() === 'en';

    if (state.mode === 'db') {
      return english ? 'iOS 17+ · perceptual duration and bounce (-0.99...1)' : 'iOS 17+ · duration perceptual y bounce (-0.99...1)';
    }

    if (state.mode === 'rd') {
      return english ? 'iOS 13+ · response in seconds and dampingFraction' : 'iOS 13+ · response en segundos y dampingFraction';
    }

    return english ? 'iOS 13+ · mass, stiffness, damping, and initial velocity' : 'iOS 13+ · masa, rigidez, amortiguamiento y velocidad inicial';
  }

  function updateModeInfo() {
    modeInfo.textContent = modeInfoText();
  }

  function updatePlayButton() {
    if (!playButton) return;

    var spanish = playButton.querySelector('[data-spring-play-label="es"]');
    var english = playButton.querySelector('[data-spring-play-label="en"]');
    var paused = !animation.playing && animation.chart && animation.elapsed > 0.001 && animation.elapsed < animation.chart.maxTime - 0.001;

    if (spanish) spanish.textContent = animation.playing ? 'Pausar' : (paused ? 'Continuar' : 'Reproducir');
    if (english) english.textContent = animation.playing ? 'Pause' : (paused ? 'Resume' : 'Play');
    playButton.setAttribute('aria-pressed', animation.playing ? 'true' : 'false');
  }

  function setModePressed() {
    Array.prototype.forEach.call(modesContainer.children, function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-mode') === state.mode ? 'true' : 'false');
    });
  }

  function renderModes() {
    modesContainer.innerHTML = Object.keys(modes).map(function (key) {
      return '<button type="button" class="tool-preset" data-mode="' + key + '" aria-pressed="false">' + modes[key] + '</button>';
    }).join('');
  }

  function renderPresets() {
    presetsContainer.innerHTML = presets.map(function (preset, index) {
      return '<button type="button" class="tool-preset" data-preset="' + index + '">' + preset[0] + '</button>';
    }).join('');
  }

  function renderControls() {
    controlsContainer.innerHTML = controls[state.mode].map(function (control) {
      var key = control[0];
      var label = control[4] || control[0];
      var unit = control[5] || '';

      return '<div class="spring-control">' +
        '<div class="spring-control-head">' +
          '<label class="spring-control-name" for="spring-' + key + '">' + label + '</label>' +
          '<span class="spring-value">' +
            '<input class="spring-number" type="number" id="spring-number-' + key + '" min="' + control[1] + '" max="' + control[2] + '" step="' + control[3] + '" value="' + state[key] + '" inputmode="decimal" aria-label="' + label + (unit ? ' (' + unit + ')' : '') + '">' +
            (unit ? '<span class="spring-unit">' + unit + '</span>' : '') +
          '</span>' +
        '</div>' +
        '<input class="spring-range" type="range" id="spring-' + key + '" min="' + control[1] + '" max="' + control[2] + '" step="' + control[3] + '" value="' + state[key] + '">' +
      '</div>';
    }).join('');

    controls[state.mode].forEach(function (control) {
      var range = document.getElementById('spring-' + control[0]);
      var numberInput = document.getElementById('spring-number-' + control[0]);

      if (range) {
        range.addEventListener('input', function (event) {
          state[control[0]] = Number(event.target.value);
          stop(true);
          update();
        });
      }

      if (numberInput) {
        numberInput.addEventListener('input', function (event) {
          if (event.target.value === '') return;

          var value = Number(event.target.value);
          if (!isFinite(value)) return;

          state[control[0]] = Math.min(control[2], Math.max(control[1], value));
          stop(true);
          update(false);
        });

        numberInput.addEventListener('change', function (event) {
          var value = Number(event.target.value);

          if (!isFinite(value)) value = state[control[0]];

          value = Math.min(control[2], Math.max(control[1], value));
          state[control[0]] = value;
          stop(true);
          update();
        });
      }
    });
  }

  function updateControlValues(syncNumbers) {
    controls[state.mode].forEach(function (control) {
      var key = control[0];
      var range = document.getElementById('spring-' + key);
      var numberInput = document.getElementById('spring-number-' + key);

      if (range) range.value = state[key];
      if (numberInput && syncNumbers) numberInput.value = number(state[key]);
    });
  }

  function update(syncNumbers) {
    var physical = params();
    var curve = spring(physical.w, physical.z, physical.v);
    var maximum = -1e9;
    var minimum = 1e9;
    var last = 0;
    var peakTime = 0;

    for (var time = 0; time <= 10; time += 1 / 240) {
      var value = curve(time);

      if (value > maximum) {
        maximum = value;
        peakTime = time;
      }
      if (value < minimum) minimum = value;
      if (Math.abs(value - 1) > 0.005) last = time;
    }

    var maxTime = Math.min(10, Math.max(last * 1.15, 0.3));
    var minY = Math.min(0, minimum) - 0.06;
    var maxY = Math.max(1, maximum) + 0.1;
    var x = function (t) {
      return 34 + t / maxTime * 556;
    };
    var y = function (v) {
      return 10 + (maxY - v) / (maxY - minY) * 226;
    };

    var path = '';

    for (var index = 0; index <= 300; index += 1) {
      var currentTime = maxTime * index / 300;
      path += (index ? 'L' : 'M') + x(currentTime).toFixed(1) + ' ' + y(curve(currentTime)).toFixed(1);
    }

    var lang = currentLang();
    var markers = '';
    var settle = last > 9.99 ? '> 10 s' : last.toFixed(2) + ' s';
    var overshoot = Math.max(0, (maximum - 1) * 100).toFixed(0);

    if (maximum > 1.001) {
      markers += '<line x1="' + x(peakTime).toFixed(1) + '" x2="' + x(peakTime).toFixed(1) + '" y1="' + y(maximum).toFixed(1) + '" y2="' + y(1).toFixed(1) + '" stroke="var(--text-tertiary)" stroke-dasharray="2 4" opacity=".55"/>' +
        '<circle cx="' + x(peakTime).toFixed(1) + '" cy="' + y(maximum).toFixed(1) + '" r="3.5" fill="var(--accent)"/>';
    }

    if (last > 0.001) {
      markers += '<line x1="' + x(last).toFixed(1) + '" x2="' + x(last).toFixed(1) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(1).toFixed(1) + '" stroke="var(--text-tertiary)" stroke-dasharray="2 4" opacity=".55"/>';
    }

    chart.setAttribute(
      'aria-label',
      (lang === 'en' ? 'Spring curve. Overshoot ' : 'Curva del resorte. Sobrepaso ') + overshoot + '%. ' +
      (lang === 'en' ? 'Settles in ' : 'Se asienta en ') + settle + '.'
    );
    chart.innerHTML =
      '<line x1="34" x2="590" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--border)"/>' +
      '<line x1="34" x2="590" y1="' + y(1) + '" y2="' + y(1) + '" stroke="var(--text-tertiary)" stroke-dasharray="4 4"/>' +
      '<g fill="var(--text-tertiary)" font-size="12"><text x="6" y="' + (y(1) + 4) + '">1</text>' +
      '<text x="6" y="' + (y(0) + 4) + '">0</text>' +
      '<text x="34" y="256">0 s</text>' +
      '<text x="590" y="256" text-anchor="end">' + number(maxTime) + ' s</text></g>' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>' +
      markers +
      '<circle id="spring-dot" r="5" fill="var(--accent)" cx="34" cy="' + y(0) + '"/>';

    var damping = physical.z.toFixed(2);
    var frequency = (physical.w / (2 * Math.PI)).toFixed(2) + ' Hz';

    statsOutput.innerHTML =
      '<span>' + (lang === 'en' ? 'Overshoot' : 'Sobrepaso') + ': <b>' + overshoot + '%</b></span>' +
      '<span>' + (lang === 'en' ? 'Settles in' : 'Se asienta en') + ': <b>' + settle + '</b></span>' +
      '<span>' + (lang === 'en' ? 'Damping ratio' : 'Amortiguamiento') + ': <b>' + damping + '</b></span>' +
      '<span>' + (lang === 'en' ? 'Frequency' : 'Frecuencia') + ': <b>' + frequency + '</b></span>';

    codeOutput.textContent = codeText();
    animation.chart = { curve: curve, maxTime: maxTime, x: x, y: y };
    updateControlValues(syncNumbers !== false);
  }

  function setProgress(time) {
    if (!animation.chart) return;

    var chartData = animation.chart;
    var value = chartData.curve(time);
    var width = track ? track.clientWidth : 0;

    if (ball) ball.style.transform = 'translateX(' + (value * (0.8 * width - 21)) + 'px)';

    var dot = document.getElementById('spring-dot');
    if (dot) {
      dot.setAttribute('cx', chartData.x(time));
      dot.setAttribute('cy', chartData.y(value));
    }
  }

  function stop(reset) {
    window.cancelAnimationFrame(animation.frame);
    animation.playing = false;

    if (reset) animation.elapsed = 0;

    setProgress(animation.elapsed);
    updatePlayButton();
  }

  function start() {
    if (!animation.chart) return;

    window.cancelAnimationFrame(animation.frame);

    if (reduceMotion) {
      animation.playing = false;
      animation.elapsed = animation.chart.maxTime;
      setProgress(animation.elapsed);
      updatePlayButton();
      return;
    }

    if (animation.elapsed >= animation.chart.maxTime - 0.001) animation.elapsed = 0;

    animation.playing = true;
    animation.startedAt = performance.now() - animation.elapsed * 1000;
    updatePlayButton();

    var step = function (now) {
      if (!animation.playing || !animation.chart) return;

      var time = Math.min((now - animation.startedAt) / 1000, animation.chart.maxTime);
      animation.elapsed = time;
      setProgress(time);

      if (time < animation.chart.maxTime) {
        animation.frame = window.requestAnimationFrame(step);
      } else {
        animation.playing = false;
        animation.elapsed = animation.chart.maxTime;
        updatePlayButton();
      }
    };

    animation.frame = window.requestAnimationFrame(step);
  }

  function togglePlay() {
    if (animation.playing) {
      stop(false);
    } else {
      start();
    }
  }

  modesContainer.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-mode]');

    if (!button) return;

    state.mode = button.getAttribute('data-mode');
    stop(true);
    renderControls();
    setModePressed();
    updateModeInfo();
    update();
  });

  presetsContainer.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-preset]');

    if (!button) return;

    var index = Number(button.getAttribute('data-preset'));

    if (!presets[index]) return;

    state.mode = 'db';
    state.duration = 0.5;
    state.bounce = presets[index][1];
    stop(true);
    renderControls();
    setModePressed();
    updateModeInfo();
    update();
  });

  if (playButton) {
    playButton.addEventListener('click', togglePlay);
  }

  document.addEventListener('cv:langchange', function () {
    update();
    updateModeInfo();
    updatePlayButton();

    if (!animation.playing) setProgress(animation.elapsed);
  });

  renderModes();
  renderPresets();
  renderControls();
  setModePressed();
  updateModeInfo();
  update();
  updatePlayButton();
  start();
})();
