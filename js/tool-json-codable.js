// Conversor de JSON a structs Codable.

(function () {
  'use strict';

  var input = document.getElementById('json-input');
  var convertButton = document.getElementById('json-convert');
  var output = document.getElementById('json-output');
  var errorOutput = document.getElementById('json-error');
  var warningsOutput = document.getElementById('json-warnings');

  if (!input || !output) return;

  var swiftKeywords = {
    associatedtype: true,
    class: true,
    deinit: true,
    enum: true,
    extension: true,
    fileprivate: true,
    func: true,
    import: true,
    init: true,
    inout: true,
    internal: true,
    let: true,
    open: true,
    operator: true,
    private: true,
    protocol: true,
    public: true,
    rethrows: true,
    static: true,
    struct: true,
    subscript: true,
    typealias: true,
    var: true,
    break: true,
    case: true,
    continue: true,
    default: true,
    defer: true,
    do: true,
    else: true,
    fallthrough: true,
    for: true,
    guard: true,
    if: true,
    in: true,
    repeat: true,
    return: true,
    switch: true,
    where: true,
    while: true,
    as: true,
    catch: true,
    false: true,
    is: true,
    nil: true,
    super: true,
    self: true,
    throw: true,
    throws: true,
    true: true,
    try: true,
    async: true,
    await: true,
    actor: true,
    some: true,
    any: true,
    nonisolated: true
  };

  var reservedTypes = {
    Self: true,
    Type: true,
    Protocol: true,
    Any: true,
    AnyObject: true,
    Data: true,
    Date: true,
    URL: true,
    Error: true,
    Result: true,
    String: true,
    Int: true,
    Double: true,
    Bool: true,
    Array: true,
    Dictionary: true,
    Set: true,
    Optional: true,
    Codable: true,
    Decodable: true,
    Encodable: true,
    Equatable: true,
    Hashable: true,
    Identifiable: true
  };

  function currentLang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'es';
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function unique(values) {
    return values.filter(function (value, index) {
      return values.indexOf(value) === index;
    });
  }

  function wordsFromKey(key) {
    return String(key)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function pascalCase(key) {
    var words = wordsFromKey(key);

    if (!words.length) return 'Value';

    var name = words.map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');

    if (/^\d/.test(name)) name = 'Type' + name;

    return name;
  }

  function lowerCamelCase(key) {
    var words = wordsFromKey(key);

    if (!words.length) return 'value';

    var first = words[0].toLowerCase();
    var rest = words.slice(1).map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');
    var name = first + rest;

    if (/^\d/.test(name)) name = 'value' + name.charAt(0).toUpperCase() + name.slice(1);

    return name;
  }

  function singularize(value) {
    var exceptions = {
      Status: true,
      News: true,
      Series: true,
      Species: true,
      Data: true,
      Metadata: true,
      Info: true
    };

    if (exceptions[value]) return value;
    if (/ies$/.test(value)) return value.slice(0, -3) + 'y';
    if (/(ses|xes|zes|ches|shes)$/.test(value)) return value.slice(0, -2);
    if (/ss$/.test(value)) return value;
    if (/s$/.test(value)) return value.slice(0, -1);

    return value;
  }

  function typeNameFor(key, singular) {
    var name = pascalCase(key);

    if (singular) name = singularize(name);
    if (reservedTypes[name]) name += 'Model';
    if (!name) name = 'Value';

    return name;
  }

  function swiftString(value) {
    return '"' + String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') + '"';
  }

  function primitiveType(value) {
    if (typeof value === 'string') return 'String';
    if (typeof value === 'boolean') return 'Bool';
    if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Double';
    return 'String';
  }

  function mergeObjects(objects) {
    var merged = {};

    objects.forEach(function (object) {
      Object.keys(object).forEach(function (key) {
        if (!hasOwn(merged, key)) merged[key] = object[key];
      });
    });

    return merged;
  }

  function convert(json) {
    var generated = [];
    var usedTypeNames = Object.create(null);
    var warningKeys = Object.create(null);
    var warnings = [];

    function addWarning(text) {
      if (warningKeys[text]) return;

      warningKeys[text] = true;
      warnings.push(text);
    }

    function uniqueTypeName(base) {
      var name = base;
      var index = 2;

      while (usedTypeNames[name]) {
        name = base + index;
        index += 1;
      }

      usedTypeNames[name] = true;
      return name;
    }

    function propertyNameFor(key, usedProperties) {
      var base = lowerCamelCase(key);
      var name = base;
      var index = 2;

      if (swiftKeywords[name]) name += 'Value';

      while (usedProperties[name]) {
        name = base + index;
        index += 1;
      }

      usedProperties[name] = true;
      return name;
    }

    function buildObjectType(object, typeName) {
      var properties = [];
      var propertyKeys = [];
      var usedProperties = Object.create(null);

      Object.keys(object).forEach(function (key) {
        var propertyName = propertyNameFor(key, usedProperties);
        var propertyType = typeFor(object[key], key);

        properties.push('    let ' + propertyName + ': ' + propertyType);
        propertyKeys.push({ property: propertyName, key: key });
      });

      var needsCodingKeys = propertyKeys.some(function (item) {
        return item.property !== item.key;
      });

      var code = 'struct ' + typeName + ': Codable {\n';

      if (properties.length) {
        code += properties.join('\n') + '\n';
      } else {
        code += '    // Empty object\n';
      }

      if (needsCodingKeys) {
        code += '\n    enum CodingKeys: String, CodingKey {\n';
        code += propertyKeys.map(function (item) {
          return '        case ' + item.property +
            (item.property === item.key ? '' : ' = ' + swiftString(item.key));
        }).join('\n') + '\n';
        code += '    }\n';
      }

      code += '}';
      generated.push(code);
      return typeName;
    }

    function arrayType(array, key) {
      if (!array.length) {
        addWarning(currentLang() === 'en'
          ? 'Empty arrays are generated as [String]. Adjust the element type.'
          : 'Los arrays vacíos se generan como [String]. Ajusta el tipo del elemento.');
        return '[String]';
      }

      var nonNull = array.filter(function (item) {
        return item !== null;
      });

      if (!nonNull.length) {
        addWarning(currentLang() === 'en'
          ? 'Null-only arrays are generated as [String?]. Adjust the element type.'
          : 'Los arrays con solo null se generan como [String?]. Ajusta el tipo del elemento.');
        return '[String?]';
      }

      var optionalSuffix = nonNull.length === array.length ? '' : '?';

      if (nonNull.length !== array.length) {
        addWarning(currentLang() === 'en'
          ? 'Null values are generated as optional types. Adjust them if your JSON uses a different type.'
          : 'Los valores null se generan como tipos opcionales. Ajusta el tipo si tu JSON usa otro.');
      }

      var objects = nonNull.filter(function (item) {
        return item !== null && typeof item === 'object' && !Array.isArray(item);
      });

      if (objects.length === nonNull.length) {
        var signatures = objects.map(function (object) {
          return Object.keys(object).sort().join('|');
        });

        if (unique(signatures).length > 1) {
          addWarning(currentLang() === 'en'
            ? 'Array objects have different keys; the generated type uses the union of their keys.'
            : 'Los objetos del array tienen claves distintas; el tipo generado usa la unión de sus claves.');
        }

        var typeName = uniqueTypeName(typeNameFor(key, true));
        buildObjectType(mergeObjects(objects), typeName);
        return '[' + typeName + optionalSuffix + ']';
      }

      var arrays = nonNull.filter(function (item) {
        return Array.isArray(item);
      });

      if (arrays.length === nonNull.length) {
        return '[' + arrayType(nonNull[0], key) + optionalSuffix + ']';
      }

      var primitives = nonNull.filter(function (item) {
        return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean';
      });

      if (primitives.length === nonNull.length) {
        var primitiveTypes = unique(nonNull.map(primitiveType));

        if (primitiveTypes.length === 1) {
          return '[' + primitiveTypes[0] + optionalSuffix + ']';
        }
      }

      addWarning(currentLang() === 'en'
        ? 'Arrays with mixed types are generated as [String]. Adjust the type manually.'
        : 'Los arrays con tipos mezclados se generan como [String]. Ajusta el tipo manualmente.');

      return '[String]';
    }

    function typeFor(value, key) {
      if (value === null) {
        addWarning(currentLang() === 'en'
          ? 'Null values are generated as String?. Adjust them if your JSON uses a different type.'
          : 'Los valores null se generan como String?. Ajusta el tipo si tu JSON usa otro.');

        return 'String?';
      }

      if (typeof value === 'string') return 'String';
      if (typeof value === 'boolean') return 'Bool';
      if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Double';

      if (Array.isArray(value)) {
        return arrayType(value, key);
      }

      if (typeof value === 'object') {
        var typeName = uniqueTypeName(typeNameFor(key, false));
        return buildObjectType(value, typeName);
      }

      return 'String';
    }

    var rootType;

    if (Array.isArray(json)) {
      rootType = arrayType(json, 'items');
    } else {
      rootType = typeFor(json, 'root');
    }

    var code = generated.reverse().join('\n\n');

    if (rootType === 'Root') {
      return { code: code, warnings: warnings };
    }

    return {
      code: code ? code + '\n\ntypealias Root = ' + rootType : 'typealias Root = ' + rootType,
      warnings: warnings
    };
  }

  function setError(message) {
    if (!errorOutput) return;

    errorOutput.hidden = !message;
    errorOutput.textContent = message || '';
    input.classList.toggle('is-invalid', Boolean(message));

    if (message) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function renderWarnings(warnings) {
    if (!warningsOutput) return;

    warningsOutput.innerHTML = '';

    warnings.forEach(function (warning) {
      var item = document.createElement('li');
      var level = typeof warning === 'string' ? 'warn' : warning.level;
      item.className = 'tool-warning' + (level === 'ok' ? ' is-ok' : '');
      item.textContent = typeof warning === 'string' ? warning : warning.text;
      warningsOutput.appendChild(item);
    });
  }

  function update() {
    var text = input.value.trim();
    var parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setError((currentLang() === 'en' ? 'Invalid JSON: ' : 'JSON inválido: ') + error.message);
      output.textContent = '—';
      renderWarnings([]);
      return;
    }

    setError('');
    var result = convert(parsed);
    output.textContent = result.code;
    renderWarnings(result.warnings);

    if (!result.warnings.length) {
      renderWarnings([{
        level: 'ok',
        text: currentLang() === 'en'
          ? 'Codable structs generated.'
          : 'Structs Codable generados.'
      }]);
    }
  }

  input.addEventListener('input', function () {
    setError('');
  });

  input.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      update();
    }
  });

  if (convertButton) {
    convertButton.addEventListener('click', update);
  }

  document.addEventListener('cv:langchange', update);

  update();
})();
