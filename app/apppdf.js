const BODY_LOCK_CLASS = 'appdosc--viewer-open';
const ACTIVE_ATTR = 'data-active';
const PDFJS_SOURCES = [
  {
    script: '/js/documents/pdf/pdf.min.js',
    worker: '/js/documents/pdf/pdf.worker.min.js',
  },
];
const PDF_DIAGNOSTIC_EVENT = 'appdosc:pdf-log';
const PDFJS_SCRIPT_LOAD_TIMEOUT_MS = 8000;
const PDF_FRAME_FALLBACK_TIMEOUT_MS = 62000;
// Blob уже загружен; таймаут нужен только на случай зависшего декодирования изображения WebView.
const IMAGE_LOAD_TIMEOUT_MS = 15000;
// Если PDF.js не получил структуру документа за это время, нативный iframe
// даст пользователю более быстрый шанс открыть файл без повторной загрузки PDF.js.
const PDF_DOCUMENT_OPEN_TIMEOUT_MS = 12000;

let pdfjsPromise = null;
let pointerWarningLogged = false;
let backgroundAppSuspension = null;

function logPdfEvent(step, details) {
  if (typeof window === 'undefined') {
    return;
  }
  if (typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(PDF_DIAGNOSTIC_EVENT, { detail: { step, details } }));
    } catch (error) {
      // ignore
    }
  }
}

async function ensurePdfjs() {
  if (typeof window === 'undefined') {
    throw new Error('pdf.js недоступна в текущем окружении');
  }
  if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_SOURCES[0].worker;
    }
    logPdfEvent('pdfjs:ready', {
      worker: window.pdfjsLib.GlobalWorkerOptions.workerSrc || '',
      version: window.pdfjsLib.version || '',
    });
    return window.pdfjsLib;
  }
  if (pdfjsPromise) {
    logPdfEvent('pdfjs:pending');
    return pdfjsPromise;
  }
  const cacheVersion = window.__RUNTIME_ASSET_VERSION__ || window.__ASSET_VERSION__ || Date.now();

  const loadFromSource = (index) => new Promise((resolve, reject) => {
    if (index >= PDFJS_SOURCES.length) {
      reject(new Error('Не удалось загрузить pdf.js'));
      return;
    }

    const source = PDFJS_SOURCES[index];
    logPdfEvent('pdfjs:load', { source });
    const script = document.createElement('script');
    let settled = false;
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(loadTimeoutId);
      callback();
    };
    script.src = `${source.script}${source.script.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheVersion)}`;
    script.async = true;
    script.onload = () => {
      finish(() => {
        if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            `${source.worker}${source.worker.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheVersion)}`;
          logPdfEvent('pdfjs:loaded', {
            worker: window.pdfjsLib.GlobalWorkerOptions.workerSrc || '',
            version: window.pdfjsLib.version || '',
          });
          resolve(window.pdfjsLib);
          return;
        }
        logPdfEvent('pdfjs:error', { source, reason: 'missing_pdfjs' });
        reject(new Error('pdf.js не загрузилась'));
      });
    };
    script.onerror = () => {
      finish(() => {
        logPdfEvent('pdfjs:error', { source, reason: 'load_failed' });
        resolve(loadFromSource(index + 1));
      });
    };
    const loadTimeoutId = window.setTimeout(() => {
      finish(() => {
        script.remove();
        logPdfEvent('pdfjs:error', { source, reason: 'load_timeout' });
        reject(new Error('pdfjs_script_load_timeout'));
      });
    }, PDFJS_SCRIPT_LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });

  pdfjsPromise = loadFromSource(0).catch((error) => {
    pdfjsPromise = null;
    throw error;
  });
  return pdfjsPromise;
}

function isPdfWorkerFailure(error) {
  const message = error && error.message ? String(error.message) : String(error || '');
  return /worker|workerSrc|fake worker/i.test(message);
}

function resolveUrl(rawUrl) {
  if (rawUrl === null || rawUrl === undefined) {
    return '';
  }
  const candidate = String(rawUrl).trim();
  if (!candidate) {
    return '';
  }
  try {
    return new URL(candidate, window.location.origin).toString();
  } catch (error) {
    if (candidate.startsWith('/')) {
      return candidate;
    }
    return `/${candidate.replace(/^\/+/, '')}`;
  }
}

function setBackgroundAppSuspended(active) {
  if (typeof document === 'undefined') {
    return;
  }

  if (active) {
    if (backgroundAppSuspension) {
      return;
    }
    const viewer = document.querySelector('[data-viewer]');
    const appRoot = viewer instanceof HTMLElement
      ? viewer.closest('[data-app]')
      : document.querySelector('[data-app]');
    if (!(appRoot instanceof HTMLElement) || !(viewer instanceof HTMLElement)) {
      return;
    }

    const backgroundElements = Array.from(appRoot.children)
      .filter((element) => element instanceof HTMLElement && element !== viewer && !element.contains(viewer))
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: 'inert' in element ? element.inert : null,
      }));

    backgroundAppSuspension = {
      elements: backgroundElements,
      scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    };

    backgroundElements.forEach(({ element }) => {
      element.setAttribute('aria-hidden', 'true');
      if ('inert' in element) {
        element.inert = true;
      }
    });
    return;
  }

  const suspension = backgroundAppSuspension;
  backgroundAppSuspension = null;
  if (!suspension || !Array.isArray(suspension.elements)) {
    return;
  }

  suspension.elements.forEach(({ element, ariaHidden, inert }) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (ariaHidden === null) {
      element.removeAttribute('aria-hidden');
    } else {
      element.setAttribute('aria-hidden', ariaHidden);
    }
    if ('inert' in element && inert !== null) {
      element.inert = inert;
    }
  });

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.scrollTo(suspension.scrollX, suspension.scrollY);
    });
  }
}

function applyBodyLock(active) {
  if (typeof document === 'undefined') {
    return;
  }
  if (active) {
    document.body.classList.add(BODY_LOCK_CLASS);
    setBackgroundAppSuspended(true);
  } else {
    document.body.classList.remove(BODY_LOCK_CLASS);
    setBackgroundAppSuspended(false);
  }
}

export function preloadPdfjs() {
  return ensurePdfjs().catch(() => {});
}

