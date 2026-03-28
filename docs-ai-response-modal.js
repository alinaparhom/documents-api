(function () {
  var STYLE_ID = 'ai-chat-modal-style-v3';
  var ROOT_CLASS = 'ai-chat-modal';
  var FILE_INPUT_ID = 'ai-chat-hidden-file-input';
  var FALLBACK_MODEL_OPTIONS = [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }];
  var MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
  var MAX_EXTRACT_CHARS = 500000;
  var pdfJsReadyPromise = null;
  var DEFAULT_AI_BEHAVIOR = 'Ты — корпоративный секретарь. Ответь на документ в официально-деловом стиле.\n'
    + 'Используй обороты: "В ответ на Ваше письмо... сообщаем следующее", "Отмечаем, что...", "Обращаем Ваше внимание...".\n'
    + 'Тон: строгий, аргументированный, без эмоций.\n'
    + 'Ответ должен содержать чёткую структуру: вступление, основную часть, заключение.';

  var STYLE_OPTIONS = [
    { value: 'neutral', label: 'Нейтральный стиль' },
    { value: 'aggressive', label: 'Агрессивный стиль' },
    { value: 'informational', label: 'Спокойный (информационный)' }
  ];

  function createElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (typeof text === 'string') {
      node.textContent = text;
    }
    return node;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanNumericArtifacts(text) {
    return String(text || '')
      .replace(/(\d)\s*[\(\)ОOо]\s*(\d)/g, '$1$2')
      .replace(/(\d)\s{2,}(\d)/g, '$1 $2')
      .replace(/\bрубл\b/gi, 'рублей')
      .replace(/\bкоп\b\.?/gi, 'копеек');
  }

  function isNoisyLine(line) {
    var raw = String(line || '').trim();
    if (!raw) {
      return true;
    }
    var letters = (raw.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
    var digits = (raw.match(/\d/g) || []).length;
    var noise = (raw.match(/[^\w\sА-Яа-яЁё.,:;!?()«»"'\-–—/]/g) || []).length;
    var shortBroken = raw.length <= 3 && letters === 0;
    var mostlyNoise = raw.length > 0 && (noise / raw.length) > 0.24 && letters < 3;
    var randomToken = raw.length < 16 && letters < 2 && digits < 2;
    return shortBroken || mostlyNoise || randomToken;
  }

  function filterOcrArtifacts(text) {
    var normalized = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/-\n(?=\S)/g, '')
      .replace(/[ \t]+\n/g, '\n');

    var lines = normalized.split('\n');
    var cleaned = lines.filter(function (line) {
      return !isNoisyLine(line);
    }).map(function (line) {
      return cleanNumericArtifacts(line)
        .replace(/\s{2,}/g, ' ')
        .trim();
    }).filter(Boolean);

    var result = cleaned.join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!result) {
      result = cleanNumericArtifacts(normalized).replace(/\n{3,}/g, '\n\n').trim();
    }
    return result;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.ai-chat-modal{position:fixed;inset:0;z-index:1900;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.44);backdrop-filter:blur(5px);opacity:0;transition:opacity .2s ease;}' +
      '.ai-chat-modal--visible{opacity:1;}' +
      '.ai-chat-modal--closing{opacity:0;}' +
      '.ai-chat-modal__panel{width:min(1900px,98vw);height:96vh;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(248,250,252,.86));border:1px solid rgba(203,213,225,.7);border-radius:18px;overflow:hidden;box-shadow:0 20px 55px rgba(15,23,42,.22);}' +
      '.ai-chat-modal__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(226,232,240,.9);background:linear-gradient(180deg,rgba(255,255,255,.76),rgba(248,250,252,.62));}' +
      '.ai-chat-modal__title{font-size:14px;font-weight:700;color:#0f172a;}' +
      '.ai-chat-modal__subtitle{margin-top:1px;font-size:11px;color:#64748b;}' +
      '.ai-chat-modal__close{border:none;background:rgba(148,163,184,.18);width:32px;height:32px;border-radius:999px;font-size:18px;line-height:1;cursor:pointer;}' +
      '.ai-chat-modal__content{display:flex;flex-direction:column;gap:10px;padding:11px;min-height:0;flex:1;}' +
      '.ai-chat-modal__context{border:1px solid rgba(226,232,240,.88);border-radius:12px;padding:8px;background:rgba(255,255,255,.72);backdrop-filter:blur(2px);}' +
      '.ai-chat-modal__context-title{font-size:11px;font-weight:700;color:#334155;margin-bottom:3px;}' +
      '.ai-chat-modal__files{display:flex;flex-wrap:wrap;gap:5px;min-height:20px;}' +
      '.ai-chat-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:rgba(241,245,249,.95);border:1px solid rgba(203,213,225,.9);font-size:11px;color:#1e293b;max-width:100%;}' +
      '.ai-chat-chip__meta{opacity:.8;}' +
      '.ai-chat-chip__remove{border:none;background:transparent;color:#64748b;cursor:pointer;font-size:14px;line-height:1;padding:0;}' +
      '.ai-chat-modal__empty{font-size:11px;color:#94a3b8;}' +
      '.ai-chat-modal__attach{margin-top:5px;border:1px dashed rgba(148,163,184,.55);background:rgba(248,250,252,.86);border-radius:8px;padding:5px 8px;font-size:11px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.ai-chat-modal__settings{display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid rgba(226,232,240,.88);border-radius:12px;padding:7px;background:rgba(255,255,255,.66);backdrop-filter:blur(2px);}' +
      '.ai-chat-modal__top-bar{grid-template-columns:minmax(0,1.7fr) repeat(2,minmax(130px,1fr)) auto;align-items:center;}' +
      '.ai-chat-modal__field--full{grid-column:1 / -1;}' +
      '.ai-chat-modal__field{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#475569;}' +
      '.ai-chat-modal__select{border:1px solid rgba(148,163,184,.45);border-radius:8px;background:#fff;padding:6px;font-size:12px;color:#0f172a;}' +
      '.ai-chat-modal__input{border:1px solid rgba(148,163,184,.45);border-radius:8px;background:rgba(255,255,255,.95);padding:7px 8px;font-size:12px;color:#0f172a;outline:none;}' +
      '.ai-chat-modal__messages{flex:1;min-height:0;overflow:auto;padding:11px;background:rgba(248,250,252,.52);border:1px solid rgba(226,232,240,.82);border-radius:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}' +
      '.ai-chat-msg{max-width:84%;padding:8px 10px;border-radius:12px;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(15,23,42,.05);}' +
      '.ai-chat-msg--user{margin-left:auto;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border-bottom-right-radius:6px;}' +
      '.ai-chat-msg--assistant{margin-right:auto;background:#fff;border:1px solid rgba(226,232,240,.9);color:#0f172a;border-bottom-left-radius:6px;}' +
      '.ai-chat-msg--error{border-color:rgba(239,68,68,.35);background:rgba(254,242,242,.9);color:#991b1b;}' +
      '.ai-chat-modal__composer{display:flex;gap:6px;align-items:flex-end;}' +
      '.ai-chat-modal__textarea{flex:1;min-height:40px;max-height:120px;resize:none;border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.35;background:#fff;outline:none;}' +
      '.ai-chat-modal__send{border:none;border-radius:10px;padding:8px 11px;min-height:40px;font-size:12px;font-weight:700;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;cursor:pointer;}' +
      '.ai-chat-modal__send:disabled{opacity:.6;cursor:not-allowed;}' +      '.ai-chat-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(148,163,184,.35);border-top-color:#2563eb;border-radius:50%;animation:ai-chat-spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
      '.ai-chat-modal__export-area{margin-top:4px;border-top:1px solid rgba(226,232,240,.88);padding-top:8px;display:flex;flex-direction:column;gap:6px;}' +
      '.ai-chat-modal__export-header{font-size:11px;font-weight:600;color:#334155;}' +
      '.ai-chat-modal__editable-response{width:100%;border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;background:#fff;min-height:84px;}' +
      '.ai-chat-modal__live-preview{border:1px solid rgba(148,163,184,.35);border-radius:10px;padding:10px;background:rgba(255,255,255,.78);min-height:110px;max-height:220px;overflow:auto;font-size:12px;line-height:1.45;color:#0f172a;white-space:pre-wrap;word-break:break-word;outline:none;}' +
      '.ai-chat-modal__live-preview:empty:before{content:attr(data-placeholder);color:#94a3b8;}' +
      '.ai-chat-modal__export-buttons{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}' +
      '.ai-chat-modal__export-btn{border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;background:#f1f5f9;color:#1e293b;cursor:pointer;transition:all .2s;min-height:38px;}' +
      '.ai-chat-modal__export-btn:hover{background:#e2e8f0;}' +
      '.ai-chat-modal__export-area--highlight{box-shadow:0 0 0 2px rgba(37,99,235,.18) inset;border-radius:10px;transition:box-shadow .2s ease;}' +
      '@keyframes ai-chat-spin{to{transform:rotate(360deg);}}' +
      '@media (max-width:860px){.ai-chat-modal{padding:6px;}.ai-chat-modal__panel{width:100%;height:100%;border-radius:12px;}.ai-chat-modal__settings{grid-template-columns:1fr;}.ai-chat-modal__top-bar{grid-template-columns:1fr;}.ai-chat-msg{max-width:92%;}.ai-chat-modal__composer{flex-wrap:wrap;}.ai-chat-modal__send{flex:1 1 47%;}.ai-chat-modal__export-btn{flex:1 1 48%;}}';
    document.head.appendChild(style);
  }

  function formatSize(size) {
    var value = Number(size || 0);
    if (!value || value < 1024) {
      return value + ' B';
    }
    if (value < 1024 * 1024) {
      return (value / 1024).toFixed(1) + ' KB';
    }
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function detectIcon(file) {
    var name = String(file.name || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    if (/\.(js|ts|json|xml|html|css|sql|md|py|php|java|go|c|cpp|cs|rb)$/i.test(name) || type.indexOf('json') !== -1 || type.indexOf('javascript') !== -1) {
      return '💻';
    }
    return '📄';
  }

  function isTextLike(file) {
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    return type.indexOf('text') !== -1
      || /(json|xml|csv|html|javascript|markdown|x-yaml|yaml)/i.test(type)
      || /\.(txt|md|json|csv|xml|html|css|js|ts|php|py|java|sql|log|ini|yml|yaml|rtf)$/i.test(name);
  }

  function isPdfLike(file) {
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    return type.indexOf('pdf') !== -1 || /\.pdf$/i.test(name);
  }

  function normalizeExternalFiles(files, source) {
    if (!Array.isArray(files)) {
      return [];
    }
    return files.map(function (entry, index) {
      if (!entry) {
        return null;
      }
      return {
        id: source + '-' + index + '-' + Date.now(),
        name: entry.name ? String(entry.name) : 'Файл без названия',
        size: Number(entry.size || 0),
        type: entry.type ? String(entry.type) : '',
        content: typeof entry.content === 'string' ? entry.content : '',
        extracted: Boolean(entry.extracted || (typeof entry.content === 'string' && entry.content.trim() !== '')),
        extracting: false,
        extractError: null,
        url: typeof entry.url === 'string' ? entry.url : '',
        fileObject: null
      };
    }).filter(Boolean);
  }

  function normalizeFileObjects(files) {
    if (!Array.isArray(files)) {
      return [];
    }
    return files
      .filter(function (item) {
        return typeof File !== 'undefined' && item instanceof File;
      })
      .map(function (file, index) {
        return {
          id: 'local-' + index + '-' + Date.now() + '-' + Math.random().toString(16).slice(2),
          name: file.name || 'Файл',
          size: Number(file.size || 0),
          type: file.type || '',
          content: '',
          extracted: false,
          extracting: false,
          extractError: null,
          url: '',
          fileObject: file
        };
      });
  }

  function normalizeModelList(rawModels) {
    if (!Array.isArray(rawModels) || !rawModels.length) {
      return FALLBACK_MODEL_OPTIONS.slice();
    }
    return rawModels
      .map(function (entry) {
        var value = typeof entry === 'string'
          ? entry.trim()
          : (entry && typeof entry.value === 'string' ? entry.value.trim() : '');
        if (!value) {
          return null;
        }
        return { value: value, label: value };
      })
      .filter(Boolean);
  }

  function fetchModels(apiUrl) {
    return fetch(apiUrl + '?action=ai_models', { credentials: 'same-origin' })
      .then(function (response) {
        if (!response || !response.ok) {
          throw new Error('models_failed');
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload || payload.ok !== true) {
          throw new Error('models_invalid');
        }
        return normalizeModelList(payload.models);
      })
      .catch(function () {
        return FALLBACK_MODEL_OPTIONS.slice();
      });
  }

  function autoHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  function createMessage(role, text, isError) {
    var msg = createElement('div', 'ai-chat-msg ai-chat-msg--' + role + (isError ? ' ai-chat-msg--error' : ''));
    msg.innerHTML = escapeHtml(text || '');
    return msg;
  }

  function closeWithAnimation(root) {
    root.classList.add('ai-chat-modal--closing');
    setTimeout(function () {
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }, 180);
  }

  function fileToText(file) {
    return new Promise(function (resolve) {
      if (!file || typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      if ((file.size || 0) > MAX_FILE_SIZE_BYTES) {
        resolve('[Файл слишком большой для промпта]');
        return;
      }
      if (isPdfLike(file)) {
        var pdfReader = new FileReader();
        pdfReader.onload = function () {
          extractPdfText(pdfReader.result).then(resolve).catch(function () {
            resolve('[Не удалось извлечь текст из PDF]');
          });
        };
        pdfReader.onerror = function () {
          resolve('');
        };
        pdfReader.readAsArrayBuffer(file);
        return;
      }
      if (!isTextLike(file)) {
        resolve('');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === 'string' ? reader.result.slice(0, MAX_EXTRACT_CHARS) : '');
      };
      reader.onerror = function () {
        resolve('');
      };
      reader.readAsText(file);
    });
  }

  function ensurePdfJsLoaded() {
    if (pdfJsReadyPromise) {
      return pdfJsReadyPromise;
    }
    pdfJsReadyPromise = new Promise(function (resolve, reject) {
      if (typeof window === 'undefined') {
        reject(new Error('no_window'));
        return;
      }
      if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
        resolve(window.pdfjsLib);
        return;
      }

      var scriptCandidates = getPdfScriptCandidates();
      var workerCandidates = getPdfWorkerCandidates();

      function applyWorkerSrc() {
        if (!window.pdfjsLib || !window.pdfjsLib.GlobalWorkerOptions) {
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerCandidates[0];
      }

      function tryLoad(index) {
        if (index >= scriptCandidates.length) {
          reject(new Error('pdfjs_load_failed'));
          return;
        }
        var src = scriptCandidates[index];
        var script = document.createElement('script');
        script.async = true;
        script.src = src;
        script.setAttribute('data-ai-pdfjs', '1');
        script.onload = function () {
          if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== 'function') {
            tryLoad(index + 1);
            return;
          }
          applyWorkerSrc();
          resolve(window.pdfjsLib);
        };
        script.onerror = function () {
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
          tryLoad(index + 1);
        };
        document.head.appendChild(script);
      }

      tryLoad(0);
    }).catch(function (error) {
      pdfJsReadyPromise = null;
      throw error;
    });
    return pdfJsReadyPromise;
  }

  function getPdfAssetBasePaths() {
    var bases = [];
    var scriptEl = document.querySelector('script[src*="docs-ai-response-modal.js"]');
    if (scriptEl && scriptEl.src) {
      var normalized = String(scriptEl.src).replace(/\/docs-ai-response-modal\.js(?:\?.*)?$/i, '/');
      bases.push(normalized);
    }
    bases.push(window.location.origin + '/js/documents/');
    bases.push(window.location.origin + '/');
    return Array.from(new Set(bases));
  }

  function getPdfScriptCandidates() {
    var bases = getPdfAssetBasePaths();
    var candidates = [];
    bases.forEach(function (base) {
      candidates.push(base + 'pdf/pdf.min.js');
    });
    candidates.push('/js/documents/pdf/pdf.min.js');
    candidates.push('/pdf/pdf.min.js');
    return Array.from(new Set(candidates));
  }

  function getPdfWorkerCandidates() {
    var bases = getPdfAssetBasePaths();
    var candidates = [];
    bases.forEach(function (base) {
      candidates.push(base + 'pdf/pdf.worker.min.js');
    });
    candidates.push('/js/documents/pdf/pdf.worker.min.js');
    candidates.push('/pdf/pdf.worker.min.js');
    return Array.from(new Set(candidates));
  }

  async function extractPdfText(source) {
    try {
      var pdfjsLib = await ensurePdfJsLoaded();
      var loadingTask = pdfjsLib.getDocument({ data: source });
      var pdf = await loadingTask.promise;
      var maxPages = Math.max(pdf.numPages || 0, 0);
      var parts = [];
      for (var pageNum = 1; pageNum <= maxPages; pageNum += 1) {
        // eslint-disable-next-line no-await-in-loop
        var page = await pdf.getPage(pageNum);
        // eslint-disable-next-line no-await-in-loop
        var textContent = await page.getTextContent();
        var line = (textContent.items || []).map(function (item) {
          return item && item.str ? item.str : '';
        }).join(' ').replace(/\s+/g, ' ').trim();
        if (line) {
          parts.push('Страница ' + pageNum + ': ' + line);
        }
        if (parts.join('\n').length >= MAX_EXTRACT_CHARS) {
          break;
        }
      }
      var fullText = parts.join('\n').slice(0, MAX_EXTRACT_CHARS);
      return fullText || '[В PDF не найден извлекаемый текст]';
    } catch (error) {
      return '[Не удалось извлечь текст из PDF]';
    }
  }

  async function fetchExternalFileContent(file) {
    if (!file || !file.url) {
      return '';
    }
    try {
      var response = await fetch(file.url, { credentials: 'same-origin' });
      if (!response.ok) {
        return '';
      }
      if (isPdfLike(file)) {
        var buffer = await response.arrayBuffer();
        return extractPdfText(buffer);
      }
      if (!isTextLike(file)) {
        return '';
      }
      var rawText = await response.text();
      return String(rawText || '').slice(0, MAX_EXTRACT_CHARS);
    } catch (error) {
      return '';
    }
  }

  function buildRequestBlueprint(userText, state, config) {
    var context = {};
    if (config.context && typeof config.context === 'object') {
      Object.keys(config.context).forEach(function (key) {
        context[key] = config.context[key];
      });
    }

    var extractedTexts = state.files
      .filter(function (file) {
        return file && typeof file.content === 'string' && file.content.trim() !== '';
      })
      .map(function (file) {
        var normalizedText = filterOcrArtifacts(file.content);
        return {
          id: file.id,
          name: file.name,
          type: file.type || '',
          text: normalizedText
        };
      });

    context.selectedModel = state.model;
    context.responseStyle = state.responseStyle;
    context.aiBehavior = state.aiBehavior;
    context.extractedTexts = extractedTexts;
    context.attachedFiles = state.files.map(function (file) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url || '',
        content: filterOcrArtifacts(file.content || ''),
        extracted: Boolean(file.extracted),
        extractError: file.extractError || null
      };
    });

    var formData = new FormData();
    formData.append('action', 'ai_response_analyze');
    formData.append('documentTitle', config.documentTitle || '');
    formData.append('prompt', userText);
    formData.append('model', state.model);
    formData.append('responseStyle', state.responseStyle);
    formData.append('aiBehavior', state.aiBehavior || '');
    formData.append('context', JSON.stringify(context));
    formData.append('extractedTexts', JSON.stringify(extractedTexts));

    state.files.forEach(function (file) {
      if (file.fileObject) {
        formData.append('attachments[]', file.fileObject, file.name);
      }
    });

    return formData;
  }

  async function hydrateFileContents(state) {
    for (var i = 0; i < state.files.length; i += 1) {
      if (state.files[i].content) {
        state.files[i].extracted = true;
        state.files[i].extractError = null;
        continue;
      }
      if (state.files[i].fileObject) {
        // eslint-disable-next-line no-await-in-loop
        state.files[i].content = await fileToText(state.files[i].fileObject);
      } else if (state.files[i].url) {
        // eslint-disable-next-line no-await-in-loop
        state.files[i].content = await fetchExternalFileContent(state.files[i]);
      }
      state.files[i].extracted = Boolean(state.files[i].content && String(state.files[i].content).trim() !== '');
      state.files[i].extractError = state.files[i].extracted ? null : state.files[i].extractError;
    }
  }

  function openDocumentsAiResponseModal(options) {
    ensureStyles();

    var config = options && typeof options === 'object' ? options : {};
    var state = {
      files: []
        .concat(normalizeFileObjects(config.pendingFiles || []))
        .concat(normalizeExternalFiles(config.files || [], 'external'))
        .concat(normalizeExternalFiles(config.linkedFiles || [], 'linked')),
      models: FALLBACK_MODEL_OPTIONS.slice(),
      model: FALLBACK_MODEL_OPTIONS[0].value,
      responseStyle: STYLE_OPTIONS[0].value,
      aiBehavior: typeof config.aiBehavior === 'string' && config.aiBehavior.trim()
        ? config.aiBehavior.trim()
        : DEFAULT_AI_BEHAVIOR,
      isLoading: false,
      lastAssistantMessage: '',
      templateDraft: ''
    };

    var root = createElement('div', ROOT_CLASS);
    var panel = createElement('div', 'ai-chat-modal__panel');
    var header = createElement('div', 'ai-chat-modal__header');
    var titleWrap = createElement('div');
    titleWrap.appendChild(createElement('div', 'ai-chat-modal__title', 'Ответ с помощью ИИ'));
    titleWrap.appendChild(createElement('div', 'ai-chat-modal__subtitle', config.documentTitle ? ('Документ: ' + config.documentTitle) : 'Документ не указан'));

    var closeButton = createElement('button', 'ai-chat-modal__close', '×');
    closeButton.type = 'button';

    var content = createElement('div', 'ai-chat-modal__content');
    var topBar = createElement('div', 'ai-chat-modal__settings ai-chat-modal__top-bar');

    var filesBox = createElement('div', 'ai-chat-modal__field ai-chat-modal__field--full');
    filesBox.style.gridColumn = '1 / span 2';
    filesBox.style.margin = '0';
    var filesWrap = createElement('div', 'ai-chat-modal__files');
    var attachButton = createElement('button', 'ai-chat-modal__attach', '+ Прикрепить файл');
    attachButton.type = 'button';
    attachButton.style.marginTop = '4px';

    var hiddenInput = document.getElementById(FILE_INPUT_ID);
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.id = FILE_INPUT_ID;
      hiddenInput.type = 'file';
      hiddenInput.multiple = true;
      hiddenInput.style.display = 'none';
      document.body.appendChild(hiddenInput);
    }

    var modelField = createElement('label', 'ai-chat-modal__field');
    modelField.appendChild(createElement('span', '', 'Модель'));
    var modelSelect = createElement('select', 'ai-chat-modal__select');

    var styleField = createElement('label', 'ai-chat-modal__field');
    styleField.appendChild(createElement('span', '', 'Стиль'));
    var styleSelect = createElement('select', 'ai-chat-modal__select');
    STYLE_OPTIONS.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      styleSelect.appendChild(option);
    });
    var settingsButton = createElement('button', 'ai-chat-modal__send', '⚙️ Настройки ИИ');
    settingsButton.type = 'button';
    settingsButton.style.minHeight = '36px';
    settingsButton.style.padding = '6px 10px';
    settingsButton.style.whiteSpace = 'nowrap';
    settingsButton.style.fontSize = '11px';

    var messages = createElement('div', 'ai-chat-modal__messages');
    messages.appendChild(createMessage('assistant', 'Привет! Напишите запрос — я подготовлю ответ.'));

    var composer = createElement('div', 'ai-chat-modal__composer');
    var textarea = createElement('textarea', 'ai-chat-modal__textarea');
    textarea.placeholder = 'Введите запрос (можно пусто — отправим OCR текст)';
    var sendButton = createElement('button', 'ai-chat-modal__send', 'Отправить в ИИ');
    sendButton.type = 'button';
    var menuWrap = createElement('div');
    menuWrap.style.position = 'relative';
    var menuButton = createElement('button', 'ai-chat-modal__send', '⋮');
    menuButton.type = 'button';
    menuButton.style.minWidth = '44px';
    var menuDropdown = createElement('div', 'ai-chat-modal__context');
    menuDropdown.style.position = 'absolute';
    menuDropdown.style.right = '0';
    menuDropdown.style.bottom = '46px';
    menuDropdown.style.minWidth = '220px';
    menuDropdown.style.display = 'none';
    menuDropdown.style.zIndex = '5';
    menuDropdown.style.padding = '6px';
    var openEditButton = createElement('button', 'ai-chat-modal__attach', 'Редактировать ответ ИИ');
    openEditButton.type = 'button';
    openEditButton.style.marginTop = '0';
    openEditButton.style.width = '100%';
    openEditButton.style.textAlign = 'left';
    var openTemplateButton = createElement('button', 'ai-chat-modal__attach', 'Шаблон');
    openTemplateButton.type = 'button';
    openTemplateButton.style.marginTop = '4px';
    openTemplateButton.style.width = '100%';
    openTemplateButton.style.textAlign = 'left';
    menuDropdown.appendChild(openEditButton);
    menuDropdown.appendChild(openTemplateButton);
    menuWrap.appendChild(menuButton);
    menuWrap.appendChild(menuDropdown);

    function exportDocument(format, answerText) {
      if (!answerText) {
        alert('Нет текста для экспорта. Сначала получите ответ от ИИ.');
        return;
      }
      var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
      var formData = new FormData();
      formData.append('action', 'generate_document');
      formData.append('format', format);
      formData.append('answer', answerText);
      formData.append('documentTitle', config.documentTitle || '');

      fetch(apiUrl, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().catch(function () {
              return { error: 'Ошибка сервера (' + response.status + ')' };
            }).then(function (payload) {
              throw new Error((payload && payload.error) ? payload.error : 'Ошибка сервера');
            });
          }
          return response.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'response.' + format;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(function (error) {
          alert('Ошибка при генерации документа: ' + (error && error.message ? error.message : 'Неизвестная ошибка'));
        });
    }

    function createOverlayModal(titleText) {
      var overlay = createElement('div', ROOT_CLASS);
      overlay.style.zIndex = '2000';
      overlay.style.padding = '8px';
      var modalPanel = createElement('div', 'ai-chat-modal__panel');
      modalPanel.style.width = 'min(860px, 96vw)';
      modalPanel.style.height = 'auto';
      modalPanel.style.maxHeight = '90vh';
      var modalHeader = createElement('div', 'ai-chat-modal__header');
      modalHeader.appendChild(createElement('div', 'ai-chat-modal__title', titleText));
      var modalClose = createElement('button', 'ai-chat-modal__close', '×');
      modalClose.type = 'button';
      modalHeader.appendChild(modalClose);
      var modalContent = createElement('div', 'ai-chat-modal__content');
      modalContent.style.paddingTop = '8px';
      modalPanel.appendChild(modalHeader);
      modalPanel.appendChild(modalContent);
      overlay.appendChild(modalPanel);

      function closeOverlay() {
        closeWithAnimation(overlay);
      }
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          closeOverlay();
        }
      });
      modalClose.addEventListener('click', closeOverlay);
      return { overlay: overlay, content: modalContent, close: closeOverlay };
    }

    var aiSettingsModal = createOverlayModal('Настройки поведения ИИ');
    var settingsInput = createElement('textarea', 'ai-chat-modal__textarea');
    settingsInput.rows = 8;
    settingsInput.style.maxHeight = '260px';
    settingsInput.style.minHeight = '160px';
    settingsInput.value = state.aiBehavior;
    var settingsActions = createElement('div', 'ai-chat-modal__export-buttons');
    var settingsCancel = createElement('button', 'ai-chat-modal__export-btn', 'Отмена');
    var settingsSave = createElement('button', 'ai-chat-modal__send', 'Сохранить');
    settingsCancel.type = 'button';
    settingsSave.type = 'button';
    settingsActions.appendChild(settingsCancel);
    settingsActions.appendChild(settingsSave);
    aiSettingsModal.content.appendChild(settingsInput);
    aiSettingsModal.content.appendChild(settingsActions);

    var editModal = createOverlayModal('Редактировать ответ ИИ');
    var editInfo = createElement('div', 'ai-chat-modal__empty', '');
    editInfo.style.fontSize = '12px';
    editInfo.style.marginBottom = '6px';
    var editArea = createElement('textarea', 'ai-chat-modal__textarea');
    editArea.rows = 12;
    editArea.style.maxHeight = '320px';
    editArea.style.minHeight = '220px';
    var editActions = createElement('div', 'ai-chat-modal__export-buttons');
    var editApply = createElement('button', 'ai-chat-modal__send', 'Обновить');
    var editDocx = createElement('button', 'ai-chat-modal__export-btn', 'Скачать DOCX');
    var editPdf = createElement('button', 'ai-chat-modal__export-btn', 'Скачать PDF');
    var editCopy = createElement('button', 'ai-chat-modal__export-btn', 'Копировать в буфер');
    [editApply, editDocx, editPdf, editCopy].forEach(function (btn) { btn.type = 'button'; editActions.appendChild(btn); });
    editModal.content.appendChild(editInfo);
    editModal.content.appendChild(editArea);
    editModal.content.appendChild(editActions);

    var templateModal = createOverlayModal('Шаблон');
    var templateInfo = createElement('div', 'ai-chat-modal__empty', 'Загрузка шаблона...');
    var templateArea = createElement('textarea', 'ai-chat-modal__textarea');
    templateArea.rows = 12;
    templateArea.style.maxHeight = '320px';
    templateArea.style.minHeight = '220px';
    templateArea.placeholder = 'Шаблон недоступен. Введите текст вручную.';
    var templateActions = createElement('div', 'ai-chat-modal__export-buttons');
    var applyToResponse = createElement('button', 'ai-chat-modal__export-btn', 'Применить в ответ');
    var applyToComposer = createElement('button', 'ai-chat-modal__export-btn', 'Применить в запрос');
    var downloadTemplate = createElement('button', 'ai-chat-modal__send', 'Скачать как DOCX');
    var closeTemplate = createElement('button', 'ai-chat-modal__export-btn', 'Закрыть');
    [applyToResponse, applyToComposer, downloadTemplate, closeTemplate].forEach(function (btn) { btn.type = 'button'; templateActions.appendChild(btn); });
    templateModal.content.appendChild(templateInfo);
    templateModal.content.appendChild(templateArea);
    templateModal.content.appendChild(templateActions);

    function openOverlay(modalRef) {
      document.body.appendChild(modalRef.overlay);
      requestAnimationFrame(function () { modalRef.overlay.classList.add('ai-chat-modal--visible'); });
    }

    function renderModelOptions() {
      modelSelect.innerHTML = '';
      state.models.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        modelSelect.appendChild(option);
      });
      modelSelect.value = state.model;
    }

    function renderFiles() {
      filesWrap.innerHTML = '';
      if (!state.files.length) {
        filesWrap.appendChild(createElement('div', 'ai-chat-modal__empty', 'Нет прикреплённых файлов'));
        return;
      }
      state.files.forEach(function (file) {
        var chip = createElement('div', 'ai-chat-chip');
        var ocrStatus = file.extracting
          ? '⏳ OCR'
          : (file.extracted ? '✅ OCR' : (file.extractError ? '⚠️ OCR' : '⭕ OCR'));
        chip.innerHTML = ''
          + '<span>' + detectIcon(file) + '</span>'
          + '<span>' + escapeHtml(file.name) + '</span>'
          + '<span class="ai-chat-chip__meta">' + escapeHtml(formatSize(file.size)) + '</span>'
          + '<span class="ai-chat-chip__meta">' + escapeHtml(ocrStatus) + '</span>';

        var ocr = createElement('button', 'ai-chat-chip__remove', file.extracted ? '↻ OCR' : '📄 OCR');
        ocr.type = 'button';
        ocr.disabled = !!file.extracting;
        ocr.addEventListener('click', function () {
          extractSingleFile(file);
        });
        chip.appendChild(ocr);

        var remove = createElement('button', 'ai-chat-chip__remove', '×');
        remove.type = 'button';
        remove.disabled = !!file.extracting;
        remove.addEventListener('click', function () {
          state.files = state.files.filter(function (entry) {
            return entry.id !== file.id;
          });
          renderFiles();
        });
        chip.appendChild(remove);
        filesWrap.appendChild(chip);
      });
    }

    function updateFileStatusInUI() {
      renderFiles();
    }

    function setLoading(loading) {
      state.isLoading = loading;
      textarea.disabled = loading;
      sendButton.disabled = loading;
      menuButton.disabled = loading;
      if (loading) {
        sendButton.innerHTML = '<span class="ai-chat-spinner"></span>Отправка';
      } else {
        sendButton.textContent = 'Отправить';
      }
    }

    async function extractSingleFile(fileEntry) {
      if (!fileEntry || fileEntry.extracting) {
        return false;
      }
      var fileLabel = fileEntry.name || 'файл';
      fileEntry.extracting = true;
      fileEntry.extractError = null;
      updateFileStatusInUI();

      try {
        var extractedText = '';
        if (fileEntry.fileObject && isTextLike(fileEntry.fileObject)) {
          extractedText = await fileToText(fileEntry.fileObject);
          if (!String(extractedText || '').trim() && !isPdfLike(fileEntry.fileObject)) {
            throw new Error('Текстовый файл пустой или не читается');
          }
          messages.appendChild(createMessage('assistant', 'Текст из ' + fileLabel + ':\n' + String(extractedText || '').trim().slice(0, 1200)));
        } else if (fileEntry.url && isTextLike(fileEntry)) {
          extractedText = await fetchExternalFileContent(fileEntry);
          if (!String(extractedText || '').trim() && !isPdfLike(fileEntry)) {
            throw new Error('Не удалось прочитать текст по ссылке');
          }
          messages.appendChild(createMessage('assistant', 'Текст из ' + fileLabel + ':\n' + String(extractedText || '').trim().slice(0, 1200)));
        } else {
          var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
          var formData = new FormData();
          formData.append('action', 'ocr_extract');
          formData.append('language', 'rus');
          if (fileEntry.fileObject) {
            formData.append('file', fileEntry.fileObject, fileLabel || 'document.pdf');
          } else if (fileEntry.url) {
            formData.append('file_url', String(fileEntry.url));
          } else {
            throw new Error('Файл недоступен для чтения');
          }
          var response = await fetch(apiUrl + '?action=ocr_extract', {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
          });
          var payload = await response.json();
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(payload && payload.error ? payload.error : ('Ошибка OCR (' + response.status + ')'));
          }
          extractedText = String(payload.text || '').trim();
          if (!extractedText) {
            throw new Error('OCR не вернул текст. Проверьте качество файла.');
          }
          messages.appendChild(createMessage('assistant', 'OCR текст из ' + fileLabel + ':\n' + extractedText.slice(0, 1200)));
        }

        fileEntry.content = filterOcrArtifacts(String(extractedText || '').trim());
        fileEntry.extracted = fileEntry.content !== '';
        fileEntry.extractError = fileEntry.extracted ? null : 'Пустой результат';
        return fileEntry.extracted;
      } catch (error) {
        fileEntry.extractError = error && error.message ? error.message : 'Не удалось извлечь текст';
        messages.appendChild(createMessage('assistant', 'Ошибка извлечения (' + fileLabel + '): ' + fileEntry.extractError, true));
        return false;
      } finally {
        fileEntry.extracting = false;
        updateFileStatusInUI();
        messages.scrollTop = messages.scrollHeight;
      }
    }

    async function autoExtractFiles(queue) {
      var list = Array.isArray(queue) ? queue.filter(Boolean) : [];
      if (!list.length || state.isLoading) {
        return;
      }
      setLoading(true);
      for (var i = 0; i < list.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await extractSingleFile(list[i]);
      }
      setLoading(false);
    }

    function closeModal() {
      document.removeEventListener('keydown', onEsc);
      hiddenInput.value = '';
      closeWithAnimation(root);
    }

    function onEsc(event) {
      if (event.key === 'Escape') {
        closeModal();
      }
    }


    async function sendMessage() {
      var value = String(textarea.value || '').trim();
      if (state.isLoading) {
        return;
      }
      var hasFileContent = state.files.some(function (file) {
        return file && typeof file.content === 'string' && file.content.trim() !== '';
      });
      if (!value && !hasFileContent) {
        messages.appendChild(createMessage('assistant', 'Добавьте текст запроса или извлеките текст через OCR у файла.', true));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      var effectivePrompt = value || 'Сформируй официальный ответ на основе OCR-текста файла.';
      if (!value) {
        effectivePrompt += ' Исправь очевидные OCR-ошибки, не цитируй мусорные символы, дай деловой структурированный текст.';
      }

      state.model = modelSelect.value;
      state.responseStyle = styleSelect.value;
      state.aiBehavior = String(settingsInput.value || '').trim();

      messages.appendChild(createMessage('user', effectivePrompt));
      var pending = createElement('div', 'ai-chat-msg ai-chat-msg--assistant');
      pending.innerHTML = '<span class="ai-chat-spinner"></span>ИИ готовит ответ...';
      messages.appendChild(pending);
      messages.scrollTop = messages.scrollHeight;
      setLoading(true);

      try {
        await hydrateFileContents(state);
        var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
        var response = await fetch(apiUrl + '?action=ai_response_analyze', {
          method: 'POST',
          credentials: 'same-origin',
          body: buildRequestBlueprint(effectivePrompt, state, config)
        });

        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка API (' + response.status + ')'));
        }

        pending.remove();
        var finalResponse = payload.response || payload.analysis || 'Пустой ответ от API.';
        finalResponse = cleanNumericArtifacts(String(finalResponse || ''))
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        messages.appendChild(createMessage('assistant', finalResponse));
        state.lastAssistantMessage = String(finalResponse || '');
        textarea.value = '';
        autoHeight(textarea);
      } catch (error) {
        pending.remove();
        messages.appendChild(createMessage('assistant', 'Ошибка: ' + (error && error.message ? error.message : 'Не удалось получить ответ.'), true));
      } finally {
        setLoading(false);
        messages.scrollTop = messages.scrollHeight;
      }
    }

    modelSelect.addEventListener('change', function () {
      state.model = modelSelect.value;
    });

    styleSelect.addEventListener('change', function () {
      state.responseStyle = styleSelect.value;
    });

    textarea.addEventListener('input', function () {
      autoHeight(textarea);
    });

    textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    sendButton.addEventListener('click', sendMessage);
    closeButton.addEventListener('click', closeModal);
    settingsButton.addEventListener('click', function () {
      settingsInput.value = state.aiBehavior;
      openOverlay(aiSettingsModal);
    });

    settingsCancel.addEventListener('click', function () {
      aiSettingsModal.close();
    });
    settingsSave.addEventListener('click', function () {
      state.aiBehavior = String(settingsInput.value || '').trim();
      aiSettingsModal.close();
    });

    menuButton.addEventListener('click', function () {
      menuDropdown.style.display = menuDropdown.style.display === 'none' ? 'block' : 'none';
    });
    openEditButton.addEventListener('click', function () {
      menuDropdown.style.display = 'none';
      if (!state.lastAssistantMessage) {
        editInfo.textContent = 'Ответ ещё не получен.';
        editArea.value = '';
      } else {
        editInfo.textContent = 'Можно отредактировать последний ответ ассистента.';
        editArea.value = state.lastAssistantMessage;
      }
      openOverlay(editModal);
    });
    openTemplateButton.addEventListener('click', async function () {
      menuDropdown.style.display = 'none';
      if (!state.templateDraft) {
        var templateUrl = config.templateUrl || '/template.docx';
        try {
          var response = await fetch(templateUrl, { credentials: 'same-origin' });
          if (!response.ok) {
            throw new Error('not_found');
          }
          await response.blob();
          state.templateDraft = 'Шаблон загружен (' + templateUrl + '). Вставьте нужный текст вручную для редактирования.';
          templateInfo.textContent = 'Файл шаблона найден. Отредактируйте содержимое ниже.';
        } catch (error) {
          state.templateDraft = '';
          templateInfo.textContent = 'Не удалось загрузить template.docx. Можно ввести текст вручную.';
        }
      }
      templateArea.value = state.templateDraft;
      openOverlay(templateModal);
    });

    editApply.addEventListener('click', function () {
      var next = String(editArea.value || '').trim();
      if (!next) {
        alert('Введите текст для обновления.');
        return;
      }
      state.lastAssistantMessage = next;
      var assistantMessages = Array.from(messages.querySelectorAll('.ai-chat-msg--assistant:not(.ai-chat-msg--error)'));
      if (assistantMessages.length > 0) {
        assistantMessages[assistantMessages.length - 1].innerHTML = escapeHtml(next);
      } else {
        messages.appendChild(createMessage('assistant', next));
      }
      editModal.close();
    });
    editDocx.addEventListener('click', function () {
      exportDocument('docx', String(editArea.value || '').trim());
    });
    editPdf.addEventListener('click', function () {
      exportDocument('pdf', String(editArea.value || '').trim());
    });
    editCopy.addEventListener('click', function () {
      var text = String(editArea.value || '').trim();
      if (!text) {
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    });

    applyToResponse.addEventListener('click', function () {
      var text = String(templateArea.value || '').trim();
      if (!text) {
        return;
      }
      state.lastAssistantMessage = text;
      editArea.value = text;
      templateModal.close();
    });
    applyToComposer.addEventListener('click', function () {
      textarea.value = String(templateArea.value || '');
      autoHeight(textarea);
      templateModal.close();
    });
    downloadTemplate.addEventListener('click', function () {
      exportDocument('docx', String(templateArea.value || '').trim());
    });
    closeTemplate.addEventListener('click', function () {
      state.templateDraft = String(templateArea.value || '');
      templateModal.close();
    });

    attachButton.addEventListener('click', function () {
      hiddenInput.click();
    });

    hiddenInput.addEventListener('change', function () {
      var selected = hiddenInput.files ? Array.from(hiddenInput.files) : [];
      if (!selected.length) {
        return;
      }
      var newFiles = normalizeFileObjects(selected);
      state.files = state.files.concat(newFiles);
      hiddenInput.value = '';
      renderFiles();
      autoExtractFiles(newFiles);
    });

    root.addEventListener('click', function (event) {
      if (!menuWrap.contains(event.target)) {
        menuDropdown.style.display = 'none';
      }
      if (event.target === root) {
        closeModal();
      }
    });

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    filesBox.appendChild(filesWrap);
    filesBox.appendChild(attachButton);

    modelField.appendChild(modelSelect);
    styleField.appendChild(styleSelect);
    topBar.appendChild(filesBox);
    topBar.appendChild(modelField);
    topBar.appendChild(styleField);
    topBar.appendChild(settingsButton);

    composer.appendChild(textarea);
    composer.appendChild(sendButton);
    composer.appendChild(menuWrap);

    content.appendChild(topBar);
    content.appendChild(messages);
    content.appendChild(composer);

    panel.appendChild(header);
    panel.appendChild(content);
    root.appendChild(panel);
    document.body.appendChild(root);

    requestAnimationFrame(function () {
      root.classList.add('ai-chat-modal--visible');
    });

    renderFiles();
    renderModelOptions();

    fetchModels(config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php').then(function (models) {
      state.models = models;
      if (!models.some(function (entry) { return entry.value === state.model; })) {
        state.model = models[0] ? models[0].value : state.model;
      }
      renderModelOptions();
    });

    autoHeight(textarea);
    document.addEventListener('keydown', onEsc);
    setTimeout(function () {
      textarea.focus();
    }, 0);
  }

  if (typeof window !== 'undefined') {
    window.openDocumentsAiResponseModal = openDocumentsAiResponseModal;
  }
})();
