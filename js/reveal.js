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

  var revealElements = document.querySelectorAll('.section-header, .resume-item, .project-card, .skill-group');

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
     COMENTARIOS DE CÓDIGO
     ========================================== */

  var items = document.querySelectorAll('.resume-item');

  if (canHover) {
    Array.prototype.forEach.call(items, function (item) {
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

  /* ==========================================
     CERTIFICACIONES PLEGADAS
     ========================================== */

  var collapsibleSections = document.querySelectorAll('details.section-collapsible');

  Array.prototype.forEach.call(collapsibleSections, function (details) {
    details.addEventListener('toggle', function () {
      if (!details.open) return;

      Array.prototype.forEach.call(details.querySelectorAll('.reveal'), function (element) {
        element.classList.add('is-visible');
      });
    });
  });

  /* Al imprimir, muestra también las certificaciones plegadas. */
  var printedDetails = [];

  window.addEventListener('beforeprint', function () {
    printedDetails = [];

    Array.prototype.forEach.call(collapsibleSections, function (details) {
      printedDetails.push({ element: details, open: details.open });
      details.open = true;
    });
  });

  window.addEventListener('afterprint', function () {
    printedDetails.forEach(function (state) {
      state.element.open = state.open;
    });
    printedDetails = [];
  });

  /* ==========================================
     COPIAR EMAIL
     ========================================== */

  var copyButton = document.querySelector('.copy-email');

  if (copyButton) {
    var copyLabelEs = copyButton.querySelector('.lang-es');
    var copyLabelEn = copyButton.querySelector('.lang-en');
    var copyTimer = null;
    var originalLabels = {
      es: copyLabelEs ? copyLabelEs.textContent : '',
      en: copyLabelEn ? copyLabelEn.textContent : ''
    };

    var resetCopyButton = function () {
      copyButton.classList.remove('is-copied', 'is-error');

      if (copyLabelEs) copyLabelEs.textContent = originalLabels.es;
      if (copyLabelEn) copyLabelEn.textContent = originalLabels.en;
    };

    var showCopied = function () {
      copyButton.classList.remove('is-error');
      copyButton.classList.add('is-copied');

      if (copyLabelEs) {
        copyLabelEs.textContent = copyButton.getAttribute('data-copied-es') || 'Copiado';
      }

      if (copyLabelEn) {
        copyLabelEn.textContent = copyButton.getAttribute('data-copied-en') || 'Copied';
      }

      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(resetCopyButton, 2000);
    };

    var showCopyHelp = function () {
      copyButton.classList.remove('is-copied');
      copyButton.classList.add('is-error');

      if (copyLabelEs) {
        copyLabelEs.textContent = copyButton.getAttribute('data-error-es') || 'Copia manualmente';
      }

      if (copyLabelEn) {
        copyLabelEn.textContent = copyButton.getAttribute('data-error-en') || 'Copy manually';
      }

      var email = document.querySelector('.contact-email');

      if (email) {
        var range = document.createRange();
        range.selectNodeContents(email);
        var selection = window.getSelection();

        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(resetCopyButton, 4000);
    };

    var copyToClipboard = function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }

      return new Promise(function (resolve, reject) {
        var field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.top = '-9999px';
        document.body.appendChild(field);
        field.select();

        try {
          if (document.execCommand('copy')) {
            resolve();
          } else {
            reject(new Error('copy failed'));
          }
        } catch (error) {
          reject(error);
        } finally {
          document.body.removeChild(field);
        }
      });
    };

    copyButton.addEventListener('click', function () {
      copyToClipboard(copyButton.getAttribute('data-email') || '')
        .then(showCopied)
        .catch(showCopyHelp);
    });
  }
})();
