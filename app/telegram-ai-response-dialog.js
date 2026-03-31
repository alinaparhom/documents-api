const DIALOG_STYLE_ID = 'appdosc-ai-dialog-style-v8';
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
const FALLBACK_MODEL_OPTIONS = [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }];
const DEFAULT_SITE_AI_BEHAVIOR = 'ТЫ — СОТРУДНИК СТРОИТЕЛЬНОЙ КОМПАНИИ, КОТОРЫЙ ГОТОВИТ ОФИЦИАЛЬНЫЕ ОТВЕТЫ НА ВХОДЯЩИЕ ПИСЬМА.\n'
  + '\n'
  + 'ТВОЯ ЗАДАЧА — НЕ ПЕРЕСКАЗЫВАТЬ ТЕКСТ ПИСЬМА, А ДАВАТЬ РЕШЕНИЕ.\n'
  + '- Если требуется согласование — пиши, что согласовано или не согласовано, и кратко почему.\n'
  + '- Если требуется оформить документы — укажи, что будет оформлено и к какому сроку.\n'
  + '- Если есть задержки — назови новую дату и краткую причину.\n'
  + '- Если есть претензии — прими или отклони с обоснованием.\n'
  + '\n'
  + 'ПРАВИЛА\n'
  + '1) Не пересказывай текст письма: он уже есть в документе.\n'
  + '2) Не используй фразы-пустышки («мы рассмотрим», «мы гарантируем качество», «будет выполнено в срок») без конкретики.\n'
  + '3) Не добавляй реквизиты компании, подписи, даты отправки и служебные шапки.\n'
  + '4) Каждое предложение должно содержать новое решение или действие.\n'
  + '5) Если данных недостаточно, запроси конкретные недостающие данные.\n'
  + '\n'
  + 'ФОРМАТ ОТВЕТА\n'
  + '- Сплошной текст без шапки и подписи.\n'
  + '- Только суть решений, действий и сроков в формате ДД.ММ.ГГГГ.\n'
  + '- Начинай сразу с решения по существу.\n';

const SCRIPT_CACHE = new Map();

function ensureAiDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .appdosc-ai-dialog{position:fixed;inset:0;z-index:2500;display:flex;background:rgba(15,23,42,.38);backdrop-filter:blur(8px)}
    .appdosc-ai-dialog__panel{width:min(760px,100%);height:100dvh;margin:auto;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(255,255,255,.95),rgba(255,255,255,.88));border:1px solid rgba(255,255,255,.82);box-shadow:0 20px 45px rgba(15,23,42,.15);overflow:hidden;border-radius:20px 20px 0 0}
    .appdosc-ai-dialog__header{padding:9px 10px;display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(148,163,184,.2)}
    .appdosc-ai-dialog__title{font-size:15px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__subtitle{font-size:11px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__messages{flex:1;min-height:0;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px;background:linear-gradient(180deg,#f8fafc,#f1f5f9)}
    .appdosc-ai-dialog__bubble{max-width:94%;padding:7px 9px;border-radius:12px;line-height:1.4;font-size:12px;white-space:pre-wrap;word-break:break-word;color:#0f172a}
    .appdosc-ai-dialog__bubble--assistant{align-self:flex-start;background:#ffffff;border:1px solid rgba(148,163,184,.3)}
    .appdosc-ai-dialog__bubble--user{align-self:flex-end;background:#dbeafe;border:1px solid rgba(59,130,246,.3);color:#1e3a8a}
    .appdosc-ai-dialog__composer{padding:8px calc(10px + env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) calc(10px + env(safe-area-inset-left,0px));border-top:1px solid rgba(148,163,184,.2);display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.92);backdrop-filter:blur(10px)}
    .appdosc-ai-dialog__input{min-height:52px;max-height:124px;resize:none;border:1px solid rgba(148,163,184,.32);border-radius:11px;padding:8px 10px;font-size:13px;outline:none}
    .appdosc-ai-dialog__attachments{display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:14px;border:1px solid rgba(148,163,184,.24);background:rgba(255,255,255,.74)}
    .appdosc-ai-dialog__attachments-header{display:flex;flex-direction:column;gap:8px}
    .appdosc-ai-dialog__attachments-headline{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
    .appdosc-ai-dialog__attachments-title{font-size:12px;font-weight:700;color:#0f172a}
    .appdosc-ai-dialog__attachments-hint{font-size:11px;color:#64748b}
    .appdosc-ai-dialog__attachments-select-all{display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;padding:5px 8px;border-radius:999px;background:rgba(148,163,184,.12)}
    .appdosc-ai-dialog__attachments-select-all input{accent-color:#2563eb}
    .appdosc-ai-dialog__context-stats{font-size:11px;color:#334155}
    .appdosc-ai-dialog__context-progress{width:100%;height:4px;border-radius:999px;background:rgba(148,163,184,.2);overflow:hidden}
    .appdosc-ai-dialog__context-progress > span{display:block;height:100%;width:0;background:linear-gradient(90deg,#3b82f6,#8b5cf6)}
    .appdosc-ai-dialog__attachments-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;max-height:240px;overflow:auto;padding:2px}
    .appdosc-ai-dialog__attachment{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:16px;background:rgba(255,255,255,.9);border:1px solid rgba(148,163,184,.28);box-shadow:0 2px 8px rgba(15,23,42,.05);animation:appdoscAttachmentIn .18s ease-out}
    .appdosc-ai-dialog__attachment:hover{box-shadow:0 10px 20px rgba(15,23,42,.1)}
    .appdosc-ai-dialog__attachment.is-selected{border-color:rgba(37,99,235,.5)}
    .appdosc-ai-dialog__attachment.is-ready{border-left:4px solid #10b981}
    .appdosc-ai-dialog__attachment.is-error{border-color:rgba(239,68,68,.55);border-left:4px solid #ef4444}
    .appdosc-ai-dialog__attachment-top{display:flex;gap:8px;align-items:flex-start}
    .appdosc-ai-dialog__attachment-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:rgba(219,234,254,.9)}
    .appdosc-ai-dialog__attachment-name{font-size:12px;font-weight:700;color:#1e293b;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .appdosc-ai-dialog__attachment-meta{font-size:10px;color:#64748b;margin-top:2px}
    .appdosc-ai-dialog__attachment-status{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 7px;border-radius:999px;background:rgba(148,163,184,.12)}
    .appdosc-ai-dialog__attachment-status.is-ready{background:rgba(16,185,129,.14);color:#047857}
    .appdosc-ai-dialog__attachment-status.is-error{background:rgba(254,226,226,.9);color:#b91c1c}
    .appdosc-ai-dialog__attachment-actions{display:flex;flex-wrap:wrap;gap:6px}
    .appdosc-ai-dialog__attachment-btn{border:none;min-height:32px;padding:6px 9px;border-radius:10px;font-size:11px;font-weight:600;cursor:pointer;background:rgba(59,130,246,.12);color:#1d4ed8}
    .appdosc-ai-dialog__attachment-btn--add{background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
    .appdosc-ai-dialog__attachment-btn--danger{background:rgba(239,68,68,.12);color:#b91c1c}
    .appdosc-ai-dialog__attachment-error{font-size:10px;color:#b91c1c}
    .appdosc-ai-dialog__attachments-footer{display:flex;gap:6px;flex-wrap:wrap}
    .appdosc-ai-dialog__preview-modal{position:fixed;inset:0;z-index:2600;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;padding:12px}
    .appdosc-ai-dialog__preview-modal.is-open{display:flex}
    .appdosc-ai-dialog__preview-panel{width:min(700px,100%);max-height:78dvh;overflow:auto;border-radius:16px;background:rgba(255,255,255,.96);border:1px solid rgba(148,163,184,.25);padding:12px;box-shadow:0 20px 40px rgba(15,23,42,.2)}
    .appdosc-ai-dialog__preview-title{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px}
    .appdosc-ai-dialog__preview-text{font-size:12px;white-space:pre-wrap;line-height:1.45;color:#1f2937}
    @keyframes appdoscAttachmentIn{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
    .appdosc-ai-dialog__advanced{border:1px solid rgba(148,163,184,.24);border-radius:11px;background:rgba(255,255,255,.74)}
    .appdosc-ai-dialog__advanced > summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;font-size:12px;color:#334155;font-weight:600}
    .appdosc-ai-dialog__advanced > summary::-webkit-details-marker{display:none}
    .appdosc-ai-dialog__advanced-body{padding:0 8px 8px;display:flex;flex-direction:column;gap:6px}
    .appdosc-ai-dialog__buttons{display:flex;gap:6px}
    .appdosc-ai-dialog__btn{border:none;min-height:36px;padding:8px 11px;border-radius:11px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:600;cursor:pointer}
    .appdosc-ai-dialog__btn--ghost{background:rgba(148,163,184,.15);color:#0f172a}
    .appdosc-ai-dialog__btn:disabled{opacity:.55;cursor:not-allowed}
    .appdosc-ai-dialog__file-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .appdosc-ai-dialog__file-reveal{border:1px solid rgba(37,99,235,.28);background:rgba(239,246,255,.9);color:#1e3a8a;border-radius:10px;padding:6px 8px;font-size:11px;line-height:1.2}
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
    @media (max-width:560px){.appdosc-ai-dialog{padding:0}.appdosc-ai-dialog__panel{width:100%;height:100dvh;border-radius:0}.appdosc-ai-dialog__btn{flex:1;min-height:42px;font-size:14px}.appdosc-ai-dialog__attachments-grid{display:flex;overflow:auto;max-height:none;padding-bottom:2px}.appdosc-ai-dialog__attachment{min-width:255px;flex:0 0 auto}}
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
  const existingRef = window.__aiDialogInstance;
  if (existingRef && existingRef.isConnected) return;
  if (existingRef && !existingRef.isConnected) {
    window.__aiDialogInstance = null;
  }
  const existing = document.querySelector(DIALOG_ROOT_SELECTOR);
  if (existing) {
    window.__aiDialogInstance = existing;
    return;
  }

  const state = {
    destroyed: false,
    isSending: false,
    draggedAttachmentIndex: -1,
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
        <div><div class="appdosc-ai-dialog__title">Ответ с помощью ИИ</div><div class="appdosc-ai-dialog__subtitle">Компактный режим: только главное</div></div>
        <button type="button" class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-close>Закрыть</button>
      </div>
      <div class="appdosc-ai-dialog__messages" data-messages></div>
      <div class="appdosc-ai-dialog__composer">
        <textarea class="appdosc-ai-dialog__input" data-input placeholder="Коротко напишите задачу для ответа"></textarea>
        <details class="appdosc-ai-dialog__advanced" open>
          <summary><span>Файлы для контекста</span><span>▾</span></summary>
          <div class="appdosc-ai-dialog__advanced-body">
            <div class="appdosc-ai-dialog__attachments" data-attachments hidden></div>
          </div>
        </details>
        <div class="appdosc-ai-dialog__buttons">
          <button type="button" class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-auto-decision>Сгенерировать решение</button>
          <button type="button" class="appdosc-ai-dialog__btn" data-send>Отправить</button>
        </div>
      </div>
    </div>`;
  root.innerHTML += `
    <div class="appdosc-ai-dialog__preview-modal" data-preview-modal>
      <div class="appdosc-ai-dialog__preview-panel">
        <div class="appdosc-ai-dialog__preview-title" data-preview-title></div>
        <div class="appdosc-ai-dialog__preview-text" data-preview-text></div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end;">
          <button type="button" class="appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost" data-preview-close>Закрыть</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  window.__aiDialogInstance = root;

  const messages = root.querySelector('[data-messages]');
  const input = root.querySelector('[data-input]');
  const autoDecisionBtn = root.querySelector('[data-auto-decision]');
  const attachmentsNode = root.querySelector('[data-attachments]');
  const previewModal = root.querySelector('[data-preview-modal]');

  const appendBubble = (text, role) => {
    const bubble = document.createElement('div');
    bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  };
  const appendBubbleNode = (node, role) => {
    const bubble = document.createElement('div');
    bubble.className = `appdosc-ai-dialog__bubble appdosc-ai-dialog__bubble--${role}`;
    bubble.appendChild(node);
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  };
  const appendFileTextRevealMessage = (files) => {
    const wrap = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = `Файлы прочитаны: ${files.length}.`;
    wrap.appendChild(title);
    const actions = document.createElement('div');
    actions.className = 'appdosc-ai-dialog__file-actions';
    files.forEach((file) => {
      const text = String(file.text || '').trim();
      if (!text) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'appdosc-ai-dialog__file-reveal';
      btn.textContent = `Показать: ${String(file.name || 'файл').slice(0, 26)}`;
      btn.addEventListener('click', () => {
        appendBubble(`Содержимое «${file.name}»:\n${text}`, 'assistant');
      });
      actions.appendChild(btn);
    });
    if (actions.childElementCount) {
      wrap.appendChild(actions);
    }
    appendBubbleNode(wrap, 'assistant');
  };

  appendBubble('Добавляйте в контекст только важные файлы — так ответ ИИ будет точнее.', 'assistant');

  const formatFileSize = (size) => {
    const n = Number(size) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  };
  const getFileTypeLabel = (file) => {
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    if (name.endsWith('.pdf') || type.includes('pdf')) return { icon: '📄', label: 'PDF' };
    if (name.endsWith('.docx') || type.includes('wordprocessingml') || type.includes('docx')) return { icon: '📝', label: 'DOCX' };
    if (type.startsWith('image/') || /\.(png|jpg|jpeg|webp|heic)$/i.test(name)) return { icon: '🖼️', label: 'Изображение' };
    return { icon: '📃', label: 'Текст' };
  };
  const getFilePreviewHint = (file) => {
    const text = String(file.text || file.preview || '').trim();
    if (text) return text.slice(0, 200);
    return 'Нажмите «Добавить в контекст», чтобы прочитать файл.';
  };
  const getContextCharCount = () => {
    const list = Array.isArray(context.extractedTexts) ? context.extractedTexts : [];
    return list.reduce((sum, item) => sum + String((item && item.text) || '').length, 0);
  };

  const previewFile = (file) => {
    if (!previewModal) return;
    previewModal.querySelector('[data-preview-title]').textContent = `Просмотр: ${file.name || 'Файл'}`;
    previewModal.querySelector('[data-preview-text]').textContent = String(file.text || file.preview || 'Файл ещё не прочитан.');
    previewModal.classList.add('is-open');
  };
  const previewFileContent = (file) => previewFile(file);
  if (previewModal) {
    previewModal.addEventListener('click', (event) => {
      if (event.target === previewModal || event.target.closest('[data-preview-close]')) {
        previewModal.classList.remove('is-open');
      }
    });
  }

  const reorderFiles = (draggedIndex, targetIndex) => {
    if (!Array.isArray(state.attachedFiles)) return;
    if (draggedIndex === targetIndex || draggedIndex < 0 || targetIndex < 0) return;
    const next = state.attachedFiles.slice();
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    state.attachedFiles = next;
    renderAttachments();
  };

  const handleAddToContext = async (file) => {
    try {
      const raw = await fetchExternalFileContent(file);
      const text = String(raw || '').trim();
      if (!text) throw new Error('Пустой текст');
      file.text = text.slice(0, MAX_AUTO_CONTEXT_TEXT_CHARS);
      file.extracted = true;
      file.extractError = '';
      file.preview = file.text.slice(0, 200);
      state.selectedAttachmentIds.add(file.id);
      context.extractedTexts = state.attachedFiles
        .filter((item) => state.selectedAttachmentIds.has(item.id) && item.extracted && item.text)
        .map((item) => ({ name: item.name, type: item.type || 'text/plain', text: item.text }));
      appendFileTextRevealMessage([file]);
    } catch (error) {
      file.extractError = error && error.message ? error.message : 'Ошибка чтения';
      file.extracted = false;
    }
    renderAttachments();
  };

  const handleBatchAdd = async () => {
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
          file.preview = file.text.slice(0, 200);
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
    context.extractedTexts = extractedForContext.map((file) => ({ name: file.name, type: file.type || 'text/plain', text: file.text }));
    if (extractedForContext.length) {
      appendFileTextRevealMessage(extractedForContext);
      runAutoDecision();
    } else {
      appendBubble('Не удалось добавить выбранные файлы в контекст.', 'assistant');
    }
    renderAttachments();
  };

  const renderAttachments = () => {
    if (!attachmentsNode) return;
    attachmentsNode.innerHTML = '';
    if (!state.attachedFiles.length) {
      attachmentsNode.hidden = true;
      return;
    }
    attachmentsNode.hidden = false;
    const selectedCount = state.attachedFiles.filter((file) => state.selectedAttachmentIds.has(file.id)).length;
    const readyCount = state.attachedFiles.filter((file) => file.extracted).length;
    const contextChars = getContextCharCount();
    const progress = Math.min(100, Math.round((contextChars / MAX_AUTO_CONTEXT_TEXT_CHARS) * 100));
    const header = document.createElement('div');
    header.className = 'appdosc-ai-dialog__attachments-header';
    const allSelected = selectedCount > 0 && selectedCount === state.attachedFiles.length;
    header.innerHTML = `
      <div class="appdosc-ai-dialog__attachments-headline">
        <div>
          <div class="appdosc-ai-dialog__attachments-title">Файлы: выбрано ${selectedCount} из ${state.attachedFiles.length}</div>
          <div class="appdosc-ai-dialog__attachments-hint">Добавляйте только важные документы: письмо, договор, ТЗ.</div>
        </div>
        <label class="appdosc-ai-dialog__attachments-select-all">
          <input type="checkbox" ${allSelected ? 'checked' : ''} data-select-all>
          Выбрать всё
        </label>
      </div>
      <div class="appdosc-ai-dialog__context-stats">В контексте: ${readyCount} файла(ов) (~${Math.round(contextChars / 1000)}K символов)</div>
      <div class="appdosc-ai-dialog__context-progress"><span style="width:${progress}%"></span></div>
    `;
    attachmentsNode.appendChild(header);
    const selectAllCheckbox = header.querySelector('[data-select-all]');
    selectAllCheckbox.addEventListener('change', () => {
      if (selectAllCheckbox.checked) {
        state.attachedFiles.forEach((file) => state.selectedAttachmentIds.add(file.id));
      } else {
        state.selectedAttachmentIds.clear();
      }
      renderAttachments();
    });
    const grid = document.createElement('div');
    grid.className = 'appdosc-ai-dialog__attachments-grid';

    state.attachedFiles.forEach((file, index) => {
      const info = getFileTypeLabel(file);
      const chip = document.createElement('div');
      chip.className = 'appdosc-ai-dialog__attachment';
      chip.draggable = true;
      if (state.selectedAttachmentIds.has(file.id)) chip.classList.add('is-selected');
      if (file.extracted) chip.classList.add('is-ready');
      if (file.extractError) chip.classList.add('is-error');
      const status = file.extracted ? 'Добавлен в контекст' : (file.extractError ? 'Ошибка' : 'Не добавлен');
      const topNode = document.createElement('div');
      topNode.className = 'appdosc-ai-dialog__attachment-top';
      const iconNode = document.createElement('div');
      iconNode.className = 'appdosc-ai-dialog__attachment-icon';
      iconNode.textContent = info.icon;
      topNode.appendChild(iconNode);
      const titleWrap = document.createElement('div');
      const nameNode = document.createElement('span');
      nameNode.className = 'appdosc-ai-dialog__attachment-name';
      nameNode.textContent = file.name;
      const metaNode = document.createElement('div');
      metaNode.className = 'appdosc-ai-dialog__attachment-meta';
      const charsMeta = file.extracted ? `${String(file.text || '').length} симв.` : 'не прочитан';
      metaNode.textContent = `${info.label} · ${formatFileSize(file.size)} · ${charsMeta}`;
      titleWrap.appendChild(nameNode);
      titleWrap.appendChild(metaNode);
      topNode.appendChild(titleWrap);
      chip.appendChild(topNode);
      chip.title = getFilePreviewHint(file);
      const statusNode = document.createElement('span');
      statusNode.className = `appdosc-ai-dialog__attachment-status${file.extracted ? ' is-ready' : ''}${file.extractError ? ' is-error' : ''}`;
      statusNode.textContent = file.extracted ? '✅ Добавлен' : (file.extractError ? '⚠️ Ошибка' : '🟡 Не добавлен');
      chip.appendChild(statusNode);
      const actionsNode = document.createElement('div');
      actionsNode.className = 'appdosc-ai-dialog__attachment-actions';
      const checkLabel = document.createElement('label');
      checkLabel.className = 'appdosc-ai-dialog__attachments-select-all';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selectedAttachmentIds.has(file.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedAttachmentIds.add(file.id); else state.selectedAttachmentIds.delete(file.id);
        renderAttachments();
      });
      checkLabel.appendChild(checkbox);
      checkLabel.appendChild(document.createTextNode('В выборке'));
      const oneFileReadBtn = document.createElement('button');
      oneFileReadBtn.type = 'button';
      oneFileReadBtn.className = 'appdosc-ai-dialog__attachment-btn appdosc-ai-dialog__attachment-btn--add';
      oneFileReadBtn.textContent = file.extracted ? '⊕ Обновить' : '⊕ Добавить в контекст';
      oneFileReadBtn.addEventListener('click', () => handleAddToContext(file));
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'appdosc-ai-dialog__attachment-btn';
      previewBtn.textContent = '👁 Просмотр';
      previewBtn.addEventListener('click', () => previewFileContent(file));
      actionsNode.appendChild(checkLabel);
      actionsNode.appendChild(oneFileReadBtn);
      actionsNode.appendChild(previewBtn);
      if (file.extractError) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'appdosc-ai-dialog__attachment-btn appdosc-ai-dialog__attachment-btn--danger';
        retryBtn.textContent = 'Повторить';
        retryBtn.addEventListener('click', () => handleAddToContext(file));
        actionsNode.appendChild(retryBtn);
      }
      chip.appendChild(actionsNode);
      if (file.extractError) {
        const errorNode = document.createElement('div');
        errorNode.className = 'appdosc-ai-dialog__attachment-error';
        errorNode.textContent = file.extractError;
        chip.appendChild(errorNode);
      }
      chip.addEventListener('dragstart', () => {
        state.draggedAttachmentIndex = index;
        chip.setAttribute('data-dragging', '1');
      });
      chip.addEventListener('dragend', () => {
        state.draggedAttachmentIndex = -1;
        chip.removeAttribute('data-dragging');
      });
      chip.addEventListener('dragover', (event) => event.preventDefault());
      chip.addEventListener('drop', () => reorderFiles(state.draggedAttachmentIndex, index));
      grid.appendChild(chip);
    });
    attachmentsNode.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'appdosc-ai-dialog__attachments-footer';
    const addSelectedBtn = document.createElement('button');
    addSelectedBtn.type = 'button';
    addSelectedBtn.className = 'appdosc-ai-dialog__btn';
    addSelectedBtn.disabled = !selectedCount;
    addSelectedBtn.textContent = `Добавить выбранные (${selectedCount})`;
    addSelectedBtn.addEventListener('click', handleBatchAdd);
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'appdosc-ai-dialog__btn appdosc-ai-dialog__btn--ghost';
    clearBtn.textContent = 'Очистить всё';
    clearBtn.addEventListener('click', () => {
      state.selectedAttachmentIds.clear();
      state.attachedFiles.forEach((file) => {
        file.extracted = false;
        file.text = '';
        file.preview = '';
        file.extractError = '';
      });
      context.extractedTexts = [];
      renderAttachments();
    });
    footer.appendChild(addSelectedBtn);
    footer.appendChild(clearBtn);
    attachmentsNode.appendChild(footer);
  };

  const cleanup = () => {
    state.destroyed = true;
    window.removeEventListener('keydown', onEscClose);
    if (window.__aiDialogInstance === root) window.__aiDialogInstance = null;
    if (root && root.isConnected) {
      root.remove();
    }
  };

  const onEscClose = (event) => {
    if (event.key !== 'Escape') return;
    cleanup();
  };

  const runAutoDecision = async () => {
    if (state.isSending) return;
    const hasSelectedFiles = state.selectedAttachmentIds instanceof Set && state.selectedAttachmentIds.size > 0;
    const hasFiles = Array.isArray(context.extractedTexts) && context.extractedTexts.length > 0;
    if (hasSelectedFiles && !hasFiles) {
      appendBubble('Ошибка: выбранные файлы ещё не прочитаны. Нажмите «Прочитать выбранные» и повторите.', 'assistant');
      notify('warning', 'Контекст из файлов не готов.');
      return;
    }
    const prompt = hasFiles
      ? 'Проанализируй выбранные файлы, учти историю переписки и настройки aiBehavior. Дай итоговое решение и краткий план действий. Не предлагай локальные решения, при недостатке данных сразу сообщи об ошибке.'
      : 'Учти историю переписки и настройки aiBehavior. Сформируй итоговое решение по задаче. Не предлагай локальные решения, при недостатке данных сразу сообщи об ошибке.';
    appendBubble('Авто-запрос: сформируй решение по задаче.', 'user');
    state.chatHistory.push({ role: 'user', text: prompt, ts: Date.now() });
    state.chatHistory = normalizeHistoryMessages(state.chatHistory);
    state.isSending = true;
    input.disabled = true;
    autoDecisionBtn.disabled = true;
    root.querySelector('[data-send]').disabled = true;
    try {
      const assistantReply = await requestAssistantWithFallback(prompt, state.chatHistory);
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
      assistantReply = await requestAssistantWithFallback(prompt, state.chatHistory);
    } catch (error) {
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

  const requestAssistantWithFallback = async (prompt, history) => {
    try {
      return await requestAssistantReply(prompt, { ...context, model: state.model }, history);
    } catch (error) {
      if (error && error.code === 'MODEL_NOT_ALLOWED' && Array.isArray(error.availableModels) && error.availableModels.length) {
        state.models = normalizeModelList(error.availableModels);
        state.model = state.models[0].value;
        notify('warning', `Текущая модель недоступна. Автоматически переключили на: ${state.model}.`);
        return requestAssistantReply(prompt, { ...context, model: state.model }, history);
      }
      throw error;
    }
  };

  fetchAvailableModels()
    .then((models) => {
      state.models = models;
      if (!models.some((entry) => entry.value === state.model)) state.model = models[0].value;
    })
    .catch(() => {});
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
  window.openDocumentsAiResponseModal = openAiResponseDialog;
}
