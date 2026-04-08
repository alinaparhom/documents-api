const GROQ_PAID_ENDPOINTS = ['/api-groq-paid.php', '/js/documents/api-groq-paid.php'];
const DOCS_AI_FALLBACK_ENDPOINTS = ['/api-docs.php', '/js/documents/api-docs.php'];
const TELEGRAM_BRIEF_MODAL_STYLE_ID = 'appdosc-brief-ai-style-v2';
const BRIEF_AI_REQUEST_TIMEOUT_MS = 90000;
const BRIEF_SUMMARY_PROMPT = 'Сделай полный вывод по всему документу без потери важных деталей. Количество предложений выбирай по контексту.';
const BRIEF_PDF_SOURCES = [
  { script: '/js/documents/pdf/pdf.min.js', worker: '/js/documents/pdf/pdf.worker.min.js' },
  { script: '/pdf/pdf.min.js', worker: '/pdf/pdf.worker.min.js' },
  { script: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
  { script: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' },
];
const BRIEF_DEFAULT_PDF_WORKER_SRC = BRIEF_PDF_SOURCES[0].worker;
const BRIEF_PDF_PAGE_LIMIT = 5;

export function createTelegramBriefAi(deps = {}) {
  const {
    normalizeValue = (value) => String(value || '').trim(),
    escapeHtml = (value) => String(value || ''),
    getAttachmentName = (_, index) => `Файл ${index}`,
    resolveFileFetchUrl = () => '',
  } = deps;

  let briefPdfJsLoader = null;

  function toBriefSummaryText(value) {
    const text = normalizeValue(value);
    return text || '';
  }

  async function postGroqPaidWithFallback(createFormData) {
    let lastError = null;
    for (let index = 0; index < GROQ_PAID_ENDPOINTS.length; index += 1) {
      const endpoint = GROQ_PAID_ENDPOINTS[index];
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), BRIEF_AI_REQUEST_TIMEOUT_MS) : null;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          body: createFormData(),
          signal: controller ? controller.signal : undefined,
        });
        if (response.status === 404 || response.status === 405) continue;
        const payload = await response.json().catch(() => null);
        return { endpoint, response, payload };
      } catch (error) {
        lastError = error && error.name === 'AbortError'
          ? new Error('Сервер Платного ИИ не ответил за 90 сек. Повторите попытку.')
          : error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
    throw lastError || new Error('Не удалось отправить файл в платный ИИ.');
  }

  function ensureTelegramBriefModalStyle() {
    if (document.getElementById(TELEGRAM_BRIEF_MODAL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TELEGRAM_BRIEF_MODAL_STYLE_ID;
    style.textContent = `
      .appdosc-brief-ai{position:fixed;inset:0;z-index:2800;background:rgba(15,23,42,.32);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;padding:8px}
      .appdosc-brief-ai__panel{width:min(920px,100%);max-height:calc(100dvh - 16px);display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.98),rgba(248,250,252,.94));border-radius:22px;border:1px solid rgba(255,255,255,.9);overflow:hidden;box-shadow:0 14px 38px rgba(15,23,42,.16)}
      .appdosc-brief-ai__header{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(226,232,240,.95)}
      .appdosc-brief-ai__close{border:1px solid rgba(203,213,225,.95);background:rgba(255,255,255,.9);color:#0f172a;border-radius:10px;padding:6px 10px;font-size:12px;font-weight:600;min-height:32px;flex:0 0 auto}
      .appdosc-brief-ai__title{font-size:16px;font-weight:700;color:#0f172a}
      .appdosc-brief-ai__sub{font-size:12px;color:#64748b}
      .appdosc-brief-ai__toggle{display:inline-flex;align-items:center;gap:8px;margin-top:7px;padding:6px 9px;border-radius:11px;border:1px solid rgba(203,213,225,.95);background:rgba(255,255,255,.88);font-size:12px;color:#334155;font-weight:600}
      .appdosc-brief-ai__toggle input{accent-color:#2563eb;width:16px;height:16px}
      .appdosc-brief-ai__hint{margin-top:6px;font-size:11px;color:#475569}
      .appdosc-brief-ai__status{margin:0;padding:6px 10px;border-bottom:1px solid rgba(226,232,240,.85);font-size:12px;color:#334155;background:rgba(248,250,252,.88)}
      .appdosc-brief-ai__status[data-tone="loading"]{color:#1d4ed8}
      .appdosc-brief-ai__status[data-tone="error"]{color:#b91c1c}
      .appdosc-brief-ai__status[data-tone="success"]{color:#166534}
      .appdosc-brief-ai__body{display:grid;grid-template-columns:minmax(210px,290px) minmax(0,1fr);gap:10px;padding:10px;min-height:0;flex:1}
      .appdosc-brief-ai__list{display:flex;flex-direction:column;gap:8px;overflow:auto}
      .appdosc-brief-ai__item{border:1px solid rgba(203,213,225,.92);background:rgba(255,255,255,.82);backdrop-filter:blur(8px);border-radius:14px;padding:10px;text-align:left;opacity:1;min-height:54px;transition:.2s ease}
      .appdosc-brief-ai__item:disabled{opacity:.6}
      .appdosc-brief-ai__item span{display:block;word-break:break-word;overflow-wrap:anywhere}
      .appdosc-brief-ai__item strong{font-size:13px;color:#0f172a}
      .appdosc-brief-ai__item small{font-size:11px;color:#64748b}
      .appdosc-brief-ai__item.is-active{border-color:rgba(59,130,246,.6);background:rgba(239,246,255,.9);box-shadow:0 8px 18px rgba(59,130,246,.16)}
      .appdosc-brief-ai__preview{margin:0;border:1px solid rgba(203,213,225,.92);border-radius:16px;background:rgba(255,255,255,.9);padding:12px;overflow:auto;font-size:13px;line-height:1.58;color:#0f172a;opacity:1;font-weight:500}
      .appdosc-brief-ai__placeholder{margin:0;color:#64748b;white-space:pre-wrap}
      @media (max-width:768px){.appdosc-brief-ai{padding:0}.appdosc-brief-ai__panel{max-height:100dvh;border-radius:0}.appdosc-brief-ai__body{grid-template-columns:1fr}.appdosc-brief-ai__list{flex-direction:row;overflow:auto;padding-bottom:2px}.appdosc-brief-ai__item{min-width:180px}.appdosc-brief-ai__close{min-height:30px;padding:6px 9px}}
    `;
    document.head.appendChild(style);
  }

  function ensureBriefPdfJsLoaded() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      if (window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = BRIEF_DEFAULT_PDF_WORKER_SRC;
      }
      window.__briefPdfWorkerSrc = BRIEF_DEFAULT_PDF_WORKER_SRC;
      return Promise.resolve(window.pdfjsLib);
    }
    if (briefPdfJsLoader) {
      return briefPdfJsLoader;
    }
    const sources = BRIEF_PDF_SOURCES;
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

  async function convertPdfToImageFileForBrief(file, fallbackName) {
    const fileName = String(fallbackName || (file && file.name) || 'brief-file');
    const isPdf = file && ((file.type && String(file.type).toLowerCase() === 'application/pdf') || /\.pdf$/i.test(fileName));
    if (!isPdf || !file) {
      return file;
    }
    try {
      const pdfjsLib = await ensureBriefPdfJsLoaded();
      if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = window.__briefPdfWorkerSrc || BRIEF_DEFAULT_PDF_WORKER_SRC;
      }
      const bytes = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise((resolve) => {
        canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/jpeg', 0.9);
      });
      if (!blob) return file;
      return new File([blob], fileName.replace(/\.pdf$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch (_) {
      return file;
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать текст файла.'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось преобразовать файл в base64.'));
      reader.readAsDataURL(blob);
    });
  }

  function parsePageSelection(raw, maxPages) {
    const value = normalizeValue(raw).replace(/\s+/g, '');
    if (!value) return [];
    const pages = new Set();
    value.split(',').forEach((chunk) => {
      if (!chunk) return;
      const rangeMatch = chunk.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = Math.max(1, Number(rangeMatch[1]));
        const end = Math.max(start, Number(rangeMatch[2]));
        for (let page = start; page <= end; page += 1) {
          if (page <= maxPages) pages.add(page);
        }
        return;
      }
      const single = Number(chunk);
      if (Number.isFinite(single) && single >= 1 && single <= maxPages) {
        pages.add(single);
      }
    });
    return Array.from(pages).slice(0, BRIEF_PDF_PAGE_LIMIT);
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

  async function buildVisionPayloadFromFile(file, onProgress) {
    if (!(file instanceof File)) {
      throw new Error('Файл не выбран.');
    }
    const mime = String(file.type || '').toLowerCase();
    const name = String(file.name || 'document').toLowerCase();
    const isImage = mime === 'image/jpeg' || mime === 'image/png' || /\.(jpe?g|png)$/i.test(name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    const isText = /\.(txt|json|csv|md)$/i.test(name);
    const isDocx = /\.docx$/i.test(name);
    const isXlsx = /\.xlsx$/i.test(name);

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
        pdfjsLib.GlobalWorkerOptions.workerSrc = window.__briefPdfWorkerSrc || BRIEF_DEFAULT_PDF_WORKER_SRC;
      }
      const bytes = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      const totalPages = Number(pdf.numPages || 0);
      if (!totalPages) throw new Error('PDF повреждён или пустой.');
      const pages = Array.from({ length: Math.min(totalPages, BRIEF_PDF_PAGE_LIMIT) }, (_, i) => i + 1);
      const pagesLabel = `${pages.length}/${totalPages}`;
      const images = [];
      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        onProgress(`Рендер страницы ${pageNumber} (первые ${pagesLabel})...`, Math.round(((index + 1) / pages.length) * 90));
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

  async function requestTelegramVisionByFile(source, setStatus) {
    let file = source && source.fileObject instanceof File ? source.fileObject : null;
    const fileName = normalizeValue(source && source.label) || 'vision-file';
    const fileUrl = normalizeValue(source && source.url);
    if (!file) {
      if (!fileUrl) throw new Error('Не найден файл для Vision режима.');
      setStatus('Загружаю файл...', 'loading');
      const response = await fetch(fileUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Не удалось загрузить файл (${response.status}).`);
      const blob = await response.blob();
      file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    }

    const prepared = await buildVisionPayloadFromFile(file, (message) => setStatus(message, 'loading'));

    if (prepared.kind === 'text') {
      const text = normalizeValue(prepared.extractedText);
      if (!text) throw new Error('Не удалось извлечь текст из файла.');
      const request = await postGroqPaidWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'generate_summary');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', BRIEF_SUMMARY_PROMPT);
        formData.append('extractedTexts', JSON.stringify([{ name: prepared.fileName || fileName, type: file.type || 'text/plain', text: text.slice(0, 60000) }]));
        return formData;
      });
      const payload = request && request.payload;
      if (!request.response.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || 'Ошибка запроса Vision режима.');
      }
      return {
        summary: toBriefSummaryText(payload.summary || payload.response),
        model: payload.model,
        timeMs: payload.durationMs || payload.timeMs,
        warning: prepared.warning || '',
      };
    }

    let ocrText = '';
    try {
      setStatus('Распознаю текст (OCR) из файла...', 'loading');
      ocrText = await requestTelegramOcrByFile(file, file.name || fileName);
    } catch (_) {
      ocrText = '';
    }

    const images = Array.isArray(prepared.images) ? prepared.images : [];
    const imageBatches = chunkItems(images, 5);
    const partialAnswers = [];
    const startedAt = Date.now();

    if (!imageBatches.length && ocrText) {
      const fallbackRequest = await postGroqPaidWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'generate_summary');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', BRIEF_SUMMARY_PROMPT);
        formData.append('extractedTexts', JSON.stringify([{
          name: file.name || fileName,
          type: file.type || 'text/plain',
          text: String(ocrText).slice(0, 70000),
        }]));
        return formData;
      });
      const fallbackPayload = fallbackRequest && fallbackRequest.payload;
      if (!fallbackRequest.response.ok || !fallbackPayload || fallbackPayload.ok !== true) {
        throw new Error((fallbackPayload && fallbackPayload.error) || 'Ошибка OCR fallback в Vision режиме.');
      }
      return {
        summary: toBriefSummaryText(fallbackPayload.summary || fallbackPayload.response),
        model: fallbackPayload.model || 'meta-llama/llama-4-scout-17b-16e-instruct',
        timeMs: fallbackPayload.durationMs || (Date.now() - startedAt),
        warning: '',
      };
    }

    for (let batchIndex = 0; batchIndex < imageBatches.length; batchIndex += 1) {
      const currentBatch = imageBatches[batchIndex];
      setStatus(`Vision: анализ блока ${batchIndex + 1}/${imageBatches.length} (${currentBatch.length} стр.)...`, 'loading');
      // eslint-disable-next-line no-await-in-loop
      const request = await postGroqPaidWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'analyze_paid');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', prepared.messageText || 'Проанализируй содержимое этого файла');
        if (ocrText && batchIndex === 0) {
          formData.append('extractedTexts', JSON.stringify([{
            name: file.name || fileName,
            type: file.type || 'text/plain',
            text: String(ocrText).slice(0, 70000),
          }]));
        }
        formData.append('vision_payload', JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 1000,
          temperature: 0.7,
          messages: [{
            role: 'user',
            content: [{ type: 'text', text: `${prepared.messageText || 'Проанализируй содержимое этого файла'}\n\nБлок ${batchIndex + 1} из ${imageBatches.length}.` }].concat(
              currentBatch.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } }))
            ),
          }],
        }));
        currentBatch.forEach((item, index) => {
          const data = String(item.dataUrl || '');
          const base64 = data.includes(',') ? data.split(',')[1] : data;
          const mimeType = item.mime || 'image/jpeg';
          const blob = new Blob([Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))], { type: mimeType });
          formData.append('files', blob, item.fileName || `vision-${batchIndex + 1}-${index + 1}.jpg`);
        });
        return formData;
      });
      const payload = request && request.payload;
      if (!request.response.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || `Ошибка Vision запроса (блок ${batchIndex + 1}).`);
      }
      partialAnswers.push(toBriefSummaryText(payload.response || payload.summary));
    }

    let finalSummary = toBriefSummaryText(partialAnswers.join('\n\n').trim());
    if (partialAnswers.length > 1) {
      setStatus('Vision: объединяю результаты всех блоков...', 'loading');
      const mergeRequest = await postGroqPaidWithFallback(() => {
        const formData = new FormData();
        formData.append('action', 'generate_summary');
        formData.append('mode', 'paid');
        formData.append('vision_mode', '1');
        formData.append('prompt', BRIEF_SUMMARY_PROMPT);
        formData.append('extractedTexts', JSON.stringify([{
          name: file.name || fileName,
          type: 'text/plain',
          text: partialAnswers.map((item, idx) => `Блок ${idx + 1}/${partialAnswers.length}:\n${item}`).join('\n\n'),
        }]));
        return formData;
      });
      const mergePayload = mergeRequest && mergeRequest.payload;
      if (mergeRequest.response.ok && mergePayload && mergePayload.ok === true) {
        finalSummary = toBriefSummaryText(mergePayload.summary || mergePayload.response) || finalSummary;
      }
    }

    if (!finalSummary) {
      throw new Error('Vision не вернул итоговый текст.');
    }
    return {
      summary: finalSummary,
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      timeMs: Date.now() - startedAt,
      warning: ocrText ? '' : 'OCR не вернул текст, ответ построен по изображению.',
    };
  }


  function hasMeaningfulTelegramBriefPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const summary = normalizeValue(payload.summary);
    const analysis = normalizeValue(payload.analysis);
    const responseText = normalizeValue(payload.response);
    const block = payload && payload.decisionBlock && typeof payload.decisionBlock === 'object' ? payload.decisionBlock : {};
    const hasActions = Array.isArray(block.required_actions) && block.required_actions.some((item) => normalizeValue(item).length >= 4);
    const hasRequirements = Array.isArray(block.requirements) && block.requirements.some((item) => normalizeValue(item).length >= 4);
    return Boolean(summary || analysis || responseText || hasActions || hasRequirements);
  }

  async function requestTelegramOcrByFile(fileOrBlob, fileName = 'ocr-file') {
    const request = await postDocsOcrWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'ocr_extract');
      formData.append('language', 'rus');
      const normalizedName = (() => {
        const base = String(fileName || (fileOrBlob && fileOrBlob.name) || 'ocr-file').trim() || 'ocr-file';
        if (/\.[a-z0-9]{2,8}$/i.test(base)) return base;
        const type = String(fileOrBlob && fileOrBlob.type || '').toLowerCase();
        if (type.includes('pdf')) return `${base}.pdf`;
        if (type.includes('jpeg') || type.includes('jpg')) return `${base}.jpg`;
        if (type.includes('png')) return `${base}.png`;
        if (type.includes('webp')) return `${base}.webp`;
        if (type.includes('gif')) return `${base}.gif`;
        if (type.includes('bmp')) return `${base}.bmp`;
        if (type.includes('tiff') || type.includes('tif')) return `${base}.tiff`;
        if (type.includes('wordprocessingml.document')) return `${base}.docx`;
        return base;
      })();
      formData.append('file', fileOrBlob, normalizedName);
      return formData;
    });
    const response = request && request.response;
    const payload = request && request.payload;
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || 'OCR временно недоступен');
    }
    const text = payload && payload.text ? String(payload.text).trim() : '';
    if (!text) throw new Error('OCR не вернул текст');
    return text;
  }

  async function requestTelegramOcrByUrl(fileUrl) {
    const normalizedUrl = normalizeValue(fileUrl);
    if (!normalizedUrl) {
      throw new Error('URL файла для OCR не найден');
    }
    const request = await postDocsOcrWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'ocr_extract');
      formData.append('language', 'rus');
      formData.append('file_url', normalizedUrl);
      return formData;
    });
    const response = request && request.response;
    const payload = request && request.payload;
    if (!response || !response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || 'OCR временно недоступен');
    }
    const text = payload && payload.text ? String(payload.text).trim() : '';
    if (!text) throw new Error('OCR не вернул текст');
    return text;
  }

  async function postDocsOcrWithFallback(createFormData) {
    let lastResult = null;
    for (let index = 0; index < DOCS_AI_FALLBACK_ENDPOINTS.length; index += 1) {
      const endpoint = DOCS_AI_FALLBACK_ENDPOINTS[index];
      let response = null;
      let payload = null;
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), BRIEF_AI_REQUEST_TIMEOUT_MS) : null;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          body: createFormData(),
          signal: controller ? controller.signal : undefined,
        });
        payload = await response.json().catch(() => null);
      } catch (error) {
        const timeoutError = error && error.name === 'AbortError'
          ? new Error('OCR превысил лимит ожидания (90 сек). Попробуйте файл меньшего размера.')
          : error;
        lastResult = { endpoint, error: timeoutError, response, payload };
        continue;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      const shouldTryNextEndpoint = !response.ok && (response.status === 404 || response.status === 405 || !payload);
      if (shouldTryNextEndpoint && index < DOCS_AI_FALLBACK_ENDPOINTS.length - 1) {
        lastResult = { endpoint, response, payload };
        continue;
      }
      return { endpoint, response, payload };
    }
    if (lastResult) return lastResult;
    throw new Error('OCR временно недоступен.');
  }

  async function requestTelegramBriefAiDirectWithAttachment(source) {
    const fileName = normalizeValue(source && source.label) || 'brief-file';
    let fileForVip = null;
    const fileUrl = normalizeValue(source && source.url);
    if (source && source.fileObject instanceof File) {
      fileForVip = source.fileObject;
    } else {
      if (!fileUrl) {
        throw new Error('Не найден URL файла для VIP режима.');
      }
      try {
        const fetched = await fetch(fileUrl, { credentials: 'same-origin' });
        if (!fetched.ok) {
          throw new Error(`Не удалось загрузить файл (${fetched.status})`);
        }
        const blob = await fetched.blob();
        fileForVip = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      } catch (_) {
        fileForVip = null;
      }
    }
    const extractedText = fileForVip
      ? await requestTelegramOcrByFile(fileForVip, fileForVip.name || fileName)
      : await requestTelegramOcrByUrl(fileUrl);
    if (!String(extractedText || '').trim()) {
      throw new Error('OCR не вернул текст для выбранного файла.');
    }
    if (fileForVip) {
      fileForVip = await convertPdfToImageFileForBrief(fileForVip, fileName);
    }
    const request = await postGroqPaidWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'generate_summary');
      formData.append('mode', 'paid');
      formData.append('prompt', BRIEF_SUMMARY_PROMPT);
      if (fileForVip) {
        formData.append('files', fileForVip, fileForVip.name || fileName);
      }
      formData.append('extractedTexts', JSON.stringify([{ name: fileName, type: 'text/plain', text: String(extractedText).slice(0, 16000) }]));
      return formData;
    });
    const response = request && request.response;
    const payload = request && request.payload;
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || `Ошибка ИИ (${response ? response.status : 0})`);
    }
    if (!hasMeaningfulTelegramBriefPayload(payload)) {
      throw new Error('VIP ИИ не вернул осмысленный summary. Повторите запрос.');
    }
    return payload;
  }

  function extractTelegramPlainAiBriefText(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const candidates = [payload.summary, payload.response, payload.analysis, payload.text, payload.answer];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = normalizeValue(candidates[index]);
      if (candidate) return toBriefSummaryText(candidate);
    }
    return '';
  }

  function renderTelegramBriefPreview(container, payload) {
    const summaryText = toBriefSummaryText(payload && payload.summary) || extractTelegramPlainAiBriefText(payload);
    container.innerHTML = `<p class="appdosc-brief-ai__placeholder">${escapeHtml(summaryText || 'Пустой ответ от ИИ.')}</p>`;
  }

  return function openTelegramBriefModal(task, statusHandler) {
    ensureTelegramBriefModalStyle();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const modal = document.createElement('div');
    modal.className = 'appdosc-brief-ai';
    modal.innerHTML = `
      <div class="appdosc-brief-ai__panel">
        <div class="appdosc-brief-ai__header">
          <div>
            <div class="appdosc-brief-ai__title">Кратко ИИ</div>
            <div class="appdosc-brief-ai__sub">Файл → OCR → api-groq-paid.php → краткий вывод</div>
            <div class="appdosc-brief-ai__hint">Vision режим активен: 1) Нажмите файл → 2) Получите краткое решение.</div>
            <div class="appdosc-brief-ai__hint">ℹ️ Анализ только первых 5 страниц.</div>
          </div>
          <button type="button" class="appdosc-brief-ai__close" data-close>✕</button>
        </div>
        <p class="appdosc-brief-ai__status" data-status data-tone="idle">Выберите файл для анализа.</p>
        <p class="appdosc-brief-ai__status" data-meta data-tone="idle"> </p>
        <div class="appdosc-brief-ai__body">
          <div class="appdosc-brief-ai__list" data-list></div>
          <div class="appdosc-brief-ai__preview" data-preview>
            <p class="appdosc-brief-ai__placeholder">Выберите файл для Vision-анализа.</p>
          </div>
        </div>
      </div>`;
    const list = modal.querySelector('[data-list]');
    const preview = modal.querySelector('[data-preview]');
    const statusNode = modal.querySelector('[data-status]');
    const metaNode = modal.querySelector('[data-meta]');
    const sources = [];
    let activeRequestId = 0;

    const setStatus = (message, tone = 'idle') => {
      if (!statusNode) return;
      statusNode.textContent = message;
      statusNode.setAttribute('data-tone', tone);
    };

    (Array.isArray(task && task.files) ? task.files : []).forEach((file, index) => {
      const name = getAttachmentName(file, index + 1);
      const url = resolveFileFetchUrl(file);
      if (url) sources.push({ label: name, url, type: 'file' });
    });

    const activate = (button) => Array.from(list.querySelectorAll('.appdosc-brief-ai__item')).forEach((el) => el.classList.toggle('is-active', el === button));
    const onEscClose = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    const close = () => {
      document.removeEventListener('keydown', onEscClose);
      document.body.style.overflow = previousBodyOverflow;
      modal.remove();
    };
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('[data-close]').addEventListener('click', close);
    document.addEventListener('keydown', onEscClose);

    sources.forEach((source) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'appdosc-brief-ai__item';
      const titleWrap = document.createElement('span');
      const titleNode = document.createElement('strong');
      titleNode.textContent = normalizeValue(source.label) || 'Файл';
      titleWrap.appendChild(titleNode);
      const typeWrap = document.createElement('span');
      const typeNode = document.createElement('small');
      typeNode.textContent = 'Вложение';
      typeWrap.appendChild(typeNode);
      button.append(titleWrap, typeWrap);
      button.addEventListener('click', async () => {
        const requestId = ++activeRequestId;
        activate(button);
        try {
          button.disabled = true;
          const modeLabel = 'Vision';
          setStatus(`${modeLabel}: ${source.label}`, 'loading');
          preview.innerHTML = `<p class="appdosc-brief-ai__placeholder">⏳ ${escapeHtml(modeLabel)}: подготовка и отправка файла...</p>`;
          const startedAt = Date.now();
          const aiPayload = await requestTelegramVisionByFile(source, setStatus);
          if (requestId !== activeRequestId) return;
          renderTelegramBriefPreview(preview, aiPayload);
          setStatus('Готово. Краткий вывод получен через Vision.', 'success');
          if (metaNode) {
            const elapsedSec = (Math.max(1, Number(aiPayload && aiPayload.timeMs) || (Date.now() - startedAt)) / 1000).toFixed(1);
            metaNode.textContent = `Модель: ${normalizeValue(aiPayload && aiPayload.model) || '—'} • Ожидание: ${elapsedSec} сек • Режим: Vision`;
            const warning = normalizeValue(aiPayload && aiPayload.warning);
            if (warning) {
              metaNode.textContent += ` • ${warning}`;
            }
          }
        } catch (error) {
          if (requestId !== activeRequestId) return;
          const message = error instanceof Error ? error.message : 'неизвестная ошибка';
          preview.innerHTML = `<p class="appdosc-brief-ai__placeholder">Ошибка анализа.\n${escapeHtml(message)}</p>`;
          setStatus(`Ошибка: ${message}`, 'error');
          if (metaNode) metaNode.textContent = '';
          if (typeof statusHandler === 'function') statusHandler('warning', message);
        } finally {
          button.disabled = false;
        }
      });
      list.appendChild(button);
    });

    if (!sources.length) {
      list.innerHTML = '<div class="appdosc-empty">Нет файлов для анализа.</div>';
      setStatus('Нет файлов для анализа в этой задаче.', 'error');
    }

    document.body.appendChild(modal);
  };
}
