const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';
const DOCX_TEMPLATE_URLS = [
  '/app/templates/template.docx',
  '/templates/template.docx',
  './templates/template.docx',
  'templates/template.docx',
];

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.38);backdrop-filter:blur(6px);}
    .appdosc-ai-dialog__panel{width:min(920px,100%);height:100dvh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.95),rgba(255,255,255,.82));border:1px solid rgba(255,255,255,.7);box-shadow:0 18px 46px rgba(15,23,42,.22);overflow:hidden;border-radius:20px 20px 0 0;}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(148,163,184,.24)}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__close{width:34px;height:34px;border:none;border-radius:999px;background:rgba(148,163,184,.16);font-size:18px;cursor:pointer}
    .appdosc-ai-dialog__messages{flex:1;min-height:0;overflow:auto;padding:10px 12px;background:rgba(248,250,252,.55);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__bubble{max-width:90%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.25)}
    .appdosc-ai-dialog__composer{padding:10px 12px;border-top:1px solid rgba(148,163,184,.2);background:rgba(255,255,255,.78);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__input,.appdosc-ai-dialog__docx-input{width:100%;border:1px solid rgba(148,163,184,.38);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff;color:#0f172a}
    .appdosc-ai-dialog__input{min-height:76px;max-height:180px;resize:none}
    .appdosc-ai-dialog__docx-input{min-height:96px;max-height:210px;resize:vertical}
    .appdosc-ai-dialog__input:focus,.appdosc-ai-dialog__docx-input:focus{border-color:rgba(37,99,235,.5);box-shadow:0 0 0 3px rgba(59,130,246,.14)}
    .appdosc-ai-dialog__actions{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__hint{font-size:12px;color:#64748b}
    .appdosc-ai-dialog__buttons{display:flex;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__btn{border:none;border-radius:12px;min-height:38px;padding:10px 14px;cursor:pointer;font-weight:600;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a}
    .appdosc-ai-dialog__btn:disabled{opacity:.55;cursor:not-allowed}
    .appdosc-ai-dialog__docx{display:none;border-top:1px solid rgba(148,163,184,.2);padding:10px 12px calc(12px + env(safe-area-inset-bottom, 0px));gap:8px;background:rgba(255,255,255,.78)}
    .appdosc-ai-dialog__docx--visible{display:flex;flex-direction:column}
    .appdosc-ai-dialog__docx-meta{font-size:12px;color:#64748b}

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
    '',
    'Дальше: откройте PDF-предпросмотр шаблона и проверьте результат.',
  ].join('\n');
}

function ensureScript(src, globalKey, title) {
  if (window[globalKey]) {
    return Promise.resolve(window[globalKey]);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => window[globalKey] ? resolve(window[globalKey]) : reject(new Error(`${title} не загрузился`));
    script.onerror = () => reject(new Error(`Не удалось загрузить ${title}`));
    document.head.appendChild(script);
  });
}

function ensurePizZip() {
  return ensureScript('https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.min.js', 'PizZip', 'PizZip');
}

function ensureJsPdf() {
  return ensureScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf', 'jsPDF');
}

async function fetchTemplateBuffer() {
  const tried = [];
  let lastError = null;
  for (const url of DOCX_TEMPLATE_URLS) {
    tried.push(url);
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
  throw lastError || new Error(`Не удалось загрузить шаблон. Проверены пути: ${tried.join(', ')}`);
}

function extractTextFromDocumentXml(xml) {
  if (!xml) return '';
  return String(xml)
    .replace(/<w:tab\/?\s*>/g, '\t')
    .replace(/<w:br\/?\s*>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getTemplateText() {
  const PizZip = await ensurePizZip();
  const { buffer, url } = await fetchTemplateBuffer();
  const zip = new PizZip(buffer);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) {
    throw new Error('В шаблоне нет word/document.xml');
  }
  const xml = xmlFile.asText();
  return { text: extractTextFromDocumentXml(xml), url };
}

function buildMergedText(templateText, responseText) {
  const tpl = String(templateText || '').trim();
  const answer = String(responseText || '').trim();
  const parts = [];
  if (tpl) parts.push('ШАБЛОН ДОКУМЕНТА\n' + tpl);
  if (answer) parts.push('ОТВЕТ ИИ\n' + answer);
  return parts.join('\n\n────────────────────\n\n').trim();
}

async function createPdfBlob(text, title) {
  const jspdfNs = await ensureJsPdf();
  const jsPDF = jspdfNs && jspdfNs.jsPDF ? jspdfNs.jsPDF : null;
  if (!jsPDF) {
    throw new Error('jsPDF не инициализирован');
  }
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
  if (frame.dataset.url) {
    URL.revokeObjectURL(frame.dataset.url);
  }
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
  subtitle.textContent = 'Проверка шаблона через PDF предпросмотр';
  titleWrap.append(title, subtitle);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'appdosc-ai-dialog__close';
  closeButton.textContent = '×';

  const messages = document.createElement('div');
  messages.className = 'appdosc-ai-dialog__messages';
  messages.appendChild(createBubble('Напишите, какой ответ подготовить. Потом проверим его в PDF на базе шаблона.', 'assistant'));

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
  docxMeta.textContent = 'Текст будет наложен на содержимое шаблона и показан в PDF.';

  const docxInput = document.createElement('textarea');
  docxInput.className = 'appdosc-ai-dialog__docx-input';
  docxInput.placeholder = 'Отредактируйте ответ перед PDF предпросмотром';

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
  mergedPreviewButton.textContent = 'PDF с ответом';

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

  let templateTextCache = '';
  let templateUrlCache = '';
  let mergedPdfBlob = null;

  const close = () => {
    document.removeEventListener('keydown', onEsc);
    if (viewerFrame.dataset.url) {
      URL.revokeObjectURL(viewerFrame.dataset.url);
    }
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
    if (typeof context.onStatus === 'function') {
      context.onStatus(type, message);
    }
  };

  const ensureResponseText = () => {
    const text = String(docxInput.value || '').trim();
    if (!text) {
      notify('warning', 'Сначала введите или сгенерируйте текст ответа.');
      return '';
    }
    return text;
  };

  const ensureTemplateText = async () => {
    if (templateTextCache) {
      return { text: templateTextCache, url: templateUrlCache };
    }
    const templateData = await getTemplateText();
    templateTextCache = templateData.text;
    templateUrlCache = templateData.url;
    return templateData;
  };

  const openTemplatePdfPreview = async () => {
    const { text, url } = await ensureTemplateText();
    const pdfBlob = await createPdfBlob(text || 'Шаблон пустой.', 'Предпросмотр шаблона');
    setPdfToFrame(viewerFrame, pdfBlob);
    viewerStatus.textContent = `Шаблон загружен: ${url}`;
    viewer.classList.add('appdosc-pdf-viewer--open');
  };

  const openMergedPdfPreview = async () => {
    const responseText = ensureResponseText();
    if (!responseText) return;
    const { text, url } = await ensureTemplateText();
    const mergedText = buildMergedText(text, responseText);
    mergedPdfBlob = await createPdfBlob(mergedText, 'Шаблон + ответ ИИ');
    setPdfToFrame(viewerFrame, mergedPdfBlob);
    viewerStatus.textContent = `Проверка шаблона (${url}) + ответ ИИ`;
    viewer.classList.add('appdosc-pdf-viewer--open');
  };

  const send = () => {
    const value = String(input.value || '').trim();
    if (!value) return;
    messages.appendChild(createBubble(value, 'user'));
    const assistantText = buildAssistantReply(value, context);
    messages.appendChild(createBubble(assistantText, 'assistant'));
    docxInput.value = assistantText;
    toggleEditorButton.disabled = false;
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    notify('success', 'Черновик готов. Проверьте его в PDF предпросмотре шаблона.');
  };

  sendButton.addEventListener('click', send);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  toggleEditorButton.addEventListener('click', () => {
    docxSection.classList.toggle('appdosc-ai-dialog__docx--visible');
  });

  applyButton.addEventListener('click', () => {
    const text = ensureResponseText();
    if (!text) return;
    if (typeof context.onApplyText === 'function') {
      context.onApplyText(text);
    }
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
      notify('error', error && error.message ? error.message : 'Не удалось собрать PDF с ответом.');
    } finally {
      mergedPreviewButton.disabled = false;
    }
  });

  downloadPdfButton.addEventListener('click', async () => {
    downloadPdfButton.disabled = true;
    try {
      if (!mergedPdfBlob) {
        await openMergedPdfPreview();
      }
      if (mergedPdfBlob) {
        downloadBlob(mergedPdfBlob, 'response-template-preview.pdf');
        notify('success', 'PDF скачан.');
      }
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось скачать PDF.');
    } finally {
      downloadPdfButton.disabled = false;
    }
  });

  printPdfButton.addEventListener('click', async () => {
    printPdfButton.disabled = true;
    try {
      if (!mergedPdfBlob) {
        await openMergedPdfPreview();
      }
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
    if (event.target === viewer) {
      viewer.classList.remove('appdosc-pdf-viewer--open');
    }
  });

  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  actionButtons.append(toggleEditorButton, sendButton);
  actions.append(hint, actionButtons);
  composer.append(input, actions);

  docxButtons.append(applyButton, templatePreviewButton, mergedPreviewButton, downloadPdfButton, printPdfButton);
  docxSection.append(docxMeta, docxInput, docxButtons);

  header.append(titleWrap, closeButton);
  panel.append(header, messages, composer, docxSection);
  root.append(panel, viewer);
  document.body.appendChild(root);

  document.addEventListener('keydown', onEsc);
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
