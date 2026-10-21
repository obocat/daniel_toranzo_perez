// Efectos e interacción del CV: idioma, revelado, header, foco y comentarios

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ==========================================
     IDIOMA ES / EN
     ========================================== */

  var langButtons = document.querySelectorAll('.lang-btn');
  var wrapper = document.querySelector('.wrapper');

  function getLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function syncLangUI(lang) {
    Array.prototype.forEach.call(langButtons, function (button) {
      button.setAttribute(
        'aria-pressed',
        button.getAttribute('data-lang-btn') === lang ? 'true' : 'false'
      );
    });
  }

  function setLang(lang, animate) {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);

    try {
      window.localStorage.setItem('cv-lang', lang);
    } catch (error) {}

    syncLangUI(lang);

    if (animate && wrapper && !reduceMotion) {
      wrapper.style.transition = 'opacity 0.18s ease';
      wrapper.style.opacity = '0';
      window.requestAnimationFrame(function () {
        wrapper.style.opacity = '1';
      });
    }
  }

  if (langButtons.length) {
    Array.prototype.forEach.call(langButtons, function (button) {
      button.addEventListener('click', function () {
        setLang(button.getAttribute('data-lang-btn'), true);
      });
    });

    setLang(getLang(), false);
  }

  /* ==========================================
     AJUSTE DEL NOMBRE EN EL HEADER
     ========================================== */

  function fitHeaderName() {
    var name = document.querySelector('.header-name');
    if (!name) return;

    name.style.fontSize = '';

    var size = parseFloat(window.getComputedStyle(name).fontSize);
    var guard = 0;

    while (name.scrollWidth > name.clientWidth && size > 9.5 && guard < 90) {
      size -= 0.25;
      name.style.fontSize = size + 'px';
      guard += 1;
    }
  }

  fitHeaderName();
  window.addEventListener('resize', fitHeaderName);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitHeaderName);
  }

  /* ==========================================
     HEADER AL HACER SCROLL
     ========================================== */

  var header = document.querySelector('.fixed-header');

  if (header) {
    var updateHeader = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };

    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
  }

  /* ==========================================
     REVELADO AL SCROLL
     ========================================== */

  var revealElements = document.querySelectorAll('.section-header, .resume-item');

  document.documentElement.classList.add('js-reveal');

  Array.prototype.forEach.call(revealElements, function (element) {
    element.classList.add('reveal');
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealElements, function (element) {
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

    Array.prototype.forEach.call(revealElements, function (element, index) {
      element.style.transitionDelay = (index % 3) * 70 + 'ms';
      observer.observe(element);
    });
  }

  /* ==========================================
     FOCO DE LUZ + COMENTARIOS DE CÓDIGO
     ========================================== */

  var items = document.querySelectorAll('.resume-item');

  if (canHover) {
    Array.prototype.forEach.call(items, function (item) {
      item.addEventListener('pointermove', function (event) {
        var rect = item.getBoundingClientRect();
        item.style.setProperty('--spot-x', event.clientX - rect.left + 'px');
        item.style.setProperty('--spot-y', event.clientY - rect.top + 'px');
      });

      var textEs = (item.getAttribute('data-comment-es') || '').replace(/^\/\/\s*/, '');
      var textEn = (item.getAttribute('data-comment-en') || '').replace(/^\/\/\s*/, '') || textEs;

      if (!textEs && !textEn) return;

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

        var text = getLang() === 'en' ? textEn : textEs;

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
})();
