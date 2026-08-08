const STYLE_ID = 'appdosc-private-brief-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .appdosc-private-brief{position:fixed;inset:0;z-index:2400;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.34);backdrop-filter:blur(10px)}
    .appdosc-private-brief__panel{width:min(820px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.9);border-radius:20px;background:#fff;box-shadow:0 26px 60px rgba(15,23,42,.24)}
    .appdosc-private-brief__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e2e8f0}
    .appdosc-private-brief__title{font-size:18px;font-weight:800;color:#0f172a}.appdosc-private-brief__hint{margin-top:4px;font-size:12px;line-height:1.4;color:#64748b}
    .appdosc-private-brief__close{width:34px;height:34px;border:0;border-radius:10px;background:#f1f5f9;color:#334155;font-size:18px}
    .appdosc-private-brief__status{margin:0;padding:10px 16px;background:#f8fafc;color:#475569;font-size:12px;font-weight:700}
    .appdosc-private-brief__body{min-height:0;display:grid;grid-template-columns:minmax(190px,280px) minmax(0,1fr);gap:12px;padding:12px}
    .appdosc-private-brief__list{min-height:0;overflow:auto;scrollbar-gutter:stable;display:flex;flex-direction:column;gap:8px}
    .appdosc-private-brief__file{min-height:48px;padding:9px 10px;border:1px solid #dbeafe;border-radius:12px;background:#fff;color:#0f172a;text-align:left;font-size:12px;font-weight:700;overflow-wrap:anywhere}
    .appdosc-private-brief__file:disabled{opacity:.6}.appdosc-private-brief__preview{min-height:180px;margin:0;padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;color:#0f172a;font:13px/1.55 system-ui,sans-serif;white-space:pre-wrap;overflow:auto;scrollbar-gutter:stable}
    @media(max-width:680px){.appdosc-private-brief{align-items:flex-end;padding:8px}.appdosc-private-brief__panel{max-height:calc(100dvh - 16px);border-radius:18px}.appdosc-private-brief__body{grid-template-columns:1fr}.appdosc-private-brief__list{max-height:180px}}
  `;
  document.head.appendChild(style);
}

function normalize(value) {
  return String(value || '').trim();
}

export function createTelegramBriefAi(dependencies = {}) {
  const getAttachmentName = dependencies.getAttachmentName || ((file) => normalize(file && file.originalName) || 'Файл');
  const resolveFileFetchUrl = dependencies.resolveFileFetchUrl || ((file) => normalize(file && file.url));
  const buildRequestBody = dependencies.buildRequestBody || (() => ({}));
  const getTaskOrganization = dependencies.getTaskOrganization || ((task) => normalize(task && task.organization));

  async function prepareFile(source) {
    if (source && source.fileObject instanceof File) return source.fileObject;
    const fileUrl = normalize(source && source.url);
    if (!fileUrl) throw new Error('Ссылка на файл не найдена.');
    const response = await fetch(fileUrl, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить файл (${response.status}).`);
    const blob = await response.blob();
    return new File([blob], normalize(source && source.label) || 'document', {
      type: blob.type || 'application/octet-stream',
    });
  }

  async function requestBriefForSource(source, onStatus) {
    const setStatus = typeof onStatus === 'function' ? onStatus : () => {};
    setStatus('приватный OCR распознаёт файл...', 'loading');
    const file = await prepareFile(source);
    const formData = new FormData();
    formData.append('action', 'ai_brief_generate');
    formData.append('organization', normalize(source && source.organization));
    formData.append('file', file, normalize(file.name) || normalize(source && source.label) || 'document');
    const authPayload = source && source.authPayload && typeof source.authPayload === 'object'
      ? source.authPayload
      : buildRequestBody({ includeInitData: true, includeNameTokens: false });
    Object.keys(authPayload || {}).forEach((key) => {
      const value = authPayload[key];
      if (value !== undefined && value !== null && typeof value !== 'object') formData.append(key, String(value));
    });
    const startedAt = Date.now();
    const response = await fetch('/docs.php?action=ai_brief_generate', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success !== true) {
      throw new Error(normalize(payload && (payload.error || payload.message)) || `Ошибка ${response.status}`);
    }
    const summary = normalize(payload.summary);
    if (!summary) throw new Error('ИИ вернул пустой краткий вывод.');
    setStatus('готово', 'success');
    return {
      summary,
      model: normalize(payload.model),
      provider: normalize(payload.provider),
      timeMs: Date.now() - startedAt,
      warning: '',
      raw: payload,
    };
  }

  const openModal = function openModal(task, statusHandler, options = {}) {
    ensureStyle();
    const modal = document.createElement('div');
    modal.className = 'appdosc-private-brief';
    modal.innerHTML = `
      <section class="appdosc-private-brief__panel" role="dialog" aria-modal="true" aria-labelledby="appdosc-private-brief-title">
        <header class="appdosc-private-brief__head"><div><div id="appdosc-private-brief-title" class="appdosc-private-brief__title">Кратко ИИ</div><div class="appdosc-private-brief__hint">Приватный OCR → выбранная администратором модель</div></div><button type="button" class="appdosc-private-brief__close" aria-label="Закрыть">×</button></header>
        <p class="appdosc-private-brief__status">Выберите файл.</p>
        <div class="appdosc-private-brief__body"><div class="appdosc-private-brief__list"></div><pre class="appdosc-private-brief__preview">Здесь появится краткий вывод.</pre></div>
      </section>`;
    const list = modal.querySelector('.appdosc-private-brief__list');
    const preview = modal.querySelector('.appdosc-private-brief__preview');
    const status = modal.querySelector('.appdosc-private-brief__status');
    const close = () => {
      document.removeEventListener('keydown', onKeydown);
      modal.remove();
    };
    const onKeydown = (event) => { if (event.key === 'Escape') close(); };
    modal.querySelector('.appdosc-private-brief__close').addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    document.addEventListener('keydown', onKeydown);

    const files = Array.isArray(task && task.files) ? task.files : [];
    files.forEach((file, index) => {
      const source = {
        label: getAttachmentName(file, index + 1),
        url: resolveFileFetchUrl(file),
        organization: getTaskOrganization(task),
        storedName: normalize(file && file.storedName),
        originalName: normalize(file && file.originalName),
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'appdosc-private-brief__file';
      button.textContent = source.label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        preview.textContent = '⏳ Обработка файла...';
        try {
          const result = await requestBriefForSource(source, (message) => { status.textContent = message; });
          preview.textContent = result.summary;
          file.aiBrief = result.summary;
          if (typeof options.onBriefApplied === 'function') options.onBriefApplied(source, result.summary);
          if (typeof options.onBriefReady === 'function') await options.onBriefReady(source, result.summary);
          status.textContent = `Готово • ${result.model || 'модель из настроек'} • приватный OCR`;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'неизвестная ошибка';
          preview.textContent = `Ошибка: ${message}`;
          status.textContent = 'Анализ не выполнен.';
          if (typeof statusHandler === 'function') statusHandler('warning', message);
        } finally {
          button.disabled = false;
        }
      });
      list.appendChild(button);
    });
    if (!files.length) list.textContent = 'Нет файлов для анализа.';
    document.body.appendChild(modal);
  };

  openModal.requestBriefForSource = requestBriefForSource;
  return openModal;
}
