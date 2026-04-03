(function initTelegramAiResponseDialog(globalScope) {
  if (!globalScope || typeof document === 'undefined') return;

  const STYLE_ID = 'tg-ai-response-dialog-style-v1';
  const DOCS_AI_FALLBACK_ENDPOINTS = ['/api-docs.php', '/js/documents/api-docs.php'];

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

  async function postDocsAiWithFallback(createFormData) {
    const endpoints = getDocsAiEndpoints();
    let lastResult = null;
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      let response = null;
      let payload = null;
      try {
        response = await fetch(endpoint, { method: 'POST', credentials: 'include', body: createFormData() });
        payload = await response.json().catch(() => null);
      } catch (error) {
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
    if (!response || !response.ok || !payload || payload.ok !== true) {
      throw new Error((payload && payload.error) || 'OCR временно недоступен');
    }
    const text = normalize(payload && payload.text);
    if (!text) {
      throw new Error('OCR не вернул текст');
    }
    return text;
  }

  async function loadSelectedFileAsBlob(file) {
    if (file && file.fileObject instanceof File) {
      return file.fileObject;
    }
    const url = normalize(file && (file.resolvedUrl || file.url || file.previewUrl));
    if (!url) {
      throw new Error('Не найден URL файла.');
    }
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Не удалось загрузить файл (${response.status})`);
    }
    const blob = await response.blob();
    const fileName = normalize(file && (file.originalName || file.name || file.storedName)) || 'attachment';
    return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
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
      .tg-ai-chat__composer{padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:auto 1fr auto;gap:8px;background:rgba(255,255,255,.93)}
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
      @media (max-width:640px){.tg-ai-chat{padding:0}.tg-ai-chat__card{height:100dvh;border-radius:0}.tg-ai-chat__composer{grid-template-columns:1fr 1fr}.tg-ai-chat__toggle{grid-column:1/-1}.tg-ai-chat__input{grid-column:1/-1}.tg-ai-chat__send{grid-column:1/-1}}
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

  function renderFiles(container, files) {
    if (!container) return;
    if (!files.length) {
      container.innerHTML = '<span class="tg-ai-chat__file">В задаче нет файлов</span>';
      return;
    }
    container.innerHTML = files.map((file, index) => {
      const name = normalize(file && (file.originalName || file.name || file.storedName)) || `Файл ${index + 1}`;
      const hasUrl = normalize(file && (file.resolvedUrl || file.url || file.previewUrl));
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
          <div class="tg-ai-chat__bubble tg-ai-chat__bubble--assistant">Привет! Отметьте файлы внизу и напишите вопрос.</div>
        </div>
        <div class="tg-ai-chat__status" data-status>Готов к работе.</div>
        <div class="tg-ai-chat__composer">
          <button type="button" class="tg-ai-chat__toggle" data-files-toggle>📎 Файлы</button>
          <textarea class="tg-ai-chat__input" data-input placeholder="Например: сделай краткий вывод по выбранным файлам"></textarea>
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

    renderFiles(filesList, files);

    const close = () => overlay.remove();
    overlay.querySelector('[data-close]')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    overlay.querySelector('[data-files-toggle]')?.addEventListener('click', () => {
      filesPanel.hidden = !filesPanel.hidden;
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
      createBubble(messages, prompt || 'Сделай краткий вывод и решение по выбранным файлам.', 'user');
      status.textContent = 'Готовим файлы...';
      const startedAt = Date.now();

      try {
        const extractedTexts = [];
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const currentFile = selectedFiles[index];
          const fileLabel = normalize(currentFile && (currentFile.originalName || currentFile.name || currentFile.storedName)) || `Файл ${index + 1}`;
          status.textContent = `OCR ${index + 1}/${selectedFiles.length}: ${fileLabel}`;
          const fileBlob = await loadSelectedFileAsBlob(currentFile);
          const extractedText = await requestTelegramOcrByFile(fileBlob, fileBlob && fileBlob.name ? fileBlob.name : fileLabel);
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
        const submitPayload = {
          prompt,
          selectedFiles,
          extractedTexts,
          task,
          sentAt: new Date().toISOString(),
        };

        if (typeof context.onSubmit === 'function') {
          const result = await context.onSubmit(submitPayload);
          const answer = normalize(result && (result.response || result.summary || result.analysis || result.message));
          createBubble(messages, answer || 'Файлы и вопрос переданы в обработчик.', 'assistant');
        } else {
          window.dispatchEvent(new CustomEvent('telegram-ai-dialog-submit', { detail: submitPayload }));
          createBubble(messages, 'Файлы и вопрос переданы. Дальнейшая логика обрабатывается отдельно.', 'assistant');
        }

        const elapsed = Date.now() - startedAt;
        meta.innerHTML = `
          <span class="tg-ai-chat__chip">Файлов: ${selectedFiles.length}</span>
          <span class="tg-ai-chat__chip">OCR: ${extractedTexts.length}</span>
          <span class="tg-ai-chat__chip">Время: ${Number(elapsed) || 0} мс</span>
        `;
        status.textContent = 'Данные переданы.';
        if (input) input.value = '';
      } catch (error) {
        createBubble(messages, (error && error.message) || 'Не удалось передать данные.', 'assistant');
        status.textContent = 'Ошибка передачи.';
      } finally {
        sendButton.disabled = false;
      }
    });
  };
}(typeof window !== 'undefined' ? window : globalThis));

export {};
