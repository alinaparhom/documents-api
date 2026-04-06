const BODY_LOCK_CLASS = 'appdosc--viewer-open';
const ACTIVE_ATTR = 'data-active';
const PDFJS_SOURCES = [
  {
    script: '/js/documents/pdf/pdf.min.js',
    worker: '/js/documents/pdf/pdf.worker.min.js',
  },
];
const PDF_LOG_PREFIX = 'ПДФ';
const PDF_DIAGNOSTIC_EVENT = 'appdosc:pdf-log';
const VIEWER_LOG_PREFIX_DEEP = 'Просмотр2';
const ZOOM_LOG_PREFIX = 'Масштаб';
const SCROLL_LOG_THROTTLE_MS = 900;
const IMAGE_SCROLL_LOG_THROTTLE_MS = 650;
const IMAGE_DRAG_LOG_THROTTLE_MS = 800;
const SCALE_CONSOLE_PREFIX = 'Маштаб2';
const SCALE_CONSOLE_VERBOSE_PREFIX = 'Маштаб3';
const SCALE_CONSOLE_THROTTLE_MS = 220;
const SCALE_CONSOLE_VERBOSE_THROTTLE_MS = 220;
const INPUT_CONSOLE_PREFIX = 'Просмотр2';
const INPUT_CONSOLE_THROTTLE_MS = 240;
const MOUSE_FALLBACK_DELAY_MS = 1500;

let pdfjsPromise = null;
let pointerWarningLogged = false;

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

function logViewerDeep(step, details) {
  if (typeof window === 'undefined') {
    return;
  }
}

function getPlatformDetails() {
  if (typeof window === 'undefined') {
    return { platform: '', navigatorPlatform: '' };
  }
  const telegramPlatform = window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp.platform
    : '';
  const navigatorPlatform = typeof navigator !== 'undefined' && typeof navigator.platform === 'string'
    ? navigator.platform
    : '';
  return {
    platform: telegramPlatform || 'web',
    navigatorPlatform,
  };
}

