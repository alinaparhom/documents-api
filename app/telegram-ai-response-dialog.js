const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style-v6';
const DIALOG_ROOT_SELECTOR = '.appdosc-ai-dialog';
const DOCS_API_ENDPOINT = '/js/documents/api-docs.php';
const DOCX_TEMPLATE_URLS = ['/app/templates/template.docx', '/templates/template.docx', './templates/template.docx', 'templates/template.docx'];
const PDF_TEMPLATE_URLS = ['/app/templates/template.pdf', '/templates/template.pdf', './templates/template.pdf', 'templates/template.pdf'];
const PDF_NOTE_TEXT = 'Для правок используйте DOCX, PDF — для отправки.';
const EDITOR_DRAFT_KEY = 'miniapp_editor_draft_v2';
const EDITOR_ROUTE_PAYLOAD_KEY = 'miniapp_editor_route_payload_v1';
const REQUEST_TIMEOUT_MS = 12000;
const CHAT_HISTORY_LIMIT = 16;
const MAX_AUTO_CONTEXT_FILES = 6;
const MAX_AUTO_CONTEXT_TEXT_CHARS = 180000;
const MAX_CHAT_ATTACHMENT_PREVIEW = 800;
const FALLBACK_MODEL_OPTIONS = [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }];
const DEFAULT_SITE_AI_BEHAVIOR = 'ТЫ — ИСКУССТВЕННЫЙ ИНТЕЛЛЕКТ, КОТОРЫЙ ВЫПОЛНЯЕТ РОЛЬ СОТРУДНИКА СТРОИТЕЛЬНОЙ ОРГАНИЗАЦИИ.\n'
  + '\n'
  + 'ЭТО НЕ ПРОСТО РЕКОМЕНДАЦИЯ. ЭТО ЖЕСТКИЕ ПРАВИЛА. НАРУШЕНИЯ НЕДОПУСТИМЫ.\n'
  + '\n'
  + '1. ТВОЯ ЛИЧНОСТЬ И СТИЛЬ\n'
  + '- Ты — профессионал с 15-летним стажем в строительстве.\n'
  + '- Ты отвечаешь только в деловом стиле, сухо, четко, без воды.\n'
  + '- Ты не извиняешься, не оправдываешься, не используешь слова "к сожалению", "извините", "возможно", "попробуем".\n'
  + '- Твои слова: "выполним", "обеспечим", "сделано", "готово", "срок — [дата]".\n'
  + '- Ты не используешь восклицательные знаки, кроме официальных обращений.\n'
  + '- Ты не используешь эмодзи, смайлы и неформальные выражения.\n'
  + '\n'
  + '2. ЗАПРЕЩЕНО НАВСЕГДА\n'
  + '- Запрещено пересказывать текст письма.\n'
  + '- Запрещено начинать ответ с фразы "Рассмотрев ваше письмо..." или аналогов.\n'
  + '- Запрещено использовать цитаты из запроса.\n'
  + '- Запрещено отвечать общими фразами без конкретики.\n'
  + '- Запрещено писать "мы работаем над этим" без указания сроков.\n'
  + '- Запрещено использовать пассивный залог: только активный.\n'
  + '- Запрещено писать длинные вступления: первое предложение сразу по делу.\n'
  + '\n'
  + '3. АНАЛИЗ ВХОДНОГО ТЕКСТА\n'
  + '- Вычленяй все требования, включая косвенные.\n'
  + '- Определяй взаимосвязи и приоритеты требований.\n'
  + '- Определяй автора, получателя и объект строительства.\n'
  + '- Если срок просрочен, предлагай новый реалистичный срок.\n'
  + '- Требования не пересказывай: анализируй и строй ответ по сути.\n'
  + '\n'
  + '4. ПРАВИЛА ФОРМАТА И СОДЕРЖАНИЯ\n'
  + '- Не используй маркированные списки с цифрами из исходного письма.\n'
  + '- Используй связные предложения или маркировку только для группировки.\n'
  + '- По каждому требованию указывай действие и дату в формате ДД.ММ.ГГГГ.\n'
  + '- Если требование выполнено, подтверждай это одним предложением.\n'
  + '- Используй глаголы: "выполняем", "завершим", "обеспечим", "приступаем".\n'
  + '- Не используй слова "попытка", "надеемся", "стараемся".\n'
  + '- Используй слова "гарантируем", "обеспечим", "выполним".\n'
  + '\n'
  + '5. СЛУЖЕБНЫЙ ПРИМЕР ЖЕСТКОГО ДЕЛОВОГО ТОНА\n'
  + 'Отмечаем, что требования и утверждения о невыполненных работах могут носить односторонний характер и не отражать фактическое состояние площадки. Работы выполняем по утвержденному графику. По позициям, зависящим от смежников, фиксируем объективные ограничения и даем обновленные сроки. При отсутствии координации со стороны смежных организаций указываем это как фактор влияния на фронт работ и подтверждаем дальнейшие действия по обеспечению выполнения.\n'
  + '\n'
  + '6. ПРОВЕРКА ПЕРЕД ОТПРАВКОЙ\n'
  + '- Нет пересказа исходного письма.\n'
  + '- По каждому требованию есть дата или подтверждение выполнения.\n'
  + '- Начало ответа сразу по делу.\n'
  + '- Нет слов "к сожалению", "извините", "возможно".\n'
  + '- Даты в формате ДД.ММ.ГГГГ.\n'
  + '- Тон уверенный и профессиональный.\n'
  + '\n'
  + '7. ДОПОЛНИТЕЛЬНО\n'
  + '- Если в письме есть ссылки на фото, учитывай их как зоны ответственности.\n'
  + '- Если указано несколько объектов, отвечай по каждому отдельно.\n'
  + '- Если требуется обеспечить фронт работ, явно указывай дату передачи фронта.';

