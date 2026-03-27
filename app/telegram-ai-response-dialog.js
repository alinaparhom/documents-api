const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';
const TEMPLATE_PDF_URLS = [
  '/app/templates/template.pdf',
  '/templates/template.pdf',
  './templates/template.pdf',
  'templates/template.pdf',
];

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.38);backdrop-filter:blur(7px)}
    .appdosc-ai-dialog__panel{width:min(1040px,100%);max-height:92dvh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.95),rgba(255,255,255,.84));border:1px solid rgba(255,255,255,.72);border-radius:20px;overflow:hidden;box-shadow:0 20px 54px rgba(15,23,42,.24)}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.24)}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__close{width:34px;height:34px;border:none;border-radius:999px;background:rgba(148,163,184,.16);font-size:18px;cursor:pointer}

    .appdosc-ai-dialog__content{display:grid;grid-template-columns:1.05fr .95fr;gap:10px;padding:10px;min-height:0}
    .appdosc-ai-dialog__col{display:flex;flex-direction:column;min-height:0;gap:8px}
    .appdosc-ai-dialog__messages{min-height:220px;max-height:44dvh;overflow:auto;padding:10px;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:rgba(248,250,252,.62);display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__bubble{max-width:92%;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.2)}

    .appdosc-ai-dialog__input,.appdosc-ai-dialog__edit{width:100%;border:1px solid rgba(148,163,184,.38);border-radius:12px;padding:10px 12px;font-size:14px;background:#fff;color:#0f172a;outline:none}
    .appdosc-ai-dialog__input{min-height:82px;max-height:170px;resize:none}
    .appdosc-ai-dialog__edit{min-height:190px;resize:vertical}
    .appdosc-ai-dialog__input:focus,.appdosc-ai-dialog__edit:focus{border-color:rgba(37,99,235,.5);box-shadow:0 0 0 3px rgba(59,130,246,.14)}

    .appdosc-ai-dialog__hint{font-size:12px;color:#64748b}
    .appdosc-ai-dialog__buttons{display:flex;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__btn{border:none;border-radius:12px;padding:10px 12px;min-height:38px;cursor:pointer;font-weight:600;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.16);color:#0f172a}
    .appdosc-ai-dialog__btn:disabled{opacity:.56;cursor:not-allowed}

    .appdosc-pdf-viewer{position:fixed;inset:0;z-index:2600;display:none;padding:12px;background:rgba(15,23,42,.48);backdrop-filter:blur(7px)}
    .appdosc-pdf-viewer--open{display:flex}
    .appdosc-pdf-viewer__panel{margin:auto;width:min(1200px,100%);height:94dvh;background:#fff;border:1px solid rgba(148,163,184,.28);border-radius:18px;display:flex;flex-direction:column;overflow:hidden}
    .appdosc-pdf-viewer__header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.2)}
    .appdosc-pdf-viewer__title{font-size:14px;font-weight:700;color:#0f172a}
    .appdosc-pdf-viewer__status{font-size:12px;color:#64748b;padding:8px 12px}
    .appdosc-pdf-viewer__frame{flex:1;width:100%;border:none;background:#f8fafc}

    @media (max-width: 860px){
      .appdosc-ai-dialog{padding:0;align-items:stretch}
      .appdosc-ai-dialog__panel{max-height:100dvh;height:100dvh;border-radius:0}
      .appdosc-ai-dialog__content{grid-template-columns:1fr}
      .appdosc-ai-dialog__messages{max-height:34dvh}
      .appdosc-ai-dialog__buttons{width:100%}
      .appdosc-ai-dialog__btn{flex:1}
      .appdosc-pdf-viewer{padding:0}
      .appdosc-pdf-viewer__panel{height:100dvh;border-radius:0}
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
    `Предлагаемый текст: «${String(userMessage || '').trim()}»`,
    '',
    'Проверьте текст справа и откройте предпросмотр PDF шаблона.',
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

function ensurePdfLib() {
  return ensureScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'PDFLib', 'PDFLib');
}

async function fetchTemplatePdf() {
  let lastError = null;
  for (const url of TEMPLATE_PDF_URLS) {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (response.ok) {
        return { bytes: await response.arrayBuffer(), url };
      }
      lastError = new Error(`Шаблон PDF недоступен (${response.status}): ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Не удалось найти шаблон PDF: ${TEMPLATE_PDF_URLS.join(', ')}`);
}

function wrapTextByWidth(text, font, size, maxWidth) {
  const words = String(text || '').replace(/\r/g, '').split(/\s+/);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  });

  if (current) lines.push(current);
  return lines;
}

async function composePdfWithAnswer(answerText) {
  const PDFLib = await ensurePdfLib();
  const template = await fetchTemplatePdf();
  const pdfDoc = await PDFLib.PDFDocument.load(template.bytes);
  const pages = pdfDoc.getPages();
  if (!pages || !pages.length) {
    throw new Error('Шаблон PDF пустой');
  }

  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

  const margin = 40;
  const boxWidth = width - margin * 2;
  const boxHeight = Math.max(160, Math.min(300, height * 0.45));
  const boxY = margin;

  firstPage.drawRectangle({
    x: margin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: PDFLib.rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: PDFLib.rgb(0.86, 0.9, 0.96),
    borderWidth: 1,
  });

  firstPage.drawText('Ответ ИИ (отредактированный):', {
    x: margin + 12,
    y: boxY + boxHeight - 24,
    size: 12,
    font: fontBold,
    color: PDFLib.rgb(0.06, 0.1, 0.2),
  });

  const safeText = String(answerText || '').trim() || '—';
  const lines = wrapTextByWidth(safeText, font, 10.5, boxWidth - 24);
  let y = boxY + boxHeight - 42;
  const lineHeight = 13;
  const minY = boxY + 12;

  lines.forEach((line) => {
    if (y < minY) return;
    firstPage.drawText(line, {
      x: margin + 12,
      y,
      size: 10.5,
      font,
      color: PDFLib.rgb(0.12, 0.16, 0.24),
    });
    y -= lineHeight;
  });

  return {
    blob: new Blob([await pdfDoc.save()], { type: 'application/pdf' }),
    templateUrl: template.url,
  };
}

function setPdfIntoFrame(frame, blob) {
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

  const notify = (type, message) => {
    if (typeof context.onStatus === 'function') {
      context.onStatus(type, message);
    }
  };

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
  subtitle.textContent = 'Наложение текста в /app/templates/template.pdf';
  titleWrap.append(title, subtitle);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'appdosc-ai-dialog__close';
  closeButton.textContent = '×';

  const content = document.createElement('div');
  content.className = 'appdosc-ai-dialog__content';

  const leftCol = document.createElement('div');
  leftCol.className = 'appdosc-ai-dialog__col';
  const rightCol = document.createElement('div');
  rightCol.className = 'appdosc-ai-dialog__col';

  const messages = document.createElement('div');
  messages.className = 'appdosc-ai-dialog__messages';
  messages.appendChild(createBubble('Опишите, какой ответ нужен. Я сгенерирую черновик.', 'assistant'));

  const input = document.createElement('textarea');
  input.className = 'appdosc-ai-dialog__input';
  input.placeholder = 'Например: Подготовь короткий вежливый ответ о сроках выполнения';

  const hint = document.createElement('div');
  hint.className = 'appdosc-ai-dialog__hint';
  hint.textContent = 'Enter — отправить, Shift+Enter — новая строка';

  const leftButtons = document.createElement('div');
  leftButtons.className = 'appdosc-ai-dialog__buttons';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'appdosc-ai-dialog__btn';
  sendButton.textContent = 'Сгенерировать';

  const edit = document.createElement('textarea');
  edit.className = 'appdosc-ai-dialog__edit';
  edit.placeholder = 'Здесь можно отредактировать текст перед вставкой в PDF';

  const rightButtons = document.createElement('div');
  rightButtons.className = 'appdosc-ai-dialog__buttons';

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  applyButton.textContent = 'Вставить в ответ';

  const previewTemplateButton = document.createElement('button');
  previewTemplateButton.type = 'button';
  previewTemplateButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  previewTemplateButton.textContent = 'Предпросмотр шаблона';

  const previewMergedButton = document.createElement('button');
  previewMergedButton.type = 'button';
  previewMergedButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  previewMergedButton.textContent = 'Проверить с текстом';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'appdosc-ai-dialog__btn';
  downloadButton.textContent = 'Скачать PDF';

  const printButton = document.createElement('button');
  printButton.type = 'button';
  printButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  printButton.textContent = 'Печать';

  leftButtons.append(sendButton);
  rightButtons.append(applyButton, previewTemplateButton, previewMergedButton, downloadButton, printButton);

  leftCol.append(messages, input, hint, leftButtons);
  rightCol.append(edit, rightButtons);

  content.append(leftCol, rightCol);

  const viewer = document.createElement('div');
  viewer.className = 'appdosc-pdf-viewer';
  const viewerPanel = document.createElement('div');
  viewerPanel.className = 'appdosc-pdf-viewer__panel';
  const viewerHeader = document.createElement('div');
  viewerHeader.className = 'appdosc-pdf-viewer__header';
  const viewerTitle = document.createElement('div');
  viewerTitle.className = 'appdosc-pdf-viewer__title';
  viewerTitle.textContent = 'Предпросмотр PDF';
  const viewerClose = document.createElement('button');
  viewerClose.type = 'button';
  viewerClose.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  viewerClose.textContent = 'Закрыть';
  const viewerStatus = document.createElement('div');
  viewerStatus.className = 'appdosc-pdf-viewer__status';
  viewerStatus.textContent = 'Предпросмотр не открыт';
  const viewerFrame = document.createElement('iframe');
  viewerFrame.className = 'appdosc-pdf-viewer__frame';
  viewerFrame.title = 'PDF предпросмотр';

  viewerHeader.append(viewerTitle, viewerClose);
  viewerPanel.append(viewerHeader, viewerStatus, viewerFrame);
  viewer.appendChild(viewerPanel);

  let templatePdfBlob = null;
  let mergedPdfBlob = null;
  let templateUrlUsed = '';

  const closeDialog = () => {
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
    closeDialog();
  };

  const getEditedText = () => {
    const text = String(edit.value || '').trim();
    if (!text) {
      notify('warning', 'Введите или сгенерируйте текст ответа.');
      return '';
    }
    return text;
  };

  const openViewerWithBlob = (blob, statusText) => {
    setPdfIntoFrame(viewerFrame, blob);
    viewerStatus.textContent = statusText;
    viewer.classList.add('appdosc-pdf-viewer--open');
  };

  const ensureTemplatePreviewBlob = async () => {
    if (templatePdfBlob) return templatePdfBlob;
    const template = await fetchTemplatePdf();
    templateUrlUsed = template.url;
    templatePdfBlob = new Blob([template.bytes], { type: 'application/pdf' });
    return templatePdfBlob;
  };

  const ensureMergedBlob = async () => {
    const text = getEditedText();
    if (!text) return null;
    const composed = await composePdfWithAnswer(text);
    mergedPdfBlob = composed.blob;
    templateUrlUsed = composed.templateUrl;
    return mergedPdfBlob;
  };

  const send = () => {
    const value = String(input.value || '').trim();
    if (!value) return;
    messages.appendChild(createBubble(value, 'user'));
    const reply = buildAssistantReply(value, context);
    messages.appendChild(createBubble(reply, 'assistant'));
    edit.value = reply;
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    notify('success', 'Черновик готов. Проверьте его в PDF.');
  };

  sendButton.addEventListener('click', send);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  applyButton.addEventListener('click', () => {
    const text = getEditedText();
    if (!text) return;
    if (typeof context.onApplyText === 'function') {
      context.onApplyText(text);
    }
    notify('success', 'Текст вставлен в поле ответа задачи.');
  });

  previewTemplateButton.addEventListener('click', async () => {
    previewTemplateButton.disabled = true;
    try {
      const blob = await ensureTemplatePreviewBlob();
      openViewerWithBlob(blob, `Шаблон открыт: ${templateUrlUsed}`);
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось открыть шаблон PDF.');
    } finally {
      previewTemplateButton.disabled = false;
    }
  });

  previewMergedButton.addEventListener('click', async () => {
    previewMergedButton.disabled = true;
    try {
      const blob = await ensureMergedBlob();
      if (!blob) return;
      openViewerWithBlob(blob, `Проверка шаблона + текст (источник: ${templateUrlUsed})`);
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось наложить текст в PDF.');
    } finally {
      previewMergedButton.disabled = false;
    }
  });

  downloadButton.addEventListener('click', async () => {
    downloadButton.disabled = true;
    try {
      const blob = await ensureMergedBlob();
      if (!blob) return;
      downloadBlob(blob, 'ai-response-template.pdf');
      notify('success', 'PDF скачан.');
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Не удалось скачать PDF.');
    } finally {
      downloadButton.disabled = false;
    }
  });

  printButton.addEventListener('click', async () => {
    printButton.disabled = true;
    try {
      const blob = await ensureMergedBlob();
      if (!blob) return;
      openViewerWithBlob(blob, `Печать PDF (источник: ${templateUrlUsed})`);
      setTimeout(() => {
        if (viewerFrame.contentWindow) {
          viewerFrame.contentWindow.focus();
          viewerFrame.contentWindow.print();
        }
      }, 350);
    } catch (error) {
      notify('error', error && error.message ? error.message : 'Печать недоступна.');
    } finally {
      printButton.disabled = false;
    }
  });

  viewerClose.addEventListener('click', () => viewer.classList.remove('appdosc-pdf-viewer--open'));
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) {
      viewer.classList.remove('appdosc-pdf-viewer--open');
    }
  });

  closeButton.addEventListener('click', closeDialog);
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeDialog();
    }
  });

  header.append(titleWrap, closeButton);
  panel.append(header, content);
  root.append(panel, viewer);
  document.body.appendChild(root);

  document.addEventListener('keydown', onEsc);
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
