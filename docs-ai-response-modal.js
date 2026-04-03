(function () {
  var STYLE_ID = 'ai-chat-modal-style-v3';
  var ROOT_CLASS = 'ai-chat-modal';
  var FILE_INPUT_ID = 'ai-chat-hidden-file-input';
  var EMPTY_AI_MODEL = '';
  var FALLBACK_MODEL_OPTIONS = [{ value: EMPTY_AI_MODEL, label: 'Не задано в .env', available: false, reason: 'MODEL_NOT_CONFIGURED' }];
  var MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
  var MAX_EXTRACT_CHARS = 500000;
  var DEFAULT_CONTEXT_FILE_CHARS_DETAILED = 60000;
  var DEFAULT_CONTEXT_FILE_CHARS_BRIEF = 3500;
  var DEFAULT_CONTEXT_TOTAL_CHARS_DETAILED = 220000;
  var DEFAULT_CONTEXT_TOTAL_CHARS_BRIEF = 18000;
  var DEFAULT_LONG_ATTACHMENT_THRESHOLD = 7000;
  var AI_REQUEST_TIMEOUT_MS = 35000;
  var AI_REQUEST_TIMEOUT_MAX_MS = 70000;
  var AI_TIMEOUT_CONTEXT_STEP_TOKENS = 12000;
  var AI_TIMEOUT_STEP_MS = 8000;
  var AI_SOFT_RETRY_DELAY_MS = 1200;
  var AI_BEHAVIOR_MAX_CHARS = 8000;
  var DEFAULT_MODEL_TOKEN_LIMIT = 16000;
  var MODEL_TOKEN_LIMITS = {
    'gpt-4.1': 128000,
    'gpt-4.1-mini': 128000,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'o3': 200000,
    'o4-mini': 200000
  };
  var MAX_TEMPLATE_FILE_BYTES = 20 * 1024 * 1024; // 20MB
  var pdfJsReadyPromise = null;
  var mammothReadyPromise = null;
  var DEFAULT_AI_BEHAVIOR = 'ТЫ — СОТРУДНИК СТРОИТЕЛЬНОЙ ОРГАНИЗАЦИИ С 15-ЛЕТНИМ СТАЖЕМ.\n'
    + '\n'
    + 'ТВОЯ ЗАДАЧА — ОТВЕЧАТЬ НА ВХОДЯЩИЕ ПИСЬМА В ДЕЛОВОМ СТИЛЕ, ДАВАТЬ РЕШЕНИЯ, А НЕ ПЕРЕСКАЗЫВАТЬ ТЕКСТ.\n'
    + '\n'
    + '=== ЖЁСТКИЕ ПРАВИЛА ===\n'
    + '1. НЕ ПЕРЕСКАЗЫВАЙ текст письма. Анализируй требования и давай ответ по существу.\n'
    + '2. НЕ ИСПОЛЬЗУЙ слова: «возможно», «к сожалению», «извините», «попробуем», «надеемся», «стараемся».\n'
    + '3. ТОЛЬКО АКТИВНЫЙ ЗАЛОГ: «выполним», «обеспечим», «сделаем», «приступаем», а не «будет сделано».\n'
    + '5. НЕ ДОБАВЛЯЙ реквизиты компании, подписи, должности, даты отправки, служебные шапки — это уже есть в документе.\n'
    + '7. ЕСЛИ ТРЕБОВАНИЕ УЖЕ ВЫПОЛНЕНО — кратко подтверди.\n'
    + '8. ЕСЛИ ТРЕБОВАНИЕ НЕ ВЫПОЛНЕНО — назови новую дату и краткую причину (но без извинений).\n'
    + '\n'
    + '=== СТРУКТУРА ОТВЕТА ===\n'
    + '- Начинай сразу с обращения по имени-отчеству автора (если известно).\n'
    + '- Первым блоком кратко перечисли выполненные пункты (1–2 предложения).\n'
    + '- Далее по каждому невыполненному требованию: действие + дата завершения.\n'
    + '- Группируй однотипные требования, но не смешивай разные объекты.\n'
    + '- Заверши подтверждением, что требуемый фронт работ будет обеспечен (с датой).\n'
    + '- НЕ ИСПОЛЬЗУЙ маркированные списки с цифрами из исходного письма. Используй связные предложения или однородные перечисления.\n'
    + '\n'
    + '=== ПРИМЕР ОТВЕТА ===\n'
    + 'Демонтаж фундамента башенного крана в районе дома 9.4 выполнен.\n'
    + '\n'
    + 'По остальным позициям:\n'
    + '- Очистку зон на фото №1 и №2 завершаем 22.03.2026. Техника и бригада на объекте.\n'
    + '- Геологические изыскания для временной дороги и доступа к галерее паркинга 9.5 выполняем 21.03.2026, дорогу подготовим к 23.03.2026.\n'
    + '- Бетонные работы и гидроизоляцию рампы паркинга 9.5 завершаем 24.03.2026, что позволит приступить к обратной засыпке пазух.\n'
    + '\n'
    + 'Фронт для выполнения земляных работ по 11-й очереди обеспечим к 25.03.2026.\n'
    + '=== ВАЖНО ===\n'
    + '- Если в письме есть ссылки на фото — учитывай их как зоны ответственности.\n'
    + '- Если указаны разные объекты (дом 9.4, паркинг 9.5) — отвечай по каждому отдельно в рамках структуры.\n'
    + '- Если письмо требует «обеспечить фронт работ» — твой ответ должен явно подтверждать, когда фронт будет передан.\n'
    + '- Используй только даты в будущем или настоящем; не используй прошедшие сроки без новой даты.\n';

  var STYLE_OPTIONS = [
    { value: 'positive', label: 'Положительный (одобрение, выполнение)' },
    { value: 'negative', label: 'Отрицательный (отклонение, не выполнение)' },
    { value: 'neutral', label: 'Нейтральный (рассмотрение)' }
  ];
  var OCR_MODE_OPTIONS = [
    { value: 'raw', label: 'OCR: как в файле (без очистки)' }
  ];
  var CONTEXT_DETAIL_OPTIONS = [
    { value: 'detailed', label: 'Подробно' },
    { value: 'brief', label: 'Кратко' }
  ];
  var AI_MODE_OPTIONS = [
    { value: 'free', label: 'Бесплатный ИИ' },
    { value: 'paid', label: 'VIP ИИ (платный)' }
  ];
  var DOCS_AI_FALLBACK_ENDPOINTS = ['/api-docs.php', '/js/documents/api-docs.php'];
  var GROQ_PAID_ENDPOINTS = ['/js/documents/api-groq-paid.php', '/api-groq-paid.php'];
  var GROQ_PDF_UNSUPPORTED_MODELS = ['llama-3.1-8b-instant'];
  var VISION_BATCH_SIZE = 4;

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

  function getDocsAiEndpoints(preferredApiUrl) {
    var preferred = String(preferredApiUrl || window.DOCUMENTS_AI_API_URL || '').trim();
    var endpoints = preferred ? [preferred].concat(DOCS_AI_FALLBACK_ENDPOINTS) : DOCS_AI_FALLBACK_ENDPOINTS.slice();
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  async function postDocsAiWithFallback(createFormData, preferredApiUrl, actionName) {
    var endpoints = getDocsAiEndpoints(preferredApiUrl);
    var lastResult = null;
    for (var index = 0; index < endpoints.length; index += 1) {
      var endpoint = endpoints[index];
      var response = null;
      var payload = null;
      try {
        var requestBody = await createFormData();
        if (!(requestBody instanceof FormData)) {
          throw new Error('Форма запроса не подготовлена');
        }
        response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          body: requestBody
        });
        payload = await response.json().catch(function () { return null; });
      } catch (error) {
        lastResult = { endpoint: endpoint, response: response, payload: payload, error: error };
        continue;
      }
      var shouldTryNext = !response.ok && (response.status === 404 || response.status === 405 || !payload);
      if (shouldTryNext && index < endpoints.length - 1) {
        lastResult = { endpoint: endpoint, response: response, payload: payload };
        continue;
      }
      return { endpoint: endpoint, response: response, payload: payload };
    }
    if (lastResult) {
      return lastResult;
    }
    throw new Error((actionName || 'OCR') + ' временно недоступен');
  }

  function sanitizeHtml(inputHtml) {
    var allowedTags = { p: true, br: true, strong: true, em: true, ul: true, ol: true, li: true };
    var template = document.createElement('template');
    template.innerHTML = String(inputHtml || '');

    function sanitizeNode(node, doc) {
      if (!node) {
        return null;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        return doc.createTextNode(node.nodeValue || '');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }
      var tagName = String(node.tagName || '').toLowerCase();
      if (tagName === 'script' || tagName === 'iframe') {
        return null;
      }

      var fragment = doc.createDocumentFragment();
      var childNodes = Array.from(node.childNodes || []);
      if (!allowedTags[tagName]) {
        childNodes.forEach(function (child) {
          var cleanChild = sanitizeNode(child, doc);
          if (cleanChild) {
            fragment.appendChild(cleanChild);
          }
        });
        return fragment;
      }

      var cleanElement = doc.createElement(tagName);
      childNodes.forEach(function (child) {
        var cleanChild = sanitizeNode(child, doc);
        if (cleanChild) {
          cleanElement.appendChild(cleanChild);
        }
      });
      return cleanElement;
    }

    var cleanRoot = document.createElement('div');
    Array.from(template.content.childNodes || []).forEach(function (node) {
      var cleanNode = sanitizeNode(node, document);
      if (cleanNode) {
        cleanRoot.appendChild(cleanNode);
      }
    });

    return String(cleanRoot.innerHTML || '').replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  }

  function cleanNumericArtifacts(text) {
    return String(text || '')
      .replace(/(\d)\s*[\(\)ОOо]\s*(\d)/g, '$1$2')
      .replace(/(\d)\s{2,}(\d)/g, '$1 $2')
      .replace(/\bрубл\b/gi, 'рублей')
      .replace(/\bкоп\b\.?/gi, 'копеек');
  }

  function estimateTokens(value) {
    var text = String(value || '');
    if (!text) {
      return 0;
    }
    return Math.ceil(text.length / 4);
  }

  function getModelTokenLimit(modelName) {
    var normalized = String(modelName || '').toLowerCase().trim();
    if (!normalized) {
      return DEFAULT_MODEL_TOKEN_LIMIT;
    }
    var exact = MODEL_TOKEN_LIMITS[normalized];
    if (exact) {
      return exact;
    }
    if (normalized.indexOf('mini') >= 0 || normalized.indexOf('gpt-4') >= 0 || normalized.indexOf('o') === 0) {
      return 128000;
    }
    return DEFAULT_MODEL_TOKEN_LIMIT;
  }


  function filterOcrArtifacts(text, mode, diagnostics) {
    var normalized = String(text || '').replace(/\r\n/g, '\n');
    normalized = normalized
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]{2,}/g, ' ');
    if (mode !== 'raw') {
      var lines = normalized.split('\n').map(function (line) { return line.trim(); });
      normalized = lines.filter(function (line) {
        if (!line) {
          return false;
        }
        if (/^[\W_]{4,}$/.test(line)) {
          return false;
        }
        if (/^[il1|\\\/\-\._]{5,}$/i.test(line)) {
          return false;
        }
        return true;
      }).join('\n');
    }
    var stats = diagnostics && typeof diagnostics === 'object' ? diagnostics : null;
    if (stats) {
      stats.totalLines = normalized ? normalized.split(/\r\n|\r|\n/).length : 0;
      stats.whitelistKept = 0;
      stats.noiseDropped = 0;
      stats.emptyDropped = 0;
      stats.mode = mode || 'raw';
    }
    return normalized;
  }

  function normalizeContextText(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, Math.max(1000, Number(timeoutMs || AI_REQUEST_TIMEOUT_MS)));
    var safeOptions = options && typeof options === 'object' ? options : {};
    return fetch(url, Object.assign({}, safeOptions, { signal: controller.signal }))
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          var timeoutError = new Error('Таймаут ответа ИИ. Попробуйте ещё раз с меньшим объёмом контекста.');
          timeoutError.code = 'AI_TIMEOUT';
          throw timeoutError;
        }
        if (error instanceof TypeError) {
          var networkError = new Error('Сетевая ошибка. Проверьте интернет и повторите.');
          networkError.code = 'NETWORK_ERROR';
          throw networkError;
        }
        throw error;
      })
      .finally(function () { clearTimeout(timer); });
  }

  function resolveRequestMode(state) {
    return state && state.contextDetail === 'brief'
      ? 'paid'
      : ((state && state.aiMode) === 'paid' ? 'paid' : 'free');
  }

  async function resolvePaidSourceFiles(state, config) {
    function resolveFileUrl(file) {
      if (!file || typeof file !== 'object') {
        return '';
      }
      var candidates = [
        file.url,
        file.fileUrl,
        file.downloadUrl,
        file.resolvedUrl,
        file.previewUrl,
        file.previewPdfUrl,
        file.pdfUrl,
        file.pdf
      ];
      for (var idx = 0; idx < candidates.length; idx += 1) {
        var value = typeof candidates[idx] === 'string' ? candidates[idx].trim() : '';
        if (value) {
          return value;
        }
      }
      return '';
    }
    function shouldConvertPdfForModel(modelName) {
      var normalized = String(modelName || '').trim().toLowerCase();
      return GROQ_PDF_UNSUPPORTED_MODELS.indexOf(normalized) !== -1;
    }

    function isPdfFile(name, type) {
      var fileName = String(name || '').toLowerCase();
      var fileType = String(type || '').toLowerCase();
      return fileType.indexOf('application/pdf') === 0 || /\.pdf$/i.test(fileName);
    }

    async function convertPdfBlobToJpegBlobs(pdfBlob, baseName) {
      var pdfjsLib = await ensurePdfJsLoaded();
      var buffer = await pdfBlob.arrayBuffer();
      var loadingTask = pdfjsLib.getDocument({ data: buffer });
      var pdf = await loadingTask.promise;
      var maxPages = Math.min(3, Math.max(Number(pdf && pdf.numPages) || 1, 1));
      var images = [];
      for (var pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
        // eslint-disable-next-line no-await-in-loop
        var page = await pdf.getPage(pageIndex);
        var viewport = page.getViewport({ scale: 1.8 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        var ctx = canvas.getContext('2d');
        if (!ctx) break;
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        // eslint-disable-next-line no-await-in-loop
        var jpegBlob = await new Promise(function (resolve) {
          canvas.toBlob(resolve, 'image/jpeg', 0.9);
        });
        if (!jpegBlob) continue;
        images.push({
          name: baseName + '-page-' + pageIndex + '.jpg',
          blob: jpegBlob
        });
      }
      return images;
    }

    async function tryExtractOcrTextForPaid(fileOrBlob, fileName, remoteUrl) {
      var apiUrl = (config && config.apiUrl) || window.DOCUMENTS_AI_API_URL || '/api-docs.php';
      function buildOcrFormData() {
        var formData = new FormData();
        formData.append('action', 'ocr_extract');
        formData.append('language', 'rus');
        if (remoteUrl) {
          formData.append('file_url', String(remoteUrl));
        } else if (fileOrBlob) {
          var normalizedName = String(fileName || (fileOrBlob && fileOrBlob.name) || 'document').trim() || 'document';
          if (!/\.[a-z0-9]{2,8}$/i.test(normalizedName)) {
            var type = String(fileOrBlob && fileOrBlob.type || '').toLowerCase();
            if (type.indexOf('pdf') >= 0) normalizedName += '.pdf';
            else if (type.indexOf('jpeg') >= 0 || type.indexOf('jpg') >= 0) normalizedName += '.jpg';
            else if (type.indexOf('png') >= 0) normalizedName += '.png';
            else if (type.indexOf('webp') >= 0) normalizedName += '.webp';
            else if (type.indexOf('gif') >= 0) normalizedName += '.gif';
            else if (type.indexOf('bmp') >= 0) normalizedName += '.bmp';
            else if (type.indexOf('tiff') >= 0 || type.indexOf('tif') >= 0) normalizedName += '.tiff';
            else normalizedName += '.bin';
          }
          formData.append('file', fileOrBlob, normalizedName);
        }
        return formData;
      }
      if (!remoteUrl && !fileOrBlob) {
        return '';
      }
      try {
        var request = await postDocsAiWithFallback(buildOcrFormData, apiUrl, 'OCR');
        var response = request && request.response;
        var payload = request && request.payload;
        if (!response.ok || !payload || payload.ok !== true) {
          return '';
        }
        return String(payload.text || '').trim();
      } catch (_) {
        return '';
      }
    }

    var activeModel = String((state && state.model) || (config && config.defaultModel) || '').trim();
    var convertPdfForModel = shouldConvertPdfForModel(activeModel);
    var candidates = Array.isArray(state && state.files) ? state.files : [];
    var preparedFiles = [];
    for (var i = 0; i < candidates.length; i += 1) {
      var file = candidates[i];
      if (file && file.fileObject) {
        var localName = file.name || 'document.bin';
        if (isPdfFile(localName, file.fileObject.type) && convertPdfForModel) {
          // eslint-disable-next-line no-await-in-loop
          var localJpegs = await convertPdfBlobToJpegBlobs(file.fileObject, localName.replace(/\.pdf$/i, '') || 'document');
          if (localJpegs.length) {
            preparedFiles = preparedFiles.concat(localJpegs);
            continue;
          }
        }
        if (isPdfFile(localName, file.fileObject.type) && !/\.pdf$/i.test(localName)) localName += '.pdf';
        preparedFiles.push({ name: localName, blob: file.fileObject });
        continue;
      }
      var remoteUrl = resolveFileUrl(file);
      if (remoteUrl) {
        // eslint-disable-next-line no-await-in-loop
        var fileResponse = await fetch(remoteUrl, { credentials: 'same-origin' });
        if (!fileResponse.ok) {
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        var fileBlob = await fileResponse.blob();
        var remoteName = file.name || 'document.bin';
        if (isPdfFile(remoteName, fileBlob.type) && convertPdfForModel) {
          // eslint-disable-next-line no-await-in-loop
          var remoteJpegs = await convertPdfBlobToJpegBlobs(fileBlob, remoteName.replace(/\.pdf$/i, '') || 'document');
          if (remoteJpegs.length) {
            preparedFiles = preparedFiles.concat(remoteJpegs);
            continue;
          }
        }
        if (isPdfFile(remoteName, fileBlob.type) && !/\.pdf$/i.test(remoteName)) remoteName += '.pdf';
        preparedFiles.push({ name: remoteName, blob: fileBlob });
      }
    }
    return preparedFiles;
  }

  function readBlobAsDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      if (!blob || typeof FileReader === 'undefined') {
        reject(new Error('Не удалось прочитать файл.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Ошибка чтения файла.')); };
      reader.readAsDataURL(blob);
    });
  }

  function chunkItems(list, chunkSize) {
    var source = Array.isArray(list) ? list : [];
    var size = Math.max(1, Number(chunkSize || 1));
    var chunks = [];
    for (var i = 0; i < source.length; i += size) {
      chunks.push(source.slice(i, i + size));
    }
    return chunks;
  }

  async function convertPdfBlobToVisionImages(pdfBlob, baseName) {
    var pdfjsLib = await ensurePdfJsLoaded();
    var bytes = await pdfBlob.arrayBuffer();
    var loadingTask = pdfjsLib.getDocument({ data: bytes });
    var pdf = await loadingTask.promise;
    var totalPages = Number(pdf && pdf.numPages || 0);
    var pagesToProcess = Math.max(1, totalPages);
    var images = [];
    for (var pageIndex = 1; pageIndex <= pagesToProcess; pageIndex += 1) {
      // eslint-disable-next-line no-await-in-loop
      var page = await pdf.getPage(pageIndex);
      var viewport = page.getViewport({ scale: 1.25 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      // eslint-disable-next-line no-await-in-loop
      var jpegBlob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.82); });
      if (!jpegBlob) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      var dataUrl = await readBlobAsDataUrl(jpegBlob);
      images.push({
        dataUrl: dataUrl,
        fileName: (baseName || 'scan') + '-p' + pageIndex + '.jpg',
        mime: 'image/jpeg'
      });
    }
    return images;
  }

  async function resolveVisionAssets(state) {
    var files = Array.isArray(state && state.files) ? state.files : [];
    var images = [];
    var ocrTexts = [];
    for (var index = 0; index < files.length; index += 1) {
      var fileEntry = files[index];
      if (!fileEntry) continue;
      var fileName = String(fileEntry.name || ('document-' + (index + 1)));
      var fileBlob = fileEntry.fileObject || null;
      if (!fileBlob && fileEntry.url) {
        try {
          // eslint-disable-next-line no-await-in-loop
          var external = await fetch(String(fileEntry.url), { credentials: 'same-origin' });
          if (external.ok) {
            // eslint-disable-next-line no-await-in-loop
            fileBlob = await external.blob();
          }
        } catch (_) {}
      }
      if (!fileBlob) continue;

      if (isImageLike({ name: fileName, type: fileBlob.type })) {
        // eslint-disable-next-line no-await-in-loop
        var dataUrl = await readBlobAsDataUrl(fileBlob);
        images.push({
          dataUrl: dataUrl,
          fileName: fileName || ('image-' + (index + 1) + '.jpg'),
          mime: String(fileBlob.type || 'image/jpeg')
        });
      } else if (isPdfLike({ name: fileName, type: fileBlob.type })) {
        try {
          // eslint-disable-next-line no-await-in-loop
          var pdfImages = await convertPdfBlobToVisionImages(fileBlob, fileName.replace(/\.pdf$/i, '') || ('scan-' + (index + 1)));
          images = images.concat(pdfImages);
        } catch (_) {}
      }

      var text = normalizeContextText(fileEntry.content || fileEntry.rawContent || '');
      if (text) {
        ocrTexts.push({
          name: fileName,
          type: String(fileBlob.type || 'text/plain'),
          text: text.slice(0, 70000)
        });
      }
    }
    return { images: images, ocrTexts: ocrTexts };
  }

  async function buildPaidVisionRequestFormData(prompt, state) {
    var resolved = await resolveVisionAssets(state);
    var images = Array.isArray(resolved.images) ? resolved.images : [];
    if (!images.length) {
      throw new Error('Vision режим требует файл-изображение или PDF.');
    }
    var imageBatches = chunkItems(images, VISION_BATCH_SIZE);
    var messages = imageBatches.map(function (batch, index) {
      return {
        role: 'user',
        content: [{ type: 'text', text: (prompt || 'Проанализируй содержимое файла') + '\n\nБлок ' + (index + 1) + ' из ' + imageBatches.length + '.' }]
          .concat(batch.map(function (item) { return { type: 'image_url', image_url: { url: item.dataUrl } }; }))
      };
    });
    var formData = new FormData();
    formData.append('action', 'analyze_paid');
    formData.append('mode', 'paid');
    formData.append('vision_mode', '1');
    formData.append('prompt', String(prompt || 'Проанализируй содержимое файла'));
    if (resolved.ocrTexts.length) {
      formData.append('extractedTexts', JSON.stringify(resolved.ocrTexts));
    }
    formData.append('vision_payload', JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1200,
      temperature: 0.6,
      messages: messages
    }));
    images.forEach(function (item, idx) {
      var data = String(item.dataUrl || '');
      var base64 = data.indexOf(',') >= 0 ? data.split(',')[1] : '';
      if (!base64) return;
      var mimeType = item.mime || 'image/jpeg';
      var blob = new Blob([Uint8Array.from(atob(base64), function (char) { return char.charCodeAt(0); })], { type: mimeType });
      formData.append('files', blob, item.fileName || ('vision-' + (idx + 1) + '.jpg'));
    });
    return formData;
  }

  async function buildPaidRequestFormData(prompt, state, config) {
    if (state && state.visionMode) {
      return buildPaidVisionRequestFormData(prompt, state);
    }
    var paidFiles = await resolvePaidSourceFiles(state, config);
    var sourceFiles = Array.isArray(state && state.files) ? state.files : [];
    var extractedTexts = [];
    var mergedSourceChunks = [];
    var missingSourceNames = [];
    function resolveSourceUrlForOcr(sourceEntry) {
      if (!sourceEntry || typeof sourceEntry !== 'object') {
        return '';
      }
      var candidates = [
        sourceEntry.url,
        sourceEntry.fileUrl,
        sourceEntry.downloadUrl,
        sourceEntry.resolvedUrl,
        sourceEntry.previewUrl,
        sourceEntry.previewPdfUrl,
        sourceEntry.pdfUrl,
        sourceEntry.pdf
      ];
      for (var idx = 0; idx < candidates.length; idx += 1) {
        var value = typeof candidates[idx] === 'string' ? candidates[idx].trim() : '';
        if (value) {
          return value;
        }
      }
      return '';
    }
    async function requestOcrTextForPaidFile(sourceEntry, fallbackName) {
      var apiUrl = (config && config.apiUrl) || window.DOCUMENTS_AI_API_URL || '/api-docs.php';
      if (!sourceEntry) {
        return '';
      }
      var sourceUrl = resolveSourceUrlForOcr(sourceEntry);
      async function buildFormDataAsync() {
        var formData = new FormData();
        formData.append('action', 'ocr_extract');
        formData.append('language', 'rus');
        if (sourceEntry.fileObject) {
          var uploadName = String(fallbackName || (sourceEntry.fileObject && sourceEntry.fileObject.name) || 'document').trim() || 'document';
          if (!/\.[a-z0-9]{2,8}$/i.test(uploadName)) {
            var fileType = String(sourceEntry.fileObject && sourceEntry.fileObject.type || '').toLowerCase();
            if (fileType.indexOf('pdf') >= 0) uploadName += '.pdf';
            else if (fileType.indexOf('jpeg') >= 0 || fileType.indexOf('jpg') >= 0) uploadName += '.jpg';
            else if (fileType.indexOf('png') >= 0) uploadName += '.png';
            else if (fileType.indexOf('webp') >= 0) uploadName += '.webp';
            else uploadName += '.bin';
          }
          formData.append('file', sourceEntry.fileObject, uploadName);
          return formData;
        }
        if (!sourceUrl) {
          return null;
        }
        try {
          var fetched = await fetch(String(sourceUrl), { credentials: 'same-origin' });
          if (fetched.ok) {
            var blob = await fetched.blob();
            var remoteName = String(fallbackName || 'document').trim() || 'document';
            if (!/\.[a-z0-9]{2,8}$/i.test(remoteName)) {
              var blobType = String(blob && blob.type || '').toLowerCase();
              if (blobType.indexOf('pdf') >= 0) remoteName += '.pdf';
              else if (blobType.indexOf('jpeg') >= 0 || blobType.indexOf('jpg') >= 0) remoteName += '.jpg';
              else if (blobType.indexOf('png') >= 0) remoteName += '.png';
              else if (blobType.indexOf('webp') >= 0) remoteName += '.webp';
              else remoteName += '.bin';
            }
            formData.append('file', blob, remoteName);
            return formData;
          }
        } catch (_) {}
        formData.append('file_url', String(sourceUrl));
        return formData;
      }
      var finalRequest = await postDocsAiWithFallback(function () {
        return buildFormDataAsync();
      }, apiUrl, 'OCR');
      var response = finalRequest && finalRequest.response;
      var payload = finalRequest && finalRequest.payload;
      if (!response.ok || !payload || payload.ok !== true) {
        return '';
      }
      return String(payload.text || '').trim();
    }

    for (var i = 0; i < sourceFiles.length; i += 1) {
      var sourceEntry = sourceFiles[i];
      if (!sourceEntry) {
        continue;
      }
      var sourceName = String(sourceEntry.name || ('document-' + (i + 1))).trim() || ('document-' + (i + 1));
      var sourceText = normalizeContextText(sourceEntry.content || sourceEntry.rawContent || '');
      if (!sourceText) {
        // eslint-disable-next-line no-await-in-loop
        var ocrText = await requestOcrTextForPaidFile(sourceEntry, sourceName).catch(function () { return ''; });
        sourceText = normalizeContextText(ocrText || '');
      }
      if (!sourceText) {
        missingSourceNames.push(sourceName);
        continue;
      }
      mergedSourceChunks.push('[' + sourceName + ']\n' + sourceText);
    }

    if ((!Array.isArray(paidFiles) || !paidFiles.length) && !mergedSourceChunks.length) {
      throw new Error('Для платного ИИ прикрепите минимум один файл.');
    }
    if (missingSourceNames.length) {
      throw new Error('Не удалось извлечь текст для: ' + missingSourceNames.slice(0, 4).join(', ') + (missingSourceNames.length > 4 ? ' и ещё ' + (missingSourceNames.length - 4) : '') + '.');
    }
    if (!mergedSourceChunks.length) {
      throw new Error('OCR не вернул текст по вложениям. Откройте файл и нажмите «📄 Текст», затем повторите отправку.');
    }
    extractedTexts.push({
      name: 'Общий контекст всех файлов',
      type: 'text/plain',
      text: mergedSourceChunks.join('\n\n====================\n\n').slice(0, 90000)
    });

    var promptWithContext = String(prompt || 'Сформируй ответ по приложенному файлу.');

    var formData = new FormData();
    formData.append('action', 'generate_response');
    formData.append('prompt', promptWithContext);
    if (extractedTexts.length) {
      formData.append('extractedTexts', JSON.stringify(extractedTexts));
    }
    if (!extractedTexts.length) {
      paidFiles.forEach(function (entry) {
        if (!entry || !entry.blob) return;
        formData.append('files[]', entry.blob, entry.name || 'document.bin');
      });
    }
    return formData;
  }

  async function postGroqPaidVisionBatched(prompt, state, timeoutMs) {
    var resolved = await resolveVisionAssets(state);
    var images = Array.isArray(resolved && resolved.images) ? resolved.images : [];
    if (!images.length) {
      throw new Error('Vision режим требует изображения или PDF.');
    }
    var imageBatches = chunkItems(images, VISION_BATCH_SIZE);
    var partialAnswers = [];

    async function postVisionFormDataWithFallback(createFormData) {
      var lastError = null;
      for (var endpointIndex = 0; endpointIndex < GROQ_PAID_ENDPOINTS.length; endpointIndex += 1) {
        var endpoint = GROQ_PAID_ENDPOINTS[endpointIndex];
        try {
          // eslint-disable-next-line no-await-in-loop
          var response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            body: createFormData()
          }, timeoutMs);
          if (response.status === 404 || response.status === 405) {
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          var payload = await response.clone().json().catch(function () { return null; });
          var serverError = String(payload && payload.error ? payload.error : '');
          var shouldTryNext = (response.status >= 500 || /E208|internal processing error/i.test(serverError))
            && endpointIndex < GROQ_PAID_ENDPOINTS.length - 1;
          if (shouldTryNext) {
            continue;
          }
          return { response: response, payload: payload };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Не удалось отправить Vision запрос.');
    }

    for (var batchIndex = 0; batchIndex < imageBatches.length; batchIndex += 1) {
      var currentBatch = imageBatches[batchIndex];
      // eslint-disable-next-line no-await-in-loop
      var batchResult = await postVisionFormDataWithFallback(function () {
        var formData = new FormData();
        formData.append('action', 'analyze_paid');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', String(prompt || 'Проанализируй содержимое файла'));
        if (Array.isArray(resolved.ocrTexts) && resolved.ocrTexts.length && batchIndex === 0) {
          formData.append('extractedTexts', JSON.stringify(resolved.ocrTexts));
        }
        formData.append('vision_payload', JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 1200,
          temperature: 0.6,
          messages: [{
            role: 'user',
            content: [{ type: 'text', text: (prompt || 'Проанализируй содержимое файла') + '\n\nБлок ' + (batchIndex + 1) + ' из ' + imageBatches.length + '.' }]
              .concat(currentBatch.map(function (item) { return { type: 'image_url', image_url: { url: item.dataUrl } }; }))
          }]
        }));
        currentBatch.forEach(function (item, idx) {
          var data = String(item.dataUrl || '');
          var base64 = data.indexOf(',') >= 0 ? data.split(',')[1] : '';
          if (!base64) return;
          var mimeType = item.mime || 'image/jpeg';
          var blob = new Blob([Uint8Array.from(atob(base64), function (char) { return char.charCodeAt(0); })], { type: mimeType });
          formData.append('files', blob, item.fileName || ('vision-' + (batchIndex + 1) + '-' + (idx + 1) + '.jpg'));
        });
        return formData;
      });
      var batchPayload = batchResult && batchResult.payload;
      if (!batchResult || !batchResult.response || !batchResult.response.ok || !batchPayload || batchPayload.ok !== true) {
        throw new Error((batchPayload && batchPayload.error) || ('Ошибка Vision запроса (блок ' + (batchIndex + 1) + ')'));
      }
      partialAnswers.push(String(batchPayload.response || batchPayload.summary || '').trim());
    }

    var finalSummary = partialAnswers.join('\n\n').trim();
    if (partialAnswers.length > 1) {
      var mergeResult = await postVisionFormDataWithFallback(function () {
        var formData = new FormData();
        formData.append('action', 'generate_summary');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('extractedTexts', JSON.stringify([{
          name: 'vision-batches.txt',
          type: 'text/plain',
          text: partialAnswers.map(function (item, idx) { return 'Блок ' + (idx + 1) + '/' + partialAnswers.length + ':\n' + item; }).join('\n\n')
        }]));
        return formData;
      });
      var mergePayload = mergeResult && mergeResult.payload;
      if (mergeResult && mergeResult.response && mergeResult.response.ok && mergePayload && mergePayload.ok === true) {
        finalSummary = String(mergePayload.summary || mergePayload.response || '').trim() || finalSummary;
      }
    }
    if (!finalSummary) {
      throw new Error('Vision не вернул итоговый текст.');
    }
    return new Response(JSON.stringify({
      ok: true,
      response: finalSummary,
      mode: 'vision',
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      tokensUsed: 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function postGroqPaidWithFallback(prompt, state, config, timeoutMs) {
    if (state && state.visionMode) {
      return postGroqPaidVisionBatched(prompt, state, timeoutMs);
    }
    var lastError = null;
    for (var i = 0; i < GROQ_PAID_ENDPOINTS.length; i += 1) {
      var endpoint = GROQ_PAID_ENDPOINTS[i];
      try {
        // eslint-disable-next-line no-await-in-loop
        var body = await buildPaidRequestFormData(prompt, state, config);
        // eslint-disable-next-line no-await-in-loop
        var response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          body: body
        }, timeoutMs);
        if (response.status === 404 || response.status === 405) {
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        var payload = await response.clone().json().catch(function () { return null; });
        var serverError = String(payload && payload.error ? payload.error : '');
        var shouldTryNext = (response.status >= 500 || /E208|internal processing error/i.test(serverError))
          && i < GROQ_PAID_ENDPOINTS.length - 1;
        if (shouldTryNext) {
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Не удалось отправить файл в платный ИИ.');
  }

  function calculateAiTimeoutMs(prompt, state) {
    var promptTokens = estimateTokens(prompt);
    var filesTokens = Array.isArray(state && state.files)
      ? state.files.reduce(function (sum, file) { return sum + estimateTokens(file && file.content || ''); }, 0)
      : 0;
    var historyTokens = Array.isArray(state && state.history)
      ? state.history.reduce(function (sum, item) { return sum + estimateTokens(item && item.text || ''); }, 0)
      : 0;
    var totalTokens = promptTokens + filesTokens + historyTokens;
    var steps = Math.ceil(totalTokens / AI_TIMEOUT_CONTEXT_STEP_TOKENS);
    var timeout = AI_REQUEST_TIMEOUT_MS + (steps * AI_TIMEOUT_STEP_MS);
    return Math.max(AI_REQUEST_TIMEOUT_MS, Math.min(AI_REQUEST_TIMEOUT_MAX_MS, timeout));
  }

  function isContextOverflowError(error) {
    var code = String(error && error.code || '').toUpperCase();
    var message = String(error && error.message || '').toUpperCase();
    return code === 'CONTEXT_TOO_LARGE'
      || code === 'PAYLOAD_TOO_LARGE'
      || message.indexOf('MAX CONTEXT') >= 0
      || message.indexOf('TOO MANY TOKENS') >= 0;
  }

  function humanizeAiError(error) {
    if (!error) return 'Ошибка ИИ. Попробуйте ещё раз.';
    if (isContextOverflowError(error)) {
      return 'Запрос получился слишком длинным. Я уже сократил контекст, повторите отправку.';
    }
    if (String(error.code || '').toUpperCase() === 'AI_TIMEOUT') {
      return 'Таймаут ответа ИИ. Попробуйте повторить запрос.';
    }
    if (String(error.code || '').toUpperCase() === 'NETWORK_ERROR') {
      return 'Сетевая ошибка. Проверьте интернет и повторите.';
    }
    return String(error.message || 'Ошибка ИИ. Попробуйте ещё раз.');
  }

  function hasUsefulExtractedText(text) {
    var normalized = String(text || '').trim();
    if (!normalized) {
      return false;
    }
    var placeholders = [
      '[В PDF не найден извлекаемый текст]',
      '[Не удалось извлечь текст из PDF]',
      '[Файл слишком большой для промпта]'
    ];
    return placeholders.indexOf(normalized) === -1;
  }

  function sliceByChars(value, maxChars) {
    var text = String(value || '');
    if (!maxChars || text.length <= maxChars) {
      return text;
    }
    return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
  }

  function buildContextSettings(config) {
    var preparation = config && config.contextPreparation && typeof config.contextPreparation === 'object'
      ? config.contextPreparation
      : {};
    var priorityGroups = Array.isArray(preparation.priorityGroups) && preparation.priorityGroups.length
      ? preparation.priorityGroups
      : [
        { key: 'Реквизиты', patterns: [/\b(инн|кпп|огрн|бик|р\/с|расчетный счет|корр(\.|еспондентский)?\s*счет|банк|реквизит)\b/i] },
        { key: 'Даты', patterns: [/\b(дата|от)\b/i, /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/] },
        { key: 'Суммы', patterns: [/\b(сумм|итого|руб(лей)?|коп(еек)?|₽|оплат)\b/i, /\b\d[\d\s]{0,15}(?:[.,]\d{1,2})?\s*(руб|₽)\b/i] },
        { key: 'Поручения', patterns: [/\b(поруч(аем|ение)|необходимо|обязуем|просим|требуется)\b/i] },
        { key: 'Сроки', patterns: [/\b(срок|дедлайн|не позднее|в течение)\b/i] }
      ];

    priorityGroups = priorityGroups.map(function (group) {
      var patterns = Array.isArray(group && group.patterns) ? group.patterns : [];
      var normalizedPatterns = patterns.map(function (pattern) {
        if (pattern instanceof RegExp) {
          return pattern;
        }
        if (typeof pattern === 'string' && pattern.trim()) {
          try {
            return new RegExp(pattern, 'i');
          } catch (error) {
            return null;
          }
        }
        return null;
      }).filter(Boolean);
      return {
        key: group && group.key ? String(group.key) : 'Данные',
        patterns: normalizedPatterns
      };
    }).filter(function (group) {
      return group.patterns.length > 0;
    });

    return {
      perFileDetailed: Math.max(1000, Number(preparation.perFileDetailed || DEFAULT_CONTEXT_FILE_CHARS_DETAILED)),
      perFileBrief: Math.max(800, Number(preparation.perFileBrief || DEFAULT_CONTEXT_FILE_CHARS_BRIEF)),
      totalDetailed: Math.max(2000, Number(preparation.totalDetailed || DEFAULT_CONTEXT_TOTAL_CHARS_DETAILED)),
      totalBrief: Math.max(1500, Number(preparation.totalBrief || DEFAULT_CONTEXT_TOTAL_CHARS_BRIEF)),
      longAttachmentThreshold: Math.max(1000, Number(preparation.longAttachmentThreshold || DEFAULT_LONG_ATTACHMENT_THRESHOLD)),
      maxLinesPerPriorityGroup: Math.max(1, Number(preparation.maxLinesPerPriorityGroup || 6)),
      maxSummaryPoints: Math.max(3, Number(preparation.maxSummaryPoints || 7)),
      maxSummaryQuotes: Math.max(1, Number(preparation.maxSummaryQuotes || 4)),
      maxQuoteChars: Math.max(80, Number(preparation.maxQuoteChars || 160)),
      priorityPoolLimit: Math.max(4, Number(preparation.priorityPoolLimit || 18)),
      priorityShare: Math.min(0.7, Math.max(0.1, Number(preparation.priorityShare || 0.35))),
      priorityGroups: priorityGroups
    };
  }

  function extractPriorityLines(lines, settings) {
    var safeLines = Array.isArray(lines) ? lines : [];
    var groups = settings && Array.isArray(settings.priorityGroups) ? settings.priorityGroups : [];
    var linesPerGroup = settings && settings.maxLinesPerPriorityGroup ? settings.maxLinesPerPriorityGroup : 6;
    var result = [];
    var seen = {};
    groups.forEach(function (group) {
      var added = 0;
      var patterns = Array.isArray(group.patterns) ? group.patterns : [];
      for (var i = 0; i < safeLines.length; i += 1) {
        var line = String(safeLines[i] || '').trim();
        if (!line) {
          continue;
        }
        var normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen[normalized]) {
          continue;
        }
        var match = patterns.some(function (pattern) { return pattern instanceof RegExp && pattern.test(line); });
        if (!match) {
          continue;
        }
        result.push(String(group.key || 'Данные') + ': ' + line);
        seen[normalized] = true;
        added += 1;
        if (added >= linesPerGroup) {
          break;
        }
      }
    });
    return result;
  }

  function buildExtractSummary(text, settings) {
    var normalized = normalizeContextText(text);
    if (!normalized) {
      return '';
    }
    var lines = normalized.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) {
      return '';
    }
    var keyPoints = extractPriorityLines(lines, settings);
    if (!keyPoints.length) {
      keyPoints = lines.slice(0, 5).map(function (line) { return 'Пункт: ' + line; });
    }
    var quotes = lines
      .filter(function (line) { return line.length >= 12; })
      .slice(0, settings.maxSummaryQuotes)
      .map(function (line) { return '> ' + sliceByChars(line, settings.maxQuoteChars); });
    var excerpt = sliceByChars(lines.slice(0, 8).join(' '), Math.max(200, settings.maxQuoteChars * 2));
    return [
      'Ключевые пункты:',
      keyPoints.slice(0, settings.maxSummaryPoints).map(function (line) { return '- ' + line; }).join('\n'),
      'Цитаты строк:',
      quotes.join('\n'),
      'Короткая выжимка:',
      excerpt
    ].join('\n').trim();
  }

  function prepareContextPayload(state, settings) {
    var detailMode = state.contextDetail === 'brief' ? 'brief' : 'detailed';
    var perFileLimit = detailMode === 'brief' ? settings.perFileBrief : settings.perFileDetailed;
    var totalLimit = detailMode === 'brief' ? settings.totalBrief : settings.totalDetailed;
    var collected = [];
    var priorityLines = [];
    var seenTexts = {};
    var totalChars = 0;
    var sourceChars = 0;
    var truncatedFiles = 0;
    (state.files || []).forEach(function (file) {
      if (!file || typeof file.content !== 'string') {
        return;
      }
      var original = normalizeContextText(file.content);
      if (!original) {
        return;
      }
      sourceChars += original.length;
      var lines = original.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
      priorityLines = priorityLines.concat(extractPriorityLines(lines, settings));
      var shouldSummarize = detailMode === 'brief' || original.length > settings.longAttachmentThreshold;
      var preparedText = shouldSummarize ? buildExtractSummary(original, settings) : original;
      preparedText = sliceByChars(preparedText, perFileLimit);
      if (preparedText.length < original.length) {
        truncatedFiles += 1;
      }
      var fingerprint = preparedText.toLowerCase();
      if (!preparedText || seenTexts[fingerprint]) {
        return;
      }
      seenTexts[fingerprint] = true;
      if (totalChars >= totalLimit) {
        return;
      }
      var available = totalLimit - totalChars;
      var finalText = sliceByChars(preparedText, available);
      if (!finalText) {
        return;
      }
      collected.push({
        id: file.id,
        name: file.name,
        type: file.type || '',
        text: finalText
      });
      totalChars += finalText.length;
    });

    var dedupPriority = [];
    var seenPriority = {};
    priorityLines.forEach(function (line) {
      var key = String(line || '').toLowerCase();
      if (!key || seenPriority[key]) {
        return;
      }
      seenPriority[key] = true;
      dedupPriority.push(line);
    });
    var priorityText = sliceByChars(
      dedupPriority.slice(0, settings.priorityPoolLimit).join('\n'),
      Math.floor(totalLimit * settings.priorityShare)
    );
    var prioritizedEntries = priorityText
      ? [{ id: 'priority-block', name: 'Приоритетные данные', type: 'summary', text: priorityText }]
      : [];
    var entries = prioritizedEntries.concat(collected).filter(Boolean);
    var modelTokenLimit = getModelTokenLimit(state && state.model);
    var safeLimit = Math.max(2000, Math.floor(modelTokenLimit * 0.75));
    var usedTokens = 0;
    var tokenLimitedEntries = [];
    entries.forEach(function (entry) {
      var text = String(entry && entry.text || '');
      if (!text) {
        return;
      }
      if (usedTokens >= safeLimit) {
        return;
      }
      var availableTokens = safeLimit - usedTokens;
      var maxChars = availableTokens * 4;
      var clippedText = text.length > maxChars ? sliceByChars(text, maxChars) : text;
      if (!clippedText) {
        return;
      }
      usedTokens += estimateTokens(clippedText);
      tokenLimitedEntries.push(Object.assign({}, entry, { text: clippedText }));
    });
    return {
      extractedTexts: tokenLimitedEntries,
      stats: {
        sourceChars: sourceChars,
        preparedChars: tokenLimitedEntries.reduce(function (acc, item) { return acc + String(item.text || '').length; }, 0),
        filesUsed: collected.length,
        truncatedFiles: truncatedFiles,
        mode: detailMode,
        totalLimit: totalLimit,
        approxTokens: usedTokens,
        tokenLimit: safeLimit
      }
    };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.ai-chat-modal{position:fixed;inset:0;z-index:1900;display:flex;align-items:center;justify-content:center;padding:14px;background:radial-gradient(circle at top,rgba(59,130,246,.22),rgba(15,23,42,.56));backdrop-filter:blur(10px);opacity:0;transition:opacity .25s ease;}' +
      '.ai-chat-modal--visible{opacity:1;}' +
      '.ai-chat-modal--closing{opacity:0;}' +
      '.ai-chat-modal__panel{width:min(1200px,98vw);height:94vh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.9),rgba(248,250,252,.78));border:1px solid rgba(255,255,255,.6);border-radius:22px;overflow:hidden;box-shadow:0 24px 64px rgba(15,23,42,.28);backdrop-filter:blur(12px);}' +
      '.ai-chat-modal__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(226,232,240,.7);background:linear-gradient(180deg,rgba(255,255,255,.86),rgba(248,250,252,.64));}' +
      '.ai-chat-modal__title{font-size:14px;font-weight:700;color:#0f172a;}' +
      '.ai-chat-modal__subtitle{margin-top:1px;font-size:11px;color:#64748b;}' +
      '.ai-chat-modal__close{border:none;background:rgba(148,163,184,.18);width:32px;height:32px;border-radius:999px;font-size:18px;line-height:1;cursor:pointer;}' +
      '.ai-chat-modal__content{display:flex;flex-direction:column;gap:10px;padding:12px;min-height:0;flex:1;}' +
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
      '.ai-chat-modal__messages{flex:1;min-height:0;overflow:auto;padding:12px;background:rgba(248,250,252,.58);border:1px solid rgba(226,232,240,.75);border-radius:16px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;box-shadow:inset 0 1px 0 rgba(255,255,255,.65);}' +
      '.ai-chat-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.46;white-space:pre-wrap;word-break:break-word;box-shadow:0 6px 18px rgba(15,23,42,.08);}' +
      '.ai-chat-msg--user{margin-left:auto;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border-bottom-right-radius:6px;}' +
      '.ai-chat-msg--assistant{margin-right:auto;background:#fff;border:1px solid rgba(226,232,240,.9);color:#0f172a;border-bottom-left-radius:6px;}' +
      '.ai-chat-msg--error{border-color:rgba(239,68,68,.35);background:rgba(254,242,242,.9);color:#991b1b;}' +
      '.ai-chat-modal__composer{display:flex;gap:8px;align-items:flex-end;}' +
      '.ai-chat-modal__textarea{flex:1;min-height:44px;max-height:140px;resize:none;border:1px solid rgba(148,163,184,.4);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.4;background:rgba(255,255,255,.95);outline:none;}' +
      '.ai-chat-modal__send{border:none;border-radius:12px;padding:9px 13px;min-height:44px;font-size:12px;font-weight:700;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;cursor:pointer;box-shadow:0 8px 20px rgba(37,99,235,.25);}' +
      '.ai-chat-modal__send:disabled{opacity:.6;cursor:not-allowed;box-shadow:none;}' +
      '.ai-chat-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(148,163,184,.35);border-top-color:#2563eb;border-radius:50%;animation:ai-chat-spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
      '.ai-chat-modal__export-area{margin-top:4px;border-top:1px solid rgba(226,232,240,.88);padding-top:8px;display:flex;flex-direction:column;gap:6px;}' +
      '.ai-chat-modal__export-header{font-size:11px;font-weight:600;color:#334155;}' +
      '.ai-chat-modal__editable-response{width:100%;border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;background:#fff;min-height:84px;}' +
      '.ai-chat-modal__live-preview{border:1px solid rgba(148,163,184,.35);border-radius:10px;padding:10px;background:rgba(255,255,255,.78);min-height:110px;max-height:220px;overflow:auto;font-size:12px;line-height:1.45;color:#0f172a;white-space:pre-wrap;word-break:break-word;outline:none;}' +
      '.ai-chat-modal__live-preview:empty:before{content:attr(data-placeholder);color:#94a3b8;}' +
      '.ai-chat-modal__export-buttons{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}' +
      '.ai-chat-modal__export-btn{border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;background:#f1f5f9;color:#1e293b;cursor:pointer;transition:all .2s;min-height:38px;}' +
      '.ai-chat-modal__export-btn:hover{background:#e2e8f0;}' +
      '.ai-chat-modal__template-btn{min-width:130px;}' +
      '.ai-chat-template-viewer{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;}' +
      '.ai-chat-template-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}' +
      '.ai-chat-template-file-meta{font-size:12px;color:#475569;}' +
      '.ai-chat-template-tabs{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.ai-chat-template-editor{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;}' +
      '.ai-chat-editor{border:1px solid rgba(148,163,184,.35);border-radius:14px;background:rgba(255,255,255,.88);backdrop-filter:blur(6px);overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.7);display:flex;flex-direction:column;min-height:0;}' +
      '.ai-chat-editor--full{flex:1;min-height:0;}' +
      '.ai-chat-editor__toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border-bottom:1px solid rgba(226,232,240,.9);background:rgba(248,250,252,.85);align-items:center;}' +
      '.ai-chat-editor__btn{border:none;border-radius:9px;min-height:34px;padding:6px 10px;font-size:12px;font-weight:600;background:#e2e8f0;color:#0f172a;cursor:pointer;}' +
      '.ai-chat-editor__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;}' +
      '.ai-chat-editor__select{border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:7px 10px;background:#fff;font-size:12px;color:#0f172a;min-height:34px;}' +
      '.ai-chat-editor__menu{margin-left:auto;position:relative;}' +
      '.ai-chat-editor__menu summary{list-style:none;cursor:pointer;border:none;border-radius:9px;min-height:34px;padding:6px 10px;font-size:12px;font-weight:700;background:#e2e8f0;color:#0f172a;display:flex;align-items:center;}' +
      '.ai-chat-editor__menu summary::-webkit-details-marker{display:none;}' +
      '.ai-chat-editor__menu-panel{position:absolute;right:0;top:40px;z-index:4;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;background:#fff;border:1px solid rgba(203,213,225,.9);box-shadow:0 12px 28px rgba(15,23,42,.16);min-width:160px;}' +
      '.ai-chat-editor__surface{min-height:180px;overflow:auto;padding:12px;font-size:14px;line-height:1.55;color:#0f172a;outline:none;-webkit-user-select:text;user-select:text;flex:1;}' +
      '.ai-chat-editor__surface[contenteditable=true]:empty:before{content:attr(data-placeholder);color:#94a3b8;}' +
      '.ai-chat-template-surface{flex:1;min-height:0;height:100%;border:1px solid rgba(203,213,225,.9);border-radius:12px;background:#e2e8f0;overflow:hidden;}' +
      '.ai-chat-template-frame{width:100%;height:100%;border:none;background:#fff;}' +
      '.ai-chat-template-preview-wrap{border:1px solid rgba(203,213,225,.9);border-radius:12px;background:rgba(255,255,255,.75);padding:0 8px 8px;}' +
      '.ai-chat-template-preview-wrap summary{cursor:pointer;list-style:none;font-size:12px;font-weight:700;color:#334155;padding:8px 0;}' +
      '.ai-chat-template-preview-wrap summary::-webkit-details-marker{display:none;}' +
      '.ai-chat-template-editor-preview{margin-top:2px;border:1px solid rgba(203,213,225,.9);border-radius:10px;background:#fff;padding:10px;min-height:96px;max-height:160px;overflow:auto;font-size:13px;line-height:1.5;white-space:pre-wrap;}' +
      '.ai-chat-modal__ocr-hint{margin-top:4px;padding:6px 8px;border-radius:8px;background:rgba(239,246,255,.8);border:1px solid rgba(147,197,253,.55);font-size:11px;color:#1e3a8a;line-height:1.35;}' +
      '.ai-chat-modal__export-area--highlight{box-shadow:0 0 0 2px rgba(37,99,235,.18) inset;border-radius:10px;transition:box-shadow .2s ease;}' +
      '@keyframes ai-chat-spin{to{transform:rotate(360deg);}}' +
      '@media (max-width:860px){.ai-chat-modal{padding:6px;}.ai-chat-modal__panel{width:100%;height:100%;border-radius:12px;}.ai-chat-modal__settings{grid-template-columns:1fr;}.ai-chat-modal__top-bar{grid-template-columns:1fr;}.ai-chat-msg{max-width:92%;}.ai-chat-modal__composer{flex-wrap:wrap;}.ai-chat-modal__send{flex:1 1 47%;}.ai-chat-modal__export-btn{flex:1 1 48%;}.ai-chat-editor__toolbar{position:sticky;top:0;z-index:2;}.ai-chat-editor__select{flex:1;}.ai-chat-editor__surface{min-height:220px;font-size:16px;}.ai-chat-template-surface{min-height:220px;}}';
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

  function isImageLike(file) {
    var type = String(file && file.type || '').toLowerCase();
    var name = String(file && file.name || '').toLowerCase();
    return type.indexOf('image/') === 0 || /\.(jpg|jpeg|png|webp|gif|bmp|tiff|tif|heic|heif)$/i.test(name);
  }

  function isDocxLike(file) {
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    return type.indexOf('wordprocessingml.document') !== -1
      || /\.docx$/i.test(name)
      || /\.docm$/i.test(name);
  }

  function normalizeExternalFiles(files, source) {
    if (!Array.isArray(files)) {
      return [];
    }
    function resolveEntryUrl(entry) {
      if (!entry || typeof entry !== 'object') {
        return '';
      }
      var candidates = [
        entry.url,
        entry.fileUrl,
        entry.downloadUrl,
        entry.resolvedUrl,
        entry.previewUrl,
        entry.previewPdfUrl,
        entry.pdfUrl,
        entry.pdf
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var candidate = typeof candidates[i] === 'string' ? candidates[i].trim() : '';
        if (candidate) {
          return candidate;
        }
      }
      return '';
    }
    var seen = {};
    return files.map(function (entry, index) {
      if (!entry) {
        return null;
      }
      var resolvedUrl = resolveEntryUrl(entry);
      var dedupKey = [
        source,
        String(entry.name || '').toLowerCase().trim(),
        Number(entry.size || 0),
        resolvedUrl,
        String(entry.content || '').slice(0, 120)
      ].join('|');
      if (seen[dedupKey]) {
        return null;
      }
      seen[dedupKey] = true;
      return {
        id: source + '-' + index + '-' + Date.now(),
        name: entry.name ? String(entry.name) : 'Файл без названия',
        size: Number(entry.size || 0),
        type: entry.type ? String(entry.type) : '',
        content: typeof entry.content === 'string' ? entry.content : '',
        rawContent: typeof entry.content === 'string' ? entry.content : '',
        extracted: Boolean(entry.extracted || (typeof entry.content === 'string' && entry.content.trim() !== '')),
        extracting: false,
        extractError: null,
        url: resolvedUrl,
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
          rawContent: '',
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
        var available = !(entry && typeof entry === 'object' && entry.available === false);
        var reason = entry && typeof entry === 'object' ? String(entry.reason || '').trim() : '';
        var statusCode = entry && typeof entry === 'object' ? String(entry.statusCode || '').trim() : '';
        var isDefault = Boolean(entry && typeof entry === 'object' && entry.isDefault === true);
        var statusLabel = available ? '' : (' — недоступна' + (reason ? ' (' + reason + ')' : ''));
        var defaultLabel = isDefault ? ' ★ активная (.env)' : '';
        return { value: value, label: value + defaultLabel + statusLabel, available: available, reason: reason, statusCode: statusCode, isDefault: isDefault };
      })
      .filter(Boolean);
  }

  function pickFirstAvailableModel(models, fallback) {
    if (!Array.isArray(models) || !models.length) {
      return String(fallback || FALLBACK_MODEL_OPTIONS[0].value || EMPTY_AI_MODEL);
    }
    var firstAvailable = models.find(function (entry) { return entry && entry.available !== false; });
    var selected = firstAvailable || models[0];
    return String(selected && selected.value ? selected.value : (fallback || FALLBACK_MODEL_OPTIONS[0].value || EMPTY_AI_MODEL));
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
        return {
          models: normalizeModelList(payload.models),
          defaultModel: String(payload.defaultModel || '').trim()
        };
      })
      .catch(function () {
        return {
          models: FALLBACK_MODEL_OPTIONS.slice(),
          defaultModel: FALLBACK_MODEL_OPTIONS[0].value
        };
      });
  }

  function autoHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  function createMessage(role, text, isError) {
    var msg = createElement('div', 'ai-chat-msg ai-chat-msg--' + role + (isError ? ' ai-chat-msg--error' : ''));
    msg.textContent = String(text || '');
    return msg;
  }

  function sanitizeAssistantResponseText(text) {
    var value = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    value = value.replace(/<think[\s\S]*?<\/think>/gi, '');
    value = value.replace(/<\/?think>/gi, '');
    var lines = value.split('\n').filter(function (line) {
      var trimmed = String(line || '').trim();
      if (!trimmed) {
        return true;
      }
      if (/\(подпись\)/i.test(trimmed)) {
        return false;
      }
      if (/^(с\s+уважением[,!]?|подпись|иван\s+иванов|генеральный\s+директор|главный\s+инженер|реквизиты?|директор|исполнитель|контакты?)/i.test(trimmed)) {
        return false;
      }
      if (/^(тел|телефон|тел\.\/факс|e-?mail|унп|инн|кпп|огрн|бик|р\/с|расчетный\s+счет|корр\.?\s*счет|адрес|сайт)\b/i.test(trimmed)) {
        return false;
      }
      if (/\b\S+@\S+\.\S+\b/.test(trimmed)) {
        return false;
      }
      if (/^(сформируй|подготовь)\s+официальный\s+ответ/i.test(trimmed)) {
        return false;
      }
      return !/^решение\s*ии\s*:/i.test(trimmed)
        && !/^причина\s*:/i.test(trimmed)
        && !/^действия\s*:/i.test(trimmed);
    });
    var deduped = [];
    lines.forEach(function (line) {
      var normalized = String(line || '').trim();
      if (!normalized) {
        if (deduped.length && deduped[deduped.length - 1] !== '') {
          deduped.push('');
        }
        return;
      }
      if (deduped.length && String(deduped[deduped.length - 1] || '').trim() === normalized) {
        return;
      }
      deduped.push(line);
    });
    return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function hasDatesInResponse(responseText) {
    return /\b\d{2}\.\d{2}\.\d{4}\b/.test(String(responseText || ''));
  }

  function logAiError(error, details) {
    if (typeof console === 'undefined' || !console.error) {
      return;
    }
    console.error('[AI_MODAL_ERROR]', {
      message: error && error.message ? String(error.message) : 'unknown',
      code: error && error.code ? String(error.code) : '',
      details: details || {}
    });
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
      if (isDocxLike(file)) {
        extractDocxText(file).then(resolve).catch(function () {
          resolve('');
        });
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

  function ensureMammothLoaded() {
    if (mammothReadyPromise) {
      return mammothReadyPromise;
    }
    mammothReadyPromise = new Promise(function (resolve, reject) {
      if (typeof window === 'undefined') {
        reject(new Error('no_window'));
        return;
      }
      if (window.mammoth && typeof window.mammoth.extractRawText === 'function') {
        resolve(window.mammoth);
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
      script.async = true;
      script.onload = function () {
        if (window.mammoth && typeof window.mammoth.extractRawText === 'function') {
          resolve(window.mammoth);
        } else {
          reject(new Error('mammoth_missing'));
        }
      };
      script.onerror = function () {
        reject(new Error('mammoth_load_failed'));
      };
      document.head.appendChild(script);
    });
    return mammothReadyPromise;
  }

  function extractDocxText(file) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Promise.resolve('');
    }
    return Promise.all([ensureMammothLoaded(), file.arrayBuffer()])
      .then(function (results) {
        var mammoth = results[0];
        var buffer = results[1];
        return mammoth.extractRawText({ arrayBuffer: buffer });
      })
      .then(function (result) {
        var text = result && typeof result.value === 'string' ? result.value : '';
        text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        return text.slice(0, MAX_EXTRACT_CHARS);
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

    var preparedContext = prepareContextPayload(state, state.contextSettings);
    var extractedTexts = preparedContext.extractedTexts;

    context.selectedModel = state.model;
    context.responseStyle = state.responseStyle;
    context.aiBehavior = state.aiBehavior;
    context.ocrMode = state.ocrMode;
    context.contextDetail = state.contextDetail;
    context.generationParams = state.generationParams || { temperature: 0.7, top_p: 1, frequency_penalty: 0, presence_penalty: 0 };
    context.contextStats = preparedContext.stats;
    context.extractedTexts = extractedTexts;
    if (config.aiRuntime && typeof config.aiRuntime === 'object') {
      context.aiRuntime = {
        sanitizePrefixes: Array.isArray(config.aiRuntime.sanitizePrefixes) ? config.aiRuntime.sanitizePrefixes.slice(0, 20) : [],
        requirementTriggers: Array.isArray(config.aiRuntime.requirementTriggers) ? config.aiRuntime.requirementTriggers.slice(0, 20) : [],
        requirementStopPrefixes: Array.isArray(config.aiRuntime.requirementStopPrefixes) ? config.aiRuntime.requirementStopPrefixes.slice(0, 20) : []
      };
    }
    context.attachedFiles = state.files.map(function (file) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url || '',
        extracted: Boolean(file.extracted),
        extractError: file.extractError || null
      };
    });

    var generationParams = state.generationParams || {};
    var generationParameters = {
      temperature: Number(generationParams.temperature),
      top_p: Number(generationParams.top_p),
      frequency_penalty: Number(generationParams.frequency_penalty),
      presence_penalty: Number(generationParams.presence_penalty)
    };
    if (!Number.isFinite(generationParameters.temperature)) generationParameters.temperature = 0.7;
    if (!Number.isFinite(generationParameters.top_p)) generationParameters.top_p = 1;
    if (!Number.isFinite(generationParameters.frequency_penalty)) generationParameters.frequency_penalty = 0;
    if (!Number.isFinite(generationParameters.presence_penalty)) generationParameters.presence_penalty = 0;
    context.parameters = generationParameters;

    var formData = new FormData();
    formData.append('action', 'ai_response_analyze');
    formData.append('documentTitle', config.documentTitle || '');
    formData.append('prompt', userText);
    if (state.model) {
      formData.append('model', state.model);
    }
    formData.append('temperature', String(generationParameters.temperature));
    formData.append('top_p', String(generationParameters.top_p));
    formData.append('frequency_penalty', String(generationParameters.frequency_penalty));
    formData.append('presence_penalty', String(generationParameters.presence_penalty));
    formData.append('responseStyle', state.responseStyle);
    var behaviorText = String(state.aiBehavior || '').trim();
    if (behaviorText === DEFAULT_AI_BEHAVIOR.trim()) {
      behaviorText = '';
    }
    if (behaviorText.length > 10000) {
      behaviorText = behaviorText.slice(0, 10000);
    }
    formData.append('aiBehavior', behaviorText);
    var requestMode = resolveRequestMode(state);
    context.aiMode = requestMode;
    formData.append('mode', requestMode);
    formData.append('briefMode', state.contextDetail === 'brief' ? '1' : '0');
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



  function briefNormalizeValue(value) {
    return String(value || '').trim();
  }

  function briefToSummaryText(value) {
    return briefNormalizeValue(value) || '';
  }

  function readBriefFileAsText(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result || '')); };
      reader.onerror = function() { reject(new Error('Не удалось прочитать текст файла.')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function readBriefBlobAsDataUrl(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result || '')); };
      reader.onerror = function() { reject(new Error('Не удалось преобразовать файл в base64.')); };
      reader.readAsDataURL(blob);
    });
  }

  async function ensureBriefXlsxLoaded() {
    if (window.XLSX) return window.XLSX;
    await new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Не удалось загрузить XLSX библиотеку.')); };
      document.head.appendChild(script);
    });
    if (!window.XLSX) throw new Error('XLSX библиотека не инициализирована.');
    return window.XLSX;
  }

  async function buildBriefVisionPayloadFromFile(file, onProgress) {
    if (!(file instanceof File)) {
      throw new Error('Файл не выбран.');
    }
    var mime = String(file.type || '').toLowerCase();
    var name = String(file.name || 'document').toLowerCase();
    var isImage = mime === 'image/jpeg' || mime === 'image/png' || /\.(jpe?g|png)$/i.test(name);
    var isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    var isText = /\.(txt|json|csv|md)$/i.test(name);
    var isDocx = /\.docx$/i.test(name);
    var isXlsx = /\.xlsx$/i.test(name);

    if (isImage) {
      onProgress('Подготавливаю изображение...', 100);
      var imageDataUrl = await readBriefBlobAsDataUrl(file);
      return { kind: 'multimodal', messageText: 'Проанализируй содержимое этого файла', images: [{ dataUrl: imageDataUrl, fileName: file.name || 'image.jpg', mime: mime || 'image/jpeg' }] };
    }
    if (isPdf) {
      onProgress('Открываю PDF...', 5);
      var pdfjsLib = await ensurePdfJsLoaded();
      if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.js';
      }
      var bytes = await file.arrayBuffer();
      var loadingTask = pdfjsLib.getDocument({ data: bytes });
      var pdf = await loadingTask.promise;
      var totalPages = Number(pdf.numPages || 0);
      if (!totalPages) throw new Error('PDF повреждён или пустой.');
      var images = [];
      for (var pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        onProgress('Рендер страницы ' + pageNumber + '/' + totalPages + '...', Math.round((pageNumber / totalPages) * 90));
        var page = await pdf.getPage(pageNumber);
        var viewport = page.getViewport({ scale: 1.25 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Не удалось инициализировать canvas для PDF.');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        var blob = await new Promise(function(resolve) { canvas.toBlob(function(nextBlob) { resolve(nextBlob); }, 'image/jpeg', 0.82); });
        if (!blob) throw new Error('Ошибка конвертации PDF страницы в JPEG.');
        var dataUrl = await readBriefBlobAsDataUrl(blob);
        images.push({ dataUrl: dataUrl, fileName: (file.name || 'scan').replace(/\.pdf$/i, '') + '-p' + pageNumber + '.jpg', mime: 'image/jpeg' });
      }
      return { kind: 'multimodal', messageText: 'Проанализируй содержимое этого PDF', images: images };
    }
    if (isText) {
      onProgress('Читаю текстовый файл...', 100);
      var text = await readBriefFileAsText(file);
      return { kind: 'text', extractedText: text, fileName: file.name || 'text.txt' };
    }
    if (isDocx) {
      onProgress('Извлекаю текст из DOCX...', 35);
      var mammoth = await ensureMammothLoaded();
      var arrayBuffer = await file.arrayBuffer();
      var result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return { kind: 'text', extractedText: String(result && result.value || '').trim(), fileName: file.name || 'document.docx', warning: 'Изображения внутри DOCX не анализируются в Vision режиме.' };
    }
    if (isXlsx) {
      onProgress('Извлекаю таблицы из XLSX...', 35);
      var XLSX = await ensureBriefXlsxLoaded();
      var xbuffer = await file.arrayBuffer();
      var workbook = XLSX.read(xbuffer, { type: 'array' });
      var sheetTexts = (workbook && workbook.SheetNames || []).map(function(sheetName) {
        var sheet = workbook.Sheets[sheetName];
        var csv = XLSX.utils.sheet_to_csv(sheet);
        return '# Лист: ' + sheetName + '\\n' + csv;
      });
      return { kind: 'text', extractedText: sheetTexts.join('\\n\\n').trim(), fileName: file.name || 'table.xlsx' };
    }
    throw new Error('Формат не поддерживается. Поддерживаемые форматы: JPG, PNG, PDF, TXT, DOCX, XLSX');
  }

  async function postBriefGroqPaidWithFallback(createFormData) {
    var lastError = null;
    for (var index = 0; index < GROQ_PAID_ENDPOINTS.length; index += 1) {
      var endpoint = GROQ_PAID_ENDPOINTS[index];
      try {
        var response = await fetch(endpoint, { method: 'POST', credentials: 'include', body: createFormData() });
        if (response.status === 404 || response.status === 405) {
          continue;
        }
        var payload = await response.json().catch(function() { return null; });
        return { endpoint: endpoint, response: response, payload: payload };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Не удалось отправить файл в платный ИИ.');
  }

  async function requestBriefVisionByFile(source, setStatus) {
    var file = source && source.fileObject instanceof File ? source.fileObject : null;
    var fileName = briefNormalizeValue(source && source.label) || 'vision-file';
    var fileUrl = briefNormalizeValue(source && source.url);
    if (!file) {
      if (!fileUrl) throw new Error('Не найден файл для Vision режима.');
      setStatus('Загружаю файл...', 'loading');
      var response = await fetch(fileUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Не удалось загрузить файл (' + response.status + ').');
      var blob = await response.blob();
      file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    }

    var prepared = await buildBriefVisionPayloadFromFile(file, function(message) { setStatus(message, 'loading'); });
    var prompt = 'Сделай полный вывод по всему документу без потери важных деталей. Количество предложений выбирай по контексту.';

    if (prepared.kind === 'text') {
      var text = briefNormalizeValue(prepared.extractedText);
      if (!text) throw new Error('Не удалось извлечь текст из файла.');
      var textRequest = await postBriefGroqPaidWithFallback(function() {
        var formData = new FormData();
        formData.append('action', 'generate_summary');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prompt);
        formData.append('extractedTexts', JSON.stringify([{ name: prepared.fileName || fileName, type: file.type || 'text/plain', text: text.slice(0, 60000) }]));
        return formData;
      });
      var textPayload = textRequest && textRequest.payload;
      if (!textRequest.response.ok || !textPayload || textPayload.ok !== true) {
        throw new Error((textPayload && textPayload.error) || 'Ошибка запроса Vision режима.');
      }
      return { summary: briefToSummaryText(textPayload.summary || textPayload.response), model: textPayload.model, timeMs: textPayload.durationMs || textPayload.timeMs };
    }

    var images = Array.isArray(prepared.images) ? prepared.images : [];
    var imageBatches = chunkItems(images, 5);
    var partialAnswers = [];
    var startedAt = Date.now();

    for (var batchIndex = 0; batchIndex < imageBatches.length; batchIndex += 1) {
      var currentBatch = imageBatches[batchIndex];
      setStatus('Vision: анализ блока ' + (batchIndex + 1) + '/' + imageBatches.length + ' (' + currentBatch.length + ' стр.)...', 'loading');
      var request = await postBriefGroqPaidWithFallback(function() {
        var formData = new FormData();
        formData.append('action', 'analyze_paid');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prepared.messageText || 'Проанализируй содержимое этого файла');
        formData.append('vision_payload', JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 1000,
          temperature: 0.7,
          messages: [{ role: 'user', content: [{ type: 'text', text: (prepared.messageText || 'Проанализируй содержимое этого файла') + '\\n\\nБлок ' + (batchIndex + 1) + ' из ' + imageBatches.length + '.' }].concat(currentBatch.map(function(item) { return { type: 'image_url', image_url: { url: item.dataUrl } }; })) }]
        }));
        currentBatch.forEach(function(item, index) {
          var data = String(item.dataUrl || '');
          var base64 = data.indexOf(',') >= 0 ? data.split(',')[1] : data;
          var mimeType = item.mime || 'image/jpeg';
          var blob = new Blob([Uint8Array.from(atob(base64), function(ch) { return ch.charCodeAt(0); })], { type: mimeType });
          formData.append('files', blob, item.fileName || ('vision-' + (batchIndex + 1) + '-' + (index + 1) + '.jpg'));
        });
        return formData;
      });
      var payload = request && request.payload;
      if (!request.response.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || ('Ошибка Vision запроса (блок ' + (batchIndex + 1) + ').'));
      }
      partialAnswers.push(briefToSummaryText(payload.response || payload.summary));
    }

    var finalSummary = briefToSummaryText(partialAnswers.join('\\n\\n').trim());
    if (partialAnswers.length > 1) {
      setStatus('Vision: объединяю результаты всех блоков...', 'loading');
      var mergeRequest = await postBriefGroqPaidWithFallback(function() {
        var formData = new FormData();
        formData.append('action', 'generate_summary');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prompt);
        formData.append('extractedTexts', JSON.stringify([{ name: file.name || fileName, type: 'text/plain', text: partialAnswers.map(function(item, idx) { return 'Блок ' + (idx + 1) + '/' + partialAnswers.length + ':\\n' + item; }).join('\\n\\n') }]));
        return formData;
      });
      var mergePayload = mergeRequest && mergeRequest.payload;
      if (mergeRequest.response.ok && mergePayload && mergePayload.ok === true) {
        finalSummary = briefToSummaryText(mergePayload.summary || mergePayload.response) || finalSummary;
      }
    }
    if (!finalSummary) throw new Error('Vision не вернул итоговый текст.');
    return { summary: finalSummary, model: 'meta-llama/llama-4-scout-17b-16e-instruct', timeMs: Date.now() - startedAt };
  }

  function ensureBriefModalStyle() {
    if (document.getElementById('documents-brief-style-v4')) return;
    var style = document.createElement('style');
    style.id = 'documents-brief-style-v4';
    style.textContent = '.documents-brief-modal{position:fixed;inset:0;z-index:1700;background:linear-gradient(180deg, rgba(148,163,184,0.24), rgba(148,163,184,0.3));backdrop-filter:blur(12px);display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;}.documents-brief-panel{width:min(980px,100%);max-height:min(90vh,920px);background:linear-gradient(165deg, rgba(255,255,255,0.97), rgba(255,255,255,0.9));border:1px solid rgba(255,255,255,0.95);border-radius:24px;box-shadow:0 30px 60px rgba(15,23,42,0.2);display:flex;flex-direction:column;overflow:hidden;}.documents-brief-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid rgba(226,232,240,0.95);}.documents-brief-body{display:grid;grid-template-columns:minmax(260px,380px) minmax(0,1fr);gap:14px;padding:14px;min-height:0;flex:1;}.documents-brief-list{display:flex;flex-direction:column;gap:8px;overflow:auto;}.documents-brief-item{border:1px solid rgba(203,213,225,0.95);background:rgba(255,255,255,0.96);border-radius:14px;padding:11px 12px;text-align:left;}.documents-brief-item.is-active{border-color:rgba(37,99,235,0.52);background:rgba(239,246,255,0.96);}.documents-brief-preview{border:1px solid rgba(203,213,225,0.9);border-radius:18px;background:rgba(255,255,255,0.98);padding:16px;font-size:13px;line-height:1.58;color:#0f172a;white-space:pre-wrap;word-break:break-word;overflow:auto;}.documents-brief-toggle{display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:7px 10px;border:1px solid rgba(148,163,184,0.35);border-radius:12px;background:rgba(255,255,255,0.75);font-size:12px;color:#334155;font-weight:600;}@media (max-width:768px){.documents-brief-modal{padding:8px;align-items:flex-end;}.documents-brief-panel{width:100%;max-height:calc(100vh - 16px);border-radius:20px;}.documents-brief-body{grid-template-columns:1fr;padding:12px;}}';
    document.head.appendChild(style);
  }

  function openDocumentsAiBriefSummaryModal(config) {
    ensureBriefModalStyle();
    var options = config && typeof config === 'object' ? config : {};
    var linkedFiles = Array.isArray(options.linkedFiles) ? options.linkedFiles : [];
    var pendingFiles = Array.isArray(options.pendingFiles) ? options.pendingFiles : [];
    var showStatusMessage = typeof options.showMessage === 'function' ? options.showMessage : function() {};
    var modal = createElement('div', 'documents-brief-modal');
    var panel = createElement('div', 'documents-brief-panel');
    var header = createElement('div', 'documents-brief-header');
    var titleWrap = createElement('div', '');
    titleWrap.appendChild(createElement('div', 'documents-brief-title', 'Кратко ИИ'));
    titleWrap.appendChild(createElement('div', 'documents-brief-subtitle', 'Выберите файл для краткого вывода.'));
    var visionToggleWrap = createElement('label', 'documents-brief-toggle');
    var visionToggle = document.createElement('input');
    visionToggle.type = 'checkbox';
    visionToggle.checked = true;
    visionToggleWrap.appendChild(visionToggle);
    visionToggleWrap.appendChild(document.createTextNode('Vision (как ai-short_repsonse.js)'));
    titleWrap.appendChild(visionToggleWrap);
    var closeButton = createElement('button', 'documents-button documents-button--secondary', 'Закрыть');
    var body = createElement('div', 'documents-brief-body');
    var list = createElement('div', 'documents-brief-list');
    var preview = createElement('pre', 'documents-brief-preview', 'Выберите файл для анализа.');
    var metaCompact = createElement('div', 'documents-brief-item-meta', '');
    metaCompact.style.padding = '0 14px 8px';

    var sources = [];
    linkedFiles.forEach(function(file, index) { sources.push({ id: 'linked_' + index, label: file && file.name ? String(file.name) : ('Файл ' + (index + 1)), url: file && file.url ? String(file.url) : '' }); });
    pendingFiles.forEach(function(file, index) { sources.push({ id: 'pending_' + index, label: file && file.name ? String(file.name) : ('Новый файл ' + (index + 1)), fileObject: file }); });

    function makeActive(button) {
      Array.from(list.querySelectorAll('.documents-brief-item')).forEach(function(item) { item.classList.remove('is-active'); });
      button.classList.add('is-active');
    }

    sources.forEach(function(source) {
      var button = createElement('button', 'documents-brief-item');
      button.type = 'button';
      button.appendChild(createElement('span', 'documents-brief-item-name', source.label));
      button.appendChild(createElement('span', 'documents-brief-item-meta', source.fileObject ? 'Новый файл (локально)' : 'Файл из задачи'));
      button.addEventListener('click', function() {
        makeActive(button);
        button.disabled = true;
        preview.textContent = '⏳ Обрабатываю файл...';
        var startedAt = Date.now();
        var worker = visionToggle.checked
          ? requestBriefVisionByFile(source, function(message) { preview.textContent = message || '⏳ Обрабатываю файл...'; })
          : requestSummaryByAttachment(source, options.apiUrl);
        worker.then(function(aiPayload) {
          var summaryText = String(aiPayload && aiPayload.summary ? aiPayload.summary : '').trim();
          preview.textContent = summaryText || 'Пустой ответ от ИИ.';
          var elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          metaCompact.textContent = 'Модель: ' + String(aiPayload && aiPayload.model ? aiPayload.model : '—') + ' • Время: ' + elapsed + ' сек';
        }).catch(function(error) {
          preview.textContent = 'Ошибка: ' + (error && error.message ? error.message : 'неизвестная ошибка');
          metaCompact.textContent = '';
          showStatusMessage('warning', 'Не удалось обработать файл «' + source.label + '».');
        }).finally(function() { button.disabled = false; });
      });
      list.appendChild(button);
    });

    function requestSummaryByAttachment(source, apiUrl) {
      return (async function() {
        var fileForSummary = null;
        var sourceLabel = source && source.label ? String(source.label) : 'Файл';
        if (source && source.fileObject instanceof File) {
          fileForSummary = source.fileObject;
        } else if (source && source.url) {
          var fetched = await fetch(String(source.url), { credentials: 'same-origin' });
          if (fetched.ok) {
            var blob = await fetched.blob();
            fileForSummary = new File([blob], sourceLabel || 'brief-file', { type: blob.type || 'application/octet-stream' });
          }
        }
        if (!(fileForSummary instanceof File)) throw new Error('Не удалось подготовить файл для краткого вывода.');
        var endpoint = String(apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php');
        var formData = new FormData();
        formData.append('mode', 'paid');
        formData.append('attachment', fileForSummary, fileForSummary.name || sourceLabel);
        var response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', body: formData });
        var payload = await response.json().catch(function() { return null; });
        if (!response.ok || !payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : ('Ошибка ИИ (' + response.status + ')'));
        return payload;
      })();
    }

    if (!sources.length) list.appendChild(createElement('div', 'documents-responses-empty', 'Нет файлов для анализа.'));
    closeButton.type = 'button';
    closeButton.addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(event) { if (event.target === modal) modal.remove(); });

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
  function openDocumentsAiResponseModal(options) {
    ensureStyles();

    var config = options && typeof options === 'object' ? options : {};
    var previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    var state = {
      files: []
        .concat(normalizeFileObjects(config.pendingFiles || []))
        .concat(normalizeExternalFiles(config.files || [], 'external'))
        .concat(normalizeExternalFiles(config.linkedFiles || [], 'linked')),
      models: FALLBACK_MODEL_OPTIONS.slice(),
      model: FALLBACK_MODEL_OPTIONS[0].value,
      aiMode: 'free',
      visionMode: false,
      responseStyle: STYLE_OPTIONS[0].value,
      aiBehavior: typeof config.aiBehavior === 'string' && config.aiBehavior.trim()
        ? config.aiBehavior.trim()
        : DEFAULT_AI_BEHAVIOR,
      contextDetail: config.contextDetail === 'brief' ? 'brief' : 'detailed',
      contextSettings: buildContextSettings(config),
      ocrMode: (typeof config.ocrMode === 'string' && OCR_MODE_OPTIONS.some(function (opt) { return opt.value === config.ocrMode; }))
        ? config.ocrMode
        : 'raw',
      generationParams: {
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      },
      isLoading: false,
      lastAssistantMessage: '',
      templateDraft: '',
      templateFile: null,
      lastErrorFingerprint: '',
      lastErrorTs: 0
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
    var filesHint = createElement('div', 'ai-chat-modal__empty', 'Можно прикрепить несколько файлов: ИИ учтёт общий контекст всех файлов.');
    var attachButton = createElement('button', 'ai-chat-modal__attach', '+ Прикрепить файл');
    var extractAllButton = createElement('button', 'ai-chat-modal__attach', '📚 Прочитать все файлы');
    attachButton.type = 'button';
    attachButton.style.marginTop = '4px';
    extractAllButton.type = 'button';
    extractAllButton.style.marginTop = '4px';

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
    var modeField = createElement('label', 'ai-chat-modal__field');
    modeField.appendChild(createElement('span', '', 'Режим ИИ'));
    var modeSelect = createElement('select', 'ai-chat-modal__select');
    AI_MODE_OPTIONS.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      modeSelect.appendChild(option);
    });
    if (state.contextDetail === 'brief') {
      state.aiMode = 'paid';
    }
    modeSelect.value = state.aiMode;
    var visionField = createElement('label', 'ai-chat-modal__field');
    visionField.appendChild(createElement('span', '', 'Vision'));
    var visionCheckbox = document.createElement('input');
    visionCheckbox.type = 'checkbox';
    visionCheckbox.className = 'ai-chat-modal__select';
    visionCheckbox.style.height = '40px';
    visionCheckbox.style.width = '100%';
    visionCheckbox.style.accentColor = '#2563eb';
    visionField.appendChild(visionCheckbox);

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
    function appendAssistantErrorOnce(text) {
      var normalized = String(text || '').trim();
      if (!normalized) {
        return;
      }
      var fingerprint = normalized.toLowerCase();
      var now = Date.now();
      if (state.lastErrorFingerprint === fingerprint && (now - state.lastErrorTs) < 15000) {
        return;
      }
      state.lastErrorFingerprint = fingerprint;
      state.lastErrorTs = now;
      messages.appendChild(createMessage('assistant', normalized, true));
    }
    messages.appendChild(createMessage('assistant', 'Привет! Напишите запрос — я подготовлю ответ.'));

    var composer = createElement('div', 'ai-chat-modal__composer');
    var textarea = createElement('textarea', 'ai-chat-modal__textarea');
    textarea.placeholder = 'Введите запрос (можно пусто — отправим текст вложений)';
    var sendButton = createElement('button', 'ai-chat-modal__send', 'Отправить в ИИ');
    sendButton.type = 'button';
    var templateButton = createElement('button', 'ai-chat-modal__send ai-chat-modal__template-btn', 'Шаблон');
    templateButton.type = 'button';
    var contextUsageHint = createElement('div', 'ai-chat-modal__empty', 'Текст к отправке: 0 символов');
    contextUsageHint.style.margin = '6px 0 0';
    contextUsageHint.style.fontSize = '11px';
    contextUsageHint.style.textAlign = 'left';

    function normalizeEditorHtml(rawHtml, fallbackText) {
      var html = String(rawHtml || '').trim();
      if (!html && fallbackText) {
        html = '<p>' + escapeHtml(String(fallbackText || '')).replace(/\n/g, '<br>') + '</p>';
      }
      return sanitizeHtml(html);
    }

    function readEditorHtml(editorLike, fallbackText) {
      if (editorLike && typeof editorLike.getHTML === 'function') {
        try {
          return normalizeEditorHtml(editorLike.getHTML(), fallbackText);
        } catch (error) {
          return normalizeEditorHtml('', fallbackText);
        }
      }
      return normalizeEditorHtml('', fallbackText);
    }

    function exportDocument(format, editorHtml, answerText) {
      var preparedHtml = normalizeEditorHtml(editorHtml, answerText);
      if (!preparedHtml) {
        alert('Нет текста для экспорта. Сначала получите ответ от ИИ.');
        return;
      }
      var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
      var formData = new FormData();
      formData.append('action', 'generate_document');
      formData.append('format', format);
      formData.append('html', preparedHtml);
      formData.append('documentTitle', config.documentTitle || '');
      if (state.templateFile && state.templateFile.fileObject) {
        formData.append('templateFile', state.templateFile.fileObject, state.templateFile.fileObject.name || 'template.docx');
      }

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
    var contextDetailField = createElement('label', 'ai-chat-modal__field');
    contextDetailField.appendChild(createElement('span', '', 'Передача контекста'));
    var contextDetailSelect = createElement('select', 'ai-chat-modal__select');
    CONTEXT_DETAIL_OPTIONS.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      contextDetailSelect.appendChild(option);
    });
    contextDetailSelect.value = state.contextDetail;
    contextDetailField.appendChild(contextDetailSelect);
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
    aiSettingsModal.content.appendChild(contextDetailField);
    aiSettingsModal.content.appendChild(settingsInput);
    aiSettingsModal.content.appendChild(settingsActions);

    var editModal = createOverlayModal('Редактировать ответ ИИ');
    var editInfo = createElement('div', 'ai-chat-modal__empty', '');
    editInfo.style.fontSize = '12px';
    editInfo.style.marginBottom = '6px';
    var editEditor = createRichEditor('Отредактируйте ответ перед экспортом...');
    var editActions = createElement('div', 'ai-chat-modal__export-buttons');
    var editApply = createElement('button', 'ai-chat-modal__send', 'Обновить');
    var editDocx = createElement('button', 'ai-chat-modal__export-btn', 'Скачать DOCX');
    var editPdf = createElement('button', 'ai-chat-modal__export-btn', 'Скачать PDF');
    var editCopy = createElement('button', 'ai-chat-modal__export-btn', 'Копировать в буфер');
    [editApply, editDocx, editPdf, editCopy].forEach(function (btn) { btn.type = 'button'; editActions.appendChild(btn); });
    editModal.content.appendChild(editInfo);
    editModal.content.appendChild(editEditor.root);
    editModal.content.appendChild(editActions);

    var templateModal = createOverlayModal('Шаблон документа');
    templateModal.overlay.style.padding = '0';
    templateModal.overlay.style.alignItems = 'stretch';
    templateModal.overlay.style.justifyContent = 'stretch';
    var templatePanel = templateModal.content.parentNode;
    templatePanel.style.width = '100vw';
    templatePanel.style.height = '100vh';
    templatePanel.style.maxWidth = '100vw';
    templatePanel.style.maxHeight = '100vh';
    templatePanel.style.borderRadius = '0';
    templateModal.content.style.height = '100%';
    templateModal.content.style.minHeight = '0';
    templateModal.content.style.padding = '8px';
    var templatePreviewModal = createOverlayModal('Предпросмотр шаблона');
    templatePreviewModal.overlay.style.padding = '0';
    templatePreviewModal.overlay.style.alignItems = 'stretch';
    templatePreviewModal.overlay.style.justifyContent = 'stretch';
    var templatePreviewPanel = templatePreviewModal.content.parentNode;
    templatePreviewPanel.style.width = '100vw';
    templatePreviewPanel.style.height = '100vh';
    templatePreviewPanel.style.maxWidth = '100vw';
    templatePreviewPanel.style.maxHeight = '100vh';
    templatePreviewPanel.style.borderRadius = '0';
    templatePreviewModal.content.style.height = '100%';
    templatePreviewModal.content.style.minHeight = '0';
    templatePreviewModal.content.style.padding = '0';
    var templatePreviewFrameFull = document.createElement('iframe');
    templatePreviewFrameFull.className = 'ai-chat-template-frame';
    templatePreviewFrameFull.title = 'Полный предпросмотр DOCX шаблона';
    templatePreviewFrameFull.style.height = '100%';
    templatePreviewModal.content.appendChild(templatePreviewFrameFull);

    var templateViewer = createElement('div', 'ai-chat-template-viewer');
    var templateInfo = createElement('div', 'ai-chat-modal__empty', 'Загрузка шаблонов...');
    var templateTopActions = createElement('div', 'ai-chat-template-actions');
    var templateUploadButton = createElement('button', 'ai-chat-modal__send', 'Открыть мой шаблон DOCX');
    var insertAiTextButton = createElement('button', 'ai-chat-modal__export-btn', 'Вставить текст ИИ');
    var fullPreviewButton = createElement('button', 'ai-chat-modal__export-btn', 'Полный предпросмотр');
    var templateMarkerInput = createElement('input', 'ai-chat-modal__input');
    var templateFileMeta = createElement('div', 'ai-chat-template-file-meta', 'Шаблон: по умолчанию');
    var templateFileInput = document.createElement('input');
    templateUploadButton.type = 'button';
    insertAiTextButton.type = 'button';
    fullPreviewButton.type = 'button';
    templateMarkerInput.type = 'text';
    templateMarkerInput.value = 'Текст';
    templateMarkerInput.style.display = 'none';
    templateFileInput.type = 'file';
    templateFileInput.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    templateFileInput.style.display = 'none';
    templateTopActions.appendChild(templateUploadButton);
    templateTopActions.appendChild(insertAiTextButton);
    templateTopActions.appendChild(fullPreviewButton);
    templateTopActions.appendChild(templateFileMeta);
    templateTopActions.appendChild(templateMarkerInput);
    templateTopActions.appendChild(templateFileInput);
    var templateTabs = createElement('div', 'ai-chat-template-tabs');
    var templateDocxTab = createElement('button', 'ai-chat-modal__send', 'DOCX');
    var templatePdfTab = createElement('button', 'ai-chat-modal__export-btn', 'PDF');
    templateDocxTab.type = 'button';
    templatePdfTab.type = 'button';
    templateTabs.appendChild(templateDocxTab);
    templateTabs.appendChild(templatePdfTab);
    templateTabs.hidden = true;
    var templateEditor = createElement('div', 'ai-chat-template-editor');
    var templateEditorInstance = createRichEditor('Вставьте или напишите текст для шаблона...', { fullHeight: true });
    var templateActions = createElement('div', 'ai-chat-editor__toolbar');
    var applyTemplateTextButton = createElement('button', 'ai-chat-editor__btn ai-chat-editor__btn--primary', 'Применить');
    var exportMenu = createElement('details', 'ai-chat-editor__menu');
    var exportSummary = document.createElement('summary');
    exportSummary.textContent = 'Экспорт';
    var exportPanel = createElement('div', 'ai-chat-editor__menu-panel');
    var downloadDocxFromTemplateButton = createElement('button', 'ai-chat-modal__export-btn', 'Скачать DOCX');
    var downloadPdfFromTemplateButton = createElement('button', 'ai-chat-modal__export-btn', 'Скачать PDF');
    applyTemplateTextButton.type = 'button';
    downloadDocxFromTemplateButton.type = 'button';
    downloadPdfFromTemplateButton.type = 'button';
    exportPanel.appendChild(downloadDocxFromTemplateButton);
    exportPanel.appendChild(downloadPdfFromTemplateButton);
    exportMenu.appendChild(exportSummary);
    exportMenu.appendChild(exportPanel);
    templateActions.appendChild(applyTemplateTextButton);
    templateActions.appendChild(exportMenu);
    templateEditor.appendChild(templateActions);
    templateEditor.appendChild(templateEditorInstance.root);

    var templateSurfaceWrap = createElement('details', 'ai-chat-template-preview-wrap');
    var templateSurfaceSummary = document.createElement('summary');
    templateSurfaceSummary.textContent = 'Просмотр шаблона';
    var templateSurface = createElement('div', 'ai-chat-template-surface');
    var templateDocxFrame = document.createElement('iframe');
    templateDocxFrame.className = 'ai-chat-template-frame';
    templateDocxFrame.title = 'Просмотр DOCX шаблона';
    var templatePdfFrame = document.createElement('iframe');
    templatePdfFrame.className = 'ai-chat-template-frame';
    templatePdfFrame.title = 'Просмотр PDF шаблона';
    templatePdfFrame.hidden = true;
    templateSurface.appendChild(templateDocxFrame);
    templateSurface.appendChild(templatePdfFrame);
    templateSurfaceWrap.appendChild(templateSurfaceSummary);
    templateSurfaceWrap.appendChild(templateSurface);
    templateSurfaceWrap.hidden = true;

    var templatePreviewWrap = createElement('details', 'ai-chat-template-preview-wrap');
    var templatePreviewSummary = document.createElement('summary');
    templatePreviewSummary.textContent = 'Предпросмотр текста';
    var templatePreview = createElement('div', 'ai-chat-template-editor-preview', 'Текст для вставки появится здесь.');
    templatePreviewWrap.appendChild(templatePreviewSummary);
    templatePreviewWrap.appendChild(templatePreview);
    templatePreviewWrap.hidden = true;

    templateViewer.appendChild(templateInfo);
    templateViewer.appendChild(templateTopActions);
    templateViewer.appendChild(templateTabs);
    templateViewer.appendChild(templateEditor);
    templateViewer.appendChild(templateSurfaceWrap);
    templateViewer.appendChild(templatePreviewWrap);
    templateModal.content.appendChild(templateViewer);

    var templateState = {
      activeTab: 'docx',
      docxLoaded: false,
      pdfLoaded: false,
      docxUrl: '',
      pdfUrl: '',
      editedText: '',
      customTemplateObjectUrl: ''
    };
    window.templateEditorInstance = templateEditorInstance;
    var templateDocxCandidates = [
      config.templateDocxUrl,
      '/js/documents/app/templates/template.docx',
      '/app/templates/template.docx',
      '/templates/template.docx',
      '/template.docx'
    ].filter(Boolean);
    var templatePdfCandidates = [
      config.templatePdfUrl,
      '/js/documents/app/templates/template.pdf',
      '/app/templates/template.pdf',
      '/templates/template.pdf',
      '/template.pdf'
    ].filter(Boolean);

    function textToSimpleHtml(text) {
      return escapeHtml(String(text || '')).replace(/\n/g, '<br>');
    }

    function htmlToPlainText(value) {
      var container = document.createElement('div');
      container.innerHTML = sanitizeHtml(value || '');
      return String(container.textContent || container.innerText || '').trim();
    }

    function createRichEditor(placeholderText, options) {
      var settings = options && typeof options === 'object' ? options : {};
      var wrapper = createElement('div', 'ai-chat-editor');
      if (settings.fullHeight) {
        wrapper.className += ' ai-chat-editor--full';
      }
      var toolbar = createElement('div', 'ai-chat-editor__toolbar');
      var surface = createElement('div', 'ai-chat-editor__surface');
      var savedRange = null;
      surface.contentEditable = 'true';
      surface.setAttribute('data-placeholder', String(placeholderText || 'Введите текст...'));

      function isRangeInsideSurface(range) {
        return !!(range && range.commonAncestorContainer && surface.contains(range.commonAncestorContainer));
      }

      function saveCurrentRange() {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || !selection.rangeCount) {
          return;
        }
        var range = selection.getRangeAt(0);
        if (isRangeInsideSurface(range)) {
          savedRange = range.cloneRange();
        }
      }

      function restoreRange() {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection) {
          return null;
        }
        if (savedRange && isRangeInsideSurface(savedRange)) {
          selection.removeAllRanges();
          selection.addRange(savedRange);
          return selection.getRangeAt(0);
        }
        var fallbackRange = document.createRange();
        fallbackRange.selectNodeContents(surface);
        fallbackRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(fallbackRange);
        savedRange = fallbackRange.cloneRange();
        return fallbackRange;
      }

      function placeCaretInside(node) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection) {
          return;
        }
        var range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        savedRange = range.cloneRange();
      }

      function applyInlineFormat(tagName) {
        var range = restoreRange();
        if (!range) {
          return;
        }
        var node = document.createElement(tagName);
        if (range.collapsed) {
          node.appendChild(document.createTextNode('​'));
          range.insertNode(node);
          placeCaretInside(node);
          return;
        }
        var content = range.extractContents();
        node.appendChild(content);
        range.insertNode(node);
        placeCaretInside(node);
      }

      function insertPlainText(text) {
        var safeText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        var range = restoreRange();
        if (!range) {
          return;
        }
        range.deleteContents();
        var fragment = document.createDocumentFragment();
        var lines = safeText.split('\n');
        lines.forEach(function (line, index) {
          if (index > 0) {
            fragment.appendChild(document.createElement('br'));
          }
          if (line.length) {
            fragment.appendChild(document.createTextNode(line));
          }
        });
        if (!lines.length) {
          fragment.appendChild(document.createTextNode(''));
        }
        range.insertNode(fragment);
        range.collapse(false);
        var selection = window.getSelection ? window.getSelection() : null;
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        savedRange = range.cloneRange();
      }

      function applyListFormat(listTag) {
        var range = restoreRange();
        if (!range) {
          return;
        }
        var list = document.createElement(listTag);
        var selectedText = String(range.toString() || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        var lines = selectedText ? selectedText.split('\n').map(function (line) { return line.trim(); }).filter(Boolean) : [];
        if (!lines.length) {
          lines = [''];
        }
        lines.forEach(function (line) {
          var li = document.createElement('li');
          li.textContent = line;
          list.appendChild(li);
        });
        range.deleteContents();
        range.insertNode(list);
        placeCaretInside(list.lastChild || list);
      }

      ['mouseup', 'keyup', 'touchend', 'input', 'focus'].forEach(function (eventName) {
        surface.addEventListener(eventName, saveCurrentRange);
      });

      surface.addEventListener('paste', function (event) {
        event.preventDefault();
        var clipboard = event.clipboardData || window.clipboardData;
        var text = clipboard && clipboard.getData ? clipboard.getData('text/plain') : '';
        insertPlainText(text);
      });

      var commandSelect = createElement('select', 'ai-chat-editor__select');
      [
        { value: '', label: 'Форматирование…' },
        { value: 'bold', label: 'Жирный' },
        { value: 'italic', label: 'Курсив' },
        { value: 'underline', label: 'Подчеркнутый' },
        { value: 'insertUnorderedList', label: 'Маркированный список' },
        { value: 'insertOrderedList', label: 'Нумерованный список' }
      ].forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        commandSelect.appendChild(option);
      });
      commandSelect.addEventListener('change', function () {
        if (!commandSelect.value) {
          return;
        }
        surface.focus();
        if (commandSelect.value === 'bold') {
          applyInlineFormat('strong');
        } else if (commandSelect.value === 'italic') {
          applyInlineFormat('em');
        } else if (commandSelect.value === 'underline') {
          applyInlineFormat('u');
        } else if (commandSelect.value === 'insertUnorderedList') {
          applyListFormat('ul');
        } else if (commandSelect.value === 'insertOrderedList') {
          applyListFormat('ol');
        }
        commandSelect.value = '';
      });
      toolbar.appendChild(commandSelect);

      var menu = createElement('details', 'ai-chat-editor__menu');
      var summary = document.createElement('summary');
      summary.textContent = 'Меню';
      var menuPanel = createElement('div', 'ai-chat-editor__menu-panel');
      var clearBtn = createElement('button', 'ai-chat-editor__btn', 'Очистить');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', function () {
        surface.innerHTML = '';
        menu.removeAttribute('open');
      });
      menuPanel.appendChild(clearBtn);
      menu.appendChild(summary);
      menu.appendChild(menuPanel);
      toolbar.appendChild(menu);

      wrapper.appendChild(toolbar);
      wrapper.appendChild(surface);
      return {
        root: wrapper,
        surface: surface,
        getHTML: function () {
          return String(surface.innerHTML || '').trim();
        },
        getText: function () {
          return htmlToPlainText(surface.innerHTML || '');
        },
        setHTML: function (html) {
          surface.innerHTML = sanitizeHtml(String(html || '').trim());
        },
        setText: function (text) {
          surface.innerHTML = sanitizeHtml(textToSimpleHtml(text || ''));
        }
      };
    }

    function absoluteUrl(rawUrl) {
      try {
        return new URL(String(rawUrl || ''), window.location.origin).href;
      } catch (error) {
        return String(rawUrl || '');
      }
    }

    async function resolveFirstAvailableTemplateUrl(candidates) {
      var list = Array.isArray(candidates) ? candidates.slice() : [];
      for (var i = 0; i < list.length; i += 1) {
        var url = String(list[i] || '').trim();
        if (!url) {
          continue;
        }
        try {
          var response = await fetch(url, { credentials: 'same-origin' });
          if (response && response.ok) {
            return url;
          }
        } catch (error) {
          // следующий путь
        }
      }
      return '';
    }

    function setTemplateTab(tabName) {
      templateState.activeTab = tabName === 'pdf' ? 'pdf' : 'docx';
      var isDocx = templateState.activeTab === 'docx';
      templateDocxFrame.hidden = !isDocx;
      templatePdfFrame.hidden = isDocx;
      templateDocxTab.className = isDocx ? 'ai-chat-modal__send' : 'ai-chat-modal__export-btn';
      templatePdfTab.className = isDocx ? 'ai-chat-modal__export-btn' : 'ai-chat-modal__send';
    }

    async function loadTemplateDocx() {
      if (templateState.docxLoaded) {
        return;
      }
      if (!templateState.docxUrl) {
        templateState.docxUrl = await resolveFirstAvailableTemplateUrl(templateDocxCandidates);
      }
      if (!templateState.docxUrl) {
        templateInfo.textContent = 'Ошибка DOCX: не найден путь к template.docx';
        return;
      }
      var srcAbsolute = absoluteUrl(templateState.docxUrl);
      templateDocxFrame.src = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(srcAbsolute);
      templateInfo.textContent = 'Шаблон загружен. Ответ ИИ будет вставлен в поле «Текст».';
      if (!templateState.customTemplateObjectUrl) {
        templateFileMeta.textContent = 'Шаблон: по умолчанию';
      }
      templateState.docxLoaded = true;
    }

    async function loadTemplatePdf() {
      if (templateState.pdfLoaded) {
        return;
      }
      if (!templateState.pdfUrl) {
        templateState.pdfUrl = await resolveFirstAvailableTemplateUrl(templatePdfCandidates);
      }
      if (!templateState.pdfUrl) {
        templateInfo.textContent = 'Ошибка PDF: не найден путь к template.pdf';
        return;
      }
      templatePdfFrame.src = templateState.pdfUrl;
      templateInfo.textContent = 'PDF загружен: ' + templateState.pdfUrl;
      templateState.pdfLoaded = true;
    }

    async function exportEditedText(format, buttonEl) {
      var fallbackText = String(templateState.editedText || '').trim();
      var structuredHtml = readEditorHtml(window.templateEditorInstance || window.editor, fallbackText);
      if (!structuredHtml) {
        templateInfo.textContent = 'Введите текст перед скачиванием.';
        return;
      }
      var previousText = buttonEl.textContent;
      buttonEl.disabled = true;
      buttonEl.textContent = 'Генерация...';
      try {
        var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
        var markerValue = String(templateMarkerInput.value || '{{AI_RESPONSE}}').trim() || '{{AI_RESPONSE}}';
        var formData = new FormData();
        formData.append('action', 'generate_from_html');
        formData.append('format', format);
        formData.append('html', structuredHtml);
        formData.append('documentTitle', config.documentTitle || 'template');
        formData.append('placeholders', JSON.stringify([markerValue, '{{AI_RESPONSE}}', '[AI_RESPONSE]', '{AI_RESPONSE}', '[[AI_RESPONSE]]']));
        if (state.templateFile && state.templateFile.fileObject) {
          formData.append('templateFile', state.templateFile.fileObject, state.templateFile.fileObject.name || 'template.docx');
        }
        var response = await fetch(apiUrl, {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });
        if (!response.ok) {
          throw new Error('Ошибка экспорта (' + response.status + ')');
        }
        var blob = await response.blob();
        var downloadUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'template.' + format;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        templateInfo.textContent = 'Ошибка экспорта: ' + (error && error.message ? error.message : 'неизвестно');
      } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = previousText;
      }
    }

    applyTemplateTextButton.addEventListener('click', function () {
      templateState.editedText = String(templateEditorInstance.getText() || '').trim();
      if (!templateState.editedText) {
        templatePreview.textContent = 'Текст для вставки появится здесь.';
        templateInfo.textContent = 'Введите текст для вставки.';
        return;
      }
      templatePreview.innerHTML = normalizeEditorHtml(templateEditorInstance.getHTML(), templateState.editedText);
      templateInfo.textContent = 'Текст обновлён. Можно скачать DOCX или PDF.';
    });
    templateUploadButton.addEventListener('click', function () {
      templateFileInput.click();
    });
    fullPreviewButton.addEventListener('click', async function () {
      await loadTemplateDocx();
      if (templateDocxFrame && templateDocxFrame.src) {
        templatePreviewFrameFull.src = templateDocxFrame.src;
      }
      openOverlay(templatePreviewModal);
    });
    templateFileInput.addEventListener('change', function (event) {
      var selectedFile = event && event.target && event.target.files ? event.target.files[0] : null;
      if (!selectedFile) {
        return;
      }
      if (templateState.customTemplateObjectUrl) {
        URL.revokeObjectURL(templateState.customTemplateObjectUrl);
        templateState.customTemplateObjectUrl = '';
      }
      templateState.customTemplateObjectUrl = URL.createObjectURL(selectedFile);
      templateState.docxUrl = templateState.customTemplateObjectUrl;
      templateState.docxLoaded = false;
      state.templateFile = { fileObject: selectedFile, name: selectedFile.name || 'template.docx' };
      templateFileMeta.textContent = 'Шаблон: ' + (selectedFile.name || 'template.docx');
      setTemplateTab('docx');
      loadTemplateDocx();
      templateInfo.textContent = 'Шаблон открыт. Ответ ИИ будет вставлен в поле «Текст».';
      templateFileInput.value = '';
    });
    insertAiTextButton.addEventListener('click', function () {
      var aiText = String(state.lastAssistantMessage || '').trim();
      if (!aiText) {
        templateInfo.textContent = 'Сначала получите ответ от ИИ, затем нажмите «Вставить текст ИИ».';
        return;
      }
      templateEditorInstance.setText(aiText);
      templateState.editedText = aiText;
      templatePreview.innerHTML = normalizeEditorHtml(templateEditorInstance.getHTML(), aiText);
      templateInfo.textContent = 'Текст ИИ вставлен в редактор. Нажмите «Применить» или сразу экспортируйте.';
    });
    templateEditorInstance.surface.addEventListener('input', function () {
      templateState.editedText = String(templateEditorInstance.getText() || '');
      templatePreview.innerHTML = normalizeEditorHtml(templateEditorInstance.getHTML(), templateState.editedText);
    });
    downloadDocxFromTemplateButton.addEventListener('click', function () {
      exportEditedText('docx', downloadDocxFromTemplateButton);
    });
    downloadPdfFromTemplateButton.addEventListener('click', function () {
      exportEditedText('pdf', downloadPdfFromTemplateButton);
    });
    function openOverlay(modalRef) {
      document.body.appendChild(modalRef.overlay);
      requestAnimationFrame(function () { modalRef.overlay.classList.add('ai-chat-modal--visible'); });
    }






    function resanitizeFileContents() {
      state.files.forEach(function (file) {
        if (!file) {
          return;
        }
        var sourceText = String(file.rawContent || file.content || '').trim();
        if (!sourceText) {
          return;
        }
        file.ocrDiagnostics = {};
        file.content = filterOcrArtifacts(sourceText, state.ocrMode, file.ocrDiagnostics);
        file.extracted = Boolean(file.content);
      });
      updateOcrHint();
      renderFiles();
    }

    function updateOcrHint() {
      return;
    }

    function renderModelOptions() {
      modelSelect.textContent = '';
      state.models.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        option.disabled = opt.available === false && String(opt.value || '').trim() !== '';
        modelSelect.appendChild(option);
      });
      modelSelect.value = state.model;
    }

    function renderFiles() {
      filesWrap.textContent = '';
      if (!state.files.length) {
        filesWrap.appendChild(createElement('div', 'ai-chat-modal__empty', 'Нет прикреплённых файлов'));
        updateContextUsageHint();
        return;
      }
      state.files.forEach(function (file) {
        var chip = createElement('div', 'ai-chat-chip');
        var ocrStatus = file.extracting
          ? '⏳ Текст'
          : (file.extracted ? '✅ Текст' : (file.extractError ? '⚠️ Текст' : '⭕ Текст'));
        var icon = createElement('span', '', detectIcon(file));
        var name = createElement('span', '', String(file.name || 'Файл'));
        var size = createElement('span', 'ai-chat-chip__meta', formatSize(file.size));
        var status = createElement('span', 'ai-chat-chip__meta', ocrStatus);
        chip.appendChild(icon);
        chip.appendChild(name);
        chip.appendChild(size);
        chip.appendChild(status);

        var ocr = createElement('button', 'ai-chat-chip__remove', file.extracted ? '↻ Текст' : '📄 Текст');
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
      updateContextUsageHint();
    }

    function updateContextUsageHint() {
      if (!contextUsageHint) {
        return;
      }
      var prepared = prepareContextPayload(state, state.contextSettings);
      var stats = prepared.stats || {};
      contextUsageHint.textContent = 'Текст к отправке: ' + String(stats.preparedChars || 0)
        + ' символов • режим: ' + (stats.mode === 'brief' ? 'кратко' : 'подробно')
        + ' • файлов: ' + String(stats.filesUsed || 0)
        + (stats.truncatedFiles ? (' • сжато: ' + String(stats.truncatedFiles)) : '');
    }

    function updateFileStatusInUI() {
      renderFiles();
    }

    function refreshSendButtonLabel() {
      var requestMode = resolveRequestMode(state);
      if (requestMode === 'paid' && state.visionMode) {
        sendButton.textContent = 'Vision анализ';
        return;
      }
      sendButton.textContent = requestMode === 'paid' ? 'Получить ответ' : 'Отправить в ИИ';
    }

    function setLoading(loading) {
      state.isLoading = loading;
      textarea.disabled = loading;
      sendButton.disabled = loading;
      templateButton.disabled = loading;
      visionCheckbox.disabled = loading;
      if (loading) {
        sendButton.innerHTML = '<span class="ai-chat-spinner"></span>Отправка';
      } else {
        refreshSendButtonLabel();
      }
    }

    async function extractSingleFile(fileEntry, options) {
      var opts = options && typeof options === 'object' ? options : {};
      if (!fileEntry || fileEntry.extracting) {
        return false;
      }
      var fileLabel = fileEntry.name || 'файл';
      fileEntry.extracting = true;
      fileEntry.extractError = null;
      updateFileStatusInUI();

      try {
        var extractedText = '';
        if (fileEntry.fileObject) {
          extractedText = await fileToText(fileEntry.fileObject);
          if (hasUsefulExtractedText(extractedText)) {
            if (!opts.silent) {
              messages.appendChild(createMessage('assistant', 'Текст из ' + fileLabel + ':\n' + String(extractedText || '')));
            }
          } else {
            extractedText = '';
          }
        } else if (fileEntry.url && (isTextLike(fileEntry) || isPdfLike(fileEntry))) {
          extractedText = await fetchExternalFileContent(fileEntry);
          if (hasUsefulExtractedText(extractedText)) {
            if (!opts.silent) {
              messages.appendChild(createMessage('assistant', 'Текст из ' + fileLabel + ':\n' + String(extractedText || '')));
            }
          } else {
            extractedText = '';
          }
        }
        if (!hasUsefulExtractedText(extractedText)) {
          var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/api-docs.php';
          var request = await postDocsAiWithFallback(function () {
            var formData = new FormData();
            formData.append('action', 'ocr_extract');
            formData.append('language', 'rus');
            if (fileEntry.fileObject) {
              var uploadName = String(fileLabel || (fileEntry.fileObject && fileEntry.fileObject.name) || 'document').trim() || 'document';
              if (!/\.[a-z0-9]{2,8}$/i.test(uploadName)) {
                var fileType = String(fileEntry.fileObject && fileEntry.fileObject.type || '').toLowerCase();
                if (fileType.indexOf('pdf') >= 0) uploadName += '.pdf';
                else if (fileType.indexOf('jpeg') >= 0 || fileType.indexOf('jpg') >= 0) uploadName += '.jpg';
                else if (fileType.indexOf('png') >= 0) uploadName += '.png';
                else if (fileType.indexOf('webp') >= 0) uploadName += '.webp';
              }
              formData.append('file', fileEntry.fileObject, uploadName);
            } else if (fileEntry.url) {
              formData.append('file_url', String(fileEntry.url));
            } else {
              throw new Error('Файл недоступен для чтения');
            }
            return formData;
          }, apiUrl, 'OCR');
          var response = request && request.response;
          var payload = request && request.payload;
          if (!response) {
            throw new Error('Сервис извлечения текста временно недоступен.');
          }
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(payload && payload.error ? payload.error : ('Ошибка извлечения текста (' + response.status + ')'));
          }
          extractedText = String(payload.text || '');
          if (!extractedText) {
            throw new Error('Сервис извлечения не вернул текст. Проверьте качество файла.');
          }
          if (!opts.silent) {
            messages.appendChild(createMessage('assistant', 'Текст из ' + fileLabel + ':\n' + extractedText));
          }
        }

        fileEntry.rawContent = String(extractedText || '');
        fileEntry.ocrDiagnostics = {};
        fileEntry.content = filterOcrArtifacts(fileEntry.rawContent, state.ocrMode, fileEntry.ocrDiagnostics);
        fileEntry.extracted = fileEntry.content !== '';
        fileEntry.extractError = fileEntry.extracted ? null : 'Пустой результат';
        resanitizeFileContents();
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
      var combinedParts = [];
      for (var i = 0; i < list.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await extractSingleFile(list[i], { silent: true });
        if (list[i] && hasUsefulExtractedText(list[i].content)) {
          combinedParts.push('Файл: ' + (list[i].name || 'Без названия') + '\n' + String(list[i].content || ''));
        }
      }
      if (combinedParts.length) {
        messages.appendChild(createMessage('assistant', 'Объединённый контекст из файлов:\n\n' + combinedParts.join('\n\n====================\n\n')));
        messages.scrollTop = messages.scrollHeight;
      }
      setLoading(false);
    }

    function closeModal() {
      document.removeEventListener('keydown', onEsc);
      clearRetryCountdown();
      hiddenInput.value = '';
      if (templateState && templateState.customTemplateObjectUrl) {
        URL.revokeObjectURL(templateState.customTemplateObjectUrl);
        templateState.customTemplateObjectUrl = '';
      }
      document.body.style.overflow = previousBodyOverflow;
      closeWithAnimation(root);
    }

    function onEsc(event) {
      if (event.key === 'Escape') {
        closeModal();
      }
    }

    var retryCountdownTimer = null;
    function clearRetryCountdown() {
      if (retryCountdownTimer) {
        clearInterval(retryCountdownTimer);
        retryCountdownTimer = null;
      }
    }
    function showRetryCountdown(seconds) {
      var remaining = Math.max(1, Number(seconds || 1));
      var countdownMessage = createMessage('assistant', 'До бесплатной попытки осталось: ' + remaining + ' сек.', true);
      messages.appendChild(countdownMessage);
      messages.scrollTop = messages.scrollHeight;
      clearRetryCountdown();
      retryCountdownTimer = setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) {
          clearRetryCountdown();
          countdownMessage.textContent = 'Можно отправить повторно.';
          return;
        }
        countdownMessage.textContent = 'До бесплатной попытки осталось: ' + remaining + ' сек.';
      }, 1000);
    }


    async function sendMessage() {
      var value = String(textarea.value || '').trim();
      if (state.isLoading) {
        return;
      }
      var requestMode = resolveRequestMode(state);
      var isVisionPaid = requestMode === 'paid' && Boolean(state.visionMode);
      var hasFileContent = state.files.some(function (file) {
        return file && typeof file.content === 'string' && file.content.trim() !== '';
      });
      if (!value && !hasFileContent && !isVisionPaid) {
        messages.appendChild(createMessage('assistant', 'Добавьте текст запроса или извлеките текст из файла.', true));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      var effectivePrompt = value || 'Подготовь официальный ответ по тексту вложений в деловом стиле.';

      state.model = modelSelect.value;
      var selectedModel = state.models.find(function (entry) { return entry.value === state.model; });
      if (selectedModel && selectedModel.available === false) {
        state.model = pickFirstAvailableModel(state.models, state.model);
        modelSelect.value = state.model;
        appendAssistantErrorOnce('Выбранная модель недоступна. Переключил на: ' + state.model + '.');
      }
      state.responseStyle = styleSelect.value;
      state.aiBehavior = String(settingsInput.value || '').trim();

      messages.appendChild(createMessage('user', effectivePrompt));
      var pending = createElement('div', 'ai-chat-msg ai-chat-msg--assistant');
      pending.innerHTML = '<span class="ai-chat-spinner"></span>Готовим ответ...';
      messages.appendChild(pending);
      messages.scrollTop = messages.scrollHeight;
      setLoading(true);
      var requestStartedAt = Date.now();

      try {
        if (!isVisionPaid) {
          var pendingOcrFiles = state.files.filter(function (file) {
            return file && !hasUsefulExtractedText(file.content);
          });
          for (var i = 0; i < pendingOcrFiles.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await extractSingleFile(pendingOcrFiles[i], { silent: true });
          }
          await hydrateFileContents(state);
          var missingContextFiles = state.files.filter(function (file) {
            return file && !hasUsefulExtractedText(file.content);
          });
          if (state.files.length && missingContextFiles.length) {
            var missingNames = missingContextFiles
              .slice(0, 4)
              .map(function (file) { return file && file.name ? file.name : 'Файл'; })
              .join(', ');
            var suffix = missingContextFiles.length > 4 ? ' и ещё ' + String(missingContextFiles.length - 4) : '';
            throw new Error('Не удалось извлечь текст из всех файлов. Проблемные: ' + missingNames + suffix + '. Нажмите «📄 Текст» и повторите.');
          }
        }
        var timeoutMs = calculateAiTimeoutMs(effectivePrompt, state);
        var response = null;
        if (requestMode === 'paid') {
          response = await postGroqPaidWithFallback(effectivePrompt, state, config, timeoutMs);
        } else {
          var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
          response = await fetchWithTimeout(apiUrl + '?action=ai_response_analyze', {
            method: 'POST',
            credentials: 'same-origin',
            body: buildRequestBlueprint(effectivePrompt, state, config)
          }, timeoutMs);
        }

        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true) {
          var retryAfterSeconds = Math.max(5, Number(payload && (payload.retryAfterSeconds || payload.retryAfter) || response.headers.get('Retry-After')) || 0);
          var errorMessage = payload && payload.error ? payload.error : ('Ошибка API (' + response.status + ')');
          if (response.status === 429) {
            var modelName = String(payload && payload.model ? payload.model : (state.model || 'неизвестно'));
            var fallbackHint = (payload && Array.isArray(payload.availableModels) && payload.availableModels.length)
              ? ' Доступна смена модели в списке.'
              : '';
            errorMessage = 'Слишком много запросов (429). Подождите ' + (retryAfterSeconds || 30) + ' сек и повторите. Модель: ' + modelName + '.' + fallbackHint;
          }
          var apiError = new Error(errorMessage);
          if (payload && payload.code) {
            apiError.code = String(payload.code);
          }
          if (response.status === 429) {
            apiError.code = apiError.code || 'RATE_LIMITED';
            apiError.model = String(payload && payload.model ? payload.model : (state.model || 'неизвестно'));
            apiError.retryAfter = retryAfterSeconds || 30;
          } else if (retryAfterSeconds > 0) {
            apiError.retryAfter = retryAfterSeconds;
          }
          if (payload && Array.isArray(payload.availableModels)) {
            apiError.availableModels = payload.availableModels.slice(0, 6);
          }
          if (response.status >= 500 || response.status === 408) {
            apiError.code = apiError.code || 'AI_TEMPORARY';
          }
          throw apiError;
        }

        pending.remove();
        var finalResponse = payload.response || payload.analysis || 'Пустой ответ от API.';
        finalResponse = cleanNumericArtifacts(String(finalResponse || ''))
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        finalResponse = sanitizeAssistantResponseText(finalResponse);
        if (!hasDatesInResponse(finalResponse)) {
          appendAssistantErrorOnce('В ответе нет даты в формате ДД.ММ.ГГГГ. Уточните срок в следующем сообщении.');
        }
        messages.appendChild(createMessage('assistant', finalResponse));
        var responseMode = String(payload && payload.mode ? payload.mode : (state.contextDetail === 'brief' ? 'paid' : state.aiMode));
        var responseTime = Number(payload && payload.timeMs) > 0 ? Number(payload.timeMs) : (Date.now() - requestStartedAt);
        var responseTokens = Number(payload && payload.tokensUsed) > 0 ? Number(payload.tokensUsed) : 0;
        messages.appendChild(createMessage('assistant', 'ℹ️ Режим: ' + (responseMode === 'paid' ? 'VIP' : 'Free') + ' • Модель: ' + String(payload && payload.model ? payload.model : state.model || '—') + ' • Время: ' + responseTime + ' мс • Токены: ' + (responseTokens || '—')));
        state.lastAssistantMessage = String(finalResponse || '');
        textarea.value = '';
        autoHeight(textarea);
      } catch (error) {
        logAiError(error, { model: state.model, responseStyle: state.responseStyle });
        if (error && (error.code === 'AI_TIMEOUT' || error.code === 'NETWORK_ERROR' || error.code === 'AI_TEMPORARY')) {
          pending.innerHTML = '<span class="ai-chat-spinner"></span>Готовим ответ... повторная попытка';
          await new Promise(function (resolve) { setTimeout(resolve, AI_SOFT_RETRY_DELAY_MS); });
          try {
            var secondMode = resolveRequestMode(state);
            var secondResponse = null;
            if (secondMode === 'paid') {
              secondResponse = await postGroqPaidWithFallback(effectivePrompt, state, config, calculateAiTimeoutMs(effectivePrompt, state));
            } else {
              secondResponse = await fetchWithTimeout((config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php') + '?action=ai_response_analyze', {
                method: 'POST',
                credentials: 'same-origin',
                body: buildRequestBlueprint(effectivePrompt, state, config)
              }, calculateAiTimeoutMs(effectivePrompt, state));
            }
            var secondPayload = await secondResponse.json();
            if (!secondResponse.ok || !secondPayload || secondPayload.ok !== true) {
              throw error;
            }
            pending.remove();
            var retryText = sanitizeAssistantResponseText(cleanNumericArtifacts(String(secondPayload.response || secondPayload.analysis || '')).trim());
            messages.appendChild(createMessage('assistant', retryText || 'Пустой ответ от API.'));
            var retryMode = String(secondPayload && secondPayload.mode ? secondPayload.mode : (state.contextDetail === 'brief' ? 'paid' : state.aiMode));
            var retryTime = Number(secondPayload && secondPayload.timeMs) > 0 ? Number(secondPayload.timeMs) : (Date.now() - requestStartedAt);
            var retryTokens = Number(secondPayload && secondPayload.tokensUsed) > 0 ? Number(secondPayload.tokensUsed) : 0;
            messages.appendChild(createMessage('assistant', 'ℹ️ Режим: ' + (retryMode === 'paid' ? 'VIP' : 'Free') + ' • Модель: ' + String(secondPayload && secondPayload.model ? secondPayload.model : state.model || '—') + ' • Время: ' + retryTime + ' мс • Токены: ' + (retryTokens || '—')));
            state.lastAssistantMessage = String(retryText || '');
            textarea.value = '';
            autoHeight(textarea);
            setLoading(false);
            messages.scrollTop = messages.scrollHeight;
            return;
          } catch (_) {}
        }
        pending.remove();
        if (error && Number(error.retryAfter) > 0) {
          showRetryCountdown(Number(error.retryAfter));
        }
        if (error && Array.isArray(error.availableModels) && error.availableModels.length) {
          state.models = normalizeModelList(error.availableModels);
          renderModelOptions();
          if (!state.models.some(function (entry) { return entry.value === state.model && entry.available !== false; })) {
            state.model = pickFirstAvailableModel(state.models, state.model);
            modelSelect.value = state.model;
            appendAssistantErrorOnce('Часть моделей недоступна. Автоматически переключил на: ' + state.model + '.');
          } else {
            modelSelect.value = state.model;
            appendAssistantErrorOnce('Часть моделей временно недоступна. Список обновлён автоматически.');
          }
        } else {
          appendAssistantErrorOnce('Ошибка: ' + humanizeAiError(error));
        }
      } finally {
        setLoading(false);
        messages.scrollTop = messages.scrollHeight;
      }
    }

    modelSelect.addEventListener('change', function () {
      state.model = modelSelect.value;
      var selectedModel = state.models.find(function (entry) { return entry.value === state.model; });
      if (selectedModel && selectedModel.available === false) {
        appendAssistantErrorOnce('Модель ' + state.model + ' сейчас нерабочая' + (selectedModel.reason ? ': ' + selectedModel.reason : '') + '.');
        state.model = pickFirstAvailableModel(state.models, state.model);
        modelSelect.value = state.model;
      }
    });

    styleSelect.addEventListener('change', function () {
      state.responseStyle = styleSelect.value;
    });
    modeSelect.addEventListener('change', function () {
      state.aiMode = modeSelect.value === 'paid' ? 'paid' : 'free';
      if (state.aiMode !== 'paid' && state.visionMode) {
        state.visionMode = false;
        visionCheckbox.checked = false;
      }
      if (state.contextDetail === 'brief' && state.aiMode !== 'paid') {
        appendAssistantErrorOnce('Режим «Кратко» работает через VIP модель.');
      }
      refreshSendButtonLabel();
    });
    visionCheckbox.addEventListener('change', function () {
      state.visionMode = Boolean(visionCheckbox.checked);
      if (state.visionMode) {
        state.aiMode = 'paid';
        modeSelect.value = 'paid';
        appendAssistantErrorOnce('Vision активирован: анализ изображений/PDF пойдёт через VIP ИИ.');
      }
      refreshSendButtonLabel();
    });
    contextDetailSelect.addEventListener('change', function () {
      state.contextDetail = contextDetailSelect.value === 'brief' ? 'brief' : 'detailed';
      if (state.contextDetail === 'brief') {
        state.aiMode = 'paid';
        modeSelect.value = 'paid';
      }
      updateContextUsageHint();
      refreshSendButtonLabel();
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
      resanitizeFileContents();
      aiSettingsModal.close();
    });

    templateButton.addEventListener('click', async function () {
      setTemplateTab('docx');
      openOverlay(templateModal);
      await loadTemplateDocx();
      await loadTemplatePdf();
    });
    templateDocxTab.addEventListener('click', function () {
      setTemplateTab('docx');
    });
    templatePdfTab.addEventListener('click', function () {
      setTemplateTab('pdf');
      loadTemplatePdf();
    });

    editApply.addEventListener('click', function () {
      var next = String(editEditor.getText() || '').trim();
      if (!next) {
        alert('Введите текст для обновления.');
        return;
      }
      state.lastAssistantMessage = next;
      var assistantMessages = Array.from(messages.querySelectorAll('.ai-chat-msg--assistant:not(.ai-chat-msg--error)'));
      if (assistantMessages.length > 0) {
        assistantMessages[assistantMessages.length - 1].textContent = next;
      } else {
        messages.appendChild(createMessage('assistant', next));
      }
      editModal.close();
    });
    editDocx.addEventListener('click', function () {
      var rawText = String(editEditor.getText() || '').trim();
      exportDocument('docx', normalizeEditorHtml(editEditor.getHTML(), rawText), rawText);
    });
    editPdf.addEventListener('click', function () {
      var rawText = String(editEditor.getText() || '').trim();
      exportDocument('pdf', normalizeEditorHtml(editEditor.getHTML(), rawText), rawText);
    });
    editCopy.addEventListener('click', function () {
      var text = String(editEditor.getText() || '').trim();
      if (!text) {
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    });

    attachButton.addEventListener('click', function () {
      hiddenInput.click();
    });
    extractAllButton.addEventListener('click', function () {
      autoExtractFiles(state.files);
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
      if (event.target === root) {
        closeModal();
      }
    });

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    filesBox.appendChild(filesWrap);
    filesBox.appendChild(filesHint);
    filesBox.appendChild(contextUsageHint);
    filesBox.appendChild(attachButton);
    filesBox.appendChild(extractAllButton);

    modelField.appendChild(modelSelect);
    modeField.appendChild(modeSelect);
    styleField.appendChild(styleSelect);
    topBar.appendChild(filesBox);
    topBar.appendChild(modeField);
    topBar.appendChild(visionField);
    topBar.appendChild(modelField);
    topBar.appendChild(styleField);
    topBar.appendChild(settingsButton);

    composer.appendChild(textarea);
    composer.appendChild(sendButton);
    composer.appendChild(templateButton);

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
    resanitizeFileContents();
    renderModelOptions();
    refreshSendButtonLabel();

    fetchModels(config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php').then(function (modelsPayload) {
      var models = modelsPayload && Array.isArray(modelsPayload.models)
        ? modelsPayload.models
        : normalizeModelList(modelsPayload);
      var defaultModelFromEnv = String(modelsPayload && modelsPayload.defaultModel || '').trim();
      state.models = models;
      if (defaultModelFromEnv && models.some(function (entry) { return entry.value === defaultModelFromEnv && entry.available !== false; })) {
        state.model = defaultModelFromEnv;
      } else if (!models.some(function (entry) { return entry.value === state.model && entry.available !== false; })) {
        state.model = pickFirstAvailableModel(models, state.model);
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
    window.openDocumentsAiBriefSummaryModal = openDocumentsAiBriefSummaryModal;
  }
})();
