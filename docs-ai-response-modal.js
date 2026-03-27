(function () {
  var STYLE_ID = 'ai-chat-modal-style-v3';
  var ROOT_CLASS = 'ai-chat-modal';
  var FILE_INPUT_ID = 'ai-chat-hidden-file-input';
  var FALLBACK_MODEL_OPTIONS = [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }];
  var MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
  var MAX_EXTRACT_CHARS = 500000;
  var pdfJsReadyPromise = null;

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
      '.ai-chat-modal__panel{width:min(1600px,90vw);height:90vh;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(248,250,252,.86));border:1px solid rgba(203,213,225,.7);border-radius:18px;overflow:hidden;box-shadow:0 20px 55px rgba(15,23,42,.22);}' +
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
      '.ai-chat-modal__field{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#475569;}' +
      '.ai-chat-modal__select{border:1px solid rgba(148,163,184,.45);border-radius:8px;background:#fff;padding:6px;font-size:12px;color:#0f172a;}' +
      '.ai-chat-modal__messages{flex:1;min-height:0;overflow:auto;padding:11px;background:rgba(248,250,252,.52);border:1px solid rgba(226,232,240,.82);border-radius:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}' +
      '.ai-chat-msg{max-width:84%;padding:8px 10px;border-radius:12px;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(15,23,42,.05);}' +
      '.ai-chat-msg--user{margin-left:auto;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border-bottom-right-radius:6px;}' +
      '.ai-chat-msg--assistant{margin-right:auto;background:#fff;border:1px solid rgba(226,232,240,.9);color:#0f172a;border-bottom-left-radius:6px;}' +
      '.ai-chat-msg--error{border-color:rgba(239,68,68,.35);background:rgba(254,242,242,.9);color:#991b1b;}' +
      '.ai-chat-modal__composer{display:flex;gap:6px;align-items:flex-end;}' +
      '.ai-chat-modal__textarea{flex:1;min-height:40px;max-height:120px;resize:none;border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.35;background:#fff;outline:none;}' +
      '.ai-chat-modal__composer-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;}' +
      '.ai-chat-modal__secondary-btn{border:1px solid rgba(148,163,184,.42);border-radius:10px;padding:8px 10px;min-height:40px;font-size:12px;font-weight:700;background:rgba(255,255,255,.92);color:#0f172a;cursor:pointer;}' +
      '.ai-chat-modal__secondary-btn:disabled{opacity:.5;cursor:not-allowed;}' +
      '.ai-chat-modal__editor{position:fixed;inset:0;z-index:2100;background:rgba(15,23,42,.46);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:10px;}' +
      '.ai-chat-modal__editor-panel{width:min(760px,100%);max-height:92vh;display:flex;flex-direction:column;gap:10px;background:rgba(255,255,255,.95);border:1px solid rgba(226,232,240,.95);border-radius:14px;padding:12px;box-shadow:0 20px 50px rgba(15,23,42,.22);}' +
      '.ai-chat-modal__editor-title{font-size:14px;font-weight:700;color:#0f172a;}' +
      '.ai-chat-modal__editor-subtitle{font-size:12px;color:#64748b;}' +
      '.ai-chat-modal__editor-textarea{width:100%;min-height:180px;max-height:55vh;resize:vertical;border:1px solid rgba(148,163,184,.45);border-radius:12px;padding:10px 12px;line-height:1.4;font-size:13px;color:#0f172a;background:#fff;box-sizing:border-box;}' +
      '.ai-chat-modal__editor-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}' +
      '.ai-chat-modal__send{border:none;border-radius:10px;padding:8px 11px;min-height:40px;font-size:12px;font-weight:700;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;cursor:pointer;}' +
      '.ai-chat-modal__send:disabled{opacity:.6;cursor:not-allowed;}' +
      '.ai-chat-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(148,163,184,.35);border-top-color:#2563eb;border-radius:50%;animation:ai-chat-spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
      '@keyframes ai-chat-spin{to{transform:rotate(360deg);}}' +
      '@media (max-width:860px){.ai-chat-modal{padding:6px;}.ai-chat-modal__panel{width:100%;height:100%;border-radius:12px;}.ai-chat-modal__settings{grid-template-columns:1fr;}.ai-chat-msg{max-width:92%;}.ai-chat-modal__composer{flex-direction:column;align-items:stretch;}.ai-chat-modal__composer-actions{justify-content:stretch;}.ai-chat-modal__secondary-btn,.ai-chat-modal__send{width:100%;}.ai-chat-modal__send{min-height:38px;}.ai-chat-modal__editor{padding:6px;}.ai-chat-modal__editor-panel{padding:10px;}.ai-chat-modal__editor-actions{justify-content:stretch;}.ai-chat-modal__editor-actions .ai-chat-modal__secondary-btn,.ai-chat-modal__editor-actions .ai-chat-modal__send{width:100%;}}';
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
    return type.indexOf('text') !== -1 || /\.(txt|md|json|csv|xml|html|css|js|ts|php|py|java|sql)$/i.test(name);
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

    context.selectedModel = state.model;
    context.responseStyle = state.responseStyle;
    context.attachedFiles = state.files.map(function (file) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url || '',
        content: file.content || ''
      };
    });

    var formData = new FormData();
    formData.append('action', 'ai_response_analyze');
    formData.append('documentTitle', config.documentTitle || '');
    formData.append('prompt', userText);
    formData.append('model', state.model);
    formData.append('responseStyle', state.responseStyle);
    formData.append('context', JSON.stringify(context));

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
        continue;
      }
      if (state.files[i].fileObject) {
        // eslint-disable-next-line no-await-in-loop
        state.files[i].content = await fileToText(state.files[i].fileObject);
      } else if (state.files[i].url) {
        // eslint-disable-next-line no-await-in-loop
        state.files[i].content = await fetchExternalFileContent(state.files[i]);
      }
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
      isLoading: false,
      assistantText: '',
      isDocxLoading: false
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
    var contextBox = createElement('div', 'ai-chat-modal__context');
    contextBox.appendChild(createElement('div', 'ai-chat-modal__context-title', 'Контекст и файлы'));
    var filesWrap = createElement('div', 'ai-chat-modal__files');
    var attachButton = createElement('button', 'ai-chat-modal__attach', '+ Прикрепить файл');
    attachButton.type = 'button';

    var hiddenInput = document.getElementById(FILE_INPUT_ID);
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.id = FILE_INPUT_ID;
      hiddenInput.type = 'file';
      hiddenInput.multiple = true;
      hiddenInput.style.display = 'none';
      document.body.appendChild(hiddenInput);
    }

    var settings = createElement('div', 'ai-chat-modal__settings');
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

    var messages = createElement('div', 'ai-chat-modal__messages');
    messages.appendChild(createMessage('assistant', 'Привет! Напишите запрос — я подготовлю ответ.'));

    var composer = createElement('div', 'ai-chat-modal__composer');
    var textarea = createElement('textarea', 'ai-chat-modal__textarea');
    textarea.placeholder = 'Введите запрос...';
    var composerActions = createElement('div', 'ai-chat-modal__composer-actions');
    var insertButton = createElement('button', 'ai-chat-modal__secondary-btn', 'Вставить в ответ');
    insertButton.type = 'button';
    insertButton.disabled = true;
    var generateDocxButton = createElement('button', 'ai-chat-modal__secondary-btn', 'Сохранить в DOCX');
    generateDocxButton.type = 'button';
    var sendButton = createElement('button', 'ai-chat-modal__send', 'Отправить');
    sendButton.type = 'button';

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
        chip.innerHTML = '<span>' + detectIcon(file) + '</span><span>' + escapeHtml(file.name) + '</span><span class="ai-chat-chip__meta">' + escapeHtml(formatSize(file.size)) + '</span>';
        var remove = createElement('button', 'ai-chat-chip__remove', '×');
        remove.type = 'button';
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

    function setLoading(loading) {
      state.isLoading = loading;
      textarea.disabled = loading;
      sendButton.disabled = loading;
      generateDocxButton.disabled = loading || state.isDocxLoading;
      insertButton.disabled = loading || !state.assistantText;
      sendButton.innerHTML = loading
        ? '<span class="ai-chat-spinner"></span>Отправка'
        : 'Отправить';
    }

    function setDocxLoading(loading) {
      state.isDocxLoading = loading;
      generateDocxButton.disabled = loading || state.isLoading;
      generateDocxButton.innerHTML = loading
        ? '<span class="ai-chat-spinner"></span>Генерация...'
        : 'Сохранить в DOCX';
    }

    function openResponseEditor(options) {
      var editorConfig = options && typeof options === 'object' ? options : {};
      var overlay = createElement('div', 'ai-chat-modal__editor');
      var panelEditor = createElement('div', 'ai-chat-modal__editor-panel');
      var titleEditor = createElement('div', 'ai-chat-modal__editor-title', editorConfig.title || 'Редактор ответа');
      var subtitleEditor = createElement('div', 'ai-chat-modal__editor-subtitle', editorConfig.subtitle || 'Проверьте текст перед действием.');
      var editorTextarea = createElement('textarea', 'ai-chat-modal__editor-textarea');
      editorTextarea.value = String(editorConfig.initialText || '');
      editorTextarea.placeholder = editorConfig.placeholder || 'Введите текст...';
      var actions = createElement('div', 'ai-chat-modal__editor-actions');
      var backButton = createElement('button', 'ai-chat-modal__secondary-btn', editorConfig.cancelText || 'Вернуться назад');
      backButton.type = 'button';
      var confirmButton = createElement('button', 'ai-chat-modal__send', editorConfig.confirmText || 'Применить');
      confirmButton.type = 'button';

      function closeEditor() {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }

      backButton.addEventListener('click', closeEditor);
      confirmButton.addEventListener('click', function () {
        if (editorConfig && typeof editorConfig.onConfirm === 'function') {
          editorConfig.onConfirm(String(editorTextarea.value || ''), closeEditor, confirmButton);
          return;
        }
        closeEditor();
      });
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          closeEditor();
        }
      });

      actions.appendChild(backButton);
      actions.appendChild(confirmButton);
      panelEditor.appendChild(titleEditor);
      panelEditor.appendChild(subtitleEditor);
      panelEditor.appendChild(editorTextarea);
      panelEditor.appendChild(actions);
      overlay.appendChild(panelEditor);
      document.body.appendChild(overlay);
      setTimeout(function () {
        editorTextarea.focus();
        editorTextarea.selectionStart = editorTextarea.value.length;
        editorTextarea.selectionEnd = editorTextarea.value.length;
      }, 0);
    }

    async function generateDocxFromText(requestText) {
      var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
      var formData = new FormData();
      formData.append('action', 'response_generate_docx_stub');
      formData.append('responseText', requestText);
      var response = await fetch(apiUrl + '?action=response_generate_docx_stub', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      var payload = await response.json();
      if (!response.ok || !payload || payload.ok !== true || !payload.url) {
        throw new Error(payload && payload.error ? payload.error : 'Не удалось сгенерировать DOCX.');
      }
      var docxResponse = await fetch(payload.url, { credentials: 'same-origin' });
      if (!docxResponse.ok) {
        throw new Error('Не удалось скачать DOCX файл.');
      }
      var docxBlob = await docxResponse.blob();
      var docxName = payload.fileName ? String(payload.fileName) : ('response-' + Date.now() + '.docx');
      var docxFile;
      if (typeof File === 'function') {
        docxFile = new File([docxBlob], docxName, {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          lastModified: Date.now()
        });
      } else {
        docxFile = docxBlob;
        docxFile.name = docxName;
        docxFile.lastModified = Date.now();
      }
      return docxFile;
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
      if (!value || state.isLoading) {
        return;
      }

      state.model = modelSelect.value;
      state.responseStyle = styleSelect.value;

      messages.appendChild(createMessage('user', value));
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
          body: buildRequestBlueprint(value, state, config)
        });

        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка API (' + response.status + ')'));
        }

        pending.remove();
        state.assistantText = String(payload.response || payload.analysis || '').trim();
        messages.appendChild(createMessage('assistant', state.assistantText || 'Пустой ответ от API.'));
        insertButton.disabled = !state.assistantText;
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
    insertButton.addEventListener('click', function () {
      if (!state.assistantText || !config || typeof config.onInsertResponseText !== 'function') {
        return;
      }
      openResponseEditor({
        title: 'Редактирование ответа',
        subtitle: 'Отредактируйте текст и нажмите «Вставить в ответ».',
        initialText: state.assistantText,
        confirmText: 'Вставить в ответ',
        cancelText: 'Вернуться назад',
        onConfirm: function (editedText, closeEditor) {
          var normalizedText = String(editedText || '').trim();
          if (!normalizedText) {
            if (config && typeof config.showMessage === 'function') {
              config.showMessage('error', 'Текст ответа пустой. Добавьте текст перед вставкой.');
            }
            return;
          }
          state.assistantText = normalizedText;
          config.onInsertResponseText(state.assistantText);
          closeEditor();
          if (config && typeof config.showMessage === 'function') {
            config.showMessage('success', 'Текст вставлен в окно «Загрузить ответ».');
          }
        }
      });
    });
    generateDocxButton.addEventListener('click', async function () {
      if (state.isDocxLoading || state.isLoading) {
        return;
      }
      var requestText = '';
      if (config && typeof config.getResponseText === 'function') {
        requestText = String(config.getResponseText() || '').trim();
      }
      if (!requestText && state.assistantText) {
        requestText = state.assistantText;
      }
      if (!requestText) {
        if (config && typeof config.showMessage === 'function') {
          config.showMessage('error', 'Сначала добавьте текст ответа, чтобы сгенерировать DOCX.');
        }
        return;
      }
      openResponseEditor({
        title: 'Онлайн редактор DOCX',
        subtitle: 'Измените текст и нажмите «Приложить документ» или вернитесь назад.',
        initialText: requestText,
        confirmText: 'Приложить документ',
        cancelText: 'Вернуться назад',
        onConfirm: async function (editedText, closeEditor, confirmButton) {
          var normalizedText = String(editedText || '').trim();
          if (!normalizedText) {
            if (config && typeof config.showMessage === 'function') {
              config.showMessage('error', 'Текст пустой. Заполните текст перед сохранением в DOCX.');
            }
            return;
          }
          confirmButton.disabled = true;
          setDocxLoading(true);
          try {
            var generatedFile = await generateDocxFromText(normalizedText);
            if (config && typeof config.onDocxGenerated === 'function') {
              config.onDocxGenerated(generatedFile);
            }
            closeEditor();
            if (config && typeof config.showMessage === 'function') {
              config.showMessage('success', 'Документ приложен в окно «Загрузить ответ».');
            }
          } catch (error) {
            if (config && typeof config.showMessage === 'function') {
              config.showMessage('error', error && error.message ? error.message : 'Ошибка генерации DOCX.');
            }
          } finally {
            confirmButton.disabled = false;
            setDocxLoading(false);
          }
        }
      });
    });
    closeButton.addEventListener('click', closeModal);

    attachButton.addEventListener('click', function () {
      hiddenInput.click();
    });

    hiddenInput.addEventListener('change', function () {
      var selected = hiddenInput.files ? Array.from(hiddenInput.files) : [];
      if (!selected.length) {
        return;
      }
      state.files = state.files.concat(normalizeFileObjects(selected));
      hiddenInput.value = '';
      renderFiles();
    });

    root.addEventListener('click', function (event) {
      if (event.target === root) {
        closeModal();
      }
    });

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    contextBox.appendChild(filesWrap);
    contextBox.appendChild(attachButton);

    modelField.appendChild(modelSelect);
    styleField.appendChild(styleSelect);
    settings.appendChild(modelField);
    settings.appendChild(styleField);

    composerActions.appendChild(insertButton);
    composerActions.appendChild(generateDocxButton);
    composerActions.appendChild(sendButton);
    composer.appendChild(textarea);
    composer.appendChild(composerActions);

    content.appendChild(contextBox);
    content.appendChild(settings);
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
