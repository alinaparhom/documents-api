(function initTelegramAiResponseDialog(globalScope) {
  if (!globalScope || typeof document === 'undefined') return;

  const STYLE_ID = 'tg-ai-response-dialog-style-v2';
  const GROQ_RESPONSE_FALLBACK_ENDPOINTS = ['/js/documents/api-groq-paid.php', '/api-groq-paid.php'];
  const REQUEST_TIMEOUT_MS = 45000;
  const FILE_FETCH_TIMEOUT_MS = 12000;
  const FILE_FETCH_RETRIES = 1;
  const FILE_FETCH_RETRIES_MOBILE = 0;
  const FILE_FETCH_TIMEOUT_STEPS_IOS = [2800, 4200, 6200, 9000];
  const FILE_FETCH_MAX_CANDIDATES = 8;
  const FILE_PREPARE_TIMEOUT_MS = 35000;
  const FILE_PREPARE_TIMEOUT_MS_MOBILE = 16000;
  const DOCS_GENERATE_FALLBACK_ENDPOINTS = ['/js/documents/api-docs.php', '/api-docs.php'];
  const DEFAULT_RESPONSE_AI_PROMPT_TEXT = 'Подготовь деловой ответ на входящее письмо/обращение по этому документу';
  const FIXED_RESPONSE_TONE = 'calm';
  const FIXED_RESPONSE_MODE = 'response_ai';
  const VISION_BATCH_SIZE = 5;
  const MAX_FILES_PER_REQUEST = 5;
  const MAX_FILES_PER_REQUEST_MOBILE = 2;
  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
  const MAX_FILE_SIZE_BYTES_MOBILE = 12 * 1024 * 1024;
  const VISION_CONCURRENCY_DEFAULT = 3;
  const VISION_CONCURRENCY_MOBILE = 1;
  const AI_PDF_PAGE_LIMIT = 5;
  const PDF_TEXT_MIN_CHARS = 80;
  const PDF_RENDER_SCALE = 1.25;
  const PDF_JPEG_QUALITY = 0.82;
  const PDF_WORKER_CANDIDATES = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    '/pdf/pdf.worker.min.js',
  ];
  let briefPdfJsLoader = null;
  const PROMPTS_CATALOG = globalScope.DOCS_AI_PROMPTS || null;
  const DEFAULT_PROMPT_KEYS = PROMPTS_CATALOG && PROMPTS_CATALOG.DEFAULT_KEYS
    ? PROMPTS_CATALOG.DEFAULT_KEYS
    : { response_mode: 'v1', vision_quality_mode: 'v1', tone: FIXED_RESPONSE_TONE, assistant_mode: FIXED_RESPONSE_MODE };
  const SYSTEM_TONE_PROMPTS = (() => {
    const fallback = {
      neutral: { value: 'neutral', label: 'Нейтральный', prompt: '' },
      calm: { value: 'calm', label: 'Спокойный', prompt: '' },
      positive: { value: 'positive', label: 'Положительный', prompt: '' },
      negative: { value: 'negative', label: 'Отрицательный', prompt: '' },
    };
    const source = PROMPTS_CATALOG && PROMPTS_CATALOG.SYSTEM_TONE_PROMPTS && typeof PROMPTS_CATALOG.SYSTEM_TONE_PROMPTS === 'object'
      ? PROMPTS_CATALOG.SYSTEM_TONE_PROMPTS
      : {};
    const merged = { ...fallback, ...source };
    return merged;
  })();
  const RESPONSE_GENERATION_MODES = {
    improve_ai: {
      value: 'improve_ai',
      label: 'Ответ',
      icon: '✏️',
      hint: 'Вы пишете черновик, ИИ улучшает его по файлам.',
      placeholder: 'Напишите или продиктуйте ваш черновик ответа — ИИ аккуратно улучшит текст.',
    },
    response_ai: {
      value: 'response_ai',
      label: 'Ответ ИИ',
      icon: '🤖',
      hint: 'Выберите файлы и нажмите «Отправить». ИИ подготовит только текст ответа.',
      placeholder: DEFAULT_RESPONSE_AI_PROMPT_TEXT,
    },
  };
  let jsZipLoaderPromise = null;
  const loadedFileCache = new Map();
  const MODAL_SCROLLABLE_SELECTOR = [
    '.tg-ai-chat__messages',
    '.tg-ai-chat__files-list',
    '.tg-ai-template-editor__body',
    '.tg-ai-generated-preview__viewport',
    '.tg-ai-template-preview__body',
  ].join(',');

  function normalize(value) {
    return String(value || '').trim();
  }

  function createModalViewportController(overlay) {
    if (!(overlay instanceof HTMLElement)) {
      return { destroy: function noopDestroy() {} };
    }

    const html = document.documentElement;
    const body = document.body;
    const scrollX = typeof globalScope.pageXOffset === 'number' ? globalScope.pageXOffset : 0;
    const scrollY = typeof globalScope.pageYOffset === 'number' ? globalScope.pageYOffset : 0;
    const previousHtmlOverflow = html ? html.style.overflow : '';
    const previousHtmlHeight = html ? html.style.height : '';
    const previousBodyPosition = body ? body.style.position : '';
    const previousBodyTop = body ? body.style.top : '';
    const previousBodyLeft = body ? body.style.left : '';
    const previousBodyRight = body ? body.style.right : '';
    const previousBodyWidth = body ? body.style.width : '';
    const previousBodyOverflow = body ? body.style.overflow : '';
    let lastTouchY = 0;
    let destroyed = false;

    if (html) {
      html.style.overflow = 'hidden';
      html.style.height = '100%';
    }
    if (body) {
      body.style.position = 'fixed';
      body.style.top = '-' + scrollY + 'px';
      body.style.left = '-' + scrollX + 'px';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    }

    function updateViewport() {
      if (destroyed) {
        return;
      }
      const viewport = globalScope.visualViewport;
      const height = viewport && Number(viewport.height) > 0
        ? Number(viewport.height)
        : (globalScope.innerHeight || document.documentElement.clientHeight || 0);
      const offsetTop = viewport && Number(viewport.offsetTop) > 0
        ? Number(viewport.offsetTop)
        : 0;
      overlay.style.setProperty('--tg-ai-viewport-height', Math.max(320, Math.floor(height)) + 'px');
      overlay.style.setProperty('--tg-ai-viewport-top', Math.max(0, Math.floor(offsetTop)) + 'px');
    }

    function findScrollableTarget(target) {
      const node = target instanceof Element ? target.closest(MODAL_SCROLLABLE_SELECTOR) : null;
      if (!(node instanceof HTMLElement) || !overlay.contains(node)) {
        return null;
      }
      return node.scrollHeight > node.clientHeight + 1 ? node : null;
    }

    function handleTouchStart(event) {
      if (event.touches && event.touches.length) {
        lastTouchY = event.touches[0].clientY;
      }
    }

    function handleTouchMove(event) {
      if (!event.touches || event.touches.length !== 1) {
        return;
      }
      const scrollable = findScrollableTarget(event.target);
      if (!scrollable) {
        event.preventDefault();
        return;
      }
      const currentY = event.touches[0].clientY;
      const movingDown = currentY > lastTouchY;
      const atTop = scrollable.scrollTop <= 0;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
      if ((movingDown && atTop) || (!movingDown && atBottom)) {
        event.preventDefault();
      }
      lastTouchY = currentY;
    }

    updateViewport();
    if (globalScope.visualViewport && typeof globalScope.visualViewport.addEventListener === 'function') {
      globalScope.visualViewport.addEventListener('resize', updateViewport);
      globalScope.visualViewport.addEventListener('scroll', updateViewport);
    }
    if (typeof globalScope.addEventListener === 'function') {
      globalScope.addEventListener('resize', updateViewport);
      globalScope.addEventListener('orientationchange', updateViewport);
    }
    overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false });

    return {
      destroy: function destroyModalViewportController() {
        if (destroyed) {
          return;
        }
        destroyed = true;
        overlay.removeEventListener('touchstart', handleTouchStart);
        overlay.removeEventListener('touchmove', handleTouchMove);
        if (globalScope.visualViewport && typeof globalScope.visualViewport.removeEventListener === 'function') {
          globalScope.visualViewport.removeEventListener('resize', updateViewport);
          globalScope.visualViewport.removeEventListener('scroll', updateViewport);
        }
        if (typeof globalScope.removeEventListener === 'function') {
          globalScope.removeEventListener('resize', updateViewport);
          globalScope.removeEventListener('orientationchange', updateViewport);
        }
        if (html) {
          html.style.overflow = previousHtmlOverflow;
          html.style.height = previousHtmlHeight;
        }
        if (body) {
          body.style.position = previousBodyPosition;
          body.style.top = previousBodyTop;
          body.style.left = previousBodyLeft;
          body.style.right = previousBodyRight;
          body.style.width = previousBodyWidth;
          body.style.overflow = previousBodyOverflow;
        }
        if (typeof globalScope.scrollTo === 'function') {
          globalScope.scrollTo(scrollX, scrollY);
        }
      },
    };
  }


  function isIosClient() {
    try {
      const ua = String((globalScope && globalScope.navigator && globalScope.navigator.userAgent) || '');
      const platform = String((globalScope && globalScope.navigator && globalScope.navigator.platform) || '');
      const touchPoints = Number((globalScope && globalScope.navigator && globalScope.navigator.maxTouchPoints) || 0);
      const isTouchMac = /Mac/i.test(platform) && touchPoints > 1;
      return /iPad|iPhone|iPod/i.test(ua) || isTouchMac;
    } catch (_) {
      return false;
    }
  }

  function isAndroidClient() {
    try {
      const ua = String((globalScope && globalScope.navigator && globalScope.navigator.userAgent) || '');
      return /Android/i.test(ua);
    } catch (_) {
      return false;
    }
  }

  function isLikelyWebViewClient() {
    try {
      const ua = String((globalScope && globalScope.navigator && globalScope.navigator.userAgent) || '');
      if (isIosClient()) {
        return /WebView|Telegram|FBAN|FBAV|Line\//i.test(ua) || (/AppleWebKit/i.test(ua) && !/Safari/i.test(ua));
      }
      if (isAndroidClient()) {
        return /; wv\)|\bwv\b|Version\/[\d.]+|Telegram/i.test(ua);
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function getClientVisionProfile() {
    const fastMobile = isLikelyWebViewClient();
    return {
      isFastMobile: fastMobile,
      fetchRetries: fastMobile ? FILE_FETCH_RETRIES_MOBILE : FILE_FETCH_RETRIES,
      prepareTimeoutMs: fastMobile ? FILE_PREPARE_TIMEOUT_MS_MOBILE : FILE_PREPARE_TIMEOUT_MS,
      maxConcurrency: fastMobile ? VISION_CONCURRENCY_MOBILE : VISION_CONCURRENCY_DEFAULT,
      maxFilesPerRequest: fastMobile ? MAX_FILES_PER_REQUEST_MOBILE : MAX_FILES_PER_REQUEST,
      maxFileSizeBytes: fastMobile ? MAX_FILE_SIZE_BYTES_MOBILE : MAX_FILE_SIZE_BYTES,
    };
  }

  function getFileCacheKey(file) {
    const name = normalize(file && (file.storedName || file.originalName || file.name));
    const url = normalize(file && (file.resolvedUrl || file.previewUrl || file.url || file.sourceUrl));
    const size = Number(file && (file.size || file.fileSize)) || 0;
    return `${name}|${url}|${size}`;
  }

  function sanitizeAssistantFinalText(value) {
    let normalizedText = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalizedText) return '';

    normalizedText = normalizedText
      .replace(/<think[\s\S]*?<\/think>/gi, '')
      .replace(/<\/?think>/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/^\s{0,3}[>*•●▪◦·]\s+/gm, '')
      .replace(/^\s{0,3}[-*]\s+(?!\d+\.)/gm, '')
      .replace(/^\s*(?:готовый\s+ответ|ответ\s*ии|текст\s+ответа|текст\s+ответа\s*ии)\s*:\s*/gim, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const serviceHeadingPattern = /^\s*(?:готовый\s+ответ|ответ\s*ии|ответ|текст\s+ответа|текст\s+ответа\s*ии|анализ|разбор|краткое\s+содержание|итог(?:\s+по\s+блокам)?|вывод|рекомендации|действия|служебн(?:ая|ые)\s+.*)\s*:?\s*$/iu;
    const signatureLinePattern = /^\s*(?:(?:с\s+уважением|с\s+наилучшими\s+пожеланиями|подпись|реквизиты?|контакты?|(?:\[)?ваше\s+фио(?:\])?|фио)\b|(?:руководитель|директор|генеральный\s+директор|исполнитель)\s*:)/iu;
    const contactLinePattern = /^\s*(?:(?:тел(?:ефон)?\.?|e-?mail|почта|унп|инн|кпп|огрн|бик|р\/с|расч[её]тный\s+сч[её]т|корр\.?\s*сч[её]т)\b|(?:адрес|сайт)\s*:)/iu;
    const warningLinePattern = /^\s*(?:⚠️|предупреждение\b|не\s+удалось\s+обработать\s+часть\s+файлов|часть\s+файлов\s+не\s+удалось\s+обработать)/iu;
    const promptEchoPattern = /^\s*(?:сформируй|подготовь|верни|напиши)\s+(?:официальный|деловой|готовый)?\s*ответ\b/iu;

    let lines = normalizedText.split('\n').map((line) => line.trimEnd());
    const firstContentIndex = lines.findIndex((line) => normalize(line));
    if (firstContentIndex >= 0) {
      const firstLine = normalize(lines[firstContentIndex]);
      if (/^(?:уважаем(?:ый|ая|ые)|здравствуйте|добрый\s+(?:день|вечер|утро)|приветствую)\b/iu.test(firstLine)) {
        lines.splice(firstContentIndex, 1);
      }
    }

    let cutIndex = lines.length;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const current = normalize(lines[index]);
      if (!current) continue;
      if (signatureLinePattern.test(current) || contactLinePattern.test(current)) {
        cutIndex = index;
      }
    }

    const cleanedLines = [];
    for (const rawLine of lines.slice(0, cutIndex)) {
      const line = normalize(rawLine);
      if (!line) {
        if (cleanedLines.length && cleanedLines[cleanedLines.length - 1] !== '') {
          cleanedLines.push('');
        }
        continue;
      }
      if (
        serviceHeadingPattern.test(line)
        || signatureLinePattern.test(line)
        || contactLinePattern.test(line)
        || warningLinePattern.test(line)
        || promptEchoPattern.test(line)
        || /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(line)
        || /^https?:\/\//i.test(line)
      ) {
        continue;
      }
      const previous = cleanedLines.length ? normalize(cleanedLines[cleanedLines.length - 1]).toLowerCase() : '';
      if (previous && previous === line.toLowerCase()) {
        continue;
      }
      cleanedLines.push(line);
    }

    return cleanedLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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

  function escapeSelectorAttribute(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function getResponseStyleMeta(styleValue) {
    const normalizedStyle = normalize(styleValue);
    const directMatch = normalizedStyle ? SYSTEM_TONE_PROMPTS[normalizedStyle] : null;
    if (directMatch) return directMatch;
    const valueMatch = Object.values(SYSTEM_TONE_PROMPTS)
      .find((item) => item && normalize(item.value) === normalizedStyle);
    return valueMatch || SYSTEM_TONE_PROMPTS.calm || SYSTEM_TONE_PROMPTS.neutral || { value: 'neutral', label: 'Нейтральный', prompt: '' };
  }

  function appendPromptSelection(formData, toneValue, assistantModeValue) {
    if (!(formData instanceof FormData)) return;
    const resolvedTone = normalize(toneValue) || DEFAULT_PROMPT_KEYS.tone || FIXED_RESPONSE_TONE;
    const resolvedAssistantMode = normalize(assistantModeValue) || DEFAULT_PROMPT_KEYS.assistant_mode || FIXED_RESPONSE_MODE;
    formData.append('response_mode', DEFAULT_PROMPT_KEYS.response_mode || 'v1');
    formData.append('vision_quality_mode', DEFAULT_PROMPT_KEYS.vision_quality_mode || 'v1');
    formData.append('tone', resolvedTone);
    formData.append('assistant_mode', resolvedAssistantMode);
  }

  function getGroqResponseEndpoints() {
    const configured = normalize(globalScope && (globalScope.GROQ_PAID_API_URL || globalScope.TELEGRAM_GROQ_API_URL));
    const endpoints = configured ? [configured, ...GROQ_RESPONSE_FALLBACK_ENDPOINTS] : GROQ_RESPONSE_FALLBACK_ENDPOINTS.slice();
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  function getTimingNow() {
    return typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function calculateNetworkMbps(bytes, durationMs) {
    const byteCount = Number(bytes);
    const ms = Number(durationMs);
    if (!Number.isFinite(byteCount) || byteCount <= 0 || !Number.isFinite(ms) || ms <= 0) {
      return 0;
    }
    return byteCount * 8 / ms / 1000;
  }

  function emitNetworkSample(onNetworkSample, sample = {}) {
    if (typeof onNetworkSample !== 'function') {
      return;
    }
    try {
      onNetworkSample({
        ...sample,
        at: Date.now(),
      });
    } catch (_) {
      // Диагностика сети не должна ломать основной сценарий.
    }
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

  async function postGroqResponseWithFallback(createFormData, options = {}) {
    const endpoints = getGroqResponseEndpoints();
    const onNetworkSample = options && typeof options.onNetworkSample === 'function'
      ? options.onNetworkSample
      : null;
    let lastResult = null;
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      let response = null;
      let payload = null;
      const startedAt = getTimingNow();
      try {
        response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          credentials: 'include',
          body: createFormData(),
        });
        payload = await response.json().catch(() => null);
        emitNetworkSample(onNetworkSample, {
          type: 'api',
          ok: Boolean(response && response.ok),
          status: Number(response && response.status) || 0,
          durationMs: Math.max(0, Math.round(getTimingNow() - startedAt)),
          endpoint,
        });
      } catch (error) {
        emitNetworkSample(onNetworkSample, {
          type: 'api',
          ok: false,
          timedOut: Boolean(error && error.name === 'AbortError'),
          durationMs: Math.max(0, Math.round(getTimingNow() - startedAt)),
          endpoint,
        });
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

  function getTemplateMarkerValue(marker) {
    return String(marker || '').trim().toUpperCase();
  }

  async function ensureJsZipLoaded() {
    if (typeof window !== 'undefined' && window.JSZip && typeof window.JSZip.loadAsync === 'function') {
      return window.JSZip;
    }
    if (!jsZipLoaderPromise) {
      jsZipLoaderPromise = loadBriefScript(
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
        () => Boolean(window.JSZip && typeof window.JSZip.loadAsync === 'function'),
      )
        .then(() => window.JSZip)
        .catch((error) => {
          jsZipLoaderPromise = null;
          throw error;
        });
    }
    return jsZipLoaderPromise;
  }

  async function detectTemplateMarkers(task = {}) {
    const defaults = { hasYear: false };
    try {
      const templateConfig = buildOrganizationTemplateConfig(task);
      const candidates = [
        templateConfig.templatePath,
        ...getTemplateDocxCandidates(),
      ];
      const templateUrl = await resolveFirstAvailableUrl(candidates) || pickPreferredTemplateDocxUrl(candidates);
      if (!templateUrl) return defaults;
      const JSZipLib = await ensureJsZipLoaded();
      const response = await fetchWithTimeout(templateUrl, { credentials: 'include', cache: 'no-store' }, 12000);
      if (!response || !response.ok) return defaults;
      const buffer = await response.arrayBuffer();
      const zip = await JSZipLib.loadAsync(buffer);
      const documentXmlFile = zip.file('word/document.xml');
      if (!documentXmlFile) return defaults;
      const xml = await documentXmlFile.async('text');
      const compactXml = String(xml || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
      return {
        hasYear: compactXml.includes(getTemplateMarkerValue('[ГОД]')),
      };
    } catch (_) {
      return defaults;
    }
  }

  function buildFileUrlCandidates(file) {
    const sourceValues = [
      file && file.previewBlobUrl,
      file && file.resolvedUrl,
      file && file.previewUrl,
      file && file.url,
      file && file.sourceUrl,
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

  function appendCacheBuster(url) {
    const normalized = normalize(url);
    if (!normalized) return '';
    try {
      const parsed = new URL(normalized, window.location.origin);
      parsed.searchParams.set('v', String(Date.now()));
      return parsed.toString();
    } catch (_) {
      const separator = normalized.includes('?') ? '&' : '?';
      return `${normalized}${separator}v=${Date.now()}`;
    }
  }

  function withTimeout(promise, timeoutMs, timeoutMessage) {
    const timeout = Math.max(1000, Number(timeoutMs) || 1000);
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(timeoutMessage || 'Истекло время ожидания.'));
      }, timeout);
      Promise.resolve(promise)
        .then((value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(error);
        });
    });
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

  function isTextLike(name, type) {
    const lowerName = normalize(name).toLowerCase();
    const lowerType = normalize(type).toLowerCase();
    return lowerType.startsWith('text/') || /\.(txt|md|csv|json|xml|html?)$/i.test(lowerName);
  }

  function isDocxLike(name, type) {
    const lowerName = normalize(name).toLowerCase();
    const lowerType = normalize(type).toLowerCase();
    return lowerType.includes('wordprocessingml.document') || /\.docx$/i.test(lowerName);
  }

  function isDocLike(name, type) {
    const lowerName = normalize(name).toLowerCase();
    const lowerType = normalize(type).toLowerCase();
    return lowerType === 'application/msword' || /\.doc$/i.test(lowerName);
  }

  function isXlsxLike(name, type) {
    const lowerName = normalize(name).toLowerCase();
    const lowerType = normalize(type).toLowerCase();
    return lowerType.includes('spreadsheetml') || /\.xlsx$/i.test(lowerName);
  }

  function isSupportedVisionFile(name, type) {
    return isImageLike(name, type) || isPdfLike(name, type) || isTextLike(name, type) || isDocLike(name, type) || isDocxLike(name, type) || isXlsxLike(name, type);
  }

  function validateFilesBeforeSend(files, profile) {
    const list = Array.isArray(files) ? files : [];
    const maxFiles = Number(profile && profile.maxFilesPerRequest) || MAX_FILES_PER_REQUEST;
    const maxSizeBytes = Number(profile && profile.maxFileSizeBytes) || MAX_FILE_SIZE_BYTES;
    if (!list.length) {
      return { ok: false, error: 'Нет готовых файлов для отправки.' };
    }
    if (list.length > maxFiles) {
      return { ok: false, error: 'Выберите меньше файлов' };
    }
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      const fileName = normalize(file && (file.originalName || file.name || file.storedName)) || `Файл ${index + 1}`;
      const fileType = normalize(file && (file.mimeType || file.type || file.contentType));
      const fileSize = Number(file && (file.size || file.fileSize || (file.fileObject && file.fileObject.size))) || 0;
      if (!isSupportedVisionFile(fileName, fileType)) {
        return { ok: false, error: `Неподдерживаемый формат: ${fileName}` };
      }
      if (fileSize > maxSizeBytes) {
        return { ok: false, error: `Файл слишком большой: ${fileName}` };
      }
    }
    return { ok: true };
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

  async function extractPdfTextFromDocument(pdf, pages, onProgress) {
    const textParts = [];
    const pageNumbers = Array.isArray(pages) ? pages : [];
    for (let index = 0; index < pageNumbers.length; index += 1) {
      const pageNumber = pageNumbers[index];
      if (typeof onProgress === 'function') {
        onProgress(`Читаю текст PDF ${pageNumber}/${pageNumbers.length}...`, Math.round(((index + 1) / pageNumbers.length) * 35));
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const page = await pdf.getPage(pageNumber);
        // eslint-disable-next-line no-await-in-loop
        const content = await page.getTextContent();
        const pageText = (content && Array.isArray(content.items) ? content.items : [])
          .map((item) => normalize(item && item.str))
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (pageText) {
          textParts.push(`Страница ${pageNumber}:\n${pageText}`);
        }
      } catch (_) {
        // Если текстовый слой конкретной страницы не прочитался, пробуем остальные страницы.
      }
    }
    return textParts.join('\n\n').trim();
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
    const isDoc = /\.doc$/i.test(name);
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
      const pdfText = await extractPdfTextFromDocument(pdf, pages, onProgress);
      if (normalize(pdfText).length >= PDF_TEXT_MIN_CHARS) {
        onProgress('Текст PDF готов...', 100);
        return {
          kind: 'text',
          extractedText: pdfText,
          fileName: file.name || 'document.pdf',
          totalPages,
          selectedPages: pages,
        };
      }
      const pagesLabel = `${pages.length}/${totalPages}`;
      const images = [];
      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        onProgress(`Готовлю страницу ${pageNumber} (первые ${pagesLabel})...`, Math.round(35 + (((index + 1) / pages.length) * 60)));
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
      return { kind: 'multimodal', messageText: 'Прочитай первые страницы этого PDF и подготовь ответ', images, totalPages, selectedPages: pages };
    }

    if (isText) {
      onProgress('Читаю текстовый файл...', 100);
      const text = await readFileAsText(file);
      return { kind: 'text', extractedText: text, fileName: file.name || 'text.txt' };
    }

    if (isDoc || isDocx) {
      onProgress(isDocx ? 'Извлекаю текст из DOCX...' : 'Пробую извлечь текст из DOC...', 35);
      let extractedText = '';
      if (isDocx) {
        try {
          const mammoth = await ensureMammothLoaded();
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          extractedText = String(result && result.value || '').trim();
        } catch (error) {
          extractedText = '';
        }
      }
      if (!extractedText) {
        extractedText = String(await readFileAsText(file) || '').trim();
      }
      return {
        kind: 'text',
        extractedText,
        fileName: file.name || (isDocx ? 'document.docx' : 'document.doc'),
        disableOcr: true,
        warning: 'Для DOC/DOCX используется только прямое извлечение текста.',
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

    throw new Error('Формат не поддерживается. Поддерживаемые форматы: JPG, PNG, PDF, TXT, DOC, DOCX, XLSX');
  }

  async function requestTelegramVisionResponse(payload = {}, onStatus) {
    const profile = getClientVisionProfile();
    const selectedFiles = Array.isArray(payload.selectedFiles) ? payload.selectedFiles : [];
    const onNetworkSample = typeof payload.onNetworkSample === 'function' ? payload.onNetworkSample : null;
    const emitStatus = typeof onStatus === 'function' ? onStatus : () => {};
    const prompt = normalize(payload.prompt) || 'Проанализируй документы и предложи готовое решение.';
    const systemPrompt = normalize(payload.systemPrompt);
    const images = [];
    const extractedTexts = [];
    const fileErrors = [];
    const normalizeResponseError = (errorMessage, fallbackMessage) => {
      const raw = normalize(errorMessage);
      if (!raw) return fallbackMessage;
      return raw
        .replace(/\bVision\s+OCR\b/gi, 'чтение изображения')
        .replace(/\bOCR\b/gi, 'распознавание текста')
        .replace(/\bGroq\b/gi, 'сервис ИИ')
        .replace(/response pipeline/gi, 'обработку ответа')
        .trim();
    };
    const requestTextResponse = async (texts, extraPrompt = '') => {
      const textRequest = await postGroqResponseWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'generate_response');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', extraPrompt || prompt);
        appendPromptSelection(formData, payload.tone, payload.assistantMode);
        formData.append('extractedTexts', JSON.stringify(texts));
        return formData;
      }, { onNetworkSample });
      const textPayload = textRequest && textRequest.payload;
      if (textRequest && textRequest.response && textRequest.response.ok && textPayload && textPayload.ok === true) {
        const textResponse = normalize(textPayload.response || textPayload.summary);
        if (textResponse) return textResponse;
      }
      throw new Error(normalizeResponseError(
        textPayload && textPayload.error,
        'Не удалось сформировать ответ по тексту документов.',
      ));
    };
    const preparedResults = new Array(selectedFiles.length);
    const queue = selectedFiles.map((currentFile, index) => ({ currentFile, index }));
    const maxConcurrency = profile.maxConcurrency;
    const workers = Array.from({ length: Math.max(1, Math.min(maxConcurrency, queue.length)) }, () => (async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) {
          break;
        }
        const { currentFile, index } = item;
        const fileLabel = normalize(currentFile && (currentFile.originalName || currentFile.name || currentFile.storedName)) || `Файл ${index + 1}`;
        emitStatus('Загрузка', 'loading');
        let blobFile = null;
        try {
          blobFile = await loadSelectedFileAsBlob(currentFile, onNetworkSample);
        } catch (error) {
          const failMessage = normalize(error && error.message) || 'Не удалось загрузить файл.';
          preparedResults[index] = { error: `${fileLabel}: ${failMessage}` };
          emitStatus('Загрузка', 'loading');
          continue;
        }
        const sourceFile = blobFile instanceof File ? blobFile : new File([blobFile], fileLabel, { type: blobFile.type || 'application/octet-stream' });
        try {
          emitStatus('Подготовка', 'prepare');
          const prepared = await withTimeout(
            buildVisionPayloadFromFile(sourceFile, () => emitStatus('Подготовка', 'prepare')),
            profile.prepareTimeoutMs,
            'Превышено время обработки файла.',
          );
          preparedResults[index] = { prepared, sourceFile, fileLabel };
        } catch (error) {
          const failMessage = normalize(error && error.message) || 'Не удалось подготовить файл.';
          preparedResults[index] = { error: `${fileLabel}: ${failMessage}` };
          emitStatus('Подготовка', 'prepare');
        }
      }
    })());
    await Promise.all(workers);

    preparedResults.forEach((result) => {
      if (!result) {
        return;
      }
      if (result.error) {
        fileErrors.push(result.error);
        return;
      }
      const prepared = result.prepared;
      const sourceFile = result.sourceFile;
      const fileLabel = result.fileLabel;
      if (!prepared) {
        return;
      }
      if (prepared.kind === 'multimodal') {
        images.push(...(Array.isArray(prepared.images) ? prepared.images : []));
      } else if (prepared.kind === 'text') {
        const text = normalize(prepared.extractedText);
        if (text) {
          extractedTexts.push({
            name: prepared.fileName || fileLabel,
            type: (sourceFile && sourceFile.type) || 'text/plain',
            text: text.slice(0, 60000),
          });
        }
      }
    });

    if (!images.length) {
      if (!extractedTexts.length) {
        const details = fileErrors.length ? ` Ошибки: ${fileErrors.slice(0, 2).join('; ')}` : '';
        throw new Error(`Не удалось подготовить выбранные файлы для ответа.${details}`);
      }
      emitStatus('Ответ', 'answer');
      return {
        text: await requestTextResponse(extractedTexts),
        skippedFilesCount: fileErrors.length,
      };
    }

    const batches = chunkItems(images, VISION_BATCH_SIZE);
    const partialAnswers = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const currentBatch = batches[batchIndex];
      emitStatus('Ответ', 'answer');
      // eslint-disable-next-line no-await-in-loop
      const request = await postGroqResponseWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'analyze_paid');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prompt);
        appendPromptSelection(formData, payload.tone, payload.assistantMode);
        if (extractedTexts.length && batchIndex === 0) {
          formData.append('extractedTexts', JSON.stringify(extractedTexts));
        }
        formData.append('vision_payload', JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 1200,
          temperature: 0.2,
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
        return formData;
      }, { onNetworkSample });
      const response = request && request.response;
      const result = request && request.payload;
      if (!response || !response.ok || !result || result.ok !== true) {
        throw new Error(normalizeResponseError(
          result && result.error,
          `Не удалось прочитать изображение (блок ${batchIndex + 1}).`,
        ));
      }
      partialAnswers.push(normalize(result.response || result.summary));
    }

    let finalSummary = partialAnswers.join('\n\n').trim();
    if (partialAnswers.length > 1) {
      emitStatus('Ответ', 'answer');
      try {
        finalSummary = await requestTextResponse([{
          name: 'vision-batches.txt',
          type: 'text/plain',
          text: partialAnswers.map((item, idx) => `Блок ${idx + 1}/${partialAnswers.length}:\n${item}`).join('\n\n'),
        }], [prompt, 'Ниже ответы по блокам. Собери один цельный финальный ответ без пересказа блоков.'].filter(Boolean).join('\n\n')) || finalSummary;
      } catch (_) {
        finalSummary = partialAnswers.join('\n\n').trim();
      }
    }
    if (!finalSummary) {
      throw new Error('Не удалось получить итоговый текст ответа.');
    }
    return {
      text: finalSummary,
      skippedFilesCount: fileErrors.length,
    };
  }

  async function loadSelectedFileAsBlob(file, onNetworkSample = null) {
    const profile = getClientVisionProfile();
    if (file && file.fileObject instanceof File) {
      return file.fileObject;
    }
    const cacheKey = getFileCacheKey(file);
    if (cacheKey && loadedFileCache.has(cacheKey)) {
      return loadedFileCache.get(cacheKey);
    }
    const baseCandidates = Array.from(new Set(buildFileUrlCandidates(file).filter(Boolean))).slice(0, FILE_FETCH_MAX_CANDIDATES);
    const cacheBustedCandidates = baseCandidates.map((url) => (
      url.startsWith('blob:') || url.startsWith('data:') ? url : appendCacheBuster(url)
    ));
    if (!baseCandidates.length) {
      throw new Error('Не найден URL файла.');
    }
    const rounds = [baseCandidates, cacheBustedCandidates];
    const iosClient = isIosClient();
    const retries = profile.fetchRetries;
    let lastStatus = 0;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const urls = rounds[Math.min(attempt, rounds.length - 1)];
      const timeoutMs = iosClient
        ? (FILE_FETCH_TIMEOUT_STEPS_IOS[Math.min(attempt, FILE_FETCH_TIMEOUT_STEPS_IOS.length - 1)] || FILE_FETCH_TIMEOUT_MS)
        : FILE_FETCH_TIMEOUT_MS;
      for (let index = 0; index < urls.length; index += 1) {
        const url = urls[index];
        let response = null;
        const startedAt = getTimingNow();
        try {
          response = await fetchWithTimeout(url, { credentials: 'include', cache: 'no-store' }, timeoutMs);
        } catch (error) {
          emitNetworkSample(onNetworkSample, {
            type: 'file',
            ok: false,
            timedOut: Boolean(error && error.name === 'AbortError'),
            durationMs: Math.max(0, Math.round(getTimingNow() - startedAt)),
          });
          continue;
        }
        if (!response || !response.ok) {
          lastStatus = Number(response && response.status) || lastStatus;
          emitNetworkSample(onNetworkSample, {
            type: 'file',
            ok: false,
            status: lastStatus,
            durationMs: Math.max(0, Math.round(getTimingNow() - startedAt)),
          });
          continue;
        }
        const blob = await response.blob();
        const durationMs = Math.max(1, Math.round(getTimingNow() - startedAt));
        emitNetworkSample(onNetworkSample, {
          type: 'file',
          ok: true,
          status: response.status,
          bytes: blob.size,
          durationMs,
          mbps: calculateNetworkMbps(blob.size, durationMs),
        });
        const fileName = normalize(file && (file.originalName || file.name || file.storedName)) || 'attachment';
        if (blob.size > profile.maxFileSizeBytes) {
          throw new Error('Файл слишком большой.');
        }
        const readyFile = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        if (cacheKey) loadedFileCache.set(cacheKey, readyFile);
        if (file && typeof file === 'object') file.fileObject = readyFile;
        return readyFile;
      }
      if (attempt < retries) {
        const delayMs = iosClient ? (220 * (attempt + 1)) : 200;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(`Не удалось загрузить файл${lastStatus ? ` (${lastStatus})` : ''}`);
  }

  async function preloadSelectedFile(file, onStatus, onNetworkSample = null) {
    if (!file || typeof file !== 'object') return false;
    try {
      await loadSelectedFileAsBlob(file, onNetworkSample);
      return true;
    } catch (_) {
      if (typeof onStatus === 'function') {
        onStatus('Некоторые файлы загружаются медленно, продолжаю подготовку...', 'loading');
      }
      return false;
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root{
        --tg-bg-gradient:linear-gradient(145deg,rgba(255,255,255,.98),rgba(248,250,252,.96));
        --tg-accent:#2563eb;
        --tg-accent-hover:#1d4ed8;
        --tg-accent-glow:rgba(37,99,235,.2);
        --tg-border:rgba(203,213,225,.5);
        --tg-shadow-sm:0 10px 25px -5px rgba(0,0,0,.05),0 8px 10px -6px rgba(0,0,0,.02);
        --tg-shadow-md:0 20px 35px -12px rgba(0,0,0,.12);
        --tg-shadow-lg:0 25px 50px -12px rgba(0,0,0,.25);
        --tg-ai-viewport-height:100dvh;
        --tg-ai-viewport-top:0px;
      }
      @keyframes tg-fade-in{from{opacity:0;backdrop-filter:blur(0)}to{opacity:1;backdrop-filter:blur(10px)}}
      @keyframes tg-scale-in{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
      .tg-ai-chat__messages::-webkit-scrollbar,.tg-ai-chat__files-list::-webkit-scrollbar,.tg-ai-template-editor__body::-webkit-scrollbar,.tg-ai-generated-preview__viewport::-webkit-scrollbar{width:5px;height:5px}
      .tg-ai-chat__messages::-webkit-scrollbar-track,.tg-ai-chat__files-list::-webkit-scrollbar-track,.tg-ai-template-editor__body::-webkit-scrollbar-track,.tg-ai-generated-preview__viewport::-webkit-scrollbar-track{background:rgba(203,213,225,.3);border-radius:10px}
      .tg-ai-chat__messages::-webkit-scrollbar-thumb,.tg-ai-chat__files-list::-webkit-scrollbar-thumb,.tg-ai-template-editor__body::-webkit-scrollbar-thumb,.tg-ai-generated-preview__viewport::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:10px}
      .tg-ai-chat__messages::-webkit-scrollbar-thumb:hover,.tg-ai-chat__files-list::-webkit-scrollbar-thumb:hover,.tg-ai-template-editor__body::-webkit-scrollbar-thumb:hover,.tg-ai-generated-preview__viewport::-webkit-scrollbar-thumb:hover{background:#64748b}
      .tg-ai-chat{position:fixed;left:0;right:0;top:var(--tg-ai-viewport-top,0px);height:var(--tg-ai-viewport-height,100dvh);z-index:3700;display:flex;align-items:center;justify-content:center;padding:10px;background:rgba(15,23,42,.46);backdrop-filter:blur(10px);box-sizing:border-box;overflow:hidden;overscroll-behavior:contain;touch-action:manipulation;animation:tg-fade-in .25s ease}
      .tg-ai-chat[data-opening="true"]{opacity:0;backdrop-filter:blur(2px)}
      .tg-ai-chat[data-opening="false"]{opacity:1;backdrop-filter:blur(10px);transition:opacity .28s ease,backdrop-filter .28s ease}
      .tg-ai-chat__card{width:min(900px,100%);height:min(calc(var(--tg-ai-viewport-height,100dvh) - 20px),860px);max-height:calc(var(--tg-ai-viewport-height,100dvh) - 20px);display:flex;flex-direction:column;overflow:hidden;border-radius:24px;border:1px solid rgba(255,255,255,.95);background:var(--tg-bg-gradient);box-shadow:0 20px 50px rgba(15,23,42,.22);contain:layout paint;animation:tg-scale-in .2s cubic-bezier(.2,.9,.4,1.1)}
      .tg-ai-chat[data-opening="true"] .tg-ai-chat__card{opacity:0;transform:translateY(20px) scale(.975)}
      .tg-ai-chat[data-opening="false"] .tg-ai-chat__card{opacity:1;transform:translateY(0) scale(1);transition:transform .34s cubic-bezier(.2,.8,.2,1),opacity .3s ease}
      .tg-ai-chat__head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:flex-start;flex:0 0 auto;padding:12px;border-bottom:1px solid rgba(203,213,225,.78)}
      .tg-ai-chat__head-main{display:grid;gap:7px;min-width:0}
      .tg-ai-chat__title-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
      .tg-ai-chat__head-actions{display:flex;align-items:center;gap:6px}
      .tg-ai-chat__title{font-size:16px;font-weight:800;color:#0f172a}
      .tg-ai-chat__sub{font-size:11px;color:#64748b;margin-top:1px;line-height:1.35}
      .tg-ai-chat__network{display:inline-flex;align-items:center;justify-content:center;min-height:34px;max-width:168px;border:1px solid rgba(203,213,225,.9);border-radius:11px;padding:0 9px;background:rgba(255,255,255,.88);color:#475569;font-size:11px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tg-ai-chat__network[data-network-state="good"]{border-color:rgba(34,197,94,.45);background:rgba(220,252,231,.88);color:#166534}
      .tg-ai-chat__network[data-network-state="slow"]{border-color:rgba(245,158,11,.5);background:rgba(254,243,199,.92);color:#92400e}
      .tg-ai-chat__network[data-network-state="bad"]{border-color:rgba(239,68,68,.5);background:rgba(254,226,226,.92);color:#991b1b}
      .tg-ai-chat__network[data-network-state="unknown"]{border-color:rgba(203,213,225,.9);background:rgba(255,255,255,.88);color:#475569}
      .tg-ai-chat__close{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.9);color:#0f172a;border-radius:11px;padding:6px 11px;min-height:34px;font-weight:700}
      .tg-ai-chat__head-btn{justify-self:start;border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.92);color:#0f172a;border-radius:11px;padding:0 10px;min-height:34px;font-size:12px;font-weight:700}
      .tg-ai-chat__messages{flex:1 1 auto;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,#f8fafc,#eef2ff);overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}
      .tg-ai-chat__bubble{max-width:92%;padding:9px 11px;border-radius:13px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .tg-ai-chat__bubble--assistant{align-self:flex-start;background:#fff;border:1px solid rgba(148,163,184,.3);color:#0f172a}
      .tg-ai-chat__bubble--user{align-self:flex-end;background:#dbeafe;border:1px solid rgba(59,130,246,.3);color:#1e3a8a}
      .tg-ai-chat__status{flex:0 0 auto;padding:8px 12px;border-top:1px solid rgba(203,213,225,.65);font-size:12px;color:#334155;background:rgba(255,255,255,.86)}
      .tg-ai-chat__composer{flex:0 0 auto;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));display:grid;gap:8px;border-top:1px solid rgba(203,213,225,.72);background:rgba(255,255,255,.96);box-shadow:0 -10px 24px rgba(15,23,42,.06)}
      .tg-ai-chat__toolbar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .tg-ai-chat__toolbar--compact{grid-template-columns:repeat(2,minmax(0,1fr))}
      .tg-ai-chat__toolbar--fixed{grid-template-columns:minmax(0,1fr)}
      .tg-ai-chat__mode-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border:1px solid rgba(191,219,254,.85);border-radius:12px;background:rgba(239,246,255,.72);backdrop-filter:blur(6px)}
      .tg-ai-chat__mode-switch--head{width:min(360px,100%)}
      .tg-ai-chat__mode-btn{min-height:34px;border:none;border-radius:9px;background:transparent;color:#334155;font-size:11px;font-weight:700;padding:0 8px;white-space:nowrap}
      .tg-ai-chat__mode-btn[data-active="true"]{background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.28)}
      .tg-ai-chat__toggle{min-height:42px;border:none;padding:0 12px;border-radius:12px;background:rgba(219,234,254,.95);color:#1e3a8a;font-weight:700}
      .tg-ai-chat__select{min-height:42px;border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:0 12px;background:rgba(255,255,255,.98);color:#0f172a;font-size:13px}
      .tg-ai-chat__input-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
      .tg-ai-chat__input{min-height:52px;max-height:156px;border:1px solid rgba(148,163,184,.35);border-radius:14px;background:rgba(255,255,255,.98);padding:10px 12px;color:#0f172a;font-size:16px;line-height:1.4;resize:none;outline:none}
      .tg-ai-chat__input:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(147,197,253,.22)}
      .tg-ai-chat__icon-btn,.tg-ai-chat__send{height:44px;min-width:44px;border:none;border-radius:12px;font-weight:700}
      .tg-ai-chat__icon-btn{background:rgba(226,232,240,.9);color:#334155;padding:0 12px}
      .tg-ai-chat__icon-btn[data-active="true"]{background:rgba(254,226,226,.95);color:#b91c1c}
      .tg-ai-chat__send{padding:0 14px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff}
      .tg-ai-chat__send[disabled],.tg-ai-chat__icon-btn[disabled]{opacity:.55}
      .tg-ai-chat__files{flex:0 0 auto;border-top:1px solid rgba(203,213,225,.8);background:rgba(248,250,252,.98);padding:9px 12px}
      .tg-ai-chat__files[hidden]{display:none}
      .tg-ai-chat__files-title{font-size:12px;color:#64748b;margin:0 0 8px}
      .tg-ai-chat__files-list{display:flex;flex-wrap:wrap;gap:6px;max-height:156px;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      .tg-ai-chat__file{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(203,213,225,.95);background:#fff;border-radius:999px;font-size:12px;color:#334155;transition:all .2s ease}
      .tg-ai-chat__file-name{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tg-ai-chat__file-state{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(148,163,184,.18);color:#64748b}
      .tg-ai-chat__file[data-state="loading"]{border-color:rgba(59,130,246,.42);background:rgba(239,246,255,.92)}
      .tg-ai-chat__file[data-state="loading"] .tg-ai-chat__file-state{background:rgba(59,130,246,.16);color:#2563eb}
      .tg-ai-chat__file[data-state="ready"]{border-color:rgba(16,185,129,.35);background:rgba(236,253,245,.92)}
      .tg-ai-chat__file[data-state="ready"] .tg-ai-chat__file-state{background:rgba(16,185,129,.16);color:#047857}
      .tg-ai-chat__file[data-state="error"]{border-color:rgba(239,68,68,.35);background:rgba(254,242,242,.95)}
      .tg-ai-chat__file[data-state="error"] .tg-ai-chat__file-state{background:rgba(239,68,68,.16);color:#b91c1c}
      .tg-ai-chat__file input{accent-color:#2563eb}
      .tg-ai-chat__loading{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid rgba(148,163,184,.3);border-radius:13px;background:rgba(255,255,255,.92);color:#334155;font-size:12px}
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
      .tg-ai-generated-preview__menu-toggle,.tg-ai-generated-preview__close-icon,.tg-ai-generated-preview__save{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.95);border-radius:10px;padding:6px 10px;min-height:36px;font-weight:700;color:#0f172a}
      .tg-ai-generated-preview__close-icon{width:36px;padding:0;font-size:18px;line-height:1}
      .tg-ai-generated-preview__save{min-width:38px;padding:0 10px;line-height:1;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(140deg,rgba(255,255,255,.96),rgba(219,234,254,.92));box-shadow:0 8px 18px rgba(59,130,246,.16)}
      .tg-ai-generated-preview__save-icon{width:18px;height:18px;display:block;color:#1d4ed8}
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
      .tg-ai-generated-preview__frame{display:block;position:absolute;inset:0;z-index:2;width:100%;height:100%;border:0;background:#e2e8f0}
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
      @media (min-width:768px){.tg-ai-chat__title{font-size:17px}.tg-ai-chat__sub,.tg-ai-chat__network,.tg-ai-chat__head-btn{font-size:12px}.tg-ai-chat__bubble{font-size:14px}.tg-ai-chat__status,.tg-ai-chat__files-title,.tg-ai-chat__file{font-size:13px}.tg-ai-chat__input{font-size:15px}.tg-ai-chat__toggle,.tg-ai-chat__select,.tg-ai-chat__send{font-size:14px}}
      @media (max-width:640px){.tg-ai-chat__files{max-height:min(32dvh,220px);overflow:hidden;padding:8px 10px;box-sizing:border-box}.tg-ai-chat__files-title{margin-bottom:7px;font-size:11px;line-height:1.25}.tg-ai-chat__files-list{display:grid;grid-template-columns:1fr;gap:6px;max-height:min(24dvh,170px);overflow:auto;overscroll-behavior:contain}.tg-ai-chat__file{display:grid;grid-template-columns:24px minmax(0,1fr) 22px;width:100%;min-height:42px;box-sizing:border-box;padding:8px 9px;border-radius:12px;font-size:12px;line-height:1.25}.tg-ai-chat__file input{width:18px;height:18px;margin:0}.tg-ai-chat__file-name{max-width:100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tg-ai-chat__file-state{width:20px;height:20px;font-size:11px}.tg-ai-chat__title{font-size:15px}.tg-ai-chat__bubble{font-size:13px}.tg-ai-chat__input{font-size:16px;max-height:112px}.tg-ai-chat__toggle,.tg-ai-chat__select,.tg-ai-chat__send{font-size:13px}}
      @media (max-width:640px){.tg-ai-chat{padding:0;background:rgba(15,23,42,.58);backdrop-filter:none;animation:none}.tg-ai-chat[data-opening="true"],.tg-ai-chat[data-opening="false"]{backdrop-filter:none}.tg-ai-chat__card{height:var(--tg-ai-viewport-height,100dvh);max-height:var(--tg-ai-viewport-height,100dvh);border-radius:0;border:0;box-shadow:none}.tg-ai-chat[data-opening="true"] .tg-ai-chat__card,.tg-ai-chat[data-opening="false"] .tg-ai-chat__card{transform:none;transition:opacity .16s ease}.tg-ai-chat__toolbar,.tg-ai-chat__toolbar--compact{grid-template-columns:1fr 1fr}.tg-ai-chat__head{padding:10px 10px 8px}.tg-ai-chat__head-main{gap:6px}.tg-ai-chat__sub{font-size:10px}.tg-ai-chat__mode-switch--head{width:100%}.tg-ai-chat__mode-btn{min-height:32px;font-size:10px}.tg-ai-chat__close{width:38px;padding:0}.tg-ai-chat__head-btn{width:max-content;max-width:100%}.tg-ai-chat__network{max-width:min(54vw,180px);font-size:11px;padding:0 10px}.tg-ai-chat__messages{padding:10px}.tg-ai-chat__status{padding:7px 10px}.tg-ai-chat__composer{padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));gap:7px}.tg-ai-chat__input-row{grid-template-columns:minmax(0,1fr) 92px;gap:7px}.tg-ai-chat__send{grid-column:auto;min-width:92px;padding:0 10px}.tg-ai-template-preview{padding:0}.tg-ai-template-preview__card{height:100dvh;border-radius:0}.tg-ai-generated-preview__head{padding:10px}.tg-ai-generated-preview__menu{left:10px;right:10px;top:56px;min-width:0}.tg-ai-generated-preview__btn{padding:8px 10px}.tg-ai-generated-preview__viewport{padding:8px}.tg-ai-generated-preview__doc{--tg-page-gutter:8px;width:100%;border-radius:12px;padding:8px}.tg-ai-generated-preview__zoom-value{min-width:38px}.tg-ai-template-editor{padding:0}.tg-ai-template-editor__card{border-radius:0}.tg-ai-template-editor__grid{grid-template-columns:1fr}.tg-ai-template-editor__textarea{min-height:42dvh;font-size:16px}.tg-ai-template-editor__foot{flex-direction:column;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}.tg-ai-template-editor__btn{width:100%}}
      @media (max-width:380px){.tg-ai-chat__title{font-size:14px}.tg-ai-chat__network{min-height:30px;font-size:10px}.tg-ai-chat__head-btn{min-height:32px;font-size:11px}.tg-ai-chat__bubble,.tg-ai-chat__input{font-size:13px}.tg-ai-chat__status{font-size:11px}.tg-ai-chat__file{min-height:40px;font-size:11.5px;grid-template-columns:22px minmax(0,1fr) 20px}.tg-ai-chat__file-state{width:18px;height:18px}}
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
      formData.append('templateYear', String(meta.year || ''));
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

  async function resolveGeneratedDocxBlob(previewPayload) {
    if (previewPayload && previewPayload.blob instanceof Blob) {
      return previewPayload.blob;
    }
    const previewUrl = normalize(previewPayload && previewPayload.previewUrl);
    if (!previewUrl) {
      throw new Error('Не удалось получить файл документа для предпросмотра.');
    }
    const url = toAbsoluteUrl(previewUrl);
    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      }, 30000);
      if (!response || !response.ok) {
        throw new Error(`no_response_${response ? response.status : 0}`);
      }
      const blob = await response.blob();
      if (blob && blob.size) return blob;
    } catch (_) {
      throw new Error('Не удалось скачать документ для предпросмотра.');
    }
    throw new Error('Не удалось скачать документ для предпросмотра.');
  }

  async function downloadGeneratedPreviewFile(previewPayload) {
    const fileName = normalize(previewPayload && previewPayload.fileName) || 'template-answer.docx';
    const safeFileName = normalize(fileName.split('/').pop());
    const directDownloadUrl = safeFileName
      ? `https://bimmax.pro/js/documents/app/tmp/generated/${encodeURIComponent(safeFileName)}`
      : '';
    const sourceUrl = normalize(previewPayload && previewPayload.previewUrl);
    const fallbackBlob = previewPayload && previewPayload.blob instanceof Blob ? previewPayload.blob : null;
    if (directDownloadUrl) {
      const telegramWebApp = globalScope && globalScope.Telegram && globalScope.Telegram.WebApp;
      if (telegramWebApp && typeof telegramWebApp.openLink === 'function') {
        try {
          telegramWebApp.openLink(directDownloadUrl);
          return true;
        } catch (_) {}
      }
      try {
        const link = document.createElement('a');
        link.href = directDownloadUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch (_) {}
    }
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

  function createShareableDocFile(blob, fileName) {
    const safeName = normalize(fileName) || 'answer.docx';
    const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    try {
      return new File([blob], safeName, { type: mimeType });
    } catch (_) {
      const fallbackBlob = blob.slice(0, blob.size, mimeType);
      try {
        Object.defineProperty(fallbackBlob, 'name', { value: safeName, configurable: true });
      } catch (_) {}
      return fallbackBlob;
    }
  }

  async function shareGeneratedPreviewEverywhere(previewPayload) {
    const sourceUrl = normalize(previewPayload && previewPayload.previewUrl)
      ? toAbsoluteUrl(previewPayload.previewUrl)
      : '';
    const shareText = '';
    const shareTitle = '';
    if (typeof navigator === 'undefined') {
      throw new Error('Отправка недоступна на этом устройстве. Нажмите «Скачать».');
    }
    const fileBlob = await resolveGeneratedDocxBlob(previewPayload);
    if (!fileBlob || !fileBlob.size) {
      throw new Error('Не удалось подготовить файл для отправки.');
    }
    const fileName = normalize(previewPayload && previewPayload.fileName) || 'answer.docx';
    const shareFile = createShareableDocFile(fileBlob, fileName);
    const hasNativeShare = typeof navigator.share === 'function';

    if (hasNativeShare) {
      const supportsFileShare = typeof navigator.canShare !== 'function'
        ? true
        : navigator.canShare({ files: [shareFile] });
      if (supportsFileShare) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [shareFile],
        });
        return 'native_share_file';
      }

      if (sourceUrl) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: sourceUrl,
        });
        return 'native_share_link';
      }
    }

    const telegramWebApp = globalScope && globalScope.Telegram && globalScope.Telegram.WebApp;
    if (telegramWebApp && typeof telegramWebApp.openTelegramLink === 'function' && sourceUrl) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(sourceUrl)}`;
      telegramWebApp.openTelegramLink(shareUrl);
      return 'telegram_link_share';
    }

    if (sourceUrl) {
      try {
        const subject = encodeURIComponent('Документ из предпросмотра');
        const body = encodeURIComponent(`Ссылка на документ:\n${sourceUrl}`);
        const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(mailtoUrl, '_blank');
          return 'mailto_share';
        }
      } catch (_) {}
    }

    const downloaded = await downloadGeneratedPreviewFile(previewPayload);
    if (downloaded) {
      return 'download_fallback';
    }
    throw new Error('Не удалось открыть «Поделиться». Нажмите «Скачать».');
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
            <div class="tg-ai-generated-preview__hint">Просмотр через Office Viewer</div>
          </div>
          <div class="tg-ai-generated-preview__tools">
            <button type="button" class="tg-ai-generated-preview__save" data-preview-save title="Сохранить / Отправить" aria-label="Сохранить / Отправить">
              <svg class="tg-ai-generated-preview__save-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M5 3h11l3 3v15H5V3Zm2 2v5h10V6.8L15.2 5H7Zm1 9h8v5H8v-5Z"/>
              </svg>
            </button>
            <button type="button" class="tg-ai-generated-preview__menu-toggle" data-preview-menu-toggle>Меню</button>
            <button type="button" class="tg-ai-generated-preview__close-icon" data-preview-close-icon aria-label="Закрыть">×</button>
          </div>
        </div>
        <div class="tg-ai-generated-preview__menu" data-preview-menu hidden>
          <button type="button" class="tg-ai-generated-preview__btn" data-preview-attach>Прикрепить к задаче</button>
          <button type="button" class="tg-ai-generated-preview__btn tg-ai-generated-preview__btn--primary" data-preview-download>Скачать</button>
          <button type="button" class="tg-ai-generated-preview__btn" data-preview-close>Закрыть</button>
        </div>
        <div class="tg-ai-generated-preview__body">
          <iframe class="tg-ai-generated-preview__frame" data-preview-frame title="Предпросмотр DOCX через Office Viewer"></iframe>
          <div class="tg-ai-generated-preview__loading" data-preview-loading>
            <div class="tg-ai-generated-preview__loading-card">
              <div class="tg-ai-generated-preview__loading-title">Открываем документ…</div>
              <div class="tg-ai-generated-preview__loading-sub" data-loading-sub>Подготовка ссылки для Office Viewer.</div>
              <div class="tg-ai-generated-preview__bar"></div>
            </div>
          </div>
        </div>
        <div class="tg-ai-generated-preview__status" data-preview-status>Подготовка предпросмотра…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const frameNode = overlay.querySelector('[data-preview-frame]');
    const statusNode = overlay.querySelector('[data-preview-status]');
    const loadingNode = overlay.querySelector('[data-preview-loading]');
    const loadingSubNode = overlay.querySelector('[data-loading-sub]');
    const downloadBtn = overlay.querySelector('[data-preview-download]');
    const attachBtn = overlay.querySelector('[data-preview-attach]');
    const menuNode = overlay.querySelector('[data-preview-menu]');
    const menuToggleBtn = overlay.querySelector('[data-preview-menu-toggle]');
    const previewSaveBtn = overlay.querySelector('[data-preview-save]');
    const closeIconBtn = overlay.querySelector('[data-preview-close-icon]');
    const closeBtn = overlay.querySelector('[data-preview-close]');
    const previewUrl = normalize(previewPayload.previewUrl);
    const generatedFileName = normalize(previewPayload.fileName)
      || normalize(previewUrl.split('/').pop());
    const task = context && context.task ? context.task : {};

    const close = () => {
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
    previewSaveBtn?.addEventListener('click', async () => {
      const prevMarkup = previewSaveBtn.innerHTML;
      previewSaveBtn.disabled = true;
      previewSaveBtn.textContent = '…';
      try {
        const mode = await shareGeneratedPreviewEverywhere(previewPayload);
        if (mode === 'native_share_file') {
          statusNode.textContent = 'Окно «Поделиться» открыто. Файл прикреплён.';
        } else if (mode === 'native_share_link' || mode === 'telegram_link_share') {
          statusNode.textContent = 'Окно «Поделиться» открыто. Если нужно, прикрепите файл через «Скачать».';
        } else if (mode === 'mailto_share') {
          statusNode.textContent = 'Открыт почтовый клиент. Можно отправить ссылку на документ.';
        } else if (mode === 'download_fallback') {
          statusNode.textContent = '«Поделиться» недоступно. Файл отправлен в скачивание.';
        } else {
          statusNode.textContent = 'Окно «Поделиться» открыто.';
        }
      } catch (error) {
        statusNode.textContent = (error && error.message) || 'Не удалось открыть «Поделиться».';
      } finally {
        previewSaveBtn.disabled = false;
        previewSaveBtn.innerHTML = prevMarkup;
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

    try {
      const officeSourceUrl = toAbsoluteUrl(normalize(previewPayload.previewUrl));
      if (!officeSourceUrl || !/^https?:\/\//i.test(officeSourceUrl)) {
        throw new Error('Некорректная ссылка на документ.');
      }
      if (loadingSubNode) loadingSubNode.textContent = 'Открываем Office Viewer…';
      statusNode.textContent = 'Открываем документ…';
      const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(officeSourceUrl)}`;
      frameNode.src = officeViewerUrl;
      if (loadingNode) loadingNode.style.display = 'none';
      statusNode.textContent = `Готово: ${generatedFileName || 'документ'} открыт через Office Viewer.`;
    } catch (error) {
      if (loadingNode) loadingNode.style.display = 'none';
      statusNode.textContent = 'Не удалось открыть документ. Проверьте ссылку и попробуйте снова.';
    }
  }

  async function openTemplateAnswerEditor(context = {}) {
    if (document.querySelector('.tg-ai-template-editor')) return;
    const task = context && context.task ? context.task : {};
    const onStatus = typeof context.onStatus === 'function' ? context.onStatus : null;
    const aiText = sanitizeAssistantFinalText(context && context.aiAnswer);
    if (!aiText) {
      if (onStatus) onStatus('Сначала сформируйте текст ответа ИИ.');
      return;
    }
    const templateConfig = buildOrganizationTemplateConfig(task);
    const templateMarkers = await detectTemplateMarkers(task);
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
            <div class="tg-ai-template-editor__sub">Проверьте текст ИИ и заполните дату, год, номер и адресата • ${escapeHtml(templateConfig.compactTemplateLabel)}</div>
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
            ${templateMarkers.hasYear ? `
            <label class="tg-ai-template-editor__field">
              <span class="tg-ai-template-editor__label">Год</span>
              <input class="tg-ai-template-editor__input" data-template-year type="text" inputmode="numeric" maxlength="4" placeholder="${new Date().getFullYear()}">
            </label>
            ` : ''}
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
    const yearInput = overlay.querySelector('[data-template-year]');
    const numberInput = overlay.querySelector('[data-template-number]');
    const addresseeInput = overlay.querySelector('[data-template-addressee]');
    const textInput = overlay.querySelector('[data-template-answer]');
    const doneButton = overlay.querySelector('[data-action="done"]');
    const errorNode = overlay.querySelector('[data-template-error]');
    if (dayInput) dayInput.value = normalize(storedTemplateMeta.day);
    if (monthInput) monthInput.value = normalize(storedTemplateMeta.month);
    if (yearInput) yearInput.value = normalize(storedTemplateMeta.year) || String(new Date().getFullYear());
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
      const answerSanitized = sanitizeAssistantFinalText(answerRaw);
      if (textInput && answerSanitized !== answerRaw.trim()) {
        textInput.value = answerSanitized;
      }
      const answer = answerSanitized.trim();
      const defaultTemplateFieldValue = '_____';
      const day = normalize(dayInput && dayInput.value) || defaultTemplateFieldValue;
      const month = normalize(monthInput && monthInput.value) || defaultTemplateFieldValue;
      const number = normalize(numberInput && numberInput.value) || defaultTemplateFieldValue;
      const currentYear = String(new Date().getFullYear());
      const year = normalize(yearInput && yearInput.value) || currentYear;
      const addresseeRaw = String(addresseeInput && addresseeInput.value || '').replace(/\s+$/g, '');
      const addressee = normalize(addresseeRaw) || defaultTemplateFieldValue;
      if (!answer) {
        renderError('Добавьте текст ответа ИИ.');
        return;
      }
      const addresseeTemplateValue = /^\s/.test(addressee) ? addressee : (`\u00A0${addressee}`);
      if (globalScope) {
        globalScope.DOCUMENTS_LAST_AI_ANSWER = answer;
        globalScope.DOCUMENTS_TEMPLATE_META = { day, month, year, number, addressee: addresseeRaw };
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
          .replace(/\[ГОД\]/g, year)
          .replace(/\[НОМЕР\]/g, number)
          .replace(/\[АДРЕСАТ\]/g, addresseeTemplateValue);
        const previewPayload = await generateDocxFromTemplateViaApi(preparedAnswer, {
          day,
          month,
          year,
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
      return `
        <label class="tg-ai-chat__file" data-file-index="${index}" data-state="idle">
          <input type="checkbox" data-file-index="${index}" ${disabled}>
          <span class="tg-ai-chat__file-name">${escapeHtml(name)}</span>
          <span class="tg-ai-chat__file-state" data-file-state>○</span>
        </label>
      `;
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
    const toneOptions = Object.values(SYSTEM_TONE_PROMPTS)
      .filter((item) => item && normalize(item.value))
      .map((item) => {
        const value = normalize(item.value);
        const selectedAttr = value === FIXED_RESPONSE_TONE ? ' selected' : '';
        return `<option value="${escapeHtml(value)}"${selectedAttr}>${escapeHtml(item.label || value)}</option>`;
      })
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'tg-ai-chat';
    overlay.dataset.opening = 'true';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Ответ ИИ');
    overlay.innerHTML = `
      <div class="tg-ai-chat__card">
        <div class="tg-ai-chat__head">
          <div class="tg-ai-chat__head-main">
            <div class="tg-ai-chat__title-row">
              <div class="tg-ai-chat__title">✨ Ответ ИИ</div>
              <span class="tg-ai-chat__network" data-network-badge data-network-state="unknown" title="Данные сети ещё не получены.">Сеть: —</span>
            </div>
            <div class="tg-ai-chat__sub">Выберите файлы: ИИ подготовит только текст ответа для шаблона</div>
            <button type="button" class="tg-ai-chat__head-btn" data-template-btn disabled title="Сначала сформируйте текст ответа ИИ.">📄 Шаблон</button>
          </div>
          <button type="button" class="tg-ai-chat__close" data-close>✕</button>
        </div>
        <div class="tg-ai-chat__messages" data-messages>
          <div class="tg-ai-chat__bubble tg-ai-chat__bubble--assistant">Выберите файлы, затем нажмите «Отправить». ИИ вернёт только основной текст ответа для шаблона.</div>
        </div>
        <div class="tg-ai-chat__status" data-status>Выберите файлы и нажмите «Отправить».</div>
        <div class="tg-ai-chat__files" data-files hidden>
          <p class="tg-ai-chat__files-title">Файлы из текущей задачи:</p>
          <div class="tg-ai-chat__files-list" data-files-list></div>
        </div>
        <div class="tg-ai-chat__composer">
          <div class="tg-ai-chat__toolbar tg-ai-chat__toolbar--compact">
            <button type="button" class="tg-ai-chat__toggle" data-files-toggle>📎 Файлы</button>
            <select class="tg-ai-chat__select" data-style-select aria-label="Стиль ответа">
              ${toneOptions}
            </select>
          </div>
          <div class="tg-ai-chat__input-row">
            <textarea class="tg-ai-chat__input" data-prompt-input rows="2" placeholder="${escapeHtml(DEFAULT_RESPONSE_AI_PROMPT_TEXT)}">${escapeHtml(DEFAULT_RESPONSE_AI_PROMPT_TEXT)}</textarea>
            <button type="button" class="tg-ai-chat__send" data-send-btn>Отправить</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const viewportController = createModalViewportController(overlay);
    requestAnimationFrame(() => {
      overlay.dataset.opening = 'false';
    });

    const selected = new Set();
    const fileWarmupState = new Map();
    const fileWarmupPromises = new Map();
    const fileWarmupRequestId = new Map();
    const messages = overlay.querySelector('[data-messages]');
    const status = overlay.querySelector('[data-status]');
    const filesPanel = overlay.querySelector('[data-files]');
    const filesList = overlay.querySelector('[data-files-list]');
    const filesToggleButton = overlay.querySelector('[data-files-toggle]');
    const networkBadge = overlay.querySelector('[data-network-badge]');
    const modeButtons = Array.from(overlay.querySelectorAll('[data-response-mode]'));
    const templateButton = overlay.querySelector('[data-template-btn]');
    const styleSelect = overlay.querySelector('[data-style-select]');
    const promptInput = overlay.querySelector('[data-prompt-input]');
    const sendButton = overlay.querySelector('[data-send-btn]');
    const voiceButton = overlay.querySelector('[data-voice-btn]');
    let isSending = false;
    let lastAiAnswer = '';
    let recognition = null;
    let recognitionIsRunning = false;
    let speechSupported = false;
    let suppressVoiceEndStatus = false;
    let currentResponseMode = FIXED_RESPONSE_MODE;
    let currentTone = FIXED_RESPONSE_TONE;
    let improveAiDraftPrompt = '';
    let promptResizeFrame = 0;
    const networkState = {
      lastFileMbps: 0,
      lastFileBytes: 0,
      lastFileDurationMs: 0,
      lastApiDurationMs: 0,
      lastFailureAt: 0,
      lastFailureType: '',
      lastFailureStatus: 0,
    };

    const getNetworkConnection = () => {
      const navigatorObject = globalScope && globalScope.navigator ? globalScope.navigator : null;
      if (!navigatorObject) return null;
      return navigatorObject.connection || navigatorObject.mozConnection || navigatorObject.webkitConnection || null;
    };

    const readNetworkConnection = () => {
      const connection = getNetworkConnection();
      if (!connection || typeof connection !== 'object') {
        return {
          effectiveType: '',
          downlink: 0,
          rtt: 0,
          saveData: false,
        };
      }
      return {
        effectiveType: normalize(connection.effectiveType).toLowerCase(),
        downlink: Number.isFinite(connection.downlink) ? Number(connection.downlink) : 0,
        rtt: Number.isFinite(connection.rtt) ? Number(connection.rtt) : 0,
        saveData: Boolean(connection.saveData),
      };
    };

    const formatNetworkMbps = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return '';
      }
      if (numeric < 1) {
        return `${numeric.toFixed(1)} Мбит/с`;
      }
      if (numeric < 10) {
        return `${numeric.toFixed(1)} Мбит/с`;
      }
      return `${Math.round(numeric)} Мбит/с`;
    };

    const getNetworkQuality = (snapshot) => {
      const hasConnectionData = Boolean(snapshot.effectiveType || snapshot.downlink || snapshot.rtt || snapshot.saveData);
      const hasMeasuredData = Boolean(networkState.lastFileMbps);
      const recentFailure = networkState.lastFailureAt && (Date.now() - networkState.lastFailureAt < 18000);
      if (recentFailure
        || snapshot.effectiveType === 'slow-2g'
        || snapshot.rtt >= 1200
        || (snapshot.downlink > 0 && snapshot.downlink < 0.4)
        || (networkState.lastFileMbps > 0 && networkState.lastFileMbps < 0.25)
        || networkState.lastApiDurationMs >= 30000) {
        return 'bad';
      }
      if (snapshot.saveData
        || snapshot.effectiveType === '2g'
        || snapshot.rtt >= 550
        || (snapshot.downlink > 0 && snapshot.downlink < 1.5)
        || (networkState.lastFileMbps > 0 && networkState.lastFileMbps < 0.9)
        || networkState.lastApiDurationMs >= 12000) {
        return 'slow';
      }
      return hasConnectionData || hasMeasuredData ? 'good' : 'unknown';
    };

    const renderNetworkBadge = () => {
      if (!(networkBadge instanceof HTMLElement)) {
        return;
      }
      const snapshot = readNetworkConnection();
      const quality = getNetworkQuality(snapshot);
      const qualityLabels = {
        good: 'хорошо',
        slow: 'медленно',
        bad: 'плохо',
        unknown: 'неизвестно',
      };
      const speedValue = snapshot.downlink || networkState.lastFileMbps || 0;
      const speedLabel = formatNetworkMbps(speedValue);
      const isMeasuring = isSending || Array.from(fileWarmupState.values()).includes('loading');
      const apiDelayLabel = networkState.lastApiDurationMs
        ? `API ${Math.round(networkState.lastApiDurationMs / 100) / 10} с`
        : '';
      const compactSpeedLabel = speedLabel ? speedLabel.replace(' Мбит/с', '') : '';
      const visibleParts = [snapshot.effectiveType ? snapshot.effectiveType.toUpperCase() : (isMeasuring ? 'замер' : '—')];
      if (compactSpeedLabel) {
        visibleParts.push(`${compactSpeedLabel}↓`);
      } else if (apiDelayLabel) {
        visibleParts.push(apiDelayLabel);
      }
      if (quality === 'slow' || quality === 'bad') {
        visibleParts.push(qualityLabels[quality]);
      }
      const titleLines = [`Состояние: ${qualityLabels[quality] || qualityLabels.unknown}`];
      if (snapshot.effectiveType) titleLines.push(`Тип сети: ${snapshot.effectiveType}`);
      if (snapshot.downlink) titleLines.push(`Текущая оценка браузера: ${formatNetworkMbps(snapshot.downlink)}`);
      if (snapshot.rtt) titleLines.push(`RTT: ${Math.round(snapshot.rtt)} мс`);
      if (snapshot.saveData) titleLines.push('Экономия трафика включена');
      if (networkState.lastFileMbps) {
        titleLines.push(`Последняя загрузка файла: ${formatNetworkMbps(networkState.lastFileMbps)} за ${Math.round(networkState.lastFileDurationMs / 1000)} с`);
      }
      if (networkState.lastApiDurationMs) {
        titleLines.push(`Последний ответ API: ${Math.round(networkState.lastApiDurationMs / 100) / 10} с`);
      }
      if (networkState.lastFailureAt) {
        titleLines.push(`Последняя сетевая ошибка: ${networkState.lastFailureType || 'запрос'}${networkState.lastFailureStatus ? ` (${networkState.lastFailureStatus})` : ''}`);
      }

      networkBadge.dataset.networkState = quality;
      networkBadge.textContent = `Сеть: ${visibleParts.join(' · ')}`;
      networkBadge.title = titleLines.join('\n');
      networkBadge.setAttribute('aria-label', networkBadge.title);
    };

    const handleNetworkSample = (sample = {}) => {
      if (!sample || typeof sample !== 'object') {
        return;
      }
      const type = normalize(sample.type) || 'request';
      const durationMs = Math.max(0, Math.round(Number(sample.durationMs) || 0));
      const failedStatus = Number(sample.status) || 0;
      const isNetworkLikeFailure = type === 'file' || Boolean(sample.timedOut) || !failedStatus;
      if (sample.ok === false && isNetworkLikeFailure) {
        networkState.lastFailureAt = Date.now();
        networkState.lastFailureType = type === 'file' ? 'файл' : 'API';
        networkState.lastFailureStatus = failedStatus;
      } else if (sample.ok === true && (type === 'file' || type === 'api')) {
        networkState.lastFailureAt = 0;
        networkState.lastFailureType = '';
        networkState.lastFailureStatus = 0;
      }
      if (type === 'file' && sample.ok !== false) {
        const mbps = Number(sample.mbps) || calculateNetworkMbps(sample.bytes, durationMs);
        if (mbps > 0) {
          networkState.lastFileMbps = mbps;
          networkState.lastFileBytes = Number(sample.bytes) || 0;
          networkState.lastFileDurationMs = durationMs;
        }
      }
      if (type === 'api' && durationMs > 0) {
        networkState.lastApiDurationMs = durationMs;
      }
      renderNetworkBadge();
    };

    const networkConnection = getNetworkConnection();
    const handleNetworkConnectionChange = () => renderNetworkBadge();
    if (networkConnection && typeof networkConnection.addEventListener === 'function') {
      networkConnection.addEventListener('change', handleNetworkConnectionChange);
    }
    const networkRefreshTimer = typeof globalScope.setInterval === 'function'
      ? globalScope.setInterval(renderNetworkBadge, 5000)
      : 0;
    renderNetworkBadge();

    renderFiles(filesList, files);
    // Прогреваем зависимости заранее, чтобы первый запуск был стабильнее.
    ensureBriefPdfJsLoaded().catch(() => {});
    ensureMammothLoaded().catch(() => {});
    ensureXlsxLoaded().catch(() => {});

    const close = () => {
      if (recognitionIsRunning && recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      if (networkConnection && typeof networkConnection.removeEventListener === 'function') {
        networkConnection.removeEventListener('change', handleNetworkConnectionChange);
      }
      if (networkRefreshTimer && typeof globalScope.clearInterval === 'function') {
        globalScope.clearInterval(networkRefreshTimer);
      }
      if (promptResizeFrame) {
        if (typeof globalScope.cancelAnimationFrame === 'function') {
          globalScope.cancelAnimationFrame(promptResizeFrame);
        } else if (typeof globalScope.clearTimeout === 'function') {
          globalScope.clearTimeout(promptResizeFrame);
        }
        promptResizeFrame = 0;
      }
      viewportController.destroy();
      overlay.remove();
    };
    overlay.querySelector('[data-close]')?.addEventListener('click', close);

    const resetGeneratedAnswer = () => {
      if (!lastAiAnswer) return;
      lastAiAnswer = '';
      if (templateButton) {
        templateButton.disabled = true;
        templateButton.title = 'Сначала сформируйте текст ответа ИИ.';
      }
    };

    const updateFilesToggleLabel = () => {
      if (!filesToggleButton) return;
      let readyCount = 0;
      selected.forEach((key) => {
        if (fileWarmupState.get(key) === 'ready') readyCount += 1;
      });
      filesToggleButton.textContent = selected.size
        ? `📎 Файлы (${readyCount}/${selected.size})`
        : '📎 Файлы';
    };

    const setFileState = (key, stateValue) => {
      const state = normalize(stateValue) || 'idle';
      fileWarmupState.set(key, state);
      const label = filesList && filesList.querySelector(`[data-file-index="${escapeSelectorAttribute(key)}"]`);
      if (label instanceof HTMLElement) {
        label.dataset.state = state;
        const stateNode = label.querySelector('[data-file-state]');
        if (stateNode) {
          if (state === 'loading') stateNode.textContent = '…';
          else if (state === 'ready') stateNode.textContent = '✓';
          else if (state === 'error') stateNode.textContent = '!';
          else stateNode.textContent = '○';
        }
      }
      updateFilesToggleLabel();
    };

    const warmupFileByKey = (key) => {
      const normalizedKey = normalize(key);
      if (!normalizedKey || !selected.has(normalizedKey)) return;
      const selectedFile = files[Number(normalizedKey)];
      if (!selectedFile) return;
      const requestId = (fileWarmupRequestId.get(normalizedKey) || 0) + 1;
      fileWarmupRequestId.set(normalizedKey, requestId);
      setFileState(normalizedKey, 'loading');
      renderNetworkBadge();
      const promise = preloadSelectedFile(selectedFile, (message) => {
        status.textContent = message;
      }, handleNetworkSample).then((ok) => {
        if (!selected.has(normalizedKey)) return ok;
        if (fileWarmupRequestId.get(normalizedKey) !== requestId) return ok;
        setFileState(normalizedKey, ok ? 'ready' : 'error');
        return ok;
      }).catch(() => {
        if (selected.has(normalizedKey) && fileWarmupRequestId.get(normalizedKey) === requestId) {
          setFileState(normalizedKey, 'error');
        }
        return false;
      }).finally(() => {
        const currentPromise = fileWarmupPromises.get(normalizedKey);
        if (currentPromise === promise) {
          fileWarmupPromises.delete(normalizedKey);
        }
      });
      fileWarmupPromises.set(normalizedKey, promise);
    };

    filesToggleButton?.addEventListener('click', () => {
      if (!filesPanel) return;
      filesPanel.hidden = !filesPanel.hidden;
      status.textContent = filesPanel.hidden ? 'Панель файлов скрыта.' : 'Выберите нужные файлы (по умолчанию ничего не выбрано).';
    });

    const setComposerDisabled = (disabled) => {
      if (promptInput) promptInput.disabled = disabled;
      if (sendButton) sendButton.disabled = disabled;
      if (styleSelect) styleSelect.disabled = disabled;
      if (filesToggleButton) filesToggleButton.disabled = disabled;
      if (voiceButton) {
        const voiceBlockedByMode = currentResponseMode === RESPONSE_GENERATION_MODES.response_ai.value;
        voiceButton.disabled = disabled || !speechSupported || voiceBlockedByMode;
      }
      modeButtons.forEach((button) => {
        button.disabled = disabled;
      });
    };

    const applyResponseModeUi = (modeValue) => {
      const nextMode = RESPONSE_GENERATION_MODES[modeValue] ? modeValue : RESPONSE_GENERATION_MODES.response_ai.value;
      const prevMode = currentResponseMode;
      if (promptInput && prevMode === RESPONSE_GENERATION_MODES.improve_ai.value) {
        improveAiDraftPrompt = promptInput.value || '';
      }
      currentResponseMode = nextMode;
      modeButtons.forEach((button) => {
        const isActive = normalize(button.dataset.responseMode) === nextMode;
        button.dataset.active = isActive ? 'true' : 'false';
      });
      const modeMeta = RESPONSE_GENERATION_MODES[nextMode];
      if (promptInput && modeMeta && modeMeta.placeholder) {
        promptInput.placeholder = modeMeta.placeholder;
        if (nextMode === RESPONSE_GENERATION_MODES.response_ai.value) {
          promptInput.value = DEFAULT_RESPONSE_AI_PROMPT_TEXT;
          promptInput.readOnly = true;
        } else {
          promptInput.readOnly = false;
          promptInput.value = improveAiDraftPrompt;
        }
        promptInput.dispatchEvent(new Event('input'));
      }
      if (voiceButton) {
        const voiceBlockedByMode = nextMode === RESPONSE_GENERATION_MODES.response_ai.value;
        voiceButton.disabled = isSending || !speechSupported || voiceBlockedByMode;
      }
      if (status && modeMeta) {
        status.textContent = `${modeMeta.icon} ${modeMeta.hint}`;
      }
    };

    const appendPromptText = (chunk) => {
      if (!promptInput) return;
      if (promptInput.readOnly) return;
      const prev = normalize(promptInput.value);
      const next = normalize(chunk);
      promptInput.value = prev && next ? `${prev} ${next}` : (next || prev);
      promptInput.dispatchEvent(new Event('input'));
    };

    const schedulePromptInputResize = () => {
      if (!promptInput) {
        return;
      }
      if (promptResizeFrame) {
        return;
      }
      const schedule = typeof globalScope.requestAnimationFrame === 'function'
        ? globalScope.requestAnimationFrame.bind(globalScope)
        : function fallbackFrame(callback) { return globalScope.setTimeout(callback, 16); };
      promptResizeFrame = schedule(() => {
        promptResizeFrame = 0;
        if (!promptInput) {
          return;
        }
        const maxHeight = isLikelyWebViewClient() ? 112 : 156;
        promptInput.style.height = 'auto';
        promptInput.style.height = Math.min(Math.max(promptInput.scrollHeight, 52), maxHeight) + 'px';
      });
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
      if (currentResponseMode === RESPONSE_GENERATION_MODES.response_ai.value) {
        status.textContent = 'В режиме «Ответ ИИ» запрос фиксированный и не редактируется.';
        return;
      }
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
      if (!isSending) resetGeneratedAnswer();
      schedulePromptInputResize();
    });
    promptInput?.dispatchEvent(new Event('input'));
    applyResponseModeUi(currentResponseMode);

    styleSelect?.addEventListener('change', () => {
      currentTone = normalize(styleSelect.value) || FIXED_RESPONSE_TONE;
      const toneMeta = getResponseStyleMeta(currentTone);
      const hadGeneratedAnswer = Boolean(lastAiAnswer);
      resetGeneratedAnswer();
      status.textContent = hadGeneratedAnswer
        ? `Стиль ответа: ${toneMeta.label || currentTone}. Сформируйте ответ заново.`
        : `Стиль ответа: ${toneMeta.label || currentTone}.`;
    });

    modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (isSending) return;
        const nextMode = normalize(button.dataset.responseMode);
        applyResponseModeUi(nextMode);
      });
    });

    async function sendByCurrentStyle() {
      if (isSending) return;
      const profile = getClientVisionProfile();
      const userPrompt = normalize(promptInput && promptInput.value) || DEFAULT_RESPONSE_AI_PROMPT_TEXT;
      const styleMeta = getResponseStyleMeta(currentTone);
      const effectivePrompt = userPrompt;
      const selectedKeys = Array.from(selected)
        .filter((key) => fileWarmupState.get(key) !== 'error');
      if (!selectedKeys.length) {
        const responseAiMessage = selected.size
          ? 'Нет готовых файлов для отправки. Проверьте выбранные файлы.'
          : 'Выберите хотя бы один файл в меню «📎 Файлы».';
        createBubble(messages, responseAiMessage, 'assistant');
        status.textContent = responseAiMessage;
        return;
      }
      if (selectedKeys.length > profile.maxFilesPerRequest) {
        status.textContent = 'Выберите меньше файлов';
        return;
      }

      const pendingWarmups = selectedKeys
        .map((key) => fileWarmupPromises.get(key))
        .filter(Boolean);

      isSending = true;
      setComposerDisabled(true);
      renderNetworkBadge();
      if (templateButton) {
        templateButton.disabled = true;
        templateButton.title = 'Сначала сформируйте текст ответа ИИ.';
      }
      if (filesPanel) filesPanel.hidden = true;
      try {
        if (pendingWarmups.length) {
          status.textContent = 'Догружаю файлы перед отправкой...';
          await Promise.allSettled(pendingWarmups);
        }

        const readySelectedKeys = selectedKeys
          .filter((key) => fileWarmupState.get(key) === 'ready');
        const skippedFilesCount = Math.max(0, selected.size - readySelectedKeys.length);
        const selectedFiles = readySelectedKeys
          .map((key) => files[Number(key)])
          .filter(Boolean);

        if (!selectedFiles.length) {
          const emptyReadyMessage = 'Нет готовых файлов для отправки.';
          createBubble(messages, emptyReadyMessage, 'assistant');
          status.textContent = emptyReadyMessage;
          return;
        }
        const prevalidation = validateFilesBeforeSend(selectedFiles, profile);
        if (!prevalidation.ok) {
          status.textContent = normalize(prevalidation.error) || 'Проверьте выбранные файлы.';
          return;
        }

        lastAiAnswer = '';
        createBubble(messages, userPrompt, 'user');
        status.textContent = 'Загрузка → Подготовка → Ответ';
        const loadingBubble = createLoadingBubble(messages);

        const answerResult = await requestTelegramVisionResponse({
          prompt: effectivePrompt,
          systemPrompt: '',
          tone: styleMeta.value,
          assistantMode: FIXED_RESPONSE_MODE,
          selectedFiles,
          onNetworkSample: handleNetworkSample,
        }, (message) => {
          const stage = normalize(message).toLowerCase();
          if (stage === 'загрузка') {
            status.textContent = 'Загрузка → Подготовка → Ответ';
            return;
          }
          if (stage === 'подготовка') {
            status.textContent = '✓ Загрузка → Подготовка → Ответ';
            return;
          }
          if (stage === 'ответ') {
            status.textContent = '✓ Загрузка → ✓ Подготовка → Ответ';
            return;
          }
          status.textContent = 'Загрузка → Подготовка → Ответ';
        });
        const answerRaw = answerResult && typeof answerResult === 'object'
          ? (answerResult.text || answerResult.response || answerResult.summary)
          : answerResult;
        const aiSkippedFilesCount = answerResult && typeof answerResult === 'object'
          ? Math.max(0, Number(answerResult.skippedFilesCount || answerResult.fileErrorsCount || 0))
          : 0;
        const answer = sanitizeAssistantFinalText(answerRaw);
        if (!answer) {
          throw new Error('ИИ не вернул текст ответа.');
        }
        lastAiAnswer = answer;
        if (templateButton) {
          templateButton.disabled = false;
          templateButton.title = 'Открыть шаблон с текстом ответа ИИ.';
        }
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        createBubble(messages, answer, 'assistant');

        const totalSkippedFilesCount = skippedFilesCount + aiSkippedFilesCount;
        status.textContent = totalSkippedFilesCount > 0
          ? `Ответ готов. ${totalSkippedFilesCount} файлов не удалось использовать.`
          : 'Ответ готов.';
      } catch (error) {
        lastAiAnswer = '';
        if (templateButton) {
          templateButton.disabled = true;
          templateButton.title = 'Сначала сформируйте текст ответа ИИ.';
        }
        const loadingNode = messages && messages.querySelector ? messages.querySelector('.tg-ai-chat__loading') : null;
        if (loadingNode && loadingNode.parentNode) loadingNode.remove();
        createBubble(messages, (error && error.message) || 'Не удалось передать данные.', 'assistant');
        status.textContent = 'Ошибка передачи.';
      } finally {
        isSending = false;
        setComposerDisabled(false);
      }
    }

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
      if (isSending) {
        target.checked = selected.has(key);
        status.textContent = 'Дождитесь завершения ответа ИИ.';
        return;
      }
      resetGeneratedAnswer();
      if (target.checked) {
        selected.add(key);
        warmupFileByKey(key);
      } else {
        selected.delete(key);
        fileWarmupPromises.delete(key);
        fileWarmupRequestId.delete(key);
        setFileState(key, 'idle');
      }
      renderNetworkBadge();
      if (target.checked) {
        status.textContent = 'Подготавливаю файл...';
      }
      updateFilesToggleLabel();
      let readyCount = 0;
      selected.forEach((selectedKey) => {
        if (fileWarmupState.get(selectedKey) === 'ready') readyCount += 1;
      });
      status.textContent = selected.size
        ? `Выбрано файлов: ${selected.size} • готово: ${readyCount}`
        : 'Можно выбрать файлы для более точного ответа.';
    });

    templateButton?.addEventListener('click', async () => {
      if (isSending) {
        status.textContent = 'Дождитесь завершения ответа ИИ.';
        return;
      }
      const preparedAnswer = sanitizeAssistantFinalText(lastAiAnswer);
      if (!preparedAnswer) {
        status.textContent = 'Сначала сформируйте текст ответа ИИ.';
        if (templateButton) {
          templateButton.disabled = true;
          templateButton.title = 'Сначала сформируйте текст ответа ИИ.';
        }
        return;
      }
      openTemplateAnswerEditor({
        aiAnswer: preparedAnswer,
        task,
        onStatus: (message) => {
          status.textContent = normalize(message) || 'Готово.';
        },
      });
    });

    updateFilesToggleLabel();

  };
}(typeof window !== 'undefined' ? window : globalThis));
