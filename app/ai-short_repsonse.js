const GROQ_PAID_ENDPOINTS = ['/api-groq-paid.php', '/js/documents/api-groq-paid.php'];
const DOCS_AI_FALLBACK_ENDPOINTS = ['/api-docs.php', '/js/documents/api-docs.php'];
const TELEGRAM_BRIEF_MODAL_STYLE_ID = 'appdosc-brief-ai-style-v2';
const BRIEF_AI_REQUEST_TIMEOUT_MS = 90000;
const BRIEF_AI_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export function createTelegramBriefAi(deps = {}) {
  const {
    normalizeValue = (value) => String(value || '').trim(),
    escapeHtml = (value) => String(value || ''),
    getAttachmentName = (_, index) => `Файл ${index}`,
    resolveFileFetchUrl = () => '',
  } = deps;

  let briefPdfJsLoader = null;

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
      return Promise.resolve(window.pdfjsLib);
    }
    if (briefPdfJsLoader) {
      return briefPdfJsLoader;
    }
    briefPdfJsLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/pdf/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('pdfjsLib не найден'));
        }
      };
      script.onerror = () => reject(new Error('Не удалось загрузить PDF библиотеку'));
      document.head.appendChild(script);
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
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.js';
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
    const fileName = (() => {
      const label = normalizeValue(source && source.label);
      if (/\.[a-z0-9]{2,8}$/i.test(label)) return label;
      const sourceUrl = normalizeValue(source && source.url);
      const urlName = sourceUrl
        ? normalizeValue(decodeURIComponent(sourceUrl.split('?')[0].split('#')[0].split('/').pop() || ''))
        : '';
      if (/\.[a-z0-9]{2,8}$/i.test(urlName)) return urlName;
      return label || 'brief-file';
    })();
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

  async function requestTelegramBriefAiVisionWithAttachment(source) {
    const fileName = (() => {
      const label = normalizeValue(source && source.label);
      if (/\.[a-z0-9]{2,8}$/i.test(label)) return label;
      const sourceUrl = normalizeValue(source && source.url);
      const urlName = sourceUrl
        ? normalizeValue(decodeURIComponent(sourceUrl.split('?')[0].split('#')[0].split('/').pop() || ''))
        : '';
      if (/\.[a-z0-9]{2,8}$/i.test(urlName)) return urlName;
      return label || 'brief-file';
    })();
    let fileForVision = null;
    const fileUrl = normalizeValue(source && source.url);
    if (source && source.fileObject instanceof File) {
      fileForVision = source.fileObject;
    } else {
      if (!fileUrl) {
        throw new Error('Не найден URL файла для новой логики.');
      }
      const fetched = await fetch(fileUrl, { credentials: 'same-origin' });
      if (!fetched.ok) {
        throw new Error(`Не удалось загрузить файл (${fetched.status})`);
      }
      const blob = await fetched.blob();
      fileForVision = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    }
    fileForVision = await convertPdfToImageFileForBrief(fileForVision, fileName);
    const type = String(fileForVision && fileForVision.type || '').toLowerCase();
    const name = normalizeValue(fileForVision && fileForVision.name).toLowerCase();
    const isImageByName = /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    if (!type.startsWith('image/') && !isImageByName) {
      throw new Error('Новая логика поддерживает только изображения (PNG/JPG/WEBP) и PDF.');
    }

    const request = await postGroqPaidWithFallback(() => {
      const formData = new FormData();
      formData.append('action', 'generate_image_brief');
      formData.append('model', BRIEF_AI_VISION_MODEL);
      formData.append('prompt', 'Что на этом изображении? Дай краткий ответ по сути для новичка.');
      formData.append('file', fileForVision, fileForVision.name || fileName);
      return formData;
    });
    const response = request && request.response;
    const payload = request && request.payload;
    if (!response || !response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || `Ошибка новой логики (${response ? response.status : 0})`);
    }
    if (!hasMeaningfulTelegramBriefPayload(payload)) {
      throw new Error('Новая логика не вернула осмысленный ответ.');
    }
    return payload;
  }

  function extractTelegramPlainAiBriefText(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const candidates = [payload.summary, payload.response, payload.analysis, payload.text, payload.answer];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = normalizeValue(candidates[index]);
      if (candidate) return candidate;
    }
    return '';
  }

  function renderTelegramBriefPreview(container, payload) {
    const summaryText = normalizeValue(payload && payload.summary) || extractTelegramPlainAiBriefText(payload);
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
            <label class="appdosc-brief-ai__toggle"><input type="checkbox" data-paid-ai>Платный ИИ</label>
            <label class="appdosc-brief-ai__toggle"><input type="checkbox" data-new-logic>Новая логика (Vision)</label>
            <div class="appdosc-brief-ai__hint">1) Включите «Платный ИИ» или «Новая логика» → 2) Нажмите файл → 3) Получите краткий ответ.</div>
          </div>
          <button type="button" class="appdosc-brief-ai__close" data-close>✕</button>
        </div>
        <p class="appdosc-brief-ai__status" data-status data-tone="idle">Выберите файл для анализа.</p>
        <p class="appdosc-brief-ai__status" data-meta data-tone="idle"> </p>
        <div class="appdosc-brief-ai__body">
          <div class="appdosc-brief-ai__list" data-list></div>
          <div class="appdosc-brief-ai__preview" data-preview>
            <p class="appdosc-brief-ai__placeholder">Отметьте «Платный ИИ», затем выберите файл.</p>
          </div>
        </div>
      </div>`;
    const list = modal.querySelector('[data-list]');
    const preview = modal.querySelector('[data-preview]');
    const statusNode = modal.querySelector('[data-status]');
    const metaNode = modal.querySelector('[data-meta]');
    const paidCheckbox = modal.querySelector('[data-paid-ai]');
    const newLogicCheckbox = modal.querySelector('[data-new-logic]');
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
        const isVisionMode = Boolean(newLogicCheckbox && newLogicCheckbox.checked);
        const isPaidMode = Boolean(paidCheckbox && paidCheckbox.checked);
        if (!isVisionMode && !isPaidMode) {
          setStatus('Сначала включите «Платный ИИ» или «Новая логика».', 'error');
          preview.innerHTML = '<p class="appdosc-brief-ai__placeholder">Без выбранного режима анализ не запускается.</p>';
          return;
        }
        const requestId = ++activeRequestId;
        activate(button);
        try {
          button.disabled = true;
          setStatus(isVisionMode ? `Новая логика Vision: ${source.label}` : `OCR и платный анализ: ${source.label}`, 'loading');
          preview.innerHTML = isVisionMode
            ? '<p class="appdosc-brief-ai__placeholder">⏳ Отправка изображения в Vision модель...</p>'
            : '<p class="appdosc-brief-ai__placeholder">⏳ OCR и отправка в api-groq-paid.php...</p>';
          const startedAt = Date.now();
          const aiPayload = isVisionMode
            ? await requestTelegramBriefAiVisionWithAttachment(source)
            : await requestTelegramBriefAiDirectWithAttachment(source);
          if (requestId !== activeRequestId) return;
          renderTelegramBriefPreview(preview, aiPayload);
          setStatus(isVisionMode ? 'Готово. Ответ получен через новую Vision логику.' : 'Готово. Краткий вывод получен через Платный ИИ.', 'success');
          if (metaNode) {
            const elapsedSec = (Math.max(1, Number(aiPayload && aiPayload.timeMs) || (Date.now() - startedAt)) / 1000).toFixed(1);
            metaNode.textContent = `Модель: ${normalizeValue(aiPayload && aiPayload.model) || '—'} • Ожидание: ${elapsedSec} сек • Режим: ${isVisionMode ? 'Новая логика' : 'Платный ИИ'}`;
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
      if (paidCheckbox) paidCheckbox.disabled = true;
      setStatus('Нет файлов для анализа в этой задаче.', 'error');
    }

    document.body.appendChild(modal);
  };
}
