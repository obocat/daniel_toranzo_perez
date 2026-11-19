// Abre el menú de compartir del sistema para enviar el feed a un lector RSS.
// En iOS, esto permite elegir NetNewsWire, Reeder u otro lector instalado.

(function () {
  'use strict';

  var buttons = document.querySelectorAll('[data-subscribe-feed]');
  if (!buttons.length) return;

  function getLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function shareFeed(button) {
    if (!navigator.share) return false;

    var url = button.href;
    if (!url) return false;

    try {
      if (navigator.canShare && !navigator.canShare({ url: url })) return false;
    } catch (error) {
      return false;
    }

    var lang = getLang();
    var title = lang === 'en'
      ? 'Daniel Toranzo Pérez — Blog (EN)'
      : 'Daniel Toranzo Pérez — Blog (ES)';
    var text = lang === 'en'
      ? 'Subscribe to the blog feed'
      : 'Suscríbete al feed del blog';

    navigator.share({ title: title, text: text, url: url }).catch(function (error) {
      if (error && error.name === 'AbortError') return;
      window.location.href = url;
    });

    return true;
  }

  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener('click', function (event) {
      if (shareFeed(button)) event.preventDefault();
    });
  });
})();
