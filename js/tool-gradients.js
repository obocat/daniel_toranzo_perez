// Animador de gradientes de SwiftUI.

(function () {
  'use strict';

  var typesContainer = document.getElementById('gradient-types');
  var typeInfo = document.getElementById('gradient-type-info');
  var stopsSection = document.getElementById('gradient-stops-section');
  var meshSection = document.getElementById('gradient-mesh-section');
  var stopsContainer = document.getElementById('gradient-stops');
  var addStopButton = document.getElementById('gradient-add-stop');
  var meshContainer = document.getElementById('gradient-mesh-colors');
  var meshSizeSelect = document.getElementById('gradient-mesh-size');
  var controlsContainer = document.getElementById('gradient-controls');
  var presetsContainer = document.getElementById('gradient-presets');
  var preview = document.getElementById('gradient-preview');
  var canvas = document.getElementById('gradient-canvas');
  var apiBadge = document.getElementById('gradient-api');
  var progress = document.getElementById('gradient-progress');
  var progressValue = document.getElementById('gradient-progress-value');
  var statsOutput = document.getElementById('gradient-stats');
  var codeOutput = document.getElementById('gradient-code');
  var playButton = document.getElementById('gradient-play');
  var resetButton = document.getElementById('gradient-reset');
  var pointsToggle = document.getElementById('gradient-points-toggle');
  var showPointsInput = document.getElementById('gradient-show-points');

  if (!typesContainer || !typeInfo || !stopsSection || !meshSection || !stopsContainer ||
      !addStopButton || !meshContainer || !meshSizeSelect || !controlsContainer ||
      !presetsContainer || !preview || !canvas || !apiBadge || !progress ||
      !progressValue || !statsOutput || !codeOutput || !playButton || !resetButton ||
      !pointsToggle || !showPointsInput) {
    return;
  }

  var types = [
    { key: 'linear', label: 'Linear', api: 'iOS 13+' },
    { key: 'angular', label: 'Angular', api: 'iOS 13+' },
    { key: 'radial', label: 'Radial', api: 'iOS 13+' },
    { key: 'mesh', label: 'Mesh', api: 'iOS 18+' }
  ];

  var controlConfig = {
    linear: [
      ['angle', 0, 360, 1, '°', 'Dirección', 'Direction'],
      ['swing', 0, 90, 1, '°', 'Oscilación', 'Swing'],
      ['duration', 0.5, 10, 0.1, 's', 'Duración', 'Duration']
    ],
    angular: [
      ['angle', 0, 360, 1, '°', 'Rotación inicial', 'Start rotation'],
      ['centerX', 0, 100, 1, '%', 'Centro X', 'Center X'],
      ['centerY', 0, 100, 1, '%', 'Centro Y', 'Center Y'],
      ['duration', 0.5, 10, 0.1, 's', 'Duración', 'Duration']
    ],
    radial: [
      ['centerX', 0, 100, 1, '%', 'Centro X', 'Center X'],
      ['centerY', 0, 100, 1, '%', 'Centro Y', 'Center Y'],
      ['drift', 0, 30, 1, '%', 'Deriva', 'Drift'],
      ['duration', 0.5, 10, 0.1, 's', 'Duración', 'Duration']
    ],
    mesh: [
      ['warp', 0, 25, 1, '%', 'Deformación', 'Warp'],
      ['duration', 0.5, 10, 0.1, 's', 'Duración', 'Duration']
    ]
  };

  var meshPalettes = {
    3: [
      '#0A84FF', '#5E5CE6', '#BF5AF2',
      '#30D158', '#FFFFFF', '#FF9F0A',
      '#FF375F', '#FFD60A', '#64D2FF'
    ],
    4: [
      '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F',
      '#30D158', '#64D2FF', '#FFFFFF', '#FF9F0A',
      '#FFD60A', '#FF9F0A', '#FF375F', '#BF5AF2',
      '#0A84FF', '#30D158', '#FFD60A', '#64D2FF'
    ]
  };

  var presets = [
    {
      name: 'Aurora',
      type: 'mesh',
      meshSize: 3,
      colors: meshPalettes[3].slice(),
      warp: 14,
      duration: 5
    },
    {
      name: 'Sunset',
      type: 'angular',
      stops: [
        { color: '#FF9F0A', location: 0 },
        { color: '#FF375F', location: 50 },
        { color: '#BF5AF2', location: 100 }
      ],
      angle: 0,
      centerX: 50,
      centerY: 50,
      duration: 6
    },
    {
      name: 'Ocean',
      type: 'radial',
      stops: [
        { color: '#30D158', location: 0 },
        { color: '#0A84FF', location: 55 },
        { color: '#5E5CE6', location: 100 }
      ],
      centerX: 40,
      centerY: 60,
      drift: 10,
      duration: 5
    },
    {
      name: 'Candy',
      type: 'linear',
      stops: [
        { color: '#FF375F', location: 0 },
        { color: '#FFD60A', location: 50 },
        { color: '#0A84FF', location: 100 }
      ],
      angle: 45,
      swing: 30,
      duration: 4
    }
  ];

  var state = {
    type: 'mesh',
    stops: [
      { color: '#0A84FF', location: 0 },
      { color: '#BF5AF2', location: 50 },
      { color: '#FF375F', location: 100 }
    ],
    angle: 45,
    swing: 25,
    centerX: 50,
    centerY: 50,
    drift: 12,
    warp: 12,
    duration: 4,
    meshSize: 3,
    meshColors: {
      3: meshPalettes[3].slice(),
      4: meshPalettes[4].slice()
    },
    showPoints: false
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var animation = {
    playing: false,
    progress: reduceMotion ? 0.25 : 0,
    lastTime: 0,
    frame: 0
  };

  var previewWidth = 0;
  var previewHeight = 0;
  var canvasContext = null;
  var pixelRatio = 1;

  function currentLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function decimal(value, places) {
    return String(Number(Number(value).toFixed(places)));
  }

  function number(value) {
    return decimal(value, 3);
  }

  function hexToRgb(hex) {
    var value = String(hex || '').replace('#', '');

    if (value.length === 3) {
      value = value.charAt(0) + value.charAt(0) +
        value.charAt(1) + value.charAt(1) +
        value.charAt(2) + value.charAt(2);
    }

    var integer = parseInt(value, 16);

    if (!isFinite(integer)) return { r: 0, g: 0, b: 0 };

    return {
      r: (integer >> 16) & 255,
      g: (integer >> 8) & 255,
      b: integer & 255
    };
  }

  function colorCode(hex) {
    var rgb = hexToRgb(hex);

    return 'Color(red: ' + decimal(rgb.r / 255, 4) +
      ', green: ' + decimal(rgb.g / 255, 4) +
      ', blue: ' + decimal(rgb.b / 255, 4) + ')';
  }

  function averageColor(colors) {
    var total = { r: 0, g: 0, b: 0 };

    colors.forEach(function (hex) {
      var rgb = hexToRgb(hex);
      total.r += rgb.r;
      total.g += rgb.g;
      total.b += rgb.b;
    });

    return {
      r: Math.round(total.r / colors.length),
      g: Math.round(total.g / colors.length),
      b: Math.round(total.b / colors.length)
    };
  }

  function sortedStops() {
    return state.stops.slice().sort(function (a, b) {
      return a.location - b.location;
    });
  }

  function configFor(key) {
    var list = controlConfig[state.type];

    for (var index = 0; index < list.length; index += 1) {
      if (list[index][0] === key) return list[index];
    }

    return null;
  }

  function typeLabel(key) {
    for (var index = 0; index < types.length; index += 1) {
      if (types[index].key === key) return types[index];
    }

    return types[0];
  }

  function typeInfoText() {
    var english = currentLang() === 'en';

    if (state.type === 'linear') {
      return english
        ? 'iOS 13+ · animates startPoint and endPoint with TimelineView (iOS 15+).'
        : 'iOS 13+ · anima startPoint y endPoint con TimelineView (iOS 15+).';
    }

    if (state.type === 'angular') {
      return english
        ? 'iOS 13+ · animates startAngle and endAngle with TimelineView (iOS 15+).'
        : 'iOS 13+ · anima startAngle y endAngle con TimelineView (iOS 15+).';
    }

    if (state.type === 'radial') {
      return english
        ? 'iOS 13+ · animates center with TimelineView (iOS 15+).'
        : 'iOS 13+ · anima center con TimelineView (iOS 15+).';
    }

    return english
      ? 'iOS 18+ · a ' + state.meshSize + ' × ' + state.meshSize + ' mesh moves only its interior points; the code animates points.'
      : 'iOS 18+ · una malla ' + state.meshSize + ' × ' + state.meshSize + ' mueve solo sus puntos interiores; el código anima points.';
  }

  function previewAriaText() {
    var english = currentLang() === 'en';

    if (state.type === 'linear') {
      return english ? 'Animated linear gradient preview' : 'Vista previa animada de un gradiente lineal';
    }

    if (state.type === 'angular') {
      return english ? 'Animated angular gradient preview' : 'Vista previa animada de un gradiente angular';
    }

    if (state.type === 'radial') {
      return english ? 'Animated radial gradient preview' : 'Vista previa animada de un gradiente radial';
    }

    return english ? 'Animated mesh gradient preview' : 'Vista previa animada de un gradiente de malla';
  }

  function renderTypes() {
    typesContainer.innerHTML = types.map(function (type) {
      return '<button type="button" class="tool-preset" data-type="' + type.key + '" aria-pressed="false">' + type.label + '</button>';
    }).join('');
  }

  function setTypePressed() {
    Array.prototype.forEach.call(typesContainer.children, function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-type') === state.type ? 'true' : 'false');
    });
  }

  function renderPresets() {
    presetsContainer.innerHTML = presets.map(function (preset, index) {
      return '<button type="button" class="tool-preset" data-preset="' + index + '">' + preset.name + '</button>';
    }).join('');
  }

  function renderStops() {
    var english = currentLang() === 'en';

    stopsContainer.innerHTML = state.stops.map(function (stop, index) {
      var position = index + 1;
      var colorLabel = 'Color ' + position;
      var positionLabel = english
        ? 'Stop ' + position + ' position (%)'
        : 'Posición de la parada ' + position + ' (%)';
      var removeLabel = english ? 'Remove stop ' + position : 'Eliminar parada ' + position;

      return '<div class="gradient-stop" data-index="' + index + '">' +
        '<input class="gradient-color" type="color" value="' + stop.color + '" data-index="' + index + '" aria-label="' + colorLabel + '">' +
        '<input class="gradient-number gradient-stop-location" type="number" min="0" max="100" step="1" value="' + number(stop.location) + '" data-index="' + index + '" inputmode="decimal" aria-label="' + positionLabel + '">' +
        '<span class="gradient-unit">%</span>' +
        '<button class="gradient-remove" type="button" data-index="' + index + '" aria-label="' + removeLabel + '"' + (state.stops.length <= 2 ? ' disabled' : '') + '>&times;</button>' +
        '</div>';
    }).join('');

    addStopButton.disabled = state.stops.length >= 5;
  }

  function renderMeshColors() {
    var size = state.meshSize;
    var colors = state.meshColors[size];
    var english = currentLang() === 'en';

    meshSizeSelect.value = String(size);
    meshContainer.style.gridTemplateColumns = 'repeat(' + size + ', minmax(0, 1fr))';
    meshContainer.innerHTML = colors.map(function (color, index) {
      var row = Math.floor(index / size) + 1;
      var column = (index % size) + 1;
      var label = english
        ? 'Mesh color row ' + row + ', column ' + column
        : 'Color de malla fila ' + row + ', columna ' + column;

      return '<input class="gradient-mesh-color" type="color" value="' + color + '" data-index="' + index + '" aria-label="' + label + '">';
    }).join('');
  }

  function controlMarkup(control) {
    var key = control[0];
    var min = control[1];
    var max = control[2];
    var step = control[3];
    var unit = control[4];
    var label = currentLang() === 'en' ? control[6] : control[5];
    var value = number(state[key]);

    return '<div class="gradient-control">' +
      '<div class="gradient-control-head">' +
        '<label class="gradient-control-name" for="gradient-' + key + '">' + label + '</label>' +
        '<span class="gradient-value">' +
          '<input class="gradient-number" type="number" id="gradient-number-' + key + '" data-key="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" inputmode="decimal" aria-label="' + label + (unit ? ' (' + unit + ')' : '') + '">' +
          (unit ? '<span class="gradient-unit">' + unit + '</span>' : '') +
        '</span>' +
      '</div>' +
      '<input class="gradient-range" type="range" id="gradient-' + key + '" data-key="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
      '</div>';
  }

  function renderControls() {
    controlsContainer.innerHTML = controlConfig[state.type].map(controlMarkup).join('');
  }

  function updateSections() {
    var isMesh = state.type === 'mesh';

    stopsSection.hidden = isMesh;
    meshSection.hidden = !isMesh;
    pointsToggle.hidden = !isMesh;
  }

  function updateTypeInfo() {
    typeInfo.textContent = typeInfoText();
  }

  function updateApiBadge() {
    var type = typeLabel(state.type);
    var names = {
      linear: 'LinearGradient',
      angular: 'AngularGradient',
      radial: 'RadialGradient',
      mesh: 'MeshGradient'
    };

    apiBadge.textContent = names[state.type] + ' · ' + type.api;
  }

  function updatePreviewAria() {
    preview.setAttribute('aria-label', previewAriaText());
  }

  function updatePlayButton() {
    var spanish = playButton.querySelector('[data-gradient-play-label="es"]');
    var english = playButton.querySelector('[data-gradient-play-label="en"]');
    var paused = !animation.playing && animation.progress > 0.001;

    if (spanish) spanish.textContent = animation.playing ? 'Pausar' : (paused ? 'Continuar' : 'Reproducir');
    if (english) english.textContent = animation.playing ? 'Pause' : (paused ? 'Resume' : 'Play');
    playButton.setAttribute('aria-pressed', animation.playing ? 'true' : 'false');
  }

  function updateProgress() {
    progress.value = String(Math.round(animation.progress * 1000));
    progressValue.textContent = Math.round(animation.progress * 100) + '%';
  }

  function stopsCode() {
    return sortedStops().map(function (stop) {
      return '        .init(color: ' + colorCode(stop.color) + ', location: ' + number(stop.location / 100) + ')';
    }).join(',\n');
  }

  function pointsCode(size) {
    var lines = [];

    for (var row = 0; row < size; row += 1) {
      var parts = [];

      for (var column = 0; column < size; column += 1) {
        parts.push('.init(' + decimal(column / (size - 1), 4) + ', ' + decimal(row / (size - 1), 4) + ')');
      }

      lines.push('        ' + parts.join(', '));
    }

    return lines.join(',\n');
  }

  function meshColorsCode(size) {
    return state.meshColors[size].map(function (hex) {
      return '        ' + colorCode(hex);
    }).join(',\n');
  }

  function linearCode() {
    return 'import SwiftUI\n\n' +
      '// Requires iOS 15+ for TimelineView.\n' +
      'struct AnimatedLinearGradient: View {\n' +
      '    private let stops: [Gradient.Stop] = [\n' +
      stopsCode() + '\n' +
      '    ]\n\n' +
      '    var body: some View {\n' +
      '        TimelineView(.animation) { context in\n' +
      '            let phase = context.date.timeIntervalSinceReferenceDate * 2 * .pi / ' + number(state.duration) + '\n' +
      '            let angle = Angle.degrees(' + number(state.angle) + ' + sin(phase) * ' + number(state.swing) + ')\n' +
      '            let dx = CGFloat(cos(angle.radians)) * 0.5\n' +
      '            let dy = CGFloat(sin(angle.radians)) * 0.5\n\n' +
      '            LinearGradient(\n' +
      '                stops: stops,\n' +
      '                startPoint: UnitPoint(x: 0.5 - dx, y: 0.5 - dy),\n' +
      '                endPoint: UnitPoint(x: 0.5 + dx, y: 0.5 + dy)\n' +
      '            )\n' +
      '        }\n' +
      '        .ignoresSafeArea()\n' +
      '    }\n' +
      '}\n';
  }

  function angularCode() {
    var offset = state.angle === 0 ? '' : ' + ' + number(state.angle);

    return 'import SwiftUI\n\n' +
      '// Requires iOS 15+ for TimelineView.\n' +
      'struct AnimatedAngularGradient: View {\n' +
      '    private let stops: [Gradient.Stop] = [\n' +
      stopsCode() + '\n' +
      '    ]\n\n' +
      '    var body: some View {\n' +
      '        TimelineView(.animation) { context in\n' +
      '            let seconds = context.date.timeIntervalSinceReferenceDate\n' +
      '            let degrees = (seconds * 360 / ' + number(state.duration) + offset + ').truncatingRemainder(dividingBy: 360)\n' +
      '            let rotation = Angle.degrees(degrees)\n\n' +
      '            AngularGradient(\n' +
      '                stops: stops,\n' +
      '                center: UnitPoint(x: ' + number(state.centerX / 100) + ', y: ' + number(state.centerY / 100) + '),\n' +
      '                startAngle: rotation,\n' +
      '                endAngle: rotation + .degrees(360)\n' +
      '            )\n' +
      '        }\n' +
      '        .ignoresSafeArea()\n' +
      '    }\n' +
      '}\n';
  }

  function radialCode() {
    return 'import SwiftUI\n\n' +
      '// Requires iOS 15+ for TimelineView.\n' +
      'struct AnimatedRadialGradient: View {\n' +
      '    private let stops: [Gradient.Stop] = [\n' +
      stopsCode() + '\n' +
      '    ]\n\n' +
      '    var body: some View {\n' +
      '        GeometryReader { proxy in\n' +
      '            TimelineView(.animation) { context in\n' +
      '                let phase = context.date.timeIntervalSinceReferenceDate * 2 * .pi / ' + number(state.duration) + '\n' +
      '                let drift: CGFloat = ' + number(state.drift / 100) + '\n' +
      '                let center = UnitPoint(\n' +
      '                    x: ' + number(state.centerX / 100) + ' + CGFloat(sin(phase)) * drift,\n' +
      '                    y: ' + number(state.centerY / 100) + ' + CGFloat(cos(phase)) * drift\n' +
      '                )\n\n' +
      '                RadialGradient(\n' +
      '                    stops: stops,\n' +
      '                    center: center,\n' +
      '                    startRadius: 0,\n' +
      '                    endRadius: max(proxy.size.width, proxy.size.height) * 0.75\n' +
      '                )\n' +
      '            }\n' +
      '        }\n' +
      '        .ignoresSafeArea()\n' +
      '    }\n' +
      '}\n';
  }

  function meshCode() {
    var size = state.meshSize;

    return 'import SwiftUI\n\n' +
      '// Requires iOS 18+ for MeshGradient.\n' +
      'struct AnimatedMeshGradient: View {\n' +
      '    private let colors: [Color] = [\n' +
      meshColorsCode(size) + '\n' +
      '    ]\n' +
      '    private let basePoints: [SIMD2<Float>] = [\n' +
      pointsCode(size) + '\n' +
      '    ]\n\n' +
      '    var body: some View {\n' +
      '        TimelineView(.animation) { context in\n' +
      '            let phase = context.date.timeIntervalSinceReferenceDate * 2 * .pi / ' + number(state.duration) + '\n' +
      '            let warp: Float = ' + number(state.warp / 100) + '\n' +
      '            let points = basePoints.enumerated().map { index, point in\n' +
      '                let row = index / ' + size + '\n' +
      '                let column = index % ' + size + '\n' +
      '                guard row > 0, row < ' + (size - 1) + ', column > 0, column < ' + (size - 1) + ' else { return point }\n' +
      '                let x = Float(sin(phase + Double(column) * 0.9 + Double(row) * 1.3)) * warp\n' +
      '                let y = Float(cos(phase + Double(column) * 1.1 + Double(row) * 0.7)) * warp\n' +
      '                return SIMD2<Float>(point.x + x, point.y + y)\n' +
      '            }\n\n' +
      '            MeshGradient(\n' +
      '                width: ' + size + ',\n' +
      '                height: ' + size + ',\n' +
      '                points: points,\n' +
      '                colors: colors,\n' +
      '                smoothsColors: true\n' +
      '            )\n' +
      '        }\n' +
      '        .ignoresSafeArea()\n' +
      '    }\n' +
      '}\n';
  }

  function codeText() {
    if (state.type === 'angular') return angularCode();
    if (state.type === 'radial') return radialCode();
    if (state.type === 'mesh') return meshCode();
    return linearCode();
  }

  function updateCode() {
    codeOutput.textContent = codeText();
  }

  function stat(label, value) {
    return '<span>' + label + ': <b>' + value + '</b></span>';
  }

  function updateStats() {
    var english = currentLang() === 'en';
    var markup = '';

    if (state.type === 'linear') {
      markup = stat(english ? 'Direction' : 'Dirección', number(state.angle) + '° ± ' + number(state.swing) + '°') +
        stat(english ? 'Stops' : 'Paradas', state.stops.length) +
        stat(english ? 'Duration' : 'Duración', number(state.duration) + ' s');
    } else if (state.type === 'angular') {
      markup = stat(english ? 'Rotation' : 'Rotación', '360° / ' + number(state.duration) + ' s') +
        stat(english ? 'Center' : 'Centro', number(state.centerX) + '% / ' + number(state.centerY) + '%') +
        stat(english ? 'Stops' : 'Paradas', state.stops.length);
    } else if (state.type === 'radial') {
      markup = stat(english ? 'Drift' : 'Deriva', number(state.drift) + '%') +
        stat(english ? 'Center' : 'Centro', number(state.centerX) + '% / ' + number(state.centerY) + '%') +
        stat(english ? 'Stops' : 'Paradas', state.stops.length);
    } else {
      markup = stat(english ? 'Mesh' : 'Malla', state.meshSize + ' × ' + state.meshSize) +
        stat(english ? 'Interior points' : 'Puntos interiores', (state.meshSize - 2) * (state.meshSize - 2)) +
        stat(english ? 'Warp' : 'Deformación', number(state.warp) + '%') +
        stat(english ? 'Duration' : 'Duración', number(state.duration) + ' s');
    }

    statsOutput.innerHTML = markup;
  }

  function meshPoints(size, phase) {
    var points = [];
    var warp = state.warp / 100;

    for (var row = 0; row < size; row += 1) {
      for (var column = 0; column < size; column += 1) {
        var x = column / (size - 1);
        var y = row / (size - 1);

        if (row > 0 && row < size - 1 && column > 0 && column < size - 1) {
          x += Math.sin(phase + column * 0.9 + row * 1.3) * warp;
          y += Math.cos(phase + column * 1.1 + row * 0.7) * warp;
        }

        points.push({ x: x, y: y });
      }
    }

    return points;
  }

  function cssGradient(phase) {
    var stops = sortedStops().map(function (stop) {
      return stop.color + ' ' + number(stop.location) + '%';
    }).join(', ');

    if (state.type === 'linear') {
      var angle = state.angle + Math.sin(phase) * state.swing;
      return 'linear-gradient(' + number(angle + 90) + 'deg, ' + stops + ')';
    }

    if (state.type === 'angular') {
      var rotation = (state.angle + animation.progress * 360) % 360;
      return 'conic-gradient(from ' + number(rotation + 90) + 'deg at ' + number(state.centerX) + '% ' + number(state.centerY) + '%, ' + stops + ')';
    }

    var dx = Math.sin(phase) * state.drift;
    var dy = Math.cos(phase) * state.drift;
    var radius = Math.max(previewWidth, previewHeight) * 0.75;

    return 'radial-gradient(circle ' + number(radius) + 'px at ' + number(state.centerX + dx) + '% ' + number(state.centerY + dy) + '%, ' + stops + ')';
  }

  function drawMeshGrid(context, points, width, height, size) {
    var row;
    var column;
    var point;

    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    context.lineWidth = 1;

    for (row = 0; row < size; row += 1) {
      context.beginPath();

      for (column = 0; column < size; column += 1) {
        point = points[row * size + column];

        if (column === 0) context.moveTo(point.x * width, point.y * height);
        else context.lineTo(point.x * width, point.y * height);
      }

      context.stroke();
    }

    for (column = 0; column < size; column += 1) {
      context.beginPath();

      for (row = 0; row < size; row += 1) {
        point = points[row * size + column];

        if (row === 0) context.moveTo(point.x * width, point.y * height);
        else context.lineTo(point.x * width, point.y * height);
      }

      context.stroke();
    }

    for (var index = 0; index < points.length; index += 1) {
      point = points[index];
      context.beginPath();
      context.arc(point.x * width, point.y * height, 3.4, 0, Math.PI * 2);
      context.fillStyle = '#FFFFFF';
      context.fill();
      context.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      context.stroke();
    }

    context.restore();
  }

  function renderMesh(phase) {
    if (!canvasContext || !previewWidth || !previewHeight) return;

    var context = canvasContext;
    var size = state.meshSize;
    var colors = state.meshColors[size];
    var points = meshPoints(size, phase);
    var average = averageColor(colors);
    var radius = Math.max(previewWidth, previewHeight) * (size === 3 ? 0.62 : 0.52);

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, previewWidth, previewHeight);
    context.fillStyle = 'rgb(' + average.r + ', ' + average.g + ', ' + average.b + ')';
    context.fillRect(0, 0, previewWidth, previewHeight);

    for (var index = 0; index < points.length; index += 1) {
      var point = points[index];
      var rgb = hexToRgb(colors[index]);
      var x = point.x * previewWidth;
      var y = point.y * previewHeight;
      var gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      var color = 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ';

      gradient.addColorStop(0, color + '0.92)');
      gradient.addColorStop(0.5, color + '0.62)');
      gradient.addColorStop(1, color + '0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, previewWidth, previewHeight);
    }

    if (state.showPoints) {
      drawMeshGrid(context, points, previewWidth, previewHeight, size);
    }
  }

  function renderPreview() {
    var phase = animation.progress * Math.PI * 2;

    if (state.type === 'mesh') {
      preview.style.background = 'transparent';
      canvas.hidden = false;
      renderMesh(phase);
    } else {
      canvas.hidden = true;
      preview.style.background = cssGradient(phase);
    }
  }

  function resizePreview() {
    var rect = preview.getBoundingClientRect();

    previewWidth = Math.max(1, Math.round(rect.width));
    previewHeight = Math.max(1, Math.round(rect.height));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(previewWidth * pixelRatio);
    canvas.height = Math.round(previewHeight * pixelRatio);
    canvasContext = canvas.getContext('2d');
    renderPreview();
  }

  function start() {
    if (animation.playing) return;

    animation.playing = true;
    animation.lastTime = window.performance.now();
    updatePlayButton();
    animation.frame = window.requestAnimationFrame(tick);
  }

  function pause() {
    animation.playing = false;
    window.cancelAnimationFrame(animation.frame);
    updatePlayButton();
  }

  function tick(now) {
    if (!animation.playing) return;

    var delta = Math.min((now - animation.lastTime) / 1000, 0.1);
    animation.lastTime = now;
    animation.progress = (animation.progress + delta / state.duration) % 1;
    renderPreview();
    updateProgress();
    animation.frame = window.requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (animation.playing) pause();
    else start();
  }

  function onStateChange() {
    renderPreview();
    updateCode();
    updateStats();
    updateProgress();
  }

  function syncAll(resetProgress) {
    if (resetProgress) animation.progress = 0;

    setTypePressed();
    updateSections();
    renderStops();
    renderMeshColors();
    renderControls();
    updateTypeInfo();
    updateApiBadge();
    updatePreviewAria();
    updateCode();
    updateStats();
    updateProgress();
    updatePlayButton();
    renderPreview();
  }

  function applyPreset(index) {
    var preset = presets[index];

    if (!preset) return;

    state.type = preset.type;
    state.duration = preset.duration;

    if (preset.stops) {
      state.stops = preset.stops.map(function (stop) {
        return { color: stop.color, location: stop.location };
      });
    }

    if (preset.meshSize) {
      state.meshSize = preset.meshSize;
    }

    if (preset.colors) {
      state.meshColors[preset.meshSize] = preset.colors.slice();
    }

    ['angle', 'swing', 'centerX', 'centerY', 'drift', 'warp'].forEach(function (key) {
      if (typeof preset[key] === 'number') state[key] = preset[key];
    });

    animation.progress = 0;
    syncAll(false);

    if (state.type === 'mesh') resizePreview();
    else renderPreview();
  }

  typesContainer.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-type]');

    if (!button) return;

    var next = button.getAttribute('data-type');

    if (next === state.type) return;

    state.type = next;
    animation.progress = 0;
    syncAll(false);

    if (next === 'mesh') resizePreview();
    else renderPreview();
  });

  presetsContainer.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-preset]');

    if (!button) return;

    applyPreset(Number(button.getAttribute('data-preset')));
  });

  stopsContainer.addEventListener('input', function (event) {
    var colorInput = event.target.closest('.gradient-color');

    if (colorInput) {
      var colorIndex = Number(colorInput.getAttribute('data-index'));
      if (!state.stops[colorIndex]) return;
      state.stops[colorIndex].color = colorInput.value;
      onStateChange();
      return;
    }

    var locationInput = event.target.closest('.gradient-stop-location');

    if (locationInput) {
      if (locationInput.value === '') return;
      var locationIndex = Number(locationInput.getAttribute('data-index'));
      if (!state.stops[locationIndex]) return;
      var location = Number(locationInput.value);
      if (!isFinite(location)) return;
      state.stops[locationIndex].location = clamp(location, 0, 100);
      onStateChange();
    }
  });

  stopsContainer.addEventListener('change', function (event) {
    var locationInput = event.target.closest('.gradient-stop-location');

    if (!locationInput) return;

    var locationIndex = Number(locationInput.getAttribute('data-index'));
    if (!state.stops[locationIndex]) return;
    locationInput.value = number(state.stops[locationIndex].location);
  });

  stopsContainer.addEventListener('click', function (event) {
    var removeButton = event.target.closest('.gradient-remove');

    if (!removeButton || state.stops.length <= 2) return;

    state.stops.splice(Number(removeButton.getAttribute('data-index')), 1);
    renderStops();
    onStateChange();
  });

  addStopButton.addEventListener('click', function () {
    if (state.stops.length >= 5) return;

    var ordered = sortedStops();
    var location = 50;
    var largestGap = -1;

    for (var index = 1; index < ordered.length; index += 1) {
      var gap = ordered[index].location - ordered[index - 1].location;

      if (gap > largestGap) {
        largestGap = gap;
        location = ordered[index - 1].location + gap / 2;
      }
    }

    var palette = ['#FFFFFF', '#FFD60A', '#30D158', '#64D2FF', '#BF5AF2', '#FF9F0A'];
    var used = state.stops.map(function (stop) { return stop.color.toUpperCase(); });
    var color = '#FFFFFF';

    for (var colorIndex = 0; colorIndex < palette.length; colorIndex += 1) {
      if (used.indexOf(palette[colorIndex].toUpperCase()) === -1) {
        color = palette[colorIndex];
        break;
      }
    }

    state.stops.push({ color: color, location: Math.round(location) });
    state.stops.sort(function (a, b) { return a.location - b.location; });
    renderStops();
    onStateChange();
  });

  meshContainer.addEventListener('input', function (event) {
    var input = event.target.closest('.gradient-mesh-color');

    if (!input) return;

    var index = Number(input.getAttribute('data-index'));

    if (!state.meshColors[state.meshSize][index]) return;

    state.meshColors[state.meshSize][index] = input.value;
    onStateChange();
  });

  meshSizeSelect.addEventListener('change', function () {
    state.meshSize = Number(meshSizeSelect.value) === 4 ? 4 : 3;
    animation.progress = 0;
    renderMeshColors();
    updateTypeInfo();
    updateCode();
    updateStats();
    updateProgress();
    resizePreview();
  });

  controlsContainer.addEventListener('input', function (event) {
    var target = event.target;
    var key = target.getAttribute('data-key');

    if (!key || !target.matches('.gradient-range, .gradient-number')) return;
    if (target.value === '') return;

    var config = configFor(key);

    if (!config) return;

    var value = Number(target.value);

    if (!isFinite(value)) return;

    var clamped = clamp(value, config[1], config[2]);
    state[key] = clamped;

    var range = document.getElementById('gradient-' + key);
    var numberInput = document.getElementById('gradient-number-' + key);

    if (range && target !== range) range.value = clamped;
    if (numberInput && target !== numberInput) numberInput.value = number(clamped);

    onStateChange();
  });

  controlsContainer.addEventListener('change', function (event) {
    var key = event.target.getAttribute('data-key');

    if (!key || !event.target.matches('.gradient-number')) return;

    event.target.value = number(state[key]);
  });

  playButton.addEventListener('click', togglePlay);

  resetButton.addEventListener('click', function () {
    animation.progress = 0;

    if (animation.playing) animation.lastTime = window.performance.now();

    renderPreview();
    updateProgress();
    updatePlayButton();
  });

  showPointsInput.addEventListener('change', function () {
    state.showPoints = showPointsInput.checked;
    renderPreview();
  });

  progress.addEventListener('input', function () {
    animation.progress = Number(progress.value) / 1000;
    pause();
    renderPreview();
    updateProgress();
  });

  document.addEventListener('cv:langchange', function () {
    syncAll(false);

    if (state.type === 'mesh') resizePreview();
    else renderPreview();

    updatePlayButton();
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && animation.playing) {
      animation.lastTime = window.performance.now();
    }
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      resizePreview();
    }).observe(preview);
  } else {
    window.addEventListener('resize', resizePreview);
  }

  if (window.matchMedia) {
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    var handleMotionChange = function (event) {
      if (event.matches) pause();
    };

    if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleMotionChange);
    else if (motionQuery.addListener) motionQuery.addListener(handleMotionChange);
  }

  renderTypes();
  renderPresets();
  showPointsInput.checked = state.showPoints;
  syncAll(false);
  resizePreview();
  updatePlayButton();

  if (!reduceMotion) start();
})();