const SCRIPT_CACHE = new Map();

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;background:rgba(15,23,42,.38);backdrop-filter:blur(8px)}
    .appdosc-ai-dialog__panel{width:min(920px,100%);height:100dvh;margin:auto;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.96),rgba(255,255,255,.9));border:1px solid rgba(255,255,255,.8);box-shadow:0 20px 45px rgba(15,23,42,.2);overflow:hidden;border-radius:20px 20px 0 0}
    .appdosc-ai-dialog__header{padding:12px;display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(148,163,184,.2)}
    .appdosc-ai-dialog__title{font-size:16px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__messages{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}
    .appdosc-ai-dialog__bubble{max-width:90%;padding:10px 12px;border-radius:14px;line-height:1.5;font-size:13px;white-space:pre-wrap;word-break:break-word;color:#0f172a}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#ffffff;border:1px solid rgba(148,163,184,.3)}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:#dbeafe;border:1px solid rgba(59,130,246,.3);color:#1e3a8a}
    .appdosc-ai-dialog__composer{padding:12px calc(12px + env(safe-area-inset-right,0px)) calc(12px + env(safe-area-inset-bottom,0px)) calc(12px + env(safe-area-inset-left,0px));border-top:1px solid rgba(148,163,184,.2);display:flex;flex-direction:column;gap:8px;background:#ffffff}
    .appdosc-ai-dialog__model{width:100%;min-height:42px;border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:10px 12px;font-size:14px;background:#fff;color:#0f172a}
    .appdosc-ai-dialog__input{min-height:80px;max-height:190px;resize:none;border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:10px 12px;font-size:14px;outline:none}
    .appdosc-ai-dialog__attachments{display:flex;flex-direction:column;gap:6px;max-height:156px;overflow:auto;padding-right:2px}
    .appdosc-ai-dialog__attachment-tools{display:flex;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__attachment{display:flex;flex-direction:column;gap:4px;padding:7px 8px;border-radius:11px;background:linear-gradient(145deg,rgba(255,255,255,.95),rgba(248,251,255,.9));border:1px solid rgba(148,163,184,.24);box-shadow:0 4px 12px rgba(15,23,42,.06)}
    .appdosc-ai-dialog__attachment.is-selected{border-color:rgba(37,99,235,.5);box-shadow:0 10px 20px rgba(37,99,235,.16)}
    .appdosc-ai-dialog__attachment-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .appdosc-ai-dialog__attachment-actions{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .appdosc-ai-dialog__attachment-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#334155}
    .appdosc-ai-dialog__attachment-name{font-size:12px;font-weight:600;color:#1e293b;word-break:break-word;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
    .appdosc-ai-dialog__attachment-meta{font-size:10px;color:#475569;white-space:nowrap}
    .appdosc-ai-dialog__attachment-preview{font-size:11px;line-height:1.35;color:#334155;background:rgba(241,245,249,.72);border:1px solid rgba(203,213,225,.7);border-radius:8px;padding:6px;max-height:52px;overflow:auto;white-space:pre-wrap}
    .appdosc-ai-dialog__attachment-preview.is-empty{color:#94a3b8}
    .appdosc-ai-dialog__buttons{display:flex;flex-wrap:wrap;gap:8px}
    .appdosc-ai-dialog__btn{border:none;min-height:42px;padding:10px 14px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:600;cursor:pointer}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a}
    .appdosc-ai-dialog__btn:disabled{opacity:.55;cursor:not-allowed}
    .appdosc-ai-dialog__editor{position:fixed;inset:0;z-index:2800;display:none;background:rgba(241,245,249,.74);backdrop-filter:blur(10px)}
    .appdosc-ai-dialog__editor--open{display:flex}
    .appdosc-ai-dialog__editor-panel{width:100%;height:100dvh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.97),rgba(255,255,255,.9));padding:calc(8px + env(safe-area-inset-top,0px)) calc(10px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(10px + env(safe-area-inset-left,0px))}
    .appdosc-ai-dialog__editor-header{padding:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border:1px solid rgba(148,163,184,.2);border-radius:16px;background:rgba(255,255,255,.75);backdrop-filter:blur(8px)}
    .appdosc-ai-dialog__editor-title{font-size:17px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__editor-subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__top-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .appdosc-ai-dialog__toolbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;flex-wrap:wrap;padding:8px 10px;background:rgba(255,255,255,.92);border-bottom:1px solid rgba(148,163,184,.18)}
    .appdosc-ai-dialog__body{flex:1;min-height:0;overflow:auto;padding:12px 4px 96px}
    .appdosc-ai-dialog__editable{min-height:52dvh;border:1px solid rgba(148,163,184,.34);border-radius:16px;padding:14px;background:#fff;line-height:1.55;outline:none;white-space:normal}
    .appdosc-ai-dialog__editable p{margin:0 0 .75em}
    .appdosc-ai-dialog__editable p:last-child{margin-bottom:0}
    .appdosc-ai-dialog__editable table{width:100%;border-collapse:collapse}
    .appdosc-ai-dialog__editable td,.appdosc-ai-dialog__editable th{border:1px solid rgba(148,163,184,.42);padding:6px}
    .appdosc-ai-dialog__pdf-note{margin-top:10px;border:1px dashed rgba(148,163,184,.45);border-radius:12px;padding:10px;background:rgba(255,255,255,.86);font-size:12px;color:#334155}
    .appdosc-ai-dialog__status{font-size:12px;color:#64748b;padding:0 12px 8px}
    .appdosc-ai-dialog__sticky{position:fixed;left:0;right:0;bottom:0;z-index:3;display:flex;gap:8px;overflow:auto;padding:8px calc(10px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(10px + env(safe-area-inset-left,0px));background:rgba(255,255,255,.94);border-top:1px solid rgba(148,163,184,.2)}
    @media (max-width:560px){.appdosc-ai-dialog{padding:0}.appdosc-ai-dialog__panel{width:100%;height:100dvh;border-radius:0}.appdosc-ai-dialog__btn{flex:1;min-height:48px;font-size:15px}}
  `;
  document.head.appendChild(style);
}

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function ensureScript(src, globalKey) {
  if (typeof window[globalKey] !== 'undefined') return Promise.resolve(window[globalKey]);
  if (SCRIPT_CACHE.has(src)) return SCRIPT_CACHE.get(src);
  const promise = new Promise((resolve, reject) => {
    const existed = document.querySelector(`script[src="${src}"]`);
    if (existed) {
      existed.addEventListener('load', () => resolve(window[globalKey]), { once: true });
      existed.addEventListener('error', () => reject(new Error(`Не удалось загрузить ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = () => {
      if (typeof window[globalKey] === 'undefined') {
        reject(new Error(`Скрипт ${src} загружен, но ${globalKey} не найден`));
      } else {
        resolve(window[globalKey]);
      }
    };
    script.onerror = () => reject(new Error(`Ошибка загрузки ${src}`));
    document.head.appendChild(script);
  }).catch((error) => {
    SCRIPT_CACHE.delete(src);
    throw error;
  });
  SCRIPT_CACHE.set(src, promise);
  return promise;
}

const ensureMammoth = () => ensureScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth');
const ensureJsPdf = () => ensureScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf');

const BASE_ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'A', 'SPAN', 'DIV', 'BLOCKQUOTE']);
const TEMPLATE_ALLOWED_TAGS = new Set([...BASE_ALLOWED_TAGS, 'SECTION', 'HEADER', 'FOOTER']);
const SAFE_STYLE_PROPERTIES = new Set([
  'text-align',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'line-height',
  'text-indent',
  'letter-spacing',
  'text-decoration',
  'text-transform',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-collapse',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'vertical-align',
  'white-space',
  'background-color',
  'color',
]);

function sanitizeInlineStyle(styleValue) {
  return String(styleValue || '')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const separatorIndex = chunk.indexOf(':');
      if (separatorIndex <= 0) return '';
      const property = chunk.slice(0, separatorIndex).trim().toLowerCase();
      const value = chunk.slice(separatorIndex + 1).trim();
      if (!SAFE_STYLE_PROPERTIES.has(property) || !value) return '';
      if (/url\s*\(/i.test(value) || /expression\s*\(/i.test(value)) return '';
      return `${property}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

function sanitizeHtml(inputHtml, options = {}) {
  const {
    allowTemplateMarkup = false,
    allowInlineStyles = false,
    allowClassNames = false,
  } = options;
  const allowedTags = allowTemplateMarkup ? TEMPLATE_ALLOWED_TAGS : BASE_ALLOWED_TAGS;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(inputHtml || '')}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  const walk = (node) => {
    const children = Array.from(node.childNodes);
    children.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toUpperCase();
        if (!allowedTags.has(tag)) {
          child.replaceWith(...Array.from(child.childNodes));
          return;
        }

        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) {
            child.removeAttribute(attr.name);
            return;
          }

          if (name === 'style') {
            if (!allowInlineStyles) {
              child.removeAttribute(attr.name);
              return;
            }
            const safeStyle = sanitizeInlineStyle(attr.value);
            if (safeStyle) child.setAttribute('style', safeStyle); else child.removeAttribute('style');
            return;
          }

          if (name === 'class') {
            if (!allowClassNames) child.removeAttribute(attr.name);
            return;
          }

          if (tag === 'A' && name === 'href') {
            const href = String(attr.value || '').trim();
            if (!/^https?:\/\//i.test(href)) {
              child.removeAttribute('href');
            } else {
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            }
            return;
          }

          if (!['href', 'target', 'rel', 'colspan', 'rowspan'].includes(name)) {
            child.removeAttribute(attr.name);
          }
        });

        walk(child);
      }
      if (child.nodeType === Node.COMMENT_NODE) child.remove();
    });
  };

  walk(root);
  return root.innerHTML;
}

function sanitizeTemplateHtml(inputHtml) {
  return sanitizeHtml(inputHtml, {
    allowTemplateMarkup: true,
    allowInlineStyles: true,
    allowClassNames: true,
  });
}

function textToParagraphHtml(text) {
  return String(text || '').split('\n').map((line) => `<p>${line.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))}</p>`).join('');
}

async function fetchTemplateBuffer(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { credentials: 'same-origin' });
      if (response.ok) return { buffer: await response.arrayBuffer(), url };
      lastError = new Error(`Шаблон недоступен (${response.status}): ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Шаблон не найден');
}

async function getTemplateHtml() {
  const mammoth = await ensureMammoth();
  const { buffer, url } = await fetchTemplateBuffer(DOCX_TEMPLATE_URLS);
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = sanitizeTemplateHtml(result && result.value ? result.value : '');
  if (!html.trim()) throw new Error('DOCX не удалось конвертировать');
  return { html, url, messages: Array.isArray(result && result.messages) ? result.messages : [] };
}

function fillDocxHtml(templateHtml, aiText) {
  const cleanTemplate = String(templateHtml || '').trim();
  const aiHtml = textToParagraphHtml(aiText);
  if (!cleanTemplate) return aiHtml;

  const markers = ['{{AI_RESPONSE}}', '[AI_RESPONSE]', '{AI_RESPONSE}', '[[AI_RESPONSE]]'];
  for (const marker of markers) {
    if (cleanTemplate.includes(marker)) {
      return cleanTemplate.split(marker).join(aiHtml);
    }
  }

  return `${cleanTemplate}<p></p><h2>Ответ ИИ</h2>${aiHtml}`;
}

function extractPlainTextFromHtml(html) {
  const node = document.createElement('div');
  node.innerHTML = String(html || '');
  return String(node.textContent || '').trim();
}

function saveDraft(data) {
  try { localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(data)); } catch (_) {}
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(EDITOR_DRAFT_KEY) || 'null'); } catch (_) { return null; }
}

function saveEditorRoutePayload(payload) {
  try { sessionStorage.setItem(EDITOR_ROUTE_PAYLOAD_KEY, JSON.stringify(payload || {})); } catch (_) {}
}

function loadEditorRoutePayload() {
  try { return JSON.parse(sessionStorage.getItem(EDITOR_ROUTE_PAYLOAD_KEY) || 'null'); } catch (_) { return null; }
}

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function wrapSelectionWithTag(editable, tagName) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer) || range.collapsed) return;
  const wrapper = document.createElement(tagName);
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);
  selection.removeAllRanges();
}

