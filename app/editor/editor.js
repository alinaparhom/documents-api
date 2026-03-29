(() => {
  const API_URL = '/js/documents/api-docs.php';
  const DRAFT_KEY = 'editor_draft_html';
  const LAST_AI_KEY = 'last_ai_response';
  const MAX_HTML_SIZE = 5 * 1024 * 1024;

  const editor = document.querySelector('[data-editor]');
  const charCount = document.querySelector('[data-char-count]');
  const saveStatus = document.querySelector('[data-save-status]');
  const headerStatus = document.querySelector('[data-header-status]');
  const toast = document.querySelector('[data-toast]');

  let saveTimer = null;
  let retryCount = 0;

  const showToast = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  };

  const updateStatus = (message) => {
    headerStatus.textContent = message;
  };

  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const getSafeHtml = () => {
    const raw = editor.innerHTML;
    if (raw.length > MAX_HTML_SIZE) {
      throw new Error('Слишком большой документ (максимум 5 МБ).');
    }
    if (!window.DOMPurify) {
      return raw;
    }
    return window.DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'table', 'tbody', 'tr', 'td', 'th', 'blockquote', 'h1', 'h2', 'h3', 'div', 'span'],
      ALLOWED_ATTR: ['class', 'style']
    });
  };

  const updateCharCount = () => {
    const count = editor.innerText.trim().length;
    charCount.textContent = `${count} символов`;
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, editor.innerHTML);
      saveStatus.textContent = `Черновик сохранён: ${new Date().toLocaleTimeString('ru-RU')}`;
    } catch (error) {
      console.error(error);
      saveStatus.textContent = 'Ошибка сохранения черновика';
    }
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveStatus.textContent = 'Сохранение...';
    saveTimer = setTimeout(saveDraft, 1200);
  };

  const restoreDraft = () => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      editor.innerHTML = draft;
      updateStatus('Черновик восстановлен');
      showToast('Черновик восстановлен');
    }
    updateCharCount();
  };

  const exec = (command) => {
    document.execCommand(command, false);
    editor.focus();
    scheduleSave();
    updateCharCount();
  };

  const insertTable = () => {
    const table = '<table><tbody><tr><th>Заголовок</th><th>Заголовок</th></tr><tr><td>Ячейка</td><td>Ячейка</td></tr></tbody></table><p></p>';
    document.execCommand('insertHTML', false, table);
    scheduleSave();
    updateCharCount();
  };

  const fetchWithRetry = async (formData, maxRetry = 1) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(API_URL, { method: 'POST', body: formData, signal: controller.signal });
      if (!response.ok && retryCount < maxRetry) {
        retryCount += 1;
        return fetchWithRetry(formData, maxRetry);
      }
      retryCount = 0;
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };

  const loadTemplate = async () => {
    updateStatus('Загрузка шаблона...');
    const formData = new FormData();
    formData.set('action', 'load_template_html');
    try {
      const response = await fetchWithRetry(formData);
      const data = await response.json();
      if (!data.ok || !data.html) {
        editor.innerHTML = '<p>Шаблон недоступен. Начните с чистого листа.</p>';
        showToast(data.error || 'Шаблон не найден');
        updateStatus('Шаблон не найден');
        return;
      }
      editor.innerHTML = data.html;
      updateStatus('Шаблон загружен');
      showToast('Шаблон успешно загружен');
      updateCharCount();
      scheduleSave();
    } catch (error) {
      console.error(error);
      updateStatus('Ошибка загрузки шаблона');
      showToast('Не удалось загрузить шаблон');
    }
  };

  const getLatestAiResponse = () => {
    let latest = '';
    try {
      const fromStorage = localStorage.getItem(LAST_AI_KEY);
      if (fromStorage) {
        latest = fromStorage;
      }
    } catch (error) {
      console.error(error);
    }

    if (typeof window.getAIResponseFromModal === 'function') {
      window.getAIResponseFromModal((text) => {
        if (text && String(text).trim()) {
          latest = String(text);
          localStorage.setItem(LAST_AI_KEY, latest);
        }
      });
    }

    return latest;
  };

  const insertAiResponse = () => {
    const responseText = getLatestAiResponse();
    if (!responseText) {
      showToast('Ответ ИИ пока не найден');
      return;
    }
    const safe = escapeHtml(responseText);
    const block = `<blockquote class="ai-block">${safe}</blockquote><p></p>`;
    document.execCommand('insertHTML', false, block);
    updateStatus('Ответ ИИ вставлен');
    scheduleSave();
    updateCharCount();
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportDocx = async () => {
    updateStatus('Подготовка DOCX...');
    try {
      const safeHtml = getSafeHtml();
      if (window.htmlDocx && typeof window.htmlDocx.asBlob === 'function') {
        const blob = window.htmlDocx.asBlob(`<!DOCTYPE html><html><body>${safeHtml}</body></html>`);
        downloadBlob(blob, 'edited.docx');
        showToast('DOCX готов');
        updateStatus('DOCX экспортирован');
        return;
      }
      throw new Error('html-docx-js не подключён');
    } catch (error) {
      console.error(error);
      showToast('Ошибка экспорта DOCX');
      updateStatus('Ошибка DOCX');
    }
  };

  const exportPdf = async () => {
    updateStatus('Подготовка PDF...');
    const formData = new FormData();
    formData.set('action', 'generate_from_editor');
    formData.set('format', 'pdf');
    try {
      formData.set('html', getSafeHtml());
      const response = await fetchWithRetry(formData, 2);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Ошибка сервера');
      }
      const blob = await response.blob();
      downloadBlob(blob, 'edited.pdf');
      showToast('PDF готов');
      updateStatus('PDF экспортирован');
    } catch (error) {
      console.error(error);
      showToast('Ошибка экспорта PDF');
      updateStatus('Ошибка PDF');
    }
  };

  const printDocument = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Разрешите всплывающие окна для печати');
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><title>Печать</title><style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px}.ai-block{border-left:3px solid #4b87ff;padding-left:8px;}</style></head><body>${editor.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const { command, action } = target.dataset;
    if (command) {
      exec(command);
      return;
    }

    if (action === 'insert-table') insertTable();
    if (action === 'load-template') loadTemplate();
    if (action === 'insert-ai') insertAiResponse();
    if (action === 'export-docx') exportDocx();
    if (action === 'export-pdf') exportPdf();
    if (action === 'print') printDocument();
  });

  editor.addEventListener('input', () => {
    updateCharCount();
    scheduleSave();
  });

  restoreDraft();
})();
