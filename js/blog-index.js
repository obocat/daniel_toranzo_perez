// Búsqueda y filtros del archivo del blog.

(function () {
  'use strict';

  var filter = document.querySelector('[data-blog-filter]');
  var input = document.querySelector('#blog-search-input');
  var clearButton = document.querySelector('[data-blog-search-clear]');
  var resetButton = document.querySelector('[data-blog-reset]');
  var emptyState = document.querySelector('[data-blog-empty]');
  var countEs = document.querySelector('[data-blog-count-es]');
  var countEn = document.querySelector('[data-blog-count-en]');
  var tagDetails = document.querySelector('[data-blog-tag-details]');
  var tagButtons = Array.prototype.slice.call(document.querySelectorAll('[data-blog-tag]'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-blog-card]'));
  var yearSections = Array.prototype.slice.call(document.querySelectorAll('[data-blog-year]'));

  if (!filter || !input || !cards.length) return;

  var state = {
    query: '',
    tag: ''
  };

  function normalize(value) {
    var text = String(value || '').toLowerCase();

    if (text.normalize) {
      text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    return text.replace(/\s+/g, ' ').trim();
  }

  function getSearchText(card) {
    return normalize(
      (card.getAttribute('data-search-es') || '') + ' ' +
      (card.getAttribute('data-search-en') || '')
    );
  }

  function getTags(card) {
    var raw = card.getAttribute('data-tags') || '[]';

    try {
      return JSON.parse(raw).map(normalize).filter(Boolean);
    } catch (error) {
      return raw.split('|').map(normalize).filter(Boolean);
    }
  }

  var items = cards.map(function (card) {
    return {
      element: card,
      search: getSearchText(card),
      tags: getTags(card)
    };
  });

  function setCount(visible, total) {
    if (countEs) {
      countEs.textContent = visible === total
        ? total + (total === 1 ? ' artículo' : ' artículos')
        : visible + ' de ' + total + (total === 1 ? ' artículo' : ' artículos');
    }

    if (countEn) {
      countEn.textContent = visible === total
        ? total + (total === 1 ? ' article' : ' articles')
        : visible + ' of ' + total + (total === 1 ? ' article' : ' articles');
    }
  }

  function setTagButtons() {
    var active = normalize(state.tag);

    tagButtons.forEach(function (button) {
      var value = normalize(button.getAttribute('data-blog-tag') || '');
      var isActive = value === active || (!active && !value);

      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
    });
  }

  function updateUrl() {
    if (!window.history || !window.history.replaceState) return;

    var params = new URLSearchParams(window.location.search);

    if (state.query) {
      params.set('q', state.query);
    } else {
      params.delete('q');
    }

    if (state.tag) {
      params.set('tag', state.tag);
    } else {
      params.delete('tag');
    }

    var query = params.toString();
    var url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;

    try {
      window.history.replaceState(null, '', url);
    } catch (error) {}
  }

  function applyFilters() {
    var terms = normalize(state.query).split(' ').filter(Boolean);
    var activeTag = normalize(state.tag);
    var visible = 0;

    items.forEach(function (item) {
      var matchesQuery = terms.every(function (term) {
        return item.search.indexOf(term) !== -1;
      });
      var matchesTag = !activeTag || item.tags.indexOf(activeTag) !== -1;
      var show = matchesQuery && matchesTag;

      item.element.hidden = !show;

      if (show) visible += 1;
    });

    yearSections.forEach(function (section) {
      var count = section.querySelectorAll('[data-blog-card]:not([hidden])').length;
      var countLabel = section.querySelector('[data-blog-year-count]');

      if (countLabel) countLabel.textContent = count;

      section.hidden = count === 0;
    });

    if (emptyState) emptyState.hidden = visible !== 0;
    if (clearButton) clearButton.hidden = !state.query;
    if (resetButton) resetButton.hidden = !(state.query || state.tag);

    setCount(visible, items.length);
    setTagButtons();
    updateUrl();
  }

  function setQuery(value) {
    state.query = value || '';
    input.value = state.query;
    applyFilters();
  }

  function setTag(value) {
    state.tag = value || '';
    applyFilters();
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    var tagFromUrl = params.get('tag') || '';

    state.query = params.get('q') || '';
    input.value = state.query;

    if (tagFromUrl) {
      var matched = false;

      tagButtons.some(function (button) {
        var value = button.getAttribute('data-blog-tag') || '';

        if (normalize(value) === normalize(tagFromUrl)) {
          tagFromUrl = value;
          matched = true;
          return true;
        }

        return false;
      });

      if (!matched) tagFromUrl = '';
    }

    state.tag = tagFromUrl;
  }

  function updatePlaceholder() {
    var lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
    var placeholder = input.getAttribute('data-placeholder-' + lang);

    if (placeholder) input.setAttribute('placeholder', placeholder);
  }

  input.addEventListener('input', function () {
    state.query = input.value;
    applyFilters();
  });

  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;

    if (input.value) {
      event.preventDefault();
      setQuery('');
    } else {
      input.blur();
    }
  });

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      setQuery('');
      input.focus();
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', function () {
      state.tag = '';
      setQuery('');
      input.focus();
    });
  }

  tagButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-blog-tag') || '';
      setTag(normalize(state.tag) === normalize(value) ? '' : value);
    });
  });

  document.addEventListener('cv:langchange', updatePlaceholder);

  if (tagDetails && window.matchMedia && window.matchMedia('(min-width: 641px)').matches) {
    tagDetails.open = true;
  }

  readUrl();

  if (tagDetails && state.tag) {
    tagDetails.open = true;
  }

  updatePlaceholder();
  applyFilters();
  filter.hidden = false;
})();
