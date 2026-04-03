(function initTelegramAiResponseDialog(globalScope) {
  if (!globalScope || typeof document === 'undefined') return;

  const STYLE_ID = 'tg-ai-response-dialog-style-v1';
  const DOCS_AI_FALLBACK_ENDPOINTS = ['/api-docs.php', '/js/documents/api-docs.php'];
  const GROQ_RESPONSE_FALLBACK_ENDPOINTS = ['/api-groq-paid.php', '/js/documents/api-groq-paid.php'];
  const REQUEST_TIMEOUT_MS = 45000;
  const VISION_BATCH_SIZE = 5;
  let briefPdfJsLoader = null;

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

  function getDocsAiEndpoints() {
    const configured = normalize(globalScope && globalScope.DOCUMENTS_AI_API_URL);
    const endpoints = configured ? [configured, ...DOCS_AI_FALLBACK_ENDPOINTS] : DOCS_AI_FALLBACK_ENDPOINTS.slice();
    return Array.from(new Set(endpoints.filter(Boolean)));
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

  async function postDocsAiWithFallback(createFormData) {
    const endpoints = getDocsAiEndpoints();
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
            error: new Error('Превышено время ожидания OCR/ИИ. Попробуйте ещё раз.'),
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
    throw new Error('OCR временно недоступен.');
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

  function buildOcrFileName(fileOrBlob, fileName) {
    const base = normalize(fileName || (fileOrBlob && fileOrBlob.name) || 'ocr-file') || 'ocr-file';
    if (/\.[a-z0-9]{2,8}$/i.test(base)) return base;
    const type = normalize(fileOrBlob && fileOrBlob.type).toLowerCase();
    if (type.includes('pdf')) return `${base}.pdf`;
    if (type.includes('jpeg') || type.includes('jpg')) return `${base}.jpg`;
    if (type.includes('png')) return `${base}.png`;
    if (type.includes('webp')) return `${base}.webp`;
    if (type.includes('gif')) return `${base}.gif`;
    if (type.includes('bmp')) return `${base}.bmp`;
    if (type.includes('tiff') || type.includes('tif')) return `${base}.tiff`;
    if (type.includes('wordprocessingml.document')) return `${base}.docx`;
    return base;
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

  async function requestTelegramOcrByFile(fileOrBlob, fileName = 'ocr-file') {
    const request = await postDocsAiWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'ocr_extract');
      formData.append('language', 'rus');
      formData.append('file', fileOrBlob, buildOcrFileName(fileOrBlob, fileName));
      return formData;
    });
    const response = request && request.response;
    const payload = request && request.payload;
    if (!response && request && request.error) {
      throw request.error;
    }
    if (!response || !response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || 'OCR временно недоступен');
    }
    const text = normalize(payload && payload.text);
    if (!text) {
      throw new Error('OCR не вернул текст');
    }
    return text;
  }

  async function requestTelegramOcrByUrl(fileUrl) {
    const normalizedUrl = normalize(fileUrl);
    if (!normalizedUrl) {
      throw new Error('URL файла для OCR не найден');
    }
    const request = await postDocsAiWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'ocr_extract');
      formData.append('language', 'rus');
      formData.append('file_url', normalizedUrl);
      return formData;
    });
    const response = request && request.response;
    const payload = request && request.payload;
    if (!response && request && request.error) {
      throw request.error;
    }
    if (!response || !response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || 'OCR временно недоступен');
    }
    const text = normalize(payload && payload.text);
    if (!text) {
      throw new Error('OCR не вернул текст');
    }
    return text;
  }

  async function requestTelegramAiResponse(payload = {}) {
    const defaultPrompt = 'Проанализируй текст из выбранных файлов и дай готовое решение по задаче с четкими шагами.';
    const request = await postGroqResponseWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'generate_response');
      formData.append('prompt', normalize(payload.prompt) || defaultPrompt);
      formData.append('documentTitle', normalize(payload.documentTitle) || 'Задача Telegram');
      formData.append('context', JSON.stringify({ ...(payload.context || {}), responseMode: 'full_response' }));
      formData.append('extractedTexts', JSON.stringify(Array.isArray(payload.extractedTexts) ? payload.extractedTexts : []));
      return formData;
    });

    const response = request && request.response;
    const result = request && request.payload;
    if (!response && request && request.error) {
      throw request.error;
    }
    if (!response || !response.ok || !result || result.ok !== true) {
      throw new Error((result && result.error) || 'Не удалось получить ответ ИИ');
    }
    const answer = normalize(result.response || result.message);
    if (!answer) {
      throw new Error('ИИ вернул пустой ответ');
    }
    return answer;
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
          window.__briefPdfWorkerSrc = sources[Math.max(0, index - 1)].worker;
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
            window.__briefPdfWorkerSrc = source.worker;
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
      if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = window.__briefPdfWorkerSrc || '/pdf/pdf.worker.min.js';
      }
      const bytes = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      const totalPages = Number(pdf.numPages || 0);
      if (!totalPages) throw new Error('PDF повреждён или пустой.');
      const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
      const images = [];
      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        onProgress(`Рендер страницы ${pageNumber}/${totalPages}...`, Math.round(((index + 1) / pages.length) * 90));
        // eslint-disable-next-line no-await-in-loop
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.25 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Не удалось инициализировать canvas для PDF.');
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: ctx, viewport }).promise;
        // eslint-disable-next-line no-await-in-loop
        const blob = await new Promise((resolve) => canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/jpeg', 0.82));
        if (!blob) throw new Error('Ошибка конвертации PDF страницы в JPEG.');
        // eslint-disable-next-line no-await-in-loop
        const dataUrl = await readBlobAsDataUrl(blob);
        images.push({ dataUrl, fileName: `${(file.name || 'scan').replace(/\.pdf$/i, '')}-p${pageNumber}.jpg`, mime: 'image/jpeg' });
      }
      return { kind: 'multimodal', messageText: 'Проанализируй содержимое этого PDF', images, totalPages, selectedPages: pages };
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
    const prompt = normalize(payload.prompt) || 'Проанализируй документы и предложи готовое решение.';
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
      throw new Error('Vision режим поддерживает изображения и PDF.');
    }

    const batches = [];
    for (let i = 0; i < images.length; i += VISION_BATCH_SIZE) {
      batches.push(images.slice(i, i + VISION_BATCH_SIZE));
    }
    const formData = new FormData();
    formData.append('action', 'analyze_paid');
    formData.append('mode', 'paid');
    formData.append('vision_mode', '1');
    formData.append('prompt', prompt);
    if (extractedTexts.length) formData.append('extractedTexts', JSON.stringify(extractedTexts));
    formData.append('vision_payload', JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1200,
      temperature: 0.6,
      messages: batches.map((batch, idx) => ({
        role: 'user',
        content: [{ type: 'text', text: `${prompt}\n\nБлок ${idx + 1}/${batches.length}.` }].concat(batch.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } }))),
      })),
    }));
    images.forEach((item, idx) => {
      const raw = String(item.dataUrl || '');
      const base64 = raw.includes(',') ? raw.split(',')[1] : '';
      if (!base64) return;
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      formData.append('files', new Blob([bytes], { type: item.mime || 'image/jpeg' }), item.fileName || `vision-${idx + 1}.jpg`);
    });

    const request = await postGroqResponseWithFallback(() => formData);
    const response = request && request.response;
    const result = request && request.payload;
    if (!response || !response.ok || !result || result.ok !== true) {
      throw new Error((result && result.error) || 'Vision режим временно недоступен.');
    }
    return normalize(result.response || result.summary);
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
      .tg-ai-chat__composer{padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:auto auto 1fr auto;gap:8px;background:rgba(255,255,255,.93)}
      .tg-ai-chat__toggle{min-height:42px;border:none;padding:0 12px;border-radius:12px;background:rgba(219,234,254,.95);color:#1e3a8a;font-weight:700}
      .tg-ai-chat__input{min-height:42px;max-height:120px;resize:none;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.98);border-radius:12px;padding:9px;font-size:13px;color:#0f172a}
      .tg-ai-chat__send{min-height:42px;border:none;padding:0 14px;border-radius:12px;background:linear-gradient(135deg,#22c55e,#14b8a6);color:#fff;font-weight:700}
      .tg-ai-chat__send:disabled{opacity:.6}
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
      @keyframes tg-ai-spin{to{transform:rotate(360deg)}}
      @keyframes tg-ai-pulse{0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      @media (max-width:640px){.tg-ai-chat{padding:0}.tg-ai-chat__card{height:100dvh;border-radius:0}.tg-ai-chat__composer{grid-template-columns:1fr 1fr}.tg-ai-chat__toggle{grid-column:auto}.tg-ai-chat__input{grid-column:1/-1}.tg-ai-chat__send{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
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

  globalScope.openAiResponseDialog = function openAiResponseDialog(context = {}) {
    ensureStyles();

    const task = context && context.task ? context.task : {};
    const files = Array.isArray(task && task.files) ? task.files : [];

    const overlay = document.createElement('div');
    overlay.className = 'tg-ai-chat';
    overlay.innerHTML = `
      <div class="tg-ai-chat__card">
        <div class="tg-ai-chat__head">
          <div>
            <div class="tg-ai-chat__title">Ответ с помощью ИИ</div>
            <div class="tg-ai-chat__sub">Выберите файлы и задайте вопрос по задаче</div>
          </div>
          <button type="button" class="tg-ai-chat__close" data-close>✕</button>
        </div>
        <div class="tg-ai-chat__messages" data-messages>
          <div class="tg-ai-chat__bubble tg-ai-chat__bubble--assistant">Привет! Выберите файлы и отправьте запрос — подготовлю готовое решение по документам.</div>
        </div>
        <div class="tg-ai-chat__status" data-status>Готов к работе.</div>
        <div class="tg-ai-chat__composer">
          <button type="button" class="tg-ai-chat__toggle" data-files-toggle>📎 Файлы</button>
          <button type="button" class="tg-ai-chat__toggle" data-vision-toggle>👁 Vision: OFF</button>
          <textarea class="tg-ai-chat__input" data-input placeholder="Например: реши задачу по выбранным файлам"></textarea>
          <button type="button" class="tg-ai-chat__send" data-send>Отправить</button>
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
    const input = overlay.querySelector('[data-input]');
    const meta = overlay.querySelector('[data-meta]');
    const visionToggle = overlay.querySelector('[data-vision-toggle]');
    let visionMode = false;

    renderFiles(filesList, files);

    const close = () => overlay.remove();
    overlay.querySelector('[data-close]')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    overlay.querySelector('[data-files-toggle]')?.addEventListener('click', () => {
      filesPanel.hidden = !filesPanel.hidden;
    });
    visionToggle?.addEventListener('click', () => {
      visionMode = !visionMode;
      visionToggle.textContent = visionMode ? '👁 Vision: ON' : '👁 Vision: OFF';
      status.textContent = visionMode
        ? 'Vision включён: анализ изображений/PDF через VIP ИИ.'
        : 'Vision выключен: обычный OCR + текстовый ответ.';
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

    overlay.querySelector('[data-send]')?.addEventListener('click', async (event) => {
      const sendButton = event.currentTarget;
      const prompt = normalize(input && input.value);
      const selectedFiles = Array.from(selected)
        .map((key) => files[Number(key)])
        .filter(Boolean);

      if (!selectedFiles.length) {
        createBubble(messages, 'Выберите хотя бы один файл в меню «📎 Файлы».', 'assistant');
        status.textContent = 'Нет выбранных файлов.';
        return;
      }

      sendButton.disabled = true;
      meta.innerHTML = '';
      createBubble(messages, prompt || 'Реши задачу по выбранным файлам и дай готовый ответ.', 'user');
      status.textContent = 'Готовим файлы...';
      const startedAt = Date.now();
      const loadingBubble = createLoadingBubble(messages);

      try {
        const extractedTexts = [];
        let answer = '';
        if (visionMode) {
          answer = await requestTelegramVisionResponse({ prompt, selectedFiles }, (message) => {
            status.textContent = message;
          });
        } else {
          for (let index = 0; index < selectedFiles.length; index += 1) {
            const currentFile = selectedFiles[index];
            const fileLabel = normalize(currentFile && (currentFile.originalName || currentFile.name || currentFile.storedName)) || `Файл ${index + 1}`;
            status.textContent = `OCR ${index + 1}/${selectedFiles.length}: ${fileLabel}`;
            let extractedText = '';
            try {
              const fileBlob = await loadSelectedFileAsBlob(currentFile);
              extractedText = await requestTelegramOcrByFile(fileBlob, fileBlob && fileBlob.name ? fileBlob.name : fileLabel);
            } catch (blobError) {
              const fallbackUrl = buildFileUrlCandidates(currentFile)[0] || '';
              if (!fallbackUrl) {
                throw blobError;
              }
              extractedText = await requestTelegramOcrByUrl(fallbackUrl);
            }
            if (!normalize(extractedText)) {
              throw new Error(`OCR не вернул текст для файла: ${fileLabel}`);
            }
            extractedTexts.push({
              name: fileLabel,
              type: 'text/plain',
              text: String(extractedText).slice(0, 16000),
            });
          }

          status.textContent = 'Отправляем запрос в ИИ...';
          answer = await requestTelegramAiResponse({
            prompt,
            documentTitle: normalize(task && (task.title || task.documentTitle || task.subject)) || 'Задача Telegram',
            extractedTexts,
            context: {
              source: 'telegram-ai-response-dialog',
              task,
              selectedFiles: selectedFiles.map((item) => ({
                name: normalize(item && (item.originalName || item.name || item.storedName)),
                url: buildFileUrlCandidates(item)[0] || '',
              })),
            },
          });
        }
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        createBubble(messages, answer, 'assistant');

        const elapsed = Date.now() - startedAt;
        meta.innerHTML = `
          <span class="tg-ai-chat__chip">Режим: ${visionMode ? 'vision' : 'generate_response'}</span>
          <span class="tg-ai-chat__chip">Файлов: ${selectedFiles.length}</span>
          <span class="tg-ai-chat__chip">OCR: ${extractedTexts.length}</span>
          <span class="tg-ai-chat__chip">Время: ${Number(elapsed) || 0} мс</span>
        `;
        status.textContent = 'Данные переданы.';
        if (input) input.value = '';
      } catch (error) {
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        createBubble(messages, (error && error.message) || 'Не удалось передать данные.', 'assistant');
        status.textContent = 'Ошибка передачи.';
      } finally {
        sendButton.disabled = false;
      }
    });
  };
}(typeof window !== 'undefined' ? window : globalThis));

export {};
