const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';
const DOCS_API_ENDPOINT = '/js/documents/api-docs.php';
const DOCX_TEMPLATE_URLS = [
  '/app/templates/template.docx',
  '/templates/template.docx',
  './templates/template.docx',
  'templates/template.docx',
];

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.38);backdrop-filter:blur(6px)}
    .appdosc-ai-dialog__panel{width:min(920px,100%);height:100dvh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.95),rgba(255,255,255,.82));border:1px solid rgba(255,255,255,.7);box-shadow:0 18px 46px rgba(15,23,42,.22);overflow:hidden;border-radius:20px 20px 0 0}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(148,163,184,.24)}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__close{width:34px;height:34px;border:none;border-radius:999px;background:rgba(148,163,184,.16);font-size:18px;cursor:pointer}
    .appdosc-ai-dialog__messages{flex:1;min-height:0;overflow:auto;padding:10px 12px;background:rgba(248,250,252,.55);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__bubble{max-width:90%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.25)}
    .appdosc-ai-dialog__composer{padding:10px 12px;border-top:1px solid rgba(148,163,184,.2);background:rgba(255,255,255,.78);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__input{width:100%;border:1px solid rgba(148,163,184,.38);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff;color:#0f172a;min-height:76px;max-height:180px;resize:none}
    .appdosc-ai-dialog__input:focus,.appdosc-ai-dialog__docx-editor:focus{border-color:rgba(37,99,235,.5);box-shadow:0 0 0 3px rgba(59,130,246,.14)}
    .appdosc-ai-dialog__actions{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__hint{font-size:12px;color:#64748b}
    .appdosc-ai-dialog__buttons{display:flex;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__btn{border:none;border-radius:12px;min-height:38px;padding:10px 14px;cursor:pointer;font-weight:600;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a}
    .appdosc-ai-dialog__btn:disabled{opacity:.55;cursor:not-allowed}
    .appdosc-ai-dialog__docx{display:none;border-top:1px solid rgba(148,163,184,.2);padding:10px 12px calc(12px + env(safe-area-inset-bottom, 0px));gap:8px;background:rgba(255,255,255,.78)}
    .appdosc-ai-dialog__docx--visible{display:flex;flex-direction:column}
    .appdosc-ai-dialog__docx-meta{font-size:12px;color:#64748b}
    .appdosc-ai-dialog__docx-editor{min-height:180px;max-height:42dvh;overflow:auto;border:1px solid rgba(148,163,184,.38);border-radius:12px;padding:12px;background:rgba(255,255,255,.95);font-size:14px;line-height:1.5;color:#0f172a;outline:none}
    .appdosc-ai-dialog__docx-editor h1,.appdosc-ai-dialog__docx-editor h2,.appdosc-ai-dialog__docx-editor h3{margin:10px 0 6px}
    .appdosc-ai-dialog__docx-editor p{margin:0 0 8px}
    .appdosc-ai-dialog__docx-editor ul,.appdosc-ai-dialog__docx-editor ol{padding-left:20px;margin:0 0 8px}
    .appdosc-ai-dialog__docx-editor table{width:100%;border-collapse:collapse;margin:8px 0 12px;background:rgba(255,255,255,.88)}
    .appdosc-ai-dialog__docx-editor th,.appdosc-ai-dialog__docx-editor td{border:1px solid rgba(148,163,184,.45);padding:6px 8px;vertical-align:top}

    .appdosc-pdf-viewer{position:fixed;inset:0;z-index:2600;display:none;background:rgba(15,23,42,.46);backdrop-filter:blur(7px);padding:10px}
    .appdosc-pdf-viewer--open{display:flex}
    .appdosc-pdf-viewer__panel{margin:auto;width:min(980px,100%);height:100%;background:rgba(255,255,255,.96);border:1px solid rgba(148,163,184,.25);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}
    .appdosc-pdf-viewer__header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.2)}
    .appdosc-pdf-viewer__title{font-size:14px;font-weight:700;color:#0f172a}
    .appdosc-pdf-viewer__status{font-size:12px;color:#64748b;padding:8px 12px}
    .appdosc-pdf-viewer__frame{flex:1;width:100%;border:none;background:#f8fafc}

    @media (max-width:560px){
      .appdosc-ai-dialog__panel,.appdosc-pdf-viewer__panel{width:100%;height:100dvh;border-radius:0}
      .appdosc-pdf-viewer,.appdosc-ai-dialog{padding:0}
      .appdosc-ai-dialog__buttons{width:100%}
      .appdosc-ai-dialog__btn{flex:1}
      .appdosc-ai-dialog__docx-editor{max-height:46dvh}
    }
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
  return [
    'Черновик ответа от ИИ:',
    '',
    `Задача №${taskId} принята в работу.`,
    '',
    `Текст ответа: «${userMessage.trim()}»`,
  ].join('\n');
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

function ensureJsPdf() {
  return ensureScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf', 'jsPDF');
}

function ensureMammoth() {
  return ensureScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth', 'Mammoth');
}

async function fetchTemplateBuffer() {
  const tried = [];
  let lastError = null;
  for (const url of DOCX_TEMPLATE_URLS) {
    tried.push(url);
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (response.ok) return { buffer: await response.arrayBuffer(), url };
      lastError = new Error(`Шаблон недоступен (${response.status}): ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Не удалось загрузить шаблон. Проверены пути: ${tried.join(', ')}`);
}

async function getTemplateHtml() {
  const mammoth = await ensureMammoth();
  const { buffer, url } = await fetchTemplateBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = String(result && result.value ? result.value : '').trim();
  if (!html) throw new Error('Не удалось преобразовать DOCX в HTML');
  return { html, url };
}

function htmlToPlainText(html) {
  const node = document.createElement('div');
  node.innerHTML = String(html || '');
  return String(node.textContent || node.innerText || '').trim();
}

function appendAnswerToHtml(templateHtml, responseText) {
  const safeAnswer = String(responseText || '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!safeAnswer) return String(templateHtml || '');
  return `${String(templateHtml || '')}<h2>Ответ ИИ</h2><p>${safeAnswer.replace(/\n/g, '<br/>')}</p>`;
}

async function createPdfBlob(text, title) {
  const jspdfNs = await ensureJsPdf();
  const jsPDF = jspdfNs && jspdfNs.jsPDF ? jspdfNs.jsPDF : null;
  if (!jsPDF) throw new Error('jsPDF не инициализирован');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 36;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title || 'Предпросмотр шаблона', margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(String(text || ''), width);
  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 14;
  });
  return doc.output('blob');
}

function setPdfToFrame(frame, blob) {
  if (!frame) return;
  if (frame.dataset.url) URL.revokeObjectURL(frame.dataset.url);
  const url = URL.createObjectURL(blob);
  frame.dataset.url = url;
  frame.src = url;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function openAiResponseDialog(context = {}) {
  ensureAiDialogStyles();

  const existing = document.querySelector(DIALOG_ROOT_SELECTOR);
  if (existing) {
    const existingInput = existing.querySelector('.appdosc-ai-dialog__input');
    if (existingInput) existingInput.focus();
    return;
  }

  const root = document.createElement('div');
  root.className = 'appdosc-ai-dialog';
  const panel = document.createElement('div');
  panel.className = 'appdosc-ai-dialog__panel';

  const header = document.createElement('div');
  header.className = 'appdosc-ai-dialog__header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'appdosc-ai-dialog__title';
  title.textContent = 'Ответ с помощью ИИ';
  const subtitle = document.createElement('div');
  subtitle.className = 'appdosc-ai-dialog__subtitle';
  subtitle.textContent = 'Основной режим: редактирование DOCX как HTML';
  titleWrap.append(title, subtitle);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'appdosc-ai-dialog__close';
  closeButton.textContent = '×';

  const messages = document.createElement('div');
  messages.className = 'appdosc-ai-dialog__messages';
  messages.appendChild(createBubble('Введите запрос. Ниже откроется HTML-редактор шаблона (таблицы/списки/заголовки).', 'assistant'));

  const composer = document.createElement('div');
  composer.className = 'appdosc-ai-dialog__composer';
  const input = document.createElement('textarea');
  input.className = 'appdosc-ai-dialog__input';
  input.placeholder = 'Например: Подготовь вежливый ответ о сроке исполнения до пятницы';

  const actions = document.createElement('div');
  actions.className = 'appdosc-ai-dialog__actions';
  const hint = document.createElement('div');
  hint.className = 'appdosc-ai-dialog__hint';
  hint.textContent = 'Enter — отправить, Shift+Enter — новая строка';
  const actionButtons = document.createElement('div');
  actionButtons.className = 'appdosc-ai-dialog__buttons';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'appdosc-ai-dialog__btn';
  sendButton.textContent = 'Отправить';

  const toggleEditorButton = document.createElement('button');
  toggleEditorButton.type = 'button';
  toggleEditorButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  toggleEditorButton.textContent = 'Шаблон/PDF';
  toggleEditorButton.disabled = true;

  const docxSection = document.createElement('div');
  docxSection.className = 'appdosc-ai-dialog__docx';
  const docxMeta = document.createElement('div');
  docxMeta.className = 'appdosc-ai-dialog__docx-meta';
  docxMeta.textContent = 'Редактируйте структуру DOCX как HTML: таблицы, списки и заголовки сохраняются.';

  const docxEditor = document.createElement('div');
  docxEditor.className = 'appdosc-ai-dialog__docx-editor';
  docxEditor.contentEditable = 'true';

  const docxButtons = document.createElement('div');
  docxButtons.className = 'appdosc-ai-dialog__buttons';

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  applyButton.textContent = 'Вставить в ответ';

  const templatePreviewButton = document.createElement('button');
  templatePreviewButton.type = 'button';
  templatePreviewButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  templatePreviewButton.textContent = 'Предпросмотр шаблона';

  const mergedPreviewButton = document.createElement('button');
  mergedPreviewButton.type = 'button';
  mergedPreviewButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  mergedPreviewButton.textContent = 'PDF fallback';

  const downloadDocxButton = document.createElement('button');
  downloadDocxButton.type = 'button';
  downloadDocxButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  downloadDocxButton.textContent = 'Скачать DOCX';

  const downloadPdfButton = document.createElement('button');
  downloadPdfButton.type = 'button';
  downloadPdfButton.className = 'appdosc-ai-dialog__btn';
  downloadPdfButton.textContent = 'Скачать PDF';

  const printPdfButton = document.createElement('button');
  printPdfButton.type = 'button';
  printPdfButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  printPdfButton.textContent = 'Печать';

  const viewer = document.createElement('div');
  viewer.className = 'appdosc-pdf-viewer';
  const viewerPanel = document.createElement('div');
  viewerPanel.className = 'appdosc-pdf-viewer__panel';
  const viewerHeader = document.createElement('div');
  viewerHeader.className = 'appdosc-pdf-viewer__header';
  const viewerTitle = document.createElement('div');
  viewerTitle.className = 'appdosc-pdf-viewer__title';
  viewerTitle.textContent = 'PDF предпросмотр';
  const viewerClose = document.createElement('button');
  viewerClose.type = 'button';
  viewerClose.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  viewerClose.textContent = 'Закрыть';
  const viewerStatus = document.createElement('div');
  viewerStatus.className = 'appdosc-pdf-viewer__status';
  viewerStatus.textContent = 'Предпросмотр не открыт.';
  const viewerFrame = document.createElement('iframe');
  viewerFrame.className = 'appdosc-pdf-viewer__frame';
  viewerFrame.title = 'PDF предпросмотр шаблона';

  viewerHeader.append(viewerTitle, viewerClose);
  viewerPanel.append(viewerHeader, viewerStatus, viewerFrame);
  viewer.appendChild(viewerPanel);

  let templateHtmlCache = '';
  let templateUrlCache = '';
  let mergedPdfBlob = null;

  const close = () => {
    document.removeEventListener('keydown', onEsc);
    if (viewerFrame.dataset.url) URL.revokeObjectURL(viewerFrame.dataset.url);
    root.remove();
  };

  const onEsc = (event) => {
    if (event.key !== 'Escape') return;
    if (viewer.classList.contains('appdosc-pdf-viewer--open')) {
      viewer.classList.remove('appdosc-pdf-viewer--open');
      return;
    }
    close();
  };

  const notify = (type, message) => {
    if (typeof context.onStatus === 'function') context.onStatus(type, message);
  };

  const ensureTemplateHtml = async () => {
    if (templateHtmlCache) return { html: templateHtmlCache, url: templateUrlCache };
    const templateData = await getTemplateHtml();
    templateHtmlCache = templateData.html;
    templateUrlCache = templateData.url;
    return templateData;
  };

  const openTemplatePdfPreview = async () => {
    const { html, url } = await ensureTemplateHtml();
    const pdfBlob = await createPdfBlob(htmlToPlainText(html) || 'Шаблон пустой.', 'Предпросмотр шаблона');
    setPdfToFrame(viewerFrame, pdfBlob);
    viewerStatus.textContent = `Шаблон загружен: ${url}`;
    viewer.classList.add('appdosc-pdf-viewer--open');
  };

  const openMergedPdfPreview = async () => {
    const text = htmlToPlainText(docxEditor.innerHTML);
    if (!text) {
      notify('warning', 'Сначала заполните редактор шаблона.');
      return;
    }
    const { url } = await ensureTemplateHtml();
    mergedPdfBlob = await createPdfBlob(text, 'HTML fallback предпросмотр');
    setPdfToFrame(viewerFrame, mergedPdfBlob);
    viewerStatus.textContent = `Fallback-проверка шаблона (${url})`;
    viewer.classList.add('appdosc-pdf-viewer--open');
  };

  const requestGeneratedFile = async (format) => {
    const html = String(docxEditor.innerHTML || '').trim();
    if (!html) throw new Error('Нет HTML для сохранения');
    const payload = new FormData();
    payload.append('action', 'generate_from_html');
    payload.append('format', format);
    payload.append('documentTitle', 'Ответ ИИ');
    payload.append('html', html);
    const response = await fetch(DOCS_API_ENDPOINT, { method: 'POST', body: payload, credentials: 'same-origin' });
    if (!response.ok) {
      let errorText = `Ошибка сохранения (${response.status})`;
      try {
        const data = await response.json();
        if (data && data.error) errorText = String(data.error);
      } catch (_) {}
      throw new Error(errorText);
    }
    return response.blob();
  };

  const send = () => {
    const value = String(input.value || '').trim();
    if (!value) return;
    messages.appendChild(createBubble(value, 'user'));
    const assistantText = buildAssistantReply(value, context);
    messages.appendChild(createBubble(assistantText, 'assistant'));
    docxEditor.innerHTML = templateHtmlCache ? appendAnswerToHtml(templateHtmlCache, assistantText) : `<p>${assistantText.replace(/\n/g, '<br/>')}</p>`;
    toggleEditorButton.disabled = false;
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    notify('success', 'Черновик готов. Проверьте и отредактируйте структуру документа.');
  };

  sendButton.addEventListener('click', send);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  toggleEditorButton.addEventListener('click', () => docxSection.classList.toggle('appdosc-ai-dialog__docx--visible'));

  applyButton.addEventListener('click', () => {
    const text = htmlToPlainText(docxEditor.innerHTML);
    if (!text) {
      notify('warning', 'Редактор пустой.');
      return;
    }
    if (typeof context.onApplyText === 'function') context.onApplyText(text);
    notify('success', 'Текст вставлен в поле ответа задачи.');
  });

  templatePreviewButton.addEventListener('click', async () => {
    templatePreviewButton.disabled = true;
    try {
      await openTemplatePdfPreview();
      notify('success', 'Предпросмотр шаблона открыт.');
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось открыть предпросмотр шаблона.');
      viewerStatus.textContent = 'Ошибка загрузки шаблона.';
    } finally {
      templatePreviewButton.disabled = false;
    }
  });

  mergedPreviewButton.addEventListener('click', async () => {
    mergedPreviewButton.disabled = true;
    try {
      await openMergedPdfPreview();
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось собрать fallback PDF.');
    } finally {
      mergedPreviewButton.disabled = false;
    }
  });

  downloadDocxButton.addEventListener('click', async () => {
    downloadDocxButton.disabled = true;
    try {
      const blob = await requestGeneratedFile('docx');
      downloadBlob(blob, 'response-from-html.docx');
      notify('success', 'DOCX скачан (HTML → DOCX на сервере).');
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось скачать DOCX.');
    } finally {
      downloadDocxButton.disabled = false;
    }
  });

  downloadPdfButton.addEventListener('click', async () => {
    downloadPdfButton.disabled = true;
    try {
      const blob = await requestGeneratedFile('pdf');
      downloadBlob(blob, 'response-from-html.pdf');
      notify('success', 'PDF скачан (HTML → PDF на сервере).');
    } catch (error) {
      try {
        if (!mergedPdfBlob) await openMergedPdfPreview();
        if (mergedPdfBlob) {
          downloadBlob(mergedPdfBlob, 'response-template-preview.pdf');
          notify('success', 'PDF скачан в fallback-режиме.');
        }
      } catch (_) {
        notify('error', error && error.message ? error.message : 'Не удалось скачать PDF.');
      }
    } finally {
      downloadPdfButton.disabled = false;
    }
  });

  printPdfButton.addEventListener('click', async () => {
    printPdfButton.disabled = true;
    try {
      if (!mergedPdfBlob) await openMergedPdfPreview();
      if (viewerFrame.contentWindow) {
        viewer.classList.add('appdosc-pdf-viewer--open');
        viewerFrame.contentWindow.focus();
        viewerFrame.contentWindow.print();
      }
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Печать недоступна.');
    } finally {
      printPdfButton.disabled = false;
    }
  });

  viewerClose.addEventListener('click', () => viewer.classList.remove('appdosc-pdf-viewer--open'));
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) viewer.classList.remove('appdosc-pdf-viewer--open');
  });
  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  actionButtons.append(toggleEditorButton, sendButton);
  actions.append(hint, actionButtons);
  composer.append(input, actions);
  docxButtons.append(applyButton, templatePreviewButton, mergedPreviewButton, downloadDocxButton, downloadPdfButton, printPdfButton);
  docxSection.append(docxMeta, docxEditor, docxButtons);
  header.append(titleWrap, closeButton);
  panel.append(header, messages, composer, docxSection);
  root.append(panel, viewer);
  document.body.appendChild(root);

  ensureTemplateHtml()
    .then(({ html }) => {
      docxEditor.innerHTML = html;
      toggleEditorButton.disabled = false;
    })
    .catch(() => {
      docxEditor.innerHTML = '<p>Шаблон не загружен. Доступен fallback-режим PDF из текста.</p>';
    });

  document.addEventListener('keydown', onEsc);
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
