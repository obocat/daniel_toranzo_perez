// Visualizador de springs de SwiftUI.

(function () {
  'use strict';

  var chart = document.getElementById('spring-chart');
  var modesContainer = document.getElementById('spring-modes');
  var controlsContainer = document.getElementById('spring-controls');
  var presetsContainer = document.getElementById('spring-presets');
  var statsOutput = document.getElementById('spring-stats');
  var codeOutput = document.getElementById('spring-code');
  var track = document.getElementById('spring-track');
  var ball = document.getElementById('spring-ball');
  var playButton = document.getElementById('spring-play');

  if (!chart || !modesContainer || !controlsContainer || !presetsContainer || !statsOutput || !codeOutput) return;

  var modes = {
    db: 'duration / bounce',
    rd: 'response / damping',
    ip: 'interpolating'
  };

  var controls = {
    db: [
      ['duration', 0.1, 3, 0.01],
      ['bounce', -0.9, 0.95, 0.01]
    ],
    rd: [
      ['response', 0.1, 3, 0.01],
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
    chart: null
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function currentLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function number(value) {
    return String(Number(Number(value).toFixed(3)));
  }

  function params() {
    if (state.mode === 'db') {
      return {
        w: 2 * Math.PI / state.duration,
        z: state.bounce >= 0 ? 1 - state.bounce : 1 / (1 + state.bounce),
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
    var yd = -v;

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

  function expression() {
    if (state.mode === 'db') {
      return '.spring(duration: ' + number(state.duration) + ', bounce: ' + number(state.bounce) + ')';
    }

    if (state.mode === 'rd') {
      return '.spring(response: ' + number(state.response) + ', dampingFraction: ' + number(state.damping) + ')';
    }

    return '.interpolatingSpring(mass: ' + number(state.mass) +
      ', stiffness: ' + number(state.stiffness) +
      ', damping: ' + number(state.c) +
      ', initialVelocity: ' + number(state.v0) + ')';
  }

  function codeText() {
    var expressionText = expression();
    var prefix = '';

    if (state.mode === 'db' && state.duration === 0.5) {
      for (var index = 0; index < presets.length; index += 1) {
        if (Math.abs(presets[index][1] - state.bounce) < 0.001) {
          prefix = '// = ' + presets[index][0] + '\n';
          break;
        }
      }
    }

    return prefix +
      'withAnimation(' + expressionText + ') {\n' +
      '    isExpanded.toggle()\n' +
      '}\n\n' +
      '// ' + (currentLang() === 'en' ? 'or' : 'o bien') + '\n' +
      '.animation(' + expressionText + ', value: isExpanded)';
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

      return '<div class="spring-control">' +
        '<label class="spring-control-label" for="spring-' + key + '">' +
          '<span>' + label + '</span>' +
          '<output id="spring-output-' + key + '"></output>' +
        '</label>' +
        '<input class="spring-range" type="range" id="spring-' + key + '" min="' + control[1] + '" max="' + control[2] + '" step="' + control[3] + '" value="' + state[key] + '">' +
      '</div>';
    }).join('');

    controls[state.mode].forEach(function (control) {
      var input = document.getElementById('spring-' + control[0]);

      if (!input) return;

      input.addEventListener('input', function (event) {
        state[control[0]] = Number(event.target.value);
        update();
      });
    });
  }

  function updateControlOutputs() {
    controls[state.mode].forEach(function (control) {
      var output = document.getElementById('spring-output-' + control[0]);
      if (output) output.textContent = number(state[control[0]]);
    });
  }

  function update() {
    var physical = params();
    var curve = spring(physical.w, physical.z, physical.v);
    var maximum = -1e9;
    var minimum = 1e9;
    var last = 0;

    for (var time = 0; time <= 10; time += 1 / 240) {
      var value = curve(time);

      if (value > maximum) maximum = value;
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
    chart.setAttribute('aria-label', lang === 'en' ? 'Animation curve' : 'Curva de la animación');
    chart.innerHTML =
      '<line x1="34" x2="590" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--border)"/>' +
      '<line x1="34" x2="590" y1="' + y(1) + '" y2="' + y(1) + '" stroke="var(--text-tertiary)" stroke-dasharray="4 4"/>' +
      '<g fill="var(--text-tertiary)" font-size="12"><text x="6" y="' + (y(1) + 4) + '">1</text>' +
      '<text x="6" y="' + (y(0) + 4) + '">0</text>' +
      '<text x="34" y="256">0 s</text>' +
      '<text x="590" y="256" text-anchor="end">' + number(maxTime) + ' s</text></g>' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle id="spring-dot" r="5" fill="var(--accent)" cx="34" cy="' + y(0) + '"/>';

    statsOutput.innerHTML =
      '<span>' + (lang === 'en' ? 'Overshoot' : 'Sobrepaso') + ': <b>' + Math.max(0, (maximum - 1) * 100).toFixed(0) + '%</b></span>' +
      '<span>' + (lang === 'en' ? 'Settles in' : 'Se asienta en') + ': <b>' + (last > 9.99 ? '> 10 s' : last.toFixed(2) + ' s') + '</b></span>';

    codeOutput.textContent = codeText();
    animation.chart = { curve: curve, maxTime: maxTime, x: x, y: y };
    updateControlOutputs();
    play();
  }

  function play() {
    window.cancelAnimationFrame(animation.frame);

    if (!animation.chart) return;

    var curve = animation.chart.curve;
    var maxTime = animation.chart.maxTime;
    var x = animation.chart.x;
    var y = animation.chart.y;
    var width = track ? track.clientWidth : 0;

    if (reduceMotion) {
      var finalValue = curve(maxTime);
      var dot = document.getElementById('spring-dot');

      if (ball) ball.style.transform = 'translateX(' + (1 * (0.8 * width - 21)) + 'px)';
      if (dot) {
        dot.setAttribute('cx', x(maxTime));
        dot.setAttribute('cy', y(finalValue));
      }

      return;
    }

    var start = performance.now();

    var step = function (now) {
      var time = Math.min((now - start) / 1000, maxTime);
      var value = curve(time);

      if (ball) ball.style.transform = 'translateX(' + (value * (0.8 * width - 21)) + 'px)';

      var dot = document.getElementById('spring-dot');
      if (dot) {
        dot.setAttribute('cx', x(time));
        dot.setAttribute('cy', y(value));
      }

      if (time < maxTime) animation.frame = window.requestAnimationFrame(step);
    };

    animation.frame = window.requestAnimationFrame(step);
  }

  modesContainer.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-mode]');

    if (!button) return;

    state.mode = button.getAttribute('data-mode');
    renderControls();
    setModePressed();
    update();
  });

  presetsContainer.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-preset]');

    if (!button) return;

    var index = Number(button.getAttribute('data-preset'));

    state.mode = 'db';
    state.duration = 0.5;
    state.bounce = presets[index][1];
    renderControls();
    setModePressed();
    update();
  });

  if (playButton) {
    playButton.addEventListener('click', play);
  }

  document.addEventListener('cv:langchange', update);

  renderModes();
  renderPresets();
  renderControls();
  setModePressed();
  update();
})();