function insertList(editable, ordered) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return;
  const list = document.createElement(ordered ? 'ol' : 'ul');
  const li = document.createElement('li');
  li.textContent = selection.toString().trim() || 'Пункт';
  list.appendChild(li);
  range.deleteContents();
  range.insertNode(list);
}

function insertLink(editable, href) {
  if (!isValidHttpUrl(href)) return false;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return false;
  const text = selection.toString().trim() || href;
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  range.deleteContents();
  range.insertNode(link);
  return true;
}

function insertTable(editable) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return;
  const table = document.createElement('table');
  const head = document.createElement('tr');
  ['Колонка 1', 'Колонка 2'].forEach((title) => {
    const th = document.createElement('th');
    th.textContent = title;
    head.appendChild(th);
  });
  const row = document.createElement('tr');
  ['Текст', 'Текст'].forEach((value) => {
    const td = document.createElement('td');
    td.textContent = value;
    row.appendChild(td);
  });
  table.append(head, row);
  range.insertNode(table);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function createPdfBlobFromText(text) {
  const jspdfNs = await ensureJsPdf();
  const jsPDF = jspdfNs && jspdfNs.jsPDF;
  if (!jsPDF) throw new Error('jsPDF недоступен');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  try {
    const fontResp = await fetchWithTimeout('/shrift/Roboto-Regular.ttf', { credentials: 'same-origin' });
    if (fontResp.ok) {
      const base64 = await toBase64(await fontResp.arrayBuffer());
      doc.addFileToVFS('Roboto-Regular.ttf', base64);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.setFont('Roboto', 'normal');
    }
  } catch (_) {}

  const margin = 36;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const height = doc.internal.pageSize.getHeight();
  let y = margin;
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

function buildAssistantReply(userMessage, context) {
  const taskId = context && context.task && context.task.id ? String(context.task.id) : '—';
  const text = String(userMessage || '').trim();
  return `Черновик ответа ИИ\n\nЗадача №${taskId}\n${text}`;
}

function detectFileName(file, index) {
  return String((file && (file.originalName || file.name || file.fileName || file.storedName)) || `Файл ${index + 1}`).trim();
}

function detectFileUrl(file) {
  const urls = detectFileUrls(file);
  return urls[0] || '';
}

function toAbsoluteUrlSafe(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith('//')) {
    const protocol = (typeof location !== 'undefined' && location.protocol) ? location.protocol : 'https:';
    return `${protocol}${input}`;
  }
  if (typeof location === 'undefined' || !location.origin) return input;
  try {
    if (input.startsWith('/')) return `${location.origin}${input}`;
    return new URL(input, `${location.origin}/`).toString();
  } catch (_) {
    return input;
  }
}

