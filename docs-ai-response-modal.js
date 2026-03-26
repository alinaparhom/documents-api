(function() {
  var STYLE_ID = 'documents-ai-response-style';
  var ROOT_CLASS = 'documents-ai-modal';
  var MAX_FILES_PER_REQUEST = 8;
  var MAX_TOTAL_FILE_SIZE = 20 * 1024 * 1024;

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (typeof text === 'string') {
      element.textContent = text;
    }
    return element;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.documents-ai-modal{position:fixed;inset:0;z-index:1700;background:rgba(15,23,42,.24);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;}' +
      '.documents-ai-modal__panel{width:min(1220px,100%);max-height:min(94vh,1020px);display:flex;flex-direction:column;gap:12px;background:linear-gradient(170deg,rgba(255,255,255,.96),rgba(255,255,255,.9));border:1px solid rgba(255,255,255,.82);border-radius:24px;box-shadow:0 26px 60px rgba(15,23,42,.2);padding:14px;overflow:auto;}' +
      '.documents-ai-modal__header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}' +
      '.documents-ai-modal__title{font-size:17px;font-weight:700;color:#0f172a;}' +
      '.documents-ai-modal__desc{font-size:12px;color:#64748b;line-height:1.45;margin-top:2px;}' +
      '.documents-ai-modal__close{border:none;background:rgba(148,163,184,.18);color:#0f172a;border-radius:999px;width:34px;height:34px;font-size:18px;line-height:1;cursor:pointer;}' +
      '.documents-ai-modal__grid{display:grid;grid-template-columns:minmax(300px,420px) minmax(440px,1fr);gap:12px;}' +
      '.documents-ai-modal__card{background:rgba(255,255,255,.78);border:1px solid rgba(226,232,240,.95);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0;}' +
      '.documents-ai-modal__label{font-size:12px;color:#475569;font-weight:600;}' +
      '.documents-ai-modal__input,.documents-ai-modal__textarea,.documents-ai-modal__select{width:100%;border:1px solid rgba(148,163,184,.35);border-radius:12px;background:rgba(255,255,255,.86);padding:10px 11px;font-size:14px;color:#0f172a;box-sizing:border-box;}' +
      '.documents-ai-modal__textarea{min-height:120px;resize:vertical;}' +
      '.documents-ai-modal__textarea--analysis{min-height:220px;}' +
      '.documents-ai-modal__textarea--response{min-height:280px;}' +
      '.documents-ai-modal__chat{display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto;padding:10px;border-radius:12px;background:rgba(248,250,252,.85);border:1px solid rgba(226,232,240,.95);}' +
      '.documents-ai-modal__bubble{max-width:92%;padding:9px 11px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}' +
      '.documents-ai-modal__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a;}' +
      '.documents-ai-modal__bubble--assistant{align-self:flex-start;background:rgba(15,23,42,.06);color:#0f172a;}' +
      '.documents-ai-modal__input:focus,.documents-ai-modal__textarea:focus,.documents-ai-modal__select:focus{outline:none;border-color:rgba(37,99,235,.55);box-shadow:0 0 0 3px rgba(37,99,235,.12);}' +
      '.documents-ai-modal__row{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.documents-ai-modal__button{border:1px solid rgba(148,163,184,.34);background:rgba(255,255,255,.74);border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.documents-ai-modal__button--primary{background:linear-gradient(135deg,rgba(37,99,235,.95),rgba(14,165,233,.9));color:#fff;border-color:transparent;}' +
      '.documents-ai-modal__button--danger{background:linear-gradient(135deg,rgba(239,68,68,.9),rgba(234,88,12,.9));color:#fff;border-color:transparent;}' +
      '.documents-ai-modal__button:disabled{opacity:.55;cursor:not-allowed;}' +
      '.documents-ai-modal__hint{font-size:12px;color:#64748b;line-height:1.4;}' +
      '.documents-ai-modal__model{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;color:#1e3a8a;background:rgba(37,99,235,.12);}' +
      '.documents-ai-modal__status{font-size:12px;padding:8px 10px;border-radius:10px;background:rgba(59,130,246,.1);color:#1d4ed8;white-space:pre-wrap;}' +
      '.documents-ai-modal__status--error{background:rgba(248,113,113,.12);color:#b91c1c;}' +
      '.documents-ai-modal__preview{background:#ffffff;border:1px solid rgba(203,213,225,.95);border-radius:12px;padding:14px;min-height:220px;font-size:13px;color:#0f172a;line-height:1.45;}' +
      '.documents-ai-modal__letter-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px;font-size:12px;color:#334155;}' +
      '.documents-ai-modal__subject{font-weight:700;text-transform:uppercase;text-align:center;margin:16px 0 14px;}' +
      '.documents-ai-modal__letter-body{white-space:pre-wrap;word-break:break-word;}' +
      '@media (max-width:900px){.documents-ai-modal__grid{grid-template-columns:1fr;}}' +
      '@media (max-width:768px){.documents-ai-modal{padding:6px;align-items:flex-end;}.documents-ai-modal__panel{width:100%;max-height:95vh;border-radius:18px;padding:10px;}.documents-ai-modal__grid{grid-template-columns:1fr;}.documents-ai-modal__button{flex:1 1 calc(50% - 8px);}.documents-ai-modal__textarea{min-height:100px;font-size:16px;}.documents-ai-modal__textarea--analysis{min-height:180px;}.documents-ai-modal__textarea--response{min-height:220px;}}';
    document.head.appendChild(style);
  }

  function getActiveEditableElement() {
    var element = document.activeElement;
    if (!element || element === document.body) {
      return null;
    }
    if (element.isContentEditable) {
      return element;
    }
    if (element.tagName === 'TEXTAREA') {
      return element;
    }
    if (element.tagName === 'INPUT') {
      var type = String(element.type || '').toLowerCase();
      if (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'tel' || type === '') {
        return element;
      }
    }
    return null;
  }

  function insertIntoEditable(element, text) {
    if (!element || !text) {
      return false;
    }
    if (element.isContentEditable) {
      element.focus({ preventScroll: true });
      element.textContent = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (typeof element.value === 'string') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function buildDraftPair(prompt, title, analysisText) {
    var topic = prompt ? String(prompt).trim() : '';
    var taskTitle = title ? String(title).trim() : '';
    var intro = taskTitle ? ('По задаче «' + taskTitle + '».') : 'По задаче.';
    var context = analysisText ? ('\n\nКлючевые моменты анализа: ' + analysisText) : '';
    var neutral = intro + '\n\n' +
      'Благодарю за направленные материалы.' + context + '\n\n' +
      '1) Проверили входящие данные и соответствие требованиям.\n' +
      '2) Выполняем необходимые действия в рабочем порядке.\n' +
      '3) Готовы направить уточнения по срокам и статусу по вашему запросу.';

    var aggressive = intro + '\n\n' +
      'Материалы получены и приняты к исполнению.' + context + '\n\n' +
      '1) Данные проверены, несоответствия фиксируются сразу.\n' +
      '2) Работа выполняется в приоритетном режиме, без сдвига сроков.\n' +
      '3) При необходимости предоставим подтверждение действий и отчёт в полном объёме.';

    if (!topic) {
      return {
        neutral: neutral,
        aggressive: aggressive,
        analysis: 'Автоанализ без дополнительного запроса: документ принят, статус будет обновлён после проверки.'
      };
    }

    return {
      neutral: neutral + '\n\nЗапрос: ' + topic + '.',
      aggressive: aggressive + '\n\nЗапрос принят к обязательному исполнению: ' + topic + '.',
      analysis: 'Выделены приоритеты по запросу: ' + topic + '.'
    };
  }

  function toPlainObject(value, depth, seen) {
    var stack = Array.isArray(seen) ? seen : [];
    if (depth > 3) {
      return '[max-depth]';
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof File !== 'undefined' && value instanceof File) {
      return {
        name: value.name || '',
        size: value.size || 0,
        type: value.type || ''
      };
    }
    if (Array.isArray(value)) {
      return value.map(function(item) {
        return toPlainObject(item, depth + 1, stack);
      });
    }
    if (typeof value === 'object') {
      if (stack.indexOf(value) !== -1) {
        return '[circular]';
      }
      stack.push(value);
      var result = {};
      Object.keys(value).forEach(function(key) {
        var item = value[key];
        if (typeof item === 'function') {
          return;
        }
        result[key] = toPlainObject(item, depth + 1, stack);
      });
      stack.pop();
      return result;
    }
    return value;
  }

  function normalizeFilesList(files) {
    if (!Array.isArray(files)) {
      return [];
    }
    return files.filter(function(file) {
      return typeof File !== 'undefined' && file instanceof File;
    });
  }

  function validateFilesForRequest(files) {
    var normalized = normalizeFilesList(files);
    if (!normalized.length) {
      return { ok: true, files: normalized, message: '' };
    }
    if (normalized.length > MAX_FILES_PER_REQUEST) {
      return {
        ok: false,
        files: normalized,
        message: 'Слишком много файлов. Максимум: ' + MAX_FILES_PER_REQUEST + '.'
      };
    }
    var totalSize = normalized.reduce(function(sum, file) {
      return sum + (file && file.size ? file.size : 0);
    }, 0);
    if (totalSize > MAX_TOTAL_FILE_SIZE) {
      return {
        ok: false,
        files: normalized,
        message: 'Файлы слишком большие. Лимит: 20 МБ на запрос.'
      };
    }
    return { ok: true, files: normalized, message: '' };
  }

  function parseJsonSafely(raw, fallback) {
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function collectFilesBySelector(selector) {
    if (!selector) {
      return [];
    }
    var input = document.querySelector(selector);
    if (!input || !input.files) {
      return [];
    }
    return normalizeFilesList(Array.from(input.files));
  }

  function collectOptionsFromTrigger(trigger) {
    var button = trigger || null;
    var data = button && button.dataset ? button.dataset : {};
    var contextFromData = parseJsonSafely(data.documentsAiContext, {});
    var documentFromData = parseJsonSafely(data.documentsAiDocument, {});
    var files = collectFilesBySelector(data.documentsAiFilesSelector || '');
    var title = data.documentsAiTitle || '';
    var apiUrl = data.documentsAiApiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
    return {
      apiUrl: apiUrl,
      documentTitle: title,
      documentData: documentFromData,
      context: contextFromData,
      pendingFiles: files
    };
  }

  function callAiApi(options) {
    var apiUrl = options.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
    var formData = new FormData();
    formData.append('action', 'ai_response_analyze');
    formData.append('documentTitle', options.documentTitle || '');
    formData.append('prompt', options.prompt || '');
    var files = normalizeFilesList(options.files);
    if (files.length) {
      files.forEach(function(file) {
        formData.append('attachments[]', file);
      });
      formData.append('attachment', files[0]);
    } else if (options.file) {
      formData.append('attachment', options.file);
    }
    if (options.context) {
      try {
        formData.append('context', JSON.stringify(toPlainObject(options.context, 0)));
      } catch (error) {
        formData.append('context', '{}');
      }
    }

    return fetch(apiUrl + '?action=ai_response_analyze', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    })
      .then(function(response) {
        if (!response || !response.ok) {
          return response.json()
            .then(function(errorPayload) {
              var message = errorPayload && errorPayload.error
                ? String(errorPayload.error)
                : ('HTTP ' + (response ? response.status : '0'));
              var error = new Error(message);
              error.meta = errorPayload && typeof errorPayload === 'object' ? errorPayload : {};
              throw error;
            })
            .catch(function() {
              throw new Error('HTTP ' + (response ? response.status : '0'));
            });
        }
        return response.json();
      });
  }

  function openDocumentsAiResponseModal(options) {
    ensureStyle();
    var config = options || {};
    var documentData = config.documentData && typeof config.documentData === 'object' ? config.documentData : {};
    var contextData = config.context && typeof config.context === 'object' ? config.context : {};
    var preloadedFiles = normalizeFilesList(config.pendingFiles);
    var defaultTitle = config.documentTitle
      ? String(config.documentTitle)
      : [documentData.title, documentData.description, documentData.registryNumber ? ('№ ' + documentData.registryNumber) : '']
        .filter(Boolean)
        .join(' ')
        .trim();
    var rowContextText = [
      documentData.title || '',
      documentData.description || '',
      documentData.status || '',
      contextData && contextData.registryNumber ? ('Реестр: ' + contextData.registryNumber) : ''
    ].filter(Boolean).join('\n');
    var root = createElement('div', ROOT_CLASS);
    var panel = createElement('div', 'documents-ai-modal__panel');
    var header = createElement('div', 'documents-ai-modal__header');
    var headText = createElement('div', '');
    var title = createElement('div', 'documents-ai-modal__title', 'Ответ с помощью ИИ');
    var desc = createElement('div', 'documents-ai-modal__desc', 'Загрузите/проверьте файлы и получите подробный структурированный ответ от ИИ. Всё оптимизировано для телефона и десктопа.');
    var closeButton = createElement('button', 'documents-ai-modal__close', '×');

    var grid = createElement('div', 'documents-ai-modal__grid');
    var leftCard = createElement('div', 'documents-ai-modal__card');
    var rightCard = createElement('div', 'documents-ai-modal__card');

    var titleLabel = createElement('div', 'documents-ai-modal__label', 'Название задачи');
    var titleInput = createElement('input', 'documents-ai-modal__input');
    titleInput.value = defaultTitle;
    titleInput.placeholder = 'Например: Согласование договора';

    var fileLabel = createElement('div', 'documents-ai-modal__label', 'Файлы для анализа (PDF, DOCX, TXT, изображение)');
    var fileInput = createElement('input', 'documents-ai-modal__input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.pdf,.doc,.docx,.txt,image/*';
    var linkedFilesHint = createElement('div', 'documents-ai-modal__hint', preloadedFiles.length
      ? ('Из окна ответа передано файлов: ' + preloadedFiles.length + ' (' + preloadedFiles.map(function(file) { return file.name; }).join(', ') + ').')
      : 'Из окна ответа файлы пока не переданы. Можно выбрать файлы вручную.');
    var linkedRemoteFiles = Array.isArray(config.linkedFiles) ? config.linkedFiles.filter(Boolean) : [];
    var remoteFilesHint = createElement('div', 'documents-ai-modal__hint', linkedRemoteFiles.length
      ? ('Из строки задачи будет автоматически загружено файлов: ' + linkedRemoteFiles.length + '.')
      : 'Файлы из строки задачи не найдены.');

    var promptLabel = createElement('div', 'documents-ai-modal__label', 'Уточняющий запрос');
    var promptInput = createElement('textarea', 'documents-ai-modal__textarea');
    promptInput.placeholder = 'Например: дай полный юридический и деловой разбор с рисками и финальным письмом';
    if (rowContextText) {
      promptInput.value = 'Контекст строки:\n' + rowContextText + '\n\nСформируй максимально подробный и структурированный ответ.';
    }

    var responseLabel = createElement('div', 'documents-ai-modal__label', 'Готовый ответ ИИ (редактируемый)');
    var responseInput = createElement('textarea', 'documents-ai-modal__textarea');
    responseInput.placeholder = 'Здесь появится готовый ответ в выбранном стиле';

    var toneLabel = createElement('div', 'documents-ai-modal__label', 'Стиль');
    var toneSelect = createElement('select', 'documents-ai-modal__select');
    toneSelect.innerHTML = '<option value="neutral">Деловой</option><option value="aggressive">Жёсткий деловой</option>';

    var status = createElement('div', 'documents-ai-modal__status', 'Нажмите «Сгенерировать ответ», чтобы получить полный анализ и ответ.');
    var modelBadge = createElement('div', 'documents-ai-modal__model', 'Модель: —');
    var analysis = createElement('textarea', 'documents-ai-modal__textarea documents-ai-modal__textarea--analysis');
    analysis.placeholder = 'Здесь будет аналитический ответ от ИИ';
    var citationsBlock = createElement('div', 'documents-ai-modal__hint', '');

    var actionsTop = createElement('div', 'documents-ai-modal__row');
    var analyzeButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--primary', 'Сгенерировать ответ');
    var useButton = createElement('button', 'documents-ai-modal__button', 'Использовать выбранный текст');
    var pdfButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--primary', 'Сгенерировать PDF');
    var closeActionButton = createElement('button', 'documents-ai-modal__button', 'Закрыть');
    var chatLabel = createElement('div', 'documents-ai-modal__label', 'Диалог с ИИ');
    var chatLog = createElement('div', 'documents-ai-modal__chat');

    responseInput.className = 'documents-ai-modal__textarea documents-ai-modal__textarea--response';

    var fallbackEditable = getActiveEditableElement();
    var conversation = [];

    function appendChatMessage(role, text) {
      var safeText = String(text || '').trim();
      if (!safeText) {
        return;
      }
      var safeRole = role === 'user' ? 'user' : 'assistant';
      conversation.push({ role: safeRole, text: safeText, at: Date.now() });
      var bubble = createElement('div', 'documents-ai-modal__bubble documents-ai-modal__bubble--' + safeRole, safeText);
      chatLog.appendChild(bubble);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function openPrintWindow() {
      var text = getSelectedText();
      if (!text) {
        showStatus('Сначала сформируйте текст ответа.', true);
        return;
      }
      var printWindow = window.open('', '_blank', 'width=980,height=760');
      if (!printWindow) {
        showStatus('Браузер заблокировал окно печати. Разрешите всплывающие окна.', true);
        return;
      }
      var safeTitle = String(titleInput.value || 'Ответ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var safeBody = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      printWindow.document.open();
      printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Ответ</title><style>body{margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a}.sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:32px 28px;box-sizing:border-box}.head{font-size:18px;font-weight:700;margin-bottom:14px}.body{white-space:pre-wrap;line-height:1.55}@media print{body{padding:0;background:#fff}.sheet{border:none;box-shadow:none;max-width:none;border-radius:0;padding:24mm 16mm}}</style></head><body><div class="sheet"><div class="head">' + safeTitle + '</div><div class="body">' + safeBody + '</div></div><script>window.onload=function(){window.focus();window.print();};</script></body></html>');
      printWindow.document.close();
    }

    function closeModal() {
      document.removeEventListener('keydown', handleEscape, true);
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }

    function handleEscape(event) {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    }

    function getSelectedText() {
      return String(responseInput.value || '').trim();
    }

    function showStatus(text, isError) {
      status.textContent = text;
      status.classList.toggle('documents-ai-modal__status--error', Boolean(isError));
      if (typeof config.showMessage === 'function') {
        config.showMessage(isError ? 'error' : 'success', text);
      }
    }

    function fetchRemoteFiles(files) {
      var list = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!list.length) {
        return Promise.resolve([]);
      }
      return Promise.all(list.map(function(meta, index) {
        if (!meta || !meta.url) {
          return Promise.resolve(null);
        }
        return fetch(meta.url, { credentials: 'same-origin' })
          .then(function(response) {
            if (!response || !response.ok) {
              return null;
            }
            return response.blob();
          })
          .then(function(blob) {
            if (!blob) {
              return null;
            }
            var filename = meta.name || ('attachment-' + (index + 1));
            var fileType = blob.type || meta.type || 'application/octet-stream';
            return new File([blob], filename, { type: fileType });
          })
          .catch(function() {
            return null;
          });
      })).then(function(items) {
        return items.filter(Boolean);
      });
    }

    analyzeButton.type = 'button';
    analyzeButton.addEventListener('click', function() {
      analyzeButton.disabled = true;
      showStatus('Идёт обработка файлов и генерация развёрнутого ответа…', false);
      appendChatMessage('user', promptInput.value || 'Сгенерируй ответ по документу');

      var selectedFiles = fileInput.files ? Array.from(fileInput.files) : [];
      var baseFiles = selectedFiles.length ? selectedFiles : preloadedFiles;

      fetchRemoteFiles(linkedRemoteFiles)
        .then(function(remoteFiles) {
          var filesForAnalysis = baseFiles.concat(remoteFiles);
          var validation = validateFilesForRequest(filesForAnalysis);
          if (!validation.ok) {
            throw new Error(validation.message);
          }
          filesForAnalysis = validation.files;
          var selectedFile = filesForAnalysis.length ? filesForAnalysis[0] : null;
          return callAiApi({
            apiUrl: config.apiUrl,
            file: selectedFile,
            files: filesForAnalysis,
            prompt: promptInput.value,
            documentTitle: titleInput.value,
            context: {
              document: toPlainObject(documentData, 0),
              requestContext: toPlainObject(contextData, 0),
              linkedFiles: toPlainObject(linkedRemoteFiles, 0),
              filesFromResponseModal: filesForAnalysis.map(function(file) {
                return { name: file.name || '', size: file.size || 0, type: file.type || '' };
              }),
              selectedTone: toneSelect.value
            }
          });
        })
        .then(function(data) {
          var serverAnalysis = data && data.analysis ? String(data.analysis) : '';
          var serverResponse = data && data.response ? String(data.response) : '';
          var serverNeutral = data && data.neutral ? String(data.neutral) : '';
          var serverAggressive = data && data.aggressive ? String(data.aggressive) : '';
          var serverCitations = data && Array.isArray(data.citations) ? data.citations : [];
          var usedModel = data && data.model ? String(data.model) : '';
          var usedProvider = data && data.provider ? String(data.provider) : '';
          var local = buildDraftPair(promptInput.value, titleInput.value, serverAnalysis);

          analysis.value = serverAnalysis || local.analysis;
          responseInput.value = serverResponse
            || (toneSelect.value === 'aggressive' ? serverAggressive : serverNeutral)
            || (toneSelect.value === 'aggressive' ? local.aggressive : local.neutral);
          citationsBlock.textContent = serverCitations.length
            ? ('Цитаты из файла: ' + serverCitations.join(' | '))
            : 'Цитаты из файла не возвращены.';
          modelBadge.textContent = 'Модель: ' + (usedModel || 'не определена') + (usedProvider ? (' • ' + usedProvider) : '');
          appendChatMessage('assistant', responseInput.value || analysis.value);
          showStatus('Готово: анализ и подробный ответ сформированы.', false);
        })
        .catch(function(error) {
          var fallback = buildDraftPair(promptInput.value, titleInput.value, 'Сервер ИИ недоступен, применён локальный шаблон.');
          analysis.value = fallback.analysis;
          responseInput.value = toneSelect.value === 'aggressive' ? fallback.aggressive : fallback.neutral;
          citationsBlock.textContent = 'Цитаты недоступны: применён локальный шаблон.';
          if (error && error.meta && error.meta.model) {
            modelBadge.textContent = 'Модель: ' + String(error.meta.model) + (error.meta.provider ? (' • ' + String(error.meta.provider)) : '');
          }
          appendChatMessage('assistant', responseInput.value || fallback.analysis);
          showStatus('Не удалось получить ответ ИИ (' + (error && error.message ? error.message : 'ошибка') + '). Использован локальный шаблон.', true);
        })
        .finally(function() {
          analyzeButton.disabled = false;
        });
    });

    useButton.type = 'button';
    useButton.addEventListener('click', function() {
      var text = getSelectedText();
      if (!text) {
        showStatus('Сначала сформируйте текст ответа.', true);
        return;
      }
      var active = getActiveEditableElement() || fallbackEditable;
      if (insertIntoEditable(active, text)) {
        showStatus('Текст вставлен в активное поле.', false);
        closeModal();
        return;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
          .then(function() {
            showStatus('Активное поле не найдено. Текст скопирован в буфер обмена.', false);
            closeModal();
          })
          .catch(function() {
            showStatus('Не удалось вставить или скопировать текст. Скопируйте вручную.', true);
          });
        return;
      }
      showStatus('Активное поле не найдено. Скопируйте текст вручную.', true);
    });
    pdfButton.type = 'button';
    pdfButton.addEventListener('click', function() {
      openPrintWindow();
      showStatus('Открыто окно печати. Выберите «Сохранить как PDF».', false);
    });

    closeButton.type = 'button';
    closeButton.addEventListener('click', closeModal);
    closeActionButton.type = 'button';
    closeActionButton.addEventListener('click', closeModal);

    root.addEventListener('click', function(event) {
      if (event.target === root) {
        closeModal();
      }
    });

    headText.appendChild(title);
    headText.appendChild(desc);
    header.appendChild(headText);
    header.appendChild(closeButton);

    leftCard.appendChild(titleLabel);
    leftCard.appendChild(titleInput);
    leftCard.appendChild(fileLabel);
    leftCard.appendChild(fileInput);
    leftCard.appendChild(linkedFilesHint);
    leftCard.appendChild(remoteFilesHint);
    leftCard.appendChild(promptLabel);
    leftCard.appendChild(promptInput);
    leftCard.appendChild(actionsTop);
    actionsTop.appendChild(analyzeButton);
    actionsTop.appendChild(useButton);
    actionsTop.appendChild(pdfButton);
    actionsTop.appendChild(closeActionButton);
    leftCard.appendChild(status);
    leftCard.appendChild(modelBadge);
    leftCard.appendChild(createElement('div', 'documents-ai-modal__hint', 'Если API ИИ недоступен, автоматически будет использован локальный шаблон ответа.'));

    rightCard.appendChild(createElement('div', 'documents-ai-modal__label', 'Аналитический ответ'));
    rightCard.appendChild(analysis);
    rightCard.appendChild(chatLabel);
    rightCard.appendChild(chatLog);
    rightCard.appendChild(citationsBlock);
    rightCard.appendChild(responseLabel);
    rightCard.appendChild(responseInput);
    rightCard.appendChild(toneLabel);
    rightCard.appendChild(toneSelect);

    grid.appendChild(leftCard);
    grid.appendChild(rightCard);

    panel.appendChild(header);
    panel.appendChild(grid);
    root.appendChild(panel);
    document.body.appendChild(root);
    document.addEventListener('keydown', handleEscape, true);

    titleInput.focus({ preventScroll: true });
  }

  function bindAiTrigger(trigger) {
    if (!trigger || trigger.__documentsAiBound) {
      return;
    }
    trigger.__documentsAiBound = true;
    trigger.addEventListener('click', function(event) {
      event.preventDefault();
      var options = collectOptionsFromTrigger(trigger);
      openDocumentsAiResponseModal(options);
    });
  }

  function autoBindAiTriggers() {
    var triggers = document.querySelectorAll('[data-documents-ai-open]');
    Array.prototype.forEach.call(triggers, function(trigger) {
      bindAiTrigger(trigger);
    });
  }

  window.openDocumentsAiResponseModal = openDocumentsAiResponseModal;
  window.DocumentsAiResponse = {
    open: openDocumentsAiResponseModal,
    bindTrigger: bindAiTrigger,
    autoBind: autoBindAiTriggers
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBindAiTriggers);
  } else {
    autoBindAiTriggers();
  }
})();
