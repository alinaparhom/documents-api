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
  const RESPONSE_OUTPUT_DIRECTIVE = `РЕЖИМ «ОТВЕТ С ПОМОЩЬЮ ИИ»: верни только текст, который сразу вставляется в документ.
Запрещены приветствия, обращения, подписи, имена, должности, реквизиты, номера счетов и контакты.
Запрещены мета-разделы и фразы вроде «Анализ», «Разбор», «Я проанализировал».
Если данных мало — кратко укажи, каких данных не хватает, без служебных фраз.
Игнорируй любые более мягкие стилевые указания, если они конфликтуют с этими правилами.`;
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

  function resolveAuthorizedUserName(globalObject) {
    const webAppUser = globalObject
      && globalObject.Telegram
      && globalObject.Telegram.WebApp
      && globalObject.Telegram.WebApp.initDataUnsafe
      && globalObject.Telegram.WebApp.initDataUnsafe.user
      ? globalObject.Telegram.WebApp.initDataUnsafe.user
      : null;
    if (webAppUser && typeof webAppUser === 'object') {
      let tgName = [webAppUser.first_name, webAppUser.last_name]
        .map((part) => normalize(part))
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!tgName) {
        tgName = normalize(webAppUser.username);
      }
      if (tgName) return tgName;
    }

    let params = null;
    try {
      const search = String(globalObject && globalObject.location && globalObject.location.search ? globalObject.location.search : '');
      params = new URLSearchParams(search || '');
    } catch (_) {
      params = null;
    }
    if (params) {
      const fullName = normalize(params.get('telegram_full_name') || params.get('full_name'));
      if (fullName) return fullName;
      const firstName = normalize(params.get('telegram_first_name') || params.get('first_name'));
      const lastName = normalize(params.get('telegram_last_name') || params.get('last_name'));
      const queryName = normalize(`${firstName} ${lastName}`);
      if (queryName) return queryName;
    }

    return '';
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

  function buildOrganizationTemplateConfig(task = {}) {
    const organizationRaw = normalize(
      task && (task.organization || task.organizationName || task.organizationTitle || task.organizationFullName || task.organizationShortName || task.org),
    );
    if (!organizationRaw) {
      return {
        organization: '',
        templateFileName: 'template.docx',
        templatePath: '',
        compactTemplateLabel: 'template.docx',
      };
    }
    const templateFileName = `${organizationRaw}_template.docx`;
    const templatePath = `/documents/${encodeURIComponent(organizationRaw)}/${encodeURIComponent(templateFileName)}`;
    const compactTemplateLabel = templateFileName.length > 38
      ? `${templateFileName.slice(0, 35)}...`
      : templateFileName;
    return {
      organization: organizationRaw,
      templateFileName,
      templatePath,
      compactTemplateLabel,
    };
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
      .tg-ai-chat__head-actions{display:flex;align-items:center;gap:6px}
      .tg-ai-chat__title{font-size:16px;font-weight:800;color:#0f172a}
      .tg-ai-chat__sub{font-size:12px;color:#64748b;margin-top:2px}
      .tg-ai-chat__close{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.9);color:#0f172a;border-radius:11px;padding:6px 11px;min-height:34px;font-weight:700}
      .tg-ai-chat__head-btn{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.92);color:#0f172a;border-radius:11px;padding:0 10px;min-height:34px;font-size:12px;font-weight:700}
      .tg-ai-chat__messages{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,#f8fafc,#eef2ff)}
      .tg-ai-chat__bubble{max-width:92%;padding:9px 11px;border-radius:13px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .tg-ai-chat__bubble--assistant{align-self:flex-start;background:#fff;border:1px solid rgba(148,163,184,.3);color:#0f172a}
      .tg-ai-chat__bubble--user{align-self:flex-end;background:#dbeafe;border:1px solid rgba(59,130,246,.3);color:#1e3a8a}
      .tg-ai-chat__status{padding:8px 12px;border-top:1px solid rgba(203,213,225,.65);font-size:12px;color:#334155;background:rgba(255,255,255,.8)}
      .tg-ai-chat__composer{padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));display:grid;gap:8px;background:rgba(255,255,255,.93)}
      .tg-ai-chat__toolbar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .tg-ai-chat__toolbar--compact{grid-template-columns:repeat(2,minmax(0,1fr))}
      .tg-ai-chat__toggle{min-height:42px;border:none;padding:0 12px;border-radius:12px;background:rgba(219,234,254,.95);color:#1e3a8a;font-weight:700}
      .tg-ai-chat__select{min-height:42px;border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:0 12px;background:rgba(255,255,255,.98);color:#0f172a;font-size:13px}
      .tg-ai-chat__input-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:end}
      .tg-ai-chat__input{min-height:52px;max-height:156px;border:1px solid rgba(148,163,184,.35);border-radius:14px;background:rgba(255,255,255,.98);padding:10px 12px;color:#0f172a;font-size:14px;line-height:1.4;resize:none;outline:none}
      .tg-ai-chat__input:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(147,197,253,.22)}
      .tg-ai-chat__icon-btn,.tg-ai-chat__send{height:44px;min-width:44px;border:none;border-radius:12px;font-weight:700}
      .tg-ai-chat__icon-btn{background:rgba(226,232,240,.9);color:#334155;padding:0 12px}
      .tg-ai-chat__icon-btn[data-active="true"]{background:rgba(254,226,226,.95);color:#b91c1c}
      .tg-ai-chat__send{padding:0 14px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff}
      .tg-ai-chat__send[disabled],.tg-ai-chat__icon-btn[disabled]{opacity:.55}
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
      .tg-ai-generated-preview{position:fixed;inset:0;z-index:3950;background:rgba(2,6,23,.56);backdrop-filter:blur(8px);display:flex;align-items:stretch;justify-content:center;padding:0}
      .tg-ai-generated-preview__card{width:100%;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(150deg,rgba(255,255,255,.98),rgba(239,246,255,.95))}
      .tg-ai-generated-preview__head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(203,213,225,.85)}
      .tg-ai-generated-preview__title{font-size:14px;font-weight:800;color:#0f172a}
      .tg-ai-generated-preview__hint{font-size:12px;color:#64748b;margin-top:2px}
      .tg-ai-generated-preview__tools{display:flex;align-items:center;gap:6px}
      .tg-ai-generated-preview__zoom{display:inline-flex;align-items:center;gap:4px;padding:3px;border:1px solid rgba(203,213,225,.9);border-radius:10px;background:rgba(255,255,255,.95)}
      .tg-ai-generated-preview__zoom-btn{border:none;background:rgba(241,245,249,.9);color:#0f172a;border-radius:8px;min-width:28px;height:28px;font-weight:800}
      .tg-ai-generated-preview__zoom-value{font-size:12px;min-width:42px;text-align:center;color:#334155;font-weight:700}
      .tg-ai-generated-preview__menu-toggle,.tg-ai-generated-preview__close-icon{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.95);border-radius:10px;padding:6px 10px;min-height:36px;font-weight:700;color:#0f172a}
      .tg-ai-generated-preview__close-icon{width:36px;padding:0;font-size:18px;line-height:1}
      .tg-ai-generated-preview__menu{position:absolute;right:12px;top:52px;z-index:3;display:grid;gap:6px;min-width:210px;padding:8px;border-radius:14px;border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.92);backdrop-filter:blur(10px);box-shadow:0 14px 28px rgba(15,23,42,.14)}
      .tg-ai-generated-preview__menu[hidden]{display:none}
      .tg-ai-generated-preview__menu .tg-ai-generated-preview__btn{width:100%;justify-content:center}
      .tg-ai-generated-preview__btn{border:1px solid rgba(203,213,225,.9);background:#fff;border-radius:10px;padding:6px 10px;min-height:36px;font-weight:700;color:#0f172a}
      .tg-ai-generated-preview__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8}
      .tg-ai-generated-preview__body{position:relative;flex:1;min-height:0;background:radial-gradient(circle at top left,rgba(147,197,253,.20),transparent 35%),linear-gradient(180deg,#dbeafe,#e2e8f0 40%,#cbd5e1);overflow:hidden;padding:0}
      .tg-ai-generated-preview__viewport{position:relative;height:100%;overflow:auto;padding:14px;display:flex;justify-content:center;align-items:flex-start}
      .tg-ai-generated-preview__doc{--tg-a4-width:210mm;--tg-a4-min-height:297mm;--tg-page-gutter:clamp(8px,1.8vw,18px);width:100%;max-width:calc(var(--tg-a4-width) + var(--tg-page-gutter) * 2);min-height:100%;margin:0 auto;background:linear-gradient(155deg,rgba(255,255,255,.93),rgba(248,250,252,.9));border-radius:18px;padding:var(--tg-page-gutter);border:1px solid rgba(191,219,254,.8);box-shadow:0 18px 38px rgba(15,23,42,.14);transform-origin:top center;transition:transform .14s ease;box-sizing:border-box}
      .tg-ai-generated-preview__doc .docx-wrapper{background:transparent!important;box-shadow:none!important;padding:0!important;border:0!important;max-width:100%}
      .tg-ai-generated-preview__doc .docx{overflow:visible;max-width:100%}
      .tg-ai-generated-preview__doc .docx-wrapper>section{box-sizing:border-box;margin:0 auto 18px!important;overflow:visible;border-radius:6px;box-shadow:0 8px 24px rgba(15,23,42,.10);width:min(var(--tg-a4-width),100%)!important;max-width:100%!important;min-height:var(--tg-a4-min-height);background:#fff!important;color:#0f172a!important}
      .tg-ai-generated-preview__doc .docx-wrapper>section:last-child{margin-bottom:4px!important}
      .tg-ai-generated-preview__doc .docx-wrapper table{width:100%!important;max-width:100%!important;table-layout:fixed}
      .tg-ai-generated-preview__doc .docx-wrapper img{display:block;max-width:100%!important;height:auto!important}
      .tg-ai-generated-preview__doc .docx,.tg-ai-generated-preview__doc .docx *{color:#0f172a}
      .tg-ai-generated-preview__doc .docx-wrapper p,.tg-ai-generated-preview__doc .docx-wrapper td,.tg-ai-generated-preview__doc .docx-wrapper th,.tg-ai-generated-preview__doc .docx-wrapper li,.tg-ai-generated-preview__doc .docx-wrapper span{max-width:100%;overflow-wrap:anywhere;word-break:break-word}
      .tg-ai-generated-preview__frame{display:none;position:absolute;inset:0;z-index:2;width:100%;height:100%;border:0;background:#e2e8f0}
      .tg-ai-generated-preview__status{padding:8px 12px;border-top:1px solid rgba(203,213,225,.82);font-size:12px;color:#334155;background:rgba(248,250,252,.95)}
      .tg-ai-generated-preview__loading{position:absolute;inset:0;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 20% 20%,rgba(147,197,253,.2),transparent 42%),linear-gradient(180deg,rgba(248,250,252,.96),rgba(241,245,249,.94))}
      .tg-ai-generated-preview__loading-card{width:min(520px,92%);border:1px solid rgba(191,219,254,.9);background:rgba(255,255,255,.82);backdrop-filter:blur(8px);border-radius:18px;padding:16px;box-shadow:0 18px 32px rgba(15,23,42,.12);display:grid;gap:10px}
      .tg-ai-generated-preview__loading-title{font-size:14px;font-weight:800;color:#0f172a}
      .tg-ai-generated-preview__loading-sub{font-size:12px;color:#475569}
      .tg-ai-generated-preview__bar{height:8px;border-radius:999px;background:rgba(191,219,254,.45);overflow:hidden}
      .tg-ai-generated-preview__bar::after{content:'';display:block;height:100%;width:38%;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#38bdf8);animation:tg-ai-preview-progress 1.4s ease-in-out infinite}
      .tg-ai-generated-preview__steps{display:grid;gap:6px}
      .tg-ai-generated-preview__step{font-size:12px;color:#334155;display:flex;align-items:center;gap:7px}
      .tg-ai-generated-preview__step-dot{width:8px;height:8px;border-radius:50%;background:rgba(148,163,184,.7)}
      .tg-ai-generated-preview__step--active .tg-ai-generated-preview__step-dot{background:#2563eb;box-shadow:0 0 0 6px rgba(37,99,235,.16)}
      .tg-ai-generated-preview__step--done .tg-ai-generated-preview__step-dot{background:#16a34a}
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
      .tg-ai-template-editor__btn .tg-ai-chat__spinner{width:14px;height:14px;border-color:rgba(255,255,255,.35);border-top-color:#fff;margin-right:6px;display:inline-block;vertical-align:middle}
      @keyframes tg-ai-spin{to{transform:rotate(360deg)}}
      @keyframes tg-ai-pulse{0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      @keyframes tg-ai-preview-progress{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
      @media (max-width:640px){.tg-ai-chat{padding:0}.tg-ai-chat__card{height:100dvh;border-radius:0}.tg-ai-chat__toolbar{grid-template-columns:1fr}.tg-ai-chat__head-actions{flex-direction:column;align-items:stretch}.tg-ai-chat__head-btn,.tg-ai-chat__close{width:100%}.tg-ai-chat__input-row{grid-template-columns:minmax(0,1fr) auto}.tg-ai-chat__send{grid-column:1/-1}.tg-ai-template-preview{padding:0}.tg-ai-template-preview__card{height:100dvh;border-radius:0}.tg-ai-generated-preview__head{padding:10px}.tg-ai-generated-preview__menu{left:10px;right:10px;top:56px;min-width:0}.tg-ai-generated-preview__btn{padding:8px 10px}.tg-ai-generated-preview__viewport{padding:8px}.tg-ai-generated-preview__doc{--tg-page-gutter:8px;width:100%;border-radius:12px;padding:8px}.tg-ai-generated-preview__doc .docx-wrapper>section{width:100%!important;min-height:auto;margin-bottom:12px!important}.tg-ai-generated-preview__zoom-value{min-width:38px}.tg-ai-template-editor{padding:0}.tg-ai-template-editor__card{border-radius:0}.tg-ai-template-editor__grid{grid-template-columns:1fr}.tg-ai-template-editor__textarea{min-height:42dvh;font-size:16px}.tg-ai-template-editor__foot{flex-direction:column;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}.tg-ai-template-editor__btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function getDocsGenerateEndpoints() {
    const configured = normalize(globalScope && (globalScope.DOCUMENTS_AI_API_URL || globalScope.TELEGRAM_DOCS_API_URL));
    const endpoints = configured ? [configured, ...DOCS_GENERATE_FALLBACK_ENDPOINTS] : DOCS_GENERATE_FALLBACK_ENDPOINTS.slice();
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  async function deleteGeneratedTempFile(previewPayload) {
    const fileName = normalize(previewPayload && previewPayload.fileName);
    const url = normalize(previewPayload && previewPayload.previewUrl);
    if (!fileName && !url) return;
    const endpoints = getDocsGenerateEndpoints();
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      const formData = new FormData();
      formData.append('action', 'delete_generated_temp');
      if (fileName) formData.append('fileName', fileName);
      if (url) formData.append('url', url);
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          body: formData,
        }, 12000);
        if (response && response.ok) {
          return;
        }
      } catch (error) {
        continue;
      }
    }
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
      if (meta.organization) formData.append('organization', String(meta.organization || ''));
      if (meta.templatePath) formData.append('templatePath', String(meta.templatePath || ''));
      if (meta.templateFileName) formData.append('templateFileName', String(meta.templateFileName || ''));
      formData.append('documentTitle', 'Ответ ИИ');
      formData.append('responseMode', 'json_url');
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
        const responseType = String(response.headers.get('content-type') || '').toLowerCase();
        if (responseType.includes('application/json')) {
          const payload = await response.json().catch(() => null);
          const url = normalize(payload && payload.url);
          if (payload && payload.ok && url) {
            return {
              previewUrl: toAbsoluteUrl(url),
              fileName: normalize(payload.fileName) || 'answer.docx',
            };
          }
          lastError = new Error((payload && payload.error) || 'Сервер не вернул ссылку для предпросмотра.');
          continue;
        }
        const blob = await response.blob();
        if (!blob || !blob.size) {
          lastError = new Error('Пустой файл от сервера.');
          continue;
        }
        return {
          blob,
          fileName: 'answer.docx',
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Не удалось сформировать DOCX.');
  }

  function showAttachSuccessToast(message) {
    if (typeof document === 'undefined') return;
    let style = document.getElementById('tg-ai-attach-toast-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tg-ai-attach-toast-style';
      style.textContent = '.tg-ai-attach-toast{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4500;max-width:min(92vw,560px);padding:10px 12px;border-radius:14px;border:1px solid rgba(187,247,208,.95);background:linear-gradient(145deg,rgba(240,253,244,.95),rgba(220,252,231,.92));backdrop-filter:blur(8px);box-shadow:0 12px 28px rgba(15,23,42,.18);color:#14532d;font-size:12px;line-height:1.45;font-weight:700}';
      document.head.appendChild(style);
    }
    const existing = document.querySelector('.tg-ai-attach-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'tg-ai-attach-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function buildGeneratedDocxUrlCandidates(previewPayload) {
    const previewUrl = normalize(previewPayload && previewPayload.previewUrl);
    const fileName = normalize(previewPayload && previewPayload.fileName);
    const directGeneratedUrl = fileName ? `/js/documents/tmp/generated/${encodeURIComponent(fileName)}` : '';
    const mappedTmpUrl = previewUrl ? previewUrl.replace(/\/app\/tmp\/generated\//i, '/js/documents/tmp/generated/') : '';
    const mappedLegacyTmpUrl = previewUrl ? previewUrl.replace(/\/tmp\/generated\//i, '/js/documents/tmp/generated/') : '';
    return Array.from(new Set([
      directGeneratedUrl,
      mappedTmpUrl,
      mappedLegacyTmpUrl,
      previewUrl,
    ].filter(Boolean))).map((url) => toAbsoluteUrl(url));
  }

  async function resolveGeneratedDocxBlob(previewPayload) {
    if (previewPayload && previewPayload.blob instanceof Blob) {
      return previewPayload.blob;
    }
    const candidates = buildGeneratedDocxUrlCandidates(previewPayload);
    if (!candidates.length) {
      throw new Error('Не удалось получить файл документа для предпросмотра.');
    }
    let lastStatus = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const url = candidates[index];
      try {
        const response = await fetchWithTimeout(url, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        }, 30000);
        if (!response || !response.ok) {
          lastStatus = response ? response.status : 0;
          continue;
        }
        const blob = await response.blob();
        if (blob && blob.size) return blob;
      } catch (_) {}
    }
    throw new Error(`Не удалось скачать документ для предпросмотра (${lastStatus || 'no_response'}).`);
  }

  async function downloadGeneratedPreviewFile(previewPayload) {
    const fileName = normalize(previewPayload && previewPayload.fileName) || 'template-answer.docx';
    const sourceUrl = normalize(previewPayload && previewPayload.previewUrl);
    const fallbackBlob = previewPayload && previewPayload.blob instanceof Blob ? previewPayload.blob : null;
    if (fallbackBlob && fallbackBlob.size) {
      const blobUrl = URL.createObjectURL(fallbackBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
      return true;
    }
    if (sourceUrl) {
      try {
        const response = await fetchWithTimeout(sourceUrl, { credentials: 'include', cache: 'no-store' }, 30000);
        if (response && response.ok) {
          const blob = await response.blob();
          if (blob && blob.size) {
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
            return true;
          }
        }
      } catch (_) {}
      try {
        const link = document.createElement('a');
        link.href = sourceUrl;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch (_) {}
      const telegramWebApp = globalScope && globalScope.Telegram && globalScope.Telegram.WebApp;
      if (telegramWebApp && typeof telegramWebApp.openLink === 'function') {
        try {
          telegramWebApp.openLink(sourceUrl);
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  async function ensureDocxPreviewLibrariesLoaded() {
    await loadBriefScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => Boolean(window.JSZip && typeof window.JSZip.loadAsync === 'function'));
    await loadBriefScript('https://cdn.jsdelivr.net/npm/docx-preview@0.3.6/dist/docx-preview.min.js', () => Boolean((window.docx && window.docx.renderAsync) || (window.docxPreview && window.docxPreview.renderAsync)));
    const renderer = (window.docx && window.docx.renderAsync) ? window.docx : ((window.docxPreview && window.docxPreview.renderAsync) ? window.docxPreview : null);
    if (!renderer || typeof renderer.renderAsync !== 'function') {
      throw new Error('docx_preview_not_loaded');
    }
    return renderer;
  }

  async function attachGeneratedDocxToTaskResponse(previewPayload, task = {}) {
    const documentId = normalize(task && task.id);
    const organization = normalize(
      task && (task.organization || task.organizationName || task.organizationTitle || task.organizationFullName || task.organizationShortName || task.org),
    );
    if (!documentId || !organization) {
      return { ok: false, skipped: true, reason: 'task_context_missing' };
    }
    const fileBlob = await resolveGeneratedDocxBlob(previewPayload);
    const resolveUploaderNameFromTask = () => {
      const pools = [
        task && task.subordinates,
        task && task.assignees,
        task && task.responsibles,
        task && task.responsible,
        task && task.executor,
      ];
      for (const pool of pools) {
        if (Array.isArray(pool)) {
          for (const item of pool) {
            const candidate = normalize(item && (item.responsible || item.name || item.fullName || item.fio || item.label || item.value || item));
            if (candidate) return candidate;
          }
          continue;
        }
        const candidate = normalize(pool && (pool.responsible || pool.name || pool.fullName || pool.fio || pool.label || pool.value || pool));
        if (candidate) return candidate;
      }
      return '';
    };
    const uploaderName = resolveUploaderNameFromTask() || resolveAuthorizedUserName(globalScope) || 'Пользователь';
    const date = new Date();
    const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const timeStamp = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
    const taskNumberRaw = normalize(task && (task.entryNumber || task.taskNumber || task.number || task.regNumber || task.documentNumber || task.id));
    const safeResponsible = uploaderName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'Пользователь';
    const safeTaskNumber = taskNumberRaw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || documentId;
    const fileName = `${safeResponsible}_${dateStamp}_${timeStamp}_${safeTaskNumber}.docx`;
    const formData = new FormData();
    formData.append('action', 'response_upload');
    formData.append('organization', organization);
    formData.append('documentId', documentId);
    formData.append('attachments[]', fileBlob, fileName);

    const telegramInitData = normalize(
      globalScope
      && globalScope.Telegram
      && globalScope.Telegram.WebApp
      && globalScope.Telegram.WebApp.initData,
    );
    const headers = {};
    if (telegramInitData) {
      headers['X-Telegram-Init-Data'] = telegramInitData;
    }

    const uploadUrl = `/docs.php?action=response_upload&organization=${encodeURIComponent(organization)}`;
    const response = await fetchWithTimeout(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    }, 45000);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success !== true) {
      const serverMessage = payload && (payload.error || payload.message);
      throw new Error(serverMessage || `Ошибка прикрепления к задаче (${response.status}).`);
    }
    try {
      if (typeof globalScope.CustomEvent === 'function' && typeof globalScope.dispatchEvent === 'function') {
        globalScope.dispatchEvent(new CustomEvent('documents:response-attached', {
          detail: { documentId, organization, fileName, payload },
        }));
      }
      if (globalScope && typeof globalScope.__APPDOSC_FORCE_REFRESH_TASKS__ === 'function') {
        Promise.resolve(globalScope.__APPDOSC_FORCE_REFRESH_TASKS__()).catch(() => {});
      }
    } catch (_) {}
    return { ok: true, fileName, payload };
  }

  async function openGeneratedDocxViaExistingPreview(previewPayload, context = {}) {
    if (!previewPayload || (typeof previewPayload !== 'object')) throw new Error('empty_preview_payload');
    const existing = document.querySelector('.tg-ai-generated-preview');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tg-ai-generated-preview';
    overlay.innerHTML = `
      <div class="tg-ai-generated-preview__card">
        <div class="tg-ai-generated-preview__head">
          <div>
            <div class="tg-ai-generated-preview__title">Предварительный просмотр</div>
            <div class="tg-ai-generated-preview__hint">Открытие через Office Viewer в этом окне</div>
          </div>
          <div class="tg-ai-generated-preview__tools">
            <div class="tg-ai-generated-preview__zoom">
              <button type="button" class="tg-ai-generated-preview__zoom-btn" data-preview-zoom-out aria-label="Уменьшить">−</button>
              <span class="tg-ai-generated-preview__zoom-value" data-preview-zoom-value>100%</span>
              <button type="button" class="tg-ai-generated-preview__zoom-btn" data-preview-zoom-in aria-label="Увеличить">+</button>
            </div>
            <button type="button" class="tg-ai-generated-preview__menu-toggle" data-preview-menu-toggle>Меню</button>
            <button type="button" class="tg-ai-generated-preview__close-icon" data-preview-close-icon aria-label="Закрыть">×</button>
          </div>
        </div>
        <div class="tg-ai-generated-preview__menu" data-preview-menu hidden>
          <button type="button" class="tg-ai-generated-preview__btn" data-preview-attach>Прикрепить к задаче</button>
          <button type="button" class="tg-ai-generated-preview__btn tg-ai-generated-preview__btn--primary" data-preview-download>Скачать</button>
          <button type="button" class="tg-ai-generated-preview__btn" data-preview-office>Office Viewer</button>
          <button type="button" class="tg-ai-generated-preview__btn" data-preview-close>Закрыть</button>
        </div>
        <div class="tg-ai-generated-preview__body">
          <div class="tg-ai-generated-preview__viewport" data-preview-viewport>
            <div class="tg-ai-generated-preview__doc" data-preview-doc aria-label="DOCX preview"></div>
          </div>
          <iframe class="tg-ai-generated-preview__frame" title="Office Web Viewer" data-preview-frame></iframe>
          <div class="tg-ai-generated-preview__loading" data-preview-loading>
            <div class="tg-ai-generated-preview__loading-card">
              <div class="tg-ai-generated-preview__loading-title">Открываем документ…</div>
              <div class="tg-ai-generated-preview__loading-sub" data-loading-sub>Быстрый просмотр через Office Viewer.</div>
              <div class="tg-ai-generated-preview__bar"></div>
            </div>
          </div>
        </div>
        <div class="tg-ai-generated-preview__status" data-preview-status>Подготовка предпросмотра…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const docNode = overlay.querySelector('[data-preview-doc]');
    const viewportNode = overlay.querySelector('[data-preview-viewport]');
    const frameNode = overlay.querySelector('[data-preview-frame]');
    const statusNode = overlay.querySelector('[data-preview-status]');
    const loadingNode = overlay.querySelector('[data-preview-loading]');
    const loadingSubNode = overlay.querySelector('[data-loading-sub]');
    const downloadBtn = overlay.querySelector('[data-preview-download]');
    const attachBtn = overlay.querySelector('[data-preview-attach]');
    const officeBtn = overlay.querySelector('[data-preview-office]');
    const menuNode = overlay.querySelector('[data-preview-menu]');
    const menuToggleBtn = overlay.querySelector('[data-preview-menu-toggle]');
    const closeIconBtn = overlay.querySelector('[data-preview-close-icon]');
    const zoomOutBtn = overlay.querySelector('[data-preview-zoom-out]');
    const zoomInBtn = overlay.querySelector('[data-preview-zoom-in]');
    const zoomValueNode = overlay.querySelector('[data-preview-zoom-value]');
    const closeBtn = overlay.querySelector('[data-preview-close]');
    const previewUrl = normalize(previewPayload.previewUrl);
    const generatedFileName = normalize(previewPayload.fileName)
      || normalize(previewUrl.split('/').pop());
    const officeSourceCandidates = buildGeneratedDocxUrlCandidates({
      previewUrl,
      fileName: generatedFileName,
    }).filter((url) => /^https?:\/\//i.test(url));
    const task = context && context.task ? context.task : {};
    const fallbackBlob = previewPayload.blob instanceof Blob ? previewPayload.blob : null;
    const blobUrl = fallbackBlob ? URL.createObjectURL(fallbackBlob) : '';
    let zoom = 1;

    const applyZoom = () => {
      if (!docNode) return;
      const normalized = Math.max(0.2, Math.min(1.6, Number(zoom) || 1));
      zoom = Number(normalized.toFixed(2));
      if ('zoom' in docNode.style) {
        docNode.style.zoom = String(zoom);
        docNode.style.transform = 'none';
        docNode.style.width = 'auto';
      } else {
        docNode.style.transform = `scale(${zoom})`;
        docNode.style.width = 'auto';
      }
      if (zoomValueNode) zoomValueNode.textContent = `${Math.round(zoom * 100)}%`;
    };

    const close = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (previewUrl || normalize(previewPayload.fileName)) {
        deleteGeneratedTempFile(previewPayload).catch(() => {});
      }
      overlay.remove();
    };
    const toggleMenu = (forceOpen) => {
      if (!menuNode) return;
      const open = typeof forceOpen === 'boolean' ? forceOpen : menuNode.hasAttribute('hidden');
      if (open) menuNode.removeAttribute('hidden');
      else menuNode.setAttribute('hidden', '');
    };
    closeBtn?.addEventListener('click', close);
    closeIconBtn?.addEventListener('click', close);
    menuToggleBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMenu();
    });
    overlay.addEventListener('click', (event) => {
      if (menuNode && !menuNode.contains(event.target) && event.target !== menuToggleBtn) {
        toggleMenu(false);
      }
      if (event.target === overlay) close();
    });
    zoomOutBtn?.addEventListener('click', () => {
      zoom = zoom - 0.1;
      applyZoom();
    });
    zoomInBtn?.addEventListener('click', () => {
      zoom = zoom + 0.1;
      applyZoom();
    });
    downloadBtn?.addEventListener('click', async () => {
      toggleMenu(false);
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Скачиваем…';
      }
      try {
        const ok = await downloadGeneratedPreviewFile(previewPayload);
        statusNode.textContent = ok ? 'Файл отправлен на скачивание.' : 'Не удалось скачать файл.';
      } finally {
        if (downloadBtn) {
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Скачать';
        }
      }
    });
    if (attachBtn) {
      const taskReady = Boolean(normalize(task && task.id));
      if (!taskReady) {
        attachBtn.disabled = true;
        attachBtn.textContent = 'Нет задачи';
      }
      attachBtn.addEventListener('click', async () => {
        toggleMenu(false);
        if (attachBtn.disabled) return;
        const prevText = attachBtn.textContent;
        attachBtn.disabled = true;
        attachBtn.textContent = 'Прикрепляем...';
        try {
          const result = await attachGeneratedDocxToTaskResponse(previewPayload, task);
          const taskNo = normalize(task && (task.entryNumber || task.taskNumber || task.number || task.id));
          statusNode.textContent = `Документ прикреплён: ${normalize(result && result.fileName) || 'DOCX-файл'}.`;
          showAttachSuccessToast(`✅ Задача №${taskNo || '—'} · файл: ${normalize(result && result.fileName) || 'DOCX-файл'}`);
          attachBtn.textContent = 'Прикреплено';
        } catch (error) {
          statusNode.textContent = `Не удалось прикрепить: ${(error && error.message) || 'неизвестная ошибка'}`;
          attachBtn.disabled = false;
          attachBtn.textContent = prevText;
        }
      });
    }

    const canUseOfficeViewer = officeSourceCandidates.length > 0;
    if (officeBtn && !canUseOfficeViewer) {
      officeBtn.disabled = true;
      officeBtn.title = 'Office Viewer доступен только по публичной HTTPS ссылке';
    }
    const openViaOfficeViewer = async () => {
      if (!canUseOfficeViewer) {
        statusNode.textContent = 'Office Viewer недоступен: нужна публичная ссылка на файл.';
        return false;
      }
      if (loadingNode) loadingNode.style.display = '';
      if (docNode) docNode.style.display = 'none';
      if (viewportNode) viewportNode.style.display = 'none';
      if (frameNode) {
        frameNode.style.display = '';
        frameNode.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      }
      statusNode.textContent = 'Открываем через Office Viewer…';
      const resolvedSource = await resolveFirstAvailableUrl(officeSourceCandidates);
      const sourceUrl = resolvedSource || officeSourceCandidates[0] || '';
      if (!sourceUrl) {
        if (loadingNode) loadingNode.style.display = 'none';
        return false;
      }
      return new Promise((resolve) => {
        const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`;
        let settled = false;
        const fallbackTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (loadingNode) loadingNode.style.display = 'none';
          statusNode.textContent = 'Не удалось открыть в окне. Нажмите «Скачать».';
          resolve(false);
        }, 5500);
        if (!frameNode) {
          clearTimeout(fallbackTimer);
          resolve(false);
          return;
        }
        frameNode.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallbackTimer);
          if (loadingNode) loadingNode.style.display = 'none';
          resolve(false);
        };
        frameNode.onload = () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallbackTimer);
          if (loadingNode) loadingNode.style.display = 'none';
          statusNode.textContent = 'Документ открыт через Office Viewer.';
          resolve(true);
        };
        frameNode.src = officeUrl;
      });
    };
    officeBtn?.addEventListener('click', () => {
      toggleMenu(false);
      openViaOfficeViewer().then((opened) => {
        if (!opened) {
          if (loadingNode) loadingNode.style.display = 'none';
          statusNode.textContent = 'Office Viewer недоступен. Нажмите «Скачать».';
        }
      });
    });
    const opened = await openViaOfficeViewer();
    if (!opened && loadingNode) loadingNode.style.display = 'none';
  }

  function openTemplateAnswerEditor(context = {}) {
    if (document.querySelector('.tg-ai-template-editor')) return;
    const aiText = normalize(context && context.aiAnswer) || DEFAULT_TEMPLATE_ANSWER_TEXT;
    const task = context && context.task ? context.task : {};
    const templateConfig = buildOrganizationTemplateConfig(task);
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
            <div class="tg-ai-template-editor__sub">Проверьте текст ИИ и заполните дату, номер и адресата • ${escapeHtml(templateConfig.compactTemplateLabel)}</div>
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
      const defaultTemplateFieldValue = '_____';
      const day = normalize(dayInput && dayInput.value) || defaultTemplateFieldValue;
      const month = normalize(monthInput && monthInput.value) || defaultTemplateFieldValue;
      const number = normalize(numberInput && numberInput.value) || defaultTemplateFieldValue;
      const addresseeRaw = String(addresseeInput && addresseeInput.value || '').replace(/\s+$/g, '');
      const addressee = normalize(addresseeRaw) || defaultTemplateFieldValue;
      if (!answer) {
        renderError('Добавьте текст ответа ИИ.');
        return;
      }
      const addresseeTemplateValue = /^\s/.test(addressee) ? addressee : (`\u00A0${addressee}`);
      if (globalScope) {
        globalScope.DOCUMENTS_LAST_AI_ANSWER = answer;
        globalScope.DOCUMENTS_TEMPLATE_META = { day, month, number, addressee: addresseeRaw };
      }
      renderError('');
      if (doneButton) {
        doneButton.disabled = true;
        doneButton.innerHTML = '<span class="tg-ai-chat__spinner" aria-hidden="true"></span>Генерируем...';
      }
      if (onStatus) onStatus('Генерируем DOCX по шаблону...');
      try {
        const preparedAnswer = answer
          .replace(/\[ДЕНЬ\]/g, day)
          .replace(/\[МЕСЯЦ\]/g, month)
          .replace(/\[НОМЕР\]/g, number)
          .replace(/\[АДРЕСАТ\]/g, addresseeTemplateValue);
        const previewPayload = await generateDocxFromTemplateViaApi(preparedAnswer, {
          day,
          month,
          number,
          addressee: addresseeTemplateValue,
          organization: templateConfig.organization,
          templatePath: templateConfig.templatePath,
          templateFileName: templateConfig.templateFileName,
        });
        close();
        if (onStatus) onStatus('Открываем результат в предпросмотре...');
        await openGeneratedDocxViaExistingPreview(previewPayload, { task });
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
    const task = context && context.task ? context.task : null;
    const templateConfig = buildOrganizationTemplateConfig(task || {});
    const templateDocxCandidates = [
      templateConfig.templatePath,
      ...getTemplateDocxCandidates(),
    ].filter(Boolean);

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
            <div class="tg-ai-template-preview__hint">Открываем ${escapeHtml(templateConfig.compactTemplateLabel)} в режиме предпросмотра</div>
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
          name: templateConfig.templateFileName || 'template.docx',
          originalName: templateConfig.templateFileName || 'template.docx',
          storedName: templateConfig.templateFileName || 'template.docx',
          url: docxUrl,
          resolvedUrl: absoluteDocx,
          previewUrl: docxUrl,
          fileUrl: docxUrl,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };

        frame.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteDocx)}`;
        status.textContent = `Готово: ${templateConfig.templateFileName || 'template.docx'} открыт.`;

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
      status.textContent = `Не удалось найти ${templateConfig.templateFileName || 'template.docx'}.`;
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
            <div class="tg-ai-chat__sub">Выберите файлы, режим и введите запрос (текстом или голосом)</div>
          </div>
          <div class="tg-ai-chat__head-actions">
            <button type="button" class="tg-ai-chat__head-btn" data-template-btn>Шаблон</button>
            <button type="button" class="tg-ai-chat__close" data-close>✕</button>
          </div>
        </div>
        <div class="tg-ai-chat__messages" data-messages>
          <div class="tg-ai-chat__bubble tg-ai-chat__bubble--assistant">Выберите файлы, режим ответа и напишите задачу. Можно нажать 🎤 и продиктовать.</div>
        </div>
        <div class="tg-ai-chat__status" data-status>Выберите режим, добавьте запрос и нажмите «Отправить».</div>
        <div class="tg-ai-chat__files" data-files hidden>
          <p class="tg-ai-chat__files-title">Файлы из текущей задачи:</p>
          <div class="tg-ai-chat__files-list" data-files-list></div>
        </div>
        <div class="tg-ai-chat__composer">
          <div class="tg-ai-chat__toolbar tg-ai-chat__toolbar--compact">
            <button type="button" class="tg-ai-chat__toggle" data-files-toggle>📎 Файлы</button>
            <select class="tg-ai-chat__select" data-style-select aria-label="Стиль ответа">
              <option value="" selected>🎯 Выберите режим</option>
              ${RESPONSE_STYLE_OPTIONS.map((item) => `<option value="${escapeHtml(item.value)}">🎯 ${escapeHtml(item.label)}</option>`).join('')}
            </select>
          </div>
          <div class="tg-ai-chat__input-row">
            <textarea class="tg-ai-chat__input" data-prompt-input rows="2" placeholder="Например: Подготовь деловой ответ на претензию по этому документу"></textarea>
            <button type="button" class="tg-ai-chat__icon-btn" data-voice-btn aria-label="Голосовой ввод">🎤</button>
            <button type="button" class="tg-ai-chat__send" data-send-btn>Отправить</button>
          </div>
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
    const filesToggleButton = overlay.querySelector('[data-files-toggle]');
    const meta = overlay.querySelector('[data-meta]');
    const styleSelect = overlay.querySelector('[data-style-select]');
    const templateButton = overlay.querySelector('[data-template-btn]');
    const promptInput = overlay.querySelector('[data-prompt-input]');
    const sendButton = overlay.querySelector('[data-send-btn]');
    const voiceButton = overlay.querySelector('[data-voice-btn]');
    let styleIndex = 0;
    let isSending = false;
    let lastAiAnswer = '';
    let recognition = null;
    let recognitionIsRunning = false;
    let speechSupported = false;
    let suppressVoiceEndStatus = false;

    renderFiles(filesList, files);

    const close = () => {
      if (recognitionIsRunning && recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      overlay.remove();
    };
    overlay.querySelector('[data-close]')?.addEventListener('click', close);

    const updateFilesToggleLabel = () => {
      if (!filesToggleButton) return;
      filesToggleButton.textContent = selected.size ? `📎 Файлы (${selected.size})` : '📎 Файлы';
    };

    filesToggleButton?.addEventListener('click', () => {
      if (!filesPanel) return;
      filesPanel.hidden = !filesPanel.hidden;
      status.textContent = filesPanel.hidden ? 'Панель файлов скрыта.' : 'Выберите нужные файлы (по умолчанию ничего не выбрано).';
    });

    const setComposerDisabled = (disabled) => {
      if (styleSelect) styleSelect.disabled = disabled;
      if (promptInput) promptInput.disabled = disabled;
      if (sendButton) sendButton.disabled = disabled;
      if (voiceButton) voiceButton.disabled = disabled || !speechSupported;
    };

    const appendPromptText = (chunk) => {
      if (!promptInput) return;
      const prev = normalize(promptInput.value);
      const next = normalize(chunk);
      promptInput.value = prev && next ? `${prev} ${next}` : (next || prev);
      promptInput.dispatchEvent(new Event('input'));
    };

    const setVoiceState = (active) => {
      recognitionIsRunning = Boolean(active);
      if (voiceButton) {
        voiceButton.dataset.active = recognitionIsRunning ? 'true' : 'false';
        voiceButton.textContent = recognitionIsRunning ? '🛑' : '🎤';
      }
      if (recognitionIsRunning) {
        status.textContent = 'Слушаю голос... скажите текст запроса.';
      }
    };

    const SpeechRecognitionClass = globalScope.SpeechRecognition || globalScope.webkitSpeechRecognition;
    if (typeof SpeechRecognitionClass === 'function') {
      speechSupported = true;
      const bindRecognitionHandlers = (instance) => {
        if (!instance) return;
        instance.lang = 'ru-RU';
        instance.interimResults = true;
        instance.continuous = false;
        instance.maxAlternatives = 1;
        instance.onresult = (event) => {
          const list = event && event.results ? event.results : [];
          let finalText = '';
          let interimText = '';
          for (let index = event.resultIndex || 0; index < list.length; index += 1) {
            const current = list[index];
            if (!current || !current[0]) continue;
            const transcript = normalize(current[0].transcript);
            if (!transcript) continue;
            if (current.isFinal) {
              finalText += (finalText ? ' ' : '') + transcript;
            } else {
              interimText += (interimText ? ' ' : '') + transcript;
            }
          }
          if (finalText) {
            appendPromptText(finalText);
          }
          if (interimText) {
            status.textContent = `Распознано: ${interimText}`;
          }
        };
        instance.onerror = (event) => {
          const errorCode = normalize(event && event.error);
          suppressVoiceEndStatus = true;
          setVoiceState(false);
          if (errorCode === 'aborted') {
            status.textContent = 'Голосовой ввод остановлен.';
            return;
          }
          if (errorCode === 'no-speech') {
            status.textContent = 'Речь не распознана. Скажите запрос ещё раз.';
            return;
          }
          if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
            status.textContent = 'Нет доступа к микрофону. Разрешите доступ в Telegram и попробуйте снова.';
            return;
          }
          if (errorCode === 'audio-capture') {
            status.textContent = 'Микрофон не найден. Проверьте устройство.';
            return;
          }
          status.textContent = 'Ошибка голосового ввода. Попробуйте ещё раз.';
        };
        instance.onend = () => {
          setVoiceState(false);
          if (!isSending && !suppressVoiceEndStatus) {
            status.textContent = 'Голосовой ввод завершён.';
          }
          suppressVoiceEndStatus = false;
        };
      };
      recognition = new SpeechRecognitionClass();
      bindRecognitionHandlers(recognition);
    } else if (voiceButton) {
      voiceButton.disabled = true;
      voiceButton.title = 'Голосовой ввод не поддерживается в этом устройстве.';
    }

    voiceButton?.addEventListener('click', () => {
      if (!recognition || !speechSupported) {
        status.textContent = 'На этом устройстве голосовой ввод недоступен.';
        return;
      }
      if (recognitionIsRunning) {
        suppressVoiceEndStatus = true;
        recognition.stop();
        setVoiceState(false);
        return;
      }
      try {
        suppressVoiceEndStatus = false;
        recognition.start();
        setVoiceState(true);
      } catch (error) {
        const message = normalize(error && error.message).toLowerCase();
        if (message.includes('already started')) {
          try {
            recognition.stop();
          } catch (_) {}
          setTimeout(() => {
            try {
              suppressVoiceEndStatus = false;
              recognition.start();
              setVoiceState(true);
            } catch (_) {
              status.textContent = 'Не удалось перезапустить голосовой ввод. Попробуйте ещё раз.';
            }
          }, 120);
          return;
        }
        status.textContent = 'Не удалось включить микрофон. Проверьте доступ к нему.';
      }
    });

    promptInput?.addEventListener('input', () => {
      if (!promptInput) return;
      promptInput.style.height = '0px';
      promptInput.style.height = `${Math.min(Math.max(promptInput.scrollHeight, 52), 156)}px`;
    });
    promptInput?.dispatchEvent(new Event('input'));

    async function sendByCurrentStyle() {
      if (isSending) return;
      const selectedStyleValue = normalize(styleSelect && styleSelect.value);
      if (!selectedStyleValue) {
        status.textContent = 'Выберите режим ответа.';
        return;
      }
      const userPrompt = normalize(promptInput && promptInput.value);
      if (!userPrompt) {
        status.textContent = 'Введите запрос для ИИ или продиктуйте его голосом.';
        return;
      }
      const styleIndexFromSelect = RESPONSE_STYLE_OPTIONS.findIndex((item) => item.value === selectedStyleValue);
      if (styleIndexFromSelect >= 0) {
        styleIndex = styleIndexFromSelect;
      }
      const styleMeta = RESPONSE_STYLE_OPTIONS[styleIndex] || RESPONSE_STYLE_OPTIONS[0];
      const prompt = `Задача пользователя: ${userPrompt}\n\nПодготовь готовый текст ответа по выбранным файлам для вставки в документ: только суть, без приветствия и реквизитов.`;
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
      setComposerDisabled(true);
      if (filesPanel) filesPanel.hidden = true;
      lastAiAnswer = '';
      meta.innerHTML = '';
      createBubble(messages, userPrompt, 'user');
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
        setComposerDisabled(false);
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
    });

    sendButton?.addEventListener('click', () => {
      sendByCurrentStyle();
    });

    promptInput?.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendByCurrentStyle();
      }
    });

    filesList?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
      const key = normalize(target.dataset.fileIndex);
      if (!key) return;
      if (target.checked) selected.add(key);
      else selected.delete(key);
      updateFilesToggleLabel();
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

    updateFilesToggleLabel();

  };
}(typeof window !== 'undefined' ? window : globalThis));
