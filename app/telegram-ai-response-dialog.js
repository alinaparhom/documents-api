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
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.36);backdrop-filter:blur(6px);padding:0;}
    .appdosc-ai-dialog__panel{width:min(920px,100%);height:100dvh;max-height:100dvh;border-radius:22px 22px 0 0;background:linear-gradient(165deg,rgba(255,255,255,.94),rgba(255,255,255,.82));border:1px solid rgba(255,255,255,.7);box-shadow:0 18px 46px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 10px;border-bottom:1px solid rgba(148,163,184,.25);}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a;}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px;}
    .appdosc-ai-dialog__close{border:none;background:rgba(148,163,184,.16);color:#0f172a;border-radius:999px;width:34px;height:34px;font-size:18px;line-height:1;cursor:pointer;}
    .appdosc-ai-dialog__messages{padding:10px 12px;display:flex;flex-direction:column;gap:8px;overflow:auto;background:rgba(248,250,252,.55);min-height:0;flex:1;}
    .appdosc-ai-dialog__bubble{max-width:90%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a;}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.25);}
    .appdosc-ai-dialog__composer{padding:10px 12px;border-top:1px solid rgba(148,163,184,.2);display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.76);}
    .appdosc-ai-dialog__input{resize:none;min-height:76px;max-height:180px;border-radius:14px;border:1px solid rgba(148,163,184,.38);padding:10px 12px;font-size:14px;color:#0f172a;background:rgba(255,255,255,.85);outline:none;}
    .appdosc-ai-dialog__input:focus,.appdosc-ai-dialog__docx-input:focus{border-color:rgba(37,99,235,.5);box-shadow:0 0 0 3px rgba(59,130,246,.15);}
    .appdosc-ai-dialog__actions{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}
    .appdosc-ai-dialog__hint{font-size:12px;color:#64748b;}
    .appdosc-ai-dialog__buttons{display:flex;gap:8px;flex-wrap:wrap;}
    .appdosc-ai-dialog__btn{border:none;border-radius:12px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:600;padding:10px 14px;min-height:38px;cursor:pointer;}
    .appdosc-ai-dialog__btn:disabled{opacity:.55;cursor:not-allowed;}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a;}

    .appdosc-ai-dialog__docx{display:none;border-top:1px solid rgba(148,163,184,.2);padding:10px 12px calc(12px + env(safe-area-inset-bottom, 0px));background:rgba(255,255,255,.76);gap:8px;flex-direction:column;}
    .appdosc-ai-dialog__docx--visible{display:flex;}
    .appdosc-ai-dialog__docx-meta{font-size:12px;color:#64748b;}
    .appdosc-ai-dialog__docx-input{width:100%;resize:vertical;min-height:96px;max-height:210px;border-radius:12px;border:1px solid rgba(148,163,184,.38);padding:10px 12px;font-size:14px;background:rgba(255,255,255,.92);color:#0f172a;outline:none;}

    .appdosc-docx-viewer{position:fixed;inset:0;z-index:2600;display:none;padding:10px;background:rgba(15,23,42,.42);backdrop-filter:blur(6px);}
    .appdosc-docx-viewer--open{display:flex;}
    .appdosc-docx-viewer__panel{width:min(980px,100%);height:100%;margin:auto;display:flex;flex-direction:column;gap:8px;border-radius:16px;background:rgba(255,255,255,.92);border:1px solid rgba(148,163,184,.26);overflow:hidden;}
    .appdosc-docx-viewer__header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.2);}
    .appdosc-docx-viewer__title{font-size:14px;font-weight:700;color:#0f172a;}
    .appdosc-docx-viewer__body{flex:1;overflow:auto;background:rgba(241,245,249,.5);padding:10px;}
    .appdosc-docx-viewer__canvas{min-height:100%;}
    .appdosc-docx-viewer__fallback-page{max-width:860px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid rgba(203,213,225,.8);box-shadow:0 10px 24px rgba(15,23,42,.08);padding:18px;white-space:pre-wrap;color:#0f172a;line-height:1.55;}
    .appdosc-docx-viewer__status{font-size:12px;color:#64748b;padding:0 12px 8px;}

    @media (max-width: 560px){
      .appdosc-ai-dialog{padding:0;align-items:stretch;}
      .appdosc-ai-dialog__panel{width:100%;height:100dvh;max-height:100dvh;border-radius:0;}
      .appdosc-ai-dialog__buttons{width:100%;}
      .appdosc-ai-dialog__btn{flex:1;}
      .appdosc-docx-viewer{padding:0;}
      .appdosc-docx-viewer__panel{border-radius:0;}
    }
  `;
  document.head.appendChild(style);
}

function buildAssistantReply(userMessage, context) {
  const taskId = context && context.task && context.task.id ? String(context.task.id) : '—';
  return [
    'Черновик ответа от ИИ:',
    '',
    '1) Короткий итог по задаче:',
    `Задача №${taskId} принята в работу.`,
    '',
    '2) Предлагаемый ответ:',
    `«${userMessage.trim()}»`,
    '',
    '3) Дальше:',
    'Откройте шаблон DOCX, внесите правки и распечатайте при необходимости.',
  ].join('\n');
}

function createBubble(text, role) {
  const bubble = document.createElement('div');
  bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
  bubble.textContent = text;
  return bubble;
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

function ensureDocxPreview() {
  return ensureScript('https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js', 'docx', 'docx-preview');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textToWordParagraphs(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  return lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line || ' ')}</w:t></w:r></w:p>`).join('');
}

async function fetchTemplateBuffer() {
  let lastError = null;
  const tried = [];
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
  const triedText = tried.join(', ');
  throw lastError || new Error(`Не удалось загрузить шаблон DOCX. Проверены пути: ${triedText}`);
}

async function buildDocxBlob(answerText) {
  const PizZip = await ensurePizZip();
  const template = await fetchTemplateBuffer();
  const zip = new PizZip(template.buffer);
  let xml = zip.file('word/document.xml').asText();
  const paragraphs = textToWordParagraphs(answerText);

  if (xml.includes('{{AI_ANSWER}}')) {
    xml = xml.replace('{{AI_ANSWER}}', escapeXml(answerText));
  } else if (xml.includes('[AI_ANSWER]')) {
    xml = xml.replace('[AI_ANSWER]', escapeXml(answerText));
  } else {
    xml = xml.replace('</w:body>', `${paragraphs}</w:body>`);
  }

  zip.file('word/document.xml', xml);
  const blob = zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { blob, templateUrl: template.url, documentXml: xml };
}

function extractTextFromDocumentXml(xml) {
  if (!xml) {
    return '';
  }
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

function renderDocxFallbackHtml(container, xmlText) {
  const page = document.createElement('div');
  page.className = 'appdosc-docx-viewer__fallback-page';
  const restoredText = extractTextFromDocumentXml(xmlText);
  page.textContent = restoredText || 'Шаблон загружен, но содержимое пустое.';
  container.innerHTML = '';
  container.appendChild(page);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function openPrintWindowFromHtml(html) {
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Разрешите всплывающие окна для печати.');
  }
  win.document.write(`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Печать DOCX</title><style>body{font-family:Inter,Arial,sans-serif;padding:0;margin:0;background:#f8fafc;} .docx-wrapper{padding:12px;}</style></head><body><div class="docx-wrapper">${html}</div></body></html>`);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 250);
}

function openAiResponseDialog(context = {}) {
  ensureAiDialogStyles();

  const existing = document.querySelector(DIALOG_ROOT_SELECTOR);
  if (existing) {
    const existingInput = existing.querySelector('.appdosc-ai-dialog__input');
    if (existingInput && typeof existingInput.focus === 'function') {
      existingInput.focus();
    }
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
  subtitle.textContent = 'Сначала черновик, потом шаблон DOCX и печать';
  titleWrap.append(title, subtitle);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'appdosc-ai-dialog__close';
  closeButton.setAttribute('aria-label', 'Закрыть окно ИИ');
  closeButton.textContent = '×';

  const messages = document.createElement('div');
  messages.className = 'appdosc-ai-dialog__messages';
  messages.appendChild(createBubble('Привет! Напишите, какой ответ нужно подготовить — я помогу сделать черновик.', 'assistant'));

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

  const buttons = document.createElement('div');
  buttons.className = 'appdosc-ai-dialog__buttons';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'appdosc-ai-dialog__btn';
  sendButton.textContent = 'Отправить';

  const openEditorButton = document.createElement('button');
  openEditorButton.type = 'button';
  openEditorButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  openEditorButton.textContent = 'Открыть шаблон DOCX';
  openEditorButton.disabled = true;

  const docxSection = document.createElement('div');
  docxSection.className = 'appdosc-ai-dialog__docx';

  const docxMeta = document.createElement('div');
  docxMeta.className = 'appdosc-ai-dialog__docx-meta';
  docxMeta.textContent = 'Текст будет вставлен в /app/templates/template.docx';

  const docxInput = document.createElement('textarea');
  docxInput.className = 'appdosc-ai-dialog__docx-input';
  docxInput.placeholder = 'Отредактируйте текст перед вставкой в шаблон DOCX';

  const docxActions = document.createElement('div');
  docxActions.className = 'appdosc-ai-dialog__buttons';

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  applyButton.textContent = 'Вставить в ответ';

  const previewDocxButton = document.createElement('button');
  previewDocxButton.type = 'button';
  previewDocxButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  previewDocxButton.textContent = 'Показать шаблон';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'appdosc-ai-dialog__btn';
  downloadButton.textContent = 'Скачать DOCX';

  const printButton = document.createElement('button');
  printButton.type = 'button';
  printButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  printButton.textContent = 'Печать';

  const viewer = document.createElement('div');
  viewer.className = 'appdosc-docx-viewer';
  const viewerPanel = document.createElement('div');
  viewerPanel.className = 'appdosc-docx-viewer__panel';
  const viewerHeader = document.createElement('div');
  viewerHeader.className = 'appdosc-docx-viewer__header';
  const viewerTitle = document.createElement('div');
  viewerTitle.className = 'appdosc-docx-viewer__title';
  viewerTitle.textContent = 'Просмотр шаблона DOCX';
  const viewerClose = document.createElement('button');
  viewerClose.type = 'button';
  viewerClose.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  viewerClose.textContent = 'Закрыть';
  const viewerBody = document.createElement('div');
  viewerBody.className = 'appdosc-docx-viewer__body';
  const viewerCanvas = document.createElement('div');
  viewerCanvas.className = 'appdosc-docx-viewer__canvas';
  const viewerStatus = document.createElement('div');
  viewerStatus.className = 'appdosc-docx-viewer__status';
  viewerStatus.textContent = 'Шаблон не загружен.';

  viewerBody.appendChild(viewerCanvas);
  viewerHeader.append(viewerTitle, viewerClose);
  viewerPanel.append(viewerHeader, viewerBody, viewerStatus);
  viewer.appendChild(viewerPanel);

  let currentDocxBlob = null;

  const close = () => {
    document.removeEventListener('keydown', handleEsc);
    root.remove();
  };

  const handleEsc = (event) => {
    if (event.key === 'Escape') {
      if (viewer.classList.contains('appdosc-docx-viewer--open')) {
        viewer.classList.remove('appdosc-docx-viewer--open');
        return;
      }
      close();
    }
  };

  const setEditorText = (value) => {
    const text = String(value || '').trim();
    docxInput.value = text;
    openEditorButton.disabled = !text;
  };

  const ensureText = () => {
    const text = String(docxInput.value || '').trim();
    if (!text) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('warning', 'Сначала сформируйте или введите текст ответа.');
      }
      return '';
    }
    return text;
  };

  const generateAndRender = async () => {
    const text = ensureText();
    if (!text) {
      return null;
    }
    viewerStatus.textContent = 'Готовим DOCX из шаблона...';
    const { blob, templateUrl, documentXml } = await buildDocxBlob(text);
    currentDocxBlob = blob;
    viewerCanvas.innerHTML = '';
    let rendered = false;
    try {
      const docxPreview = await ensureDocxPreview();
      await docxPreview.renderAsync(blob, viewerCanvas, null, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        breakPages: true,
      });
      rendered = true;
    } catch (_) {
      rendered = false;
    }
    if (!rendered) {
      renderDocxFallbackHtml(viewerCanvas, documentXml);
    }
    viewerStatus.textContent = rendered
      ? `Шаблон загружен: ${templateUrl}`
      : `Шаблон загружен: ${templateUrl}. Упрощённый просмотр (fallback).`;
    return blob;
  };

  const send = () => {
    const value = (input.value || '').trim();
    if (!value) {
      return;
    }
    messages.appendChild(createBubble(value, 'user'));
    const assistantText = buildAssistantReply(value, context);
    messages.appendChild(createBubble(assistantText, 'assistant'));
    setEditorText(assistantText);
    messages.scrollTop = messages.scrollHeight;
    input.value = '';
    if (typeof context.onStatus === 'function') {
      context.onStatus('success', 'Черновик ответа готов. Откройте шаблон DOCX.');
    }
  };

  sendButton.addEventListener('click', send);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  openEditorButton.addEventListener('click', () => {
    docxSection.classList.toggle('appdosc-ai-dialog__docx--visible');
  });

  applyButton.addEventListener('click', () => {
    const text = ensureText();
    if (!text) {
      return;
    }
    if (typeof context.onApplyText === 'function') {
      context.onApplyText(text);
    }
    if (typeof context.onStatus === 'function') {
      context.onStatus('success', 'Текст вставлен в поле ответа задачи.');
    }
  });

  previewDocxButton.addEventListener('click', async () => {
    previewDocxButton.disabled = true;
    try {
      await generateAndRender();
      viewer.classList.add('appdosc-docx-viewer--open');
    } catch (error) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('error', error && error.message ? error.message : 'Не удалось визуализировать шаблон DOCX.');
      }
      viewerStatus.textContent = 'Ошибка визуализации шаблона.';
    } finally {
      previewDocxButton.disabled = false;
    }
  });

  downloadButton.addEventListener('click', async () => {
    const text = ensureText();
    if (!text) {
      return;
    }
    downloadButton.disabled = true;
    try {
      const result = currentDocxBlob ? { blob: currentDocxBlob } : await buildDocxBlob(text);
      currentDocxBlob = result.blob;
      downloadBlob(currentDocxBlob, 'response-template.docx');
      if (typeof context.onStatus === 'function') {
        context.onStatus('success', 'DOCX из шаблона успешно скачан.');
      }
    } catch (error) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('error', error && error.message ? error.message : 'Не удалось сформировать DOCX.');
      }
    } finally {
      downloadButton.disabled = false;
    }
  });

  printButton.addEventListener('click', async () => {
    const text = ensureText();
    if (!text) {
      return;
    }
    printButton.disabled = true;
    try {
      await generateAndRender();
      openPrintWindowFromHtml(viewerCanvas.innerHTML);
    } catch (error) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('error', error && error.message ? error.message : 'Печать недоступна.');
      }
    } finally {
      printButton.disabled = false;
    }
  });

  viewerClose.addEventListener('click', () => {
    viewer.classList.remove('appdosc-docx-viewer--open');
  });
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) {
      viewer.classList.remove('appdosc-docx-viewer--open');
    }
  });

  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      close();
    }
  });

  buttons.append(openEditorButton, sendButton);
  actions.append(hint, buttons);
  composer.append(input, actions);
  docxActions.append(applyButton, previewDocxButton, downloadButton, printButton);
  docxSection.append(docxMeta, docxInput, docxActions);
  header.append(titleWrap, closeButton);
  panel.append(header, messages, composer, docxSection);
  root.append(panel, viewer);
  document.body.appendChild(root);

  document.addEventListener('keydown', handleEsc);
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
