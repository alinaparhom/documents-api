(function () {
  var STYLE_ID = 'ai-chat-modal-style-v3';
  var ROOT_CLASS = 'ai-chat-modal';
  var FILE_INPUT_ID = 'ai-chat-hidden-file-input';
  var FALLBACK_MODEL_OPTIONS = [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }];
  var MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
  var MAX_EXTRACT_CHARS = 500000;
  var pdfJsReadyPromise = null;
  var pdfLibReadyPromise = null;
  var pdfFontkitReadyPromise = null;
  var mammothReadyPromise = null;
  var docxReadyPromise = null;
  var TEMPLATE_PDF_CANDIDATES = [
    '/app/templates/template.pdf',
    '/templates/template.pdf',
    '/js/documents/app/templates/template.pdf'
  ];
  var CYRILLIC_FONT_CANDIDATES = [
    'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Regular.ttf'
  ];

  var STYLE_OPTIONS = [
    { value: 'neutral', label: 'Нейтральный стиль' },
    { value: 'aggressive', label: 'Агрессивный стиль' },
    { value: 'informational', label: 'Спокойный (информационный)' }
  ];

  function createElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (typeof text === 'string') {
      node.textContent = text;
    }
    return node;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.ai-chat-modal{position:fixed;inset:0;z-index:1900;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.44);backdrop-filter:blur(5px);opacity:0;transition:opacity .2s ease;}' +
      '.ai-chat-modal--visible{opacity:1;}' +
      '.ai-chat-modal--closing{opacity:0;}' +
      '.ai-chat-modal__panel{width:min(1900px,98vw);height:96vh;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(248,250,252,.86));border:1px solid rgba(203,213,225,.7);border-radius:18px;overflow:hidden;box-shadow:0 20px 55px rgba(15,23,42,.22);}' +
      '.ai-chat-modal__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(226,232,240,.9);background:linear-gradient(180deg,rgba(255,255,255,.76),rgba(248,250,252,.62));}' +
      '.ai-chat-modal__title{font-size:14px;font-weight:700;color:#0f172a;}' +
      '.ai-chat-modal__subtitle{margin-top:1px;font-size:11px;color:#64748b;}' +
      '.ai-chat-modal__close{border:none;background:rgba(148,163,184,.18);width:32px;height:32px;border-radius:999px;font-size:18px;line-height:1;cursor:pointer;}' +
      '.ai-chat-modal__content{display:flex;flex-direction:column;gap:10px;padding:11px;min-height:0;flex:1;}' +
      '.ai-chat-modal__context{border:1px solid rgba(226,232,240,.88);border-radius:12px;padding:8px;background:rgba(255,255,255,.72);backdrop-filter:blur(2px);}' +
      '.ai-chat-modal__context-title{font-size:11px;font-weight:700;color:#334155;margin-bottom:3px;}' +
      '.ai-chat-modal__files{display:flex;flex-wrap:wrap;gap:5px;min-height:20px;}' +
      '.ai-chat-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:rgba(241,245,249,.95);border:1px solid rgba(203,213,225,.9);font-size:11px;color:#1e293b;max-width:100%;}' +
      '.ai-chat-chip__meta{opacity:.8;}' +
      '.ai-chat-chip__remove{border:none;background:transparent;color:#64748b;cursor:pointer;font-size:14px;line-height:1;padding:0;}' +
      '.ai-chat-modal__empty{font-size:11px;color:#94a3b8;}' +
      '.ai-chat-modal__attach{margin-top:5px;border:1px dashed rgba(148,163,184,.55);background:rgba(248,250,252,.86);border-radius:8px;padding:5px 8px;font-size:11px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.ai-chat-modal__settings{display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid rgba(226,232,240,.88);border-radius:12px;padding:7px;background:rgba(255,255,255,.66);backdrop-filter:blur(2px);}' +
      '.ai-chat-modal__field--full{grid-column:1 / -1;}' +
      '.ai-chat-modal__field{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#475569;}' +
      '.ai-chat-modal__select{border:1px solid rgba(148,163,184,.45);border-radius:8px;background:#fff;padding:6px;font-size:12px;color:#0f172a;}' +
      '.ai-chat-modal__input{border:1px solid rgba(148,163,184,.45);border-radius:8px;background:rgba(255,255,255,.95);padding:7px 8px;font-size:12px;color:#0f172a;outline:none;}' +
      '.ai-chat-modal__messages{flex:1;min-height:0;overflow:auto;padding:11px;background:rgba(248,250,252,.52);border:1px solid rgba(226,232,240,.82);border-radius:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}' +
      '.ai-chat-msg{max-width:84%;padding:8px 10px;border-radius:12px;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(15,23,42,.05);}' +
      '.ai-chat-msg--user{margin-left:auto;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border-bottom-right-radius:6px;}' +
      '.ai-chat-msg--assistant{margin-right:auto;background:#fff;border:1px solid rgba(226,232,240,.9);color:#0f172a;border-bottom-left-radius:6px;}' +
      '.ai-chat-msg--error{border-color:rgba(239,68,68,.35);background:rgba(254,242,242,.9);color:#991b1b;}' +
      '.ai-chat-modal__composer{display:flex;gap:6px;align-items:flex-end;}' +
      '.ai-chat-modal__textarea{flex:1;min-height:40px;max-height:120px;resize:none;border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.35;background:#fff;outline:none;}' +
      '.ai-chat-modal__send{border:none;border-radius:10px;padding:8px 11px;min-height:40px;font-size:12px;font-weight:700;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;cursor:pointer;}' +
      '.ai-chat-modal__send:disabled{opacity:.6;cursor:not-allowed;}' +
      '.ai-chat-modal__template{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(226,232,240,.88);border-radius:12px;padding:8px;background:rgba(255,255,255,.72);}' +
      '.ai-chat-modal__template-status{font-size:11px;color:#475569;}' +
      '.ai-chat-modal__template-actions{display:flex;gap:6px;flex-wrap:wrap;}' +
      '.ai-chat-modal__template-btn{border:1px solid rgba(37,99,235,.32);border-radius:9px;padding:7px 10px;background:rgba(239,246,255,.85);color:#1d4ed8;font-size:11px;font-weight:700;cursor:pointer;}' +
      '.ai-chat-modal__template-select{border:1px solid rgba(148,163,184,.45);border-radius:9px;background:#fff;padding:7px 9px;font-size:11px;color:#0f172a;}' +
      '.ai-chat-modal__editor{display:none;flex-direction:column;gap:6px;border:1px solid rgba(226,232,240,.88);border-radius:12px;background:rgba(255,255,255,.78);padding:8px;}' +
      '.ai-chat-modal__editor--visible{display:flex;}' +
      '.ai-chat-modal__editor-title{font-size:11px;font-weight:700;color:#334155;}' +
      '.ai-chat-modal__editor-text{width:100%;min-height:190px;max-height:42vh;resize:vertical;border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:10px;background:#fff;color:#0f172a;font-size:12px;line-height:1.45;}' +
      '.ai-chat-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(148,163,184,.35);border-top-color:#2563eb;border-radius:50%;animation:ai-chat-spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
      '@keyframes ai-chat-spin{to{transform:rotate(360deg);}}' +
      '@media (max-width:860px){.ai-chat-modal{padding:6px;}.ai-chat-modal__panel{width:100%;height:100%;border-radius:12px;}.ai-chat-modal__settings{grid-template-columns:1fr;}.ai-chat-msg{max-width:92%;}.ai-chat-modal__composer{flex-wrap:wrap;}.ai-chat-modal__send{flex:1 1 47%;}.ai-chat-modal__editor-text{max-height:35vh;}}';
    document.head.appendChild(style);
  }

  function formatSize(size) {
    var value = Number(size || 0);
    if (!value || value < 1024) {
      return value + ' B';
    }
    if (value < 1024 * 1024) {
      return (value / 1024).toFixed(1) + ' KB';
    }
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function detectIcon(file) {
    var name = String(file.name || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    if (/\.(js|ts|json|xml|html|css|sql|md|py|php|java|go|c|cpp|cs|rb)$/i.test(name) || type.indexOf('json') !== -1 || type.indexOf('javascript') !== -1) {
      return '💻';
    }
    return '📄';
  }

  function isTextLike(file) {
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    return type.indexOf('text') !== -1 || /\.(txt|md|json|csv|xml|html|css|js|ts|php|py|java|sql)$/i.test(name);
  }

  function isPdfLike(file) {
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    return type.indexOf('pdf') !== -1 || /\.pdf$/i.test(name);
  }

  function normalizeExternalFiles(files, source) {
    if (!Array.isArray(files)) {
      return [];
    }
    return files.map(function (entry, index) {
      if (!entry) {
        return null;
      }
      return {
        id: source + '-' + index + '-' + Date.now(),
        name: entry.name ? String(entry.name) : 'Файл без названия',
        size: Number(entry.size || 0),
        type: entry.type ? String(entry.type) : '',
        content: typeof entry.content === 'string' ? entry.content : '',
        url: typeof entry.url === 'string' ? entry.url : '',
        fileObject: null
      };
    }).filter(Boolean);
  }

  function normalizeFileObjects(files) {
    if (!Array.isArray(files)) {
      return [];
    }
    return files
      .filter(function (item) {
        return typeof File !== 'undefined' && item instanceof File;
      })
      .map(function (file, index) {
        return {
          id: 'local-' + index + '-' + Date.now() + '-' + Math.random().toString(16).slice(2),
          name: file.name || 'Файл',
          size: Number(file.size || 0),
          type: file.type || '',
          content: '',
          url: '',
          fileObject: file
        };
      });
  }

  function normalizeModelList(rawModels) {
    if (!Array.isArray(rawModels) || !rawModels.length) {
      return FALLBACK_MODEL_OPTIONS.slice();
    }
    return rawModels
      .map(function (entry) {
        var value = typeof entry === 'string'
          ? entry.trim()
          : (entry && typeof entry.value === 'string' ? entry.value.trim() : '');
        if (!value) {
          return null;
        }
        return { value: value, label: value };
      })
      .filter(Boolean);
  }

  function fetchModels(apiUrl) {
    return fetch(apiUrl + '?action=ai_models', { credentials: 'same-origin' })
      .then(function (response) {
        if (!response || !response.ok) {
          throw new Error('models_failed');
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload || payload.ok !== true) {
          throw new Error('models_invalid');
        }
        return normalizeModelList(payload.models);
      })
      .catch(function () {
        return FALLBACK_MODEL_OPTIONS.slice();
      });
  }

  function autoHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  function createMessage(role, text, isError) {
    var msg = createElement('div', 'ai-chat-msg ai-chat-msg--' + role + (isError ? ' ai-chat-msg--error' : ''));
    msg.innerHTML = escapeHtml(text || '');
    return msg;
  }

  function closeWithAnimation(root) {
    root.classList.add('ai-chat-modal--closing');
    setTimeout(function () {
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }, 180);
  }

  function fileToText(file) {
    return new Promise(function (resolve) {
      if (!file || typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      if ((file.size || 0) > MAX_FILE_SIZE_BYTES) {
        resolve('[Файл слишком большой для промпта]');
        return;
      }
      if (isPdfLike(file)) {
        var pdfReader = new FileReader();
        pdfReader.onload = function () {
          extractPdfText(pdfReader.result).then(resolve).catch(function () {
            resolve('[Не удалось извлечь текст из PDF]');
          });
        };
        pdfReader.onerror = function () {
          resolve('');
        };
        pdfReader.readAsArrayBuffer(file);
        return;
      }
      if (!isTextLike(file)) {
        resolve('');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === 'string' ? reader.result.slice(0, MAX_EXTRACT_CHARS) : '');
      };
      reader.onerror = function () {
        resolve('');
      };
      reader.readAsText(file);
    });
  }

  function ensurePdfJsLoaded() {
    if (pdfJsReadyPromise) {
      return pdfJsReadyPromise;
    }
    pdfJsReadyPromise = new Promise(function (resolve, reject) {
      if (typeof window === 'undefined') {
        reject(new Error('no_window'));
        return;
      }
      if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
        resolve(window.pdfjsLib);
        return;
      }

      var scriptCandidates = getPdfScriptCandidates();
      var workerCandidates = getPdfWorkerCandidates();

      function applyWorkerSrc() {
        if (!window.pdfjsLib || !window.pdfjsLib.GlobalWorkerOptions) {
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerCandidates[0];
      }

      function tryLoad(index) {
        if (index >= scriptCandidates.length) {
          reject(new Error('pdfjs_load_failed'));
          return;
        }
        var src = scriptCandidates[index];
        var script = document.createElement('script');
        script.async = true;
        script.src = src;
        script.setAttribute('data-ai-pdfjs', '1');
        script.onload = function () {
          if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== 'function') {
            tryLoad(index + 1);
            return;
          }
          applyWorkerSrc();
          resolve(window.pdfjsLib);
        };
        script.onerror = function () {
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
          tryLoad(index + 1);
        };
        document.head.appendChild(script);
      }

      tryLoad(0);
    }).catch(function (error) {
      pdfJsReadyPromise = null;
      throw error;
    });
    return pdfJsReadyPromise;
  }

  function getPdfAssetBasePaths() {
    var bases = [];
    var scriptEl = document.querySelector('script[src*="docs-ai-response-modal.js"]');
    if (scriptEl && scriptEl.src) {
      var normalized = String(scriptEl.src).replace(/\/docs-ai-response-modal\.js(?:\?.*)?$/i, '/');
      bases.push(normalized);
    }
    bases.push(window.location.origin + '/js/documents/');
    bases.push(window.location.origin + '/');
    return Array.from(new Set(bases));
  }

  function getPdfScriptCandidates() {
    var bases = getPdfAssetBasePaths();
    var candidates = [];
    bases.forEach(function (base) {
      candidates.push(base + 'pdf/pdf.min.js');
    });
    candidates.push('/js/documents/pdf/pdf.min.js');
    candidates.push('/pdf/pdf.min.js');
    return Array.from(new Set(candidates));
  }

  function getPdfWorkerCandidates() {
    var bases = getPdfAssetBasePaths();
    var candidates = [];
    bases.forEach(function (base) {
      candidates.push(base + 'pdf/pdf.worker.min.js');
    });
    candidates.push('/js/documents/pdf/pdf.worker.min.js');
    candidates.push('/pdf/pdf.worker.min.js');
    return Array.from(new Set(candidates));
  }

  function ensurePdfLibLoaded() {
    if (pdfLibReadyPromise) {
      return pdfLibReadyPromise;
    }
    pdfLibReadyPromise = new Promise(function (resolve, reject) {
      if (typeof window === 'undefined') {
        reject(new Error('no_window'));
        return;
      }
      if (window.PDFLib && window.PDFLib.PDFDocument) {
        resolve(window.PDFLib);
        return;
      }
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = function () {
        if (window.PDFLib && window.PDFLib.PDFDocument) {
          resolve(window.PDFLib);
        } else {
          reject(new Error('pdf_lib_missing'));
        }
      };
      script.onerror = function () {
        reject(new Error('pdf_lib_load_failed'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      pdfLibReadyPromise = null;
      throw error;
    });
    return pdfLibReadyPromise;
  }

  function ensurePdfFontkitLoaded() {
    if (pdfFontkitReadyPromise) {
      return pdfFontkitReadyPromise;
    }
    pdfFontkitReadyPromise = new Promise(function (resolve, reject) {
      if (typeof window === 'undefined') {
        reject(new Error('no_window'));
        return;
      }
      if (window.fontkit) {
        resolve(window.fontkit);
        return;
      }
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
      script.onload = function () {
        if (window.fontkit) {
          resolve(window.fontkit);
        } else {
          reject(new Error('fontkit_missing'));
        }
      };
      script.onerror = function () {
        reject(new Error('fontkit_load_failed'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      pdfFontkitReadyPromise = null;
      throw error;
    });
    return pdfFontkitReadyPromise;
  }

  function ensureMammothLoaded() {
    if (mammothReadyPromise) {
      return mammothReadyPromise;
    }
    mammothReadyPromise = new Promise(function (resolve, reject) {
      if (window.mammoth) {
        resolve(window.mammoth);
        return;
      }
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
      script.onload = function () {
        if (window.mammoth) {
          resolve(window.mammoth);
        } else {
          reject(new Error('mammoth_missing'));
        }
      };
      script.onerror = function () { reject(new Error('mammoth_load_failed')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      mammothReadyPromise = null;
      throw error;
    });
    return mammothReadyPromise;
  }

  function ensureDocxLibraryLoaded() {
    if (docxReadyPromise) {
      return docxReadyPromise;
    }
    docxReadyPromise = new Promise(function (resolve, reject) {
      if (window.docx && window.docx.Document) {
        resolve(window.docx);
        return;
      }
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
      script.onload = function () {
        if (window.docx && window.docx.Document) {
          resolve(window.docx);
        } else {
          reject(new Error('docx_lib_missing'));
        }
      };
      script.onerror = function () { reject(new Error('docx_lib_load_failed')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      docxReadyPromise = null;
      throw error;
    });
    return docxReadyPromise;
  }

  async function fetchTemplatePdfBytes() {
    for (var i = 0; i < TEMPLATE_PDF_CANDIDATES.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      var response = await fetch(TEMPLATE_PDF_CANDIDATES[i], { credentials: 'same-origin' }).catch(function () { return null; });
      if (response && response.ok) {
        // eslint-disable-next-line no-await-in-loop
        return response.arrayBuffer();
      }
    }
    throw new Error('Шаблон PDF не найден по пути /app/templates/template.pdf');
  }

  async function fetchTemplateText() {
    try {
      var bytes = await fetchTemplatePdfBytes();
      return extractPdfText(bytes);
    } catch (error) {
      return '';
    }
  }

  async function fetchDocxTemplateText() {
    var candidates = ['/app/templates/template.docx', '/templates/template.docx'];
    for (var i = 0; i < candidates.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      var response = await fetch(candidates[i], { credentials: 'same-origin' }).catch(function () { return null; });
      if (response && response.ok) {
        // eslint-disable-next-line no-await-in-loop
        var bytes = await response.arrayBuffer();
        // eslint-disable-next-line no-await-in-loop
        var mammoth = await ensureMammothLoaded();
        // eslint-disable-next-line no-await-in-loop
        var result = await mammoth.extractRawText({ arrayBuffer: bytes });
        return result && result.value ? String(result.value) : '';
      }
    }
    return '';
  }

  function mergeAnswerIntoTemplateMiddle(templateText, answerText) {
    var cleanAnswer = String(answerText || '').trim();
    if (!cleanAnswer) {
      return String(templateText || '').trim();
    }
    var lines = String(templateText || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
    if (lines.length < 6) {
      return (String(templateText || '').trim() + '\n\n' + cleanAnswer).trim();
    }
    var middleIndex = Math.floor(lines.length / 2);
    return [
      lines.slice(0, middleIndex).join('\n'),
      '',
      cleanAnswer,
      '',
      lines.slice(middleIndex).join('\n')
    ].join('\n').trim();
  }

  async function fetchCyrillicFontBytes() {
    for (var i = 0; i < CYRILLIC_FONT_CANDIDATES.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      var response = await fetch(CYRILLIC_FONT_CANDIDATES[i], { credentials: 'omit' }).catch(function () { return null; });
      if (response && response.ok) {
        // eslint-disable-next-line no-await-in-loop
        return response.arrayBuffer();
      }
    }
    throw new Error('Не удалось загрузить шрифт для кириллицы');
  }

  function splitTextByWidth(text, font, size, maxWidth) {
    var content = String(text || '').replace(/\r/g, '').trim();
    if (!content) {
      return ['Ответ пустой.'];
    }
    var lines = [];
    content.split('\n').forEach(function (rawParagraph) {
      var paragraph = rawParagraph.trim();
      if (!paragraph) {
        lines.push('');
        return;
      }
      var words = paragraph.split(/\s+/);
      var current = '';
      words.forEach(function (word) {
        var candidate = current ? (current + ' ' + word) : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
          return;
        }
        if (current) {
          lines.push(current);
        }
        current = word;
        while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
          var part = current.slice(0, Math.max(1, Math.floor(current.length / 2)));
          if (font.widthOfTextAtSize(part, size) <= maxWidth) {
            lines.push(part);
            current = current.slice(part.length);
          } else {
            current = current.slice(0, Math.max(1, current.length - 1));
          }
        }
      });
      if (current) {
        lines.push(current);
      }
    });
    return lines;
  }

  async function buildTemplatePdfWithAnswer(answerText) {
    var PDFLib = await ensurePdfLibLoaded();
    var fontkit = await ensurePdfFontkitLoaded();
    var bytes = await fetchTemplatePdfBytes();
    var pdfDoc = await PDFLib.PDFDocument.load(bytes);
    pdfDoc.registerFontkit(fontkit);
    var fontBytes = await fetchCyrillicFontBytes();
    var textFont = await pdfDoc.embedFont(fontBytes, { subset: true });
    var pages = pdfDoc.getPages();
    var page = pages && pages.length ? pages[0] : pdfDoc.addPage();
    var pageWidth = page.getWidth();
    var pageHeight = page.getHeight();
    var margin = 30;
    var boxX = margin;
    var boxY = margin;
    var boxWidth = pageWidth - margin * 2;
    var boxHeight = pageHeight - margin * 2;
    var titleSize = 13;
    var textSize = 10;
    var lineHeight = 13;
    var textTopPadding = 38;
    var textBottomPadding = 14;
    var maxTextWidth = boxWidth - 24;
    var minY = boxY + textBottomPadding;
    var maxY = boxY + boxHeight - textTopPadding;
    var lines = splitTextByWidth(answerText, textFont, textSize, maxTextWidth);
    var lineIndex = 0;

    while (lineIndex < lines.length) {
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        color: PDFLib.rgb(0.98, 0.99, 1),
        borderWidth: 1,
        borderColor: PDFLib.rgb(0.82, 0.88, 0.96),
        opacity: 0.95
      });
      page.drawText('Ответ ИИ', {
        x: boxX + 12,
        y: boxY + boxHeight - 24,
        size: titleSize,
        font: textFont,
        color: PDFLib.rgb(0.12, 0.23, 0.42)
      });

      var y = maxY;
      while (lineIndex < lines.length && y >= minY) {
        page.drawText(lines[lineIndex], {
          x: boxX + 12,
          y: y,
          size: textSize,
          font: textFont,
          color: PDFLib.rgb(0.09, 0.13, 0.2)
        });
        y -= lineHeight;
        lineIndex += 1;
      }
      if (lineIndex < lines.length) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
      }
    }
    return pdfDoc.save();
  }

  async function buildDocxBlobFromText(textValue) {
    var docx = await ensureDocxLibraryLoaded();
    var text = String(textValue || '').replace(/\r/g, '');
    var lines = text.split('\n');
    var paragraphs = lines.map(function (line) {
      return new docx.Paragraph({ text: line || ' ' });
    });
    var document = new docx.Document({
      sections: [{ properties: {}, children: paragraphs }]
    });
    return docx.Packer.toBlob(document);
  }

  async function extractPdfText(source) {
    try {
      var pdfjsLib = await ensurePdfJsLoaded();
      var loadingTask = pdfjsLib.getDocument({ data: source });
      var pdf = await loadingTask.promise;
      var maxPages = Math.max(pdf.numPages || 0, 0);
      var parts = [];
      for (var pageNum = 1; pageNum <= maxPages; pageNum += 1) {
        // eslint-disable-next-line no-await-in-loop
        var page = await pdf.getPage(pageNum);
        // eslint-disable-next-line no-await-in-loop
        var textContent = await page.getTextContent();
        var line = (textContent.items || []).map(function (item) {
          return item && item.str ? item.str : '';
        }).join(' ').replace(/\s+/g, ' ').trim();
        if (line) {
          parts.push('Страница ' + pageNum + ': ' + line);
        }
        if (parts.join('\n').length >= MAX_EXTRACT_CHARS) {
          break;
        }
      }
      var fullText = parts.join('\n').slice(0, MAX_EXTRACT_CHARS);
      return fullText || '[В PDF не найден извлекаемый текст]';
    } catch (error) {
      return '[Не удалось извлечь текст из PDF]';
    }
  }

  async function fetchExternalFileContent(file) {
    if (!file || !file.url) {
      return '';
    }
    try {
      var response = await fetch(file.url, { credentials: 'same-origin' });
      if (!response.ok) {
        return '';
      }
      if (isPdfLike(file)) {
        var buffer = await response.arrayBuffer();
        return extractPdfText(buffer);
      }
      if (!isTextLike(file)) {
        return '';
      }
      var rawText = await response.text();
      return String(rawText || '').slice(0, MAX_EXTRACT_CHARS);
    } catch (error) {
      return '';
    }
  }

  function buildRequestBlueprint(userText, state, config) {
    var context = {};
    if (config.context && typeof config.context === 'object') {
      Object.keys(config.context).forEach(function (key) {
        context[key] = config.context[key];
      });
    }

    context.selectedModel = state.model;
    context.responseStyle = state.responseStyle;
    context.aiBehavior = state.aiBehavior;
    context.attachedFiles = state.files.map(function (file) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url || '',
        content: file.content || ''
      };
    });

    var formData = new FormData();
    formData.append('action', 'ai_response_analyze');
    formData.append('documentTitle', config.documentTitle || '');
    formData.append('prompt', userText);
    formData.append('model', state.model);
    formData.append('responseStyle', state.responseStyle);
    formData.append('aiBehavior', state.aiBehavior || '');
    formData.append('context', JSON.stringify(context));

    state.files.forEach(function (file) {
      if (file.fileObject) {
        formData.append('attachments[]', file.fileObject, file.name);
      }
    });

    return formData;
  }

  async function hydrateFileContents(state) {
    for (var i = 0; i < state.files.length; i += 1) {
      if (state.files[i].content) {
        continue;
      }
      if (state.files[i].fileObject) {
        // eslint-disable-next-line no-await-in-loop
        state.files[i].content = await fileToText(state.files[i].fileObject);
      } else if (state.files[i].url) {
        // eslint-disable-next-line no-await-in-loop
        state.files[i].content = await fetchExternalFileContent(state.files[i]);
      }
    }
  }

  function openDocumentsAiResponseModal(options) {
    ensureStyles();

    var config = options && typeof options === 'object' ? options : {};
    var state = {
      files: []
        .concat(normalizeFileObjects(config.pendingFiles || []))
        .concat(normalizeExternalFiles(config.files || [], 'external'))
        .concat(normalizeExternalFiles(config.linkedFiles || [], 'linked')),
      models: FALLBACK_MODEL_OPTIONS.slice(),
      model: FALLBACK_MODEL_OPTIONS[0].value,
      responseStyle: STYLE_OPTIONS[0].value,
      aiBehavior: typeof config.aiBehavior === 'string' ? config.aiBehavior.trim() : '',
      isLoading: false,
      lastAiResponse: '',
      templateObjectUrl: '',
      templateSourceText: '',
      templateEditorReady: false
    };

    var root = createElement('div', ROOT_CLASS);
    var panel = createElement('div', 'ai-chat-modal__panel');
    var header = createElement('div', 'ai-chat-modal__header');
    var titleWrap = createElement('div');
    titleWrap.appendChild(createElement('div', 'ai-chat-modal__title', 'Ответ с помощью ИИ'));
    titleWrap.appendChild(createElement('div', 'ai-chat-modal__subtitle', config.documentTitle ? ('Документ: ' + config.documentTitle) : 'Документ не указан'));

    var closeButton = createElement('button', 'ai-chat-modal__close', '×');
    closeButton.type = 'button';

    var content = createElement('div', 'ai-chat-modal__content');
    var contextBox = createElement('div', 'ai-chat-modal__context');
    contextBox.appendChild(createElement('div', 'ai-chat-modal__context-title', 'Контекст и файлы'));
    var filesWrap = createElement('div', 'ai-chat-modal__files');
    var attachButton = createElement('button', 'ai-chat-modal__attach', '+ Прикрепить файл');
    attachButton.type = 'button';

    var hiddenInput = document.getElementById(FILE_INPUT_ID);
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.id = FILE_INPUT_ID;
      hiddenInput.type = 'file';
      hiddenInput.multiple = true;
      hiddenInput.style.display = 'none';
      document.body.appendChild(hiddenInput);
    }

    var settings = createElement('div', 'ai-chat-modal__settings');
    var modelField = createElement('label', 'ai-chat-modal__field');
    modelField.appendChild(createElement('span', '', 'Модель'));
    var modelSelect = createElement('select', 'ai-chat-modal__select');

    var styleField = createElement('label', 'ai-chat-modal__field');
    styleField.appendChild(createElement('span', '', 'Стиль'));
    var styleSelect = createElement('select', 'ai-chat-modal__select');
    STYLE_OPTIONS.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      styleSelect.appendChild(option);
    });
    var behaviorField = createElement('label', 'ai-chat-modal__field ai-chat-modal__field--full');
    behaviorField.appendChild(createElement('span', '', 'Поведение ИИ'));
    var behaviorInput = createElement('input', 'ai-chat-modal__input');
    behaviorInput.type = 'text';
    behaviorInput.placeholder = 'Например: отвечай максимально кратко и по шагам';
    behaviorInput.value = state.aiBehavior;

    var messages = createElement('div', 'ai-chat-modal__messages');
    messages.appendChild(createMessage('assistant', '1) Нажмите «Прочитать файл (OCR)». 2) Проверьте текст. 3) Нажмите «Отправить в ИИ».'));
    var templateBox = createElement('div', 'ai-chat-modal__template');
    var templateStatus = createElement('div', 'ai-chat-modal__template-status', 'Шаблон: ждёт ответ ИИ');
    var templateActions = createElement('div', 'ai-chat-modal__template-actions');
    var templateSelect = createElement('select', 'ai-chat-modal__template-select');
    [{ value: 'docx', label: 'template.docx' }, { value: 'pdf', label: 'template.pdf' }].forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      templateSelect.appendChild(option);
    });
    var templateButton = createElement('button', 'ai-chat-modal__template-btn', 'Шаблон');
    templateButton.type = 'button';
    var downloadButton = createElement('button', 'ai-chat-modal__template-btn', 'Скачать PDF');
    downloadButton.type = 'button';
    downloadButton.disabled = true;
    templateBox.style.display = 'none';
    templateActions.appendChild(templateButton);
    templateActions.appendChild(downloadButton);
    templateActions.appendChild(templateSelect);
    templateBox.appendChild(templateStatus);
    templateBox.appendChild(templateActions);
    var editorWrap = createElement('div', 'ai-chat-modal__editor');
    editorWrap.appendChild(createElement('div', 'ai-chat-modal__editor-title', 'Онлайн-редактор шаблона'));
    var editorText = createElement('textarea', 'ai-chat-modal__editor-text');
    editorText.placeholder = 'Текст шаблона появится здесь...';
    editorWrap.appendChild(editorText);

    var composer = createElement('div', 'ai-chat-modal__composer');
    var textarea = createElement('textarea', 'ai-chat-modal__textarea');
    textarea.placeholder = 'Введите запрос (можно пусто — отправим OCR текст)';
    var ocrButton = createElement('button', 'ai-chat-modal__send', 'Прочитать файл (OCR)');
    ocrButton.type = 'button';
    var sendButton = createElement('button', 'ai-chat-modal__send', 'Отправить в ИИ');
    sendButton.type = 'button';

    function renderModelOptions() {
      modelSelect.innerHTML = '';
      state.models.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        modelSelect.appendChild(option);
      });
      modelSelect.value = state.model;
    }

    function renderFiles() {
      filesWrap.innerHTML = '';
      if (!state.files.length) {
        filesWrap.appendChild(createElement('div', 'ai-chat-modal__empty', 'Нет прикреплённых файлов'));
        return;
      }
      state.files.forEach(function (file) {
        var chip = createElement('div', 'ai-chat-chip');
        chip.innerHTML = '<span>' + detectIcon(file) + '</span><span>' + escapeHtml(file.name) + '</span><span class="ai-chat-chip__meta">' + escapeHtml(formatSize(file.size)) + '</span>';
        var remove = createElement('button', 'ai-chat-chip__remove', '×');
        remove.type = 'button';
        remove.addEventListener('click', function () {
          state.files = state.files.filter(function (entry) {
            return entry.id !== file.id;
          });
          renderFiles();
        });
        chip.appendChild(remove);
        filesWrap.appendChild(chip);
      });
    }

    function setLoading(loading) {
      state.isLoading = loading;
      textarea.disabled = loading;
      ocrButton.disabled = loading;
      sendButton.disabled = loading;
      templateButton.disabled = loading;
      downloadButton.disabled = loading || !state.templateObjectUrl;
      templateSelect.disabled = loading;
      if (loading) {
        ocrButton.innerHTML = '<span class="ai-chat-spinner"></span>Обработка';
        sendButton.innerHTML = '<span class="ai-chat-spinner"></span>Отправка';
      } else {
        ocrButton.textContent = 'Прочитать файл (OCR)';
        sendButton.textContent = 'Отправить в ИИ';
      }
    }

    function getFirstUploadableFile() {
      for (var i = 0; i < state.files.length; i += 1) {
        if (state.files[i] && (state.files[i].fileObject || state.files[i].url)) {
          return state.files[i];
        }
      }
      return null;
    }

    async function runOcr() {
      if (state.isLoading) {
        return;
      }
      var fileEntry = getFirstUploadableFile();
      if (!fileEntry) {
        messages.appendChild(createMessage('assistant', 'Не найден файл для OCR. Прикрепите файл или откройте документ с вложением.', true));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      if (fileEntry.content && String(fileEntry.content).trim() !== '') {
        messages.appendChild(createMessage('assistant', 'Текст уже доступен:\n' + String(fileEntry.content)));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      var pending = createElement('div', 'ai-chat-msg ai-chat-msg--assistant');
      pending.innerHTML = '<span class="ai-chat-spinner"></span>Читаю файл через OCR...';
      messages.appendChild(pending);
      messages.scrollTop = messages.scrollHeight;
      setLoading(true);
      try {
        var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
        var formData = new FormData();
        formData.append('action', 'ocr_extract');
        formData.append('language', 'rus');
        if (fileEntry.fileObject) {
          formData.append('file', fileEntry.fileObject, fileEntry.name || 'document.pdf');
        } else if (fileEntry.url) {
          formData.append('file_url', String(fileEntry.url));
        }
        var response = await fetch(apiUrl + '?action=ocr_extract', {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });
        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка OCR (' + response.status + ')'));
        }
        var extractedText = String(payload.text || '').trim();
        if (!extractedText) {
          throw new Error('OCR не вернул текст. Проверьте качество файла.');
        }
        fileEntry.content = extractedText;
        pending.remove();
        messages.appendChild(createMessage('assistant', 'OCR текст:\n' + extractedText));
      } catch (error) {
        pending.remove();
        messages.appendChild(createMessage('assistant', 'Ошибка OCR: ' + (error && error.message ? error.message : 'Не удалось распознать текст.'), true));
      } finally {
        setLoading(false);
        messages.scrollTop = messages.scrollHeight;
      }
    }

    function closeModal() {
      document.removeEventListener('keydown', onEsc);
      hiddenInput.value = '';
      if (state.templateObjectUrl) {
        URL.revokeObjectURL(state.templateObjectUrl);
        state.templateObjectUrl = '';
      }
      closeWithAnimation(root);
    }

    function onEsc(event) {
      if (event.key === 'Escape') {
        closeModal();
      }
    }


    async function regenerateTemplatePdf(textValue, successLabel) {
      var pdfBytes = await buildTemplatePdfWithAnswer(textValue);
      var blob = new Blob([pdfBytes], { type: 'application/pdf' });
      if (state.templateObjectUrl) {
        URL.revokeObjectURL(state.templateObjectUrl);
      }
      state.templateObjectUrl = URL.createObjectURL(blob);
      downloadButton.disabled = false;
      templateStatus.textContent = successLabel || 'Шаблон: PDF готов, можно скачать';
    }


    async function sendMessage() {
      var value = String(textarea.value || '').trim();
      if (state.isLoading) {
        return;
      }
      var hasFileContent = state.files.some(function (file) {
        return file && typeof file.content === 'string' && file.content.trim() !== '';
      });
      if (!value && !hasFileContent) {
        messages.appendChild(createMessage('assistant', 'Добавьте текст запроса или сначала нажмите «Прочитать файл (OCR)».', true));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      var effectivePrompt = value || 'Сформируй официальный ответ на основе OCR-текста файла.';

      state.model = modelSelect.value;
      state.responseStyle = styleSelect.value;
      state.aiBehavior = String(behaviorInput.value || '').trim();

      messages.appendChild(createMessage('user', effectivePrompt));
      var pending = createElement('div', 'ai-chat-msg ai-chat-msg--assistant');
      pending.innerHTML = '<span class="ai-chat-spinner"></span>ИИ готовит ответ...';
      messages.appendChild(pending);
      messages.scrollTop = messages.scrollHeight;
      setLoading(true);

      try {
        await hydrateFileContents(state);
        var apiUrl = config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php';
        var response = await fetch(apiUrl + '?action=ai_response_analyze', {
          method: 'POST',
          credentials: 'same-origin',
          body: buildRequestBlueprint(effectivePrompt, state, config)
        });

        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка API (' + response.status + ')'));
        }

        pending.remove();
        var aiText = payload.response || payload.analysis || 'Пустой ответ от API.';
        state.lastAiResponse = String(aiText);
        state.templateEditorReady = false;
        templateBox.style.display = 'flex';
        templateStatus.textContent = 'Шаблон: ответ получен, можно создать PDF';
        messages.appendChild(createMessage('assistant', aiText));
        textarea.value = '';
        autoHeight(textarea);
      } catch (error) {
        pending.remove();
        messages.appendChild(createMessage('assistant', 'Ошибка: ' + (error && error.message ? error.message : 'Не удалось получить ответ.'), true));
      } finally {
        setLoading(false);
        messages.scrollTop = messages.scrollHeight;
      }
    }

    modelSelect.addEventListener('change', function () {
      state.model = modelSelect.value;
    });

    styleSelect.addEventListener('change', function () {
      state.responseStyle = styleSelect.value;
    });
    templateSelect.addEventListener('change', function () {
      state.templateEditorReady = false;
      editorWrap.classList.remove('ai-chat-modal__editor--visible');
      editorText.value = '';
      templateStatus.textContent = 'Шаблон: выберите и нажмите «Шаблон»';
    });
    behaviorInput.addEventListener('input', function () {
      state.aiBehavior = String(behaviorInput.value || '').trim();
    });

    textarea.addEventListener('input', function () {
      autoHeight(textarea);
    });

    textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    ocrButton.addEventListener('click', runOcr);
    sendButton.addEventListener('click', sendMessage);
      templateButton.addEventListener('click', async function () {
      if (!state.lastAiResponse || !state.lastAiResponse.trim()) {
        messages.appendChild(createMessage('assistant', 'Сначала получите ответ от ИИ, затем нажмите «Шаблон».', true));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      setLoading(true);
      templateStatus.textContent = 'Шаблон: формирую PDF...';
      try {
        if (!state.templateEditorReady) {
          state.templateSourceText = templateSelect.value === 'docx'
            ? await fetchDocxTemplateText()
            : await fetchTemplateText();
          state.templateEditorReady = true;
        }
        var mergedText = mergeAnswerIntoTemplateMiddle(state.templateSourceText, state.lastAiResponse);
        if (!mergedText.trim()) {
          throw new Error('Не удалось подготовить текст для шаблона');
        }
        editorText.value = mergedText;
        editorWrap.classList.add('ai-chat-modal__editor--visible');
        if (templateSelect.value === 'docx') {
          var docxBlob = await buildDocxBlobFromText(editorText.value);
          if (state.templateObjectUrl) {
            URL.revokeObjectURL(state.templateObjectUrl);
          }
          state.templateObjectUrl = URL.createObjectURL(docxBlob);
          downloadButton.disabled = false;
          templateStatus.textContent = 'Шаблон: DOCX подготовлен и открыт';
        } else {
          await regenerateTemplatePdf(editorText.value, 'Шаблон: PDF открыт в новой вкладке');
        }
        var tab = window.open(state.templateObjectUrl, '_blank');
        if (!tab) {
          templateStatus.textContent = 'Шаблон: вкладка заблокирована, используйте кнопку «Скачать PDF»';
        }
      } catch (error) {
        templateStatus.textContent = 'Шаблон: ошибка';
        messages.appendChild(createMessage('assistant', 'Ошибка шаблона: ' + (error && error.message ? error.message : 'Не удалось собрать PDF.'), true));
        messages.scrollTop = messages.scrollHeight;
      } finally {
        setLoading(false);
      }
    });
    downloadButton.addEventListener('click', function () {
      if (!state.templateObjectUrl) {
        messages.appendChild(createMessage('assistant', 'Сначала сгенерируйте PDF кнопкой «Шаблон».', true));
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      var link = document.createElement('a');
      link.href = state.templateObjectUrl;
      link.download = templateSelect.value === 'docx' ? 'ai-template-response.docx' : 'ai-template-response.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    closeButton.addEventListener('click', closeModal);

    attachButton.addEventListener('click', function () {
      hiddenInput.click();
    });

    hiddenInput.addEventListener('change', function () {
      var selected = hiddenInput.files ? Array.from(hiddenInput.files) : [];
      if (!selected.length) {
        return;
      }
      state.files = state.files.concat(normalizeFileObjects(selected));
      hiddenInput.value = '';
      renderFiles();
    });

    root.addEventListener('click', function (event) {
      if (event.target === root) {
        closeModal();
      }
    });

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    contextBox.appendChild(filesWrap);
    contextBox.appendChild(attachButton);

    modelField.appendChild(modelSelect);
    styleField.appendChild(styleSelect);
    settings.appendChild(modelField);
    settings.appendChild(styleField);
    behaviorField.appendChild(behaviorInput);
    settings.appendChild(behaviorField);

    composer.appendChild(textarea);
    composer.appendChild(ocrButton);
    composer.appendChild(sendButton);

    content.appendChild(contextBox);
    content.appendChild(settings);
    content.appendChild(templateBox);
    content.appendChild(editorWrap);
    content.appendChild(messages);
    content.appendChild(composer);

    panel.appendChild(header);
    panel.appendChild(content);
    root.appendChild(panel);
    document.body.appendChild(root);

    requestAnimationFrame(function () {
      root.classList.add('ai-chat-modal--visible');
    });

    renderFiles();
    renderModelOptions();

    fetchModels(config.apiUrl || window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php').then(function (models) {
      state.models = models;
      if (!models.some(function (entry) { return entry.value === state.model; })) {
        state.model = models[0] ? models[0].value : state.model;
      }
      renderModelOptions();
    });

    autoHeight(textarea);
    document.addEventListener('keydown', onEsc);
    setTimeout(function () {
      textarea.focus();
    }, 0);
  }

  if (typeof window !== 'undefined') {
    window.openDocumentsAiResponseModal = openDocumentsAiResponseModal;
  }
})();