export function createPdfViewer(root = document) {
  if (!root || typeof root.querySelector !== 'function') {
    return {
      open(url) {
        const resolved = resolveUrl(url);
        if (resolved) {
          window.open(resolved, '_blank', 'noopener');
          return 'window';
        }
        return false;
      },
      close() {},
      isReady() {
        return false;
      },
      preload() {
        return ensurePdfjs().catch(() => {});
      },
    };
  }

  const elements = {
    container: root.querySelector('[data-viewer]'),
    dialog: root.querySelector('[data-viewer-dialog]'),
    frame: root.querySelector('[data-viewer-frame]'),
    title: root.querySelector('[data-viewer-title]'),
    backdrop: root.querySelector('[data-viewer-backdrop]'),
    image: root.querySelector('[data-viewer-image]'),
    video: root.querySelector('[data-viewer-video]'),
    surface: root.querySelector('[data-viewer-surface]'),
    zoom: root.querySelector('[data-viewer-zoom]'),
    pdf: root.querySelector('[data-viewer-pdf]'),
    pdfCanvas: root.querySelector('[data-viewer-pdf-canvas]'),
    html: root.querySelector('[data-viewer-html]'),
    zoomIn: root.querySelector('[data-viewer-zoom-in]'),
    zoomOut: root.querySelector('[data-viewer-zoom-out]'),
    fit: root.querySelector('[data-viewer-fit]'),
    content: root.querySelector('[data-viewer-content]'),
  };

  elements.closeButtons = Array.from(root.querySelectorAll('[data-viewer-close]'));
  if (!elements.container || !elements.frame) {
    return {
      open(url) {
        const resolved = resolveUrl(url);
        if (resolved) {
          window.open(resolved, '_blank', 'noopener');
          return 'window';
        }
        return false;
      },
      close() {},
      isReady() {
        return false;
      },
      preload() {
        return ensurePdfjs().catch(() => {});
      },
    };
  }

  let lastActiveElement = null;
  let pdfResizeObserver = null;

  if (!elements.container.hasAttribute(ACTIVE_ATTR)) {
    elements.container.setAttribute(ACTIVE_ATTR, 'false');
  }

  function isViewerActive() {
    return Boolean(elements.container && elements.container.getAttribute(ACTIVE_ATTR) === 'true');
  }

  function focusTrap(event) {
    if (event.key !== 'Tab' || !elements.container || elements.container.getAttribute(ACTIVE_ATTR) !== 'true') {
      return;
    }

    const focusable = elements.container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  let viewerMode = 'frame';
  let imageLoadPromise = null;
  let resolveImageLoad = null;
  let cleanupImageLoadListeners = null;
  const ZOOM_MIN = 1;
  const FRAME_ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const PDF_ZOOM_MIN = 50;
  const PDF_ZOOM_MAX = 400;
  const OFFICE_FRAME_ZOOM_MIN = 25;
  const OFFICE_FRAME_ZOOM_MAX = 400;
  const OFFICE_FRAME_ZOOM_STEP = 10;
  const OFFICE_FRAME_ZOOM_GRANULARITY = 5;
  const OFFICE_FRAME_ZOOM_FIT = 100;
  const zoomState = {
    enabled: false,
    scale: 1,
    translateX: 0,
    translateY: 0,
    startScale: 1,
    startTranslateX: 0,
    startTranslateY: 0,
    startDistance: 0,
    startCenter: { x: 0, y: 0 },
    startPointer: { x: 0, y: 0 },
    startScrollLeft: 0,
    startScrollTop: 0,
    pointers: new Map(),
  };
  const pdfZoomState = {
    active: false,
    zoom: 100,
    fit: true,
    useCanvas: false,
  };
  const pdfFramePosition = {
    page: null,
    percent: null,
  };
  const pdfFrameRestore = {
    page: null,
    percent: null,
  };
  const pdfRenderState = {
    doc: null,
    renderToken: 0,
    loading: false,
    lastUrl: '',
    resizeTimer: null,
    loadToken: 0,
    renderedPages: 0,
    totalPages: 0,
    renderStatus: 'idle',
    loadPromise: null,
    loadingTask: null,
    progressCallback: null,
    renderedZoom: 100,
  };
  const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
  if (!supportsPointerEvents && !pointerWarningLogged) {
    pointerWarningLogged = true;
    logPdfEvent('input:pointer_unavailable', { fallback: 'touch_mouse' });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getZoomMinScale() {
    return viewerMode === 'frame' ? FRAME_ZOOM_MIN : ZOOM_MIN;
  }

  function getFrameSrc() {
    return elements.frame ? (elements.frame.getAttribute('src') || '') : '';
  }

  function getOfficeFrameUrl(url = getFrameSrc()) {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      if (!host.includes('view.officeapps.live.com') || !/\/op\/(?:embed|view)\.aspx$/i.test(path)) {
        return null;
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function getOfficeFrameSourceUrl(parsedUrl) {
    if (!parsedUrl) {
      return '';
    }
    return parsedUrl.searchParams.get('src') || '';
  }

  function hasWordOfficeExtension(sourceUrl) {
    const source = String(sourceUrl || '').trim();
    if (!source) {
      return false;
    }
    try {
      const parsed = new URL(source, window.location.href);
      return /\.(?:doc|docx|odt)$/i.test(parsed.pathname);
    } catch (_error) {
      return /\.(?:doc|docx|odt)(?:[?#]|$)/i.test(source);
    }
  }

  function getWordOfficeFrameFileName() {
    if (!elements.frame || !elements.frame.dataset) {
      return '';
    }
    return elements.frame.dataset.viewerFileName || '';
  }

  function setFrameFileContext(title, extension = '') {
    if (!elements.frame || !elements.frame.dataset) {
      return;
    }
    const fileName = title && String(title).trim() ? String(title).trim() : '';
    const normalizedExtension = extension && String(extension).trim()
      ? String(extension).trim().replace(/^\./, '')
      : '';
    const contextName = !hasWordOfficeExtension(fileName) && normalizedExtension
      ? `${fileName || 'document'}.${normalizedExtension}`
      : fileName;
    if (contextName) {
      elements.frame.dataset.viewerFileName = contextName;
    } else {
      delete elements.frame.dataset.viewerFileName;
    }
  }

  function getWordOfficeFrameUrl(url = getFrameSrc()) {
    const parsed = getOfficeFrameUrl(url);
    if (!parsed) {
      return null;
    }
    if (
      parsed.searchParams.has('wdZoom')
      || hasWordOfficeExtension(getOfficeFrameSourceUrl(parsed))
      || hasWordOfficeExtension(getWordOfficeFrameFileName())
    ) {
      return parsed;
    }
    return null;
  }

  function isWordOfficeFrameActive() {
    return viewerMode === 'frame' && Boolean(getWordOfficeFrameUrl());
  }

  function getWordOfficeFrameZoom(url = getFrameSrc()) {
    if (elements.frame && elements.frame.dataset && elements.frame.dataset.officeZoom) {
      const storedZoom = Number.parseInt(elements.frame.dataset.officeZoom, 10);
      if (Number.isFinite(storedZoom)) {
        return normalizeWordOfficeFrameZoom(storedZoom);
      }
    }
    const parsed = getWordOfficeFrameUrl(url);
    if (!parsed) {
      return OFFICE_FRAME_ZOOM_FIT;
    }
    const rawZoom = parsed.searchParams.get('wdZoom');
    const zoom = Number.parseInt(rawZoom || '', 10);
    if (!Number.isFinite(zoom)) {
      return OFFICE_FRAME_ZOOM_FIT;
    }
    return clamp(zoom, OFFICE_FRAME_ZOOM_MIN, OFFICE_FRAME_ZOOM_MAX);
  }

  function normalizeWordOfficeFrameZoom(value) {
    const bounded = clamp(Number(value) || OFFICE_FRAME_ZOOM_FIT, OFFICE_FRAME_ZOOM_MIN, OFFICE_FRAME_ZOOM_MAX);
    const rounded = Math.round(bounded / OFFICE_FRAME_ZOOM_GRANULARITY) * OFFICE_FRAME_ZOOM_GRANULARITY;
    return Math.round(clamp(rounded, OFFICE_FRAME_ZOOM_MIN, OFFICE_FRAME_ZOOM_MAX));
  }

  function getWordOfficeEffectiveZoom() {
    return getWordOfficeFrameZoom();
  }

  function setWordOfficeFrameZoomUrl(zoom) {
    if (!elements.frame) {
      return false;
    }
    const parsed = getWordOfficeFrameUrl();
    if (!parsed) {
      return false;
    }
    parsed.searchParams.set('wdZoom', String(normalizeWordOfficeFrameZoom(zoom)));
    const nextUrl = parsed.toString();
    const currentUrl = elements.frame.getAttribute('src') || '';
    if (nextUrl && nextUrl !== currentUrl) {
      elements.frame.setAttribute('src', nextUrl);
      return true;
    }
    return false;
  }

  function setWordOfficeFrameAutoFitUrl() {
    if (!elements.frame) {
      return false;
    }
    const parsed = getWordOfficeFrameUrl();
    if (!parsed || !parsed.searchParams.has('wdZoom')) {
      return false;
    }
    parsed.searchParams.delete('wdZoom');
    const nextUrl = parsed.toString();
    const currentUrl = elements.frame.getAttribute('src') || '';
    if (nextUrl && nextUrl !== currentUrl) {
      elements.frame.setAttribute('src', nextUrl);
      return true;
    }
    return false;
  }

  function resetWordOfficeFramePresentation(options = {}) {
    if (elements.frame) {
      elements.frame.style.width = '';
      elements.frame.style.height = '';
      elements.frame.style.transform = 'none';
    }
    if (options.clearZoom && elements.frame && elements.frame.dataset) {
      delete elements.frame.dataset.officeZoom;
    }
    if (options.resetScroll && elements.zoom) {
      elements.zoom.scrollLeft = 0;
      elements.zoom.scrollTop = 0;
    }
  }

  function applyWordOfficeFrameZoomLayout(zoomValue, options = {}) {
    if (!elements.frame || !isWordOfficeFrameActive()) {
      return false;
    }
    const zoom = normalizeWordOfficeFrameZoom(zoomValue);
    zoomState.scale = ZOOM_MIN;
    zoomState.translateX = 0;
    zoomState.translateY = 0;
    zoomState.pointers.clear();
    resetWordOfficeFramePresentation(options);
    if (elements.frame.dataset) {
      elements.frame.dataset.officeZoom = String(zoom);
    }
    if (options.resetScroll) {
      if (elements.zoom) {
        elements.zoom.scrollLeft = 0;
        elements.zoom.scrollTop = 0;
      }
      try {
        if (elements.frame.contentWindow) {
          elements.frame.contentWindow.scrollTo(0, 0);
        }
      } catch (_error) {
        // cross-origin Office iframe scroll is controlled by Office viewer
      }
    }
    updateZoomLayout();
    return true;
  }

  function resetWordOfficeFrameToWidth(options = {}) {
    if (!isWordOfficeFrameActive() || !elements.frame) {
      return false;
    }
    zoomState.scale = ZOOM_MIN;
    zoomState.translateX = 0;
    zoomState.translateY = 0;
    zoomState.pointers.clear();
    resetWordOfficeFramePresentation({ ...options, clearZoom: true });
    setWordOfficeFrameAutoFitUrl();
    updateZoomLayout();
    updateZoomControls();
    return true;
  }

  function clearFrameCssTransform() {
    zoomState.scale = ZOOM_MIN;
    zoomState.translateX = 0;
    zoomState.translateY = 0;
    zoomState.pointers.clear();
    resetWordOfficeFramePresentation({ clearZoom: true, resetScroll: true });
    if (elements.frame) {
      elements.frame.style.transform = 'none';
    }
    if (elements.zoom) {
      elements.zoom.style.transform = 'none';
      elements.zoom.style.removeProperty('--appdosc-zoom-scale');
    }
    updateZoomLayout();
  }

  function setWordOfficeFrameZoom(nextZoom, options = {}) {
    if (!isWordOfficeFrameActive() || !elements.frame) {
      return false;
    }
    const previousZoom = getWordOfficeFrameZoom();
    const zoom = normalizeWordOfficeFrameZoom(nextZoom);
    applyWordOfficeFrameZoomLayout(zoom, options);
    if (zoom !== previousZoom || options.forceUrl) {
      setWordOfficeFrameZoomUrl(zoom);
    }
    updateZoomControls();
    return true;
  }

  function adjustWordOfficeFrameZoom(delta) {
    if (!isWordOfficeFrameActive()) {
      return false;
    }
    return setWordOfficeFrameZoom(getWordOfficeEffectiveZoom() + delta);
  }

  function getPdfZoomFromUrl(url) {
    if (!url) {
      return null;
    }
    const [, hash = ''] = String(url).split('#');
    if (!hash) {
      return null;
    }
    const params = new URLSearchParams(hash);
    const zoom = params.get('zoom');
    if (!zoom) {
      return null;
    }
    const numeric = Number.parseFloat(zoom);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function getPdfPageFromUrl(url) {
    if (!url) {
      return null;
    }
    const [, hash = ''] = String(url).split('#');
    if (!hash) {
      return null;
    }
    const params = new URLSearchParams(hash);
    const page = params.get('page');
    if (!page) {
      return null;
    }
    const numeric = Number.parseInt(page, 10);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function buildPdfUrlWithZoom(url, zoomValue, pageValue) {
    if (!url) {
      return '';
    }
    const [base, hash = ''] = String(url).split('#');
    const params = new URLSearchParams(hash);
    params.set('zoom', zoomValue);
    if (Number.isFinite(pageValue)) {
      params.set('page', `${pageValue}`);
    }
    const nextHash = params.toString();
    return nextHash ? `${base}#${nextHash}` : base;
  }

  function getFramePdfUrl() {
    if (!elements.frame) {
      return '';
    }
    const baseUrl = elements.frame.getAttribute('src') || '';
    try {
      if (elements.frame.contentWindow && elements.frame.contentWindow.location) {
        const frameUrl = elements.frame.contentWindow.location.href || '';
        if (frameUrl && frameUrl !== 'about:blank') {
          return frameUrl;
        }
      }
    } catch (error) {
      // ignore cross-origin access
    }
    return baseUrl;
  }

  function getPdfPageFromFrame() {
    if (!elements.frame) {
      return null;
    }
    const urlPage = getPdfPageFromUrl(getFramePdfUrl());
    if (Number.isFinite(urlPage)) {
      return urlPage;
    }
    try {
      const doc = elements.frame.contentDocument;
      if (!doc) {
        return null;
      }
      const scrollRoot = doc.scrollingElement || doc.documentElement || doc.body;
      if (!scrollRoot) {
        return null;
      }
      const scrollTop = Number.isFinite(scrollRoot.scrollTop) ? scrollRoot.scrollTop : 0;
      const pages = Array.from(doc.querySelectorAll('[data-page-number], .page'));
      if (!pages.length) {
        return null;
      }
      const currentPage = pages.find((page) => {
        const start = page.offsetTop;
        const end = start + page.offsetHeight;
        return scrollTop >= start && scrollTop < end;
      }) || pages[pages.length - 1];
      if (!currentPage) {
        return null;
      }
      const pageNumber = currentPage.getAttribute('data-page-number');
      const numeric = Number.parseInt(pageNumber, 10);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      return pages.indexOf(currentPage) + 1;
    } catch (error) {
      return null;
    }
  }

  function getPdfScrollPercentFromFrame() {
    if (!elements.frame) {
      return null;
    }
    try {
      const doc = elements.frame.contentDocument;
      if (!doc) {
        return null;
      }
      const scrollRoot = doc.scrollingElement || doc.documentElement || doc.body;
      if (!scrollRoot || !Number.isFinite(scrollRoot.scrollHeight) || scrollRoot.scrollHeight <= 0) {
        return null;
      }
      const scrollTop = Number.isFinite(scrollRoot.scrollTop) ? scrollRoot.scrollTop : 0;
      const percent = scrollTop / scrollRoot.scrollHeight;
      if (!Number.isFinite(percent)) {
        return null;
      }
      return clamp(percent, 0, 1);
    } catch (error) {
      return null;
    }
  }

  function capturePdfFramePosition() {
    const page = getPdfPageFromFrame();
    if (Number.isFinite(page)) {
      pdfFramePosition.page = page;
      pdfFramePosition.percent = null;
      return;
    }
    const percent = getPdfScrollPercentFromFrame();
    if (Number.isFinite(percent)) {
      pdfFramePosition.page = null;
      pdfFramePosition.percent = percent;
      return;
    }
    pdfFramePosition.page = null;
    pdfFramePosition.percent = null;
  }

  function rememberPdfFramePosition() {
    pdfFrameRestore.page = pdfFramePosition.page;
    pdfFrameRestore.percent = pdfFramePosition.percent;
  }

  function buildPdfUrlWithPage(url, pageValue) {
    if (!url) {
      return '';
    }
    const [base, hash = ''] = String(url).split('#');
    const params = new URLSearchParams(hash);
    if (Number.isFinite(pageValue)) {
      params.set('page', `${pageValue}`);
    }
    const nextHash = params.toString();
    return nextHash ? `${base}#${nextHash}` : base;
  }

  function restorePdfFramePosition() {
    if (!elements.frame) {
      return;
    }
    const { page, percent } = pdfFrameRestore;
    pdfFrameRestore.page = null;
    pdfFrameRestore.percent = null;
    if (!Number.isFinite(page) && !Number.isFinite(percent)) {
      return;
    }
    if (Number.isFinite(page)) {
      const currentUrl = elements.frame.getAttribute('src') || '';
      const nextUrl = buildPdfUrlWithPage(currentUrl, page);
      try {
        if (elements.frame.contentWindow && elements.frame.contentWindow.location) {
          elements.frame.contentWindow.location.hash = `page=${page}`;
          return;
        }
      } catch (error) {
        // ignore cross-origin access
      }
      if (nextUrl) {
        elements.frame.setAttribute('src', nextUrl);
      }
      return;
    }
    if (Number.isFinite(percent)) {
      try {
        const doc = elements.frame.contentDocument;
        if (!doc) {
          return;
        }
        const scrollRoot = doc.scrollingElement || doc.documentElement || doc.body;
        if (!scrollRoot || !Number.isFinite(scrollRoot.scrollHeight)) {
          return;
        }
        const targetTop = percent * scrollRoot.scrollHeight;
        if (elements.frame.contentWindow) {
          elements.frame.contentWindow.scrollTo(0, targetTop);
        }
      } catch (error) {
        // ignore cross-origin access
      }
    }
  }

  function getZoomTarget() {
    if (viewerMode === 'frame') {
      if (isWordOfficeFrameActive()) {
        return elements.frame || elements.zoom || elements.surface || null;
      }
      return elements.frame || elements.zoom || elements.surface || null;
    }
    if (viewerMode === 'pdf' && pdfZoomState.active) {
      return elements.pdfCanvas || elements.pdf || elements.surface || null;
    }
    if (!zoomState.enabled) {
      return null;
    }
    return elements.zoom || elements.surface || null;
  }

  function applyZoomTransform() {
    const target = getZoomTarget();
    if (!target) {
      if (elements.zoom) {
        elements.zoom.style.transform = 'none';
        elements.zoom.style.removeProperty('--appdosc-zoom-scale');
      }
      if (elements.frame) {
        elements.frame.style.transform = 'none';
      }
      if (elements.image) {
        elements.image.style.transform = 'none';
      }
      return;
    }
    if (viewerMode === 'image' && elements.image) {
      if (elements.zoom) {
        elements.zoom.style.transform = 'none';
        elements.zoom.style.removeProperty('--appdosc-zoom-scale');
      }
      elements.image.style.transform = `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`;
      if (elements.frame) {
        elements.frame.style.transform = 'none';
      }
      updateZoomLayout();
      return;
    }
    if (viewerMode === 'frame' && isWordOfficeFrameActive()) {
      applyWordOfficeFrameZoomLayout(getWordOfficeEffectiveZoom());
      updateZoomLayout();
      return;
    }
    if (viewerMode === 'frame' && elements.frame && target === elements.frame) {
      if (elements.zoom) {
        elements.zoom.style.transform = 'none';
        elements.zoom.style.removeProperty('--appdosc-zoom-scale');
      }
      elements.frame.style.transform = `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`;
      updateZoomLayout();
      return;
    }
    if (elements.zoom && target === elements.zoom) {
      elements.zoom.style.setProperty('--appdosc-zoom-scale', `${zoomState.scale}`);
    } else if (elements.zoom) {
      elements.zoom.style.removeProperty('--appdosc-zoom-scale');
    }
    if (elements.frame) {
      elements.frame.style.transform = 'none';
    }
    target.style.transform = `translate(${zoomState.translateX}px, ${zoomState.translateY}px)`;
    updateZoomLayout();
  }

  function updateZoomControls() {
    const frameZoomEnabled = viewerMode === 'frame';
    const wordOfficeFrameZoomEnabled = frameZoomEnabled && isWordOfficeFrameActive();
    const wordOfficeFrameZoom = wordOfficeFrameZoomEnabled ? getWordOfficeEffectiveZoom() : 0;
    const zoomEnabled = zoomState.enabled || pdfZoomState.active || frameZoomEnabled;

    if (elements.fit) {
      elements.fit.disabled = !zoomEnabled;
    }
    if (elements.zoomIn) {
      elements.zoomIn.disabled = !zoomEnabled
        || (wordOfficeFrameZoomEnabled && wordOfficeFrameZoom >= OFFICE_FRAME_ZOOM_MAX)
        || (!wordOfficeFrameZoomEnabled && zoomState.enabled && zoomState.scale >= ZOOM_MAX)
        || (pdfZoomState.active && !pdfZoomState.fit && pdfZoomState.zoom >= PDF_ZOOM_MAX);
    }
    if (elements.zoomOut) {
      elements.zoomOut.disabled = !zoomEnabled
        || (wordOfficeFrameZoomEnabled && wordOfficeFrameZoom <= OFFICE_FRAME_ZOOM_MIN)
        || (!wordOfficeFrameZoomEnabled && zoomState.enabled && zoomState.scale <= getZoomMinScale())
        || (pdfZoomState.active && !pdfZoomState.fit && pdfZoomState.zoom <= PDF_ZOOM_MIN);
    }
  }

  function resetImageTransform() {
    zoomState.scale = ZOOM_MIN;
    zoomState.translateX = 0;
    zoomState.translateY = 0;
    zoomState.pointers.clear();
    applyZoomTransform();
    updateZoomLayout();
    updateZoomControls();
  }

  function clampTranslate(nextX, nextY) {
    if (viewerMode === 'frame') {
      return { x: nextX, y: nextY };
    }
    if (!elements.surface) {
      return { x: 0, y: 0 };
    }
    const rect = elements.surface.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: 0, y: 0 };
    }
    let maxX = 0;
    let maxY = 0;
    if (zoomState.scale > ZOOM_MIN) {
      maxX = rect.width * (zoomState.scale - 1);
      maxY = rect.height * (zoomState.scale - 1);
    } else if (elements.image) {
      const imageRect = elements.image.getBoundingClientRect();
      maxX = Math.max(0, imageRect.width - rect.width);
      maxY = Math.max(0, imageRect.height - rect.height);
    }
    if (!maxX && !maxY) {
      return { x: 0, y: 0 };
    }
    return {
      x: clamp(nextX, -maxX * 3, maxX * 3),
      y: clamp(nextY, -maxY * 3, maxY * 3),
    };
  }

  function getImageOverflowState() {
    if (!elements.image || !elements.surface) {
      return { overflowX: false, overflowY: false };
    }
    const imageRect = elements.image.getBoundingClientRect();
    const surfaceRect = elements.surface.getBoundingClientRect();
    if (!surfaceRect.width || !surfaceRect.height) {
      return { overflowX: false, overflowY: false };
    }
    return {
      overflowX: imageRect.width > surfaceRect.width + 1,
      overflowY: imageRect.height > surfaceRect.height + 1,
    };
  }

  function isImagePanAvailable() {
    if (!zoomState.enabled) {
      return false;
    }
    if (isWordOfficeFrameActive()) {
      return false;
    }
    if (zoomState.scale > ZOOM_MIN) {
      return true;
    }
    if (viewerMode === 'frame') {
      return false;
    }
    const overflow = getImageOverflowState();
    return overflow.overflowX || overflow.overflowY;
  }

  function setViewerMode(mode) {
    viewerMode = mode;
    const useImage = mode === 'image' && elements.image;
    const useVideo = mode === 'video' && elements.video;
    const usePdf = mode === 'pdf' && elements.pdf && elements.pdfCanvas;
    const useHtml = mode === 'html' && elements.html;
    zoomState.enabled = Boolean(useImage || mode === 'frame');
    if (elements.container) {
      elements.container.classList.toggle('appdosc-viewer--frame', !useImage && !usePdf && !useVideo && !useHtml);
      elements.container.classList.toggle('appdosc-viewer--pdf', usePdf);
      elements.container.classList.toggle('appdosc-viewer--html', useHtml);
      elements.container.setAttribute('data-viewer-mode', mode);
    }
    if (elements.content) {
      elements.content.classList.toggle('appdosc-viewer__content--frame', !useImage && !usePdf && !useVideo && !useHtml);
    }
    if (elements.frame) {
      elements.frame.hidden = Boolean(useImage || usePdf || useVideo || useHtml);
      elements.frame.classList.toggle('is-active', !useImage && !usePdf && !useVideo && !useHtml);
      elements.frame.setAttribute('scrolling', 'yes');
      elements.frame.setAttribute('loading', 'eager');
    }
    if (elements.image) {
      elements.image.hidden = !useImage;
      elements.image.classList.toggle('is-active', Boolean(useImage));
    }
    if (elements.video) {
      elements.video.hidden = !useVideo;
      elements.video.classList.toggle('is-active', Boolean(useVideo));
    }
    if (elements.pdf) {
      elements.pdf.hidden = !usePdf;
    }
    if (elements.pdfCanvas) {
      elements.pdfCanvas.style.touchAction = usePdf ? 'none' : '';
    }
    if (elements.html) {
      elements.html.hidden = !useHtml;
    }
    if (elements.zoom) {
      elements.zoom.hidden = Boolean(usePdf || useHtml);
    }
    if (mode === 'frame') {
      resetFrameTransform();
    } else {
      resetWordOfficeFramePresentation({ clearZoom: true, resetScroll: true });
      resetImageTransform();
      if (elements.frame) {
        elements.frame.style.transform = 'none';
      }
    }
  }

  function updateZoomLayout() {
    const zoomed = (zoomState.enabled || viewerMode === 'frame')
      && zoomState.scale > ZOOM_MIN;
    if (elements.container) {
      elements.container.classList.toggle('appdosc-viewer--zoomed', zoomed);
    }
    if (elements.zoom) {
      if (zoomState.enabled) {
        elements.zoom.style.setProperty('--appdosc-zoom-scale', `${zoomState.scale}`);
      } else {
        elements.zoom.style.removeProperty('--appdosc-zoom-scale');
      }
    }
  }

  function setPdfZoom(zoomValue) {
    if (!elements.frame || !pdfZoomState.active) {
      return;
    }
    const currentUrl = getFramePdfUrl();
    const currentPage = getPdfPageFromFrame();
    const nextUrl = buildPdfUrlWithZoom(currentUrl, zoomValue, currentPage);
    if (nextUrl) {
      rememberPdfFramePosition();
      elements.frame.setAttribute('src', nextUrl);
    }
  }

  function clearPdfCanvas() {
    if (!elements.pdfCanvas) {
      return;
    }
    clearPdfZoomRenderTimer();
    elements.pdfCanvas.querySelectorAll('[data-pdf-blob-url]').forEach((node) => {
      const blobUrl = node.getAttribute('data-pdf-blob-url');
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    });
    elements.pdfCanvas.innerHTML = '';
  }

  function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.86) {
    return new Promise((resolve) => {
      if (!canvas || typeof canvas.toBlob !== 'function') {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  function releaseCanvasMemory(canvas) {
    if (!canvas) {
      return;
    }
    canvas.width = 1;
    canvas.height = 1;
  }

  function setupPdfResizeObserver() {
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') {
      return;
    }
    const target = elements.surface || elements.pdfCanvas;
    if (!target) {
      return;
    }
    if (pdfResizeObserver) {
      pdfResizeObserver.disconnect();
    }
    pdfResizeObserver = new ResizeObserver(() => {
      if (!pdfZoomState.active || !pdfRenderState.doc || !pdfZoomState.useCanvas) {
        return;
      }
      clearPdfZoomRenderTimer();
    });
    pdfResizeObserver.observe(target);
  }

  function teardownPdfResizeObserver() {
    if (pdfResizeObserver) {
      pdfResizeObserver.disconnect();
      pdfResizeObserver = null;
    }
  }

  function setPdfCanvasMessage(message, options = {}) {
    if (!elements.pdfCanvas) {
      return;
    }
    clearPdfCanvas();
    const variant = options && options.variant ? options.variant : 'loader';
    const box = document.createElement('div');
    box.className = variant === 'loader' ? 'appdosc-pdf-viewer__loader' : 'appdosc-pdf-viewer__message';
    box.textContent = message;
    elements.pdfCanvas.appendChild(box);

    if (options && options.actionLabel && typeof options.onAction === 'function') {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'appdosc-pdf-viewer__action';
      actionButton.textContent = options.actionLabel;
      actionButton.addEventListener('click', (event) => {
        event.preventDefault();
        options.onAction();
      });
      elements.pdfCanvas.appendChild(actionButton);
    }
  }

  function appendPdfCanvasActionMessage(message, options = {}) {
    if (!elements.pdfCanvas) {
      return;
    }
    const previous = elements.pdfCanvas.querySelector('[data-pdf-action-message]');
    if (previous && previous.parentNode) {
      previous.parentNode.removeChild(previous);
    }
    const box = document.createElement('div');
    box.className = 'appdosc-pdf-viewer__message';
    box.dataset.pdfActionMessage = 'true';
    box.textContent = message;

    if (options && options.actionLabel && typeof options.onAction === 'function') {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'appdosc-pdf-viewer__action';
      actionButton.textContent = options.actionLabel;
      actionButton.addEventListener('click', (event) => {
        event.preventDefault();
        options.onAction();
      });
      box.appendChild(actionButton);
    }

    elements.pdfCanvas.appendChild(box);
  }

  function destroyPdfDocument() {
    if (pdfRenderState.loadingTask && typeof pdfRenderState.loadingTask.destroy === 'function') {
      try {
        const destroyResult = pdfRenderState.loadingTask.destroy();
        if (destroyResult && typeof destroyResult.catch === 'function') {
          destroyResult.catch(() => {});
        }
      } catch (error) {
        // ignore
      }
    }
    pdfRenderState.loadingTask = null;
    if (pdfRenderState.doc && typeof pdfRenderState.doc.destroy === 'function') {
      try {
        pdfRenderState.doc.destroy();
      } catch (error) {
        // ignore
      }
    }
    pdfRenderState.doc = null;
  }

  function cancelActivePdfLoad(reason) {
    const progressCallback = pdfRenderState.progressCallback;
    pdfRenderState.loadToken += 1;
    pdfRenderState.renderToken += 1;
    pdfRenderState.loading = false;
    pdfRenderState.loadPromise = null;
    destroyPdfDocument();
    if (typeof progressCallback === 'function') {
      try {
        progressCallback({ stage: 'cancelled', reason: reason || 'viewer_cancelled' });
      } catch (_progressError) {
        // Отмена просмотрщика не должна зависеть от внешнего обработчика прогресса.
      }
    }
    if (pdfRenderState.progressCallback === progressCallback) {
      pdfRenderState.progressCallback = null;
    }
  }

  function resetViewerContent() {
    if (typeof cleanupImageLoadListeners === 'function') {
      cleanupImageLoadListeners();
    }
    if (typeof resolveImageLoad === 'function') {
      resolveImageLoad(false);
    }
    imageLoadPromise = null;
    resolveImageLoad = null;
    cleanupImageLoadListeners = null;
    cancelActivePdfLoad('viewer_replaced');
    pdfRenderState.lastUrl = '';
    pdfRenderState.renderedZoom = 100;
    clearPdfCanvas();
    if (elements.frame) {
      elements.frame.removeAttribute('src');
      clearFrameCssTransform();
      if (elements.frame.dataset) {
        delete elements.frame.dataset.viewerFileName;
      }
    }
    if (elements.image) {
      elements.image.removeAttribute('src');
      elements.image.removeAttribute('alt');
      elements.image.classList.remove('is-active');
      elements.image.hidden = true;
    }
    if (elements.video) {
      elements.video.pause();
      elements.video.removeAttribute('src');
      elements.video.classList.remove('is-active');
      elements.video.hidden = true;
      elements.video.load();
    }
    if (elements.html) {
      elements.html.innerHTML = '';
      elements.html.hidden = true;
    }
  }

  function getPdfContainerSize() {
    const canvasWidth = elements.pdfCanvas ? elements.pdfCanvas.clientWidth : 0;
    const canvasHeight = elements.pdfCanvas ? elements.pdfCanvas.clientHeight : 0;
    const surfaceWidth = elements.surface ? elements.surface.clientWidth : 0;
    const surfaceHeight = elements.surface ? elements.surface.clientHeight : 0;
    return {
      width: Math.max(canvasWidth, surfaceWidth),
      height: Math.max(canvasHeight, surfaceHeight),
    };
  }

  function getPdfFitScale(page) {
    if (!elements.pdfCanvas && !elements.surface) {
      return 1;
    }
    const viewport = page.getViewport({ scale: 1 });
    const { width: containerWidth, height: containerHeight } = getPdfContainerSize();
    let horizontalPadding = 0;
    if (elements.pdfCanvas && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(elements.pdfCanvas);
      horizontalPadding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    }
    const effectiveWidth = Math.max(1, (containerWidth || viewport.width) - horizontalPadding);
    if (!effectiveWidth || !viewport.width) {
      return 1;
    }
    const widthScale = effectiveWidth / viewport.width;
    const { isMobile } = detectMobilePlatform();
    if (isMobile || !containerHeight || !viewport.height) {
      return widthScale;
    }
    const heightScale = Math.max(0.1, (containerHeight - 24) / viewport.height);
    return Math.min(widthScale, heightScale);
  }

  function getPdfLayoutMetrics() {
    const surfaceRect = elements.surface && typeof elements.surface.getBoundingClientRect === 'function'
      ? elements.surface.getBoundingClientRect()
      : null;
    const pdfRect = elements.pdf && typeof elements.pdf.getBoundingClientRect === 'function'
      ? elements.pdf.getBoundingClientRect()
      : null;
    const canvasRect = elements.pdfCanvas && typeof elements.pdfCanvas.getBoundingClientRect === 'function'
      ? elements.pdfCanvas.getBoundingClientRect()
      : null;
    return {
      surface: surfaceRect
        ? { width: Math.round(surfaceRect.width), height: Math.round(surfaceRect.height) }
        : null,
      pdf: pdfRect ? { width: Math.round(pdfRect.width), height: Math.round(pdfRect.height) } : null,
      canvas: canvasRect ? { width: Math.round(canvasRect.width), height: Math.round(canvasRect.height) } : null,
      canvasClient: elements.pdfCanvas
        ? { width: elements.pdfCanvas.clientWidth, height: elements.pdfCanvas.clientHeight }
        : null,
    };
  }

  function isPdfLayoutReady() {
    const { width, height } = getPdfContainerSize();
    return width > 0 && height > 0;
  }

  function waitForNextFrame() {
    return new Promise((resolve) => {
      // В Telegram WebView requestAnimationFrame может приостанавливаться после
      // скрытия стартового loader. Таймер продолжает очередь остальных страниц.
      setTimeout(resolve, 16);
    });
  }

  async function waitForPdfLayout(maxAttempts = 24) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (isPdfLayoutReady()) {
        return true;
      }
      logPdfEvent('layout:wait', { attempt, metrics: getPdfLayoutMetrics() });
      // eslint-disable-next-line no-await-in-loop
      await waitForNextFrame();
    }
    return isPdfLayoutReady();
  }

  function getPdfScrollContainer() {
    const candidates = [elements.pdfCanvas, elements.content, elements.surface].filter(Boolean);
    const canScroll = (container) => {
      const scrollHeight = Number.isFinite(container.scrollHeight) ? container.scrollHeight : 0;
      const clientHeight = Number.isFinite(container.clientHeight) ? container.clientHeight : 0;
      if (scrollHeight <= clientHeight) {
        return false;
      }
      const start = Number.isFinite(container.scrollTop) ? container.scrollTop : 0;
      const next = Math.min(start + 1, scrollHeight - clientHeight);
      if (next === start) {
        return false;
      }
      container.scrollTop = next;
      const changed = container.scrollTop !== start;
      container.scrollTop = start;
      return changed;
    };

    return candidates.find((container) => canScroll(container)) || candidates[0] || null;
  }

  function capturePdfScrollState() {
    const container = getPdfScrollContainer();
    if (!container) {
      return null;
    }
    const scrollTop = Number.isFinite(container.scrollTop) ? container.scrollTop : 0;
    const scrollHeight = Number.isFinite(container.scrollHeight) ? container.scrollHeight : 0;
    const ratio = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
    const pages = elements.pdfCanvas
      ? Array.from(elements.pdfCanvas.querySelectorAll('.appdosc-pdf-viewer__page'))
      : [];
    let pageIndex = null;
    let pageOffset = 0;
    if (pages.length) {
      const currentPage = pages.find((page) => {
        const start = page.offsetTop;
        const end = start + page.offsetHeight;
        return scrollTop >= start && scrollTop < end;
      }) || pages[pages.length - 1];
      if (currentPage) {
        pageIndex = pages.indexOf(currentPage);
        pageOffset = scrollTop - currentPage.offsetTop;
      }
    }
    return {
      container,
      scrollTop,
      scrollHeight,
      ratio,
      pageIndex,
      pageOffset,
    };
  }

  function restorePdfScrollState(state) {
    const container = state && state.container ? state.container : getPdfScrollContainer();
    if (!state || !container) {
      return;
    }
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const setScrollTop = (value) => {
      const nextValue = Math.min(Math.max(0, value), maxScrollTop);
      container.scrollTop = nextValue;
    };
    if (state.pageIndex !== null && elements.pdfCanvas) {
      const pages = Array.from(elements.pdfCanvas.querySelectorAll('.appdosc-pdf-viewer__page'));
      const page = pages[state.pageIndex];
      if (page) {
        setScrollTop(page.offsetTop + state.pageOffset);
        return;
      }
    }
    if (state.scrollHeight > 0) {
      setScrollTop(state.ratio * container.scrollHeight);
      return;
    }
    setScrollTop(state.scrollTop);
  }

  function detectMobilePlatform() {
    if (typeof navigator === 'undefined') {
      return { isMobile: false, isIos: false };
    }
    const ua = navigator.userAgent || '';
    const maxTouch = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
    const isIos = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouch > 1);
    const isAndroid = /Android/i.test(ua);
    const isMobile = isIos || isAndroid || maxTouch > 1;
    return { isMobile, isIos };
  }

  function getRenderedPdfZoom() {
    const zoom = Number(pdfRenderState.renderedZoom);
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 100;
  }

  function applyPdfPageVisualScale(page, scale) {
    if (!(page instanceof HTMLElement)) {
      return;
    }
    const baseWidth = Number(page.dataset.pdfPageWidth || 0);
    const baseHeight = Number(page.dataset.pdfPageHeight || 0);
    if (baseWidth > 0) {
      page.style.width = `${baseWidth * scale}px`;
    }
    if (baseHeight > 0) {
      page.style.minHeight = `${baseHeight * scale}px`;
    }
    const image = page.querySelector('.appdosc-pdf-viewer__page-image, canvas');
    if (!(image instanceof HTMLElement)) {
      return;
    }
    if (baseWidth > 0) {
      image.style.width = `${baseWidth * scale}px`;
    }
    if (baseHeight > 0) {
      image.style.height = `${baseHeight * scale}px`;
    }
  }

  function applyPdfCanvasVisualZoom(anchorPoint = null) {
    if (!elements.pdfCanvas || !pdfZoomState.useCanvas) {
      return;
    }
    const scrollContainer = getPdfScrollContainer();
    let zoomAnchor = null;
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const localX = anchorPoint && Number.isFinite(anchorPoint.x)
        ? clamp(anchorPoint.x - rect.left, 0, scrollContainer.clientWidth)
        : scrollContainer.clientWidth / 2;
      const localY = anchorPoint && Number.isFinite(anchorPoint.y)
        ? clamp(anchorPoint.y - rect.top, 0, scrollContainer.clientHeight)
        : scrollContainer.clientHeight / 2;
      zoomAnchor = {
        localX,
        localY,
        contentXRatio: scrollContainer.scrollWidth > 0
          ? (scrollContainer.scrollLeft + localX) / scrollContainer.scrollWidth
          : 0,
        contentYRatio: scrollContainer.scrollHeight > 0
          ? (scrollContainer.scrollTop + localY) / scrollContainer.scrollHeight
          : 0,
      };
    }
    const scale = clamp(pdfZoomState.zoom / getRenderedPdfZoom(), PDF_ZOOM_MIN / PDF_ZOOM_MAX, PDF_ZOOM_MAX / PDF_ZOOM_MIN);
    const pages = Array.from(elements.pdfCanvas.querySelectorAll('.appdosc-pdf-viewer__page'));
    pages.forEach((page) => {
      applyPdfPageVisualScale(page, scale);
    });
    if (scrollContainer && zoomAnchor) {
      const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      scrollContainer.scrollLeft = clamp(
        zoomAnchor.contentXRatio * scrollContainer.scrollWidth - zoomAnchor.localX,
        0,
        maxScrollLeft,
      );
      scrollContainer.scrollTop = clamp(
        zoomAnchor.contentYRatio * scrollContainer.scrollHeight - zoomAnchor.localY,
        0,
        maxScrollTop,
      );
    }
  }

  function clearPdfZoomRenderTimer() {
    if (!pdfRenderState.resizeTimer) {
      return;
    }
    window.clearTimeout(pdfRenderState.resizeTimer);
    pdfRenderState.resizeTimer = null;
  }

  function applyPdfZoomWithoutRerender(anchorPoint = null) {
    if (!pdfZoomState.useCanvas || !pdfRenderState.doc) {
      return;
    }
    applyPdfCanvasVisualZoom(anchorPoint);
  }

  async function renderPdfPagesInternal(forcePixelRatio, onProgress = null) {
    if (!elements.pdfCanvas || !pdfRenderState.doc) {
      pdfRenderState.renderedPages = 0;
      pdfRenderState.totalPages = 0;
      pdfRenderState.renderStatus = 'failed';
      return false;
    }
    if (!isPdfLayoutReady()) {
      logPdfEvent('layout:empty', getPdfLayoutMetrics());
      pdfRenderState.renderedPages = 0;
      pdfRenderState.totalPages = pdfRenderState.doc ? pdfRenderState.doc.numPages : 0;
      pdfRenderState.renderStatus = 'failed';
      return false;
    }
    const currentToken = ++pdfRenderState.renderToken;
    const isCurrentRender = () => currentToken === pdfRenderState.renderToken;
    const doc = pdfRenderState.doc;
    let renderedPages = 0;
    let firstPageReadySent = false;
    const basePixelRatio = typeof window !== 'undefined' && window.devicePixelRatio
      ? Math.max(1, window.devicePixelRatio)
      : 1;
    const renderZoom = pdfZoomState.fit ? 100 : pdfZoomState.zoom;
    const zoomBoost = clamp(renderZoom / 100, 1, 2);
    const pixelRatio = typeof forcePixelRatio === 'number' && forcePixelRatio > 0
      ? forcePixelRatio
      : basePixelRatio * zoomBoost;

    const { isMobile, isIos } = detectMobilePlatform();
    let remainingPagesStatus = null;

    const updateRemainingPagesStatus = () => {
      if (!elements.pdfCanvas || doc.numPages <= 1) {
        return;
      }
      if (renderedPages >= doc.numPages) {
        if (remainingPagesStatus && remainingPagesStatus.parentNode) {
          remainingPagesStatus.parentNode.removeChild(remainingPagesStatus);
        }
        remainingPagesStatus = null;
        return;
      }
      if (!remainingPagesStatus) {
        remainingPagesStatus = document.createElement('div');
        remainingPagesStatus.className = 'appdosc-pdf-viewer__loader';
        remainingPagesStatus.setAttribute('role', 'status');
        remainingPagesStatus.setAttribute('aria-live', 'polite');
      }
      remainingPagesStatus.textContent = `Показано ${renderedPages} из ${doc.numPages} страниц · готовим следующую…`;
      elements.pdfCanvas.appendChild(remainingPagesStatus);
    };

    // На мобильных устройствах браузеры (особенно iOS Safari) имеют жёсткий лимит на память
    // canvas. Поэтому canvas используется только как временный рендер-буфер, а в DOM остаются
    // изображения страниц. Так Telegram WebView не теряет хвост PDF после первой страницы.
    const MAX_TOTAL_CANVAS_PIXELS_DESKTOP = 192 * 1024 * 1024;
    const MAX_TOTAL_CANVAS_PIXELS_IOS = 48 * 1024 * 1024;
    const MAX_TOTAL_CANVAS_PIXELS_MOBILE = 96 * 1024 * 1024;
    const MAX_TOTAL_CANVAS_PIXELS = isIos
      ? MAX_TOTAL_CANVAS_PIXELS_IOS
      : (isMobile ? MAX_TOTAL_CANVAS_PIXELS_MOBILE : MAX_TOTAL_CANVAS_PIXELS_DESKTOP);

    // Максимальная площадь одного canvas (~16M пикселей — безопасный порог для всех браузеров).
    const MAX_SINGLE_CANVAS_PIXELS = isIos ? 8 * 1024 * 1024 : 24 * 1024 * 1024;
    // Минимальный pixelRatio — ниже этого значения не снижаем (страницы будут размытыми, но видимыми).
    const MIN_PIXEL_RATIO = isIos ? 0.7 : 1;
    let usedCanvasPixels = 0;

    // Предварительная оценка: если страниц много, снижаем pixelRatio заранее,
    // чтобы гарантировать отображение всех страниц.
    let adjustedPixelRatio = pixelRatio;
    if (doc.numPages > 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const samplePage = await doc.getPage(1);
        if (!isCurrentRender()) {
          return false;
        }
        const sampleFitScale = getPdfFitScale(samplePage);
        const sampleZoomScale = renderZoom / 100;
        const sampleViewport = samplePage.getViewport({ scale: sampleFitScale * sampleZoomScale });
        const estimatedPerPage = sampleViewport.width * sampleViewport.height * pixelRatio * pixelRatio;
        const estimatedTotal = estimatedPerPage * doc.numPages;
        if (estimatedTotal > MAX_TOTAL_CANVAS_PIXELS) {
          const reduction = Math.sqrt(MAX_TOTAL_CANVAS_PIXELS / estimatedTotal);
          adjustedPixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio * reduction);
          logPdfEvent('рендер:предварительное_снижение', {
            originalPixelRatio: pixelRatio,
            adjustedPixelRatio,
            pages: doc.numPages,
            estimatedTotal,
            budget: MAX_TOTAL_CANVAS_PIXELS,
            isMobile,
            isIos,
          });
        }
      } catch (_e) {
        // ошибка оценки не критична
      }
    }
    if (!isCurrentRender()) {
      return false;
    }

    logPdfEvent('рендер', {
      pages: doc.numPages,
      zoom: pdfZoomState.zoom,
      fit: pdfZoomState.fit,
      pixelRatio: adjustedPixelRatio,
      originalPixelRatio: pixelRatio,
      canvasBudget: MAX_TOTAL_CANVAS_PIXELS,
      isMobile,
      isIos,
      forced: typeof forcePixelRatio === 'number',
    });

    const scrollState = capturePdfScrollState();
    clearPdfCanvas();

    // Все уже отрисованные страницы должны декодироваться сразу: lazy-loading
    // внутри Telegram WebView оставлял дальние страницы пустыми до прокрутки.
    const IMAGE_LOADING_MODE = 'eager';
    const FIRST_PAGE_JPEG_QUALITY = isIos ? 0.94 : 0.97;
    const OTHER_PAGE_JPEG_QUALITY = isIos ? 0.92 : 0.95;
    let failedPages = 0;
    const pageRetryCounts = new Map();
    const PAGE_RENDER_RETRY_LIMIT = 2;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (!isCurrentRender()) {
        return false;
      }
      let pageWrapper = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        const page = await doc.getPage(pageNumber);
        if (!isCurrentRender()) {
          return false;
        }
        const fitScale = getPdfFitScale(page);
        const zoomScale = renderZoom / 100;
        const renderScale = fitScale * zoomScale;
        const viewport = page.getViewport({ scale: renderScale });

        // Рассчитываем эффективный pixelRatio с учётом лимитов canvas
        // Первая видимая страница сохраняет исходную плотность и ограничивается
        // только безопасным лимитом одного canvas. Общий бюджет влияет на остальные страницы.
        const pageBasePixelRatio = pageNumber === 1 ? pixelRatio : adjustedPixelRatio;
        let effectivePixelRatio = pageBasePixelRatio;
        let scaledW = Math.ceil(viewport.width * effectivePixelRatio);
        let scaledH = Math.ceil(viewport.height * effectivePixelRatio);
        let canvasPixels = scaledW * scaledH;

        // Если один canvas превышает лимит — снижаем pixelRatio для этой страницы
        if (canvasPixels > MAX_SINGLE_CANVAS_PIXELS) {
          const reductionFactor = Math.sqrt(MAX_SINGLE_CANVAS_PIXELS / canvasPixels);
          effectivePixelRatio = effectivePixelRatio * reductionFactor;
          scaledW = Math.ceil(viewport.width * effectivePixelRatio);
          scaledH = Math.ceil(viewport.height * effectivePixelRatio);
          canvasPixels = scaledW * scaledH;
          logPdfEvent('рендер:масштаб_снижен', {
            page: pageNumber,
            originalPixelRatio: pageBasePixelRatio,
            effectivePixelRatio,
            reason: 'single_canvas_limit',
          });
        }

        // Если общий бюджет будет превышен — снижаем pixelRatio (вплоть до MIN_PIXEL_RATIO)
        if (usedCanvasPixels + canvasPixels > MAX_TOTAL_CANVAS_PIXELS) {
          const remainingBudget = MAX_TOTAL_CANVAS_PIXELS - usedCanvasPixels;
          if (remainingBudget <= 0) {
            // Бюджет полностью исчерпан — используем MIN_PIXEL_RATIO
            effectivePixelRatio = MIN_PIXEL_RATIO;
          } else if (effectivePixelRatio > MIN_PIXEL_RATIO) {
            const reductionFactor = Math.sqrt(remainingBudget / canvasPixels);
            effectivePixelRatio = Math.max(MIN_PIXEL_RATIO, effectivePixelRatio * reductionFactor);
          }
          scaledW = Math.ceil(viewport.width * effectivePixelRatio);
          scaledH = Math.ceil(viewport.height * effectivePixelRatio);
          canvasPixels = scaledW * scaledH;
          logPdfEvent('рендер:масштаб_снижен', {
            page: pageNumber,
            originalPixelRatio: pageBasePixelRatio,
            effectivePixelRatio,
            reason: 'total_budget_limit',
            usedCanvasPixels,
            remainingBudget,
          });
        }

        const renderAttempts = [
          effectivePixelRatio,
          Math.max(MIN_PIXEL_RATIO, effectivePixelRatio * 0.72),
          Math.max(MIN_PIXEL_RATIO, effectivePixelRatio * 0.5),
          MIN_PIXEL_RATIO,
        ];

        let pageRendered = false;
        let lastPageError = null;
        let successfulCanvasPixels = 0;
        for (let attempt = 0; attempt < renderAttempts.length; attempt += 1) {
          if (pageRendered) {
            break;
          }
          const attemptPixelRatio = renderAttempts[attempt];
          const attemptViewport = page.getViewport({ scale: renderScale * attemptPixelRatio });
          const attemptPixels = Math.ceil(attemptViewport.width) * Math.ceil(attemptViewport.height);
          const canvas = document.createElement('canvas');
          canvas.width = attemptViewport.width;
          canvas.height = attemptViewport.height;

          try {
            if (!pageWrapper) {
              pageWrapper = document.createElement('div');
              pageWrapper.className = 'appdosc-pdf-viewer__page';
              pageWrapper.dataset.pdfPageWidth = String(viewport.width);
              pageWrapper.dataset.pdfPageHeight = String(viewport.height);
              pageWrapper.style.width = `${viewport.width}px`;
              pageWrapper.style.minHeight = `${viewport.height}px`;
            }
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) {
              throw new Error('canvas_context_unavailable');
            }
            // eslint-disable-next-line no-await-in-loop
            await page.render({ canvasContext: context, viewport: attemptViewport }).promise;
            if (!isCurrentRender()) {
              return false;
            }
            const pageJpegQuality = pageNumber === 1
              ? FIRST_PAGE_JPEG_QUALITY
              : OTHER_PAGE_JPEG_QUALITY;
            const blob = await canvasToBlob(canvas, 'image/jpeg', pageJpegQuality);
            if (!isCurrentRender()) {
              return false;
            }
            const image = document.createElement('img');
            image.className = 'appdosc-pdf-viewer__page-image';
            image.alt = `Страница ${pageNumber} из ${doc.numPages}`;
            image.decoding = 'async';
            image.loading = IMAGE_LOADING_MODE;
            image.draggable = false;
            image.width = Math.max(1, Math.round(viewport.width));
            image.height = Math.max(1, Math.round(viewport.height));
            image.style.width = `${viewport.width}px`;
            image.style.height = `${viewport.height}px`;

            let blobUrl = '';
            if (blob) {
              blobUrl = URL.createObjectURL(blob);
              image.src = blobUrl;
              image.setAttribute('data-pdf-blob-url', blobUrl);
            } else {
              image.src = canvas.toDataURL('image/jpeg', Math.max(0.78, pageJpegQuality - 0.04));
            }

            if (typeof image.decode === 'function') {
              try {
                await image.decode();
              } catch (_decodeError) {
                // WebView может не поддержать decode для blob URL; src остаётся рабочим.
              }
            }
            if (!isCurrentRender()) {
              if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
              }
              return false;
            }

            pageWrapper.textContent = '';
            pageWrapper.appendChild(image);
            if (!pageWrapper.parentNode) {
              if (remainingPagesStatus && remainingPagesStatus.parentNode === elements.pdfCanvas) {
                elements.pdfCanvas.insertBefore(pageWrapper, remainingPagesStatus);
              } else {
                elements.pdfCanvas.appendChild(pageWrapper);
              }
            }
            const visibleZoom = pdfZoomState.fit ? 100 : pdfZoomState.zoom;
            applyPdfPageVisualScale(pageWrapper, visibleZoom / renderZoom);
            successfulCanvasPixels = attemptPixels;
            pageRendered = true;
            if (attempt > 0) {
              logPdfEvent('рендер:повтор_успех', {
                page: pageNumber,
                attempt: attempt + 1,
                pixelRatio: attemptPixelRatio,
              });
            }
          } catch (attemptError) {
            if (!isCurrentRender()) {
              return false;
            }
            lastPageError = attemptError;
            logPdfEvent('рендер:страница_повтор', {
              page: pageNumber,
              attempt: attempt + 1,
              maxAttempts: renderAttempts.length,
              pixelRatio: attemptPixelRatio,
              message: attemptError && attemptError.message ? attemptError.message : String(attemptError),
            });
            if (pageWrapper) {
              pageWrapper.textContent = '';
            }
          } finally {
            releaseCanvasMemory(canvas);
          }
        }

        if (!pageRendered) {
          throw lastPageError || new Error('page_render_failed');
        }

        usedCanvasPixels += successfulCanvasPixels;
        renderedPages += 1;
        pdfRenderState.renderedPages = renderedPages;
        pdfRenderState.totalPages = doc.numPages;
        pdfRenderState.renderStatus = renderedPages < doc.numPages ? 'partial' : 'complete';
        pdfRenderState.renderedZoom = renderZoom;
        if (renderedPages === 1) {
          pdfZoomState.useCanvas = true;
          updateZoomControls();
        }
        pageWrapper = null;
        updateRemainingPagesStatus();

        if (pageNumber === 1 && typeof onProgress === 'function') {
          try {
            onProgress({
              stage: 'ready',
              page: 1,
              renderedPages: 1,
              totalPages: doc.numPages,
              complete: doc.numPages === 1,
            });
            firstPageReadySent = true;
          } catch (progressError) {
            // Прогресс не должен влиять на отрисовку документа.
          }
        }

        if (pageNumber < doc.numPages) {
          // Между страницами отдаём кадр браузеру: готовые страницы появляются постепенно,
          // а Telegram не зависает на непрерывной отрисовке большого документа.
          // eslint-disable-next-line no-await-in-loop
          await waitForNextFrame();
          if (!isCurrentRender()) {
            return false;
          }
        }

        if (typeof onProgress === 'function') {
          try {
            onProgress({
              stage: 'render',
              page: pageNumber,
              totalPages: doc.numPages,
            });
          } catch (progressError) {
            // Прогресс не должен влиять на отрисовку документа.
          }
        }
      } catch (error) {
        if (!isCurrentRender()) {
          return false;
        }
        logPdfEvent('рендер:ошибка', {
          page: pageNumber,
          totalPages: doc.numPages,
          renderedSoFar: renderedPages,
          usedCanvasPixels,
          message: error && error.message ? error.message : String(error),
        });
        // Удаляем wrapper с битым canvas, чтобы не показывать пустую страницу
        try {
          if (pageWrapper && pageWrapper.parentNode) {
            pageWrapper.parentNode.removeChild(pageWrapper);
          }
        } catch (_removeErr) { /* не критично */ }
        pageWrapper = null;
        const retryCount = pageRetryCounts.get(pageNumber) || 0;
        if (retryCount < PAGE_RENDER_RETRY_LIMIT && currentToken === pdfRenderState.renderToken) {
          pageRetryCounts.set(pageNumber, retryCount + 1);
          // Range-загрузка в Telegram иногда отдаёт структуру документа раньше,
          // чем готов следующий фрагмент. Повторяем именно эту страницу.
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 120 * (retryCount + 1)));
          if (!isCurrentRender()) {
            return false;
          }
          pageNumber -= 1;
          continue;
        }
        failedPages += 1;
        // Продолжаем рендеринг остальных страниц вместо остановки
        continue;
      }
    }
    if (failedPages > 0) {
      logPdfEvent('рендер:пропущенные_страницы', {
        failedPages,
        renderedPages,
        totalPages: doc.numPages,
        usedCanvasPixels,
      });
    }

    if (remainingPagesStatus && renderedPages < doc.numPages) {
      remainingPagesStatus.textContent = `Показано ${renderedPages} из ${doc.numPages} страниц. Часть страниц не удалось отрисовать.`;
    }

    if (renderedPages > 0 && typeof onProgress === 'function') {
      try {
        onProgress({
          stage: firstPageReadySent ? 'render_complete' : 'ready',
          page: doc.numPages,
          renderedPages,
          totalPages: doc.numPages,
          complete: renderedPages === doc.numPages,
        });
      } catch (progressError) {
        // Финальный прогресс не должен влиять на уже загруженные страницы.
      }
    }

    const firstPageMedia = elements.pdfCanvas.querySelector('canvas, .appdosc-pdf-viewer__page-image');
    const firstPageWidth = firstPageMedia
      ? (firstPageMedia.width || firstPageMedia.naturalWidth || firstPageMedia.clientWidth || 0)
      : 0;
    const firstPageHeight = firstPageMedia
      ? (firstPageMedia.height || firstPageMedia.naturalHeight || firstPageMedia.clientHeight || 0)
      : 0;
    if (!firstPageMedia || !firstPageWidth || !firstPageHeight) {
      logPdfEvent('рендер:пусто', {
        metrics: getPdfLayoutMetrics(),
        firstPage: firstPageMedia ? { width: firstPageWidth, height: firstPageHeight } : null,
      });
      pdfRenderState.renderedPages = 0;
      pdfRenderState.totalPages = doc.numPages;
      pdfRenderState.renderStatus = 'empty';
      return false;
    }

    pdfRenderState.renderedPages = renderedPages;
    pdfRenderState.totalPages = doc.numPages;
    pdfRenderState.renderedZoom = renderZoom;
    const isComplete = renderedPages === doc.numPages && doc.numPages > 0;
    if (renderedPages === 0) {
      pdfRenderState.renderStatus = 'empty';
    } else if (isComplete) {
      pdfRenderState.renderStatus = 'complete';
    } else {
      pdfRenderState.renderStatus = 'partial';
    }
    if (!isComplete) {
      logPdfEvent('рендер:неполный', {
        renderedPages,
        totalPages: doc.numPages,
        usedCanvasPixels,
        failedPages,
        adjustedPixelRatio,
        budget: MAX_TOTAL_CANVAS_PIXELS,
      });
    }
    await waitForNextFrame();
    if (!isCurrentRender()) {
      return false;
    }
    restorePdfScrollState(scrollState);
    return isComplete;
  }

  async function renderPdfPages(onProgress = null) {
    return renderPdfPagesInternal(undefined, onProgress);
  }

  async function loadPdfDocument(url, data, onProgress = null) {
    if (!url || !elements.pdfCanvas || !elements.pdf) {
      return false;
    }
    const currentLoadToken = ++pdfRenderState.loadToken;
    pdfRenderState.loading = true;
    pdfRenderState.lastUrl = url;
    pdfRenderState.renderStatus = 'pending';
    pdfRenderState.renderedPages = 0;
    pdfRenderState.totalPages = 0;
    setPdfCanvasMessage('Загрузка PDF...', { variant: 'loader' });
    logPdfEvent('загрузка:старт', { url, hasData: Boolean(data) });
    if (typeof onProgress === 'function') {
      try {
        onProgress({ stage: 'load', loaded: 0, total: 0 });
      } catch (progressError) {
        // ignore
      }
    }
    let activeLoadingTask = null;

    try {
      const pdfjsLib = await ensurePdfjs();
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return null;
      }
      const shouldDisableWorker = window.origin === 'null';
      const createTask = (options) => {
        const task = pdfjsLib.getDocument(options);
        task.onProgress = (progress) => {
          if (!progress || typeof progress.loaded !== 'number') {
            return;
          }
          if (typeof onProgress === 'function') {
            try {
              onProgress({
                stage: 'download',
                loaded: progress.loaded,
                total: typeof progress.total === 'number' ? progress.total : 0,
              });
            } catch (progressError) {
              // Прогресс интерфейса не должен останавливать загрузку.
            }
          }
        };
        return task;
      };
      const waitForDocument = (task) => new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          const timeoutError = new Error('pdf_document_open_timeout');
          timeoutError.code = 'pdf_document_open_timeout';
          reject(timeoutError);
        }, PDF_DOCUMENT_OPEN_TIMEOUT_MS);
        task.promise.then(
          (documentProxy) => {
            window.clearTimeout(timeoutId);
            resolve(documentProxy);
          },
          (error) => {
            window.clearTimeout(timeoutId);
            reject(error);
          },
        );
      });

      const safeData = data && typeof data.slice === 'function' ? data.slice(0) : data;
      let withCredentials = true;
      try {
        withCredentials = new URL(url, window.location.href).origin === window.location.origin;
      } catch (error) {
        // Относительный URL относится к текущему домену и использует авторизацию BIMMAX.
      }
      const baseOptions = safeData ? { data: safeData } : { url, withCredentials };
      if (shouldDisableWorker) {
        baseOptions.disableWorker = true;
      }
      let task = createTask(baseOptions);
      activeLoadingTask = task;
      pdfRenderState.loadingTask = task;
      let doc;
      try {
        doc = await waitForDocument(task);
      } catch (error) {
        if (shouldDisableWorker || !isPdfWorkerFailure(error)) {
          throw error;
        }
        logPdfEvent('pdfjs:disable_worker', {
          url,
          reason: error && error.message ? error.message : String(error),
        });
        task = createTask({ ...baseOptions, disableWorker: true });
        activeLoadingTask = task;
        pdfRenderState.loadingTask = task;
        doc = await waitForDocument(task);
      }
      if (currentLoadToken !== pdfRenderState.loadToken) {
        if (pdfRenderState.loadingTask === activeLoadingTask) {
          pdfRenderState.loadingTask = null;
        }
        if (doc && typeof doc.destroy === 'function') {
          doc.destroy();
        }
        return null;
      }
      if (pdfRenderState.loadingTask === activeLoadingTask) {
        pdfRenderState.loadingTask = null;
      }
      destroyPdfDocument();
      pdfRenderState.doc = doc;
      pdfRenderState.loading = false;
      const layoutReady = await waitForPdfLayout();
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return null;
      }
      if (!layoutReady) {
        logPdfEvent('layout:fail', { url, metrics: getPdfLayoutMetrics() });
        return false;
      }
      if (typeof onProgress === 'function') {
        try {
          onProgress({ stage: 'render_start', totalPages: doc.numPages });
        } catch (progressError) {
          // ignore
        }
      }
      const rendered = await renderPdfPages(onProgress);
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return null;
      }
      const hasVisibleContent = rendered || (pdfRenderState.renderedPages > 0);
      const hasCompleteContent = pdfRenderState.totalPages > 0
        && pdfRenderState.renderedPages === pdfRenderState.totalPages;
      pdfZoomState.useCanvas = hasVisibleContent;
      updateZoomControls();
      if (hasVisibleContent && !hasCompleteContent) {
        appendPdfCanvasActionMessage('Показана часть PDF. Откройте файл полностью в новой вкладке.', {
          actionLabel: 'Открыть полностью',
          onAction: () => {
            window.open(url, '_blank', 'noopener');
          },
        });
      }
      logPdfEvent('загрузка:успех', {
        url,
        pages: doc.numPages,
        rendered,
        renderedPages: pdfRenderState.renderedPages,
        totalPages: pdfRenderState.totalPages,
        complete: hasCompleteContent,
        hasVisibleContent,
        hasData: Boolean(data),
      });
      return hasVisibleContent;
    } catch (error) {
      if (pdfRenderState.loadingTask === activeLoadingTask) {
        pdfRenderState.loadingTask = null;
      }
      if (activeLoadingTask && typeof activeLoadingTask.destroy === 'function') {
        try {
          const destroyResult = activeLoadingTask.destroy();
          if (destroyResult && typeof destroyResult.catch === 'function') {
            destroyResult.catch(() => {});
          }
        } catch (destroyError) {
          // ignore
        }
      }
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return null;
      }
      pdfRenderState.loading = false;
      pdfZoomState.useCanvas = false;
      logPdfEvent('загрузка:ошибка', {
        url,
        hasData: Boolean(data),
        message: error && error.message ? error.message : String(error),
      });
      if (typeof onProgress === 'function') {
        try {
          onProgress({
            stage: 'error',
            message: error && error.message ? error.message : String(error),
          });
        } catch (progressError) {
          // ignore
        }
      }
      return false;
    }
  }

  function adjustPdfZoom(delta) {
    if (!pdfZoomState.active) {
      return;
    }
    if (pdfZoomState.fit) {
      pdfZoomState.fit = false;
      const detected = getPdfZoomFromUrl(elements.frame ? elements.frame.getAttribute('src') : '');
      pdfZoomState.zoom = Number.isFinite(detected) ? detected : 100;
    }
    const nextZoom = clamp(pdfZoomState.zoom + delta, PDF_ZOOM_MIN, PDF_ZOOM_MAX);
    if (nextZoom === pdfZoomState.zoom) {
      return;
    }
    pdfZoomState.zoom = nextZoom;
    if (pdfZoomState.useCanvas) {
      applyPdfZoomWithoutRerender();
    } else {
      capturePdfFramePosition();
      setPdfZoom(`${Math.round(pdfZoomState.zoom)}`);
    }
    updateZoomControls();
  }

  function setPdfZoomByScale(distanceRatio, anchorPoint = null) {
    if (!pdfZoomState.active) {
      return;
    }
    if (pdfZoomState.fit) {
      pdfZoomState.fit = false;
      const detected = getPdfZoomFromUrl(elements.frame ? elements.frame.getAttribute('src') : '');
      pdfZoomState.zoom = Number.isFinite(detected) ? detected : 100;
    }
    const baseZoom = zoomState.startScale || pdfZoomState.zoom;
    const nextZoom = clamp(baseZoom * distanceRatio, PDF_ZOOM_MIN, PDF_ZOOM_MAX);
    if (nextZoom === pdfZoomState.zoom) {
      return;
    }
    pdfZoomState.zoom = nextZoom;
    if (pdfZoomState.useCanvas) {
      applyPdfZoomWithoutRerender(anchorPoint);
    } else {
      capturePdfFramePosition();
      setPdfZoom(`${Math.round(pdfZoomState.zoom)}`);
    }
    updateZoomControls();
  }

  function setZoomScale(nextScale) {
    zoomState.scale = clamp(nextScale, getZoomMinScale(), ZOOM_MAX);
    if (zoomState.scale <= ZOOM_MIN) {
      zoomState.translateX = 0;
      zoomState.translateY = 0;
    } else if (elements.surface && zoomState.translateX === 0 && zoomState.translateY === 0) {
      const rect = elements.surface.getBoundingClientRect();
      zoomState.translateX = -(rect.width * (zoomState.scale - 1)) / 2;
      zoomState.translateY = -(rect.height * (zoomState.scale - 1)) / 2;
    }
    const clamped = clampTranslate(zoomState.translateX, zoomState.translateY);
    zoomState.translateX = clamped.x;
    zoomState.translateY = clamped.y;
    applyZoomTransform();
    updateZoomLayout();
    updateZoomControls();
  }

  function applyFrameZoom(scaleValue) {
    if (!elements.frame) {
      return;
    }
    if (isWordOfficeFrameActive()) {
      applyWordOfficeFrameZoomLayout(getWordOfficeFrameZoom());
      return;
    }
    setZoomScale(scaleValue);
  }

  function adjustFrameZoom(deltaScale) {
    if (adjustWordOfficeFrameZoom(deltaScale > 0 ? OFFICE_FRAME_ZOOM_STEP : -OFFICE_FRAME_ZOOM_STEP)) {
      return;
    }
    applyFrameZoom(zoomState.scale + deltaScale);
  }

  function resetFrameTransform() {
    if (!elements.frame) {
      return;
    }
    if (isWordOfficeFrameActive()) {
      resetWordOfficeFrameToWidth({ resetScroll: true });
      return;
    }
    elements.frame.style.transform = 'none';
    resetImageTransform();
  }

  function zoomStep(delta) {
    setZoomScale(zoomState.scale + delta);
  }

  function hideViewer() {
    if (!elements.container) {
      return;
    }
    elements.container.setAttribute(ACTIVE_ATTR, 'false');
    elements.container.removeAttribute('data-viewer-mode');
    elements.container.hidden = true;
    applyBodyLock(false);
    teardownPdfResizeObserver();
    if (elements.frame) {
      elements.frame.removeAttribute('src');
      clearFrameCssTransform();
    }
    pdfZoomState.active = false;
    pdfZoomState.fit = true;
    pdfZoomState.zoom = 100;
    pdfZoomState.useCanvas = false;
    cancelActivePdfLoad('viewer_closed');
    clearPdfCanvas();
    if (elements.image) {
      if (typeof cleanupImageLoadListeners === 'function') {
        cleanupImageLoadListeners();
      }
      if (typeof resolveImageLoad === 'function') {
        resolveImageLoad(false);
      }
      imageLoadPromise = null;
      resolveImageLoad = null;
      cleanupImageLoadListeners = null;
      elements.image.removeAttribute('src');
      elements.image.removeAttribute('alt');
      elements.image.hidden = true;
      elements.image.classList.remove('is-active');
      resetImageTransform();
    }
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      try {
        lastActiveElement.focus({ preventScroll: true });
      } catch (error) {
        lastActiveElement.focus();
      }
    }
    lastActiveElement = null;
  }

  function showViewer(url, title, options = {}, data) {
    if (!elements.container || !elements.frame) {
      return false;
    }

    const resolvedUrl = resolveUrl(url);
    if (!resolvedUrl) {
      return false;
    }

    resetViewerContent();

    const wantsPdf = Boolean(options && options.isPdf);
    const forceFrame = Boolean(options && options.forceFrame);
    const kind = forceFrame
      ? 'frame'
      : wantsPdf
        ? 'pdf'
        : (options && options.kind === 'image'
          ? 'image'
          : (options && options.kind === 'video' ? 'video' : 'frame'));
    const skipPdfLoad = Boolean(options && options.skipPdfLoad);
    const isPdf = wantsPdf && !forceFrame;
    const sourceProgressCallback = typeof options.onProgress === 'function' ? options.onProgress : null;
    let reportPdfProgress = null;
    if (isPdf && sourceProgressCallback) {
      reportPdfProgress = (progress) => {
        if (pdfRenderState.progressCallback !== reportPdfProgress) {
          return;
        }
        try {
          sourceProgressCallback(progress);
        } finally {
          const stage = progress && progress.stage ? progress.stage : '';
          if (['ready', 'fallback_ready', 'fallback_timeout', 'fallback_failed', 'cancelled'].includes(stage)
            && pdfRenderState.progressCallback === reportPdfProgress) {
            pdfRenderState.progressCallback = null;
          }
        }
      };
      pdfRenderState.progressCallback = reportPdfProgress;
    }
    const pdfFallbackUrl = resolveUrl(options && options.fallbackUrl ? options.fallbackUrl : '') || resolvedUrl;
    const frameFileName = options && options.fileName ? options.fileName : title;
    const frameFileExtension = options && options.extension ? options.extension : '';

    lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    elements.container.hidden = false;
    elements.container.setAttribute(ACTIVE_ATTR, 'true');
    applyBodyLock(true);

    if (elements.title) {
      const label = title && String(title).trim() ? String(title).trim() : 'Документ';
      elements.title.textContent = label;
    }

    pdfZoomState.active = kind !== 'image' && isPdf;
    pdfZoomState.fit = true;
    pdfZoomState.zoom = getPdfZoomFromUrl(resolvedUrl) || 100;
    pdfZoomState.useCanvas = false;
    if (pdfZoomState.active) {
      logPdfEvent('открытие', {
        url: resolvedUrl,
        title,
        zoom: pdfZoomState.zoom,
        kind,
        skipPdfLoad,
        hasFrame: Boolean(elements.frame),
      });
      logPdfEvent('layout:open', getPdfLayoutMetrics());
      setupPdfResizeObserver();
    }
    const activateFrameFallback = (fallbackUrl, reason) => {
      if (!elements.frame) {
        return false;
      }
      if (reportPdfProgress) {
        let fallbackSettled = false;
        const finishFallback = (stage) => {
          if (fallbackSettled) {
            return;
          }
          fallbackSettled = true;
          window.clearTimeout(fallbackTimeoutId);
          elements.frame.removeEventListener('load', handleFallbackLoad);
          try {
            reportPdfProgress({ stage, reason: reason || 'canvas_unavailable' });
          } catch (progressError) {
            // ignore
          }
        };
        const handleFallbackLoad = () => finishFallback('fallback_ready');
        const fallbackTimeoutId = window.setTimeout(
          () => finishFallback('fallback_timeout'),
          PDF_FRAME_FALLBACK_TIMEOUT_MS,
        );
        elements.frame.addEventListener('load', handleFallbackLoad, { once: true });
      }
      const fallbackTitle = title ? `Просмотр: ${title}` : 'Просмотр документа';
      const frameUrl = wantsPdf ? buildPdfUrlWithZoom(fallbackUrl, 'page-fit', null) : fallbackUrl;
      setFrameFileContext(frameFileName, frameFileExtension);
      elements.frame.setAttribute('src', frameUrl);
      elements.frame.setAttribute('title', fallbackTitle);
      if (elements.image) {
        elements.image.removeAttribute('src');
        elements.image.removeAttribute('alt');
      }
      setViewerMode('frame');
      pdfZoomState.active = false;
      pdfZoomState.useCanvas = false;
      updateZoomControls();
      return true;
    };

    if (kind === 'image' && elements.image) {
      imageLoadPromise = new Promise((resolve) => {
        resolveImageLoad = resolve;
      });
      const finishImageLoad = (loaded) => {
        if (typeof cleanupImageLoadListeners === 'function') {
          cleanupImageLoadListeners();
        }
        cleanupImageLoadListeners = null;
        if (typeof resolveImageLoad === 'function') {
          resolveImageLoad(Boolean(loaded));
        }
        resolveImageLoad = null;
      };
      const handleImageLoad = () => finishImageLoad(true);
      const handleImageError = () => finishImageLoad(false);
      const imageLoadTimeoutId = window.setTimeout(() => finishImageLoad(false), IMAGE_LOAD_TIMEOUT_MS);
      cleanupImageLoadListeners = () => {
        window.clearTimeout(imageLoadTimeoutId);
        elements.image.removeEventListener('load', handleImageLoad);
        elements.image.removeEventListener('error', handleImageError);
      };
      elements.image.addEventListener('load', handleImageLoad, { once: true });
      elements.image.addEventListener('error', handleImageError, { once: true });
      elements.image.setAttribute('src', resolvedUrl);
      elements.image.setAttribute('alt', title ? `Просмотр: ${title}` : 'Просмотр документа');
      elements.image.setAttribute('draggable', 'false');
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      setViewerMode('image');
    } else if (kind === 'video' && elements.video) {
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      if (elements.image) {
        elements.image.removeAttribute('src');
        elements.image.removeAttribute('alt');
      }
      elements.video.setAttribute('src', resolvedUrl);
      elements.video.setAttribute('controls', '');
      elements.video.setAttribute('playsinline', '');
      elements.video.load();
      setViewerMode('video');
    } else if (pdfZoomState.active && elements.pdf && elements.pdfCanvas) {
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      if (elements.image) {
        elements.image.removeAttribute('src');
        elements.image.removeAttribute('alt');
      }
      setViewerMode('pdf');
      if (skipPdfLoad) {
        const isLoadingOnly = Boolean(options && options.loadingOnly);
        setPdfCanvasMessage(
          isLoadingOnly
            ? (options.loadingMessage || 'Файл загружается...')
            : 'Не удалось открыть PDF. Откройте файл в новой вкладке.',
          isLoadingOnly
            ? { variant: 'loader' }
            : {
              variant: 'message',
              actionLabel: 'Открыть в новой вкладке',
              onAction: () => {
                window.open(resolvedUrl, '_blank', 'noopener');
              },
            },
        );
      } else {
        const fallbackToMessage = () => {
          pdfZoomState.useCanvas = false;
          updateZoomControls();
          setPdfCanvasMessage('Не удалось отрисовать PDF. Откройте файл в новой вкладке.', {
            variant: 'message',
            actionLabel: 'Открыть в новой вкладке',
            onAction: () => {
              window.open(resolvedUrl, '_blank', 'noopener');
            },
          });
        };
        const fallbackToFrame = (reason) => {
          const switched = activateFrameFallback(pdfFallbackUrl, reason);
          if (reportPdfProgress) {
            try {
              reportPdfProgress({
                stage: switched ? 'fallback' : 'fallback_failed',
                reason: reason || 'canvas_unavailable',
              });
            } catch (progressError) {
              // ignore
            }
          }
          if (!switched) {
            fallbackToMessage();
          }
          return switched;
        };
        pdfRenderState.loadPromise = loadPdfDocument(resolvedUrl, data, reportPdfProgress).then((loaded) => {
          if (loaded) {
            return true;
          }
          if (loaded === null) {
            return false;
          }
          const { isIos } = detectMobilePlatform();
          const fallbackReason = pdfRenderState.renderStatus === 'empty'
            ? 'canvas_empty'
            : (isIos ? 'ios_canvas_incomplete' : 'canvas_incomplete');
          const switched = fallbackToFrame(fallbackReason);
          if (!switched) {
            fallbackToMessage();
          }
          return false;
        }).catch(() => {
          const switched = fallbackToFrame('canvas_error');
          if (!switched) {
            fallbackToMessage();
          }
          return false;
        });
      }
    } else {
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      const targetUrl = wantsPdf ? buildPdfUrlWithZoom(resolvedUrl, 'page-fit', null) : resolvedUrl;
      if (wantsPdf && !forceFrame) {
        setViewerMode('pdf');
        setPdfCanvasMessage('Не удалось открыть PDF. Откройте файл в новой вкладке.', {
          variant: 'message',
          actionLabel: 'Открыть в новой вкладке',
          onAction: () => {
            window.open(targetUrl, '_blank', 'noopener');
          },
        });
      } else {
        setFrameFileContext(frameFileName, frameFileExtension);
        elements.frame.setAttribute('src', targetUrl);
        elements.frame.setAttribute('title', title ? `Просмотр: ${title}` : 'Просмотр документа');
        if (elements.image) {
          elements.image.removeAttribute('src');
          elements.image.removeAttribute('alt');
        }
        setViewerMode('frame');
      }
    }

    const primary = elements.closeButtons && elements.closeButtons.length
      ? elements.closeButtons[0]
      : elements.dialog;

    if (primary && typeof primary.focus === 'function') {
      const focusAction = () => {
        try {
          primary.focus({ preventScroll: true });
        } catch (error) {
          primary.focus();
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(focusAction);
      } else {
        focusAction();
      }
    }

    return true;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && elements.container && elements.container.getAttribute(ACTIVE_ATTR) === 'true') {
      event.preventDefault();
      hideViewer();
    } else if (event.key === 'Tab') {
      focusTrap(event);
    }
  }

  function handleBackdrop(event) {
    if (!elements.dialog) {
      hideViewer();
      return;
    }
    if (!elements.dialog.contains(event.target)) {
      hideViewer();
    }
  }

  function getPointerPosition(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function getPointerDistance(first, second) {
    const dx = first.x - second.x;
    const dy = first.y - second.y;
    return Math.hypot(dx, dy);
  }

  function logViewerEarlyExit(reason, event) {
    logPdfEvent('input:skip', {
      reason,
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventType: event && event.type ? event.type : '',
      eventTargetTag: event && event.target && event.target.tagName ? event.target.tagName : '',
    });
  }

  function handlePointerDown(event) {
    const target = getZoomTarget();
    const isPdfMode = viewerMode === 'pdf';
    const isPdfPinch = isPdfMode && pdfZoomState.active;
    const isWordOfficeFrame = viewerMode === 'frame' && isWordOfficeFrameActive();
    if (!target) {
      logViewerEarlyExit('target=null', event);
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (isWordOfficeFrame) {
      return;
    }
    if (event.cancelable && !isPdfMode) {
      event.preventDefault();
    }
    const point = getPointerPosition(event);
    zoomState.pointers.set(event.pointerId, point);
    const captureTarget = event.currentTarget && typeof event.currentTarget.setPointerCapture === 'function'
      ? event.currentTarget
      : target;
    if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
      try {
        captureTarget.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Некоторые Telegram WebView не разрешают capture на первом touch-событии.
      }
    }

    if (zoomState.pointers.size === 1) {
      zoomState.startPointer = point;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
      if (isPdfMode && elements.pdfCanvas) {
        zoomState.startScrollLeft = elements.pdfCanvas.scrollLeft;
        zoomState.startScrollTop = elements.pdfCanvas.scrollTop;
      }
    } else if (zoomState.pointers.size === 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      zoomState.startDistance = getPointerDistance(first, second);
      zoomState.startScale = isPdfPinch ? pdfZoomState.zoom : zoomState.scale;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
      zoomState.startCenter = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      if (isPdfPinch && event.cancelable) {
        event.preventDefault();
      }
    }
  }

  function handlePointerMove(event) {
    const target = getZoomTarget();
    const isPdfScrollMode = pdfZoomState.active && !zoomState.enabled;
    const isPdfMode = viewerMode === 'pdf';
    const isPdfPinch = isPdfMode && pdfZoomState.active;
    const isWordOfficeFrame = viewerMode === 'frame' && isWordOfficeFrameActive();
    if (!target) {
      logViewerEarlyExit('target=null', event);
      return;
    }
    if (isWordOfficeFrame) {
      return;
    }
    if (!zoomState.pointers.has(event.pointerId)) {
      logViewerEarlyExit('pointer not tracked', event);
      return;
    }
    const point = getPointerPosition(event);
    zoomState.pointers.set(event.pointerId, point);

    if (isPdfPinch && zoomState.pointers.size >= 2) {
      if (event.cancelable) {
        event.preventDefault();
      }
      const [first, second] = Array.from(zoomState.pointers.values());
      const distance = getPointerDistance(first, second);
      if (!zoomState.startDistance) {
        return;
      }
      const distanceRatio = distance / zoomState.startDistance;
      setPdfZoomByScale(distanceRatio, {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      });
      return;
    }

    if (isPdfMode) {
      if (event.cancelable) {
        event.preventDefault();
      }
      if (elements.pdfCanvas) {
        elements.pdfCanvas.scrollLeft = zoomState.startScrollLeft - (point.x - zoomState.startPointer.x);
        elements.pdfCanvas.scrollTop = zoomState.startScrollTop - (point.y - zoomState.startPointer.y);
      }
      return;
    }

    if (event.cancelable && !isPdfMode && !isPdfScrollMode
      && (zoomState.pointers.size > 1 || zoomState.scale > ZOOM_MIN)) {
      event.preventDefault();
    }

    if (zoomState.pointers.size === 1 && isImagePanAvailable()) {
      const dx = point.x - zoomState.startPointer.x;
      const dy = point.y - zoomState.startPointer.y;
      const nextTranslateX = zoomState.startTranslateX + dx;
      const nextTranslateY = zoomState.startTranslateY + dy;
      const clamped = clampTranslate(nextTranslateX, nextTranslateY);
      zoomState.translateX = clamped.x;
      zoomState.translateY = clamped.y;
      applyZoomTransform();
      updateZoomControls();
      return;
    }

    if (zoomState.pointers.size >= 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      const distance = getPointerDistance(first, second);
      if (!zoomState.startDistance) {
        return;
      }
      const nextScale = clamp(zoomState.startScale * (distance / zoomState.startDistance), getZoomMinScale(), ZOOM_MAX);
      const center = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      zoomState.scale = nextScale;
      const nextTranslateX = zoomState.startTranslateX + (center.x - zoomState.startCenter.x);
      const nextTranslateY = zoomState.startTranslateY + (center.y - zoomState.startCenter.y);
      const clamped = clampTranslate(nextTranslateX, nextTranslateY);
      zoomState.translateX = clamped.x;
      zoomState.translateY = clamped.y;
      applyZoomTransform();
      updateZoomControls();
    }
  }

  function handlePointerEnd(event) {
    const target = getZoomTarget();
    if (!target) {
      logViewerEarlyExit('target=null', event);
      return;
    }
    if (zoomState.pointers.has(event.pointerId)) {
      zoomState.pointers.delete(event.pointerId);
    }
    if (isWordOfficeFrameActive()) {
      return;
    }
    if (viewerMode === 'pdf' && zoomState.pointers.size === 1 && elements.pdfCanvas) {
      const remainingPoint = Array.from(zoomState.pointers.values())[0];
      zoomState.startPointer = remainingPoint;
      zoomState.startScrollLeft = elements.pdfCanvas.scrollLeft;
      zoomState.startScrollTop = elements.pdfCanvas.scrollTop;
    }
    if (viewerMode !== 'frame' && zoomState.pointers.size === 0 && zoomState.scale <= ZOOM_MIN) {
      resetImageTransform();
    }
  }

  const mouseDragState = {
    active: false,
    startPoint: { x: 0, y: 0 },
    startTranslateX: 0,
    startTranslateY: 0,
  };

  function handleMouseDown(event) {
    const target = getZoomTarget();
    const button = typeof event.button === 'number' ? event.button : null;
    if (!target || button !== 0) {
      if (!target) {
        logViewerEarlyExit('target=null', event);
      }
      return;
    }
    if (isWordOfficeFrameActive()) {
      return;
    }
    if (event.cancelable && viewerMode !== 'pdf') {
      event.preventDefault();
    }
    mouseDragState.active = true;
    mouseDragState.startPoint = getPointerPosition(event);
    mouseDragState.startTranslateX = zoomState.translateX;
    mouseDragState.startTranslateY = zoomState.translateY;
  }

  function handleMouseMove(event) {
    const target = getZoomTarget();
    const panAvailable = isImagePanAvailable();
    const hasPrimary = (event.buttons & 1) === 1;
    const point = getPointerPosition(event);
    const dx = mouseDragState.active ? point.x - mouseDragState.startPoint.x : 0;
    const dy = mouseDragState.active ? point.y - mouseDragState.startPoint.y : 0;
    if (!target || !hasPrimary || !mouseDragState.active) {
      if (!target) {
        logViewerEarlyExit('target=null', event);
      }
      if (!hasPrimary) {
        mouseDragState.active = false;
      }
      return;
    }
    if (isWordOfficeFrameActive()) {
      mouseDragState.active = false;
      return;
    }
    if (event.cancelable && (zoomState.scale > ZOOM_MIN || panAvailable)) {
      event.preventDefault();
    }
    if (panAvailable) {
      const nextTranslateX = mouseDragState.startTranslateX + dx;
      const nextTranslateY = mouseDragState.startTranslateY + dy;
      const clamped = clampTranslate(nextTranslateX, nextTranslateY);
      zoomState.translateX = clamped.x;
      zoomState.translateY = clamped.y;
      applyZoomTransform();
      updateZoomControls();
    }
  }

  function handleMouseUp(event) {
    const target = getZoomTarget();
    if (!target) {
      logViewerEarlyExit('target=null', event);
    }
    if (!mouseDragState.active) {
      return;
    }
    mouseDragState.active = false;
    if (viewerMode !== 'frame' && zoomState.scale <= ZOOM_MIN) {
      resetImageTransform();
    }
  }

  function updateTouchPointers(touches) {
    zoomState.pointers.clear();
    Array.from(touches).forEach((touch) => {
      zoomState.pointers.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    });
  }

  function handleTouchStart(event) {
    const target = getZoomTarget();
    const isPdfMode = viewerMode === 'pdf';
    const isPdfPinch = isPdfMode && pdfZoomState.active;
    const isWordOfficeFrame = viewerMode === 'frame' && isWordOfficeFrameActive();
    if (!target) {
      return;
    }
    if (isWordOfficeFrame) {
      return;
    }
    if (event.cancelable && (!isPdfMode || (isPdfPinch && event.touches.length > 1))) {
      event.preventDefault();
    }
    updateTouchPointers(event.touches);

    if (zoomState.pointers.size === 1) {
      const point = Array.from(zoomState.pointers.values())[0];
      zoomState.startPointer = point;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
      if (isPdfMode && elements.pdfCanvas) {
        zoomState.startScrollLeft = elements.pdfCanvas.scrollLeft;
        zoomState.startScrollTop = elements.pdfCanvas.scrollTop;
      }
    } else if (zoomState.pointers.size >= 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      zoomState.startDistance = getPointerDistance(first, second);
      zoomState.startScale = isPdfPinch ? pdfZoomState.zoom : zoomState.scale;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
      zoomState.startCenter = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
    }
  }

  function handleTouchMove(event) {
    const target = getZoomTarget();
    const isPdfScrollMode = pdfZoomState.active && !zoomState.enabled;
    const isPdfMode = viewerMode === 'pdf';
    const isPdfPinch = isPdfMode && pdfZoomState.active && event.touches.length > 1;
    const isWordOfficeFrame = viewerMode === 'frame' && isWordOfficeFrameActive();
    if (!target) {
      return;
    }
    if (isWordOfficeFrame) {
      return;
    }
    if (event.cancelable && (
      isPdfMode
      || (!isPdfMode && !isPdfScrollMode && (event.touches.length > 1 || zoomState.scale > ZOOM_MIN))
    )) {
      event.preventDefault();
    }
    updateTouchPointers(event.touches);

    if (isPdfPinch && zoomState.pointers.size >= 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      const distance = getPointerDistance(first, second);
      if (!zoomState.startDistance) {
        return;
      }
      setPdfZoomByScale(distance / zoomState.startDistance, {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      });
      return;
    }

    if (isPdfMode) {
      if (event.touches.length === 1 && elements.pdfCanvas) {
        const point = Array.from(zoomState.pointers.values())[0];
        elements.pdfCanvas.scrollLeft = zoomState.startScrollLeft - (point.x - zoomState.startPointer.x);
        elements.pdfCanvas.scrollTop = zoomState.startScrollTop - (point.y - zoomState.startPointer.y);
      }
      return;
    }

    if (zoomState.pointers.size === 1 && isImagePanAvailable()) {
      const point = Array.from(zoomState.pointers.values())[0];
      const dx = point.x - zoomState.startPointer.x;
      const dy = point.y - zoomState.startPointer.y;
      const nextTranslateX = zoomState.startTranslateX + dx;
      const nextTranslateY = zoomState.startTranslateY + dy;
      const clamped = clampTranslate(nextTranslateX, nextTranslateY);
      zoomState.translateX = clamped.x;
      zoomState.translateY = clamped.y;
      applyZoomTransform();
      updateZoomControls();
      return;
    }

    if (zoomState.pointers.size >= 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      const distance = getPointerDistance(first, second);
      if (!zoomState.startDistance) {
        return;
      }
      const nextScale = clamp(zoomState.startScale * (distance / zoomState.startDistance), getZoomMinScale(), ZOOM_MAX);
      const center = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      zoomState.scale = nextScale;
      const nextTranslateX = zoomState.startTranslateX + (center.x - zoomState.startCenter.x);
      const nextTranslateY = zoomState.startTranslateY + (center.y - zoomState.startCenter.y);
      const clamped = clampTranslate(nextTranslateX, nextTranslateY);
      zoomState.translateX = clamped.x;
      zoomState.translateY = clamped.y;
      applyZoomTransform();
      updateZoomControls();
    }
  }

  function handleTouchEnd(event) {
    const target = getZoomTarget();
    if (!target) {
      return;
    }
    if (isWordOfficeFrameActive()) {
      zoomState.pointers.clear();
      return;
    }
    updateTouchPointers(event.touches);
    if (zoomState.pointers.size === 1) {
      const point = Array.from(zoomState.pointers.values())[0];
      zoomState.startPointer = point;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
      if (viewerMode === 'pdf' && elements.pdfCanvas) {
        zoomState.startScrollLeft = elements.pdfCanvas.scrollLeft;
        zoomState.startScrollTop = elements.pdfCanvas.scrollTop;
      }
    }
    if (viewerMode !== 'frame' && zoomState.pointers.size === 0 && zoomState.scale <= ZOOM_MIN) {
      resetImageTransform();
    }
  }

  function handleWheel(event) {
    if (event && event.__appdoscViewerHandled) {
      return;
    }
    if (event) {
      event.__appdoscViewerHandled = true;
    }
    const viewerActive = isViewerActive();
    if (!viewerActive) {
      logViewerEarlyExit('viewerActive=false', event);
      return;
    }
    const isPdfView = pdfZoomState.active && !zoomState.enabled;
    if (isPdfView) {
      if (elements.pdfCanvas) {
        const scrollFactor = event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? elements.pdfCanvas.clientHeight
            : 1;
        const deltaY = event.deltaY * scrollFactor;
        if (event.cancelable) {
          event.preventDefault();
        }
        if (deltaY !== 0) {
          elements.pdfCanvas.scrollTop += deltaY;
        }
      }
      return;
    }
    if (viewerMode === 'frame' && isWordOfficeFrameActive()) {
      return;
    }
    if (zoomState.enabled) {
      const scrollFactor = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? (elements.surface ? elements.surface.clientHeight : 1)
          : 1;
      const deltaX = (event.deltaX || 0) * scrollFactor;
      const deltaY = (event.deltaY || 0) * scrollFactor;
      const panAvailable = isImagePanAvailable();
      if (panAvailable && (deltaX || deltaY)) {
        if (event.cancelable) {
          event.preventDefault();
        }
        if (typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        const nextTranslateX = zoomState.translateX - deltaX;
        const nextTranslateY = zoomState.translateY - deltaY;
        const clamped = clampTranslate(nextTranslateX, nextTranslateY);
        zoomState.translateX = clamped.x;
        zoomState.translateY = clamped.y;
        applyZoomTransform();
        updateZoomControls();
      } else if (event.ctrlKey || event.metaKey) {
        if (event.cancelable) {
          event.preventDefault();
        }
      }
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (event.cancelable) {
        event.preventDefault();
      }
    }
  }

  function handleContextMenu(event) {
    if (isViewerActive() && zoomState.enabled && !isWordOfficeFrameActive() && event.cancelable) {
      event.preventDefault();
    }
  }

  function ensureFrameScrollability() {
    if (!elements.frame) {
      return;
    }
    elements.frame.setAttribute('scrolling', 'yes');
    try {
      const doc = elements.frame.contentDocument;
      if (!doc) {
        return;
      }
      const root = doc.documentElement;
      const body = doc.body;
      if (root && root.style) {
        root.style.overflow = 'auto';
        root.style.height = '100%';
      }
      if (body && body.style) {
        body.style.overflow = 'auto';
        body.style.minHeight = '100%';
      }
    } catch (_error) {
      // Cross-origin previews still keep their native iframe scrolling.
    }
  }

  if (elements.frame) {
    elements.frame.addEventListener('load', () => {
      ensureFrameScrollability();
      logPdfEvent('frame:load', { src: elements.frame.getAttribute('src') || '' });
      restorePdfFramePosition();
    });
    elements.frame.addEventListener('error', () => {
      logPdfEvent('frame:error', { src: elements.frame.getAttribute('src') || '' });
    });
  }

  elements.closeButtons.forEach((button) => {
    button.addEventListener('click', hideViewer);
  });

  if (elements.zoomIn) {
    elements.zoomIn.addEventListener('click', (event) => {
      event.preventDefault();
      if (pdfZoomState.active && !zoomState.enabled) {
        adjustPdfZoom(25);
      } else if (viewerMode === 'frame') {
        adjustFrameZoom(0.25);
      } else {
        zoomStep(0.25);
      }
    });
  }

  if (elements.zoomOut) {
    elements.zoomOut.addEventListener('click', (event) => {
      event.preventDefault();
      if (pdfZoomState.active && !zoomState.enabled) {
        adjustPdfZoom(-25);
      } else if (viewerMode === 'frame') {
        adjustFrameZoom(-0.25);
      } else {
        zoomStep(-0.25);
      }
    });
  }

  if (elements.fit) {
    elements.fit.addEventListener('click', (event) => {
      event.preventDefault();
      if (pdfZoomState.active && !zoomState.enabled) {
        pdfZoomState.fit = true;
        pdfZoomState.zoom = 100;
        if (pdfZoomState.useCanvas) {
          clearPdfZoomRenderTimer();
          applyPdfZoomWithoutRerender();
        } else {
          capturePdfFramePosition();
          setPdfZoom('page-fit');
        }
        updateZoomControls();
      } else if (viewerMode === 'frame') {
        resetFrameTransform();
      } else {
        resetImageTransform();
      }
    });
  }

  if (elements.backdrop) {
    elements.backdrop.addEventListener('click', hideViewer);
  }

  if (elements.container) {
    elements.container.addEventListener('click', handleBackdrop);
  }

  function bindPointerEvents(target) {
    if (!target) {
      return;
    }
    target.addEventListener('pointerdown', handlePointerDown);
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerEnd);
    target.addEventListener('pointercancel', handlePointerEnd);
    target.addEventListener('pointerleave', handlePointerEnd);
  }

  bindPointerEvents(elements.surface);

  function bindMouseEvents(target) {
    if (!target || supportsPointerEvents) {
      return;
    }
    target.addEventListener('mousedown', handleMouseDown);
    target.addEventListener('mousemove', handleMouseMove);
    target.addEventListener('mouseup', handleMouseUp);
    target.addEventListener('mouseleave', handleMouseUp);
  }

  bindMouseEvents(elements.surface);

  function bindTouchEvents(target) {
    if (!target || supportsPointerEvents) {
      return;
    }
    target.addEventListener('touchstart', handleTouchStart, { passive: false });
    target.addEventListener('touchmove', handleTouchMove, { passive: false });
    target.addEventListener('touchend', handleTouchEnd);
    target.addEventListener('touchcancel', handleTouchEnd);
  }

  bindTouchEvents(elements.surface);

  function bindWheelEvents(target) {
    if (!target) {
      return;
    }
    target.addEventListener('wheel', handleWheel, { passive: false });
  }

  bindWheelEvents(elements.surface);
  if (elements.surface) {
    elements.surface.addEventListener('contextmenu', handleContextMenu);
  }

  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('resize', () => {
    if (isViewerActive() && pdfZoomState.active && pdfZoomState.useCanvas) {
      clearPdfZoomRenderTimer();
    }
  });

  return {
    open(url, title, options = {}, data) {
      if (showViewer(url, title, options, data)) {
        return 'inline';
      }
      const resolved = resolveUrl(url);
      if (resolved) {
        window.open(resolved, '_blank', 'noopener');
        return 'window';
      }
      return false;
    },
    openHtml(htmlContent, title) {
      if (!elements.container || !elements.html) {
        return false;
      }
      resetViewerContent();
      lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      elements.container.hidden = false;
      elements.container.setAttribute(ACTIVE_ATTR, 'true');
      applyBodyLock(true);
      if (elements.title) {
        const label = title && String(title).trim() ? String(title).trim() : 'Документ';
        elements.title.textContent = label;
      }
      pdfZoomState.active = false;
      elements.html.innerHTML = htmlContent;
      setViewerMode('html');
      updateZoomControls();
      return 'inline';
    },
    close() {
      hideViewer();
    },
    isReady() {
      return Boolean(elements.container && elements.frame);
    },
    getImageLoadPromise() {
      return imageLoadPromise;
    },
    preload() {
      return ensurePdfjs().catch(() => {});
    },
    getPdfRenderStatus() {
      return {
        status: pdfRenderState.renderStatus,
        renderedPages: pdfRenderState.renderedPages,
        totalPages: pdfRenderState.totalPages,
        url: pdfRenderState.lastUrl,
        usingCanvas: pdfZoomState.useCanvas,
      };
    },
    getPageCount() {
      if (pdfRenderState.totalPages > 0) {
        return pdfRenderState.totalPages;
      }
      if (pdfRenderState.doc && typeof pdfRenderState.doc.numPages === 'number') {
        return pdfRenderState.doc.numPages;
      }
      return 0;
    },
    getPdfLoadPromise() {
      return pdfRenderState.loadPromise;
    },
    get _viewerMode() {
      return viewerMode;
    },
  };
}
