export function createDocumentsFeatures(core) {
  var ADMIN_OBJECT_MAX_COLUMNS = 50;
  var CORRESPONDENCE_OBJECT_COLUMNS = [
    { group: 'Входящее письмо от филиала/подрядчика', label: '№ входящего письма', type: 'text' },
    { group: 'Входящее письмо от филиала/подрядчика', label: 'Кратко суть письма: проектный, сметный или организационный вопрос', type: 'text' },
    { group: 'Входящее письмо от филиала/подрядчика', label: 'Требуется отправка Заказчику', type: 'text' },
    { group: '', label: 'Исходящее письмо № … от … на Заказчика', type: 'text' },
    { group: 'Ответ от Заказчика № … от …', label: 'Полнота ответа', type: 'text' },
    { group: 'Ответ от Заказчика № … от …', label: 'Требуется уточняющий запрос от Генподрядчика и повторное письмо Заказчику', type: 'text' },
    { group: '', label: '№ письма филиалу/подрядчику — ответ на входящее', type: 'text' }
  ];
  var ADMIN_S3_READ_MAX_BYTES = core.ADMIN_S3_READ_MAX_BYTES;
  var DATE_TIME_FORMATTER = core.DATE_TIME_FORMATTER;
  var adminElements = core.adminElements;
  var appendTelegramUserIdToFormData = core.appendTelegramUserIdToFormData;
  var applyAdminSettings = core.applyAdminSettings;
  var buildApiUrl = core.buildApiUrl;
  var closeModal = core.closeModal;
  var createElement = core.createElement;
  var docsLogger = core.docsLogger;
  var fetchAdminSettings = core.fetchAdminSettings;
  var formatDateTime = core.formatDateTime;
  var formatFileSize = core.formatFileSize;
  var handleResponse = core.handleResponse;
  var isCurrentUserAdmin = core.isCurrentUserAdmin;
  var mergeTelegramUserId = core.mergeTelegramUserId;
  var normalizeTextInputValue = core.normalizeTextInputValue;
  var normalizeUserIdentifier = core.normalizeUserIdentifier;
  var refreshObjects = core.refreshObjects;
  var sendClientDiagnostics = core.sendClientDiagnostics;
  var showMessage = core.showMessage;
  var state = core.state;
  var updateTable = core.updateTable;
  var updateStateFromPayload = core.updateStateFromPayload;
  var uploadFormDataWithProgress = core.uploadFormDataWithProgress;
  var adminRenderTokens = {};
  var lastFocusedElement = null;
  var adminUiState = {
    activeSection: 'responsibles',
    activeNavigation: 'users',
    query: '',
    filters: {
      telegram: 'all',
      login: 'all',
      password: 'all'
    },
    activeObjectId: '',
    objectQuery: '',
    dirty: false
  };
  var cronManagementView = {
    loading: false,
    removing: false,
    data: null,
    error: ''
  };
  var ADMIN_OCR_POLL_INTERVAL_MS = 3000;
  var ADMIN_OCR_SEARCH_DELAY_MS = 350;
  var ADMIN_OCR_TEXT_CHUNK_SIZE = 50000;
function ensureResponsesStyle() {
    if (document.getElementById('documents-responses-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-responses-style';
    style.textContent = '' +
      '.documents-responses-modal{' +
      'position:fixed;inset:0;z-index:1600;background:rgba(148,163,184,0.16);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;' +
      '}' +
      '.documents-responses-panel{' +
      'width:min(760px,100%);max-height:min(88vh,920px);margin:0;background:rgba(255,255,255,0.88);border:1px solid rgba(255,255,255,0.75);border-radius:22px;box-shadow:0 20px 55px rgba(15,23,42,0.16);overflow:hidden;display:flex;flex-direction:column;' +
      '}' +
      '.documents-responses-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(226,232,240,0.95);}' +
      '.documents-responses-title{font-size:18px;font-weight:700;color:#0f172a;}' +
      '.documents-responses-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}' +
      '.documents-responses-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px;min-height:0;}' +
      '.documents-responses-toolbar{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:12px;border-radius:18px;background:rgba(248,250,252,0.92);border:1px solid rgba(226,232,240,0.95);}' +
      '.documents-responses-dropzone{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:18px;border:1px dashed rgba(59,130,246,0.32);background:linear-gradient(135deg, rgba(255,255,255,0.94), rgba(239,246,255,0.96));cursor:pointer;transition:border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;}' +
      '.documents-responses-dropzone:hover,.documents-responses-dropzone:focus-visible{border-color:rgba(37,99,235,0.52);box-shadow:0 10px 24px rgba(37,99,235,0.12);outline:none;transform:translateY(-1px);}' +
      '.documents-responses-dropzone.is-dragover{border-color:rgba(37,99,235,0.78);box-shadow:0 14px 28px rgba(37,99,235,0.18);background:linear-gradient(135deg, rgba(219,234,254,0.95), rgba(239,246,255,0.98));}' +
      '.documents-responses-dropzone-copy{display:flex;flex-direction:column;gap:6px;min-width:0;}' +
      '.documents-responses-dropzone-title{font-size:14px;font-weight:700;color:#0f172a;}' +
      '.documents-responses-dropzone-hint{font-size:12px;line-height:1.45;color:#64748b;}' +
      '.documents-responses-dropzone-badge{flex:0 0 auto;padding:8px 12px;border-radius:999px;background:rgba(37,99,235,0.1);color:#1d4ed8;font-size:12px;font-weight:700;white-space:nowrap;}' +
      '.documents-responses-hint{font-size:12px;color:#64748b;}' +
      '.documents-responses-message{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:rgba(255,255,255,0.9);border:1px solid rgba(226,232,240,0.95);}' +
      '.documents-responses-message-label{font-size:12px;font-weight:700;color:#334155;display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.documents-responses-message-counter{font-weight:600;color:#64748b;}' +
      '.documents-responses-message textarea{width:100%;min-height:92px;max-height:200px;resize:vertical;border:1px solid rgba(148,163,184,0.4);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.45;color:#0f172a;background:rgba(255,255,255,0.98);box-sizing:border-box;}' +
      '.documents-responses-message textarea:focus{outline:none;border-color:rgba(37,99,235,0.55);box-shadow:0 0 0 3px rgba(37,99,235,0.12);}' +
      '.documents-responses-message-actions{display:flex;justify-content:flex-end;}' +
      '.documents-responses-message-actions .documents-button{width:100%;max-width:220px;}' +
      '.documents-responses-table-wrap{overflow:auto;border:1px solid rgba(226,232,240,0.95);border-radius:18px;background:rgba(255,255,255,0.8);min-height:0;}' +
      '.documents-responses-table{width:100%;border-collapse:collapse;font-size:13px;color:#0f172a;}' +
      '.documents-responses-table th,.documents-responses-table td{padding:8px 10px;border-bottom:1px solid rgba(226,232,240,0.85);text-align:left;vertical-align:middle;}' +
      '.documents-responses-table th{font-size:12px;font-weight:700;color:#475569;background:rgba(248,250,252,0.92);position:sticky;top:0;}' +
      '.documents-responses-table tr:last-child td{border-bottom:none;}' +
      '.documents-responses-file{display:flex;flex-direction:column;gap:4px;min-width:180px;}' +
      '.documents-responses-file a{color:#2563eb;text-decoration:none;word-break:break-word;}' +
      '.documents-responses-file a:hover{text-decoration:underline;}' +
      '.documents-responses-text-preview{margin:0;padding:10px 12px;border-radius:12px;background:rgba(241,245,249,0.82);border:1px solid rgba(226,232,240,0.95);font-size:12px;line-height:1.45;color:#0f172a;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;}' +
      '.documents-responses-meta{font-size:12px;color:#64748b;}' +
      '.documents-responses-status{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(59,130,246,0.12);color:#1d4ed8;font-size:12px;font-weight:600;}' +
      '.documents-responses-status--pending{background:rgba(245,158,11,0.14);color:#b45309;}' +
      '.documents-responses-empty{padding:18px;text-align:center;color:#64748b;font-size:13px;}' +
      '.documents-responses-danger{color:#dc2626;}' +
      '.documents-responses-actions .documents-button--ai{background:linear-gradient(135deg, rgba(37,99,235,0.9), rgba(14,165,233,0.9));color:#ffffff;border-color:transparent;}' +
      '.documents-responses-actions .documents-button--ai:hover{filter:brightness(1.03);}' +
      '.documents-brief-modal{position:fixed;inset:0;z-index:1700;background:linear-gradient(180deg, rgba(148,163,184,0.24), rgba(148,163,184,0.3));backdrop-filter:blur(12px);display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;}' +
      '.documents-brief-panel{width:min(980px,100%);max-height:min(90vh,920px);background:linear-gradient(165deg, rgba(255,255,255,0.97), rgba(255,255,255,0.9));border:1px solid rgba(255,255,255,0.95);border-radius:24px;box-shadow:0 30px 60px rgba(15,23,42,0.2);display:flex;flex-direction:column;overflow:hidden;}' +
      '.documents-brief-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid rgba(226,232,240,0.95);background:rgba(255,255,255,0.7);}' +
      '.documents-brief-title{font-size:18px;font-weight:700;color:#0f172a;}' +
      '.documents-brief-subtitle{font-size:12px;color:#64748b;margin-top:2px;}' +
      '.documents-brief-mode{display:inline-flex;align-items:center;margin-top:6px;padding:4px 8px;border-radius:999px;border:1px solid rgba(147,197,253,0.85);background:rgba(219,234,254,0.75);color:#1e3a8a;font-size:11px;font-weight:600;}' +
      '.documents-brief-toggle{display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:7px 10px;border:1px solid rgba(148,163,184,0.35);border-radius:12px;background:rgba(255,255,255,0.75);font-size:12px;color:#334155;font-weight:600;backdrop-filter:blur(8px);}' +
      '.documents-brief-toggle input{accent-color:#2563eb;width:16px;height:16px;}' +
      '.documents-brief-body{display:grid;grid-template-columns:minmax(260px,380px) minmax(0,1fr);gap:14px;padding:14px;min-height:0;flex:1;background:linear-gradient(180deg, rgba(248,250,252,0.55), rgba(255,255,255,0.78));}' +
      '.documents-brief-list{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;padding:2px 6px 2px 0;scrollbar-width:thin;}' +
      '.documents-brief-item{border:1px solid rgba(203,213,225,0.95);background:rgba(255,255,255,0.96);border-radius:14px;padding:11px 12px;text-align:left;color:#0f172a;font-size:13px;cursor:pointer;transition:all .2s ease;box-shadow:0 8px 20px rgba(15,23,42,0.05);display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:56px;}' +
      '.documents-brief-item-name{display:block;width:100%;font-size:13px;font-weight:600;line-height:1.35;white-space:normal;word-break:break-word;overflow-wrap:anywhere;}' +
      '.documents-brief-item-meta{display:block;width:100%;font-size:11px;color:#64748b;white-space:normal;word-break:break-word;overflow-wrap:anywhere;}' +
      '.documents-brief-item:hover,.documents-brief-item:focus-visible{border-color:rgba(37,99,235,0.48);box-shadow:0 0 0 3px rgba(37,99,235,0.12);outline:none;}' +
      '.documents-brief-item.is-active{background:linear-gradient(135deg, rgba(239,246,255,0.96), rgba(255,255,255,0.98));border-color:rgba(37,99,235,0.52);}' +
      '.documents-brief-preview{border:1px solid rgba(203,213,225,0.9);border-radius:18px;background:rgba(255,255,255,0.98);padding:16px;font-size:13px;line-height:1.58;color:#0f172a;white-space:pre-wrap;word-break:break-word;overflow:auto;min-height:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.75), 0 12px 26px rgba(15,23,42,0.06);}' +
      '.documents-brief-preview.is-loading{color:#2563eb;}' +
      '.documents-conclusion-meta{padding:0 14px 8px;font-size:12px;color:#64748b;}' +
      '.documents-conclusion-actions{display:flex;gap:8px;padding:0 14px 12px;}' +
      '.documents-conclusion-actions .documents-button{flex:1 1 auto;}' +
      '.documents-conclusion-preview{font-size:12px;line-height:1.55;}' +
      '@media (max-width: 768px){' +
      '.documents-responses-modal{padding:8px;align-items:center;}' +
      '.documents-responses-panel{width:100%;max-height:calc(100vh - 16px);border-radius:18px;}' +
      '.documents-responses-header,.documents-responses-body{padding:12px;}' +
      '.documents-responses-actions{width:100%;justify-content:stretch;}' +
      '.documents-responses-actions .documents-button{flex:1 1 auto;}' +
      '.documents-responses-dropzone{flex-direction:column;align-items:flex-start;}' +
      '.documents-responses-dropzone-badge{white-space:normal;}' +
      '.documents-responses-message textarea{min-height:80px;}' +
      '.documents-responses-message-actions .documents-button{max-width:none;}' +
      '.documents-responses-table th,.documents-responses-table td{padding:8px;}' +
      '.documents-brief-modal{padding:8px;align-items:flex-end;}' +
      '.documents-brief-panel{width:100%;max-height:calc(100vh - 16px);border-radius:20px;}' +
      '.documents-brief-body{grid-template-columns:1fr;padding:12px;}' +
      '.documents-brief-item{padding:10px 11px;}' +
      '.documents-brief-item-name{font-size:12px;}' +
      '.documents-conclusion-actions{padding:0 12px 10px;}' +
      '}';
    document.head.appendChild(style);
  }

  var aiResponseModalScriptPromise = null;

  function addAiResponseModalScriptCandidate(candidates, seen, source) {
    var value = source ? String(source).trim() : '';
    if (!value) {
      return;
    }
    var key = value;
    try {
      key = new URL(value, window.location.href).href.replace(/[?#].*$/g, '');
    } catch (error) {}
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    candidates.push(value);
  }

  function appendAssetVersion(source, version) {
    var separator = String(source).indexOf('?') === -1 ? '?' : '&';
    return source + separator + 'v=' + encodeURIComponent(version);
  }

  function ensureAiResponseModalScript() {
    if (window.openDocumentsAiResponseModal) {
      return Promise.resolve(window.openDocumentsAiResponseModal);
    }
    if (aiResponseModalScriptPromise) {
      return aiResponseModalScriptPromise;
    }
    aiResponseModalScriptPromise = new Promise(function(resolve, reject) {
      var version = (window.__ASSET_VERSION__ || Date.now()).toString();
      var scriptDirectory = '';
      var scripts = document.getElementsByTagName('script');
      for (var s = scripts.length - 1; s >= 0; s -= 1) {
        var source = scripts[s] && scripts[s].src ? String(scripts[s].src) : '';
        var docsIndex = source.indexOf('/docs.js');
        if (docsIndex === -1) {
          docsIndex = source.indexOf('/js/documents/docs.js');
        }
        if (docsIndex !== -1) {
          scriptDirectory = source.slice(0, source.lastIndexOf('/') + 1);
          break;
        }
      }

      var candidates = [];
      var seenCandidates = Object.create(null);
      addAiResponseModalScriptCandidate(candidates, seenCandidates, '/docs-ai-response-modal.js');
      if (scriptDirectory) {
        addAiResponseModalScriptCandidate(candidates, seenCandidates, scriptDirectory + 'docs-ai-response-modal.js');
      }
      addAiResponseModalScriptCandidate(candidates, seenCandidates, window.DOCUMENTS_AI_MODAL_URL || '');
      addAiResponseModalScriptCandidate(candidates, seenCandidates, '/js/documents/docs-ai-response-modal.js');
      addAiResponseModalScriptCandidate(candidates, seenCandidates, 'docs-ai-response-modal.js');
      addAiResponseModalScriptCandidate(candidates, seenCandidates, './docs-ai-response-modal.js');
      var index = 0;

      function loadNext() {
        if (window.openDocumentsAiResponseModal) {
          resolve(window.openDocumentsAiResponseModal);
          return;
        }
        if (index >= candidates.length) {
          aiResponseModalScriptPromise = null;
          reject(new Error('Не удалось загрузить модуль ИИ-ответа. Проверьте путь к docs-ai-response-modal.js.'));
          return;
        }
        var src = appendAssetVersion(candidates[index], version);
        index += 1;
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function() {
          if (window.openDocumentsAiResponseModal) {
            resolve(window.openDocumentsAiResponseModal);
            return;
          }
          loadNext();
        };
        script.onerror = function() {
          loadNext();
        };
        document.head.appendChild(script);
      }

      loadNext();
    });
    return aiResponseModalScriptPromise;
  }

  function preloadAiResponseModalScript() {
    if (typeof window === 'undefined' || window.openDocumentsAiResponseModal) {
      return;
    }
    var run = function() {
      ensureAiResponseModalScript().catch(function(error) {
        if (typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось заранее загрузить модуль ИИ-ответа:', error);
        }
      });
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2500 });
      return;
    }
    window.setTimeout(run, 700);
  }

  function openAiResponseModal(config) {
    var options = config && typeof config === 'object' ? config : {};
    ensureAiResponseModalScript()
      .then(function(openModal) {
        openModal(options);
      })
      .catch(function(error) {
        showMessage('error', error && error.message ? error.message : 'Не удалось открыть окно ИИ-ответа.');
      });
  }

  function collectBriefSentences(text, limit) {
    var safeLimit = typeof limit === 'number' && limit > 0 ? limit : 8;
    return String(text || '')
      .split(/[\n.;!?]+/g)
      .map(function(part) { return String(part || '').trim(); })
      .filter(function(part) { return part.length > 5; })
      .slice(0, safeLimit);
  }

  function buildBriefSummaryText(text) {
    var lines = collectBriefSentences(text, 8);
    var reason = lines.slice(0, 2).join('. ');
    var actions = lines.slice(2, 5);
    var requirements = lines.slice(5, 8);
    return [
      'Причина:',
      reason || 'Нужны дополнительные сведения по документу и стоимости изменений.',
      '',
      'Действия:',
      actions.length ? actions.map(function(item) { return '• ' + item; }).join('\n') : '• Получить недостающие сведения по стоимости.\n• Согласовать дальнейшие действия.',
      '',
      'Требования из файла:',
      requirements.length ? requirements.map(function(item) { return '• ' + item; }).join('\n') : '• Проверить все изменения работ, суммы и основания.'
    ].join('\n');
  }

  function buildAiBriefSummaryText(payload, sourceText) {
    var data = payload && typeof payload === 'object' ? payload : {};
    var analysis = data.analysis ? String(data.analysis).trim() : '';
    var responseText = data.response ? String(data.response).trim() : '';
    var decision = data.decisionBlock && typeof data.decisionBlock === 'object' ? data.decisionBlock : {};
    var risks = Array.isArray(decision.risks) ? decision.risks : [];
    var actions = Array.isArray(decision.required_actions) ? decision.required_actions : [];
    var requirements = Array.isArray(decision.requirements) ? decision.requirements : [];
    if (!responseText && decision && typeof decision.response === 'string') {
      responseText = String(decision.response).trim();
    }
    var participants = '';
    var cleanedActions = [];
    var cleanedRequirements = [];

    function normalizeSentence(text) {
      var value = String(text || '')
        .replace(/-\s*\n\s*/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.:;,\s]+$/g, '')
        .trim();
      if (!value) {
        return '';
      }
      if (value.length < 12) {
        return '';
      }
      if (/^[\d.\-–—\s]+$/.test(value)) {
        return '';
      }
      if (/^(прошу вас|прошу|1|2|3)\b/i.test(value)) {
        return '';
      }
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function isNoisyItem(value, mode) {
      var text = String(value || '').toLowerCase();
      if (!text) {
        return true;
      }
      if (/-\s*$/.test(text) || text.indexOf('объек-') !== -1) {
        return true;
      }
      if (text.indexOf('рубл') !== -1 && !/\d/.test(text)) {
        return true;
      }
      if (mode === 'requirements' && /(в настоящее время|прошу вас|принять реш)/.test(text)) {
        return true;
      }
      return false;
    }

    function sanitizeList(items, maxItems, mode, excludeMap) {
      var seen = {};
      return (Array.isArray(items) ? items : [])
        .map(normalizeSentence)
        .filter(function(item) {
          var key = item.toLowerCase();
          if (!item || seen[key] || (excludeMap && excludeMap[key]) || isNoisyItem(item, mode)) {
            return false;
          }
          seen[key] = true;
          return true;
        })
        .slice(0, maxItems);
    }

    risks.some(function(item) {
      var line = String(item || '').trim();
      if (!line) {
        return false;
      }
      if (/^отправитель\s*:/i.test(line) || /^кто\s+прислал\s*:/i.test(line)) {
        participants = line;
        return true;
      }
      return false;
    });
    function extractPartyByLabel(text, labelVariants) {
      var safeText = String(text || '');
      if (!safeText) return '';
      var escaped = (Array.isArray(labelVariants) ? labelVariants : [])
        .map(function(label) { return String(label || '').trim(); })
        .filter(Boolean)
        .map(function(label) { return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
      if (!escaped.length) return '';
      var pattern = new RegExp('(?:' + escaped.join('|') + ')\\s*[:\\-]\\s*([^\\n\\r;]+)', 'i');
      var match = safeText.match(pattern);
      return match && match[1] ? String(match[1]).trim() : '';
    }
    var normalizedAnalysis = normalizeSentence(analysis);
    var normalizedResponse = normalizeSentence(responseText);
    var sourceSummary = normalizeSentence(collectBriefSentences(sourceText, 3).join('. '));
    analysis = normalizedAnalysis || normalizedResponse || sourceSummary || 'ИИ не вернул понятный блок «О чем файл».';
    cleanedActions = sanitizeList(actions, 4, 'actions');
    var actionsMap = {};
    cleanedActions.forEach(function(item) {
      actionsMap[String(item).toLowerCase()] = true;
    });
    cleanedRequirements = sanitizeList(requirements, 4, 'requirements', actionsMap);
    if (!cleanedActions.length) {
      cleanedActions = collectBriefSentences(sourceText, 6)
        .map(normalizeSentence)
        .filter(Boolean)
        .slice(0, 4);
    }
    if (!cleanedRequirements.length) {
      cleanedRequirements = collectBriefSentences(sourceText, 8)
        .map(normalizeSentence)
        .filter(Boolean)
        .slice(1, 4);
    }
    if (!participants) {
      var sender = extractPartyByLabel(sourceText, ['отправитель', 'от кого', 'исполнитель']);
      var recipient = extractPartyByLabel(sourceText, ['получатель', 'кому', 'заказчик']);
      if (sender || recipient) {
        participants = 'Отправитель: ' + (sender || 'не найден') + '; Получатель: ' + (recipient || 'не найден');
      }
    }
    var summaryItems = collectBriefSentences(analysis || sourceText, 3)
      .map(normalizeSentence)
      .filter(Boolean)
      .slice(0, 3);
    if (!summaryItems.length && analysis) {
      summaryItems = [analysis];
    }
    var recommendationItems = cleanedRequirements.length
      ? cleanedRequirements.slice(0, 3)
      : cleanedActions.slice(0, 3);
    var conclusionText = normalizeSentence((cleanedActions[0] || cleanedRequirements[0] || analysis || 'Нужно уточнить детали письма перед отправкой ответа.'));
    return [
      'Краткое содержание',
      summaryItems.length ? summaryItems.map(function(item) { return '• ' + item; }).join('\n') : '• Не удалось выделить содержание.',
      '',
      'Рекомендации',
      recommendationItems.length ? recommendationItems.map(function(item) { return '• ' + item; }).join('\n') : '• Уточните данные письма и ключевые требования.',
      '',
      'Итог',
      conclusionText
    ].join('\n');
  }

  function isMeaningfulAiBriefPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    var normalizeBriefText = function(text) {
      return String(text || '')
        .replace(/-\s*\n\s*/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.:;,\s]+$/g, '')
        .trim();
    };
    var summary = normalizeBriefText(payload.summary || '');
    var analysis = normalizeBriefText(payload.analysis || '');
    var responseText = normalizeBriefText(payload.response || '');
    var block = payload.decisionBlock && typeof payload.decisionBlock === 'object' ? payload.decisionBlock : {};
    var hasActions = Array.isArray(block.required_actions) && block.required_actions.some(function(item) {
      return String(item || '').trim().length >= 4;
    });
    var hasRequirements = Array.isArray(block.requirements) && block.requirements.some(function(item) {
      return String(item || '').trim().length >= 4;
    });
    return Boolean(summary || analysis || responseText || hasActions || hasRequirements);
  }

  function extractPlainAiBriefText(payload) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }
    var candidates = [
      payload.summary,
      payload.response,
      payload.analysis,
      payload.text,
      payload.answer
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = String(candidates[i] || '').trim();
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }

  function normalizeAiBriefText(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .trim();
  }

  function formatAiBriefForStorage(text) {
    return normalizeAiBriefText(text || '');
  }

  function getAttachmentAiBrief(file) {
    if (!file || typeof file !== 'object') {
      return '';
    }
    return formatAiBriefForStorage(file.aiBrief || '');
  }

  function findDocumentFileForAiBrief(documentData, source) {
    if (!documentData || !Array.isArray(documentData.files) || !source) {
      return null;
    }
    var sourceStoredName = normalizeTextInputValue(source.storedName || '');
    var sourceOriginalName = normalizeTextInputValue(source.originalName || '');
    var sourceUrl = normalizeTextInputValue(source.url || '');
    var sourceUrlFile = sourceUrl ? normalizeTextInputValue(sourceUrl.split('/').pop() || '') : '';
    for (var i = 0; i < documentData.files.length; i += 1) {
      var candidate = documentData.files[i];
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      var storedName = normalizeTextInputValue(candidate.storedName || '');
      var originalName = normalizeTextInputValue(candidate.originalName || '');
      var fileUrl = normalizeTextInputValue(candidate.url || '');
      var fileUrlName = fileUrl ? normalizeTextInputValue(fileUrl.split('/').pop() || '') : '';
      if (sourceStoredName && storedName && sourceStoredName === storedName) {
        return candidate;
      }
      if (sourceOriginalName && originalName && sourceOriginalName === originalName) {
        return candidate;
      }
      if (sourceUrlFile && fileUrlName && sourceUrlFile === fileUrlName) {
        return candidate;
      }
    }
    return null;
  }

  function persistDocumentFileAiBrief(documentData, source, briefText) {
    var nextBrief = formatAiBriefForStorage(briefText || '');
    if (!documentData || !documentData.id || !nextBrief || !state.organization) {
      return Promise.resolve(false);
    }
    var matchedFile = findDocumentFileForAiBrief(documentData, source);
    var fileStoredName = normalizeTextInputValue(
      (source && source.storedName) || (matchedFile && matchedFile.storedName) || ''
    );
    var fileOriginalName = normalizeTextInputValue(
      (source && source.originalName) || (matchedFile && matchedFile.originalName) || ''
    );
    var fileUrl = normalizeTextInputValue(
      (source && source.url) || (matchedFile && matchedFile.url) || ''
    );
    if (!fileStoredName && !fileOriginalName && !fileUrl) {
      return Promise.resolve(false);
    }

    if (matchedFile) {
      matchedFile.aiBrief = nextBrief;
    }

    var payload = {
      action: 'mini_app_update_task',
      organization: state.organization,
      documentId: documentData.id,
      updateType: 'file_brief',
      aiBrief: nextBrief,
      fileStoredName: fileStoredName,
      fileOriginalName: fileOriginalName,
      fileUrl: fileUrl
    };
    mergeTelegramUserId(payload);

    return fetch(buildApiUrl('mini_app_update_task', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        updateStateFromPayload(data);
        return true;
      });
  }

  function extractAiBriefFromPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }
    var text = normalizeAiBriefText(payload.summary || '');
    if (!text) {
      text = normalizeAiBriefText(extractPlainAiBriefText(payload));
    }
    return normalizeAiBriefText(text);
  }

  async function requestPrivateAiBriefForSource(source) {
    var sourceLabel = source && source.label ? String(source.label) : 'document';
    var preparedFile = source && source.fileObject instanceof File ? source.fileObject : null;
    if (!preparedFile && source && source.url) {
      var fileResponse = await fetch(String(source.url), {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!fileResponse.ok) {
        throw new Error('Не удалось загрузить файл для анализа (' + fileResponse.status + ').');
      }
      var fileBlob = await fileResponse.blob();
      var fileName = ensureUploadFileName(sourceLabel, fileBlob.type, 'document');
      preparedFile = new File([fileBlob], fileName, { type: fileBlob.type || 'application/octet-stream' });
    }
    if (!(preparedFile instanceof File)) {
      throw new Error('Не удалось подготовить файл для «Кратко ИИ».');
    }

    var formData = new FormData();
    formData.append('action', 'ai_brief_generate');
    formData.append('organization', state.organization || '');
    formData.append('file', preparedFile, ensureUploadFileName(preparedFile.name, preparedFile.type, sourceLabel));
    appendTelegramUserIdToFormData(formData);

    var response = await fetch(buildApiUrl('ai_brief_generate'), {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    var payload = await response.json().catch(function() { return null; });
    if (!response.ok || !payload || payload.success !== true) {
      throw new Error(payload && (payload.error || payload.message)
        ? String(payload.error || payload.message)
        : 'Не удалось получить «Кратко ИИ» (' + response.status + ').');
    }
    var summary = normalizeAiBriefText(payload.summary || '');
    if (!summary) {
      throw new Error('ИИ вернул пустой краткий вывод.');
    }

    return {
      summary: summary,
      model: normalizeTextInputValue(payload.model || ''),
      provider: normalizeTextInputValue(payload.provider || ''),
      ocrEngine: 'private'
    };
  }

  function inferUploadExtensionFromType(type) {
    var normalized = String(type || '').toLowerCase();
    if (normalized.indexOf('pdf') >= 0) return 'pdf';
    if (normalized.indexOf('jpeg') >= 0 || normalized.indexOf('jpg') >= 0) return 'jpg';
    if (normalized.indexOf('png') >= 0) return 'png';
    if (normalized.indexOf('webp') >= 0) return 'webp';
    if (normalized.indexOf('gif') >= 0) return 'gif';
    if (normalized.indexOf('bmp') >= 0) return 'bmp';
    if (normalized.indexOf('tiff') >= 0 || normalized.indexOf('tif') >= 0) return 'tiff';
    if (normalized.indexOf('wordprocessingml.document') >= 0) return 'docx';
    if (normalized.indexOf('text/plain') >= 0) return 'txt';
    return '';
  }

  function ensureUploadFileName(name, type, fallbackBase) {
    var base = String(name || fallbackBase || 'document').trim() || 'document';
    if (/\.[a-z0-9]{2,8}$/i.test(base)) {
      return base;
    }
    var ext = inferUploadExtensionFromType(type);
    return ext ? (base + '.' + ext) : base;
  }

  function openAiBriefSummaryModal(config) {
    var options = config && typeof config === 'object' ? config : {};
    openAiConclusionModal(options);
    return Promise.resolve(true);
  }


  function openAiConclusionModal(config) {
    ensureResponsesStyle();
    var options = config && typeof config === 'object' ? config : {};
    var linkedFiles = Array.isArray(options.linkedFiles) ? options.linkedFiles : [];
    var pendingFiles = Array.isArray(options.pendingFiles) ? options.pendingFiles : [];
    var showStatusMessage = typeof options.showMessage === 'function' ? options.showMessage : function() {};
    var modal = createElement('div', 'documents-brief-modal');
    var panel = createElement('div', 'documents-brief-panel');
    var header = createElement('div', 'documents-brief-header');
    var titleWrap = createElement('div', '');
    titleWrap.appendChild(createElement('div', 'documents-brief-title', 'Вывод'));
    titleWrap.appendChild(createElement('div', 'documents-brief-subtitle', 'Файл обрабатывается приватным OCR, затем выбранной администратором ИИ-моделью.'));
    var closeButton = createElement('button', 'documents-button documents-button--secondary', 'Закрыть');
    var body = createElement('div', 'documents-brief-body');
    var list = createElement('div', 'documents-brief-list');
    var preview = createElement('pre', 'documents-brief-preview documents-conclusion-preview', 'Выберите файл из задачи или новый файл.');
    var metaCompact = createElement('div', 'documents-conclusion-meta', 'Выберите файл для анализа.');

    var sources = [];
    linkedFiles.forEach(function(file, index) {
      sources.push({
        id: 'linked_' + index,
        label: file && file.name ? String(file.name) : ('Файл ' + (index + 1)),
        url: file && file.url ? String(file.url) : '',
        storedName: file && file.storedName ? String(file.storedName) : '',
        originalName: file && file.originalName ? String(file.originalName) : '',
        aiBrief: file && file.aiBrief ? String(file.aiBrief) : ''
      });
    });
    pendingFiles.forEach(function(file, index) {
      sources.push({
        id: 'pending_' + index,
        label: file && file.name ? String(file.name) : ('Новый файл ' + (index + 1)),
        fileObject: file
      });
    });

    function setActive(button) {
      Array.from(list.querySelectorAll('.documents-brief-item')).forEach(function(item) {
        item.classList.remove('is-active');
      });
      if (button) {
        button.classList.add('is-active');
      }
    }

    function addSourceButton(source) {
      var button = createElement('button', 'documents-brief-item');
      button.type = 'button';
      button.appendChild(createElement('span', 'documents-brief-item-name', source.label));
      button.appendChild(createElement('span', 'documents-brief-item-meta', source.fileObject ? 'Новый файл (локально)' : 'Файл из задачи'));
      button.addEventListener('click', function() {
        setActive(button);
        button.disabled = true;
        preview.classList.add('is-loading');
        preview.textContent = '⏳ Приватный OCR распознаёт файл, затем ИИ формирует краткий вывод...';
        metaCompact.textContent = 'Обработка на приватном сервере...';
        var startedAt = Date.now();
        requestPrivateAiBriefForSource(source)
          .then(function(aiPayload) {
            var summaryText = normalizeAiBriefText(aiPayload && aiPayload.summary ? aiPayload.summary : '');
            if (!summaryText) {
              throw new Error('ИИ вернул пустой краткий вывод.');
            }
            preview.classList.remove('is-loading');
            preview.textContent = summaryText;
            source.aiBrief = summaryText;
            metaCompact.textContent = 'Готово за ' + ((Date.now() - startedAt) / 1000).toFixed(1)
              + ' сек • Модель: ' + String(aiPayload.model || '—') + ' • OCR: приватный сервер';
            if (typeof options.onBriefReady === 'function') {
              return Promise.resolve(options.onBriefReady(source, summaryText)).catch(function(error) {
                showStatusMessage('warning', 'Краткий вывод получен, но не сохранён: '
                  + (error && error.message ? error.message : 'ошибка сохранения'));
              });
            }
            return null;
          })
          .catch(function(error) {
            preview.classList.remove('is-loading');
            preview.textContent = 'Ошибка: ' + (error && error.message ? error.message : 'неизвестная ошибка');
            metaCompact.textContent = 'Анализ не выполнен.';
            showStatusMessage('warning', 'Не удалось получить «Кратко ИИ» для файла «' + source.label + '».');
          })
          .finally(function() {
            button.disabled = false;
          });
      });
      list.appendChild(button);
    }

    sources.forEach(addSourceButton);
    if (!sources.length) {
      list.appendChild(createElement('div', 'documents-responses-empty', 'Нет файлов для анализа.'));
    }

    closeButton.type = 'button';
    closeButton.addEventListener('click', function() { closeModal(modal); });
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeModal(modal);
      }
    });

    header.appendChild(titleWrap);
    header.appendChild(closeButton);
    panel.appendChild(header);
    panel.appendChild(metaCompact);
    body.appendChild(list);
    body.appendChild(preview);
    panel.appendChild(body);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }


  function ensureSearchStyles() {
    if (document.getElementById('documents-search-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-search-style';
    style.textContent = '' +
      '.documents-table__head th{' +
      'position:sticky;' +
      'top:var(--documents-sticky-top,0px);' +
      'z-index:6;' +
      '}' +
      '.documents-table__header-row th{' +
      'z-index:5;' +
      '}' +
      '.documents-table__header-cell{' +
      'position:relative;' +
      'vertical-align:middle;' +
      '}' +
      '.documents-header-content{' +
      'display:grid;' +
      'grid-template-columns:minmax(24px,1fr) max-content;' +
      'align-items:start;' +
      'justify-content:stretch;' +
      'width:100%;' +
      'min-width:0;' +
      'gap:3px 5px;' +
      'overflow:hidden;' +
      '}' +
      '.documents-table__header-cell .documents-header-label{' +
      'display:block;' +
      'font-weight:600;' +
      'color:#0f172a;' +
      'line-height:1.35;' +
      'word-break:normal;' +
      'overflow-wrap:normal;' +
      'hyphens:none;' +
      'min-width:0;' +
      'max-width:100%;' +
      'transition:color 0.2s ease;' +
      '}' +
      '.documents-table__header-cell--searchable{' +
      'cursor:pointer;' +
      'user-select:none;' +
      'border-radius:0;' +
      'transition:background-color 0.2s ease;' +
      '}' +
      '.documents-table__header-cell--searchable:hover{' +
      'background:rgba(37,99,235,0.08);' +
      '}' +
      '.documents-table__header-cell--searchable:focus,' +
      '.documents-table__header-cell--searchable:focus-visible{' +
      'outline:2px solid rgba(37,99,235,0.35);' +
      'outline-offset:2px;' +
      '}' +
      '.documents-table__header-cell--searchable:focus:not(:focus-visible){' +
      'outline:none;' +
      '}' +
      '.documents-table__header-cell--active{' +
      'background:rgba(37,99,235,0.12);' +
      '}' +
      '.documents-table__header-cell--active .documents-header-label{' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-column-drag-handle{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'width:20px;' +
      'min-width:20px;' +
      'height:22px;' +
      'border:1px solid rgba(148,163,184,0.35);' +
      'border-radius:8px;' +
      'background:rgba(255,255,255,0.62);' +
      'backdrop-filter:blur(10px);' +
      'font-size:12px;' +
      'font-weight:700;' +
      'line-height:1;' +
      'color:#64748b;' +
      'cursor:grab;' +
      'touch-action:none;' +
      'user-select:none;' +
      'padding:0;' +
      'margin-left:2px;' +
      'flex:0 0 auto;' +
      '}' +
      '.documents-column-drag-handle:active{' +
      'cursor:grabbing;' +
      '}' +
      '.documents-column-drag-ghost{' +
      'position:fixed;' +
      'z-index:4000;' +
      'pointer-events:none;' +
      'padding:8px 10px;' +
      'border-radius:12px;' +
      'background:rgba(255,255,255,0.85);' +
      'border:1px solid rgba(191,219,254,0.95);' +
      'box-shadow:0 12px 24px rgba(15,23,42,0.2);' +
      'backdrop-filter:blur(10px);' +
      'font-size:13px;' +
      'font-weight:700;' +
      'color:#0f172a;' +
      '}' +
      '.documents-column-drop-line{' +
      'position:absolute;' +
      'top:0;' +
      'height:100%;' +
      'width:2px;' +
      'background:linear-gradient(180deg,#38bdf8,#2563eb);' +
      'box-shadow:0 0 0 1px rgba(255,255,255,0.65);' +
      'z-index:15;' +
      'pointer-events:none;' +
      'display:none;' +
      '}' +
      '.documents-search-popover{' +
      'position:fixed;' +
      'z-index:2500;' +
      'right:12px;' +
      'top:12px;' +
      'bottom:12px;' +
      'min-width:300px;' +
      'min-height:260px;' +
      'width:min(380px,calc(100vw - 24px));' +
      'max-width:calc(100vw - 24px);' +
      'max-height:calc(100vh - 24px);' +
      'background:#ffffff;' +
      'border-radius:10px;' +
      'box-shadow:0 18px 42px rgba(15,23,42,0.2);' +
      'border:1px solid rgba(148,163,184,0.38);' +
      'padding:0;' +
      'display:none;' +
      'overflow:hidden;' +
      '}' +
      '.documents-search-popover--visible{' +
      'display:block;' +
      '}' +
      '.documents-search-popover--collapsed{' +
      'min-height:0;' +
      'height:auto;' +
      '}' +
      '.documents-search-popover__content{' +
      'display:flex;' +
      'flex-direction:column;' +
      'height:100%;' +
      'max-height:calc(100vh - 24px);' +
      'box-sizing:border-box;' +
      '}' +
      '.documents-search-popover__titlebar{' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:space-between;' +
      'gap:10px;' +
      'padding:10px 10px 8px;' +
      'border-bottom:1px solid #e2e8f0;' +
      'cursor:move;' +
      'user-select:none;' +
      'touch-action:none;' +
      '}' +
      '.documents-search-popover__label{' +
      'font-weight:800;' +
      'font-size:13px;' +
      'color:#0f172a;' +
      'min-width:0;' +
      'overflow:hidden;' +
      'text-overflow:ellipsis;' +
      'white-space:nowrap;' +
      '}' +
      '.documents-search-popover__window-actions{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:4px;' +
      'flex:0 0 auto;' +
      '}' +
      '.documents-search-popover__window-button{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'width:26px;' +
      'height:26px;' +
      'border:0;' +
      'border-radius:6px;' +
      'background:transparent;' +
      'color:#64748b;' +
      'font-size:16px;' +
      'font-weight:800;' +
      'line-height:1;' +
      'cursor:pointer;' +
      '}' +
      '.documents-search-popover__window-button:hover,.documents-search-popover__window-button:focus-visible{' +
      'background:#eff6ff;' +
      'color:#2563eb;' +
      'outline:none;' +
      '}' +
      '.documents-search-popover__body{' +
      'display:flex;' +
      'flex:1 1 auto;' +
      'min-height:0;' +
      'flex-direction:column;' +
      'gap:8px;' +
      'padding:10px;' +
      'box-sizing:border-box;' +
      '}' +
      '.documents-search-popover--collapsed .documents-search-popover__body,' +
      '.documents-search-popover--collapsed .documents-search-popover__resize{' +
      'display:none;' +
      '}' +
      '.documents-search-popover__sort{' +
      'display:flex;' +
      'flex-direction:column;' +
      'gap:2px;' +
      'padding-bottom:8px;' +
      'border-bottom:1px solid #e2e8f0;' +
      '}' +
      '.documents-search-popover__sort-button{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:9px;' +
      'width:100%;' +
      'min-height:34px;' +
      'padding:7px 8px;' +
      'border:0;' +
      'border-radius:6px;' +
      'background:transparent;' +
      'color:#172554;' +
      'font-size:13px;' +
      'font-weight:700;' +
      'text-align:left;' +
      'cursor:pointer;' +
      '}' +
      '.documents-search-popover__sort-button:hover,.documents-search-popover__sort-button:focus-visible{' +
      'background:#f8fafc;' +
      'outline:none;' +
      '}' +
      '.documents-search-popover__sort-button.is-active{' +
      'background:#eff6ff;' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-search-popover__sort-button:disabled{' +
      'opacity:.45;' +
      'cursor:default;' +
      'background:transparent;' +
      '}' +
      '.documents-search-popover__sort-icon{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'width:20px;' +
      'min-width:20px;' +
      'font-size:15px;' +
      'line-height:1;' +
      'color:inherit;' +
      '}' +
      '.documents-search-popover__input{' +
      'width:100%;' +
      'height:36px;' +
      'box-sizing:border-box;' +
      'padding:0 10px;' +
      'border-radius:6px;' +
      'border:1px solid rgba(148,163,184,0.45);' +
      'background:rgba(248,250,252,0.85);' +
      'font-size:13px;' +
      'transition:border-color 0.2s ease, box-shadow 0.2s ease;' +
      '}' +
      '.documents-search-popover__input:focus{' +
      'outline:none;' +
      'border-color:#2563eb;' +
      'box-shadow:0 0 0 3px rgba(37,99,235,0.2);' +
      'background:#ffffff;' +
      '}' +
      '.documents-search-popover__actions{' +
      'display:flex;' +
      'justify-content:flex-end;' +
      'gap:8px;' +
      'padding-top:8px;' +
      'border-top:1px solid #e2e8f0;' +
      '}' +
      '.documents-search-popover__summary{' +
      'font-size:12px;' +
      'line-height:1.35;' +
      'color:#64748b;' +
      '}' +
      '.documents-search-popover__progress{' +
      'display:none;' +
      'gap:6px;' +
      'flex-direction:column;' +
      '}' +
      '.documents-search-popover__progress.is-visible{' +
      'display:flex;' +
      '}' +
      '.documents-search-popover__progress-track{' +
      'height:6px;' +
      'overflow:hidden;' +
      'border-radius:999px;' +
      'background:#e2e8f0;' +
      '}' +
      '.documents-search-popover__progress-bar{' +
      'display:block;' +
      'width:0%;' +
      'height:100%;' +
      'border-radius:inherit;' +
      'background:#2563eb;' +
      'transition:width .16s ease;' +
      '}' +
      '.documents-search-popover__progress-label{' +
      'font-size:11px;' +
      'line-height:1.3;' +
      'color:#64748b;' +
      'font-weight:700;' +
      '}' +
      '.documents-search-popover__check--all{' +
      'flex:0 0 auto;' +
      'margin:0 0 2px;' +
      'background:#f8fafc;' +
      '}' +
      '.documents-search-popover__checks{' +
      'display:block;' +
      'position:relative;' +
      'flex:1 1 auto;' +
      'max-height:none;' +
      'min-height:110px;' +
      'overflow:auto;' +
      'padding:4px;' +
      'border:1px solid rgba(226,232,240,0.95);' +
      'border-radius:6px;' +
      'background:#ffffff;' +
      'scrollbar-width:thin;' +
      '}' +
      '.documents-search-popover__virtual{' +
      'position:relative;' +
      'min-height:100%;' +
      '}' +
      '.documents-search-popover__option{' +
      'position:absolute;' +
      'left:0;' +
      'right:0;' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:space-between;' +
      'gap:10px;' +
      'height:32px;' +
      'padding:0 8px;' +
      'border:0;' +
      'border-radius:5px;' +
      'background:transparent;' +
      'color:#172554;' +
      'font-size:13px;' +
      'line-height:1.25;' +
      'text-align:left;' +
      'cursor:pointer;' +
      'box-sizing:border-box;' +
      '}' +
      '.documents-search-popover__option:hover,.documents-search-popover__option:focus-visible{' +
      'background:#eff6ff;' +
      'color:#1d4ed8;' +
      'outline:none;' +
      '}' +
      '.documents-search-popover__option.is-active{' +
      'background:#dbeafe;' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-search-popover__option-label{' +
      'min-width:0;' +
      'overflow:hidden;' +
      'text-overflow:ellipsis;' +
      'white-space:nowrap;' +
      '}' +
      '.documents-search-popover__option-count{' +
      'flex:0 0 auto;' +
      'color:#64748b;' +
      'font-size:12px;' +
      'font-weight:800;' +
      'font-variant-numeric:tabular-nums;' +
      '}' +
      '.documents-search-popover__check{' +
      'display:flex;' +
      'align-items:flex-start;' +
      'gap:8px;' +
      'padding:5px 6px;' +
      'border-radius:5px;' +
      'font-size:13px;' +
      'line-height:1.35;' +
      'color:#172554;' +
      'cursor:pointer;' +
      '}' +
      '.documents-search-popover__check:hover{' +
      'background:#ffffff;' +
      '}' +
      '.documents-search-popover__check--all{' +
      'font-weight:800;' +
      'border-bottom:1px solid #eef2f7;' +
      'border-radius:5px 5px 0 0;' +
      '}' +
      '.documents-search-popover__check input{' +
      'margin:1px 0 0;' +
      'accent-color:#2563eb;' +
      'flex:0 0 auto;' +
      '}' +
      '.documents-search-popover__check span{' +
      'min-width:0;' +
      'overflow-wrap:anywhere;' +
      '}' +
      '.documents-search-popover__loading{' +
      'padding:12px 8px;' +
      'font-size:13px;' +
      'line-height:1.4;' +
      'color:#64748b;' +
      '}' +
      '.documents-search-popover__tools{' +
      'display:flex;' +
      'gap:8px;' +
      '}' +
      '.documents-search-popover__tool{' +
      'flex:1 1 auto;' +
      'height:30px;' +
      'border:1px solid rgba(148,163,184,0.35);' +
      'border-radius:8px;' +
      'background:#ffffff;' +
      'color:#2563eb;' +
      'font-size:12px;' +
      'font-weight:700;' +
      'cursor:pointer;' +
      '}' +
      '.documents-search-popover__tool:hover,.documents-search-popover__tool:focus-visible{' +
      'background:#eff6ff;' +
      'outline:none;' +
      '}' +
      '.documents-search-popover__tool--danger{' +
      'color:#dc2626;' +
      '}' +
      '.documents-search-popover__resize{' +
      'position:absolute;' +
      'right:0;' +
      'bottom:0;' +
      'width:18px;' +
      'height:18px;' +
      'cursor:nwse-resize;' +
      'touch-action:none;' +
      '}' +
      '.documents-search-popover__resize::after{' +
      'content:"";' +
      'position:absolute;' +
      'right:4px;' +
      'bottom:4px;' +
      'width:9px;' +
      'height:9px;' +
      'border-right:2px solid #94a3b8;' +
      'border-bottom:2px solid #94a3b8;' +
      '}' +
      '.documents-search-popover__button{' +
      'flex:0 0 auto;' +
      'min-width:76px;' +
      'height:34px;' +
      'padding:0 12px;' +
      'border-radius:6px;' +
      'font-weight:700;' +
      'font-size:13px;' +
      'cursor:pointer;' +
      'border:1px solid rgba(148,163,184,0.45);' +
      'transition:box-shadow 0.2s ease, background 0.2s ease,border-color 0.2s ease;' +
      '}' +
      '.documents-search-popover__button--apply{' +
      'background:#2563eb;' +
      'border-color:#2563eb;' +
      'color:#ffffff;' +
      '}' +
      '.documents-search-popover__button--reset{' +
      'background:#ffffff;' +
      'color:#1e293b;' +
      '}' +
      '.documents-search-popover__button--clear{' +
      'background:#fff;' +
      'color:#b91c1c;' +
      '}' +
      '.documents-search-popover__button:hover{' +
      'box-shadow:0 6px 16px rgba(15,23,42,.12);' +
      '}' +
      '.documents-filter-bar{' +
      'display:flex;' +
      'flex-wrap:wrap;' +
      'gap:10px;' +
      'align-items:center;' +
      'margin:18px 0 12px;' +
      'padding:12px 16px;' +
      'background:rgba(37,99,235,0.08);' +
      'border-radius:16px;' +
      'border:1px solid rgba(59,130,246,0.22);' +
      'color:#0f172a;' +
      '}' +
      '.documents-filter-bar--hidden{' +
      'display:none;' +
      '}' +
      '.documents-filter-bar__title{' +
      'font-weight:600;' +
      'font-size:13px;' +
      '}' +
      '.documents-filter-chip{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:6px;' +
      'padding:6px 14px;' +
      'background:#ffffff;' +
      'border-radius:999px;' +
      'border:1px solid rgba(59,130,246,0.35);' +
      'box-shadow:0 10px 20px rgba(37,99,235,0.18);' +
      'font-size:13px;' +
      '}' +
      '.documents-filter-chip__value{' +
      'font-weight:600;' +
      '}' +
      '.documents-filter-chip__remove{' +
      'border:none;' +
      'background:transparent;' +
      'color:#1d4ed8;' +
      'cursor:pointer;' +
      'font-size:16px;' +
      'line-height:1;' +
      'padding:0 4px;' +
      '}' +
      '.documents-filter-chip__remove:hover{' +
      'color:#1e3a8a;' +
      '}' +
      '.documents-filter-chip--responsible{' +
      'border-color:rgba(16,185,129,0.42);' +
      'box-shadow:0 10px 22px rgba(16,185,129,0.22);' +
      '}' +
      '.documents-filter-chip--responsible .documents-filter-chip__value{' +
      'color:#047857;' +
      '}' +
      '.documents-filter-chip--warning{' +
      'border-color:rgba(245,158,11,0.42);' +
      'box-shadow:0 10px 22px rgba(245,158,11,0.18);' +
      '}' +
      '.documents-filter-chip--warning .documents-filter-chip__value{' +
      'color:#92400e;' +
      '}' +
      '.documents-filter-chip--muted{' +
      'border-color:rgba(148,163,184,0.45);' +
      'box-shadow:0 10px 22px rgba(100,116,139,0.14);' +
      '}' +
      '.documents-filter-chip--muted .documents-filter-chip__value{' +
      'color:#334155;' +
      '}' +
      '.documents-filter-bar__clear{' +
      'border:none;' +
      'border-radius:999px;' +
      'padding:8px 18px;' +
      'font-weight:600;' +
      'font-size:13px;' +
      'cursor:pointer;' +
      'margin-left:12px;' +
      'background:linear-gradient(120deg, rgba(59,130,246,0.95), rgba(14,165,233,0.9));' +
      'color:#ffffff;' +
      'box-shadow:0 16px 32px rgba(37,99,235,0.28);' +
      '}' +
      '.documents-filter-bar__clear:hover{' +
      'transform:translateY(-1px);' +
      '}' +
      '.documents-filter-bar__clear:disabled{' +
      'opacity:.55;' +
      'cursor:default;' +
      'transform:none;' +
      'box-shadow:none;' +
      '}' +
      '.documents-filter-bar__hint{' +
      'color:#64748b;' +
      'font-size:12px;' +
      'font-weight:600;' +
      '}' +
      '.documents-tabs{' +
      'display:flex;' +
      'align-items:flex-end;' +
      'gap:8px;' +
      'margin:14px 0 0;' +
      'padding:0 2px;' +
      'border-bottom:1px solid rgba(148,163,184,0.34);' +
      'overflow-x:auto;' +
      'scrollbar-width:thin;' +
      '}' +
      '.documents-tabs__list{' +
      'display:flex;' +
      'align-items:flex-end;' +
      'gap:6px;' +
      'min-width:0;' +
      '}' +
      '.documents-tab-shell{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'position:relative;' +
      'flex:0 0 auto;' +
      '}' +
      '.documents-tab{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'gap:8px;' +
      'max-width:260px;' +
      'min-height:38px;' +
      'padding:8px 12px 9px;' +
      'border:1px solid rgba(148,163,184,0.38);' +
      'border-bottom:none;' +
      'border-radius:12px 12px 0 0;' +
      'background:rgba(248,250,252,0.82);' +
      'color:#334155;' +
      'font-size:13px;' +
      'font-weight:700;' +
      'line-height:1.2;' +
      'white-space:nowrap;' +
      'cursor:pointer;' +
      'transition:background 0.2s ease,color 0.2s ease,box-shadow 0.2s ease,transform 0.2s ease;' +
      '}' +
      '.documents-tab:hover,.documents-tab:focus-visible{' +
      'background:#ffffff;' +
      'color:#1d4ed8;' +
      'outline:none;' +
      'box-shadow:0 10px 24px rgba(37,99,235,0.13);' +
      '}' +
      '.documents-tab.is-active{' +
      'background:#ffffff;' +
      'color:#1d4ed8;' +
      'border-color:rgba(37,99,235,0.38);' +
      'box-shadow:0 -1px 0 #ffffff inset,0 10px 24px rgba(37,99,235,0.12);' +
      'transform:translateY(1px);' +
      '}' +
      '.documents-tab__label{' +
      'display:block;' +
      'min-width:0;' +
      'overflow:hidden;' +
      'text-overflow:ellipsis;' +
      '}' +
      '.documents-tab__count{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'min-width:22px;' +
      'min-height:22px;' +
      'padding:2px 7px;' +
      'border-radius:999px;' +
      'background:rgba(148,163,184,0.18);' +
      'color:#475569;' +
      'font-size:12px;' +
      'font-weight:800;' +
      'font-variant-numeric:tabular-nums;' +
      '}' +
      '.documents-tab.is-active .documents-tab__count{' +
      'background:rgba(37,99,235,0.12);' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-tab-shell--custom .documents-tab{' +
      'padding-right:34px;' +
      '}' +
      '.documents-tab__close{' +
      'position:absolute;' +
      'right:7px;' +
      'top:8px;' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'width:22px;' +
      'height:22px;' +
      'border:0;' +
      'border-radius:999px;' +
      'background:transparent;' +
      'color:#64748b;' +
      'font-size:17px;' +
      'line-height:1;' +
      'cursor:pointer;' +
      '}' +
      '.documents-tab__close:hover,.documents-tab__close:focus-visible{' +
      'background:rgba(239,68,68,0.12);' +
      'color:#dc2626;' +
      'outline:none;' +
      '}' +
      '.documents-tabs__add{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'flex:0 0 auto;' +
      'width:36px;' +
      'height:36px;' +
      'margin-bottom:1px;' +
      'border:1px solid rgba(148,163,184,0.38);' +
      'border-bottom:none;' +
      'border-radius:12px 12px 0 0;' +
      'background:rgba(255,255,255,0.78);' +
      'color:#2563eb;' +
      'font-size:22px;' +
      'font-weight:700;' +
      'line-height:1;' +
      'cursor:pointer;' +
      'transition:background 0.2s ease,box-shadow 0.2s ease,transform 0.2s ease;' +
      '}' +
      '.documents-tabs__add:hover,.documents-tabs__add:focus-visible{' +
      'background:#ffffff;' +
      'outline:none;' +
      'box-shadow:0 10px 24px rgba(37,99,235,0.14);' +
      'transform:translateY(-1px);' +
      '}' +
      '.documents-filter-chip--tab{' +
      'border-color:rgba(37,99,235,0.42);' +
      'box-shadow:0 10px 22px rgba(37,99,235,0.18);' +
      '}' +
      '.documents-filter-chip--tab .documents-filter-chip__value{' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-cell--highlight{' +
      'background:rgba(59,130,246,0.12);' +
      'box-shadow:inset 0 0 0 2px rgba(37,99,235,0.25);' +
      '}' +
      '.documents-panel__admin--responsible{' +
      'position:relative;' +
      'margin-right:12px;' +
      'background:linear-gradient(120deg, rgba(16,185,129,0.95), rgba(34,197,94,0.88));' +
      'box-shadow:0 14px 28px rgba(16,185,129,0.28);' +
      '}' +
      '.documents-panel__admin--toggled{' +
      'transform:translateY(-1px);' +
      'box-shadow:0 18px 36px rgba(16,185,129,0.35);' +
      '}' +
      '.documents-panel__admin--toggled::after{' +
      'content:"";' +
      'position:absolute;' +
      'inset:-3px;' +
      'border-radius:inherit;' +
      'border:1px solid rgba(16,185,129,0.45);' +
      'opacity:0.7;' +
      'pointer-events:none;' +
      '}' +
      '.documents-panel__admin--responsible:disabled{' +
      'opacity:0.55;' +
      'cursor:default;' +
      'box-shadow:none;' +
      '}' +
      '.documents-search-popover__button--reset:hover{' +
      'background:rgba(148,163,184,0.28);' +
      '}' +
      '.documents-filter-bar__hint{' +
      'margin-left:auto;' +
      'font-size:12px;' +
      'opacity:0.75;' +
      'font-weight:500;' +
      '}' +
      '.documents-actions{' +
      'display:flex;' +
      'flex-direction:column;' +
      'align-items:flex-start;' +
      'width:100%;' +
      'position:relative;' +
      '}' +
      '.documents-actions__toggle{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'min-height:34px;' +
      'padding:8px 12px;' +
      'border:1px solid rgba(148,163,184,0.45);' +
      'border-radius:12px;' +
      'background:rgba(255,255,255,0.72);' +
      'backdrop-filter:blur(10px);' +
      '-webkit-backdrop-filter:blur(10px);' +
      'color:#0f172a;' +
      'font-size:13px;' +
      'font-weight:600;' +
      'cursor:pointer;' +
      'transition:all 0.2s ease;' +
      '}' +
      '.documents-actions__toggle:hover{' +
      'border-color:rgba(59,130,246,0.45);' +
      'box-shadow:0 8px 18px rgba(59,130,246,0.18);' +
      '}' +
      '.documents-actions__toggle[aria-expanded="true"]{' +
      'border-color:rgba(59,130,246,0.55);' +
      'background:rgba(239,246,255,0.92);' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-actions__panel{' +
      'display:none;' +
      'position:relative;' +
      'z-index:1;' +
      'width:100%;' +
      'margin-top:8px;' +
      'padding:8px;' +
      'border-radius:14px;' +
      'border:1px solid rgba(148,163,184,0.3);' +
      'background:rgba(255,255,255,0.88);' +
      'backdrop-filter:blur(14px);' +
      '-webkit-backdrop-filter:blur(14px);' +
      'box-shadow:0 20px 36px rgba(15,23,42,0.15);' +
      'display:flex;' +
      'flex-wrap:wrap;' +
      'align-items:center;' +
      'align-content:flex-start;' +
      'row-gap:8px;' +
      'column-gap:8px;' +
      'gap:8px;' +
      '}' +
      '.documents-actions__panel--open{' +
      'display:flex;' +
      '}' +
      '.documents-column-resize-handle{' +
      'position:absolute;' +
      'top:0;' +
      'right:-4px;' +
      'width:8px;' +
      'height:100%;' +
      'cursor:col-resize;' +
      'touch-action:none;' +
      'z-index:20;' +
      '}' +
      '.documents-column-resize-handle::after{' +
      'content:"";' +
      'position:absolute;' +
      'top:10px;' +
      'bottom:10px;' +
      'left:3px;' +
      'width:2px;' +
      'border-radius:2px;' +
      'background:transparent;' +
      '}' +
      '.documents-column-resize-handle:hover::after,.documents-column-resize-handle.is-resizing::after{' +
      'background:#2563eb;' +
      '}' +
      '.documents-column-width-popover{' +
      'position:fixed;' +
      'z-index:2700;' +
      'width:220px;' +
      'box-sizing:border-box;' +
      'padding:10px;' +
      'border:1px solid rgba(148,163,184,0.35);' +
      'border-radius:10px;' +
      'background:#ffffff;' +
      'box-shadow:0 18px 42px rgba(15,23,42,0.18);' +
      'color:#172554;' +
      '}' +
      '.documents-column-width-popover__title{' +
      'font-size:12px;' +
      'font-weight:800;' +
      'line-height:1.35;' +
      'color:#0f172a;' +
      'margin-bottom:8px;' +
      '}' +
      '.documents-column-width-popover__field{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:8px;' +
      '}' +
      '.documents-column-width-popover__input{' +
      'width:100%;' +
      'height:34px;' +
      'box-sizing:border-box;' +
      'padding:0 8px;' +
      'border:1px solid #cbd5e1;' +
      'border-radius:6px;' +
      'background:#fff;' +
      'color:#172554;' +
      'font-size:13px;' +
      'font-weight:700;' +
      'outline:none;' +
      '}' +
      '.documents-column-width-popover__input:focus{' +
      'border-color:#2563eb;' +
      'box-shadow:0 0 0 3px rgba(37,99,235,0.12);' +
      '}' +
      '.documents-column-width-popover__unit{' +
      'font-size:12px;' +
      'font-weight:700;' +
      'color:#64748b;' +
      '}' +
      '.documents-column-width-popover__actions{' +
      'display:flex;' +
      'justify-content:flex-end;' +
      'gap:8px;' +
      'margin-top:10px;' +
      '}' +
      '.documents-column-width-popover__button{' +
      'height:30px;' +
      'padding:0 10px;' +
      'border:1px solid #cbd5e1;' +
      'border-radius:6px;' +
      'background:#fff;' +
      'color:#172554;' +
      'font-size:12px;' +
      'font-weight:800;' +
      'cursor:pointer;' +
      '}' +
      '.documents-column-width-popover__button:hover,.documents-column-width-popover__button:focus-visible{' +
      'background:#f8fafc;' +
      'outline:none;' +
      '}' +
      '.documents-column-width-popover__button--apply{' +
      'border-color:#2563eb;' +
      'background:#2563eb;' +
      'color:#fff;' +
      '}' +
      '.documents-column-width-popover__button--apply:hover,.documents-column-width-popover__button--apply:focus-visible{' +
      'background:#1d4ed8;' +
      '}' +
      '.documents-columns-menu{' +
      'position:fixed;' +
      'z-index:2600;' +
      'display:none;' +
      'width:min(320px,calc(100vw - 24px));' +
      'max-height:min(70vh,520px);' +
      'padding:12px;' +
      'border:1px solid rgba(148,163,184,0.3);' +
      'border-radius:14px;' +
      'background:#ffffff;' +
      'box-shadow:0 22px 48px rgba(15,23,42,0.18);' +
      'overflow:auto;' +
      '}' +
      '.documents-columns-menu--visible{' +
      'display:block;' +
      '}' +
      '.documents-columns-menu__title{' +
      'font-size:13px;' +
      'font-weight:800;' +
      'color:#0f172a;' +
      'margin-bottom:8px;' +
      '}' +
      '.documents-columns-menu__list{' +
      'display:flex;' +
      'flex-direction:column;' +
      'gap:4px;' +
      '}' +
      '.documents-columns-menu__item{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:8px;' +
      'padding:7px 8px;' +
      'border-radius:8px;' +
      'font-size:13px;' +
      'color:#172554;' +
      'cursor:pointer;' +
      '}' +
      '.documents-columns-menu__item:hover{' +
      'background:#f8fafc;' +
      '}' +
      '.documents-columns-menu__item input{' +
      'accent-color:#2563eb;' +
      '}' +
      '.documents-columns-button{' +
      '}' +
      '.documents-table-tool{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'gap:8px;' +
      'height:38px;' +
      'padding:0 12px;' +
      'border:1px solid #e2e8f0;' +
      'border-radius:6px;' +
      'background:#fff;' +
      'color:#172554;' +
      'font-size:13px;' +
      'font-weight:700;' +
      'cursor:pointer;' +
      '}' +
      '.documents-table-tool:hover,.documents-table-tool:focus-visible{' +
      'background:#f8fafc;' +
      'border-color:#bfdbfe;' +
      'outline:none;' +
      '}' +
      '.documents-table-tool.is-active,.documents-table-tool[aria-pressed="true"]{' +
      'background:#eff6ff;' +
      'border-color:#93c5fd;' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-table-tool--menu{' +
      'padding-right:9px;' +
      '}' +
      '.documents-table-tool__chevron{' +
      'width:14px;' +
      'height:14px;' +
      'color:#64748b;' +
      '}' +
      '.documents-table-tool__label{' +
      'white-space:nowrap;' +
      '}' +
      '.documents-table-tool__badge{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'min-height:20px;' +
      'padding:1px 7px;' +
      'border-radius:999px;' +
      'background:#e0f2fe;' +
      'color:#0369a1;' +
      'font-size:11px;' +
      'font-weight:800;' +
      'line-height:1;' +
      '}' +
      '.documents-table-tool__badge[hidden]{display:none;}' +
      '.documents-table-tools{' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:flex-end;' +
      'gap:10px;' +
      'flex:0 0 auto;' +
      'flex-wrap:wrap;' +
      'min-width:0;' +
      '}' +
      '.documents-toolbar-menu{' +
      'position:fixed;' +
      'z-index:2650;' +
      'display:none;' +
      'width:min(300px,calc(100vw - 24px));' +
      'padding:8px;' +
      'border:1px solid rgba(148,163,184,0.3);' +
      'border-radius:14px;' +
      'background:#ffffff;' +
      'box-shadow:0 22px 48px rgba(15,23,42,0.18);' +
      '}' +
      '.documents-toolbar-menu--visible{' +
      'display:flex;' +
      'flex-direction:column;' +
      'gap:4px;' +
      '}' +
      '.documents-toolbar-menu__item{' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:space-between;' +
      'gap:10px;' +
      'width:100%;' +
      'min-height:34px;' +
      'padding:7px 9px;' +
      'border:0;' +
      'border-radius:8px;' +
      'background:transparent;' +
      'color:#172554;' +
      'font-size:13px;' +
      'font-weight:700;' +
      'text-align:left;' +
      'cursor:pointer;' +
      '}' +
      '.documents-toolbar-menu__item:hover,.documents-toolbar-menu__item:focus-visible{' +
      'background:#f8fafc;' +
      'outline:none;' +
      '}' +
      '.documents-toolbar-menu__item.is-active{' +
      'background:#eff6ff;' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-toolbar-menu__item:disabled{' +
      'color:#94a3b8;' +
      'cursor:default;' +
      'background:transparent;' +
      '}' +
      '.documents-toolbar-menu__note{' +
      'padding:7px 9px 5px;' +
      'font-size:12px;' +
      'line-height:1.35;' +
      'color:#64748b;' +
      '}' +
      '.documents-actions--icons{' +
      'display:flex;' +
      'align-items:center;' +
      'flex-direction:row;' +
      'gap:4px;' +
      'width:auto;' +
      'min-width:0;' +
      'max-width:100%;' +
      '}' +
      '.documents-action-icon{' +
      'display:inline-flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'width:24px;' +
      'height:24px;' +
      'padding:0;' +
      'border:1px solid #dbeafe;' +
      'border-radius:6px;' +
      'background:#fff;' +
      'color:#172554;' +
      'cursor:pointer;' +
      'transition:background .16s ease,border-color .16s ease,color .16s ease;' +
      '}' +
      '.documents-action-icon__svg{' +
      'width:14px;' +
      'height:14px;' +
      'flex:0 0 auto;' +
      '}' +
      '.documents-action-icon:hover,.documents-action-icon:focus-visible{' +
      'background:#eff6ff;' +
      'border-color:#93c5fd;' +
      'color:#2563eb;' +
      'outline:none;' +
      '}' +
      '.documents-action-icon:disabled{' +
      'opacity:.45;' +
      'cursor:default;' +
      '}' +
      '.documents-action-icon[aria-busy="true"]{' +
      'opacity:.72;' +
      'cursor:wait;' +
      '}' +
      '.documents-action-icon--delete:hover,.documents-action-icon--delete:focus-visible{' +
      'background:#fef2f2;' +
      'border-color:#fecaca;' +
      'color:#dc2626;' +
      '}' +
      '@media (max-width:640px){' +
      '.documents-actions__panel{' +
      'padding:6px;' +
      '}' +
      '}' +
      '';
    document.head.appendChild(style);
  }

function ensureAdminTemplateStyles() {
    if (document.getElementById('documents-admin-template-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-admin-template-style';
    style.textContent = '' +
      '.documents-admin{position:fixed;inset:0;z-index:1800;display:none;background:#f6f8fc;color:#0f172a;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}' +
      '.documents-admin.is-visible{display:block;}' +
      '.documents-admin__backdrop{position:absolute;inset:0;background:#f6f8fc;}' +
      '.documents-admin__dialog{position:relative;z-index:1;width:100%;height:100vh;height:100dvh;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;background:#f6f8fc;}' +
      '.documents-admin__header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 20px 10px;background:#fff;}' +
      '.documents-admin__heading{display:flex;align-items:center;gap:22px;min-width:0;flex-wrap:wrap;}' +
      '.documents-admin__title{margin:0;font-size:28px;line-height:1.2;font-weight:850;letter-spacing:-.025em;color:#0f172a;}' +
      '.documents-admin__message{display:none;position:relative;padding-left:24px;color:#16a34a;font-size:14px;font-weight:700;line-height:24px;}' +
      '.documents-admin__message::before{content:"✓";position:absolute;left:0;top:3px;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border:2px solid currentColor;border-radius:999px;font-size:10px;line-height:1;}' +
      '.documents-admin__message--error{color:#dc2626;}' +
      '.documents-admin__dismiss{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;color:#334155;font-size:14px;font-weight:750;cursor:pointer;}' +
      '.documents-admin__dismiss:hover,.documents-admin__dismiss:focus-visible{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8;outline:none;}' +
      '.documents-admin__navigation{display:flex;align-items:stretch;gap:8px;margin:0;padding:0 18px;border-bottom:1px solid #e2e8f0;background:#fff;overflow-x:auto;scrollbar-gutter:stable;scroll-behavior:smooth;}' +
      '.documents-admin__nav-button{position:relative;flex:0 0 auto;min-height:52px;padding:0 18px;border:0;background:transparent;color:#64748b;font-size:14px;font-weight:750;cursor:pointer;}' +
      '.documents-admin__nav-button::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;border-radius:999px;background:transparent;}' +
      '.documents-admin__nav-button:hover,.documents-admin__nav-button:focus-visible{color:#1d4ed8;outline:none;}' +
      '.documents-admin__nav-button.is-active{color:#2563eb;}' +
      '.documents-admin__nav-button.is-active::after{background:#2563eb;}' +
      '.documents-admin__body{min-height:0;overflow:auto;scrollbar-gutter:stable;padding:18px 20px 24px;}' +
      '.documents-admin__users-view{display:flex;flex-direction:column;gap:22px;min-height:100%;max-width:1680px;margin:0 auto;}' +
      '.documents-admin__users-view[hidden],.documents-admin__log-panel[hidden]{display:none;}' +
      '.documents-admin__ai-settings{display:grid;grid-template-columns:minmax(240px,.85fr) minmax(360px,1.6fr);gap:8px 28px;align-items:center;padding:18px 20px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;box-shadow:0 4px 18px rgba(15,23,42,.035);}' +
      '.documents-admin__ai-settings-label{font-size:15px;font-weight:800;color:#0f172a;}' +
      '.documents-admin__ai-settings-hint{grid-column:1;margin:0;color:#64748b;font-size:13px;line-height:1.5;}' +
      '.documents-admin__ai-settings-select{grid-column:2;grid-row:1 / span 2;width:100%;min-height:46px;border:1px solid #dbe3ee;border-radius:10px;background:#fff;color:#0f172a;padding:0 14px;font-size:14px;font-weight:700;}' +
      '.documents-admin__ai-settings-select:focus{outline:3px solid rgba(37,99,235,.13);border-color:#60a5fa;}' +
      '.documents-admin__groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border:1px solid #e2e8f0;border-radius:13px;background:#eef2f7;}' +
      '.documents-admin__group-button{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;min-height:48px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:#64748b;font-size:13px;font-weight:800;cursor:pointer;transition:background .16s ease,color .16s ease,box-shadow .16s ease;}' +
      '.documents-admin__group-button:hover,.documents-admin__group-button:focus-visible{background:rgba(255,255,255,.7);color:#1d4ed8;outline:none;}' +
      '.documents-admin__group-button.is-active{background:#fff;color:#1d4ed8;box-shadow:0 3px 10px rgba(15,23,42,.09);}' +
      '.documents-admin__group-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;padding:0 6px;border-radius:999px;background:#dfe6ef;color:#64748b;font-size:11px;font-weight:850;box-sizing:border-box;}' +
      '.documents-admin__group-button.is-active .documents-admin__group-count{background:#dbeafe;color:#1d4ed8;}' +
      '.documents-admin__users-card{position:relative;display:flex;flex-direction:column;min-height:390px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.04);overflow:hidden;}' +
      '.documents-admin__toolbar{display:grid;grid-template-columns:minmax(180px,1fr) minmax(300px,430px) auto auto;align-items:center;gap:12px;padding:20px 22px;}' +
      '.documents-admin__section-heading{margin:0;font-size:20px;line-height:1.25;font-weight:850;color:#0f172a;}' +
      '.documents-admin__search{position:relative;min-width:0;}' +
      '.documents-admin__search::before{content:"⌕";position:absolute;left:14px;top:50%;transform:translateY(-52%) rotate(-20deg);color:#94a3b8;font-size:20px;line-height:1;pointer-events:none;}' +
      '.documents-admin__search-input{width:100%;min-height:42px;box-sizing:border-box;padding:0 14px 0 40px;border:1px solid #dbe3ee;border-radius:9px;background:#fff;color:#0f172a;font-size:13px;}' +
      '.documents-admin__search-input::placeholder{color:#94a3b8;}' +
      '.documents-admin__search-input:focus{outline:3px solid rgba(37,99,235,.12);border-color:#60a5fa;}' +
      '.documents-admin__filter-wrap{position:relative;}' +
      '.documents-admin__filter-button,.documents-admin__add-row{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px;border-radius:9px;font-size:13px;font-weight:800;white-space:nowrap;cursor:pointer;}' +
      '.documents-admin__filter-button{border:1px solid #dbe3ee;background:#f8fafc;color:#334155;}' +
      '.documents-admin__filter-button:hover,.documents-admin__filter-button:focus-visible{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8;outline:none;}' +
      '.documents-admin__filter-button.is-active{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8;}' +
      '.documents-admin__filter-panel{position:absolute;z-index:12;top:calc(100% + 8px);right:0;width:260px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 18px 38px rgba(15,23,42,.16);}' +
      '.documents-admin__filter-panel[hidden]{display:none;}' +
      '.documents-admin__filter-field{display:flex;flex-direction:column;gap:6px;margin-bottom:11px;color:#475569;font-size:12px;font-weight:750;}' +
      '.documents-admin__filter-select{width:100%;min-height:36px;border:1px solid #dbe3ee;border-radius:8px;background:#fff;color:#0f172a;padding:0 9px;font-size:13px;}' +
      '.documents-admin__filter-reset{width:100%;min-height:36px;border:1px solid #dbe3ee;border-radius:8px;background:#f8fafc;color:#334155;font-size:12px;font-weight:800;cursor:pointer;}' +
      '.documents-admin__add-row{border:1px solid #2563eb;background:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.2);}' +
      '.documents-admin__add-row:hover,.documents-admin__add-row:focus-visible{border-color:#1d4ed8;background:#1d4ed8;outline:none;}' +
      '.documents-admin__section{min-height:0;}' +
      '.documents-admin__section[hidden]{display:none;}' +
      '.documents-admin__table-wrapper{max-height:calc(100vh - 430px);max-height:calc(100dvh - 430px);min-height:280px;overflow:auto;overflow-x:auto;scrollbar-gutter:stable;border-top:1px solid #eef2f7;}' +
      '.documents-admin__table-scroll-hint,.documents-admin__object-scroll-hint{display:none;}' +
      '.documents-admin__table{width:100%;min-width:1420px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#334155;font-size:13px;}' +
      '.documents-admin__table th{position:sticky;top:0;z-index:4;height:46px;padding:0 10px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;font-weight:800;text-align:left;white-space:nowrap;}' +
      '.documents-admin__table td{height:58px;padding:7px 7px;border-bottom:1px solid #eef2f7;background:#fff;vertical-align:middle;}' +
      '.documents-admin__table tr:last-child td{border-bottom:0;}' +
      '.documents-admin__table tbody tr:hover td{background:#fbfdff;}' +
      '.documents-admin__table th:nth-child(1),.documents-admin__table td:nth-child(1){width:56px;text-align:center;}' +
      '.documents-admin__table th:nth-child(2),.documents-admin__table td:nth-child(2){width:180px;}' +
      '.documents-admin__table th:nth-child(3),.documents-admin__table td:nth-child(3){width:155px;}' +
      '.documents-admin__table th:nth-child(4),.documents-admin__table td:nth-child(4){width:135px;}' +
      '.documents-admin__table th:nth-child(5),.documents-admin__table td:nth-child(5){width:125px;}' +
      '.documents-admin__table th:nth-child(6),.documents-admin__table td:nth-child(6){width:170px;}' +
      '.documents-admin__table th:nth-child(7),.documents-admin__table td:nth-child(7){width:135px;}' +
      '.documents-admin__table th:nth-child(8),.documents-admin__table td:nth-child(8){width:165px;}' +
      '.documents-admin__table th:nth-child(9),.documents-admin__table td:nth-child(9){width:145px;}' +
      '.documents-admin__table th:nth-child(10),.documents-admin__table td:nth-child(10){width:76px;text-align:center;}' +
      '.documents-admin__input{width:100%;min-width:0;height:38px;box-sizing:border-box;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#0f172a;font:inherit;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;}' +
      '.documents-admin__table td:nth-child(n+4):nth-child(-n+9) .documents-admin__input{border-color:#e7edf4;background:#fff;}' +
      '.documents-admin__table td:nth-child(2) .documents-admin__input{font-weight:750;}' +
      '.documents-admin__table td:first-child .documents-admin__input{text-align:center;color:#475569;font-weight:750;}' +
      '.documents-admin__input:hover{border-color:#cbd5e1;background:#fff;}' +
      '.documents-admin__input:focus{outline:3px solid rgba(37,99,235,.12);border-color:#60a5fa;background:#fff;}' +
      '.documents-admin__input--error{border-color:#ef4444;background:#fff1f2;}' +
      '.documents-admin__row-actions{position:relative;text-align:center;}' +
      '.documents-admin__row-menu-toggle{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a;font-size:20px;font-weight:850;line-height:1;cursor:pointer;}' +
      '.documents-admin__row-menu-toggle:hover,.documents-admin__row-menu-toggle:focus-visible,.documents-admin__row-menu-toggle[aria-expanded="true"]{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8;outline:none;}' +
      '.documents-admin__row-menu{position:fixed;z-index:1850;display:flex;flex-direction:column;width:min(290px,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow:auto;scrollbar-gutter:stable;padding:7px;border:1px solid #dbe3ee;border-radius:11px;background:#fff;box-shadow:0 16px 34px rgba(15,23,42,.17);text-align:left;}' +
      '.documents-admin__row-menu[hidden]{display:none;}' +
      '.documents-admin__row-menu-button{min-height:38px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:#334155;font-size:13px;font-weight:700;text-align:left;cursor:pointer;}' +
      '.documents-admin__row-menu-button:hover,.documents-admin__row-menu-button:focus-visible{background:#f8fafc;outline:none;}' +
      '.documents-admin__row-menu-button--danger{color:#dc2626;}' +
      '.documents-admin__row-menu-button:disabled{color:#94a3b8;cursor:default;}' +
      '.documents-admin__row-menu-objects{margin:4px 0;padding:8px 5px;border-top:1px solid #eef2f7;border-bottom:1px solid #eef2f7;}' +
      '.documents-admin__row-menu-objects-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;padding:0 4px;color:#64748b;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;}' +
      '.documents-admin__row-menu-objects-count{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#e2e8f0;color:#475569;font-size:10px;}' +
      '.documents-admin__row-menu-objects-list{display:flex;max-height:180px;overflow:auto;scrollbar-gutter:stable;flex-direction:column;gap:2px;}' +
      '.documents-admin__object-selector-option{display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:7px;color:#334155;font-size:12px;font-weight:750;cursor:pointer;}' +
      '.documents-admin__object-selector-option:hover{background:#f8fafc;}' +
      '.documents-admin__object-selector-option input{margin-top:2px;accent-color:#2563eb;}' +
      '.documents-admin__objects-view{display:none;width:min(1560px,100%);min-height:100%;margin:0 auto;}' +
      '.documents-admin__objects-view.is-visible{display:block;}' +
      '.documents-admin__objects-workspace{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);min-height:calc(100dvh - 190px);border:1px solid #dbe3ee;border-radius:14px;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.045);overflow:hidden;}' +
      '.documents-admin__objects-panel{display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr) auto;min-width:0;border-right:1px solid #e2e8f0;background:#fff;}' +
      '.documents-admin__objects-panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px;}' +
      '.documents-admin__objects-heading{margin:0;color:#0f172a;font-size:18px;font-weight:850;}' +
      '.documents-admin__objects-hint{margin:4px 0 0;color:#64748b;font-size:12px;line-height:1.4;}' +
      '.documents-admin__objects-create{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;margin:0 18px 10px;padding:8px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;}' +
      '.documents-admin__objects-input{width:100%;min-width:0;height:40px;box-sizing:border-box;padding:0 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font-size:13px;}' +
      '.documents-admin__objects-create-button,.documents-admin__object-save,.documents-admin__object-add-column,.documents-admin__object-apply-template,.documents-admin__object-delete{min-height:40px;padding:0 14px;border:1px solid #2563eb;border-radius:9px;background:#2563eb;color:#fff;font-size:12px;font-weight:850;cursor:pointer;transition:background .16s ease,border-color .16s ease,box-shadow .16s ease;}' +
      '.documents-admin__objects-create-button:hover,.documents-admin__object-save:hover{border-color:#1d4ed8;background:#1d4ed8;box-shadow:0 7px 16px rgba(37,99,235,.18);}' +
      '.documents-admin__objects-create-button:disabled,.documents-admin__object-save:disabled{border-color:#dbe3ee;background:#eef2f7;color:#94a3b8;box-shadow:none;cursor:default;}' +
      '.documents-admin__objects-search{position:relative;margin:0 18px 12px;}' +
      '.documents-admin__objects-search::before{content:"⌕";position:absolute;left:13px;top:50%;transform:translateY(-53%) rotate(-20deg);color:#94a3b8;font-size:19px;pointer-events:none;}' +
      '.documents-admin__objects-search-input{width:100%;height:42px;box-sizing:border-box;padding:0 12px 0 38px;border:1px solid #dbe3ee;border-radius:9px;background:#fff;color:#0f172a;font-size:13px;}' +
      '.documents-admin__objects-search-input:focus{outline:3px solid rgba(37,99,235,.1);border-color:#60a5fa;}' +
      '.documents-admin__objects-status{display:none;margin:0 18px 10px;padding:9px 11px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:750;}' +
      '.documents-admin__objects-status.is-visible{display:block;}' +
      '.documents-admin__objects-status.is-error{border-color:#fecaca;background:#fef2f2;color:#b91c1c;}' +
      '.documents-admin__objects-list{min-height:0;overflow:auto;scrollbar-gutter:stable;border-top:1px solid #eef2f7;}' +
      '.documents-admin__object-list-item{display:grid;grid-template-columns:48px minmax(0,1fr) 18px;align-items:center;gap:12px;width:100%;min-height:86px;padding:13px 18px;border:0;border-bottom:1px solid #eef2f7;background:#fff;color:#0f172a;text-align:left;cursor:pointer;}' +
      '.documents-admin__object-list-item:hover,.documents-admin__object-list-item:focus-visible{background:#f8fafc;outline:none;}' +
      '.documents-admin__object-list-item.is-active{background:#f4f7ff;box-shadow:inset 3px 0 #2563eb;}' +
      '.documents-admin__object-list-icon{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border:1px solid #dbeafe;border-radius:13px;background:#eff6ff;color:#2563eb;font-size:23px;font-weight:800;}' +
      '.documents-admin__object-list-copy{min-width:0;}' +
      '.documents-admin__object-list-name{display:block;overflow:hidden;color:#0f172a;font-size:14px;font-weight:850;text-overflow:ellipsis;white-space:nowrap;}' +
      '.documents-admin__object-list-meta{display:block;margin-top:4px;color:#64748b;font-size:11px;font-weight:700;}' +
      '.documents-admin__object-list-status{display:flex;align-items:center;gap:6px;margin-top:5px;color:#16a34a;font-size:11px;font-weight:750;}' +
      '.documents-admin__object-list-status::before{content:"";width:7px;height:7px;border-radius:999px;background:#22c55e;}' +
      '.documents-admin__object-list-arrow{color:#64748b;font-size:20px;}' +
      '.documents-admin__objects-count{padding:12px 18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;font-weight:700;}' +
      '.documents-admin__object-editor{min-width:0;background:#fff;}' +
      '.documents-admin__object-editor-empty{display:flex;min-height:420px;align-items:center;justify-content:center;padding:30px;color:#64748b;font-size:13px;font-weight:700;text-align:center;}' +
      '.documents-admin__object-card{min-height:100%;background:#fff;}' +
      '.documents-admin__object-head{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid #e2e8f0;background:#fff;}' +
      '.documents-admin__object-heading-copy{display:grid;gap:6px;min-width:0;}' +
      '.documents-admin__object-heading-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}' +
      '.documents-admin__object-head-actions{display:flex;align-items:center;gap:8px;}' +
      '.documents-admin__object-name{width:100%;height:42px;box-sizing:border-box;border:1px solid transparent;border-radius:8px;background:transparent;color:#0f172a;padding:0 8px;font-size:21px;font-weight:850;}' +
      '.documents-admin__object-name:hover{border-color:#e2e8f0;background:#f8fafc;}' +
      '.documents-admin__object-active{display:inline-flex;align-items:center;width:max-content;padding:4px 8px;border:1px solid #bbf7d0;border-radius:7px;background:#f0fdf4;color:#16a34a;font-size:11px;font-weight:850;}' +
      '.documents-admin__object-meta{margin:0;color:#64748b;font-size:11px;font-weight:700;}' +
      '.documents-admin__object-info{margin:14px 20px;padding:12px 14px;border:1px solid #bfdbfe;border-radius:9px;background:#f8fbff;color:#475569;font-size:12px;line-height:1.45;}' +
      '.documents-admin__object-info::before{content:"i";display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;margin-right:8px;border:1.5px solid #2563eb;border-radius:999px;color:#2563eb;font-size:11px;font-weight:900;vertical-align:-1px;}' +
      '.documents-admin__object-delete{border-color:#fecaca;background:#fff;color:#dc2626;}' +
      '.documents-admin__object-delete:hover{border-color:#fca5a5;background:#fef2f2;}' +
      '.documents-admin__object-fields-title{margin:0;padding:2px 20px 10px;color:#0f172a;font-size:14px;font-weight:850;}' +
      '.documents-admin__object-columns{display:flex;flex-direction:column;margin:0 20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;}' +
      '.documents-admin__object-columns-head,.documents-admin__object-column{display:grid;grid-template-columns:86px minmax(170px,1fr) minmax(220px,1.35fr) minmax(120px,.7fr) 110px;gap:10px;align-items:center;}' +
      '.documents-admin__object-columns-head{min-height:42px;padding:0 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:11px;font-weight:850;}' +
      '.documents-admin__object-column{min-height:58px;padding:8px 12px;border-bottom:1px solid #eef2f7;background:#fff;}' +
      '.documents-admin__object-column:last-child{border-bottom:0;}' +
      '.documents-admin__object-column-move{display:flex;flex-direction:row;gap:4px;}' +
      '.documents-admin__object-column-move button,.documents-admin__object-column-remove{min-height:34px;border:1px solid #dbe3ee;border-radius:7px;background:#fff;color:#475569;cursor:pointer;}' +
      '.documents-admin__object-column-move button{width:34px;}' +
      '.documents-admin__object-column-group,.documents-admin__object-column-label,.documents-admin__object-column-type{height:38px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:0 10px;font-size:13px;}' +
      '.documents-admin__objects-input:focus,.documents-admin__object-name:focus,.documents-admin__object-column-group:focus,.documents-admin__object-column-label:focus,.documents-admin__object-column-type:focus{outline:3px solid rgba(37,99,235,.1);border-color:#60a5fa;background:#fff;}' +
      '.documents-admin__object-column-remove{padding:0 9px;color:#dc2626;font-size:11px;font-weight:800;}' +
      '.documents-admin__object-column-actions{display:flex;align-items:center;gap:8px;margin:12px 20px 20px;}' +
      '.documents-admin__object-add-column,.documents-admin__object-apply-template{margin:0;border-style:dashed;border-color:#93c5fd;background:#fff;color:#2563eb;}' +
      '.documents-admin__object-add-column{flex:1 1 auto;}' +
      '.documents-admin__object-apply-template{flex:0 0 auto;border-style:solid;}' +
      '.documents-admin__object-card.is-dirty .documents-admin__object-save{box-shadow:0 0 0 3px rgba(37,99,235,.12);}' +
      '.documents-admin__empty-search{padding:34px 20px;color:#64748b;font-size:14px;font-weight:700;text-align:center;}' +
      '.documents-admin__empty-search[hidden]{display:none;}' +
      '.documents-admin__footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 20px;border-top:1px solid #e2e8f0;background:#fff;box-shadow:0 -6px 20px rgba(15,23,42,.035);}' +
      '.documents-admin__footer[hidden]{display:none;}' +
      '.documents-admin__footer-status{display:flex;align-items:center;gap:10px;color:#64748b;font-size:13px;font-weight:700;}' +
      '.documents-admin__footer-status::before{content:"i";display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:2px solid #3b82f6;border-radius:999px;color:#2563eb;font-size:12px;font-weight:900;box-sizing:border-box;}' +
      '.documents-admin__footer-status.is-dirty{color:#334155;}' +
      '.documents-admin__footer-actions{display:flex;align-items:center;gap:12px;}' +
      '.documents-admin__close,.documents-admin__save{min-width:170px;min-height:42px;padding:0 18px;border-radius:9px;font-size:13px;font-weight:800;cursor:pointer;}' +
      '.documents-admin__close{border:1px solid #dbe3ee;background:#fff;color:#334155;}' +
      '.documents-admin__save{border:1px solid #2563eb;background:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.2);}' +
      '.documents-admin__close:hover,.documents-admin__close:focus-visible{background:#f8fafc;outline:none;}' +
      '.documents-admin__save:hover,.documents-admin__save:focus-visible{background:#1d4ed8;outline:none;}' +
      '.documents-admin__save:disabled{opacity:.6;cursor:wait;}' +
      '.documents-admin__log-panel{max-width:1680px;min-height:360px;box-sizing:border-box;margin:0 auto;padding:20px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.04);}' +
      '.documents-admin__log-header{display:flex;align-items:center;justify-content:space-between;gap:12px;}' +
      '.documents-admin__log-title{margin:0;font-size:20px;color:#0f172a;}' +
      '.documents-admin__log-close,.documents-admin__log-copy{min-height:38px;padding:0 13px;border:1px solid #dbe3ee;border-radius:8px;background:#f8fafc;color:#334155;font-weight:750;cursor:pointer;}' +
      '.documents-admin__log-close:hover,.documents-admin__log-close:focus-visible,.documents-admin__log-copy:hover,.documents-admin__log-copy:focus-visible{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8;outline:none;}' +
      '.documents-admin__log-copy:disabled{color:#94a3b8;cursor:default;}' +
      '.documents-admin__log-list{display:grid;gap:8px;max-height:42vh;max-height:42dvh;margin:16px 0;padding:0;overflow:auto;scrollbar-gutter:stable;list-style:none;color:#334155;}' +
      '.documents-admin__log-item{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:start;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;}' +
      '.documents-admin__log-index{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:900;}' +
      '.documents-admin__log-item-content{min-width:0;}' +
      '.documents-admin__log-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;}' +
      '.documents-admin__log-row--muted{margin-top:5px;color:#64748b;font-size:11px;}' +
      '.documents-admin__log-name{min-width:0;overflow:hidden;color:#0f172a;font-size:13px;font-weight:850;text-overflow:ellipsis;white-space:nowrap;}' +
      '.documents-admin__log-id{flex:0 0 auto;padding:4px 7px;border-radius:7px;background:#e2e8f0;color:#475569;font-size:10px;font-weight:850;}' +
      '.documents-admin__log-username,.documents-admin__log-date{overflow-wrap:anywhere;}' +
      '.documents-admin__log-empty{padding:28px 14px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;font-size:13px;font-weight:750;text-align:center;}' +
      '.documents-admin__log-textarea{width:100%;min-height:112px;box-sizing:border-box;border:1px solid #dbe3ee;border-radius:9px;padding:11px;background:#f8fafc;color:#475569;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;resize:vertical;}' +
      '.documents-admin__log-hint,.documents-admin__log-status{color:#64748b;font-size:13px;line-height:1.45;}' +
      '.documents-admin__log-status{margin:12px 0 0;padding:9px 11px;border:1px solid #dbeafe;border-radius:9px;background:#eff6ff;color:#1d4ed8;font-weight:750;}' +
      '.documents-admin__log-status--error{border-color:#fecaca;background:#fef2f2;color:#b91c1c;}' +
      '.documents-admin__log-status--success{border-color:#bbf7d0;background:#f0fdf4;color:#15803d;}' +
      '@media (max-width: 1180px){' +
      '.documents-admin__toolbar{grid-template-columns:minmax(160px,1fr) minmax(260px,1.3fr) auto;}' +
      '.documents-admin__add-row{grid-column:2 / 4;justify-self:end;}' +
      '}' +
      '@media (max-width: 900px){' +
      '.documents-admin__header{padding-left:16px;padding-right:16px;}' +
      '.documents-admin__title{font-size:24px;}' +
      '.documents-admin__body{padding-left:12px;padding-right:12px;}' +
      '.documents-admin__ai-settings{grid-template-columns:minmax(200px,.8fr) minmax(280px,1.2fr);padding:18px;}' +
      '.documents-admin__toolbar{grid-template-columns:1fr auto;}' +
      '.documents-admin__section-heading,.documents-admin__search{grid-column:1 / -1;}' +
      '.documents-admin__add-row{grid-column:auto;justify-self:stretch;}' +
      '}' +
      '.documents-template-modal{display:none;width:100%;max-width:1680px;box-sizing:border-box;margin:0 auto;}' +
      '.documents-template-modal.is-visible{display:block;}' +
      '.documents-template-modal__panel{width:100%;box-sizing:border-box;overflow:auto;border-radius:12px;background:#fff;border:1px solid #dbe3ee;box-shadow:0 8px 28px rgba(15,23,42,.04);padding:20px;display:flex;flex-direction:column;gap:16px;}' +
      '.documents-template-modal__title{margin:0;font-size:20px;font-weight:700;color:#0f172a;}' +
      '.documents-template-modal__subtitle{margin:0;color:#64748b;font-size:13px;line-height:1.45;}' +
      '.documents-template-modal__card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:8px;}' +
      '.documents-template-modal__name{font-size:15px;font-weight:700;color:#0f172a;word-break:break-word;}' +
      '.documents-template-modal__meta{font-size:12px;color:#64748b;word-break:break-word;}' +
      '.documents-template-modal__status{display:none;padding:10px 12px;border-radius:12px;font-size:13px;font-weight:600;background:rgba(59,130,246,0.12);color:#1d4ed8;}' +
      '.documents-template-modal__status.is-visible{display:block;}' +
      '.documents-template-modal__status--error{background:rgba(239,68,68,0.14);color:#b91c1c;}' +
      '.documents-template-modal__status--success{background:rgba(16,185,129,0.15);color:#047857;}' +
      '.documents-template-modal__actions{display:flex;flex-wrap:wrap;gap:10px;}' +
      '.documents-template-modal__button{min-height:40px;border:1px solid transparent;border-radius:9px;padding:0 14px;font-size:13px;font-weight:750;cursor:pointer;transition:background .16s ease,border-color .16s ease,opacity .16s ease;}' +
      '.documents-template-modal__button:disabled{opacity:0.6;cursor:default;transform:none;box-shadow:none;}' +
      '.documents-template-modal__button--primary{border-color:#2563eb;background:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.18);}' +
      '.documents-template-modal__button--secondary{border-color:#dbe3ee;background:#f8fafc;color:#334155;}' +
      '.documents-template-modal__button:hover:not(:disabled){border-color:#93c5fd;background:#eff6ff;color:#1d4ed8;}' +
      '.documents-template-modal__button--primary:hover:not(:disabled){border-color:#1d4ed8;background:#1d4ed8;color:#fff;}' +
      '.documents-s3-modal{display:none;width:100%;max-width:1680px;box-sizing:border-box;margin:0 auto;}' +
      '.documents-s3-modal.is-visible{display:block;}' +
      '.documents-s3-modal__panel{width:100%;min-height:0;box-sizing:border-box;overflow:visible;border-radius:12px;background:#fff;border:1px solid #dbe3ee;box-shadow:0 8px 28px rgba(15,23,42,.04);padding:20px;display:grid;grid-template-rows:auto auto auto auto auto;gap:14px;}' +
      '.documents-s3-modal__title{margin:0;font-size:20px;font-weight:700;color:#0f172a;}' +
      '.documents-s3-modal__subtitle{margin:0;color:#64748b;font-size:13px;line-height:1.45;}' +
      '.documents-s3-modal__status{display:none;padding:10px 12px;border-radius:12px;font-size:13px;font-weight:600;background:rgba(59,130,246,0.12);color:#1d4ed8;}' +
      '.documents-s3-modal__status.is-visible{display:block;}' +
      '.documents-s3-modal__status--error{background:rgba(239,68,68,0.14);color:#b91c1c;}' +
      '.documents-s3-modal__status--success{background:rgba(16,185,129,0.15);color:#047857;}' +
      '.documents-s3-modal__summary{min-height:0;overflow:visible;display:grid;grid-template-rows:auto auto;gap:12px;}' +
      '.documents-s3-modal__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;}' +
      '.documents-s3-modal__metric{border:1px solid rgba(148,163,184,0.3);border-radius:14px;padding:12px;background:rgba(255,255,255,0.74);display:flex;flex-direction:column;gap:4px;min-width:0;}' +
      '.documents-s3-modal__metric-label{font-size:12px;font-weight:700;color:#64748b;line-height:1.3;}' +
      '.documents-s3-modal__metric-value{font-size:18px;font-weight:800;color:#0f172a;line-height:1.2;word-break:break-word;}' +
      '.documents-s3-modal__explorer{min-height:420px;border:1px solid rgba(148,163,184,0.3);border-radius:14px;background:rgba(255,255,255,0.74);overflow:hidden;display:grid;grid-template-rows:auto auto auto auto minmax(240px,1fr) auto;}' +
      '.documents-s3-modal__explorer-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.22);}' +
      '.documents-s3-modal__explorer-title{font-size:13px;font-weight:900;color:#0f172a;}' +
      '.documents-s3-modal__explorer-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:12px;font-weight:700;}' +
      '.documents-s3-modal__explorer-up{flex:0 0 auto;min-height:30px;border:1px solid rgba(148,163,184,0.34);border-radius:9px;background:rgba(248,250,252,0.92);color:#0f172a;font-size:12px;font-weight:800;padding:0 10px;}' +
      '.documents-s3-modal__explorer-up:disabled{opacity:.45;}' +
      '.documents-s3-modal__toolbar{display:grid;grid-template-columns:minmax(220px,1.4fr) auto minmax(180px,.8fr);gap:8px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.16);background:rgba(248,250,252,0.68);}' +
      '.documents-s3-modal__quick{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.16);background:rgba(255,255,255,0.68);}' +
      '.documents-s3-modal__explorer-meta{display:flex;flex-wrap:wrap;gap:8px 14px;padding:9px 12px;border-bottom:1px solid rgba(148,163,184,0.16);background:rgba(248,250,252,0.52);font-size:12px;font-weight:800;color:#475569;}' +
      '.documents-s3-modal__explorer-meta span{min-width:0;overflow-wrap:anywhere;}' +
      '.documents-s3-modal__input{width:100%;min-width:0;min-height:36px;border:1px solid rgba(148,163,184,0.36);border-radius:10px;background:rgba(255,255,255,0.92);color:#0f172a;font-size:13px;font-weight:700;padding:0 10px;}' +
      '.documents-s3-modal__input:focus{outline:2px solid rgba(37,99,235,0.22);border-color:rgba(37,99,235,0.48);}' +
      '.documents-s3-modal__mini-button{min-height:36px;border:1px solid rgba(148,163,184,0.34);border-radius:10px;background:rgba(255,255,255,0.88);color:#0f172a;font-size:12px;font-weight:850;padding:0 10px;white-space:nowrap;}' +
      '.documents-s3-modal__mini-button:disabled{opacity:.5;}' +
      '.documents-s3-modal__mini-button--danger{border-color:rgba(220,38,38,0.24);background:rgba(254,242,242,0.92);color:#b91c1c;}' +
      '.documents-s3-modal__table-wrap{min-height:0;overflow:auto;scrollbar-gutter:stable;}' +
      '.documents-s3-modal__table{width:100%;border-collapse:separate;border-spacing:0;min-width:960px;font-size:12px;color:#334155;}' +
      '.documents-s3-modal__table th{position:sticky;top:0;z-index:1;background:#f8fafc;color:#475569;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:0;padding:8px;border-bottom:1px solid rgba(148,163,184,0.24);}' +
      '.documents-s3-modal__table td{padding:8px;border-bottom:1px solid rgba(148,163,184,0.16);vertical-align:middle;}' +
      '.documents-s3-modal__table tr:last-child td{border-bottom:0;}' +
      '.documents-s3-modal__item-button{display:inline-flex;align-items:center;gap:7px;max-width:100%;border:0;background:transparent;color:#1d4ed8;font:inherit;font-weight:800;text-align:left;padding:0;}' +
      '.documents-s3-modal__item-button[data-s3-type="file"]{color:#0f172a;}' +
      '.documents-s3-modal__item-button:disabled{opacity:.55;cursor:default;}' +
      '.documents-s3-modal__item-icon{flex:0 0 auto;width:22px;height:22px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;background:#e0f2fe;color:#0369a1;font-size:12px;font-weight:900;}' +
      '.documents-s3-modal__item-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.documents-s3-modal__key{max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;}' +
      '.documents-s3-modal__row-actions{display:flex;gap:6px;justify-content:flex-end;}' +
      '.documents-s3-modal__empty{padding:14px;color:#64748b;font-size:13px;font-weight:700;}' +
      '.documents-s3-reader{position:fixed;inset:0;z-index:1980;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,0.38);backdrop-filter:blur(10px);box-sizing:border-box;}' +
      '.documents-s3-reader__panel{width:min(980px,calc(100vw - 24px));height:min(760px,calc(100dvh - 24px));display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;border:1px solid rgba(226,232,240,0.95);border-radius:16px;background:#fff;box-shadow:0 26px 58px rgba(15,23,42,0.24);}' +
      '.documents-s3-reader__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e2e8f0;}' +
      '.documents-s3-reader__title{margin:0;color:#0f172a;font-size:18px;font-weight:900;line-height:1.25;overflow-wrap:anywhere;}' +
      '.documents-s3-reader__meta{margin-top:4px;color:#64748b;font-size:12px;font-weight:700;line-height:1.35;overflow-wrap:anywhere;}' +
      '.documents-s3-reader__actions{display:flex;align-items:center;gap:8px;flex:0 0 auto;}' +
      '.documents-s3-reader__status{display:none;margin:10px 16px 0;padding:9px 10px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:800;line-height:1.35;}' +
      '.documents-s3-reader__status.is-visible{display:block;}' +
      '.documents-s3-reader__status--error{border-color:#fecaca;background:#fff1f2;color:#b91c1c;}' +
      '.documents-s3-reader__body{min-height:0;overflow:auto;scrollbar-gutter:stable;padding:12px 16px 16px;background:#f8fafc;}' +
      '.documents-s3-reader__text{min-height:100%;margin:0;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;}' +
      '.documents-s3-modal__actions{display:flex;flex-wrap:wrap;gap:10px;}' +
      '.documents-s3-modal__button{min-height:40px;border:1px solid transparent;border-radius:9px;padding:0 14px;font-size:13px;font-weight:750;cursor:pointer;transition:background .16s ease,border-color .16s ease,opacity .16s ease;}' +
      '.documents-s3-modal__button:disabled{opacity:0.6;cursor:default;transform:none;box-shadow:none;}' +
      '.documents-s3-modal__button--primary{border-color:#2563eb;background:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.18);}' +
      '.documents-s3-modal__button--secondary{border-color:#dbe3ee;background:#f8fafc;color:#334155;}' +
      '.documents-s3-modal__button:hover:not(:disabled){border-color:#93c5fd;background:#eff6ff;color:#1d4ed8;}' +
      '.documents-s3-modal__button--primary:hover:not(:disabled){border-color:#1d4ed8;background:#1d4ed8;color:#fff;}' +
      '.documents-cron-modal .documents-s3-modal__panel{height:auto;min-height:380px;grid-template-rows:auto auto auto minmax(160px,auto) auto;}' +
      '.documents-ocr-modal__panel{height:auto;min-height:0;grid-template-rows:auto auto auto auto auto auto;}' +
      '.documents-ocr-admin__tabs{display:flex;gap:8px;padding:4px;border:1px solid rgba(148,163,184,0.25);border-radius:14px;background:rgba(241,245,249,0.82);}' +
      '.documents-ocr-admin__tab{min-height:38px;border:0;border-radius:10px;padding:0 14px;background:transparent;color:#475569;font-size:13px;font-weight:850;cursor:pointer;}' +
      '.documents-ocr-admin__tab.is-active{background:#fff;color:#1d4ed8;box-shadow:0 5px 14px rgba(15,23,42,0.08);}' +
      '.documents-ocr-admin__content{min-height:0;overflow:visible;display:flex;flex-direction:column;gap:12px;}' +
      '.documents-ocr-admin__progress{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:10px 12px;border:1px solid rgba(148,163,184,0.28);border-radius:14px;background:rgba(255,255,255,0.78);}' +
      '.documents-ocr-admin__progress-track{height:9px;border-radius:999px;background:#e2e8f0;overflow:hidden;}' +
      '.documents-ocr-admin__progress-bar{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#22c55e);transition:width .25s ease;}' +
      '.documents-ocr-admin__progress-value{font-size:13px;font-weight:900;color:#0f172a;}' +
      '.documents-ocr-admin__active{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px;border:1px solid rgba(59,130,246,0.25);border-radius:14px;background:linear-gradient(135deg,rgba(239,246,255,0.92),rgba(255,255,255,0.92));}' +
      '.documents-ocr-admin__active-title{font-size:13px;font-weight:900;color:#0f172a;overflow-wrap:anywhere;}' +
      '.documents-ocr-admin__active-meta{margin-top:5px;color:#64748b;font-size:12px;line-height:1.45;overflow-wrap:anywhere;}' +
      '.documents-ocr-admin__active-state{align-self:start;padding:6px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:900;white-space:nowrap;}' +
      '.documents-ocr-admin__deliveries{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:6px;}' +
      '.documents-ocr-admin__delivery{padding:5px 8px;border-radius:9px;background:#dcfce7;color:#047857;font-size:11px;font-weight:800;overflow-wrap:anywhere;}' +
      '.documents-ocr-admin__delivery.is-error{background:#fee2e2;color:#b91c1c;}' +
      '.documents-ocr-admin__toolbar{display:grid;grid-template-columns:minmax(220px,1fr) minmax(150px,220px) auto;gap:8px;align-items:center;}' +
      '.documents-ocr-admin__table-wrap{min-height:320px;max-height:52vh;max-height:52dvh;flex:1 1 auto;overflow:auto;overflow-x:auto;scrollbar-gutter:stable;border:1px solid rgba(148,163,184,0.28);border-radius:14px;background:rgba(255,255,255,0.8);touch-action:pan-x pan-y;}' +
      '.documents-ocr-admin__table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;color:#334155;font-size:12px;}' +
      '.documents-ocr-admin__table--users{min-width:650px;}' +
      '.documents-ocr-admin__table--files{min-width:920px;}' +
      '.documents-ocr-admin__table th{position:sticky;top:0;z-index:1;padding:8px;background:#f8fafc;border-bottom:1px solid rgba(148,163,184,0.25);color:#475569;font-size:11px;text-align:left;text-transform:uppercase;}' +
      '.documents-ocr-admin__table td{padding:8px;border-bottom:1px solid rgba(148,163,184,0.16);vertical-align:top;}' +
      '.documents-ocr-admin__table tr:last-child td{border-bottom:0;}' +
      '.documents-ocr-admin__name{font-weight:850;color:#0f172a;overflow-wrap:anywhere;}' +
      '.documents-ocr-admin__muted{margin-top:3px;color:#64748b;font-size:11px;line-height:1.4;overflow-wrap:anywhere;}' +
      '.documents-ocr-admin__badge{display:inline-flex;padding:4px 7px;border-radius:999px;background:#e2e8f0;color:#475569;font-size:10px;font-weight:900;white-space:nowrap;}' +
      '.documents-ocr-admin__badge--completed,.documents-ocr-admin__badge--complete{background:#dcfce7;color:#047857;}' +
      '.documents-ocr-admin__badge--processing,.documents-ocr-admin__badge--running{background:#dbeafe;color:#1d4ed8;}' +
      '.documents-ocr-admin__badge--retry,.documents-ocr-admin__badge--attention,.documents-ocr-admin__badge--incomplete{background:#fef3c7;color:#b45309;}' +
      '.documents-ocr-admin__badge--failed,.documents-ocr-admin__badge--error,.documents-ocr-admin__badge--missing,.documents-ocr-admin__badge--ocr_missing{background:#fee2e2;color:#b91c1c;}' +
      '.documents-ocr-admin__pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;color:#64748b;font-size:12px;font-weight:800;}' +
      '.documents-ocr-admin__pagination button{min-height:32px;border:1px solid rgba(148,163,184,0.32);border-radius:9px;background:#fff;color:#0f172a;padding:0 10px;font-size:12px;font-weight:850;}' +
      '.documents-ocr-admin__pagination button:disabled{opacity:.45;}' +
      '.documents-ocr-admin__users-layout{min-height:0;flex:1 1 auto;display:grid;grid-template-columns:minmax(300px,.82fr) minmax(0,1.5fr);gap:12px;}' +
      '.documents-ocr-admin__pane{min-height:0;display:flex;flex-direction:column;gap:10px;overflow:visible;}' +
      '.documents-ocr-admin__pane-title{margin:0;color:#0f172a;font-size:14px;font-weight:900;}' +
      '.documents-ocr-admin__user-button{border:0;background:transparent;color:#1d4ed8;font:inherit;font-weight:900;text-align:left;padding:0;cursor:pointer;}' +
      '.documents-ocr-admin__user-button.is-active{color:#0f172a;text-decoration:underline;text-decoration-color:#60a5fa;text-decoration-thickness:2px;text-underline-offset:3px;}' +
      '.documents-ocr-admin__preview{max-width:460px;white-space:pre-wrap;overflow-wrap:anywhere;color:#475569;line-height:1.45;}' +
      '.documents-ocr-admin__empty{padding:18px;border:1px dashed rgba(148,163,184,0.35);border-radius:14px;color:#64748b;text-align:center;font-size:13px;font-weight:700;}' +
      '.documents-ocr-text-reader{display:none;}' +
      '.documents-ocr-text-reader.is-visible{display:flex;}' +
      '@media (max-width:1050px){' +
      '.documents-admin__objects-workspace{grid-template-columns:1fr;}' +
      '.documents-admin__objects-panel{grid-template-rows:auto auto auto auto auto auto;border-right:0;border-bottom:1px solid #e2e8f0;}' +
      '.documents-admin__objects-list{display:flex;max-height:none;overflow-x:auto;overflow-y:hidden;scrollbar-gutter:stable;padding:0 12px 12px;border-top:0;}' +
      '.documents-admin__object-list-item{flex:0 0 min(280px,78vw);border:1px solid #e2e8f0;border-radius:10px;}' +
      '.documents-admin__object-list-item.is-active{box-shadow:inset 0 -3px #2563eb;}' +
      '.documents-admin__objects-count{display:none;}' +
      '}' +
      '@media (max-width: 720px){' +
      '.documents-admin__dialog{grid-template-rows:auto auto minmax(0,1fr) auto;}' +
      '.documents-admin__header{position:relative;padding:13px 12px 9px;gap:8px;}' +
      '.documents-admin__heading{gap:8px;}' +
      '.documents-admin__title{font-size:19px;}' +
      '.documents-admin__message{width:100%;font-size:12px;}' +
      '.documents-admin__dismiss{min-height:44px;padding:0 12px;font-size:12px;}' +
      '.documents-admin__navigation{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));margin:0;padding:6px 8px;gap:4px;border-top:1px solid #eef2f7;overflow:visible;}' +
      '.documents-admin__nav-button{min-width:0;min-height:44px;padding:0 5px;border-radius:8px;font-size:11px;line-height:1.15;white-space:normal;}' +
      '.documents-admin__nav-button:nth-child(-n+4){grid-column:span 3;}' +
      '.documents-admin__nav-button:nth-child(n+5){grid-column:span 4;}' +
      '.documents-admin__navigation[data-visible-count="6"] .documents-admin__nav-button:nth-child(-n+3){grid-column:span 4;}' +
      '.documents-admin__navigation[data-visible-count="6"] .documents-admin__nav-button:nth-child(n+4){grid-column:span 4;}' +
      '.documents-admin__nav-button::after{display:none;}' +
      '.documents-admin__nav-button.is-active{background:#eff6ff;color:#1d4ed8;}' +
      '.documents-admin__body{padding:10px 8px 14px;}' +
      '.documents-admin__users-view{gap:12px;}' +
      '.documents-admin__ai-settings{grid-template-columns:1fr;padding:14px;border-radius:11px;gap:7px;}' +
      '.documents-admin__ai-settings-hint,.documents-admin__ai-settings-select{grid-column:1;grid-row:auto;}' +
      '.documents-admin__groups{gap:3px;padding:3px;overflow:visible;}' +
      '.documents-admin__group-button{min-width:0;min-height:46px;padding:0 5px;gap:5px;font-size:11px;}' +
      '.documents-admin__group-count{min-width:21px;height:20px;padding:0 5px;font-size:10px;}' +
      '.documents-admin__toolbar{grid-template-columns:1fr 1fr;gap:9px;padding:14px;}' +
      '.documents-admin__section-heading{grid-column:1 / -1;font-size:18px;}' +
      '.documents-admin__search{grid-column:1 / -1;}' +
      '.documents-admin__filter-button,.documents-admin__add-row{width:100%;min-height:44px;padding:0 11px;}' +
      '.documents-admin__filter-panel{left:0;right:auto;width:min(260px,calc(100vw - 40px));}' +
      '.documents-admin__table-wrapper{max-height:58vh;max-height:58dvh;min-height:300px;touch-action:pan-x pan-y;}' +
      '.documents-admin__table-scroll-hint,.documents-admin__object-scroll-hint{display:flex;align-items:center;gap:7px;margin:0;padding:8px 12px;border-top:1px solid #eef2f7;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;}' +
      '.documents-admin__table-scroll-hint::before,.documents-admin__object-scroll-hint::before{content:"↔";color:#2563eb;font-size:15px;font-weight:900;}' +
      '.documents-admin__table-scroll-hint + .documents-admin__table-wrapper{border-top:0;}' +
      '.documents-admin__input,.documents-admin__filter-select,.documents-admin__filter-reset{min-height:44px;}' +
      '.documents-admin__row-menu-toggle{width:44px;height:44px;}' +
      '.documents-admin__row-menu-button,.documents-admin__object-selector-option{min-height:44px;box-sizing:border-box;}' +
      '.documents-admin__objects-workspace{min-height:0;border-radius:11px;}' +
      '.documents-admin__objects-panel-header{display:grid;grid-template-columns:1fr;padding:14px 13px 10px;}' +
      '.documents-admin__objects-create{grid-template-columns:minmax(0,1fr) auto;margin:0 13px 10px;padding:7px;box-sizing:border-box;}' +
      '.documents-admin__objects-input{width:100%;height:44px;padding:0 10px;border:1px solid #cbd5e1;opacity:1;pointer-events:auto;}' +
      '.documents-admin__objects-create-button{min-height:44px;white-space:nowrap;}' +
      '.documents-admin__objects-search{margin:0 13px 10px;}' +
      '.documents-admin__objects-search-input{height:44px;}' +
      '.documents-admin__objects-status{margin:0 13px 10px;}' +
      '.documents-admin__objects-list{padding:0 10px 10px;}' +
      '.documents-admin__object-list-item{flex-basis:min(260px,82vw);min-height:80px;padding:11px 13px;}' +
      '.documents-admin__object-head{grid-template-columns:1fr;padding:13px;gap:12px;}' +
      '.documents-admin__object-name{width:100%;height:44px;padding:0;font-size:19px;}' +
      '.documents-admin__object-head-actions{display:grid;grid-template-columns:1fr 1fr;width:100%;}' +
      '.documents-admin__object-save,.documents-admin__object-delete{min-height:44px;width:100%;}' +
      '.documents-admin__object-info{margin:12px 13px;}' +
      '.documents-admin__object-fields-title{padding:2px 13px 9px;}' +
      '.documents-admin__object-scroll-hint{margin:0 13px 8px;border:1px solid #e2e8f0;border-radius:8px;}' +
      '.documents-admin__object-columns{margin:0 13px;overflow-x:auto;scrollbar-gutter:stable;}' +
      '.documents-admin__object-columns-head,.documents-admin__object-column{min-width:880px;}' +
      '.documents-admin__object-column-group,.documents-admin__object-column-label,.documents-admin__object-column-type{height:44px;}' +
      '.documents-admin__object-column-move button,.documents-admin__object-column-remove{min-height:44px;}' +
      '.documents-admin__object-column-actions{margin:12px 13px 16px;}' +
      '.documents-admin__object-add-column,.documents-admin__object-apply-template{min-height:44px;}' +
      '.documents-template-modal__button,.documents-s3-modal__button,.documents-s3-modal__mini-button,.documents-admin__log-close,.documents-admin__log-copy{min-height:44px;}' +
      '.documents-admin__footer{padding:10px;flex-direction:column;align-items:stretch;gap:9px;}' +
      '.documents-admin__footer-status{font-size:12px;}' +
      '.documents-admin__footer-actions{display:grid;grid-template-columns:1fr 1fr;}' +
      '.documents-admin__close,.documents-admin__save{min-width:0;width:100%;min-height:44px;padding:0 10px;}' +
      '.documents-template-modal{padding:0;}' +
      '.documents-template-modal__panel{width:100%;border-radius:14px;padding:16px;}' +
      '.documents-template-modal__actions{display:grid;grid-template-columns:1fr;}' +
      '.documents-template-modal__button{width:100%;}' +
      '.documents-s3-modal{padding:0;}' +
      '.documents-s3-modal__panel{width:100%;height:auto;min-height:0;border-radius:14px;padding:14px;}' +
      '.documents-s3-modal__grid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
      '.documents-s3-modal__explorer-head{grid-template-columns:1fr auto;align-items:start;}' +
      '.documents-s3-modal__explorer-title{grid-column:1 / 2;}' +
      '.documents-s3-modal__explorer-path{grid-column:1 / -1;white-space:normal;overflow-wrap:anywhere;}' +
      '.documents-s3-modal__toolbar{grid-template-columns:1fr;}' +
      '.documents-s3-modal__table-wrap{overflow-x:auto;}' +
      '.documents-s3-modal__actions{display:grid;grid-template-columns:1fr;}' +
      '.documents-s3-modal__button{width:100%;}' +
      '.documents-s3-reader{padding:8px;align-items:flex-end;}' +
      '.documents-s3-reader__panel{width:100%;height:calc(100dvh - 16px);border-radius:14px;}' +
      '.documents-s3-reader__header{padding:12px;}' +
      '.documents-s3-reader__actions{display:grid;grid-template-columns:1fr;min-width:104px;}' +
      '.documents-s3-reader__actions .documents-s3-modal__mini-button{width:100%;}' +
      '.documents-s3-reader__body{padding:10px 12px 12px;}' +
      '.documents-ocr-admin__toolbar{grid-template-columns:1fr;}' +
      '.documents-ocr-admin__users-layout{grid-template-columns:1fr;overflow:auto;scrollbar-gutter:stable;}' +
      '.documents-ocr-admin__pane{min-height:420px;overflow:visible;}' +
      '.documents-ocr-admin__active{grid-template-columns:1fr;}' +
      '.documents-ocr-admin__active-state{justify-self:start;}' +
      '.documents-ocr-admin__tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;}' +
      '.documents-ocr-admin__tab{min-height:48px;padding:6px 8px;font-size:11px;line-height:1.2;}' +
      '.documents-admin__log-panel{min-height:0;padding:14px;border-radius:11px;}' +
      '.documents-admin__log-header{align-items:flex-start;}' +
      '.documents-admin__log-title{font-size:18px;}' +
      '.documents-admin__log-list{max-height:none;margin:12px 0;}' +
      '.documents-admin__log-row{align-items:flex-start;flex-direction:column;gap:4px;}' +
      '.documents-admin__log-row--muted{gap:3px;}' +
      '.documents-admin__log-name{white-space:normal;overflow-wrap:anywhere;}' +
      '.documents-admin__log-id{align-self:flex-start;}' +
      '}' +
      '@media (max-width:420px){' +
      '.documents-admin__title{font-size:17px;}' +
      '.documents-admin__dismiss{padding:0 9px;font-size:11px;}' +
      '.documents-admin__nav-button{padding:0 3px;font-size:10px;}' +
      '.documents-admin__group-button{min-height:56px;flex-direction:column;gap:2px;padding:4px 2px;font-size:10px;}' +
      '.documents-admin__toolbar{padding:12px 10px;gap:8px;}' +
      '.documents-admin__section-heading{font-size:17px;}' +
      '.documents-admin__objects-create{grid-template-columns:1fr;}' +
      '.documents-admin__object-column-actions{align-items:stretch;flex-direction:column;}' +
      '.documents-admin__object-apply-template{width:100%;}' +
      '.documents-admin__objects-create-button{width:100%;}' +
      '.documents-admin__object-info{font-size:11px;}' +
      '.documents-s3-modal__grid{grid-template-columns:1fr;}' +
      '.documents-s3-modal__explorer{min-height:360px;}' +
      '}' +
      '';
    document.head.appendChild(style);
  }

  function ensureAdminModal() {
    if (adminElements.modal) {
      return;
    }
    ensureAdminTemplateStyles();

    var modal = createElement('div', 'documents-admin');
    modal.id = 'documents-admin';
    modal.setAttribute('aria-hidden', 'true');

    var backdrop = createElement('div', 'documents-admin__backdrop');
    modal.appendChild(backdrop);

    var dialog = createElement('div', 'documents-admin__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'documents-admin-title');

    var header = createElement('header', 'documents-admin__header');
    var title = createElement('h2', 'documents-admin__title', 'Администратор документооборота');
    title.id = 'documents-admin-title';
    var heading = createElement('div', 'documents-admin__heading');
    heading.appendChild(title);
    var message = createElement('div', 'documents-admin__message');
    message.id = 'documents-admin-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    heading.appendChild(message);
    header.appendChild(heading);

    var dismiss = createElement('button', 'documents-admin__dismiss', '×  Закрыть');
    dismiss.type = 'button';
    header.appendChild(dismiss);
    dialog.appendChild(header);

    var navigation = createElement('nav', 'documents-admin__navigation');
    navigation.setAttribute('aria-label', 'Разделы администратора');
    var usersButton = createElement('button', 'documents-admin__nav-button is-active', 'Пользователи');
    usersButton.type = 'button';
    usersButton.dataset.adminNavigation = 'users';
    navigation.appendChild(usersButton);

    var objectsButton = createElement('button', 'documents-admin__nav-button documents-admin__objects-button', 'Объекты');
    objectsButton.type = 'button';
    objectsButton.dataset.adminNavigation = 'objects';
    navigation.appendChild(objectsButton);

    var templateButton = createElement('button', 'documents-admin__nav-button documents-admin__template-button', 'Шаблон');
    templateButton.type = 'button';
    templateButton.dataset.adminNavigation = 'template';
    navigation.appendChild(templateButton);

    var s3Button = createElement('button', 'documents-admin__nav-button documents-admin__s3-button', 'S3');
    s3Button.type = 'button';
    s3Button.dataset.adminNavigation = 's3';
    navigation.appendChild(s3Button);

    var ocrButton = createElement('button', 'documents-admin__nav-button documents-admin__ocr-button', 'OCR файлов');
    ocrButton.type = 'button';
    ocrButton.dataset.adminNavigation = 'ocr';
    navigation.appendChild(ocrButton);

    var cronManagementButton = createElement('button', 'documents-admin__nav-button documents-admin__cron-button', 'Cron');
    cronManagementButton.type = 'button';
    cronManagementButton.dataset.adminNavigation = 'cron';
    navigation.appendChild(cronManagementButton);

    var logButton = createElement('button', 'documents-admin__nav-button', 'Журнал');
    logButton.type = 'button';
    logButton.setAttribute('aria-expanded', 'false');
    logButton.dataset.adminNavigation = 'log';
    navigation.appendChild(logButton);
    dialog.appendChild(navigation);

    var body = createElement('div', 'documents-admin__body');

    adminElements.sections = {};

    var logPanel = createElement('section', 'documents-admin__log-panel');
    logPanel.setAttribute('aria-live', 'polite');
    logPanel.setAttribute('hidden', 'true');

    var logHeader = createElement('div', 'documents-admin__log-header');
    var logTitle = createElement('h3', 'documents-admin__log-title', 'Журнал посещений мини-приложения');
    var logClose = createElement('button', 'documents-admin__log-close', 'Скрыть журнал');
    logClose.type = 'button';
    logHeader.appendChild(logTitle);
    logHeader.appendChild(logClose);
    logPanel.appendChild(logHeader);

    var logStatus = createElement('div', 'documents-admin__log-status');
    logStatus.setAttribute('role', 'status');
    logPanel.appendChild(logStatus);

    var logList = createElement('ol', 'documents-admin__log-list');
    logPanel.appendChild(logList);

    var logTextarea = document.createElement('textarea');
    logTextarea.className = 'documents-admin__log-textarea';
    logTextarea.rows = 6;
    logTextarea.readOnly = true;
    logTextarea.setAttribute('aria-label', 'Список пользователей мини-приложения');
    logPanel.appendChild(logTextarea);

    var logCopy = createElement('button', 'documents-admin__log-copy', 'Скопировать список');
    logCopy.type = 'button';
    logPanel.appendChild(logCopy);

    var logHint = createElement('p', 'documents-admin__log-hint', 'В журнал попадает ФИО и Telegram ID каждого пользователя, открывшего мини-приложение.');
    logPanel.appendChild(logHint);

    body.appendChild(logPanel);

    var objectsView = createElement('div', 'documents-admin__objects-view');
    var objectsWorkspace = createElement('div', 'documents-admin__objects-workspace');
    var objectsPanel = createElement('aside', 'documents-admin__objects-panel');
    var objectsPanelHeader = createElement('div', 'documents-admin__objects-panel-header');
    var objectsPanelHeading = createElement('div');
    objectsPanelHeading.appendChild(createElement('h3', 'documents-admin__objects-heading', 'Объекты организации'));
    objectsPanelHeading.appendChild(createElement('p', 'documents-admin__objects-hint', 'Отдельные рабочие таблицы организации.'));
    objectsPanelHeader.appendChild(objectsPanelHeading);
    var objectsCreate = createElement('div', 'documents-admin__objects-create');
    var objectsNameInput = document.createElement('input');
    objectsNameInput.type = 'text';
    objectsNameInput.maxLength = 160;
    objectsNameInput.className = 'documents-admin__objects-input';
    objectsNameInput.placeholder = 'Название нового объекта';
    objectsNameInput.setAttribute('aria-label', 'Название нового объекта');
    var objectsCreateButton = createElement('button', 'documents-admin__objects-create-button', '+ Создать');
    objectsCreateButton.type = 'button';
    objectsCreateButton.disabled = true;
    objectsCreate.appendChild(objectsNameInput);
    objectsCreate.appendChild(objectsCreateButton);
    objectsPanel.appendChild(objectsPanelHeader);
    objectsPanel.appendChild(objectsCreate);
    var objectsSearch = createElement('label', 'documents-admin__objects-search');
    var objectsSearchInput = document.createElement('input');
    objectsSearchInput.type = 'search';
    objectsSearchInput.className = 'documents-admin__objects-search-input';
    objectsSearchInput.placeholder = 'Поиск объектов';
    objectsSearchInput.setAttribute('aria-label', 'Поиск объектов');
    objectsSearch.appendChild(objectsSearchInput);
    objectsPanel.appendChild(objectsSearch);
    var objectsStatus = createElement('div', 'documents-admin__objects-status');
    objectsStatus.setAttribute('role', 'status');
    objectsPanel.appendChild(objectsStatus);
    var objectsList = createElement('div', 'documents-admin__objects-list');
    objectsPanel.appendChild(objectsList);
    var objectsCount = createElement('div', 'documents-admin__objects-count', 'Всего объектов: 0');
    objectsPanel.appendChild(objectsCount);
    var objectsEditor = createElement('section', 'documents-admin__object-editor');
    objectsWorkspace.appendChild(objectsPanel);
    objectsWorkspace.appendChild(objectsEditor);
    objectsView.appendChild(objectsWorkspace);
    body.appendChild(objectsView);

    var usersView = createElement('div', 'documents-admin__users-view');

    var aiSettings = createElement('section', 'documents-admin__ai-settings');
    var aiSettingsLabel = createElement('label', 'documents-admin__ai-settings-label', 'Модель для «Кратко ИИ»');
    var aiProviderSelect = document.createElement('select');
    aiProviderSelect.className = 'documents-admin__ai-settings-select';
    aiProviderSelect.innerHTML = '' +
      '<option value="default">Основная модель из .env</option>' +
      '<option value="deepseek">DeepSeek</option>';
    aiSettingsLabel.htmlFor = 'documents-admin-ai-provider';
    aiProviderSelect.id = 'documents-admin-ai-provider';
    aiSettings.appendChild(aiSettingsLabel);
    aiSettings.appendChild(aiProviderSelect);
    aiSettings.appendChild(createElement(
      'p',
      'documents-admin__ai-settings-hint',
      'Выбор действует для веб-версии. В Telegram «Кратко ИИ» всегда использует DeepSeek; ключ DEEPSEEK_API_KEY хранится только в .env.'
    ));
    usersView.appendChild(aiSettings);

    var groups = createElement('div', 'documents-admin__groups');
    groups.setAttribute('role', 'tablist');
    var groupDefinitions = [
      { key: 'responsibles', label: 'Ответственные' },
      { key: 'block2', label: 'Директор' },
      { key: 'block3', label: 'Подчинённые' }
    ];
    groupDefinitions.forEach(function(definition, index) {
      var button = createElement('button', 'documents-admin__group-button' + (index === 0 ? ' is-active' : ''));
      button.type = 'button';
      button.dataset.adminSection = definition.key;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.appendChild(createElement('span', '', definition.label));
      var count = createElement('span', 'documents-admin__group-count', '0');
      count.dataset.adminSectionCount = definition.key;
      button.appendChild(count);
      groups.appendChild(button);
    });
    usersView.appendChild(groups);

    var usersCard = createElement('div', 'documents-admin__users-card');
    var toolbar = createElement('div', 'documents-admin__toolbar');
    var sectionHeading = createElement('h3', 'documents-admin__section-heading', 'Ответственные');
    toolbar.appendChild(sectionHeading);

    var search = createElement('label', 'documents-admin__search');
    var searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'documents-admin__search-input';
    searchInput.placeholder = 'Поиск по имени, логину или Telegram ID';
    searchInput.setAttribute('aria-label', 'Поиск пользователей');
    search.appendChild(searchInput);
    toolbar.appendChild(search);

    var filterWrap = createElement('div', 'documents-admin__filter-wrap');
    var filterButton = createElement('button', 'documents-admin__filter-button', 'Фильтры');
    filterButton.type = 'button';
    filterButton.setAttribute('aria-expanded', 'false');
    var filterPanel = createElement('div', 'documents-admin__filter-panel');
    filterPanel.hidden = true;

    function appendAdminFilter(labelText, filterKey, options) {
      var label = createElement('label', 'documents-admin__filter-field', labelText);
      var select = document.createElement('select');
      select.className = 'documents-admin__filter-select';
      select.dataset.adminFilter = filterKey;
      options.forEach(function(optionData) {
        var option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label;
        select.appendChild(option);
      });
      label.appendChild(select);
      filterPanel.appendChild(label);
    }

    var presenceOptions = [
      { value: 'all', label: 'Все' },
      { value: 'present', label: 'Заполнено' },
      { value: 'missing', label: 'Не заполнено' }
    ];
    appendAdminFilter('Telegram', 'telegram', presenceOptions);
    appendAdminFilter('Логин', 'login', presenceOptions);
    appendAdminFilter('Пароль', 'password', presenceOptions);
    var filterReset = createElement('button', 'documents-admin__filter-reset', 'Сбросить фильтры');
    filterReset.type = 'button';
    filterReset.dataset.adminFilterReset = '1';
    filterPanel.appendChild(filterReset);
    filterWrap.appendChild(filterButton);
    filterWrap.appendChild(filterPanel);
    toolbar.appendChild(filterWrap);

    var addRowButton = createElement('button', 'documents-admin__add-row', '+ Добавить');
    addRowButton.type = 'button';
    addRowButton.title = 'Добавить пользователя';
    toolbar.appendChild(addRowButton);
    usersCard.appendChild(toolbar);

    function buildAdminSection(key) {
      var includeCredentials = sectionHasCredentials(key);
      var section = createElement('section', 'documents-admin__section');
      section.dataset.adminSectionPanel = key;
      section.hidden = key !== 'responsibles';

      var tableWrapper = createElement('div', 'documents-admin__table-wrapper');
      var table = createElement('table', 'documents-admin__table');
      var headerCells = [
        '<th>№</th>',
        '<th>Сотрудник</th>',
        '<th>Должность</th>',
        '<th>ID Telegram</th>',
        '<th>ID чата</th>',
        '<th>Эл. почта</th>'
      ];
      if (includeCredentials) {
        headerCells.push('<th>Логин</th>');
        headerCells.push('<th>Пароль</th>');
      }
      headerCells.push('<th>Отдел</th>');
      headerCells.push('<th>Действия</th>');
      table.innerHTML = '' +
        '<thead>' +
        '  <tr>' + headerCells.join('') + '</tr>' +
        '</thead>' +
        '<tbody></tbody>';
      tableWrapper.appendChild(table);
      var tableScrollHint = createElement('div', 'documents-admin__table-scroll-hint', 'Проведите по таблице влево или вправо, чтобы увидеть все поля');
      section.appendChild(tableScrollHint);
      section.appendChild(tableWrapper);
      usersCard.appendChild(section);

      adminElements.sections[key] = {
        section: section,
        tableBody: table.querySelector('tbody')
      };
    }

    buildAdminSection('responsibles');
    buildAdminSection('block2');
    buildAdminSection('block3');

    var emptySearch = createElement('div', 'documents-admin__empty-search', 'По текущему поиску и фильтрам никого нет.');
    emptySearch.hidden = true;
    usersCard.appendChild(emptySearch);
    usersView.appendChild(usersCard);
    body.appendChild(usersView);

    dialog.appendChild(body);

    var footer = createElement('div', 'documents-admin__footer');
    var footerStatus = createElement('div', 'documents-admin__footer-status', 'Нет несохранённых изменений');
    footer.appendChild(footerStatus);
    var footerActions = createElement('div', 'documents-admin__footer-actions');
    var closeButton = createElement('button', 'documents-admin__close', 'Отменить');
    closeButton.type = 'button';
    var saveButton = createElement('button', 'documents-admin__save', 'Сохранить изменения');
    saveButton.type = 'button';
    footerActions.appendChild(closeButton);
    footerActions.appendChild(saveButton);
    footer.appendChild(footerActions);
    dialog.appendChild(footer);

    modal.appendChild(dialog);

    var templateModal = createElement('div', 'documents-template-modal');
    templateModal.setAttribute('aria-hidden', 'true');
    var templatePanel = createElement('div', 'documents-template-modal__panel');
    templatePanel.setAttribute('role', 'region');
    templatePanel.setAttribute('aria-labelledby', 'documents-template-title');
    var templateTitle = createElement('h3', 'documents-template-modal__title', 'Шаблон организации');
    templateTitle.id = 'documents-template-title';
    var templateSubtitle = createElement('p', 'documents-template-modal__subtitle', 'Здесь можно посмотреть текущий шаблон и загрузить новый файл .docx. Замена выполняется безопасно с индикатором прогресса.');
    var templateStatus = createElement('div', 'documents-template-modal__status');
    templateStatus.setAttribute('role', 'status');
    var templateCard = createElement('div', 'documents-template-modal__card');
    var templateName = createElement('div', 'documents-template-modal__name', 'Загружаем…');
    var templateMeta = createElement('div', 'documents-template-modal__meta', '');
    templateCard.appendChild(templateName);
    templateCard.appendChild(templateMeta);
    var templateActions = createElement('div', 'documents-template-modal__actions');
    var templateOpenButton = createElement('button', 'documents-template-modal__button documents-template-modal__button--primary', 'Просмотреть');
    templateOpenButton.type = 'button';
    var templateDownloadButton = createElement('button', 'documents-template-modal__button documents-template-modal__button--secondary', 'Скачать шаблон');
    templateDownloadButton.type = 'button';
    var templateUploadButton = createElement('button', 'documents-template-modal__button documents-template-modal__button--secondary', 'Загрузить новый шаблон');
    templateUploadButton.type = 'button';
    templateActions.appendChild(templateOpenButton);
    templateActions.appendChild(templateDownloadButton);
    templateActions.appendChild(templateUploadButton);
    var templateUploadInput = document.createElement('input');
    templateUploadInput.type = 'file';
    templateUploadInput.accept = '.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword';
    templateUploadInput.style.display = 'none';
    templatePanel.appendChild(templateTitle);
    templatePanel.appendChild(templateSubtitle);
    templatePanel.appendChild(templateStatus);
    templatePanel.appendChild(templateCard);
    templatePanel.appendChild(templateActions);
    templatePanel.appendChild(templateUploadInput);
    templateModal.appendChild(templatePanel);
    body.appendChild(templateModal);

    var s3Modal = createElement('div', 'documents-s3-modal');
    s3Modal.setAttribute('aria-hidden', 'true');
    var s3Panel = createElement('div', 'documents-s3-modal__panel');
    s3Panel.setAttribute('role', 'region');
    s3Panel.setAttribute('aria-labelledby', 'documents-s3-title');
    var s3Title = createElement('h3', 'documents-s3-modal__title', 'S3 холодное хранилище');
    s3Title.id = 'documents-s3-title';
    var s3Subtitle = createElement('p', 'documents-s3-modal__subtitle', 'Просмотр файлов, которые лежат в S3, и проверка загрузки новых вложений.');
    var s3Status = createElement('div', 'documents-s3-modal__status');
    s3Status.setAttribute('role', 'status');
    var s3Summary = createElement('div', 'documents-s3-modal__summary');
    var s3Actions = createElement('div', 'documents-s3-modal__actions');
    var s3RefreshButton = createElement('button', 'documents-s3-modal__button documents-s3-modal__button--secondary', 'Обновить');
    s3RefreshButton.type = 'button';
    var s3TestButton = createElement('button', 'documents-s3-modal__button documents-s3-modal__button--primary', 'Проверить загрузку');
    s3TestButton.type = 'button';
    s3Actions.appendChild(s3RefreshButton);
    s3Actions.appendChild(s3TestButton);
    s3Panel.appendChild(s3Title);
    s3Panel.appendChild(s3Subtitle);
    s3Panel.appendChild(s3Status);
    s3Panel.appendChild(s3Summary);
    s3Panel.appendChild(s3Actions);
    s3Modal.appendChild(s3Panel);
    body.appendChild(s3Modal);

    var ocrModal = createElement('div', 'documents-s3-modal documents-ocr-modal');
    ocrModal.setAttribute('aria-hidden', 'true');
    var ocrPanel = createElement('div', 'documents-s3-modal__panel documents-ocr-modal__panel');
    ocrPanel.setAttribute('role', 'region');
    ocrPanel.setAttribute('aria-labelledby', 'documents-ocr-title');
    var ocrTitle = createElement('h3', 'documents-s3-modal__title', 'OCR старых файлов и Telegram S3');
    ocrTitle.id = 'documents-ocr-title';
    var ocrSubtitle = createElement(
      'p',
      'documents-s3-modal__subtitle',
      'Одноразовый проход основных вложений задач. В каждый момент вычисляется строго один файл; готовность подтверждается контрольным чтением S3.'
    );
    var ocrStatus = createElement('div', 'documents-s3-modal__status');
    ocrStatus.setAttribute('role', 'status');
    ocrStatus.setAttribute('aria-live', 'polite');
    var ocrTabs = createElement('div', 'documents-ocr-admin__tabs');
    ocrTabs.setAttribute('role', 'tablist');
    var ocrBackfillTab = createElement('button', 'documents-ocr-admin__tab is-active', 'Проход старых файлов');
    ocrBackfillTab.type = 'button';
    ocrBackfillTab.setAttribute('role', 'tab');
    ocrBackfillTab.setAttribute('aria-selected', 'true');
    ocrBackfillTab.setAttribute('data-ocr-tab', 'backfill');
    var ocrUsersTab = createElement('button', 'documents-ocr-admin__tab', 'Пользователи / OCR в S3');
    ocrUsersTab.type = 'button';
    ocrUsersTab.setAttribute('role', 'tab');
    ocrUsersTab.setAttribute('aria-selected', 'false');
    ocrUsersTab.setAttribute('data-ocr-tab', 'users');
    ocrTabs.appendChild(ocrBackfillTab);
    ocrTabs.appendChild(ocrUsersTab);
    var ocrSummary = createElement('div', 'documents-ocr-admin__content');
    var ocrActions = createElement('div', 'documents-s3-modal__actions');
    var ocrRefreshButton = createElement('button', 'documents-s3-modal__button documents-s3-modal__button--secondary', 'Обновить');
    ocrRefreshButton.type = 'button';
    ocrRefreshButton.setAttribute('data-ocr-action', 'refresh');
    ocrActions.appendChild(ocrRefreshButton);
    ocrPanel.appendChild(ocrTitle);
    ocrPanel.appendChild(ocrSubtitle);
    ocrPanel.appendChild(ocrStatus);
    ocrPanel.appendChild(ocrTabs);
    ocrPanel.appendChild(ocrSummary);
    ocrPanel.appendChild(ocrActions);
    ocrModal.appendChild(ocrPanel);
    body.appendChild(ocrModal);

    var ocrTextReader = createElement('div', 'documents-s3-reader documents-ocr-text-reader');
    ocrTextReader.setAttribute('aria-hidden', 'true');
    var ocrTextReaderPanel = createElement('div', 'documents-s3-reader__panel');
    ocrTextReaderPanel.setAttribute('role', 'dialog');
    ocrTextReaderPanel.setAttribute('aria-modal', 'true');
    ocrTextReaderPanel.setAttribute('aria-labelledby', 'documents-ocr-text-title');
    var ocrTextReaderHeader = createElement('div', 'documents-s3-reader__header');
    var ocrTextReaderHeading = createElement('div');
    var ocrTextReaderTitle = createElement('h4', 'documents-s3-reader__title', 'OCR-текст из S3');
    ocrTextReaderTitle.id = 'documents-ocr-text-title';
    var ocrTextReaderMeta = createElement('div', 'documents-s3-reader__meta');
    ocrTextReaderHeading.appendChild(ocrTextReaderTitle);
    ocrTextReaderHeading.appendChild(ocrTextReaderMeta);
    var ocrTextReaderActions = createElement('div', 'documents-s3-reader__actions');
    var ocrTextReaderMore = createElement('button', 'documents-s3-modal__mini-button', 'Загрузить ещё');
    ocrTextReaderMore.type = 'button';
    ocrTextReaderMore.setAttribute('data-ocr-text-more', '1');
    ocrTextReaderMore.hidden = true;
    var ocrTextReaderClose = createElement('button', 'documents-s3-modal__mini-button', 'Закрыть');
    ocrTextReaderClose.type = 'button';
    ocrTextReaderClose.setAttribute('data-ocr-text-close', '1');
    ocrTextReaderActions.appendChild(ocrTextReaderMore);
    ocrTextReaderActions.appendChild(ocrTextReaderClose);
    ocrTextReaderHeader.appendChild(ocrTextReaderHeading);
    ocrTextReaderHeader.appendChild(ocrTextReaderActions);
    var ocrTextReaderStatus = createElement('div', 'documents-s3-reader__status');
    ocrTextReaderStatus.setAttribute('role', 'status');
    var ocrTextReaderBody = createElement('div', 'documents-s3-reader__body');
    var ocrTextReaderText = createElement('pre', 'documents-s3-reader__text');
    ocrTextReaderBody.appendChild(ocrTextReaderText);
    ocrTextReaderPanel.appendChild(ocrTextReaderHeader);
    ocrTextReaderPanel.appendChild(ocrTextReaderStatus);
    ocrTextReaderPanel.appendChild(ocrTextReaderBody);
    ocrTextReader.appendChild(ocrTextReaderPanel);
    document.body.appendChild(ocrTextReader);

    var cronManagementModal = createElement('div', 'documents-s3-modal documents-cron-modal');
    cronManagementModal.setAttribute('aria-hidden', 'true');
    var cronManagementPanel = createElement('div', 'documents-s3-modal__panel');
    cronManagementPanel.setAttribute('role', 'region');
    cronManagementPanel.setAttribute('aria-labelledby', 'documents-cron-title');
    var cronManagementTitle = createElement('h3', 'documents-s3-modal__title', 'Cron на сервере');
    cronManagementTitle.id = 'documents-cron-title';
    var cronManagementSubtitle = createElement('p', 'documents-s3-modal__subtitle', 'Здесь показаны только cron-команды документооборота, которые приложение умеет безопасно определить. Другие серверные cron не изменяются.');
    var cronManagementStatus = createElement('div', 'documents-s3-modal__status');
    cronManagementStatus.setAttribute('role', 'status');
    var cronManagementSummary = createElement('div', 'documents-s3-modal__summary');
    var cronManagementActions = createElement('div', 'documents-s3-modal__actions');
    var cronManagementRefreshButton = createElement('button', 'documents-s3-modal__button documents-s3-modal__button--secondary', 'Обновить');
    cronManagementRefreshButton.type = 'button';
    var cronManagementRemoveButton = createElement('button', 'documents-s3-modal__button documents-s3-modal__button--secondary', 'Удалить старый OCR-cron');
    cronManagementRemoveButton.type = 'button';
    cronManagementActions.appendChild(cronManagementRefreshButton);
    cronManagementActions.appendChild(cronManagementRemoveButton);
    cronManagementPanel.appendChild(cronManagementTitle);
    cronManagementPanel.appendChild(cronManagementSubtitle);
    cronManagementPanel.appendChild(cronManagementStatus);
    cronManagementPanel.appendChild(cronManagementSummary);
    cronManagementPanel.appendChild(cronManagementActions);
    cronManagementModal.appendChild(cronManagementPanel);
    body.appendChild(cronManagementModal);
    document.body.appendChild(modal);

    adminElements.modal = modal;
    adminElements.backdrop = backdrop;
    adminElements.dialog = dialog;
    adminElements.navigation = navigation;
    adminElements.usersButton = usersButton;
    adminElements.usersView = usersView;
    adminElements.objectsButton = objectsButton;
    adminElements.objectsView = objectsView;
    adminElements.objectsList = objectsList;
    adminElements.objectsEditor = objectsEditor;
    adminElements.objectsCount = objectsCount;
    adminElements.objectsSearchInput = objectsSearchInput;
    adminElements.objectsStatus = objectsStatus;
    adminElements.objectsNameInput = objectsNameInput;
    adminElements.objectsCreateButton = objectsCreateButton;
    adminElements.groups = groups;
    adminElements.usersCard = usersCard;
    adminElements.sectionHeading = sectionHeading;
    adminElements.searchInput = searchInput;
    adminElements.filterButton = filterButton;
    adminElements.filterPanel = filterPanel;
    adminElements.addRowButton = addRowButton;
    adminElements.emptySearch = emptySearch;
    adminElements.footer = footer;
    adminElements.footerStatus = footerStatus;
    adminElements.message = message;
    adminElements.saveButton = saveButton;
    adminElements.aiBriefProviderSelect = aiProviderSelect;
    adminElements.closeButton = closeButton;
    adminElements.logButton = logButton;
    adminElements.s3Button = s3Button;
    adminElements.s3Modal = s3Modal;
    adminElements.s3Status = s3Status;
    adminElements.s3Summary = s3Summary;
    adminElements.s3RefreshButton = s3RefreshButton;
    adminElements.s3TestButton = s3TestButton;
    adminElements.ocrButton = ocrButton;
    adminElements.ocrModal = ocrModal;
    adminElements.ocrStatus = ocrStatus;
    adminElements.ocrSummary = ocrSummary;
    adminElements.ocrTabs = ocrTabs;
    adminElements.ocrActions = ocrActions;
    adminElements.ocrTextReader = ocrTextReader;
    adminElements.cronManagementButton = cronManagementButton;
    adminElements.cronManagementModal = cronManagementModal;
    adminElements.cronManagementStatus = cronManagementStatus;
    adminElements.cronManagementSummary = cronManagementSummary;
    adminElements.cronManagementRefreshButton = cronManagementRefreshButton;
    adminElements.cronManagementRemoveButton = cronManagementRemoveButton;
    adminElements.templateButton = templateButton;
    adminElements.logPanel = logPanel;
    adminElements.logStatus = logStatus;
    adminElements.logList = logList;
    adminElements.logTextarea = logTextarea;
    adminElements.logCopyButton = logCopy;
    adminElements.logCloseButton = logClose;
    adminElements.templateModal = templateModal;
    adminElements.templateStatus = templateStatus;
    adminElements.templateName = templateName;
    adminElements.templateMeta = templateMeta;
    adminElements.templateOpenButton = templateOpenButton;
    adminElements.templateDownloadButton = templateDownloadButton;
    adminElements.templateUploadButton = templateUploadButton;
    adminElements.templateUploadInput = templateUploadInput;

    usersButton.addEventListener('click', function() {
      showAdminUsersView();
    });

    objectsButton.addEventListener('click', function() {
      showAdminObjectsView();
    });
    objectsCreateButton.addEventListener('click', createAdminObject);
    objectsNameInput.addEventListener('input', function() {
      objectsCreateButton.disabled = String(objectsNameInput.value || '').trim() === '';
    });
    objectsNameInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        createAdminObject();
      }
    });
    objectsList.addEventListener('click', handleAdminObjectsClick);
    objectsEditor.addEventListener('click', handleAdminObjectsClick);
    objectsEditor.addEventListener('input', handleAdminObjectEditorChange);
    objectsEditor.addEventListener('change', handleAdminObjectEditorChange);
    objectsSearchInput.addEventListener('input', function() {
      adminUiState.objectQuery = String(objectsSearchInput.value || '').trim().toLocaleLowerCase('ru-RU');
      renderAdminObjectList();
    });

    groups.addEventListener('click', function(event) {
      var button = event.target && event.target.closest
        ? event.target.closest('[data-admin-section]')
        : null;
      if (!button || !groups.contains(button)) {
        return;
      }
      setActiveAdminSection(button.dataset.adminSection);
    });

    searchInput.addEventListener('input', function() {
      adminUiState.query = searchInput.value || '';
      applyAdminRowFilters();
    });

    filterButton.addEventListener('click', function() {
      var shouldOpen = filterPanel.hidden;
      closeAdminRowMenus();
      filterPanel.hidden = !shouldOpen;
      filterButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    });

    filterPanel.addEventListener('change', function(event) {
      var select = event.target && event.target.closest
        ? event.target.closest('[data-admin-filter]')
        : null;
      if (!select || !filterPanel.contains(select)) {
        return;
      }
      adminUiState.filters[select.dataset.adminFilter] = select.value || 'all';
      applyAdminRowFilters();
      updateAdminFilterButtonState();
    });

    filterPanel.addEventListener('click', function(event) {
      var resetButton = event.target && event.target.closest
        ? event.target.closest('[data-admin-filter-reset]')
        : null;
      if (!resetButton || !filterPanel.contains(resetButton)) {
        return;
      }
      resetAdminFilters();
    });

    addRowButton.addEventListener('click', function() {
      adminUiState.query = '';
      searchInput.value = '';
      resetAdminFilters();
      addAdminRow(null, adminUiState.activeSection);
      markAdminDirty();
    });

    usersCard.addEventListener('click', handleAdminUsersCardClick);
    usersCard.addEventListener('input', handleAdminUsersCardInput);
    usersCard.addEventListener('change', handleAdminObjectSelectorChange);
    usersCard.addEventListener('scroll', function(event) {
      if (event.target && event.target.closest && event.target.closest('.documents-admin__row-menu')) {
        return;
      }
      closeAdminRowMenus();
    }, true);
    aiProviderSelect.addEventListener('change', markAdminDirty);

    closeButton.addEventListener('click', function() {
      closeAdminModal();
    });

    dismiss.addEventListener('click', function() {
      closeAdminModal();
    });

    templateButton.addEventListener('click', function() {
      closeAdminRowMenus();
      if (!prepareAdminInlineView('template')) {
        return;
      }
      openAdminTemplateModal();
      setAdminNavigation('template');
    });

    s3Button.addEventListener('click', function() {
      closeAdminRowMenus();
      if (!prepareAdminInlineView('s3')) {
        return;
      }
      openAdminS3Modal();
      setAdminNavigation('s3');
    });

    ocrButton.addEventListener('click', function() {
      closeAdminRowMenus();
      if (!prepareAdminInlineView('ocr')) {
        return;
      }
      openAdminOcrModal();
      if (ensureAdminOcrState().visible) {
        setAdminNavigation('ocr');
      } else {
        showAdminUsersView();
      }
    });

    ocrModal.addEventListener('click', handleAdminOcrClick);
    ocrModal.addEventListener('input', handleAdminOcrInput);
    ocrModal.addEventListener('change', handleAdminOcrChange);
    ocrTextReader.addEventListener('click', handleAdminOcrTextReaderClick);

    cronManagementButton.addEventListener('click', function() {
      closeAdminRowMenus();
      if (!prepareAdminInlineView('cron')) {
        return;
      }
      openCronManagementModal();
      setAdminNavigation('cron');
    });

    cronManagementRefreshButton.addEventListener('click', function() {
      fetchCronManagementStatus(false).catch(function() {});
    });

    cronManagementRemoveButton.addEventListener('click', function() {
      removeLegacyOcrCron();
    });

    logButton.addEventListener('click', function() {
      closeAdminRowMenus();
      showAdminLogView();
    });

    logClose.addEventListener('click', function() {
      closeAdminLogPanel();
    });

    logCopy.addEventListener('click', function() {
      copyAdminLogToClipboard();
    });

    s3RefreshButton.addEventListener('click', function() {
      refreshAdminS3Panel().catch(function() {});
    });

    s3TestButton.addEventListener('click', function() {
      runAdminS3Test();
    });

    s3Summary.addEventListener('click', function(event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-s3-path], [data-s3-up], [data-s3-copy], [data-s3-open-input], [data-s3-delete], [data-s3-read]')
        : null;
      if (!target || !s3Summary.contains(target)) {
        return;
      }
      var s3State = ensureAdminS3State();
      if (s3State.deleting || s3State.reading) {
        return;
      }
      if (target.hasAttribute('data-s3-read')) {
        readAdminS3File(target.getAttribute('data-s3-read') || '', target.getAttribute('data-s3-name') || '').catch(function() {});
        return;
      }
      if (target.hasAttribute('data-s3-copy')) {
        copyAdminS3TextToClipboard(target.getAttribute('data-s3-copy') || '', 'S3 key скопирован.');
        return;
      }
      if (target.hasAttribute('data-s3-open-input')) {
        var pathInput = s3Summary.querySelector('[data-s3-path-input]');
        var requestedPath = pathInput ? normalizeAdminS3BrowserPath(pathInput.value) : '';
        fetchAdminS3Listing(requestedPath, { force: true }).catch(function() {});
        return;
      }
      if (target.hasAttribute('data-s3-up')) {
        var parentPath = s3State.listing && typeof s3State.listing.parentPath === 'string'
          ? s3State.listing.parentPath
          : '';
        fetchAdminS3Listing(parentPath, { force: true }).catch(function() {});
        return;
      }
      if (target.hasAttribute('data-s3-delete')) {
        var deletePath = normalizeAdminS3BrowserPath(target.getAttribute('data-s3-delete') || '');
        var deleteType = target.getAttribute('data-s3-type') === 'directory' ? 'directory' : 'file';
        var deleteName = target.getAttribute('data-s3-name') || deletePath || 'объект';
        if (!deletePath) {
          setAdminS3Status('Корень S3 удалить нельзя.', 'error');
          return;
        }
        var deleteMessage = 'Удалить из S3 «' + deleteName + '»?';
        if (deleteType === 'directory') {
          deleteMessage += '\n\nПапка будет удалена вместе со всем содержимым.';
        }
        if (!window.confirm(deleteMessage)) {
          return;
        }
        deleteAdminS3Object(deletePath, deleteType).catch(function() {});
        return;
      }
      var nextPath = target.getAttribute('data-s3-path') || '';
      fetchAdminS3Listing(nextPath, { force: true }).catch(function() {});
    });

    s3Summary.addEventListener('input', function(event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-s3-filter-input]')
        : null;
      if (!target || !s3Summary.contains(target)) {
        return;
      }
      var s3State = ensureAdminS3State();
      s3State.listingFilter = target.value || '';
      applyAdminS3Filter(s3Summary, s3State.listingFilter);
    });

    s3Summary.addEventListener('keydown', function(event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-s3-path-input]')
        : null;
      if (!target || !s3Summary.contains(target) || event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      fetchAdminS3Listing(normalizeAdminS3BrowserPath(target.value), { force: true }).catch(function() {});
    });

    templateOpenButton.addEventListener('click', function() {
      openTemplateInOfficeViewer();
    });

    templateDownloadButton.addEventListener('click', function() {
      downloadCurrentTemplate();
    });

    templateUploadButton.addEventListener('click', function() {
      if (adminElements.templateUploadInput && !state.admin.template.uploading) {
        adminElements.templateUploadInput.click();
      }
    });

    templateUploadInput.addEventListener('change', function(event) {
      var fileList = event && event.target && event.target.files ? event.target.files : [];
      var file = fileList && fileList[0] ? fileList[0] : null;
      if (!file) {
        return;
      }
      uploadOrganizationTemplate(file);
      templateUploadInput.value = '';
    });

    saveButton.addEventListener('click', function() {
      handleAdminSave();
    });

    backdrop.addEventListener('click', function() {
      closeAdminModal();
    });

    updateAdminLogPanel();
  }

  function getAdminSection(sectionKey) {
    var key = sectionKey || 'responsibles';
    ensureAdminModal();
    if (!adminElements.sections || !adminElements.sections[key]) {
      return null;
    }
    return adminElements.sections[key];
  }

  function getAdminSectionLabel(sectionKey) {
    if (sectionKey === 'block2') {
      return 'Директор';
    }
    if (sectionKey === 'block3') {
      return 'Подчинённые';
    }
    return 'Ответственные';
  }

  function setAdminNavigation(key) {
    adminUiState.activeNavigation = key || 'users';
    if (!adminElements.navigation) {
      return;
    }
    adminElements.navigation.querySelectorAll('[data-admin-navigation]').forEach(function(button) {
      var isActive = button.dataset.adminNavigation === adminUiState.activeNavigation;
      button.classList.toggle('is-active', isActive);
      if (isActive) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }

  function setAdminObjectsStatus(message, isError) {
    if (!adminElements.objectsStatus) {
      return;
    }
    adminElements.objectsStatus.textContent = message || '';
    adminElements.objectsStatus.classList.toggle('is-visible', Boolean(message));
    adminElements.objectsStatus.classList.toggle('is-error', Boolean(message && isError));
  }

  function getActiveAdminObject() {
    var objects = state.objects && Array.isArray(state.objects.items) ? state.objects.items : [];
    var active = null;
    objects.some(function(object) {
      if (object && object.id === adminUiState.activeObjectId) {
        active = object;
        return true;
      }
      return false;
    });
    if (!active && objects.length) {
      active = objects[0];
      adminUiState.activeObjectId = active.id;
    }
    return active;
  }

  function renderAdminObjectList() {
    if (!adminElements.objectsList) {
      return;
    }
    var objects = state.objects && Array.isArray(state.objects.items) ? state.objects.items : [];
    var query = adminUiState.objectQuery || '';
    var visibleObjects = objects.filter(function(object) {
      return !query || String(object.name || '').toLocaleLowerCase('ru-RU').indexOf(query) !== -1;
    });
    adminElements.objectsList.innerHTML = '';
    if (adminElements.objectsCount) {
      adminElements.objectsCount.textContent = 'Всего объектов: ' + String(objects.length);
    }
    if (!visibleObjects.length) {
      adminElements.objectsList.appendChild(createElement(
        'div',
        'documents-admin__empty-search',
        objects.length ? 'По этому запросу объекты не найдены.' : 'Объекты ещё не созданы.'
      ));
      return;
    }
    visibleObjects.forEach(function(object) {
      var item = createElement('button', 'documents-admin__object-list-item');
      item.type = 'button';
      item.dataset.adminObjectAction = 'select';
      item.dataset.objectId = object.id;
      if (object.id === adminUiState.activeObjectId) {
        item.classList.add('is-active');
        item.setAttribute('aria-current', 'true');
      }
      item.appendChild(createElement('span', 'documents-admin__object-list-icon', '▦'));
      var copy = createElement('span', 'documents-admin__object-list-copy');
      copy.appendChild(createElement('span', 'documents-admin__object-list-name', object.name));
      copy.appendChild(createElement('span', 'documents-admin__object-list-meta', 'Строк в таблице: ' + String(object.rowsCount || 0)));
      copy.appendChild(createElement('span', 'documents-admin__object-list-status', 'Активен'));
      item.appendChild(copy);
      item.appendChild(createElement('span', 'documents-admin__object-list-arrow', '›'));
      adminElements.objectsList.appendChild(item);
    });
  }

  function renderAdminObjectEditor() {
    if (!adminElements.objectsEditor) {
      return;
    }
    adminElements.objectsEditor.innerHTML = '';
    var object = getActiveAdminObject();
    if (!object) {
      adminElements.objectsEditor.appendChild(createElement(
        'div',
        'documents-admin__object-editor-empty',
        'Создайте первый объект — здесь появится настройка его таблицы.'
      ));
      return;
    }
    var card = createElement('article', 'documents-admin__object-card');
    card.dataset.objectId = object.id;
    card.dataset.objectName = object.name;
    card.dataset.schemaRevision = String(object.schemaRevision || 1);
    card.dataset.removedColumnIds = '[]';
    var head = createElement('div', 'documents-admin__object-head');
    var headingCopy = createElement('div', 'documents-admin__object-heading-copy');
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 160;
    nameInput.className = 'documents-admin__object-name';
    nameInput.value = object.name;
    nameInput.setAttribute('aria-label', 'Название объекта');
    headingCopy.appendChild(nameInput);
    var headingMeta = createElement('div', 'documents-admin__object-heading-meta');
    headingMeta.appendChild(createElement('span', 'documents-admin__object-active', 'Активен'));
    headingMeta.appendChild(createElement(
      'span',
      'documents-admin__object-meta',
      'Столбцов: ' + String(object.columns.length) + ' • строк: ' + String(object.rowsCount || 0)
    ));
    headingCopy.appendChild(headingMeta);
    head.appendChild(headingCopy);
    var headActions = createElement('div', 'documents-admin__object-head-actions');
    var saveButton = createElement('button', 'documents-admin__object-save', 'Сохранить');
    saveButton.type = 'button';
    saveButton.disabled = true;
    saveButton.dataset.adminObjectAction = 'save';
    headActions.appendChild(saveButton);
    var deleteButton = createElement('button', 'documents-admin__object-delete', 'Удалить');
    deleteButton.type = 'button';
    deleteButton.title = 'Удалить объект без возможности восстановления';
    deleteButton.dataset.adminObjectAction = 'delete';
    headActions.appendChild(deleteButton);
    head.appendChild(headActions);
    card.appendChild(head);
    card.appendChild(createElement(
      'div',
      'documents-admin__object-info',
      'Настройте отдельную таблицу объекта. Одинаковая группа у соседних столбцов объединит их в двухуровневой шапке.'
    ));
    card.appendChild(createElement('h4', 'documents-admin__object-fields-title', 'Поля таблицы'));
    card.appendChild(createElement(
      'div',
      'documents-admin__object-scroll-hint',
      'Проведите таблицу влево или вправо, чтобы увидеть все настройки'
    ));
    var columns = createElement('div', 'documents-admin__object-columns');
    var columnsHead = createElement('div', 'documents-admin__object-columns-head');
    columnsHead.appendChild(createElement('span', '', 'Порядок'));
    columnsHead.appendChild(createElement('span', '', 'Группа шапки'));
    columnsHead.appendChild(createElement('span', '', 'Название столбца'));
    columnsHead.appendChild(createElement('span', '', 'Тип'));
    columnsHead.appendChild(createElement('span', '', 'Действия'));
    columns.appendChild(columnsHead);
    var columnsRows = createElement('div', 'documents-admin__object-column-rows');
    object.columns.forEach(function(column, index) {
      columnsRows.appendChild(createAdminObjectColumn(column, index));
    });
    updateAdminObjectColumnMoveButtons(columnsRows);
    columns.appendChild(columnsRows);
    card.appendChild(columns);
    var columnActions = createElement('div', 'documents-admin__object-column-actions');
    var applyTemplateButton = createElement('button', 'documents-admin__object-apply-template', 'Применить шаблон «Переписка»');
    applyTemplateButton.type = 'button';
    applyTemplateButton.dataset.adminObjectAction = 'apply-correspondence-template';
    columnActions.appendChild(applyTemplateButton);
    var addColumnButton = createElement('button', 'documents-admin__object-add-column', '+ Добавить столбец');
    addColumnButton.type = 'button';
    addColumnButton.dataset.adminObjectAction = 'add-column';
    columnActions.appendChild(addColumnButton);
    card.appendChild(columnActions);
    adminElements.objectsEditor.appendChild(card);
  }

  function renderAdminObjects() {
    getActiveAdminObject();
    renderAdminObjectList();
    renderAdminObjectEditor();
  }

  function markAdminObjectCardDirty(card) {
    if (!card) {
      return;
    }
    card.classList.add('is-dirty');
    var saveButton = card.querySelector('[data-admin-object-action="save"]');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }

  function handleAdminObjectEditorChange(event) {
    var card = event.target && event.target.closest ? event.target.closest('.documents-admin__object-card') : null;
    if (card && adminElements.objectsEditor && adminElements.objectsEditor.contains(card)) {
      markAdminObjectCardDirty(card);
    }
  }

  function createAdminObjectColumn(column, index) {
    var row = createElement('div', 'documents-admin__object-column');
    row.dataset.columnId = column && column.id ? String(column.id) : '';
    var move = createElement('div', 'documents-admin__object-column-move');
    var up = createElement('button', '', '↑');
    up.type = 'button';
    up.title = 'Переместить выше';
    up.dataset.adminObjectAction = 'column-up';
    up.disabled = index === 0;
    var down = createElement('button', '', '↓');
    down.type = 'button';
    down.title = 'Переместить ниже';
    down.dataset.adminObjectAction = 'column-down';
    move.appendChild(up);
    move.appendChild(down);
    row.appendChild(move);
    var groupInput = document.createElement('input');
    groupInput.type = 'text';
    groupInput.maxLength = 120;
    groupInput.className = 'documents-admin__object-column-group';
    groupInput.value = column && column.group ? String(column.group) : '';
    groupInput.placeholder = 'Необязательно';
    groupInput.setAttribute('aria-label', 'Группа заголовка столбца');
    row.appendChild(groupInput);
    var labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.maxLength = 120;
    labelInput.className = 'documents-admin__object-column-label';
    labelInput.value = column && column.label ? String(column.label) : '';
    labelInput.placeholder = 'Название столбца';
    row.appendChild(labelInput);
    var typeSelect = document.createElement('select');
    typeSelect.className = 'documents-admin__object-column-type';
    [['text', 'Текст'], ['date', 'Дата']].forEach(function(optionData) {
      var option = document.createElement('option');
      option.value = optionData[0];
      option.textContent = optionData[1];
      typeSelect.appendChild(option);
    });
    typeSelect.value = column && column.type === 'date' ? 'date' : 'text';
    row.appendChild(typeSelect);
    var remove = createElement('button', 'documents-admin__object-column-remove', 'Удалить');
    remove.type = 'button';
    remove.title = 'Удалить столбец и его значения после сохранения';
    remove.dataset.adminObjectAction = 'remove-column';
    row.appendChild(remove);
    return row;
  }

  function collectAdminObjectColumns(card) {
    var columns = [];
    card.querySelectorAll('.documents-admin__object-column').forEach(function(row) {
      var groupInput = row.querySelector('.documents-admin__object-column-group');
      var labelInput = row.querySelector('.documents-admin__object-column-label');
      var typeSelect = row.querySelector('.documents-admin__object-column-type');
      var label = labelInput ? String(labelInput.value || '').trim() : '';
      if (!label) {
        return;
      }
      columns.push({
        id: row.dataset.columnId || '',
        group: groupInput ? String(groupInput.value || '').trim() : '',
        label: label,
        type: typeSelect && typeSelect.value === 'date' ? 'date' : 'text'
      });
    });
    return columns;
  }

  function applyCorrespondenceObjectTemplate(card, columnsContainer) {
    if (!card || !columnsContainer) {
      return;
    }
    var hasCurrentColumns = columnsContainer.children.length > 0;
    if (hasCurrentColumns && !window.confirm(
      'Заменить текущие столбцы шаблоном «Переписка»? Значения удалённых столбцов будут удалены после сохранения объекта.'
    )) {
      return;
    }
    var confirmedRemovedColumnIds = getConfirmedRemovedAdminObjectColumnIds(card);
    columnsContainer.querySelectorAll('.documents-admin__object-column').forEach(function(row) {
      var columnId = String(row.dataset.columnId || '');
      if (columnId && confirmedRemovedColumnIds.indexOf(columnId) === -1) {
        confirmedRemovedColumnIds.push(columnId);
      }
    });
    card.dataset.removedColumnIds = JSON.stringify(confirmedRemovedColumnIds);
    columnsContainer.innerHTML = '';
    CORRESPONDENCE_OBJECT_COLUMNS.forEach(function(column, index) {
      columnsContainer.appendChild(createAdminObjectColumn(column, index));
    });
    updateAdminObjectColumnMoveButtons(columnsContainer);
    markAdminObjectCardDirty(card);
  }

  function getConfirmedRemovedAdminObjectColumnIds(card) {
    try {
      var parsed = JSON.parse(card.dataset.removedColumnIds || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
      return [];
    }
  }

  function updateAdminObjectColumnMoveButtons(columnsContainer) {
    if (!columnsContainer) {
      return;
    }
    var rows = Array.prototype.slice.call(columnsContainer.children);
    rows.forEach(function(row, index) {
      var up = row.querySelector('[data-admin-object-action="column-up"]');
      var down = row.querySelector('[data-admin-object-action="column-down"]');
      if (up) {
        up.disabled = index === 0;
      }
      if (down) {
        down.disabled = index === rows.length - 1;
      }
    });
  }

  function createAdminObject() {
    var name = adminElements.objectsNameInput ? String(adminElements.objectsNameInput.value || '').trim() : '';
    if (!name) {
      setAdminObjectsStatus('Введите название объекта.', true);
      if (adminElements.objectsNameInput) {
        adminElements.objectsNameInput.focus();
      }
      return;
    }
    adminElements.objectsCreateButton.disabled = true;
    setAdminObjectsStatus('Создаём объект...', false);
    fetch(buildApiUrl('object_create'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization: state.organization, name: name })
    })
      .then(handleResponse)
      .then(function(data) {
        adminElements.objectsNameInput.value = '';
        adminUiState.objectQuery = '';
        if (adminElements.objectsSearchInput) {
          adminElements.objectsSearchInput.value = '';
        }
        adminUiState.activeObjectId = data && data.object ? String(data.object.id || '') : '';
        return refreshObjects().then(function() {
          renderAdminObjects();
          refreshAdminObjectSelectors();
          setAdminObjectsStatus(data.message || 'Объект создан.', false);
        });
      })
      .catch(function(error) {
        setAdminObjectsStatus(error.message || 'Не удалось создать объект.', true);
      })
      .finally(function() {
        adminElements.objectsCreateButton.disabled = !String(adminElements.objectsNameInput.value || '').trim();
      });
  }

  function saveAdminObject(card) {
    var nameInput = card.querySelector('.documents-admin__object-name');
    var name = nameInput ? String(nameInput.value || '').trim() : '';
    if (!name) {
      setAdminObjectsStatus('Название объекта не может быть пустым.', true);
      return;
    }
    var hasEmptyColumnLabel = Array.prototype.some.call(
      card.querySelectorAll('.documents-admin__object-column-label'),
      function(input) { return String(input.value || '').trim() === ''; }
    );
    if (hasEmptyColumnLabel) {
      setAdminObjectsStatus('Укажите название каждого столбца или удалите пустой столбец кнопкой.', true);
      return;
    }
    var saveButton = card.querySelector('[data-admin-object-action="save"]');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохраняем…';
    }
    fetch(buildApiUrl('object_schema_save'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization: state.organization,
        objectId: card.dataset.objectId || '',
        schemaRevision: Number(card.dataset.schemaRevision) || 0,
        name: name,
        columns: collectAdminObjectColumns(card),
        confirmedRemovedColumnIds: getConfirmedRemovedAdminObjectColumnIds(card)
      })
    })
      .then(handleResponse)
      .then(function(data) {
        adminUiState.activeObjectId = card.dataset.objectId || adminUiState.activeObjectId;
        return refreshObjects().then(function() {
          renderAdminObjects();
          refreshAdminObjectSelectors();
          setAdminObjectsStatus(data.message || 'Объект сохранён.', false);
        });
      })
      .catch(function(error) {
        setAdminObjectsStatus((error.message || 'Не удалось сохранить объект.') + (error.status === 409 ? ' Обновите вкладку «Объекты».' : ''), true);
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = 'Сохранить';
        }
      });
  }

  function deleteAdminObject(card) {
    var name = String(card.dataset.objectName || '').trim();
    var confirmation = window.prompt('Удаление необратимо. Введите точное название объекта «' + name + '»:');
    if (confirmation === null) {
      return;
    }
    if (confirmation !== name) {
      setAdminObjectsStatus('Название введено неверно. Объект не удалён.', true);
      return;
    }
    var deletedObjectId = card.dataset.objectId || '';
    setAdminObjectsStatus('Удаляем объект и его таблицу...', false);
    fetch(buildApiUrl('object_delete'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization: state.organization, objectId: deletedObjectId, confirmName: confirmation })
    })
      .then(handleResponse)
      .then(function(data) {
        adminUiState.activeObjectId = '';
        if (Array.isArray(state.documents)) {
          state.documents.forEach(function(documentRecord) {
            if (!documentRecord || String(documentRecord.objectId || '') !== deletedObjectId) {
              return;
            }
            delete documentRecord.objectId;
            try {
              delete documentRecord.__docsFilterValuesCache;
            } catch (error) {
              documentRecord.__docsFilterValuesCache = null;
            }
          });
          state.filterValuesCacheVersion = (Number(state.filterValuesCacheVersion) || 0) + 1;
        }
        return Promise.all([refreshObjects(), fetchAdminSettings()]).then(function() {
          renderAdminObjects();
          renderAdminRows('responsibles', state.admin.settings.responsibles, false);
          renderAdminRows('block2', state.admin.settings.block2, false);
          renderAdminRows('block3', state.admin.settings.block3, false);
          if (typeof updateTable === 'function') {
            updateTable();
          }
          setAdminObjectsStatus(data.message || 'Объект удалён.', false);
        });
      })
      .catch(function(error) {
        setAdminObjectsStatus(error.message || 'Не удалось удалить объект.', true);
      });
  }

  function handleAdminObjectsClick(event) {
    var action = event.target && event.target.closest ? event.target.closest('[data-admin-object-action]') : null;
    if (!action || (!adminElements.objectsList.contains(action) && !adminElements.objectsEditor.contains(action))) {
      return;
    }
    var actionName = action.dataset.adminObjectAction || '';
    if (actionName === 'select') {
      var nextObjectId = action.dataset.objectId || '';
      var currentCard = adminElements.objectsEditor.querySelector('.documents-admin__object-card.is-dirty');
      if (currentCard && currentCard.dataset.objectId !== nextObjectId
        && !window.confirm('Есть несохранённые изменения объекта. Переключиться без сохранения?')
      ) {
        return;
      }
      adminUiState.activeObjectId = nextObjectId;
      renderAdminObjects();
      return;
    }
    var card = action.closest('.documents-admin__object-card');
    if (!card) {
      return;
    }
    if (actionName === 'save') {
      saveAdminObject(card);
      return;
    }
    if (actionName === 'delete') {
      deleteAdminObject(card);
      return;
    }
    var columnRow = action.closest('.documents-admin__object-column');
    var columnsContainer = card.querySelector('.documents-admin__object-column-rows');
    if (actionName === 'apply-correspondence-template' && columnsContainer) {
      applyCorrespondenceObjectTemplate(card, columnsContainer);
    } else if (actionName === 'add-column' && columnsContainer) {
      if (columnsContainer.children.length >= ADMIN_OBJECT_MAX_COLUMNS) {
        setAdminObjectsStatus('В одном объекте можно создать не более 50 столбцов.', true);
        return;
      }
      columnsContainer.appendChild(createAdminObjectColumn({ id: '', group: '', label: '', type: 'text' }, columnsContainer.children.length));
      markAdminObjectCardDirty(card);
      updateAdminObjectColumnMoveButtons(columnsContainer);
      var newInput = columnsContainer.lastElementChild.querySelector('.documents-admin__object-column-label');
      if (newInput) {
        newInput.focus();
      }
    } else if (actionName === 'remove-column' && columnRow) {
      if (window.confirm('Удалить столбец? Все данные этого столбца будут удалены после сохранения объекта.')) {
        var removedColumnId = String(columnRow.dataset.columnId || '');
        if (removedColumnId) {
          var confirmedRemovedColumnIds = getConfirmedRemovedAdminObjectColumnIds(card);
          if (confirmedRemovedColumnIds.indexOf(removedColumnId) === -1) {
            confirmedRemovedColumnIds.push(removedColumnId);
          }
          card.dataset.removedColumnIds = JSON.stringify(confirmedRemovedColumnIds);
        }
        columnRow.remove();
        markAdminObjectCardDirty(card);
        updateAdminObjectColumnMoveButtons(columnsContainer);
      }
    } else if (actionName === 'column-up' && columnRow && columnRow.previousElementSibling) {
      columnsContainer.insertBefore(columnRow, columnRow.previousElementSibling);
      markAdminObjectCardDirty(card);
      updateAdminObjectColumnMoveButtons(columnsContainer);
    } else if (actionName === 'column-down' && columnRow && columnRow.nextElementSibling) {
      columnsContainer.insertBefore(columnRow.nextElementSibling, columnRow);
      markAdminObjectCardDirty(card);
      updateAdminObjectColumnMoveButtons(columnsContainer);
    }
  }

  function showAdminObjectsView() {
    if (adminUiState.dirty && !window.confirm('Есть несохранённые изменения пользователей. Закрыть их без сохранения?')) {
      return;
    }
    if (adminUiState.dirty) {
      renderAdminRows('responsibles', state.admin.settings.responsibles, false);
      renderAdminRows('block2', state.admin.settings.block2, false);
      renderAdminRows('block3', state.admin.settings.block3, false);
    }
    clearAdminDirtyState();
    prepareAdminInlineView('objects');
    if (adminElements.objectsView) {
      adminElements.objectsView.classList.add('is-visible');
    }
    setAdminNavigation('objects');
    setAdminObjectsStatus(state.objects.loaded ? '' : 'Загружаем объекты...', false);
    refreshObjects()
      .then(function() {
        renderAdminObjects();
        setAdminObjectsStatus('', false);
      })
      .catch(function(error) {
        setAdminObjectsStatus(error.message || 'Не удалось загрузить объекты.', true);
      });
  }

  function confirmLeaveAdminObjectEditor(nextViewKey) {
    if (adminUiState.activeNavigation !== 'objects' || nextViewKey === 'objects' || !adminElements.objectsEditor) {
      return true;
    }
    if (!adminElements.objectsEditor.querySelector('.documents-admin__object-card.is-dirty')) {
      return true;
    }
    return window.confirm('Есть несохранённые изменения объекта. Перейти без сохранения?');
  }

  function showAdminUsersView() {
    ensureAdminModal();
    if (!confirmLeaveAdminObjectEditor('users')) {
      return;
    }
    closeAdminTemplateModal({ skipFocus: true });
    closeAdminS3Modal({ skipFocus: true });
    closeAdminOcrModal({ skipFocus: true });
    closeCronManagementModal(false);
    ensureAdminUserLogState().visible = false;
    if (adminElements.logPanel) {
      adminElements.logPanel.hidden = true;
    }
    if (adminElements.logButton) {
      adminElements.logButton.setAttribute('aria-expanded', 'false');
    }
    if (adminElements.usersView) {
      adminElements.usersView.hidden = false;
    }
    if (adminElements.objectsView) {
      adminElements.objectsView.classList.remove('is-visible');
    }
    if (adminElements.footer) {
      adminElements.footer.hidden = false;
    }
    setAdminNavigation('users');
    setActiveAdminSection(adminUiState.activeSection);
  }

  function prepareAdminInlineView(viewKey) {
    ensureAdminModal();
    if (!confirmLeaveAdminObjectEditor(viewKey)) {
      return false;
    }
    if (viewKey !== 'template') {
      closeAdminTemplateModal({ skipFocus: true });
    }
    if (viewKey !== 's3') {
      closeAdminS3Modal({ skipFocus: true });
    }
    if (viewKey !== 'ocr') {
      closeAdminOcrModal({ skipFocus: true });
    }
    if (viewKey !== 'cron') {
      closeCronManagementModal(false);
    }
    ensureAdminUserLogState().visible = false;
    updateAdminLogPanel();
    if (adminElements.usersView) {
      adminElements.usersView.hidden = true;
    }
    if (adminElements.objectsView) {
      adminElements.objectsView.classList.remove('is-visible');
    }
    if (adminElements.footer) {
      adminElements.footer.hidden = true;
    }
    setAdminNavigation(viewKey);
    return true;
  }

  function showAdminLogView() {
    if (!prepareAdminInlineView('log')) {
      return;
    }
    openAdminLogPanel();
    setAdminNavigation('log');
  }

  function setActiveAdminSection(sectionKey) {
    var key = sectionKey === 'block2' || sectionKey === 'block3' ? sectionKey : 'responsibles';
    adminUiState.activeSection = key;
    if (adminElements.groups) {
      adminElements.groups.querySelectorAll('[data-admin-section]').forEach(function(button) {
        var isActive = button.dataset.adminSection === key;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
    if (adminElements.sections) {
      Object.keys(adminElements.sections).forEach(function(sectionName) {
        var section = adminElements.sections[sectionName];
        if (section && section.section) {
          section.section.hidden = sectionName !== key;
        }
      });
    }
    if (adminElements.sectionHeading) {
      adminElements.sectionHeading.textContent = getAdminSectionLabel(key);
    }
    closeAdminRowMenus();
    applyAdminRowFilters();
  }

  function adminRowHasContent(row) {
    if (!row) {
      return false;
    }
    var fields = ['responsible', 'position', 'telegram', 'chatId', 'email', 'login', 'department', 'note'];
    return fields.some(function(field) {
      var input = row.querySelector('input[data-field="' + field + '"]');
      return Boolean(input && String(input.value || '').trim());
    });
  }

  function updateAdminSectionCounts() {
    if (!adminElements.sections || !adminElements.groups) {
      return;
    }
    Object.keys(adminElements.sections).forEach(function(sectionKey) {
      var section = adminElements.sections[sectionKey];
      var count = 0;
      if (section && section.tableBody) {
        section.tableBody.querySelectorAll('tr').forEach(function(row) {
          if (adminRowHasContent(row)) {
            count += 1;
          }
        });
      }
      var countElement = adminElements.groups.querySelector('[data-admin-section-count="' + sectionKey + '"]');
      if (countElement) {
        countElement.textContent = String(count);
      }
    });
  }

  function normalizeAdminSearchValue(value) {
    return String(value || '').trim().toLocaleLowerCase('ru');
  }

  function adminRowMatchesPresence(row, field, filterValue) {
    if (filterValue === 'all') {
      return true;
    }
    var hasValue = false;
    if (field === 'password') {
      var passwordInput = row.querySelector('input[data-field="password"]');
      hasValue = Boolean(row.dataset.passwordHash || (passwordInput && String(passwordInput.value || '').trim()));
    } else {
      var input = row.querySelector('input[data-field="' + field + '"]');
      hasValue = Boolean(input && String(input.value || '').trim());
    }
    return filterValue === 'present' ? hasValue : !hasValue;
  }

  function applyAdminRowFilters() {
    var section = adminElements.sections && adminElements.sections[adminUiState.activeSection]
      ? adminElements.sections[adminUiState.activeSection]
      : null;
    if (!section || !section.tableBody) {
      return;
    }
    var query = normalizeAdminSearchValue(adminUiState.query);
    var visibleCount = 0;
    section.tableBody.querySelectorAll('tr').forEach(function(row) {
      var responsible = row.querySelector('input[data-field="responsible"]');
      var login = row.querySelector('input[data-field="login"]');
      var telegram = row.querySelector('input[data-field="telegram"]');
      var searchable = normalizeAdminSearchValue([
        responsible ? responsible.value : '',
        login ? login.value : '',
        telegram ? telegram.value : ''
      ].join(' '));
      var matches = (!query || searchable.indexOf(query) !== -1)
        && adminRowMatchesPresence(row, 'telegram', adminUiState.filters.telegram)
        && adminRowMatchesPresence(row, 'login', adminUiState.filters.login)
        && adminRowMatchesPresence(row, 'password', adminUiState.filters.password);
      row.hidden = !matches;
      if (matches) {
        visibleCount += 1;
      }
    });
    if (adminElements.emptySearch) {
      adminElements.emptySearch.hidden = visibleCount !== 0;
    }
  }

  function updateAdminFilterButtonState() {
    if (!adminElements.filterButton) {
      return;
    }
    var hasFilters = Object.keys(adminUiState.filters).some(function(key) {
      return adminUiState.filters[key] !== 'all';
    });
    adminElements.filterButton.classList.toggle('is-active', hasFilters);
  }

  function resetAdminFilters() {
    adminUiState.filters.telegram = 'all';
    adminUiState.filters.login = 'all';
    adminUiState.filters.password = 'all';
    if (adminElements.filterPanel) {
      adminElements.filterPanel.querySelectorAll('[data-admin-filter]').forEach(function(select) {
        select.value = 'all';
      });
    }
    updateAdminFilterButtonState();
    applyAdminRowFilters();
  }

  function markAdminDirty() {
    adminUiState.dirty = true;
    if (adminElements.footerStatus) {
      adminElements.footerStatus.textContent = 'Есть несохранённые изменения';
      adminElements.footerStatus.classList.add('is-dirty');
    }
  }

  function clearAdminDirtyState() {
    adminUiState.dirty = false;
    if (adminElements.footerStatus) {
      adminElements.footerStatus.textContent = 'Нет несохранённых изменений';
      adminElements.footerStatus.classList.remove('is-dirty');
    }
  }

  function refreshAdminPasswordState(row) {
    if (!row) {
      return;
    }
    var passwordInput = row.querySelector('input[data-field="password"]');
    var clearButton = row.querySelector('[data-admin-row-action="clear-password"]');
    var hasPassword = Boolean(row.dataset.passwordHash || (passwordInput && String(passwordInput.value || '').trim()));
    if (passwordInput) {
      passwordInput.placeholder = row.dataset.passwordHash
        ? 'Оставьте пустым'
        : 'Введите пароль';
    }
    if (clearButton) {
      clearButton.disabled = !hasPassword;
    }
  }

  function getAdminRowObjectIds(row) {
    if (!row || !row.dataset || !row.dataset.objectIds) {
      return [];
    }
    try {
      var parsed = JSON.parse(row.dataset.objectIds);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
      return [];
    }
  }

  function setAdminRowObjectIds(row, objectIds) {
    if (!row || !row.dataset) {
      return;
    }
    var normalized = [];
    var seen = Object.create(null);
    (Array.isArray(objectIds) ? objectIds : []).forEach(function(objectId) {
      var id = String(objectId || '');
      if (!/^obj_[a-f0-9]{16}$/.test(id) || seen[id]) {
        return;
      }
      seen[id] = true;
      normalized.push(id);
    });
    row.dataset.objectIds = JSON.stringify(normalized);
    var count = row.querySelector('[data-admin-object-count]');
    if (count) {
      count.textContent = String(normalized.length);
      count.title = normalized.length ? 'Назначено объектов: ' + String(normalized.length) : 'Объекты не назначены';
    }
    row.querySelectorAll('[data-admin-object-option]').forEach(function(checkbox) {
      checkbox.checked = seen[checkbox.value] === true;
    });
  }

  function createAdminObjectMenu(row, selectedIds) {
    var selectedMap = Object.create(null);
    (Array.isArray(selectedIds) ? selectedIds : []).forEach(function(objectId) {
      selectedMap[String(objectId || '')] = true;
    });
    var section = createElement('div', 'documents-admin__row-menu-objects');
    var title = createElement('div', 'documents-admin__row-menu-objects-title');
    title.appendChild(createElement('span', '', 'Доступ к объектам'));
    var count = createElement('span', 'documents-admin__row-menu-objects-count', String(Object.keys(selectedMap).length));
    count.dataset.adminObjectCount = '1';
    title.appendChild(count);
    section.appendChild(title);
    var list = createElement('div', 'documents-admin__row-menu-objects-list');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Объекты пользователя');
    var objects = state.objects && Array.isArray(state.objects.items) ? state.objects.items : [];
    if (!objects.length) {
      list.appendChild(createElement('div', 'documents-admin__empty-search', 'Объекты не созданы.'));
    } else {
      objects.forEach(function(object) {
        var label = createElement('label', 'documents-admin__object-selector-option');
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = object.id;
        checkbox.checked = selectedMap[object.id] === true;
        checkbox.dataset.adminObjectOption = '1';
        label.appendChild(checkbox);
        label.appendChild(createElement('span', '', object.name));
        list.appendChild(label);
      });
    }
    section.appendChild(list);
    row.dataset.objectIds = JSON.stringify(Array.isArray(selectedIds) ? selectedIds : []);
    return section;
  }

  function refreshAdminObjectSelectors() {
    if (!adminElements.usersCard) {
      return;
    }
    adminElements.usersCard.querySelectorAll('tbody tr').forEach(function(row) {
      var currentSection = row.querySelector('.documents-admin__row-menu-objects');
      if (!currentSection) {
        return;
      }
      var selectedIds = getAdminRowObjectIds(row);
      var parent = currentSection.parentElement;
      if (!parent) {
        return;
      }
      parent.replaceChild(createAdminObjectMenu(row, selectedIds), currentSection);
      setAdminRowObjectIds(row, selectedIds);
    });
  }

  function closeAdminRowMenus(exceptMenu) {
    if (!adminElements.usersCard) {
      return;
    }
    adminElements.usersCard.querySelectorAll('.documents-admin__row-menu').forEach(function(menu) {
      if (exceptMenu && menu === exceptMenu) {
        return;
      }
      menu.hidden = true;
      var actions = menu.closest('.documents-admin__row-actions');
      var toggle = actions ? actions.querySelector('[data-admin-row-menu]') : null;
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function handleAdminUsersCardClick(event) {
    var filterOwner = event.target && event.target.closest
      ? event.target.closest('.documents-admin__filter-wrap')
      : null;
    if (!filterOwner && adminElements.filterPanel && !adminElements.filterPanel.hidden) {
      adminElements.filterPanel.hidden = true;
      if (adminElements.filterButton) {
        adminElements.filterButton.setAttribute('aria-expanded', 'false');
      }
    }
    var objectOptionsOwner = event.target && event.target.closest
      ? event.target.closest('.documents-admin__row-menu-objects')
      : null;
    if (objectOptionsOwner && adminElements.usersCard.contains(objectOptionsOwner)) {
      return;
    }
    var menuToggle = event.target && event.target.closest
      ? event.target.closest('[data-admin-row-menu]')
      : null;
    if (menuToggle && adminElements.usersCard.contains(menuToggle)) {
      var actions = menuToggle.closest('.documents-admin__row-actions');
      var menu = actions ? actions.querySelector('.documents-admin__row-menu') : null;
      if (!menu) {
        return;
      }
      var shouldOpen = menu.hidden;
      closeAdminRowMenus(menu);
      menu.hidden = !shouldOpen;
      menuToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      if (shouldOpen) {
        var toggleRect = menuToggle.getBoundingClientRect();
        var menuWidth = Math.min(290, window.innerWidth - 20);
        var menuHeight = Math.min(menu.scrollHeight || 180, window.innerHeight - 20);
        var viewportPadding = 10;
        var menuLeft = Math.max(viewportPadding, Math.min(toggleRect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding));
        var menuTop = toggleRect.bottom + 6;
        if (menuTop + menuHeight > window.innerHeight - viewportPadding) {
          menuTop = Math.max(viewportPadding, toggleRect.top - menuHeight - 6);
        }
        menu.style.left = String(menuLeft) + 'px';
        menu.style.top = String(menuTop) + 'px';
      }
      if (adminElements.filterPanel) {
        adminElements.filterPanel.hidden = true;
      }
      if (adminElements.filterButton) {
        adminElements.filterButton.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    var actionButton = event.target && event.target.closest
      ? event.target.closest('[data-admin-row-action]')
      : null;
    if (!actionButton || !adminElements.usersCard.contains(actionButton)) {
      closeAdminRowMenus();
      return;
    }
    var row = actionButton.closest('tr');
    if (!row) {
      return;
    }
    var action = actionButton.dataset.adminRowAction;
    if (action === 'clear-password') {
      row.dataset.passwordHash = '';
      row.dataset.initialPasswordHash = '';
      var passwordInput = row.querySelector('input[data-field="password"]');
      if (passwordInput) {
        passwordInput.value = '';
      }
      refreshAdminPasswordState(row);
      markAdminDirty();
      closeAdminRowMenus();
      if (passwordInput) {
        passwordInput.focus();
      }
      applyAdminRowFilters();
      return;
    }
    if (action === 'remove') {
      var responsibleInput = row.querySelector('input[data-field="responsible"]');
      var label = responsibleInput && String(responsibleInput.value || '').trim()
        ? ' «' + String(responsibleInput.value).trim() + '»'
        : '';
      if (!window.confirm('Удалить пользователя' + label + '?')) {
        return;
      }
      removeAdminRow(adminUiState.activeSection, row);
      markAdminDirty();
    }
  }

  function handleAdminUsersCardInput(event) {
    var input = event.target && event.target.closest
      ? event.target.closest('input[data-field]')
      : null;
    if (!input || !adminElements.usersCard.contains(input)) {
      return;
    }
    var row = input.closest('tr');
    if (row && input.dataset.field === 'password') {
      if (String(input.value || '').trim()) {
        row.dataset.passwordHash = '';
      } else {
        row.dataset.passwordHash = row.dataset.initialPasswordHash || '';
      }
      refreshAdminPasswordState(row);
    }
    markAdminDirty();
    updateAdminSectionCounts();
    applyAdminRowFilters();
  }

  function handleAdminObjectSelectorChange(event) {
    var checkbox = event.target && event.target.closest
      ? event.target.closest('[data-admin-object-option]')
      : null;
    if (!checkbox || !adminElements.usersCard.contains(checkbox)) {
      return;
    }
    var row = checkbox.closest('tr');
    if (!row) {
      return;
    }
    var selected = [];
    row.querySelectorAll('[data-admin-object-option]:checked').forEach(function(input) {
      selected.push(input.value);
    });
    setAdminRowObjectIds(row, selected);
    markAdminDirty();
  }

  function sectionHasCredentials(sectionKey) {
    return sectionKey === 'responsibles' || sectionKey === 'block2' || sectionKey === 'block3';
  }

  function resolveAdminRole(sectionKey) {
    if (sectionKey === 'block3') {
      return 'subordinate';
    }
    if (sectionKey === 'responsibles') {
      return 'responsible';
    }
    if (sectionKey === 'block2') {
      return 'director';
    }
    return '';
  }

  function createAdminInput(field, value, type) {
    var input = document.createElement('input');
    input.className = 'documents-admin__input';
    input.type = type || 'text';
    input.value = typeof value === 'string' ? value : '';
    input.dataset.field = field;
    input.placeholder = '';
    return input;
  }

  function createEmptyAdminEntry(sectionKey) {
    var base = {
      number: '',
      responsible: '',
      position: '',
      telegram: '',
      chatId: '',
      email: '',
      department: '',
      note: '',
      objectIds: []
    };
    if (sectionHasCredentials(sectionKey)) {
      base.login = '';
      base.passwordHash = '';
    }
    var role = resolveAdminRole(sectionKey);
    if (role) {
      base.role = role;
    }
    return base;
  }

  function createAdminRow(entry, index, sectionKey) {
    var tr = document.createElement('tr');
    var includeCredentials = sectionHasCredentials(sectionKey);
    var data = Object.assign({}, createEmptyAdminEntry(sectionKey), entry || {});
    var resolvedRole = resolveAdminRole(sectionKey);
    if (resolvedRole && !data.role) {
      data.role = resolvedRole;
    }
    if (data.role) {
      tr.dataset.role = data.role;
    }

    function appendInputCell(field, value, type, autocomplete) {
      var td = document.createElement('td');
      var input = createAdminInput(field, value, type);
      if (field === 'number') {
        input.placeholder = String(index + 1);
        if (!input.value) {
          input.value = String(index + 1);
        }
      }
      if (autocomplete) {
        input.autocomplete = autocomplete;
      }
      td.appendChild(input);
      tr.appendChild(td);
      return input;
    }

    appendInputCell('number', data.number, 'text', 'off');
    appendInputCell('responsible', data.responsible, 'text', 'name');
    appendInputCell('position', data.position, 'text', 'organization-title');
    appendInputCell('telegram', data.telegram, 'text', 'off');
    appendInputCell('chatId', data.chatId, 'text', 'off');
    appendInputCell('email', data.email, 'email', 'email');

    var passwordInput = null;
    if (includeCredentials) {
      appendInputCell('login', data.login, 'text', 'username');
      passwordInput = appendInputCell('password', '', 'password', 'new-password');
      passwordInput.value = '';
      passwordInput.placeholder = '';
      passwordInput.setAttribute('aria-label', 'Новый пароль');
      var initialHash = data.passwordHash ? String(data.passwordHash) : '';
      tr.dataset.passwordHash = initialHash;
      tr.dataset.initialPasswordHash = initialHash;
      refreshAdminPasswordState(tr);
    } else {
      tr.dataset.passwordHash = '';
      tr.dataset.initialPasswordHash = '';
    }

    appendInputCell('department', data.department, 'text', 'organization-title');
    tr.dataset.objectIds = JSON.stringify(Array.isArray(data.objectIds) ? data.objectIds : []);

    var noteInput = createAdminInput('note', data.note, 'hidden');

    var actions = document.createElement('td');
    actions.className = 'documents-admin__row-actions';
    actions.appendChild(noteInput);
    var menuToggle = createElement('button', 'documents-admin__row-menu-toggle', '…');
    menuToggle.type = 'button';
    menuToggle.title = 'Действия с пользователем';
    menuToggle.setAttribute('aria-label', 'Действия с пользователем');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.dataset.adminRowMenu = '1';
    var rowMenu = createElement('div', 'documents-admin__row-menu');
    rowMenu.hidden = true;
    rowMenu.appendChild(createAdminObjectMenu(tr, Array.isArray(data.objectIds) ? data.objectIds : []));
    var clearPasswordButton = createElement('button', 'documents-admin__row-menu-button', 'Очистить пароль');
    clearPasswordButton.type = 'button';
    clearPasswordButton.dataset.adminRowAction = 'clear-password';
    clearPasswordButton.disabled = !Boolean(tr.dataset.passwordHash);
    var removeButton = createElement('button', 'documents-admin__row-menu-button documents-admin__row-menu-button--danger', 'Удалить пользователя');
    removeButton.type = 'button';
    removeButton.dataset.adminRowAction = 'remove';
    rowMenu.appendChild(clearPasswordButton);
    rowMenu.appendChild(removeButton);
    actions.appendChild(menuToggle);
    actions.appendChild(rowMenu);
    tr.appendChild(actions);
    setAdminRowObjectIds(tr, Array.isArray(data.objectIds) ? data.objectIds : []);

    return tr;
  }

  function collectAdminNumbers(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return { used: Object.create(null), max: 0 };
    }
    var used = Object.create(null);
    var max = 0;
    section.tableBody.querySelectorAll('input[data-field="number"]').forEach(function(input) {
      var value = input && input.value ? String(input.value).trim() : '';
      var parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        used[String(parsed)] = true;
        if (parsed > max) {
          max = parsed;
        }
      }
    });
    return { used: used, max: max };
  }

  function findNextAdminNumber(sectionKey, numbersInfo) {
    var info = numbersInfo || collectAdminNumbers(sectionKey);
    var used = info.used || Object.create(null);
    var max = typeof info.max === 'number' ? info.max : 0;
    var candidate = 1;
    while (used[String(candidate)]) {
      candidate += 1;
    }
    if (candidate <= max + 1) {
      return candidate;
    }
    return max + 1;
  }

  function renumberAdminRows(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var rows = section.tableBody.querySelectorAll('tr');
    rows.forEach(function(row, index) {
      var numberInput = row.querySelector('input[data-field="number"]');
      if (numberInput) {
        numberInput.placeholder = String(index + 1);
      }
    });
  }

  function getAdminRowSortKey(row) {
    if (!row) {
      return '';
    }
    var responsibleInput = row.querySelector('input[data-field="responsible"]');
    var value = responsibleInput && responsibleInput.value ? String(responsibleInput.value).trim().toLowerCase() : '';
    return value;
  }

  function sortAdminTableRows(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var rows = Array.prototype.slice.call(section.tableBody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var aKey = getAdminRowSortKey(a);
      var bKey = getAdminRowSortKey(b);
      if (aKey && bKey) {
        var compare = aKey.localeCompare(bKey, 'ru', { sensitivity: 'base' });
        if (compare !== 0) {
          return compare;
        }
      }
      if (aKey && !bKey) {
        return -1;
      }
      if (!aKey && bKey) {
        return 1;
      }
      return 0;
    });
    rows.forEach(function(row) {
      section.tableBody.appendChild(row);
    });
    renumberAdminRows(sectionKey);
  }

  function sortAdminEntriesByResponsible(entries) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    return list.sort(function(a, b) {
      var aName = a && a.responsible ? String(a.responsible).trim().toLowerCase() : '';
      var bName = b && b.responsible ? String(b.responsible).trim().toLowerCase() : '';
      if (aName && bName) {
        var compare = aName.localeCompare(bName, 'ru', { sensitivity: 'base' });
        if (compare !== 0) {
          return compare;
        }
      }
      if (aName && !bName) {
        return -1;
      }
      if (!aName && bName) {
        return 1;
      }
      var aNumber = a && a.number ? parseInt(a.number, 10) : NaN;
      var bNumber = b && b.number ? parseInt(b.number, 10) : NaN;
      if (!isNaN(aNumber) && !isNaN(bNumber)) {
        return aNumber - bNumber;
      }
      return 0;
    });
  }

  function renderAdminRows(sectionKey, rows, shouldFocus) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var list = Array.isArray(rows) && rows.length ? rows : [createEmptyAdminEntry(sectionKey)];
    list = sortAdminEntriesByResponsible(list);

    var token = Date.now() + ':' + Math.random();
    adminRenderTokens[sectionKey] = token;
    section.tableBody.innerHTML = '';

    var index = 0;
    var batchSize = list.length > 120 ? 40 : list.length;

    function finishRender() {
      if (adminRenderTokens[sectionKey] !== token) {
        return;
      }
      renumberAdminRows(sectionKey);
      updateAdminSectionCounts();
      if (sectionKey === adminUiState.activeSection) {
        applyAdminRowFilters();
      }
      if (shouldFocus) {
        var focus = function() {
          focusFirstAdminInput(sectionKey);
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(focus);
        } else {
          window.setTimeout(focus, 0);
        }
      }
    }

    function renderBatch() {
      if (adminRenderTokens[sectionKey] !== token) {
        return;
      }
      var fragment = document.createDocumentFragment();
      var limit = Math.min(index + batchSize, list.length);
      for (; index < limit; index += 1) {
        fragment.appendChild(createAdminRow(list[index], index, sectionKey));
      }
      section.tableBody.appendChild(fragment);
      if (index < list.length) {
        window.setTimeout(renderBatch, 0);
        return;
      }
      finishRender();
    }

    renderBatch();
  }

  function focusFirstAdminInput(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var firstInput = section.tableBody.querySelector('input');
    if (firstInput && typeof firstInput.focus === 'function') {
      firstInput.focus();
      if (typeof firstInput.select === 'function') {
        firstInput.select();
      }
    }
  }

  function addAdminRow(entry, sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var index = section.tableBody.children.length;
    var numbersInfo = collectAdminNumbers(sectionKey);
    var data = Object.assign({}, createEmptyAdminEntry(sectionKey), entry || {});
    var numberValue = data.number ? String(data.number).trim() : '';
    var normalizedNumber = '';
    if (numberValue) {
      var parsedNumber = parseInt(numberValue, 10);
      if (!isNaN(parsedNumber) && parsedNumber > 0) {
        normalizedNumber = String(parsedNumber);
      }
    }
    if (!normalizedNumber || numbersInfo.used[normalizedNumber]) {
      data.number = String(findNextAdminNumber(sectionKey, numbersInfo));
    } else {
      data.number = normalizedNumber;
    }
    var addedRow = createAdminRow(data, index, sectionKey);
    section.tableBody.appendChild(addedRow);
    sortAdminTableRows(sectionKey);
    updateAdminSectionCounts();
    applyAdminRowFilters();
    if (addedRow) {
      var firstEditableInput = addedRow.querySelector('input[data-field="responsible"]');
      if (firstEditableInput) {
        firstEditableInput.focus();
      }
    }
  }

  function removeAdminRow(sectionKey, row) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody || !row) {
      return;
    }
    section.tableBody.removeChild(row);
    if (!section.tableBody.children.length) {
      addAdminRow(null, sectionKey);
    } else {
      renumberAdminRows(sectionKey);
    }
    updateAdminSectionCounts();
    applyAdminRowFilters();
  }

  function collectAdminRows(sectionKey, options) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return options && options.includeMeta ? { rows: [], meta: [] } : [];
    }
    var includeMeta = Boolean(options && options.includeMeta);
    var rows = [];
    var meta = includeMeta ? [] : null;
    section.tableBody.querySelectorAll('tr').forEach(function(row) {
      var includeCredentials = sectionHasCredentials(sectionKey);
      var entry = createEmptyAdminEntry(sectionKey);
      row.querySelectorAll('input').forEach(function(input) {
        var field = input.dataset.field;
        if (!field) {
          return;
        }
        entry[field] = input.value.trim();
      });
      entry.objectIds = getAdminRowObjectIds(row);
      if (includeCredentials) {
        var passwordValue = entry.password ? entry.password.trim() : '';
        delete entry.password;
        var storedHash = row.dataset && row.dataset.passwordHash ? String(row.dataset.passwordHash) : '';
        if (passwordValue !== '') {
          entry.password = passwordValue;
          entry.passwordHash = '';
        } else {
          entry.passwordHash = entry.passwordHash ? entry.passwordHash.trim() : storedHash;
          if (entry.login === '') {
            entry.passwordHash = '';
          }
        }
        if (!passwordValue) {
          delete entry.password;
        }
        if (!entry.passwordHash) {
          delete entry.passwordHash;
        }
      }
      var hasValue = Object.keys(entry).some(function(key) {
        if (key === 'role') {
          return false;
        }
        if (Array.isArray(entry[key])) {
          return entry[key].length > 0;
        }
        return entry[key] !== '';
      });
      if (hasValue) {
        var role = resolveAdminRole(sectionKey);
        if (role) {
          entry.role = role;
        } else if (entry.role) {
          entry.role = String(entry.role).trim();
          if (entry.role === '') {
            delete entry.role;
          }
        }
        rows.push(entry);
        if (includeMeta) {
          var loginValue = entry.login ? String(entry.login).trim() : '';
          if (loginValue) {
            meta.push({
              sectionKey: sectionKey,
              login: loginValue,
              normalizedLogin: normalizeUserIdentifier(loginValue),
              input: includeCredentials ? row.querySelector('input[data-field="login"]') : null
            });
          }
        }
      }
    });
    if (includeMeta) {
      return { rows: rows, meta: meta };
    }
    return rows;
  }

  function clearAdminLoginValidationState() {
    if (!adminElements.sections) {
      return;
    }
    Object.keys(adminElements.sections).forEach(function(key) {
      var section = adminElements.sections[key];
      if (!section || !section.tableBody) {
        return;
      }
      section.tableBody.querySelectorAll('input[data-field="login"]').forEach(function(input) {
        input.classList.remove('documents-admin__input--error');
        input.removeAttribute('aria-invalid');
      });
    });
  }

  function sanitizeLoginSuggestionBase(login) {
    var base = typeof login === 'string' ? login.trim().toLowerCase() : '';
    if (!base) {
      return 'user';
    }
    base = base.replace(/\s+/g, '');
    base = base.replace(/[^a-z0-9._-]/g, '');
    if (!base) {
      return 'user';
    }
    return base.slice(0, 40);
  }

  function generateLoginSuggestions(baseLogin, usedSet, reservedSet, limit) {
    var maxSuggestions = typeof limit === 'number' && limit > 0 ? limit : 3;
    var sanitizedBase = sanitizeLoginSuggestionBase(baseLogin);
    var suggestions = [];
    var suffix = 1;
    var attempts = 0;
    var maxAttempts = maxSuggestions * 30;
    while (suggestions.length < maxSuggestions && attempts < maxAttempts) {
      var candidate = sanitizedBase + String(suffix);
      suffix += 1;
      attempts += 1;
      var normalized = normalizeUserIdentifier(candidate);
      if (!normalized) {
        continue;
      }
      if (usedSet[normalized] || reservedSet[normalized]) {
        continue;
      }
      suggestions.push(candidate);
      reservedSet[normalized] = true;
    }
    if (!suggestions.length) {
      var fallback = sanitizedBase + '-' + String(Math.floor(Math.random() * 900 + 100));
      var normalizedFallback = normalizeUserIdentifier(fallback);
      if (normalizedFallback && !usedSet[normalizedFallback] && !reservedSet[normalizedFallback]) {
        suggestions.push(fallback);
        reservedSet[normalizedFallback] = true;
      }
    }
    return suggestions;
  }

  function validateAdminLoginUniqueness(sectionDataList) {
    var sections = Array.isArray(sectionDataList) ? sectionDataList : [];
    var loginMap = Object.create(null);
    sections.forEach(function(sectionData) {
      if (!sectionData || !Array.isArray(sectionData.meta)) {
        return;
      }
      sectionData.meta.forEach(function(metaEntry) {
        if (!metaEntry) {
          return;
        }
        var normalized = metaEntry.normalizedLogin;
        if (!normalized) {
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(loginMap, normalized)) {
          loginMap[normalized] = [];
        }
        loginMap[normalized].push(metaEntry);
      });
    });

    var duplicateGroups = [];
    Object.keys(loginMap).forEach(function(normalized) {
      if (loginMap[normalized].length > 1) {
        duplicateGroups.push({
          normalized: normalized,
          entries: loginMap[normalized]
        });
      }
    });

    if (!duplicateGroups.length) {
      return { valid: true };
    }

    var usedSet = Object.create(null);
    Object.keys(loginMap).forEach(function(normalized) {
      usedSet[normalized] = true;
    });

    var reservedSet = Object.create(null);
    var suggestionMap = Object.create(null);
    duplicateGroups.forEach(function(group) {
      var entries = group.entries || [];
      var baseLogin = '';
      for (var i = 0; i < entries.length; i += 1) {
        if (entries[i] && entries[i].login) {
          baseLogin = entries[i].login;
          break;
        }
      }
      var suggestions = generateLoginSuggestions(baseLogin || group.normalized, usedSet, reservedSet, 3);
      if (suggestions.length) {
        suggestionMap[group.normalized] = suggestions;
      } else {
        suggestionMap[group.normalized] = [];
      }
    });

    return {
      valid: false,
      duplicateGroups: duplicateGroups,
      suggestions: suggestionMap
    };
  }

  function applyAdminLoginValidationFailure(result) {
    if (!result || !Array.isArray(result.duplicateGroups)) {
      return;
    }
    var focusTarget = null;
    var messages = [];
    result.duplicateGroups.forEach(function(group) {
      if (!group || !Array.isArray(group.entries)) {
        return;
      }
      var groupLogin = '';
      group.entries.forEach(function(metaEntry) {
        if (!metaEntry) {
          return;
        }
        if (metaEntry.input) {
          metaEntry.input.classList.add('documents-admin__input--error');
          metaEntry.input.setAttribute('aria-invalid', 'true');
          if (!focusTarget) {
            focusTarget = metaEntry.input;
          }
        }
        if (!groupLogin && metaEntry.login) {
          groupLogin = metaEntry.login;
        }
      });
      if (!groupLogin) {
        groupLogin = group.normalized;
      }
      var suggestionList = result.suggestions && result.suggestions[group.normalized]
        ? result.suggestions[group.normalized]
        : [];
      var message = 'Логин «' + groupLogin + '» уже используется.';
      if (suggestionList.length) {
        message += ' Попробуйте: ' + suggestionList.join(', ') + '.';
      }
      messages.push(message);
    });

    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
      if (typeof focusTarget.select === 'function') {
        focusTarget.select();
      }
    }

    var combinedMessage = messages.join(' ');
    updateAdminMessage(combinedMessage || 'Логин уже используется.', true);
  }

  function updateAdminMessage(text, isError) {
    ensureAdminModal();
    if (!adminElements.message) {
      return;
    }
    adminElements.message.textContent = text || '';
    adminElements.message.style.display = text ? 'block' : 'none';
    adminElements.message.classList.toggle('documents-admin__message--error', Boolean(text && isError));
  }

  function setAdminSaving(isSaving) {
    state.admin.saving = Boolean(isSaving);
    if (adminElements.saveButton) {
      adminElements.saveButton.disabled = state.admin.saving;
      adminElements.saveButton.textContent = state.admin.saving ? 'Сохранение…' : 'Сохранить изменения';
    }
  }


  function ensureAdminS3State() {
    if (!state.admin.s3) {
      state.admin.s3 = {
        loading: false,
        testing: false,
        deleting: false,
        error: '',
        visible: false,
        storage: null,
        coldStorage: null,
        test: null,
        listing: null,
        listingPath: '',
        listingFilter: '',
        listingLoading: false,
        listingError: '',
        listingLoadedAt: 0,
        listingPromise: null,
        reading: false,
        promise: null
      };
    }
    if (typeof state.admin.s3.listingPath !== 'string') {
      state.admin.s3.listingPath = '';
    }
    if (!('deleting' in state.admin.s3)) {
      state.admin.s3.deleting = false;
    }
    if (typeof state.admin.s3.listingFilter !== 'string') {
      state.admin.s3.listingFilter = '';
    }
    if (!('listing' in state.admin.s3)) {
      state.admin.s3.listing = null;
    }
    if (!('listingLoading' in state.admin.s3)) {
      state.admin.s3.listingLoading = false;
    }
    if (!('listingError' in state.admin.s3)) {
      state.admin.s3.listingError = '';
    }
    if (!Number.isFinite(Number(state.admin.s3.listingLoadedAt))) {
      state.admin.s3.listingLoadedAt = 0;
    }
    if (!('listingPromise' in state.admin.s3)) {
      state.admin.s3.listingPromise = null;
    }
    if (!('reading' in state.admin.s3)) {
      state.admin.s3.reading = false;
    }
    return state.admin.s3;
  }

  function setAdminS3Status(text, type) {
    ensureAdminModal();
    if (!adminElements.s3Status) {
      return;
    }
    var status = adminElements.s3Status;
    status.textContent = text || '';
    status.classList.toggle('is-visible', Boolean(text));
    status.classList.remove('documents-s3-modal__status--error', 'documents-s3-modal__status--success');
    if (type === 'error') {
      status.classList.add('documents-s3-modal__status--error');
    } else if (type === 'success') {
      status.classList.add('documents-s3-modal__status--success');
    }
  }

  function createAdminS3Metric(label, value) {
    var metric = createElement('div', 'documents-s3-modal__metric');
    metric.appendChild(createElement('div', 'documents-s3-modal__metric-label', label));
    metric.appendChild(createElement('div', 'documents-s3-modal__metric-value', value));
    return metric;
  }

 function normalizeAdminS3BrowserPath(value) {
    var raw = typeof value === 'string' ? value : '';
    raw = raw.replace(/\\/g, '/').trim();
    if (!raw) {
      return '';
    }
    return raw.split('/').reduce(function(parts, part) {
      var segment = String(part || '').trim();
      if (!segment || segment === '.' || segment === '..') {
        return parts;
      }
      parts.push(segment);
      return parts;
    }, []).join('/');
  }

  function copyAdminS3TextToClipboard(text, successMessage) {
    var value = typeof text === 'string' ? text.trim() : '';
    if (!value) {
      setAdminS3Status('Нечего копировать.', 'error');
      return;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(value)
        .then(function() {
          setAdminS3Status(successMessage || 'Скопировано в буфер обмена.', 'success');
        })
        .catch(function() {
          fallbackCopy();
        });
      return;
    }

    fallbackCopy();

    function fallbackCopy() {
      var textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      try {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        var executed = document.execCommand && document.execCommand('copy');
        setAdminS3Status(
          executed ? (successMessage || 'Скопировано в буфер обмена.') : 'Не удалось скопировать автоматически.',
          executed ? 'success' : 'error'
        );
      } catch (copyError) {
        setAdminS3Status('Не удалось скопировать автоматически.', 'error');
      } finally {
        textarea.remove();
      }
    }
  }

  function adminS3ItemMatchesFilter(item, filter) {
    if (!filter) {
      return true;
    }
    var haystack = [
      item && item.name,
      item && item.path,
      item && item.remoteKey,
      item && item.type
    ].map(function(value) {
      return typeof value === 'string' ? value.toLowerCase() : '';
    }).join(' ');

    return haystack.indexOf(filter) !== -1;
  }

  function applyAdminS3Filter(container, filter) {
    if (!container) {
      return;
    }
    var normalizedFilter = typeof filter === 'string' ? filter.trim().toLowerCase() : '';
    var rows = Array.prototype.slice.call(container.querySelectorAll('[data-s3-row]'));
    var visibleCount = 0;
    rows.forEach(function(row) {
      var search = (row.getAttribute('data-s3-search') || '').toLowerCase();
      var visible = !normalizedFilter || search.indexOf(normalizedFilter) !== -1;
      row.hidden = !visible;
      if (visible) {
        visibleCount++;
      }
    });
    var counter = container.querySelector('[data-s3-filter-count]');
    if (counter) {
      counter.textContent = normalizedFilter
        ? 'Найдено: ' + visibleCount + ' из ' + rows.length
        : 'Объектов: ' + rows.length;
    }
    var empty = container.querySelector('[data-s3-filter-empty]');
    if (empty) {
      empty.hidden = !normalizedFilter || visibleCount > 0;
    }
  }

  function createAdminS3QuickButton(label, path, currentPath) {
    var button = createElement('button', 'documents-s3-modal__mini-button', label);
    button.type = 'button';
    button.disabled = normalizeAdminS3BrowserPath(path) === normalizeAdminS3BrowserPath(currentPath);
    button.setAttribute('data-s3-path', normalizeAdminS3BrowserPath(path));
    return button;
  }

  function createAdminS3Explorer(s3State) {
    var listing = s3State.listing && typeof s3State.listing === 'object' ? s3State.listing : null;
    var items = listing && Array.isArray(listing.items) ? listing.items : [];
    var path = listing && typeof listing.path === 'string' ? listing.path : (s3State.listingPath || '');
    var filter = typeof s3State.listingFilter === 'string' ? s3State.listingFilter.trim().toLowerCase() : '';
    var explorer = createElement('div', 'documents-s3-modal__explorer');
    var head = createElement('div', 'documents-s3-modal__explorer-head');
    var title = createElement('div', 'documents-s3-modal__explorer-title', 'Проводник S3');
    var pathLabel = path ? path : 'корень S3 documents-api';
    var pathDetails = pathLabel;
    if (listing) {
      pathDetails += ' | папок: ' + (listing.directoriesCount || 0) + ', файлов: ' + (listing.filesCount || 0) + ', размер: ' + (listing.label || '0 Б');
    }
    var pathNode = createElement('div', 'documents-s3-modal__explorer-path', pathDetails);
    var upButton = createElement('button', 'documents-s3-modal__explorer-up', 'Вверх');
    upButton.type = 'button';
    upButton.disabled = s3State.listingLoading || s3State.deleting || !path;
    upButton.setAttribute('data-s3-up', 'true');
    head.appendChild(title);
    head.appendChild(pathNode);
    head.appendChild(upButton);
    explorer.appendChild(head);

    var toolbar = createElement('div', 'documents-s3-modal__toolbar');
    var pathInput = createElement('input', 'documents-s3-modal__input');
    pathInput.type = 'text';
    pathInput.value = path;
    pathInput.placeholder = 'Путь внутри S3, например js/documents/telegram-user-tasks/users';
    pathInput.setAttribute('aria-label', 'S3 путь');
    pathInput.setAttribute('data-s3-path-input', 'true');
    var openPathButton = createElement('button', 'documents-s3-modal__mini-button', 'Открыть путь');
    openPathButton.type = 'button';
    openPathButton.disabled = s3State.listingLoading || s3State.deleting;
    openPathButton.setAttribute('data-s3-open-input', 'true');
    var searchInput = createElement('input', 'documents-s3-modal__input');
    searchInput.type = 'search';
    searchInput.value = s3State.listingFilter || '';
    searchInput.placeholder = 'Поиск в текущей папке';
    searchInput.setAttribute('aria-label', 'Поиск по текущей S3 папке');
    searchInput.setAttribute('data-s3-filter-input', 'true');
    toolbar.appendChild(pathInput);
    toolbar.appendChild(openPathButton);
    toolbar.appendChild(searchInput);
    explorer.appendChild(toolbar);

    var quick = createElement('div', 'documents-s3-modal__quick');
    quick.appendChild(createAdminS3QuickButton('Корень', '', path));
    quick.appendChild(createAdminS3QuickButton('Telegram JSON', 'js/documents/telegram-user-tasks/users', path));
    quick.appendChild(createAdminS3QuickButton('Тесты S3', '.s3-test', path));
    if (state.organization) {
      quick.appendChild(createAdminS3QuickButton('Текущая организация', String(state.organization).trim().replace(/\s+/g, '_'), path));
    }
    if (s3State.listingLoading || s3State.deleting) {
      Array.prototype.forEach.call(quick.querySelectorAll('button'), function(button) {
        button.disabled = true;
      });
    }
    explorer.appendChild(quick);

    if (s3State.listingLoading) {
      explorer.appendChild(createElement('div', 'documents-s3-modal__empty', 'Загружаем список S3…'));
      return explorer;
    }

    if (s3State.deleting) {
      explorer.appendChild(createElement('div', 'documents-s3-modal__empty', 'Удаляем объект из S3…'));
      return explorer;
    }

    if (s3State.listingError) {
      explorer.appendChild(createElement('div', 'documents-s3-modal__empty', s3State.listingError));
      return explorer;
    }

    if (!listing) {
      explorer.appendChild(createElement('div', 'documents-s3-modal__empty', 'Список ещё не загружен.'));
      return explorer;
    }

    var meta = createElement('div', 'documents-s3-modal__explorer-meta');
    meta.appendChild(createElement('span', '', 'Папок: ' + (listing.directoriesCount || 0)));
    meta.appendChild(createElement('span', '', 'Файлов: ' + (listing.filesCount || 0)));
    meta.appendChild(createElement('span', '', 'Размер: ' + (listing.label || '0 Б')));
    meta.appendChild(createElement('span', '', 'Обновлено: ' + (s3State.listingLoadedAt ? formatDateTime(new Date(s3State.listingLoadedAt).toISOString()) : '—')));
    meta.appendChild(createElement('span', '', 'Remote: ' + (listing.remotePath || '—')));
    explorer.appendChild(meta);

    var visibleCount = 0;

    var wrap = createElement('div', 'documents-s3-modal__table-wrap');
    if (!items.length) {
      wrap.appendChild(createElement('div', 'documents-s3-modal__empty', 'В этом S3-пути пока пусто.'));
    } else {
      var table = document.createElement('table');
      table.className = 'documents-s3-modal__table';
      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      ['Имя', 'Тип', 'Размер', 'Изменён', 'S3 key', 'Действия'].forEach(function(label) {
        headRow.appendChild(createElement('th', '', label));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      items.forEach(function(item) {
        var isDirectory = item && item.type === 'directory';
        var row = document.createElement('tr');
        var itemKey = item && (item.path || item.remoteKey || item.name) ? (item.path || item.remoteKey || item.name) : '';
        var itemSearch = [
          item && item.name,
          item && item.path,
          item && item.remoteKey,
          item && item.type
        ].map(function(value) {
          return typeof value === 'string' ? value : '';
        }).join(' ');
        row.setAttribute('data-s3-row', 'true');
        row.setAttribute('data-s3-search', itemSearch);
        if (!adminS3ItemMatchesFilter(item, filter)) {
          row.hidden = true;
        } else {
          visibleCount++;
        }
        var nameCell = document.createElement('td');
        var nameButton = createElement('button', 'documents-s3-modal__item-button');
        nameButton.type = 'button';
        nameButton.setAttribute('data-s3-type', isDirectory ? 'directory' : 'file');
        nameButton.setAttribute(isDirectory ? 'data-s3-path' : 'data-s3-read', itemKey);
        if (!isDirectory) {
          nameButton.setAttribute('data-s3-name', item.name || itemKey);
          if (Number(item.size || 0) > ADMIN_S3_READ_MAX_BYTES) {
            nameButton.disabled = true;
            nameButton.title = 'Файл больше лимита чтения в модальном окне.';
          }
        }
        nameButton.appendChild(createElement('span', 'documents-s3-modal__item-icon', isDirectory ? 'DIR' : 'FILE'));
        nameButton.appendChild(createElement('span', 'documents-s3-modal__item-name', item.name || 'без имени'));
        nameCell.appendChild(nameButton);
        row.appendChild(nameCell);
        row.appendChild(createElement('td', '', isDirectory ? 'Папка' : 'Файл'));
        row.appendChild(createElement('td', '', isDirectory ? '—' : (item.sizeLabel || formatFileSize(item.size || 0))));
        row.appendChild(createElement('td', '', item.modifiedAt ? formatDateTime(item.modifiedAt) : '—'));
        row.appendChild(createElement('td', 'documents-s3-modal__key', item.remoteKey || item.path || '—'));
        var actionCell = document.createElement('td');
        var actionWrap = createElement('div', 'documents-s3-modal__row-actions');
        if (isDirectory) {
          var openButton = createElement('button', 'documents-s3-modal__mini-button', 'Открыть');
          openButton.type = 'button';
          openButton.setAttribute('data-s3-path', item.path || '');
          actionWrap.appendChild(openButton);
        } else {
          var readButton = createElement('button', 'documents-s3-modal__mini-button', 'Прочитать');
          readButton.type = 'button';
          readButton.disabled = s3State.reading || Number(item.size || 0) > ADMIN_S3_READ_MAX_BYTES;
          if (Number(item.size || 0) > ADMIN_S3_READ_MAX_BYTES) {
            readButton.title = 'Файл больше лимита чтения в модальном окне.';
          }
          readButton.setAttribute('data-s3-read', item.path || itemKey);
          readButton.setAttribute('data-s3-name', item.name || item.path || itemKey);
          actionWrap.appendChild(readButton);
        }
        var copyButton = createElement('button', 'documents-s3-modal__mini-button', 'Ключ');
        copyButton.type = 'button';
        copyButton.setAttribute('data-s3-copy', item.remoteKey || item.path || '');
        actionWrap.appendChild(copyButton);
        var deleteButton = createElement('button', 'documents-s3-modal__mini-button documents-s3-modal__mini-button--danger', 'Удалить');
        deleteButton.type = 'button';
        deleteButton.disabled = s3State.deleting;
        deleteButton.setAttribute('data-s3-delete', item.path || itemKey);
        deleteButton.setAttribute('data-s3-type', isDirectory ? 'directory' : 'file');
        deleteButton.setAttribute('data-s3-name', item.name || item.path || itemKey);
        actionWrap.appendChild(deleteButton);
        actionCell.appendChild(actionWrap);
        row.appendChild(actionCell);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }
    explorer.appendChild(wrap);
    var filterEmpty = createElement('div', 'documents-s3-modal__empty', 'По текущему поиску ничего не найдено.');
    filterEmpty.hidden = !filter || visibleCount > 0;
    filterEmpty.setAttribute('data-s3-filter-empty', 'true');
    explorer.appendChild(filterEmpty);
    var filterCount = createElement('div', 'documents-s3-modal__empty', filter ? 'Найдено: ' + visibleCount + ' из ' + items.length : 'Объектов: ' + items.length);
    filterCount.setAttribute('data-s3-filter-count', 'true');
    explorer.appendChild(filterCount);

    return explorer;
  }

  function updateAdminS3Panel() {
    ensureAdminModal();
    var s3State = ensureAdminS3State();
    if (adminElements.s3Button) {
      adminElements.s3Button.disabled = !state.organization;
    }
    if (adminElements.s3RefreshButton) {
      adminElements.s3RefreshButton.disabled = s3State.loading || s3State.testing || s3State.deleting || s3State.listingLoading || s3State.reading;
      adminElements.s3RefreshButton.textContent = (s3State.loading || s3State.listingLoading) ? 'Обновляем…' : 'Обновить';
    }
    if (adminElements.s3TestButton) {
      adminElements.s3TestButton.disabled = s3State.loading || s3State.testing || s3State.deleting || s3State.listingLoading || s3State.reading || !state.organization;
      adminElements.s3TestButton.textContent = s3State.testing ? 'Проверяем…' : 'Проверить загрузку';
    }
    if (!adminElements.s3Summary) {
      return;
    }
    adminElements.s3Summary.innerHTML = '';
    var storage = s3State.storage && typeof s3State.storage === 'object' ? s3State.storage : {};
    var cold = s3State.coldStorage && typeof s3State.coldStorage === 'object'
      ? s3State.coldStorage
      : (storage.coldStorage && typeof storage.coldStorage === 'object' ? storage.coldStorage : {});

    var grid = createElement('div', 'documents-s3-modal__grid');
    grid.appendChild(createAdminS3Metric('Всего вложений', String(storage.files || 0)));
    grid.appendChild(createAdminS3Metric('В S3', String(storage.coldSyncedCount || 0)));
    grid.appendChild(createAdminS3Metric('S3 в очереди', String(storage.coldPendingCount || 0)));
    grid.appendChild(createAdminS3Metric('Локальный fallback', String(storage.coldFallbackCount || 0)));
    grid.appendChild(createAdminS3Metric('Не найдено', String(storage.missingFilesCount || 0)));
    grid.appendChild(createAdminS3Metric('Локально на сервере', storage.localLabel || '0 Б'));
    grid.appendChild(createAdminS3Metric('Оценка S3', storage.coldLabel || '0 Б'));
    adminElements.s3Summary.appendChild(grid);

    adminElements.s3Summary.appendChild(createAdminS3Explorer(s3State));

    if (s3State.reading) {
      setAdminS3Status('Читаем файл из S3…', 'info');
    } else if (s3State.deleting) {
      setAdminS3Status('Удаляем объект из S3…', 'info');
    } else if (s3State.loading || s3State.listingLoading) {
      setAdminS3Status('Получаем статус S3…', 'info');
    } else if (s3State.error) {
      setAdminS3Status(s3State.error, 'error');
    } else if (s3State.listingError) {
      setAdminS3Status(s3State.listingError, 'error');
    } else if (s3State.test && s3State.test.ok) {
      setAdminS3Status(s3State.test.message || 'Проверка загрузки прошла успешно.', 'success');
    } else if (s3State.test && s3State.test.ok === false) {
      setAdminS3Status(s3State.test.message || 'Проверка загрузки не прошла.', 'error');
    } else if (cold.available) {
      setAdminS3Status('S3 доступен. Новые вложения получают S3-копию.', 'success');
    } else {
      setAdminS3Status('S3 пока недоступен, новые файлы останутся локально.', 'error');
    }
  }

  function fetchAdminS3Status(options) {
    var s3State = ensureAdminS3State();
    var force = options && options.force;
    if (!state.organization) {
      s3State.error = 'Сначала выберите организацию.';
      updateAdminS3Panel();
      return Promise.reject(new Error(s3State.error));
    }
    if (s3State.loading && s3State.promise) {
      return s3State.promise;
    }
    if (!force && s3State.storage && !s3State.error) {
      updateAdminS3Panel();
      return Promise.resolve(s3State);
    }
    s3State.loading = true;
    s3State.error = '';
    updateAdminS3Panel();
    var request = fetch(buildApiUrl('storage_s3_status', {
      organization: state.organization
    }), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(handleResponse)
      .then(function(data) {
        s3State.storage = data && data.storage && typeof data.storage === 'object' ? data.storage : null;
        s3State.coldStorage = data && data.coldStorage && typeof data.coldStorage === 'object' ? data.coldStorage : null;
        s3State.error = '';
        updateAdminS3Panel();
        return s3State;
      })
      .catch(function(error) {
        s3State.error = error && error.message ? error.message : 'Не удалось получить статус S3.';
        updateAdminS3Panel();
        throw error;
      })
      .finally(function() {
        s3State.loading = false;
        s3State.promise = null;
        updateAdminS3Panel();
      });
    s3State.promise = request;
    return request;
  }

  function fetchAdminS3Listing(path, options) {
    var s3State = ensureAdminS3State();
    var force = options && options.force;
    var nextPath = normalizeAdminS3BrowserPath(typeof path === 'string' ? path : (s3State.listingPath || ''));
    if (!state.organization) {
      s3State.listingError = 'Сначала выберите организацию.';
      updateAdminS3Panel();
      return Promise.reject(new Error(s3State.listingError));
    }
    if (s3State.listingLoading && s3State.listingPromise) {
      return s3State.listingPromise;
    }
    if (!force && s3State.listing && s3State.listingPath === nextPath && !s3State.listingError) {
      updateAdminS3Panel();
      return Promise.resolve(s3State);
    }
    s3State.listingLoading = true;
    s3State.listingError = '';
    if (nextPath !== s3State.listingPath) {
      s3State.listingFilter = '';
    }
    s3State.listingPath = nextPath;
    updateAdminS3Panel();
    var request = fetch(buildApiUrl('storage_s3_list', {
      organization: state.organization,
      scope: 'all',
      path: nextPath
    }), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(handleResponse)
      .then(function(data) {
        var listing = data && data.listing && typeof data.listing === 'object' ? data.listing : null;
        s3State.coldStorage = data && data.coldStorage && typeof data.coldStorage === 'object' ? data.coldStorage : s3State.coldStorage;
        s3State.listing = listing;
        s3State.listingPath = listing && typeof listing.path === 'string' ? listing.path : nextPath;
        s3State.listingLoadedAt = Date.now();
        s3State.listingError = listing && listing.ok === false
          ? (listing.message || 'Не удалось получить список S3.')
          : '';
        updateAdminS3Panel();
        return s3State;
      })
      .catch(function(error) {
        s3State.listingError = error && error.message ? error.message : 'Не удалось получить список S3.';
        updateAdminS3Panel();
        throw error;
      })
      .finally(function() {
        s3State.listingLoading = false;
        s3State.listingPromise = null;
        updateAdminS3Panel();
      });
    s3State.listingPromise = request;
    return request;
  }

  function deleteAdminS3Object(path, type) {
    var s3State = ensureAdminS3State();
    var targetPath = normalizeAdminS3BrowserPath(path);
    var targetType = type === 'directory' ? 'directory' : 'file';
    if (s3State.deleting) {
      return Promise.resolve(s3State);
    }
    if (!targetPath) {
      s3State.listingError = 'Корень S3 удалить нельзя.';
      updateAdminS3Panel();
      return Promise.reject(new Error(s3State.listingError));
    }
    if (!state.organization) {
      s3State.listingError = 'Сначала выберите организацию.';
      updateAdminS3Panel();
      return Promise.reject(new Error(s3State.listingError));
    }

    s3State.deleting = true;
    s3State.listingError = '';
    updateAdminS3Panel();
    var payload = {
      action: 'storage_s3_delete',
      organization: state.organization,
      scope: 'all',
      path: targetPath,
      type: targetType,
      confirm: 'delete'
    };
    mergeTelegramUserId(payload);

    return fetch(buildApiUrl('storage_s3_delete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        s3State.coldStorage = data && data.coldStorage && typeof data.coldStorage === 'object' ? data.coldStorage : s3State.coldStorage;
        setAdminS3Status(data && data.delete && data.delete.message ? data.delete.message : 'Объект удалён из S3.', 'success');
        showMessage('success', data && data.delete && data.delete.message ? data.delete.message : 'Объект удалён из S3.');
        return fetchAdminS3Listing(s3State.listingPath || '', { force: true });
      })
      .catch(function(error) {
        s3State.listingError = error && error.message ? error.message : 'Не удалось удалить объект из S3.';
        setAdminS3Status(s3State.listingError, 'error');
        updateAdminS3Panel();
        showMessage('error', s3State.listingError);
        throw error;
      })
      .finally(function() {
        s3State.deleting = false;
        updateAdminS3Panel();
      });
  }

  function openAdminS3ReaderModal(file) {
    var data = file && typeof file === 'object' ? file : {};
    var modal = createElement('div', 'documents-s3-reader');
    var panel = createElement('div', 'documents-s3-reader__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    var header = createElement('div', 'documents-s3-reader__header');
    var titleWrap = createElement('div', '');
    var title = createElement('h3', 'documents-s3-reader__title', data.name || data.path || 'S3 файл');
    var meta = createElement('div', 'documents-s3-reader__meta', [
      data.label || formatFileSize(data.bytes || 0),
      data.path || '',
      data.remotePath || data.key || ''
    ].filter(Boolean).join(' | '));
    var actions = createElement('div', 'documents-s3-reader__actions');
    var copyButton = createElement('button', 'documents-s3-modal__mini-button', 'Копировать');
    var closeButton = createElement('button', 'documents-s3-modal__mini-button', 'Закрыть');
    var status = createElement('div', 'documents-s3-reader__status');
    var body = createElement('div', 'documents-s3-reader__body');
    var text = createElement('pre', 'documents-s3-reader__text');
    text.textContent = typeof data.text === 'string' && data.text ? data.text : 'Файл пустой.';

    copyButton.type = 'button';
    closeButton.type = 'button';
    status.setAttribute('role', 'status');
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    actions.appendChild(copyButton);
    actions.appendChild(closeButton);
    header.appendChild(titleWrap);
    header.appendChild(actions);
    body.appendChild(text);
    panel.appendChild(header);
    panel.appendChild(status);
    panel.appendChild(body);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    function closeReader() {
      modal.remove();
    }

    function setReaderStatus(message, type) {
      status.textContent = message || '';
      status.classList.toggle('is-visible', Boolean(message));
      status.classList.toggle('documents-s3-reader__status--error', type === 'error');
    }

    copyButton.addEventListener('click', function() {
      var value = text.textContent || '';
      if (!value) {
        setReaderStatus('Нечего копировать.', 'error');
        return;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(value)
          .then(function() {
            setReaderStatus('Текст скопирован.');
          })
          .catch(function() {
            setReaderStatus('Не удалось скопировать автоматически.', 'error');
          });
        return;
      }
      setReaderStatus('Автокопирование недоступно в этом браузере.', 'error');
    });
    closeButton.addEventListener('click', closeReader);
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeReader();
      }
    });
    if (typeof closeButton.focus === 'function') {
      closeButton.focus();
    }
  }

  function readAdminS3File(path, name) {
    var s3State = ensureAdminS3State();
    var targetPath = normalizeAdminS3BrowserPath(path);
    if (s3State.reading) {
      return Promise.resolve(null);
    }
    if (!targetPath) {
      setAdminS3Status('Файл S3 не выбран.', 'error');
      return Promise.reject(new Error('Файл S3 не выбран.'));
    }
    if (!state.organization) {
      setAdminS3Status('Сначала выберите организацию.', 'error');
      return Promise.reject(new Error('Сначала выберите организацию.'));
    }

    s3State.reading = true;
    updateAdminS3Panel();
    setAdminS3Status('Читаем файл из S3…', 'info');
    var payload = {
      action: 'storage_s3_read',
      organization: state.organization,
      scope: 'all',
      path: targetPath
    };
    mergeTelegramUserId(payload);

    return fetch(buildApiUrl('storage_s3_read'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        var file = data && data.file && typeof data.file === 'object' ? data.file : {};
        if (!file.name && name) {
          file.name = name;
        }
        openAdminS3ReaderModal(file);
        setAdminS3Status('Файл прочитан из S3.', 'success');
        return file;
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : 'Не удалось прочитать файл S3.';
        setAdminS3Status(message, 'error');
        showMessage('error', message);
        throw error;
      })
      .finally(function() {
        s3State.reading = false;
        updateAdminS3Panel();
      });
  }

  function refreshAdminS3Panel() {
    var s3State = ensureAdminS3State();
    var path = s3State.listingPath || '';
    return Promise.all([
      fetchAdminS3Status({ force: true }).catch(function(error) { return error; }),
      fetchAdminS3Listing(path, { force: true }).catch(function(error) { return error; })
    ]);
  }

  function runAdminS3Test() {
    var s3State = ensureAdminS3State();
    if (s3State.testing || !state.organization) {
      return;
    }
    s3State.testing = true;
    s3State.error = '';
    updateAdminS3Panel();
    setAdminS3Status('Проверяем загрузку тестового файла…', 'info');
    var payload = {
      action: 'storage_s3_test',
      organization: state.organization
    };
    mergeTelegramUserId(payload);
    fetch(buildApiUrl('storage_s3_test'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        s3State.test = data && data.test && typeof data.test === 'object' ? data.test : null;
        s3State.storage = data && data.storage && typeof data.storage === 'object' ? data.storage : s3State.storage;
        s3State.coldStorage = data && data.coldStorage && typeof data.coldStorage === 'object' ? data.coldStorage : s3State.coldStorage;
        s3State.error = s3State.test && s3State.test.ok === false
          ? (s3State.test.message || 'Проверка загрузки не прошла.')
          : '';
        updateAdminS3Panel();
        if (!s3State.error) {
          fetchAdminS3Listing(s3State.listingPath || '', { force: true }).catch(function() {});
        }
        showMessage(s3State.error ? 'warning' : 'success', s3State.error || 'Проверка загрузки выполнена успешно.');
      })
      .catch(function(error) {
        s3State.error = error && error.message ? error.message : 'Не удалось выполнить тест S3.';
        updateAdminS3Panel();
        showMessage('error', s3State.error);
      })
      .finally(function() {
        s3State.testing = false;
        updateAdminS3Panel();
      });
  }

  function ensureAdminTemplateState() {
    if (!state.admin.template) {
      state.admin.template = {
        exists: false,
        fileName: '',
        templateUrl: '',
        viewerUrl: '',
        size: 0,
        updatedAt: '',
        loading: false,
        uploading: false,
        error: '',
        visible: false,
        promise: null
      };
    }
    return state.admin.template;
  }

  function formatTemplateSize(size) {
    var bytes = Number(size);
    if (!isFinite(bytes) || bytes <= 0) {
      return '';
    }
    if (bytes < 1024) {
      return bytes + ' Б';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1).replace('.0', '') + ' КБ';
    }
    return (bytes / (1024 * 1024)).toFixed(1).replace('.0', '') + ' МБ';
  }

  function setAdminTemplateStatus(text, type) {
    ensureAdminModal();
    if (!adminElements.templateStatus) {
      return;
    }
    var status = adminElements.templateStatus;
    status.textContent = text || '';
    status.classList.toggle('is-visible', Boolean(text));
    status.classList.remove('documents-template-modal__status--error', 'documents-template-modal__status--success');
    if (type === 'error') {
      status.classList.add('documents-template-modal__status--error');
    } else if (type === 'success') {
      status.classList.add('documents-template-modal__status--success');
    }
  }

  function updateAdminTemplatePanel() {
    ensureAdminModal();
    var templateState = ensureAdminTemplateState();
    if (adminElements.templateButton) {
      adminElements.templateButton.disabled = !state.organization;
    }
    if (!adminElements.templateName || !adminElements.templateMeta) {
      return;
    }
    if (templateState.loading) {
      adminElements.templateName.textContent = 'Загружаем данные шаблона…';
      adminElements.templateMeta.textContent = 'Пожалуйста, подождите.';
      setAdminTemplateStatus('Получаем текущий шаблон…', 'info');
    } else if (templateState.error) {
      adminElements.templateName.textContent = 'Не удалось получить шаблон';
      adminElements.templateMeta.textContent = templateState.error;
      setAdminTemplateStatus(templateState.error, 'error');
    } else if (templateState.exists) {
      adminElements.templateName.textContent = templateState.fileName || 'Шаблон организации';
      var metaParts = [];
      var formattedSize = formatTemplateSize(templateState.size);
      if (formattedSize) {
        metaParts.push('Размер: ' + formattedSize);
      }
      if (templateState.updatedAt) {
        metaParts.push('Обновлён: ' + formatAdminLogTimestamp(templateState.updatedAt));
      }
      metaParts.push('Путь: /documents/' + encodeURIComponent(state.organization || '') + '/' + encodeURIComponent((state.organization || '') + '_template.docx'));
      adminElements.templateMeta.textContent = metaParts.join(' • ');
      setAdminTemplateStatus(templateState.uploading ? 'Загрузка шаблона…' : 'Текущий шаблон готов к просмотру.', 'success');
    } else {
      adminElements.templateName.textContent = 'Шаблон ещё не загружен';
      adminElements.templateMeta.textContent = 'Загрузите .docx файл — он будет сохранён как шаблон организации.';
      setAdminTemplateStatus('Файл шаблона не найден. Загрузите новый.', 'info');
    }
    if (adminElements.templateOpenButton) {
      adminElements.templateOpenButton.disabled = !templateState.exists || templateState.loading || templateState.uploading;
    }
    if (adminElements.templateDownloadButton) {
      adminElements.templateDownloadButton.disabled = !templateState.exists || templateState.loading || templateState.uploading;
    }
    if (adminElements.templateUploadButton) {
      adminElements.templateUploadButton.disabled = templateState.loading || templateState.uploading;
      adminElements.templateUploadButton.textContent = templateState.uploading ? 'Загрузка…' : 'Загрузить новый шаблон';
    }
  }

  function fetchAdminTemplate(options) {
    var templateState = ensureAdminTemplateState();
    var force = options && options.force;
    if (!state.organization) {
      templateState.error = 'Сначала выберите организацию.';
      updateAdminTemplatePanel();
      return Promise.reject(new Error(templateState.error));
    }
    if (templateState.loading && templateState.promise) {
      return templateState.promise;
    }
    if (!force && templateState.exists && !templateState.error) {
      return Promise.resolve(templateState);
    }
    templateState.loading = true;
    templateState.error = '';
    updateAdminTemplatePanel();
    var request = fetch(buildApiUrl('get_organization_template', {
      organization: state.organization
    }), {
      credentials: 'same-origin'
    })
      .then(handleResponse)
      .then(function(data) {
        var payload = data && data.template && typeof data.template === 'object' ? data.template : {};
        templateState.exists = payload.exists === true;
        templateState.fileName = payload.fileName ? String(payload.fileName) : '';
        templateState.templateUrl = payload.templateUrl ? String(payload.templateUrl) : '';
        templateState.viewerUrl = payload.viewerUrl ? String(payload.viewerUrl) : '';
        templateState.size = payload.size ? Number(payload.size) : 0;
        templateState.updatedAt = payload.updatedAt ? String(payload.updatedAt) : '';
        templateState.error = '';
        updateAdminTemplatePanel();
        return templateState;
      })
      .catch(function(error) {
        templateState.error = error && error.message ? error.message : 'Не удалось загрузить данные шаблона.';
        updateAdminTemplatePanel();
        throw error;
      })
      .finally(function() {
        templateState.loading = false;
        templateState.promise = null;
        updateAdminTemplatePanel();
      });
    templateState.promise = request;
    return request;
  }

  function openTemplateInOfficeViewer() {
    var templateState = ensureAdminTemplateState();
    if (!templateState.exists || !templateState.viewerUrl) {
      setAdminTemplateStatus('Сначала загрузите шаблон .docx.', 'error');
      return;
    }
    try {
      window.open(templateState.viewerUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setAdminTemplateStatus('Не удалось открыть файл для просмотра.', 'error');
    }
  }

  function downloadCurrentTemplate() {
    var templateState = ensureAdminTemplateState();
    if (!templateState.exists || !templateState.templateUrl) {
      setAdminTemplateStatus('Сначала загрузите шаблон .docx.', 'error');
      return;
    }

    var templateName = String(templateState.fileName || 'template.docx');
    setAdminTemplateStatus('Подготавливаем скачивание шаблона…', 'info');

    fetch(templateState.templateUrl, {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(function(response) {
        if (!response || !response.ok) {
          throw new Error('Не удалось скачать шаблон.');
        }
        return response.blob();
      })
      .then(function(blob) {
        var objectUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = objectUrl;
        link.download = templateName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(function() {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
          URL.revokeObjectURL(objectUrl);
        }, 0);
        setAdminTemplateStatus('Шаблон скачивается.', 'success');
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : 'Не удалось скачать шаблон.';
        setAdminTemplateStatus(message, 'error');
      });
  }

  function uploadOrganizationTemplate(file) {
    var templateState = ensureAdminTemplateState();
    if (!file || typeof file !== 'object' || !file.name) {
      setAdminTemplateStatus('Файл не выбран.', 'error');
      return;
    }
    var name = file.name ? String(file.name).toLowerCase() : '';
    if (name.slice(-5) !== '.docx' && name.slice(-4) !== '.doc') {
      setAdminTemplateStatus('Поддерживаются только файлы .docx или .doc.', 'error');
      return;
    }
    templateState.uploading = true;
    templateState.error = '';
    updateAdminTemplatePanel();
    setAdminTemplateStatus('Подготавливаем файл к загрузке…', 'info');
    var formData = new FormData();
    formData.append('action', 'upload_organization_template');
    formData.append('organization', state.organization || '');
    formData.append('template', file, file.name || 'template.docx');
    appendTelegramUserIdToFormData(formData);
    uploadFormDataWithProgress(buildApiUrl('upload_organization_template'), formData, function(progress) {
      if (!progress || !progress.lengthComputable || progress.total <= 0) {
        setAdminTemplateStatus('Загрузка шаблона…', 'info');
        return;
      }
      var percent = Math.round((progress.loaded / progress.total) * 100);
      setAdminTemplateStatus('Загрузка шаблона: ' + percent + '%', 'info');
    })
      .then(handleResponseData)
      .then(function() {
        setAdminTemplateStatus('Шаблон успешно обновлён.', 'success');
        return fetchAdminTemplate({ force: true });
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : 'Не удалось загрузить шаблон.';
        setAdminTemplateStatus(message, 'error');
      })
      .finally(function() {
        templateState.uploading = false;
        updateAdminTemplatePanel();
      });

    function handleResponseData(data) {
      if (!data || typeof data !== 'object') {
        return {};
      }
      if (data.error) {
        throw new Error(String(data.error));
      }
      return data;
    }
  }

  function canUseGlobalAdminOcr() {
    var adminScope = state.access && typeof state.access.adminScope === 'string'
      ? state.access.adminScope.toLowerCase()
      : '';
    return isCurrentUserAdmin() && (adminScope === 'global' || adminScope === 'mainadmin');
  }

  function ensureAdminOcrState() {
    if (!state.admin.ocr || typeof state.admin.ocr !== 'object') {
      state.admin.ocr = {};
    }
    var ocrState = state.admin.ocr;
    var defaults = {
      visible: false,
      activeTab: 'backfill',
      loading: false,
      action: '',
      error: '',
      backfill: null,
      query: '',
      statusFilter: '',
      page: 1,
      pageSize: 25,
      pollTimer: null,
      pollInFlight: false,
      requestToken: 0,
      inputTimer: null,
      focusReturnElement: null
    };
    Object.keys(defaults).forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(ocrState, key)) {
        ocrState[key] = defaults[key];
      }
    });
    if (ocrState.activeTab !== 'users') {
      ocrState.activeTab = 'backfill';
    }
    if (!ocrState.users || typeof ocrState.users !== 'object') {
      ocrState.users = {};
    }
    var userDefaults = {
      loading: false,
      error: '',
      items: [],
      pagination: null,
      query: '',
      statusFilter: '',
      page: 1,
      pageSize: 12,
      selectedId: '',
      detailLoading: false,
      detailError: '',
      detail: null,
      detailQuery: '',
      detailPage: 1,
      detailPageSize: 20,
      textLoading: false,
      textResult: null,
      requestToken: 0,
      detailRequestToken: 0,
      textRequestToken: 0,
      inputTimer: null,
      detailInputTimer: null,
      textReturnFocusElement: null
    };
    Object.keys(userDefaults).forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(ocrState.users, key)) {
        ocrState.users[key] = userDefaults[key];
      }
    });

    return ocrState;
  }

  function setAdminOcrElementInert(element, shouldBeInert) {
    if (!element) {
      return;
    }
    if (shouldBeInert) {
      element.setAttribute('inert', '');
    } else {
      element.removeAttribute('inert');
    }
  }

  function focusAdminOcrElement(element) {
    if (!element
      || element.disabled
      || element.hidden
      || !document.documentElement.contains(element)
      || typeof element.focus !== 'function'
    ) {
      return false;
    }
    try {
      element.focus();
      return true;
    } catch (error) {
      return false;
    }
  }

  function focusAdminOcrDialog() {
    var ocrState = ensureAdminOcrState();
    var activeTab = adminElements.ocrTabs
      ? adminElements.ocrTabs.querySelector('[data-ocr-tab="' + ocrState.activeTab + '"]')
      : null;
    if (!focusAdminOcrElement(activeTab)) {
      focusAdminOcrElement(adminElements.ocrButton);
    }
  }

  function getAdminOcrFocusableElements(container) {
    if (!container) {
      return [];
    }
    return Array.prototype.filter.call(container.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    ), function(element) {
      return !element.hidden && element.getClientRects().length > 0;
    });
  }

  function trapAdminOcrFocus(event) {
    var container = adminElements.ocrTextReader
      && adminElements.ocrTextReader.classList.contains('is-visible')
      ? adminElements.ocrTextReader
      : null;
    if (!container) {
      return false;
    }
    var focusable = getAdminOcrFocusableElements(container);
    if (!focusable.length) {
      event.preventDefault();
      return true;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var active = document.activeElement;
    if (!container.contains(active)) {
      event.preventDefault();
      focusAdminOcrElement(event.shiftKey ? last : first);
      return true;
    }
    if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault();
      focusAdminOcrElement(event.shiftKey ? last : first);
      return true;
    }
    return false;
  }

  function resetAdminOcrUserDetail(usersState) {
    usersState.detailRequestToken += 1;
    usersState.detailLoading = false;
    usersState.detailError = '';
    usersState.detail = null;
    usersState.detailQuery = '';
    usersState.detailPage = 1;
  }

  function adminOcrNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number).toLocaleString('ru-RU') : '0';
  }

  function formatAdminOcrDate(value) {
    var formatted = value ? formatDateTime(value) : '';
    return formatted || '—';
  }

  function adminOcrStatusLabel(status) {
    var labels = {
      idle: 'Не запускался',
      running: 'Выполняется',
      paused: 'Остановлен после файла',
      completed: 'Завершено',
      attention: 'Нужны действия',
      pending: 'Ожидает',
      processing: 'Обрабатывается',
      retry: 'Повтор',
      failed: 'Ошибка',
      skipped: 'Файл удалён',
      unsupported: 'Формат не поддерживается',
      complete: 'Все тексты есть',
      incomplete: 'Есть пропуски',
      error: 'Ошибка чтения',
      missing: 'JSON отсутствует',
      ocr_missing: 'OCR-текст отсутствует',
      not_checked: 'Не проверен'
    };
    return labels[status] || (status ? String(status) : 'Неизвестно');
  }

  function adminOcrStageLabel(stage) {
    var labels = {
      waiting: 'Ожидание',
      waiting_slot: 'Ожидание единственного OCR-слота',
      resolving_file: 'Получение исходного файла',
      source: 'Исходный файл недоступен',
      creating_job: 'Создание OCR-задания',
      ocr: 'Распознавание текста',
      archive: 'Запись и проверка OCR-архива S3',
      registry: 'Сохранение метаданных задачи',
      delivery: 'Запись и проверка Telegram JSON в S3',
      resource_guard: 'Остановлено защитой памяти',
      completed: 'S3 подтверждён',
      failed: 'Ошибка',
      skipped: 'Файл удалён',
      unsupported: 'Формат не поддерживается'
    };
    return labels[stage] || (stage ? String(stage) : 'Ожидание');
  }

  function createAdminOcrBadge(status) {
    var normalized = String(status || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return createElement(
      'span',
      'documents-ocr-admin__badge' + (normalized ? ' documents-ocr-admin__badge--' + normalized : ''),
      adminOcrStatusLabel(status)
    );
  }

  function createAdminOcrPagination(scope, pagination) {
    var page = Math.max(1, Number(pagination && pagination.page) || 1);
    var pages = Math.max(1, Number(pagination && pagination.pages) || 1);
    var total = Math.max(0, Number(pagination && pagination.total) || 0);
    var wrapper = createElement('div', 'documents-ocr-admin__pagination');
    var previous = createElement('button', '', 'Назад');
    previous.type = 'button';
    previous.disabled = page <= 1;
    previous.setAttribute('data-ocr-page-scope', scope);
    previous.setAttribute('data-ocr-page-number', String(Math.max(1, page - 1)));
    var label = createElement(
      'span',
      '',
      'Страница ' + page + ' из ' + pages + ' · найдено ' + adminOcrNumber(total)
    );
    var next = createElement('button', '', 'Вперёд');
    next.type = 'button';
    next.disabled = page >= pages;
    next.setAttribute('data-ocr-page-scope', scope);
    next.setAttribute('data-ocr-page-number', String(Math.min(pages, page + 1)));
    wrapper.appendChild(previous);
    wrapper.appendChild(label);
    wrapper.appendChild(next);
    return wrapper;
  }

  function createAdminOcrFilter(options, selectedValue, focusKey) {
    var select = document.createElement('select');
    select.className = 'documents-s3-modal__input';
    select.setAttribute('data-ocr-focus', focusKey);
    options.forEach(function(item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = selectedValue || '';
    return select;
  }

  function createAdminOcrActionButton(label, operation, primary, disabled) {
    var button = createElement(
      'button',
      'documents-s3-modal__mini-button' + (primary ? ' documents-s3-modal__button--primary' : ''),
      label
    );
    button.type = 'button';
    button.disabled = Boolean(disabled);
    button.setAttribute('data-ocr-action', operation);
    return button;
  }

  function isAdminOcrArchiveConfirmed(item) {
    return Boolean(
      item
      && String(item.status || '') === 'completed'
      && String(item.archiveKey || '').trim() !== ''
    );
  }

  function adminOcrNoRecipientsState(item) {
    var status = String(item && item.status ? item.status : 'pending');
    if (isAdminOcrArchiveConfirmed(item)) {
      return 'OCR-архив S3 подтверждён';
    }
    if (status === 'unsupported') {
      return 'формат не поддерживается OCR';
    }
    if (status === 'failed') {
      return 'ошибка обработки';
    }
    if (status === 'skipped') {
      return 'файл удалён';
    }
    if (status === 'retry') {
      return 'ожидает повторной обработки';
    }
    if (status === 'pending') {
      return 'ожидает обработки';
    }
    if (item && String(item.archiveKey || '').trim() !== '') {
      return 'ключ OCR-архива получен, завершение не подтверждено';
    }
    if (status === 'completed') {
      return 'ключ OCR-архива не подтверждён';
    }
    return status === 'processing' ? 'обработка не завершена' : 'ожидает обработки';
  }

  function renderAdminOcrDeliveries(deliveries, participants, item) {
    var wrapper = createElement('div', 'documents-ocr-admin__deliveries');
    var entries = Array.isArray(deliveries) ? deliveries : [];
    if (!entries.length) {
      wrapper.appendChild(createElement(
        'span',
        'documents-ocr-admin__delivery',
        Number(participants) > 0
          ? 'Доставка в ' + adminOcrNumber(participants) + ' Telegram JSON начнётся после записи OCR-архива.'
          : 'Telegram-получателей нет: ' + adminOcrNoRecipientsState(item) + '.'
      ));
      return wrapper;
    }
    entries.forEach(function(delivery) {
      var verified = delivery && delivery.status === 'verified' && delivery.hasText === true;
      var telegramId = delivery && delivery.telegramId ? String(delivery.telegramId) : 'без ID';
      var key = delivery && delivery.key ? String(delivery.key) : 'ключ S3 не получен';
      var text = telegramId + '.json — ' + (verified ? 'текст подтверждён' : 'не подтверждён');
      if (verified) {
        text += ' · ' + adminOcrNumber(delivery.textLength) + ' симв.';
      }
      text += ' · ' + key;
      var chip = createElement(
        'span',
        'documents-ocr-admin__delivery' + (verified ? '' : ' is-error'),
        text
      );
      if (delivery && delivery.error) {
        chip.title = String(delivery.error);
      }
      wrapper.appendChild(chip);
    });
    return wrapper;
  }

  function renderAdminOcrBackfill(container, ocrState) {
    var backfill = ocrState.backfill && typeof ocrState.backfill === 'object'
      ? ocrState.backfill
      : {};
    var summary = backfill.summary && typeof backfill.summary === 'object' ? backfill.summary : {};
    var scan = backfill.scan && typeof backfill.scan === 'object' ? backfill.scan : {};
    var finalAudit = backfill.finalAudit && typeof backfill.finalAudit === 'object'
      ? backfill.finalAudit
      : {};
    var status = String(backfill.status || 'idle');
    var busy = Boolean(ocrState.loading || ocrState.action);
    var errorCount = Math.max(0, Number(summary.failed) || 0) + Math.max(0, Number(summary.skipped) || 0);
    var finalAuditFailed = String(finalAudit.status || '') === 'failed';

    var metrics = createElement('div', 'documents-s3-modal__grid');
    metrics.appendChild(createAdminS3Metric('Основных вложений', adminOcrNumber(scan.files || summary.total)));
    metrics.appendChild(createAdminS3Metric('Поддерживается OCR', adminOcrNumber(summary.eligible)));
    metrics.appendChild(createAdminS3Metric('S3 подтверждено', adminOcrNumber(summary.completed)));
    metrics.appendChild(createAdminS3Metric('Осталось', adminOcrNumber(summary.remaining)));
    metrics.appendChild(createAdminS3Metric('Ошибки / удалены', adminOcrNumber(errorCount)));
    metrics.appendChild(createAdminS3Metric('Формат не OCR', adminOcrNumber(summary.unsupported)));
    metrics.appendChild(createAdminS3Metric(
      'Telegram JSON подтверждено',
      adminOcrNumber(summary.delivered) + ' из ' + adminOcrNumber(summary.participants)
    ));
    metrics.appendChild(createAdminS3Metric('Без Telegram ID', adminOcrNumber(summary.noRecipients)));
    metrics.appendChild(createAdminS3Metric(
      'Финальная сверка JSON',
      String(finalAudit.status || '') === 'completed'
        ? adminOcrNumber(finalAudit.verifiedFiles) + ' из ' + adminOcrNumber(finalAudit.expectedFiles)
        : (finalAuditFailed ? 'Ошибка' : 'Ожидает')
    ));
    container.appendChild(metrics);

    var percent = Math.max(0, Math.min(100, Number(summary.percent) || 0));
    var progress = createElement('div', 'documents-ocr-admin__progress');
    var progressTrack = createElement('div', 'documents-ocr-admin__progress-track');
    var progressBar = createElement('div', 'documents-ocr-admin__progress-bar');
    progressBar.style.width = String(percent) + '%';
    progressTrack.appendChild(progressBar);
    progress.appendChild(progressTrack);
    progress.appendChild(createElement(
      'div',
      'documents-ocr-admin__progress-value',
      percent + '% · ' + adminOcrNumber(summary.completed) + ' из ' + adminOcrNumber(summary.eligible)
    ));
    container.appendChild(progress);

    var current = backfill.current && typeof backfill.current === 'object' ? backfill.current : null;
    var active = createElement('section', 'documents-ocr-admin__active');
    if (current) {
      active.appendChild(createElement(
        'div',
        'documents-ocr-admin__active-title',
        (current.originalName || current.storedName || 'Файл без имени') + ' · задача ' + (current.taskLabel || 'без номера')
      ));
      active.appendChild(createElement(
        'span',
        'documents-ocr-admin__active-state',
        adminOcrStageLabel(current.stage)
      ));
      var pageText = Number(current.totalPages) > 0
        ? ' · страница ' + adminOcrNumber(current.currentPage) + ' из ' + adminOcrNumber(current.totalPages)
        : '';
      active.appendChild(createElement(
        'div',
        'documents-ocr-admin__active-meta',
        'Организация: ' + (current.organization || '—') +
          ' · OCR ' + adminOcrNumber(current.progress) + '%' + pageText +
          ' · попытка ' + adminOcrNumber(current.attempts)
      ));
      active.appendChild(renderAdminOcrDeliveries(current.deliveries, current.participants, current));
    } else {
      active.appendChild(createElement(
        'div',
        'documents-ocr-admin__active-title',
        status === 'running' && summary.filesPassedBeforeFinalAudit
          ? 'Все файлы обработаны. Worker перечитывает конечные Telegram JSON и сверяет полный набор текстов.'
          : (status === 'running'
            ? 'Worker выбирает следующий файл. Одновременно второй OCR-файл не запускается.'
            : 'Сейчас файл не обрабатывается.')
      ));
      active.appendChild(createElement('span', 'documents-ocr-admin__active-state', adminOcrStatusLabel(status)));
      active.appendChild(createElement(
        'div',
        'documents-ocr-admin__active-meta',
        'Последний heartbeat: ' + formatAdminOcrDate(backfill.heartbeatAt) +
          (backfill.stopRequested ? ' · остановка запрошена после текущего файла' : '')
      ));
    }
    container.appendChild(active);

    var toolbar = createElement('div', 'documents-ocr-admin__toolbar');
    var queryInput = document.createElement('input');
    queryInput.type = 'search';
    queryInput.className = 'documents-s3-modal__input';
    queryInput.placeholder = 'Организация, задача, файл, Telegram ID или ошибка';
    queryInput.value = ocrState.query || '';
    queryInput.setAttribute('data-ocr-backfill-query', '1');
    queryInput.setAttribute('data-ocr-focus', 'backfill-query');
    toolbar.appendChild(queryInput);
    var statusSelect = createAdminOcrFilter([
      { value: '', label: 'Все статусы' },
      { value: 'pending', label: 'Ожидают' },
      { value: 'processing', label: 'Обрабатывается' },
      { value: 'retry', label: 'Ожидают повтора' },
      { value: 'completed', label: 'S3 подтверждён' },
      { value: 'failed', label: 'Ошибки' },
      { value: 'skipped', label: 'Удалены во время прохода' },
      { value: 'unsupported', label: 'Формат не поддерживается' }
    ], ocrState.statusFilter, 'backfill-status');
    statusSelect.setAttribute('data-ocr-backfill-status', '1');
    toolbar.appendChild(statusSelect);
    var controlActions = createElement('div', 'documents-s3-modal__actions');
    var startLabel = backfill.runId ? 'Новый проход' : 'Найти и запустить';
    var startButton = createAdminOcrActionButton(startLabel, 'start', status === 'idle', busy || status === 'running' || status === 'paused');
    var pauseButton = createAdminOcrActionButton(
      backfill.stopRequested ? 'Остановка запрошена' : 'Остановить после файла',
      'stop_after_current',
      false,
      busy || status !== 'running' || Boolean(backfill.stopRequested)
    );
    var resumeButton = createAdminOcrActionButton('Продолжить', 'resume', true, busy || status !== 'paused');
    var retryButton = createAdminOcrActionButton(
      finalAuditFailed && errorCount <= 0 ? 'Повторить сверку JSON' : 'Повторить ошибки',
      'retry_failed',
      false,
      busy || status === 'running' || (errorCount <= 0 && !finalAuditFailed)
    );
    startButton.hidden = status === 'running' || status === 'paused';
    pauseButton.hidden = status !== 'running';
    resumeButton.hidden = status !== 'paused';
    controlActions.appendChild(startButton);
    controlActions.appendChild(pauseButton);
    controlActions.appendChild(resumeButton);
    controlActions.appendChild(retryButton);
    toolbar.appendChild(controlActions);
    container.appendChild(toolbar);

    var tableWrap = createElement('div', 'documents-ocr-admin__table-wrap');
    tableWrap.setAttribute('data-ocr-scroll', 'backfill-table');
    var table = createElement('table', 'documents-ocr-admin__table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Организация / задача', 'Файл', 'Статус / этап', 'Прогресс', 'OCR-архив S3', 'Telegram JSON', 'Ошибка / обновлено'].forEach(function(label) {
      headRow.appendChild(createElement('th', '', label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    var items = Array.isArray(backfill.items) ? backfill.items : [];
    if (!items.length) {
      var emptyRow = document.createElement('tr');
      var emptyCell = createElement('td', 'documents-ocr-admin__empty', backfill.runId
        ? 'По выбранному фильтру файлы не найдены.'
        : 'Проход ещё не запускался. Нажмите «Найти и запустить».'
      );
      emptyCell.colSpan = 7;
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }
    items.forEach(function(item) {
      var row = document.createElement('tr');
      var taskCell = document.createElement('td');
      taskCell.appendChild(createElement('div', 'documents-ocr-admin__name', item.organization || '—'));
      taskCell.appendChild(createElement('div', 'documents-ocr-admin__muted', 'Задача ' + (item.taskLabel || 'без номера')));
      row.appendChild(taskCell);
      var fileCell = document.createElement('td');
      fileCell.appendChild(createElement('div', 'documents-ocr-admin__name', item.originalName || item.storedName || 'Файл без имени'));
      fileCell.appendChild(createElement('div', 'documents-ocr-admin__muted', item.storedName || 'Нет имени хранения'));
      row.appendChild(fileCell);
      var statusCell = document.createElement('td');
      statusCell.appendChild(createAdminOcrBadge(item.status));
      statusCell.appendChild(createElement('div', 'documents-ocr-admin__muted', adminOcrStageLabel(item.stage)));
      row.appendChild(statusCell);
      var itemPageText = Number(item.totalPages) > 0
        ? ' · стр. ' + adminOcrNumber(item.currentPage) + '/' + adminOcrNumber(item.totalPages)
        : '';
      row.appendChild(createElement('td', '', adminOcrNumber(item.progress) + '%' + itemPageText));
      var archiveKey = item.archiveKey ? String(item.archiveKey) : '';
      var archiveConfirmed = isAdminOcrArchiveConfirmed(item);
      var archiveText = archiveConfirmed
        ? archiveKey
        : (archiveKey
          ? archiveKey + ' · завершение не подтверждено'
          : (item.status === 'completed' ? 'Ключ архива не подтверждён' : '—'));
      var archiveCell = createElement('td', 'documents-s3-modal__key', archiveText);
      archiveCell.title = archiveText;
      row.appendChild(archiveCell);
      var participants = Math.max(0, Number(item.participants) || 0);
      var telegramText = participants > 0
        ? adminOcrNumber(item.delivered) + ' из ' + adminOcrNumber(participants) +
          (item.allPresent ? ' · подтверждено' : ' · не завершено')
        : 'Нет получателей · ' + adminOcrNoRecipientsState(item);
      row.appendChild(createElement('td', '', telegramText));
      var errorCell = document.createElement('td');
      errorCell.appendChild(createElement('div', '', item.error || '—'));
      errorCell.appendChild(createElement('div', 'documents-ocr-admin__muted', formatAdminOcrDate(item.updatedAt)));
      row.appendChild(errorCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
    container.appendChild(createAdminOcrPagination('backfill', backfill.pagination || {}));
  }

  function renderAdminOcrUsers(container, ocrState) {
    var usersState = ocrState.users;
    var layout = createElement('div', 'documents-ocr-admin__users-layout');
    var usersPane = createElement('section', 'documents-ocr-admin__pane');
    usersPane.appendChild(createElement('h4', 'documents-ocr-admin__pane-title', 'Telegram-пользователи в S3'));

    var usersToolbar = createElement('div', 'documents-ocr-admin__toolbar');
    var usersQuery = document.createElement('input');
    usersQuery.type = 'search';
    usersQuery.className = 'documents-s3-modal__input';
    usersQuery.placeholder = 'Имя, Telegram ID или организация';
    usersQuery.value = usersState.query || '';
    usersQuery.setAttribute('data-ocr-users-query', '1');
    usersQuery.setAttribute('data-ocr-focus', 'users-query');
    usersToolbar.appendChild(usersQuery);
    var usersStatus = createAdminOcrFilter([
      { value: '', label: 'Все состояния' },
      { value: 'complete', label: 'Все OCR-тексты есть' },
      { value: 'incomplete', label: 'Есть пропуски' },
      { value: 'error', label: 'Ошибка чтения' },
      { value: 'missing', label: 'JSON отсутствует' },
      { value: 'not_checked', label: 'Ещё не прочитан' }
    ], usersState.statusFilter, 'users-status');
    usersStatus.setAttribute('data-ocr-users-status', '1');
    usersToolbar.appendChild(usersStatus);
    usersToolbar.appendChild(createAdminOcrActionButton('Обновить список', 'refresh_users', false, usersState.loading));
    usersPane.appendChild(usersToolbar);

    var usersTableWrap = createElement('div', 'documents-ocr-admin__table-wrap');
    usersTableWrap.setAttribute('data-ocr-scroll', 'users-table');
    var usersTable = createElement('table', 'documents-ocr-admin__table documents-ocr-admin__table--users');
    var usersHead = document.createElement('thead');
    var usersHeadRow = document.createElement('tr');
    ['Пользователь', 'Состояние', 'OCR-файлы', 'S3 JSON'].forEach(function(label) {
      usersHeadRow.appendChild(createElement('th', '', label));
    });
    usersHead.appendChild(usersHeadRow);
    usersTable.appendChild(usersHead);
    var usersBody = document.createElement('tbody');
    var users = Array.isArray(usersState.items) ? usersState.items : [];
    if (!users.length) {
      var emptyUsersRow = document.createElement('tr');
      var emptyUsersCell = createElement(
        'td',
        'documents-ocr-admin__empty',
        usersState.loading ? 'Читаем каталог пользовательских JSON из S3…' : 'Пользователи не найдены.'
      );
      emptyUsersCell.colSpan = 4;
      emptyUsersRow.appendChild(emptyUsersCell);
      usersBody.appendChild(emptyUsersRow);
    }
    users.forEach(function(user) {
      var row = document.createElement('tr');
      var userCell = document.createElement('td');
      var userButton = createElement(
        'button',
        'documents-ocr-admin__user-button' + (String(usersState.selectedId) === String(user.telegramId) ? ' is-active' : ''),
        user.name || ('Telegram ' + (user.telegramId || 'без ID'))
      );
      userButton.type = 'button';
      userButton.disabled = !user.s3Exists;
      userButton.setAttribute('data-ocr-user-id', user.telegramId || '');
      userCell.appendChild(userButton);
      userCell.appendChild(createElement('div', 'documents-ocr-admin__muted', 'ID ' + (user.telegramId || '—')));
      var organizations = Array.isArray(user.organizations) ? user.organizations.join(', ') : '';
      if (organizations) {
        userCell.appendChild(createElement('div', 'documents-ocr-admin__muted', organizations));
      }
      row.appendChild(userCell);
      var userStatusCell = document.createElement('td');
      userStatusCell.appendChild(createAdminOcrBadge(user.s3Status));
      if (user.error) {
        userStatusCell.appendChild(createElement('div', 'documents-ocr-admin__muted', user.error));
      }
      row.appendChild(userStatusCell);
      var coverageCell = document.createElement('td');
      coverageCell.appendChild(createElement(
        'div',
        'documents-ocr-admin__name',
        adminOcrNumber(user.filesWithOcr) + ' из ' + adminOcrNumber(user.eligibleFiles)
      ));
      coverageCell.appendChild(createElement(
        'div',
        'documents-ocr-admin__muted',
        'Пропусков: ' + adminOcrNumber(user.missingOcrFiles) + ' · ' + adminOcrNumber(user.ocrTextCharacters) + ' симв.'
      ));
      row.appendChild(coverageCell);
      var s3Cell = document.createElement('td');
      s3Cell.appendChild(createElement('div', 'documents-ocr-admin__name', user.s3Exists ? (user.s3SizeLabel || formatFileSize(user.s3Size || 0)) : 'Нет файла'));
      s3Cell.appendChild(createElement('div', 'documents-ocr-admin__muted', formatAdminOcrDate(user.s3ModifiedAt || user.verifiedAt)));
      if (user.s3Key) {
        s3Cell.appendChild(createElement('div', 'documents-s3-modal__key', user.s3Key));
      }
      row.appendChild(s3Cell);
      usersBody.appendChild(row);
    });
    usersTable.appendChild(usersBody);
    usersTableWrap.appendChild(usersTable);
    usersPane.appendChild(usersTableWrap);
    usersPane.appendChild(createAdminOcrPagination('users', usersState.pagination || {}));
    layout.appendChild(usersPane);

    var detailPane = createElement('section', 'documents-ocr-admin__pane');
    var detail = usersState.detail && typeof usersState.detail === 'object' ? usersState.detail : null;
    var selectedLabel = detail && detail.user
      ? (detail.user.name || ('Telegram ' + (detail.user.telegramId || usersState.selectedId)))
      : (usersState.selectedId ? 'Telegram ' + usersState.selectedId : 'Файлы выбранного пользователя');
    detailPane.appendChild(createElement('h4', 'documents-ocr-admin__pane-title', selectedLabel));
    if (!usersState.selectedId) {
      detailPane.appendChild(createElement(
        'div',
        'documents-ocr-admin__empty',
        'Выберите пользователя слева. Будут показаны все его файлы, включая строки без OCR-текста.'
      ));
      layout.appendChild(detailPane);
      container.appendChild(layout);
      return;
    }
    if (usersState.detailLoading && !detail) {
      detailPane.appendChild(createElement('div', 'documents-ocr-admin__empty', 'Читаем выбранный JSON непосредственно из S3…'));
      layout.appendChild(detailPane);
      container.appendChild(layout);
      return;
    }
    if (usersState.detailError && !detail) {
      detailPane.appendChild(createElement('div', 'documents-ocr-admin__empty', usersState.detailError));
      layout.appendChild(detailPane);
      container.appendChild(layout);
      return;
    }
    if (usersState.detailError) {
      detailPane.appendChild(createElement('div', 'documents-ocr-admin__empty', usersState.detailError));
    }

    var detailSummary = detail && detail.summary && typeof detail.summary === 'object' ? detail.summary : {};
    var detailMetrics = createElement('div', 'documents-s3-modal__grid');
    detailMetrics.appendChild(createAdminS3Metric('Задач', adminOcrNumber(detailSummary.tasksCount)));
    detailMetrics.appendChild(createAdminS3Metric('Файлов', adminOcrNumber(detailSummary.filesCount)));
    detailMetrics.appendChild(createAdminS3Metric(
      'С OCR-текстом',
      adminOcrNumber(detailSummary.filesWithOcr) + ' из ' + adminOcrNumber(detailSummary.eligibleFiles)
    ));
    detailMetrics.appendChild(createAdminS3Metric('Символов OCR', adminOcrNumber(detailSummary.ocrTextCharacters)));
    detailPane.appendChild(detailMetrics);

    var detailToolbar = createElement('div', 'documents-ocr-admin__toolbar');
    var detailQuery = document.createElement('input');
    detailQuery.type = 'search';
    detailQuery.className = 'documents-s3-modal__input';
    detailQuery.placeholder = 'Организация, задача, файл или текст внутри OCR';
    detailQuery.value = usersState.detailQuery || '';
    detailQuery.setAttribute('data-ocr-detail-query', '1');
    detailQuery.setAttribute('data-ocr-focus', 'detail-query');
    detailToolbar.appendChild(detailQuery);
    var snapshotMeta = detail && detail.snapshot ? detail.snapshot : {};
    detailToolbar.appendChild(createElement(
      'div',
      'documents-ocr-admin__muted',
      'S3 прочитан: ' + formatAdminOcrDate(snapshotMeta.readAt) + ' · снимок: ' + formatAdminOcrDate(snapshotMeta.generatedAt)
    ));
    detailToolbar.appendChild(createAdminOcrActionButton('Перечитать JSON', 'refresh_detail', false, usersState.detailLoading));
    detailPane.appendChild(detailToolbar);

    var detailTableWrap = createElement('div', 'documents-ocr-admin__table-wrap');
    detailTableWrap.setAttribute('data-ocr-scroll', 'detail-table');
    var detailTable = createElement('table', 'documents-ocr-admin__table documents-ocr-admin__table--files');
    var detailHead = document.createElement('thead');
    var detailHeadRow = document.createElement('tr');
    ['Организация / задача', 'Файл', 'OCR в S3', 'Фрагмент текста', 'Действие'].forEach(function(label) {
      detailHeadRow.appendChild(createElement('th', '', label));
    });
    detailHead.appendChild(detailHeadRow);
    detailTable.appendChild(detailHead);
    var detailBody = document.createElement('tbody');
    var files = detail && Array.isArray(detail.items) ? detail.items : [];
    if (!files.length) {
      var emptyFilesRow = document.createElement('tr');
      var emptyFilesCell = createElement('td', 'documents-ocr-admin__empty', usersState.detailLoading
        ? 'Перечитываем S3…'
        : 'Файлы по выбранному поиску не найдены.'
      );
      emptyFilesCell.colSpan = 5;
      emptyFilesRow.appendChild(emptyFilesCell);
      detailBody.appendChild(emptyFilesRow);
    }
    files.forEach(function(file) {
      var row = document.createElement('tr');
      var taskCell = document.createElement('td');
      taskCell.appendChild(createElement('div', 'documents-ocr-admin__name', file.organization || '—'));
      taskCell.appendChild(createElement('div', 'documents-ocr-admin__muted', 'Задача ' + (file.taskLabel || 'без номера')));
      row.appendChild(taskCell);
      var fileCell = document.createElement('td');
      fileCell.appendChild(createElement('div', 'documents-ocr-admin__name', file.fileName || file.storedName || 'Файл без имени'));
      fileCell.appendChild(createElement('div', 'documents-ocr-admin__muted', file.storedName || 'Нет имени хранения'));
      row.appendChild(fileCell);
      var textStateCell = document.createElement('td');
      textStateCell.appendChild(createAdminOcrBadge(
        file.textPresent ? 'complete' : (file.supported ? 'ocr_missing' : 'unsupported')
      ));
      textStateCell.appendChild(createElement(
        'div',
        'documents-ocr-admin__muted',
        file.supported ? adminOcrNumber(file.ocrTextLength) + ' симв.' : 'Формат не поддерживается OCR'
      ));
      row.appendChild(textStateCell);
      row.appendChild(createElement(
        'td',
        'documents-ocr-admin__preview',
        file.textPreview || (file.textPresent ? 'Текст есть; откройте для просмотра.' : 'OCR-текст отсутствует.')
      ));
      var actionCell = document.createElement('td');
      var openText = createElement('button', 'documents-s3-modal__mini-button', 'Открыть текст');
      openText.type = 'button';
      openText.disabled = !file.textPresent || !file.entryToken;
      openText.setAttribute('data-ocr-text-token', file.entryToken || '');
      openText.setAttribute('data-ocr-text-user-id', usersState.selectedId || '');
      actionCell.appendChild(openText);
      row.appendChild(actionCell);
      detailBody.appendChild(row);
    });
    detailTable.appendChild(detailBody);
    detailTableWrap.appendChild(detailTable);
    detailPane.appendChild(detailTableWrap);
    detailPane.appendChild(createAdminOcrPagination('detail', detail && detail.pagination ? detail.pagination : {}));
    layout.appendChild(detailPane);
    container.appendChild(layout);
  }

  function setAdminOcrStatus(message, type) {
    if (!adminElements.ocrStatus) {
      return;
    }
    adminElements.ocrStatus.textContent = message || '';
    adminElements.ocrStatus.classList.toggle('is-visible', Boolean(message));
    adminElements.ocrStatus.classList.remove(
      'documents-s3-modal__status--error',
      'documents-s3-modal__status--success'
    );
    if (type === 'error') {
      adminElements.ocrStatus.classList.add('documents-s3-modal__status--error');
    } else if (type === 'success') {
      adminElements.ocrStatus.classList.add('documents-s3-modal__status--success');
    }
  }

  function renderAdminOcrModal() {
    if (!adminElements.ocrSummary || !adminElements.ocrTabs) {
      return;
    }
    var ocrState = ensureAdminOcrState();
    var activeElement = document.activeElement;
    var focusKey = activeElement && adminElements.ocrModal && adminElements.ocrModal.contains(activeElement)
      ? activeElement.getAttribute('data-ocr-focus') || ''
      : '';
    var selectionStart = focusKey && typeof activeElement.selectionStart === 'number'
      ? activeElement.selectionStart
      : null;
    var scrollPositions = {};
    adminElements.ocrSummary.querySelectorAll('[data-ocr-scroll]').forEach(function(element) {
      scrollPositions[element.getAttribute('data-ocr-scroll')] = {
        top: element.scrollTop,
        left: element.scrollLeft
      };
    });

    adminElements.ocrTabs.querySelectorAll('[data-ocr-tab]').forEach(function(tab) {
      var active = tab.getAttribute('data-ocr-tab') === ocrState.activeTab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    adminElements.ocrSummary.innerHTML = '';
    if (ocrState.activeTab === 'users') {
      renderAdminOcrUsers(adminElements.ocrSummary, ocrState);
    } else {
      renderAdminOcrBackfill(adminElements.ocrSummary, ocrState);
    }

    adminElements.ocrSummary.querySelectorAll('[data-ocr-scroll]').forEach(function(element) {
      var key = element.getAttribute('data-ocr-scroll');
      if (Object.prototype.hasOwnProperty.call(scrollPositions, key)) {
        element.scrollTop = scrollPositions[key].top;
        element.scrollLeft = scrollPositions[key].left;
      }
    });
    if (focusKey) {
      var nextFocus = adminElements.ocrSummary.querySelector('[data-ocr-focus="' + focusKey + '"]');
      if (nextFocus && typeof nextFocus.focus === 'function') {
        nextFocus.focus();
        if (selectionStart !== null && typeof nextFocus.setSelectionRange === 'function') {
          nextFocus.setSelectionRange(selectionStart, selectionStart);
        }
      }
    }

    var refreshButton = adminElements.ocrActions
      ? adminElements.ocrActions.querySelector('[data-ocr-action="refresh"]')
      : null;
    if (refreshButton) {
      refreshButton.disabled = Boolean(
        ocrState.loading || ocrState.action || ocrState.users.loading || ocrState.users.detailLoading
      );
      refreshButton.textContent = ocrState.loading || ocrState.users.loading || ocrState.users.detailLoading
        ? 'Обновляем…'
        : 'Обновить';
    }

    if (ocrState.action) {
      setAdminOcrStatus('Сервер принимает команду. Текущий файл будет доведён до безопасной точки…', 'info');
    } else if (ocrState.error) {
      setAdminOcrStatus(ocrState.error, 'error');
    } else if (ocrState.activeTab === 'users' && ocrState.users.error) {
      setAdminOcrStatus(ocrState.users.error, 'error');
    } else if (ocrState.activeTab === 'users' && ocrState.users.loading) {
      setAdminOcrStatus('Читаем реальный каталог Telegram JSON из S3…', 'info');
    } else if (ocrState.activeTab === 'users') {
      setAdminOcrStatus(
        'Список берётся из каталога S3. Поиск внутри OCR выполняется только в JSON выбранного пользователя.',
        'success'
      );
    } else if (ocrState.loading && !ocrState.backfill) {
      setAdminOcrStatus('Загружаем состояние одноразового прохода…', 'info');
    } else {
      var backfill = ocrState.backfill || {};
      var summary = backfill.summary || {};
      if (summary.allFilesPassed) {
        setAdminOcrStatus('Все поддерживаемые основные вложения подтверждены в OCR-архиве и Telegram JSON S3.', 'success');
      } else if (backfill.workerError) {
        setAdminOcrStatus(backfill.workerError, 'error');
      } else if (backfill.status === 'running' && backfill.workerActive === false) {
        setAdminOcrStatus('Проход отмечен активным, но heartbeat worker ещё не подтверждён. Серверу отправлен запрос на продолжение.', 'error');
      } else if (backfill.status === 'running') {
        setAdminOcrStatus('Проход работает на сервере и продолжится после закрытия панели. Одновременно обрабатывается один файл.', 'info');
      } else if (backfill.status === 'attention') {
        setAdminOcrStatus('Проход завершился с ошибками или удалёнными файлами. Общий успех не засчитан.', 'error');
      } else if (backfill.status === 'paused') {
        setAdminOcrStatus('Проход остановлен после полного завершения текущего файла. Его можно продолжить.', 'info');
      } else {
        setAdminOcrStatus('Нажмите «Найти и запустить»: сервер один раз соберёт основные вложения всех задач.', 'info');
      }
    }
  }

  function stopAdminOcrPoll() {
    var ocrState = ensureAdminOcrState();
    if (ocrState.pollTimer) {
      clearTimeout(ocrState.pollTimer);
      ocrState.pollTimer = null;
    }
  }

  function scheduleAdminOcrPoll() {
    var ocrState = ensureAdminOcrState();
    stopAdminOcrPoll();
    var backfill = ocrState.backfill && typeof ocrState.backfill === 'object' ? ocrState.backfill : {};
    if (!ocrState.visible
      || ocrState.activeTab !== 'backfill'
      || String(backfill.status || '') !== 'running'
    ) {
      return;
    }
    ocrState.pollTimer = setTimeout(function() {
      ocrState.pollTimer = null;
      fetchAdminOcrBackfillStatus(true).catch(function(error) {
        docsLogger.warn('Не удалось обновить состояние OCR backfill:', error);
      });
    }, ADMIN_OCR_POLL_INTERVAL_MS);
  }

  function fetchAdminOcrBackfillStatus(silent) {
    var ocrState = ensureAdminOcrState();
    if (silent && (!ocrState.visible || ocrState.activeTab !== 'backfill')) {
      stopAdminOcrPoll();
      return Promise.resolve(ocrState.backfill);
    }
    if (ocrState.pollInFlight) {
      if (silent) {
        return Promise.resolve(ocrState.backfill);
      }
      ocrState.requestToken += 1;
      ocrState.pollInFlight = false;
    }
    var requestToken = ++ocrState.requestToken;
    ocrState.pollInFlight = true;
    ocrState.loading = !silent;
    if (!silent) {
      ocrState.error = '';
    }
    if (!silent) {
      renderAdminOcrModal();
    }
    return fetch(buildApiUrl('admin_ocr_backfill', {
      organization: state.organization || '',
      page: ocrState.page,
      pageSize: ocrState.pageSize,
      q: ocrState.query || '',
      status: ocrState.statusFilter || ''
    }), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(handleResponse)
      .then(function(payload) {
        if (requestToken !== ocrState.requestToken) {
          return ocrState.backfill;
        }
        ocrState.backfill = payload && payload.backfill && typeof payload.backfill === 'object'
          ? payload.backfill
          : {};
        if (ocrState.backfill.pagination) {
          ocrState.page = Math.max(1, Number(ocrState.backfill.pagination.page) || 1);
        }
        ocrState.error = '';
        if (!silent || (ocrState.visible && ocrState.activeTab === 'backfill')) {
          renderAdminOcrModal();
        }
        return ocrState.backfill;
      })
      .catch(function(error) {
        if (requestToken === ocrState.requestToken) {
          ocrState.error = error && error.message ? error.message : 'Не удалось получить состояние OCR-прохода.';
          if (!silent || (ocrState.visible && ocrState.activeTab === 'backfill')) {
            renderAdminOcrModal();
          }
        }
        if (!silent) {
          throw error;
        }
        return ocrState.backfill;
      })
      .finally(function() {
        if (requestToken === ocrState.requestToken) {
          ocrState.pollInFlight = false;
          ocrState.loading = false;
          if (!silent) {
            renderAdminOcrModal();
          }
          scheduleAdminOcrPoll();
        }
      });
  }

  function runAdminOcrBackfillAction(operation) {
    var allowed = ['start', 'stop_after_current', 'resume', 'retry_failed'];
    if (allowed.indexOf(operation) === -1) {
      return Promise.reject(new Error('Неизвестная команда OCR.'));
    }
    var ocrState = ensureAdminOcrState();
    if (ocrState.action) {
      return Promise.resolve(ocrState.backfill);
    }
    stopAdminOcrPoll();
    ocrState.requestToken += 1;
    ocrState.pollInFlight = false;
    ocrState.action = operation;
    ocrState.error = '';
    renderAdminOcrModal();
    var payload = {
      action: 'admin_ocr_backfill',
      operation: operation,
      organization: state.organization || ''
    };
    mergeTelegramUserId(payload);
    return fetch(buildApiUrl('admin_ocr_backfill', {
      page: ocrState.page,
      pageSize: ocrState.pageSize,
      q: ocrState.query || '',
      status: ocrState.statusFilter || ''
    }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(response) {
        ocrState.backfill = response && response.backfill && typeof response.backfill === 'object'
          ? response.backfill
          : ocrState.backfill;
        ocrState.error = '';
        var messages = {
          start: 'Одноразовый OCR-проход запущен на сервере.',
          stop_after_current: 'Остановка запрошена. Текущий файл будет полностью сохранён и проверен.',
          resume: 'OCR-проход продолжен.',
          retry_failed: 'Ошибочные файлы или итоговая сверка JSON возвращены на повтор.'
        };
        showMessage('success', messages[operation]);
        return ocrState.backfill;
      })
      .catch(function(error) {
        if (error && error.responseData && error.responseData.backfill) {
          ocrState.backfill = error.responseData.backfill;
        }
        ocrState.error = error && error.message ? error.message : 'Не удалось выполнить команду OCR.';
        showMessage('error', ocrState.error);
        throw error;
      })
      .finally(function() {
        ocrState.action = '';
        renderAdminOcrModal();
        scheduleAdminOcrPoll();
      });
  }

  function fetchAdminOcrUsers() {
    var ocrState = ensureAdminOcrState();
    var usersState = ocrState.users;
    var requestToken = ++usersState.requestToken;
    usersState.loading = true;
    usersState.error = '';
    renderAdminOcrModal();
    return fetch(buildApiUrl('admin_ocr_s3_users', {
      organization: state.organization || '',
      page: usersState.page,
      pageSize: usersState.pageSize,
      q: usersState.query || '',
      status: usersState.statusFilter || ''
    }), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(handleResponse)
      .then(function(payload) {
        if (requestToken !== usersState.requestToken) {
          return usersState;
        }
        var result = payload && payload.users && typeof payload.users === 'object' ? payload.users : {};
        usersState.items = Array.isArray(result.items) ? result.items : [];
        usersState.pagination = result.pagination || null;
        if (usersState.pagination) {
          usersState.page = Math.max(1, Number(usersState.pagination.page) || 1);
        }
        usersState.error = '';
        var selectedStillVisible = usersState.selectedId && usersState.items.some(function(user) {
          return user
            && user.s3Exists
            && String(user.telegramId || '') === String(usersState.selectedId);
        });
        if (usersState.selectedId && !selectedStillVisible) {
          usersState.selectedId = '';
          resetAdminOcrUserDetail(usersState);
        }
        if (!usersState.selectedId) {
          var firstReadable = usersState.items.find(function(user) {
            return user && user.s3Exists && user.telegramId;
          });
          if (firstReadable) {
            usersState.selectedId = String(firstReadable.telegramId);
          }
        }
        return usersState;
      })
      .catch(function(error) {
        if (requestToken === usersState.requestToken) {
          usersState.error = error && error.message ? error.message : 'Не удалось прочитать список OCR-пользователей из S3.';
        }
        throw error;
      })
      .finally(function() {
        if (requestToken !== usersState.requestToken) {
          return;
        }
        usersState.loading = false;
        renderAdminOcrModal();
        var detailTelegramId = usersState.detail && usersState.detail.user
          ? String(usersState.detail.user.telegramId || '')
          : '';
        if (ocrState.visible
          && ocrState.activeTab === 'users'
          && usersState.selectedId
          && !usersState.detailLoading
          && detailTelegramId !== String(usersState.selectedId)
        ) {
          fetchAdminOcrUserDetail(usersState.selectedId).catch(function(error) {
            docsLogger.warn('Не удалось прочитать OCR-файлы пользователя:', error);
          });
        }
      });
  }

  function fetchAdminOcrUserDetail(telegramId) {
    var ocrState = ensureAdminOcrState();
    var usersState = ocrState.users;
    var normalizedId = telegramId ? String(telegramId).trim() : String(usersState.selectedId || '').trim();
    if (!normalizedId) {
      return Promise.resolve(null);
    }
    usersState.selectedId = normalizedId;
    var requestToken = ++usersState.detailRequestToken;
    usersState.detailLoading = true;
    usersState.detailError = '';
    renderAdminOcrModal();
    var payload = {
      action: 'admin_ocr_s3_user_files',
      organization: state.organization || '',
      telegramUserId: normalizedId,
      page: usersState.detailPage,
      pageSize: usersState.detailPageSize,
      q: usersState.detailQuery || ''
    };
    mergeTelegramUserId(payload);
    return fetch(buildApiUrl('admin_ocr_s3_user_files'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(payload) {
        if (requestToken !== usersState.detailRequestToken || String(usersState.selectedId) !== normalizedId) {
          return usersState.detail;
        }
        usersState.detail = payload && payload.userFiles && typeof payload.userFiles === 'object'
          ? payload.userFiles
          : {};
        var detailSummary = usersState.detail.summary && typeof usersState.detail.summary === 'object'
          ? usersState.detail.summary
          : {};
        var detailUser = usersState.detail.user && typeof usersState.detail.user === 'object'
          ? usersState.detail.user
          : {};
        usersState.items.forEach(function(user) {
          if (!user || String(user.telegramId || '') !== normalizedId) {
            return;
          }
          Object.keys(detailSummary).forEach(function(key) {
            user[key] = detailSummary[key];
          });
          if (detailUser.name) {
            user.name = detailUser.name;
          }
          user.s3Exists = true;
        });
        if (usersState.detail.pagination) {
          usersState.detailPage = Math.max(1, Number(usersState.detail.pagination.page) || 1);
        }
        usersState.detailError = '';
        return usersState.detail;
      })
      .catch(function(error) {
        if (requestToken === usersState.detailRequestToken) {
          usersState.detailError = error && error.message ? error.message : 'Не удалось прочитать JSON пользователя из S3.';
        }
        throw error;
      })
      .finally(function() {
        if (requestToken === usersState.detailRequestToken) {
          usersState.detailLoading = false;
          renderAdminOcrModal();
        }
      });
  }

  function renderAdminOcrTextReader() {
    if (!adminElements.ocrTextReader) {
      return;
    }
    var usersState = ensureAdminOcrState().users;
    var result = usersState.textResult && typeof usersState.textResult === 'object'
      ? usersState.textResult
      : {};
    var reader = adminElements.ocrTextReader;
    var title = reader.querySelector('.documents-s3-reader__title');
    var meta = reader.querySelector('.documents-s3-reader__meta');
    var status = reader.querySelector('.documents-s3-reader__status');
    var text = reader.querySelector('.documents-s3-reader__text');
    var more = reader.querySelector('[data-ocr-text-more]');
    if (title) {
      title.textContent = result.fileName || 'OCR-текст из S3';
    }
    if (meta) {
      meta.textContent = [
        result.organization || '',
        result.taskLabel ? 'задача ' + result.taskLabel : '',
        result.totalLength ? adminOcrNumber(result.totalLength) + ' символов' : '',
        result.s3Key || ''
      ].filter(Boolean).join(' · ');
    }
    if (text) {
      text.textContent = typeof result.ocrText === 'string' ? result.ocrText : '';
    }
    if (status) {
      var message = result.error || (usersState.textLoading
        ? 'Читаем подтверждённый OCR-текст из JSON пользователя в S3…'
        : (result.hasMore ? 'Показана часть текста. Можно загрузить продолжение.' : ''));
      status.textContent = message;
      status.classList.toggle('is-visible', Boolean(message));
      status.classList.toggle('documents-s3-reader__status--error', Boolean(result.error));
    }
    if (more) {
      more.hidden = !result.hasMore;
      more.disabled = usersState.textLoading;
      more.textContent = usersState.textLoading ? 'Загружаем…' : 'Загрузить ещё';
    }
  }

  function fetchAdminOcrText(entryToken, offset, append) {
    var ocrState = ensureAdminOcrState();
    var usersState = ocrState.users;
    var current = usersState.textResult && typeof usersState.textResult === 'object'
      ? usersState.textResult
      : {};
    var token = entryToken || current.entryToken || '';
    var telegramId = current.telegramId || usersState.selectedId || '';
    if (!token || !telegramId) {
      return Promise.reject(new Error('OCR-текст не выбран.'));
    }
    var requestToken = ++usersState.textRequestToken;
    usersState.textLoading = true;
    current.error = '';
    usersState.textResult = current;
    renderAdminOcrTextReader();
    var payload = {
      action: 'admin_ocr_s3_text',
      organization: state.organization || '',
      telegramUserId: telegramId,
      entryToken: token,
      offset: Math.max(0, Number(offset) || 0),
      limit: ADMIN_OCR_TEXT_CHUNK_SIZE
    };
    mergeTelegramUserId(payload);
    return fetch(buildApiUrl('admin_ocr_s3_text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(response) {
        if (requestToken !== usersState.textRequestToken) {
          return usersState.textResult;
        }
        var next = response && response.ocrTextResult && typeof response.ocrTextResult === 'object'
          ? response.ocrTextResult
          : {};
        if (append
          && current.ocrTextSha256
          && next.ocrTextSha256
          && String(current.ocrTextSha256) !== String(next.ocrTextSha256)
        ) {
          throw new Error('OCR-текст изменился в S3 во время чтения. Откройте файл заново.');
        }
        var previousText = append && typeof current.ocrText === 'string' ? current.ocrText : '';
        next.ocrText = previousText + (typeof next.ocrText === 'string' ? next.ocrText : '');
        next.telegramId = telegramId;
        next.entryToken = token;
        next.error = '';
        usersState.textResult = next;
        return next;
      })
      .catch(function(error) {
        if (requestToken === usersState.textRequestToken) {
          current.error = error && error.message ? error.message : 'Не удалось прочитать OCR-текст из S3.';
          usersState.textResult = current;
        }
        throw error;
      })
      .finally(function() {
        if (requestToken === usersState.textRequestToken) {
          usersState.textLoading = false;
          renderAdminOcrTextReader();
        }
      });
  }

  function openAdminOcrTextReader(telegramId, entryToken) {
    var ocrState = ensureAdminOcrState();
    var usersState = ocrState.users;
    if (!adminElements.ocrTextReader || !adminElements.ocrTextReader.classList.contains('is-visible')) {
      usersState.textReturnFocusElement = document.activeElement;
    }
    usersState.textRequestToken += 1;
    usersState.textLoading = false;
    usersState.textResult = {
      telegramId: telegramId || usersState.selectedId || '',
      entryToken: entryToken || '',
      ocrText: '',
      offset: 0,
      nextOffset: 0,
      totalLength: 0,
      hasMore: false,
      error: ''
    };
    if (adminElements.ocrTextReader) {
      setAdminOcrElementInert(adminElements.ocrModal, true);
      adminElements.ocrTextReader.classList.add('is-visible');
      adminElements.ocrTextReader.setAttribute('aria-hidden', 'false');
    }
    renderAdminOcrTextReader();
    focusAdminOcrElement(adminElements.ocrTextReader
      ? adminElements.ocrTextReader.querySelector('[data-ocr-text-close]')
      : null);
    fetchAdminOcrText(entryToken, 0, false).catch(function(error) {
      docsLogger.warn('Не удалось открыть OCR-текст S3:', error);
    });
  }

  function closeAdminOcrTextReader(options) {
    var ocrState = ensureAdminOcrState();
    var usersState = ocrState.users;
    var returnFocusElement = usersState.textReturnFocusElement;
    usersState.textReturnFocusElement = null;
    usersState.textRequestToken += 1;
    usersState.textLoading = false;
    usersState.textResult = null;
    if (adminElements.ocrTextReader) {
      adminElements.ocrTextReader.classList.remove('is-visible');
      adminElements.ocrTextReader.setAttribute('aria-hidden', 'true');
    }
    setAdminOcrElementInert(adminElements.ocrModal, false);
    if (!(options && options.skipFocus) && ocrState.visible) {
      if (!focusAdminOcrElement(returnFocusElement)) {
        focusAdminOcrDialog();
      }
    }
  }

  function handleAdminOcrTextReaderClick(event) {
    if (!adminElements.ocrTextReader) {
      return;
    }
    if (event.target === adminElements.ocrTextReader) {
      closeAdminOcrTextReader();
      return;
    }
    var target = event.target && event.target.closest
      ? event.target.closest('[data-ocr-text-close], [data-ocr-text-more]')
      : null;
    if (!target || !adminElements.ocrTextReader.contains(target)) {
      return;
    }
    if (target.hasAttribute('data-ocr-text-close')) {
      closeAdminOcrTextReader();
      return;
    }
    var usersState = ensureAdminOcrState().users;
    var result = usersState.textResult || {};
    if (result.hasMore && !usersState.textLoading) {
      fetchAdminOcrText(result.entryToken || '', result.nextOffset || 0, true).catch(function(error) {
        docsLogger.warn('Не удалось загрузить продолжение OCR-текста:', error);
      });
    }
  }

  function handleAdminOcrClick(event) {
    if (!adminElements.ocrModal) {
      return;
    }
    var target = event.target && event.target.closest
      ? event.target.closest('[data-ocr-tab], [data-ocr-action], [data-ocr-page-scope], [data-ocr-user-id], [data-ocr-text-token]')
      : null;
    if (!target || !adminElements.ocrModal.contains(target)) {
      return;
    }
    var ocrState = ensureAdminOcrState();
    if (target.hasAttribute('data-ocr-tab')) {
      ocrState.activeTab = target.getAttribute('data-ocr-tab') === 'users' ? 'users' : 'backfill';
      if (ocrState.activeTab === 'users') {
        stopAdminOcrPoll();
      }
      renderAdminOcrModal();
      if (ocrState.activeTab === 'users') {
        fetchAdminOcrUsers().catch(function(error) {
          docsLogger.warn('Не удалось загрузить OCR-пользователей:', error);
        });
        if (ocrState.users.selectedId) {
          fetchAdminOcrUserDetail(ocrState.users.selectedId).catch(function(error) {
            docsLogger.warn('Не удалось перечитать OCR-файлы пользователя:', error);
          });
        }
      } else {
        fetchAdminOcrBackfillStatus(false).catch(function(error) {
          docsLogger.warn('Не удалось загрузить OCR backfill:', error);
        });
      }
      return;
    }
    if (target.hasAttribute('data-ocr-page-scope')) {
      var page = Math.max(1, Number(target.getAttribute('data-ocr-page-number')) || 1);
      var scope = target.getAttribute('data-ocr-page-scope');
      if (scope === 'users') {
        ocrState.users.page = page;
        fetchAdminOcrUsers().catch(function() {});
      } else if (scope === 'detail') {
        ocrState.users.detailPage = page;
        fetchAdminOcrUserDetail(ocrState.users.selectedId).catch(function() {});
      } else {
        ocrState.page = page;
        fetchAdminOcrBackfillStatus(false).catch(function() {});
      }
      return;
    }
    if (target.hasAttribute('data-ocr-user-id')) {
      var selectedId = target.getAttribute('data-ocr-user-id') || '';
      if (!selectedId) {
        return;
      }
      resetAdminOcrUserDetail(ocrState.users);
      ocrState.users.selectedId = selectedId;
      fetchAdminOcrUserDetail(selectedId).catch(function() {});
      return;
    }
    if (target.hasAttribute('data-ocr-text-token')) {
      var entryToken = target.getAttribute('data-ocr-text-token') || '';
      var textUserId = target.getAttribute('data-ocr-text-user-id') || ocrState.users.selectedId || '';
      if (entryToken && textUserId) {
        openAdminOcrTextReader(textUserId, entryToken);
      }
      return;
    }
    var operation = target.getAttribute('data-ocr-action') || '';
    if (operation === 'refresh') {
      if (ocrState.activeTab === 'users') {
        fetchAdminOcrUsers().catch(function() {});
        if (ocrState.users.selectedId) {
          fetchAdminOcrUserDetail(ocrState.users.selectedId).catch(function() {});
        }
      } else {
        fetchAdminOcrBackfillStatus(false).catch(function() {});
      }
    } else if (operation === 'refresh_users') {
      fetchAdminOcrUsers().catch(function() {});
    } else if (operation === 'refresh_detail') {
      fetchAdminOcrUserDetail(ocrState.users.selectedId).catch(function() {});
    } else if (operation) {
      runAdminOcrBackfillAction(operation).catch(function() {});
    }
  }

  function scheduleAdminOcrSearch(timerOwner, timerKey, callback) {
    if (timerOwner[timerKey]) {
      clearTimeout(timerOwner[timerKey]);
    }
    timerOwner[timerKey] = setTimeout(function() {
      timerOwner[timerKey] = null;
      callback();
    }, ADMIN_OCR_SEARCH_DELAY_MS);
  }

  function handleAdminOcrInput(event) {
    var target = event.target;
    if (!target || !adminElements.ocrModal || !adminElements.ocrModal.contains(target)) {
      return;
    }
    var ocrState = ensureAdminOcrState();
    if (target.hasAttribute('data-ocr-backfill-query')) {
      ocrState.query = target.value || '';
      ocrState.page = 1;
      scheduleAdminOcrSearch(ocrState, 'inputTimer', function() {
        fetchAdminOcrBackfillStatus(false).catch(function() {});
      });
    } else if (target.hasAttribute('data-ocr-users-query')) {
      ocrState.users.query = target.value || '';
      ocrState.users.page = 1;
      scheduleAdminOcrSearch(ocrState.users, 'inputTimer', function() {
        fetchAdminOcrUsers().catch(function() {});
      });
    } else if (target.hasAttribute('data-ocr-detail-query')) {
      ocrState.users.detailQuery = target.value || '';
      ocrState.users.detailPage = 1;
      scheduleAdminOcrSearch(ocrState.users, 'detailInputTimer', function() {
        fetchAdminOcrUserDetail(ocrState.users.selectedId).catch(function() {});
      });
    }
  }

  function handleAdminOcrChange(event) {
    var target = event.target;
    if (!target || !adminElements.ocrModal || !adminElements.ocrModal.contains(target)) {
      return;
    }
    var ocrState = ensureAdminOcrState();
    if (target.hasAttribute('data-ocr-backfill-status')) {
      ocrState.statusFilter = target.value || '';
      ocrState.page = 1;
      fetchAdminOcrBackfillStatus(false).catch(function() {});
    } else if (target.hasAttribute('data-ocr-users-status')) {
      ocrState.users.statusFilter = target.value || '';
      ocrState.users.page = 1;
      fetchAdminOcrUsers().catch(function() {});
    }
  }

  function openAdminOcrModal() {
    ensureAdminModal();
    var ocrState = ensureAdminOcrState();
    if (!canUseGlobalAdminOcr()) {
      showMessage('error', 'Глобальный OCR доступен только главному администратору. После обновления войдите заново.');
      return;
    }
    if (!state.organization) {
      setAdminOcrStatus('Сначала выберите организацию.', 'error');
      return;
    }
    closeAdminTemplateModal({ skipFocus: true });
    closeAdminS3Modal({ skipFocus: true });
    closeCronManagementModal(false);
    if (!ocrState.visible) {
      ocrState.focusReturnElement = document.activeElement;
    }
    ocrState.visible = true;
    ocrState.error = '';
    if (adminElements.ocrModal) {
      adminElements.ocrModal.classList.add('is-visible');
      adminElements.ocrModal.setAttribute('aria-hidden', 'false');
    }
    renderAdminOcrModal();
    focusAdminOcrDialog();
    if (ocrState.activeTab === 'users') {
      fetchAdminOcrUsers().catch(function(error) {
        docsLogger.warn('Не удалось загрузить OCR-пользователей:', error);
      });
      if (ocrState.users.selectedId) {
        fetchAdminOcrUserDetail(ocrState.users.selectedId).catch(function(error) {
          docsLogger.warn('Не удалось перечитать OCR-файлы пользователя:', error);
        });
      }
    } else {
      fetchAdminOcrBackfillStatus(false).catch(function(error) {
        docsLogger.warn('Не удалось открыть OCR-панель:', error);
      });
    }
  }

  function closeAdminOcrModal(options) {
    var ocrState = ensureAdminOcrState();
    var returnFocusElement = ocrState.focusReturnElement;
    ocrState.focusReturnElement = null;
    ocrState.visible = false;
    ocrState.requestToken += 1;
    ocrState.pollInFlight = false;
    ocrState.loading = false;
    ocrState.users.requestToken += 1;
    ocrState.users.detailRequestToken += 1;
    ocrState.users.loading = false;
    ocrState.users.detailLoading = false;
    stopAdminOcrPoll();
    if (ocrState.inputTimer) {
      clearTimeout(ocrState.inputTimer);
      ocrState.inputTimer = null;
    }
    if (ocrState.users.inputTimer) {
      clearTimeout(ocrState.users.inputTimer);
      ocrState.users.inputTimer = null;
    }
    if (ocrState.users.detailInputTimer) {
      clearTimeout(ocrState.users.detailInputTimer);
      ocrState.users.detailInputTimer = null;
    }
    closeAdminOcrTextReader({ skipFocus: true });
    if (adminElements.ocrModal) {
      setAdminOcrElementInert(adminElements.ocrModal, false);
      adminElements.ocrModal.classList.remove('is-visible');
      adminElements.ocrModal.setAttribute('aria-hidden', 'true');
    }
    var shouldRestoreFocus = !(options && options.skipFocus);
    if (shouldRestoreFocus && !focusAdminOcrElement(returnFocusElement)) {
      focusAdminOcrElement(adminElements.ocrButton);
    }
  }

  function setCronManagementStatus(message, isError) {
    if (!adminElements.cronManagementStatus) {
      return;
    }
    adminElements.cronManagementStatus.textContent = message || '';
    adminElements.cronManagementStatus.classList.toggle('is-visible', Boolean(message));
    adminElements.cronManagementStatus.classList.toggle('documents-s3-modal__status--error', Boolean(message && isError));
  }

  function renderCronManagement() {
    var cron = cronManagementView.data && typeof cronManagementView.data === 'object'
      ? cronManagementView.data
      : {};
    var installed = cron.installed === true;
    if (cronManagementView.error) {
      setCronManagementStatus(cronManagementView.error, true);
    } else if (cronManagementView.loading) {
      setCronManagementStatus('Читаем серверный crontab…', false);
    } else if (installed) {
      setCronManagementStatus('Найден устаревший OCR-cron. Он больше не нужен и может быть удалён.', true);
    } else {
      setCronManagementStatus('Старый OCR-cron отсутствует. Новые вложения и одноразовый проход используют отдельные фоновые worker.', false);
    }

    if (adminElements.cronManagementSummary) {
      adminElements.cronManagementSummary.innerHTML = '';
      var grid = createElement('div', 'documents-s3-modal__grid');
      grid.appendChild(createAdminS3Metric('Механизм', 'Автоматический OCR задач'));
      grid.appendChild(createAdminS3Metric('Состояние', installed ? 'Установлен' : 'Не установлен'));
      grid.appendChild(createAdminS3Metric(
        'Назначение',
        String(cron.description || 'Устаревшая фоновая обработка OCR.')
      ));
      var entries = Array.isArray(cron.entries) ? cron.entries : [];
      if (entries.length) {
        grid.appendChild(createAdminS3Metric('Команда', entries.join('\n')));
      }
      adminElements.cronManagementSummary.appendChild(grid);
    }

    var busy = cronManagementView.loading || cronManagementView.removing;
    if (adminElements.cronManagementRefreshButton) {
      adminElements.cronManagementRefreshButton.disabled = busy;
    }
    if (adminElements.cronManagementRemoveButton) {
      adminElements.cronManagementRemoveButton.disabled = busy || !installed;
      adminElements.cronManagementRemoveButton.textContent = cronManagementView.removing
        ? 'Удаляем…'
        : 'Удалить старый OCR-cron';
    }
  }

  function fetchCronManagementStatus(silent) {
    if (cronManagementView.loading) {
      return Promise.resolve(cronManagementView.data);
    }
    cronManagementView.loading = true;
    if (!silent) {
      cronManagementView.error = '';
    }
    renderCronManagement();
    return fetch(buildApiUrl('admin_cron_management', {
      organization: state.organization || ''
    }), { credentials: 'same-origin', cache: 'no-store' })
      .then(handleResponse)
      .then(function(payload) {
        cronManagementView.data = payload && payload.cron ? payload.cron : {};
        cronManagementView.error = '';
        return cronManagementView.data;
      })
      .catch(function(error) {
        cronManagementView.error = error && error.message ? error.message : 'Не удалось прочитать серверный crontab.';
        if (!silent) {
          throw error;
        }
        return cronManagementView.data;
      })
      .finally(function() {
        cronManagementView.loading = false;
        renderCronManagement();
      });
  }

  function removeLegacyOcrCron() {
    if (cronManagementView.removing || !window.confirm('Удалить старый OCR-cron из серверного crontab? Другие cron-команды останутся без изменений.')) {
      return;
    }
    cronManagementView.removing = true;
    cronManagementView.error = '';
    renderCronManagement();
    fetch(buildApiUrl('admin_cron_management'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_cron_management',
        operation: 'remove_legacy_ocr',
        organization: state.organization || ''
      })
    })
      .then(handleResponse)
      .then(function(payload) {
        cronManagementView.data = payload && payload.cron ? payload.cron : {};
        showMessage('success', payload && payload.message ? payload.message : 'Старый OCR-cron удалён.');
      })
      .catch(function(error) {
        cronManagementView.error = error && error.message ? error.message : 'Не удалось удалить старый OCR-cron.';
      })
      .finally(function() {
        cronManagementView.removing = false;
        renderCronManagement();
      });
  }

  function openCronManagementModal() {
    ensureAdminModal();
    if (adminElements.cronManagementModal) {
      adminElements.cronManagementModal.classList.add('is-visible');
      adminElements.cronManagementModal.setAttribute('aria-hidden', 'false');
    }
    renderCronManagement();
    fetchCronManagementStatus(false).catch(function(error) {
      docsLogger.warn('Не удалось загрузить управление cron:', error);
    });
  }

  function closeCronManagementModal(restoreFocus) {
    if (adminElements.cronManagementModal) {
      adminElements.cronManagementModal.classList.remove('is-visible');
      adminElements.cronManagementModal.setAttribute('aria-hidden', 'true');
    }
    if (restoreFocus && adminElements.cronManagementButton && typeof adminElements.cronManagementButton.focus === 'function') {
      adminElements.cronManagementButton.focus();
    }
  }

  function openAdminTemplateModal() {
    ensureAdminModal();
    var templateState = ensureAdminTemplateState();
    if (!state.organization) {
      setAdminTemplateStatus('Сначала выберите организацию.', 'error');
      return;
    }
    templateState.visible = true;
    if (adminElements.templateModal) {
      adminElements.templateModal.classList.add('is-visible');
      adminElements.templateModal.setAttribute('aria-hidden', 'false');
    }
    updateAdminTemplatePanel();
    fetchAdminTemplate({ force: true }).catch(function(error) {
      docsLogger.warn('Не удалось загрузить шаблон организации:', error);
    });
  }

  function openAdminS3Modal() {
    ensureAdminModal();
    var s3State = ensureAdminS3State();
    if (!state.organization) {
      setAdminS3Status('Сначала выберите организацию.', 'error');
      return;
    }
    s3State.visible = true;
    if (adminElements.s3Modal) {
      adminElements.s3Modal.classList.add('is-visible');
      adminElements.s3Modal.setAttribute('aria-hidden', 'false');
    }
    updateAdminS3Panel();
    refreshAdminS3Panel().catch(function(error) {
      docsLogger.warn('Не удалось загрузить статус S3:', error);
    });
  }


  function closeAdminS3Modal(options) {
    ensureAdminModal();
    var s3State = ensureAdminS3State();
    s3State.visible = false;
    if (adminElements.s3Modal) {
      adminElements.s3Modal.classList.remove('is-visible');
      adminElements.s3Modal.setAttribute('aria-hidden', 'true');
    }
    var shouldRestoreFocus = !(options && options.skipFocus);
    if (shouldRestoreFocus && adminElements.s3Button && typeof adminElements.s3Button.focus === 'function') {
      adminElements.s3Button.focus();
    }
  }

  function closeAdminTemplateModal(options) {
    ensureAdminModal();
    var templateState = ensureAdminTemplateState();
    templateState.visible = false;
    if (adminElements.templateModal) {
      adminElements.templateModal.classList.remove('is-visible');
      adminElements.templateModal.setAttribute('aria-hidden', 'true');
    }
    var shouldRestoreFocus = !(options && options.skipFocus);
    if (shouldRestoreFocus && adminElements.templateButton && typeof adminElements.templateButton.focus === 'function') {
      adminElements.templateButton.focus();
    }
  }

  function ensureAdminUserLogState() {
    if (!state.admin.userLog) {
      state.admin.userLog = {
        entries: [],
        loading: false,
        error: '',
        visible: false,
        promise: null,
        lastLoadedAt: 0
      };
    }
    return state.admin.userLog;
  }

  function setAdminLogStatus(text, type) {
    ensureAdminModal();
    if (!adminElements.logStatus) {
      return;
    }
    var status = adminElements.logStatus;
    status.textContent = text || '';
    status.style.display = text ? 'block' : 'none';
    status.classList.remove('documents-admin__log-status--error', 'documents-admin__log-status--success');
    if (!text) {
      return;
    }
    if (type === 'error') {
      status.classList.add('documents-admin__log-status--error');
    } else if (type === 'success') {
      status.classList.add('documents-admin__log-status--success');
    }
  }

  function formatAdminLogTimestamp(value) {
    if (!value) {
      return '';
    }
    var date = value instanceof Date ? value : new Date(value);
    if (!date || isNaN(date.getTime())) {
      return '';
    }
    if (DATE_TIME_FORMATTER && typeof DATE_TIME_FORMATTER.format === 'function') {
      try {
        return DATE_TIME_FORMATTER.format(date);
      } catch (formatterError) {
        // fallback to locale string below
      }
    }
    try {
      return date.toLocaleString('ru-RU');
    } catch (localeError) {
      return date.toISOString();
    }
  }

  function buildAdminLogCopyText(entries) {
    if (!entries || !entries.length) {
      return '';
    }
    var lines = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i] || {};
      var position = String(i + 1) + '.';
      var name = entry.fullName || 'Без имени';
      var username = entry.username ? '@' + entry.username : '';
      var id = entry.id ? 'ID: ' + entry.id : '';
      var lastSeen = entry.lastSeen ? 'последнее посещение: ' + formatAdminLogTimestamp(entry.lastSeen) : '';
      var parts = [position, name];
      if (username) {
        parts.push(username);
      }
      if (id) {
        parts.push(id);
      }
      if (lastSeen) {
        parts.push(lastSeen);
      }
      lines.push(parts.filter(Boolean).join(' — '));
    }
    return lines.join('\n');
  }

  function updateAdminLogPanel() {
    ensureAdminModal();
    var logState = ensureAdminUserLogState();

    if (!adminElements.logPanel || !adminElements.logButton) {
      return;
    }

    var organizationReady = Boolean(state.organization);
    if (!organizationReady) {
      logState.visible = false;
    }

    adminElements.logButton.disabled = !organizationReady;
    adminElements.logButton.textContent = 'Журнал';
    adminElements.logButton.setAttribute('aria-expanded', logState.visible ? 'true' : 'false');

    if (logState.visible && organizationReady) {
      adminElements.logPanel.classList.add('is-visible');
      adminElements.logPanel.removeAttribute('hidden');
    } else {
      adminElements.logPanel.classList.remove('is-visible');
      adminElements.logPanel.setAttribute('hidden', 'true');
    }

    var entries = Array.isArray(logState.entries) ? logState.entries : [];
    if (adminElements.logList) {
      adminElements.logList.innerHTML = '';
      if (entries.length) {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i] || {};
          var item = createElement('li', 'documents-admin__log-item');
          var index = createElement('span', 'documents-admin__log-index', String(i + 1));
          item.appendChild(index);

          var content = createElement('div', 'documents-admin__log-item-content');
          var mainRow = createElement('div', 'documents-admin__log-row');
          var name = createElement('span', 'documents-admin__log-name', entry.fullName || 'Без имени');
          var id = createElement('span', 'documents-admin__log-id', entry.id ? 'ID ' + entry.id : 'ID не указан');
          mainRow.appendChild(name);
          mainRow.appendChild(id);

          var extraRow = createElement('div', 'documents-admin__log-row documents-admin__log-row--muted');
          if (entry.username) {
            extraRow.appendChild(createElement('span', 'documents-admin__log-username', '@' + entry.username));
          }
          var formattedDate = entry.lastSeen ? formatAdminLogTimestamp(entry.lastSeen) : '';
          extraRow.appendChild(createElement('span', 'documents-admin__log-date', formattedDate ? formattedDate : 'Нет данных о посещении'));

          content.appendChild(mainRow);
          content.appendChild(extraRow);
          item.appendChild(content);
          adminElements.logList.appendChild(item);
        }
      } else if (logState.visible) {
        var emptyItem = createElement('li', 'documents-admin__log-empty', 'Журнал пока пуст.');
        adminElements.logList.appendChild(emptyItem);
      }
    }

    if (adminElements.logTextarea) {
      adminElements.logTextarea.value = buildAdminLogCopyText(entries);
    }

    if (adminElements.logCopyButton) {
      adminElements.logCopyButton.disabled = entries.length === 0;
    }

    if (!logState.visible) {
      setAdminLogStatus('', 'info');
      return;
    }

    if (logState.loading) {
      setAdminLogStatus('Загружаем журнал...', 'info');
      return;
    }

    if (logState.error) {
      setAdminLogStatus(logState.error, 'error');
      return;
    }

    if (entries.length) {
      setAdminLogStatus('Всего записей: ' + entries.length, 'success');
    } else {
      setAdminLogStatus('Журнал пока пуст. Пользователи ещё не заходили.', 'info');
    }
  }

  function fetchAdminUserLog(options) {
    var logState = ensureAdminUserLogState();
    var force = options && options.force;

    if (!state.organization) {
      logState.error = 'Организация не выбрана.';
      logState.loading = false;
      updateAdminLogPanel();
      return Promise.reject(new Error(logState.error));
    }

    if (logState.loading && logState.promise) {
      return logState.promise;
    }

    var freshThreshold = 60000;
    if (!force && logState.entries.length && Date.now() - logState.lastLoadedAt < freshThreshold) {
      return Promise.resolve(logState.entries);
    }

    logState.loading = true;
    logState.error = '';
    updateAdminLogPanel();

    var request = fetch(buildApiUrl('mini_app_user_journal', {
      organization: state.organization
    }), {
      credentials: 'same-origin'
    })
      .then(handleResponse)
      .then(function(data) {
        var entries = [];
        if (data && Array.isArray(data.entries)) {
          for (var i = 0; i < data.entries.length; i += 1) {
            var entry = data.entries[i];
            if (!entry || typeof entry !== 'object') {
              continue;
            }
            entries.push({
              id: entry.id ? String(entry.id) : '',
              fullName: entry.fullName ? String(entry.fullName) : '',
              username: entry.username ? String(entry.username).replace(/^@/, '') : '',
              lastSeen: entry.lastSeen ? String(entry.lastSeen) : ''
            });
          }
        }

        logState.entries = entries;
        logState.error = '';
        logState.lastLoadedAt = Date.now();
        updateAdminLogPanel();
        return entries;
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : 'Не удалось загрузить журнал.';
        logState.error = message;
        updateAdminLogPanel();
        throw error;
      })
      .finally(function() {
        logState.loading = false;
        logState.promise = null;
        updateAdminLogPanel();
      });

    logState.promise = request;
    return request;
  }

  function openAdminLogPanel() {
    var logState = ensureAdminUserLogState();
    if (!state.organization) {
      setAdminLogStatus('Сначала выберите организацию.', 'error');
      return;
    }
    if (logState.visible) {
      fetchAdminUserLog({ force: true }).catch(function(error) {
        docsLogger.warn('Не удалось обновить журнал:', error);
      });
      return;
    }
    logState.visible = true;
    updateAdminLogPanel();
    fetchAdminUserLog({ force: true }).catch(function(error) {
      docsLogger.warn('Не удалось загрузить журнал:', error);
    });
  }

  function closeAdminLogPanel() {
    var logState = ensureAdminUserLogState();
    if (!logState.visible) {
      return;
    }
    logState.visible = false;
    updateAdminLogPanel();
    showAdminUsersView();
    if (adminElements.usersButton) {
      adminElements.usersButton.focus();
    }
  }

  function toggleAdminLogPanel() {
    var logState = ensureAdminUserLogState();
    if (logState.visible) {
      closeAdminLogPanel();
    } else {
      openAdminLogPanel();
    }
  }

  function copyAdminLogToClipboard() {
    ensureAdminModal();
    var logState = ensureAdminUserLogState();
    if (!adminElements.logTextarea) {
      return;
    }
    var text = buildAdminLogCopyText(logState.entries);
    if (!text) {
      setAdminLogStatus('Журнал пуст — копировать нечего.', 'error');
      return;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text)
        .then(function() {
          setAdminLogStatus('Список скопирован в буфер обмена.', 'success');
        })
        .catch(function() {
          fallbackCopy();
        });
      return;
    }

    fallbackCopy();

    function fallbackCopy() {
      try {
        adminElements.logTextarea.focus();
        adminElements.logTextarea.select();
        adminElements.logTextarea.setSelectionRange(0, adminElements.logTextarea.value.length);
        var executed = document.execCommand && document.execCommand('copy');
        if (executed) {
          setAdminLogStatus('Список скопирован в буфер обмена.', 'success');
        } else {
          setAdminLogStatus('Не удалось скопировать автоматически. Выделите текст вручную.', 'error');
        }
      } catch (copyError) {
        setAdminLogStatus('Не удалось скопировать автоматически. Выделите текст вручную.', 'error');
      }
    }
  }

  function openAdminModal() {
    try {
      if (!state.organization) {
        showMessage('error', 'Организация для этой страницы не определена.');
        return;
      }
      var adminScope = state.access && typeof state.access.adminScope === 'string'
        ? state.access.adminScope.toLowerCase()
        : '';
      if (!isCurrentUserAdmin() || adminScope === 'director') {
        showMessage('error', 'Доступ к настройкам документов ограничен.');
        return;
      }
      ensureAdminModal();
      if (adminElements.ocrButton) {
        adminElements.ocrButton.hidden = !canUseGlobalAdminOcr();
        adminElements.ocrButton.disabled = !canUseGlobalAdminOcr();
      }
      if (adminElements.navigation) {
        adminElements.navigation.dataset.visibleCount = String(
          adminElements.navigation.querySelectorAll('[data-admin-navigation]:not([hidden])').length
        );
      }
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      ensureAdminUserLogState().visible = false;
      ensureAdminTemplateState().visible = false;
      ensureAdminS3State().visible = false;
      ensureAdminOcrState().visible = false;
      updateAdminLogPanel();
      updateAdminTemplatePanel();
      updateAdminS3Panel();
      adminUiState.query = '';
      if (adminElements.searchInput) {
        adminElements.searchInput.value = '';
      }
      resetAdminFilters();
      clearAdminDirtyState();
      showAdminUsersView();
      setActiveAdminSection('responsibles');
      adminElements.modal.classList.add('is-visible');
      adminElements.modal.setAttribute('aria-hidden', 'false');
      document.addEventListener('keydown', handleAdminKeydown, true);
      renderAdminRows('responsibles', state.admin.settings.responsibles, true);
      renderAdminRows('block2', state.admin.settings.block2, false);
      renderAdminRows('block3', state.admin.settings.block3, false);
      if (adminElements.aiBriefProviderSelect) {
        adminElements.aiBriefProviderSelect.value = state.admin.settings.aiBriefProvider === 'deepseek' ? 'deepseek' : 'default';
      }
      updateAdminMessage(state.admin.loaded ? '' : 'Загружаем настройки...', false);
      Promise.all([
        loadAdminSettings({ focus: !state.admin.loaded }),
        refreshObjects()
      ]).then(function() {
        renderAdminRows('responsibles', state.admin.settings.responsibles, false);
        renderAdminRows('block2', state.admin.settings.block2, false);
        renderAdminRows('block3', state.admin.settings.block3, false);
      }).catch(function() {
        // сообщение уже показано в updateAdminMessage или будет показано при открытии вкладки объектов
      });
    } catch (error) {
      var message = error && error.message ? error.message : 'Неизвестная ошибка.';
      if (typeof docsLogger.error === 'function') {
        docsLogger.error('Не удалось открыть админку документов:', error);
      }
      showMessage('error', 'Не удалось открыть админку: ' + message);
      if (adminElements && adminElements.modal) {
        try {
          updateAdminMessage('Не удалось открыть админку: ' + message, true);
        } catch (messageError) {}
      }
    }
  }

  function closeAdminModal() {
    if (!adminElements.modal) {
      return;
    }
    if (!confirmLeaveAdminObjectEditor('closed')) {
      return;
    }
    adminRenderTokens = {};
    closeAdminRowMenus();
    if (adminElements.filterPanel) {
      adminElements.filterPanel.hidden = true;
    }
    if (adminElements.filterButton) {
      adminElements.filterButton.setAttribute('aria-expanded', 'false');
    }
    adminElements.modal.classList.remove('is-visible');
    adminElements.modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleAdminKeydown, true);
    ensureAdminUserLogState().visible = false;
    ensureAdminTemplateState().visible = false;
    ensureAdminS3State().visible = false;
    ensureAdminOcrState().visible = false;
    updateAdminLogPanel();
    closeAdminTemplateModal({ skipFocus: true });
    closeAdminS3Modal({ skipFocus: true });
    closeAdminOcrModal({ skipFocus: true });
    closeCronManagementModal(false);
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function handleAdminKeydown(event) {
    if (event.key === 'Tab' && trapAdminOcrFocus(event)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      var openRowMenu = adminElements.usersCard
        ? adminElements.usersCard.querySelector('.documents-admin__row-menu:not([hidden])')
        : null;
      if (openRowMenu) {
        closeAdminRowMenus();
      } else if (adminElements.filterPanel && !adminElements.filterPanel.hidden) {
        adminElements.filterPanel.hidden = true;
        adminElements.filterButton.setAttribute('aria-expanded', 'false');
      } else if (adminElements.ocrTextReader && adminElements.ocrTextReader.classList.contains('is-visible')) {
        closeAdminOcrTextReader();
      } else if (ensureAdminOcrState().visible) {
        showAdminUsersView();
      } else if (adminElements.cronManagementModal && adminElements.cronManagementModal.classList.contains('is-visible')) {
        showAdminUsersView();
      } else if (ensureAdminTemplateState().visible) {
        showAdminUsersView();
      } else if (ensureAdminS3State().visible) {
        showAdminUsersView();
      } else if (ensureAdminUserLogState().visible) {
        closeAdminLogPanel();
      } else if (adminUiState.activeNavigation === 'objects') {
        showAdminUsersView();
      } else {
        closeAdminModal();
      }
    }
  }

  function loadAdminSettings(options) {
    var shouldFocus = Boolean(options && options.focus);
    return fetchAdminSettings()
      .then(function(data) {
        renderAdminRows('responsibles', state.admin.settings.responsibles, shouldFocus);
        renderAdminRows('block2', state.admin.settings.block2, false);
        renderAdminRows('block3', state.admin.settings.block3, false);
        if (adminElements.aiBriefProviderSelect) {
          adminElements.aiBriefProviderSelect.value = state.admin.settings.aiBriefProvider === 'deepseek' ? 'deepseek' : 'default';
        }
        clearAdminDirtyState();
        updateAdminMessage(data && data.message ? data.message : 'Настройки загружены.', false);
        return data;
      })
      .catch(function(error) {
        if (typeof docsLogger.error === 'function') {
          docsLogger.error('Не удалось загрузить настройки администратора:', error);
        }
        updateAdminMessage('Не удалось загрузить настройки: ' + error.message, true);
        throw error;
      });
  }

  function handleAdminSave() {
    if (state.admin.saving) {
      return;
    }
    clearAdminLoginValidationState();

    var responsiblesData = collectAdminRows('responsibles', { includeMeta: true });
    var directorsData = collectAdminRows('block2', { includeMeta: true });
    var subordinatesData = collectAdminRows('block3', { includeMeta: true });

    var loginValidation = validateAdminLoginUniqueness([responsiblesData, directorsData, subordinatesData]);
    if (!loginValidation.valid) {
      applyAdminLoginValidationFailure(loginValidation);
      return;
    }

    var responsibles = Array.isArray(responsiblesData.rows) ? responsiblesData.rows : [];
    var directors = Array.isArray(directorsData.rows) ? directorsData.rows : [];
    var subordinates = Array.isArray(subordinatesData.rows) ? subordinatesData.rows : [];
    var payload = {
      action: 'save_admin_settings',
      organization: state.organization,
      settings: {
        responsibles: responsibles,
        block2: directors,
        block3: subordinates,
        aiBriefProvider: adminElements.aiBriefProviderSelect && adminElements.aiBriefProviderSelect.value === 'deepseek'
          ? 'deepseek'
          : 'default'
      }
    };

    mergeTelegramUserId(payload);

    setAdminSaving(true);
    updateAdminMessage('Сохраняем данные...', false);

    fetch(buildApiUrl('save_admin_settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        if (data && data.settings) {
          applyAdminSettings(data.settings);
        } else {
          applyAdminSettings(payload.settings);
        }
        clearAdminDirtyState();
        updateAdminMessage(data && data.message ? data.message : 'Настройки сохранены.', false);
        showMessage('success', data && data.message ? data.message : 'Настройки администратора сохранены.');
        closeAdminModal();
      })
      .catch(function(error) {
        if (typeof docsLogger.error === 'function') {
          docsLogger.error('Ошибка сохранения настроек администратора:', error);
        }
        updateAdminMessage('Ошибка сохранения: ' + error.message, true);
      })
      .finally(function() {
        setAdminSaving(false);
      });
  }

  return {
    ensureResponsesStyle: ensureResponsesStyle,
    ensureSearchStyles: ensureSearchStyles,
    getAttachmentAiBrief: getAttachmentAiBrief,
    inferUploadExtensionFromType: inferUploadExtensionFromType,
    openAdminModal: openAdminModal,
    openAiBriefSummaryModal: openAiBriefSummaryModal,
    persistDocumentFileAiBrief: persistDocumentFileAiBrief,
    sortAdminEntriesByResponsible: sortAdminEntriesByResponsible
  };
}