function detectFileUrls(file) {
  const raw = [
    file && file.resolvedUrl,
    file && file.fileUrl,
    file && file.downloadUrl,
    file && file.url,
    file && file.previewUrl,
    file && file.previewPdfUrl,
    file && file.pdfUrl,
    file && file.pdf,
  ];
  const result = [];
  const seen = new Set();
  raw.forEach((item) => {
    const value = toAbsoluteUrlSafe(item);
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

function detectFileType(file) {
  return String((file && (file.type || file.mime || file.mimeType || '')) || '').toLowerCase();
}

function isPdfLikeMeta(fileMeta) {
  const type = detectFileType(fileMeta);
  const name = String(fileMeta && fileMeta.name || '').toLowerCase();
  return type.includes('pdf') || name.endsWith('.pdf');
}

function isTextLikeMeta(fileMeta) {
  const type = detectFileType(fileMeta);
  const name = String(fileMeta && fileMeta.name || '').toLowerCase();
  return type.startsWith('text/')
    || name.endsWith('.txt')
    || name.endsWith('.csv')
    || name.endsWith('.json')
    || name.endsWith('.xml')
    || name.endsWith('.md');
}

async function fetchExternalFileContent(fileMeta) {
  const candidates = Array.isArray(fileMeta && fileMeta.urls) && fileMeta.urls.length
    ? fileMeta.urls
    : [fileMeta && fileMeta.url].filter(Boolean);
  if (!candidates.length) {
    throw new Error('У файла нет доступной ссылки');
  }

  let lastError = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const url = String(candidates[i] || '').trim();
    if (!url) continue;
    try {
      const response = await fetchWithTimeout(url, { credentials: 'same-origin' }, REQUEST_TIMEOUT_MS + 6000);
      if (!response.ok) {
        throw new Error(`Файл недоступен (${response.status})`);
      }
      fileMeta.url = url;
      if (isTextLikeMeta(fileMeta)) {
        return (await response.text()).trim();
      }
      const form = new FormData();
      form.append('action', 'ocr_extract');
      form.append('language', 'rus');
      form.append('file_url', url);
      const ocrResponse = await fetchWithTimeout(`${DOCS_API_ENDPOINT}?action=ocr_extract`, { method: 'POST', body: form, credentials: 'same-origin' }, REQUEST_TIMEOUT_MS + 12000);
      const payload = await ocrResponse.json().catch(() => null);
      if (!ocrResponse.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || 'OCR временно недоступен');
      }
      return String(payload.text || '').trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Файл недоступен');
}

async function collectTaskAttachmentTexts(task, appendBubble) {
  const files = Array.isArray(task && task.files) ? task.files.slice(0, MAX_AUTO_CONTEXT_FILES) : [];
  if (!files.length) return [];
  const prepared = files.map((file, index) => ({
    id: `file_${index + 1}`,
    name: detectFileName(file, index),
    type: detectFileType(file),
    urls: detectFileUrls(file),
    url: detectFileUrl(file),
    size: Number(file && file.size) || 0,
  })).filter((file) => file.url || (Array.isArray(file.urls) && file.urls.length));

  if (!prepared.length) return [];
  appendBubble(`Найдено вложений: ${prepared.length}. Выберите нужные и нажмите «Прочитать выбранные».`, 'assistant');
  return prepared;
}

function normalizeHistoryMessages(history) {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      text: String(item && item.text ? item.text : '').trim(),
      ts: Number(item && item.ts ? item.ts : Date.now()),
    }))
    .filter((item) => item.text)
    .slice(-CHAT_HISTORY_LIMIT);
}

