// Búsqueda y filtros del archivo del blog.

(function () {
  'use strict';

  var filter = document.querySelector('[data-blog-filter]');
  var input = document.querySelector('#blog-search-input');
  var clearButton = document.querySelector('[data-blog-search-clear]');
  var resetButton = document.querySelector('[data-blog-reset]');
  var filterMeta = document.querySelector('[data-blog-filter-meta]');
  var emptyState = document.querySelector('[data-blog-empty]');
  var tagCount = document.querySelector('[data-blog-tag-count]');
  var tagInputs = Array.prototype.slice.call(document.querySelectorAll('[data-blog-tag]'));
  var topicToggles = Array.prototype.slice.call(document.querySelectorAll('[data-blog-topic-toggle]'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-blog-card]'));
  var yearSections = Array.prototype.slice.call(document.querySelectorAll('[data-blog-year]'));

  if (!filter || !input || !cards.length) return;

  var state = {
    query: '',
    tags: []
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

  function canonicalTag(value) {
    var normalized = normalize(value);

    if (!normalized) return '';

    for (var index = 0; index < tagInputs.length; index += 1) {
      if (normalize(tagInputs[index].value) === normalized) {
        return tagInputs[index].value;
      }
    }

    return '';
  }

  function setTopicSelections() {
    tagInputs.forEach(function (tagInput) {
      var selected = state.tags.indexOf(tagInput.value) !== -1;
      var label = tagInput.closest('.blog-topic-label');

      tagInput.checked = selected;

      if (label) {
        label.classList.toggle('is-selected', selected);
      }
    });

    if (tagCount) {
      tagCount.textContent = state.tags.length
        ? state.tags.length + '/' + tagInputs.length
        : String(tagInputs.length);
    }
  }

  function updateUrl() {
    if (!window.history || !window.history.replaceState) return;

    var params = new URLSearchParams(window.location.search);

    if (state.query) {
      params.set('q', state.query);
    } else {
      params.delete('q');
    }

    params.delete('tag');

    state.tags.forEach(function (tag) {
      params.append('tag', tag);
    });

    params.delete('match');

    var query = params.toString();
    var url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;

    try {
      window.history.replaceState(null, '', url);
    } catch (error) {}
  }

  function applyFilters() {
    var terms = normalize(state.query).split(' ').filter(Boolean);
    var selectedTags = state.tags.map(normalize);
    var visible = 0;

    items.forEach(function (item) {
      var matchesQuery = terms.every(function (term) {
        return item.search.indexOf(term) !== -1;
      });
      var matchesTags = selectedTags.every(function (tag) {
        return item.tags.indexOf(tag) !== -1;
      });
      var show = matchesQuery && matchesTags;

      item.element.hidden = !show;

      if (show) visible += 1;
    });

    yearSections.forEach(function (section) {
      var count = section.querySelectorAll('[data-blog-card]:not([hidden])').length;
      var countLabel = section.querySelector('[data-blog-year-count]');

      if (countLabel) countLabel.textContent = count;

      section.hidden = count === 0;
    });

    var hasFilters = Boolean(state.query || state.tags.length);

    if (emptyState) emptyState.hidden = visible !== 0;
    if (clearButton) clearButton.hidden = !state.query;
    if (resetButton) resetButton.hidden = !hasFilters;
    if (filterMeta) filterMeta.hidden = !hasFilters;

    setTopicSelections();
    updateUrl();
  }

  function setQuery(value) {
    state.query = value || '';
    input.value = state.query;
    applyFilters();
  }

  function setExpanded(toggle, expanded) {
    var target = document.getElementById(toggle.getAttribute('aria-controls'));

    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    if (target) {
      target.hidden = !expanded;
    }
  }

  function openTopicAncestors(tagInput) {
    var container = tagInput.closest('.blog-topic-children');

    while (container) {
      var toggle = document.querySelector(
        '[data-blog-topic-toggle][aria-controls="' + container.id + '"]'
      );

      if (toggle) setExpanded(toggle, true);

      container = container.parentElement.closest('.blog-topic-children');
    }
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);

    state.query = params.get('q') || '';
    state.tags = [];
    input.value = state.query;

    params.getAll('tag').forEach(function (value) {
      var tag = canonicalTag(value);

      if (tag && state.tags.indexOf(tag) === -1) {
        state.tags.push(tag);
      }
    });
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
      state.tags = [];
      setQuery('');
      input.focus();
    });
  }

  tagInputs.forEach(function (tagInput) {
    tagInput.addEventListener('change', function () {
      var value = tagInput.value;

      if (tagInput.checked) {
        if (state.tags.indexOf(value) === -1) {
          state.tags.push(value);
        }
      } else {
        state.tags = state.tags.filter(function (tag) {
          return tag !== value;
        });
      }

      applyFilters();
    });
  });

  topicToggles.forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      setExpanded(toggle, toggle.getAttribute('aria-expanded') !== 'true');
    });
  });

  document.addEventListener('cv:langchange', updatePlaceholder);

  readUrl();

  state.tags.forEach(function (tag) {
    tagInputs.forEach(function (tagInput) {
      if (tagInput.value === tag) {
        openTopicAncestors(tagInput);
      }
    });
  });

  updatePlaceholder();
  applyFilters();
  filter.hidden = false;
})();
