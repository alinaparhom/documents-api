const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style-v4';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';
const DOCS_API_ENDPOINT = '/js/documents/api-docs.php';
const DOCX_TEMPLATE_URLS = [
  '/app/templates/template.docx',
  '/templates/template.docx',
  './templates/template.docx',
  'templates/template.docx',
];
const PDF_TEMPLATE_URLS = [
  '/app/templates/template.pdf',
  '/templates/template.pdf',
  './templates/template.pdf',
  'templates/template.pdf',
];
const EDITOR_DRAFT_KEY = 'miniapp_editor_draft_v1';

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;background:rgba(15,23,42,.38);backdrop-filter:blur(6px)}
    .appdosc-ai-dialog__panel{width:min(920px,100%);height:100dvh;display:flex;flex-direction:column;margin:auto;background:linear-gradient(165deg,rgba(255,255,255,.96),rgba(255,255,255,.88));border:1px solid rgba(255,255,255,.74);box-shadow:0 18px 46px rgba(15,23,42,.22);overflow:hidden;border-radius:20px 20px 0 0}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(148,163,184,.24)}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__messages{flex:1;min-height:0;overflow:auto;padding:10px 12px;background:rgba(248,250,252,.58);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__bubble{max-width:92%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.25)}
    .appdosc-ai-dialog__composer{padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(148,163,184,.2);background:rgba(255,255,255,.82);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__input{width:100%;border:1px solid rgba(148,163,184,.38);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff;color:#0f172a;min-height:76px;max-height:160px;resize:none}
    .appdosc-ai-dialog__buttons{display:flex;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__btn{border:none;border-radius:14px;min-height:42px;padding:10px 14px;cursor:pointer;font-weight:600;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a}
    .appdosc-ai-dialog__editor{position:fixed;inset:0;z-index:2800;display:none;background:rgba(241,245,249,.76);backdrop-filter:blur(10px)}
    .appdosc-ai-dialog__editor--open{display:flex}
    .appdosc-ai-dialog__editor-panel{width:100%;height:100dvh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.95),rgba(255,255,255,.86))}
    .appdosc-ai-dialog__editor-header{padding:12px;border-bottom:1px solid rgba(148,163,184,.25);display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
    .appdosc-ai-dialog__editor-title{font-size:17px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__editor-subtitle{font-size:12px;color:#64748b;margin-top:3px}
    .appdosc-ai-dialog__toolbar{position:sticky;top:0;z-index:2;padding:8px 10px;display:flex;gap:8px;flex-wrap:wrap;background:rgba(255,255,255,.85);border-bottom:1px solid rgba(148,163,184,.22)}
    .appdosc-ai-dialog__editor-body{flex:1;min-height:0;overflow:auto;padding:12px 12px 96px}
    .appdosc-ai-dialog__editable{min-height:56dvh;border:1px solid rgba(148,163,184,.34);border-radius:16px;padding:14px;background:rgba(255,255,255,.92);line-height:1.55;outline:none}
    .appdosc-ai-dialog__editable table{width:100%;border-collapse:collapse}
    .appdosc-ai-dialog__editable td,.appdosc-ai-dialog__editable th{border:1px solid rgba(148,163,184,.45);padding:6px 8px}
    .appdosc-ai-dialog__pdf-note{margin-top:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,.86);border:1px dashed rgba(148,163,184,.5);font-size:13px;color:#334155}
    .appdosc-ai-dialog__sticky-actions{position:fixed;left:0;right:0;bottom:0;z-index:3;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;overflow:auto;background:rgba(255,255,255,.92);border-top:1px solid rgba(148,163,184,.24)}
    .appdosc-ai-dialog__status{font-size:12px;color:#64748b;padding:0 12px 8px}
    @media (max-width:560px){.appdosc-ai-dialog{padding:0}.appdosc-ai-dialog__panel{width:100%;height:100dvh;border-radius:0}.appdosc-ai-dialog__btn{flex:1}}
  `;
  document.head.appendChild(style);
}

function createBubble(text, role) {
  const bubble = document.createElement('div');
  bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
  bubble.textContent = text;
  return bubble;
}

function buildAssistantReply(userMessage, context) {
  const taskId = context && context.task && context.task.id ? String(context.task.id) : '—';
  return `Черновик ответа ИИ\n\nЗадача №${taskId}: ${String(userMessage || '').trim()}`;
}

function ensureScript(src, globalKey, title) {
  if (window[globalKey]) return Promise.resolve(window[globalKey]);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => (window[globalKey] ? resolve(window[globalKey]) : reject(new Error(`${title} не загрузился`)));
    script.onerror = () => reject(new Error(`Не удалось загрузить ${title}`));
    document.head.appendChild(script);
  });
}

function ensureMammoth() {
  return ensureScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth', 'Mammoth');
}

function ensureJsPdf() {
  return ensureScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf', 'jsPDF');
}

function htmlToPlainText(html) {
  const node = document.createElement('div');
  node.innerHTML = String(html || '');
  return String(node.textContent || '').trim();
}

function safeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
}

async function fetchTemplateBuffer(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (response.ok) {
        return { buffer: await response.arrayBuffer(), url };
      }
      lastError = new Error(`Шаблон недоступен (${response.status}): ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Шаблон не найден.');
}

async function getTemplateHtml() {
  const mammoth = await ensureMammoth();
  const { buffer, url } = await fetchTemplateBuffer(DOCX_TEMPLATE_URLS);
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = String(result && result.value ? result.value : '').trim();
  if (!html) throw new Error('DOCX не удалось прочитать.');
  return { html, url };
}

function fillDocxHtml(templateHtml, aiText) {
  const html = String(templateHtml || '');
  if (html.includes('{{AI_RESPONSE}}')) {
    return html.replaceAll('{{AI_RESPONSE}}', safeHtml(aiText));
  }
  return `${html}<h2>Ответ ИИ</h2><p>${safeHtml(aiText)}</p>`;
}

async function createPdfBlobFromText(text, title) {
  const jspdfNs = await ensureJsPdf();
  const jsPDF = jspdfNs && jspdfNs.jsPDF ? jspdfNs.jsPDF : null;
  if (!jsPDF) throw new Error('PDF движок недоступен.');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 36;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const height = doc.internal.pageSize.getHeight();
  let y = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title || 'Документ', margin, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.splitTextToSize(String(text || ''), width).forEach((line) => {
    if (y > height - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 14;
  });
  return doc.output('blob');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function saveDraft(payload) {
  try { localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(payload)); } catch (_) {}
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(EDITOR_DRAFT_KEY) || 'null'); } catch (_) { return null; }
}

function openAiResponseDialog(context = {}) {
  ensureAiDialogStyles();
  const existing = document.querySelector(DIALOG_ROOT_SELECTOR);
  if (existing) return;

  const notify = (type, message) => {
    if (typeof context.onStatus === 'function') context.onStatus(type, message);
  };

  const root = document.createElement('div');
  root.className = 'appdosc-ai-dialog';
  root.innerHTML = `
    <div class="appdosc-ai-dialog__panel">
      <div class="appdosc-ai-dialog__header">
        <div>
          <div class="appdosc-ai-dialog__title">Ответ с помощью ИИ</div>
          <div class="appdosc-ai-dialog__subtitle">После ответа можно открыть /editor на весь экран.</div>
        </div>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-close>Закрыть</button>
      </div>
      <div class="appdosc-ai-dialog__messages" data-messages></div>
      <div class="appdosc-ai-dialog__composer">
        <textarea class="appdosc-ai-dialog__input" data-input placeholder="Введите задачу для ИИ"></textarea>
        <div class="appdosc-ai-dialog__buttons">
          <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-open-editor disabled>Открыть /editor</button>
          <button class="appdosc-ai-dialog__btn" data-send>Отправить</button>
        </div>
      </div>
    </div>
  `;

  const editor = document.createElement('div');
  editor.className = 'appdosc-ai-dialog__editor';
  editor.innerHTML = `
    <div class="appdosc-ai-dialog__editor-panel">
      <div class="appdosc-ai-dialog__editor-header">
        <div>
          <div class="appdosc-ai-dialog__editor-title">/editor — редактор документа</div>
          <div class="appdosc-ai-dialog__editor-subtitle" data-editor-subtitle>Загрузка шаблона...</div>
        </div>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-editor-close>Назад</button>
      </div>
      <div class="appdosc-ai-dialog__toolbar">
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-cmd="bold">B</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-cmd="italic">I</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-cmd="insertUnorderedList">• Список</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-cmd="insertOrderedList">1. Список</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-link>Ссылка</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-table>Таблица</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-undo>↶</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-redo>↷</button>
      </div>
      <div class="appdosc-ai-dialog__editor-body">
        <div class="appdosc-ai-dialog__editable" data-editable contenteditable="true"></div>
        <div class="appdosc-ai-dialog__pdf-note" data-pdf-note hidden></div>
      </div>
      <div class="appdosc-ai-dialog__status" data-editor-status>Автосохранение включено.</div>
      <div class="appdosc-ai-dialog__sticky-actions">
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-save>Сохранить</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-download-docx>Скачать DOCX</button>
        <button class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-download-pdf>Скачать PDF</button>
        <button class="appdosc-ai-dialog__btn" data-send-chat>Отправить в чат</button>
      </div>
    </div>
  `;

  root.appendChild(editor);
  document.body.appendChild(root);

  const messages = root.querySelector('[data-messages]');
  const input = root.querySelector('[data-input]');
  const sendBtn = root.querySelector('[data-send]');
  const openEditorBtn = root.querySelector('[data-open-editor]');
  const editable = root.querySelector('[data-editable]');
  const editorSubtitle = root.querySelector('[data-editor-subtitle]');
  const editorStatus = root.querySelector('[data-editor-status]');
  const pdfNote = root.querySelector('[data-pdf-note]');

  let assistantText = '';
  let docxTemplateHtml = '';
  let selectedTemplateType = 'docx';

  messages.appendChild(createBubble('Введите запрос. После ответа откроете полноэкранный /editor.', 'assistant'));

  const closeAll = () => {
    if (location.pathname === '/editor') {
      history.replaceState({}, '', '/');
    }
    root.remove();
  };

  const openEditor = async () => {
    editor.classList.add('appdosc-ai-dialog__editor--open');
    history.pushState({ miniEditor: true }, '', '/editor');
    const draft = loadDraft();

    try {
      const { html, url } = await getTemplateHtml();
      docxTemplateHtml = html;
      selectedTemplateType = 'docx';
      editable.innerHTML = draft && draft.html ? draft.html : fillDocxHtml(html, assistantText);
      editorSubtitle.textContent = `DOCX шаблон: ${url}. Плейсхолдер {{AI_RESPONSE}} подставлен автоматически.`;
      pdfNote.hidden = true;
    } catch (error) {
      selectedTemplateType = 'pdf';
      editable.innerHTML = `<p>${safeHtml(assistantText || 'Введите текст документа.')}</p>`;
      pdfNote.hidden = false;
      try {
        const pdfMeta = await fetchTemplateBuffer(PDF_TEMPLATE_URLS);
        pdfNote.textContent = `DOCX недоступен. Загружен PDF шаблон (${pdfMeta.url}): добавляйте текст как аннотационный слой.`;
      } catch (_) {
        pdfNote.textContent = 'DOCX шаблон не загрузился. Работает PDF-режим: редактирование текста + слой аннотаций поверх PDF при экспорте.';
      }
      editorSubtitle.textContent = 'PDF режим: можно редактировать текст и выгрузить PDF.';
      notify('warning', `Проблема с DOCX: ${error && error.message ? error.message : 'неизвестная ошибка'}`);
    }

    if (draft && draft.templateType) {
      selectedTemplateType = draft.templateType;
    }
    editable.focus();
  };

  const send = () => {
    const text = String(input.value || '').trim();
    if (!text) return;
    messages.appendChild(createBubble(text, 'user'));
    assistantText = buildAssistantReply(text, context);
    messages.appendChild(createBubble(assistantText, 'assistant'));
    input.value = '';
    openEditorBtn.disabled = false;
    messages.scrollTop = messages.scrollHeight;
    notify('success', 'Ответ ИИ готов. Откройте /editor для редактирования.');
  };

  root.querySelector('[data-close]').addEventListener('click', closeAll);
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  openEditorBtn.addEventListener('click', openEditor);
  root.querySelector('[data-editor-close]').addEventListener('click', () => {
    editor.classList.remove('appdosc-ai-dialog__editor--open');
    history.replaceState({}, '', '/');
  });

  editor.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => document.execCommand(btn.dataset.cmd, false));
  });
  editor.querySelector('[data-undo]').addEventListener('click', () => document.execCommand('undo', false));
  editor.querySelector('[data-redo]').addEventListener('click', () => document.execCommand('redo', false));
  editor.querySelector('[data-link]').addEventListener('click', () => {
    const href = window.prompt('Введите ссылку (https://...)');
    if (href) document.execCommand('createLink', false, href);
  });
  editor.querySelector('[data-table]').addEventListener('click', () => {
    document.execCommand('insertHTML', false, '<table><tr><th>Колонка 1</th><th>Колонка 2</th></tr><tr><td>Текст</td><td>Текст</td></tr></table>');
  });

  let autosaveTimer = null;
  const autosave = () => {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      saveDraft({ html: editable.innerHTML, templateType: selectedTemplateType, ts: Date.now() });
      editorStatus.textContent = `Сохранено автоматически: ${new Date().toLocaleTimeString('ru-RU')}`;
    }, 450);
  };
  editable.addEventListener('input', autosave);

  root.querySelector('[data-save]').addEventListener('click', () => {
    saveDraft({ html: editable.innerHTML, templateType: selectedTemplateType, ts: Date.now() });
    notify('success', 'Сохранено.');
  });

  root.querySelector('[data-download-docx]').addEventListener('click', async () => {
    try {
      const html = String(editable.innerHTML || '').trim();
      if (!html) throw new Error('Редактор пуст.');
      const payload = new FormData();
      payload.append('action', 'generate_from_html');
      payload.append('format', 'docx');
      payload.append('documentTitle', 'Ответ ИИ');
      payload.append('html', html);
      const response = await fetch(DOCS_API_ENDPOINT, { method: 'POST', body: payload, credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Экспорт DOCX не удался (${response.status})`);
      downloadBlob(await response.blob(), 'answer.docx');
      notify('success', 'DOCX скачан.');
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Ошибка DOCX экспорта.');
    }
  });

  root.querySelector('[data-download-pdf]').addEventListener('click', async () => {
    try {
      const pdfBlob = await createPdfBlobFromText(htmlToPlainText(editable.innerHTML), 'Ответ ИИ');
      downloadBlob(pdfBlob, 'answer.pdf');
      notify('success', 'PDF скачан.');
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Ошибка PDF экспорта.');
    }
  });

  root.querySelector('[data-send-chat]').addEventListener('click', () => {
    const text = htmlToPlainText(editable.innerHTML);
    if (!text) {
      notify('warning', 'Нет текста для отправки.');
      return;
    }
    if (context && typeof context.onApplyText === 'function') {
      context.onApplyText(text);
    }
    try {
      if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.sendData === 'function') {
        window.Telegram.WebApp.sendData(JSON.stringify({ type: 'editor_send', templateType: selectedTemplateType, text }));
      }
    } catch (_) {}
    notify('success', 'Текст отправлен в чат.');
    editor.classList.remove('appdosc-ai-dialog__editor--open');
    history.replaceState({}, '', '/');
  });

  window.addEventListener('popstate', () => {
    if (location.pathname !== '/editor') {
      editor.classList.remove('appdosc-ai-dialog__editor--open');
    }
  });

  const setViewportHeight = () => {
    document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
  };
  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
