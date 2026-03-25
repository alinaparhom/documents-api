const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.36);backdrop-filter:blur(6px);padding:10px;}
    .appdosc-ai-dialog__panel{width:min(760px,100%);max-height:min(88vh,760px);border-radius:22px 22px 14px 14px;background:linear-gradient(165deg,rgba(255,255,255,.92),rgba(255,255,255,.8));border:1px solid rgba(255,255,255,.7);box-shadow:0 18px 46px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;}
    .appdosc-ai-dialog__header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 10px;border-bottom:1px solid rgba(148,163,184,.25);}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a;}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px;}
    .appdosc-ai-dialog__close{border:none;background:rgba(148,163,184,.16);color:#0f172a;border-radius:999px;width:34px;height:34px;font-size:18px;line-height:1;cursor:pointer;}
    .appdosc-ai-dialog__messages{padding:10px 12px;display:flex;flex-direction:column;gap:8px;overflow:auto;background:rgba(248,250,252,.55);min-height:170px;}
    .appdosc-ai-dialog__bubble{max-width:90%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.4;white-space:pre-wrap;word-break:break-word;}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:rgba(37,99,235,.12);color:#1e3a8a;}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(148,163,184,.25);}
    .appdosc-ai-dialog__composer{padding:10px 12px 12px;border-top:1px solid rgba(148,163,184,.2);display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.7);}
    .appdosc-ai-dialog__input{resize:none;min-height:76px;max-height:180px;border-radius:14px;border:1px solid rgba(148,163,184,.38);padding:10px 12px;font-size:14px;color:#0f172a;background:rgba(255,255,255,.85);outline:none;}
    .appdosc-ai-dialog__input:focus{border-color:rgba(37,99,235,.5);box-shadow:0 0 0 3px rgba(59,130,246,.15);}
    .appdosc-ai-dialog__actions{display:flex;justify-content:space-between;gap:8px;align-items:center;}
    .appdosc-ai-dialog__hint{font-size:12px;color:#64748b;}
    .appdosc-ai-dialog__send{border:none;border-radius:12px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:600;padding:10px 14px;min-height:38px;cursor:pointer;}
    @media (max-width: 560px){
      .appdosc-ai-dialog{padding:0;align-items:flex-end;}
      .appdosc-ai-dialog__panel{width:100%;max-height:92vh;border-radius:18px 18px 0 0;}
      .appdosc-ai-dialog__messages{min-height:140px;}
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
    'Проверьте формулировку и при необходимости прикрепите файл через «Загрузить Ответ».',
  ].join('\n');
}

function createBubble(text, role) {
  const bubble = document.createElement('div');
  bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
  bubble.textContent = text;
  return bubble;
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
  subtitle.textContent = 'Диалог для подготовки ответа по задаче';
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

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'appdosc-ai-dialog__send';
  sendButton.textContent = 'Отправить';

  const close = () => {
    document.removeEventListener('keydown', handleEsc);
    root.remove();
  };

  const handleEsc = (event) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  const send = () => {
    const value = (input.value || '').trim();
    if (!value) {
      return;
    }
    messages.appendChild(createBubble(value, 'user'));
    const assistantText = buildAssistantReply(value, context);
    messages.appendChild(createBubble(assistantText, 'assistant'));
    messages.scrollTop = messages.scrollHeight;
    input.value = '';
    if (typeof context.onStatus === 'function') {
      context.onStatus('success', 'Черновик ответа от ИИ готов.');
    }
  };

  sendButton.addEventListener('click', send);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      close();
    }
  });

  actions.append(hint, sendButton);
  composer.append(input, actions);
  header.append(titleWrap, closeButton);
  panel.append(header, messages, composer);
  root.appendChild(panel);
  document.body.appendChild(root);

  document.addEventListener('keydown', handleEsc);
  setTimeout(() => input.focus(), 0);
}


if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