function logZoomEvent(step, details = {}) {
  if (typeof window === 'undefined') {
    return;
  }
  if (typeof window.__DOCS_PDF_LOGGER__ === 'function') {
    try {
      window.__DOCS_PDF_LOGGER__({
        prefix: ZOOM_LOG_PREFIX,
        step,
        details: { ...details, ...getPlatformDetails() },
        scope: 'zoom',
      });
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
  const cacheVersion = window.__ASSET_VERSION__ || Date.now();

  const loadFromSource = (index) => new Promise((resolve, reject) => {
    if (index >= PDFJS_SOURCES.length) {
      reject(new Error('Не удалось загрузить pdf.js'));
      return;
    }

    const source = PDFJS_SOURCES[index];
    logPdfEvent('pdfjs:load', { source });
    const script = document.createElement('script');
    script.src = `${source.script}${source.script.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheVersion)}`;
    script.async = true;
    script.onload = () => {
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
    };
    script.onerror = () => {
      logPdfEvent('pdfjs:error', { source, reason: 'load_failed' });
      resolve(loadFromSource(index + 1));
    };
    document.head.appendChild(script);
  });

  pdfjsPromise = loadFromSource(0);
  return pdfjsPromise;
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

function applyBodyLock(active) {
  if (typeof document === 'undefined') {
    return;
  }
  if (active) {
    document.body.classList.add(BODY_LOCK_CLASS);
  } else {
    document.body.classList.remove(BODY_LOCK_CLASS);
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
  const elementNameMap = new Map([
    [elements.container, 'container'],
    [elements.surface, 'surface'],
    [elements.zoom, 'zoom'],
    [elements.image, 'image'],
    [elements.video, 'video'],
    [elements.frame, 'frame'],
    [elements.pdfCanvas, 'pdfCanvas'],
    [elements.pdf, 'pdf'],
  ]);

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

  function getElementName(target) {
    if (!target) {
      return 'unknown';
    }
    if (elementNameMap.has(target)) {
      return elementNameMap.get(target);
    }
    let node = target;
    if (typeof Node !== 'undefined' && node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    if (node && typeof node.closest === 'function') {
      for (const [element, name] of elementNameMap.entries()) {
        if (element && element.contains && element.contains(node)) {
          return `${name}/child`;
        }
      }
    }
    if (node && node.tagName) {
      return node.tagName.toLowerCase();
    }
    return 'unknown';
  }

  function getEventPathNames(event) {
    if (!event) {
      return [];
    }
    let path = [];
    if (typeof event.composedPath === 'function') {
      path = event.composedPath();
    } else if (event.target && event.target.parentNode) {
      let node = event.target;
      while (node) {
        path.push(node);
        node = node.parentNode;
      }
    } else if (event.target) {
      path = [event.target];
    }
    if (typeof window !== 'undefined') {
      path.push(window);
    }
    return path
      .filter(Boolean)
      .slice(0, 14)
      .map((node) => {
        if (typeof window !== 'undefined' && node === window) {
          return 'window';
        }
        if (typeof document !== 'undefined') {
          if (node === document) {
            return 'document';
          }
          if (node === document.documentElement) {
            return 'html';
          }
          if (node === document.body) {
            return 'body';
          }
        }
        if (typeof Node !== 'undefined' && node && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          return 'shadow-root';
        }
        return getElementName(node);
      });
  }

  function getTargetVisibilityDetails(target) {
    if (!target || typeof target !== 'object') {
      return {
        targetHidden: null,
        targetOffsetParent: null,
      };
    }
    const hidden = typeof target.hidden === 'boolean' ? target.hidden : null;
    const offsetParent = typeof target.offsetParent !== 'undefined' ? target.offsetParent : null;
    return {
      targetHidden: hidden,
      targetOffsetParent: offsetParent ? getElementName(offsetParent) : null,
    };
  }

  let lastActiveElement = null;
  let pdfResizeObserver = null;
  let lastScrollLogAt = 0;
  let lastImageScrollLogAt = 0;
  let lastImageDragLogAt = 0;
  let lastScaleConsoleWheelAt = 0;
  let lastScaleConsoleDragAt = 0;
  let lastScaleConsoleVerboseWheelAt = 0;
  let lastScaleConsoleVerboseDragAt = 0;
  let lastViewerConsoleWheelAt = 0;
  let lastViewerConsoleDragAt = 0;
  let lastInputConsoleAt = 0;
  let pointerInputSeen = false;
  let mouseFallbackTimer = null;
  let mouseFallbackBound = false;
  let mouseFallbackLogged = false;

  function buildScaleLogDetails(extra = {}) {
    return {
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      pdfActive: pdfZoomState.active,
      scale: zoomState.scale,
      translateX: zoomState.translateX,
      translateY: zoomState.translateY,
      ...getPlatformDetails(),
      ...extra,
    };
  }

  function logScaleConsole(step, details, throttleTarget = 'wheel') {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    const now = Date.now();
    const lastAt = throttleTarget === 'drag' ? lastScaleConsoleDragAt : lastScaleConsoleWheelAt;
    if (now - lastAt < SCALE_CONSOLE_THROTTLE_MS) {
      return;
    }
    if (throttleTarget === 'drag') {
      lastScaleConsoleDragAt = now;
    } else {
      lastScaleConsoleWheelAt = now;
    }
    console.log(`${SCALE_CONSOLE_PREFIX} • ${step}`, details);
  }

  function logScaleConsoleVerbose(step, details, throttleTarget = 'wheel') {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    const now = Date.now();
    const lastAt = throttleTarget === 'drag' ? lastScaleConsoleVerboseDragAt : lastScaleConsoleVerboseWheelAt;
    if (now - lastAt < SCALE_CONSOLE_VERBOSE_THROTTLE_MS) {
      return;
    }
    if (throttleTarget === 'drag') {
      lastScaleConsoleVerboseDragAt = now;
    } else {
      lastScaleConsoleVerboseWheelAt = now;
    }
    console.log(`${SCALE_CONSOLE_VERBOSE_PREFIX} • ${step}`, details);
  }

  function logViewerConsole(step, details, throttleTarget = 'wheel') {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    const now = Date.now();
    const lastAt = throttleTarget === 'drag' ? lastViewerConsoleDragAt : lastViewerConsoleWheelAt;
    if (now - lastAt < SCALE_CONSOLE_VERBOSE_THROTTLE_MS) {
      return;
    }
    if (throttleTarget === 'drag') {
      lastViewerConsoleDragAt = now;
    } else {
      lastViewerConsoleWheelAt = now;
    }
    console.log(`${VIEWER_LOG_PREFIX_DEEP} • ${step}`, details);
  }

  function logInputConsole(step, details = {}, throttle = true) {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    const isDebug = typeof window !== 'undefined' && Boolean(window.__DOCS_VIEWER_DEBUG__);
    if (throttle && !isDebug) {
      const now = Date.now();
      if (now - lastInputConsoleAt < INPUT_CONSOLE_THROTTLE_MS) {
        return;
      }
      lastInputConsoleAt = now;
    }
    console.log(`${INPUT_CONSOLE_PREFIX} • input:${step}`, details);
  }

  function logInputEventSimple(step, event) {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    const target = event && event.currentTarget ? event.currentTarget : null;
    console.log(`${INPUT_CONSOLE_PREFIX} • event:${step}`, {
      type: event && typeof event.type === 'string' ? event.type : '',
      buttons: event && typeof event.buttons === 'number' ? event.buttons : null,
      deltaY: event && typeof event.deltaY === 'number' ? event.deltaY : null,
      currentTarget: {
        tagName: target && target.tagName ? target.tagName : '',
      },
      className: target && typeof target.className === 'string' ? target.className : '',
      viewerMode,
      viewerActive: isViewerActive(),
    });
  }

  if (!elements.container.hasAttribute(ACTIVE_ATTR)) {
    elements.container.setAttribute(ACTIVE_ATTR, 'false');
  }

  function isViewerActive() {
    return Boolean(elements.container && elements.container.getAttribute(ACTIVE_ATTR) === 'true');
  }

  function stopNativeZoom(event) {
    if (!isViewerActive()) {
      return;
    }
    if (event.cancelable && viewerMode !== 'pdf') {
      event.preventDefault();
    }
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
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4;
  const PDF_ZOOM_MIN = 50;
  const PDF_ZOOM_MAX = 400;
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
    pointers: new Map(),
  };
  let lastLoggedZoomScale = ZOOM_MIN;
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
  };
  const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
  if (!supportsPointerEvents && !pointerWarningLogged && typeof console !== 'undefined') {
    pointerWarningLogged = true;
    if (typeof console.warn === 'function') {
      console.warn('Просмотр PDF: PointerEvent недоступен, включен режим mouse/touch.');
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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
    const zoomEnabled = zoomState.enabled || pdfZoomState.active || frameZoomEnabled;

    if (elements.fit) {
      elements.fit.disabled = !zoomEnabled;
    }
    if (elements.zoomIn) {
      elements.zoomIn.disabled = !zoomEnabled
        || (zoomState.enabled && zoomState.scale >= ZOOM_MAX)
        || (pdfZoomState.active && !pdfZoomState.fit && pdfZoomState.zoom >= PDF_ZOOM_MAX);
    }
    if (elements.zoomOut) {
      elements.zoomOut.disabled = !zoomEnabled
        || (zoomState.enabled && zoomState.scale <= ZOOM_MIN)
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
    if (elements.html) {
      elements.html.hidden = !useHtml;
    }
    if (elements.zoom) {
      elements.zoom.hidden = Boolean(usePdf || useHtml);
    }
    if (mode === 'frame') {
      resetFrameTransform();
    } else {
      resetImageTransform();
      if (elements.frame) {
        elements.frame.style.transform = 'none';
      }
    }
  }

  function updateZoomLayout() {
    const zoomed = (zoomState.enabled || viewerMode === 'frame') && zoomState.scale > ZOOM_MIN;
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
    elements.pdfCanvas.innerHTML = '';
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
      if (!pdfZoomState.active || !pdfRenderState.doc) {
        return;
      }
      schedulePdfRerender();
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

  function destroyPdfDocument() {
    if (pdfRenderState.doc && typeof pdfRenderState.doc.destroy === 'function') {
      try {
        pdfRenderState.doc.destroy();
      } catch (error) {
        // ignore
      }
    }
    pdfRenderState.doc = null;
  }

  function resetViewerContent() {
    pdfRenderState.renderToken += 1;
    pdfRenderState.loadToken += 1;
    pdfRenderState.loading = false;
    pdfRenderState.lastUrl = '';
    pdfRenderState.loadPromise = null;
    destroyPdfDocument();
    clearPdfCanvas();
    if (elements.frame) {
      elements.frame.removeAttribute('src');
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
    const { width: containerWidth } = getPdfContainerSize();
    const effectiveWidth = containerWidth || viewport.width;
    if (!effectiveWidth || !viewport.width) {
      return 1;
    }
    return effectiveWidth / viewport.width;
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
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        setTimeout(resolve, 16);
        return;
      }
      window.requestAnimationFrame(() => {
        setTimeout(resolve, 16);
      });
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

  function getPdfScrollContainerInfo(container = getPdfScrollContainer()) {
    if (!container) {
      return null;
    }
    return {
      id: container.id || null,
      className: container.className || null,
      tag: container.tagName || null,
    };
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

  async function renderPdfPagesInternal(forcePixelRatio) {
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
      pdfRenderState.renderStatus = 'layout_failed';
      return false;
    }
    const currentToken = ++pdfRenderState.renderToken;
    const doc = pdfRenderState.doc;
    let renderedPages = 0;
    const basePixelRatio = typeof window !== 'undefined' && window.devicePixelRatio
      ? Math.max(1, window.devicePixelRatio)
      : 1;
    const zoomBoost = pdfZoomState.fit ? 1 : clamp(pdfZoomState.zoom / 100, 1, 2);
    const pixelRatio = typeof forcePixelRatio === 'number' && forcePixelRatio > 0
      ? forcePixelRatio
      : basePixelRatio * zoomBoost;

    const { isMobile, isIos } = detectMobilePlatform();

    // На мобильных устройствах браузеры (особенно iOS Safari) имеют жёсткий лимит на общую
    // память canvas. Снижаем бюджет для надёжного отображения ВСЕХ страниц.
    const MAX_TOTAL_CANVAS_PIXELS_DESKTOP = 48 * 1024 * 1024;
    const MAX_TOTAL_CANVAS_PIXELS_IOS = 12 * 1024 * 1024;
    const MAX_TOTAL_CANVAS_PIXELS_MOBILE = 20 * 1024 * 1024;
    const MAX_TOTAL_CANVAS_PIXELS = isIos
      ? MAX_TOTAL_CANVAS_PIXELS_IOS
      : (isMobile ? MAX_TOTAL_CANVAS_PIXELS_MOBILE : MAX_TOTAL_CANVAS_PIXELS_DESKTOP);

    // Максимальная площадь одного canvas (~16M пикселей — безопасный порог для всех браузеров).
    const MAX_SINGLE_CANVAS_PIXELS = isIos ? 4 * 1024 * 1024 : 16 * 1024 * 1024;
    // Минимальный pixelRatio — ниже этого значения не снижаем (страницы будут размытыми, но видимыми).
    const MIN_PIXEL_RATIO = 0.35;
    let usedCanvasPixels = 0;

    // Предварительная оценка: если страниц много, снижаем pixelRatio заранее,
    // чтобы гарантировать отображение всех страниц.
    let adjustedPixelRatio = pixelRatio;
    if (doc.numPages > 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const samplePage = await doc.getPage(1);
        const sampleFitScale = getPdfFitScale(samplePage);
        const sampleZoomScale = pdfZoomState.fit ? 1 : pdfZoomState.zoom / 100;
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

    let failedPages = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (currentToken !== pdfRenderState.renderToken) {
        pdfRenderState.renderedPages = renderedPages;
        pdfRenderState.totalPages = doc.numPages;
        pdfRenderState.renderStatus = 'canceled';
        return false;
      }
      let pageWrapper = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        const page = await doc.getPage(pageNumber);
        const fitScale = getPdfFitScale(page);
        const zoomScale = pdfZoomState.fit ? 1 : pdfZoomState.zoom / 100;
        const renderScale = fitScale * zoomScale;
        const viewport = page.getViewport({ scale: renderScale });

        // Рассчитываем эффективный pixelRatio с учётом лимитов canvas
        let effectivePixelRatio = adjustedPixelRatio;
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
            originalPixelRatio: adjustedPixelRatio,
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
          // Жёсткий лимит: если даже при MIN_PIXEL_RATIO бюджет превышен более чем в 1.5 раза,
          // пропускаем страницу — браузер может убить все canvas из-за нехватки памяти
          if (usedCanvasPixels + canvasPixels > MAX_TOTAL_CANVAS_PIXELS * 1.5) {
            logPdfEvent('рендер:страница_пропущена', {
              page: pageNumber,
              totalPages: doc.numPages,
              usedCanvasPixels,
              canvasPixels,
              budget: MAX_TOTAL_CANVAS_PIXELS,
              reason: 'hard_budget_limit',
            });
            failedPages += 1;
            continue;
          }
          logPdfEvent('рендер:масштаб_снижен', {
            page: pageNumber,
            originalPixelRatio: adjustedPixelRatio,
            effectivePixelRatio,
            reason: 'total_budget_limit',
            usedCanvasPixels,
            remainingBudget,
          });
        }

        const scaledViewport = page.getViewport({ scale: renderScale * effectivePixelRatio });

        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        pageWrapper = document.createElement('div');
        pageWrapper.className = 'appdosc-pdf-viewer__page';
        pageWrapper.appendChild(canvas);
        elements.pdfCanvas.appendChild(pageWrapper);

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          logPdfEvent('рендер:нет_контекста', { page: pageNumber, canvasW: canvas.width, canvasH: canvas.height, usedCanvasPixels });
          // Удаляем пустой wrapper, чтобы не показывать пустую страницу
          if (pageWrapper.parentNode) {
            pageWrapper.parentNode.removeChild(pageWrapper);
          }
          pageWrapper = null;
          failedPages += 1;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        usedCanvasPixels += canvas.width * canvas.height;
        renderedPages += 1;
        pageWrapper = null;
      } catch (error) {
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

    const firstCanvas = elements.pdfCanvas.querySelector('canvas');
    if (!firstCanvas || !firstCanvas.width || !firstCanvas.height) {
      logPdfEvent('рендер:пусто', {
        metrics: getPdfLayoutMetrics(),
        firstCanvas: firstCanvas ? { width: firstCanvas.width, height: firstCanvas.height } : null,
      });
      pdfRenderState.renderedPages = 0;
      pdfRenderState.totalPages = doc.numPages;
      pdfRenderState.renderStatus = 'empty';
      return false;
    }

    pdfRenderState.renderedPages = renderedPages;
    pdfRenderState.totalPages = doc.numPages;
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
    restorePdfScrollState(scrollState);
    return isComplete;
  }

  async function renderPdfPages() {
    const result = await renderPdfPagesInternal();
    if (result) {
      return true;
    }
    // Если рендер неполный (частичный) — пробуем повторно с минимальным pixelRatio
    if (pdfRenderState.renderStatus === 'partial' && pdfRenderState.doc) {
      logPdfEvent('рендер:повтор_с_минимальным_качеством', {
        renderedPages: pdfRenderState.renderedPages,
        totalPages: pdfRenderState.totalPages,
      });
      const retryResult = await renderPdfPagesInternal(0.5);
      if (retryResult) {
        return true;
      }
      // Ещё одна попытка с ещё более низким качеством
      if (pdfRenderState.renderStatus === 'partial' && pdfRenderState.doc) {
        logPdfEvent('рендер:повтор_ультра_низкое_качество', {
          renderedPages: pdfRenderState.renderedPages,
          totalPages: pdfRenderState.totalPages,
        });
        return renderPdfPagesInternal(0.35);
      }
    }
    return result;
  }

  async function loadPdfDocument(url, data) {
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

    try {
      const pdfjsLib = await ensurePdfjs();
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return false;
      }
      const telegramPlatform = window.Telegram && window.Telegram.WebApp
        ? window.Telegram.WebApp.platform
        : '';
      const isWebPlatform = typeof telegramPlatform === 'string'
        && telegramPlatform.startsWith('web');
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const maxTouchPoints = typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
        ? navigator.maxTouchPoints
        : 0;
      const isIos = /iPad|iPhone|iPod/i.test(userAgent)
        || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
      const shouldDisableWorker = window.origin === 'null' || isWebPlatform || isIos;
      const createTask = (options) => {
        const task = pdfjsLib.getDocument(options);
        const progressState = { logged: 0 };
        task.onProgress = (progress) => {
          if (!progress || typeof progress.loaded !== 'number') {
            return;
          }
          const now = Date.now();
          if (now - progressState.logged < 1200) {
            return;
          }
          progressState.logged = now;
          logPdfEvent('загрузка:прогресс', {
            url,
            loaded: progress.loaded,
            total: typeof progress.total === 'number' ? progress.total : null,
          });
        };
        return task;
      };

      const safeData = data && typeof data.slice === 'function' ? data.slice(0) : data;
      const baseOptions = safeData ? { data: safeData, withCredentials: true } : { url, withCredentials: true };
      if (shouldDisableWorker) {
        baseOptions.disableWorker = true;
      }
      let task = createTask(baseOptions);
      let doc;
      try {
        doc = await task.promise;
      } catch (error) {
        if (!shouldDisableWorker) {
          throw error;
        }
        logPdfEvent('pdfjs:disable_worker', {
          url,
          reason: error && error.message ? error.message : String(error),
        });
        task = createTask({ ...baseOptions, disableWorker: true });
        doc = await task.promise;
      }
      if (currentLoadToken !== pdfRenderState.loadToken) {
        if (doc && typeof doc.destroy === 'function') {
          doc.destroy();
        }
        return false;
      }
      destroyPdfDocument();
      pdfRenderState.doc = doc;
      pdfRenderState.loading = false;
      const layoutReady = await waitForPdfLayout();
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return false;
      }
      if (!layoutReady) {
        logPdfEvent('layout:fail', { url, metrics: getPdfLayoutMetrics() });
        return false;
      }
      const rendered = await renderPdfPages();
      if (currentLoadToken !== pdfRenderState.loadToken) {
        return false;
      }
      const hasVisibleContent = rendered || (pdfRenderState.renderedPages > 0);
      pdfZoomState.useCanvas = hasVisibleContent;
      updateZoomControls();
      logPdfEvent('загрузка:успех', {
        url,
        pages: doc.numPages,
        rendered,
        renderedPages: pdfRenderState.renderedPages,
        hasVisibleContent,
        hasData: Boolean(data),
      });
      return hasVisibleContent;
    } catch (error) {
      pdfRenderState.loading = false;
      pdfZoomState.useCanvas = false;
      setPdfCanvasMessage('Не удалось загрузить PDF. Откройте файл в новой вкладке.', {
        variant: 'message',
        actionLabel: 'Открыть в новой вкладке',
        onAction: () => {
          window.open(url, '_blank', 'noopener');
        },
      });
      logPdfEvent('загрузка:ошибка', {
        url,
        hasData: Boolean(data),
        message: error && error.message ? error.message : String(error),
      });
      return false;
    }
  }

  function schedulePdfRerender() {
    if (!pdfZoomState.useCanvas || !pdfRenderState.doc) {
      return;
    }
    if (pdfRenderState.resizeTimer) {
      window.clearTimeout(pdfRenderState.resizeTimer);
    }
    pdfRenderState.resizeTimer = window.setTimeout(() => {
      renderPdfPages();
    }, 150);
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
    logPdfEvent('масштаб', {
      zoom: pdfZoomState.zoom,
      fit: pdfZoomState.fit,
      scrollContainer: getPdfScrollContainerInfo(),
    });
    logZoomEvent('кнопка', {
      mode: 'pdf',
      delta,
      zoom: pdfZoomState.zoom,
      fit: pdfZoomState.fit,
    });
    if (pdfZoomState.useCanvas) {
      renderPdfPages();
    } else {
      capturePdfFramePosition();
      setPdfZoom(`${Math.round(pdfZoomState.zoom)}`);
    }
    updateZoomControls();
  }

  function setPdfZoomByScale(distanceRatio) {
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
    logPdfEvent('масштаб', {
      zoom: pdfZoomState.zoom,
      fit: pdfZoomState.fit,
      source: 'pinch',
      scrollContainer: getPdfScrollContainerInfo(),
    });
    logZoomEvent('пинч', {
      mode: 'pdf',
      zoom: pdfZoomState.zoom,
      fit: pdfZoomState.fit,
    });
    if (pdfZoomState.useCanvas) {
      renderPdfPages();
    } else {
      capturePdfFramePosition();
      setPdfZoom(`${Math.round(pdfZoomState.zoom)}`);
    }
    updateZoomControls();
  }

  function setZoomScale(nextScale) {
    zoomState.scale = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
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
    setZoomScale(scaleValue);
  }

  function resetFrameTransform() {
    if (!elements.frame) {
      return;
    }
    elements.frame.style.transform = 'none';
    resetImageTransform();
  }

  function zoomStep(delta) {
    setZoomScale(zoomState.scale + delta);
    logScaleConsole('Кнопка:масштаб', {
      delta,
      scale: zoomState.scale,
      translateX: zoomState.translateX,
      translateY: zoomState.translateY,
      ...getPlatformDetails(),
    });
    logZoomEvent('кнопка', {
      mode: 'image',
      delta,
      scale: zoomState.scale,
    });
    lastLoggedZoomScale = zoomState.scale;
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
    }
    pdfZoomState.active = false;
    pdfZoomState.fit = true;
    pdfZoomState.zoom = 100;
    pdfZoomState.useCanvas = false;
    destroyPdfDocument();
    clearPdfCanvas();
    if (elements.image) {
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
    if (mouseFallbackTimer) {
      clearTimeout(mouseFallbackTimer);
      mouseFallbackTimer = null;
    }
    pointerInputSeen = false;
  }

  function scheduleMouseFallback() {
    if (!supportsPointerEvents || mouseFallbackBound || typeof window === 'undefined') {
      return;
    }
    pointerInputSeen = false;
    if (mouseFallbackTimer) {
      clearTimeout(mouseFallbackTimer);
    }
    mouseFallbackTimer = window.setTimeout(() => {
      mouseFallbackTimer = null;
      if (!isViewerActive() || pointerInputSeen || mouseFallbackBound) {
        return;
      }
      const targets = [elements.zoom, elements.image];
      const { platform } = getPlatformDetails();
      targets.forEach((target) => {
        if (!target) {
          return;
        }
        if (!mouseFallbackLogged) {
          logInputConsole('fallback:mouse-bound', { platform, target }, false);
          mouseFallbackLogged = true;
        }
        bindMouseEvents(target, { force: true, reason: 'fallback' });
      });
      mouseFallbackBound = true;
    }, MOUSE_FALLBACK_DELAY_MS);
  }

  function notePointerInput() {
    if (!supportsPointerEvents) {
      return;
    }
    pointerInputSeen = true;
    if (mouseFallbackTimer) {
      clearTimeout(mouseFallbackTimer);
      mouseFallbackTimer = null;
    }
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
    lastInputConsoleAt = 0;

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
    logViewerDeep('viewer:open', {
      url: resolvedUrl,
      title: title || '',
      kind,
      wantsPdf,
      forceFrame,
      skipPdfLoad,
      isPdf,
      hasFrame: Boolean(elements.frame),
      hasCanvas: Boolean(elements.pdfCanvas),
      hasPdfContainer: Boolean(elements.pdf),
    });

    const activateFrameFallback = (fallbackUrl, reason) => {
      if (!elements.frame) {
        return false;
      }
      const fallbackTitle = title ? `Просмотр: ${title}` : 'Просмотр документа';
      elements.frame.setAttribute('src', fallbackUrl);
      elements.frame.setAttribute('title', fallbackTitle);
      if (elements.image) {
        elements.image.removeAttribute('src');
        elements.image.removeAttribute('alt');
      }
      setViewerMode('frame');
      logViewerDeep('viewer:mode:state', {
        mode: viewerMode,
        useImage: viewerMode === 'image' && Boolean(elements.image),
        usePdf: viewerMode === 'pdf' && Boolean(elements.pdf && elements.pdfCanvas),
        forceFrame,
        skipPdfLoad,
        hasZoom: Boolean(elements.zoom),
        hasSurface: Boolean(elements.surface),
        hasImage: Boolean(elements.image),
        hasFrame: Boolean(elements.frame),
      });
      pdfZoomState.active = false;
      pdfZoomState.useCanvas = false;
      updateZoomControls();
      logViewerDeep('viewer:frame_fallback', { url: fallbackUrl, reason: reason || 'unknown' });
      return true;
    };

    if (kind === 'image' && elements.image) {
      elements.image.setAttribute('src', resolvedUrl);
      elements.image.setAttribute('alt', title ? `Просмотр: ${title}` : 'Просмотр документа');
      elements.image.setAttribute('draggable', 'false');
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      setViewerMode('image');
      logViewerDeep('viewer:mode:state', {
        mode: viewerMode,
        useImage: viewerMode === 'image' && Boolean(elements.image),
        usePdf: viewerMode === 'pdf' && Boolean(elements.pdf && elements.pdfCanvas),
        forceFrame,
        skipPdfLoad,
        hasZoom: Boolean(elements.zoom),
        hasSurface: Boolean(elements.surface),
        hasImage: Boolean(elements.image),
        hasFrame: Boolean(elements.frame),
      });
      logScaleConsole('Просмотр:открытие', {
        url: resolvedUrl,
        scale: zoomState.scale,
        translateX: zoomState.translateX,
        translateY: zoomState.translateY,
        ...getPlatformDetails(),
      });
      logViewerDeep('viewer:mode', { mode: 'image', url: resolvedUrl });
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
      logViewerDeep('viewer:mode', { mode: 'video', url: resolvedUrl });
    } else if (pdfZoomState.active && elements.pdf && elements.pdfCanvas) {
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      if (elements.image) {
        elements.image.removeAttribute('src');
        elements.image.removeAttribute('alt');
      }
      setViewerMode('pdf');
      logViewerDeep('viewer:mode:state', {
        mode: viewerMode,
        useImage: viewerMode === 'image' && Boolean(elements.image),
        usePdf: viewerMode === 'pdf' && Boolean(elements.pdf && elements.pdfCanvas),
        forceFrame,
        skipPdfLoad,
        hasZoom: Boolean(elements.zoom),
        hasSurface: Boolean(elements.surface),
        hasImage: Boolean(elements.image),
        hasFrame: Boolean(elements.frame),
      });
      logViewerDeep('viewer:mode', { mode: 'pdf', url: resolvedUrl, skipPdfLoad });
      if (skipPdfLoad) {
        setPdfCanvasMessage('Не удалось открыть PDF. Откройте файл в новой вкладке.', {
          variant: 'message',
          actionLabel: 'Открыть в новой вкладке',
          onAction: () => {
            window.open(resolvedUrl, '_blank', 'noopener');
          },
        });
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
        pdfRenderState.loadPromise = loadPdfDocument(resolvedUrl, data).then(async (loaded) => {
          if (loaded) {
            return true;
          }
          const retryUrl = `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}retry=${Date.now()}`;
          logPdfEvent('загрузка:повтор', { url: retryUrl });
          const retried = await loadPdfDocument(retryUrl, data);
          if (retried) {
            return true;
          }
          fallbackToMessage();
          return false;
        }).catch(() => {
          fallbackToMessage();
          return false;
        });
      }
    } else {
      if (elements.frame) {
        elements.frame.removeAttribute('src');
      }
      const targetUrl = resolvedUrl;
      if (wantsPdf && !forceFrame) {
        setViewerMode('pdf');
        logViewerDeep('viewer:mode:state', {
          mode: viewerMode,
          useImage: viewerMode === 'image' && Boolean(elements.image),
          usePdf: viewerMode === 'pdf' && Boolean(elements.pdf && elements.pdfCanvas),
          forceFrame,
          skipPdfLoad,
          hasZoom: Boolean(elements.zoom),
          hasSurface: Boolean(elements.surface),
          hasImage: Boolean(elements.image),
          hasFrame: Boolean(elements.frame),
        });
        setPdfCanvasMessage('Не удалось открыть PDF. Откройте файл в новой вкладке.', {
          variant: 'message',
          actionLabel: 'Открыть в новой вкладке',
          onAction: () => {
            window.open(targetUrl, '_blank', 'noopener');
          },
        });
        logViewerDeep('viewer:mode', { mode: 'pdf-fallback', url: targetUrl });
      } else {
        elements.frame.setAttribute('src', targetUrl);
        elements.frame.setAttribute('title', title ? `Просмотр: ${title}` : 'Просмотр документа');
        if (elements.image) {
          elements.image.removeAttribute('src');
          elements.image.removeAttribute('alt');
        }
        setViewerMode('frame');
        logViewerDeep('viewer:mode:state', {
          mode: viewerMode,
          useImage: viewerMode === 'image' && Boolean(elements.image),
          usePdf: viewerMode === 'pdf' && Boolean(elements.pdf && elements.pdfCanvas),
          forceFrame,
          skipPdfLoad,
          hasZoom: Boolean(elements.zoom),
          hasSurface: Boolean(elements.surface),
          hasImage: Boolean(elements.image),
          hasFrame: Boolean(elements.frame),
        });
        logViewerDeep('viewer:mode', { mode: 'frame', url: targetUrl });
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

    scheduleMouseFallback();
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
    console.warn(`ПДФ/Просмотр: ранний выход (${reason})`, {
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventType: event && event.type ? event.type : '',
      eventTargetTag: event && event.target && event.target.tagName ? event.target.tagName : '',
    });
  }

  function handlePointerDown(event) {
    notePointerInput();
    const target = getZoomTarget();
    const isPdfMode = viewerMode === 'pdf';
    const isPdfPinch = isPdfMode && pdfZoomState.active;
    const shouldLogMouse = event.pointerType === 'mouse' && event.button === 0;
    logInputEventSimple('pointerdown', event);
    logInputConsole('pointerdown', {
      pointerType: event.pointerType || '',
      button: typeof event.button === 'number' ? event.button : null,
      targetFound: Boolean(target),
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
    }, false);
    if (shouldLogMouse) {
      logScaleConsole('ЛКМ:нажатие', buildScaleLogDetails({
        pointerType: event.pointerType || '',
        button: typeof event.button === 'number' ? event.button : null,
        panAvailable: isImagePanAvailable(),
        targetFound: Boolean(target),
        targetTag: target && target.tagName ? target.tagName : '',
      }), 'drag');
      logScaleConsoleVerbose('ЛКМ:нажатие', buildScaleLogDetails({
        pointerType: event.pointerType || '',
        button: typeof event.button === 'number' ? event.button : null,
        panAvailable: isImagePanAvailable(),
        targetFound: Boolean(target),
        targetTag: target && target.tagName ? target.tagName : '',
      }), 'drag');
      logViewerConsole('ЛКМ:нажатие', buildScaleLogDetails({
        pointerType: event.pointerType || '',
        button: typeof event.button === 'number' ? event.button : null,
        panAvailable: isImagePanAvailable(),
        targetFound: Boolean(target),
        targetTag: target && target.tagName ? target.tagName : '',
      }), 'drag');
    }
    if (!target) {
      logViewerEarlyExit('target=null', event);
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (event.cancelable && !isPdfMode) {
      event.preventDefault();
    }
    const point = getPointerPosition(event);
    zoomState.pointers.set(event.pointerId, point);
    if (target && typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }

    if (zoomState.pointers.size === 1) {
      zoomState.startPointer = point;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
      if (isImagePanAvailable()) {
        const now = Date.now();
        if (now - lastImageDragLogAt >= IMAGE_DRAG_LOG_THROTTLE_MS) {
          lastImageDragLogAt = now;
          const overflow = getImageOverflowState();
          logPdfEvent('перетаскивание:старт', {
            pointerType: event.pointerType || '',
            button: typeof event.button === 'number' ? event.button : null,
            scale: zoomState.scale,
            translateX: zoomState.translateX,
            translateY: zoomState.translateY,
            overflowX: overflow.overflowX,
            overflowY: overflow.overflowY,
            ...getPlatformDetails(),
          });
        }
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
    const shouldLogMouse = event.pointerType === 'mouse' && (event.buttons & 1) === 1;
    const target = getZoomTarget();
    const isPdfScrollMode = pdfZoomState.active && !zoomState.enabled;
    const isPdfMode = viewerMode === 'pdf';
    const isPdfPinch = isPdfMode && pdfZoomState.active;
    logInputEventSimple('pointermove', event);
    logInputConsole('pointermove', {
      pointerType: event.pointerType || '',
      buttons: typeof event.buttons === 'number' ? event.buttons : null,
      targetFound: Boolean(target),
      pointerTracked: zoomState.pointers.has(event.pointerId),
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
    });
    if (!target) {
      logViewerEarlyExit('target=null', event);
      if (shouldLogMouse) {
        logScaleConsole('ЛКМ:перемещение', buildScaleLogDetails({
          dx: 0,
          dy: 0,
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: false,
        }), 'drag');
        logScaleConsoleVerbose('ЛКМ:перемещение', buildScaleLogDetails({
          dx: 0,
          dy: 0,
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: false,
        }), 'drag');
        logViewerConsole('ЛКМ:перемещение', buildScaleLogDetails({
          dx: 0,
          dy: 0,
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: false,
        }), 'drag');
      }
      return;
    }
    if (!zoomState.pointers.has(event.pointerId)) {
      logViewerEarlyExit('pointer not tracked', event);
      if (shouldLogMouse) {
        logViewerConsole('ЛКМ:перемещение', buildScaleLogDetails({
          dx: 0,
          dy: 0,
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: true,
          pointerTracked: false,
        }), 'drag');
      }
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
      setPdfZoomByScale(distanceRatio);
      return;
    }

    if (isPdfPinch) {
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
      logScaleConsole('ЛКМ:перемещение', buildScaleLogDetails({
        dx,
        dy,
        panAvailable: true,
      }), 'drag');
      logScaleConsoleVerbose('ЛКМ:перемещение', buildScaleLogDetails({
        dx,
        dy,
        panAvailable: true,
      }), 'drag');
      logViewerConsole('ЛКМ:перемещение', buildScaleLogDetails({
        dx,
        dy,
        panAvailable: true,
      }), 'drag');
      return;
    }

    if (zoomState.pointers.size >= 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      const distance = getPointerDistance(first, second);
      if (!zoomState.startDistance) {
        return;
      }
      const nextScale = clamp(zoomState.startScale * (distance / zoomState.startDistance), ZOOM_MIN, ZOOM_MAX);
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
    const shouldLogMouse = event.pointerType === 'mouse';
    const target = getZoomTarget();
    logInputEventSimple('pointerup', event);
    logInputConsole('pointerup', {
      pointerType: event.pointerType || '',
      button: typeof event.button === 'number' ? event.button : null,
      targetFound: Boolean(target),
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
    }, false);
    if (!target) {
      logViewerEarlyExit('target=null', event);
      if (shouldLogMouse) {
        logScaleConsole('ЛКМ:отпускание', buildScaleLogDetails({
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: false,
        }), 'drag');
        logScaleConsoleVerbose('ЛКМ:отпускание', buildScaleLogDetails({
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: false,
        }), 'drag');
        logViewerConsole('ЛКМ:отпускание', buildScaleLogDetails({
          pointerType: event.pointerType || '',
          panAvailable: isImagePanAvailable(),
          targetFound: false,
        }), 'drag');
      }
      return;
    }
    if (zoomState.pointers.has(event.pointerId)) {
      zoomState.pointers.delete(event.pointerId);
    }
    if (zoomState.pointers.size === 0 && isImagePanAvailable()) {
      logScaleConsole('ЛКМ:отпускание', buildScaleLogDetails({
        pointerType: event.pointerType || '',
        panAvailable: true,
      }), 'drag');
      logScaleConsoleVerbose('ЛКМ:отпускание', buildScaleLogDetails({
        pointerType: event.pointerType || '',
        panAvailable: true,
      }), 'drag');
      logViewerConsole('ЛКМ:отпускание', buildScaleLogDetails({
        pointerType: event.pointerType || '',
        panAvailable: true,
      }), 'drag');
      const now = Date.now();
      if (now - lastImageDragLogAt >= IMAGE_DRAG_LOG_THROTTLE_MS) {
        lastImageDragLogAt = now;
        const overflow = getImageOverflowState();
        logPdfEvent('перетаскивание:конец', {
          pointerType: event.pointerType || '',
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
          overflowX: overflow.overflowX,
          overflowY: overflow.overflowY,
          ...getPlatformDetails(),
        });
      }
    }
    if (zoomState.pointers.size === 0 && zoomState.scale <= ZOOM_MIN) {
      resetImageTransform();
    }
    if (zoomState.pointers.size === 0 && zoomState.enabled && zoomState.scale !== lastLoggedZoomScale) {
      logZoomEvent('пинч', {
        mode: 'image',
        scale: zoomState.scale,
      });
      lastLoggedZoomScale = zoomState.scale;
    }
  }

  const mouseDragState = {
    active: false,
    startPoint: { x: 0, y: 0 },
    startTranslateX: 0,
    startTranslateY: 0,
  };

  function logMouseDrag(step, details) {
    logScaleConsole(step, buildScaleLogDetails(details), 'drag');
    logScaleConsoleVerbose(step, buildScaleLogDetails(details), 'drag');
    logViewerConsole(step, buildScaleLogDetails(details), 'drag');
  }

  function handleMouseDown(event) {
    const target = getZoomTarget();
    const panAvailable = isImagePanAvailable();
    const button = typeof event.button === 'number' ? event.button : null;
    logInputEventSimple('mousedown', event);
    logInputConsole('mousedown', {
      button,
      panAvailable,
      targetFound: Boolean(target),
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
    }, false);
    logMouseDrag('Мышь:нажатие', {
      button,
      dx: 0,
      dy: 0,
      panAvailable,
      targetFound: Boolean(target),
    });
    if (!target || button !== 0) {
      if (!target) {
        logViewerEarlyExit('target=null', event);
      }
      return;
    }
    if (event.cancelable && viewerMode !== 'pdf') {
      event.preventDefault();
    }
    mouseDragState.active = true;
    mouseDragState.startPoint = getPointerPosition(event);
    mouseDragState.startTranslateX = zoomState.translateX;
    mouseDragState.startTranslateY = zoomState.translateY;
    if (panAvailable) {
      const now = Date.now();
      if (now - lastImageDragLogAt >= IMAGE_DRAG_LOG_THROTTLE_MS) {
        lastImageDragLogAt = now;
        const overflow = getImageOverflowState();
        logPdfEvent('перетаскивание:старт', {
          pointerType: 'mouse',
          button,
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
          overflowX: overflow.overflowX,
          overflowY: overflow.overflowY,
          ...getPlatformDetails(),
        });
      }
    }
  }

  function handleMouseMove(event) {
    const target = getZoomTarget();
    const panAvailable = isImagePanAvailable();
    const hasPrimary = (event.buttons & 1) === 1;
    const point = getPointerPosition(event);
    const dx = mouseDragState.active ? point.x - mouseDragState.startPoint.x : 0;
    const dy = mouseDragState.active ? point.y - mouseDragState.startPoint.y : 0;
    logInputEventSimple('mousemove', event);
    logInputConsole('mousemove', {
      button: typeof event.button === 'number' ? event.button : null,
      hasPrimary,
      dx,
      dy,
      panAvailable,
      targetFound: Boolean(target),
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
    });
    logMouseDrag('Мышь:перемещение', {
      button: typeof event.button === 'number' ? event.button : null,
      dx,
      dy,
      panAvailable,
      targetFound: Boolean(target),
    });
    if (!target || !hasPrimary || !mouseDragState.active) {
      if (!target) {
        logViewerEarlyExit('target=null', event);
      }
      if (!hasPrimary) {
        mouseDragState.active = false;
      }
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
    const panAvailable = isImagePanAvailable();
    const button = typeof event.button === 'number' ? event.button : null;
    logInputEventSimple('mouseup', event);
    logInputConsole('mouseup', {
      button,
      panAvailable,
      targetFound: Boolean(target),
      viewerActive: isViewerActive(),
      viewerMode,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
    }, false);
    logMouseDrag('Мышь:отпускание', {
      button,
      dx: 0,
      dy: 0,
      panAvailable,
      targetFound: Boolean(target),
    });
    if (!target) {
      logViewerEarlyExit('target=null', event);
    }
    if (!mouseDragState.active) {
      return;
    }
    mouseDragState.active = false;
    if (panAvailable) {
      const now = Date.now();
      if (now - lastImageDragLogAt >= IMAGE_DRAG_LOG_THROTTLE_MS) {
        lastImageDragLogAt = now;
        const overflow = getImageOverflowState();
        logPdfEvent('перетаскивание:конец', {
          pointerType: 'mouse',
          button,
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
          overflowX: overflow.overflowX,
          overflowY: overflow.overflowY,
          ...getPlatformDetails(),
        });
      }
    }
    if (zoomState.scale <= ZOOM_MIN) {
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
    if (!target) {
      return;
    }
    if (event.cancelable && !isPdfMode) {
      event.preventDefault();
    }
    updateTouchPointers(event.touches);

    if (zoomState.pointers.size === 1) {
      const point = Array.from(zoomState.pointers.values())[0];
      zoomState.startPointer = point;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
    } else if (zoomState.pointers.size >= 2) {
      const [first, second] = Array.from(zoomState.pointers.values());
      zoomState.startDistance = getPointerDistance(first, second);
      zoomState.startScale = zoomState.scale;
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
    if (!target) {
      return;
    }
    if (event.cancelable && !isPdfMode && !isPdfScrollMode
      && (event.touches.length > 1 || zoomState.scale > ZOOM_MIN)) {
      event.preventDefault();
    }
    updateTouchPointers(event.touches);

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
      const nextScale = clamp(zoomState.startScale * (distance / zoomState.startDistance), ZOOM_MIN, ZOOM_MAX);
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
    updateTouchPointers(event.touches);
    if (zoomState.pointers.size === 1) {
      const point = Array.from(zoomState.pointers.values())[0];
      zoomState.startPointer = point;
      zoomState.startTranslateX = zoomState.translateX;
      zoomState.startTranslateY = zoomState.translateY;
    }
    if (zoomState.pointers.size === 0 && zoomState.scale <= ZOOM_MIN) {
      resetImageTransform();
    }
    if (zoomState.pointers.size === 0 && zoomState.enabled && zoomState.scale !== lastLoggedZoomScale) {
      logZoomEvent('пинч', {
        mode: 'image',
        scale: zoomState.scale,
      });
      lastLoggedZoomScale = zoomState.scale;
    }
  }

  function handleWheel(event) {
    if (event && event.__appdoscViewerHandled) {
      return;
    }
    if (event) {
      event.__appdoscViewerHandled = true;
    }
    const target = event.target;
    const deltaY = event.deltaY;
    const viewerActive = isViewerActive();
    logInputEventSimple('wheel', event);
    logInputConsole('wheel', {
      viewerActive,
      viewerMode,
      pdfZoomStateActive: pdfZoomState.active,
      zoomEnabled: zoomState.enabled,
      eventTarget: event.target,
      path: getEventPathNames(event),
      target,
      deltaY,
      deltaMode: event.deltaMode,
      ctrlKey: Boolean(event.ctrlKey),
      metaKey: Boolean(event.metaKey),
    });
    console.log('ПДФ/Просмотр', {
      viewerActive,
      viewerMode,
      pdfZoomStateActive: pdfZoomState.active,
      target,
      deltaY,
    });
    if (viewerMode === 'frame') {
      console.log('ПДФ/Просмотр: колесо внутри iframe не перехватывается', {
        viewerMode,
        target,
        deltaY,
      });
    }
    if (!viewerActive) {
      logViewerEarlyExit('viewerActive=false', event);
      console.log('ПДФ/Просмотр: событие игнорируется, viewerActive=false', {
        viewerMode,
        pdfZoomStateActive: pdfZoomState.active,
        target,
        deltaY,
      });
      if (typeof event.deltaY === 'number') {
        logViewerConsole('Колесо:игнор', buildScaleLogDetails({
          deltaY: event.deltaY,
          deltaX: event.deltaX,
          deltaMode: event.deltaMode,
          ctrlKey: Boolean(event.ctrlKey),
          metaKey: Boolean(event.metaKey),
          reason: 'viewer_inactive',
        }));
      }
      return;
    }
    const isPdfView = pdfZoomState.active && !zoomState.enabled;
    if (typeof event.deltaY === 'number') {
      logScaleConsole('Колесо:событие', buildScaleLogDetails({
        deltaY: event.deltaY,
        deltaX: event.deltaX,
        deltaMode: event.deltaMode,
        ctrlKey: Boolean(event.ctrlKey),
        metaKey: Boolean(event.metaKey),
      }));
      logScaleConsoleVerbose('Колесо:событие', buildScaleLogDetails({
        deltaY: event.deltaY,
        deltaX: event.deltaX,
        deltaMode: event.deltaMode,
        ctrlKey: Boolean(event.ctrlKey),
        metaKey: Boolean(event.metaKey),
      }));
      logViewerConsole('Колесо:событие', buildScaleLogDetails({
        deltaY: event.deltaY,
        deltaX: event.deltaX,
        deltaMode: event.deltaMode,
        ctrlKey: Boolean(event.ctrlKey),
        metaKey: Boolean(event.metaKey),
      }));
    }
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
        const now = Date.now();
        if (deltaY !== 0 && now - lastScrollLogAt >= SCROLL_LOG_THROTTLE_MS) {
          lastScrollLogAt = now;
          logPdfEvent('скролл:вертикаль', {
            deltaY,
            mode: 'pdf',
            ...getPlatformDetails(),
          });
        }
      }
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
        logScaleConsole('Колесо:прокрутка', {
          deltaX,
          deltaY,
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
          ctrlKey: Boolean(event.ctrlKey),
          metaKey: Boolean(event.metaKey),
          ...getPlatformDetails(),
        });
        logScaleConsoleVerbose('Колесо:прокрутка', {
          deltaX,
          deltaY,
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
          ctrlKey: Boolean(event.ctrlKey),
          metaKey: Boolean(event.metaKey),
          ...getPlatformDetails(),
        });
        logViewerDeep('wheel:pan', {
          deltaX,
          deltaY,
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
          ...getPlatformDetails(),
        });
        const now = Date.now();
        if (now - lastImageScrollLogAt >= IMAGE_SCROLL_LOG_THROTTLE_MS) {
          lastImageScrollLogAt = now;
          const overflow = getImageOverflowState();
          logPdfEvent('скролл:картинка:колесо', {
            deltaX,
            deltaY,
            scale: zoomState.scale,
            translateX: zoomState.translateX,
            translateY: zoomState.translateY,
            overflowX: overflow.overflowX,
            overflowY: overflow.overflowY,
            ...getPlatformDetails(),
          });
        }
      } else if (event.ctrlKey || event.metaKey) {
        if (event.cancelable) {
          event.preventDefault();
        }
      } else if (!panAvailable) {
        logViewerDeep('wheel:pan_unavailable', {
          deltaX,
          deltaY,
          scale: zoomState.scale,
          ...getPlatformDetails(),
        });
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
    if (isViewerActive() && zoomState.enabled && event.cancelable) {
      event.preventDefault();
    }
  }

  if (elements.frame) {
    elements.frame.addEventListener('load', () => {
      logPdfEvent('frame:load', { src: elements.frame.getAttribute('src') || '' });
      logViewerDeep('frame:load', {
        src: elements.frame.getAttribute('src') || '',
        sandbox: elements.frame.getAttribute('sandbox') || '',
        allow: elements.frame.getAttribute('allow') || '',
        referrerPolicy: elements.frame.getAttribute('referrerpolicy') || '',
      });
      restorePdfFramePosition();
    });
    elements.frame.addEventListener('error', () => {
      logPdfEvent('frame:error', { src: elements.frame.getAttribute('src') || '' });
      logViewerDeep('frame:error', {
        src: elements.frame.getAttribute('src') || '',
        sandbox: elements.frame.getAttribute('sandbox') || '',
        allow: elements.frame.getAttribute('allow') || '',
        referrerPolicy: elements.frame.getAttribute('referrerpolicy') || '',
      });
    });
  }

  elements.closeButtons.forEach((button) => {
    button.addEventListener('click', hideViewer);
  });

  if (elements.zoomIn) {
    elements.zoomIn.addEventListener('click', (event) => {
      event.preventDefault();
      if (pdfZoomState.active && !zoomState.enabled) {
        adjustPdfZoom(10);
        logZoomEvent('кнопка', {
          mode: 'pdf',
          delta: 10,
          zoom: pdfZoomState.zoom,
          fit: pdfZoomState.fit,
        });
      } else if (viewerMode === 'frame') {
        applyFrameZoom(zoomState.scale - 0.2);
      } else {
        zoomStep(-0.2);
      }
    });
  }

  if (elements.zoomOut) {
    elements.zoomOut.addEventListener('click', (event) => {
      event.preventDefault();
      if (pdfZoomState.active && !zoomState.enabled) {
        adjustPdfZoom(-10);
        logZoomEvent('кнопка', {
          mode: 'pdf',
          delta: -10,
          zoom: pdfZoomState.zoom,
          fit: pdfZoomState.fit,
        });
      } else if (viewerMode === 'frame') {
        applyFrameZoom(zoomState.scale + 0.2);
      } else {
        zoomStep(0.2);
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
          renderPdfPages();
        } else {
          capturePdfFramePosition();
          setPdfZoom('page-fit');
        }
        updateZoomControls();
        logZoomEvent('вписать', {
          mode: 'pdf',
          zoom: pdfZoomState.zoom,
          fit: pdfZoomState.fit,
        });
      } else if (viewerMode === 'frame') {
        resetFrameTransform();
        logZoomEvent('вписать', {
          mode: 'frame',
          scale: zoomState.scale,
        });
      } else {
        resetImageTransform();
        logZoomEvent('вписать', {
          mode: 'image',
          scale: zoomState.scale,
        });
      }
    });
  }

  if (elements.backdrop) {
    elements.backdrop.addEventListener('click', hideViewer);
  }

  if (elements.container) {
    elements.container.addEventListener('click', handleBackdrop);
    elements.container.addEventListener('gesturestart', stopNativeZoom);
    elements.container.addEventListener('gesturechange', stopNativeZoom);
    elements.container.addEventListener('gestureend', stopNativeZoom);
    elements.container.addEventListener('wheel', (event) => {
      logInputConsole('wheel:capture', {
        target: event.target,
        deltaY: event.deltaY,
        viewerMode,
      }, false);
    }, { capture: true, passive: false });
    ['pointerdown', 'wheel', 'mousedown'].forEach((eventType) => {
      elements.container.addEventListener(eventType, (event) => {
        logInputConsole('capture:event', {
          target: getElementName(event.target),
          type: event.type,
          viewerActive: isViewerActive(),
          viewerMode,
        }, false);
      }, { capture: true, passive: true });
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('wheel', (event) => {
      logInputConsole('wheel:capture:window', {
        target: event.target,
        deltaY: event.deltaY,
        viewerMode,
      }, false);
    }, { capture: true, passive: false });
  }

  function bindPointerEvents(target) {
    if (!target) {
      logInputConsole('bind:pointer:skip', { reason: 'no_target' }, false);
      return;
    }
    logInputConsole('bind:pointer', {
      target: getElementName(target),
      viewerMode,
      viewerActive: isViewerActive(),
      ...getTargetVisibilityDetails(target),
    }, false);
    logInputEventSimple('bind:pointer', { currentTarget: target, type: 'bind:pointer' });
    target.addEventListener('pointerdown', handlePointerDown);
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerEnd);
    target.addEventListener('pointercancel', handlePointerEnd);
    target.addEventListener('pointerleave', handlePointerEnd);
  }

  bindPointerEvents(elements.surface);
  bindPointerEvents(elements.zoom);
  bindPointerEvents(elements.frame);
  bindPointerEvents(elements.image);
  bindPointerEvents(elements.pdfCanvas);

  function bindMouseEvents(target, options = {}) {
    const force = Boolean(options.force);
    const reason = options.reason || (force ? 'force' : 'default');
    if (!target || (!force && supportsPointerEvents)) {
      if (!target) {
        logInputConsole('bind:mouse:skip', { reason: 'no_target' }, false);
      } else if (supportsPointerEvents) {
        logInputConsole('bind:mouse:skip', { reason: 'pointer_events_supported', target: getElementName(target) }, false);
      }
      return;
    }
    logInputConsole('bind:mouse', {
      target: getElementName(target),
      reason,
      viewerMode,
      viewerActive: isViewerActive(),
      ...getTargetVisibilityDetails(target),
    }, false);
    logInputEventSimple('bind:mouse', { currentTarget: target, type: 'bind:mouse' });
    target.addEventListener('mousedown', handleMouseDown);
    target.addEventListener('mousemove', handleMouseMove);
    target.addEventListener('mouseup', handleMouseUp);
    target.addEventListener('mouseleave', handleMouseUp);
  }

  bindMouseEvents(elements.surface);
  bindMouseEvents(elements.zoom);
  bindMouseEvents(elements.frame);
  bindMouseEvents(elements.image);
  bindMouseEvents(elements.pdfCanvas);

  function bindTouchEvents(target) {
    if (!target || supportsPointerEvents) {
      if (!target) {
        logInputConsole('bind:touch:skip', { reason: 'no_target' }, false);
      } else if (supportsPointerEvents) {
        logInputConsole('bind:touch:skip', { reason: 'pointer_events_supported', target }, false);
      }
      return;
    }
    logInputConsole('bind:touch', { target }, false);
    target.addEventListener('touchstart', handleTouchStart, { passive: false });
    target.addEventListener('touchmove', handleTouchMove, { passive: false });
    target.addEventListener('touchend', handleTouchEnd);
    target.addEventListener('touchcancel', handleTouchEnd);
  }

  bindTouchEvents(elements.surface);
  bindTouchEvents(elements.zoom);
  bindTouchEvents(elements.frame);
  bindTouchEvents(elements.image);
  bindTouchEvents(elements.pdfCanvas);

  function bindWheelEvents(target) {
    if (!target) {
      logInputConsole('bind:wheel:skip', { reason: 'no_target' }, false);
      return;
    }
    logInputConsole('bind:wheel', {
      target: getElementName(target),
      viewerMode,
      viewerActive: isViewerActive(),
      ...getTargetVisibilityDetails(target),
    }, false);
    logInputEventSimple('bind:wheel', { currentTarget: target, type: 'bind:wheel' });
    target.addEventListener('wheel', handleWheel, { passive: false });
  }

  bindWheelEvents(elements.surface);
  bindWheelEvents(elements.zoom);
  bindWheelEvents(elements.frame);
  bindWheelEvents(elements.image);
  bindWheelEvents(elements.pdfCanvas);
  if (elements.surface) {
    elements.surface.addEventListener('contextmenu', handleContextMenu);
  }
  if (elements.zoom) {
    elements.zoom.addEventListener('contextmenu', handleContextMenu);
  }
  if (elements.image) {
    elements.image.addEventListener('contextmenu', handleContextMenu);
  }

  document.addEventListener('gesturestart', stopNativeZoom);
  document.addEventListener('gesturechange', stopNativeZoom);
  document.addEventListener('gestureend', stopNativeZoom);
  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('resize', () => {
    if (isViewerActive() && pdfZoomState.active && pdfZoomState.useCanvas && pdfZoomState.fit) {
      schedulePdfRerender();
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
      lastInputConsoleAt = 0;
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
    captureRenderedContent() {
      if (!elements.container || !isViewerActive()) {
        return null;
      }
      if (viewerMode === 'pdf' && elements.pdfCanvas && elements.pdfCanvas.children.length > 0) {
        const fragment = document.createDocumentFragment();
        while (elements.pdfCanvas.firstChild) {
          fragment.appendChild(elements.pdfCanvas.firstChild);
        }
        const doc = pdfRenderState.doc;
        pdfRenderState.doc = null;
        return {
          mode: 'pdf',
          fragment,
          doc,
          renderStatus: pdfRenderState.renderStatus,
          renderedPages: pdfRenderState.renderedPages,
          totalPages: pdfRenderState.totalPages,
          lastUrl: pdfRenderState.lastUrl,
          useCanvas: pdfZoomState.useCanvas,
          zoom: pdfZoomState.zoom,
          fit: pdfZoomState.fit,
        };
      }
      if (viewerMode === 'html' && elements.html) {
        return { mode: 'html', htmlContent: elements.html.innerHTML };
      }
      if (viewerMode === 'frame' && elements.frame && elements.frame.src) {
        return { mode: 'frame', src: elements.frame.src };
      }
      return null;
    },
    restoreRenderedContent(snapshot, title) {
      if (!snapshot || !snapshot.mode || !elements.container) {
        return false;
      }
      resetViewerContent();
      lastInputConsoleAt = 0;
      lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      elements.container.hidden = false;
      elements.container.setAttribute(ACTIVE_ATTR, 'true');
      applyBodyLock(true);
      if (elements.title) {
        const label = title && String(title).trim() ? String(title).trim() : 'Документ';
        elements.title.textContent = label;
      }
      if (snapshot.mode === 'pdf' && elements.pdfCanvas && elements.pdf) {
        pdfZoomState.active = true;
        pdfZoomState.useCanvas = Boolean(snapshot.useCanvas);
        pdfZoomState.zoom = snapshot.zoom || 100;
        pdfZoomState.fit = snapshot.fit !== false;
        pdfRenderState.doc = snapshot.doc || null;
        pdfRenderState.lastUrl = snapshot.lastUrl || '';
        pdfRenderState.renderStatus = snapshot.renderStatus || 'complete';
        pdfRenderState.renderedPages = snapshot.renderedPages || 0;
        pdfRenderState.totalPages = snapshot.totalPages || 0;
        pdfRenderState.loading = false;
        pdfRenderState.loadPromise = Promise.resolve(true);
        elements.pdfCanvas.appendChild(snapshot.fragment);
        setViewerMode('pdf');
        updateZoomControls();
        setupPdfResizeObserver();
        return true;
      }
      if (snapshot.mode === 'html' && elements.html) {
        pdfZoomState.active = false;
        elements.html.innerHTML = snapshot.htmlContent;
        setViewerMode('html');
        updateZoomControls();
        return true;
      }
      if (snapshot.mode === 'frame' && elements.frame && snapshot.src) {
        pdfZoomState.active = false;
        pdfZoomState.useCanvas = false;
        elements.frame.setAttribute('src', snapshot.src);
        setViewerMode('frame');
        updateZoomControls();
        return true;
      }
      return false;
    },
    get _viewerMode() {
      return viewerMode;
    },
  };
}