function buildChatHistoryContext(history) {
  return normalizeHistoryMessages(history).map((item) => ({
    role: item.role,
    text: item.text,
    ts: item.ts,
  }));
}

function parseAiPayload(payload) {
  if (!payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || 'ИИ временно недоступен');
  }
  if (typeof payload.response === 'string' && payload.response.trim()) {
    return payload.response.trim();
  }
  const raw = payload.raw && payload.raw.content ? payload.raw.content : '';
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.response === 'string' && parsed.response.trim()) {
        return parsed.response.trim();
      }
    } catch (_) {}
    return raw.trim();
  }
  return '';
}

function normalizeModelList(models) {
  const source = Array.isArray(models) ? models : [];
  const unique = [];
  const seen = new Set();
  source.forEach((model) => {
    const value = String(model || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    unique.push({ value, label: value });
  });
  return unique.length ? unique : FALLBACK_MODEL_OPTIONS.slice();
}

async function fetchAvailableModels() {
  const response = await fetchWithTimeout(`${DOCS_API_ENDPOINT}?action=ai_models`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Ошибка загрузки моделей (${response.status})`);
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok !== true || !Array.isArray(payload.models)) {
    throw new Error('Список моделей недоступен');
  }
  return normalizeModelList(payload.models);
}

async function requestAssistantReply(userMessage, context, history) {
  const prompt = String(userMessage || '').trim();
  if (!prompt) return '';
  const task = context && context.task ? context.task : {};
  const form = new FormData();
  form.append('action', 'ai_response_analyze');
  form.append('documentTitle', String(task.title || task.name || 'Задача'));
  form.append('prompt', `${prompt}\n\nУчитывай chatHistory из context. Если пользователь просит переделать/исправить — обнови предыдущий ответ.`);
  form.append('responseStyle', 'neutral');
  if (context && context.model) {
    form.append('model', String(context.model));
  }
  const behaviorFromContext = context && typeof context.aiBehavior === 'string' ? context.aiBehavior.trim() : '';
  const behaviorText = behaviorFromContext || DEFAULT_SITE_AI_BEHAVIOR;
  form.append('aiBehavior', behaviorText);
  const extractedTexts = Array.isArray(context && context.extractedTexts) ? context.extractedTexts : [];
  form.append('context', JSON.stringify({
    task: {
      id: task.id || null,
      title: task.title || task.name || '',
      description: task.description || task.text || '',
    },
    chatHistory: buildChatHistoryContext(history),
    attachedFiles: Array.isArray(context && context.attachedFiles) ? context.attachedFiles : [],
    extractedTexts,
    source: 'telegram_mini_app_dialog',
  }));
  const response = await fetchWithTimeout(DOCS_API_ENDPOINT, { method: 'POST', body: form, credentials: 'same-origin' }, REQUEST_TIMEOUT_MS + 8000);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((payload && payload.error) || `Ошибка сервера (${response.status})`);
    if (payload && payload.code) error.code = String(payload.code);
    if (payload && Array.isArray(payload.availableModels)) error.availableModels = payload.availableModels;
    throw error;
  }
  const assistantText = parseAiPayload(payload);
  if (!assistantText) {
    throw new Error('ИИ вернул пустой ответ');
  }
  return assistantText;
}

function openAiResponseDialog(context = {}) {
  ensureAiDialogStyles();
  const existing = window.__aiDialogInstance || document.querySelector(DIALOG_ROOT_SELECTOR);
  if (existing) return;

  const state = {
    destroyed: false,
    isSending: false,
    chatHistory: [],
    attachedFiles: [],
    selectedAttachmentIds: new Set(),
    models: FALLBACK_MODEL_OPTIONS.slice(),
    model: FALLBACK_MODEL_OPTIONS[0].value,
  };

  const notify = (type, message) => {
    if (typeof context.onStatus === 'function') context.onStatus(type, message);
  };

  const root = document.createElement('div');
  root.className = 'appdosc-ai-dialog';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Диалог ответа ИИ');
  root.innerHTML = `
    <div class="appdosc-ai-dialog__panel">
      <div class="appdosc-ai-dialog__header">
        <div><div class="appdosc-ai-dialog__title">Ответ с помощью ИИ</div><div class="appdosc-ai-dialog__subtitle">Выберите файлы и получите решение</div></div>
        <button type="button" class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-close>Закрыть</button>
      </div>
      <div class="appdosc-ai-dialog__messages" data-messages></div>
      <div class="appdosc-ai-dialog__composer">
        <div class="appdosc-ai-dialog__attachments" data-attachments hidden></div>
        <select class="appdosc-ai-dialog__model" data-model aria-label="Модель ИИ"></select>
        <textarea class="appdosc-ai-dialog__input" data-input placeholder="Введите запрос для ИИ"></textarea>
        <div class="appdosc-ai-dialog__buttons">
          <button type="button" class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-auto-decision>Сгенерировать решение</button>
          <button type="button" class="appdosc-ai-dialog__btn" data-send>Отправить</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  window.__aiDialogInstance = root;

  const messages = root.querySelector('[data-messages]');
  const input = root.querySelector('[data-input]');
  const modelSelect = root.querySelector('[data-model]');
  const autoDecisionBtn = root.querySelector('[data-auto-decision]');
  const attachmentsNode = root.querySelector('[data-attachments]');

  const appendBubble = (text, role) => {
    const bubble = document.createElement('div');
    bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  };

  appendBubble('Выберите нужные файлы, нажмите «Прочитать выбранные», затем отправьте запрос или «Сгенерировать решение».', 'assistant');
  const renderModelOptions = () => {
    modelSelect.innerHTML = '';
    (state.models || []).forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      modelSelect.appendChild(option);
    });
    if (!(state.models || []).some((entry) => entry.value === state.model)) {
      state.model = state.models[0] ? state.models[0].value : FALLBACK_MODEL_OPTIONS[0].value;
    }
    modelSelect.value = state.model;
  };
  modelSelect.addEventListener('change', () => {
    state.model = modelSelect.value || state.model;
  });

  const renderAttachments = () => {
    if (!attachmentsNode) return;
    attachmentsNode.innerHTML = '';
    if (!state.attachedFiles.length) {
      attachmentsNode.hidden = true;
      return;
    }
    attachmentsNode.hidden = false;
    const tools = document.createElement('div');
    tools.className = 'appdosc-ai-dialog__attachment-tools';
    const readSelectedBtn = document.createElement('button');
    readSelectedBtn.type = 'button';
    readSelectedBtn.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
    readSelectedBtn.textContent = 'Прочитать выбранные';
    readSelectedBtn.disabled = !state.attachedFiles.some((file) => state.selectedAttachmentIds.has(file.id));
    readSelectedBtn.addEventListener('click', async () => {
      const selected = state.attachedFiles.filter((file) => state.selectedAttachmentIds.has(file.id));
      if (!selected.length) return;
      let totalChars = 0;
      const extractedForContext = [];
      for (let i = 0; i < selected.length; i += 1) {
        const file = selected[i];
        if (totalChars >= MAX_AUTO_CONTEXT_TEXT_CHARS) break;
        try {
          if (!file.extracted || !String(file.text || '').trim()) {
            const raw = await fetchExternalFileContent(file);
            const text = String(raw || '').trim();
            if (!text) {
              file.extractError = 'Пустой текст';
              continue;
            }
            const next = Math.max(0, MAX_AUTO_CONTEXT_TEXT_CHARS - totalChars);
            file.text = text.slice(0, next);
            file.extracted = true;
          }
          const normalized = String(file.text || '').trim();
          if (!normalized) continue;
          file.extractError = '';
          totalChars += normalized.length;
          extractedForContext.push(file);
        } catch (error) {
          file.extractError = error && error.message ? error.message : 'Ошибка чтения';
          file.extracted = false;
        }
      }

      context.extractedTexts = extractedForContext.map((file) => ({
        name: file.name,
        type: file.type || 'text/plain',
        text: file.text,
      }));

      const mergedChatText = extractedForContext.map((file) => (
        `📄 ${file.name}\n${String(file.text || '').slice(0, MAX_CHAT_ATTACHMENT_PREVIEW)}${String(file.text || '').length > MAX_CHAT_ATTACHMENT_PREVIEW ? '\n…' : ''}`
      )).join('\n\n');
      if (mergedChatText) {
        appendBubble(`Загружены выбранные файлы (${extractedForContext.length}):\n\n${mergedChatText}`, 'assistant');
      } else {
        appendBubble('Не удалось прочитать выбранные файлы. Проверьте OCR/доступ к файлам.', 'assistant');
      }
      renderAttachments();
      if (extractedForContext.length) {
        runAutoDecision();
      }
    });
    tools.appendChild(readSelectedBtn);
    attachmentsNode.appendChild(tools);

    state.attachedFiles.forEach((file) => {
      const chip = document.createElement('div');
      chip.className = 'appdosc-ai-dialog__attachment';
      if (state.selectedAttachmentIds.has(file.id)) {
        chip.classList.add('is-selected');
      }
      const status = file.extracted ? '✅ готов' : (file.extractError ? '⚠️ OCR' : '⭕ не прочитан');
      const topNode = document.createElement('div');
      topNode.className = 'appdosc-ai-dialog__attachment-top';
      const nameNode = document.createElement('span');
      nameNode.className = 'appdosc-ai-dialog__attachment-name';
      nameNode.textContent = `📎 ${file.name}`;
      const metaNode = document.createElement('span');
      metaNode.className = 'appdosc-ai-dialog__attachment-meta';
      metaNode.textContent = status;
      topNode.appendChild(nameNode);
      topNode.appendChild(metaNode);
      chip.appendChild(topNode);
      const previewNode = document.createElement('div');
      previewNode.className = 'appdosc-ai-dialog__attachment-preview';
      const previewText = String(file.text || '').trim();
      if (previewText) {
        previewNode.textContent = previewText.slice(0, 120) + (previewText.length > 120 ? '…' : '');
      } else {
        previewNode.classList.add('is-empty');
        previewNode.textContent = file.extractError ? `Ошибка: ${file.extractError}` : 'Текст файла появится после OCR/чтения.';
      }
      chip.appendChild(previewNode);
      const actionsNode = document.createElement('div');
      actionsNode.className = 'appdosc-ai-dialog__attachment-actions';
      const checkLabel = document.createElement('label');
      checkLabel.className = 'appdosc-ai-dialog__attachment-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selectedAttachmentIds.has(file.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedAttachmentIds.add(file.id); else state.selectedAttachmentIds.delete(file.id);
        renderAttachments();
      });
      checkLabel.appendChild(checkbox);
      checkLabel.appendChild(document.createTextNode('В общий контекст'));
      const oneFileReadBtn = document.createElement('button');
      oneFileReadBtn.type = 'button';
      oneFileReadBtn.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
      oneFileReadBtn.textContent = 'Прочитать';
      oneFileReadBtn.addEventListener('click', async () => {
        try {
          const raw = await fetchExternalFileContent(file);
          const text = String(raw || '').trim();
          if (!text) throw new Error('Пустой текст');
          file.text = text.slice(0, MAX_AUTO_CONTEXT_TEXT_CHARS);
          file.extracted = true;
          file.extractError = '';
          state.selectedAttachmentIds.add(file.id);
          context.extractedTexts = state.attachedFiles
            .filter((item) => state.selectedAttachmentIds.has(item.id) && item.extracted && item.text)
            .map((item) => ({ name: item.name, type: item.type || 'text/plain', text: item.text }));
          appendBubble(`Содержимое "${file.name}":\n${file.text.slice(0, MAX_CHAT_ATTACHMENT_PREVIEW)}${file.text.length > MAX_CHAT_ATTACHMENT_PREVIEW ? '\n…' : ''}`, 'assistant');
        } catch (error) {
          file.extractError = error && error.message ? error.message : 'Ошибка чтения';
          file.extracted = false;
        }
        renderAttachments();
      });
      actionsNode.appendChild(checkLabel);
      actionsNode.appendChild(oneFileReadBtn);
      chip.appendChild(actionsNode);
      attachmentsNode.appendChild(chip);
    });
  };

  const cleanup = () => {
    state.destroyed = true;
    window.removeEventListener('keydown', onEscClose);
    if (window.__aiDialogInstance === root) window.__aiDialogInstance = null;
    root.remove();
  };

  const onEscClose = (event) => {
    if (event.key !== 'Escape') return;
    cleanup();
  };

  const runAutoDecision = async () => {
    if (state.isSending) return;
    const hasFiles = Array.isArray(context.extractedTexts) && context.extractedTexts.length > 0;
    const prompt = hasFiles
      ? 'Проанализируй выбранные файлы, учти историю переписки и настройки aiBehavior. Дай итоговое решение и краткий план действий.'
      : 'Учти историю переписки и настройки aiBehavior. Сформируй итоговое решение по задаче.';
    appendBubble('Авто-запрос: сформируй решение по задаче.', 'user');
    state.chatHistory.push({ role: 'user', text: prompt, ts: Date.now() });
    state.chatHistory = normalizeHistoryMessages(state.chatHistory);
    state.isSending = true;
    input.disabled = true;
    autoDecisionBtn.disabled = true;
    root.querySelector('[data-send]').disabled = true;
    try {
      const assistantReply = await requestAssistantReply(prompt, { ...context, model: state.model }, state.chatHistory);
      appendBubble(assistantReply, 'assistant');
      state.chatHistory.push({ role: 'assistant', text: assistantReply, ts: Date.now() });
      state.chatHistory = normalizeHistoryMessages(state.chatHistory);
      notify('success', 'Решение сгенерировано.');
    } catch (error) {
      const fallback = buildAssistantReply(prompt, context);
      appendBubble(fallback, 'assistant');
      state.chatHistory.push({ role: 'assistant', text: fallback, ts: Date.now() });
      state.chatHistory = normalizeHistoryMessages(state.chatHistory);
      notify('warning', error && error.message ? `${error.message}. Показан черновик.` : 'Ошибка ИИ. Показан черновик.');
    } finally {
      state.isSending = false;
      input.disabled = false;
      autoDecisionBtn.disabled = false;
      root.querySelector('[data-send]').disabled = false;
    }
  };

  root.querySelector('[data-close]').addEventListener('click', cleanup);
  const sendBtn = root.querySelector('[data-send]');
  root.querySelector('[data-send]').addEventListener('click', async () => {
    if (state.isSending) return;
    const prompt = String(input.value || '').trim();
    if (!prompt) return;
    appendBubble(prompt, 'user');
    state.chatHistory.push({ role: 'user', text: prompt, ts: Date.now() });
    state.chatHistory = normalizeHistoryMessages(state.chatHistory);
    state.isSending = true;
    sendBtn.disabled = true;
    input.disabled = true;
    notify('info', 'Генерируем ответ ИИ...');
    let assistantReply = '';
    try {
      assistantReply = await requestAssistantReply(prompt, { ...context, model: state.model }, state.chatHistory);
    } catch (error) {
      if (error && error.code === 'MODEL_NOT_ALLOWED' && Array.isArray(error.availableModels) && error.availableModels.length) {
        state.models = normalizeModelList(error.availableModels);
        renderModelOptions();
        notify('warning', `Модель недоступна. Выберите другую: ${state.models.map((item) => item.value).join(', ')}`);
        input.disabled = false;
        state.isSending = false;
        sendBtn.disabled = false;
        return;
      }
      assistantReply = buildAssistantReply(prompt, context);
      notify('warning', error && error.message ? `${error.message}. Показан черновик.` : 'Ошибка ИИ. Показан черновик.');
    }
    appendBubble(assistantReply, 'assistant');
    state.chatHistory.push({ role: 'assistant', text: assistantReply, ts: Date.now() });
    state.chatHistory = normalizeHistoryMessages(state.chatHistory);
    input.value = '';
    input.disabled = false;
    state.isSending = false;
    sendBtn.disabled = false;
    notify('success', 'Ответ ИИ готов.');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      root.querySelector('[data-send]').click();
    }
  });

  autoDecisionBtn.addEventListener('click', runAutoDecision);
  window.addEventListener('keydown', onEscClose);
  fetchAvailableModels()
    .then((models) => {
      state.models = models;
      if (!models.some((entry) => entry.value === state.model)) state.model = models[0].value;
      renderModelOptions();
    })
    .catch(() => {
      renderModelOptions();
    });
  collectTaskAttachmentTexts(context && context.task, appendBubble).then((files) => {
    state.attachedFiles = files;
    context.attachedFiles = files.map((file) => ({
      name: file.name,
      type: file.type || '',
      size: Number(file.size) || 0,
      url: file.url || '',
      extracted: Boolean(file.extracted),
      extractError: file.extractError || null,
    }));
    context.extractedTexts = files
      .filter((file) => file.extracted && file.text)
      .map((file) => ({ name: file.name, type: file.type || 'text/plain', text: file.text }));
    if (files.length) {
      appendBubble('Чтобы ИИ учёл файлы, отметьте их и нажмите «Прочитать выбранные».', 'assistant');
    }
    renderAttachments();
  }).catch((error) => {
    appendBubble(`Не удалось подключить вложения: ${error && error.message ? error.message : 'неизвестная ошибка'}`, 'assistant');
  });
  renderAttachments();
  setTimeout(() => input.focus(), 0);
}

if (typeof window !== 'undefined') {
  window.openAiResponseDialog = openAiResponseDialog;
}
