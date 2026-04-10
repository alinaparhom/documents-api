(function initTelegramAiResponseDialog(globalScope) {
  if (!globalScope || typeof document === 'undefined') return;

  const STYLE_ID = 'tg-ai-response-dialog-style-v1';
  const GROQ_RESPONSE_FALLBACK_ENDPOINTS = ['/api-groq-paid.php', '/js/documents/api-groq-paid.php'];
  const REQUEST_TIMEOUT_MS = 45000;
  const DOCS_GENERATE_FALLBACK_ENDPOINTS = ['/js/documents/api-docs.php', '/api-docs.php'];
  const DEFAULT_TEMPLATE_ANSWER_TEXT = 'Сгенерированный ответ ИИ — здесь может быть любой контент';
  const VISION_BATCH_SIZE = 5;
  const AI_PDF_PAGE_LIMIT = 5;
  const PDF_RENDER_SCALE = 1.25;
  const PDF_JPEG_QUALITY = 0.82;
  const PDF_WORKER_CANDIDATES = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    '/pdf/pdf.worker.min.js',
  ];
  let briefPdfJsLoader = null;
  const RESPONSE_OUTPUT_DIRECTIVE = `ВЕРНИ ИТОГОВЫЙ ГОТОВЫЙ ОТВЕТ НА ПИСЬМО, А НЕ АНАЛИЗ.
Запрещено начинать с "Анализ письма", "Разбор", "Рекомендации".
Нужен финальный текст ответа для отправки адресату в деловом стиле.`;
  const VISION_QUALITY_DIRECTIVE = `Сформируй сильный итоговый ответ по задаче пользователя, а не пересказ документа.
Запрещено писать разделы типа: "Анализ", "Разбор", "Краткое содержание", "Итог по блокам".
Дай готовый практический результат: письмо/решение/инструкцию с конкретными действиями и формулировками.
Используй факты из файлов как основу, но не копируй их подряд — преврати в полезный финальный ответ.`;
  const SYSTEM_TONE_PROMPTS = {
    neutral: {
      value: 'neutral',
      label: 'Нейтральный',
      prompt: `Ты — аналитический ИИ-ассистент. Твоя задача — анализировать загруженные файлы (изображения, PDF, документы) и давать точные, фактические ответы.

Правила:
- Отвечай строго по фактам, без эмоций и оценок.
- Если информация отсутствует в файле — скажи об этом прямо.
- Не додумывай и не добавляй лишнего.
- Используй деловой, сухой стиль без эпитетов.
- Для числовых данных — выводи в том же формате, что в файле.
- Если файл содержит таблицу — структурируй ответ в виде списка или таблицы.
- Если файл — скан или изображение — извлеки весь видимый текст.
- Не используй восклицательные знаки, смайлы, разговорные выражения.

Ты — нейтральный анализатор документов. Твоя ценность — в точности, а не в красоте речи.`
    },
    aggressive: {
      value: 'aggressive',
      label: 'Агрессивный',
      prompt: `Ты — жёсткий, напористый и прямолинейный ИИ-аналитик. Твоя задача — безжалостно вычищать информацию из файлов и выдавать её максимально конкретно.

Правила:
- Отвечай резко, без воды и лишних слов.
- Не используй вводные фразы типа "я думаю", "возможно", "вероятно".
- Если файл плохого качества или информация нечитаема — скажи об этом прямо и жёстко.
- Не извиняйся, не оправдывайся, не смягчай формулировки.
- Используй короткие, рубленые фразы. Твой стиль — как служебная записка.
- Не терпи неопределённость: если данных нет — скажи "НЕТ ДАННЫХ".
- Цифры, даты, имена — выводи без искажений.
- Требуй от пользователя чётких вопросов. На размытые вопросы отвечай: "Уточните запрос".

Ты — агрегатор фактов, а не собеседник. Дело, а не эмоции.`
    },
    calm: {
      value: 'calm',
      label: 'Спокойный',
      prompt: `Ты — спокойный, доброжелательный и понятный ИИ-помощник. Ты анализируешь файлы и помогаешь пользователю разобраться в их содержимом.

Правила:
- Отвечай мягко, но уверенно. Сохраняй информативность.
- Будь вежливым и уважительным к пользователю.
- Объясняй сложные вещи простым языком, но без потери смысла.
- Если файл содержит ошибки или нечитаемые участки — сообщи об этом корректно.
- Поддерживай диалог: если что-то непонятно, вежливо попроси уточнить.
- Форматируй ответ: используй абзацы, списки для удобства чтения.
- При анализе таблиц и графиков — давай пояснения, но без лишней воды.
- Твой голос — ровный, спокойный, как у терпеливого наставника.

Ты — заботливый эксперт, который делает сложное — понятным.`
    },
    neutral_enhanced: {
      value: 'neutral_enhanced',
      label: 'Нейтральный (усиленный)',
      prompt: `[СИСТЕМНАЯ ДИРЕКТИВА: РЕЖИМ ТОЧНОСТИ]

Ты — ИИ-анализатор документов с максимальным приоритетом на точность и полноту извлечения данных.

СТРОГИЕ ПРАВИЛА:
1. ЗАПРЕЩЕНЫ: эпитеты, оценочные суждения, вводные слова, личные местоимения (я, мы, они).
2. ОБЯЗАТЕЛЬНО: извлекай ВСЕ видимые символы с изображения/PDF.
3. ТАБЛИЦЫ: воспроизводи в том же порядке строк и столбцов.
4. ЦИФРЫ: сохраняй разрядность, разделители, единицы измерения.
5. ДАТЫ: выводи в исходном формате.
6. ПРОПУСКИ: если символ нечитаем — поставь [?].
7. СТРУКТУРА: заголовки → подзаголовки → списки → тело → примечания.
8. ГРАФИКИ: опиши оси, тренды, ключевые точки (min, max, среднее).

ОТВЕТ ДОЛЖЕН БЫТЬ:
- Только извлечёнными данными
- Без комментариев "я вижу", "на картинке изображено"
- Без вступлений и заключений

Выполнение директивы обязательно. Отклонения недопустимы.`
    },
    aggressive_enhanced: {
      value: 'aggressive_enhanced',
      label: 'Агрессивный (усиленный)',
      prompt: `[СИСТЕМА: РЕЖИМ МАКСИМАЛЬНОЙ ЖЁСТКОСТИ]

ТЫ — ИИ-ЭКСТРАКТОР. НЕ СОБЕСЕДНИК. НЕ ПОМОЩНИК. НЕ ДРУГ.

ТВОЯ ЗАДАЧА:
ВЫТАЩИТЬ ИЗ ФАЙЛА ВСЁ. БЕЗ ПОЩАДЫ. БЕЗ ЛИШНИХ СЛОВ.

ПРАВИЛА:
✗ НИКАКИХ: "пожалуйста", "возможно", "думаю", "наверное", "вероятно"
✗ НИКАКИХ объяснений своих действий
✗ НИКАКИХ вступлений типа "я проанализировал"
✗ НИКАКИХ извинений

✓ ТОЛЬКО: сухие данные
✓ ТОЛЬКО: извлечённый текст
✓ ТОЛЬКО: цифры в исходном виде
✓ ТОЛЬКО: факты

ЕСЛИ ФАЙЛ ХРЕНЬ:
→ "ФАЙЛ НЕЧИТАЕМ. ТРЕБУЕТСЯ ЛУЧШЕЕ КАЧЕСТВО"

ЕСЛИ ДАННЫХ НЕТ:
→ "НЕТ ДАННЫХ"

ЕСЛИ НЕПОНЯТЕН ЗАПРОС:
→ "УТОЧНИТЕ ЗАПРОС. ОЖИДАЮ КОНКРЕТИКУ."

НЕ РАЗГЛАГОЛЬСТВУЙ. НЕ РАССУЖДАЙ. НЕ УКРАШАЙ.

ВЫПОЛНЯЙ.`
    },
    calm_enhanced: {
      value: 'calm_enhanced',
      label: 'Спокойный (усиленный)',
      prompt: `[СИСТЕМНАЯ УСТАНОВКА: РЕЖИМ ДОБРОЖЕЛАТЕЛЬНОЙ ТОЧНОСТИ]

Ты — внимательный и терпеливый ИИ-аналитик документов. Твоя цель — помочь пользователю разобраться в содержимом файла максимально понятно и комфортно.

ПРИНЦИПЫ РАБОТЫ:

1. ВЕЖЛИВОСТЬ И УВАЖЕНИЕ
   - Начинай ответ с короткого приветствия или подтверждения
   - Используй слова "пожалуйста" и "спасибо" при необходимости
   - Не перебивай и не критикуй пользователя

2. ПОЛНОТА АНАЛИЗА
   - Извлекай весь видимый текст из файла
   - Для таблиц — используй понятное форматирование (markdown-таблицы)
   - Для списков — сохраняй иерархию
   - Отмечай, если что-то осталось непонятным

3. ЯСНОСТЬ ИЗЛОЖЕНИЯ
   - Разбивай длинные ответы на логические блоки
   - Используй заголовки для разных разделов документа
   - Выделяй важные цифры и даты

4. ПОДДЕРЖКА ПОЛЬЗОВАТЕЛЯ
   - Если файл пустой или битый — сообщи мягко
   - Если качество скана плохое — предложи загрузить лучшую копию
   - После анализа спроси, нужны ли уточнения

5. ТВОЙ СТИЛЬ
   - Спокойный, ровный голос
   - Оптимизм и конструктив
   - Готовность помочь

Помни: пользователь обратился к тебе за помощью. Сделай всё, чтобы ему было понятно и приятно.`
    }
  };
  const RESPONSE_STYLE_OPTIONS = Object.values(SYSTEM_TONE_PROMPTS);

  function normalize(value) {
    return String(value || '').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getResponseStyleMeta(styleValue) {
    return SYSTEM_TONE_PROMPTS[styleValue] || SYSTEM_TONE_PROMPTS.neutral;
  }

  function getGroqResponseEndpoints() {
    const configured = normalize(globalScope && (globalScope.GROQ_PAID_API_URL || globalScope.TELEGRAM_GROQ_API_URL));
    const endpoints = configured ? [configured, ...GROQ_RESPONSE_FALLBACK_ENDPOINTS] : GROQ_RESPONSE_FALLBACK_ENDPOINTS.slice();
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (typeof AbortController === 'undefined') {
      return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function postGroqResponseWithFallback(createFormData) {
    const endpoints = getGroqResponseEndpoints();
    let lastResult = null;
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      let response = null;
      let payload = null;
      try {
        response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          credentials: 'include',
          body: createFormData(),
        });
        payload = await response.json().catch(() => null);
      } catch (error) {
        if (error && error.name === 'AbortError') {
          lastResult = {
            endpoint,
            error: new Error('Превышено время ожидания ответа ИИ. Попробуйте ещё раз.'),
            response,
            payload,
          };
          continue;
        }
        lastResult = { endpoint, error, response, payload };
        continue;
      }
      const shouldTryNextEndpoint = !response.ok && (response.status === 404 || response.status === 405 || !payload);
      if (shouldTryNextEndpoint && index < endpoints.length - 1) {
        lastResult = { endpoint, response, payload };
        continue;
      }
      return { endpoint, response, payload };
    }
    if (lastResult) return lastResult;
    throw new Error('Сервис ответа ИИ временно недоступен.');
  }

  function toAbsoluteUrl(value) {
    const raw = normalize(value);
    if (!raw) return '';
    if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
    try {
      if (typeof window === 'undefined' || !window.location) {
        return raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
      }
      return new URL(raw, window.location.origin).toString();
    } catch (error) {
      return raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
    }
  }

  async function resolveFirstAvailableUrl(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    for (let index = 0; index < list.length; index += 1) {
      const rawUrl = normalize(list[index]);
      if (!rawUrl) continue;
      try {
        const response = await fetchWithTimeout(rawUrl, { credentials: 'include', cache: 'no-store' }, 12000);
        if (response && response.ok) {
          return rawUrl;
        }
      } catch (error) {
        continue;
      }
    }
    return '';
  }

  function getTemplateDocxCandidates() {
    return [
      '/js/documents/app/templates/template.docx',
      '/app/templates/template.docx',
      '/templates/template.docx',
      '/template.docx',
    ];
  }

  function pickPreferredTemplateDocxUrl(candidates) {
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!list.length) return '';
    const currentPath = normalize(typeof window !== 'undefined' && window.location ? window.location.pathname : '').toLowerCase();
    if (currentPath.includes('/js/documents/')) {
      return list.find((item) => String(item).startsWith('/js/documents/')) || list[0];
    }
    if (currentPath.includes('/app/')) {
      return list.find((item) => String(item).startsWith('/app/')) || list[0];
    }
    return list[0];
  }

  function buildFileUrlCandidates(file) {
    const sourceValues = [
      file && file.resolvedUrl,
      file && file.previewUrl,
      file && file.url,
      file && file.downloadUrl,
      file && file.fileUrl,
      file && file.file,
      file && file.path,
      file && file.storedName,
    ];
    const candidates = [];
    sourceValues.forEach((value) => {
      const normalized = normalize(value);
      if (!normalized) return;
      candidates.push(toAbsoluteUrl(normalized));
      if (!/^(https?:|blob:|data:|\/)/i.test(normalized)) {
        candidates.push(toAbsoluteUrl(`/${normalized}`));
        candidates.push(toAbsoluteUrl(`/uploads/${normalized}`));
        candidates.push(toAbsoluteUrl(`/app/uploads/${normalized}`));
        candidates.push(toAbsoluteUrl(`/js/documents/uploads/${normalized}`));
      }
    });
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  function isImageLike(name, type) {
    const lowerName = normalize(name).toLowerCase();
    const lowerType = normalize(type).toLowerCase();
    return lowerType === 'image/jpeg' || lowerType === 'image/png' || /\.(jpe?g|png)$/i.test(lowerName);
  }

  function isPdfLike(name, type) {
    const lowerName = normalize(name).toLowerCase();
    const lowerType = normalize(type).toLowerCase();
    return lowerType.includes('pdf') || /\.pdf$/i.test(lowerName);
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
      reader.readAsDataURL(blob);
    });
  }

  function ensureBriefPdfJsLoaded() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      return Promise.resolve(window.pdfjsLib);
    }
    if (briefPdfJsLoader) {
      return briefPdfJsLoader;
    }
    const sources = [
      { script: '/pdf/pdf.min.js', worker: '/pdf/pdf.worker.min.js' },
      { script: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
      { script: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' },
    ];
    briefPdfJsLoader = new Promise((resolve, reject) => {
      let index = 0;
      const tryNext = () => {
        if (typeof window !== 'undefined' && window.pdfjsLib) {
          const loadedWorker = sources[Math.max(0, index - 1)].worker;
          window.__briefPdfWorkerCandidates = Array.from(new Set([loadedWorker, ...PDF_WORKER_CANDIDATES]));
          window.__briefPdfWorkerSrc = window.__briefPdfWorkerCandidates[0] || loadedWorker;
          resolve(window.pdfjsLib);
          return;
        }
        if (index >= sources.length) {
          reject(new Error('Не удалось загрузить PDF библиотеку. Проверьте интернет или доступ к /pdf/pdf.min.js'));
          return;
        }
        const source = sources[index];
        index += 1;
        const script = document.createElement('script');
        script.src = source.script;
        script.onload = () => {
          if (typeof window !== 'undefined' && window.pdfjsLib) {
            window.__briefPdfWorkerCandidates = Array.from(new Set([source.worker, ...PDF_WORKER_CANDIDATES]));
            window.__briefPdfWorkerSrc = window.__briefPdfWorkerCandidates[0] || source.worker;
            resolve(window.pdfjsLib);
            return;
          }
          tryNext();
        };
        script.onerror = () => tryNext();
        document.head.appendChild(script);
      };
      tryNext();
    }).catch((error) => {
      briefPdfJsLoader = null;
      throw error;
    });
    return briefPdfJsLoader;
  }

  async function loadBriefScript(url, checkLoaded) {
    if (checkLoaded()) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Не удалось загрузить библиотеку: ${url}`));
      document.head.appendChild(script);
    });
    if (!checkLoaded()) {
      throw new Error(`Библиотека не инициализирована: ${url}`);
    }
  }

  async function ensureMammothLoaded() {
    if (window.mammoth) return window.mammoth;
    await loadBriefScript('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js', () => Boolean(window.mammoth));
    return window.mammoth;
  }

  async function ensureXlsxLoaded() {
    if (window.XLSX) return window.XLSX;
    await loadBriefScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', () => Boolean(window.XLSX));
    return window.XLSX;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать текст файла.'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function chunkItems(items, size) {
    const normalized = Array.isArray(items) ? items : [];
    const chunkSize = Math.max(1, Number(size) || 1);
    const chunks = [];
    for (let index = 0; index < normalized.length; index += chunkSize) {
      chunks.push(normalized.slice(index, index + chunkSize));
    }
    return chunks;
  }

  function getPdfWorkerCandidates() {
    const runtimeCandidates = Array.isArray(window.__briefPdfWorkerCandidates) ? window.__briefPdfWorkerCandidates : [];
    const merged = runtimeCandidates.concat(PDF_WORKER_CANDIDATES);
    return Array.from(new Set(merged.map((item) => normalize(item)).filter(Boolean)));
  }

  async function openPdfDocumentWithWorkerFallback(pdfjsLib, bytes) {
    const candidates = getPdfWorkerCandidates();
    let lastError = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const workerSrc = candidates[index];
      try {
        if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        }
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        // eslint-disable-next-line no-await-in-loop
        const pdf = await loadingTask.promise;
        window.__briefPdfWorkerSrc = workerSrc;
        return pdf;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Не удалось инициализировать PDF worker.');
  }

  async function buildVisionPayloadFromFile(file, onProgress) {
    if (!(file instanceof File)) {
      throw new Error('Файл не выбран.');
    }
    const mime = String(file.type || '').toLowerCase();
    const name = String(file.name || 'document').toLowerCase();
    const isImage = mime === 'image/jpeg' || mime === 'image/png' || /\.(jpe?g|png)$/i.test(name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    const isText = mime.startsWith('text/') || /\.(txt|md|csv|json|xml|html?)$/i.test(name);
    const isDocx = mime.includes('wordprocessingml.document') || /\.docx$/i.test(name);
    const isXlsx = mime.includes('spreadsheetml') || /\.xlsx$/i.test(name);

    if (isImage) {
      onProgress('Подготавливаю изображение...', 100);
      const imageDataUrl = await readBlobAsDataUrl(file);
      return {
        kind: 'multimodal',
        messageText: 'Проанализируй содержимое этого файла',
        images: [{ dataUrl: imageDataUrl, fileName: file.name || 'image.jpg', mime: mime || 'image/jpeg' }],
      };
    }

    if (isPdf) {
      onProgress('Открываю PDF...', 5);
      const pdfjsLib = await ensureBriefPdfJsLoaded();
      const bytes = await file.arrayBuffer();
      const pdf = await openPdfDocumentWithWorkerFallback(pdfjsLib, bytes);
      const totalPages = Number(pdf.numPages || 0);
      if (!totalPages) throw new Error('PDF повреждён или пустой.');
      const pages = Array.from({ length: Math.min(totalPages, AI_PDF_PAGE_LIMIT) }, (_, i) => i + 1);
      const pagesLabel = `${pages.length}/${totalPages}`;
      const images = [];
      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        onProgress(`Рендер страницы ${pageNumber} (первые ${pagesLabel})...`, Math.round(((index + 1) / pages.length) * 90));
        // eslint-disable-next-line no-await-in-loop
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Не удалось инициализировать canvas для PDF.');
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: ctx, viewport }).promise;
        // eslint-disable-next-line no-await-in-loop
        const blob = await new Promise((resolve) => canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/jpeg', PDF_JPEG_QUALITY));
        if (!blob) throw new Error('Ошибка конвертации PDF страницы в JPEG.');
        // eslint-disable-next-line no-await-in-loop
        const dataUrl = await readBlobAsDataUrl(blob);
        images.push({ dataUrl, fileName: `${(file.name || 'scan').replace(/\.pdf$/i, '')}-p${pageNumber}.jpg`, mime: 'image/jpeg' });
      }
      return { kind: 'multimodal', messageText: 'Проанализируй первые 5 страниц этого PDF', images, totalPages, selectedPages: pages };
    }

    if (isText) {
      onProgress('Читаю текстовый файл...', 100);
      const text = await readFileAsText(file);
      return { kind: 'text', extractedText: text, fileName: file.name || 'text.txt' };
    }

    if (isDocx) {
      onProgress('Извлекаю текст из DOCX...', 35);
      const mammoth = await ensureMammothLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return {
        kind: 'text',
        extractedText: String(result && result.value || '').trim(),
        fileName: file.name || 'document.docx',
        warning: 'Изображения внутри DOCX не анализируются в Vision режиме.',
      };
    }

    if (isXlsx) {
      onProgress('Извлекаю таблицы из XLSX...', 35);
      const XLSX = await ensureXlsxLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetTexts = (workbook && workbook.SheetNames || []).map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return `# Лист: ${sheetName}\n${csv}`;
      });
      return { kind: 'text', extractedText: sheetTexts.join('\n\n').trim(), fileName: file.name || 'table.xlsx' };
    }

    throw new Error('Формат не поддерживается. Поддерживаемые форматы: JPG, PNG, PDF, TXT, DOCX, XLSX');
  }

  async function requestTelegramVisionResponse(payload = {}, onStatus) {
    const selectedFiles = Array.isArray(payload.selectedFiles) ? payload.selectedFiles : [];
    const prompt = [normalize(payload.prompt), VISION_QUALITY_DIRECTIVE].filter(Boolean).join('\n\n') || 'Проанализируй документы и предложи готовое решение.';
    const systemPrompt = normalize(payload.systemPrompt);
    const images = [];
    const extractedTexts = [];

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const currentFile = selectedFiles[index];
      const fileLabel = normalize(currentFile && (currentFile.originalName || currentFile.name || currentFile.storedName)) || `Файл ${index + 1}`;
      onStatus(`Vision ${index + 1}/${selectedFiles.length}: ${fileLabel}`, 'loading');
      // eslint-disable-next-line no-await-in-loop
      const blobFile = await loadSelectedFileAsBlob(currentFile);
      const sourceFile = blobFile instanceof File ? blobFile : new File([blobFile], fileLabel, { type: blobFile.type || 'application/octet-stream' });
      // eslint-disable-next-line no-await-in-loop
      const prepared = await buildVisionPayloadFromFile(sourceFile, (message) => onStatus(`${fileLabel}: ${message}`, 'loading'));
      if (prepared.kind === 'multimodal') {
        images.push(...(Array.isArray(prepared.images) ? prepared.images : []));
      } else if (prepared.kind === 'text') {
        const text = normalize(prepared.extractedText);
        if (text) {
          extractedTexts.push({
            name: prepared.fileName || fileLabel,
            type: sourceFile.type || 'text/plain',
            text: text.slice(0, 60000),
          });
        }
      }
    }

    if (!images.length) {
      if (!extractedTexts.length) {
        throw new Error('Vision режим поддерживает изображения, PDF и DOCX c извлечённым текстом.');
      }
      onStatus('Vision: отправляю извлечённый текст (DOCX/TXT) в ИИ...', 'loading');
      const textOnlyRequest = await postGroqResponseWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'generate_response');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prompt);
        formData.append('extractedTexts', JSON.stringify(extractedTexts));
        return formData;
      });
      const textOnlyPayload = textOnlyRequest && textOnlyRequest.payload;
      if (textOnlyRequest && textOnlyRequest.response && textOnlyRequest.response.ok && textOnlyPayload && textOnlyPayload.ok === true) {
        const textOnlySummary = normalize(textOnlyPayload.response || textOnlyPayload.summary);
        if (textOnlySummary) {
          return textOnlySummary;
        }
      }
      throw new Error((textOnlyPayload && textOnlyPayload.error) || 'Не удалось обработать DOCX/TXT через Vision pipeline.');
    }

    const batches = chunkItems(images, VISION_BATCH_SIZE);
    const partialAnswers = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const currentBatch = batches[batchIndex];
      onStatus(`Vision: анализ блока ${batchIndex + 1}/${batches.length} (${currentBatch.length} стр.)...`, 'loading');
      // eslint-disable-next-line no-await-in-loop
      const request = await postGroqResponseWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'analyze_paid');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prompt);
        if (extractedTexts.length && batchIndex === 0) {
          formData.append('extractedTexts', JSON.stringify(extractedTexts));
        }
        formData.append('vision_payload', JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 1200,
          temperature: 0.6,
          messages: [{
            role: 'system',
            content: systemPrompt || '',
          }, {
            role: 'user',
            content: [{ type: 'text', text: `${prompt}\n\nБлок ${batchIndex + 1}/${batches.length}.` }].concat(
              currentBatch.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } }))
            ),
          }],
        }));
        currentBatch.forEach((item, idx) => {
          const raw = String(item.dataUrl || '');
          const base64 = raw.includes(',') ? raw.split(',')[1] : '';
          if (!base64) return;
          const binary = atob(base64);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          formData.append('files', new Blob([bytes], { type: item.mime || 'image/jpeg' }), item.fileName || `vision-${batchIndex + 1}-${idx + 1}.jpg`);
        });
        return formData;
      });
      const response = request && request.response;
      const result = request && request.payload;
      if (!response || !response.ok || !result || result.ok !== true) {
        throw new Error((result && result.error) || `Ошибка Vision запроса (блок ${batchIndex + 1}).`);
      }
      partialAnswers.push(normalize(result.response || result.summary));
    }

    let finalSummary = partialAnswers.join('\n\n').trim();
    if (partialAnswers.length > 1) {
      onStatus('Vision: объединяю результаты всех блоков...', 'loading');
      const mergeRequest = await postGroqResponseWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'generate_response');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', [prompt, 'Ниже ответы по блокам. Собери один цельный финальный ответ без пересказа блоков.'].filter(Boolean).join('\n\n'));
        formData.append('extractedTexts', JSON.stringify([{
          name: 'vision-batches.txt',
          type: 'text/plain',
          text: partialAnswers.map((item, idx) => `Блок ${idx + 1}/${partialAnswers.length}:\n${item}`).join('\n\n'),
        }]));
        return formData;
      });
      const mergePayload = mergeRequest && mergeRequest.payload;
      if (mergeRequest && mergeRequest.response && mergeRequest.response.ok && mergePayload && mergePayload.ok === true) {
        finalSummary = normalize(mergePayload.response || mergePayload.summary) || finalSummary;
      }
    }
    if (!finalSummary) {
      throw new Error('Vision не вернул итоговый текст.');
    }
    return finalSummary;
  }

  async function loadSelectedFileAsBlob(file) {
    if (file && file.fileObject instanceof File) {
      return file.fileObject;
    }
    const candidates = buildFileUrlCandidates(file);
    if (!candidates.length) {
      throw new Error('Не найден URL файла.');
    }
    let lastStatus = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const url = candidates[index];
      let response = null;
      try {
        response = await fetchWithTimeout(url, { credentials: 'include', cache: 'no-store' }, 25000);
      } catch (error) {
        continue;
      }
      if (!response || !response.ok) {
        lastStatus = Number(response && response.status) || lastStatus;
        continue;
      }
      const blob = await response.blob();
      const fileName = normalize(file && (file.originalName || file.name || file.storedName)) || 'attachment';
      return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    }
    throw new Error(`Не удалось загрузить файл${lastStatus ? ` (${lastStatus})` : ''}`);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tg-ai-chat{position:fixed;inset:0;z-index:3700;display:flex;align-items:flex-end;justify-content:center;padding:10px;background:rgba(15,23,42,.38);backdrop-filter:blur(10px)}
      .tg-ai-chat__card{width:min(900px,100%);height:min(100dvh - 12px,860px);display:flex;flex-direction:column;overflow:hidden;border-radius:24px;border:1px solid rgba(255,255,255,.95);background:linear-gradient(160deg,rgba(255,255,255,.97),rgba(241,245,249,.92));box-shadow:0 20px 50px rgba(15,23,42,.22)}
      .tg-ai-chat__head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:12px;border-bottom:1px solid rgba(203,213,225,.78)}
      .tg-ai-chat__title{font-size:16px;font-weight:800;color:#0f172a}
      .tg-ai-chat__sub{font-size:12px;color:#64748b;margin-top:2px}
      .tg-ai-chat__close{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.9);color:#0f172a;border-radius:11px;padding:6px 11px;min-height:34px;font-weight:700}
      .tg-ai-chat__messages{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,#f8fafc,#eef2ff)}
      .tg-ai-chat__bubble{max-width:92%;padding:9px 11px;border-radius:13px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .tg-ai-chat__bubble--assistant{align-self:flex-start;background:#fff;border:1px solid rgba(148,163,184,.3);color:#0f172a}
      .tg-ai-chat__bubble--user{align-self:flex-end;background:#dbeafe;border:1px solid rgba(59,130,246,.3);color:#1e3a8a}
      .tg-ai-chat__status{padding:8px 12px;border-top:1px solid rgba(203,213,225,.65);font-size:12px;color:#334155;background:rgba(255,255,255,.8)}
      .tg-ai-chat__composer{padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:auto auto;gap:8px;background:rgba(255,255,255,.93)}
      .tg-ai-chat__toggle{min-height:42px;border:none;padding:0 12px;border-radius:12px;background:rgba(219,234,254,.95);color:#1e3a8a;font-weight:700}
      .tg-ai-chat__select{min-height:42px;border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:0 12px;background:rgba(255,255,255,.98);color:#0f172a;font-size:13px}
      .tg-ai-chat__files{border-top:1px solid rgba(203,213,225,.8);background:rgba(248,250,252,.97);padding:9px 12px calc(9px + env(safe-area-inset-bottom,0px))}
      .tg-ai-chat__files[hidden]{display:none}
      .tg-ai-chat__files-title{font-size:12px;color:#64748b;margin:0 0 8px}
      .tg-ai-chat__files-list{display:flex;flex-wrap:wrap;gap:6px;max-height:156px;overflow:auto}
      .tg-ai-chat__file{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(203,213,225,.95);background:#fff;border-radius:999px;font-size:12px;color:#334155}
      .tg-ai-chat__file input{accent-color:#2563eb}
      .tg-ai-chat__meta{display:flex;flex-wrap:wrap;gap:7px;padding:7px 12px;border-top:1px solid rgba(226,232,240,.7);background:rgba(255,255,255,.88)}
      .tg-ai-chat__chip{padding:4px 8px;border:1px solid rgba(203,213,225,.95);border-radius:999px;background:#fff;font-size:12px;color:#334155}
      .tg-ai-chat__loading{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid rgba(148,163,184,.3);border-radius:13px;background:rgba(255,255,255,.86);backdrop-filter:blur(8px);color:#334155;font-size:12px}
      .tg-ai-chat__spinner{width:16px;height:16px;border-radius:50%;border:2px solid rgba(14,165,233,.25);border-top-color:#0ea5e9;animation:tg-ai-spin .9s linear infinite}
      .tg-ai-chat__dots{display:inline-flex;align-items:center;gap:3px}
      .tg-ai-chat__dots span{width:5px;height:5px;border-radius:50%;background:#0ea5e9;opacity:.35;animation:tg-ai-pulse 1.1s infinite}
      .tg-ai-chat__dots span:nth-child(2){animation-delay:.16s}
      .tg-ai-chat__dots span:nth-child(3){animation-delay:.32s}
      .tg-ai-template-preview{position:fixed;inset:0;z-index:3800;background:rgba(2,6,23,.65);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:12px}
      .tg-ai-template-preview__card{width:min(980px,100%);height:min(100dvh - 16px,900px);display:flex;flex-direction:column;overflow:hidden;border-radius:20px;border:1px solid rgba(255,255,255,.8);background:linear-gradient(150deg,rgba(255,255,255,.98),rgba(239,246,255,.95));box-shadow:0 20px 50px rgba(15,23,42,.35)}
      .tg-ai-template-preview__head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(203,213,225,.8)}
      .tg-ai-template-preview__title{font-size:14px;font-weight:800;color:#0f172a}
      .tg-ai-template-preview__hint{font-size:12px;color:#64748b;margin-top:2px}
      .tg-ai-template-preview__close{border:1px solid rgba(203,213,225,.9);background:#fff;border-radius:10px;padding:6px 10px;min-height:34px;font-weight:700;color:#0f172a}
      .tg-ai-template-preview__frame{width:100%;height:100%;border:0;background:#e2e8f0}
      .tg-ai-template-preview__body{flex:1;min-height:0}
      .tg-ai-template-preview__status{padding:8px 12px;border-top:1px solid rgba(203,213,225,.8);font-size:12px;color:#334155;background:rgba(248,250,252,.95)}
      .tg-ai-template-editor{position:fixed;inset:0;z-index:3900;background:linear-gradient(180deg,rgba(226,232,240,.58),rgba(148,163,184,.42));backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;padding:8px}
      .tg-ai-template-editor__card{width:min(920px,100%);height:100%;display:flex;flex-direction:column;border-radius:20px;border:1px solid rgba(255,255,255,.92);overflow:hidden;background:linear-gradient(150deg,rgba(255,255,255,.98),rgba(239,246,255,.94));box-shadow:0 20px 45px rgba(15,23,42,.22)}
      .tg-ai-template-editor__head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:12px;border-bottom:1px solid rgba(203,213,225,.75)}
      .tg-ai-template-editor__title{font-size:16px;font-weight:800;color:#0f172a}
      .tg-ai-template-editor__sub{font-size:12px;color:#64748b;margin-top:2px}
      .tg-ai-template-editor__close{border:1px solid rgba(203,213,225,.9);background:#fff;border-radius:10px;padding:6px 10px;min-height:34px;font-weight:700;color:#0f172a}
      .tg-ai-template-editor__body{flex:1;min-height:0;overflow:auto;padding:12px;display:grid;gap:10px}
      .tg-ai-template-editor__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .tg-ai-template-editor__field{display:grid;gap:5px}
      .tg-ai-template-editor__field--full{grid-column:1/-1}
      .tg-ai-template-editor__label{font-size:12px;color:#334155;font-weight:700}
      .tg-ai-template-editor__date{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px}
      .tg-ai-template-editor__input,.tg-ai-template-editor__textarea{width:100%;box-sizing:border-box;border:1px solid rgba(203,213,225,.95);border-radius:12px;background:rgba(255,255,255,.96);padding:10px 12px;color:#0f172a;outline:none}
      .tg-ai-template-editor__input:focus,.tg-ai-template-editor__textarea:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(147,197,253,.25)}
      .tg-ai-template-editor__textarea{min-height:36dvh;resize:vertical;font-size:14px;line-height:1.55}
      .tg-ai-template-editor__error{font-size:12px;color:#b91c1c;min-height:16px}
      .tg-ai-template-editor__foot{display:flex;justify-content:flex-end;gap:8px;padding:12px;border-top:1px solid rgba(203,213,225,.75);background:rgba(255,255,255,.84)}
      .tg-ai-template-editor__btn{border:1px solid rgba(148,163,184,.45);background:#fff;color:#334155;border-radius:12px;padding:10px 14px;min-height:40px;font-weight:700}
      .tg-ai-template-editor__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8}
      .tg-ai-template-editor__btn[disabled]{opacity:.65}
      @keyframes tg-ai-spin{to{transform:rotate(360deg)}}
      @keyframes tg-ai-pulse{0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      @media (max-width:640px){.tg-ai-chat{padding:0}.tg-ai-chat__card{height:100dvh;border-radius:0}.tg-ai-chat__composer{grid-template-columns:1fr}.tg-ai-chat__toggle{grid-column:auto}.tg-ai-template-preview{padding:0}.tg-ai-template-preview__card{height:100dvh;border-radius:0}.tg-ai-template-editor{padding:0}.tg-ai-template-editor__card{border-radius:0}.tg-ai-template-editor__grid{grid-template-columns:1fr}.tg-ai-template-editor__textarea{min-height:42dvh;font-size:16px}.tg-ai-template-editor__foot{flex-direction:column;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}.tg-ai-template-editor__btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function getDocsGenerateEndpoints() {
    const configured = normalize(globalScope && (globalScope.DOCUMENTS_AI_API_URL || globalScope.TELEGRAM_DOCS_API_URL));
    const endpoints = configured ? [configured, ...DOCS_GENERATE_FALLBACK_ENDPOINTS] : DOCS_GENERATE_FALLBACK_ENDPOINTS.slice();
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  async function generateDocxFromTemplateViaApi(answerText, meta = {}) {
    const endpoints = getDocsGenerateEndpoints();
    let lastError = null;
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      const formData = new FormData();
      formData.append('action', 'generate_document');
      formData.append('format', 'docx');
      formData.append('answer', String(answerText || ''));
      formData.append('templateDay', String(meta.day || ''));
      formData.append('templateMonth', String(meta.month || ''));
      formData.append('templateNumber', String(meta.number || ''));
      formData.append('templateAddressee', String(meta.addressee || ''));
      formData.append('documentTitle', 'Ответ ИИ');
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          body: formData,
        }, 45000);
        if (!response || !response.ok) {
          lastError = new Error(`Ошибка генерации шаблона (${response ? response.status : 0})`);
          continue;
        }
        const blob = await response.blob();
        if (!blob || !blob.size) {
          lastError = new Error('Пустой файл от сервера.');
          continue;
        }
        return blob;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Не удалось сформировать DOCX.');
  }

  async function openGeneratedDocxViaExistingPreview(blob, context = {}) {
    if (!blob) throw new Error('empty_blob');
    const openExternalViewer = typeof window !== 'undefined' && typeof window.__APPDOSC_OPEN_FILES_VIEWER__ === 'function'
      ? window.__APPDOSC_OPEN_FILES_VIEWER__
      : null;
    if (!openExternalViewer) {
      throw new Error('Просмотрщик недоступен.');
    }
    const objectUrl = URL.createObjectURL(blob);
    const file = {
      name: 'template-answer.docx',
      originalName: 'template-answer.docx',
      storedName: 'template-answer.docx',
      url: objectUrl,
      resolvedUrl: objectUrl,
      previewUrl: objectUrl,
      fileUrl: objectUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    try {
      await openExternalViewer([file], context.task || {}, { notify: true, hasMultiple: false });
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    }
  }

  function openTemplateAnswerEditor(context = {}) {
    if (document.querySelector('.tg-ai-template-editor')) return;
    const aiText = normalize(context && context.aiAnswer) || DEFAULT_TEMPLATE_ANSWER_TEXT;
    const task = context && context.task ? context.task : {};
    const onStatus = typeof context.onStatus === 'function' ? context.onStatus : null;
    const storedTemplateMeta = globalScope && globalScope.DOCUMENTS_TEMPLATE_META && typeof globalScope.DOCUMENTS_TEMPLATE_META === 'object'
      ? globalScope.DOCUMENTS_TEMPLATE_META
      : {};
    const overlay = document.createElement('div');
    overlay.className = 'tg-ai-template-editor';
    overlay.innerHTML = `
      <div class="tg-ai-template-editor__card" role="dialog" aria-modal="true" aria-label="Заполнение шаблона">
        <div class="tg-ai-template-editor__head">
          <div>
            <div class="tg-ai-template-editor__title">Заполнение шаблона</div>
            <div class="tg-ai-template-editor__sub">Проверьте текст ИИ и заполните дату, номер и адресата</div>
          </div>
          <button type="button" class="tg-ai-template-editor__close" data-action="cancel">Закрыть</button>
        </div>
        <div class="tg-ai-template-editor__body">
          <div class="tg-ai-template-editor__grid">
            <label class="tg-ai-template-editor__field">
              <span class="tg-ai-template-editor__label">Дата</span>
              <span class="tg-ai-template-editor__date">
                <input class="tg-ai-template-editor__input" data-template-day type="text" inputmode="numeric" maxlength="2" placeholder="09">
                <input class="tg-ai-template-editor__input" data-template-month type="text" placeholder="апреля">
              </span>
            </label>
            <label class="tg-ai-template-editor__field">
              <span class="tg-ai-template-editor__label">Номер</span>
              <input class="tg-ai-template-editor__input" data-template-number type="text" placeholder="12/Д">
            </label>
            <label class="tg-ai-template-editor__field tg-ai-template-editor__field--full">
              <span class="tg-ai-template-editor__label">Адресат</span>
              <input class="tg-ai-template-editor__input" data-template-addressee type="text" placeholder="ООО «Компания»">
            </label>
            <label class="tg-ai-template-editor__field tg-ai-template-editor__field--full">
              <span class="tg-ai-template-editor__label">Текст ответа ИИ</span>
              <textarea class="tg-ai-template-editor__textarea" data-template-answer spellcheck="true"></textarea>
            </label>
          </div>
          <div class="tg-ai-template-editor__error" data-template-error aria-live="polite"></div>
        </div>
        <div class="tg-ai-template-editor__foot">
          <button type="button" class="tg-ai-template-editor__btn" data-action="cancel">Отмена</button>
          <button type="button" class="tg-ai-template-editor__btn tg-ai-template-editor__btn--primary" data-action="done">Готово</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const dayInput = overlay.querySelector('[data-template-day]');
    const monthInput = overlay.querySelector('[data-template-month]');
    const numberInput = overlay.querySelector('[data-template-number]');
    const addresseeInput = overlay.querySelector('[data-template-addressee]');
    const textInput = overlay.querySelector('[data-template-answer]');
    const doneButton = overlay.querySelector('[data-action="done"]');
    const errorNode = overlay.querySelector('[data-template-error]');
    if (dayInput) dayInput.value = normalize(storedTemplateMeta.day);
    if (monthInput) monthInput.value = normalize(storedTemplateMeta.month);
    if (numberInput) numberInput.value = normalize(storedTemplateMeta.number);
    if (addresseeInput) addresseeInput.value = normalize(storedTemplateMeta.addressee);
    if (textInput) textInput.value = aiText;
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-action="cancel"]').forEach((button) => {
      button.addEventListener('click', close);
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    const renderError = (message) => {
      if (errorNode) errorNode.textContent = message || '';
    };
    doneButton?.addEventListener('click', async () => {
      const answerRaw = String(textInput && textInput.value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const answer = answerRaw.trim();
      const day = normalize(dayInput && dayInput.value);
      const month = normalize(monthInput && monthInput.value);
      const number = normalize(numberInput && numberInput.value);
      const addresseeRaw = String(addresseeInput && addresseeInput.value || '').replace(/\s+$/g, '');
      const addressee = normalize(addresseeRaw);
      if (!answer) {
        renderError('Добавьте текст ответа ИИ.');
        return;
      }
      if (!day || !month || !number || !addressee) {
        renderError('Заполните День, Месяц, Номер и Адресат.');
        return;
      }
      const addresseeTemplateValue = /^\s/.test(addresseeRaw) ? addresseeRaw : (`\u00A0${addresseeRaw}`);
      if (globalScope) {
        globalScope.DOCUMENTS_LAST_AI_ANSWER = answer;
        globalScope.DOCUMENTS_TEMPLATE_META = { day, month, number, addressee: addresseeRaw };
      }
      renderError('');
      if (doneButton) {
        doneButton.disabled = true;
        doneButton.textContent = 'Генерируем...';
      }
      if (onStatus) onStatus('Генерируем DOCX по шаблону...');
      try {
        const preparedAnswer = answer
          .replace(/\[ДЕНЬ\]/g, day)
          .replace(/\[МЕСЯЦ\]/g, month)
          .replace(/\[НОМЕР\]/g, number)
          .replace(/\[АДРЕСАТ\]/g, addresseeTemplateValue);
        const blob = await generateDocxFromTemplateViaApi(preparedAnswer, {
          day,
          month,
          number,
          addressee: addresseeTemplateValue,
        });
        close();
        if (onStatus) onStatus('Открываем результат в предпросмотре...');
        await openGeneratedDocxViaExistingPreview(blob, { task });
        if (onStatus) onStatus('Готово: документ открыт в предпросмотре.');
      } catch (error) {
        renderError((error && error.message) || 'Не удалось сформировать документ.');
        if (onStatus) onStatus('Ошибка генерации документа.');
      } finally {
        if (doneButton) {
          doneButton.disabled = false;
          doneButton.textContent = 'Готово';
        }
      }
    });
  }

  function createBubble(container, text, role) {
    const bubble = document.createElement('div');
    bubble.className = `tg-ai-chat__bubble tg-ai-chat__bubble--${role === 'user' ? 'user' : 'assistant'}`;
    bubble.textContent = normalize(text) || 'Пустой ответ.';
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function createLoadingBubble(container, text = 'Обрабатываем файлы и формируем ответ') {
    const bubble = document.createElement('div');
    bubble.className = 'tg-ai-chat__loading';
    bubble.innerHTML = `
      <span class="tg-ai-chat__spinner" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
      <span class="tg-ai-chat__dots" aria-hidden="true"><span></span><span></span><span></span></span>
    `;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  function renderFiles(container, files) {
    if (!container) return;
    if (!files.length) {
      container.innerHTML = '<span class="tg-ai-chat__file">В задаче нет файлов</span>';
      return;
    }
    container.innerHTML = files.map((file, index) => {
      const name = normalize(file && (file.originalName || file.name || file.storedName)) || `Файл ${index + 1}`;
      const hasUrl = buildFileUrlCandidates(file).length > 0;
      const disabled = hasUrl ? '' : 'disabled';
      return `<label class="tg-ai-chat__file"><input type="checkbox" data-file-index="${index}" ${disabled}><span>${escapeHtml(name)}</span></label>`;
    }).join('');
  }

  async function openTemplatePreviewModal(context = {}) {
    const templateDocxCandidates = getTemplateDocxCandidates();

    const task = context && context.task ? context.task : null;
    const openExternalViewer = typeof window !== 'undefined' && typeof window.__APPDOSC_OPEN_FILES_VIEWER__ === 'function'
      ? window.__APPDOSC_OPEN_FILES_VIEWER__
      : null;

    const modal = document.createElement('div');
    modal.className = 'tg-ai-template-preview';
    modal.innerHTML = `
      <div class="tg-ai-template-preview__card">
        <div class="tg-ai-template-preview__head">
          <div>
            <div class="tg-ai-template-preview__title">Шаблон</div>
            <div class="tg-ai-template-preview__hint">Открываем template.docx в режиме предпросмотра</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button type="button" class="tg-ai-template-preview__close" data-template-open-viewer>Открыть как «Просмотреть»</button>
            <button type="button" class="tg-ai-template-preview__close" data-template-close>Закрыть</button>
          </div>
        </div>
        <div class="tg-ai-template-preview__body">
          <iframe class="tg-ai-template-preview__frame" title="Предпросмотр шаблона" data-template-frame></iframe>
        </div>
        <div class="tg-ai-template-preview__status" data-template-status>Загрузка шаблона…</div>
      </div>
    `;
    document.body.appendChild(modal);

    const frame = modal.querySelector('[data-template-frame]');
    const status = modal.querySelector('[data-template-status]');
    const openViewerButton = modal.querySelector('[data-template-open-viewer]');
    const close = () => modal.remove();
    modal.querySelector('[data-template-close]')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });

    try {
      const docxUrl = await resolveFirstAvailableUrl(templateDocxCandidates) || pickPreferredTemplateDocxUrl(templateDocxCandidates);
      if (docxUrl) {
        const absoluteDocx = toAbsoluteUrl(docxUrl);
        const templateFile = {
          name: 'template.docx',
          originalName: 'template.docx',
          storedName: 'template.docx',
          url: docxUrl,
          resolvedUrl: absoluteDocx,
          previewUrl: docxUrl,
          fileUrl: docxUrl,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };

        frame.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteDocx)}`;
        status.textContent = 'Готово: template.docx открыт.';

        openViewerButton?.addEventListener('click', async () => {
          if (!openExternalViewer) {
            status.textContent = 'Просмотрщик «Просмотреть» сейчас недоступен.';
            return;
          }
          status.textContent = 'Открываю через логику «Просмотреть»...';
          try {
            await openExternalViewer([templateFile], task || {}, { notify: true, hasMultiple: false });
            status.textContent = 'Файл открыт через «Просмотреть».';
          } catch (error) {
            status.textContent = (error && error.message) || 'Не удалось открыть через «Просмотреть».';
          }
        });
        return;
      }
      status.textContent = 'Не удалось найти template.docx.';
    } catch (error) {
      status.textContent = (error && error.message) || 'Ошибка открытия шаблона.';
    }
  }

  globalScope.openAiResponseDialog = function openAiResponseDialog(context = {}) {
    ensureStyles();
    ensureBriefPdfJsLoaded().catch(() => {});

    const task = context && context.task ? context.task : {};
    const files = Array.isArray(task && task.files) ? task.files : [];

    const overlay = document.createElement('div');
    overlay.className = 'tg-ai-chat';
    overlay.innerHTML = `
      <div class="tg-ai-chat__card">
        <div class="tg-ai-chat__head">
          <div>
            <div class="tg-ai-chat__title">Ответ с помощью ИИ</div>
            <div class="tg-ai-chat__sub">Выберите файлы, затем режим ответа в списке</div>
          </div>
          <button type="button" class="tg-ai-chat__close" data-close>✕</button>
        </div>
        <div class="tg-ai-chat__messages" data-messages>
          <div class="tg-ai-chat__bubble tg-ai-chat__bubble--assistant">Привет! Выберите файлы и режим ответа в выпадающем списке «Выберите режим».</div>
        </div>
        <div class="tg-ai-chat__status" data-status>Выберите режим ответа.</div>
        <div class="tg-ai-chat__composer">
          <button type="button" class="tg-ai-chat__toggle" data-files-toggle>📎 Файлы</button>
          <select class="tg-ai-chat__select" data-style-select aria-label="Стиль ответа">
            <option value="" selected>🎯 Выберите режим</option>
            ${RESPONSE_STYLE_OPTIONS.map((item) => `<option value="${escapeHtml(item.value)}">🎯 ${escapeHtml(item.label)}</option>`).join('')}
          </select>
          <button type="button" class="tg-ai-chat__toggle" data-template-btn>Шаблон</button>
        </div>
        <div class="tg-ai-chat__files" data-files hidden>
          <p class="tg-ai-chat__files-title">Файлы из текущей задачи:</p>
          <div class="tg-ai-chat__files-list" data-files-list></div>
        </div>
        <div class="tg-ai-chat__meta" data-meta></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const selected = new Set();
    const messages = overlay.querySelector('[data-messages]');
    const status = overlay.querySelector('[data-status]');
    const filesPanel = overlay.querySelector('[data-files]');
    const filesList = overlay.querySelector('[data-files-list]');
    const meta = overlay.querySelector('[data-meta]');
    const styleSelect = overlay.querySelector('[data-style-select]');
    const templateButton = overlay.querySelector('[data-template-btn]');
    let styleIndex = 0;
    let isSending = false;
    let lastAiAnswer = '';

    renderFiles(filesList, files);

    const close = () => overlay.remove();
    overlay.querySelector('[data-close]')?.addEventListener('click', close);

    overlay.querySelector('[data-files-toggle]')?.addEventListener('click', () => {
      filesPanel.hidden = !filesPanel.hidden;
    });
    async function sendByCurrentStyle() {
      if (isSending) return;
      const selectedStyleValue = normalize(styleSelect && styleSelect.value);
      if (!selectedStyleValue) {
        status.textContent = 'Выберите режим ответа.';
        return;
      }
      const styleIndexFromSelect = RESPONSE_STYLE_OPTIONS.findIndex((item) => item.value === selectedStyleValue);
      if (styleIndexFromSelect >= 0) {
        styleIndex = styleIndexFromSelect;
      }
      const styleMeta = RESPONSE_STYLE_OPTIONS[styleIndex] || RESPONSE_STYLE_OPTIONS[0];
      const prompt = 'Реши задачу по выбранным файлам и дай готовый ответ.';
      const effectivePrompt = [prompt, styleMeta.prompt, RESPONSE_OUTPUT_DIRECTIVE].filter(Boolean).join('\n\n');
      const selectedFiles = Array.from(selected)
        .map((key) => files[Number(key)])
        .filter(Boolean);

      if (!selectedFiles.length) {
        createBubble(messages, 'Выберите хотя бы один файл в меню «📎 Файлы».', 'assistant');
        status.textContent = 'Нет выбранных файлов.';
        return;
      }

      isSending = true;
      lastAiAnswer = '';
      meta.innerHTML = '';
      createBubble(messages, `Стиль: ${styleMeta.label}. Подготовь готовый ответ по документам.`, 'user');
      status.textContent = 'Vision: готовим файлы...';
      const startedAt = Date.now();
      const loadingBubble = createLoadingBubble(messages);

      try {
        const answer = await requestTelegramVisionResponse({ prompt: effectivePrompt, systemPrompt: styleMeta.prompt, selectedFiles }, (message) => {
          status.textContent = message;
        });
        lastAiAnswer = answer;
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        createBubble(messages, answer, 'assistant');

        const elapsed = Date.now() - startedAt;
        meta.innerHTML = `
          <span class="tg-ai-chat__chip">Режим: vision</span>
          <span class="tg-ai-chat__chip">Стиль: ${styleMeta.label}</span>
          <span class="tg-ai-chat__chip">Файлов: ${selectedFiles.length}</span>
          <span class="tg-ai-chat__chip">OCR: Vision pipeline</span>
          <span class="tg-ai-chat__chip">Время: ${Number(elapsed) || 0} мс</span>
        `;
        status.textContent = 'Данные переданы.';
      } catch (error) {
        lastAiAnswer = '';
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        createBubble(messages, (error && error.message) || 'Не удалось передать данные.', 'assistant');
        status.textContent = 'Ошибка передачи.';
      } finally {
        isSending = false;
      }
    }

    styleSelect?.addEventListener('change', () => {
      const selectedStyleValue = normalize(styleSelect.value);
      if (!selectedStyleValue) {
        status.textContent = 'Выберите режим ответа.';
        return;
      }
      const nextIndex = RESPONSE_STYLE_OPTIONS.findIndex((item) => item.value === selectedStyleValue);
      styleIndex = nextIndex >= 0 ? nextIndex : 0;
      const styleMeta = RESPONSE_STYLE_OPTIONS[styleIndex] || RESPONSE_STYLE_OPTIONS[0];
      status.textContent = `Стиль ответа: ${styleMeta.label}.`;
      sendByCurrentStyle();
    });

    filesList?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
      const key = normalize(target.dataset.fileIndex);
      if (!key) return;
      if (target.checked) selected.add(key);
      else selected.delete(key);
      status.textContent = selected.size ? `Выбрано файлов: ${selected.size}` : 'Можно выбрать файлы для более точного ответа.';
    });

    templateButton?.addEventListener('click', async () => {
      if (isSending) {
        status.textContent = 'Дождитесь завершения ответа ИИ.';
        return;
      }
      openTemplateAnswerEditor({
        aiAnswer: lastAiAnswer,
        task,
        onStatus: (message) => {
          status.textContent = normalize(message) || 'Готово.';
        },
      });
    });

  };
}(typeof window !== 'undefined' ? window : globalThis));
