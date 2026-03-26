(function () {
  var STYLE_ID = 'ai-chat-modal-style-v2';
  var ROOT_CLASS = 'ai-chat-modal';
  var FILE_INPUT_ID = 'ai-chat-hidden-file-input';

  var MODEL_OPTIONS = [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4-turbo', label: 'GPT-4-turbo' },
    { value: 'claude-3-sonnet', label: 'Claude-3 Sonnet' },
    { value: 'deepseek-chat', label: 'DeepSeek-V3' }
  ];

  var STYLE_OPTIONS = [
    { value: 'concise', label: 'Краткий и по делу' },
    { value: 'friendly', label: 'Развёрнутый и дружелюбный' },
    { value: 'technical', label: 'Технический с пояснениями' }
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
      '.ai-chat-modal{position:fixed;inset:0;z-index:1900;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.45);backdrop-filter:blur(5px);opacity:0;transition:opacity .2s ease;}' +
      '.ai-chat-modal--visible{opacity:1;}' +
      '.ai-chat-modal--closing{opacity:0;}' +
      '.ai-chat-modal__panel{width:min(80vw,1120px);height:min(70vh,860px);display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.95),rgba(248,250,252,.9));border:1px solid rgba(226,232,240,.9);border-radius:20px;box-shadow:0 20px 50px rgba(15,23,42,.25);overflow:hidden;}' +
      '.ai-chat-modal__header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(226,232,240,.9);}' +
      '.ai-chat-modal__title{font-size:16px;font-weight:700;color:var(--documents-text,#0f172a);}' +
      '.ai-chat-modal__subtitle{margin-top:3px;font-size:12px;color:var(--documents-muted,#64748b);}' +
      '.ai-chat-modal__close{border:none;background:rgba(148,163,184,.2);width:34px;height:34px;border-radius:999px;font-size:18px;line-height:1;cursor:pointer;}' +
      '.ai-chat-modal__content{display:flex;flex-direction:column;gap:10px;padding:10px 14px 14px;min-height:0;flex:1;}' +
      '.ai-chat-modal__context{border:1px solid rgba(226,232,240,.95);border-radius:14px;padding:10px;background:rgba(255,255,255,.72);}' +
      '.ai-chat-modal__context-title{font-size:12px;font-weight:700;color:#334155;margin-bottom:8px;}' +
      '.ai-chat-modal__files{display:flex;flex-wrap:wrap;gap:6px;min-height:24px;}' +
      '.ai-chat-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;background:rgba(241,245,249,.95);border:1px solid rgba(203,213,225,.9);font-size:12px;color:#1e293b;max-width:100%;}' +
      '.ai-chat-chip__meta{opacity:.8;}' +
      '.ai-chat-chip__remove{border:none;background:transparent;color:#64748b;cursor:pointer;font-size:14px;line-height:1;padding:0 0 0 2px;}' +
      '.ai-chat-modal__empty{font-size:12px;color:#94a3b8;}' +
      '.ai-chat-modal__attach{margin-top:8px;border:1px dashed rgba(148,163,184,.6);background:rgba(248,250,252,.85);border-radius:10px;padding:7px 10px;font-size:12px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.ai-chat-modal__settings{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid rgba(226,232,240,.95);border-radius:12px;padding:8px;background:rgba(255,255,255,.65);}' +
      '.ai-chat-modal__field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#475569;}' +
      '.ai-chat-modal__select{border:1px solid rgba(148,163,184,.45);border-radius:10px;background:#fff;padding:8px;font-size:13px;color:#0f172a;}' +
      '.ai-chat-modal__messages{flex:1;min-height:0;overflow:auto;padding:8px;background:rgba(248,250,252,.55);border:1px solid rgba(226,232,240,.9);border-radius:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}' +
      '.ai-chat-msg{max-width:86%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;box-shadow:0 4px 12px rgba(15,23,42,.06);}' +
      '.ai-chat-msg--user{margin-left:auto;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border-bottom-right-radius:6px;}' +
      '.ai-chat-msg--assistant{margin-right:auto;background:#fff;border:1px solid rgba(226,232,240,.9);color:#0f172a;border-bottom-left-radius:6px;}' +
      '.ai-chat-msg--error{border-color:rgba(239,68,68,.35);background:rgba(254,242,242,.9);color:#991b1b;}' +
      '.ai-chat-modal__composer{display:flex;gap:8px;align-items:flex-end;}' +
      '.ai-chat-modal__textarea{flex:1;min-height:42px;max-height:140px;resize:none;border:1px solid rgba(148,163,184,.45);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.4;background:#fff;outline:none;}' +
      '.ai-chat-modal__send{border:none;border-radius:12px;padding:10px 14px;min-height:42px;font-size:13px;font-weight:700;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;cursor:pointer;}' +
      '.ai-chat-modal__send:disabled{opacity:.6;cursor:not-allowed;}' +
      '.ai-chat-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(148,163,184,.35);border-top-color:#2563eb;border-radius:50%;animation:ai-chat-spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
      '@keyframes ai-chat-spin{to{transform:rotate(360deg);}}' +
      '@media (max-width:860px){.ai-chat-modal{padding:8px;align-items:flex-end;}.ai-chat-modal__panel{width:100%;height:min(92vh,920px);}.ai-chat-modal__settings{grid-template-columns:1fr;}}' +
      '@media (max-width:560px){.ai-chat-modal{padding:0;}.ai-chat-modal__panel{width:100%;height:96vh;border-radius:16px 16px 0 0;}.ai-chat-modal__header{padding:12px;}.ai-chat-modal__content{padding:8px 10px 12px;}.ai-chat-msg{max-width:92%;}}';
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
        fileObject: null,
        source: source
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
          fileObject: file,
          source: 'local'
        };
      });
  }

  function autoHeight(textarea) {
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
  }

  function createMessage(role, text, isError) {
    var msg = createElement('div', 'ai-chat-msg ai-chat-msg--' + role + (isError ? ' ai-chat-msg--error' : ''));
    msg.innerHTML = escapeHtml(text || '');
    return msg;
  }

  function closeWithAnimation(root, cleanup) {
    root.classList.add('ai-chat-modal--closing');
    setTimeout(function () {
      if (typeof cleanup === 'function') {
        cleanup();
      }
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }, 180);
  }

  function fileToText(file) {
    return new Promise(function (resolve) {
      if (!file || !isTextLike(file) || typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      if ((file.size || 0) > 350 * 1024) {
        resolve('[Файл слишком большой для встраивания в промпт]');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === 'string' ? reader.result.slice(0, 12000) : '');
      };
      reader.onerror = function () {
        resolve('');
      };
      reader.readAsText(file);
    });
  }

  function buildRequestBlueprint(userText, state, config) {
    var filesSnapshot = state.files.map(function (file) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        icon: detectIcon(file),
        url: file.url || '',
        content: file.content || ''
      };
    });

    var context = {};
    if (config.context && typeof config.context === 'object') {
      Object.keys(config.context).forEach(function (key) {
        context[key] = config.context[key];
      });
    }

    context.selectedModel = state.model;
    context.responseStyle = state.responseStyle;
    context.attachedFiles = filesSnapshot;

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
      var file = state.files[i];
      if (file.content) {
        continue;
      }
      if (file.fileObject) {
        // eslint-disable-next-line no-await-in-loop
        file.content = await fileToText(file.fileObject);
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
      model: MODEL_OPTIONS[0].value,
      responseStyle: STYLE_OPTIONS[0].value,
      isLoading: false
    };

    var root = createElement('div', ROOT_CLASS);
    var panel = createElement('div', 'ai-chat-modal__panel');
    var header = createElement('div', 'ai-chat-modal__header');
    var titleWrap = createElement('div');
    var title = createElement('div', 'ai-chat-modal__title', 'Ответ с помощью ИИ');
    var subtitle = createElement('div', 'ai-chat-modal__subtitle', 'Контекст документа и чат с ИИ');
    var closeButton = createElement('button', 'ai-chat-modal__close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть');

    var content = createElement('div', 'ai-chat-modal__content');
    var contextBox = createElement('div', 'ai-chat-modal__context');
    var contextTitle = createElement('div', 'ai-chat-modal__context-title', 'Контекст');
    var contextDoc = createElement('div', 'ai-chat-modal__subtitle', config.documentTitle ? ('Документ: ' + config.documentTitle) : 'Документ не указан');
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
    MODEL_OPTIONS.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      modelSelect.appendChild(option);
    });

    var styleField = createElement('label', 'ai-chat-modal__field');
    styleField.appendChild(createElement('span', '', 'Стиль ответа'));
    var styleSelect = createElement('select', 'ai-chat-modal__select');
    STYLE_OPTIONS.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      styleSelect.appendChild(option);
    });

    var messages = createElement('div', 'ai-chat-modal__messages');
    messages.appendChild(createMessage('assistant', 'Привет! Опишите задачу, и я подготовлю ответ с учётом выбранных файлов.'));

    var composer = createElement('div', 'ai-chat-modal__composer');
    var textarea = createElement('textarea', 'ai-chat-modal__textarea');
    textarea.placeholder = 'Введите запрос...';
    var sendButton = createElement('button', 'ai-chat-modal__send', 'Отправить');
    sendButton.type = 'button';

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
        remove.setAttribute('aria-label', 'Удалить файл ' + file.name);
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
      sendButton.disabled = loading;
      textarea.disabled = loading;
      if (loading) {
        sendButton.innerHTML = '<span class="ai-chat-spinner"></span>Отправка';
      } else {
        sendButton.textContent = 'Отправить';
      }
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
        var formData = buildRequestBlueprint(value, state, config);

        var response = await fetch(apiUrl + '?action=ai_response_analyze', {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });

        var payload;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = { ok: false, error: 'Некорректный ответ сервера.' };
        }

        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка API (' + response.status + ')'));
        }

        pending.remove();
        messages.appendChild(createMessage('assistant', payload.response || payload.analysis || 'Ответ получен, но текст пустой.'));
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

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    contextBox.appendChild(contextTitle);
    contextBox.appendChild(contextDoc);
    contextBox.appendChild(filesWrap);
    contextBox.appendChild(attachButton);

    modelField.appendChild(modelSelect);
    styleField.appendChild(styleSelect);
    settings.appendChild(modelField);
    settings.appendChild(styleField);

    composer.appendChild(textarea);
    composer.appendChild(sendButton);

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
