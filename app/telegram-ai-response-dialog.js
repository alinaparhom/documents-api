(function attachTelegramAiResponseDialog(globalScope) {
  if (!globalScope || typeof document === 'undefined') {
    return;
  }

  const STYLE_ID = 'tg-ai-response-dialog-style-v1';
  const ENDPOINTS = ['/api-groq-paid.php', '/js/documents/api-groq-paid.php'];

  function normalizeValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tg-ai-chat{position:fixed;inset:0;z-index:3600;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.38);backdrop-filter:blur(10px);padding:10px}
      .tg-ai-chat__card{width:min(980px,100%);height:min(100dvh - 8px,900px);display:flex;flex-direction:column;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.82);background:linear-gradient(165deg,rgba(255,255,255,.95),rgba(241,245,249,.92));box-shadow:0 28px 60px rgba(15,23,42,.24)}
      .tg-ai-chat__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(203,213,225,.65)}
      .tg-ai-chat__title{font-size:16px;font-weight:700;color:#0f172a}
      .tg-ai-chat__sub{font-size:12px;color:#64748b;margin-top:3px}
      .tg-ai-chat__close{border:none;background:#fff;border-radius:12px;min-height:34px;padding:0 12px;font-size:14px;color:#334155}
      .tg-ai-chat__files-wrap{padding:10px 12px;border-bottom:1px solid rgba(226,232,240,.85);background:rgba(255,255,255,.66)}
      .tg-ai-chat__files-title{font-size:12px;color:#475569;margin-bottom:7px}
      .tg-ai-chat__files{display:flex;gap:8px;overflow:auto;padding-bottom:2px}
      .tg-ai-chat__file{display:flex;align-items:center;gap:7px;padding:7px 10px;white-space:nowrap;border-radius:999px;border:1px solid rgba(203,213,225,.95);background:rgba(255,255,255,.92);font-size:12px;color:#334155}
      .tg-ai-chat__file input{accent-color:#2563eb}
      .tg-ai-chat__messages{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,#f8fafc,#eef2ff)}
      .tg-ai-chat__bubble{max-width:92%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.42;white-space:pre-wrap;word-break:break-word}
      .tg-ai-chat__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.34)}
      .tg-ai-chat__bubble--user{align-self:flex-end;background:#dbeafe;color:#1e3a8a;border:1px solid rgba(59,130,246,.32)}
      .tg-ai-chat__status{padding:8px 12px;font-size:12px;color:#334155;border-top:1px solid rgba(203,213,225,.62);background:rgba(255,255,255,.8)}
      .tg-ai-chat__composer{display:flex;align-items:flex-end;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.9)}
      .tg-ai-chat__input{flex:1;min-height:42px;max-height:120px;border:1px solid rgba(148,163,184,.33);border-radius:12px;padding:10px;font-size:14px;resize:none;background:#fff;color:#0f172a}
      .tg-ai-chat__send{border:none;min-height:42px;padding:0 16px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#0ea5e9);color:#fff;font-weight:700}
      .tg-ai-chat__send:disabled{opacity:.55}
      @media (max-width:640px){.tg-ai-chat{padding:0}.tg-ai-chat__card{height:100dvh;width:100%;border-radius:0}.tg-ai-chat__composer{flex-wrap:wrap}.tg-ai-chat__send{width:100%}.tg-ai-chat__files-title{font-size:11px}}
    `;
    document.head.appendChild(style);
  }

  async function postWithFallback(createFormData) {
    let lastError = null;
    for (let index = 0; index < ENDPOINTS.length; index += 1) {
      const endpoint = ENDPOINTS[index];
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          body: createFormData(),
        });
        if (response.status === 404 || response.status === 405) {
          continue;
        }
        const payload = await response.json().catch(() => null);
        return { response, payload };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Сервис ИИ временно недоступен.');
  }

  async function fetchSelectedFiles(taskFiles, selectedKeys, statusNode) {
    const selectedFiles = Array.from(selectedKeys)
      .map((key) => taskFiles[Number(key)])
      .filter((file) => file && normalizeValue(file.resolvedUrl || file.url || file.previewUrl));

    const result = [];
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const fileUrl = normalizeValue(file.resolvedUrl || file.url || file.previewUrl);
      const fileName = normalizeValue(file.originalName || file.name || file.storedName) || `task-file-${index + 1}`;
      if (statusNode) {
        statusNode.textContent = `Скачиваем файл ${index + 1} из ${selectedFiles.length}...`;
      }
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(fileUrl, { credentials: 'include' });
      if (!response.ok) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const blob = await response.blob();
      result.push(new File([blob], fileName, { type: blob.type || 'application/octet-stream' }));
    }

    return result;
  }

  function openAiResponseDialog(options = {}) {
    ensureStyles();

    const task = options && options.task ? options.task : {};
    const taskFiles = Array.isArray(task.files) ? task.files : [];

    const overlay = document.createElement('div');
    overlay.className = 'tg-ai-chat';
    overlay.innerHTML = `
      <div class="tg-ai-chat__card" role="dialog" aria-modal="true" aria-label="Ответ с помощью ИИ">
        <div class="tg-ai-chat__head">
          <div>
            <div class="tg-ai-chat__title">Ответ с помощью ИИ</div>
            <div class="tg-ai-chat__sub">Чат по файлам текущей задачи</div>
          </div>
          <button type="button" class="tg-ai-chat__close" data-close>✕</button>
        </div>
        <div class="tg-ai-chat__files-wrap">
          <div class="tg-ai-chat__files-title">Файлы задачи (компактное меню):</div>
          <div class="tg-ai-chat__files" data-files></div>
        </div>
        <div class="tg-ai-chat__messages" data-messages>
          <div class="tg-ai-chat__bubble tg-ai-chat__bubble--assistant">Привет! Выберите файлы, напишите запрос и я помогу с ответом.</div>
        </div>
        <div class="tg-ai-chat__status" data-status>Готов к работе.</div>
        <div class="tg-ai-chat__composer">
          <textarea class="tg-ai-chat__input" data-input placeholder="Например: подготовь краткий и понятный ответ"></textarea>
          <button type="button" class="tg-ai-chat__send" data-send>Отправить</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const filesNode = overlay.querySelector('[data-files]');
    const messagesNode = overlay.querySelector('[data-messages]');
    const inputNode = overlay.querySelector('[data-input]');
    const statusNode = overlay.querySelector('[data-status]');
    const sendNode = overlay.querySelector('[data-send]');
    const selectedKeys = new Set();

    function appendBubble(text, role) {
      if (!messagesNode) return;
      const bubble = document.createElement('div');
      bubble.className = `tg-ai-chat__bubble tg-ai-chat__bubble--${role === 'user' ? 'user' : 'assistant'}`;
      bubble.textContent = normalizeValue(text) || 'Пустой ответ.';
      messagesNode.appendChild(bubble);
      messagesNode.scrollTop = messagesNode.scrollHeight;
    }

    if (filesNode) {
      filesNode.innerHTML = taskFiles.length
        ? taskFiles.map((file, index) => {
          const name = normalizeValue(file && (file.originalName || file.name || file.storedName)) || `Файл ${index + 1}`;
          const url = normalizeValue(file && (file.resolvedUrl || file.url || file.previewUrl));
          const disabled = url ? '' : 'disabled';
          return `<label class="tg-ai-chat__file"><input type="checkbox" data-file-key="${index}" ${disabled}><span>${escapeHtml(name)}</span></label>`;
        }).join('')
        : '<span class="tg-ai-chat__files-title">В этой задаче нет файлов.</span>';
    }

    const close = () => overlay.remove();
    overlay.querySelector('[data-close]')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    filesNode?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
        return;
      }
      const key = normalizeValue(target.dataset.fileKey);
      if (!key) return;
      if (target.checked) selectedKeys.add(key);
      else selectedKeys.delete(key);
      if (statusNode) {
        statusNode.textContent = selectedKeys.size
          ? `Выбрано файлов: ${selectedKeys.size}.`
          : 'Выберите файлы или отправьте запрос без файлов.';
      }
    });

    sendNode?.addEventListener('click', async () => {
      const prompt = normalizeValue(inputNode && inputNode.value);
      const finalPrompt = prompt || 'Подготовь краткий и понятный ответ по выбранным файлам.';
      if (sendNode) sendNode.disabled = true;
      appendBubble(finalPrompt, 'user');

      try {
        const filesToSend = await fetchSelectedFiles(taskFiles, selectedKeys, statusNode);
        if (statusNode) {
          statusNode.textContent = 'Отправляем запрос в ИИ...';
        }

        const result = await postWithFallback(() => {
          const formData = new FormData();
          formData.append('taskId', normalizeValue(task.id));
          formData.append('taskTitle', normalizeValue(task.title) || 'Задача');
          formData.append('taskDescription', normalizeValue(task.description));
          formData.append('prompt', finalPrompt);
          filesToSend.forEach((file) => formData.append('files[]', file, file.name));
          return formData;
        });

        const payload = result && result.payload ? result.payload : null;
        if (!payload || payload.ok !== true) {
          throw new Error((payload && payload.error) || 'ИИ не дал ответ.');
        }

        appendBubble(normalizeValue(payload.response) || 'Пустой ответ.', 'assistant');
        if (statusNode) {
          statusNode.textContent = 'Ответ готов.';
        }
        if (inputNode) {
          inputNode.value = '';
        }
        if (typeof options.onStatus === 'function') {
          options.onStatus('success', 'ИИ ответил успешно.');
        }
      } catch (error) {
        appendBubble(error && error.message ? error.message : 'Ошибка запроса.', 'assistant');
        if (statusNode) {
          statusNode.textContent = 'Ошибка запроса.';
        }
        if (typeof options.onStatus === 'function') {
          options.onStatus('error', error && error.message ? error.message : 'Ошибка запроса к ИИ.');
        }
      } finally {
        if (sendNode) sendNode.disabled = false;
      }
    });
  }

  globalScope.openAiResponseDialog = openAiResponseDialog;
})(typeof window !== 'undefined' ? window : globalThis);
