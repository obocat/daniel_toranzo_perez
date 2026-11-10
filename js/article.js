// Mejoras de los artículos: avisos Note/Important y botones para copiar código

(function () {
  'use strict';

  var root = document.documentElement;
  var copyButtons = [];

  var languageLabels = {
    bash: 'Shell',
    css: 'CSS',
    html: 'HTML',
    javascript: 'JavaScript',
    js: 'JavaScript',
    json: 'JSON',
    markdown: 'Markdown',
    'objective-c': 'Objective-C',
    objectivec: 'Objective-C',
    ruby: 'Ruby',
    sh: 'Shell',
    shell: 'Shell',
    sql: 'SQL',
    swift: 'Swift',
    xml: 'XML',
    yaml: 'YAML'
  };

  function getLang() {
    return root.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function getCopyLabel(state) {
    var lang = getLang();

    if (state === 'copied') {
      return lang === 'en' ? 'Copied' : 'Copiado';
    }

    if (state === 'error') {
      return lang === 'en' ? 'Copy failed' : 'No se pudo copiar';
    }

    return lang === 'en' ? 'Copy' : 'Copiar';
  }

  function getCopyAriaLabel(state) {
    var lang = getLang();

    if (state === 'copied') {
      return lang === 'en' ? 'Code copied' : 'Código copiado';
    }

    if (state === 'error') {
      return lang === 'en' ? 'Could not copy code' : 'No se pudo copiar el código';
    }

    return lang === 'en' ? 'Copy code' : 'Copiar código';
  }

  function setCopyButtonState(button, state) {
    button.classList.toggle('is-copied', state === 'copied');
    button.classList.toggle('is-error', state === 'error');

    var label = button.querySelector('.code-copy-text');
    if (label) {
      label.textContent = getCopyLabel(state);
    }

    button.setAttribute('aria-label', getCopyAriaLabel(state));
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }

    document.body.removeChild(textarea);
    return copied;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!fallbackCopy(text)) {
          throw new Error('Copy failed');
        }
      });
    }

    return new Promise(function (resolve, reject) {
      if (fallbackCopy(text)) {
        resolve();
      } else {
        reject(new Error('Copy failed'));
      }
    });
  }

  function getCodeLanguage(wrapper) {
    var classes = (wrapper.className || '').split(/\s+/);

    for (var index = 0; index < classes.length; index += 1) {
      var match = classes[index].match(/^language-(.+)$/);
      if (!match) continue;

      var raw = match[1].toLowerCase();
      if (languageLabels[raw]) {
        return languageLabels[raw];
      }

      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    return '';
  }

  function createCopyButton(code) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-button';
    button.innerHTML =
      '<svg class="code-copy-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<rect x="5.25" y="1.75" width="9" height="9" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
      '<path d="M10.75 5.25H3.5A1.75 1.75 0 0 0 1.75 7v5.5c0 .97.78 1.75 1.75 1.75H9c.97 0 1.75-.78 1.75-1.75V10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
      '</svg>' +
      '<svg class="code-copy-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<path d="m3.25 8.5 3.05 3.05 6.45-7.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<span class="code-copy-text"></span>';

    setCopyButtonState(button, 'idle');

    var timer = null;

    button.addEventListener('click', function () {
      copyText(code)
        .then(function () {
          window.clearTimeout(timer);
          setCopyButtonState(button, 'copied');
          timer = window.setTimeout(function () {
            setCopyButtonState(button, 'idle');
          }, 2000);
        })
        .catch(function () {
          window.clearTimeout(timer);
          setCopyButtonState(button, 'error');
          timer = window.setTimeout(function () {
            setCopyButtonState(button, 'idle');
          }, 2500);
        });
    });

    copyButtons.push(button);
    return button;
  }

  function enhanceCodeBlock(wrapper) {
    if (wrapper.querySelector('.code-toolbar')) return;

    var pre = wrapper.querySelector('pre');
    if (!pre) return;

    var code = pre.querySelector('code');
    if (!code) return;

    var toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';

    var language = getCodeLanguage(wrapper);
    if (language) {
      var label = document.createElement('span');
      label.className = 'code-language';
      label.textContent = language;
      toolbar.appendChild(label);
    } else {
      toolbar.appendChild(document.createElement('span'));
    }

    toolbar.appendChild(createCopyButton(code.textContent || ''));
    wrapper.insertBefore(toolbar, wrapper.firstChild);
  }

  function enhanceCodeBlocks() {
    var wrappers = document.querySelectorAll('.post-content .highlighter-rouge');

    Array.prototype.forEach.call(wrappers, enhanceCodeBlock);

    var blocks = document.querySelectorAll('.post-content pre');

    Array.prototype.forEach.call(blocks, function (pre) {
      if (pre.closest('.highlighter-rouge')) return;

      var code = pre.querySelector('code');
      if (!code) return;

      var wrapper = document.createElement('div');
      wrapper.className = 'highlighter-rouge';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      enhanceCodeBlock(wrapper);
    });
  }

  function wrapCalloutLabel(paragraph, label) {
    var walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, null, false);
    var node = walker.nextNode();

    if (!node) return;

    var value = node.nodeValue || '';
    var leading = value.match(/^\s*/)[0].length;
    var rest = value.slice(leading);

    if (rest.toLowerCase().indexOf(label.toLowerCase()) !== 0) return;

    var strong = document.createElement('strong');
    strong.textContent = rest.slice(0, label.length);
    node.nodeValue = rest.slice(label.length);
    paragraph.insertBefore(strong, node);
  }

  function detectCallouts() {
    var quotes = document.querySelectorAll('.post-content blockquote');

    Array.prototype.forEach.call(quotes, function (quote) {
      var paragraph = quote.querySelector('p');
      if (!paragraph) return;

      var text = (paragraph.textContent || '').trim();
      var match = text.match(/^(nota|note|importante|important)\b\s*:?/i);
      if (!match) return;

      if (!quote.classList.contains('doc-callout')) {
        var kind = /^(nota|note)$/i.test(match[1]) ? 'note' : 'important';
        quote.classList.add('doc-callout', 'doc-callout--' + kind);
      }

      var first = paragraph.firstChild;
      if (first && first.nodeType === Node.ELEMENT_NODE && first.tagName === 'STRONG') return;

      wrapCalloutLabel(paragraph, match[0].trim());
    });
  }

  function init() {
    detectCallouts();
    enhanceCodeBlocks();
  }

  document.addEventListener('cv:langchange', function () {
    Array.prototype.forEach.call(copyButtons, function (button) {
      if (button.classList.contains('is-copied')) {
        setCopyButtonState(button, 'copied');
      } else if (button.classList.contains('is-error')) {
        setCopyButtonState(button, 'error');
      } else {
        setCopyButtonState(button, 'idle');
      }
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
