const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';
const DOCX_TEMPLATE_URL = '/app/templates/template.docx';

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.36);backdrop-filter:blur(6px);padding:0;}
    .appdosc-ai-dialog__panel{width:min(860px,100%);height:100dvh;max-height:100dvh;border-radius:22px 22px 0 0;background:linear-gradient(165deg,rgba(255,255,255,.92),rgba(255,255,255,.8));border:1px solid rgba(255,255,255,.7);box-shadow:0 18px 46px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 10px;border-bottom:1px solid rgba(148,163,184,.25);}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a;}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px;}
    .appdosc-ai-dialog__close{border:none;background:rgba(148,163,184,.16);color:#0f172a;border-radius:999px;width:34px;height:34px;font-size:18px;line-height:1;cursor:pointer;}
    .appdosc-ai-dialog__messages{padding:10px 12px;display:flex;flex-direction:column;gap:8px;overflow:auto;background:rgba(248,250,252,.55);min-height:0;flex:1;}
    .appdosc-ai-dialog__bubble{max-width:90%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.4;white-space:pre-wrap;word-break:break-word;}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a;}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.25);}
    .appdosc-ai-dialog__composer{padding:10px 12px;border-top:1px solid rgba(148,163,184,.2);display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.7);}
    .appdosc-ai-dialog__input{resize:none;min-height:76px;max-height:180px;border-radius:14px;border:1px solid rgba(148,163,184,.38);padding:10px 12px;font-size:14px;color:#0f172a;background:rgba(255,255,255,.85);outline:none;}
    .appdosc-ai-dialog__input:focus,.appdosc-ai-dialog__docx-input:focus{border-color:rgba(37,99,235,.5);box-shadow:0 0 0 3px rgba(59,130,246,.15);}
    .appdosc-ai-dialog__actions{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}
    .appdosc-ai-dialog__hint{font-size:12px;color:#64748b;}
    .appdosc-ai-dialog__buttons{display:flex;gap:8px;flex-wrap:wrap;}
    .appdosc-ai-dialog__btn{border:none;border-radius:12px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:600;padding:10px 14px;min-height:38px;cursor:pointer;}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a;}
    .appdosc-ai-dialog__docx{display:none;border-top:1px solid rgba(148,163,184,.2);padding:10px 12px calc(12px + env(safe-area-inset-bottom, 0px));background:rgba(255,255,255,.74);gap:8px;flex-direction:column;}
    .appdosc-ai-dialog__docx--visible{display:flex;}
    .appdosc-ai-dialog__docx-input{width:100%;resize:vertical;min-height:120px;max-height:260px;border-radius:12px;border:1px solid rgba(148,163,184,.38);padding:10px 12px;font-size:14px;background:rgba(255,255,255,.9);color:#0f172a;outline:none;}
    .appdosc-ai-dialog__docx-meta{font-size:12px;color:#64748b;}
    .appdosc-ai-dialog__preview{border:1px solid rgba(148,163,184,.3);border-radius:12px;background:#fff;max-height:220px;overflow:auto;padding:10px;}
    .appdosc-ai-dialog__preview-page{max-width:760px;background:#fff;color:#0f172a;margin:0 auto;padding:16px;white-space:pre-wrap;line-height:1.5;font-size:14px;}
    @media (max-width: 560px){
      .appdosc-ai-dialog{padding:0;align-items:stretch;}
      .appdosc-ai-dialog__panel{width:100%;height:100dvh;max-height:100dvh;border-radius:0;}
      .appdosc-ai-dialog__buttons{width:100%;}
      .appdosc-ai-dialog__btn{flex:1;}
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
    'Проверьте формулировку и при необходимости откройте DOCX-редактор ниже.',
  ].join('\n');
}

function createBubble(text, role) {
  const bubble = document.createElement('div');
  bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
  bubble.textContent = text;
  return bubble;
}

function ensurePizZip() {
  if (window.PizZip) {
    return Promise.resolve(window.PizZip);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.min.js';
    script.onload = () => window.PizZip ? resolve(window.PizZip) : reject(new Error('PizZip не загрузился'));
    script.onerror = () => reject(new Error('Не удалось загрузить PizZip'));
    document.head.appendChild(script);
  });
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

async function generateDocxFromTemplate(answerText) {
  const PizZip = await ensurePizZip();
  const templateResponse = await fetch(DOCX_TEMPLATE_URL, { credentials: 'same-origin' });
  if (!templateResponse.ok) {
    throw new Error('Шаблон DOCX не найден: /app/templates/template.docx');
  }
  const templateBuffer = await templateResponse.arrayBuffer();
  const zip = new PizZip(templateBuffer);
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
  return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function printText(text) {
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Разрешите всплывающие окна для печати.');
  }
  const safe = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  win.document.write(`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Печать ответа</title><style>body{font-family:Inter,Arial,sans-serif;padding:24px;line-height:1.55;white-space:pre-wrap;color:#111827}</style></head><body>${safe}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
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
  subtitle.textContent = 'Сформируйте ответ, отредактируйте и выгрузите в DOCX';
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
  openEditorButton.textContent = 'DOCX редактор';
  openEditorButton.disabled = true;

  const docxSection = document.createElement('div');
  docxSection.className = 'appdosc-ai-dialog__docx';

  const docxMeta = document.createElement('div');
  docxMeta.className = 'appdosc-ai-dialog__docx-meta';
  docxMeta.textContent = 'Текст попадёт в шаблон /app/templates/template.docx';

  const docxInput = document.createElement('textarea');
  docxInput.className = 'appdosc-ai-dialog__docx-input';
  docxInput.placeholder = 'Здесь можно отредактировать ответ перед вставкой в DOCX';

  const preview = document.createElement('div');
  preview.className = 'appdosc-ai-dialog__preview';
  const previewPage = document.createElement('div');
  previewPage.className = 'appdosc-ai-dialog__preview-page';
  previewPage.textContent = 'Черновик ещё не создан.';
  preview.appendChild(previewPage);

  const docxActions = document.createElement('div');
  docxActions.className = 'appdosc-ai-dialog__buttons';
  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  applyButton.textContent = 'Вставить в ответ';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'appdosc-ai-dialog__btn';
  downloadButton.textContent = 'Скачать DOCX';

  const printButton = document.createElement('button');
  printButton.type = 'button';
  printButton.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
  printButton.textContent = 'Печать';

  const close = () => {
    document.removeEventListener('keydown', handleEsc);
    root.remove();
  };

  const handleEsc = (event) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  const setEditorText = (value) => {
    const text = String(value || '').trim();
    docxInput.value = text;
    previewPage.textContent = text || 'Черновик ещё не создан.';
    openEditorButton.disabled = !text;
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
      context.onStatus('success', 'Черновик ответа от ИИ готов. Можно открыть DOCX редактор.');
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

  docxInput.addEventListener('input', () => {
    previewPage.textContent = docxInput.value || 'Черновик ещё не создан.';
  });

  applyButton.addEventListener('click', () => {
    const text = String(docxInput.value || '').trim();
    if (!text) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('warning', 'Нет текста для вставки в ответ.');
      }
      return;
    }
    if (typeof context.onApplyText === 'function') {
      context.onApplyText(text);
    }
    if (typeof context.onStatus === 'function') {
      context.onStatus('success', 'Текст из DOCX редактора вставлен в поле ответа.');
    }
  });

  downloadButton.addEventListener('click', async () => {
    const text = String(docxInput.value || '').trim();
    if (!text) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('warning', 'Сначала сформируйте или введите текст ответа.');
      }
      return;
    }
    downloadButton.disabled = true;
    try {
      const blob = await generateDocxFromTemplate(text);
      downloadBlob(blob, 'response-template.docx');
      if (typeof context.onStatus === 'function') {
        context.onStatus('success', 'DOCX сформирован из шаблона и скачан.');
      }
    } catch (error) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('error', error && error.message ? error.message : 'Не удалось сформировать DOCX.');
      }
    } finally {
      downloadButton.disabled = false;
    }
  });

  printButton.addEventListener('click', () => {
    const text = String(docxInput.value || '').trim();
    if (!text) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('warning', 'Нет текста для печати.');
      }
      return;
    }
    try {
      printText(text);
    } catch (error) {
      if (typeof context.onStatus === 'function') {
        context.onStatus('error', error && error.message ? error.message : 'Печать недоступна.');
      }
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
  docxActions.append(applyButton, downloadButton, printButton);
  docxSection.append(docxMeta, docxInput, preview, docxActions);
  header.append(titleWrap, closeButton);
  panel.append(header, messages, composer, docxSection);
  root.appendChild(panel);
  document.body.appendChild(root);

  document.addEventListener('keydown', handleEsc);
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
