import { createPdfViewer } from './apppdf.js';

const API_URL = '/docs.php?action=mini_app_tasks';
const CLIENT_LOG_ENDPOINT = '/docs.php?action=mini_app_log';
const ENTRY_LOG_ENDPOINT = '/docs.php?action=mini_app_entry_log';
const PDF_LOG_ENDPOINT = '/docs.php?action=mini_app_pdf_log';
const PDF_UPLOAD_ENDPOINT = '/docs.php?action=mini_app_upload_pdf';
const OFFICE_LOG_ENDPOINT = '/frontworks_log.php';
const DOC_LOAD_LOG_ENDPOINT = '/docs.php?action=mini_app_doc_load_log';
const DOCS_AI_ENDPOINT = '/js/documents/api-docs.php';
const TELEGRAM_BRIEF_MODAL_STYLE_ID = 'appdosc-brief-ai-style-v2';

let aiDialogLoader = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureAiDialogScriptLoaded() {
  if (window && typeof window.openAiResponseDialog === 'function') {
    return Promise.resolve(window.openAiResponseDialog);
  }

  if (!aiDialogLoader) {
    aiDialogLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ai-dialog-script]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (typeof window.openAiResponseDialog === 'function') {
            resolve(window.openAiResponseDialog);
          } else {
            reject(new Error('Скрипт ИИ загружен, но функция не найдена.'));
          }
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('Не удалось загрузить скрипт ИИ.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = '/js/documents/app/telegram-ai-response-dialog.js?v=' + encodeURIComponent(String(window.__ASSET_VERSION__ || Date.now()));
      script.defer = true;
      script.dataset.aiDialogScript = 'true';
      script.onload = () => {
        if (typeof window.openAiResponseDialog === 'function') {
          resolve(window.openAiResponseDialog);
        } else {
          reject(new Error('Скрипт ИИ загружен, но функция не найдена.'));
        }
      };
      script.onerror = () => reject(new Error('Не удалось загрузить скрипт ИИ.'));
      document.head.appendChild(script);
    }).catch((error) => {
      aiDialogLoader = null;
      throw error;
    });
  }

  return aiDialogLoader;
}

async function openAiDialogSafely(context = {}) {
  const reportDependencyLoad = (payload = {}) => {
    const stage = normalizeValue(payload && payload.stage) || '';
    if (!stage) {
      return;
    }
    if (stage !== 'local_failed' && stage !== 'cdn_failed' && stage !== 'all_sources_failed') {
      return;
    }
    logClientEvent('task_view_error', {
      reason: stage,
      dependency: normalizeValue(payload && payload.title),
      source: normalizeValue(payload && payload.source),
      sourceType: normalizeValue(payload && payload.sourceType),
      details: normalizeValue(payload && payload.reason),
      taskId: normalizeValue(context && context.task && context.task.id),
    });
  };

  try {
    const openDialog = await ensureAiDialogScriptLoaded();
    openDialog({
      ...context,
      onDependencyLoad(payload) {
        reportDependencyLoad(payload);
        if (typeof context.onDependencyLoad === 'function') {
          context.onDependencyLoad(payload);
        }
      },
    });
  } catch (error) {
    if (typeof context.onStatus === 'function') {
      context.onStatus('error', 'Не удалось открыть ИИ-диалог. Обновите страницу.');
    }
    logClientEvent('task_view_error', {
      reason: 'ai_dialog_open_failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function ensureTelegramBriefModalStyle() {
  if (document.getElementById(TELEGRAM_BRIEF_MODAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TELEGRAM_BRIEF_MODAL_STYLE_ID;
  style.textContent = `
    .appdosc-brief-ai{position:fixed;inset:0;z-index:2800;background:rgba(15,23,42,.32);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;padding:8px}
    .appdosc-brief-ai__panel{width:min(980px,100%);max-height:calc(100dvh - 16px);display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.98),rgba(248,250,252,.94));border-radius:22px;border:1px solid rgba(255,255,255,.9);overflow:hidden;box-shadow:0 14px 38px rgba(15,23,42,.16)}
    .appdosc-brief-ai__header{display:flex;justify-content:space-between;gap:8px;padding:12px;border-bottom:1px solid rgba(226,232,240,.95)}
    .appdosc-brief-ai__title{font-size:16px;font-weight:700;color:#0f172a}
    .appdosc-brief-ai__sub{font-size:12px;color:#64748b}
    .appdosc-brief-ai__body{display:grid;grid-template-columns:minmax(210px,300px) minmax(0,1fr);gap:10px;padding:12px;min-height:0;flex:1}
    .appdosc-brief-ai__list{display:flex;flex-direction:column;gap:8px;overflow:auto}
    .appdosc-brief-ai__item{border:1px solid rgba(203,213,225,.92);background:rgba(255,255,255,.82);backdrop-filter:blur(8px);border-radius:14px;padding:11px;text-align:left;opacity:1}
    .appdosc-brief-ai__item span{display:block;word-break:break-word;overflow-wrap:anywhere}
    .appdosc-brief-ai__item strong{font-size:13px;color:#0f172a}
    .appdosc-brief-ai__item small{font-size:11px;color:#64748b}
    .appdosc-brief-ai__item.is-active{border-color:rgba(59,130,246,.6);background:rgba(239,246,255,.9)}
    .appdosc-brief-ai__preview{margin:0;border:1px solid rgba(203,213,225,.92);border-radius:16px;background:rgba(255,255,255,.86);padding:12px;overflow:auto;font-size:13px;line-height:1.58;color:#0f172a;opacity:1;font-weight:500}
    .appdosc-brief-ai__placeholder{margin:0;color:#64748b;white-space:pre-wrap}
    .appdosc-brief-ai__section{border:1px solid rgba(226,232,240,.95);background:rgba(255,255,255,.88);border-radius:14px;padding:10px 11px}
    .appdosc-brief-ai__section + .appdosc-brief-ai__section{margin-top:8px}
    .appdosc-brief-ai__section h4{margin:0 0 6px 0;font-size:12px;color:#334155;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .appdosc-brief-ai__section p{margin:0;color:#0f172a;white-space:pre-wrap}
    .appdosc-brief-ai__section ul{margin:0;padding-left:18px;color:#0f172a}
    .appdosc-brief-ai__section li + li{margin-top:5px}
    @media (max-width:768px){.appdosc-brief-ai{padding:0}.appdosc-brief-ai__panel{max-height:100dvh;border-radius:0}.appdosc-brief-ai__body{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function requestTelegramOcrByUrl(fileUrl) {
  const formData = new FormData();
  formData.append('action', 'ocr_extract');
  formData.append('language', 'rus');
  formData.append('file_url', fileUrl);
  const response = await fetch(DOCS_AI_ENDPOINT, { method: 'POST', credentials: 'include', body: formData });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || 'OCR временно недоступен');
  }
  const text = payload && payload.text ? String(payload.text).trim() : '';
  if (!text) throw new Error('OCR не вернул текст');
  return text;
}

async function requestTelegramBriefAi(sourceLabel, text) {
  const normalizedText = String(text || '').trim();
  const fileOnlyPrompt = [
    'Режим: изолированный анализ только текста файла.',
    'Используй исключительно extractedTexts и никаких других данных.',
    'Запрещено учитывать карточку задачи, Telegram-данные, роли, имена из интерфейса и внешние догадки.',
    'Если факт не найден в тексте файла, явно пиши: "не указано в файле".',
    'Пиши просто и понятно для новичка.',
    'Нужен только структурированный результат по содержимому файла.'
  ].join(' ');
  const context = {
    extractedTexts: [{ name: sourceLabel, type: 'text/plain', text: normalizedText.slice(0, 12000) }],
    aiBehavior: fileOnlyPrompt,
    isolatedFileMode: true
  };
  const formData = new FormData();
  formData.append('action', 'ai_response_analyze');
  formData.append('documentTitle', 'Файл для изолированного анализа');
  formData.append('prompt', `${fileOnlyPrompt} Верни: analysis, risks, required_actions, requirements.`);
  formData.append('responseStyle', 'concise');
  formData.append('context', JSON.stringify(context));
  const response = await fetch(DOCS_AI_ENDPOINT, { method: 'POST', credentials: 'include', body: formData });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || 'ИИ временно недоступен');
  }
  return payload;
}

function extractPartyByLabel(text, labelVariants) {
  const safeText = String(text || '');
  if (!safeText) return '';
  const escapedLabels = labelVariants
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escapedLabels.length) return '';
  const pattern = new RegExp(`(?:${escapedLabels.join('|')})\\s*[:\\-]\\s*([^\\n\\r;]+)`, 'i');
  const match = safeText.match(pattern);
  return match && match[1] ? String(match[1]).trim() : '';
}

function buildTelegramBriefSections(payload, sourceText) {
  const analysis = payload && payload.analysis ? String(payload.analysis).trim() : '';
  const block = payload && payload.decisionBlock && typeof payload.decisionBlock === 'object' ? payload.decisionBlock : {};
  const actions = Array.isArray(block.required_actions)
    ? block.required_actions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  const requirements = Array.isArray(block.requirements)
    ? block.requirements.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  const sender = extractPartyByLabel(sourceText, ['отправитель', 'sender', 'from']);
  const recipient = extractPartyByLabel(sourceText, ['получатель', 'адресат', 'recipient', 'to']);
  const participants = `Отправитель: ${sender || 'не указано в файле'}; Получатель: ${recipient || 'не указано в файле'}`;
  return {
    analysis: analysis || 'Суть документа не указана в файле.',
    participants,
    actions,
    requirements,
  };
}

function renderTelegramBriefPreview(container, payload, sourceText) {
  const sections = buildTelegramBriefSections(payload, sourceText);
  const detailsHtml = sections.actions.length
    ? `<ul>${sections.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>Ключевые детали не указаны в файле.</p>';
  const stepsHtml = sections.requirements.length
    ? `<ul>${sections.requirements.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>Следующие шаги не указаны в файле.</p>';

  container.innerHTML = `
    <section class="appdosc-brief-ai__section">
      <h4>О чем файл</h4>
      <p>${escapeHtml(sections.analysis)}</p>
    </section>
    <section class="appdosc-brief-ai__section">
      <h4>Отправитель и получатель</h4>
      <p>${escapeHtml(sections.participants)}</p>
    </section>
    <section class="appdosc-brief-ai__section">
      <h4>Важные детали из файла</h4>
      ${detailsHtml}
    </section>
    <section class="appdosc-brief-ai__section">
      <h4>Что сделать дальше</h4>
      ${stepsHtml}
    </section>
  `;
}

function openTelegramBriefModal(task, statusHandler) {
  ensureTelegramBriefModalStyle();
  const modal = document.createElement('div');
  modal.className = 'appdosc-brief-ai';
  modal.innerHTML = `
    <div class="appdosc-brief-ai__panel">
      <div class="appdosc-brief-ai__header">
        <div><div class="appdosc-brief-ai__title">Кратко ИИ</div><div class="appdosc-brief-ai__sub">Выберите источник для анализа</div></div>
        <button type="button" class="appdosc-card__action" data-close>Закрыть</button>
      </div>
      <div class="appdosc-brief-ai__body">
        <div class="appdosc-brief-ai__list" data-list></div>
        <div class="appdosc-brief-ai__preview" data-preview>
          <p class="appdosc-brief-ai__placeholder">Выберите файл слева — покажу краткий изолированный разбор только по его тексту.</p>
        </div>
      </div>
    </div>`;
  const list = modal.querySelector('[data-list]');
  const preview = modal.querySelector('[data-preview]');
  const sources = [];
  (Array.isArray(task && task.files) ? task.files : []).forEach((file, index) => {
    const name = getAttachmentName(file, index + 1);
    const url = resolveFileFetchUrl(file);
    if (url) sources.push({ label: name, url, type: 'file' });
  });

  const activate = (button) => Array.from(list.querySelectorAll('.appdosc-brief-ai__item')).forEach((el) => el.classList.toggle('is-active', el === button));
  const close = () => modal.remove();
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelector('[data-close]').addEventListener('click', close);

  sources.forEach((source) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc-brief-ai__item';
    button.innerHTML = `<span><strong>${source.label}</strong></span><span><small>Вложение</small></span>`;
    button.addEventListener('click', async () => {
      activate(button);
      try {
        preview.innerHTML = '<p class="appdosc-brief-ai__placeholder">⏳ Подготовка текста файла...</p>';
        const sourceText = source.text || await requestTelegramOcrByUrl(source.url);
        preview.innerHTML = '<p class="appdosc-brief-ai__placeholder">⏳ Анализ только по тексту файла...</p>';
        const aiPayload = await requestTelegramBriefAi(source.label, sourceText);
        renderTelegramBriefPreview(preview, aiPayload, sourceText);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'неизвестная ошибка';
        preview.innerHTML = `<p class="appdosc-brief-ai__placeholder">ИИ временно недоступен. Попробуйте позже.\n\nДетали: ${escapeHtml(message)}</p>`;
        if (typeof statusHandler === 'function') statusHandler('warning', `ИИ временно недоступен. Детали: ${message}`);
      }
    });
    list.appendChild(button);
  });
  if (!sources.length) {
    list.innerHTML = '<div class="appdosc-empty">Нет файлов для анализа.</div>';
  }
  document.body.appendChild(modal);
}

const ALLOWED_LOG_EVENTS = new Set([
  'bootstrap_after_init_telegram',
  'bootstrap_elements_ready',
  'bootstrap_events_bound',
  'bootstrap_start',
  'init',
  'init_no_webapp',
  'ios_stage',
  'render_error',
  'render_success',
  'runtime_error',
  'runtime_unhandled_rejection',
  'task_view_fetch_error',
  'task_view_fetch_start',
  'task_view_fetch_success',
  'task_view_inline_error',
  'task_view_inline_start',
  'task_view_inline_success',
  'task_view_inline_attempt',
  'task_view_inline_mode',
  'task_view_inline_unavailable',
  'task_view_inline_viewer_ready',
  'task_view_inline_viewer_missing',
  'task_view_files_resolved',
  'task_view_files_empty',
  'task_view_open_start',
  'task_view_open_failed',
  'task_view_inline_headers',
  'task_view_pdf_diagnostics',
  'task_view_resolve',
  'task_assign_error',
  'task_assign_request',
  'task_assign_success',
  'task_assign_remove_request',
  'task_assign_remove_success',
  'task_assign_remove_error',
  'task_complete_error',
  'task_complete_request',
  'task_complete_success',
  'task_update_error',
  'task_update_request',
  'task_update_request_debug',
  'task_update_response',
  'task_update_response_debug',
  'task_subordinate_assign_request',
  'task_subordinate_assign_success',
  'task_subordinate_assign_error',
  'task_subordinate_remove_request',
  'task_subordinate_remove_success',
  'task_subordinate_remove_error',
  'task_status_request',
  'task_status_success',
  'task_status_error',
  'task_due_update_request',
  'task_due_update_success',
  'task_due_update_error',
  'task_view_click',
  'task_view_error',
  'task_view_open',
  'tasks_load_error',
  'tasks_load_start',
  'tasks_loaded',
  'tasks_payload_invalid_items',
  'tasks_payload_received',
  'tasks_payload_empty_after_normalization',
  'director_mode_enabled',
  'task_assign_debug',
]);
const ASSIGNMENT_LOG_EVENTS = new Set([
  'task_assign_request',
  'task_assign_success',
  'task_assign_error',
  'task_assign_remove_request',
  'task_assign_remove_success',
  'task_assign_remove_error',
  'task_view_click',
  'task_view_open',
  'task_assign_debug',
]);
const DOWNLOAD_LOG_EVENTS = new Set([
  'viewer_download_click',
  'viewer_download_success',
  'viewer_download_error',
]);

const STATUS_OPTIONS = ['Распределено', 'Принято в работу', 'На проверке', 'Выполнено', 'Отменено'];

const STATUS_FILTER_PREFIX = 'status:';
const RESPONSIBLE_FILTER_PREFIX = 'responsible:';
const SUBORDINATE_FILTER_PREFIX = 'subordinate:';
const VIEWER_LOG_PREFIX = 'Просмотр';
const VIEWER_LOG_PREFIX_DEEP = 'Просмотр2';
const CONSOLE_LOG_PREFIX = 'Console';
const PDF_DIAGNOSTIC_EVENT = 'appdosc:pdf-log';
const PDF_DIAGNOSTIC_THROTTLE_MS = 1200;
const PDF_LOG_THROTTLE_MS = 350;
const BULK_ASSIGN_FEEDBACK_TIMEOUT_MS = 2400;
const TELEGRAM_MISSING_MESSAGE = 'У пользователя нет ID Telegram. Обратитесь к администратору.';
const RESPONSIBLE_PANEL_TITLE = 'Назначенные задачи по ответственным';
const SUBORDINATE_PANEL_TITLE = 'Назначенные задачи на подчинённых';
const INSTRUCTION_OPTIONS = ['В работу', 'Для информации', 'Для участия', 'Пояснить', 'Предоставить объяснение', 'Предоставить информацию'];
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff', 'ico', 'jfif', 'jxl']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp', 'ogv', 'mpeg', 'mpg']);
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods']);
const MINI_APP_PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const MINI_APP_PDF_FONTKIT_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
const MINI_APP_PDF_FONT_REGULAR_URL = '/shrift/Roboto-Regular.ttf';
const MINI_APP_PDF_FONT_BOLD_URL = '/shrift/RobotoFlex.ttf';
const TELEGRAM_DESKTOP_PLATFORMS = ['tdesktop', 'desktop', 'macos', 'windows', 'linux'];
const ENTRY_STATUS_EXCLUSIONS = new Set(['distributed', 'accepted', 'done', 'cancelled']);
const ENTRY_STATUS_LABEL_EXCLUSIONS = new Set(['распределено', 'в работе', 'отменено', 'выполнено', 'просрочено']);

const STATUS_SUMMARY_CONFIG = {
  distributed: {
    label: 'Распределено',
    display: 'распределено',
    filter: `${STATUS_FILTER_PREFIX}distributed`,
  },
  accepted: {
    label: 'Принято в работу',
    display: 'принято в работу',
    filter: `${STATUS_FILTER_PREFIX}accepted`,
  },
  review: {
    label: 'На проверке',
    display: 'на проверке',
    filter: `${STATUS_FILTER_PREFIX}review`,
  },
  done: {
    label: 'Выполнено',
    display: 'выполнено',
    filter: `${STATUS_FILTER_PREFIX}done`,
  },
  cancelled: {
    label: 'Отменено',
    display: 'отменено',
    filter: `${STATUS_FILTER_PREFIX}cancelled`,
  },
};

const STATUS_KEY_SYNONYMS = {
  distributed: ['распределено', 'распределен', 'распределена', 'распределены'],
  accepted: ['принято в работу', 'в работе', 'принято вработу', 'принято в работ'],
  review: ['на проверке', 'на контроле', 'на проверку'],
  done: ['выполнено', 'завершено'],
  cancelled: ['отменено'],
};

const STATUS_LABEL_TO_KEY = (() => {
  const map = {};
  Object.entries(STATUS_SUMMARY_CONFIG).forEach(([key, config]) => {
    const normalized = normalizeName(config.label);
    if (normalized) {
      map[normalized] = key;
    }
  });
  Object.entries(STATUS_KEY_SYNONYMS).forEach(([key, synonyms]) => {
    synonyms.forEach((name) => {
      const normalized = normalizeName(name);
      if (normalized) {
        map[normalized] = key;
      }
    });
  });
  return map;
})();

const STATUS_FILTERS = Object.values(STATUS_SUMMARY_CONFIG).map((config) => config.filter);

const DIRECTOR_LOG_TASK_LIMIT = 15;
const SUMMARY_FILE_LABEL = 'Общее';
const SUMMARY_FILE_PDF_NAME = 'Общее.pdf';

let pdfLogThrottleAt = 0;
let lastTasksLoadAt = 0;
const MIN_RELOAD_INTERVAL_MS = 30000;
let loadTasksAbortController = null;
let renderThrottleTimer = null;
const RENDER_THROTTLE_MS = 100;
let lastRenderedTasksSignature = '';

function getPdfLogPlatformDetails() {
  return {
    telegramPlatform: (state && state.telegram && state.telegram.platform) || runtimeEnvironment.webAppPlatform || '',
    navigatorPlatform: runtimeEnvironment.platform || '',
    webAppPlatform: runtimeEnvironment.webAppPlatform || '',
  };
}

function sendPdfLogEntry(prefix, step, details) {
  return false;
}

function sendConsoleLogEntry(step, details) {
  return false;
}

function sendOfficeViewerLog(step, details = {}) {
  return false;
}

function isTelegramDesktopPlatform() {
  const platform = String(
    (state && state.telegram && state.telegram.platform)
      || runtimeEnvironment.webAppPlatform
      || runtimeEnvironment.platform
      || '',
  ).toLowerCase();

  return TELEGRAM_DESKTOP_PLATFORMS.some((value) => platform.includes(value));
}

async function uploadPdfPreview(blob, fileName) {
  if (!blob || typeof fetch !== 'function' || typeof FormData === 'undefined') {
    return '';
  }

  try {
    const formData = new FormData();
    formData.append('pdf', blob, fileName || 'document.pdf');
    formData.append('telegramId', (state && state.telegram && state.telegram.id) ? String(state.telegram.id) : '');

    const initData = window && window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : '';
    if (typeof initData === 'string' && initData.trim() !== '') {
      formData.append('initData', initData);
    }

    const response = await fetch(PDF_UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      logViewerDebug('pdf:upload_failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return '';
    }

    const payload = await response.json();
    const url = payload && payload.success && payload.url ? String(payload.url) : '';
    if (!url) {
      logViewerDebug('pdf:upload_missing_url', payload);
      return '';
    }

    return toAbsoluteUrl(url);
  } catch (error) {
    logViewerDebug('pdf:upload_error', error && error.message ? error.message : String(error));
  }

  return '';
}

function logViewFlow(step, details) {
  sendPdfLogEntry(VIEWER_LOG_PREFIX, step, details);
}

function logViewFlowDeep(step, details) {
  sendPdfLogEntry(VIEWER_LOG_PREFIX_DEEP, step, details);
}

function logResponsibleDebug() {}
function logDirectorDebug() {}
function logSubordinateDebug() {}
function logViewerDebug(event, ...details) {
  const payload = details.length <= 1 ? details[0] : details;
  logViewFlow(event, payload);
}

function logViewerDebugDeep(event, ...details) {
  const payload = details.length <= 1 ? details[0] : details;
  logViewFlowDeep(event, payload);
}

function logDownloadConsole(step, details = {}) {
  if (typeof console === 'undefined' || !console || typeof console.log !== 'function') {
    return;
  }
  console.log(`[appdosc download] ${step}`, details);
}

function logViewerModeDecision(mode, reason, details = {}) {
  const payload = {
    mode: mode || '',
    reason: reason || '',
    ...details,
  };
  logViewFlow('mode:selected', payload);
  logViewerDebugDeep('mode:selected', payload);
}

let pdfDiagnosticThrottleAt = 0;

function attachPdfDiagnostics() {
  // Отключено: обработчики logClientEvent и logViewerDebug деактивированы
}

function collectResponseHeaders(response) {
  if (!response || !response.headers || typeof response.headers.get !== 'function') {
    return {};
  }

  const names = [
    'content-type',
    'content-length',
    'content-disposition',
    'cache-control',
    'pragma',
    'expires',
    'accept-ranges',
    'content-range',
    'x-frame-options',
    'content-security-policy',
    'x-content-type-options',
  ];
  const result = {};
  names.forEach((name) => {
    const value = response.headers.get(name);
    if (value) {
      result[name] = value;
    }
  });
  return result;
}

function createEmptyStatusCounters() {
  return {
    distributed: 0,
    accepted: 0,
    review: 0,
    done: 0,
    cancelled: 0,
  };
}

function resolveEntryTelegramId(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  return normalizeValue(entry.telegram || entry.chatId);
}

const runtimeEnvironment = (() => {
  if (typeof navigator === 'undefined') {
    return {
      userAgent: '',
      platform: '',
      webAppPlatform: '',
      maxTouchPoints: 0,
      isIos: false,
      forceFetchLogging: false,
    };
  }

  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const platform = typeof navigator.platform === 'string' ? navigator.platform : '';
  const maxTouchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  const isIosByUserAgent = /iPad|iPhone|iPod/i.test(userAgent);
  const isTouchMac = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;

  return {
    userAgent,
    platform,
    webAppPlatform: '',
    maxTouchPoints,
    isIos: isIosByUserAgent || isTouchMac,
    forceFetchLogging: false,
  };
})();

const iosDiagnostics = {
  enabled: runtimeEnvironment.isIos,
};

let sharedState = null;
const viewerTabsState = {
  files: [],
  buttons: [],
  activeIndex: 0,
  taskId: null,
  task: null,
  activeFile: null,
};

const docLoadTracker = {
  startTime: 0,
  stepTimings: [],
  fileName: '',
  fileType: '',
  timerInterval: null,
};

function docLoadStart(fileName, fileType) {
  docLoadTracker.startTime = performance.now();
  docLoadTracker.stepTimings = [];
  docLoadTracker.fileName = fileName || '';
  docLoadTracker.fileType = fileType || '';
}

function docLoadStep(label) {
  if (!docLoadTracker.startTime) return;
  docLoadTracker.stepTimings.push({
    label,
    ms: Math.round(performance.now() - docLoadTracker.startTime),
  });
}

function docLoadFinish(error) {
  if (!docLoadTracker.startTime) return;
  const totalMs = Math.round(performance.now() - docLoadTracker.startTime);
  docLoadStep(error ? 'ошибка' : 'готово');
  sendDocLoadLog({
    event: error ? 'load_error' : 'load_complete',
    fileName: docLoadTracker.fileName,
    fileType: docLoadTracker.fileType,
    timings: docLoadTracker.stepTimings,
    totalMs,
    error: error ? (error.message || String(error)) : undefined,
    telegramId: (state && state.telegram && state.telegram.id) ? String(state.telegram.id) : '',
    platform: runtimeEnvironment.webAppPlatform || runtimeEnvironment.platform || '',
  });
  docLoadTracker.startTime = 0;
}

function sendDocLoadLog(payload) {
  if (!payload || typeof fetch !== 'function') return;
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(DOC_LOAD_LOG_ENDPOINT, blob)) return;
    }
    fetch(DOC_LOAD_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  } catch (_) { /* ignore */ }
}

function showViewerLoader(fileName) {
  const loader = document.querySelector('[data-viewer-loader]');
  if (!loader) return;
  const titleEl = loader.querySelector('[data-viewer-loader-title]');
  const stepEl = loader.querySelector('[data-viewer-loader-step]');
  const barEl = loader.querySelector('[data-viewer-loader-bar]');
  const timeEl = loader.querySelector('[data-viewer-loader-time]');
  if (titleEl) titleEl.textContent = fileName ? `Загрузка: ${fileName}` : 'Загрузка документа';
  if (stepEl) stepEl.textContent = 'Подготовка…';
  if (barEl) barEl.style.width = '0%';
  if (timeEl) timeEl.textContent = '';
  loader.hidden = false;
  const start = performance.now();
  if (docLoadTracker.timerInterval) clearInterval(docLoadTracker.timerInterval);
  docLoadTracker.timerInterval = setInterval(() => {
    if (loader.hidden) { clearInterval(docLoadTracker.timerInterval); docLoadTracker.timerInterval = null; return; }
    const elapsed = Math.round((performance.now() - start) / 1000);
    if (timeEl) timeEl.textContent = elapsed > 0 ? `${elapsed} сек` : '';
  }, 500);
}

function updateViewerLoaderStep(step, progress) {
  const loader = document.querySelector('[data-viewer-loader]');
  if (!loader || loader.hidden) return;
  const stepEl = loader.querySelector('[data-viewer-loader-step]');
  const barEl = loader.querySelector('[data-viewer-loader-bar]');
  if (stepEl && step) stepEl.textContent = step;
  if (barEl && typeof progress === 'number') barEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function hideViewerLoader() {
  const loader = document.querySelector('[data-viewer-loader]');
  if (loader) loader.hidden = true;
  if (docLoadTracker.timerInterval) { clearInterval(docLoadTracker.timerInterval); docLoadTracker.timerInterval = null; }
}

function ensureIosDiagnosticsState(forceEnable = false) {
  if (forceEnable || runtimeEnvironment.isIos) {
    iosDiagnostics.enabled = true;
    runtimeEnvironment.forceFetchLogging = true;
  }
}

function updateEnvironmentFromPlatform(platform) {
  if (!platform || typeof platform !== 'string') {
    return;
  }

  runtimeEnvironment.webAppPlatform = platform;
  const normalized = platform.toLowerCase();
  if (normalized.includes('ios') || normalized.includes('iphone') || normalized.includes('ipad')) {
    runtimeEnvironment.isIos = true;
    ensureIosDiagnosticsState(true);
  }

  syncWebPlatformFlag();
}

function resolveWebPlatformFlag(platformValue) {
  if (!platformValue || typeof platformValue !== 'string') {
    return false;
  }

  const normalized = platformValue.toLowerCase();
  return normalized === 'web' || normalized.includes('web');
}

function getWebPlatformFlag() {
  if (sharedState && sharedState.telegram && sharedState.telegram.platform) {
    return resolveWebPlatformFlag(sharedState.telegram.platform);
  }

  return resolveWebPlatformFlag(runtimeEnvironment.webAppPlatform || '');
}

function isAndroidPlatform() {
  const platform = (sharedState && sharedState.telegram && sharedState.telegram.platform)
    || runtimeEnvironment.webAppPlatform
    || '';
  if (typeof platform === 'string' && platform.toLowerCase().includes('android')) {
    return true;
  }
  const userAgent = runtimeEnvironment.userAgent || '';
  return typeof userAgent === 'string' && userAgent.toLowerCase().includes('android');
}

let isWebPlatform = getWebPlatformFlag();

function syncWebPlatformFlag() {
  isWebPlatform = getWebPlatformFlag();
  if (typeof window !== 'undefined') {
    window.isWebPlatform = isWebPlatform;
  }
}

function updateIosDiagnosticsFromQuery() {
  if (typeof window === 'undefined') {
    ensureIosDiagnosticsState();
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get('ios_debug')
      || params.get('iosdiag')
      || params.get('debug_ios')
      || params.get('enable_ios_logs');

    if (debugParam !== null) {
      const normalized = String(debugParam).trim().toLowerCase();
      if (normalized === '' && runtimeEnvironment.isIos) {
        ensureIosDiagnosticsState(true);
      } else if (['1', 'true', 'yes', 'on', 'debug'].includes(normalized)) {
        ensureIosDiagnosticsState(true);
      }
    } else if (params.has('ioslogs')) {
      ensureIosDiagnosticsState(true);
    }
  } catch (error) {
    // ignore query parsing issues
  }

  ensureIosDiagnosticsState();
}

function annotateEventWithEnvironment(details) {
  if (!details || typeof details !== 'object') {
    return;
  }

  if (runtimeEnvironment.isIos && !Object.prototype.hasOwnProperty.call(details, 'isIos')) {
    details.isIos = true;
  }

  if (iosDiagnostics.enabled && !Object.prototype.hasOwnProperty.call(details, 'iosDiagnosticsEnabled')) {
    details.iosDiagnosticsEnabled = true;
  }

  if (
    iosDiagnostics.enabled
    && !Object.prototype.hasOwnProperty.call(details, 'webAppPlatform')
    && runtimeEnvironment.webAppPlatform
  ) {
    details.webAppPlatform = runtimeEnvironment.webAppPlatform;
  }
}

function shouldUseSendBeacon(keepalive) {
  if (!keepalive || runtimeEnvironment.forceFetchLogging) {
    return false;
  }
  if (sharedState?.telegram?.initData) {
    return false;
  }
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }
  return true;
}

ensureIosDiagnosticsState();
updateIosDiagnosticsFromQuery();
syncWebPlatformFlag();

function resolveSharedStateForLogging() {
  if (sharedState && typeof sharedState === 'object') {
    return sharedState;
  }
  try {
    if (typeof state !== 'undefined' && state && typeof state === 'object') {
      return state;
    }
  } catch (error) {
    // state может быть недоступен до инициализации
  }
  return null;
}

function sanitizeLogValue(value, depth = 0) {
  if (depth > 3) {
    return '[depth_limit]';
  }

  if (value === null) {
    return null;
  }

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value;
  }

  if (type === 'bigint') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value.toString();
  }

  if (type === 'undefined' || type === 'function' || type === 'symbol') {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length && index < 20; index += 1) {
      const sanitized = sanitizeLogValue(value[index], depth + 1);
      if (sanitized !== undefined) {
        items.push(sanitized);
      }
    }
    return items.length ? items : undefined;
  }

  if (type === 'object') {
    const result = {};
    Object.keys(value)
      .slice(0, 20)
      .forEach((key) => {
        const sanitized = sanitizeLogValue(value[key], depth + 1);
        if (sanitized !== undefined) {
          result[key] = sanitized;
        }
      });
    return Object.keys(result).length ? result : undefined;
  }

  return String(value);
}

function prepareLogDetails(details) {
  if (details instanceof Error) {
    const summary = {
      name: details.name,
      message: details.message,
    };
    if (typeof details.stack === 'string' && details.stack.trim() !== '') {
      summary.stack = details.stack.split('\n').slice(0, 5).join('\n');
    }
    return prepareLogDetails(summary);
  }

  const sanitized = sanitizeLogValue(details);
  if (sanitized === undefined) {
    return undefined;
  }

  if (Array.isArray(sanitized)) {
    return sanitized.length ? { items: sanitized } : undefined;
  }

  if (sanitized !== null && typeof sanitized === 'object') {
    return sanitized;
  }

  return { value: sanitized };
}

function attachConsoleCapture() {
  // Отключено: sendConsoleLogEntry деактивирована, обёртка console создаёт лишнюю нагрузку
}

function buildClientEventContext() {
  const currentState = resolveSharedStateForLogging();
  if (!currentState) {
    return null;
  }

  const context = {};
  const telegram = currentState.telegram || {};

  if (telegram.id) {
    context.telegramId = String(telegram.id);
  }
  if (telegram.chatId) {
    context.chatId = String(telegram.chatId);
  }
  if (telegram.username) {
    context.telegramUsername = String(telegram.username);
  }
  if (telegram.platform) {
    context.platform = String(telegram.platform);
  } else if (runtimeEnvironment.webAppPlatform) {
    context.platform = runtimeEnvironment.webAppPlatform;
  }
  if (telegram.initDataSummary) {
    context.initDataSummary = telegram.initDataSummary;
  }

  if (currentState.taskFilter !== undefined) {
    context.taskFilter = formatTaskFiltersForLog(currentState.taskFilter);
  }

  if (Array.isArray(currentState.tasks)) {
    context.tasks = currentState.tasks.length;
  }
  if (Array.isArray(currentState.visibleTasks)) {
    context.visibleTasks = currentState.visibleTasks.length;
  }

  if (currentState.stats && typeof currentState.stats === 'object') {
    ['total', 'active', 'completed', 'overdue'].forEach((key) => {
      if (typeof currentState.stats[key] === 'number') {
        context[`stats_${key}`] = currentState.stats[key];
      }
    });
  }

  if (Array.isArray(currentState.organizations) && currentState.organizations.length) {
    const names = [];
    for (let index = 0; index < currentState.organizations.length && names.length < 5; index += 1) {
      const entry = currentState.organizations[index];
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) {
          names.push(trimmed);
        }
        continue;
      }
      if (entry && typeof entry === 'object') {
        const candidate = entry.name || entry.title || entry.organization || entry.id || '';
        if (typeof candidate === 'string' && candidate.trim() !== '') {
          names.push(candidate.trim());
        }
      }
    }
    if (names.length) {
      context.organizations = names;
    }
  }

  if (typeof currentState.organizationsChecked === 'number') {
    context.organizationsChecked = currentState.organizationsChecked;
  }

  if (currentState.lastUpdated) {
    context.lastUpdated = String(currentState.lastUpdated);
  }

  if (runtimeEnvironment.userAgent && !context.userAgent) {
    context.userAgent = runtimeEnvironment.userAgent;
  }
  if (runtimeEnvironment.webAppPlatform && !context.webAppPlatform) {
    context.webAppPlatform = runtimeEnvironment.webAppPlatform;
  }

  return Object.keys(context).length ? context : null;
}

function logClientEvent(eventName, details, options) {
  return false;
}

function sendEntryTaskLog(eventName, details, options) {
  return false;
}

function sendDownloadLog(eventName, details, options) {
  const normalizedEvent = typeof eventName === 'string' ? eventName.trim() : '';
  if (normalizedEvent === '' || !DOWNLOAD_LOG_EVENTS.has(normalizedEvent)) {
    return false;
  }
  if (!isAndroidPlatform()) {
    return false;
  }

  const normalizedDetails = prepareLogDetails(details);
  if (normalizedDetails && typeof normalizedDetails === 'object' && !Array.isArray(normalizedDetails)) {
    annotateEventWithEnvironment(normalizedDetails);
  }

  const payload = {
    event: normalizedEvent,
    timestamp: new Date().toISOString(),
  };

  if (normalizedDetails !== undefined) {
    payload.details = normalizedDetails;
  }

  const context = buildClientEventContext();
  if (context) {
    payload.context = context;
  }
  payload.platform = 'android';

  const keepalive = options && typeof options === 'object' && Object.prototype.hasOwnProperty.call(options, 'keepalive')
    ? Boolean(options.keepalive)
    : true;

  try {
    const body = JSON.stringify(payload);
    if (!body) {
      return false;
    }

    if (shouldUseSendBeacon(keepalive)) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(CLIENT_LOG_ENDPOINT, blob);
      if (sent) {
        return true;
      }
    }

    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
    };

    if (keepalive) {
      requestOptions.keepalive = true;
    }

    fetch(CLIENT_LOG_ENDPOINT, requestOptions).catch(() => {});
    return true;
  } catch (error) {
    logViewFlow('sendDownloadLog:fail', error && error.message ? error.message : String(error));
    return false;
  }
}

function sendLogPayload(endpoint, payload, options = {}) {
  if (!endpoint || typeof fetch !== 'function') {
    return false;
  }

  const keepalive = Object.prototype.hasOwnProperty.call(options, 'keepalive')
    ? Boolean(options.keepalive)
    : true;

  try {
    const body = JSON.stringify(payload);
    if (!body) {
      return false;
    }

    if (shouldUseSendBeacon(keepalive)) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(endpoint, blob);
      if (sent) {
        return true;
      }
    }

    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
    };

    if (keepalive) {
      requestOptions.keepalive = true;
    }

    fetch(endpoint, requestOptions).catch(() => {});
    return true;
  } catch (error) {
    return false;
  }
}

function logEntryTaskEvent(step, details = {}) {
  const baseDetails = isPlainObject(details) ? { ...details } : { details };
  if (!baseDetails.entryTaskId) {
    baseDetails.entryTaskId = state.entryTaskId || '';
  }
  if (!baseDetails.startParam && state.telegram.startParam) {
    baseDetails.startParam = state.telegram.startParam;
  }
  sendEntryTaskLog(step, baseDetails);
}

function applyEntryTaskId(entryTaskId, source, startParam) {
  const normalized = normalizeValue(entryTaskId);
  if (!normalized) {
    return;
  }

  if (!state.entryTaskId) {
    state.entryTaskId = normalized;
  }

  if (startParam && !state.telegram.startParam) {
    state.telegram.startParam = String(startParam).trim();
  }

  if (!state.entryTaskLog || typeof state.entryTaskLog !== 'object') {
    state.entryTaskLog = { resolved: false, matched: false, expanded: false };
  }

  if (!state.entryTaskLog.resolved) {
    logEntryTaskEvent('entry_task_resolved', {
      source: source || 'unknown',
      entryTaskId: normalized,
      startParam: startParam ? String(startParam) : state.telegram.startParam || '',
    });
    state.entryTaskLog.resolved = true;
  }
}

function logAssignmentEvent(step, details = {}) {
  const payload = {
    step: typeof step === 'string' ? step : '',
    ...details,
  };
  logClientEvent('task_assign_debug', payload);
}

function buildErrorDetails(error) {
  const details = {};
  if (error instanceof Error) {
    details.message = error.message;
  } else {
    details.message = String(error);
  }

  if (error && typeof error === 'object') {
    if (Object.prototype.hasOwnProperty.call(error, 'status')) {
      details.status = error.status;
    }
    if (Object.prototype.hasOwnProperty.call(error, 'responseText')) {
      details.responseText = error.responseText;
    }
  }

  return details;
}

function hydrateTelegramFromInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    return;
  }

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch (error) {
    return;
  }

  const userPayload = params.get('user');
  if (userPayload) {
    try {
      const user = JSON.parse(userPayload);
      if (user && typeof user === 'object') {
        if (!state.telegram.id && user.id !== undefined && user.id !== null) {
          state.telegram.id = String(user.id);
        }
        if (!state.telegram.username && typeof user.username === 'string') {
          state.telegram.username = user.username;
        }
        if (!state.telegram.firstName && typeof user.first_name === 'string') {
          state.telegram.firstName = user.first_name;
        }
        if (!state.telegram.lastName && typeof user.last_name === 'string') {
          state.telegram.lastName = user.last_name;
        }
        if (!state.telegram.fullName) {
          const nameParts = [user.first_name, user.last_name]
            .map((part) => (typeof part === 'string' ? part.trim() : ''))
            .filter(Boolean);
          if (nameParts.length) {
            state.telegram.fullName = nameParts.join(' ');
          }
        }
        if (!state.telegram.languageCode && typeof user.language_code === 'string') {
          state.telegram.languageCode = user.language_code;
        }
      }
    } catch (error) {
      // ignore JSON parse issues
    }
  }

  const chatType = params.get('chat_type');
  if (!state.telegram.chatType && chatType) {
    state.telegram.chatType = chatType;
  }

  const chatPayload = params.get('chat');
  if (chatPayload) {
    try {
      const chat = JSON.parse(chatPayload);
      if (chat && typeof chat === 'object') {
        if (!state.telegram.chatId && chat.id !== undefined && chat.id !== null) {
          state.telegram.chatId = String(chat.id);
        }
        if (!state.telegram.chatType && typeof chat.type === 'string') {
          state.telegram.chatType = chat.type;
        }
      }
    } catch (error) {
      // ignore malformed chat payloads
    }
  }

  const chatInstance = params.get('chat_instance');
  if (!state.telegram.chatId && chatInstance) {
    state.telegram.chatId = chatInstance;
  }
}

const state = {
  telegram: {
    id: '',
    username: '',
    firstName: '',
    lastName: '',
    fullName: '',
    chatId: '',
    chatType: '',
    languageCode: '',
    platform: '',
    colorScheme: 'light',
    initData: '',
    initDataSummary: null,
    startParam: '',
  },
  stats: {
    total: 0,
    completed: 0,
    overdue: 0,
    active: 0,
    statuses: createEmptyStatusCounters(),
  },
  organizations: [],
  organizationsChecked: 0,
  tasks: [],
  visibleTasks: [],
  taskFilter: [],
  access: {
    responsibles: {},
    subordinates: {},
    directors: {},
    instruction: {},
  },
  permissions: { canManageInstructions: false, canManageSubordinates: false },
  lastUpdated: null,
  loading: false,
  error: '',
  selectedCardAnchor: '',
  expandedCards: new Set(),
  entryTaskId: '',
  entryTaskLog: {
    resolved: false,
    matched: false,
    expanded: false,
  },
  assets: {
    version: '',
    updatedAt: '',
  },
  director: {
    initialized: false,
    knownTaskKeys: new Set(),
    organizations: [],
    isActive: false,
    summaryExpanded: false,
    responsiblePanelExpanded: false,
    subordinatePanelExpanded: false,
    selectedResponsibleToken: '',
    selectedSubordinateToken: '',
    responsibles: [],
    subordinates: [],
    responsibleDirectory: new Map(),
    subordinateDirectory: new Map(),
    responsibleTaskMap: new Map(),
    visibilityRuleLogged: false,
    completedVisibilityLogged: false,
  },
};

sharedState = state;

const elements = {};
let pdfViewerInstance = null;

function ensureDirectorState() {
  if (!state.director || typeof state.director !== 'object') {
    state.director = {
      initialized: false,
      knownTaskKeys: new Set(),
      organizations: [],
      isActive: false,
      summaryExpanded: false,
      responsibles: [],
    };
  }
  if (!(state.director.knownTaskKeys instanceof Set)) {
    state.director.knownTaskKeys = new Set(
      Array.isArray(state.director.knownTaskKeys) ? state.director.knownTaskKeys : [],
    );
  }
  if (!Array.isArray(state.director.organizations)) {
    state.director.organizations = [];
  }
  if (!Array.isArray(state.director.responsibles)) {
    state.director.responsibles = [];
  }
  if (!Array.isArray(state.director.subordinates)) {
    state.director.subordinates = [];
  }
  if (typeof state.director.responsiblePanelExpanded !== 'boolean') {
    state.director.responsiblePanelExpanded = false;
  }
  if (typeof state.director.subordinatePanelExpanded !== 'boolean') {
    state.director.subordinatePanelExpanded = false;
  }
  if (typeof state.director.selectedResponsibleToken !== 'string') {
    state.director.selectedResponsibleToken = '';
  }
  if (typeof state.director.selectedSubordinateToken !== 'string') {
    state.director.selectedSubordinateToken = '';
  }
  if (!(state.director.responsibleDirectory instanceof Map)) {
    state.director.responsibleDirectory = new Map();
  }
  if (!(state.director.subordinateDirectory instanceof Map)) {
    state.director.subordinateDirectory = new Map();
  }
  if (!(state.director.responsibleTaskMap instanceof Map)) {
    state.director.responsibleTaskMap = new Map();
  }
  if (typeof state.director.initialized !== 'boolean') {
    state.director.initialized = false;
  }
  if (typeof state.director.summaryExpanded !== 'boolean') {
    state.director.summaryExpanded = false;
  }
  if (typeof state.director.isActive !== 'boolean') {
    state.director.isActive = false;
  }
  if (typeof state.director.visibilityRuleLogged !== 'boolean') {
    state.director.visibilityRuleLogged = false;
  }
  if (typeof state.director.completedVisibilityLogged !== 'boolean') {
    state.director.completedVisibilityLogged = false;
  }
  return state.director;
}

function readAssetVersionInfo() {
  if (typeof window === 'undefined') {
    return;
  }

  let version = '';
  let updatedAt = '';

  const info = window.__ASSET_VERSION_INFO__;
  if (info && typeof info === 'object') {
    if (info.version !== undefined && info.version !== null) {
      version = String(info.version).trim();
    }
    if (typeof info.updated_at === 'string' && info.updated_at.trim() !== '') {
      updatedAt = info.updated_at.trim();
    }
  }

  if (!version && window.__ASSET_VERSION__ !== undefined && window.__ASSET_VERSION__ !== null) {
    version = String(window.__ASSET_VERSION__).trim();
  }

  if (!updatedAt && typeof window.__ASSET_VERSION_UPDATED_AT__ === 'string') {
    const candidate = window.__ASSET_VERSION_UPDATED_AT__.trim();
    if (candidate) {
      updatedAt = candidate;
    }
  }

  state.assets.version = version;
  state.assets.updatedAt = updatedAt;
}

function summarizeTaskForLog(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const summary = {};
  if (task.id !== undefined && task.id !== null && String(task.id).trim() !== '') {
    summary.id = String(task.id).trim();
  }
  if (task.entryNumber !== undefined && task.entryNumber !== null) {
    summary.entryNumber = task.entryNumber;
  }
  const status = getTaskStatusValue(task);
  if (status) {
    summary.status = status;
  }
  if (typeof task.dueDate === 'string' && task.dueDate.trim() !== '') {
    summary.dueDate = task.dueDate.trim();
  }
  if (typeof task.organization === 'string' && task.organization.trim() !== '') {
    summary.organization = task.organization.trim();
  }
  if (typeof task.updatedAt === 'string' && task.updatedAt.trim() !== '') {
    summary.updatedAt = task.updatedAt.trim();
  }

  return Object.keys(summary).length ? summary : null;
}

function logIosStage() {
  // Диагностические логи для iOS отключены.
}

let globalErrorHandlersAttached = false;
const runtimeErrorState = {
  seen: new Set(),
  count: 0,
  limit: 10,
};

function shouldLogRuntimeError(key) {
  if (!key) {
    return false;
  }
  if (runtimeErrorState.count >= runtimeErrorState.limit) {
    return false;
  }
  if (runtimeErrorState.seen.has(key)) {
    return false;
  }
  runtimeErrorState.seen.add(key);
  runtimeErrorState.count += 1;
  return true;
}

function attachGlobalErrorHandlers() {
  globalErrorHandlersAttached = true;
}

function setClass(element, className, shouldHave) {
  if (!element || !element.classList) {
    return;
  }

  if (shouldHave) {
    element.classList.add(className);
  } else {
    element.classList.remove(className);
  }
}

function safeRenderImmediate(reason) {
  try {
    render();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.error = message;
    logClientEvent('render_error', {
      reason,
      message,
    }, { keepalive: false });
    return false;
  }
}

function safeRender(reason) {
  if (reason === 'bootstrap_initial' || reason === 'tasks_payload_update') {
    return safeRenderImmediate(reason);
  }
  if (renderThrottleTimer) {
    return true;
  }
  renderThrottleTimer = window.setTimeout(() => {
    renderThrottleTimer = null;
    safeRenderImmediate(reason);
  }, RENDER_THROTTLE_MS);
  return true;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getTaskCollectionLength(collection) {
  if (Array.isArray(collection)) {
    return collection.length;
  }
  if (isPlainObject(collection)) {
    return Object.keys(collection).length;
  }
  return 0;
}

function normalizeTasksCollection(collection) {
  if (Array.isArray(collection)) {
    return collection.slice();
  }
  if (isPlainObject(collection)) {
    return Object.values(collection);
  }
  return [];
}

function sanitizeTaskFiles(files) {
  if (!Array.isArray(files) || !files.length) {
    return [];
  }

  const sanitized = [];

  files.forEach((file) => {
    if (isPlainObject(file)) {
      const normalizedFile = { ...file };
      if (normalizedFile.url) {
        normalizedFile.url = String(normalizedFile.url);
      }
      if (normalizedFile.previewUrl) {
        normalizedFile.previewUrl = String(normalizedFile.previewUrl);
      }
      if (normalizedFile.previewPdf) {
        normalizedFile.previewPdf = String(normalizedFile.previewPdf);
      }
      if (normalizedFile.previewPdfUrl) {
        normalizedFile.previewPdfUrl = String(normalizedFile.previewPdfUrl);
      }
      if (normalizedFile.pdfUrl) {
        normalizedFile.pdfUrl = String(normalizedFile.pdfUrl);
      }
      if (normalizedFile.pdf) {
        normalizedFile.pdf = String(normalizedFile.pdf);
      }
      if (normalizedFile.originalName) {
        normalizedFile.originalName = String(normalizedFile.originalName);
      }
      if (normalizedFile.storedName) {
        normalizedFile.storedName = String(normalizedFile.storedName);
      }
      sanitized.push(normalizedFile);
      return;
    }

    const fallbackName = normalizeValue(file);
    if (fallbackName) {
      sanitized.push({ originalName: fallbackName });
    }
  });

  return sanitized;
}

function sanitizeTaskItem(task) {
  if (!isPlainObject(task)) {
    return {};
  }

  const sanitized = { ...task };
  sanitized.files = sanitizeTaskFiles(sanitized.files);

  return sanitized;
}

function toSafeInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : 0;
}

function sanitizeStatsForLog(stats) {
  if (!isPlainObject(stats)) {
    return null;
  }
  const result = {};
  ['total', 'completed', 'overdue', 'active'].forEach((key) => {
    const numeric = toSafeInteger(stats[key]);
    if (numeric !== null) {
      result[key] = numeric;
    }
  });
  if (isPlainObject(stats.statuses)) {
    const statuses = {};
    Object.keys(STATUS_SUMMARY_CONFIG).forEach((key) => {
      const numeric = toSafeInteger(stats.statuses[key]);
      if (numeric !== null) {
        statuses[key] = numeric;
      }
    });
    if (Object.keys(statuses).length) {
      result.statuses = statuses;
    }
  }
  return Object.keys(result).length ? result : null;
}

function hasStatsMismatch(payloadStats, computedStats) {
  if (!isPlainObject(payloadStats)) {
    return false;
  }
  if (!isPlainObject(computedStats)) {
    return false;
  }
  const baseMismatch = ['total', 'completed', 'overdue', 'active'].some((key) => {
    const numeric = toSafeInteger(payloadStats[key]);
    if (numeric === null) {
      return false;
    }
    return numeric !== computedStats[key];
  });
  if (baseMismatch) {
    return true;
  }
  if (!isPlainObject(payloadStats.statuses)) {
    return false;
  }
  const computedStatuses = isPlainObject(computedStats.statuses)
    ? computedStats.statuses
    : createEmptyStatusCounters();
  return Object.keys(STATUS_SUMMARY_CONFIG).some((key) => {
    const numeric = toSafeInteger(payloadStats.statuses[key]);
    if (numeric === null) {
      return false;
    }
    const reference = toSafeInteger(computedStatuses[key]);
    return reference === null ? numeric !== 0 : numeric !== reference;
  });
}

function mergeStats(payloadStats, computedStats) {
  const result = {
    total: computedStats?.total || 0,
    completed: computedStats?.completed || 0,
    overdue: computedStats?.overdue || 0,
    active: computedStats?.active || 0,
    statuses: createEmptyStatusCounters(),
  };

  if (isPlainObject(computedStats?.statuses)) {
    Object.keys(STATUS_SUMMARY_CONFIG).forEach((key) => {
      const numeric = toSafeInteger(computedStats.statuses[key]);
      if (numeric !== null) {
        result.statuses[key] = numeric;
      }
    });
  }

  if (!isPlainObject(payloadStats)) {
    return result;
  }

  const completed = toSafeInteger(payloadStats.completed);
  if (completed !== null) {
    result.completed = completed;
  }
  const overdue = toSafeInteger(payloadStats.overdue);
  if (overdue !== null) {
    result.overdue = overdue;
  }
  if (isPlainObject(payloadStats.statuses)) {
    Object.keys(STATUS_SUMMARY_CONFIG).forEach((key) => {
      const numeric = toSafeInteger(payloadStats.statuses[key]);
      if (numeric !== null) {
        result.statuses[key] = numeric;
      }
    });
  }

  return result;
}

const STATUS_CLASSES = {
  success: 'appdosc__status-message--success',
  error: 'appdosc__status-message--error',
  info: 'appdosc__status-message--info',
};

const TASK_FILTERS = ['all', 'overdue', ...STATUS_FILTERS];
const DEFAULT_TASK_FILTER = 'all';
const DEFAULT_PLACEHOLDER_MESSAGE = 'Задачи отсутствуют';
const FILTER_PLACEHOLDER_MESSAGE = 'Для выбранной категории задачи отсутствуют';

function normalizeTaskFilter(filter) {
  if (typeof filter !== 'string') {
    return DEFAULT_TASK_FILTER;
  }
  const normalized = filter.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_TASK_FILTER;
  }
  if (TASK_FILTERS.includes(normalized) || isStatusFilter(normalized) || isAssigneeFilter(normalized)) {
    return normalized;
  }
  return DEFAULT_TASK_FILTER;
}

function normalizeTaskFilters(filters) {
  const source = Array.isArray(filters) ? filters : [filters];
  const result = [];
  const seen = new Set();
  source.forEach((item) => {
    const normalized = normalizeTaskFilter(item);
    if (normalized === DEFAULT_TASK_FILTER) {
      return;
    }
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function formatTaskFiltersForLog(filters) {
  const normalized = normalizeTaskFilters(filters);
  return normalized.length ? normalized.join('|') : DEFAULT_TASK_FILTER;
}

function splitTaskFilters(filters) {
  const normalized = normalizeTaskFilters(filters);
  return {
    normalized,
    statusFilters: normalized.filter((filter) => isStatusFilter(filter)),
    overdue: normalized.includes('overdue'),
    assigneeFilters: normalized.filter((filter) => isAssigneeFilter(filter)),
  };
}

function hasAssigneeFilters(filters) {
  return splitTaskFilters(filters).assigneeFilters.length > 0;
}

function toggleStatusFilterSelection(currentFilters, filter) {
  const normalizedTarget = normalizeTaskFilter(filter);
  if (!normalizedTarget || normalizedTarget === DEFAULT_TASK_FILTER) {
    return normalizeTaskFilters(currentFilters);
  }
  const current = normalizeTaskFilters(currentFilters);
  if (current.includes(normalizedTarget)) {
    return current.filter((value) => value !== normalizedTarget);
  }
  return [...current, normalizedTarget];
}

function setAssigneeFilterSelection(currentFilters, targetFilter) {
  const normalizedTarget = normalizeTaskFilter(targetFilter);
  const current = normalizeTaskFilters(currentFilters);
  const withoutAssignees = current.filter((value) => !isAssigneeFilter(value));
  if (!normalizedTarget || normalizedTarget === DEFAULT_TASK_FILTER || !isAssigneeFilter(normalizedTarget)) {
    return withoutAssignees;
  }
  if (current.includes(normalizedTarget)) {
    return withoutAssignees;
  }
  return [...withoutAssignees, normalizedTarget];
}

function isStatusFilter(filter) {
  return typeof filter === 'string' && filter.startsWith(STATUS_FILTER_PREFIX);
}

function isResponsibleFilter(filter) {
  return typeof filter === 'string' && filter.startsWith(RESPONSIBLE_FILTER_PREFIX);
}

function isSubordinateFilter(filter) {
  return typeof filter === 'string' && filter.startsWith(SUBORDINATE_FILTER_PREFIX);
}

function isAssigneeFilter(filter) {
  return isResponsibleFilter(filter) || isSubordinateFilter(filter);
}

function getStatusFilterKey(filter) {
  if (!isStatusFilter(filter)) {
    return '';
  }
  const key = filter.slice(STATUS_FILTER_PREFIX.length);
  return Object.prototype.hasOwnProperty.call(STATUS_SUMMARY_CONFIG, key) ? key : '';
}

function getResponsibleFilterToken(filter) {
  if (!isResponsibleFilter(filter)) {
    return '';
  }
  return filter.slice(RESPONSIBLE_FILTER_PREFIX.length).trim();
}

function getSubordinateFilterToken(filter) {
  if (!isSubordinateFilter(filter)) {
    return '';
  }
  return filter.slice(SUBORDINATE_FILTER_PREFIX.length).trim();
}

function getStatusSummaryKey(status) {
  const normalized = normalizeName(status);
  if (!normalized) {
    return '';
  }
  return STATUS_LABEL_TO_KEY[normalized] || '';
}

function isDirectorCompletionMarked(task) {
  const directorState = ensureDirectorState();
  if (!directorState.isActive || !task || typeof task !== 'object') {
    return false;
  }

  const organization = getTaskOrganization(task);
  if (!organization || !userIsDirectorForOrganization(organization)) {
    return false;
  }

  const statusCandidates = [task.directorStatus, task.director_status];
  for (let index = 0; index < statusCandidates.length; index += 1) {
    const candidate = normalizeName(statusCandidates[index]);
    if (candidate === 'done' || candidate === 'completed' || candidate === 'выполнено') {
      return true;
    }
  }

  const completionMarkers = [task.directorCompletedAt, task.director_completed_at];
  return completionMarkers.some((value) => normalizeValue(value));
}

function getTaskStatusKeyForUser(task) {
  const baseKey = getStatusSummaryKey(getTaskStatusValue(task));
  if (baseKey) {
    return baseKey;
  }

  if (isDirectorCompletionMarked(task)) {
    return 'done';
  }

  return '';
}

const CARD_ANCHOR_PREFIX = 'appdosc-card-';
const CARD_HIGHLIGHT_TIMEOUT = 1800;

const FALLBACK_CARD_TEMPLATE = `
  <header class="appdosc-card__header" data-card-toggle>
    <span class="appdosc-card__badge" data-field="entryNumber"></span>
    <div class="appdosc-card__header-text">
      <div class="appdosc-card__title" data-field="document">Документ</div>
      <div class="appdosc-card__subtitle" data-field="organization"></div>
    </div>
    <span class="appdosc-card__meta" data-field="registrationDateHeader"></span>
    <span class="appdosc-card__status" data-field="status"></span>
    <div class="appdosc-card__compact-actions" data-card-compact-actions hidden></div>
  </header>
  <dl class="appdosc-card__details">
    <div class="appdosc-card__detail">
      <dt>Рег. №</dt>
      <dd data-field="registry"></dd>
    </div>
    <div class="appdosc-card__detail">
      <dt>Дата регистрации</dt>
      <dd data-field="registrationDate"></dd>
    </div>
    <div class="appdosc-card__detail">
      <dt>Направление</dt>
      <dd data-field="direction"></dd>
    </div>
    <div class="appdosc-card__detail">
      <dt>Корреспондент</dt>
      <dd data-field="correspondent"></dd>
    </div>
    <div class="appdosc-card__detail">
      <dt>Исполнитель</dt>
      <dd data-field="executor"></dd>
    </div>
    <div class="appdosc-card__detail">
      <dt>Поручение</dt>
      <dd data-field="instruction"></dd>
    </div>
    <div class="appdosc-card__detail">
      <dt>Ответы исполнителей</dt>
      <dd data-field="responseSummary"></dd>
    </div>
  </dl>
  <div class="appdosc-card__summary" data-field="summary">
    <div class="appdosc-card__block-title">Кратко</div>
    <div class="appdosc-card__block-text" data-field="summaryText"></div>
  </div>
  <div class="appdosc-card__resolution" data-field="resolution">
    <div class="appdosc-card__block-title">Резолюция</div>
    <div class="appdosc-card__block-text" data-field="resolutionText"></div>
  </div>
  <div class="appdosc-card__files" data-files></div>
  <footer class="appdosc-card__footer">
    <div class="appdosc-card__deadline">
      <span class="appdosc-card__deadline-label">Срок</span>
      <span class="appdosc-card__deadline-value" data-field="dueDate"></span>
    </div>
    <div class="appdosc-card__actions">
      <button type="button" class="appdosc-card__action appdosc-card__action--brief" data-card-brief>Кратко ИИ</button>
      <button type="button" class="appdosc-card__action" data-card-view>Просмотреть</button>
      <div class="appdosc-card__view-info" data-card-view-info hidden>Просмотрено: —</div>
    </div>
  </footer>
  <div class="appdosc-card__assign" data-card-assign hidden>
    <div class="appdosc-card__assign-label">Назначить ответственных</div>
    <div class="appdosc-card__assign-controls">
      <div class="appdosc-card__assign-options" data-card-assignees aria-label="Выбор ответственных"></div>
      <button type="button" class="appdosc-card__action appdosc-card__action--assign" data-card-assign-submit>Назначить</button>
    </div>
  </div>
`;

function initElements() {
  elements.app = document.querySelector('[data-app]');
  elements.refreshButton = document.querySelector('[data-refresh]');
  elements.userName = document.querySelector('[data-user-name]');
  elements.userId = document.querySelector('[data-user-id]');
  elements.total = document.querySelector('[data-total]');
  elements.summaryStatus = document.querySelector('[data-summary-status]');
  elements.summaryToggle = document.querySelector('[data-summary-toggle]');
  elements.summaryToggleIcon = document.querySelector('[data-summary-toggle-icon]');
  elements.summaryList = document.querySelector('[data-summary-list]');
  elements.responsibleToggle = document.querySelector('[data-responsible-toggle]');
  elements.responsibleToggleIcon = document.querySelector('[data-responsible-toggle-icon]');
  elements.responsibleTitle = document.querySelector('[data-responsible-title]');
  elements.responsiblePanel = document.querySelector('[data-responsible-panel]');
  elements.responsibleList = document.querySelector('[data-responsible-list]');
  elements.responsibleHistory = document.querySelector('[data-responsible-history]');
  elements.responsibleButtons = new Map();
  elements.subordinateToggle = document.querySelector('[data-subordinate-toggle]');
  elements.subordinateToggleIcon = document.querySelector('[data-subordinate-toggle-icon]');
  elements.subordinatePanel = document.querySelector('[data-subordinate-panel]');
  elements.subordinateTitle = document.querySelector('[data-subordinate-title]');
  elements.subordinateList = document.querySelector('[data-subordinate-list]');
  elements.subordinateHistory = document.querySelector('[data-subordinate-history]');
  elements.subordinateButtons = new Map();
  elements.statusBadges = {};
  Object.keys(STATUS_SUMMARY_CONFIG).forEach((key) => {
    const element = document.querySelector(`[data-status-filter="${key}"]`);
    if (element instanceof HTMLElement) {
      elements.statusBadges[key] = element;
    }
  });
  elements.overdue = document.querySelector('[data-overdue]');
  elements.status = document.querySelector('[data-status]');
  elements.updated = document.querySelector('[data-updated]');
  elements.cardsContainer = document.querySelector('[data-cards-container]');
  elements.placeholder = document.querySelector('[data-placeholder]');
  elements.cardTemplate = document.querySelector('#appdosc-card-template');
  elements.organizations = document.querySelector('[data-organizations]');
  elements.versionPanel = document.querySelector('[data-version-panel]');
  elements.versionValue = document.querySelector('[data-version-value]');
  elements.versionUpdated = document.querySelector('[data-version-updated]');
  elements.taskSelectorContainer = document.querySelector('[data-task-selector]');
  elements.taskSelector = document.querySelector('[data-task-select]');
  elements.viewerTabs = document.querySelector('[data-viewer-tabs]');
  elements.viewerTabsList = document.querySelector('[data-viewer-tabs-list]');
  elements.viewerDownload = document.querySelector('[data-viewer-download]');

  logIosStage('elements_initialized', {
    cardsContainer: Boolean(elements.cardsContainer),
    templateFound: Boolean(elements.cardTemplate),
    placeholderFound: Boolean(elements.placeholder),
  });
  updateViewerDownloadState(null);
}

function initTelegram() {
  const { Telegram } = window;
  if (!Telegram || !Telegram.WebApp) {
    readQueryContext();
    logClientEvent('init_no_webapp', {
      telegramAvailable: false,
      hasQueryId: Boolean(state.telegram.id),
    });
    logIosStage('init_no_webapp', {
      telegramAvailable: false,
      hasQueryId: Boolean(state.telegram.id),
      userAgent: runtimeEnvironment.userAgent,
    });
    return;
  }

  const webApp = Telegram.WebApp;
  logIosStage('init_webapp_detected', {
    platform: typeof webApp.platform === 'string' ? webApp.platform : '',
    hasInitData: Boolean(webApp.initData),
  });
  try {
    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }
    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }
  } catch (error) {
    // ignore expansion issues
  }

  state.telegram.colorScheme = webApp.colorScheme || 'light';
  state.telegram.initData = webApp.initData || '';
  state.telegram.platform = typeof webApp.platform === 'string' ? webApp.platform : state.telegram.platform;
  updateEnvironmentFromPlatform(state.telegram.platform);
  hydrateTelegramFromInitData(state.telegram.initData);

  if (webApp.initDataUnsafe && typeof webApp.initDataUnsafe === 'object') {
    const unsafe = webApp.initDataUnsafe;
    if (unsafe.user && typeof unsafe.user === 'object') {
      const user = unsafe.user;
      state.telegram.id = user.id !== undefined && user.id !== null ? String(user.id) : state.telegram.id;
      state.telegram.username = user.username ? String(user.username) : state.telegram.username;
      state.telegram.firstName = user.first_name ? String(user.first_name) : state.telegram.firstName;
      state.telegram.lastName = user.last_name ? String(user.last_name) : state.telegram.lastName;
      state.telegram.languageCode = user.language_code ? String(user.language_code) : state.telegram.languageCode;
      const nameParts = [state.telegram.firstName, state.telegram.lastName].filter(Boolean);
      state.telegram.fullName = nameParts.join(' ').trim() || state.telegram.fullName;
    }
    if (unsafe.chat && typeof unsafe.chat === 'object') {
      const chat = unsafe.chat;
      if (chat.id !== undefined && chat.id !== null) {
        state.telegram.chatId = String(chat.id);
      }
      if (chat.type) {
        state.telegram.chatType = String(chat.type);
      }
    }
    if (unsafe.user?.language_code && !document.documentElement.lang) {
      document.documentElement.lang = unsafe.user.language_code;
    }
    const startParam = unsafe.start_param || unsafe.startParam;
    if (startParam) {
      const normalizedStartParam = String(startParam).trim();
      if (normalizedStartParam) {
        state.telegram.startParam = normalizedStartParam;
      }
      if (!state.entryTaskId) {
        const entryTaskId = parseTaskIdFromStartParam(startParam);
        if (entryTaskId) {
          applyEntryTaskId(entryTaskId, 'init_data', startParam);
        }
      }
    }
  }

  applyTheme();

  if (typeof webApp.onEvent === 'function') {
    webApp.onEvent('themeChanged', () => {
      state.telegram.colorScheme = webApp.colorScheme || 'light';
      applyTheme();
    });
  }

  readQueryContext();
  logClientEvent('init', {
    telegramAvailable: true,
    hasTelegramId: Boolean(state.telegram.id),
    hasInitData: Boolean(state.telegram.initData),
    platform: state.telegram.platform || '',
    chatType: state.telegram.chatType || '',
  });
  logIosStage('init_complete', {
    telegramId: state.telegram.id || '',
    platform: state.telegram.platform || runtimeEnvironment.webAppPlatform || '',
    hasInitData: Boolean(state.telegram.initData),
    colorScheme: state.telegram.colorScheme || 'light',
  });
}

function parseTaskIdFromStartParam(value) {
  const raw = normalizeValue(value);
  if (!raw) {
    return '';
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (error) {
    decoded = raw;
  }

  const trimmed = decoded.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  const prefixes = [
    'task:',
    'task-',
    'task_',
    'task=',
    'entry:',
    'entry-',
    'entry_',
    'entry=',
    'registry:',
    'registry-',
    'registry_',
    'registry=',
    'document:',
    'document-',
    'document_',
    'document=',
    'id:',
    'id-',
    'id_',
    'id=',
  ];
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }

  if (/^[a-z0-9][a-z0-9\-_.:]{0,120}$/i.test(trimmed)) {
    return trimmed;
  }

  return '';
}

function resolveEntryTaskIdFromQuery(params, hashParams) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams();
  const hash = hashParams instanceof URLSearchParams ? hashParams : new URLSearchParams();

  const startParam = query.get('start_param')
    || query.get('tgWebAppStartParam')
    || query.get('start')
    || hash.get('tgWebAppStartParam')
    || hash.get('start_param')
    || hash.get('start');

  const directTaskParam = query.get('task_id')
    || query.get('taskid')
    || query.get('taskId')
    || query.get('task')
    || hash.get('task_id')
    || hash.get('taskid')
    || hash.get('taskId')
    || hash.get('task');

  return parseTaskIdFromStartParam(directTaskParam) || parseTaskIdFromStartParam(startParam);
}

function readQueryContext() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const viewerDebugParam = params.get('viewerDebug');
  const normalizeDebugFlag = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return !['0', 'false', 'no', 'off'].includes(normalized);
  };
  if (viewerDebugParam !== null) {
    const normalized = normalizeDebugFlag(viewerDebugParam);
    window.__DOCS_VIEWER_DEBUG__ = normalized !== null ? normalized : window.__DOCS_VIEWER_DEBUG__;
  } else {
    const hashViewerDebug = normalizeDebugFlag(hashParams.get('viewerDebug'));
    if (hashViewerDebug !== null) {
      window.__DOCS_VIEWER_DEBUG__ = hashViewerDebug;
    } else {
      let storedViewerDebug = null;
      try {
        storedViewerDebug = window.localStorage ? window.localStorage.getItem('docsViewerDebug') : null;
      } catch (error) {
        storedViewerDebug = null;
      }
      const storageViewerDebug = normalizeDebugFlag(storedViewerDebug);
      if (storageViewerDebug !== null) {
        window.__DOCS_VIEWER_DEBUG__ = storageViewerDebug;
      }
    }
  }
  if (window.__DOCS_VIEWER_DEBUG__) {
    logViewerDebug('debug:enabled', { source: 'query' });
  }
  const fallbackId = params.get('telegram_user_id')
    || params.get('user_id')
    || params.get('userid')
    || params.get('id');
  if (!state.telegram.id && fallbackId) {
    state.telegram.id = String(fallbackId).trim();
  }

  const username = params.get('telegram_username') || params.get('username');
  if (!state.telegram.username && username) {
    state.telegram.username = String(username).replace(/^@+/, '').trim();
  }

  const chatId = params.get('telegram_chat_id') || params.get('chat_id') || params.get('chatid');
  if (!state.telegram.chatId && chatId) {
    state.telegram.chatId = String(chatId).trim();
  }

  const chatTypeParam = params.get('telegram_chat_type') || params.get('chat_type');
  if (!state.telegram.chatType && chatTypeParam) {
    state.telegram.chatType = String(chatTypeParam).trim();
  }

  const firstName = params.get('telegram_first_name') || params.get('first_name');
  if (!state.telegram.firstName && firstName) {
    state.telegram.firstName = String(firstName).trim();
  }

  const lastName = params.get('telegram_last_name') || params.get('last_name');
  if (!state.telegram.lastName && lastName) {
    state.telegram.lastName = String(lastName).trim();
  }

  const fullName = params.get('telegram_full_name') || params.get('full_name');
  if (!state.telegram.fullName && fullName) {
    state.telegram.fullName = String(fullName).trim();
  }

  const platformParam = params.get('telegram_platform')
    || params.get('platform')
    || hashParams.get('tgWebAppPlatform')
    || hashParams.get('platform');
  if (platformParam) {
    const platformValue = String(platformParam).trim();
    if (platformValue) {
      if (!state.telegram.platform) {
        state.telegram.platform = platformValue;
      }
      updateEnvironmentFromPlatform(platformValue);
    }
  }

  if (!state.telegram.fullName) {
    const nameParts = [state.telegram.firstName, state.telegram.lastName].filter(Boolean);
    if (nameParts.length) {
      state.telegram.fullName = nameParts.join(' ');
    }
  }

  if (!state.entryTaskId) {
    const entryTaskId = resolveEntryTaskIdFromQuery(params, hashParams);
    if (entryTaskId) {
      applyEntryTaskId(entryTaskId, 'query', entryTaskId);
    }
  }

  logIosStage('query_context_loaded', {
    hasTelegramId: Boolean(state.telegram.id),
    platform: state.telegram.platform || runtimeEnvironment.webAppPlatform || '',
  });
}

function applyTheme() {
  const theme = state.telegram.colorScheme || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  setClass(document.body, 'appdosc--dark', theme === 'dark');

  const themeParams = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.themeParams : null;
  if (themeParams && typeof themeParams === 'object') {
    const root = document.documentElement.style;
    if (themeParams.bg_color) {
      root.setProperty('--appdosc-telegram-bg', themeParams.bg_color);
    }
    if (themeParams.text_color) {
      root.setProperty('--appdosc-telegram-text', themeParams.text_color);
    }
    if (themeParams.button_color) {
      root.setProperty('--appdosc-telegram-accent', themeParams.button_color);
    }
    if (themeParams.hint_color) {
      root.setProperty('--appdosc-telegram-muted', themeParams.hint_color);
    }
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  if (elements.refreshButton) {
    elements.refreshButton.disabled = isLoading;
    setClass(elements.refreshButton, 'is-loading', isLoading);
  }
  if (elements.taskSelector) {
    elements.taskSelector.disabled = isLoading;
  }
  setClass(document.body, 'appdosc--loading', isLoading);

  logIosStage('loading_state_changed', { isLoading });
}

function buildRequestBody(options = {}) {
  const { includeInitData = true, includeNameTokens = true } = options;
  const payload = {};
  if (state.telegram.id) {
    payload.telegram_user_id = state.telegram.id;
  }
  if (state.telegram.chatId) {
    payload.telegram_chat_id = state.telegram.chatId;
  }
  if (state.telegram.chatType) {
    payload.telegram_chat_type = state.telegram.chatType;
  }
  if (state.telegram.username) {
    payload.telegram_username = state.telegram.username;
  }
  if (state.telegram.fullName) {
    payload.telegram_full_name = state.telegram.fullName;
  }
  if (state.telegram.firstName) {
    payload.telegram_first_name = state.telegram.firstName;
  }
  if (state.telegram.lastName) {
    payload.telegram_last_name = state.telegram.lastName;
  }
  if (state.telegram.languageCode) {
    payload.telegram_language_code = state.telegram.languageCode;
  }
  if (state.telegram.platform) {
    payload.telegram_platform = state.telegram.platform;
  }
  if (!payload.telegram_full_name) {
    const nameParts = [state.telegram.firstName, state.telegram.lastName].filter(Boolean);
    if (nameParts.length) {
      payload.telegram_full_name = nameParts.join(' ');
    }
  }
  if (payload.telegram_full_name && includeNameTokens) {
    const tokens = payload.telegram_full_name
      .split(/\s+/u)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (tokens.length) {
      payload.telegram_name_tokens = Array.from(new Set(tokens));
    }
  }
  if (state.telegram.initData && includeInitData) {
    payload.telegram_init_data = state.telegram.initData;
  }
  if (!payload.identity) {
    if (payload.telegram_user_id) {
      payload.identity = `telegram:${payload.telegram_user_id}`;
    } else if (state.telegram.username) {
      payload.identity = `@${state.telegram.username}`;
    }
  }
  if (payload.identity && !payload.user_identity) {
    payload.user_identity = payload.identity;
  }
  return payload;
}

async function loadTasks(force = false) {
  if (state.loading && !force) {
    return;
  }

  const now = Date.now();
  if (!force && lastTasksLoadAt && (now - lastTasksLoadAt < MIN_RELOAD_INTERVAL_MS)) {
    return;
  }

  if (loadTasksAbortController) {
    try { loadTasksAbortController.abort(); } catch (_) { /* ignore */ }
  }
  loadTasksAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = loadTasksAbortController ? loadTasksAbortController.signal : undefined;

  setLoading(true);
  clearStatus();
  logClientEvent('tasks_load_start', { force });
  const startedAt = Date.now();

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (state.telegram.initData) {
      headers['X-Telegram-Init-Data'] = state.telegram.initData;
    }

    const fetchOptions = {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify(buildRequestBody()),
    };
    if (signal) {
      fetchOptions.signal = signal;
    }

    const response = await fetch(API_URL, fetchOptions);

    if (!response.ok) {
      const message = `Ошибка загрузки (${response.status})`;
      throw new Error(message);
    }

    const data = await response.json();
    const hasSuccessField = data && Object.prototype.hasOwnProperty.call(data, 'success');
    const payloadKeys = data && typeof data === 'object' && !Array.isArray(data)
      ? Object.keys(data).slice(0, 15)
      : [];
    logClientEvent('tasks_payload_received', {
      hasSuccessField,
      success: Boolean(data && data.success),
      tasksType: Array.isArray(data?.tasks) ? 'array' : typeof (data?.tasks),
      rawTasksCount: getTaskCollectionLength(data?.tasks),
    });
    if (!data.success) {
      const message = data.error || 'Не удалось получить данные.';
      throw new Error(message);
    }

    updateStateFromPayload(data);
    if (!safeRender('tasks_payload_update')) {
      const message = state.error || 'Отрисовка карточек завершилась ошибкой';
      throw new Error(message);
    }
    setStatus('success', `Найдено задач: ${state.stats.total}`);
    logClientEvent('tasks_loaded', {
      total: state.stats.total,
      active: state.stats.active,
      completed: state.stats.completed,
      overdue: state.stats.overdue,
      organizations: state.organizations.length,
      organizationsChecked: state.organizationsChecked,
      tasks: state.tasks.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return;
    }
    state.error = error instanceof Error ? error.message : String(error);
    setStatus('error', state.error);
    renderEmpty();
    logClientEvent('tasks_load_error', {
      message: state.error,
      hasTelegramId: Boolean(state.telegram.id),
      durationMs: Date.now() - startedAt,
    });
  } finally {
    lastTasksLoadAt = Date.now();
    setLoading(false);
  }
}

function updateStateFromPayload(payload) {
  const directorState = ensureDirectorState();
  const wasDirectorActive = directorState.isActive === true;
  const previousDirectorKeys = new Set(directorState.knownTaskKeys);
  const directorModePayload = isPlainObject(payload?.directorMode) ? payload.directorMode : null;
  const directorModeOrganizations = Array.isArray(directorModePayload?.organizations)
    ? directorModePayload.organizations
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value)
    : [];
  const directorModeAllTasks = Boolean(directorModePayload && (
    directorModePayload.allTasks === true
      || directorModePayload.allTasks === 'true'
      || directorModePayload.allTasks === 1
  ));
  const directorModeReasonSet = new Set();
  if (typeof directorModePayload?.reason === 'string') {
    const reasonValue = directorModePayload.reason.trim();
    if (reasonValue) {
      directorModeReasonSet.add(reasonValue);
    }
  }
  if (Array.isArray(directorModePayload?.reasons)) {
    directorModePayload.reasons.forEach((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) {
          directorModeReasonSet.add(trimmed);
        }
      }
    });
  }
  const rawTasksCount = getTaskCollectionLength(payload?.tasks);
  const tasksCollection = normalizeTasksCollection(payload?.tasks);
  const invalidTasksCount = tasksCollection.reduce((total, item) => {
    return total + (isPlainObject(item) ? 0 : 1);
  }, 0);
  const sanitizedTasks = tasksCollection.map((item) => sanitizeTaskItem(item));
  if (rawTasksCount > 0 && sanitizedTasks.length === 0) {
    logClientEvent('tasks_payload_empty_after_normalization', {
      rawCount: rawTasksCount,
    });
  } else if (invalidTasksCount > 0) {
    logClientEvent('tasks_payload_invalid_items', {
      rawCount: rawTasksCount,
      invalidCount: invalidTasksCount,
    });
  }

  revokeTasksBlobUrls(state.tasks);
  state.tasks = sanitizedTasks;
  updateVisibleTasks();
  if (state.entryTaskId) {
    const matchCount = Array.isArray(state.visibleTasks) ? state.visibleTasks.length : 0;
    if (!state.entryTaskLog || typeof state.entryTaskLog !== 'object') {
      state.entryTaskLog = { resolved: false, matched: false, expanded: false };
    }
    if (!state.entryTaskLog.matched) {
      logEntryTaskEvent(matchCount ? 'entry_task_matched' : 'entry_task_missing', {
        matchCount,
        tasksCount: state.tasks.length,
      });
      state.entryTaskLog.matched = true;
    }
  }

  const computedStats = computeStatsFromTasks(state.tasks);
  const payloadStats = isPlainObject(payload?.stats) ? payload.stats : null;
  const statsMismatch = hasStatsMismatch(payloadStats, computedStats);

  if (statsMismatch) {
    logClientEvent('tasks_stats_mismatch', {
      payloadStats: sanitizeStatsForLog(payloadStats),
      computedStats,
    });
  }

  state.stats = statsMismatch
    ? computedStats
    : mergeStats(payloadStats, computedStats);
  state.organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
  updateOrganizationAccessMaps();
  updateDirectorTracking(previousDirectorKeys);
  directorState.visibilityRuleLogged = false;
  const isDirectorNow = directorState.isActive === true;
  if (isDirectorNow && !hasAssigneeFilters(state.taskFilter)) {
    updateVisibleTasks();
  }
  let filterChanged = false;
  if (directorModeAllTasks && hasAssigneeFilters(state.taskFilter)) {
    state.taskFilter = [];
    filterChanged = true;
  }
  if (filterChanged) {
    directorState.visibilityRuleLogged = false;
    updateVisibleTasks();
  }
  if (directorState.isActive) {
    logDirectorVisibleTasksOnLoad('payload_update');
  }
  if (!wasDirectorActive && (isDirectorNow || directorModeAllTasks)) {
    const logDetails = {
      active: isDirectorNow,
      allTasks: directorModeAllTasks,
      organizationsCount: directorModeOrganizations.length,
      totalTasks: Array.isArray(state.tasks) ? state.tasks.length : 0,
      filterReset: filterChanged,
    };
    if (directorModeOrganizations.length) {
      logDetails.organizations = directorModeOrganizations.slice(0, 10);
    }
    if (directorModeReasonSet.size) {
      logDetails.reasons = Array.from(directorModeReasonSet);
    }
    logClientEvent('director_mode_enabled', logDetails);
    logDirectorDebug('mode_enabled', logDetails);
  }
  if (!state.permissions || typeof state.permissions !== 'object') {
    state.permissions = { canManageInstructions: false, canManageSubordinates: false };
  }
  if (payload.permissions && typeof payload.permissions === 'object') {
    if (typeof payload.permissions.canManageInstructions === 'boolean') {
      state.permissions.canManageInstructions = payload.permissions.canManageInstructions;
    }
    if (typeof payload.permissions.canManageSubordinates === 'boolean') {
      state.permissions.canManageSubordinates = payload.permissions.canManageSubordinates;
    }
  }
  if (typeof payload.canManageInstructions === 'boolean') {
    state.permissions.canManageInstructions = payload.canManageInstructions;
  } else {
    state.permissions.canManageInstructions = Boolean(state.permissions.canManageInstructions);
  }
  if (typeof payload.canManageSubordinates === 'boolean') {
    state.permissions.canManageSubordinates = payload.canManageSubordinates;
  } else {
    state.permissions.canManageSubordinates = Boolean(state.permissions.canManageSubordinates);
  }
  state.organizationsChecked = typeof payload.organizationsChecked === 'number'
    ? payload.organizationsChecked
    : state.organizationsChecked;
  state.lastUpdated = payload.generatedAt || new Date().toISOString();

  if (payload.telegramUserId && !state.telegram.id) {
    state.telegram.id = String(payload.telegramUserId);
  }

  if (payload.user && typeof payload.user === 'object') {
    const user = payload.user;
    if (!state.telegram.id && user.id) {
      state.telegram.id = String(user.id);
    }
    if (!state.telegram.chatId && user.chatId) {
      state.telegram.chatId = String(user.chatId);
    }
    if (user.fullName) {
      state.telegram.fullName = String(user.fullName);
    }
    if (user.username) {
      state.telegram.username = String(user.username);
    }
    if (user.firstName || user.lastName) {
      state.telegram.firstName = user.firstName ? String(user.firstName) : state.telegram.firstName;
      state.telegram.lastName = user.lastName ? String(user.lastName) : state.telegram.lastName;
    }
  }

  if (!state.telegram.fullName) {
    const parts = [state.telegram.firstName, state.telegram.lastName].filter(Boolean);
    if (parts.length) {
      state.telegram.fullName = parts.join(' ');
    }
  }

  if (payload.telegramInitData && typeof payload.telegramInitData === 'object') {
    const summary = payload.telegramInitData;
    state.telegram.initDataSummary = {
      present: Boolean(summary.present),
      valid: Boolean(summary.valid),
      source: typeof summary.source === 'string' ? summary.source : '',
      error: typeof summary.error === 'string' ? summary.error : '',
    };
  } else {
    state.telegram.initDataSummary = null;
  }

  if (iosDiagnostics.enabled) {
    const statsSnapshot = {
      total: state.stats.total,
      active: state.stats.active,
      completed: state.stats.completed,
      overdue: state.stats.overdue,
    };
    const sampleTasks = state.tasks.slice(0, 3)
      .map(summarizeTaskForLog)
      .filter(Boolean);
    logIosStage('tasks_payload_processed', {
      rawCount: rawTasksCount,
      sanitizedCount: sanitizedTasks.length,
      invalidCount: invalidTasksCount,
      statsMismatch,
      payloadStats: sanitizeStatsForLog(payloadStats),
      computedStats: statsSnapshot,
      sampleTasks,
    });
  }
}

function render() {
  updateUserPanel();
  updateStats();
  updateDirectorSummary();
  updateSummaryFilterState();
  renderCards();
  updateFooter();
}

function renderEmpty() {
  updateUserPanel();
  updateStats();
  updateDirectorSummary();
  clearCards();
  updateFooter();
  logIosStage('render_empty', {
    hasTasks: Array.isArray(state.tasks) ? state.tasks.length : 0,
    filter: formatTaskFiltersForLog(state.taskFilter),
  });
}

function updateUserPanel() {
  if (elements.userName) {
    elements.userName.textContent = state.telegram.fullName
      || state.telegram.firstName
      || state.telegram.username
      || 'Неизвестный пользователь';
  }

  if (elements.userId) {
    elements.userId.textContent = state.telegram.id ? `ID: ${state.telegram.id}` : 'ID не определён';
  }

  updateVersionPanel();
}

function updateVersionPanel() {
  if ((!state.assets.version || !state.assets.updatedAt) && typeof window !== 'undefined') {
    readAssetVersionInfo();
  }

  const version = state.assets.version ? String(state.assets.version).trim() : '';
  if (elements.versionValue) {
    elements.versionValue.textContent = version || '—';
  }

  if (elements.versionUpdated) {
    const updatedText = state.assets.updatedAt
      ? `Обновлено: ${formatDateTime(state.assets.updatedAt)}`
      : 'Обновлено: —';
    elements.versionUpdated.textContent = updatedText;
  }

  if (elements.versionPanel) {
    elements.versionPanel.hidden = false;
  }
}

function updateStats() {
  const directorState = ensureDirectorState();
  const normalizedFilters = normalizeTaskFilters(state.taskFilter);
  state.taskFilter = normalizedFilters;
  const filterLabel = formatTaskFiltersForLog(normalizedFilters);
  const directorActive = directorState.isActive === true;
  const usingResponsibleFilter = directorActive
    && normalizedFilters.some((filter) => isResponsibleFilter(filter));
  const overallStats = computeStatsFromTasks(state.tasks, { useDirectorDeadlines: directorActive });

  let statsSource = 'global';
  let displayStats = state.stats;

  if (directorActive) {
    const statsTasks = getAssigneeTasksForStats(normalizedFilters, directorState);
    displayStats = computeStatsFromTasks(statsTasks, { useDirectorDeadlines: true });
    if (usingResponsibleFilter || normalizeResponsibleKey(directorState.selectedResponsibleToken || '')) {
      statsSource = 'responsible';
    } else if (normalizedFilters.some((filter) => isSubordinateFilter(filter))
      || normalizeResponsibleKey(directorState.selectedSubordinateToken || '')) {
      statsSource = 'subordinate';
    } else {
      statsSource = 'director';
    }
  }

  if (state.entryTaskId) {
    const statsTasks = getVisibleTasksForStats();
    displayStats = computeStatsFromTasks(statsTasks, { useDirectorDeadlines: directorActive });
    statsSource = 'focused';
  }

  if (elements.total) {
    const total = Number(displayStats.total) || 0;
    elements.total.textContent = `${total} задач`;
    if (directorActive) {
      elements.total.dataset.source = statsSource;
    } else if (elements.total.dataset.source) {
      delete elements.total.dataset.source;
    }
  }

  const statusCounts = isPlainObject(displayStats.statuses)
    ? displayStats.statuses
    : createEmptyStatusCounters();
  const hasStatusCounts = Object.keys(STATUS_SUMMARY_CONFIG).some((key) => {
    const rawValue = statusCounts[key];
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return Number.isFinite(numeric) && numeric > 0;
  });
  const resolvedStatusCounts = !hasStatusCounts && overallStats.total > 0
    ? overallStats.statuses
    : statusCounts;

  if (elements.statusBadges) {
    Object.entries(STATUS_SUMMARY_CONFIG).forEach(([key, config]) => {
      const badge = elements.statusBadges[key];
      if (!(badge instanceof HTMLElement)) {
        return;
      }
      const rawValue = resolvedStatusCounts[key];
      const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      const count = Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
      badge.textContent = `${count} ${config.display}`;
    });
  }

  if (elements.overdue) {
    const overdue = Number(displayStats.overdue) || 0;
    const resolvedOverdue = !hasStatusCounts && overdue === 0 && overallStats.total > 0
      ? Number(overallStats.overdue) || 0
      : overdue;
    elements.overdue.textContent = `${resolvedOverdue} просрочено`;
  }

  if (elements.updated) {
    elements.updated.textContent = state.lastUpdated
      ? `Обновлено: ${formatDateTime(state.lastUpdated)}`
      : 'Обновление не выполнялось';
  }

  if (directorActive) {
    logDirectorDebug('stats_update', {
      filter: filterLabel,
      statsSource,
      total: Number(displayStats.total) || 0,
      overdue: Number(displayStats.overdue) || 0,
      selectedResponsible: directorState.selectedResponsibleToken || null,
    });
  }
}

function updateSummaryFilterState() {
  const currentFilters = normalizeTaskFilters(state.taskFilter);
  state.taskFilter = currentFilters;
  const mappings = [];
  if (elements.statusBadges) {
    Object.entries(STATUS_SUMMARY_CONFIG).forEach(([key, config]) => {
      const element = elements.statusBadges[key];
      if (element instanceof HTMLElement) {
        mappings.push({ element, filter: config.filter });
      }
    });
  }
  if (elements.overdue instanceof HTMLElement) {
    mappings.push({ element: elements.overdue, filter: 'overdue' });
  }
  if (elements.responsibleButtons instanceof Map) {
    elements.responsibleButtons.forEach((button, token) => {
      if (button instanceof HTMLElement) {
        mappings.push({ element: button, filter: `${RESPONSIBLE_FILTER_PREFIX}${token}` });
      }
    });
  }
  if (elements.subordinateButtons instanceof Map) {
    elements.subordinateButtons.forEach((button, token) => {
      if (button instanceof HTMLElement) {
        mappings.push({ element: button, filter: `${SUBORDINATE_FILTER_PREFIX}${token}` });
      }
    });
  }

  mappings.forEach(({ element, filter }) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const isSelected = currentFilters.includes(filter);
    element.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    setClass(element, 'appdosc__badge--selected', isSelected);
  });
}

function ensureExpandedCardSet() {
  if (!(state.expandedCards instanceof Set)) {
    state.expandedCards = new Set();
  }
  return state.expandedCards;
}

function getCardAnchorKey(card) {
  if (!(card instanceof HTMLElement)) {
    return '';
  }
  return card.dataset.anchorId || card.id || '';
}

function rememberCardExpansion(card, isExpanded) {
  const key = getCardAnchorKey(card);
  if (!key) {
    return;
  }
  const expandedSet = ensureExpandedCardSet();
  if (isExpanded) {
    expandedSet.add(key);
  } else {
    expandedSet.delete(key);
  }
}

function pruneExpandedCardAnchors(validAnchors) {
  if (!(validAnchors instanceof Set)) {
    return;
  }
  const expandedSet = ensureExpandedCardSet();
  Array.from(expandedSet).forEach((anchor) => {
    if (!validAnchors.has(anchor)) {
      expandedSet.delete(anchor);
    }
  });
}

function clearCards() {
  if (!elements.cardsContainer) {
    return;
  }
  const cards = Array.from(elements.cardsContainer.querySelectorAll('[data-card]'));
  for (const card of cards) {
    card.remove();
  }
  setPlaceholderMessage(DEFAULT_PLACEHOLDER_MESSAGE);
  togglePlaceholder(true);
  state.selectedCardAnchor = '';
  lastRenderedTasksSignature = '';
  pruneExpandedCardAnchors(new Set());
  updateTaskSelector();
}

function resolveEntryTaskAnchor(visibleItems) {
  const entryTaskId = normalizeValue(state.entryTaskId);
  if (!entryTaskId || !Array.isArray(visibleItems)) {
    return '';
  }
  const match = visibleItems.find((item) => taskMatchesEntryTask(item?.task, entryTaskId));
  if (!match) {
    return '';
  }
  return match.anchorId || '';
}

function focusEntryTaskCard(visibleItems) {
  const anchorId = resolveEntryTaskAnchor(visibleItems);
  if (!anchorId) {
    return;
  }
  state.selectedCardAnchor = anchorId;
  const card = document.getElementById(anchorId);
  if (card) {
    setCardExpandedState(card, true);
    scrollToCard(anchorId);
    if (!state.entryTaskLog || typeof state.entryTaskLog !== 'object') {
      state.entryTaskLog = { resolved: false, matched: false, expanded: false };
    }
    if (!state.entryTaskLog.expanded) {
      logEntryTaskEvent('entry_task_expanded', {
        anchorId,
        entryTaskId: state.entryTaskId || '',
      });
      state.entryTaskLog.expanded = true;
    }
  }
}

function renderCards() {
  if (!elements.cardsContainer) {
    return;
  }

  const visibleItems = getVisibleTaskItems();
  const hasTasks = Array.isArray(state.tasks) && state.tasks.length > 0;

  const newSignature = buildTasksSignature(visibleItems);
  if (newSignature && newSignature === lastRenderedTasksSignature) {
    return;
  }
  lastRenderedTasksSignature = newSignature;

  const cards = Array.from(elements.cardsContainer.querySelectorAll('[data-card]'));
  for (const card of cards) {
    card.remove();
  }

  if (!visibleItems.length) {
    setPlaceholderMessage(hasTasks ? FILTER_PLACEHOLDER_MESSAGE : DEFAULT_PLACEHOLDER_MESSAGE);
    togglePlaceholder(true);
    updateTaskSelector();
    pruneExpandedCardAnchors(new Set());
    return;
  }

  setPlaceholderMessage(DEFAULT_PLACEHOLDER_MESSAGE);
  togglePlaceholder(false);

  const fragment = document.createDocumentFragment();
  const anchorRegistry = new Set();
  const visibleAnchors = new Set();
  visibleItems.forEach((item, position) => {
    const source = item && typeof item === 'object' ? item : {};
    const task = isPlainObject(source.task) ? source.task : {};
    const referenceIndex = Number.isInteger(source.originalIndex)
      ? source.originalIndex
      : position;
    const card = createCard(task, referenceIndex, anchorRegistry);
    card.dataset.visibleIndex = String(position);
    if (Number.isInteger(referenceIndex)) {
      card.dataset.originalIndex = String(referenceIndex);
    } else if ('originalIndex' in card.dataset) {
      delete card.dataset.originalIndex;
    }
    if (source && typeof source === 'object') {
      source.anchorId = card.dataset.anchorId || card.id || '';
    }
    const anchorKey = getCardAnchorKey(card);
    if (anchorKey) {
      visibleAnchors.add(anchorKey);
    }
    fragment.appendChild(card);
  });
  elements.cardsContainer.appendChild(fragment);
  const entryAnchorId = resolveEntryTaskAnchor(visibleItems);
  if (entryAnchorId) {
    state.selectedCardAnchor = entryAnchorId;
  }
  pruneExpandedCardAnchors(visibleAnchors);
  updateTaskSelector();
  focusEntryTaskCard(visibleItems);
  logIosStage('render_cards', {
    tasks: state.tasks.length,
    visible: visibleItems.length,
    filter: formatTaskFiltersForLog(state.taskFilter),
    renderedCards: elements.cardsContainer
      ? elements.cardsContainer.querySelectorAll('[data-card]').length
      : visibleItems.length,
    selectedAnchor: state.selectedCardAnchor || '',
  });
}

function sanitizeAnchorSegment(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}

function buildCardAnchorId(task, index, registry) {
  const parts = [];
  if (task && typeof task === 'object') {
    if (task.id !== undefined && task.id !== null) {
      parts.push(task.id);
    }
    if (task.entryNumber !== undefined && task.entryNumber !== null) {
      parts.push(`entry-${task.entryNumber}`);
    }
    if (task.registryNumber) {
      parts.push(task.registryNumber);
    }
    if (task.documentNumber) {
      parts.push(task.documentNumber);
    }
  }
  if (!parts.length) {
    parts.push(`idx-${index + 1}`);
  }
  let base = '';
  for (let i = 0; i < parts.length; i += 1) {
    base = sanitizeAnchorSegment(parts[i]);
    if (base) {
      break;
    }
  }
  if (!base) {
    base = `idx-${index + 1}`;
  }
  let candidate = base;
  if (registry instanceof Set) {
    let attempt = 1;
    while (registry.has(candidate)) {
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
    registry.add(candidate);
  }
  return `${CARD_ANCHOR_PREFIX}${candidate}`;
}

function createCard(task, index, anchorRegistry) {
  const template = elements.cardTemplate;
  let card = null;

  if (template) {
    if (template.content && typeof template.content.cloneNode === 'function') {
      const content = template.content.cloneNode(true);
      card = content.querySelector('[data-card]');
      if (card && card.parentNode) {
        card.parentNode.removeChild(card);
      }
    } else if (typeof template.innerHTML === 'string' && template.innerHTML.trim()) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = template.innerHTML;
      card = wrapper.querySelector('[data-card]');
      if (card && card.parentNode) {
        card.parentNode.removeChild(card);
      }
    }
  }

  if (!card) {
    card = document.createElement('article');
    card.className = 'appdosc-card';
    card.setAttribute('data-card', '');
    card.innerHTML = FALLBACK_CARD_TEMPLATE;
  }

  if (!card.hasAttribute('data-card')) {
    card.setAttribute('data-card', '');
  }

  if (anchorRegistry) {
    const anchorId = buildCardAnchorId(task, index, anchorRegistry);
    card.id = anchorId;
    card.dataset.anchorId = anchorId;
  }

  const statusText = getTaskStatusValue(task);
  const normalizedStatus = statusText.toLowerCase();
  const completed = isTaskCompleted(task);

  card.classList.remove('appdosc-card--done', 'appdosc-card--control', 'appdosc-card--overdue');

  if (completed) {
    card.classList.add('appdosc-card--done');
  } else if (normalizedStatus.includes('контрол')) {
    card.classList.add('appdosc-card--control');
  }

  if (isOverdue(task)) {
    card.classList.add('appdosc-card--overdue');
  }

  const hasEntry = setCardField(card, '[data-field="entryNumber"]', task.entryNumber ?? index + 1, {
    hideIfEmpty: true,
    formatter: (_, raw) => (raw ? `№ ${raw}` : ''),
    setTitle: false,
  });
  if (!hasEntry) {
    const entryElement = card.querySelector('[data-field="entryNumber"]');
    if (entryElement) {
      entryElement.hidden = true;
    }
  }

  setCardField(card, '[data-field="document"]', formatDocumentCell(task), {
    fallback: 'Документ',
  });
  setCardField(card, '[data-field="organization"]', task.organization, {
    fallback: 'Организация не указана',
  });
  const registrationDate = formatDate(task.registrationDate);
  setCardField(card, '[data-field="registry"]', task.registryNumber);
  setCardField(card, '[data-field="registrationDate"]', registrationDate);
  applyRegistrationDateHeader(card, registrationDate);
  setCardField(card, '[data-field="direction"]', task.direction);
  setCardField(card, '[data-field="correspondent"]', task.correspondent);
  setCardField(card, '[data-field="executor"]', resolveExecutor(task));
  setCardField(card, '[data-field="instruction"]', resolveInstructionSummary(task));
  setCardField(card, '[data-field="responseSummary"]', buildTaskResponseSummary(task), {
    setTitle: false,
  });

  const hasSummary = setCardField(card, '[data-field="summaryText"]', task.summary, {
    hideIfEmpty: true,
    setTitle: false,
  });
  toggleSection(card, '[data-field="summary"]', hasSummary);

  const hasResolution = setCardField(card, '[data-field="resolutionText"]', task.resolution, {
    hideIfEmpty: true,
    setTitle: false,
  });
  toggleSection(card, '[data-field="resolution"]', hasResolution);

  setCardField(card, '[data-field="dueDate"]', formatDate(task.dueDate), {
    fallback: 'Не указан',
  });

  applyStatusBadge(card, statusText, normalizedStatus, task);
  populateCardFiles(card, task.files);

  const organization = getTaskOrganization(task);
  const directorView = organization && userIsDirectorForOrganization(organization);

  const viewButton = card.querySelector('[data-card-view]');
  if (viewButton) {
    viewButton.addEventListener('click', () => handleCardView(viewButton, task));
  }
  const briefButton = card.querySelector('[data-card-brief]');
  if (briefButton) {
    briefButton.addEventListener('click', () => openTelegramBriefModal(task, setStatus));
  }

  updateCardViewInfo(card, task);

  const completeButton = card.querySelector('[data-card-complete]');
  setupCompleteButton(completeButton, task);
  setupDirectorCompactCompletion(card, task);

  setupStatusControls(card, task);
  setupInstructionControl(card, task);
  setupDueDateEditor(card, task);
  setupAssignmentControls(card, task);
  setupSubordinateControls(card, task);

  initializeCardExpansion(card);

  return card;
}

function togglePlaceholder(shouldShow) {
  if (!elements.placeholder) {
    return;
  }

  const visible = Boolean(shouldShow);
  elements.placeholder.hidden = !visible;
  setClass(elements.placeholder, 'appdosc__cards-placeholder--hidden', !visible);
  elements.placeholder.style.display = visible ? '' : 'none';
  if (visible) {
    elements.placeholder.setAttribute('aria-hidden', 'false');
  } else {
    elements.placeholder.setAttribute('aria-hidden', 'true');
  }
}

function setPlaceholderMessage(message) {
  if (!elements.placeholder) {
    return;
  }
  const text = typeof message === 'string' && message.trim()
    ? message.trim()
    : DEFAULT_PLACEHOLDER_MESSAGE;
  elements.placeholder.textContent = text;
}

function getVisibleTaskItems() {
  return Array.isArray(state.visibleTasks) ? state.visibleTasks : [];
}

function getVisibleTaskCount() {
  return getVisibleTaskItems().length;
}

function extractTasksFromItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const task = item.task;
      return isPlainObject(task) ? task : null;
    })
    .filter(Boolean);
}

function getVisibleTasksForStats() {
  return extractTasksFromItems(getVisibleTaskItems());
}

function getAssigneeTasksForStats(filters, directorState) {
  if (!directorState || directorState.isActive !== true) {
    return getVisibleTasksForStats();
  }

  const baseItems = applyTaskFilter(filters, state.tasks);

  if (hasAssigneeFilters(filters)) {
    return extractTasksFromItems(baseItems);
  }

  const normalizedFilters = normalizeTaskFilters(filters);
  const normalizedResponsible = normalizeResponsibleKey(directorState.selectedResponsibleToken || '');
  if (normalizedResponsible) {
    return extractTasksFromItems(
      applyTaskFilter(`${RESPONSIBLE_FILTER_PREFIX}${normalizedResponsible}`, state.tasks),
    );
  }

  const normalizedSubordinate = normalizeResponsibleKey(directorState.selectedSubordinateToken || '');
  if (normalizedSubordinate) {
    return extractTasksFromItems(
      applyTaskFilter(`${SUBORDINATE_FILTER_PREFIX}${normalizedSubordinate}`, state.tasks),
    );
  }

  const scopedItems = !normalizedFilters.some((filter) => isResponsibleFilter(filter) || isSubordinateFilter(filter))
    ? baseItems.filter(({ task }) => isTaskAssignedToCurrentDirector(task))
    : baseItems;

  return extractTasksFromItems(scopedItems);
}

function buildDirectorTaskLogEntry(task, originalIndex, visibleIndex) {
  const entry = {
    originalIndex,
    assignedToDirector: false,
  };

  if (typeof visibleIndex === 'number') {
    entry.visibleIndex = visibleIndex + 1;
  }

  if (!task || typeof task !== 'object') {
    return entry;
  }

  entry.assignedToDirector = isTaskAssignedToCurrentDirector(task);

  const idValue = normalizeValue(task.id);
  if (idValue) {
    entry.id = idValue;
  }

  const entryNumber = normalizeValue(task.entryNumber);
  if (entryNumber) {
    entry.entryNumber = entryNumber;
  }

  const documentTitle = normalizeValue(task.document);
  if (documentTitle) {
    entry.document = documentTitle;
  }

  const organization = normalizeValue(task.organization);
  if (organization) {
    entry.organization = organization;
  }

  const status = getTaskStatusValue(task);
  if (status) {
    entry.status = status;
  }

  const dueDate = normalizeValue(task.dueDate);
  if (dueDate) {
    entry.dueDate = dueDate;
  }

  const responsible = normalizeValue(task.responsible);
  if (responsible) {
    entry.responsible = responsible;
  }

  const responsibleList = Array.isArray(task.responsibles)
    ? task.responsibles
      .map((item) => {
        if (!item) {
          return '';
        }
        if (typeof item === 'string') {
          return normalizeValue(item);
        }
        if (typeof item === 'object') {
          return normalizeValue(item.responsible || item.name || item.fio);
        }
        return normalizeValue(item);
      })
      .filter(Boolean)
    : [];

  if (responsibleList.length) {
    entry.responsibles = responsibleList;
  }

  return entry;
}

function logDirectorVisibleTasksOnLoad(reason) {
  const directorState = ensureDirectorState();
  if (!directorState.isActive) {
    return;
  }

  if (typeof console === 'undefined' || !console) {
    return;
  }

  const visibleItems = getVisibleTaskItems();
  const listedItems = visibleItems
    .slice(0, DIRECTOR_LOG_TASK_LIMIT)
    .map(({ task, originalIndex }, index) => buildDirectorTaskLogEntry(task, originalIndex, index));

  const payload = {
    reason,
    filter: formatTaskFiltersForLog(state.taskFilter),
    totalVisible: visibleItems.length,
    listed: listedItems.length,
    tasks: listedItems,
  };

  if (visibleItems.length > listedItems.length) {
    payload.note = `Отображены только первые ${listedItems.length} задач из ${visibleItems.length}.`;
  }

  logDirectorDebug('visible_tasks_on_load', payload);
}

function applyTaskFilter(filters, tasks) {
  const { statusFilters, overdue, assigneeFilters } = splitTaskFilters(filters);
  const source = Array.isArray(tasks) ? tasks : [];
  if (!source.length) {
    return [];
  }

  const directorState = ensureDirectorState();
  const useDirectorOverdue = directorState.isActive === true;

  return source.reduce((result, item, index) => {
    const task = isPlainObject(item) ? item : {};
    let matchesAssignee = true;
    if (assigneeFilters.length) {
      matchesAssignee = assigneeFilters.some((filter) => {
        if (isSubordinateFilter(filter)) {
          const token = getSubordinateFilterToken(filter);
          return taskMatchesSubordinateFilter(task, token);
        }
        if (isResponsibleFilter(filter)) {
          const token = getResponsibleFilterToken(filter);
          return taskMatchesResponsibleFilter(task, token);
        }
        return false;
      });
    }

    let matchesStatus = true;
    if (statusFilters.length || overdue) {
      matchesStatus = false;
      if (overdue) {
        matchesStatus = useDirectorOverdue ? isDirectorAssignmentOverdue(task) : isOverdue(task);
      }
      if (!matchesStatus && statusFilters.length) {
        matchesStatus = statusFilters.some((filter) => {
          const statusKey = getStatusFilterKey(filter);
          return statusKey ? getTaskStatusKeyForUser(task) === statusKey : false;
        });
      }
    }

    if (matchesAssignee && matchesStatus) {
      result.push({ task, originalIndex: index });
    }
    return result;
  }, []);
}

function normalizeTaskIdKey(value) {
  const normalized = normalizeValue(value);
  return normalized ? normalized.toLowerCase() : '';
}

function taskMatchesEntryTask(task, targetId) {
  if (!task || typeof task !== 'object') {
    return false;
  }
  const target = normalizeTaskIdKey(targetId);
  if (!target) {
    return false;
  }
  const candidates = [
    task.id,
    task.entryNumber,
    task.registryNumber,
    task.documentNumber,
  ];
  return candidates.some((candidate) => {
    const normalized = normalizeTaskIdKey(candidate);
    return normalized && normalized === target;
  });
}

function buildVisibleTaskItemsByMatch(tasks, predicate) {
  const source = Array.isArray(tasks) ? tasks : [];
  if (!source.length) {
    return [];
  }
  return source.reduce((result, item, index) => {
    const task = isPlainObject(item) ? item : {};
    if (predicate(task, index)) {
      result.push({ task, originalIndex: index });
    }
    return result;
  }, []);
}

function userHasEntryRoleRestriction() {
  return userHasDirectorAccess() || userIsListedAsResponsible() || userHasSubordinateAccess();
}

function shouldApplyEntryStatusExclusion(filters) {
  const { statusFilters, overdue } = splitTaskFilters(filters);
  if (statusFilters.length || overdue) {
    return false;
  }
  return userHasEntryRoleRestriction();
}

function isTaskExcludedByEntryStatus(task, directorState) {
  const statusKey = getTaskStatusKeyForUser(task);
  if (statusKey && ENTRY_STATUS_EXCLUSIONS.has(statusKey)) {
    return true;
  }
  const statusLabel = normalizeName(getTaskStatusValue(task));
  if (statusLabel && (ENTRY_STATUS_LABEL_EXCLUSIONS.has(statusLabel) || statusLabel.includes('просроч'))) {
    return true;
  }
  if (directorState && directorState.isActive && isDirectorAssignmentOverdue(task)) {
    return true;
  }
  return isOverdue(task);
}

function updateVisibleTasks() {
  const normalizedFilters = normalizeTaskFilters(state.taskFilter);
  state.taskFilter = normalizedFilters;
  const directorState = ensureDirectorState();
  const entryTaskId = normalizeValue(state.entryTaskId);

  if (entryTaskId) {
    state.visibleTasks = buildVisibleTaskItemsByMatch(state.tasks, (task) => taskMatchesEntryTask(task, entryTaskId));
    return;
  }

  const filtered = applyTaskFilter(normalizedFilters, state.tasks);
  let visible = filtered;

  const hasAssigneeFilter = hasAssigneeFilters(normalizedFilters);
  if (directorState.isActive && !hasAssigneeFilter) {
    const directorFiltered = filtered.filter(({ task }) => isTaskAssignedToCurrentDirector(task));

    if (directorState.visibilityRuleLogged === false) {
      logDirectorDebug('visibility_rule_applied', {
        filter: formatTaskFiltersForLog(normalizedFilters),
        responsibleFilter: false,
        totalBefore: filtered.length,
        totalAfter: directorFiltered.length,
        check: 'isTaskAssignedToCurrentDirector',
      });
      directorState.visibilityRuleLogged = true;
    }

    visible = directorFiltered;
  }

  if (shouldApplyEntryStatusExclusion(normalizedFilters)) {
    visible = visible.filter(({ task }) => !isTaskExcludedByEntryStatus(task, directorState));
  }

  if (directorState.isActive) {
    const { statusFilters } = splitTaskFilters(normalizedFilters);
    const showCompleted = statusFilters.some((filter) => getStatusFilterKey(filter) === 'done');
    if (!showCompleted) {
      const withoutCompleted = visible.filter(({ task }) => {
        return getTaskStatusKeyForUser(task) !== 'done';
      });

      if (directorState.completedVisibilityLogged === false) {
        logDirectorDebug('completed_hidden_for_director', {
          filter: formatTaskFiltersForLog(normalizedFilters),
          removed: visible.length - withoutCompleted.length,
        });
        directorState.completedVisibilityLogged = true;
      }

      visible = withoutCompleted;
    }
  }

  state.visibleTasks = visible;
}

function truncateText(value, limit = 140) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function buildTaskOptionLabel(task, index) {
  if (!isPlainObject(task)) {
    return `Задача ${index + 1}`;
  }
  const entry = normalizeValue(task.entryNumber);
  const title = normalizeValue(task.document) || `Документ ${index + 1}`;
  const organization = normalizeValue(task.organization);
  const due = formatDate(task.dueDate);
  const status = getTaskStatusValue(task);

  const parts = [];
  if (entry) {
    parts.push(`№ ${entry}`);
  }
  if (title) {
    parts.push(title);
  }
  if (organization) {
    parts.push(`• ${organization}`);
  }
  if (due && due !== '—') {
    parts.push(`• до ${due}`);
  }
  if (status) {
    parts.push(`• ${status}`);
  }

  const label = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
  return truncateText(label || `Задача ${index + 1}`);
}

function highlightCard(card) {
  if (!(card instanceof HTMLElement)) {
    return;
  }
  const existingTimer = card.dataset.highlightTimer ? Number(card.dataset.highlightTimer) : null;
  if (Number.isInteger(existingTimer)) {
    window.clearTimeout(existingTimer);
  }
  card.classList.add('appdosc-card--highlight');
  const timeoutId = window.setTimeout(() => {
    card.classList.remove('appdosc-card--highlight');
    delete card.dataset.highlightTimer;
  }, CARD_HIGHLIGHT_TIMEOUT);
  card.dataset.highlightTimer = String(timeoutId);
}

function scrollToCard(anchorId) {
  if (!anchorId) {
    return;
  }
  const card = document.getElementById(anchorId);
  if (!card) {
    return;
  }
  setCardExpandedState(card, true);
  try {
    card.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  } catch (error) {
    card.scrollIntoView(true);
  }
  highlightCard(card);
}

function updateTaskSelector() {
  if (!elements.taskSelector || !elements.taskSelectorContainer) {
    return;
  }

  const selector = elements.taskSelector;
  const container = elements.taskSelectorContainer;
  selector.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  const visibleItems = getVisibleTaskItems();
  const hasCards = visibleItems.length > 0;
  const hasTasks = Array.isArray(state.tasks) && state.tasks.length > 0;
  placeholderOption.textContent = hasCards
    ? 'Выберите задачу из списка'
    : hasTasks
      ? 'Нет задач для выбранной категории'
      : 'Задачи отсутствуют';
  selector.appendChild(placeholderOption);

  const cards = elements.cardsContainer
    ? Array.from(elements.cardsContainer.querySelectorAll('[data-card]'))
    : [];

  let selectionExists = false;

  cards.forEach((card, index) => {
    const anchorId = card.id || card.dataset.anchorId;
    if (!anchorId) {
      return;
    }
    const visibleIndexRaw = Number(card.dataset.visibleIndex);
    const hasVisibleIndex = Number.isInteger(visibleIndexRaw) && visibleIndexRaw >= 0;
    const visibleIndex = hasVisibleIndex ? visibleIndexRaw : index;
    const item = visibleItems[visibleIndex] || visibleItems[index] || null;
    const task = item && isPlainObject(item.task) ? item.task : {};
    const label = buildTaskOptionLabel(task, visibleIndex);
    const option = document.createElement('option');
    option.value = anchorId;
    option.textContent = label;
    if (state.selectedCardAnchor && anchorId === state.selectedCardAnchor) {
      option.selected = true;
      selectionExists = true;
    }
    selector.appendChild(option);
  });

  if (!selectionExists) {
    state.selectedCardAnchor = '';
  }
  placeholderOption.disabled = hasCards;
  placeholderOption.selected = !selectionExists;

  selector.value = state.selectedCardAnchor || '';
  container.hidden = false;
  selector.disabled = state.loading || !hasCards;
  if (selector.disabled) {
    selector.setAttribute('aria-disabled', 'true');
  } else {
    selector.removeAttribute('aria-disabled');
  }
}

function handleTaskSelectorChange(event) {
  const value = event?.target?.value || '';
  if (!value) {
    state.selectedCardAnchor = '';
    return;
  }
  state.selectedCardAnchor = value;
  scrollToCard(value);
}

function setCardField(card, selector, value, options = {}) {
  const element = card.querySelector(selector);
  if (!element) {
    return false;
  }

  const {
    fallback = '—',
    hideIfEmpty = false,
    formatter,
    setTitle = true,
  } = options;
  const normalizedRaw = normalizeValue(value);
  const formatted = typeof formatter === 'function'
    ? formatter(value, normalizedRaw)
    : value;
  const normalized = normalizeValue(formatted);

  if (normalized) {
    element.textContent = normalized;
    if (setTitle) {
      element.title = normalized;
    } else {
      element.removeAttribute('title');
    }
    if (hideIfEmpty) {
      element.hidden = false;
    }
    return true;
  }

  if (hideIfEmpty) {
    element.textContent = '';
    element.hidden = true;
    element.removeAttribute('title');
    return false;
  }

  element.textContent = fallback;
  element.removeAttribute('title');
  element.hidden = false;
  return false;
}

function toggleSection(card, selector, shouldShow) {
  const section = card.querySelector(selector);
  if (!section) {
    return;
  }
  section.hidden = !shouldShow;
}

function applyRegistrationDateHeader(card, registrationDate) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const headerDate = card.querySelector('[data-field="registrationDateHeader"]');
  if (!headerDate) {
    return;
  }

  const normalized = normalizeValue(registrationDate);
  const hasDate = normalized && normalized !== '—';

  if (hasDate) {
    headerDate.textContent = normalized;
    headerDate.hidden = false;
    headerDate.dataset.empty = 'false';
    headerDate.title = `Дата регистрации: ${normalized}`;
  } else {
    headerDate.textContent = '';
    headerDate.hidden = true;
    headerDate.dataset.empty = 'true';
    headerDate.removeAttribute('title');
  }
}

function populateCardFiles(card, files) {
  const container = card.querySelector('[data-files]');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const safeFiles = Array.isArray(files)
    ? files.filter((file) => isPlainObject(file) && (
      normalizeValue(file.originalName)
      || normalizeValue(file.storedName)
      || normalizeValue(file.url)
    ))
    : [];

  if (!safeFiles.length) {
    container.hidden = true;
    return;
  }

  container.hidden = false;

  const maxToShow = 3;
  safeFiles.slice(0, maxToShow).forEach((file) => {
    const element = document.createElement('span');
    element.className = 'appdosc-card__file';
    const displayName = normalizeValue(file.originalName)
      || normalizeValue(file.storedName)
      || 'Файл';
    element.textContent = displayName;
    if (displayName) {
      element.title = displayName;
    } else {
      element.removeAttribute('title');
    }
    container.appendChild(element);
  });

  if (safeFiles.length > maxToShow) {
    const more = document.createElement('span');
    more.className = 'appdosc-card__file appdosc-card__file--more';
    const hiddenCount = safeFiles.length - maxToShow;
    more.textContent = `+${hiddenCount}`;
    more.title = `Ещё ${hiddenCount} ${hiddenCount === 1 ? 'файл' : hiddenCount >= 2 && hiddenCount <= 4 ? 'файла' : 'файлов'}`;
    container.appendChild(more);
  }
}

function setCardExpandedState(card, expanded) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const isExpanded = Boolean(expanded);
  card.dataset.expanded = isExpanded ? 'true' : 'false';
  setClass(card, 'appdosc-card--collapsed', !isExpanded);
  rememberCardExpansion(card, isExpanded);

  const toggles = card.querySelectorAll('[data-card-toggle]');
  toggles.forEach((toggle) => {
    if (toggle instanceof HTMLElement) {
      toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }
  });
}

function initializeCardExpansion(card) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const anchorKey = getCardAnchorKey(card);
  const expandedSet = ensureExpandedCardSet();
  if (!card.hasAttribute('data-expanded')) {
    card.dataset.expanded = 'false';
  }
  if (anchorKey && expandedSet.has(anchorKey)) {
    card.dataset.expanded = 'true';
  }

  const toggles = Array.from(card.querySelectorAll('[data-card-toggle]')).filter(
    (toggle) => toggle instanceof HTMLElement,
  );

  setCardExpandedState(card, card.dataset.expanded !== 'false');

  if (!toggles.length) {
    return;
  }

  const toggleSelector = 'button, a, input, select, textarea';
  let ignoreNextClick = false;

  const handleClick = (event) => {
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }
    if (event?.target instanceof Element) {
      const interactive = event.target.closest(toggleSelector);
      if (interactive && interactive !== event.currentTarget) {
        return;
      }
    }
    setCardExpandedState(card, card.dataset.expanded !== 'true');
  };

  const handleKeydown = (event) => {
    if (!event) {
      return;
    }
    const key = event.key;
    if (key !== 'Enter' && key !== ' ') {
      return;
    }
    event.preventDefault();
    ignoreNextClick = true;
    setCardExpandedState(card, card.dataset.expanded !== 'true');
  };

  toggles.forEach((toggle) => {
    if (!toggle) {
      return;
    }
    const controlsTarget = card.id || card.dataset.anchorId;
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', toggle.getAttribute('tabindex') || '0');
    if (controlsTarget) {
      toggle.setAttribute('aria-controls', controlsTarget);
    }
    toggle.addEventListener('click', handleClick);
    toggle.addEventListener('keydown', handleKeydown);
  });
}

function resolveDocumentUrl(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return '';
  }

  try {
    if (typeof window === 'undefined' || !window.location) {
      return normalized.startsWith('/') ? normalized : `/${normalized.replace(/^\/+/, '')}`;
    }
    return new URL(normalized, window.location.origin).toString();
  } catch (error) {
    if (normalized.startsWith('/')) {
      return normalized;
    }
    return `/${normalized.replace(/^\/+/, '')}`;
  }
}

function appendCacheBuster(url) {
  if (!url) {
    return '';
  }
  const timestamp = Date.now().toString();
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('v', timestamp);
    return parsed.toString();
  } catch (error) {
    const separator = String(url).includes('?') ? '&' : '?';
    return `${url}${separator}v=${timestamp}`;
  }
}

let miniAppPdfLibPromise = null;
let miniAppPdfFontkitPromise = null;
let miniAppPdfFontBytesPromise = null;

function ensureMiniAppPdfLib() {
  if (window.PDFLib && window.PDFLib.PDFDocument) {
    return Promise.resolve(window.PDFLib);
  }
  if (miniAppPdfLibPromise) {
    return miniAppPdfLibPromise;
  }
  miniAppPdfLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MINI_APP_PDF_LIB_URL;
    script.async = true;
    script.onload = () => {
      if (window.PDFLib && window.PDFLib.PDFDocument) {
        resolve(window.PDFLib);
      } else {
        reject(new Error('PDF библиотека недоступна.'));
      }
    };
    script.onerror = () => reject(new Error('Не удалось загрузить PDF библиотеку.'));
    document.head.appendChild(script);
  }).catch((error) => {
    miniAppPdfLibPromise = null;
    throw error;
  });
  return miniAppPdfLibPromise;
}

function resolveMiniAppPdfFontkitGlobal() {
  if (window.__pdfFontkitInstance) {
    return window.__pdfFontkitInstance;
  }
  let candidate = window.fontkit || window.Fontkit || window.pdfFontkit;
  if (candidate && candidate.default) {
    candidate = candidate.default;
  }
  if (candidate) {
    window.__pdfFontkitInstance = candidate;
    return candidate;
  }
  return null;
}

function ensureMiniAppPdfFontkit() {
  const existing = resolveMiniAppPdfFontkitGlobal();
  if (existing) {
    return Promise.resolve(existing);
  }
  if (miniAppPdfFontkitPromise) {
    return miniAppPdfFontkitPromise;
  }
  miniAppPdfFontkitPromise = new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-miniapp-fontkit]');
    if (script && script.dataset.fontkitState === 'error') {
      try {
        script.parentNode.removeChild(script);
      } catch (removeError) {
        // ignore
      }
      script = null;
    }
    let resolved = false;
    const handleLoad = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (script) {
        script.dataset.fontkitState = 'loaded';
      }
      const instance = resolveMiniAppPdfFontkitGlobal();
      if (instance) {
        resolve(instance);
      } else {
        reject(new Error('fontkit недоступен после загрузки.'));
      }
    };
    const handleError = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (script) {
        script.dataset.fontkitState = 'error';
      }
      reject(new Error('Не удалось загрузить fontkit.'));
    };

    if (!script) {
      script = document.createElement('script');
      script.src = MINI_APP_PDF_FONTKIT_URL;
      script.async = true;
      script.dataset.miniappFontkit = 'true';
      script.dataset.fontkitState = 'loading';
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    } else {
      if (!script.dataset.fontkitState) {
        script.dataset.fontkitState = 'loading';
      }
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      if (script.readyState === 'loaded' || script.readyState === 'complete') {
        setTimeout(handleLoad, 0);
      }
    }
  }).catch((error) => {
    miniAppPdfFontkitPromise = null;
    throw error;
  });
  return miniAppPdfFontkitPromise;
}

function fetchPdfFontBytes(url) {
  const resolved = appendCacheBuster(url);
  return fetch(resolved, { cache: 'no-store' })
    .then((response) => {
      if (!response || !response.ok) {
        throw new Error(`HTTP ${response ? response.status : '0'} при загрузке ${resolved}`);
      }
      return response.arrayBuffer();
    })
    .then((buffer) => new Uint8Array(buffer));
}

function loadMiniAppPdfFontBytes() {
  if (miniAppPdfFontBytesPromise) {
    return miniAppPdfFontBytesPromise;
  }
  miniAppPdfFontBytesPromise = Promise.all([
    fetchPdfFontBytes(MINI_APP_PDF_FONT_REGULAR_URL),
    fetchPdfFontBytes(MINI_APP_PDF_FONT_BOLD_URL).catch(() => null),
  ])
    .then((fonts) => {
      const regularFont = fonts[0];
      const boldFont = fonts[1] || fonts[0];
      if (!regularFont) {
        throw new Error('Основной шрифт для PDF недоступен.');
      }
      return { regular: regularFont, bold: boldFont };
    })
    .catch((error) => {
      miniAppPdfFontBytesPromise = null;
      throw error;
    });
  return miniAppPdfFontBytesPromise;
}

function sanitizePdfText(font, text) {
  if (text === null || text === undefined) {
    return '';
  }
  const value = String(text);
  if (!font) {
    return value;
  }
  const sanitizer = font.__bimmaxSanitize;
  if (typeof sanitizer === 'function') {
    try {
      return sanitizer(value);
    } catch (error) {
      return value;
    }
  }
  return value;
}

function drawPdfText(page, text, options) {
  if (!page || !options) {
    return;
  }
  const drawOptions = options;
  const font = drawOptions.font;
  const preparedText = sanitizePdfText(font, text);
  page.drawText(preparedText, drawOptions);
}

function drawPdfUnderline(page, text, options) {
  if (!page || !options || !text) {
    return;
  }
  const font = options.font;
  if (!font || typeof font.widthOfTextAtSize !== 'function') {
    return;
  }
  const preparedText = sanitizePdfText(font, text);
  if (!preparedText) {
    return;
  }
  const size = options.size || 10;
  const x = options.x || 0;
  const y = options.y || 0;
  const thickness = options.thickness || 0.8;
  const width = font.widthOfTextAtSize(preparedText, size);
  if (!width || width <= 0) {
    return;
  }
  page.drawRectangle({
    x,
    y: y - thickness - 1.5,
    width,
    height: thickness,
    color: options.color,
    opacity: options.opacity,
  });
}

function wrapTextForPdf(font, text, maxWidth, fontSize) {
  const result = [];
  if (text === null || text === undefined) {
    result.push('—');
    return result;
  }
  const content = String(text);
  if (!content.trim()) {
    result.push('—');
    return result;
  }
  const paragraphs = content.split(/\r?\n/);
  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i].trim();
    if (!paragraph) {
      result.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (let j = 0; j < words.length; j += 1) {
      const word = sanitizePdfText(font, words[j]);
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !current) {
        current = candidate;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current) {
      result.push(current);
    }
  }
  return result;
}

function formatPdfDateTime(value) {
  if (!value) {
    return '';
  }
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleString('ru-RU', { hour12: false });
}

function formatPdfDate(value) {
  if (!value) {
    return '—';
  }
  const date = parseDate(value);
  if (!date) {
    return '—';
  }
  return date.toLocaleDateString('ru-RU');
}

function formatPdfSize(bytes) {
  const size = Number(bytes || 0);
  if (!size || size <= 0) {
    return '';
  }
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const formatted = index === 0 ? Math.round(value).toString() : value.toFixed(1).replace('.', ',');
  return `${formatted} ${units[index]}`;
}

function normalizeValueString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function resolvePersonSummary(person) {
  if (!person || typeof person !== 'object') {
    return '—';
  }
  const name = person.name
    || person.responsible
    || person.email
    || person.telegram
    || person.id
    || '';
  const parts = [];
  if (name) {
    parts.push(String(name));
  }
  if (person.department) {
    parts.push(String(person.department));
  }
  if (person.email) {
    parts.push(String(person.email));
  }
  if (person.telegram) {
    parts.push(`TG: ${person.telegram}`);
  }
  return parts.length ? parts.join('\n') : '—';
}

function buildAssigneeLines(list, fallbackRole, emptyText) {
  if (!Array.isArray(list) || !list.length) {
    return [emptyText];
  }
  const lines = [];
  list.forEach((assignee, index) => {
    if (!assignee) {
      return;
    }
    const nameLine = assignee.name
      ? assignee.name
      : (assignee.id ? `${fallbackRole} #${assignee.id}` : fallbackRole);
    lines.push(nameLine);
    const meta = [];
    if (assignee.department) {
      meta.push(assignee.department);
    }
    if (assignee.telegram) {
      meta.push(`TG: ${assignee.telegram}`);
    }
    if (assignee.email) {
      meta.push(assignee.email);
    }
    if (assignee.status) {
      meta.push(`Статус: ${assignee.status}`);
    }
    if (meta.length) {
      lines.push(meta.join(' • '));
    }
    if (assignee.assignmentComment) {
      lines.push(`Комментарий: ${assignee.assignmentComment}`);
    }
    if (assignee.assignedAt) {
      const assignedAt = formatPdfDateTime(assignee.assignedAt);
      if (assignedAt) {
        lines.push(`Назначено: ${assignedAt}`);
      }
    }
    if (index < list.length - 1) {
      lines.push('');
    }
  });
  return lines;
}

function resolveInstructionSummary(task) {
  if (!task || typeof task !== 'object') {
    return '—';
  }
  let instructionValue = normalizeValueString(task.instruction);
  if (!instructionValue && Array.isArray(task.assignees)) {
    task.assignees.some((assignee) => {
      const candidate = assignee && assignee.assignmentInstruction
        ? normalizeValueString(assignee.assignmentInstruction)
        : '';
      if (candidate) {
        instructionValue = candidate;
        return true;
      }
      return false;
    });
  }
  return instructionValue || '—';
}

function getAttachmentName(file, index) {
  if (!file || typeof file !== 'object') {
    return `Файл ${index || 1}`;
  }
  return normalizeValueString(file.originalName)
    || normalizeValueString(file.name)
    || normalizeValueString(file.storedName)
    || normalizeValueString(file.url)
    || `Файл ${index || 1}`;
}

function buildTaskSummaryRows(task, attachments) {
  const assignees = Array.isArray(task.assignees) ? task.assignees : [];
  const subordinates = Array.isArray(task.subordinates) ? task.subordinates : [];
  const assigneeLines = buildAssigneeLines(assignees, 'Ответственный', 'Не назначен');
  const subordinateLines = buildAssigneeLines(subordinates, 'Подчинённый', 'Не назначены');

  let attachmentsText = 'Нет вложений';
  if (Array.isArray(attachments) && attachments.length) {
    const lines = [];
    attachments.forEach((file, index) => {
      const fileName = getAttachmentName(file, index + 1);
      const metaParts = [];
      if (file && file.size) {
        const sizeText = formatPdfSize(file.size);
        if (sizeText) {
          metaParts.push(sizeText);
        }
      }
      if (file && file.uploadedAt) {
        const uploadedText = formatPdfDateTime(file.uploadedAt);
        if (uploadedText) {
          metaParts.push(uploadedText);
        }
      }
      let description = `${index + 1}. ${fileName}`;
      if (metaParts.length) {
        description += ` (${metaParts.join(' • ')})`;
      }
      lines.push(description);
    });
    attachmentsText = lines.join('\n');
  }

  return [
    { label: 'Номер записи', value: normalizeValueString(task.entryNumber) || '—' },
    { label: 'Регистрационный №', value: normalizeValueString(task.registryNumber) || '—' },
    { label: 'Дата регистрации', value: formatPdfDate(task.registrationDate) },
    { label: 'Тип', value: normalizeValueString(task.direction) || '—' },
    { label: 'Корреспондент', value: normalizeValueString(task.correspondent) || '—' },
    { label: '№ документа', value: normalizeValueString(task.documentNumber) || '—' },
    { label: 'Дата документа', value: formatPdfDate(task.documentDate) },
    { label: 'Исполнитель', value: normalizeValueString(task.executor) || '—' },
    { label: 'Директор', value: resolvePersonSummary(task.director) },
    { label: 'Ответственный', value: assigneeLines.join('\n') },
    { label: 'Подчинённые', value: subordinateLines.join('\n') },
    { label: 'Содержание', value: normalizeValueString(task.summary) || '—' },
    { label: 'Резолюция', value: normalizeValueString(task.resolution) || '—' },
    { label: 'Срок исполнения', value: formatPdfDate(task.dueDate) },
    { label: 'Поручения', value: resolveInstructionSummary(task) },
    { label: 'Статус', value: normalizeValueString(getTaskStatusValue(task)) || '—' },
    { label: 'Файлы', value: attachmentsText },
  ];
}

function sanitizePdfFileName(value) {
  if (!value) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/[\\/:*?"<>|]+/g, '');
  text = text.replace(/\s+/g, '_');
  if (text.length > 120) {
    text = text.slice(0, 120);
  }
  return text;
}

function buildTaskPdfFileName(task, file) {
  const parts = [];
  const entryNumber = normalizeValueString(task && task.entryNumber);
  const documentTitle = normalizeValueString(task && task.document);
  if (entryNumber) {
    parts.push(entryNumber);
  }
  if (documentTitle) {
    parts.push(documentTitle);
  }
  const base = sanitizePdfFileName(parts.join('_') || 'document');
  const fileName = file ? sanitizePdfFileName(getAttachmentName(file)) : '';
  if (fileName) {
    return `${base}_${fileName}.pdf`;
  }
  return `${base}.pdf`;
}

function buildSummaryPdfFileName() {
  return SUMMARY_FILE_PDF_NAME;
}

function isOfficeFile(file) {
  if (!file) {
    return false;
  }
  const nameCandidate = normalizeValueString(file.name)
    || normalizeValueString(file.originalName)
    || normalizeValueString(file.storedName)
    || normalizeValueString(file.url);
  const extension = getFileExtension(nameCandidate);
  return OFFICE_EXTENSIONS.has(extension);
}

function isHeicFile(file) {
  if (!file) {
    return false;
  }
  const nameCandidate = normalizeValueString(file.name)
    || normalizeValueString(file.originalName)
    || normalizeValueString(file.storedName)
    || normalizeValueString(file.url);
  const extension = getFileExtension(nameCandidate);
  if (extension === 'heic' || extension === 'heif') {
    return true;
  }
  const mimeCandidate = normalizeValueString(file.type) || normalizeValueString(file.mimeType);
  if (!mimeCandidate) {
    return false;
  }
  const mime = mimeCandidate.toLowerCase();
  return mime.includes('heic') || mime.includes('heif');
}

function resolveFileFetchUrl(file) {
  const source = file.resolvedUrl || file.url || file.previewUrl || '';
  const resolved = resolveDocumentUrl(source);
  if (!resolved) {
    return '';
  }
  return appendCacheBuster(toAbsoluteUrl(resolved));
}

function buildAttachmentErrorPage(pdfDoc, PDFLib, fonts, colors, margin, file, errorMessage, fileUrl) {
  const page = pdfDoc.addPage([595.28, 841.89]);
  drawAttachmentHeader(page, fonts, colors, file, {
    margin,
    subtitle: errorMessage,
    titlePrefix: 'Вложение',
  });
  const size = page.getSize();
  const width = size.width;
  const startY = size.height - 160;
  const fontSize = 12;
  let lines = [];
  if (fileUrl) {
    lines = wrapTextForPdf(fonts.regular, `Ссылка на оригинал: ${fileUrl}`, width - margin * 2, fontSize);
  }
  if (!lines.length) {
    lines = wrapTextForPdf(fonts.regular, 'Ссылка на оригинал недоступна.', width - margin * 2, fontSize);
  }
  lines.forEach((line, index) => {
    drawPdfText(page, line, {
      x: margin,
      y: startY - index * (fontSize + 2),
      size: fontSize,
      font: fonts.regular,
      color: colors.value,
    });
  });
}

function decodeTextAttachmentBuffer(buffer) {
  if (!buffer) {
    return '';
  }
  const decodeWith = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(buffer);
    } catch (_) {
      return '';
    }
  };
  const utf8 = decodeWith('utf-8');
  const hasReplacement = utf8.includes('\uFFFD');
  const windows1251 = decodeWith('windows-1251');
  const text = windows1251 && hasReplacement ? windows1251 : utf8;
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > 12000 ? normalized.slice(0, 12000) : normalized;
}

function buildAttachmentTextPage(pdfDoc, fonts, colors, margin, file, textContent) {
  let page = pdfDoc.addPage([595.28, 841.89]);
  drawAttachmentHeader(page, fonts, colors, file, {
    margin,
    subtitle: 'TXT-вложение',
    titlePrefix: 'Вложение',
  });
  const width = page.getSize().width;
  const lineHeight = 13;
  const fontSize = 11;
  const bottomLimit = 38;
  let cursorY = page.getSize().height - 98;
  const lines = wrapTextForPdf(fonts.regular, textContent || 'Пустой TXT-файл.', width - margin * 2, fontSize);
  lines.forEach((line) => {
    if (cursorY < bottomLimit) {
      page = pdfDoc.addPage([595.28, 841.89]);
      drawAttachmentHeader(page, fonts, colors, file, {
        margin,
        subtitle: 'TXT-вложение (продолжение)',
        titlePrefix: 'Вложение',
      });
      cursorY = page.getSize().height - 98;
    }
    drawPdfText(page, line, {
      x: margin,
      y: cursorY,
      size: fontSize,
      font: fonts.regular,
      color: colors.value,
    });
    cursorY -= lineHeight;
  });
}

function drawAttachmentHeader(page, fonts, colors, file, options) {
  const margin = options && options.margin ? options.margin : 40;
  const headerHeight = options && options.headerHeight ? options.headerHeight : 72;
  const size = page.getSize();
  const width = size.width;
  const height = size.height;
  page.drawRectangle({
    x: 0,
    y: height - headerHeight,
    width,
    height: headerHeight,
    color: colors.header,
    opacity: 0.9,
  });
  const titlePrefix = options && options.titlePrefix ? options.titlePrefix : 'Вложение';
  const fileName = file && (file.originalName || file.storedName || file.name)
    ? (file.originalName || file.storedName || file.name)
    : 'Файл';
  const titleText = `${titlePrefix}: ${fileName}`;
  const titleLines = wrapTextForPdf(fonts.bold, titleText, width - margin * 2, 14);
  let currentY = height - 28;
  titleLines.forEach((line) => {
    drawPdfText(page, line, {
      x: margin,
      y: currentY,
      size: 14,
      font: fonts.bold,
      color: colors.title,
    });
    currentY -= 16;
  });
  let subtitle = options && options.subtitle ? options.subtitle : '';
  if (!subtitle) {
    const metaParts = [];
    if (file && file.size) {
      const sizeText = formatPdfSize(file.size);
      if (sizeText) {
        metaParts.push(sizeText);
      }
    }
    if (file && file.uploadedAt) {
      const uploadedText = formatPdfDateTime(file.uploadedAt);
      if (uploadedText) {
        metaParts.push(uploadedText);
      }
    }
    if (metaParts.length) {
      subtitle = metaParts.join(' • ');
    }
  }
  if (subtitle) {
    const subtitleLines = wrapTextForPdf(fonts.regular, subtitle, width - margin * 2, 10);
    let subtitleY = height - headerHeight + 18;
    subtitleLines.forEach((line) => {
      drawPdfText(page, line, {
        x: margin,
        y: subtitleY,
        size: 10,
        font: fonts.regular,
        color: colors.muted,
      });
      subtitleY += 12;
    });
  }
}

async function appendTaskAttachmentPages(pdfDoc, PDFLib, fonts, colors, margin, file) {
  if (!file) {
    return;
  }
  if (isOfficeFile(file)) {
    return;
  }
  const resolvedUrl = resolveFileFetchUrl(file);
  if (!resolvedUrl) {
    return;
  }
  try {
    const response = await fetch(resolvedUrl, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Статус ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const mimeType = response.headers && response.headers.get
      ? (response.headers.get('Content-Type') || '').toLowerCase()
      : '';
    const extension = getFileExtension(file.name || file.originalName || file.storedName || file.url || resolvedUrl);
    const isPdf = mimeType.includes('pdf') || extension === 'pdf';
    const isPng = mimeType.includes('png') || extension === 'png';
    const isJpeg = mimeType.includes('jpeg') || mimeType.includes('jpg') || extension === 'jpg' || extension === 'jpeg';
    const isTxt = mimeType.includes('text/plain') || extension === 'txt';

    if (isPdf) {
      const attachment = await PDFLib.PDFDocument.load(buffer);
      const indices = attachment.getPageIndices();
      const copied = await pdfDoc.copyPages(attachment, indices);
      copied.forEach((page) => {
        pdfDoc.addPage(page);
      });
    } else if (isPng || isJpeg) {
      const imagePage = pdfDoc.addPage([595.28, 841.89]);
      drawAttachmentHeader(imagePage, fonts, colors, file, { margin });
      const embedded = isPng ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
      const pageSize = imagePage.getSize();
      const maxWidth = pageSize.width - margin * 2;
      const headerHeight = 72;
      const maxHeight = pageSize.height - headerHeight - margin;
      const dimensions = embedded.scale(1);
      const widthScale = maxWidth / dimensions.width;
      const heightScale = maxHeight / dimensions.height;
      const scale = Math.min(widthScale, heightScale, 1);
      const scaled = embedded.scale(scale);
      const x = (pageSize.width - scaled.width) / 2;
      let y = (pageSize.height - headerHeight - scaled.height) / 2;
      if (y < margin / 2) {
        y = margin / 2;
      }
      imagePage.drawImage(embedded, {
        x,
        y,
        width: scaled.width,
        height: scaled.height,
      });
    } else if (isTxt) {
      const textContent = decodeTextAttachmentBuffer(buffer);
      buildAttachmentTextPage(pdfDoc, fonts, colors, margin, file, textContent);
    } else {
      buildAttachmentErrorPage(pdfDoc, PDFLib, fonts, colors, margin, file,
        'Формат вложения не поддерживается в предпросмотре.', resolvedUrl);
    }
  } catch (error) {
    buildAttachmentErrorPage(pdfDoc, PDFLib, fonts, colors, margin, file,
      `Не удалось загрузить файл: ${error.message}`, resolvedUrl);
  }
}

async function createPdfDocumentWithFonts(PDFLib) {
  const pdfDoc = await PDFLib.PDFDocument.create();
  try {
    const fontkitInstance = await ensureMiniAppPdfFontkit();
    if (fontkitInstance && typeof pdfDoc.registerFontkit === 'function') {
      pdfDoc.registerFontkit(fontkitInstance);
    }
  } catch (error) {
    // ignore fontkit errors
  }

  let fonts;
  try {
    const fontBytes = await loadMiniAppPdfFontBytes();
    fonts = {
      regular: await pdfDoc.embedFont(fontBytes.regular, { subset: true }),
      bold: await pdfDoc.embedFont(fontBytes.bold, { subset: true }),
    };
  } catch (error) {
    fonts = {
      regular: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold),
    };
    const fallbackSanitizer = (value) => String(value || '').replace(/[^\x00-\x7F]/g, '?');
    fonts.regular.__bimmaxSanitize = fallbackSanitizer;
    fonts.bold.__bimmaxSanitize = fallbackSanitizer;
  }

  return { pdfDoc, fonts };
}

function getPdfThemeColors(PDFLib) {
  return {
    header: PDFLib.rgb(0.94, 0.97, 1),
    title: PDFLib.rgb(0.13, 0.2, 0.34),
    value: PDFLib.rgb(0.09, 0.14, 0.24),
    muted: PDFLib.rgb(0.45, 0.52, 0.6),
    label: PDFLib.rgb(0.33, 0.4, 0.52),
    separator: PDFLib.rgb(0.85, 0.9, 0.95),
  };
}

async function generateTaskSummaryPdf(task) {
  if (!task) {
    throw new Error('Задача не найдена.');
  }
  const PDFLib = await ensureMiniAppPdfLib();
  if (!PDFLib || !PDFLib.PDFDocument) {
    throw new Error('PDF библиотека недоступна.');
  }
  const { pdfDoc, fonts } = await createPdfDocumentWithFonts(PDFLib);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const size = page.getSize();
  const width = size.width;
  const height = size.height;
  const margin = 48;
  const colors = getPdfThemeColors(PDFLib);

  page.drawRectangle({
    x: 0,
    y: height - 96,
    width,
    height: 96,
    color: colors.header,
  });
  drawPdfText(page, 'Карточка документа', {
    x: margin,
    y: height - 44,
    size: 22,
    font: fonts.bold,
    color: colors.title,
  });
  if (task.organization) {
    drawPdfText(page, `Организация: ${task.organization}`, {
      x: margin,
      y: height - 70,
      size: 11,
      font: fonts.regular,
      color: colors.muted,
    });
  }
  drawPdfText(page, `Сформировано: ${formatPdfDateTime(new Date())}`, {
    x: margin,
    y: height - 86,
    size: 10,
    font: fonts.regular,
    color: colors.muted,
  });

  const summaryRows = buildTaskSummaryRows(task, task.files || []);
  const labelFontSize = 10;
  const valueFontSize = 10;
  const lineHeight = 14;
  const labelX = margin;
  const valueX = margin + 160;
  const maxValueWidth = width - valueX - margin;
  let currentY = height - 132;

  page.drawRectangle({
    x: margin,
    y: currentY + 10,
    width: width - margin * 2,
    height: 1.2,
    color: colors.separator,
  });
  currentY -= 20;

  summaryRows.forEach((row) => {
    const isInstructionRow = row.label === 'Поручения';
    const valueLines = wrapTextForPdf(fonts.regular, row.value, maxValueWidth, valueFontSize);
    drawPdfText(page, `${row.label}:`, {
      x: labelX,
      y: currentY,
      size: labelFontSize,
      font: fonts.bold,
      color: colors.label,
    });
    if (isInstructionRow) {
      drawPdfUnderline(page, `${row.label}:`, {
        x: labelX,
        y: currentY,
        size: labelFontSize,
        font: fonts.bold,
        color: colors.label,
        thickness: 0.9,
      });
    }
    valueLines.forEach((line, index) => {
      drawPdfText(page, line, {
        x: valueX,
        y: currentY - index * lineHeight,
        size: valueFontSize,
        font: isInstructionRow ? fonts.bold : fonts.regular,
        color: colors.value,
      });
      if (isInstructionRow) {
        drawPdfUnderline(page, line, {
          x: valueX,
          y: currentY - index * lineHeight,
          size: valueFontSize,
          font: fonts.bold,
          color: colors.value,
          thickness: 0.9,
        });
      }
    });
    currentY -= valueLines.length * lineHeight + 6;
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

async function generateTaskAttachmentPdf(task, file) {
  if (!task) {
    throw new Error('Задача не найдена.');
  }
  if (!file) {
    throw new Error('Файл не найден.');
  }
  const PDFLib = await ensureMiniAppPdfLib();
  if (!PDFLib || !PDFLib.PDFDocument) {
    throw new Error('PDF библиотека недоступна.');
  }
  const { pdfDoc, fonts } = await createPdfDocumentWithFonts(PDFLib);
  const colors = getPdfThemeColors(PDFLib);
  const margin = 48;

  await appendTaskAttachmentPages(pdfDoc, PDFLib, fonts, colors, margin, file);
  if (pdfDoc.getPageCount() === 0) {
    buildAttachmentErrorPage(
      pdfDoc,
      PDFLib,
      fonts,
      colors,
      margin,
      file,
      'Вложение недоступно для предпросмотра.',
      resolveFileFetchUrl(file),
    );
  }
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function downloadBlob(blob, filename) {
  if (!blob) {
    return;
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename || 'document.pdf';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function triggerDownloadFromUrl(url, filename) {
  if (!url || typeof document === 'undefined') {
    return false;
  }
  try {
    const link = document.createElement('a');
    link.href = url;
    if (filename) {
      link.download = filename;
    }
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    return false;
  }
}

async function downloadFileFromUrl(url, filename) {
  if (!url || typeof fetch !== 'function') {
    return false;
  }
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      return false;
    }
    const blob = await response.blob();
    downloadBlob(blob, filename);
    return true;
  } catch (error) {
    return false;
  }
}

function getMimeTypeFromFileName(fileName) {
  const ext = getFileExtension(fileName);
  const mimeMap = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    zip: 'application/zip',
    txt: 'text/plain',
    csv: 'text/csv',
    dwg: 'application/acad',
    dxf: 'application/dxf',
    ifc: 'application/x-step',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

async function fetchFileAsBlob(url) {
  if (!url || typeof fetch !== 'function') {
    return null;
  }
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
    if (!response.ok) {
      return null;
    }
    return await response.blob();
  } catch (error) {
    return null;
  }
}

async function shareFileViaNativeShare(blob, fileName) {
  if (!blob || !fileName) {
    return false;
  }
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  try {
    const mimeType = blob.type || getMimeTypeFromFileName(fileName);
    const file = new File([blob], fileName, { type: mimeType });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return false;
    }
    await navigator.share({ files: [file] });
    return true;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return true;
    }
    return false;
  }
}

async function ensureTaskSummaryPreview(task, file) {
  if (!task) {
    throw new Error('Задача не найдена.');
  }
  const cacheTarget = file && typeof file === 'object' ? file : task;
  if (cacheTarget.summaryPdf && cacheTarget.summaryBlobUrl) {
    return {
      ...cacheTarget.summaryPdf,
      previewUrl: cacheTarget.summaryRemoteUrl || cacheTarget.summaryBlobUrl,
      remoteUrl: cacheTarget.summaryRemoteUrl || '',
    };
  }
  if (cacheTarget.summaryPdfPromise) {
    return cacheTarget.summaryPdfPromise;
  }
  cacheTarget.summaryPdfPromise = generateTaskSummaryPdf(task)
    .then((blob) => {
      cacheTarget.summaryPdf = {
        blob,
        fileName: buildSummaryPdfFileName(task),
      };
      if (!cacheTarget.summaryBlobUrl) {
        cacheTarget.summaryBlobUrl = URL.createObjectURL(blob);
      }
      return uploadPdfPreview(blob, cacheTarget.summaryPdf.fileName)
        .then((remoteUrl) => {
          if (remoteUrl) {
            cacheTarget.summaryRemoteUrl = remoteUrl;
          }
          const previewUrl = cacheTarget.summaryRemoteUrl || cacheTarget.summaryBlobUrl;
          return {
            ...cacheTarget.summaryPdf,
            previewUrl,
            remoteUrl: cacheTarget.summaryRemoteUrl || '',
          };
        })
        .catch(() => ({
          ...cacheTarget.summaryPdf,
          previewUrl: cacheTarget.summaryBlobUrl,
          remoteUrl: cacheTarget.summaryRemoteUrl || '',
        }));
    })
    .catch((error) => {
      cacheTarget.summaryPdfPromise = null;
      throw error;
    });
  return cacheTarget.summaryPdfPromise;
}

async function ensureTaskAttachmentPreview(task, file) {
  if (!file) {
    throw new Error('Файл не найден.');
  }
  if (file.previewPdf && file.previewBlobUrl) {
    return {
      ...file.previewPdf,
      previewUrl: file.previewRemoteUrl || file.previewBlobUrl,
      remoteUrl: file.previewRemoteUrl || '',
    };
  }
  if (file.previewPdfPromise) {
    return file.previewPdfPromise;
  }
  file.previewPdfPromise = generateTaskAttachmentPdf(task, file)
    .then((blob) => {
      file.previewPdf = {
        blob,
        fileName: buildTaskPdfFileName(task, file),
        isOffice: isOfficeFile(file),
      };
      if (!file.previewBlobUrl) {
        file.previewBlobUrl = URL.createObjectURL(blob);
      }
      return uploadPdfPreview(blob, file.previewPdf.fileName)
        .then((remoteUrl) => {
          if (remoteUrl) {
            file.previewRemoteUrl = remoteUrl;
          }
          const previewUrl = file.previewRemoteUrl || file.previewBlobUrl;
          return {
            ...file.previewPdf,
            previewUrl,
            remoteUrl: file.previewRemoteUrl || '',
          };
        })
        .catch(() => ({
          ...file.previewPdf,
          previewUrl: file.previewBlobUrl,
          remoteUrl: file.previewRemoteUrl || '',
        }));
    })
    .catch((error) => {
      file.previewPdfPromise = null;
      throw error;
    });
  return file.previewPdfPromise;
}

function revokeSummaryPreview(files) {
  if (!Array.isArray(files)) {
    return;
  }
  files.forEach((file) => {
    if (file && file.previewBlobUrl) {
      URL.revokeObjectURL(file.previewBlobUrl);
      file.previewBlobUrl = '';
    }
    if (file && file.summaryBlobUrl) {
      URL.revokeObjectURL(file.summaryBlobUrl);
      file.summaryBlobUrl = '';
    }
  });
}

function revokeTasksBlobUrls(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return;
  }
  tasks.forEach((task) => {
    if (!task || typeof task !== 'object') {
      return;
    }
    if (task.summaryBlobUrl) {
      try { URL.revokeObjectURL(task.summaryBlobUrl); } catch (_) { /* ignore */ }
      task.summaryBlobUrl = '';
    }
    task.summaryPdfPromise = null;
    task.summaryPdf = null;
    const files = Array.isArray(task.files) ? task.files : [];
    files.forEach((file) => {
      if (!file || typeof file !== 'object') {
        return;
      }
      if (file.previewBlobUrl) {
        try { URL.revokeObjectURL(file.previewBlobUrl); } catch (_) { /* ignore */ }
        file.previewBlobUrl = '';
      }
      if (file.summaryBlobUrl) {
        try { URL.revokeObjectURL(file.summaryBlobUrl); } catch (_) { /* ignore */ }
        file.summaryBlobUrl = '';
      }
      file.previewPdfPromise = null;
      file.previewPdf = null;
    });
  });
}

function buildTasksSignature(visibleTasks) {
  if (!Array.isArray(visibleTasks) || !visibleTasks.length) {
    return '';
  }
  const parts = [];
  for (let i = 0; i < visibleTasks.length; i += 1) {
    const item = visibleTasks[i];
    const task = item && item.task ? item.task : {};
    parts.push(
      (task.id || '') + ':' +
      (task.entryNumber || '') + ':' +
      (task.status || task.statusLabel || '') + ':' +
      (task.updatedAt || '') + ':' +
      (task.dueDate || '')
    );
  }
  return parts.join('|');
}

function resolveFilePreviewSource(file) {
  if (!file || typeof file !== 'object') {
    return null;
  }

  const candidates = [
    file.previewPdfUrl,
    file.previewPdf,
    file.pdfUrl,
    file.pdf,
    file.previewUrl,
    file.preview,
    file.url,
    file.storedName,
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const value = normalizeValue(candidates[index]);
    if (!value) {
      continue;
    }

    const resolved = resolveDocumentUrl(value);
    if (resolved) {
      return { raw: value, resolved };
    }
  }

  return null;
}

function resolveViewerFileKind(fileName, fileUrl) {
  const extension = getFileExtension(fileName || fileUrl || '');
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  return 'document';
}

function resolveTaskViewerFiles(task) {
  if (!task || typeof task !== 'object') {
    return [];
  }

  const files = Array.isArray(task.files) ? task.files : [];
  const result = [];
  result.push({
    name: SUMMARY_FILE_LABEL,
    kind: 'summary',
    isSummary: true,
    url: '',
    resolvedUrl: '',
    previewUrl: '',
  });

  files.forEach((file, index) => {
    if (!file || typeof file !== 'object') {
      return;
    }
    const preview = resolveFilePreviewSource(file);
    if (!preview) {
      return;
    }

    const displayName = normalizeValue(file.originalName)
      || normalizeValue(file.storedName)
      || normalizeValue(task.document)
      || `Документ ${index + 1}`;

    const rawUrl = normalizeValue(file.url)
      || normalizeValue(file.storedName)
      || preview.raw;

    const resolvedUrl = preview.resolved;
    const previewUrl = preview.resolved;
    const kind = resolveViewerFileKind(displayName, rawUrl || resolvedUrl);

    result.push({
      url: rawUrl,
      resolvedUrl,
      previewUrl,
      name: displayName,
      kind,
    });
  });

  if (!result.length) {
    const fallbackUrl = normalizeValue(task.fileUrl);
    if (fallbackUrl) {
      const resolvedUrl = resolveDocumentUrl(fallbackUrl);
      if (resolvedUrl) {
        const name = normalizeValue(task.document) || 'Документ';
        const kind = resolveViewerFileKind(name, resolvedUrl);
        result.push({
          url: fallbackUrl,
          resolvedUrl,
          previewUrl: resolvedUrl,
          name,
          kind,
        });
      }
    }
  }

  return result;
}

function applyStatusBadge(card, statusText, normalizedStatus, task) {
  const statusElement = card.querySelector('[data-field="status"]');
  if (!statusElement) {
    return;
  }

  statusElement.className = 'appdosc-card__status';

  if (!normalizeValue(statusText)) {
    statusElement.hidden = true;
    statusElement.textContent = '';
    statusElement.removeAttribute('title');
    return;
  }

  statusElement.hidden = false;
  statusElement.textContent = statusText;
  statusElement.title = statusText;

  if (isTaskCompleted(task)) {
    statusElement.classList.add('appdosc-card__status--done');
  } else if (isOverdue(task)) {
    statusElement.classList.add('appdosc-card__status--danger');
  } else if (normalizedStatus.includes('контрол')) {
    statusElement.classList.add('appdosc-card__status--warn');
  } else if (normalizedStatus.includes('распредел')) {
    statusElement.classList.add('appdosc-card__status--info');
  } else if (normalizedStatus.includes('работ') || normalizedStatus.includes('нов')) {
    statusElement.classList.add('appdosc-card__status--accent');
  } else {
    statusElement.classList.add('appdosc-card__status--accent');
  }
}

function getFileExtension(value) {
  if (!value) {
    return '';
  }
  const match = String(value).trim().toLowerCase().match(/\.([a-z0-9]{1,10})(?:[#?].*)?$/i);
  return match && match[1] ? match[1] : '';
}

function toAbsoluteUrl(url) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url, window.location.origin).toString();
  } catch (error) {
    return String(url);
  }
}

function isSameOriginUrl(url) {
  if (!url) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch (error) {
    return true;
  }
}

function isOfficePreviewUrl(url) {
  return typeof url === 'string' && url.includes('view.officeapps.live.com/op/embed.aspx');
}

function buildPreviewUrl(resolvedUrl, fileName = '') {
  if (!resolvedUrl) {
    return '';
  }

  const normalized = toAbsoluteUrl(String(resolvedUrl).trim());
  if (normalized.startsWith('blob:') || normalized.startsWith('data:')) {
    return normalized;
  }
  const normalizedWithVersion = appendCacheBuster(normalized);
  const extension = getFileExtension(fileName || normalized);
  const isPdf = extension === 'pdf'
    || normalized.toLowerCase().includes('.pdf')
    || normalized.includes('/cache/miniapp_pdf/');

  if (isPdf) {
    const [base, hash] = normalizedWithVersion.split('#');
    if (hash && hash.includes('zoom=')) {
      return normalizedWithVersion;
    }
    const hashSuffix = hash ? `${hash}&zoom=page-fit` : 'zoom=page-fit';
    return `${base}#${hashSuffix}`;
  }

  if (OFFICE_EXTENSIONS.has(extension)) {
    try {
      const encoded = encodeURIComponent(normalizedWithVersion);
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encoded}`;
    } catch (error) {
      return normalizedWithVersion;
    }
  }

  return normalizedWithVersion;
}

function updateCardViewInfo(card, task) {
  const container = card instanceof HTMLElement ? card.querySelector('[data-card-view-info]') : null;
  if (!container) {
    return;
  }

  const entry = getTaskViewEntryForCurrentUser(task);
  if (entry && entry.viewedAt) {
    const formatted = formatDateTime(entry.viewedAt);
    if (formatted && formatted !== '—') {
      container.textContent = `Просмотрено: ${formatted}`;
      container.hidden = false;
      return;
    }
  }

  container.textContent = 'Просмотрено: —';
  container.hidden = true;
}

function applyLocalTaskViewUpdate(task, timestamp) {
  if (!task || typeof task !== 'object') {
    return;
  }

  const viewedAt = typeof timestamp === 'string' && timestamp ? timestamp : new Date().toISOString();
  if (!Array.isArray(task.assigneeViews)) {
    task.assigneeViews = [];
  }

  const currentEntry = getTaskViewEntryForCurrentUser(task);
  const { ids, names } = getUserIdentifierCandidates();
  const normalizedIds = Array.isArray(ids) && ids.length ? ids : [];
  const normalizedNames = Array.isArray(names) && names.length ? names : [];
  const displayName = state.telegram.fullName
    || [state.telegram.firstName, state.telegram.lastName].filter(Boolean).join(' ')
    || state.telegram.username
    || '';

  if (currentEntry) {
    currentEntry.viewedAt = viewedAt;
    if (!currentEntry.id && normalizedIds.length) {
      currentEntry.id = normalizedIds[0];
    }
    if (!currentEntry.name && displayName) {
      currentEntry.name = displayName;
    }
    if (!currentEntry.assigneeKey) {
      if (normalizedIds.length) {
        currentEntry.assigneeKey = `id::${normalizedIds[0]}`;
      } else if (normalizedNames.length) {
        currentEntry.assigneeKey = `name::${normalizedNames[0]}`;
      }
    }
    return;
  }

  const newEntry = { viewedAt };

  if (normalizedIds.length) {
    newEntry.id = normalizedIds[0];
    newEntry.assigneeKey = `id::${normalizedIds[0]}`;
  } else if (normalizedNames.length) {
    newEntry.assigneeKey = `name::${normalizedNames[0]}`;
  }

  if (displayName) {
    newEntry.name = displayName;
  }

  task.assigneeViews.push(newEntry);
}

function syncTaskViewEntry(task, response, fallbackTimestamp) {
  if (!task || typeof task !== 'object') {
    return;
  }
  const result = response && typeof response === 'object' ? response : {};
  const viewedAt = typeof result.viewedAt === 'string' && result.viewedAt ? result.viewedAt : fallbackTimestamp;
  applyLocalTaskViewUpdate(task, viewedAt);
  const entry = getTaskViewEntryForCurrentUser(task);
  if (!entry) {
    return;
  }
  if (result.assigneeKey && !entry.assigneeKey) {
    entry.assigneeKey = result.assigneeKey;
  }
  if (result.id && !entry.id) {
    entry.id = result.id;
  }
  if (result.name && !entry.name) {
    entry.name = result.name;
  }
}

async function registerTaskView(task, timestamp, card) {
  if (!task || !task.id) {
    return;
  }
  const organization = getTaskOrganization(task);
  if (!organization) {
    return;
  }

  const payload = {
    ...buildRequestBody({ includeInitData: true, includeNameTokens: true }),
    action: 'mini_app_update_task',
    updateType: 'view',
    organization,
    documentId: task.id,
    viewedAt: timestamp,
    trigger: 'mini_app_view',
  };

  const headers = { 'Content-Type': 'application/json' };
  if (state.telegram.initData) {
    headers['X-Telegram-Init-Data'] = state.telegram.initData;
  }

  const response = await fetch('/docs.php?action=mini_app_update_task', {
    method: 'POST',
    headers,
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ошибка ${response.status}`);
  }

  const data = await response.json();
  if (!data || data.success !== true) {
    throw new Error(data && data.error ? data.error : 'Не удалось зафиксировать просмотр.');
  }

  syncTaskViewEntry(task, data, timestamp);
  if (card) {
    updateCardViewInfo(card, task);
  }
}

function buildTaskViewLogDetails(task, extra) {
  const details = {
    taskId: task && task.id ? String(task.id) : '',
    entryNumber: task && task.entryNumber ? String(task.entryNumber) : '',
    organization: getTaskOrganization(task) || '',
    document: normalizeValue(task && task.document ? task.document : '') || '',
  };

  if (state.telegram && typeof state.telegram === 'object') {
    if (state.telegram.id) {
      details.viewerId = state.telegram.id;
    }
    const fullName = state.telegram.fullName
      || [state.telegram.firstName, state.telegram.lastName].filter(Boolean).join(' ');
    if (fullName) {
      details.viewerName = fullName;
    }
    if (state.telegram.username) {
      details.telegram = state.telegram.username;
    }
    if (state.telegram.chatId) {
      details.chatId = state.telegram.chatId;
    }
  }

  return extra && typeof extra === 'object' ? { ...details, ...extra } : details;
}

function buildViewerDownloadLogDetails(task, file, extra) {
  const activeIndex = Number.isFinite(viewerTabsState.activeIndex) ? viewerTabsState.activeIndex : 0;
  const baseDetails = buildTaskViewLogDetails(task || {}, {
    fileName: file ? getAttachmentName(file) : '',
    fileIndex: activeIndex,
  });
  const fileSummary = file ? summarizeViewerFile(file, activeIndex) : null;
  const details = fileSummary ? { ...baseDetails, file: fileSummary } : baseDetails;
  return extra && typeof extra === 'object' ? { ...details, ...extra } : details;
}

function summarizeViewerFile(file, index = 0) {
  if (!file || typeof file !== 'object') {
    return null;
  }
  return {
    index,
    name: normalizeValue(file.name) || '',
    url: normalizeValue(file.url) || '',
    resolvedUrl: normalizeValue(file.resolvedUrl) || '',
    previewUrl: normalizeValue(file.previewUrl) || '',
    kind: normalizeValue(file.kind) || '',
    extension: getFileExtension(file.name || file.url || file.previewUrl || file.resolvedUrl || ''),
  };
}

function logTaskViewClick(task, timestamp) {
  const details = buildTaskViewLogDetails(task, { viewedAt: timestamp });
  logClientEvent('task_view_click', details);
}

function revokeObjectUrlLater(url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      /* ignore */
    }
  }, 30 * 1000);
}

function waitForPdfRenderStatus(viewer, timeoutMs = 2000) {
  if (!viewer || typeof viewer.getPdfRenderStatus !== 'function') {
    return Promise.resolve(null);
  }
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const status = viewer.getPdfRenderStatus();
      if (status && status.status && status.status !== 'pending') {
        resolve(status);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(status || null);
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

async function openPdfInline(previewUrl, fileName, task, viewerOptions) {
  const baseDetails = buildTaskViewLogDetails(task, {
    fileName: fileName || '',
    resolvedUrl: previewUrl,
  });

  logClientEvent('task_view_inline_start', baseDetails);
  logClientEvent('task_view_fetch_start', baseDetails);
  logViewerDebug('inline:start', baseDetails);
  logViewerDebugDeep('inline:fetch_start', {
    url: previewUrl,
    fileName: fileName || '',
    viewerOptions,
  });

  try {
    updateViewerLoaderStep('Скачивание PDF…', 45);
    docLoadStep('fetch pdf начало');
    const response = await fetch(previewUrl, {
      credentials: isSameOriginUrl(previewUrl) ? 'include' : 'omit',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
    const contentType = response.headers ? response.headers.get('content-type') : '';
    const contentLength = response.headers ? response.headers.get('content-length') : '';
    docLoadStep('fetch pdf ответ: ' + response.status);

    if (!response.ok) {
      const error = new Error(`http_${response.status}`);
      logClientEvent('task_view_fetch_error', {
        ...baseDetails,
        status: response.status,
        statusText: response.statusText,
      });
      throw error;
    }

    logClientEvent('task_view_fetch_success', {
      ...baseDetails,
      status: response.status,
      contentType: contentType || 'unknown',
      contentLength: contentLength || 'unknown',
    });

    updateViewerLoaderStep('Чтение данных…', 60);
    docLoadStep('чтение blob');
    const responseHeaders = collectResponseHeaders(response);
    logViewerDebugDeep('inline:fetch_headers', {
      url: response.url || previewUrl,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      responseType: response.type,
      headers: responseHeaders,
    });
    const blob = await response.blob();
    docLoadStep('blob готов: ' + blob.size + ' байт');
    updateViewerLoaderStep('Подготовка рендеринга…', 70);
    const arrayBuffer = await blob.arrayBuffer();
    docLoadStep('arrayBuffer готов');
    const viewer = pdfViewerInstance;
    const viewerReady = viewer && typeof viewer.isReady === 'function' ? viewer.isReady() : false;
    const shouldPassData = true;
    logClientEvent('task_view_inline_headers', {
      ...baseDetails,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      responseType: response.type,
      responseUrl: response.url || previewUrl,
      headers: responseHeaders,
      blobType: blob.type || 'unknown',
      blobSize: blob.size,
    });

    if (viewer) {
      logClientEvent('task_view_inline_viewer_ready', {
        ...baseDetails,
        viewerReady,
        viewerKind: viewerOptions && viewerOptions.kind ? viewerOptions.kind : '',
      });
      logViewerDebug('inline:viewer_ready', { viewerReady, hasOpen: typeof viewer.open === 'function' });
      logViewerDebugDeep('inline:viewer_ready', {
        viewerReady,
        hasOpen: typeof viewer.open === 'function',
        viewerKind: viewerOptions && viewerOptions.kind ? viewerOptions.kind : '',
        options: viewerOptions,
      });
    } else {
      logClientEvent('task_view_inline_viewer_missing', baseDetails);
      logViewerDebug('inline:viewer_missing');
      logViewerDebugDeep('inline:viewer_missing', { viewerOptions });
    }

    if (viewer && typeof viewer.open === 'function') {
      updateViewerLoaderStep('Рендеринг PDF…', 80);
      docLoadStep('viewer.open начало');
      const effectiveViewerOptions = viewerOptions
        ? { ...viewerOptions, forceCanvas: true, isPdf: true }
        : { forceCanvas: true, isPdf: true };
      logViewerDebugDeep('inline:viewer_open', {
        url: previewUrl,
        fileName: fileName || '',
        options: effectiveViewerOptions,
        blob: { type: blob.type || 'unknown', size: blob.size },
      });
      const mode = viewer.open(
        previewUrl,
        fileName || 'Документ',
        effectiveViewerOptions,
        shouldPassData ? arrayBuffer : undefined,
      );
      if (mode) {
        docLoadStep('viewer.open успех');
        if (runtimeEnvironment.isIos) {
          updateViewerLoaderStep('Ожидание рендеринга iOS…', 90);
          docLoadStep('ожидание ios рендеринга');
          const renderStatus = await waitForPdfRenderStatus(viewer, 2200);
          docLoadStep('ios рендеринг: ' + (renderStatus && renderStatus.status ? renderStatus.status : 'нет данных'));
          const hasTotalPages = renderStatus && typeof renderStatus.totalPages === 'number';
          const hasRenderedPages = renderStatus && typeof renderStatus.renderedPages === 'number';
          const incompletePages = hasTotalPages
            && hasRenderedPages
            && renderStatus.totalPages > 0
            && renderStatus.renderedPages < renderStatus.totalPages;
          const incompleteStatus = renderStatus && renderStatus.status && renderStatus.status !== 'complete';
          if (incompletePages || incompleteStatus) {
            logViewerDebug('inline:ios_render_incomplete', renderStatus);
            logViewerDebugDeep('inline:ios_render_incomplete', {
              ...baseDetails,
              renderStatus,
              incompletePages,
              incompleteStatus,
            });
            return null;
          }
        }
        updateViewerLoaderStep('Готово', 100);
        logClientEvent('task_view_inline_success', {
          ...baseDetails,
          mode,
          contentType: contentType || 'unknown',
          size: blob.size,
        });
        logViewerDebug('inline:success', { mode, contentType, size: blob.size });
        logViewerDebugDeep('inline:viewer_mode', { mode, contentType, size: blob.size });
        return 'inline';
      }
    }

    throw new Error('inline_viewer_unavailable');
  } catch (error) {
    logClientEvent('task_view_inline_error', {
      ...baseDetails,
      error: error && error.message ? error.message : String(error),
    });
    logViewerDebug('inline:error', error);
    logViewerDebugDeep('inline:error', {
      message: error && error.message ? error.message : String(error),
      name: error && error.name ? error.name : '',
    });
    return null;
  }
}

async function openInlineFrame(previewUrl, fileName, baseDetails, viewerOptions) {
  const viewer = pdfViewerInstance;
  if (!viewer || typeof viewer.open !== 'function') {
    return null;
  }

  logClientEvent('task_view_inline_attempt', {
    ...baseDetails,
    strategy: 'frame',
    url: previewUrl,
  });
  logViewerDebugDeep('inline:frame_attempt', {
    url: previewUrl,
    fileName: fileName || '',
    viewerOptions,
  });
  updateViewerLoaderStep('Загрузка через iframe…', 80);
  docLoadStep('frame open начало');
  const mode = viewer.open(previewUrl, fileName || 'Документ', viewerOptions);
  if (mode) {
    docLoadStep('frame open успех');
    updateViewerLoaderStep('Готово', 100);
    logClientEvent('task_view_inline_mode', { ...baseDetails, mode, strategy: 'frame' });
    logClientEvent('task_view_inline_success', { ...baseDetails, mode });
    logViewerDebug('inline:frame_success', { mode, url: previewUrl });
    logViewerDebugDeep('inline:frame_success', { mode, url: previewUrl });
    return mode;
  }

  logViewerDebug('inline:frame_unavailable', { url: previewUrl });
  logViewerDebugDeep('inline:frame_unavailable', { url: previewUrl });
  return null;
}

async function detectPdfByContentType(previewUrl, baseDetails) {
  if (!previewUrl || typeof fetch !== 'function') {
    return { isPdf: false, contentType: '', checked: false };
  }

  if (isOfficePreviewUrl(previewUrl)) {
    return { isPdf: false, contentType: '', checked: false };
  }

  if (!isSameOriginUrl(previewUrl)) {
    logViewerDebugDeep('resolve:content_type_skip', {
      ...baseDetails,
      url: previewUrl,
      reason: 'cross_origin',
    });
    return { isPdf: false, contentType: '', checked: false };
  }

  const credentials = isSameOriginUrl(previewUrl) ? 'include' : 'omit';
  const attempts = [
    {
      method: 'HEAD',
      headers: { 'Cache-Control': 'no-cache' },
    },
    {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    },
  ];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      const response = await fetch(previewUrl, {
        method: attempt.method,
        headers: attempt.headers,
        credentials,
        cache: 'no-store',
      });
      const contentType = response.headers ? response.headers.get('content-type') : '';
      const isPdf = /pdf/i.test(contentType || '');

      logViewerDebugDeep('resolve:content_type', {
        ...baseDetails,
        url: previewUrl,
        method: attempt.method,
        status: response.status,
        contentType: contentType || 'unknown',
        isPdf,
      });

      if (response.ok) {
        return { isPdf, contentType: contentType || '', checked: true };
      }
    } catch (error) {
      logViewerDebugDeep('resolve:content_type_error', {
        ...baseDetails,
        url: previewUrl,
        method: attempt.method,
        message: error && error.message ? error.message : String(error),
      });
    }
  }

  return { isPdf: false, contentType: '', checked: false };
}

async function openInlineBlob(previewUrl, fileName, baseDetails, viewerOptions) {
  logClientEvent('task_view_fetch_start', baseDetails);
  logClientEvent('task_view_inline_attempt', {
    ...baseDetails,
    strategy: 'blob',
    url: previewUrl,
  });
  logViewerDebugDeep('inline:blob_fetch_start', {
    url: previewUrl,
    fileName: fileName || '',
    viewerOptions,
  });

  const isSameOrigin = isSameOriginUrl(previewUrl);
  if (isOfficePreviewUrl(previewUrl) && !isSameOrigin) {
    logViewerDebugDeep('inline:blob_skip', {
      url: previewUrl,
      fileName: fileName || '',
      reason: 'office_cross_origin',
    });
    return null;
  }

  try {
    updateViewerLoaderStep('Скачивание файла…', 45);
    docLoadStep('fetch blob начало');
    const response = await fetch(previewUrl, {
      credentials: isSameOrigin ? 'include' : 'omit',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    docLoadStep('fetch blob ответ: ' + response.status);

    updateViewerLoaderStep('Чтение данных…', 60);
    docLoadStep('чтение blob');
    const responseHeaders = collectResponseHeaders(response);
    const blob = await response.blob();
    docLoadStep('blob готов: ' + blob.size + ' байт');
    updateViewerLoaderStep('Подготовка рендеринга…', 75);
    const blobUrl = URL.createObjectURL(blob);
    const viewer = pdfViewerInstance;
    const contentType = response.headers ? response.headers.get('content-type') : '';
    const isPdfResponse = /pdf/i.test(contentType || blob.type || '');
    const wantsPdf = Boolean(viewerOptions && viewerOptions.isPdf);
    const shouldForcePdf = wantsPdf || isPdfResponse;
    const effectiveViewerOptions = shouldForcePdf
      ? { ...viewerOptions, isPdf: true, forceCanvas: true }
      : viewerOptions;

    logClientEvent('task_view_fetch_success', {
      ...baseDetails,
      status: response.status,
      contentType: response.headers ? response.headers.get('content-type') : 'unknown',
      contentLength: response.headers ? response.headers.get('content-length') : 'unknown',
    });
    logClientEvent('task_view_inline_headers', {
      ...baseDetails,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      responseType: response.type,
      responseUrl: response.url || previewUrl,
      headers: responseHeaders,
      blobType: blob.type || 'unknown',
      blobSize: blob.size,
      pdfDetected: isPdfResponse,
    });
    logViewerDebugDeep('inline:blob_headers', {
      url: response.url || previewUrl,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      responseType: response.type,
      headers: responseHeaders,
      blobType: blob.type || 'unknown',
      blobSize: blob.size,
      pdfDetected: isPdfResponse,
    });

    if (viewer && typeof viewer.open === 'function') {
      updateViewerLoaderStep('Рендеринг документа…', 85);
      docLoadStep('viewer.open blob начало');
      logViewerDebugDeep('inline:blob_viewer_open', {
        url: previewUrl,
        fileName: fileName || '',
        options: effectiveViewerOptions,
        blob: { type: blob.type || 'unknown', size: blob.size },
      });
      const mode = viewer.open(blobUrl, fileName || 'Документ', effectiveViewerOptions);
      if (mode) {
        docLoadStep('viewer.open blob успех');
        updateViewerLoaderStep('Готово', 100);
        revokeObjectUrlLater(blobUrl);
        logClientEvent('task_view_inline_mode', { ...baseDetails, mode, strategy: 'blob' });
        logClientEvent('task_view_inline_success', {
          ...baseDetails,
          mode,
          size: blob.size,
        });
        logViewerDebug('inline:blob_success', {
          mode,
          size: blob.size,
          contentType: contentType || blob.type || 'unknown',
          pdfDetected: isPdfResponse,
        });
        logViewerDebugDeep('inline:blob_success', {
          mode,
          size: blob.size,
          contentType: contentType || blob.type || 'unknown',
          pdfDetected: isPdfResponse,
        });
        return mode;
      }
    }

    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    logClientEvent('task_view_fetch_error', {
      ...baseDetails,
      error: error && error.message ? error.message : String(error),
    });
    logViewerDebug('inline:blob_error', error);
    logViewerDebugDeep('inline:blob_error', {
      message: error && error.message ? error.message : String(error),
      name: error && error.name ? error.name : '',
    });
  }

  return null;
}

function openExternalDocument(url) {
  if (!url || typeof window === 'undefined') {
    return null;
  }

  const webApp = window.Telegram && window.Telegram.WebApp;
  if (webApp && typeof webApp.openLink === 'function') {
    try {
      webApp.openLink(url);
      logViewerDebugDeep('open:external', { mode: 'telegram', url });
      return 'telegram';
    } catch (error) {
      // ignore and fallback to window.open
      logViewerDebugDeep('open:external_error', {
        mode: 'telegram',
        url,
        message: error && error.message ? error.message : String(error),
      });
    }
  }

  if (typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener');
    logViewerDebugDeep('open:external', { mode: 'window', url });
    return 'window';
  }

  return null;
}

function getViewerFileToDownload() {
  if (viewerTabsState.activeFile) {
    return viewerTabsState.activeFile;
  }
  if (Array.isArray(viewerTabsState.files) && viewerTabsState.files.length) {
    return viewerTabsState.files[viewerTabsState.activeIndex] || viewerTabsState.files[0];
  }
  return null;
}

function buildDownloadUrl(file) {
  if (!file || typeof file !== 'object') {
    return '';
  }
  const source = file.resolvedUrl || file.url || file.previewUrl || '';
  const resolved = resolveDocumentUrl(source);
  if (!resolved) {
    return '';
  }
  return appendCacheBuster(toAbsoluteUrl(resolved));
}

function updateViewerDownloadState(file) {
  if (!elements.viewerDownload) {
    return;
  }
  const hasFile = Boolean(file && (file.resolvedUrl || file.url || file.previewUrl));
  elements.viewerDownload.disabled = !hasFile;
  elements.viewerDownload.setAttribute('aria-disabled', hasFile ? 'false' : 'true');
}

async function handleViewerDownloadClick() {
  const file = getViewerFileToDownload();
  if (!file) {
    logDownloadConsole('missing_file');
    sendDownloadLog('viewer_download_error', { reason: 'file_missing' });
    setStatus('warning', 'Нет файла для скачивания.');
    return;
  }

  const task = viewerTabsState.task;
  if (!task) {
    logDownloadConsole('missing_task', { fileName: getAttachmentName(file) });
    sendDownloadLog('viewer_download_error', { reason: 'task_missing' });
    setStatus('error', 'Не удалось определить задачу для скачивания.');
    return;
  }

  const isSummary = Boolean(file.isSummary);
  let fileName = getAttachmentName(file);
  if (isSummary) {
    try {
      const summaryPreview = await ensureTaskSummaryPreview(task, file);
      file.previewUrl = summaryPreview.previewUrl;
      file.resolvedUrl = summaryPreview.previewUrl;
      fileName = summaryPreview.fileName || fileName;
    } catch (error) {
      logDownloadConsole('summary_prepare_error', {
        message: error && error.message ? error.message : 'summary_prepare_failed',
      });
    }
  }

  const downloadUrl = buildDownloadUrl(file);
  const isWebPlatform = Boolean(getWebPlatformFlag());
  const hasWebApp = typeof window !== 'undefined'
    && window.Telegram
    && window.Telegram.WebApp;
  const canDirectDownload = isWebPlatform || !hasWebApp;
  const isAndroid = isAndroidPlatform();
  logDownloadConsole('click', {
    fileName,
    downloadUrl,
    platform: isWebPlatform ? 'web' : 'telegram',
  });
  sendDownloadLog('viewer_download_click', buildViewerDownloadLogDetails(task, file, {
    downloadUrl,
    fileName,
    platform: isWebPlatform ? 'web' : 'telegram',
  }));
  setStatus('info', 'Готовим файл для сохранения...');

  if (isAndroid) {
    let androidOpenUrl = downloadUrl;
    if (isSummary && !androidOpenUrl) {
      try {
        const summaryPreview = await ensureTaskSummaryPreview(task, file);
        file.previewUrl = summaryPreview.previewUrl;
        file.resolvedUrl = summaryPreview.previewUrl;
        fileName = summaryPreview.fileName || fileName;
        androidOpenUrl = buildPreviewUrl(summaryPreview.previewUrl, fileName);
      } catch (error) {
        logDownloadConsole('android_summary_prepare_error', {
          message: error && error.message ? error.message : 'summary_prepare_failed',
        });
      }
    }

    if (!androidOpenUrl) {
      const previewCandidate = file.previewUrl || file.resolvedUrl || '';
      const previewUrl = buildPreviewUrl(previewCandidate, fileName);
      if (previewUrl) {
        androidOpenUrl = previewUrl;
      }
    }

    if (androidOpenUrl) {
      const mode = openExternalDocument(androidOpenUrl);
      if (mode) {
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'android_open',
          downloadUrl: androidOpenUrl,
          fileName,
        }));
        setStatus('info', 'Открыли файл в браузере для скачивания.');
        return;
      }
    }
  }

  if (runtimeEnvironment.isIos && !isWebPlatform) {
    logDownloadConsole('ios_share_attempt', { fileName, downloadUrl });
    try {
      let iosBlob = null;
      if (isSummary) {
        const preview = await ensureTaskSummaryPreview(task, file);
        iosBlob = preview.blob;
        fileName = preview.fileName || fileName;
      } else {
        const preview = await ensureTaskAttachmentPreview(task, file);
        iosBlob = preview.blob;
        fileName = preview.fileName || fileName;
      }
      if (!iosBlob && downloadUrl) {
        iosBlob = await fetchFileAsBlob(downloadUrl);
      }
      if (iosBlob) {
        const shared = await shareFileViaNativeShare(iosBlob, fileName);
        if (shared) {
          logDownloadConsole('ios_share_success', { fileName, method: 'native_share' });
          sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
            method: 'ios_native_share',
            fileName,
          }));
          setStatus('info', 'Файл отправлен.');
          return;
        }
        logDownloadConsole('ios_share_not_supported', { fileName });
        downloadBlob(iosBlob, fileName);
        logDownloadConsole('ios_blob_download_fallback', { fileName });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'ios_blob_fallback',
          fileName,
        }));
        setStatus('info', 'Файл подготовлен. Проверьте загрузки.');
        return;
      }
    } catch (error) {
      logDownloadConsole('ios_share_error', {
        message: error && error.message ? error.message : 'ios_share_failed',
        fileName,
      });
    }
  }

  if (isWebPlatform && isSummary) {
    try {
      logDownloadConsole('summary_open_attempt', { fileName });
      const preview = await ensureTaskSummaryPreview(task, file);
      const summaryUrl = buildPreviewUrl(preview.previewUrl, preview.fileName);
      const summaryMode = openExternalDocument(summaryUrl);
      if (summaryMode) {
        logDownloadConsole('summary_open_success', { summaryUrl, mode: summaryMode });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'summary',
          downloadUrl: summaryUrl,
          fileName: preview.fileName || fileName,
        }));
        setStatus('info', 'Открыли файл «Общее» в новой вкладке.');
        return;
      }
    } catch (error) {
      logDownloadConsole('summary_open_error', {
        message: error && error.message ? error.message : 'summary_open_failed',
        fileName,
      });
    }
  }

  if (canDirectDownload && downloadUrl) {
    logDownloadConsole('direct_download_attempt', { downloadUrl, fileName });
    if (isWebPlatform) {
      const fetchDownloadTriggered = await downloadFileFromUrl(downloadUrl, fileName);
      if (fetchDownloadTriggered) {
        logDownloadConsole('direct_download_success', { downloadUrl, fileName, method: 'fetch' });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'direct_fetch',
          downloadUrl,
          fileName,
        }));
        setStatus('info', 'Файл отправлен на скачивание.');
        return;
      }
      logDownloadConsole('direct_download_fallback', { downloadUrl, fileName, method: 'link' });
      const directDownloadTriggered = triggerDownloadFromUrl(downloadUrl, fileName);
      if (directDownloadTriggered) {
        logDownloadConsole('direct_download_success', { downloadUrl, fileName, method: 'link' });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'direct',
          downloadUrl,
          fileName,
        }));
        setStatus('info', 'Файл отправлен на скачивание.');
        return;
      }
    }
    if (!isWebPlatform) {
      const directDownloadTriggered = triggerDownloadFromUrl(downloadUrl, fileName);
      if (directDownloadTriggered) {
        logDownloadConsole('direct_download_success', { downloadUrl, fileName, method: 'link' });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'direct',
          downloadUrl,
          fileName,
        }));
        setStatus('info', 'Файл отправлен на скачивание.');
        return;
      }
    }
  }

  try {
    logDownloadConsole('preview_prepare', { fileName });
    const preview = isSummary
      ? await ensureTaskSummaryPreview(task, file)
      : await ensureTaskAttachmentPreview(task, file);
    downloadBlob(preview.blob, preview.fileName);
    logDownloadConsole('preview_download_success', {
      fileName: preview.fileName || fileName,
      previewUrl: preview.previewUrl || '',
    });
    sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
      method: 'preview',
      previewUrl: preview.previewUrl || '',
      fileName: preview.fileName || fileName,
    }));
    if (preview.isOffice) {
      if (downloadUrl) {
        logDownloadConsole('office_external_open', { downloadUrl, fileName });
        openExternalDocument(downloadUrl);
      }
    }
    setStatus('info', 'Файл подготовлен. Проверьте загрузки или новую вкладку.');
  } catch (error) {
    if (downloadUrl) {
      logDownloadConsole('fallback_download_attempt', { downloadUrl, fileName });
      const directDownloadTriggered = triggerDownloadFromUrl(downloadUrl, fileName);
      if (directDownloadTriggered) {
        logDownloadConsole('fallback_download_success', { downloadUrl, fileName });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'fallback',
          downloadUrl,
          fileName,
        }));
        setStatus('info', 'Файл отправлен на скачивание.');
        return;
      }
    }
    if (downloadUrl) {
      const mode = openExternalDocument(downloadUrl);
      if (mode) {
        logDownloadConsole('external_open_success', { downloadUrl, fileName, mode });
        sendDownloadLog('viewer_download_success', buildViewerDownloadLogDetails(task, file, {
          method: 'external',
          downloadUrl,
          fileName,
        }));
        setStatus('info', 'Файл открыт в новой вкладке для сохранения.');
        return;
      }
    }
    logDownloadConsole('download_error', {
      message: error && error.message ? error.message : 'download_failed',
      fileName,
      downloadUrl,
    });
    sendDownloadLog('viewer_download_error', buildViewerDownloadLogDetails(task, file, {
      reason: error && error.message ? error.message : 'download_failed',
    }));
    setStatus('error', 'Не удалось подготовить файл для скачивания.');
  }
}

async function openDocumentLink(rawUrl, fileName, task, preferredPreviewUrl, viewerOptions = {}) {
  const resolvedUrl = resolveDocumentUrl(rawUrl || preferredPreviewUrl);
  if (!resolvedUrl) {
    logViewerModeDecision('none', 'invalid_url', { rawUrl: rawUrl || '', previewUrl: preferredPreviewUrl || '' });
    return { mode: false };
  }

  const previewSource = preferredPreviewUrl || resolvedUrl;
  const previewUrl = buildPreviewUrl(previewSource, fileName);
  const absolutePreviewUrl = toAbsoluteUrl(previewUrl);
  const baseDetails = buildTaskViewLogDetails(task, {
    fileName: fileName || '',
    resolvedUrl: absolutePreviewUrl,
  });
  const forceFrameRequested = Boolean(viewerOptions && viewerOptions.forceFrame);
  const extension = getFileExtension(fileName || resolvedUrl);
  const normalizedPreview = absolutePreviewUrl.toLowerCase();
  const isMiniAppPdf = normalizedPreview.includes('/cache/miniapp_pdf/');
  const knownPdfByExtension = extension === 'pdf' || normalizedPreview.includes('.pdf') || isMiniAppPdf;
  const knownExtension = Boolean(extension && (knownPdfByExtension || IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension) || OFFICE_EXTENSIONS.has(extension)));
  updateViewerLoaderStep('Определение типа файла…', 35);
  docLoadStep('определение типа');
  const contentTypeCheck = knownExtension
    ? { isPdf: knownPdfByExtension, contentType: '', checked: false }
    : await detectPdfByContentType(absolutePreviewUrl, baseDetails);
  const isPdf = knownPdfByExtension
    || Boolean(contentTypeCheck && contentTypeCheck.isPdf);
  docLoadStep('тип определён: ' + (isPdf ? 'pdf' : extension || 'другой'));
  const disallowFrameForPdf = Boolean(isPdf && !runtimeEnvironment.isIos);
  const isWebPlatform = Boolean(getWebPlatformFlag());
  const disallowFrameForWeb = Boolean(isWebPlatform);
  const allowForceFrameRequest = true;
  const shouldForceFrame = Boolean(forceFrameRequested && allowForceFrameRequest);
  const modeDecisionBase = {
    platform: runtimeEnvironment.isIos ? 'ios' : (runtimeEnvironment.webAppPlatform || ''),
    forceFrameRequested,
    forceFrameAllowed: allowForceFrameRequest,
    forceFrameApplied: shouldForceFrame,
  };
  const effectiveViewerOptions = {
    ...viewerOptions,
    isPdf,
    ...(shouldForceFrame ? { forceFrame: true } : {}),
    ...(isPdf ? { forceCanvas: true } : {}),
  };
  const pdfViewerOptions = {
    ...viewerOptions,
    isPdf: true,
    forceCanvas: true,
  };

  logClientEvent('task_view_resolve', {
    ...baseDetails,
    rawUrl: rawUrl || '',
    resolvedUrl,
    previewUrl: absolutePreviewUrl,
    extension,
    isPdf,
    contentType: contentTypeCheck && contentTypeCheck.contentType ? contentTypeCheck.contentType : '',
    isWebPlatform,
    shouldForceFrame,
    disallowFrameForPdf,
    disallowFrameForWeb,
    forceFrameRequested,
    forceFrameAllowed: allowForceFrameRequest,
    viewerKind: viewerOptions.kind || '',
  });

  logViewFlow('resolve', {
    rawUrl,
    resolvedUrl,
    previewUrl: absolutePreviewUrl,
    fileName: fileName || '',
    extension,
  });
  logViewerDebugDeep('resolve', {
    rawUrl: rawUrl || '',
    resolvedUrl,
    previewUrl: absolutePreviewUrl,
    fileName: fileName || '',
    extension,
    isPdf,
    shouldForceFrame,
    disallowFrameForPdf,
    disallowFrameForWeb,
    forceFrameAllowed: allowForceFrameRequest,
    viewerOptions,
    platform: isWebPlatform,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  });

  if (isPdf && isWebPlatform) {
    logViewFlow('inline:try', { previewUrl: absolutePreviewUrl, platform: 'telegram_web' });
    logViewerDebugDeep('inline:try', { previewUrl: absolutePreviewUrl, platform: 'telegram_web' });
    const inlineMode = await openPdfInline(absolutePreviewUrl, fileName, task, pdfViewerOptions);
    if (inlineMode) {
      logClientEvent('task_view_inline_mode', { ...baseDetails, mode: inlineMode, strategy: 'pdf_inline' });
      logViewerDebugDeep('inline:success', { mode: inlineMode, url: absolutePreviewUrl, platform: 'telegram_web' });
      logViewerModeDecision(inlineMode, 'pdf_inline', {
        ...modeDecisionBase,
        url: absolutePreviewUrl,
        platform: 'telegram_web',
      });
      return { mode: inlineMode };
    }
    logViewerDebug('inline:fallback', { previewUrl: absolutePreviewUrl, reason: 'inline_failed' });
    logViewerDebugDeep('inline:fallback', { previewUrl: absolutePreviewUrl, reason: 'inline_failed' });
    const frameMode = await openInlineFrame(
      absolutePreviewUrl,
      fileName,
      baseDetails,
      { ...viewerOptions, forceFrame: true },
    );
    if (frameMode) {
      logClientEvent('task_view_inline_mode', {
        ...baseDetails,
        mode: frameMode,
        strategy: 'pdf_frame_fallback',
      });
      logViewerDebugDeep('inline:frame_fallback', {
        mode: frameMode,
        url: absolutePreviewUrl,
        platform: 'telegram_web',
      });
      logViewerModeDecision(frameMode, 'pdf_inline_failed_frame', {
        ...modeDecisionBase,
        url: absolutePreviewUrl,
        platform: 'telegram_web',
      });
      return { mode: frameMode };
    }
    setStatusAction(
      'error',
      'Не удалось отрисовать PDF. Откройте файл в новой вкладке.',
      'Открыть в новой вкладке',
      () => openExternalDocument(absolutePreviewUrl),
    );
    logViewerModeDecision('external', 'pdf_inline_failed_external_prompt', {
      ...modeDecisionBase,
      url: absolutePreviewUrl,
      platform: 'telegram_web',
    });
    return { mode: 'external_prompt' };
  }

  if (isPdf) {
    logViewFlow('inline:try', { previewUrl: absolutePreviewUrl });
    logViewerDebugDeep('inline:try', { previewUrl: absolutePreviewUrl });
    const inlineMode = await openPdfInline(absolutePreviewUrl, fileName, task, pdfViewerOptions);
    if (inlineMode) {
      const renderStatus = await waitForPdfRenderStatus(pdfViewerInstance, 1600);
      const hasTotalPages = renderStatus && typeof renderStatus.totalPages === 'number';
      const hasRenderedPages = renderStatus && typeof renderStatus.renderedPages === 'number';
      const incompletePages = hasTotalPages
        && hasRenderedPages
        && renderStatus.totalPages > 0
        && renderStatus.renderedPages < renderStatus.totalPages;
      if (incompletePages) {
        logViewerDebug('inline:render_incomplete', renderStatus);
        logViewerDebugDeep('inline:render_incomplete', {
          ...baseDetails,
          renderStatus,
          incompletePages,
        });
        const frameMode = await openInlineFrame(
          absolutePreviewUrl,
          fileName,
          baseDetails,
          { ...viewerOptions, isPdf: true, forceFrame: true },
        );
        if (frameMode) {
          logClientEvent('task_view_inline_mode', {
            ...baseDetails,
            mode: frameMode,
            strategy: 'pdf_inline_failed_frame_incomplete',
          });
          logViewerDebugDeep('inline:frame_fallback', {
            mode: frameMode,
            url: absolutePreviewUrl,
            strategy: 'pdf_inline_failed_frame_incomplete',
          });
          logViewerModeDecision(frameMode, 'pdf_inline_failed_frame_incomplete', {
            ...modeDecisionBase,
            url: absolutePreviewUrl,
          });
          return { mode: frameMode };
        }
        logViewerDebug('inline:render_incomplete_fallback_failed', renderStatus);
        logViewerDebugDeep('inline:render_incomplete_fallback_failed', {
          ...baseDetails,
          renderStatus,
        });
        setStatusAction(
          'error',
          'Не удалось полностью отрисовать PDF. Откройте файл в новой вкладке.',
          'Открыть в новой вкладке',
          () => openExternalDocument(absolutePreviewUrl),
        );
        logViewerModeDecision('external', 'pdf_inline_failed_external_prompt', {
          ...modeDecisionBase,
          url: absolutePreviewUrl,
        });
        return { mode: 'external_prompt' };
      }
      logClientEvent('task_view_inline_mode', { ...baseDetails, mode: inlineMode, strategy: 'pdf_inline' });
      logViewerDebugDeep('inline:success', { mode: inlineMode, url: absolutePreviewUrl });
      logViewerModeDecision(inlineMode, 'pdf_inline', { ...modeDecisionBase, url: absolutePreviewUrl });
      return { mode: inlineMode };
    }
    logViewerDebug('inline:fallback', { previewUrl: absolutePreviewUrl, reason: 'inline_failed' });
    logViewerDebugDeep('inline:fallback', { previewUrl: absolutePreviewUrl, reason: 'inline_failed' });
    const frameMode = await openInlineFrame(
      absolutePreviewUrl,
      fileName,
      baseDetails,
      { ...viewerOptions, isPdf: true, forceFrame: true },
    );
    if (frameMode) {
      logClientEvent('task_view_inline_mode', { ...baseDetails, mode: frameMode, strategy: 'pdf_frame_fallback' });
      logViewerDebugDeep('inline:frame_fallback', {
        mode: frameMode,
        url: absolutePreviewUrl,
        strategy: 'pdf_inline_failed_frame',
      });
      logViewerModeDecision(frameMode, 'pdf_inline_failed_frame', { ...modeDecisionBase, url: absolutePreviewUrl });
      return { mode: frameMode };
    }
    setStatusAction(
      'error',
      'Не удалось отрисовать PDF. Откройте файл в новой вкладке.',
      'Открыть в новой вкладке',
      () => openExternalDocument(absolutePreviewUrl),
    );
    logViewerModeDecision('external', 'pdf_inline_failed_external_prompt', {
      ...modeDecisionBase,
      url: absolutePreviewUrl,
    });
    return { mode: 'external_prompt' };
  }

  if (!isPdf && shouldForceFrame) {
    logViewFlow('inline:force_frame', { previewUrl: absolutePreviewUrl });
    logViewerDebugDeep('inline:force_frame', { previewUrl: absolutePreviewUrl });
    const frameMode = await openInlineFrame(
      absolutePreviewUrl,
      fileName,
      baseDetails,
      { ...effectiveViewerOptions, forceFrame: true },
    );
    if (frameMode) {
      logViewFlow('open:inline-viewer', { mode: frameMode, url: absolutePreviewUrl });
      logClientEvent('task_view_inline_mode', { ...baseDetails, mode: frameMode, strategy: 'force_frame' });
      logViewerDebugDeep('open:inline-viewer', { mode: frameMode, url: absolutePreviewUrl });
      logViewerModeDecision(frameMode, 'inline_force_frame', {
        ...modeDecisionBase,
        url: absolutePreviewUrl,
      });
      return { mode: frameMode };
    }
  }

  logClientEvent('task_view_inline_start', baseDetails);
  const inlineMode = await openInlineBlob(absolutePreviewUrl, fileName, baseDetails, effectiveViewerOptions);
  const canUseInlineFrame = shouldForceFrame || (!disallowFrameForPdf && !disallowFrameForWeb);
  const frameMode = !inlineMode && canUseInlineFrame
    ? await openInlineFrame(absolutePreviewUrl, fileName, baseDetails, effectiveViewerOptions)
    : null;
  const resolvedInlineMode = inlineMode || frameMode;

  if (resolvedInlineMode) {
    logViewFlow('open:inline-viewer', { mode: resolvedInlineMode, url: absolutePreviewUrl });
    logClientEvent('task_view_inline_mode', { ...baseDetails, mode: resolvedInlineMode, strategy: 'fallback' });
    logViewerDebugDeep('open:inline-viewer', { mode: resolvedInlineMode, url: absolutePreviewUrl });
    logViewerModeDecision(
      resolvedInlineMode,
      inlineMode ? 'inline_blob' : 'inline_frame_fallback',
      {
        ...modeDecisionBase,
        url: absolutePreviewUrl,
        canUseInlineFrame,
      },
    );
    return { mode: resolvedInlineMode };
  }

  if (resolvedInlineMode === null) {
    const externalMode = openExternalDocument(absolutePreviewUrl);
    if (externalMode) {
      logViewFlow('open:external', { mode: externalMode, url: absolutePreviewUrl });
      logViewerDebugDeep('open:external', { mode: externalMode, url: absolutePreviewUrl });
      logViewerModeDecision(externalMode, 'inline_unavailable_external', {
        ...modeDecisionBase,
        url: absolutePreviewUrl,
        canUseInlineFrame,
      });
      return { mode: externalMode };
    }
  }

  logViewFlow('open:failed', 'inline_unavailable');
  logViewerDebugDeep('open:failed', { url: absolutePreviewUrl, reason: 'inline_unavailable' });
  logViewerModeDecision('none', 'inline_unavailable', {
    ...modeDecisionBase,
    url: absolutePreviewUrl,
    canUseInlineFrame,
  });
  logClientEvent('task_view_inline_unavailable', {
    ...baseDetails,
    url: absolutePreviewUrl,
    isPdf,
    forceFrame,
    disallowFrameForPdf,
    disallowFrameForWeb,
  });
  return { mode: false };
}

function setViewerTabActive(index) {
  viewerTabsState.activeIndex = index;
  viewerTabsState.buttons.forEach((button, buttonIndex) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const isActive = buttonIndex === index;
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

async function openViewerFile(file, task, options = {}) {
  const { notify = true, hasMultiple = false } = options;
  logClientEvent('task_view_open_start', {
    ...buildTaskViewLogDetails(task),
    file: summarizeViewerFile(file),
    hasMultiple,
  });
  const isSummary = Boolean(file && file.isSummary);
  const isOffice = isOfficeFile(file);
  const isHeic = isHeicFile(file);
  let preview = null;
  let rawUrl = '';
  let fileName = '';
  let isOfficePreview = false;
  if (isSummary) {
    updateViewerLoaderStep('Генерация сводки…', 10);
    docLoadStep('генерация сводки');
    preview = await ensureTaskSummaryPreview(task, file);
    rawUrl = preview.previewUrl;
    fileName = preview.fileName;
    file.previewUrl = preview.previewUrl;
    file.resolvedUrl = preview.previewUrl;
    docLoadStep('сводка готова');
  } else if (isOffice || isHeic) {
    updateViewerLoaderStep(isHeic ? 'Подготовка HEIC…' : 'Подготовка Office…', 10);
    docLoadStep(isHeic ? 'подготовка heic' : 'подготовка office');
    const officeSource = file && (file.resolvedUrl || file.url || file.previewUrl);
    const resolvedOfficeUrl = resolveDocumentUrl(officeSource || '');
    fileName = getAttachmentName(file);
    if (resolvedOfficeUrl) {
      rawUrl = resolvedOfficeUrl;
      isOfficePreview = isOffice;
      sendOfficeViewerLog(isHeic ? 'start_heic' : 'start', {
        ...buildTaskViewLogDetails(task),
        fileName,
        url: resolvedOfficeUrl,
        source: isHeic ? 'heic' : 'office',
      });
    } else {
      sendOfficeViewerLog(isHeic ? 'fallback_summary_heic' : 'fallback_summary', {
        ...buildTaskViewLogDetails(task),
        fileName,
        reason: isHeic ? 'missing_heic_url' : 'missing_office_url',
      });
      preview = await ensureTaskSummaryPreview(task, file);
      rawUrl = preview.previewUrl;
      fileName = preview.fileName;
    }
    docLoadStep('url подготовлен');
  } else {
    updateViewerLoaderStep('Подготовка документа…', 10);
    docLoadStep('подготовка вложения');
    preview = await ensureTaskAttachmentPreview(task, file);
    rawUrl = preview.previewUrl;
    fileName = preview.fileName;
    docLoadStep('вложение готово');
  }

  updateViewerLoaderStep('Загрузка файла…', 30);
  docLoadStep('открытие документа');

  const desktopImageExternalUrl = file && file.kind === 'image' && isTelegramDesktopPlatform() && preview
    ? preview.remoteUrl
    : '';
  const shouldForceFrame = Boolean(
    (file && file.kind === 'image' && isTelegramDesktopPlatform())
    || isOfficePreview,
  );
  const { mode } = await openDocumentLink(
    rawUrl,
    fileName,
    task,
    rawUrl,
    shouldForceFrame ? { kind: file.kind, forceFrame: true } : { kind: file.kind },
  );

  if (mode === 'inline' || mode === 'window' || mode === 'telegram' || mode === 'external_prompt') {
    viewerTabsState.activeFile = file;
    updateViewerDownloadState(file);
    logClientEvent('task_view_open', {
      ...buildTaskViewLogDetails(task),
      fileName: file.name,
      fileUrl: file.url,
      resolvedUrl: file.resolvedUrl || file.url,
      mode,
    });

    if (notify) {
      if (mode === 'inline') {
        const message = hasMultiple
          ? 'Документы открыты во встроенном просмотрщике. Переключайтесь между вкладками.'
          : 'Файл открыт во встроенном просмотрщике. Используйте жесты для масштабирования.';
        setStatus('info', message);
      } else if (mode === 'external_prompt') {
        // статус уже показан в openDocumentLink
      } else if (mode === 'telegram') {
        setStatus(
          'info',
          'Документ открыт внутри Telegram в формате PDF.',
        );
      } else {
        setStatus('info', 'Документ открыт в новой вкладке.');
      }
    }

    if (isOffice) {
      sendOfficeViewerLog('open', {
        ...buildTaskViewLogDetails(task),
        fileName,
        url: rawUrl,
        mode: mode || '',
      });
    }

    return { mode };
  }

  if (!mode && desktopImageExternalUrl) {
    const externalMode = openExternalDocument(desktopImageExternalUrl);
    if (externalMode) {
      viewerTabsState.activeFile = file;
      updateViewerDownloadState(file);
      logClientEvent('task_view_open', {
        ...buildTaskViewLogDetails(task),
        fileName: file.name,
        fileUrl: file.url,
        resolvedUrl: file.resolvedUrl || file.url,
        mode: externalMode,
      });
      if (notify) {
        setStatus('info', 'Файл открыт в Telegram.');
      }
      return { mode: externalMode };
    }
  }

  if (isOffice) {
    sendOfficeViewerLog('error', {
      ...buildTaskViewLogDetails(task),
      fileName,
      url: rawUrl,
      reason: 'viewer_open_failed',
    });
  }

  throw new Error('viewer_open_failed');
}

async function handleViewerTabClick(index, task) {
  if (viewerTabsState.activeIndex === index) {
    return;
  }

  const file = viewerTabsState.files[index];
  const button = viewerTabsState.buttons[index];
  if (!file) {
    return;
  }

  if (button) {
    button.disabled = true;
  }

  const displayName = file.name || `Файл ${index + 1}`;
  showViewerLoader(displayName);
  docLoadStart(displayName, file.kind || '');
  docLoadStep('переключение вкладки');

  try {
    await openViewerFile(file, task, { notify: false });
    setViewerTabActive(index);
    viewerTabsState.activeFile = file;
    updateViewerDownloadState(file);
    docLoadFinish();
  } catch (error) {
    setStatus('error', 'Не удалось открыть файл. Попробуйте позже.');
    docLoadFinish(error);
  } finally {
    hideViewerLoader();
    if (button) {
      button.disabled = false;
    }
  }
}

function renderViewerTabs(files, task) {
  if (!elements.viewerTabs || !elements.viewerTabsList) {
    viewerTabsState.activeFile = files && files.length ? files[0] : null;
    updateViewerDownloadState(viewerTabsState.activeFile);
    return;
  }

  if (Array.isArray(viewerTabsState.files) && viewerTabsState.files.length) {
    revokeSummaryPreview(viewerTabsState.files);
  }

  elements.viewerTabsList.innerHTML = '';

  if (!Array.isArray(files) || files.length <= 1) {
    elements.viewerTabs.hidden = true;
    viewerTabsState.files = files || [];
    viewerTabsState.buttons = [];
    viewerTabsState.activeIndex = 0;
    viewerTabsState.taskId = task && task.id ? String(task.id) : null;
    viewerTabsState.task = task || null;
    viewerTabsState.activeFile = files && files.length ? files[0] : null;
    updateViewerDownloadState(viewerTabsState.activeFile);
    return;
  }

  elements.viewerTabs.hidden = false;
  viewerTabsState.files = files;
  viewerTabsState.buttons = [];
  viewerTabsState.activeIndex = 0;
  viewerTabsState.taskId = task && task.id ? String(task.id) : null;
  viewerTabsState.task = task || null;
  viewerTabsState.activeFile = files && files.length ? files[0] : null;
  updateViewerDownloadState(viewerTabsState.activeFile);

  files.forEach((file, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc-viewer__tab';
    button.textContent = file.name || `Файл ${index + 1}`;
    if (file.name) {
      button.title = file.name;
    }
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.addEventListener('click', () => handleViewerTabClick(index, task));
    elements.viewerTabsList.appendChild(button);
    viewerTabsState.buttons.push(button);
  });
}

async function handleCardView(button, task) {
  if (!button || !task) {
    return;
  }

  if (button.dataset.loading === 'true') {
    return;
  }

  const card = button.closest('[data-card]');
  const timestamp = new Date().toISOString();

  logTaskViewClick(task, timestamp);
  applyLocalTaskViewUpdate(task, timestamp);
  if (card) {
    updateCardViewInfo(card, task);
  }
  registerTaskView(task, timestamp, card).catch((error) => {
    logViewerDebug('task_view_register_failed', {
      message: error instanceof Error ? error.message : String(error),
      taskId: task.id || '',
      organization: getTaskOrganization(task),
    });
  });

  const files = resolveTaskViewerFiles(task);
  logClientEvent('task_view_files_resolved', {
    ...buildTaskViewLogDetails(task),
    count: files.length,
    files: files.map((file, index) => summarizeViewerFile(file, index)).filter(Boolean),
  });

  if (!files.length) {
    setStatus('warning', 'Для этой задачи нет файла для просмотра.');
    logClientEvent('task_view_error', {
      reason: 'file_missing',
      taskId: task.id || '',
      entryNumber: task.entryNumber || '',
    });
    logClientEvent('task_view_files_empty', {
      ...buildTaskViewLogDetails(task),
      reason: 'no_files',
    });
    return;
  }

  setActionButtonLoading(button, true);

  const firstFile = files[0];
  const displayName = firstFile.name || 'Документ';
  showViewerLoader(displayName);
  docLoadStart(displayName, firstFile.kind || '');
  docLoadStep('подготовка файлов');

  try {
    renderViewerTabs(files, task);
    docLoadStep('открытие файла');
    await openViewerFile(firstFile, task, { notify: true, hasMultiple: files.length > 1 });
    docLoadFinish();
  } catch (error) {
    logViewFlow('open:error', error && error.message ? error.message : String(error));
    setStatus('error', 'Не удалось открыть документ. Попробуйте позже или скачайте файл.');
    logClientEvent('task_view_error', {
      reason: 'open_failed',
      taskId: task.id || '',
      entryNumber: task.entryNumber || '',
      fileUrl: firstFile?.url || '',
      error: error && error.message ? error.message : String(error),
    });
    logClientEvent('task_view_open_failed', {
      ...buildTaskViewLogDetails(task),
      error: error && error.message ? error.message : String(error),
      file: summarizeViewerFile(firstFile, 0),
    });
    docLoadFinish(error);
  } finally {
    hideViewerLoader();
    setActionButtonLoading(button, false);
  }
}

function setActionButtonLoading(button, isLoading) {
  if (!button) {
    return;
  }
  button.dataset.loading = isLoading ? 'true' : 'false';
  button.disabled = Boolean(isLoading);
  setClass(button, 'appdosc-card__action--loading', Boolean(isLoading));
}

function setBulkAssignFeedback(button, message, resetCallback, status) {
  if (!button) {
    return;
  }

  if (button._appdoscFeedbackTimer) {
    window.clearTimeout(button._appdoscFeedbackTimer);
  }

  button.dataset.feedback = 'true';
  if (status) {
    button.dataset.feedbackStatus = status;
  } else {
    delete button.dataset.feedbackStatus;
  }
  button.textContent = message;

  button._appdoscFeedbackTimer = window.setTimeout(() => {
    delete button.dataset.feedback;
    delete button.dataset.feedbackStatus;
    if (typeof resetCallback === 'function') {
      resetCallback();
    }
  }, BULK_ASSIGN_FEEDBACK_TIMEOUT_MS);
}

function setupDirectorCompactCompletion(card, task) {
  if (!card || !task) {
    return;
  }

  const container = card.querySelector('[data-card-compact-actions]');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const organization = getTaskOrganization(task);
  const directorAssigned = organization
    && userIsDirectorForOrganization(organization)
    && isTaskAssignedToCurrentDirector(task)
    && !isTaskCompleted(task);

  if (!directorAssigned) {
    container.hidden = true;
    return;
  }

  const isReviewStatus = isTaskUnderReview(task);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appdosc-card__action appdosc-card__action--compact';
  button.textContent = isReviewStatus ? 'Проверено' : 'Завершить назначение';
  setActionButtonLoading(button, false);

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (button.dataset.loading === 'true') {
      return;
    }

    const confirmMessage = isReviewStatus
      ? 'Отметить задачу как проверенную? Она исчезнет из списка директора и будет доступна в разделе «Выполнено».'
      : 'Завершить задачу? Она исчезнет из списка директора и будет доступна в разделе «Выполнено».';
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) {
      return;
    }

    await handleCardComplete(button, task);
  });

  container.appendChild(button);
  container.hidden = false;
}

function setupCompleteButton(button, task) {
  if (!button) {
    return;
  }
  const completed = isTaskCompleted(task);
  if (!task || !task.id || completed) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.disabled = false;
  setActionButtonLoading(button, false);
  button.addEventListener('click', () => handleCardComplete(button, task));
}

function setupStatusControls(card, task) {
  if (!card || !task) {
    return;
  }
  const container = card.querySelector('[data-card-status]');
  if (!container) {
    return;
  }

  const organization = getTaskOrganization(task);
  if (!organization) {
    container.remove();
    return;
  }

  const isDirector = userIsDirectorForOrganization(organization);
  if (isDirector) {
    container.remove();
    return;
  }

  const canManageByAssignment = userIsResponsibleForTask(task);
  if (!canManageByAssignment) {
    container.remove();
    return;
  }

  const optionsContainer = container.querySelector('[data-card-status-options]');
  if (!optionsContainer) {
    container.remove();
    return;
  }

  const currentStatus = getTaskStatusValue(task);
  const normalizedCurrent = normalizeName(currentStatus);
  optionsContainer.innerHTML = '';

  STATUS_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc-card__status-button';
    button.textContent = option;
    button.dataset.statusValue = option;
    const isActive = normalizedCurrent !== '' && normalizeName(option) === normalizedCurrent;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.addEventListener('click', () => handleStatusButtonClick(optionsContainer, button, task, option));
    optionsContainer.appendChild(button);
  });

  if (!optionsContainer.querySelector('[aria-pressed="true"]') && currentStatus) {
    const fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.className = 'appdosc-card__status-button';
    fallback.textContent = currentStatus;
    fallback.dataset.statusValue = currentStatus;
    fallback.dataset.customStatus = 'true';
    fallback.setAttribute('aria-pressed', 'true');
    fallback.disabled = true;
    optionsContainer.appendChild(fallback);
  }

  container.hidden = false;
}

function setupInstructionControl(card, task) {
  if (!card || !task) {
    return;
  }
  const container = card.querySelector('[data-card-instruction]');
  if (!container) {
    return;
  }
  const organization = getTaskOrganization(task);
  if (organization && userIsDirectorForOrganization(organization)) {
    container.remove();
    return;
  }
  if (userIsListedAsResponsible()) {
    container.remove();
    return;
  }
  const body = container.querySelector('[data-card-instruction-body]');
  if (!body) {
    container.remove();
    return;
  }

  const canEdit = canManageInstructionsForTask(task);
  const currentValue = normalizeValue(task.instruction);
  body.innerHTML = '';

  if (canEdit) {
    const select = document.createElement('select');
    select.className = 'appdosc-card__instruction-select';
    select.dataset.previousInstruction = currentValue;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Не выбрано';
    select.appendChild(placeholder);
    INSTRUCTION_OPTIONS.forEach((option) => {
      const optionNode = document.createElement('option');
      optionNode.value = option;
      optionNode.textContent = option;
      select.appendChild(optionNode);
    });
    select.value = currentValue || '';
    select.addEventListener('change', () => handleInstructionSelectChange(select, task));
    body.appendChild(select);
    container.dataset.editable = 'true';
  } else {
    const valueNode = document.createElement('div');
    valueNode.className = 'appdosc-card__instruction-value';
    valueNode.textContent = currentValue || '—';
    body.appendChild(valueNode);
    container.dataset.editable = 'false';
  }

  container.hidden = false;
}

function setStatusButtonsLoading(container, isLoading, activeButton) {
  if (!container) {
    return;
  }
  const buttons = container.querySelectorAll('[data-status-value]');
  buttons.forEach((btn) => {
    const isCustom = btn.dataset.customStatus === 'true';
    if (isLoading) {
      btn.disabled = true;
      if (btn === activeButton) {
        btn.dataset.loading = 'true';
      }
    } else {
      if (btn.dataset.loading === 'true') {
        delete btn.dataset.loading;
      }
      if (!isCustom) {
        btn.disabled = false;
      }
    }
  });
}

function updateStatusButtonsSelection(container, currentStatus) {
  if (!container) {
    return;
  }
  const currentKey = getStatusSummaryKey(currentStatus);
  container.querySelectorAll('[data-status-value]').forEach((button) => {
    const value = button.dataset.statusValue || '';
    const buttonKey = getStatusSummaryKey(value);
    const isActive = currentKey !== '' && buttonKey !== '' && buttonKey === currentKey;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

async function handleStatusButtonClick(container, button, task, status) {
  if (!container || !button || !task || !task.id) {
    return;
  }
  const targetStatus = normalizeValue(status);
  if (!targetStatus) {
    return;
  }

  if (button.getAttribute('aria-pressed') === 'true') {
    return;
  }

  const currentStatus = getTaskStatusValue(task);
  const currentStatusKey = getStatusSummaryKey(currentStatus);
  const targetStatusKey = getStatusSummaryKey(targetStatus);
  if (targetStatusKey && currentStatusKey && targetStatusKey === currentStatusKey) {
    return;
  }

  const organization = getTaskOrganization(task);
  if (!organization) {
    setStatus('error', 'Не удалось определить организацию задачи.');
    return;
  }

  if (button.dataset.loading === 'true') {
    return;
  }

  setStatusButtonsLoading(container, true, button);
  setStatus('info', 'Обновляем статус...');
  const startedAt = Date.now();
  logClientEvent('task_status_request', {
    taskId: task.id || null,
    organization,
    status: targetStatus,
  });

  try {
    await sendTaskMutation({
      updateType: 'status',
      organization,
      documentId: task.id,
      status: targetStatus,
    });
    logClientEvent('task_status_success', {
      taskId: task.id || null,
      organization,
      status: targetStatus,
      durationMs: Date.now() - startedAt,
    });
    updateStatusButtonsSelection(container, targetStatus);
    setStatus('success', 'Статус обновлён.');
    const refreshPromise = loadTasks(true);
    if (refreshPromise && typeof refreshPromise.catch === 'function') {
      refreshPromise.catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logClientEvent('task_status_error', {
      taskId: task.id || null,
      organization,
      status: targetStatus,
      message,
    });
    setStatus('error', message);
  } finally {
    setStatusButtonsLoading(container, false, button);
  }
}

async function handleInstructionSelectChange(select, task) {
  if (!select || !task || !task.id) {
    return;
  }
  const organization = getTaskOrganization(task);
  if (!organization) {
    setStatus('error', 'Не удалось определить организацию задачи.');
    select.value = select.dataset.previousInstruction || '';
    return;
  }

  const previousValue = normalizeValue(select.dataset.previousInstruction);
  const nextValue = normalizeValue(select.value);
  if (nextValue === previousValue) {
    return;
  }

  if (select.dataset.loading === 'true') {
    return;
  }

  select.dataset.loading = 'true';
  select.classList.add('appdosc-card__instruction-select--loading');
  select.disabled = true;
  setStatus('info', 'Сохраняем поручение...');

  try {
    await sendTaskMutation({
      updateType: 'instruction',
      organization,
      documentId: task.id,
      instruction: nextValue,
    });
    select.dataset.previousInstruction = nextValue;
    setStatus('success', nextValue ? 'Поручение обновлено.' : 'Поручение удалено.');
    await loadTasks(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('error', message);
    select.value = previousValue || '';
  } finally {
    select.dataset.loading = 'false';
    select.classList.remove('appdosc-card__instruction-select--loading');
    select.disabled = false;
  }
}

function setupDueDateEditor(card, task) {
  if (!card || !task) {
    return;
  }
  const container = card.querySelector('[data-card-due-editor]');
  if (!container) {
    return;
  }
  container.remove();
}

async function handleCardComplete(button, task) {
  if (!button || !task || !task.id) {
    return;
  }
  const organization = getTaskOrganization(task);
  if (!organization) {
    setStatus('error', 'Не удалось определить организацию задачи.');
    return;
  }
  if (button.dataset.loading === 'true') {
    return;
  }

  setActionButtonLoading(button, true);
  setStatus('info', 'Отмечаем задачу выполненной...');
  const startedAt = Date.now();
  logClientEvent('task_complete_request', {
    taskId: task.id || null,
    organization,
  });

  try {
    await sendTaskMutation({
      updateType: 'complete',
      organization,
      documentId: task.id,
    });
    logClientEvent('task_complete_success', {
      taskId: task.id || null,
      organization,
      durationMs: Date.now() - startedAt,
    });
    await loadTasks(true);
    setStatus('success', 'Задача отмечена выполненной.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logClientEvent('task_complete_error', {
      taskId: task.id || null,
      organization,
      message,
    });
    setStatus('error', message);
  } finally {
    setActionButtonLoading(button, false);
  }
}

async function sendTaskMutation(update) {
  const {
    updateType,
    organization,
    documentId,
    assigneeId,
    assigneeIds,
    removeAssigneeId,
    removeAssigneeIds,
    subordinateId,
    subordinateIds,
    removeSubordinateId,
    removeSubordinateIds,
    subordinates,
    assignees,
    status,
    dueDate,
    instruction,
  } = update || {};
  if (!updateType || !organization || !documentId) {
    throw new Error('Недостаточно данных для обновления задачи.');
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = Date.now();
  const payload = {
    ...buildRequestBody({ includeInitData: false, includeNameTokens: false }),
    action: 'mini_app_update_task',
    clientRequestId: requestId,
    updateType,
    organization,
    documentId,
  };

  if (Array.isArray(assigneeIds) && assigneeIds.length) {
    payload.assigneeIds = assigneeIds;
  } else if (assigneeId) {
    payload.assigneeId = assigneeId;
  }

  if (Array.isArray(removeAssigneeIds) && removeAssigneeIds.length) {
    payload.removeAssigneeIds = removeAssigneeIds;
  } else if (removeAssigneeId) {
    payload.removeAssigneeId = removeAssigneeId;
  }

  if (Array.isArray(subordinateIds) && subordinateIds.length) {
    payload.subordinateIds = subordinateIds;
  } else if (subordinateId) {
    payload.subordinateId = subordinateId;
  }

  if (Array.isArray(removeSubordinateIds) && removeSubordinateIds.length) {
    payload.removeSubordinateIds = removeSubordinateIds;
  } else if (removeSubordinateId) {
    payload.removeSubordinateId = removeSubordinateId;
  }

  if (Array.isArray(subordinates)) {
    const sanitizedSubordinates = subordinates
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const snapshot = {};
        if (Object.prototype.hasOwnProperty.call(entry, 'id') && entry.id !== undefined) {
          const value = normalizeValue(entry.id);
          if (value) {
            snapshot.id = value;
          }
        }
        if (!snapshot.id && Object.prototype.hasOwnProperty.call(entry, 'subordinateId') && entry.subordinateId !== undefined) {
          const value = normalizeValue(entry.subordinateId);
          if (value) {
            snapshot.subordinateId = value;
          }
        }
        if (!snapshot.id && !snapshot.subordinateId && Object.prototype.hasOwnProperty.call(entry, 'subordinate') && entry.subordinate !== undefined) {
          const value = normalizeValue(entry.subordinate);
          if (value) {
            snapshot.subordinate = value;
          }
        }

        const hasIdentifier = Boolean(snapshot.id || snapshot.subordinateId || snapshot.subordinate);
        if (!hasIdentifier) {
          return null;
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'assignmentComment')) {
          snapshot.assignmentComment = normalizeAssignmentComment(entry.assignmentComment);
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'assignmentDueDate')) {
          const dueDateValue = normalizeAssignmentDueDate(entry.assignmentDueDate);
          if (dueDateValue) {
            snapshot.assignmentDueDate = dueDateValue;
          }
        }

        return snapshot;
      })
      .filter((entry) => entry);

    if (sanitizedSubordinates.length) {
      payload.subordinates = sanitizedSubordinates;
    }

    if (!payload.subordinateIds && sanitizedSubordinates.length) {
      const derivedIds = sanitizedSubordinates
        .map((entry) => normalizeValue(entry.id || entry.subordinateId || entry.subordinate))
        .filter(Boolean);
      if (derivedIds.length) {
        payload.subordinateIds = derivedIds;
      }
    }
  }

  if (Array.isArray(assignees)) {
    const sanitizedAssignees = assignees
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const snapshot = {};
        if (Object.prototype.hasOwnProperty.call(entry, 'id')) {
          const value = normalizeValue(entry.id);
          if (value) {
            snapshot.id = value;
          }
        }

        if (!snapshot.id && Object.prototype.hasOwnProperty.call(entry, 'assigneeId')) {
          const value = normalizeValue(entry.assigneeId);
          if (value) {
            snapshot.id = value;
          }
        }

        if (!snapshot.id) {
          return null;
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'assignmentComment')) {
          snapshot.assignmentComment = normalizeAssignmentComment(entry.assignmentComment);
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'assignmentDueDate')) {
          snapshot.assignmentDueDate = normalizeAssignmentDueDate(entry.assignmentDueDate);
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'assignmentInstruction')) {
          snapshot.assignmentInstruction = normalizeAssignmentInstruction(entry.assignmentInstruction);
        }

        return snapshot;
      })
      .filter((entry) => entry && entry.id);

    if (sanitizedAssignees.length) {
      payload.assignees = sanitizedAssignees;
    }

    if (!payload.assigneeIds && sanitizedAssignees.length) {
      const derivedIds = sanitizedAssignees
        .map((entry) => normalizeValue(entry.id))
        .filter(Boolean);
      if (derivedIds.length) {
        payload.assigneeIds = derivedIds;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(update || {}, 'status') && typeof status === 'string') {
    payload.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(update || {}, 'dueDate')) {
    payload.dueDate = typeof dueDate === 'string' ? dueDate : '';
  }

  if (Object.prototype.hasOwnProperty.call(update || {}, 'instruction')) {
    payload.instruction = typeof instruction === 'string' ? instruction : '';
  }

  logClientEvent('task_update_request', {
    requestId,
    updateType,
    organization,
    documentId,
    payloadKeys: Object.keys(payload),
    assigneeIdsCount: Array.isArray(payload.assigneeIds) ? payload.assigneeIds.length : 0,
    assigneesCount: Array.isArray(payload.assignees) ? payload.assignees.length : 0,
    subordinateIdsCount: Array.isArray(payload.subordinateIds) ? payload.subordinateIds.length : 0,
    subordinatesCount: Array.isArray(payload.subordinates) ? payload.subordinates.length : 0,
    removeAssigneeIdsCount: Array.isArray(payload.removeAssigneeIds) ? payload.removeAssigneeIds.length : 0,
    removeSubordinateIdsCount: Array.isArray(payload.removeSubordinateIds) ? payload.removeSubordinateIds.length : 0,
  });

  const headers = { 'Content-Type': 'application/json' };
  if (state.telegram.initData) {
    headers['X-Telegram-Init-Data'] = state.telegram.initData;
  }
  headers['X-Client-Request-Id'] = requestId;

  const body = JSON.stringify(payload);
  const assigneeAssignments = Array.isArray(payload.assignees) ? payload.assignees : [];
  const subordinateAssignments = Array.isArray(payload.subordinates) ? payload.subordinates : [];
  logClientEvent('task_update_request_debug', {
    requestId,
    updateType,
    organization,
    documentId,
    payloadKeys: Object.keys(payload),
    payloadSize: body ? body.length : 0,
    initDataPresent: Boolean(state.telegram.initData),
    initDataLength: state.telegram.initData ? state.telegram.initData.length : 0,
    assigneeIdsSample: Array.isArray(payload.assigneeIds) ? payload.assigneeIds.slice(0, 8) : [],
    subordinateIdsSample: Array.isArray(payload.subordinateIds) ? payload.subordinateIds.slice(0, 8) : [],
    removeAssigneeIdsSample: Array.isArray(payload.removeAssigneeIds) ? payload.removeAssigneeIds.slice(0, 8) : [],
    removeSubordinateIdsSample: Array.isArray(payload.removeSubordinateIds) ? payload.removeSubordinateIds.slice(0, 8) : [],
    assigneeAssignmentsPreview: buildTaskUpdateAssignmentPreview(assigneeAssignments, 3),
    subordinateAssignmentsPreview: buildTaskUpdateAssignmentPreview(subordinateAssignments, 3),
    assigneeAssignmentsMeta: buildTaskUpdateAssignmentMeta(assigneeAssignments),
    subordinateAssignmentsMeta: buildTaskUpdateAssignmentMeta(subordinateAssignments),
  });

  const response = await fetch('/docs.php?action=mini_app_update_task', {
    method: 'POST',
    headers,
    credentials: 'include',
    body,
  });

  logClientEvent('task_update_response_debug', {
    requestId,
    updateType,
    organization,
    documentId,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    responseUrl: response.url || '',
    contentType: response.headers.get('content-type') || '',
    server: response.headers.get('server') || '',
  });

  if (!response.ok) {
    let responseText = '';
    try {
      responseText = await response.text();
    } catch (error) {
      responseText = '';
    }
    logClientEvent('task_update_error', {
      requestId,
      updateType,
      organization,
      documentId,
      status: response.status,
      durationMs: Date.now() - startedAt,
      responsePreview: responseText ? responseText.slice(0, 700) : '',
      responseTextLength: responseText ? responseText.length : 0,
    });
    const requestError = new Error(`Ошибка ${response.status}`);
    requestError.status = response.status;
    if (responseText) {
      requestError.responseText = responseText;
    }
    throw requestError;
  }

  const data = await response.json();
  if (!data || data.success !== true) {
    const message = data && data.error ? data.error : 'Не удалось обновить задачу.';
    logClientEvent('task_update_error', {
      requestId,
      updateType,
      organization,
      documentId,
      durationMs: Date.now() - startedAt,
      message,
    });
    throw new Error(message);
  }

  logClientEvent('task_update_response', {
    requestId,
    updateType,
    organization,
    documentId,
    durationMs: Date.now() - startedAt,
  });

  return data;
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed && trimmed !== '—' ? trimmed : '';
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? '' : String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toLocaleString('ru-RU');
  }

  const string = String(value).trim();
  return string && string !== '—' ? string : '';
}

function normalizeAssignmentComment(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).replace(/\r\n/g, '\n');
  const trimmed = text.trim();
  if (trimmed.length > 500) {
    return trimmed.slice(0, 500);
  }
  return trimmed;
}

function normalizeAssignmentDueDate(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return '';
  }

  // Поддерживаем значения в формате YYYY-MM-DD.
  const match = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return '';
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeAssignmentInstruction(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, 600);
}

function buildTaskUpdateAssignmentPreview(entries, maxItems = 3) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .slice(0, maxItems)
    .map((entry) => {
      const preview = {};

      if (Object.prototype.hasOwnProperty.call(entry, 'id')) {
        preview.id = normalizeValue(entry.id);
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'subordinateId')) {
        preview.subordinateId = normalizeValue(entry.subordinateId);
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'subordinate')) {
        preview.subordinate = normalizeValue(entry.subordinate);
      }

      const comment = normalizeAssignmentComment(entry.assignmentComment);
      if (comment) {
        preview.assignmentComment = truncateText(comment, 80);
      }

      const dueDate = normalizeAssignmentDueDate(entry.assignmentDueDate);
      if (dueDate) {
        preview.assignmentDueDate = dueDate;
      }

      const instruction = normalizeAssignmentInstruction(entry.assignmentInstruction);
      if (instruction) {
        preview.assignmentInstruction = truncateText(instruction, 80);
      }

      return preview;
    })
    .filter((entry) => Object.keys(entry).length > 0);
}

function buildTaskUpdateAssignmentMeta(entries) {
  if (!Array.isArray(entries)) {
    return null;
  }

  const meta = {
    total: entries.length,
    withComment: 0,
    withDueDate: 0,
    withInstruction: 0,
  };

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    if (normalizeAssignmentComment(entry.assignmentComment)) {
      meta.withComment += 1;
    }
    if (normalizeAssignmentDueDate(entry.assignmentDueDate)) {
      meta.withDueDate += 1;
    }
    if (normalizeAssignmentInstruction(entry.assignmentInstruction)) {
      meta.withInstruction += 1;
    }
  });

  return meta;
}

function buildSubordinateCommentKey(candidate) {
  if (candidate === null || candidate === undefined) {
    return '';
  }

  const normalized = normalizeIdentifier(candidate);
  if (normalized) {
    return normalized;
  }

  const value = normalizeValue(candidate);
  return value || '';
}

function collectSubordinateCommentKeyCandidates(entry, fallbackValue) {
  const candidates = [];
  const push = (candidate) => {
    const key = buildSubordinateCommentKey(candidate);
    if (key && !candidates.includes(key)) {
      candidates.push(key);
    }
  };

  push(fallbackValue);

  if (entry && typeof entry === 'object') {
    [
      entry.id,
      entry.subordinateId,
      entry.subordinate,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ].forEach(push);
  }

  return candidates;
}

function normalizeIdentifier(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  const string = String(value).trim();
  if (!string) {
    return '';
  }
  return string.replace(/^@+/, '').toLowerCase().replace(/\s+/g, '');
}

function normalizeResponsibleKey(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const string = String(value).trim().toLowerCase();
  return string;
}

function normalizeResponsibleCompact(value) {
  const normalized = normalizeResponsibleKey(value);
  if (!normalized) {
    return '';
  }
  return normalized.replace(/[^a-z0-9а-яё]+/gu, '');
}

function collectResponsibleSearchTokens(...sources) {
  const tokens = new Set();

  const process = (raw) => {
    if (raw === null || raw === undefined) {
      return;
    }

    if (raw instanceof Set) {
      raw.forEach(process);
      return;
    }

    if (Array.isArray(raw)) {
      raw.forEach(process);
      return;
    }

    const normalized = normalizeResponsibleKey(raw);
    if (normalized) {
      tokens.add(normalized);
      const compact = normalizeResponsibleCompact(normalized);
      if (compact) {
        tokens.add(compact);
      }
    }

    const identifier = normalizeIdentifier(raw);
    if (identifier) {
      const normalizedId = normalizeResponsibleKey(identifier);
      if (normalizedId) {
        tokens.add(normalizedId);
        const compactId = normalizeResponsibleCompact(normalizedId);
        if (compactId) {
          tokens.add(compactId);
        }
      }
    }
  };

  sources.forEach(process);

  return tokens;
}

function hasTokenIntersection(tokensA, tokensB) {
  if (!(tokensA instanceof Set) || !(tokensB instanceof Set)) {
    return false;
  }

  if (!tokensA.size || !tokensB.size) {
    return false;
  }

  if (tokensA.size < tokensB.size) {
    for (const token of tokensA) {
      if (tokensB.has(token)) {
        return true;
      }
    }
    return false;
  }

  for (const token of tokensB) {
    if (tokensA.has(token)) {
      return true;
    }
  }

  return false;
}

function mergeProfileSearchTokens(entry, profile) {
  if (!entry || !profile) {
    return;
  }

  if (!(entry.searchTokens instanceof Set)) {
    entry.searchTokens = new Set();
  }

  entry.searchTokens.add(entry.token);

  const tokens = collectResponsibleSearchTokens(
    entry.token,
    profile.token,
    profile.searchTokens,
    profile.label,
    profile.sourceLabel,
  );

  tokens.forEach((value) => {
    const normalized = normalizeResponsibleKey(value);
    if (normalized) {
      entry.searchTokens.add(normalized);
    }
  });
}

function normalizeName(value) {
  const text = normalizeValue(value);
  return text ? text.toLowerCase() : '';
}

function getOrganizationKey(name) {
  return normalizeName(name);
}

function getResponsiblesForOrganization(organization) {
  const key = getOrganizationKey(organization);
  const list = state.access?.responsibles?.[key];
  return Array.isArray(list) ? list : [];
}

function getSubordinatesForOrganization(organization) {
  const key = getOrganizationKey(organization);
  const list = state.access?.subordinates?.[key];
  return Array.isArray(list) ? list : [];
}

function mergeAssignmentSource(existing, incoming) {
  const current = existing ? String(existing).toLowerCase() : '';
  const next = incoming ? String(incoming).toLowerCase() : '';
  if (!current) {
    return next;
  }
  if (!next || current === next) {
    return current;
  }
  if (current === 'both') {
    return current;
  }
  return 'both';
}

function resolveAssignmentSortName(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const candidates = [
    entry.responsible,
    entry.name,
    entry.email,
    entry.telegram,
    entry.number,
  ];
  for (const candidate of candidates) {
    const value = normalizeValue(candidate);
    if (value) {
      return value;
    }
  }
  return '';
}

function buildAssignmentCandidateList(responsibles, subordinates) {
  const result = [];
  const keyIndex = new Map();

  const registerEntry = (entry, source) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const candidates = [
      resolveResponsibleOptionValue(entry),
      entry.id,
      entry.subordinateId,
      entry.subordinate,
      entry.telegram,
      entry.chatId,
      entry.email,
      buildAssignmentNumberKey(entry),
      entry.login,
      entry.responsible,
      entry.name,
    ];

    const entryKeys = new Set();
    candidates.forEach((candidate) => {
      const key = buildAssignmentDirectoryKey(candidate);
      if (key) {
        entryKeys.add(key);
      }
    });

    let existingIndex = null;
    for (const key of entryKeys) {
      if (keyIndex.has(key)) {
        existingIndex = keyIndex.get(key);
        break;
      }
    }

    if (existingIndex !== null) {
      const existingEntry = result[existingIndex];
      existingEntry.assignmentSource = mergeAssignmentSource(existingEntry.assignmentSource, source);
      entryKeys.forEach((key) => keyIndex.set(key, existingIndex));
      return;
    }

    const clone = { ...entry, assignmentSource: source };
    result.push(clone);
    const newIndex = result.length - 1;
    entryKeys.forEach((key) => keyIndex.set(key, newIndex));
  };

  if (Array.isArray(responsibles)) {
    responsibles.forEach((entry) => registerEntry(entry, 'responsible'));
  }
  if (Array.isArray(subordinates)) {
    subordinates.forEach((entry) => registerEntry(entry, 'subordinate'));
  }

  const collator = new Intl.Collator('ru', { sensitivity: 'base' });
  result.sort((a, b) => collator.compare(resolveAssignmentSortName(a), resolveAssignmentSortName(b)));

  return result;
}

function getTaskOrganizationKey(task) {
  if (!task || typeof task !== 'object') {
    return '';
  }

  const candidates = [
    task.organization,
    task.organizationName,
    task.organizationTitle,
    task.organizationFullName,
    task.organizationShortName,
    task.org,
  ];

  for (const candidate of candidates) {
    const key = getOrganizationKey(candidate);
    if (key) {
      return key;
    }
  }

  return '';
}

function getDirectorsForOrganization(organization) {
  const key = getOrganizationKey(organization);
  const list = state.access?.directors?.[key];
  return Array.isArray(list) ? list : [];
}

function getUserIdentifierCandidates() {
  const idCandidates = [];
  const nameCandidates = [];

  const pushId = (value) => {
    const normalized = normalizeIdentifier(value);
    if (normalized) {
      idCandidates.push(normalized);
    }
  };

  const pushName = (value) => {
    const normalized = normalizeName(value);
    if (normalized) {
      nameCandidates.push(normalized);
    }
  };

  pushId(state.telegram.id);
  pushId(state.telegram.chatId);
  pushId(state.telegram.username);

  pushName(state.telegram.fullName);
  pushName([state.telegram.firstName, state.telegram.lastName].filter(Boolean).join(' '));

  return {
    ids: Array.from(new Set(idCandidates)),
    names: Array.from(new Set(nameCandidates)),
  };
}

function entryMatchesUser(entry, ids, names) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const idList = Array.isArray(ids) ? ids : [];
  const nameList = Array.isArray(names) ? names : [];

  if (idList.length) {
    const idFields = ['telegram', 'chatId', 'id', 'number', 'email', 'login', 'userId', 'token'];
    for (const field of idFields) {
      if (!entry[field]) {
        continue;
      }
      const normalized = normalizeIdentifier(entry[field]);
      if (normalized && idList.includes(normalized)) {
        return true;
      }
    }
  }

  if (nameList.length) {
    const nameFields = ['responsible', 'name', 'fio', 'fullName', 'displayName'];
    for (const field of nameFields) {
      if (!entry[field]) {
        continue;
      }
      const normalizedName = normalizeName(entry[field]);
      if (normalizedName && nameList.includes(normalizedName)) {
        return true;
      }
    }
  }

  return false;
}

function userIsDirectorForOrganization(organization) {
  const directors = getDirectorsForOrganization(organization);
  if (!directors.length) {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  return directors.some((entry) => entryMatchesUser(entry, ids, names));
}

function userHasDirectorAccess() {
  const directorState = ensureDirectorState();
  if (Array.isArray(directorState.organizations) && directorState.organizations.length > 0) {
    return true;
  }

  if (!state.access || typeof state.access.directors !== 'object') {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  return Object.keys(state.access.directors).some((key) => {
    const entries = Array.isArray(state.access.directors[key]) ? state.access.directors[key] : [];
    return entries.some((entry) => entryMatchesUser(entry, ids, names));
  });
}

function userHasSubordinateAccess() {
  if (!state.access || typeof state.access.subordinates !== 'object') {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  return Object.keys(state.access.subordinates).some((key) => {
    const entries = Array.isArray(state.access.subordinates[key])
      ? state.access.subordinates[key]
      : [];
    return entries.some((entry) => entryMatchesUser(entry, ids, names));
  });
}

function userIsListedAsResponsible() {
  if (!state.access || typeof state.access.responsibles !== 'object') {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  return Object.keys(state.access.responsibles).some((key) => {
    const entries = Array.isArray(state.access.responsibles[key])
      ? state.access.responsibles[key]
      : [];

    return entries.some((entry) => {
      if (entry && typeof entry === 'object') {
        return entryMatchesUser(entry, ids, names);
      }

      const normalized = normalizeName(entry);
      return normalized && names.includes(normalized);
    });
  });
}

function userCanManageInstructionsForOrganization(organization) {
  if (state.permissions && state.permissions.canManageInstructions) {
    return true;
  }
  const key = getOrganizationKey(organization);
  if (key && state.access && typeof state.access.instruction === 'object') {
    const flag = state.access.instruction[key];
    if (typeof flag === 'boolean') {
      return flag;
    }
  }
  return userIsDirectorForOrganization(organization);
}

function canManageInstructionsForTask(task) {
  const organization = getTaskOrganization(task);
  if (!organization) {
    return Boolean(state.permissions && state.permissions.canManageInstructions);
  }
  return userCanManageInstructionsForOrganization(organization);
}

function userIsResponsibleForTask(task) {
  if (!task || typeof task !== 'object') {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  const assigneeIds = getTaskAssigneeIdentifiers(task);
  if (assigneeIds.some((identifier) => ids.includes(identifier))) {
    return true;
  }

  const normalizedNames = new Set(names);
  const matchesName = (value) => {
    const normalized = normalizeName(value);
    return normalized && normalizedNames.has(normalized);
  };

  const assignees = Array.isArray(task.assignees) ? task.assignees : [];
  for (const assignee of assignees) {
    if (!assignee || typeof assignee !== 'object') {
      continue;
    }
    if (matchesName(assignee.name) || matchesName(assignee.responsible)) {
      return true;
    }
  }

  if (task.assignee && typeof task.assignee === 'object') {
    if (matchesName(task.assignee.name) || matchesName(task.assignee.responsible)) {
      return true;
    }
  }

  if (Array.isArray(task.assigneeIds)) {
    for (const candidate of task.assigneeIds) {
      const normalized = normalizeIdentifier(candidate);
      if (normalized && ids.includes(normalized)) {
        return true;
      }
    }
  }

  if (task.assigneeId) {
    const normalized = normalizeIdentifier(task.assigneeId);
    if (normalized && ids.includes(normalized)) {
      return true;
    }
  }

  if (matchesName(task.responsible)) {
    return true;
  }

  if (Array.isArray(task.responsibles)) {
    for (const entry of task.responsibles) {
      if (matchesName(entry)) {
        return true;
      }
    }
  }

  return false;
}

function getTaskOrganization(task) {
  if (task && normalizeValue(task.organization)) {
    return normalizeValue(task.organization);
  }
  if (state.organizations.length === 1) {
    const candidate = state.organizations[0];
    if (candidate && normalizeValue(candidate.name)) {
      return normalizeValue(candidate.name);
    }
  }
  return '';
}

function getTaskAssigneeIdentifiers(task) {
  const identifiers = [];
  const seen = new Set();

  const push = (candidate) => {
    const normalized = normalizeIdentifier(candidate);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      identifiers.push(normalized);
    }
  };

  const processAssignee = (assignee) => {
    if (!assignee || typeof assignee !== 'object') {
      return;
    }
    const candidates = [assignee.id, assignee.telegram, assignee.chatId, assignee.email, assignee.number, assignee.login];
    candidates.forEach((value) => {
      const normalizedValue = normalizeValue(value);
      if (normalizedValue) {
        push(normalizedValue);
      }
    });
  };

  if (!task || typeof task !== 'object') {
    return identifiers;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach(processAssignee);
  }

  if (task.assignee && typeof task.assignee === 'object') {
    processAssignee(task.assignee);
  }

  if (Array.isArray(task.subordinates)) {
    task.subordinates.forEach(processAssignee);
  }

  if (task.subordinate && typeof task.subordinate === 'object') {
    processAssignee(task.subordinate);
  }

  if (task.director && typeof task.director === 'object') {
    processAssignee(task.director);
  }

  if (Array.isArray(task.directors)) {
    task.directors.forEach(processAssignee);
  }

  if (Array.isArray(task.assigneeIds)) {
    task.assigneeIds.forEach((value) => {
      const normalizedValue = normalizeValue(value);
      if (normalizedValue) {
        push(normalizedValue);
      }
    });
  }

  if (task.assigneeId) {
    const normalizedValue = normalizeValue(task.assigneeId);
    if (normalizedValue) {
      push(normalizedValue);
    }
  }

  return identifiers;
}

function getTaskAssignmentAuthors(task) {
  const authors = { ids: [], names: [] };

  const pushId = (value) => {
    const normalized = normalizeIdentifier(value);
    if (normalized && !authors.ids.includes(normalized)) {
      authors.ids.push(normalized);
    }
  };

  const pushName = (value) => {
    const normalized = normalizeName(value);
    if (normalized && !authors.names.includes(normalized)) {
      authors.names.push(normalized);
    }
  };

  const processEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const candidates = [
      entry.assignedBy,
      entry.assigned_by,
      entry.assignedById,
      entry.assigned_by_id,
      entry.assignmentAuthor,
      entry.assignmentAuthorId,
      entry.assignmentAuthorName,
      entry.assignedByLogin,
    ];

    candidates.forEach((candidate) => {
      pushId(candidate);
      pushName(candidate);
    });
  };

  if (!task || typeof task !== 'object') {
    return authors;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach(processEntry);
  }

  if (task.assignee && typeof task.assignee === 'object') {
    processEntry(task.assignee);
  }

  return authors;
}

function getTaskViewEntryForCurrentUser(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const views = Array.isArray(task.assigneeViews) ? task.assigneeViews : [];
  if (!views.length) {
    return null;
  }

  const { ids, names } = getUserIdentifierCandidates();
  const normalizedIds = Array.isArray(ids) ? new Set(ids) : new Set();
  const normalizedNames = Array.isArray(names) ? new Set(names) : new Set();

  if (normalizedIds.size === 0 && normalizedNames.size === 0) {
    return null;
  }

  const matchesEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const entryId = normalizeIdentifier(entry.id);
    if (entryId && normalizedIds.has(entryId)) {
      return true;
    }

    const rawKey = typeof entry.assigneeKey === 'string' ? entry.assigneeKey.trim().toLowerCase() : '';
    if (rawKey) {
      if (rawKey.startsWith('id::')) {
        const candidate = rawKey.slice(4);
        if (candidate && normalizedIds.has(candidate)) {
          return true;
        }
      }
      if (rawKey.startsWith('name::')) {
        const candidate = rawKey.slice(6);
        if (candidate && normalizedNames.has(candidate)) {
          return true;
        }
      }
    }

    const entryName = normalizeName(entry.name);
    if (entryName && normalizedNames.has(entryName)) {
      return true;
    }

    return false;
  };

  let latestEntry = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  views.forEach((entry) => {
    if (!matchesEntry(entry)) {
      return;
    }
    const parsed = Date.parse(entry.viewedAt);
    if (!Number.isNaN(parsed) && parsed >= latestTimestamp) {
      latestEntry = entry;
      latestTimestamp = parsed;
    } else if (latestEntry === null) {
      latestEntry = entry;
    }
  });

  return latestEntry;
}

function resolveAssigneeRole(entry, fallback = 'responsible') {
  if (!entry || typeof entry !== 'object') {
    return fallback;
  }

  const rawRole = normalizeValue(entry.role);
  if (!rawRole) {
    return fallback;
  }

  const normalizedRole = rawRole.toLowerCase();
  if (normalizedRole === 'subordinate') {
    return 'subordinate';
  }
  if (normalizedRole === 'responsible') {
    return 'responsible';
  }
  return fallback;
}

function getTaskRoleIdentifiers(task, role) {
  const identifiers = [];
  const seen = new Set();
  const desiredRole = role === 'subordinate' ? 'subordinate' : 'responsible';

  const pushIdentifier = (value) => {
    const normalized = normalizeIdentifier(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      identifiers.push(normalized);
    }
  };

  const processEntryByRole = (entry, fallbackRole = 'responsible') => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const entryRole = resolveAssigneeRole(entry, fallbackRole);
    if (entryRole !== desiredRole) {
      return;
    }
    const candidates = [entry.id, entry.telegram, entry.chatId, entry.email, entry.number, entry.login];
    candidates.forEach((candidate) => {
      const normalizedValue = normalizeValue(candidate);
      if (normalizedValue) {
        pushIdentifier(normalizedValue);
      }
    });
  };

  if (!task || typeof task !== 'object') {
    return identifiers;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((entry) => processEntryByRole(entry));
  }

  if (task.assignee && typeof task.assignee === 'object') {
    processEntryByRole(task.assignee);
  }

  if (Array.isArray(task.subordinates)) {
    task.subordinates.forEach((entry) => processEntryByRole(entry, 'subordinate'));
  }

  if (task.subordinate && typeof task.subordinate === 'object') {
    processEntryByRole(task.subordinate, 'subordinate');
  }

  if (Array.isArray(task.responsibles)) {
    task.responsibles.forEach((entry) => processEntryByRole(entry));
  }

  if (task.responsible && typeof task.responsible === 'object') {
    processEntryByRole(task.responsible);
  }

  return identifiers;
}

function getTaskResponsibleIdentifiers(task) {
  return getTaskRoleIdentifiers(task, 'responsible');
}

function getTaskSubordinateIdentifiers(task) {
  return getTaskRoleIdentifiers(task, 'subordinate');
}

function getTaskSubordinateComments(task) {
  const comments = new Map();

  const registerEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const hasCommentField = Object.prototype.hasOwnProperty.call(entry, 'assignmentComment');
    const commentValue = normalizeAssignmentComment(entry.assignmentComment);
    if (!hasCommentField && !commentValue) {
      return;
    }

    const candidates = collectSubordinateCommentKeyCandidates(entry, entry && entry.id ? entry.id : null);
    if (!candidates.length) {
      return;
    }

    registerSubordinateComment(comments, candidates, commentValue);
  };

  if (!task || typeof task !== 'object') {
    return comments;
  }

  if (Array.isArray(task.subordinates)) {
    task.subordinates.forEach(registerEntry);
  }

  if (task.subordinate && typeof task.subordinate === 'object') {
    registerEntry(task.subordinate);
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((entry) => {
      if (resolveAssigneeRole(entry, 'responsible') === 'subordinate') {
        registerEntry(entry);
      }
    });
  }

  if (task.assignee && typeof task.assignee === 'object') {
    if (resolveAssigneeRole(task.assignee, 'responsible') === 'subordinate') {
      registerEntry(task.assignee);
    }
  }

  return comments;
}

function getTaskSubordinateDueDates(task) {
  const dueDates = new Map();

  const registerEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const hasDueField = Object.prototype.hasOwnProperty.call(entry, 'assignmentDueDate');
    const dueValue = normalizeAssignmentDueDate(entry.assignmentDueDate);
    if (!hasDueField && !dueValue) {
      return;
    }

    const candidates = collectSubordinateCommentKeyCandidates(entry, entry && entry.id ? entry.id : null);
    if (!candidates.length) {
      return;
    }

    registerSubordinateDeadline(dueDates, candidates, dueValue);
  };

  if (!task || typeof task !== 'object') {
    return dueDates;
  }

  if (Array.isArray(task.subordinates)) {
    task.subordinates.forEach(registerEntry);
  }

  if (task.subordinate && typeof task.subordinate === 'object') {
    registerEntry(task.subordinate);
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((entry) => {
      if (resolveAssigneeRole(entry, 'responsible') === 'subordinate') {
        registerEntry(entry);
      }
    });
  }

  return dueDates;
}

function collectResponsibleAssignmentKeyCandidates(entry, fallbackValue) {
  const candidates = [];
  const push = (candidate) => {
    const key = buildAssignmentDirectoryKey(candidate);
    if (key && !candidates.includes(key)) {
      candidates.push(key);
    }
  };

  push(fallbackValue);

  if (entry && typeof entry === 'object') {
    [
      entry.id,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ].forEach(push);
  }

  return candidates;
}

function registerAssignmentDetail(map, candidates, value) {
  if (!(map instanceof Map) || !Array.isArray(candidates) || !candidates.length) {
    return;
  }

  const seen = new Set();
  candidates.forEach((candidate) => {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    map.set(candidate, value || '');
  });
}

function getTaskResponsibleComments(task) {
  const comments = new Map();

  const registerEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const hasCommentField = Object.prototype.hasOwnProperty.call(entry, 'assignmentComment');
    const commentValue = normalizeAssignmentComment(entry.assignmentComment);
    if (!hasCommentField && !commentValue) {
      return;
    }

    const candidates = collectResponsibleAssignmentKeyCandidates(entry, entry && entry.id ? entry.id : null);
    if (!candidates.length) {
      return;
    }

    registerAssignmentDetail(comments, candidates, commentValue);
  };

  if (!task || typeof task !== 'object') {
    return comments;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach(registerEntry);
  }

  if (task.assignee && typeof task.assignee === 'object') {
    registerEntry(task.assignee);
  }

  if (Array.isArray(task.responsibles)) {
    task.responsibles.forEach(registerEntry);
  }

  if (task.responsible && typeof task.responsible === 'object') {
    registerEntry(task.responsible);
  }

  return comments;
}

function getTaskResponsibleDueDates(task) {
  const dueDates = new Map();

  const registerEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const hasDueField = Object.prototype.hasOwnProperty.call(entry, 'assignmentDueDate');
    const dueValue = normalizeAssignmentDueDate(entry.assignmentDueDate);
    if (!hasDueField && !dueValue) {
      return;
    }

    const candidates = collectResponsibleAssignmentKeyCandidates(entry, entry && entry.id ? entry.id : null);
    if (!candidates.length) {
      return;
    }

    registerAssignmentDetail(dueDates, candidates, dueValue);
  };

  if (!task || typeof task !== 'object') {
    return dueDates;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach(registerEntry);
  }

  if (task.assignee && typeof task.assignee === 'object') {
    registerEntry(task.assignee);
  }

  if (Array.isArray(task.responsibles)) {
    task.responsibles.forEach(registerEntry);
  }

  if (task.responsible && typeof task.responsible === 'object') {
    registerEntry(task.responsible);
  }

  return dueDates;
}

function getTaskResponsibleInstructions(task) {
  const instructions = new Map();

  const registerEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const hasInstructionField = Object.prototype.hasOwnProperty.call(entry, 'assignmentInstruction');
    const instructionValue = normalizeAssignmentInstruction(entry.assignmentInstruction);
    if (!hasInstructionField && !instructionValue) {
      return;
    }

    const candidates = collectResponsibleAssignmentKeyCandidates(entry, entry && entry.id ? entry.id : null);
    if (!candidates.length) {
      return;
    }

    registerAssignmentDetail(instructions, candidates, instructionValue);
  };

  if (!task || typeof task !== 'object') {
    return instructions;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach(registerEntry);
  }

  if (task.assignee && typeof task.assignee === 'object') {
    registerEntry(task.assignee);
  }

  if (Array.isArray(task.responsibles)) {
    task.responsibles.forEach(registerEntry);
  }

  if (task.responsible && typeof task.responsible === 'object') {
    registerEntry(task.responsible);
  }

  return instructions;
}

function getTaskDirectorIdentifiers(task) {
  const identifiers = [];
  const seen = new Set();

  const push = (candidate) => {
    const normalized = normalizeIdentifier(candidate);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      identifiers.push(normalized);
    }
  };

  const process = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const candidates = [entry.id, entry.telegram, entry.chatId, entry.email, entry.number, entry.login];
    candidates.forEach((value) => {
      const normalizedValue = normalizeValue(value);
      if (normalizedValue) {
        push(normalizedValue);
      }
    });
  };

  if (!task || typeof task !== 'object') {
    return identifiers;
  }

  if (task.director && typeof task.director === 'object') {
    process(task.director);
  }

  if (Array.isArray(task.directors)) {
    task.directors.forEach(process);
  }

  return identifiers;
}

function getTaskUniqueKey(task) {
  if (!task || typeof task !== 'object') {
    return '';
  }

  const candidateFields = ['id', 'uuid', 'guid', 'entryNumber', 'registryNumber', 'documentNumber'];
  for (const field of candidateFields) {
    if (task[field] !== undefined && task[field] !== null) {
      const value = normalizeValue(task[field]);
      if (value) {
        return `${field}:${value}`;
      }
    }
  }

  const documentName = normalizeValue(task.document);
  const organization = normalizeValue(task.organization);
  const registry = normalizeValue(task.registryNumber);
  const registrationDate = normalizeValue(task.registrationDate);
  const dueDate = normalizeValue(task.dueDate);

  const composite = [documentName, organization, registry, registrationDate, dueDate]
    .filter(Boolean)
    .join('|')
    .trim();

  if (composite) {
    return `composite:${composite.toLowerCase()}`;
  }

  return '';
}

function getTaskHistoryKey(task) {
  const uniqueKey = getTaskUniqueKey(task);
  if (uniqueKey) {
    return uniqueKey;
  }

  if (!task || typeof task !== 'object') {
    return '';
  }

  const candidates = [
    normalizeValue(task.document),
    normalizeValue(task.organization),
    normalizeValue(task.organizationName),
    normalizeValue(task.organizationTitle),
    normalizeValue(task.organizationFullName),
    normalizeValue(task.organizationShortName),
    normalizeValue(task.registryNumber),
    normalizeValue(task.registry),
    normalizeValue(task.registrationDate),
    normalizeValue(task.dueDate),
  ];

  const composite = candidates.filter(Boolean).join('|').trim();
  if (composite) {
    return `meta:${composite.toLowerCase()}`;
  }

  try {
    const serialized = JSON.stringify(task);
    if (serialized) {
      return `json:${serialized}`;
    }
  } catch (error) {
    // ignore serialization issues
  }

  return '';
}

function pickDisplayValue(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      continue;
    }
    const text = String(candidate).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function buildResponsibleProfile(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const label = pickDisplayValue(entry);
    const token = normalizeName(label);
    if (!token) {
      return null;
    }
    const searchTokens = collectResponsibleSearchTokens(token, label);
    return {
      token,
      label: label || 'Ответственный',
      sourceLabel: label || '',
      searchTokens: Array.from(searchTokens),
    };
  }

  if (typeof entry !== 'object') {
    return null;
  }

  const primaryName = pickDisplayValue(entry.responsible, entry.name, entry.fio);
  const label = pickDisplayValue(
    primaryName,
    entry.department,
    entry.telegram,
    entry.login,
    entry.email,
    entry.number,
  );

  const identifier = normalizeIdentifier(
    entry.id
      || entry.telegram
      || entry.chatId
      || entry.email
      || entry.number
      || entry.login,
  );

  const normalizedName = normalizeName(primaryName)
    || normalizeName(label)
    || normalizeName(entry.responsible)
    || normalizeName(entry.name)
    || normalizeName(entry.fio);

  const token = normalizedName || (identifier ? `id:${identifier}` : '');
  if (!token) {
    return null;
  }

  const resolvedLabel = label || (identifier ? identifier : '');

  const searchTokens = collectResponsibleSearchTokens(
    token,
    resolvedLabel,
    primaryName,
    entry.department,
    entry.telegram,
    entry.chatId,
    entry.email,
    entry.login,
    entry.number,
    entry.fio,
    entry.responsible,
    entry.name,
    identifier ? `id:${identifier}` : '',
    identifier,
  );

  return {
    token,
    label: resolvedLabel || 'Ответственный',
    sourceLabel: primaryName || '',
    searchTokens: Array.from(searchTokens),
  };
}

function getTaskResponsibleProfiles(task) {
  const profiles = [];
  const seen = new Set();

  const pushProfile = (profile) => {
    if (!profile || !profile.token || seen.has(profile.token)) {
      return;
    }
    seen.add(profile.token);
    const searchTokens = Array.isArray(profile.searchTokens)
      ? profile.searchTokens.slice()
      : Array.from(collectResponsibleSearchTokens(profile.token, profile.label, profile.sourceLabel));
    profiles.push({
      token: profile.token,
      label: profile.label || 'Ответственный',
      sourceLabel: profile.sourceLabel || '',
      searchTokens,
    });
  };

  if (!task || typeof task !== 'object') {
    return profiles;
  }

  const processEntry = (entry, fallbackRole = 'responsible') => {
    if (resolveAssigneeRole(entry, fallbackRole) === 'subordinate') {
      return;
    }
    const profile = buildResponsibleProfile(entry);
    if (profile) {
      pushProfile(profile);
    }
  };

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((entry) => processEntry(entry));
  }

  if (task.assignee) {
    processEntry(task.assignee);
  }

  if (Array.isArray(task.responsibles)) {
    task.responsibles.forEach((entry) => processEntry(entry));
  }

  if (task.responsible) {
    processEntry(task.responsible);
  }

  return profiles;
}

function getTaskSubordinateProfiles(task) {
  const profiles = [];
  const seen = new Set();

  const pushProfile = (profile) => {
    if (!profile || !profile.token || seen.has(profile.token)) {
      return;
    }
    seen.add(profile.token);
    const searchTokens = Array.isArray(profile.searchTokens)
      ? profile.searchTokens.slice()
      : Array.from(collectResponsibleSearchTokens(profile.token, profile.label, profile.sourceLabel));
    profiles.push({
      token: profile.token,
      label: profile.label || 'Подчинённый',
      sourceLabel: profile.sourceLabel || '',
      searchTokens,
    });
  };

  const processEntry = (entry, fallbackRole = 'responsible') => {
    if (resolveAssigneeRole(entry, fallbackRole) !== 'subordinate') {
      return;
    }
    const profile = buildResponsibleProfile(entry);
    if (profile) {
      pushProfile(profile);
    }
  };

  if (!task || typeof task !== 'object') {
    return profiles;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((entry) => processEntry(entry));
  }

  if (task.assignee) {
    processEntry(task.assignee);
  }

  if (Array.isArray(task.subordinates)) {
    task.subordinates.forEach((entry) => processEntry(entry, 'subordinate'));
  }

  if (task.subordinate) {
    processEntry(task.subordinate, 'subordinate');
  }

  return profiles;
}

function buildTaskFileSummary(file) {
  if (!file || typeof file !== 'object') {
    const normalized = normalizeValue(file);
    return normalized || file || null;
  }

  const summary = {};
  if (file.name) {
    summary.name = file.name;
  }
  if (file.file) {
    summary.file = file.file;
  }
  if (file.url) {
    summary.url = file.url;
  }

  if (!Object.keys(summary).length) {
    return file;
  }

  summary.raw = file;
  return summary;
}

function buildTaskDebugSummary(task) {
  if (!task || typeof task !== 'object') {
    return { raw: task };
  }

  const summary = {
    entryNumber: normalizeValue(task.entryNumber) || null,
    document: normalizeValue(task.document) || null,
    organization: normalizeValue(task.organization) || null,
    status: getTaskStatusValue(task) || null,
    dueDate: normalizeValue(task.dueDate) || null,
    historyKey: getTaskHistoryKey(task),
    responsible: task.responsible || null,
  };

  if (Array.isArray(task.responsibles) && task.responsibles.length) {
    summary.responsibles = task.responsibles;
  }

  if (task.assignee) {
    summary.assignee = task.assignee;
  }

  if (Array.isArray(task.assignees) && task.assignees.length) {
    summary.assignees = task.assignees;
  }

  if (Array.isArray(task.files) && task.files.length) {
    summary.files = task.files.map(buildTaskFileSummary);
  }

  summary.raw = task;
  return summary;
}

function buildResponsibleProfileSnapshot(profile) {
  if (!profile || typeof profile !== 'object') {
    return { raw: profile };
  }

  const snapshot = {
    token: normalizeResponsibleKey(profile.token) || profile.token || '',
    label: profile.label || profile.responsible || profile.name || profile.fio || '',
  };

  if (profile.sourceLabel) {
    snapshot.sourceLabel = profile.sourceLabel;
  }

  if (profile.department) {
    snapshot.department = profile.department;
  }

  snapshot.raw = profile;
  return snapshot;
}

function buildResponsibleDirectorySnapshot(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const snapshot = {
    token: normalizeResponsibleKey(entry.token) || entry.token || '',
    label: entry.label || entry.responsible || entry.name || entry.fio || '',
  };

  const tokens = entry.searchTokens instanceof Set
    ? Array.from(entry.searchTokens)
    : Array.isArray(entry.searchTokens)
      ? entry.searchTokens
      : [];

  if (tokens.length) {
    snapshot.searchTokens = tokens;
  }

  if (entry.source) {
    snapshot.source = entry.source;
  }

  snapshot.raw = entry;
  return snapshot;
}

function taskMatchesResponsibleFilter(task, token) {
  if (!token) {
    return false;
  }
  const normalizedToken = normalizeResponsibleKey(token);
  if (!normalizedToken) {
    return false;
  }

  const directorState = ensureDirectorState();
  const historyMap = directorState.responsibleTaskMap;
  const directory = directorState.responsibleDirectory instanceof Map
    ? directorState.responsibleDirectory
    : null;
  const directoryEntry = directory ? directory.get(normalizedToken) : null;

  const filterTokens = collectResponsibleSearchTokens(normalizedToken);
  filterTokens.add(normalizedToken);

  const debugDetails = {
    token,
    normalizedToken,
    filterTokens: null,
    directoryEntry: buildResponsibleDirectorySnapshot(directoryEntry),
    task: buildTaskDebugSummary(task),
    profiles: [],
    historyChecks: [],
  };

  if (directoryEntry) {
    filterTokens.add(normalizeResponsibleKey(directoryEntry.token));
    const entryTokens = directoryEntry.searchTokens instanceof Set
      ? directoryEntry.searchTokens
      : collectResponsibleSearchTokens(directoryEntry.searchTokens);
    if (entryTokens instanceof Set) {
      entryTokens.forEach((value) => {
        const normalized = normalizeResponsibleKey(value);
        if (normalized) {
          filterTokens.add(normalized);
        }
      });
    }
  }

  const filterTokenList = Array.from(filterTokens);
  debugDetails.filterTokens = filterTokenList;

  let matchedViaProfiles = false;
  const profiles = getTaskResponsibleProfiles(task);
  for (const profile of profiles) {
    const profileTokens = collectResponsibleSearchTokens(
      profile.token,
      profile.searchTokens,
      profile.label,
      profile.sourceLabel,
    );
    const tokensList = Array.from(profileTokens);
    const hasMatch = hasTokenIntersection(filterTokens, profileTokens);
    debugDetails.profiles.push({
      profile: buildResponsibleProfileSnapshot(profile),
      tokens: tokensList,
      matched: hasMatch,
    });
    if (hasMatch) {
      matchedViaProfiles = true;
    }
  }

  let matchedViaHistory = false;
  let historyKey = '';

  if (historyMap instanceof Map) {
    historyKey = getTaskHistoryKey(task) || '';
    if (historyKey) {
      for (const candidate of filterTokens) {
        if (!candidate) {
          continue;
        }
        const historySet = historyMap.get(candidate);
        const matched = historySet instanceof Set && historySet.has(historyKey);
        debugDetails.historyChecks.push({
          token: candidate,
          matched,
          historyKey,
          availableCount: historySet instanceof Set ? historySet.size : 0,
          sample: historySet instanceof Set ? Array.from(historySet).slice(0, 10) : [],
        });
        if (matched) {
          matchedViaHistory = true;
        }
      }
    }
  }

  const matched = matchedViaProfiles || matchedViaHistory;
  debugDetails.result = {
    viaProfiles: matchedViaProfiles,
    viaHistory: matchedViaHistory,
    matched,
  };

  logResponsibleDebug('evaluation', debugDetails);

  return matched;
}

function taskMatchesSubordinateFilter(task, token) {
  if (!token) {
    return false;
  }

  const normalizedToken = normalizeResponsibleKey(token);
  if (!normalizedToken) {
    return false;
  }

  const directorState = ensureDirectorState();
  const directory = directorState.subordinateDirectory instanceof Map
    ? directorState.subordinateDirectory
    : null;
  const directoryEntry = directory ? directory.get(normalizedToken) : null;

  let filterTokens = collectResponsibleSearchTokens(token, normalizedToken);
  if (!(filterTokens instanceof Set)) {
    filterTokens = new Set();
  }
  filterTokens.add(normalizedToken);

  if (directoryEntry) {
    const directoryTokens = collectResponsibleSearchTokens(
      directoryEntry.token,
      directoryEntry.searchTokens,
      directoryEntry.label,
      directoryEntry.name,
      directoryEntry.sourceName,
    );
    if (directoryTokens instanceof Set) {
      directoryTokens.forEach((value) => filterTokens.add(value));
    }
  }

  const debugDetails = {
    token,
    normalizedToken,
    filterTokens: Array.from(filterTokens),
    directoryEntry: buildResponsibleDirectorySnapshot(directoryEntry),
    task: buildTaskDebugSummary(task),
    profiles: [],
  };

  let matchedViaProfiles = false;
  const profiles = getTaskSubordinateProfiles(task);
  for (const profile of profiles) {
    const profileTokens = collectResponsibleSearchTokens(
      profile.token,
      profile.searchTokens,
      profile.label,
      profile.sourceLabel,
    );
    const tokensList = profileTokens instanceof Set ? Array.from(profileTokens) : [];
    const hasMatch = hasTokenIntersection(filterTokens, profileTokens);
    debugDetails.profiles.push({
      profile: buildResponsibleProfileSnapshot(profile),
      tokens: tokensList,
      matched: hasMatch,
    });
    if (hasMatch) {
      matchedViaProfiles = true;
    }
  }

  debugDetails.result = {
    viaProfiles: matchedViaProfiles,
    matched: matchedViaProfiles,
  };

  logSubordinateDebug('evaluation', debugDetails);

  return matchedViaProfiles;
}

function getDirectorOrganizationKeys() {
  const organizations = Array.isArray(state.organizations) ? state.organizations : [];
  const keys = [];
  organizations.forEach((summary) => {
    if (!summary || typeof summary !== 'object') {
      return;
    }
    const rawName = summary.name || summary.organization || '';
    const normalizedName = normalizeValue(rawName);
    if (!normalizedName) {
      return;
    }
    if (userIsDirectorForOrganization(normalizedName)) {
      const key = getOrganizationKey(normalizedName);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
  });
  return keys;
}

function isTaskAssignedToCurrentDirector(task) {
  ensureDirectorState();
  if (!task || typeof task !== 'object') {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  const directorIdentifiers = getTaskDirectorIdentifiers(task);
  if (directorIdentifiers.some((identifier) => ids.includes(identifier))) {
    return true;
  }

  const matchesName = (value) => {
    const normalized = normalizeName(value);
    return normalized && names.includes(normalized);
  };

  if (task.director && typeof task.director === 'object') {
    if (matchesName(task.director.responsible || task.director.name || task.director.fio)) {
      return true;
    }
  }

  if (Array.isArray(task.directors)) {
    for (const entry of task.directors) {
      if (entry && typeof entry === 'object') {
        if (matchesName(entry.responsible || entry.name || entry.fio)) {
          return true;
        }
      } else if (matchesName(entry)) {
        return true;
      }
    }
  }

  if (matchesName(task.responsible)) {
    return true;
  }

  if (Array.isArray(task.responsibles)) {
    for (const entry of task.responsibles) {
      if (entry && typeof entry === 'object') {
        if (matchesName(entry.responsible || entry.name || entry.fio)) {
          return true;
        }
      } else if (matchesName(entry)) {
        return true;
      }
    }
  }

  const assigneeIdentifiers = getTaskAssigneeIdentifiers(task);
  if (assigneeIdentifiers.some((identifier) => ids.includes(identifier))) {
    return true;
  }

  if (task.assignee && typeof task.assignee === 'object') {
    if (matchesName(task.assignee.responsible || task.assignee.name || task.assignee.fio)) {
      return true;
    }
  }

  if (Array.isArray(task.assignees)) {
    for (const entry of task.assignees) {
      if (entry && typeof entry === 'object') {
        if (matchesName(entry.responsible || entry.name || entry.fio)) {
          return true;
        }
      } else if (matchesName(entry)) {
        return true;
      }
    }
  }

  const assignmentAuthors = getTaskAssignmentAuthors(task);
  if (assignmentAuthors.ids.some((value) => ids.includes(value))) {
    return true;
  }

  if (assignmentAuthors.names.some((value) => names.includes(value))) {
    return true;
  }

  return false;
}

function notifyDirectorAboutAssignments(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return;
  }

  const titles = tasks
    .map((task) => normalizeValue(task.document) || normalizeValue(task.registryNumber))
    .filter(Boolean)
    .slice(0, 3);

  let message = '';
  if (tasks.length === 1) {
    const title = titles[0];
    message = title
      ? `Новый документ назначен на вас: «${title}».`
      : 'Новый документ назначен на вас.';
  } else {
    message = `Новые документы (${tasks.length}) назначены на вас.`;
    if (titles.length) {
      message += ` Например: «${titles.join('», «')}».`;
    }
  }

  setStatus('info', message);

  if (typeof window !== 'undefined') {
    const webApp = window.Telegram && window.Telegram.WebApp;
    if (webApp && typeof webApp.showPopup === 'function') {
      try {
        void webApp.showPopup({
          title: 'Новые документы',
          message,
          buttons: [{ type: 'ok' }],
        });
      } catch (error) {
        // ignore popup errors
      }
    }
  }
}

function normalizeCountValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const rounded = Math.round(numeric);
  return rounded >= 0 ? rounded : 0;
}

function mergeServerCount(current, next) {
  const hasCurrent = typeof current === 'number' && Number.isFinite(current);
  const hasNext = typeof next === 'number' && Number.isFinite(next);

  if (hasCurrent && hasNext) {
    return next > current ? next : current;
  }

  if (hasNext) {
    return next;
  }

  return hasCurrent ? current : null;
}

function applyServerCountsToEntry(entry, profile) {
  if (!entry || typeof entry !== 'object' || !profile || typeof profile !== 'object') {
    return;
  }

  if (typeof profile.serverCount === 'number' && Number.isFinite(profile.serverCount)) {
    entry.serverCount = mergeServerCount(entry.serverCount, profile.serverCount);
  }

  if (typeof profile.serverTotalCount === 'number' && Number.isFinite(profile.serverTotalCount)) {
    entry.serverTotalCount = mergeServerCount(entry.serverTotalCount, profile.serverTotalCount);
  }

  if (typeof profile.serverActiveCount === 'number' && Number.isFinite(profile.serverActiveCount)) {
    entry.serverActiveCount = mergeServerCount(entry.serverActiveCount, profile.serverActiveCount);
  }
}

function collectDirectorResponsibleProfiles(organizationKeys) {
  const profiles = new Map();

  if (!Array.isArray(organizationKeys) || !organizationKeys.length) {
    return profiles;
  }

  organizationKeys.forEach((key) => {
    if (typeof key !== 'string' || !key) {
      return;
    }
    const responsibles = state.access?.responsibles?.[key];
    if (!Array.isArray(responsibles) || !responsibles.length) {
      return;
    }
    responsibles.forEach((entry) => {
      const profile = buildResponsibleProfile(entry);
      if (!profile || !profile.token) {
        return;
      }
      const sourceName = profile.sourceLabel ? String(profile.sourceLabel).trim() : '';
      const baseName = sourceName || profile.label || 'Ответственный';
      const serverCount = normalizeCountValue(entry?.count);
      const serverActiveCount = normalizeCountValue(entry?.activeCount);
      const rawServerTotal = normalizeCountValue(entry?.totalCount);
      const serverTotalCandidates = [rawServerTotal, serverActiveCount, serverCount]
        .filter((value) => typeof value === 'number' && Number.isFinite(value));
      const serverTotalCount = serverTotalCandidates.length
        ? Math.max(...serverTotalCandidates)
        : null;
      const existing = profiles.get(profile.token);
      if (!existing) {
        const searchTokens = collectResponsibleSearchTokens(
          profile.token,
          profile.label,
          profile.sourceLabel,
          baseName,
        );
        profiles.set(profile.token, {
          token: profile.token,
          label: profile.label || baseName,
          name: baseName,
          sourceName,
          serverCount,
          serverTotalCount,
          serverActiveCount,
          searchTokens,
        });
      } else {
        if (profile.label && (!existing.label || existing.label === 'Ответственный')) {
          existing.label = profile.label;
        }
        if (sourceName && (!existing.sourceName || existing.sourceName === '')) {
          existing.sourceName = sourceName;
        }
        if (baseName && (!existing.name || existing.name === 'Ответственный')) {
          existing.name = baseName;
        }
        if (!(existing.searchTokens instanceof Set)) {
          const restored = collectResponsibleSearchTokens(existing.searchTokens);
          existing.searchTokens = restored instanceof Set ? restored : new Set();
        }
        const tokens = collectResponsibleSearchTokens(
          profile.token,
          profile.label,
          profile.sourceLabel,
          baseName,
        );
        tokens.forEach((value) => existing.searchTokens.add(value));
        existing.serverCount = mergeServerCount(existing.serverCount, serverCount);
        existing.serverTotalCount = mergeServerCount(existing.serverTotalCount, serverTotalCount);
        existing.serverActiveCount = mergeServerCount(existing.serverActiveCount, serverActiveCount);
      }
    });
  });

  return profiles;
}

function collectDirectorSubordinateProfiles(organizationKeys) {
  const profiles = new Map();

  if (!Array.isArray(organizationKeys) || !organizationKeys.length) {
    return profiles;
  }

  organizationKeys.forEach((key) => {
    if (typeof key !== 'string' || !key) {
      return;
    }
    const subordinates = state.access?.subordinates?.[key];
    if (!Array.isArray(subordinates) || !subordinates.length) {
      return;
    }
    subordinates.forEach((entry) => {
      const profile = buildResponsibleProfile(entry);
      if (!profile || !profile.token) {
        return;
      }
      const sourceName = profile.sourceLabel ? String(profile.sourceLabel).trim() : '';
      const baseName = sourceName || profile.label || 'Подчинённый';
      const existing = profiles.get(profile.token);
      if (!existing) {
        const searchTokens = collectResponsibleSearchTokens(
          profile.token,
          profile.label,
          profile.sourceLabel,
          baseName,
        );
        profiles.set(profile.token, {
          token: profile.token,
          label: profile.label || baseName,
          name: baseName,
          sourceName,
          searchTokens,
        });
      } else {
        if (profile.label && (!existing.label || existing.label === 'Подчинённый')) {
          existing.label = profile.label;
        }
        if (sourceName && (!existing.sourceName || existing.sourceName === '')) {
          existing.sourceName = sourceName;
        }
        if (baseName && (!existing.name || existing.name === 'Подчинённый')) {
          existing.name = baseName;
        }
        if (!(existing.searchTokens instanceof Set)) {
          const restored = collectResponsibleSearchTokens(existing.searchTokens);
          existing.searchTokens = restored instanceof Set ? restored : new Set();
        }
        const tokens = collectResponsibleSearchTokens(
          profile.token,
          profile.label,
          profile.sourceLabel,
          baseName,
        );
        tokens.forEach((value) => existing.searchTokens.add(value));
      }
    });
  });

  return profiles;
}

function updateDirectorTracking(previousKnownKeys) {
  const directorState = ensureDirectorState();
  const previousKeys = previousKnownKeys instanceof Set
    ? previousKnownKeys
    : new Set(directorState.knownTaskKeys);
  const hadInitialized = directorState.initialized === true;

  const organizationKeys = getDirectorOrganizationKeys();
  directorState.organizations = organizationKeys;

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const assignedTasks = [];
  tasks.forEach((task, index) => {
    if (isTaskAssignedToCurrentDirector(task)) {
      assignedTasks.push({ task, index });
    }
  });
  const assignedIndexSet = new Set(assignedTasks.map(({ index }) => index));

  const directory = directorState.responsibleDirectory instanceof Map
    ? directorState.responsibleDirectory
    : new Map();
  const historyMap = directorState.responsibleTaskMap instanceof Map
    ? directorState.responsibleTaskMap
    : new Map();
  directorState.responsibleDirectory = directory;
  directorState.responsibleTaskMap = historyMap;

  const hasStoredResponsibles = directory.size > 0
    || Array.from(historyMap.values()).some((set) => set instanceof Set && set.size > 0);

  const newKnownKeys = new Set();
  const newAssignments = [];
  const organizationSet = new Set(organizationKeys);
  const responsibleProfiles = collectDirectorResponsibleProfiles(organizationKeys);
  const subordinateProfilesMap = collectDirectorSubordinateProfiles(organizationKeys);
  const subordinateDirectory = subordinateProfilesMap instanceof Map
    ? subordinateProfilesMap
    : new Map();
  const relevantTokens = new Set();
  const currentCounts = new Map();
  let hasTaskAssignees = false;

  const ensureDirectoryEntry = (profile) => {
    if (!profile || !profile.token) {
      return null;
    }
    const token = profile.token;
    let entry = directory.get(token);
    if (!entry) {
      const historySet = historyMap.get(token);
      const historyCount = historySet instanceof Set ? historySet.size : 0;
      entry = {
        token,
        label: profile.label || 'Ответственный',
        name: profile.sourceLabel || profile.label || 'Ответственный',
        sourceName: profile.sourceLabel || '',
        total: historyCount,
        searchTokens: new Set(),
      };
      directory.set(token, entry);
    } else {
      if (profile.label && (!entry.label || entry.label === 'Ответственный')) {
        entry.label = profile.label;
      }
      if (profile.sourceLabel && (!entry.sourceName || entry.sourceName === '')) {
        entry.sourceName = profile.sourceLabel;
      }
      if (profile.sourceLabel && (!entry.name || entry.name === 'Ответственный')) {
        entry.name = profile.sourceLabel;
      } else if (!entry.name || entry.name === 'Ответственный') {
        entry.name = profile.label || entry.name;
      }
      if (typeof entry.total !== 'number' || !Number.isFinite(entry.total)) {
        const historySet = historyMap.get(token);
        entry.total = historySet instanceof Set ? historySet.size : 0;
      }
    }
    if (profile) {
      mergeProfileSearchTokens(entry, profile);
    } else if (!(entry.searchTokens instanceof Set)) {
      entry.searchTokens = new Set([entry.token]);
    } else {
      entry.searchTokens.add(entry.token);
    }
    applyServerCountsToEntry(entry, profile);
    return entry;
  };

  assignedTasks.forEach(({ task, index }) => {
    const key = getTaskUniqueKey(task) || `index:${index}`;
    newKnownKeys.add(key);
    if (hadInitialized && !previousKeys.has(key)) {
      newAssignments.push(task);
    }
  });

  responsibleProfiles.forEach((entry) => {
    const profile = entry && entry.token ? {
      token: entry.token,
      label: entry.label,
      sourceLabel: entry.sourceName || entry.name,
      searchTokens: entry.searchTokens instanceof Set
        ? Array.from(entry.searchTokens)
        : entry.searchTokens,
      serverCount: entry.serverCount,
      serverTotalCount: entry.serverTotalCount,
      serverActiveCount: entry.serverActiveCount,
    } : null;
    const directoryEntry = ensureDirectoryEntry(profile);
    if (directoryEntry) {
      if (entry && entry.name && (!directoryEntry.name || directoryEntry.name === 'Ответственный')) {
        directoryEntry.name = entry.name;
      }
      if (entry && entry.sourceName && (!directoryEntry.sourceName || directoryEntry.sourceName === '')) {
        directoryEntry.sourceName = entry.sourceName;
      }
      applyServerCountsToEntry(directoryEntry, profile);
      relevantTokens.add(directoryEntry.token);
    }
  });

  directorState.subordinateDirectory = new Map(subordinateDirectory);

  const recordProfileForTask = (profile, task) => {
    const entry = ensureDirectoryEntry(profile);
    if (!entry) {
      return;
    }
    mergeProfileSearchTokens(entry, profile);
    applyServerCountsToEntry(entry, profile);
    relevantTokens.add(entry.token);
    const currentValue = currentCounts.get(entry.token) || 0;
    currentCounts.set(entry.token, currentValue + 1);

    const historyKey = getTaskHistoryKey(task);
    if (historyKey) {
      const primaryToken = normalizeResponsibleKey(entry.token || profile.token);
      const historyTokens = collectResponsibleSearchTokens(
        entry.token,
        profile.token,
        profile.searchTokens,
        entry.searchTokens instanceof Set ? entry.searchTokens : [],
      );
      if (primaryToken) {
        historyTokens.add(primaryToken);
      }
      historyTokens.forEach((tokenValue) => {
        const normalizedTokenValue = normalizeResponsibleKey(tokenValue);
        if (!normalizedTokenValue) {
          return;
        }
        let set = historyMap.get(normalizedTokenValue);
        if (!(set instanceof Set)) {
          set = new Set();
          historyMap.set(normalizedTokenValue, set);
        }
        if (!set.has(historyKey)) {
          set.add(historyKey);
          if (normalizedTokenValue === primaryToken) {
            const nextTotal = (entry.total && Number.isFinite(entry.total))
              ? entry.total + 1
              : set.size;
            entry.total = nextTotal;
          }
        }
      });
    } else if (!(entry.total && Number.isFinite(entry.total))) {
      entry.total = currentCounts.get(entry.token);
    }
  };

  const incrementFromTask = (task) => {
    const responsibleProfiles = getTaskResponsibleProfiles(task);
    const subordinateProfiles = getTaskSubordinateProfiles(task);
    if (!responsibleProfiles.length && !subordinateProfiles.length) {
      return;
    }
    hasTaskAssignees = true;

    const seenResponsibleTokens = new Set();
    responsibleProfiles.forEach((profile) => {
      if (!profile || !profile.token || seenResponsibleTokens.has(profile.token)) {
        return;
      }
      seenResponsibleTokens.add(profile.token);
      recordProfileForTask(profile, task);
    });

    if (!subordinateProfiles.length) {
      return;
    }

    subordinateProfiles.forEach((profile) => {
      if (!profile || !profile.token) {
        return;
      }
      const token = profile.token;
      let entry = subordinateDirectory.get(token);
      if (!entry) {
        entry = {
          token,
          label: profile.label || 'Подчинённый',
          name: profile.sourceLabel || profile.label || 'Подчинённый',
          sourceName: profile.sourceLabel || '',
          searchTokens: new Set(Array.isArray(profile.searchTokens) ? profile.searchTokens : []),
        };
        subordinateDirectory.set(token, entry);
      } else {
        mergeProfileSearchTokens(entry, profile);
      }
    });
  };

  tasks.forEach((task, index) => {
    if (!task || typeof task !== 'object') {
      return;
    }

    const organizationKey = getTaskOrganizationKey(task);
    const matchesOrganization = organizationSet.size === 0
      || (organizationKey && organizationSet.has(organizationKey));
    const matchesAssignment = assignedIndexSet.has(index);

    if (!matchesOrganization && !matchesAssignment) {
      return;
    }

    incrementFromTask(task);
  });

  historyMap.forEach((set, token) => {
    if (!(set instanceof Set) || set.size === 0) {
      return;
    }
    if (directory.has(token)) {
      relevantTokens.add(token);
    }
  });

  directory.forEach((entry, token) => {
    if (!token) {
      return;
    }
    if (entry && typeof entry === 'object') {
      if (typeof entry.total !== 'number' || !Number.isFinite(entry.total)) {
        const historySet = historyMap.get(token);
        entry.total = historySet instanceof Set ? historySet.size : 0;
      }
    }
    relevantTokens.add(token);
  });

  const responsibles = Array.from(relevantTokens)
    .map((token) => {
      const entry = directory.get(token) || {};
      const historySet = historyMap.get(token);
      const historyCount = historySet instanceof Set ? historySet.size : 0;
      const calculatedActive = currentCounts.get(token) || 0;
      const serverCount = typeof entry.serverCount === 'number' && Number.isFinite(entry.serverCount)
        ? entry.serverCount
        : 0;
      const serverActiveCount = typeof entry.serverActiveCount === 'number'
        && Number.isFinite(entry.serverActiveCount)
        ? entry.serverActiveCount
        : serverCount;
      const serverTotalCount = typeof entry.serverTotalCount === 'number'
        && Number.isFinite(entry.serverTotalCount)
        ? entry.serverTotalCount
        : Math.max(serverCount, serverActiveCount);
      const effectiveActiveCount = Math.max(
        calculatedActive,
        serverActiveCount,
        serverCount,
      );
      const totalCountCandidates = [
        Number.isFinite(entry.total) ? entry.total : 0,
        historyCount,
        calculatedActive,
        serverTotalCount,
        serverActiveCount,
        serverCount,
      ];
      const totalCount = Math.max(...totalCountCandidates);
      entry.total = totalCount;
      entry.lastActiveCount = effectiveActiveCount;
      const sourceName = normalizeValue(entry.sourceName);
      const fallbackName = normalizeValue(entry.name) || normalizeValue(entry.label);
      const displayName = sourceName || fallbackName || 'Ответственный';
      const label = entry.label || entry.name || 'Ответственный';
      const searchTokens = entry.searchTokens instanceof Set
        ? Array.from(entry.searchTokens).filter(Boolean)
        : [];
      return { 
        token,
        label,
        name: displayName,
        sourceName: sourceName || '',
        displayName,
        count: effectiveActiveCount,
        totalCount,
        activeCount: effectiveActiveCount,
        searchTokens,
      };
    })
    .filter((entry) => entry && entry.token)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return (a.name || '').localeCompare(b.name || '', 'ru', { sensitivity: 'base' });
    });

  const subordinates = Array.from(subordinateDirectory.values())
    .map((entry) => {
      if (!entry || !entry.token) {
        return null;
      }
      const displayName = normalizeValue(entry.name)
        || normalizeValue(entry.label)
        || 'Подчинённый';
      const searchTokens = entry.searchTokens instanceof Set
        ? Array.from(entry.searchTokens).filter(Boolean)
        : [];
      return {
        token: entry.token,
        label: entry.label || displayName,
        name: displayName,
        sourceName: entry.sourceName || '',
        displayName,
        count: 0,
        totalCount: 0,
        activeCount: 0,
        searchTokens,
      };
    })
    .filter((entry) => entry && entry.token)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { sensitivity: 'base' }));

  const shouldActivateDirectorView = organizationKeys.length > 0
    || assignedTasks.length > 0
    || responsibles.length > 0
    || subordinates.length > 0
    || hasStoredResponsibles
    || hasTaskAssignees;

  if (!shouldActivateDirectorView) {
    directorState.isActive = false;
    directorState.knownTaskKeys.clear();
    directorState.responsibles = [];
    directorState.subordinates = [];
    directorState.initialized = false;
    directorState.summaryExpanded = false;
    directorState.responsiblePanelExpanded = false;
    directorState.subordinatePanelExpanded = false;
    directorState.selectedResponsibleToken = '';
    directorState.selectedSubordinateToken = '';
    directorState.visibilityRuleLogged = false;
    directory.clear();
    historyMap.clear();
    if (directorState.subordinateDirectory instanceof Map) {
      directorState.subordinateDirectory.clear();
    } else {
      directorState.subordinateDirectory = new Map();
    }
    if (hasAssigneeFilters(state.taskFilter)) {
      state.taskFilter = [];
      directorState.visibilityRuleLogged = false;
      updateVisibleTasks();
    }
    return;
  }

  directorState.knownTaskKeys = newKnownKeys;
  directorState.initialized = true;
  directorState.responsibles = responsibles;
  directorState.subordinates = subordinates;
  directorState.isActive = true;

  if (!hadInitialized && (directorState.responsibles.length > 0 || directorState.subordinates.length > 0)) {
    directorState.summaryExpanded = true;
    directorState.responsiblePanelExpanded = false;
    directorState.subordinatePanelExpanded = false;
  }

  let filterChanged = false;
  const normalizedFilters = normalizeTaskFilters(state.taskFilter);
  const responsibleFilter = normalizedFilters.find((filter) => isResponsibleFilter(filter)) || '';
  const subordinateFilter = normalizedFilters.find((filter) => isSubordinateFilter(filter)) || '';
  if (responsibleFilter || subordinateFilter) {
    if (responsibleFilter) {
      const currentToken = getResponsibleFilterToken(responsibleFilter);
      const tokenExists = directorState.responsibles.some((entry) => entry.token === currentToken);
      if (!tokenExists) {
        state.taskFilter = [];
        directorState.selectedResponsibleToken = '';
        directorState.selectedSubordinateToken = '';
        filterChanged = true;
      }
    } else if (subordinateFilter) {
      const currentToken = getSubordinateFilterToken(subordinateFilter);
      const tokenExists = directorState.subordinates.some((entry) => entry.token === currentToken);
      if (!tokenExists) {
        state.taskFilter = [];
        directorState.selectedResponsibleToken = '';
        directorState.selectedSubordinateToken = '';
        filterChanged = true;
      }
    }
  }

  if (subordinateFilter) {
    directorState.selectedSubordinateToken = getSubordinateFilterToken(subordinateFilter) || '';
  } else if (!responsibleFilter) {
    directorState.selectedSubordinateToken = '';
  }

  if (filterChanged) {
    directorState.visibilityRuleLogged = false;
    updateVisibleTasks();
  }

  if (hadInitialized && newAssignments.length) {
    notifyDirectorAboutAssignments(newAssignments);
  }
}

function calculateResponsibleTaskCounts(tasks) {
  const counts = new Map();
  if (!Array.isArray(tasks)) {
    return counts;
  }

  tasks.forEach((task) => {
    if (!task || typeof task !== 'object') {
      return;
    }

    const profiles = getTaskResponsibleProfiles(task);
    if (!profiles.length) {
      return;
    }

    const taskTokens = new Set();
    profiles.forEach((profile) => {
      if (!profile) {
        return;
      }

      const candidates = collectResponsibleSearchTokens(
        profile.token,
        profile.searchTokens,
        profile.label,
        profile.sourceLabel,
      );

      if (!(candidates instanceof Set) || candidates.size === 0) {
        const fallback = normalizeResponsibleKey(profile.token || profile.label || profile.sourceLabel);
        if (fallback && !taskTokens.has(fallback)) {
          taskTokens.add(fallback);
        }
        return;
      }

      candidates.forEach((candidate) => {
        const normalized = normalizeResponsibleKey(candidate);
        if (!normalized || taskTokens.has(normalized)) {
          return;
        }
        taskTokens.add(normalized);
      });
    });

    taskTokens.forEach((token) => {
      const current = counts.get(token) || 0;
      counts.set(token, current + 1);
    });
  });

  return counts;
}

function calculateSubordinateTaskCounts(tasks) {
  const counts = new Map();
  if (!Array.isArray(tasks)) {
    return counts;
  }

  tasks.forEach((task) => {
    if (!task || typeof task !== 'object') {
      return;
    }

    const profiles = getTaskSubordinateProfiles(task);
    if (!profiles.length) {
      return;
    }

    const taskTokens = new Set();
    profiles.forEach((profile) => {
      if (!profile) {
        return;
      }

      const candidates = collectResponsibleSearchTokens(
        profile.token,
        profile.searchTokens,
        profile.label,
        profile.sourceLabel,
      );

      if (!(candidates instanceof Set) || candidates.size === 0) {
        const fallback = normalizeResponsibleKey(profile.token || profile.label || profile.sourceLabel);
        if (fallback && !taskTokens.has(fallback)) {
          taskTokens.add(fallback);
        }
        return;
      }

      candidates.forEach((candidate) => {
        const normalized = normalizeResponsibleKey(candidate);
        if (!normalized || taskTokens.has(normalized)) {
          return;
        }
        taskTokens.add(normalized);
      });
    });

    taskTokens.forEach((token) => {
      const current = counts.get(token) || 0;
      counts.set(token, current + 1);
    });
  });

  return counts;
}

function collectResponsibleEntryTokens(entry) {
  if (!entry || typeof entry !== 'object') {
    return new Set();
  }

  const tokens = collectResponsibleSearchTokens(
    entry.token,
    entry.displayName,
    entry.sourceName,
    entry.name,
    entry.label,
    entry.searchTokens,
  );

  const normalizedTokens = new Set();
  if (tokens instanceof Set) {
    tokens.forEach((value) => {
      const normalized = normalizeResponsibleKey(value);
      if (normalized) {
        normalizedTokens.add(normalized);
      }
    });
  }

  return normalizedTokens;
}

function countTasksMatchingTokens(tasks, tokens) {
  if (!Array.isArray(tasks) || !(tokens instanceof Set) || tokens.size === 0) {
    return 0;
  }

  let matches = 0;

  tasks.forEach((task) => {
    if (!task || typeof task !== 'object') {
      return;
    }

    const profiles = getTaskResponsibleProfiles(task);
    if (!profiles.length) {
      return;
    }

    const taskMatches = profiles.some((profile) => {
      const profileTokens = collectResponsibleSearchTokens(
        profile.token,
        profile.searchTokens,
        profile.label,
        profile.sourceLabel,
      );
      return hasTokenIntersection(tokens, profileTokens);
    });

    if (taskMatches) {
      matches += 1;
    }
  });

  return matches;
}

function resolveResponsibleCount(entry, counts, tasks) {
  if (!entry || typeof entry !== 'object') {
    return 0;
  }

  const entryTokens = collectResponsibleEntryTokens(entry);

  let count = 0;
  entryTokens.forEach((token) => {
    if (!token || !counts.has(token)) {
      return;
    }
    count = Math.max(count, counts.get(token) || 0);
  });

  if (count === 0) {
    const directCount = countTasksMatchingTokens(tasks, entryTokens);
    if (directCount > 0) {
      count = directCount;
    }
  }

  if (count === 0 && typeof entry.count === 'number' && Number.isFinite(entry.count)) {
    count = entry.count;
  }

  if (count === 0 && typeof entry.totalCount === 'number' && Number.isFinite(entry.totalCount)) {
    count = entry.totalCount;
  }

  if (count === 0 && typeof entry.activeCount === 'number' && Number.isFinite(entry.activeCount)) {
    count = entry.activeCount;
  }

  return count;
}

function getTaskShortTitle(task, fallbackIndex = 0) {
  if (!task || typeof task !== 'object') {
    return `Задача ${fallbackIndex + 1}`;
  }

  const entry = normalizeValue(task.entryNumber);
  const documentName = normalizeValue(task.document) || normalizeValue(task.summary) || `Задача ${fallbackIndex + 1}`;
  const status = getTaskStatusValue(task);
  const due = formatDate(task.dueDate);

  const parts = [];
  if (entry) {
    parts.push(`№ ${entry}`);
  }
  parts.push(documentName);
  if (status) {
    parts.push(`• ${status}`);
  }
  if (due && due !== '—') {
    parts.push(`• до ${due}`);
  }

  return truncateText(parts.join(' ').replace(/\s{2,}/g, ' ').trim(), 120);
}

function buildAssignmentHistoryItemsByToken(sourceTasks, token, options = {}) {
  const tasks = Array.isArray(sourceTasks) ? sourceTasks : [];
  const normalizedToken = normalizeResponsibleKey(token);
  if (!normalizedToken) {
    return [];
  }

  const source = options.source === 'subordinate' ? 'subordinate' : 'responsible';
  const matchesTask = source === 'subordinate'
    ? (task) => taskMatchesSubordinateFilter(task, normalizedToken)
    : (task) => taskMatchesResponsibleFilter(task, normalizedToken);

  return tasks.reduce((result, task, index) => {
    if (!task || typeof task !== 'object' || !matchesTask(task)) {
      return result;
    }

    const focusTaskId = normalizeValue(task.id)
      || normalizeValue(task.entryNumber)
      || normalizeValue(task.registryNumber)
      || normalizeValue(task.documentNumber)
      || '';

    result.push({
      anchorId: buildCardAnchorId(task, index),
      title: getTaskShortTitle(task, index),
      status: getTaskStatusValue(task),
      dueDate: formatDate(task.dueDate),
      focusTaskId,
    });

    return result;
  }, []);
}

function renderAssignmentHistory(token, options = {}) {
  const source = options.source === 'subordinate' ? 'subordinate' : 'responsible';
  const container = source === 'subordinate' ? elements.subordinateHistory : elements.responsibleHistory;

  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.innerHTML = '';

  const normalizedToken = normalizeResponsibleKey(token);
  if (!normalizedToken) {
    container.hidden = true;
    return;
  }

  const items = buildAssignmentHistoryItemsByToken(state.tasks, normalizedToken, { source });

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'appdosc__assignment-history-empty';
    empty.textContent = 'История назначений не найдена.';
    container.appendChild(empty);
    container.hidden = false;
    return;
  }

  const title = document.createElement('div');
  title.className = 'appdosc__assignment-history-title';
  title.textContent = `История задач (${items.length})`;
  container.appendChild(title);

  const list = document.createElement('div');
  list.className = 'appdosc__assignment-history-list';

  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc__assignment-history-item';
    button.textContent = item.title;
    button.title = item.title;
    if (item.anchorId) {
      button.addEventListener('click', () => {
        if (item.focusTaskId) {
          state.entryTaskId = String(item.focusTaskId);
          updateVisibleTasks();
          render();
        }
        state.selectedCardAnchor = item.anchorId || state.selectedCardAnchor;
        scrollToCard(item.anchorId);
      });
    } else {
      button.disabled = true;
    }
    list.appendChild(button);
  });

  container.appendChild(list);
  container.hidden = false;
}

function clearAssignmentHistory(source = 'responsible') {
  const container = source === 'subordinate' ? elements.subordinateHistory : elements.responsibleHistory;
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container.innerHTML = '';
  container.hidden = true;
}

function renderResponsibleButtons() {
  if (!elements.responsibleList) {
    return;
  }

  const directorState = ensureDirectorState();
  const responsibles = Array.isArray(directorState.responsibles) ? directorState.responsibles : [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const counts = calculateResponsibleTaskCounts(tasks);

  elements.responsibleList.innerHTML = '';
  elements.responsibleButtons = new Map();

  responsibles.forEach((entry) => {
    const token = entry.token || '';
    if (!token) {
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc__badge appdosc__badge--responsible';
    button.dataset.responsibleFilter = token;
    button.setAttribute('aria-pressed', 'false');
    const displayName = normalizeValue(entry.displayName)
      || normalizeValue(entry.sourceName)
      || normalizeValue(entry.name)
      || normalizeValue(entry.label)
      || 'Ответственный';
    const count = resolveResponsibleCount(entry, counts, tasks);
    button.textContent = `${displayName} (${count})`;
    button.dataset.responsibleCount = String(count);
    button.title = `Показать задачи: ${displayName}`;
    button.addEventListener('click', () => handleResponsibleButtonClick(token));
    elements.responsibleList.appendChild(button);
    elements.responsibleButtons.set(token, button);
  });
}

function renderSubordinateButtons() {
  if (!elements.subordinateList) {
    return;
  }

  const directorState = ensureDirectorState();
  const subordinates = Array.isArray(directorState.subordinates) ? directorState.subordinates : [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const counts = calculateSubordinateTaskCounts(tasks);

  elements.subordinateList.innerHTML = '';
  elements.subordinateButtons = new Map();

  const debugEntries = [];

  subordinates.forEach((entry) => {
    const token = entry && entry.token ? entry.token : '';
    if (!token) {
      return;
    }
    const normalizedToken = normalizeResponsibleKey(token);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc__badge appdosc__badge--responsible';
    button.dataset.subordinateFilter = token;
    button.setAttribute('aria-pressed', 'false');
    const displayName = normalizeValue(entry.displayName)
      || normalizeValue(entry.name)
      || normalizeValue(entry.sourceName)
      || 'Подчинённый';
    const count = counts.get(normalizedToken || token) || 0;
    button.textContent = `${displayName} (${count})`;
    button.dataset.subordinateCount = String(count);
    button.title = `Показать задачи: ${displayName}`;
    button.addEventListener('click', () => handleResponsibleButtonClick(token, { source: 'subordinate' }));
    elements.subordinateList.appendChild(button);
    elements.subordinateButtons.set(token, button);
    debugEntries.push({ token, normalizedToken, name: displayName, count });
  });

  logSubordinateDebug('panel_rendered', {
    total: subordinates.length,
    entries: debugEntries,
  });
}

function updateDirectorSummary() {
  const directorState = ensureDirectorState();
  const normalizedFilters = normalizeTaskFilters(state.taskFilter);
  state.taskFilter = normalizedFilters;
  const filterLabel = formatTaskFiltersForLog(normalizedFilters);
  const isDirector = directorState.isActive === true;
  const hasResponsibles = Array.isArray(directorState.responsibles)
    && directorState.responsibles.length > 0;
  const hasDirectorAccess = userHasDirectorAccess();
  const hasSubordinateAccess = userHasSubordinateAccess();
  const responsibleFilter = normalizedFilters.find((filter) => isResponsibleFilter(filter)) || '';
  const subordinateFilter = normalizedFilters.find((filter) => isSubordinateFilter(filter)) || '';
  const hasResponsibleFilter = isDirector && Boolean(responsibleFilter);
  const subordinates = Array.isArray(directorState.subordinates) ? directorState.subordinates : [];
  const hasSubordinates = isDirector && subordinates.length > 0;
  const hasSubordinateFilter = isDirector && Boolean(subordinateFilter);
  const subordinateOnlyView = hasSubordinateAccess && !hasDirectorAccess;

  if (hasResponsibleFilter) {
    directorState.responsiblePanelExpanded = true;
  }
  if (hasSubordinateFilter) {
    directorState.subordinatePanelExpanded = true;
  }

  if (isDirector) {
    if (directorState.summaryExpanded) {
      directorState.summaryExpanded = false;
    }
    if (hasResponsibleFilter) {
      const token = getResponsibleFilterToken(responsibleFilter);
      directorState.selectedResponsibleToken = token || '';
      directorState.selectedSubordinateToken = '';
    } else if (hasSubordinateFilter) {
      const token = getSubordinateFilterToken(subordinateFilter);
      directorState.selectedResponsibleToken = token || '';
      directorState.selectedSubordinateToken = token || '';
    } else if (!normalizedFilters.length) {
      directorState.selectedResponsibleToken = '';
      directorState.selectedSubordinateToken = '';
    }
  }

  const allowCollapse = false;
  const expanded = !isDirector;
  const showStatusList = !isDirector;

  if (elements.summaryStatus instanceof HTMLElement) {
    setClass(elements.summaryStatus, 'appdosc__summary-status--collapsible', allowCollapse);
    setClass(elements.summaryStatus, 'appdosc__summary-status--collapsed', allowCollapse && !expanded);
  }

  if (elements.summaryToggle instanceof HTMLElement) {
    elements.summaryToggle.hidden = !allowCollapse;
    elements.summaryToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  if (elements.summaryToggleIcon instanceof HTMLElement) {
    elements.summaryToggleIcon.textContent = expanded ? '▲' : '▼';
  }

  if (elements.summaryList instanceof HTMLElement) {
    elements.summaryList.hidden = !showStatusList;
  }

  const disableStatusInteractions = isDirector;

  if (elements.statusBadges) {
    Object.values(elements.statusBadges).forEach((badge) => {
      if (badge instanceof HTMLElement) {
        badge.setAttribute('aria-disabled', disableStatusInteractions ? 'true' : 'false');
        if (disableStatusInteractions) {
          badge.title = 'Фильтрация по статусу недоступна в режиме директора';
        } else if (
          badge.title === 'Фильтрация по статусу недоступна при выборе ответственного'
            || badge.title === 'Фильтрация по статусу недоступна в режиме директора'
        ) {
          badge.removeAttribute('title');
        }
      }
    });
  }

  if (elements.overdue instanceof HTMLElement) {
    elements.overdue.setAttribute('aria-disabled', disableStatusInteractions ? 'true' : 'false');
    if (disableStatusInteractions) {
      elements.overdue.title = 'Фильтрация по просроченным задачам недоступна в режиме директора';
    } else if (
      elements.overdue.title === 'Фильтрация по просроченным задачам недоступна при выборе ответственного'
        || elements.overdue.title === 'Фильтрация по просроченным задачам недоступна в режиме директора'
    ) {
      elements.overdue.removeAttribute('title');
    }
  }

  const shouldShowResponsibles = isDirector && hasResponsibles && !subordinateOnlyView;

  if (elements.responsibleTitle instanceof HTMLElement) {
    if (shouldShowResponsibles) {
      elements.responsibleTitle.textContent = RESPONSIBLE_PANEL_TITLE;
      elements.responsibleTitle.removeAttribute('aria-hidden');
    } else {
      elements.responsibleTitle.textContent = '';
      elements.responsibleTitle.setAttribute('aria-hidden', 'true');
    }
  }

  if (elements.responsiblePanel instanceof HTMLElement) {
    elements.responsiblePanel.hidden = !shouldShowResponsibles;

    if (shouldShowResponsibles) {
      renderResponsibleButtons();
    } else {
      if (elements.responsibleList) {
        elements.responsibleList.innerHTML = '';
        elements.responsibleList.hidden = true;
      }
      if (elements.responsibleButtons instanceof Map) {
        elements.responsibleButtons.clear();
      }
      clearAssignmentHistory('responsible');
      setClass(elements.responsiblePanel, 'appdosc__responsible-panel--collapsed', true);
    }
  }

  if (shouldShowResponsibles) {
    const expanded = directorState.responsiblePanelExpanded === true;
    if (elements.responsibleList instanceof HTMLElement) {
      elements.responsibleList.hidden = !expanded;
    }
    if (elements.responsibleToggle instanceof HTMLElement) {
      elements.responsibleToggle.hidden = false;
      elements.responsibleToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (elements.responsibleToggleIcon instanceof HTMLElement) {
      elements.responsibleToggleIcon.textContent = expanded ? '▲' : '▼';
    }
    if (elements.responsiblePanel instanceof HTMLElement) {
      setClass(elements.responsiblePanel, 'appdosc__responsible-panel--collapsed', !expanded);
    }
  } else {
    directorState.responsiblePanelExpanded = false;
    if (elements.responsibleToggle instanceof HTMLElement) {
      elements.responsibleToggle.hidden = true;
      elements.responsibleToggle.setAttribute('aria-expanded', 'false');
    }
    if (elements.responsibleToggleIcon instanceof HTMLElement) {
      elements.responsibleToggleIcon.textContent = '▼';
    }
    if (elements.responsibleList instanceof HTMLElement) {
      elements.responsibleList.hidden = true;
    }
    if (elements.responsiblePanel instanceof HTMLElement) {
      setClass(elements.responsiblePanel, 'appdosc__responsible-panel--collapsed', true);
    }
  }

  const shouldShowSubordinates = isDirector && hasSubordinates;

  if (elements.subordinateTitle instanceof HTMLElement) {
    if (shouldShowSubordinates) {
      elements.subordinateTitle.textContent = SUBORDINATE_PANEL_TITLE;
      elements.subordinateTitle.removeAttribute('aria-hidden');
    } else {
      elements.subordinateTitle.textContent = '';
      elements.subordinateTitle.setAttribute('aria-hidden', 'true');
    }
  }

  if (elements.subordinatePanel instanceof HTMLElement) {
    elements.subordinatePanel.hidden = !shouldShowSubordinates;

    if (shouldShowSubordinates) {
      renderSubordinateButtons();
    } else {
      if (elements.subordinateList) {
        elements.subordinateList.innerHTML = '';
        elements.subordinateList.hidden = true;
      }
      if (elements.subordinateButtons instanceof Map) {
        elements.subordinateButtons.clear();
      }
      clearAssignmentHistory('subordinate');
      setClass(elements.subordinatePanel, 'appdosc__responsible-panel--collapsed', true);
    }
  }

  if (shouldShowSubordinates) {
    const expanded = directorState.subordinatePanelExpanded === true;
    if (elements.subordinateList instanceof HTMLElement) {
      elements.subordinateList.hidden = !expanded;
    }
    if (elements.subordinateToggle instanceof HTMLElement) {
      elements.subordinateToggle.hidden = false;
      elements.subordinateToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (elements.subordinateToggleIcon instanceof HTMLElement) {
      elements.subordinateToggleIcon.textContent = expanded ? '▲' : '▼';
    }
    if (elements.subordinatePanel instanceof HTMLElement) {
      setClass(elements.subordinatePanel, 'appdosc__responsible-panel--collapsed', !expanded);
    }
  } else {
    directorState.subordinatePanelExpanded = false;
    if (elements.subordinateToggle instanceof HTMLElement) {
      elements.subordinateToggle.hidden = true;
      elements.subordinateToggle.setAttribute('aria-expanded', 'false');
    }
    if (elements.subordinateToggleIcon instanceof HTMLElement) {
      elements.subordinateToggleIcon.textContent = '▼';
    }
    if (elements.subordinateList instanceof HTMLElement) {
      elements.subordinateList.hidden = true;
    }
    if (elements.subordinatePanel instanceof HTMLElement) {
      setClass(elements.subordinatePanel, 'appdosc__responsible-panel--collapsed', true);
    }
    clearAssignmentHistory('subordinate');
  }

  if (isDirector) {
    logDirectorDebug('status_buttons_visibility', {
      filter: filterLabel,
      hasResponsibleFilter,
      visible: showStatusList,
      enforcedHidden: !showStatusList,
    });
    logDirectorDebug('summary_state', {
      filter: filterLabel,
      hasResponsibleFilter,
      hasSubordinateFilter,
      expanded,
      statusesVisible: showStatusList,
      responsiblesVisible: shouldShowResponsibles,
      subordinatesVisible: isDirector && hasSubordinates,
      selectedResponsible: directorState.selectedResponsibleToken || null,
      selectedSubordinate: directorState.selectedSubordinateToken || null,
      hasDirectorAccess,
      hasSubordinateAccess,
      subordinateOnlyView,
    });
  }
}

function handleSummaryToggleClick() {
  const directorState = ensureDirectorState();
  const filterLabel = formatTaskFiltersForLog(state.taskFilter);
  if (directorState.isActive) {
    logDirectorDebug('summary_toggle_ignored', {
      filter: filterLabel,
      reason: 'status_controls_hidden',
    });
    return;
  }

  logDirectorDebug('summary_toggle_ignored', {
    filter: filterLabel,
    reason: 'toggle_disabled',
  });
}

function handleResponsibleToggleClick() {
  const directorState = ensureDirectorState();
  const hasResponsibles = Array.isArray(directorState.responsibles)
    && directorState.responsibles.length > 0;
  if (!hasResponsibles) {
    return;
  }

  directorState.responsiblePanelExpanded = directorState.responsiblePanelExpanded !== true;
  updateDirectorSummary();
}

function handleSubordinateToggleClick() {
  const directorState = ensureDirectorState();
  const hasSubordinates = Array.isArray(directorState.subordinates)
    && directorState.subordinates.length > 0;
  if (!hasSubordinates) {
    return;
  }

  directorState.subordinatePanelExpanded = directorState.subordinatePanelExpanded !== true;
  updateDirectorSummary();
}

function handleResponsibleButtonClick(token, options = {}) {
  if (typeof token !== 'string') {
    return;
  }

  const source = options.source === 'subordinate' ? 'subordinate' : 'responsible';
  const logFn = source === 'subordinate' ? logSubordinateDebug : logResponsibleDebug;

  const normalizedToken = normalizeResponsibleKey(token);
  if (!normalizedToken) {
    logFn('click_invalid_token', { token });
    return;
  }

  const prefix = source === 'subordinate' ? SUBORDINATE_FILTER_PREFIX : RESPONSIBLE_FILTER_PREFIX;
  const targetFilter = `${prefix}${normalizedToken}`;
  const previousFilters = normalizeTaskFilters(state.taskFilter);
  const previousFilterLabel = formatTaskFiltersForLog(previousFilters);
  const previousVisibleCount = getVisibleTaskCount();
  const nextFilters = setAssigneeFilterSelection(previousFilters, targetFilter);
  const nextFilterLabel = formatTaskFiltersForLog(nextFilters);

  if (previousFilterLabel === nextFilterLabel && previousVisibleCount) {
    logFn('click_no_change', {
      token,
      normalizedToken,
      filter: nextFilterLabel,
      visibleTasks: previousVisibleCount,
    });
    return;
  }

  const directorState = ensureDirectorState();
  const directoryEntry = directorState.responsibleDirectory instanceof Map
    ? directorState.responsibleDirectory.get(normalizedToken)
    : null;
  const subordinateDirectoryEntry = directorState.subordinateDirectory instanceof Map
    ? directorState.subordinateDirectory.get(normalizedToken)
    : null;
  const totalTasks = Array.isArray(state.tasks) ? state.tasks.length : 0;

  if (state.entryTaskId) {
    state.entryTaskId = '';
  }

  if (!nextFilters.length) {
    directorState.summaryExpanded = false;
    directorState.selectedResponsibleToken = '';
    directorState.selectedSubordinateToken = '';
    clearAssignmentHistory('responsible');
    clearAssignmentHistory('subordinate');
  } else {
    directorState.summaryExpanded = true;
    directorState.selectedResponsibleToken = normalizedToken;
    if (source === 'subordinate') {
      directorState.selectedSubordinateToken = normalizedToken;
      directorState.subordinatePanelExpanded = true;
      clearAssignmentHistory('responsible');
      renderAssignmentHistory(normalizedToken, { source: 'subordinate' });
    } else {
      directorState.selectedSubordinateToken = '';
      directorState.responsiblePanelExpanded = true;
      clearAssignmentHistory('subordinate');
      renderAssignmentHistory(normalizedToken, { source: 'responsible' });
    }
  }

  state.taskFilter = nextFilters;
  state.selectedCardAnchor = '';
  updateVisibleTasks();
  const reason = !nextFilters.length
    ? `${source}_filter_reset`
    : `${source}_filter_change`;

  const visibleTasks = Array.isArray(state.visibleTasks)
    ? state.visibleTasks.map((item) => ({
      originalIndex: item && typeof item === 'object' ? item.originalIndex : null,
      task: buildTaskDebugSummary(item && typeof item === 'object' ? item.task : null),
    }))
    : [];

  const directorySnapshot = source === 'subordinate'
    ? buildResponsibleDirectorySnapshot(subordinateDirectoryEntry)
    : buildResponsibleDirectorySnapshot(directoryEntry);

  logFn('click', {
    token,
    normalizedToken,
    previousFilter: previousFilterLabel,
    nextFilter: nextFilterLabel,
    reason,
    timestamp: new Date().toISOString(),
    totalTasks,
    matches: visibleTasks,
    matchCount: visibleTasks.length,
    directoryEntry: directorySnapshot,
  });
  if (directorState.isActive) {
    logDirectorDebug(`${source}_selection`, {
      previousFilter: previousFilterLabel,
      nextFilter: nextFilterLabel,
      normalizedToken,
      summaryExpanded: directorState.summaryExpanded,
      selectedResponsible: directorState.selectedResponsibleToken || null,
      selectedSubordinate: directorState.selectedSubordinateToken || null,
    });
  }
  safeRender(reason);
}

function matchesAssigneeStatusKey(assigneeKey, ids, names) {
  if (!assigneeKey) {
    return false;
  }
  const normalizedKey = normalizeValue(assigneeKey).toLowerCase();
  if (!normalizedKey) {
    return false;
  }
  if (normalizedKey.startsWith('id::')) {
    const candidate = normalizeIdentifier(normalizedKey.slice(4));
    return Boolean(candidate && ids.includes(candidate));
  }
  if (normalizedKey.startsWith('name::')) {
    const candidate = normalizeName(normalizedKey.slice(6));
    return Boolean(candidate && names.includes(candidate));
  }

  const normalizedId = normalizeIdentifier(normalizedKey);
  if (normalizedId && ids.includes(normalizedId)) {
    return true;
  }
  const normalizedName = normalizeName(normalizedKey);
  return Boolean(normalizedName && names.includes(normalizedName));
}

function resolveLatestAssigneeStatus(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const history = Array.isArray(task.assigneeStatusHistory) ? task.assigneeStatusHistory : [];
  if (!history.length) {
    return null;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return null;
  }

  let latest = null;
  let latestTimestamp = 0;

  history.forEach((record) => {
    if (!record || typeof record !== 'object') {
      return;
    }
    if (!matchesAssigneeStatusKey(record.assigneeKey || '', ids, names)) {
      return;
    }
    const entries = Array.isArray(record.entries) ? record.entries : [];
    if (!entries.length) {
      return;
    }
    const lastEntry = entries[entries.length - 1];
    const timestamp = Date.parse(lastEntry.changedAt || '');
    if (!Number.isFinite(timestamp)) {
      return;
    }
    if (!latest || timestamp > latestTimestamp) {
      latest = lastEntry;
      latestTimestamp = timestamp;
    }
  });

  return latest;
}

function getTaskStatusValue(task) {
  if (!task || typeof task !== 'object') {
    return '';
  }

  const assigneeStatus = resolveLatestAssigneeStatus(task);
  if (assigneeStatus && assigneeStatus.status) {
    return normalizeValue(assigneeStatus.status);
  }

  return normalizeValue(task.status);
}

function getTaskAssigneeId(task) {
  const identifiers = getTaskAssigneeIdentifiers(task);
  return identifiers.length ? identifiers[0] : '';
}

function resolveResponsibleOptionValue(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const candidates = [entry.telegram, entry.chatId, entry.email, entry.number, entry.login, entry.responsible];
  for (const candidate of candidates) {
    const value = normalizeValue(candidate);
    if (value) {
      return value;
    }
  }
  return '';
}

function resolveAssignmentSourceTag(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const source = entry.assignmentSource ? String(entry.assignmentSource).toLowerCase() : '';
  if (source === 'responsible') {
    return '(о)';
  }
  if (source === 'subordinate') {
    return '(п)';
  }
  if (source === 'both') {
    return '(о/п)';
  }
  return '';
}

function buildResponsibleOptionLabel(entry) {
  if (!entry || typeof entry !== 'object') {
    return 'Ответственный';
  }
  const title = normalizeValue(entry.responsible)
    || normalizeValue(entry.number)
    || 'Ответственный';
  const sourceTag = resolveAssignmentSourceTag(entry);
  const titleWithTag = sourceTag ? `${title} ${sourceTag}` : title;
  const meta = [];
  if (normalizeValue(entry.department)) {
    meta.push(entry.department);
  }
  if (normalizeValue(entry.telegram)) {
    meta.push(`TG ${normalizeValue(entry.telegram)}`);
  }
  if (normalizeValue(entry.chatId) && normalizeValue(entry.chatId) !== normalizeValue(entry.telegram)) {
    meta.push(`Chat ${normalizeValue(entry.chatId)}`);
  }
  if (normalizeValue(entry.email)) {
    meta.push(normalizeValue(entry.email));
  }
  if (normalizeValue(entry.note)) {
    meta.push(normalizeValue(entry.note));
  }
  return meta.length ? `${titleWithTag} • ${meta.join(' • ')}` : titleWithTag;
}

function buildSubordinateOptionLabel(entry) {
  if (!entry || typeof entry !== 'object') {
    return 'Подчинённый';
  }
  const title = normalizeValue(entry.responsible)
    || normalizeValue(entry.number)
    || 'Подчинённый';
  const sourceTag = resolveAssignmentSourceTag(entry);
  const titleWithTag = sourceTag ? `${title} ${sourceTag}` : title;
  const meta = [];
  if (normalizeValue(entry.department)) {
    meta.push(entry.department);
  }
  if (normalizeValue(entry.chatId) && normalizeValue(entry.chatId) !== normalizeValue(entry.telegram)) {
    meta.push(`Chat ${normalizeValue(entry.chatId)}`);
  }
  if (normalizeValue(entry.email)) {
    meta.push(normalizeValue(entry.email));
  }
  if (normalizeValue(entry.note)) {
    meta.push(normalizeValue(entry.note));
  }
  return meta.length ? `${titleWithTag} • ${meta.join(' • ')}` : titleWithTag;
}

function formatDocumentCell(task) {
  const parts = [];
  if (task.documentNumber) {
    parts.push(`№ ${task.documentNumber}`);
  }
  const formattedDate = formatDate(task.documentDate);
  if (formattedDate !== '—') {
    parts.push(`от ${formattedDate}`);
  }
  return parts.length ? parts.join(' ') : '—';
}

function dedupeExecutorNames(candidates) {
  const seen = new Set();
  const result = [];

  candidates.forEach((candidate) => {
    const normalized = normalizeName(candidate);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);

    const display = normalizeValue(candidate);
    if (display) {
      result.push(display);
    }
  });

  return result;
}

function resolveExecutor(task) {
  const executorValue = normalizeValue(task?.executor);
  if (executorValue) {
    const splitCandidates = executorValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const uniqueSplit = dedupeExecutorNames(splitCandidates);
    if (uniqueSplit.length && uniqueSplit.length !== splitCandidates.length) {
      return uniqueSplit.join(', ');
    }
    return executorValue;
  }

  if (Array.isArray(task.assignees) && task.assignees.length) {
    const names = dedupeExecutorNames(
      task.assignees
        .map((assignee) => {
          if (!assignee || typeof assignee !== 'object') {
            return '';
          }
          return (
            assignee.name
              || assignee.responsible
              || assignee.department
              || assignee.email
              || assignee.telegram
          );
        })
        .filter(Boolean)
    );

    if (names.length) {
      return names.join(', ');
    }
  }

  if (task.assignee && typeof task.assignee === 'object') {
    const [primary] = dedupeExecutorNames([
      task.assignee.name,
      task.assignee.responsible,
      task.assignee.department,
      task.assignee.email,
      task.assignee.telegram,
    ]);
    return primary || '—';
  }

  return '—';
}

function isTaskCompleted(task) {
  if (!task || typeof task !== 'object') {
    return false;
  }
  const statusText = getTaskStatusValue(task).toLowerCase();
  if (!statusText) {
    return isDirectorCompletionMarked(task);
  }
  if (statusText.includes('выполн') || statusText.includes('complete') || statusText.includes('готов')) {
    return true;
  }

  return isDirectorCompletionMarked(task);
}

function isTaskUnderReview(task) {
  if (!task || typeof task !== 'object') {
    return false;
  }
  const statusText = normalizeName(getTaskStatusValue(task));
  if (!statusText) {
    return false;
  }
  return statusText.includes('на проверк');
}

function isAssignmentAuthoredByUser(entry, ids, names) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  if (!Array.isArray(ids) || !Array.isArray(names) || (ids.length === 0 && names.length === 0)) {
    return false;
  }

  const candidates = [
    entry.assignedBy,
    entry.assigned_by,
    entry.assignedById,
    entry.assigned_by_id,
    entry.assignmentAuthor,
    entry.assignmentAuthorId,
    entry.assignmentAuthorName,
    entry.assignedByLogin,
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const normalizedId = normalizeIdentifier(candidate);
    if (normalizedId && ids.includes(normalizedId)) {
      return true;
    }
    const normalizedName = normalizeName(candidate);
    if (normalizedName && names.includes(normalizedName)) {
      return true;
    }
  }

  return false;
}

function isDirectorAssignmentOverdue(task) {
  if (!task || typeof task !== 'object') {
    return false;
  }

  const statusKey = getTaskStatusKeyForUser(task);
  if (statusKey === 'done' || statusKey === 'cancelled' || isTaskCompleted(task)) {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkAssignments = (entries) => {
    if (!Array.isArray(entries) || !entries.length) {
      return false;
    }

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      if (!isAssignmentAuthoredByUser(entry, ids, names)) {
        continue;
      }

      const dueValue = normalizeAssignmentDueDate(entry.assignmentDueDate);
      if (!dueValue) {
        continue;
      }

      const dueDate = parseDate(dueValue);
      if (!dueDate) {
        continue;
      }
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate.getTime() < today.getTime()) {
        return true;
      }
    }

    return false;
  };

  return (
    checkAssignments(collectTaskAssignments(task, 'responsible'))
    || checkAssignments(collectTaskAssignments(task, 'subordinate'))
  );
}

function isOverdue(task) {
  if (isTaskCompleted(task)) {
    return false;
  }
  const due = parseDate(task.dueDate);
  if (!due) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function updateFooter() {
  if (!elements.organizations) {
    return;
  }

  const processed = state.organizationsChecked || state.organizations.length;
  const matched = Array.isArray(state.organizations)
    ? state.organizations.reduce((total, summary) => {
      const count = Number(summary && summary.count);
      return total + (Number.isFinite(count) && count > 0 ? 1 : 0);
    }, 0)
    : 0;

  const segments = [`Организаций обработано: ${processed}`];
  segments.push(`Задачи найдены в: ${matched}`);
  elements.organizations.textContent = segments.join(' • ');
}

function setStatus(type, message) {
  if (!elements.status) {
    return;
  }
  elements.status.textContent = message;
  elements.status.hidden = !message;
  elements.status.className = 'appdosc__status-message';
  if (type && STATUS_CLASSES[type]) {
    elements.status.classList.add(STATUS_CLASSES[type]);
  }
}

function setStatusAction(type, message, actionLabel, actionHandler) {
  if (!elements.status) {
    return;
  }

  elements.status.hidden = !message;
  elements.status.className = 'appdosc__status-message';
  if (type && STATUS_CLASSES[type]) {
    elements.status.classList.add(STATUS_CLASSES[type]);
  }

  elements.status.innerHTML = '';

  const text = document.createElement('span');
  text.className = 'appdosc__status-text';
  text.textContent = message;
  elements.status.appendChild(text);

  if (actionLabel && typeof actionHandler === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appdosc__status-action';
    button.textContent = actionLabel;
    button.addEventListener('click', actionHandler);
    elements.status.appendChild(button);
  }
}

function clearStatus() {
  if (!elements.status) {
    return;
  }
  elements.status.hidden = true;
  elements.status.textContent = '';
  elements.status.className = 'appdosc__status-message';
}

function handleSummaryBadgeClick(filter) {
  const normalizedTarget = normalizeTaskFilter(filter);
  const previousFilters = normalizeTaskFilters(state.taskFilter);
  const directorState = ensureDirectorState();
  if (directorState.isActive && hasAssigneeFilters(previousFilters)) {
    logDirectorDebug('status_click_blocked', {
      previousFilter: formatTaskFiltersForLog(previousFilters),
      target: normalizedTarget,
      reason: 'responsible_filter_active',
    });
    return;
  }
  const nextFilters = toggleStatusFilterSelection(previousFilters, normalizedTarget);

  if (formatTaskFiltersForLog(previousFilters) === formatTaskFiltersForLog(nextFilters)
    && getVisibleTaskCount()) {
    return;
  }

  state.taskFilter = nextFilters;
  state.selectedCardAnchor = '';
  updateVisibleTasks();
  const reason = nextFilters.length === 0 ? 'task_filter_reset' : 'task_filter_change';
  safeRender(reason);
}

function attachEvents() {
  if (elements.refreshButton) {
    elements.refreshButton.addEventListener('click', () => loadTasks(true));
  }
  if (elements.taskSelector) {
    elements.taskSelector.addEventListener('change', handleTaskSelectorChange);
  }
  if (elements.summaryToggle) {
    elements.summaryToggle.addEventListener('click', handleSummaryToggleClick);
  }
  if (elements.responsibleToggle) {
    elements.responsibleToggle.addEventListener('click', handleResponsibleToggleClick);
  }
  if (elements.subordinateToggle) {
    elements.subordinateToggle.addEventListener('click', handleSubordinateToggleClick);
  }
  if (elements.statusBadges) {
    Object.entries(STATUS_SUMMARY_CONFIG).forEach(([key, config]) => {
      const element = elements.statusBadges[key];
      if (element instanceof HTMLElement) {
        element.addEventListener('click', () => handleSummaryBadgeClick(config.filter));
      }
    });
  }
  if (elements.overdue) {
    elements.overdue.addEventListener('click', () => handleSummaryBadgeClick('overdue'));
  }
  if (elements.viewerDownload) {
    elements.viewerDownload.addEventListener('click', handleViewerDownloadClick);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadTasks(false);
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      loadTasks(false);
    }
  });
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) {
    return '—';
  }
  return date.toLocaleDateString('ru-RU');
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) {
    return '—';
  }
  return date.toLocaleString('ru-RU', { hour12: false });
}

function formatDateInputValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const date = parseDate(value);
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return '';
  }

  return formatDateInputValue(trimmed);
}

function parseDate(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const string = String(value).trim();
  if (!string) {
    return null;
  }

  const isoDate = string.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const timestamp = Date.parse(string);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeStatsFromTasks(tasks, options = {}) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return {
      total: 0,
      completed: 0,
      overdue: 0,
      active: 0,
      statuses: createEmptyStatusCounters(),
    };
  }

  const statusCounters = createEmptyStatusCounters();
  let completed = 0;
  let overdue = 0;
  let active = 0;
  const useDirectorDeadlines = options.useDirectorDeadlines === true;

  tasks.forEach((item) => {
    const task = isPlainObject(item) ? item : {};
    const statusKey = getTaskStatusKeyForUser(task);
    if (statusKey && Object.prototype.hasOwnProperty.call(statusCounters, statusKey)) {
      statusCounters[statusKey] += 1;
    }
    if (statusKey === 'done' || isTaskCompleted(task)) {
      completed += 1;
      return;
    }
    if (statusKey === 'cancelled') {
      return;
    }
    const overdueForDirector = useDirectorDeadlines && isDirectorAssignmentOverdue(task);
    if (overdueForDirector || (!useDirectorDeadlines && isOverdue(task))) {
      overdue += 1;
      return;
    }
    active += 1;
  });

  const total = tasks.length;

  return {
    total,
    completed,
    overdue,
    active,
    statuses: statusCounters,
  };
}

function updateOrganizationAccessMaps() {
  if (!state.access) {
    state.access = { responsibles: {}, subordinates: {}, directors: {}, instruction: {} };
  }
  state.access.responsibles = {};
  state.access.subordinates = {};
  state.access.directors = {};
  state.access.instruction = {};

  if (!Array.isArray(state.organizations)) {
    return;
  }

  state.organizations.forEach((summary) => {
    if (!summary || typeof summary !== 'object') {
      return;
    }
    const rawName = summary.name || summary.organization || '';
    const key = getOrganizationKey(rawName);
    if (!key) {
      return;
    }
    if (Array.isArray(summary.responsibles)) {
      state.access.responsibles[key] = summary.responsibles.slice();
    }
    if (Array.isArray(summary.subordinates)) {
      state.access.subordinates[key] = summary.subordinates.slice();
    }
    if (Array.isArray(summary.directors)) {
      state.access.directors[key] = summary.directors.slice();
    }
    if (typeof summary.canManageInstructions === 'boolean') {
      state.access.instruction[key] = summary.canManageInstructions;
    }
  });
}

function bootstrap() {
  if (typeof window !== 'undefined') {
    window.__DOCS_PDF_LOGGER__ = (entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      if (entry.scope !== 'zoom') {
        return;
      }
      sendPdfLogEntry(entry.prefix || '', entry.step || '', entry.details);
    };
  }
  attachConsoleCapture();
  attachGlobalErrorHandlers();
  initElements();
  pdfViewerInstance = createPdfViewer(document);
  attachPdfDiagnostics();
  readAssetVersionInfo();
  initTelegram();
  attachEvents();
  if (!safeRender('bootstrap_initial')) {
    try {
      renderEmpty();
    } catch (error) {
      /* ignore empty render errors */
    }
  }
  loadTasks();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
function buildAssignmentDirectory(entries, role) {
  const directory = new Map();
  if (!Array.isArray(entries)) {
    return directory;
  }

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const value = resolveResponsibleOptionValue(entry);
    if (!value) {
      return;
    }

    const label = role === 'subordinate'
      ? buildSubordinateOptionLabel(entry)
      : buildResponsibleOptionLabel(entry);

    const candidates = [
      value,
      entry.id,
      entry.telegram,
      entry.chatId,
      entry.email,
      buildAssignmentNumberKey(entry),
      entry.login,
      entry.responsible,
      entry.name,
    ];

    candidates.forEach((candidate) => {
      const key = buildAssignmentDirectoryKey(candidate);
      if (key && !directory.has(key)) {
        directory.set(key, { value, label, entry });
      }
    });
  });

  return directory;
}

function buildAssignmentDirectoryKey(candidate) {
  if (candidate === null || candidate === undefined) {
    return '';
  }

  const normalized = normalizeIdentifier(candidate);
  if (normalized) {
    return normalized;
  }

  const normalizedName = normalizeName(candidate);
  return normalizedName || '';
}

function buildAssignmentNumberKey(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const number = normalizeIdentifier(entry.number);
  if (!number) {
    return '';
  }
  const name = normalizeName(entry.responsible || entry.name);
  if (!name) {
    return `number::${number}`;
  }
  return `number::${number}::${name}`;
}

function collectTaskAssignments(task, role) {
  const desiredRole = role === 'subordinate' ? 'subordinate' : 'responsible';
  const result = [];
  const seenPrimaryKeys = new Set();

  const pushEntry = (entry, fallbackRole = 'responsible') => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const entryRole = resolveAssigneeRole(entry, fallbackRole);
    if (entryRole !== desiredRole) {
      return;
    }
    const keys = [];
    const normalizedId = normalizeIdentifier(entry.id);
    if (normalizedId) {
      keys.push(`id:${normalizedId}`);
    }
    const normalizedLogin = normalizeIdentifier(entry.login);
    if (normalizedLogin) {
      keys.push(`login:${normalizedLogin}`);
    }
    if (keys.length > 0) {
      let duplicate = false;
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (seenPrimaryKeys.has(key)) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) {
        return;
      }
      keys.forEach((key) => seenPrimaryKeys.add(key));
    }
    result.push(entry);
  };

  if (!task || typeof task !== 'object') {
    return result;
  }

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((entry) => pushEntry(entry));
  }

  if (task.assignee && typeof task.assignee === 'object') {
    pushEntry(task.assignee);
  }

  if (desiredRole === 'subordinate') {
    if (Array.isArray(task.subordinates)) {
      task.subordinates.forEach((entry) => pushEntry(entry, 'subordinate'));
    }
    if (task.subordinate && typeof task.subordinate === 'object') {
      pushEntry(task.subordinate, 'subordinate');
    }
  } else {
    if (Array.isArray(task.responsibles)) {
      task.responsibles.forEach((entry) => pushEntry(entry));
    }
    if (task.responsible && typeof task.responsible === 'object') {
      pushEntry(task.responsible);
    }
  }

  return result;
}



function sendResponseViewerLog(stage, payload = {}) {
  const body = {
    action: 'response_viewer_log',
    stage: normalizeValue(stage) || 'unknown',
    details: payload && typeof payload === 'object' ? payload : {},
  };

  fetch('/docs.php', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}


function appendResponseCacheKey(url, cacheKey) {
  if (!url) {
    return '';
  }

  const resolvedKey = normalizeValue(cacheKey) || String(Date.now());
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('v', resolvedKey);
    return parsed.toString();
  } catch (error) {
    const separator = String(url).includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(resolvedKey)}`;
  }
}

function collectResponseIdentityKeysFromEntry(entry, fallbackValue = '') {
  const keys = new Set();
  const push = (value) => {
    const key = buildAssignmentDirectoryKey(value);
    if (key) {
      keys.add(key);
    }
  };

  push(fallbackValue);

  if (entry && typeof entry === 'object') {
    [
      entry.id,
      entry.subordinateId,
      entry.subordinate,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
      entry.value,
      entry.label,
    ].forEach(push);
  }

  return keys;
}

function collectResponseIdentityKeysFromFile(file) {
  const keys = new Set();
  if (!file || typeof file !== 'object') {
    return keys;
  }

  const push = (value) => {
    const key = buildAssignmentDirectoryKey(value);
    if (key) {
      keys.add(key);
    }
  };

  [
    file.uploadedByKey,
    file.uploadedById,
    file.uploadedByTelegram,
    file.uploadedByLogin,
    file.uploadedByName,
    file.uploadedBy,
  ].forEach(push);

  const rawByKey = normalizeValue(file.uploadedByKey);
  if (rawByKey && rawByKey.includes(':')) {
    const parts = rawByKey.split(':');
    if (parts.length > 1) {
      push(parts.slice(1).join(':'));
    }
  }

  return keys;
}

function resolveResponseViewerFilesForEntry(task, entry, fallbackValue = '') {
  if (!task || typeof task !== 'object') {
    return [];
  }

  const responseFiles = Array.isArray(task.responses) ? task.responses : [];
  if (!responseFiles.length) {
    return [];
  }

  const entryKeys = collectResponseIdentityKeysFromEntry(entry, fallbackValue);
  if (!entryKeys.size) {
    return [];
  }

  const matched = [];
  responseFiles.forEach((file, index) => {
    if (!file || typeof file !== 'object') {
      return;
    }

    const fileKeys = collectResponseIdentityKeysFromFile(file);
    let hasMatch = false;
    for (const key of fileKeys) {
      if (entryKeys.has(key)) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) {
      return;
    }

    const preview = resolveFilePreviewSource(file);
    if (!preview) {
      return;
    }

    const displayName = normalizeValue(file.originalName)
      || normalizeValue(file.storedName)
      || `Ответ ${index + 1}`;
    const rawUrl = normalizeValue(file.url)
      || normalizeValue(file.storedName)
      || preview.raw;
    const cacheKey = normalizeValue(file.uploadedAt) || String(Date.now());
    const resolvedUrl = appendResponseCacheKey(preview.resolved, cacheKey);
    const previewUrl = appendResponseCacheKey(preview.resolved, cacheKey);
    const kind = resolveViewerFileKind(displayName, rawUrl || preview.resolved);

    matched.push({
      url: rawUrl,
      resolvedUrl,
      previewUrl,
      name: displayName,
      kind,
      isResponse: true,
    });
  });

  return matched;
}

function countResponseFilesForEntry(task, entry, fallbackValue = '') {
  return resolveResponseViewerFilesForEntry(task, entry, fallbackValue).length;
}

function isTextResponseFile(file) {
  if (!file || typeof file !== 'object') {
    return false;
  }
  if (file.isTextFile === true) {
    return true;
  }
  const name = normalizeValue(file.originalName) || normalizeValue(file.storedName);
  return /\.txt$/i.test(name);
}

function isResponseOwnedByCurrentUser(file) {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const userKeys = new Set();
  const { ids, names } = getUserIdentifierCandidates();
  ids.forEach((value) => {
    const key = buildAssignmentDirectoryKey(value);
    if (key) {
      userKeys.add(key);
    }
  });
  names.forEach((value) => {
    const key = buildAssignmentDirectoryKey(value);
    if (key) {
      userKeys.add(key);
    }
  });
  if (!userKeys.size) {
    return false;
  }
  const fileKeys = collectResponseIdentityKeysFromFile(file);
  for (const key of fileKeys) {
    if (userKeys.has(key)) {
      return true;
    }
  }
  return false;
}

function buildResponseViewButtonLabel(count) {
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
  return `Показать ответ (${safeCount})`;
}

function renderResponseFilesCounter(counterElement, count, isFresh = false, buttonElement = null) {
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
  if (counterElement) {
    counterElement.hidden = false;
    counterElement.dataset.fresh = isFresh ? 'true' : 'false';
    counterElement.textContent = `Файлов: ${safeCount}`;
  }
  if (buttonElement) {
    buttonElement.textContent = buildResponseViewButtonLabel(safeCount);
  }
}

async function fetchLatestTaskSnapshot(task) {
  if (!task || typeof task !== 'object' || typeof fetch !== 'function') {
    return null;
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (state.telegram.initData) {
      headers['X-Telegram-Init-Data'] = state.telegram.initData;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify(buildRequestBody()),
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload || payload.success !== true) {
      return null;
    }

    const collection = normalizeTasksCollection(payload.tasks);
    if (!collection.length) {
      return null;
    }

    const identityCandidates = [
      task.id,
      task.entryNumber,
      task.registryNumber,
      task.documentNumber,
    ].filter(Boolean);

    for (let i = 0; i < identityCandidates.length; i += 1) {
      const candidate = identityCandidates[i];
      const matchedTask = collection.find((item) => taskMatchesEntryTask(item, candidate));
      if (matchedTask) {
        return matchedTask;
      }
    }
  } catch (_) {
    return null;
  }

  return null;
}

async function refreshResponseCounterForEntry(counterElement, task, entry, fallbackValue = '', buttonElement = null) {
  if (!task) {
    return;
  }

  const freshTask = await fetchLatestTaskSnapshot(task);
  if (freshTask && typeof freshTask === 'object') {
    task.responses = Array.isArray(freshTask.responses) ? freshTask.responses : [];
  }

  const count = countResponseFilesForEntry(task, entry, fallbackValue);
  renderResponseFilesCounter(counterElement, count, Boolean(freshTask), buttonElement);
}

function formatResponseSummaryDate(value) {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(':', '.');
}

function buildResponseSummaryName(entry, role, index) {
  const roleLabel = role === 'subordinate' ? 'Подчинённый' : 'Ответственный';
  return normalizeValue(entry && entry.responsible)
    || normalizeValue(entry && entry.name)
    || `${roleLabel} ${index + 1}`;
}

function buildTaskResponseSummary(task) {
  if (!task || typeof task !== 'object') {
    return 'Нет данных по ответам.';
  }

  const rows = [];
  const appendRoleRows = (role) => {
    const assignments = collectTaskAssignments(task, role);
    assignments.forEach((entry, index) => {
      const fallbackValue = resolveAssignmentValueFromEntry(entry) || `${role}-${index + 1}`;
      const nameLabel = buildResponseSummaryName(entry, role, index);
      const files = resolveResponseViewerFilesForEntry(task, entry, fallbackValue);
      const uploadedDates = files
        .map((file) => parseDate(file && file.uploadedAt))
        .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
      const latestDate = uploadedDates.length
        ? new Date(Math.max(...uploadedDates.map((date) => date.getTime())))
        : null;
      const latestDateLabel = formatResponseSummaryDate(latestDate);

      rows.push(`${nameLabel} Ответ: ${files.length}${latestDateLabel ? ` (${latestDateLabel})` : ''}`);
    });
  };

  appendRoleRows('responsible');
  appendRoleRows('subordinate');

  return rows.length ? rows.join('\n') : 'Нет загруженных ответов.';
}

async function openResponseViewerForEntry(button, task, entry, fallbackValue = '') {
  if (!button || !task) {
    return;
  }

  const files = resolveResponseViewerFilesForEntry(task, entry, fallbackValue);
  const logBase = {
    ...buildTaskViewLogDetails(task),
    fallbackValue: normalizeValue(fallbackValue),
    entryLabel: normalizeValue(entry && typeof entry === 'object' ? (entry.label || entry.name || entry.responsible) : ''),
    filesCount: files.length,
  };
  sendResponseViewerLog('open_click', logBase);
  if (!files.length) {
    setStatus('warning', 'У этого исполнителя пока нет загруженного ответа.');
    sendResponseViewerLog('open_empty', logBase);
    return;
  }

  setActionButtonLoading(button, true);
  const firstFile = files[0];
  const displayName = firstFile.name || 'Ответ к задаче';
  showViewerLoader(displayName);
  docLoadStart(displayName, firstFile.kind || '');
  docLoadStep('подготовка ответов');

  try {
    renderViewerTabs(files, task);
    docLoadStep('открытие ответа');
    sendResponseViewerLog('open_attempt', {
      ...logBase,
      firstFile: summarizeViewerFile(firstFile),
      files: files.map((item) => summarizeViewerFile(item)),
    });
    const opened = await openViewerFile(firstFile, task, { notify: true, hasMultiple: files.length > 1 });
    sendResponseViewerLog('open_success', {
      ...logBase,
      mode: opened && opened.mode ? opened.mode : '',
      firstFile: summarizeViewerFile(firstFile),
    });
    docLoadFinish();
  } catch (error) {
    setStatus('error', 'Не удалось открыть ответ. Попробуйте позже.');
    sendResponseViewerLog('open_error', {
      ...logBase,
      error: error && error.message ? String(error.message) : 'unknown_error',
      firstFile: summarizeViewerFile(firstFile),
    });
    docLoadFinish(error);
  } finally {
    hideViewerLoader();
    setActionButtonLoading(button, false);
  }
}

function findAssignmentEntryByIdentifier(entries, identifier) {
  if (!Array.isArray(entries) || !identifier) {
    return null;
  }

  const normalizedTarget = identifier.toLowerCase();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidates = [
      entry.id,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ];

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const key = buildAssignmentDirectoryKey(candidates[candidateIndex]);
      if (key && key === normalizedTarget) {
        return entry;
      }
    }
  }

  return null;
}

function resolveAssignmentValueFromEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }

  const candidates = [
    entry.id,
    entry.telegram,
    entry.chatId,
    entry.email,
    entry.number,
    entry.login,
    entry.responsible,
    entry.name,
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const value = normalizeValue(candidates[index]);
    if (value) {
      return value;
    }
  }

  return '';
}

function buildAssignmentFallbackLabel(entry, role) {
  const defaultLabel = role === 'subordinate' ? 'Подчинённый' : 'Ответственный';
  if (!entry || typeof entry !== 'object') {
    return defaultLabel;
  }

  const title = normalizeValue(entry.responsible)
    || normalizeValue(entry.name)
    || normalizeValue(entry.department)
    || normalizeValue(entry.email)
    || normalizeValue(entry.telegram)
    || normalizeValue(entry.number)
    || defaultLabel;

  const meta = [];
  if (normalizeValue(entry.department)) {
    meta.push(entry.department);
  }
  if (normalizeValue(entry.email)) {
    meta.push(normalizeValue(entry.email));
  }
  if (normalizeValue(entry.telegram)) {
    meta.push(`TG ${normalizeValue(entry.telegram)}`);
  }
  if (normalizeValue(entry.login)) {
    meta.push(`Логин ${normalizeValue(entry.login)}`);
  }

  return meta.length ? `${title} • ${meta.join(' • ')}` : title;
}

function registerSubordinateComment(map, candidates, comment) {
  if (!(map instanceof Map) || !Array.isArray(candidates) || !candidates.length) {
    return;
  }

  const normalizedComment = normalizeAssignmentComment(comment);
  const seen = new Set();

  candidates.forEach((candidate) => {
    const key = buildSubordinateCommentKey(candidate);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    map.set(key, normalizedComment);
  });
}

function registerSubordinateDeadline(map, candidates, dueDate) {
  if (!(map instanceof Map) || !Array.isArray(candidates) || !candidates.length) {
    return;
  }

  const normalizedDueDate = normalizeAssignmentDueDate(dueDate);
  const seen = new Set();

  candidates.forEach((candidate) => {
    const key = buildSubordinateCommentKey(candidate);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    map.set(key, normalizedDueDate);
  });
}

function buildAssignmentRowKey(value, normalizedHint) {
  if (normalizedHint) {
    return normalizedHint;
  }

  const normalized = normalizeIdentifier(value);
  if (normalized) {
    return normalized;
  }

  const fallback = normalizeValue(value);
  return fallback ? `raw:${fallback.toLowerCase()}` : '';
}

function findAssignmentRow(container, key) {
  if (!container || !key) {
    return null;
  }

  let selectorKey = key;
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    selectorKey = CSS.escape(key);
  }

  return container.querySelector(`[data-assignee-key="${selectorKey}"]`);
}

function setAssignmentRowBusy(row, loading, assignButton, removeButton, commentInput, dueInput, instructionInput) {
  if (assignButton) {
    setActionButtonLoading(assignButton, loading);
  }

  if (removeButton) {
    if (loading) {
      removeButton.dataset.prevDisabled = removeButton.disabled ? 'true' : 'false';
      removeButton.disabled = true;
    } else {
      const restore = removeButton.dataset.prevDisabled === 'true';
      removeButton.disabled = restore;
      delete removeButton.dataset.prevDisabled;
    }
  }

  if (commentInput) {
    if (loading) {
      commentInput.dataset.prevDisabled = commentInput.disabled ? 'true' : 'false';
      commentInput.disabled = true;
    } else {
      const restore = commentInput.dataset.prevDisabled === 'true';
      commentInput.disabled = restore;
      delete commentInput.dataset.prevDisabled;
    }
  }

  if (dueInput) {
    if (loading) {
      dueInput.dataset.prevDisabled = dueInput.disabled ? 'true' : 'false';
      dueInput.disabled = true;
    } else {
      const restore = dueInput.dataset.prevDisabled === 'true';
      dueInput.disabled = restore;
      delete dueInput.dataset.prevDisabled;
    }
  }

  if (instructionInput) {
    if (loading) {
      instructionInput.dataset.prevDisabled = instructionInput.disabled ? 'true' : 'false';
      instructionInput.disabled = true;
    } else {
      const restore = instructionInput.dataset.prevDisabled === 'true';
      instructionInput.disabled = restore;
      delete instructionInput.dataset.prevDisabled;
    }
  }

  if (row) {
    row.dataset.loading = loading ? 'true' : 'false';
  }
}


const RESPONSE_IMAGE_COMPRESS_THRESHOLD_BYTES = 1800 * 1024;
const RESPONSE_IMAGE_MAX_EDGE = 1920;
const RESPONSE_IMAGE_QUALITY = 0.82;

function dataUrlToFile(dataUrl, fallbackName) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) {
    return null;
  }

  const header = parts[0];
  const payload = parts[1];
  const mimeMatch = /data:([^;]+);base64/i.exec(header);
  const mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1].toLowerCase() : 'image/jpeg';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const safeNameBase = normalizeValue(fallbackName).replace(/\.[a-z0-9]+$/i, '') || 'response-image';
  const ext = mimeType.includes('webp') ? 'webp' : 'jpg';
  return new File([bytes], `${safeNameBase}-mobile.${ext}`, { type: mimeType });
}

function compressImageFileForUpload(file) {
  if (!file || typeof window === 'undefined' || typeof FileReader !== 'function') {
    return Promise.resolve(file);
  }

  const mimeType = String(file.type || '').toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return Promise.resolve(file);
  }

  if (file.size <= RESPONSE_IMAGE_COMPRESS_THRESHOLD_BYTES) {
    return Promise.resolve(file);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const width = image.naturalWidth || image.width || 0;
        const height = image.naturalHeight || image.height || 0;
        if (!width || !height) {
          resolve(file);
          return;
        }

        const scale = Math.min(1, RESPONSE_IMAGE_MAX_EDGE / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressedData = canvas.toDataURL('image/jpeg', RESPONSE_IMAGE_QUALITY);
        const compressedFile = dataUrlToFile(compressedData, file.name || 'response-image');
        if (!compressedFile || compressedFile.size >= file.size) {
          resolve(file);
          return;
        }

        resolve(compressedFile);
      };
      image.onerror = () => resolve(file);
      image.src = String(reader.result || '');
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function prepareResponseFilesForUpload(files) {
  const result = [];
  for (const file of files) {
    // Для мобильных фото уменьшаем размер до безопасного для сервера уровня.
    // Если это не изображение или сжатие не помогло — оставляем оригинал.
    // eslint-disable-next-line no-await-in-loop
    const prepared = await compressImageFileForUpload(file);
    result.push(prepared || file);
  }
  return result;
}

function taskUserCanUploadResponse(task, entry) {
  if (!task || typeof task !== 'object' || !entry || typeof entry !== 'object') {
    return false;
  }

  const { ids, names } = getUserIdentifierCandidates();
  if (!ids.length && !names.length) {
    return false;
  }

  return entryMatchesUser(entry, ids, names);
}

async function uploadTaskResponseFiles(task, files, setStatus, responseMessageRaw = '') {
  if (!task || typeof task !== 'object') {
    sendResponseViewerLog('response_upload_failed', {
      reason: 'task_missing',
    });
    throw new Error('Не удалось определить задачу.');
  }

  const documentId = normalizeValue(task.id);
  const organization = getTaskOrganization(task);
  const originalFileList = Array.isArray(files) ? files.filter(Boolean) : [];
  const responseMessage = normalizeValue(responseMessageRaw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  if (!documentId || !organization) {
    sendResponseViewerLog('response_upload_failed', {
      reason: 'task_context_missing',
      documentId,
      organization,
    });
    throw new Error('Не удалось определить задачу или организацию.');
  }

  if (!originalFileList.length && !responseMessage) {
    sendResponseViewerLog('response_upload_failed', {
      reason: 'files_missing',
      documentId,
      organization,
    });
    throw new Error('Добавьте файл или введите текст ответа.');
  }

  const fileList = await prepareResponseFilesForUpload(originalFileList);
  const fallbackTelegramId = normalizeValue(
    window
      && window.Telegram
      && window.Telegram.WebApp
      && window.Telegram.WebApp.initDataUnsafe
      && window.Telegram.WebApp.initDataUnsafe.user
      && window.Telegram.WebApp.initDataUnsafe.user.id !== undefined
      ? window.Telegram.WebApp.initDataUnsafe.user.id
      : '',
  );
  const effectiveTelegramId = normalizeValue(state && state.telegram && state.telegram.id) || fallbackTelegramId;

  const formData = new FormData();
  formData.append('action', 'response_upload');
  formData.append('organization', organization);
  formData.append('documentId', documentId);
  if (responseMessage) {
    formData.append('responseMessage', responseMessage);
  }
  fileList.forEach((file) => {
    formData.append('attachments[]', file, file.name || 'answer-file');
  });
  if (effectiveTelegramId) {
    formData.append('telegram_user_id', effectiveTelegramId);
  }

  const headers = {};
  if (state.telegram.initData) {
    headers['X-Telegram-Init-Data'] = state.telegram.initData;
  }

  if (typeof setStatus === 'function') {
    const compressedCount = fileList.reduce((count, file, index) => (file !== originalFileList[index] ? count + 1 : count), 0);
    const messageParts = [];
    if (fileList.length > 0) {
      messageParts.push(`файлы: ${fileList.length}`);
    }
    if (responseMessage) {
      messageParts.push('текст: 1');
    }
    const baseMessage = messageParts.length ? `Загружаем ответ (${messageParts.join(', ')})...` : 'Загружаем ответ...';
    const message = compressedCount > 0
      ? `Подготовка фото: сжато ${compressedCount}. ${baseMessage}`
      : baseMessage;
    setStatus('info', message);
  }

  const response = await fetch(`/docs.php?action=response_upload&organization=${encodeURIComponent(organization)}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok || !data || data.success !== true) {
    sendResponseViewerLog('response_upload_failed', {
      reason: 'server_rejected',
      documentId,
      organization,
      telegramId: effectiveTelegramId,
      status: response.status,
      statusText: response.statusText || '',
      responseError: data && (data.error || data.message) ? (data.error || data.message) : '',
      uploadErrors: data && Array.isArray(data.uploadErrors) ? data.uploadErrors : [],
      files: fileList.map((file) => ({
        name: normalizeValue(file && file.name),
        size: Number(file && file.size) || 0,
        type: normalizeValue(file && file.type),
      })),
      hasResponseMessage: Boolean(responseMessage),
      responseMessageLength: responseMessage.length,
    });
    throw new Error((data && (data.error || data.message)) || `Ошибка ${response.status}`);
  }

  await loadTasks(true);
  if (typeof setStatus === 'function') {
    setStatus('success', data.message || 'Ответ загружен.');
  }

  sendResponseViewerLog('response_upload_success', {
    documentId,
    organization,
    telegramId: effectiveTelegramId,
    files: fileList.map((file) => ({
      name: normalizeValue(file && file.name),
      size: Number(file && file.size) || 0,
      type: normalizeValue(file && file.type),
    })),
    hasResponseMessage: Boolean(responseMessage),
    responseMessageLength: responseMessage.length,
  });

  return data;
}

async function updateTaskResponseText(task, storedName, textValue, setStatus) {
  if (!task || typeof task !== 'object') {
    throw new Error('Не удалось определить задачу.');
  }
  const documentId = normalizeValue(task.id);
  const organization = getTaskOrganization(task);
  const text = normalizeValue(textValue).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!documentId || !organization) {
    throw new Error('Не удалось определить задачу или организацию.');
  }
  if (!storedName) {
    throw new Error('Не удалось определить TXT-файл для редактирования.');
  }
  if (!text) {
    throw new Error('Введите текст ответа.');
  }

  if (typeof setStatus === 'function') {
    setStatus('info', 'Обновляем текстовый ответ...');
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (state.telegram.initData) {
    headers['X-Telegram-Init-Data'] = state.telegram.initData;
  }

  const response = await fetch(`/docs.php?action=response_text_update&organization=${encodeURIComponent(organization)}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      action: 'response_text_update',
      organization,
      documentId,
      storedName,
      text,
    }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (!response.ok || !data || data.success !== true) {
    throw new Error((data && (data.error || data.message)) || `Ошибка ${response.status}`);
  }
  await loadTasks(true);
  if (typeof setStatus === 'function') {
    setStatus('success', data.message || 'Текстовый ответ обновлён.');
  }
  return data;
}

function createResponseUploadControls(task, entry, setStatus) {
  if (!taskUserCanUploadResponse(task, entry)) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'appdosc-card__assign-response';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appdosc-card__action appdosc-card__action--response';
  button.textContent = 'Загрузить Ответ';

  const aiButton = document.createElement('button');
  aiButton.type = 'button';
  aiButton.className = 'appdosc-card__action appdosc-card__action--response appdosc-card__action--response-ai';
  aiButton.textContent = 'Ответ с помощью ИИ';

  const meta = document.createElement('div');
  meta.className = 'appdosc-card__assign-response-meta';
  meta.textContent = 'Файл или текст ответа';

  const textInput = document.createElement('textarea');
  textInput.className = 'appdosc-card__assign-response-text';
  textInput.placeholder = 'Текстовый ответ к задаче (сохранится как .txt)';
  textInput.maxLength = 12000;
  textInput.rows = 3;
  let editingTextResponse = null;

  const responseFiles = Array.isArray(task && task.responses) ? task.responses : [];
  const editableTxtCandidates = responseFiles.filter((file) => isTextResponseFile(file) && isResponseOwnedByCurrentUser(file));
  editableTxtCandidates.sort((a, b) => {
    const aTime = Date.parse(normalizeValue(a && a.uploadedAt) || '') || 0;
    const bTime = Date.parse(normalizeValue(b && b.uploadedAt) || '') || 0;
    return bTime - aTime;
  });
  const latestEditableTxt = editableTxtCandidates.length ? editableTxtCandidates[0] : null;
  if (latestEditableTxt && normalizeValue(latestEditableTxt.textContent)) {
    editingTextResponse = latestEditableTxt;
    textInput.value = normalizeValue(latestEditableTxt.textContent);
    meta.textContent = `Редактирование: ${normalizeValue(latestEditableTxt.originalName) || 'TXT-файл'}`;
  }

  const textActions = document.createElement('div');
  textActions.className = 'appdosc-card__assign-response-text-actions';
  const textCounter = document.createElement('span');
  textCounter.className = 'appdosc-card__assign-response-text-counter';
  textCounter.textContent = '0 / 12000';
  const textSaveButton = document.createElement('button');
  textSaveButton.type = 'button';
  textSaveButton.className = 'appdosc-card__action appdosc-card__action--response';
  textSaveButton.textContent = 'Сохранить текст';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar';
  input.multiple = true;
  const isTelegramMobile = resolveWebPlatformFlag((state && state.telegram && state.telegram.platform) || runtimeEnvironment.webAppPlatform || '');
  if (isTelegramMobile) {
    input.multiple = false;
  }

  input.style.position = 'absolute';
  input.style.left = '-9999px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';

  button.addEventListener('click', () => {
    if (button.disabled) {
      return;
    }
    input.click();
  });

  aiButton.addEventListener('click', () => {
    openAiDialogSafely({
      task,
      entry,
      onStatus: setStatus,
    });
  });

  textInput.addEventListener('input', () => {
    const length = String(textInput.value || '').length;
    textCounter.textContent = `${length} / 12000`;
  });
  textInput.dispatchEvent(new Event('input'));

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      return;
    }

    button.disabled = true;
    aiButton.disabled = true;
    textSaveButton.disabled = true;
    textInput.disabled = true;
    wrapper.dataset.loading = 'true';
    meta.textContent = `Файлов выбрано: ${files.length}`;

    try {
      await uploadTaskResponseFiles(task, files, setStatus, textInput.value || '');
      meta.textContent = files.length > 1 ? 'Ответы загружены' : 'Ответ загружен';
      textInput.value = '';
      textCounter.textContent = '0 / 12000';
    } catch (error) {
      sendResponseViewerLog('response_upload_failed', {
        reason: 'client_exception',
        documentId: normalizeValue(task && task.id),
        organization: getTaskOrganization(task),
        message: normalizeValue(error && error.message),
        files: files.map((file) => ({
          name: normalizeValue(file && file.name),
          size: Number(file && file.size) || 0,
          type: normalizeValue(file && file.type),
        })),
      });
      meta.textContent = 'Загрузка не удалась';
      if (typeof setStatus === 'function') {
        setStatus('error', error?.message || 'Не удалось загрузить ответ.');
      }
    } finally {
      button.disabled = false;
      aiButton.disabled = false;
      textSaveButton.disabled = false;
      textInput.disabled = false;
      delete wrapper.dataset.loading;
      input.value = '';
    }
  });

  textSaveButton.addEventListener('click', async () => {
    const messageValue = String(textInput.value || '').trim();
    if (!messageValue) {
      if (typeof setStatus === 'function') {
        setStatus('warning', 'Введите текст ответа перед сохранением.');
      }
      return;
    }

    button.disabled = true;
    aiButton.disabled = true;
    textSaveButton.disabled = true;
    textInput.disabled = true;
    wrapper.dataset.loading = 'true';
    meta.textContent = 'Сохраняем текстовый ответ...';

    try {
      if (editingTextResponse && normalizeValue(editingTextResponse.storedName)) {
        await updateTaskResponseText(task, normalizeValue(editingTextResponse.storedName), messageValue, setStatus);
        meta.textContent = 'Текстовый ответ обновлён';
      } else {
        await uploadTaskResponseFiles(task, [], setStatus, messageValue);
        meta.textContent = 'Текстовый ответ сохранён';
      }
      textInput.value = '';
      editingTextResponse = null;
      textCounter.textContent = '0 / 12000';
    } catch (error) {
      meta.textContent = 'Сохранение не удалось';
      if (typeof setStatus === 'function') {
        setStatus('error', error?.message || 'Не удалось сохранить текстовый ответ.');
      }
    } finally {
      button.disabled = false;
      aiButton.disabled = false;
      textSaveButton.disabled = false;
      textInput.disabled = false;
      delete wrapper.dataset.loading;
    }
  });

  textActions.append(textSaveButton, textCounter);
  wrapper.append(button, aiButton, meta, textInput, textActions, input);
  return wrapper;
}

function setupAssignmentControls(card, task) {
  if (!card || !task) {
    return;
  }

  const container = card.querySelector('[data-card-assign]');
  if (!container) {
    return;
  }

  const organization = getTaskOrganization(task);
  if (!organization) {
    container.remove();
    return;
  }

  const canManageResponsibles = userIsDirectorForOrganization(organization)
    || userIsResponsibleForTask(task);
  if (!canManageResponsibles) {
    container.remove();
    return;
  }

  const responsibles = getResponsiblesForOrganization(organization);
  const subordinates = getSubordinatesForOrganization(organization);
  const assignmentCandidates = buildAssignmentCandidateList(responsibles, subordinates);
  if (!assignmentCandidates.length) {
    container.remove();
    return;
  }

  const searchInput = container.querySelector('[data-card-assignee-search]');
  const searchMeta = container.querySelector('[data-card-assignee-search-meta]');
  const select = container.querySelector('[data-card-assignee-select]');
  const entriesContainer = container.querySelector('[data-card-assignee-entries]');
  const bulkButton = container.querySelector('[data-card-assign-submit]');
  const bulkCount = container.querySelector('[data-card-assign-count]');
  if (!searchInput || !searchMeta || !select || !entriesContainer || !bulkButton || !bulkCount) {
    container.remove();
    return;
  }

  const directory = buildAssignmentDirectory(assignmentCandidates, 'responsible');
  const directorIdentifiers = new Set(getTaskDirectorIdentifiers(task));
  const currentIdentifiers = getTaskResponsibleIdentifiers(task).filter((id) => !directorIdentifiers.has(id));
  const assignedEntries = collectTaskAssignments(task, 'responsible');
  const commentMap = getTaskResponsibleComments(task);
  const dueDateMap = getTaskResponsibleDueDates(task);
  const instructionMap = getTaskResponsibleInstructions(task);
  const existingKeys = new Set();
  const assignedKeyRegistry = new Set();
  const renderedAssignedKeys = new Set();
  const selection = new Set();
  const rowControls = new WeakMap();

  const updateBulkState = () => {
    bulkCount.textContent = String(selection.size);
    bulkButton.disabled = selection.size === 0;
    if (bulkButton.dataset.feedback === 'true') {
      return;
    }
    bulkButton.textContent = selection.size > 1 ? `Назначить ${selection.size}` : 'Назначить выбранных';
  };

  const registerAssignedKey = (value) => {
    const key = buildAssignmentDirectoryKey(value);
    if (key) {
      assignedKeyRegistry.add(key);
    }
  };

  const registerAssignedEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    [
      entry.id,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ].forEach(registerAssignedKey);
  };

  const registerRenderedEntryKeys = (entry, fallbackValue, identifier) => {
    const registerKey = (candidate) => {
      const key = buildAssignmentDirectoryKey(candidate);
      if (key) {
        renderedAssignedKeys.add(key);
      }
    };

    if (identifier) {
      registerKey(identifier);
    }

    if (fallbackValue) {
      registerKey(fallbackValue);
    }

    if (!entry || typeof entry !== 'object') {
      return;
    }

    [
      entry.id,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ].forEach(registerKey);
  };

  assignedEntries.forEach(registerAssignedEntry);
  currentIdentifiers.forEach(registerAssignedKey);

  const updateSearchMeta = (query, visibleCount, totalCount) => {
    if (visibleCount <= 0) {
      searchMeta.textContent = query
        ? 'Совпадений не найдено. Попробуйте изменить запрос.'
        : 'Нет доступных пользователей для выбора.';
      return;
    }

    if (!query) {
      searchMeta.textContent = `Показаны все: ${visibleCount}`;
      return;
    }

    searchMeta.textContent = `Найдено: ${visibleCount} из ${totalCount}`;
  };

  const populateSelectOptions = () => {
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Выберите ответственного';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    const query = normalizeValue(searchInput.value).toLowerCase();
    const addedValues = new Set();
    let totalCount = 0;
    let visibleCount = 0;
    assignmentCandidates.forEach((entry) => {
      const value = resolveResponsibleOptionValue(entry);
      const label = buildResponsibleOptionLabel(entry);
      if (!value || addedValues.has(value)) {
        return;
      }
      addedValues.add(value);
      totalCount += 1;

      const valueText = normalizeValue(value).toLowerCase();
      const labelText = normalizeValue(label).toLowerCase();
      const matches = !query || labelText.includes(query) || valueText.includes(query);
      if (!matches) {
        return;
      }

      visibleCount += 1;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });

    select.disabled = visibleCount === 0;
    updateSearchMeta(query, visibleCount, totalCount);
  };

  const resolveCommentForEntry = (value, normalized, entry) => {
    const candidates = collectResponsibleAssignmentKeyCandidates(entry, value);
    if (normalized && !candidates.includes(normalized)) {
      candidates.unshift(normalized);
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const key = candidates[index];
      if (commentMap.has(key)) {
        return commentMap.get(key) || '';
      }
    }

    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'assignmentComment')) {
      return normalizeAssignmentComment(entry.assignmentComment);
    }

    if (normalized && commentMap.has(normalized)) {
      return commentMap.get(normalized) || '';
    }

    return '';
  };

  const resolveDueForEntry = (value, normalized, entry) => {
    const candidates = collectResponsibleAssignmentKeyCandidates(entry, value);
    if (normalized && !candidates.includes(normalized)) {
      candidates.unshift(normalized);
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const key = candidates[index];
      if (dueDateMap.has(key)) {
        return dueDateMap.get(key) || '';
      }
    }

    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'assignmentDueDate')) {
      return normalizeAssignmentDueDate(entry.assignmentDueDate);
    }

    if (normalized && dueDateMap.has(normalized)) {
      return dueDateMap.get(normalized) || '';
    }

    return '';
  };

  const resolveInstructionForEntry = (value, normalized, entry) => {
    const candidates = collectResponsibleAssignmentKeyCandidates(entry, value);
    if (normalized && !candidates.includes(normalized)) {
      candidates.unshift(normalized);
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const key = candidates[index];
      if (instructionMap.has(key)) {
        return instructionMap.get(key) || '';
      }
    }

    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'assignmentInstruction')) {
      return normalizeAssignmentInstruction(entry.assignmentInstruction);
    }

    if (normalized && instructionMap.has(normalized)) {
      return instructionMap.get(normalized) || '';
    }

    return '';
  };

  const populateInstructionSelect = (selectElement, selectedValue) => {
    if (!selectElement) {
      return;
    }

    selectElement.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Не выбрано';
    selectElement.appendChild(placeholder);

    INSTRUCTION_OPTIONS.forEach((option) => {
      const node = document.createElement('option');
      node.value = option;
      node.textContent = option;
      selectElement.appendChild(node);
    });

    const normalized = normalizeAssignmentInstruction(selectedValue);
    selectElement.value = normalized || '';
  };

  const createResponsibleRow = ({ value, label, normalized, assigned, comment, dueDate, instruction, referenceEntry = null }) => {
    const key = buildAssignmentRowKey(value, normalized);
    if (!key || findAssignmentRow(entriesContainer, key)) {
      return null;
    }

    const row = document.createElement('div');
    row.className = 'appdosc-card__assign-row';
    row.dataset.assigneeEntry = 'true';
    row.dataset.assigneeKey = key;
    row.dataset.assigneeValue = value;
    row.dataset.assigned = assigned ? 'true' : 'false';
    if (normalized) {
      row.dataset.assigneeNormalized = normalized;
    }

    const info = document.createElement('div');
    info.className = 'appdosc-card__assign-info';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'appdosc-card__assign-role';
    roleLabel.textContent = 'Ответственный';
    info.appendChild(roleLabel);

    const name = document.createElement('div');
    name.className = 'appdosc-card__assign-name';
    name.textContent = label || buildAssignmentFallbackLabel(null, 'responsible');
    info.appendChild(name);

    const note = document.createElement('div');
    note.className = 'appdosc-card__assign-note';
    note.textContent = assigned ? 'Назначен' : 'Новый кандидат';
    info.appendChild(note);

    const commentInput = document.createElement('textarea');
    commentInput.className = 'appdosc-card__assign-comment-input';
    commentInput.placeholder = 'Комментарий для ответственного';
    commentInput.rows = 2;
    commentInput.maxLength = 500;
    if (comment) {
      commentInput.value = comment;
    }
    info.appendChild(commentInput);

    const instructionBlock = document.createElement('div');
    instructionBlock.className = 'appdosc-card__assign-instruction';

    const instructionLabel = document.createElement('div');
    instructionLabel.className = 'appdosc-card__assign-instruction-label';
    instructionLabel.textContent = 'Поручение';
    instructionBlock.appendChild(instructionLabel);

    const instructionSelect = document.createElement('select');
    instructionSelect.className = 'appdosc-card__assign-instruction-select';
    populateInstructionSelect(instructionSelect, instruction || '');
    instructionBlock.appendChild(instructionSelect);

    info.appendChild(instructionBlock);

    const deadline = document.createElement('div');
    deadline.className = 'appdosc-card__assign-deadline';

    const deadlineLabel = document.createElement('div');
    deadlineLabel.className = 'appdosc-card__assign-deadline-label';
    deadlineLabel.textContent = 'Срок исполнения';
    deadline.appendChild(deadlineLabel);

    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'date';
    deadlineInput.className = 'appdosc-card__assign-deadline-input';
    if (dueDate) {
      deadlineInput.value = dueDate;
    }
    deadline.appendChild(deadlineInput);

    info.appendChild(deadline);

    const responseViewButton = document.createElement('button');
    responseViewButton.type = 'button';
    responseViewButton.className = 'appdosc-card__action appdosc-card__action--view-response';
    responseViewButton.textContent = buildResponseViewButtonLabel(0);

    const entryData = referenceEntry || { value, label, normalized };
    renderResponseFilesCounter(
      null,
      countResponseFilesForEntry(task, entryData, value),
      false,
      responseViewButton
    );
    refreshResponseCounterForEntry(null, task, entryData, value, responseViewButton).catch(() => {});

    responseViewButton.addEventListener('click', async () => {
      await refreshResponseCounterForEntry(null, task, entryData, value, responseViewButton);
      openResponseViewerForEntry(responseViewButton, task, entryData, value);
    });
    info.appendChild(responseViewButton);

    const responseControls = createResponseUploadControls(task, referenceEntry || { value, label, normalized, role: 'responsible' }, setStatus);
    if (responseControls) {
      info.appendChild(responseControls);
    }

    row.appendChild(info);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'appdosc-card__action appdosc-card__action--ghost';
    removeButton.dataset.assignmentAction = 'remove';
    removeButton.textContent = 'Убрать';
    removeButton.disabled = false;
    const actions = document.createElement('div');
    actions.className = 'appdosc-card__assign-actions';
    actions.appendChild(removeButton);
    row.appendChild(actions);

    entriesContainer.appendChild(row);

    rowControls.set(row, {
      assignButton: null,
      removeButton,
      commentInput,
      deadlineInput,
    });
    existingKeys.add(key);
    assignedKeyRegistry.add(key);
    if (normalized) {
      existingKeys.add(normalized);
      assignedKeyRegistry.add(normalized);
    }
    const directoryKey = buildAssignmentDirectoryKey(value);
    if (directoryKey) {
      existingKeys.add(directoryKey);
      assignedKeyRegistry.add(directoryKey);
    }

    rowControls.set(row, {
      assignButton: null,
      removeButton,
      commentInput,
      deadlineInput,
      instructionSelect,
    });

    if (!assigned) {
      selection.add(row);
    }
    updateBulkState();

    const handleRemove = async () => {
      if (!task.id) {
        setStatus('error', 'Не удалось определить задачу.');
        return;
      }

      const targetValue = normalizeValue(row.dataset.assigneeValue);
      if (!targetValue) {
        setStatus('error', 'Не удалось определить ответственного.');
        return;
      }

      if (!assigned) {
        selection.delete(row);
        row.remove();
        updateBulkState();
        setStatus('info', 'Кандидат убран из списка.');
        return;
      }

      if (removeButton.dataset.loading === 'true') {
        return;
      }

      const normalizedValue = normalizeIdentifier(targetValue);
      const rawValues = [targetValue];
      const normalizedValues = normalizedValue ? [normalizedValue] : [];

      logAssignmentEvent('remove_click', {
        taskId: task.id || null,
        organization,
        assigneeId: normalizedValue || null,
        assigneeIds: normalizedValues,
        assigneeValues: rawValues,
      });

      setAssignmentRowBusy(row, true, null, removeButton, commentInput, deadlineInput, instructionSelect);
      setStatus('info', 'Удаляем ответственного...');
      const startedAt = Date.now();

      logClientEvent('task_assign_remove_request', {
        taskId: task.id || null,
        organization,
        assigneeId: normalizedValue || null,
        assigneeIds: normalizedValues,
        assigneeValues: rawValues,
      });

      try {
        await sendTaskMutation({
          updateType: 'assign_remove',
          organization,
          documentId: task.id,
          removeAssigneeId: targetValue,
        });

        logClientEvent('task_assign_remove_success', {
          taskId: task.id || null,
          organization,
          assigneeId: normalizedValue || null,
          assigneeIds: normalizedValues,
          assigneeValues: rawValues,
          durationMs: Date.now() - startedAt,
        });

        setStatus('success', 'Ответственный удалён.');
        selection.delete(row);
        updateBulkState();
        await loadTasks(true);
      } catch (error) {
        const errorDetails = buildErrorDetails(error);
        const message = errorDetails.message || 'Ошибка назначения.';
        logClientEvent('task_assign_remove_error', {
          taskId: task.id || null,
          organization,
          assigneeId: normalizedValue || null,
          assigneeIds: normalizedValues,
          assigneeValues: rawValues,
          message,
          errorStatus: errorDetails.status,
          errorResponse: errorDetails.responseText,
        });
        setStatus('error', message);
      } finally {
        setAssignmentRowBusy(row, false, null, removeButton, commentInput, deadlineInput, instructionSelect);
      }
    };

    removeButton.addEventListener('click', handleRemove);

    return row;
  };

  const handleBulkAssign = async () => {
    if (!task.id) {
      setStatus('error', 'Не удалось определить задачу.');
      return;
    }

    const payloadAssignments = [];
    const rawValues = [];
    const normalizedValues = [];
    const busyRows = [];

    selection.forEach((row) => {
      if (row.dataset.assigned === 'true') {
        return;
      }
      const targetValue = normalizeValue(row.dataset.assigneeValue);
      if (!targetValue) {
        return;
      }

      const controls = rowControls.get(row) || {};
      const commentValue = normalizeAssignmentComment(controls.commentInput ? controls.commentInput.value : undefined);
      const dueValue = normalizeAssignmentDueDate(controls.deadlineInput ? controls.deadlineInput.value : undefined);
      const instructionValue = normalizeAssignmentInstruction(
        controls.instructionSelect ? controls.instructionSelect.value : undefined,
      );

      payloadAssignments.push({
        id: targetValue,
        assignmentComment: commentValue,
        assignmentDueDate: dueValue,
        assignmentInstruction: instructionValue,
      });
      rawValues.push(targetValue);
      const normalizedValue = normalizeIdentifier(targetValue);
      if (normalizedValue) {
        normalizedValues.push(normalizedValue);
      }

      setAssignmentRowBusy(
        row,
        true,
        controls.assignButton,
        controls.removeButton,
        controls.commentInput,
        controls.deadlineInput,
        controls.instructionSelect,
      );
      busyRows.push(row);
    });

    if (!payloadAssignments.length) {
      setStatus('error', 'Выберите ответственных для назначения.');
      logAssignmentEvent('bulk_empty_selection', {
        taskId: task.id || null,
        organization,
        selectionSize: selection.size,
      });
      busyRows.forEach((row) => {
        const controls = rowControls.get(row) || {};
        setAssignmentRowBusy(
          row,
          false,
          controls.assignButton,
          controls.removeButton,
          controls.commentInput,
          controls.deadlineInput,
          controls.instructionSelect,
        );
      });
      return;
    }

    setStatus('info', 'Назначаем выбранных...');
    const startedAt = Date.now();

    logAssignmentEvent('bulk_payload_ready', {
      taskId: task.id || null,
      organization,
      assigneeCount: payloadAssignments.length,
      assignees: payloadAssignments,
    });

    logClientEvent('task_assign_request', {
      taskId: task.id || null,
      organization,
      assigneeIds: normalizedValues,
      assigneeValues: rawValues,
      assigneeCount: payloadAssignments.length,
      bulk: true,
    });

    try {
      await sendTaskMutation({
        updateType: 'assign_add',
        organization,
        documentId: task.id,
        assignees: payloadAssignments,
      });

      logClientEvent('task_assign_success', {
        taskId: task.id || null,
        organization,
        assigneeIds: normalizedValues,
        assigneeValues: rawValues,
        assigneeCount: payloadAssignments.length,
        bulk: true,
        durationMs: Date.now() - startedAt,
      });

      setStatus('success', payloadAssignments.length > 1 ? 'Ответственные назначены.' : 'Ответственный назначен.');
      selection.clear();
      updateBulkState();
      setBulkAssignFeedback(bulkButton, 'Назначение успешно', updateBulkState, 'success');
      await loadTasks(true);
    } catch (error) {
      const errorDetails = buildErrorDetails(error);
      const message = errorDetails.message || 'Ошибка назначения.';
      logClientEvent('task_assign_error', {
        taskId: task.id || null,
        organization,
        assigneeIds: normalizedValues,
        assigneeValues: rawValues,
        assigneeCount: payloadAssignments.length,
        bulk: true,
        message,
        errorStatus: errorDetails.status,
        errorResponse: errorDetails.responseText,
      });
      setStatus('error', message);
      setBulkAssignFeedback(bulkButton, 'Назначение неуспешно', updateBulkState, 'error');
    } finally {
      busyRows.forEach((row) => {
        const controls = rowControls.get(row) || {};
        setAssignmentRowBusy(
          row,
          false,
          controls.assignButton,
          controls.removeButton,
          controls.commentInput,
          controls.deadlineInput,
          controls.instructionSelect,
        );
      });
    }
  };

  bulkButton.addEventListener('click', handleBulkAssign);
  updateBulkState();

  populateSelectOptions();

  currentIdentifiers.forEach((identifier) => {
    if (renderedAssignedKeys.has(identifier)) {
      return;
    }

    const directoryEntry = directory.get(identifier);
    let value = directoryEntry ? directoryEntry.value : '';
    let label = directoryEntry ? directoryEntry.label : '';
    let matchedEntry = null;

    if (!value || !label || !directoryEntry || !directoryEntry.entry) {
      matchedEntry = findAssignmentEntryByIdentifier(assignedEntries, identifier);
      if (matchedEntry) {
        value = value || resolveAssignmentValueFromEntry(matchedEntry);
        label = label || buildAssignmentFallbackLabel(matchedEntry, 'responsible');
      }
    }

    if (!value) {
      return;
    }

    const referenceEntry = matchedEntry || (directoryEntry && directoryEntry.entry) || null;
    const comment = resolveCommentForEntry(value, identifier, referenceEntry);
    const due = resolveDueForEntry(value, identifier, referenceEntry);
    const instruction = resolveInstructionForEntry(value, identifier, referenceEntry);

    const row = createResponsibleRow({
      value,
      label,
      normalized: identifier,
      assigned: true,
      comment,
      dueDate: due,
      instruction,
      referenceEntry,
    });
    if (row) {
      registerRenderedEntryKeys(referenceEntry, value, identifier);
    }
  });

  searchInput.addEventListener('input', () => {
    populateSelectOptions();
  });

  select.addEventListener('change', () => {
    const selectedValue = normalizeValue(select.value);
    if (!selectedValue) {
      return;
    }

    const normalizedValue = normalizeIdentifier(selectedValue);
    logAssignmentEvent('select_change', {
      taskId: task.id || null,
      organization,
      selectedValue,
      normalizedValue,
    });
    const rowKey = buildAssignmentRowKey(selectedValue, normalizedValue);
    const directoryKey = buildAssignmentDirectoryKey(selectedValue);
    const knownKeys = [rowKey, normalizedValue, directoryKey].filter(Boolean);

    const existingRow = knownKeys.reduce((result, candidate) => {
      if (result) {
        return result;
      }
      if (!candidate) {
        return null;
      }
      return findAssignmentRow(entriesContainer, candidate);
    }, null);

    const alreadyAssigned = knownKeys.some((candidate) => existingKeys.has(candidate) || assignedKeyRegistry.has(candidate));

    if (existingRow || alreadyAssigned) {
      logAssignmentEvent('select_duplicate', {
        taskId: task.id || null,
        organization,
        selectedValue,
        normalizedValue,
        existingRow: Boolean(existingRow),
        alreadyAssigned,
      });
      if (existingRow) {
        existingRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setStatus('info', 'Ответственный уже назначен.');
      select.selectedIndex = 0;
      return;
    }

    let label = '';
    let referenceEntry = null;
    if (normalizedValue && directory.has(normalizedValue)) {
      const directorySnapshot = directory.get(normalizedValue);
      label = directorySnapshot.label;
      referenceEntry = directorySnapshot.entry || null;
    } else {
      referenceEntry = findAssignmentEntryByIdentifier(assignmentCandidates, normalizedValue || selectedValue.toLowerCase());
      if (referenceEntry && typeof referenceEntry === 'object') {
        label = buildResponsibleOptionLabel(referenceEntry);
      }
    }
    if (!label) {
      label = selectedValue;
    }

    if (!resolveEntryTelegramId(referenceEntry)) {
      logAssignmentEvent('select_missing_telegram', {
        taskId: task.id || null,
        organization,
        selectedValue,
        normalizedValue,
        referenceKeys: referenceEntry && typeof referenceEntry === 'object'
          ? Object.keys(referenceEntry).slice(0, 10)
          : [],
      });
      setStatus('error', TELEGRAM_MISSING_MESSAGE);
      select.selectedIndex = 0;
      return;
    }

    const comment = resolveCommentForEntry(selectedValue, normalizedValue, referenceEntry);
    const due = resolveDueForEntry(selectedValue, normalizedValue, referenceEntry);
    const instruction = resolveInstructionForEntry(selectedValue, normalizedValue, referenceEntry);

    createResponsibleRow({
      value: selectedValue,
      label,
      normalized: normalizedValue,
      assigned: false,
      comment,
      dueDate: due,
      instruction,
      referenceEntry,
    });
    logAssignmentEvent('select_row_created', {
      taskId: task.id || null,
      organization,
      selectedValue,
      normalizedValue,
      label,
      hasComment: Boolean(comment),
      dueDate: due || null,
      instruction: instruction || null,
    });
    select.selectedIndex = 0;
  });

  container.hidden = false;
}

function setupSubordinateControls(card, task) {
  if (!card || !task) {
    return;
  }

  const container = card.querySelector('[data-card-subordinates]');
  if (!container) {
    return;
  }

  const organization = getTaskOrganization(task);
  if (!organization) {
    container.remove();
    return;
  }

  const subordinates = getSubordinatesForOrganization(organization);
  const responsibles = getResponsiblesForOrganization(organization);
  const assignmentCandidates = buildAssignmentCandidateList(responsibles, subordinates);
  const canManageSubordinates = userIsDirectorForOrganization(organization)
    || userIsResponsibleForTask(task)
    || assignmentCandidates.length > 0;
  if (!canManageSubordinates) {
    container.remove();
    return;
  }

  const assignedEntries = collectTaskAssignments(task, 'subordinate');

  if (!assignmentCandidates.length && assignedEntries.length === 0) {
    container.remove();
    return;
  }

  const searchInput = container.querySelector('[data-card-subordinate-search]');
  const searchMeta = container.querySelector('[data-card-subordinate-search-meta]');
  const select = container.querySelector('[data-card-subordinate-select]');
  const entriesContainer = container.querySelector('[data-card-subordinate-entries]');
  const bulkButton = container.querySelector('[data-card-subordinate-submit]');
  const bulkCount = container.querySelector('[data-card-subordinate-count]');
  if (!searchInput || !searchMeta || !select || !entriesContainer || !bulkButton || !bulkCount) {
    container.remove();
    return;
  }

  if (!assignmentCandidates.length) {
    select.disabled = true;
    select.title = 'Нет доступных подчинённых для назначения';
    searchInput.disabled = true;
    searchMeta.textContent = 'Подчинённые для назначения отсутствуют.';
  }

  const directory = buildAssignmentDirectory(assignmentCandidates, 'subordinate');
  const currentIdentifiers = new Set(getTaskSubordinateIdentifiers(task));
  const commentMap = getTaskSubordinateComments(task);
  const dueDateMap = getTaskSubordinateDueDates(task);
  const renderedEntryKeys = new Set();
  const selection = new Set();
  const rowControls = new WeakMap();

  const updateBulkState = () => {
    bulkCount.textContent = String(selection.size);
    bulkButton.disabled = selection.size === 0;
    if (bulkButton.dataset.feedback === 'true') {
      return;
    }
    bulkButton.textContent = selection.size > 1 ? `Назначить ${selection.size}` : 'Назначить выбранных';
  };

  const hasRenderedEntry = (entry, value, identifier) => {
    const check = (candidate) => {
      const key = buildAssignmentDirectoryKey(candidate);
      return Boolean(key && renderedEntryKeys.has(key));
    };

    if (identifier && check(identifier)) {
      return true;
    }

    if (value && check(value)) {
      return true;
    }

    if (!entry || typeof entry !== 'object') {
      return false;
    }

    return [
      entry.id,
      entry.subordinateId,
      entry.subordinate,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ].some(check);
  };

  const registerRenderedEntry = (entry, value, identifier) => {
    const register = (candidate) => {
      const key = buildAssignmentDirectoryKey(candidate);
      if (key) {
        renderedEntryKeys.add(key);
      }
    };

    register(identifier);
    register(value);

    if (!entry || typeof entry !== 'object') {
      return;
    }

    [
      entry.id,
      entry.subordinateId,
      entry.subordinate,
      entry.telegram,
      entry.chatId,
      entry.email,
      entry.number,
      entry.login,
      entry.responsible,
      entry.name,
    ].forEach(register);
  };

  const updateSearchMeta = (query, visibleCount, totalCount) => {
    if (visibleCount <= 0) {
      searchMeta.textContent = query
        ? 'Совпадений не найдено. Уточните ФИО.'
        : 'Нет доступных пользователей для выбора.';
      return;
    }

    if (!query) {
      searchMeta.textContent = `Показаны все: ${visibleCount}`;
      return;
    }

    searchMeta.textContent = `Найдено: ${visibleCount} из ${totalCount}`;
  };

  const populateSelectOptions = () => {
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Выберите подчинённого';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    const query = normalizeValue(searchInput.value).toLowerCase();
    const addedValues = new Set();
    let totalCount = 0;
    let visibleCount = 0;
    assignmentCandidates.forEach((entry) => {
      const value = resolveResponsibleOptionValue(entry);
      const label = buildSubordinateOptionLabel(entry);
      if (!value || addedValues.has(value)) {
        return;
      }
      addedValues.add(value);
      totalCount += 1;

      const valueText = normalizeValue(value).toLowerCase();
      const labelText = normalizeValue(label).toLowerCase();
      const matches = !query || labelText.includes(query) || valueText.includes(query);
      if (!matches) {
        return;
      }

      visibleCount += 1;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });

    select.disabled = visibleCount === 0;
    updateSearchMeta(query, visibleCount, totalCount);
  };

  const resolveCommentForEntry = (value, normalized, entry) => {
    const commentKeys = collectSubordinateCommentKeyCandidates(entry, value);
    for (let index = 0; index < commentKeys.length; index += 1) {
      const key = commentKeys[index];
      if (commentMap.has(key)) {
        return commentMap.get(key) || '';
      }
    }
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'assignmentComment')) {
      return normalizeAssignmentComment(entry.assignmentComment);
    }
    if (normalized && commentMap.has(normalized)) {
      return commentMap.get(normalized) || '';
    }
    return '';
  };

  const resolveDueForEntry = (value, normalized, entry) => {
    const dueKeys = collectSubordinateCommentKeyCandidates(entry, value);
    for (let index = 0; index < dueKeys.length; index += 1) {
      const key = dueKeys[index];
      if (dueDateMap.has(key)) {
        return dueDateMap.get(key) || '';
      }
    }
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'assignmentDueDate')) {
      return normalizeAssignmentDueDate(entry.assignmentDueDate);
    }
    if (normalized && dueDateMap.has(normalized)) {
      return dueDateMap.get(normalized) || '';
    }
    return '';
  };

  const createSubordinateRow = ({ value, label, normalized, assigned, comment, dueDate, referenceEntry = null }) => {
    const key = buildAssignmentRowKey(value, normalized);
    if (!key || findAssignmentRow(entriesContainer, key)) {
      return null;
    }

    const row = document.createElement('div');
    row.className = 'appdosc-card__assign-row';
    row.dataset.assigneeEntry = 'true';
    row.dataset.assigneeKey = key;
    row.dataset.assigneeValue = value;
    row.dataset.assigned = assigned ? 'true' : 'false';
    if (normalized) {
      row.dataset.assigneeNormalized = normalized;
    }

    const info = document.createElement('div');
    info.className = 'appdosc-card__assign-info';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'appdosc-card__assign-role';
    roleLabel.textContent = 'Подчинённый';
    info.appendChild(roleLabel);

    const name = document.createElement('div');
    name.className = 'appdosc-card__assign-name';
    name.textContent = label || buildAssignmentFallbackLabel(null, 'subordinate');
    info.appendChild(name);

    const commentInput = document.createElement('textarea');
    commentInput.className = 'appdosc-card__assign-comment-input';
    commentInput.placeholder = 'Комментарий для подчинённого';
    commentInput.rows = 2;
    commentInput.maxLength = 500;
    if (comment) {
      commentInput.value = comment;
    }
    info.appendChild(commentInput);

    const deadline = document.createElement('div');
    deadline.className = 'appdosc-card__assign-deadline';

    const deadlineLabel = document.createElement('div');
    deadlineLabel.className = 'appdosc-card__assign-deadline-label';
    deadlineLabel.textContent = 'Срок ответа';
    deadline.appendChild(deadlineLabel);

    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'date';
    deadlineInput.className = 'appdosc-card__assign-deadline-input';
    if (dueDate) {
      deadlineInput.value = dueDate;
    }
    deadline.appendChild(deadlineInput);

    info.appendChild(deadline);

    const responseViewButton = document.createElement('button');
    responseViewButton.type = 'button';
    responseViewButton.className = 'appdosc-card__action appdosc-card__action--view-response';
    responseViewButton.textContent = buildResponseViewButtonLabel(0);

    const entryData = referenceEntry || { value, label, normalized };
    renderResponseFilesCounter(
      null,
      countResponseFilesForEntry(task, entryData, value),
      false,
      responseViewButton
    );
    refreshResponseCounterForEntry(null, task, entryData, value, responseViewButton).catch(() => {});

    responseViewButton.addEventListener('click', async () => {
      await refreshResponseCounterForEntry(null, task, entryData, value, responseViewButton);
      openResponseViewerForEntry(responseViewButton, task, entryData, value);
    });
    info.appendChild(responseViewButton);

    const responseControls = createResponseUploadControls(task, referenceEntry || { value, label, normalized, role: 'subordinate' }, setStatus);
    if (responseControls) {
      info.appendChild(responseControls);
    }

    row.appendChild(info);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'appdosc-card__action appdosc-card__action--ghost';
    removeButton.dataset.assignmentAction = 'remove';
    removeButton.textContent = 'Убрать';
    removeButton.disabled = false;
    const actions = document.createElement('div');
    actions.className = 'appdosc-card__assign-actions';
    actions.appendChild(removeButton);
    row.appendChild(actions);

    entriesContainer.appendChild(row);

    rowControls.set(row, {
      assignButton: null,
      removeButton,
      commentInput,
      deadlineInput,
    });

    if (!assigned) {
      selection.add(row);
    }
    updateBulkState();

    const handleRemove = async () => {
      if (!task.id) {
        setStatus('error', 'Не удалось определить задачу.');
        return;
      }

      const targetValue = normalizeValue(row.dataset.assigneeValue);
      if (!targetValue) {
        setStatus('error', 'Не удалось определить подчинённого.');
        return;
      }

      if (!assigned) {
        selection.delete(row);
        row.remove();
        updateBulkState();
        setStatus('info', 'Кандидат убран из списка.');
        return;
      }

      if (removeButton.dataset.loading === 'true') {
        return;
      }

      const normalizedValue = normalizeIdentifier(targetValue);
      const rawValues = [targetValue];
      const normalizedValues = normalizedValue ? [normalizedValue] : [];

      setAssignmentRowBusy(row, true, null, removeButton, commentInput, deadlineInput);
      setStatus('info', 'Удаляем подчинённого...');
      const startedAt = Date.now();

      logSubordinateDebug('remove_request', {
        task: buildTaskDebugSummary(task),
        organization,
        subordinate: targetValue,
      });

      logClientEvent('task_subordinate_remove_request', {
        taskId: task.id || null,
        organization,
        subordinateId: normalizedValue || null,
        subordinateIds: normalizedValues,
        subordinateValues: rawValues,
      });

      try {
        await sendTaskMutation({
          updateType: 'subordinates_remove',
          organization,
          documentId: task.id,
          removeSubordinateId: targetValue,
        });

        logClientEvent('task_subordinate_remove_success', {
          taskId: task.id || null,
          organization,
          subordinateId: normalizedValue || null,
          subordinateIds: normalizedValues,
          subordinateValues: rawValues,
          durationMs: Date.now() - startedAt,
        });

        setStatus('success', 'Подчинённый удалён.');
        selection.delete(row);
        updateBulkState();
        await loadTasks(true);
      } catch (error) {
        const errorDetails = buildErrorDetails(error);
        const message = errorDetails.message || 'Ошибка назначения.';
        logClientEvent('task_subordinate_remove_error', {
          taskId: task.id || null,
          organization,
          subordinateId: normalizedValue || null,
          subordinateIds: normalizedValues,
          subordinateValues: rawValues,
          message,
          errorStatus: errorDetails.status,
          errorResponse: errorDetails.responseText,
        });
        setStatus('error', message);
      } finally {
        setAssignmentRowBusy(row, false, null, removeButton, commentInput, deadlineInput);
      }
    };

    removeButton.addEventListener('click', handleRemove);

    return row;
  };

  const handleBulkAssign = async () => {
    if (!task.id) {
      setStatus('error', 'Не удалось определить задачу.');
      return;
    }

    const payloadAssignments = [];
    const rawValues = [];
    const normalizedValues = [];
    const busyRows = [];

    selection.forEach((row) => {
      if (row.dataset.assigned === 'true') {
        return;
      }
      const targetValue = normalizeValue(row.dataset.assigneeValue);
      if (!targetValue) {
        return;
      }

      const controls = rowControls.get(row) || {};
      const commentValue = normalizeAssignmentComment(controls.commentInput ? controls.commentInput.value : undefined);
      const dueValue = normalizeAssignmentDueDate(controls.deadlineInput ? controls.deadlineInput.value : undefined);

      payloadAssignments.push({
        id: targetValue,
        assignmentComment: commentValue,
        assignmentDueDate: dueValue,
      });

      rawValues.push(targetValue);
      const normalizedValue = normalizeIdentifier(targetValue);
      if (normalizedValue) {
        normalizedValues.push(normalizedValue);
      }

      setAssignmentRowBusy(row, true, controls.assignButton, controls.removeButton, controls.commentInput, controls.deadlineInput);
      busyRows.push(row);
    });

    if (!payloadAssignments.length) {
      setStatus('error', 'Выберите подчинённых для назначения.');
      busyRows.forEach((row) => {
        const controls = rowControls.get(row) || {};
        setAssignmentRowBusy(row, false, controls.assignButton, controls.removeButton, controls.commentInput, controls.deadlineInput);
      });
      return;
    }

    setStatus('info', 'Назначаем выбранных подчинённых...');
    const startedAt = Date.now();

    logClientEvent('task_subordinate_assign_request', {
      taskId: task.id || null,
      organization,
      subordinateIds: normalizedValues,
      subordinateValues: rawValues,
      subordinateCount: payloadAssignments.length,
      subordinateAssignments: payloadAssignments,
      bulk: true,
    });

    try {
      await sendTaskMutation({
        updateType: 'subordinates_add',
        organization,
        documentId: task.id,
        subordinates: payloadAssignments,
      });

      logClientEvent('task_subordinate_assign_success', {
        taskId: task.id || null,
        organization,
        subordinateIds: normalizedValues,
        subordinateValues: rawValues,
        subordinateCount: payloadAssignments.length,
        subordinateAssignments: payloadAssignments,
        bulk: true,
        durationMs: Date.now() - startedAt,
      });

      setStatus('success', payloadAssignments.length > 1 ? 'Подчинённые назначены.' : 'Подчинённый назначен.');
      selection.clear();
      updateBulkState();
      setBulkAssignFeedback(bulkButton, 'Назначение успешно', updateBulkState, 'success');
      await loadTasks(true);
    } catch (error) {
      const errorDetails = buildErrorDetails(error);
      const message = errorDetails.message || 'Ошибка назначения.';
      logClientEvent('task_subordinate_assign_error', {
        taskId: task.id || null,
        organization,
        subordinateIds: normalizedValues,
        subordinateValues: rawValues,
        subordinateCount: payloadAssignments.length,
        subordinateAssignments: payloadAssignments,
        bulk: true,
        message,
        errorStatus: errorDetails.status,
        errorResponse: errorDetails.responseText,
      });
      setStatus('error', message);
      setBulkAssignFeedback(bulkButton, 'Назначение неуспешно', updateBulkState, 'error');
    } finally {
      busyRows.forEach((row) => {
        const controls = rowControls.get(row) || {};
        setAssignmentRowBusy(row, false, controls.assignButton, controls.removeButton, controls.commentInput, controls.deadlineInput);
      });
    }
  };

  bulkButton.addEventListener('click', handleBulkAssign);
  updateBulkState();

  populateSelectOptions();

  currentIdentifiers.forEach((identifier) => {
    const directoryEntry = directory.get(identifier);
    let value = directoryEntry ? directoryEntry.value : '';
    let label = directoryEntry ? directoryEntry.label : '';
    let comment = '';
    let matchedEntry = findAssignmentEntryByIdentifier(assignedEntries, identifier);

    if (!matchedEntry && value) {
      matchedEntry = findAssignmentEntryByIdentifier(assignedEntries, value.toLowerCase());
    }

    if (!matchedEntry && directoryEntry && directoryEntry.entry) {
      const entryCandidates = [
        directoryEntry.entry.id,
        directoryEntry.entry.subordinateId,
        directoryEntry.entry.subordinate,
        directoryEntry.entry.telegram,
        directoryEntry.entry.chatId,
        directoryEntry.entry.email,
        directoryEntry.entry.number,
        directoryEntry.entry.login,
        directoryEntry.entry.responsible,
        directoryEntry.entry.name,
      ];
      for (let index = 0; index < entryCandidates.length && !matchedEntry; index += 1) {
        const candidateKey = buildAssignmentDirectoryKey(entryCandidates[index]);
        if (candidateKey) {
          matchedEntry = findAssignmentEntryByIdentifier(assignedEntries, candidateKey);
        }
      }
    }

    if (!matchedEntry) {
      return;
    }

    if (!value) {
      value = resolveAssignmentValueFromEntry(matchedEntry);
    }
    if (!value) {
      return;
    }

    if (!label) {
      label = buildAssignmentFallbackLabel(matchedEntry, 'subordinate');
    }

    const normalizedKey = identifier || buildAssignmentDirectoryKey(value) || normalizeIdentifier(value);
    comment = resolveCommentForEntry(value, normalizedKey || '', matchedEntry);
    const dueDate = resolveDueForEntry(value, normalizedKey || '', matchedEntry);

    const referenceEntry = matchedEntry || (directoryEntry && directoryEntry.entry);
    if (hasRenderedEntry(referenceEntry, value, normalizedKey)) {
      return;
    }

    const row = createSubordinateRow({
      value,
      label,
      normalized: normalizedKey,
      assigned: true,
      comment,
      dueDate,
      referenceEntry,
    });
    if (row) {
      registerRenderedEntry(referenceEntry, value, normalizedKey);
    }
  });

  searchInput.addEventListener('input', () => {
    populateSelectOptions();
  });

  select.addEventListener('change', () => {
    const selectedValue = normalizeValue(select.value);
    if (!selectedValue) {
      return;
    }

    const normalizedValue = normalizeIdentifier(selectedValue);
    const existingRow = findAssignmentRow(entriesContainer, buildAssignmentRowKey(selectedValue, normalizedValue));
    if (existingRow) {
      existingRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      select.selectedIndex = 0;
      return;
    }

    let label = '';
    if (normalizedValue && directory.has(normalizedValue)) {
      label = directory.get(normalizedValue).label;
    } else {
      const matchedEntry = findAssignmentEntryByIdentifier(assignmentCandidates, normalizedValue || selectedValue.toLowerCase());
      if (matchedEntry && typeof matchedEntry === 'object') {
        label = buildSubordinateOptionLabel(matchedEntry);
      }
    }
    if (!label) {
      label = selectedValue;
    }

    let referenceEntry = null;
    if (normalizedValue && directory.has(normalizedValue)) {
      referenceEntry = directory.get(normalizedValue).entry || null;
    }
    if (!referenceEntry) {
      referenceEntry = findAssignmentEntryByIdentifier(assignmentCandidates, normalizedValue || selectedValue.toLowerCase());
    }
    if (!resolveEntryTelegramId(referenceEntry)) {
      setStatus('error', TELEGRAM_MISSING_MESSAGE);
      select.selectedIndex = 0;
      return;
    }
    const matchedEntry = findAssignmentEntryByIdentifier(
      assignedEntries,
      normalizedValue || selectedValue.toLowerCase(),
    );
    const comment = resolveCommentForEntry(selectedValue, normalizedValue, matchedEntry);
    const dueDate = resolveDueForEntry(selectedValue, normalizedValue, matchedEntry);

    const row = createSubordinateRow({
      value: selectedValue,
      label,
      normalized: normalizedValue,
      assigned: Boolean(currentIdentifiers.has(normalizedValue)),
      comment,
      dueDate,
      referenceEntry: referenceEntry || matchedEntry || null,
    });
    if (row) {
      registerRenderedEntry(referenceEntry || matchedEntry, selectedValue, normalizedValue);
    }

    select.selectedIndex = 0;
  });

  container.hidden = false;

  logSubordinateDebug('control_initialized', {
    task: buildTaskDebugSummary(task),
    organization,
    available: assignmentCandidates.length,
  });
}
