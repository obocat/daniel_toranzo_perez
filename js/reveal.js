// Efectos visuales sutiles: revelado al hacer scroll + progreso de lectura

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var elements = document.querySelectorAll('.section-header, .resume-item');

  // La clase en <html> evita ocultar contenido si el JS no llega a ejecutarse.
  document.documentElement.classList.add('js-reveal');

  Array.prototype.forEach.call(elements, function (element) {
    element.classList.add('reveal');
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(elements, function (element) {
      element.classList.add('is-visible');
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );

    Array.prototype.forEach.call(elements, function (element, index) {
      element.style.transitionDelay = (index % 3) * 70 + 'ms';
      observer.observe(element);
    });
  }

  // Comentarios de código animados al pasar el cursor
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var commentItems = document.querySelectorAll('.resume-item[data-comment]');

  if (canHover) {
    Array.prototype.forEach.call(commentItems, function (item) {
      var text = (item.getAttribute('data-comment') || '').replace(/^\/\/\s*/, '');
      if (!text) return;

      var comment = document.createElement('span');
      comment.className = 'code-comment no-print';
      comment.setAttribute('aria-hidden', 'true');

      var prefix = document.createElement('span');
      prefix.className = 'code-comment-prefix';
      prefix.textContent = '// ';

      var body = document.createElement('span');
      body.className = 'code-comment-text';

      var caret = document.createElement('span');
      caret.className = 'code-comment-caret';

      comment.appendChild(prefix);
      comment.appendChild(body);
      comment.appendChild(caret);
      item.appendChild(comment);

      var timer = null;
      var typing = false;

      var reset = function () {
        window.clearTimeout(timer);
        typing = false;
        body.textContent = '';
      };

      var type = function () {
        window.clearTimeout(timer);

        if (reduceMotion) {
          body.textContent = text;
          return;
        }

        var index = 0;
        body.textContent = '';
        typing = true;

        var step = function () {
          if (!typing || index >= text.length) {
            typing = false;
            return;
          }
          body.textContent += text.charAt(index);
          index += 1;
          timer = window.setTimeout(step, 28 + Math.random() * 30);
        };

        step();
      };

      item.addEventListener('mouseenter', type);
      item.addEventListener('mouseleave', reset);
      item.addEventListener('focusin', type);
      item.addEventListener('focusout', reset);
    });
  }

  // Ajuste del nombre del header para que quepa siempre en una línea
  function fitHeaderName() {
    var name = document.querySelector('.header-name');
    if (!name) return;

    name.style.fontSize = '';

    var size = parseFloat(window.getComputedStyle(name).fontSize);
    var guard = 0;

    while (name.scrollWidth > name.clientWidth && size > 10 && guard < 80) {
      size -= 0.5;
      name.style.fontSize = size + 'px';
      guard += 1;
    }
  }

  fitHeaderName();
  window.addEventListener('resize', fitHeaderName);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitHeaderName);
  }

  // Barra de progreso de lectura
  var bar = document.querySelector('.scroll-progress span');

  if (bar) {
    var ticking = false;

    var updateProgress = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      bar.style.transform = 'scaleX(' + progress + ')';
      ticking = false;
    };

    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateProgress);
      },
      { passive: true }
    );

    window.addEventListener('resize', updateProgress);
    updateProgress();
  }
})();
