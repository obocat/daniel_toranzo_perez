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
