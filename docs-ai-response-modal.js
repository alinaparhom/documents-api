(function () {
  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (typeof text === 'string') {
      element.textContent = text;
    }
    return element;
  }

  function ensureStyle() {
    if (document.getElementById('documents-ai-response-style')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'documents-ai-response-style';
    style.textContent = '' +
      '.documents-ai-modal{position:fixed;inset:0;z-index:1700;background:rgba(15,23,42,0.24);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;}' +
      '.documents-ai-modal__panel{width:min(780px,100%);max-height:min(92vh,900px);overflow:auto;display:flex;flex-direction:column;gap:12px;background:rgba(255,255,255,0.86);border:1px solid rgba(255,255,255,0.72);border-radius:20px;box-shadow:0 24px 56px rgba(15,23,42,0.2);padding:14px;}' +
      '.documents-ai-modal__title{font-size:17px;font-weight:700;color:#0f172a;}' +
      '.documents-ai-modal__desc{font-size:12px;color:#64748b;line-height:1.45;}' +
      '.documents-ai-modal__section{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:14px;background:rgba(255,255,255,0.66);border:1px solid rgba(148,163,184,0.24);}' +
      '.documents-ai-modal__field{display:flex;flex-direction:column;gap:6px;}' +
      '.documents-ai-modal__label{font-size:12px;color:#475569;font-weight:600;}' +
      '.documents-ai-modal__upload{display:flex;align-items:center;justify-content:center;min-height:44px;padding:10px;border:1px dashed rgba(37,99,235,0.45);border-radius:12px;background:rgba(59,130,246,0.08);font-size:13px;font-weight:600;color:#1d4ed8;cursor:pointer;}' +
      '.documents-ai-modal__file-input{display:none;}' +
      '.documents-ai-modal__textarea{width:100%;min-height:110px;resize:vertical;border:1px solid rgba(148,163,184,0.35);border-radius:14px;background:rgba(255,255,255,0.86);padding:12px;font-size:14px;color:#0f172a;box-sizing:border-box;}' +
      '.documents-ai-modal__textarea:focus{outline:none;border-color:rgba(37,99,235,0.6);box-shadow:0 0 0 3px rgba(37,99,235,0.1);}' +
      '.documents-ai-modal__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}' +
      '.documents-ai-modal__status{font-size:12px;color:#0369a1;min-height:16px;}' +
      '.documents-ai-modal__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}' +
      '.documents-ai-modal__button{border:1px solid rgba(148,163,184,0.34);background:rgba(255,255,255,0.72);border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;min-height:42px;}' +
      '.documents-ai-modal__button:disabled{opacity:.5;cursor:not-allowed;}' +
      '.documents-ai-modal__button--primary{background:linear-gradient(135deg, rgba(37,99,235,0.9), rgba(14,165,233,0.9));border-color:transparent;color:#fff;}' +
      '.documents-ai-modal__button--ghost{background:rgba(59,130,246,0.1);color:#1d4ed8;border-color:rgba(37,99,235,0.3);}' +
      '.documents-ai-modal__button--danger{background:rgba(220,38,38,0.08);color:#b91c1c;border-color:rgba(220,38,38,0.25);}' +
      '@media (max-width:768px){' +
      '.documents-ai-modal{padding:8px;align-items:flex-end;}' +
      '.documents-ai-modal__panel{width:100%;max-height:calc(100vh - 12px);border-radius:18px;padding:12px;}' +
      '.documents-ai-modal__grid{grid-template-columns:1fr;}' +
      '.documents-ai-modal__actions .documents-ai-modal__button{flex:1 1 calc(50% - 8px);}' +
      '.documents-ai-modal__textarea{min-height:96px;font-size:16px;}' +
      '}';
    document.head.appendChild(style);
  }

  function wrapText(text, maxChars) {
    var words = String(text || '').split(/\s+/);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i += 1) {
      var candidate = line ? line + ' ' + words[i] : words[i];
      if (candidate.length > maxChars) {
        lines.push(line || words[i]);
        line = line ? words[i] : '';
      } else {
        line = candidate;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines;
  }

  function escapePdfText(text) {
    return String(text || '').replace(/[()\\]/g, '\\$&');
  }

  function buildSimplePdfBlob(text) {
    var lines = wrapText(text, 85);
    var streamLines = ['BT', '/F1 12 Tf', '50 770 Td'];

    for (var i = 0; i < lines.length; i += 1) {
      if (i > 0) {
        streamLines.push('0 -16 Td');
      }
      streamLines.push('(' + escapePdfText(lines[i]) + ') Tj');
    }

    streamLines.push('ET');
    var stream = streamLines.join('\n');
    var objects = [
      '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
      '2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj',
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj',
      '4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
      '5 0 obj<< /Length ' + stream.length + ' >>stream\n' + stream + '\nendstream endobj'
    ];

    var header = '%PDF-1.4\n';
    var body = '';
    var offsets = [0];

    for (var index = 0; index < objects.length; index += 1) {
      offsets.push((header + body).length);
      body += objects[index] + '\n';
    }

    var xrefStart = (header + body).length;
    var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (var x = 1; x < offsets.length; x += 1) {
      xref += String(offsets[x]).padStart(10, '0') + ' 00000 n \n';
    }

    var trailer = 'trailer<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';
    return new Blob([header + body + xref + trailer], { type: 'application/pdf' });
  }

  async function createPdfFromTemplate(config, text) {
    if (!window.PDFLib) {
      throw new Error('Для шаблона PDF подключите PDFLib.');
    }

    var response = await fetch(config.templatePdfUrl);
    if (!response.ok) {
      throw new Error('Шаблон PDF не загружен.');
    }

    var bytes = await response.arrayBuffer();
    var pdfDoc = await window.PDFLib.PDFDocument.load(bytes);
    var page = pdfDoc.getPage(0);
    var lines = wrapText(text, Number(config.maxCharsPerLine || 75));
    var baseX = Number(config.textX || 60);
    var baseY = Number(config.textY || (page.getHeight() - 220));
    var size = Number(config.fontSize || 12);

    for (var i = 0; i < lines.length; i += 1) {
      page.drawText(lines[i], {
        x: baseX,
        y: baseY - i * (size + 4),
        size: size,
        maxWidth: page.getWidth() - baseX * 2
      });
    }

    var out = await pdfDoc.save();
    return new Blob([out], { type: 'application/pdf' });
  }

  var envCache = null;
  async function loadAiEnvConfig() {
    if (envCache) {
      return envCache;
    }

    try {
      var response = await fetch('/app/.env', { cache: 'no-store' });
      if (!response.ok) {
        envCache = { AI_API_KEY: '', AI_MODEL: '' };
        return envCache;
      }
      var raw = await response.text();
      var result = { AI_API_KEY: '', AI_MODEL: '' };
      raw.split(/\r?\n/).forEach(function (line) {
        var trimmed = line.trim();
        if (!trimmed || trimmed.charAt(0) === '#') {
          return;
        }
        var separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
          return;
        }
        var key = trimmed.slice(0, separatorIndex).trim();
        var value = trimmed.slice(separatorIndex + 1).trim();
        if (key === 'AI_API_KEY') {
          result.AI_API_KEY = value;
        }
        if (key === 'AI_MODEL') {
          result.AI_MODEL = value;
        }
      });
      envCache = result;
      return envCache;
    } catch (error) {
      envCache = { AI_API_KEY: '', AI_MODEL: '' };
      return envCache;
    }
  }

  window.openDocumentsAiResponseModal = function (options) {
    ensureStyle();

    var config = options || {};
    var selectedFile = null;
    var selectedTone = 'neutral';
    var generatedBlob = null;

    var modal = createElement('div', 'documents-ai-modal');
    var panel = createElement('div', 'documents-ai-modal__panel');
    var title = createElement('div', 'documents-ai-modal__title', 'ИИ-ответ по документу');
    var desc = createElement('div', 'documents-ai-modal__desc', '1) Загрузите документ. 2) Получите 2 стиля ответа. 3) Отредактируйте и соберите PDF.');

    var uploadSection = createElement('div', 'documents-ai-modal__section');
    var uploadLabel = createElement('label', 'documents-ai-modal__upload', '📎 Загрузить файл (PDF, DOCX, TXT, изображение)');
    var uploadInput = createElement('input', 'documents-ai-modal__file-input');
    var fileName = createElement('div', 'documents-ai-modal__desc', 'Файл не выбран');
    uploadInput.type = 'file';
    uploadInput.accept = '.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp';
    uploadLabel.htmlFor = 'documents-ai-file-input';
    uploadInput.id = 'documents-ai-file-input';

    var status = createElement('div', 'documents-ai-modal__status', '');

    var responseSection = createElement('div', 'documents-ai-modal__section');
    var grid = createElement('div', 'documents-ai-modal__grid');

    var neutralField = createElement('div', 'documents-ai-modal__field');
    neutralField.appendChild(createElement('div', 'documents-ai-modal__label', 'Нейтральный стиль'));
    var neutralInput = createElement('textarea', 'documents-ai-modal__textarea');
    neutralInput.placeholder = 'Здесь будет нейтральный вариант';
    neutralField.appendChild(neutralInput);

    var aggressiveField = createElement('div', 'documents-ai-modal__field');
    aggressiveField.appendChild(createElement('div', 'documents-ai-modal__label', 'Агрессивный стиль'));
    var aggressiveInput = createElement('textarea', 'documents-ai-modal__textarea');
    aggressiveInput.placeholder = 'Здесь будет агрессивный вариант';
    aggressiveField.appendChild(aggressiveInput);

    grid.appendChild(neutralField);
    grid.appendChild(aggressiveField);

    var toneField = createElement('div', 'documents-ai-modal__field');
    toneField.appendChild(createElement('div', 'documents-ai-modal__label', 'Текст для PDF'));
    var toneSelect = createElement('select', 'documents-ai-modal__textarea');
    toneSelect.style.minHeight = '44px';
    toneSelect.style.resize = 'none';
    toneSelect.innerHTML = '<option value="neutral">Нейтральный</option><option value="aggressive">Агрессивный</option>';
    toneField.appendChild(toneSelect);

    var actions = createElement('div', 'documents-ai-modal__actions');
    var closeButton = createElement('button', 'documents-ai-modal__button', 'Закрыть');
    var analyzeButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--ghost', 'Анализировать');
    var makePdfButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--ghost', 'Сформировать PDF');
    var printButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--ghost', 'Печать');
    var sendButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--primary', 'Отправить');
    var downloadButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--danger', 'Скачать');

    function setStatus(text) {
      status.textContent = text || '';
    }

    function getChosenText() {
      return selectedTone === 'aggressive'
        ? String(aggressiveInput.value || '').trim()
        : String(neutralInput.value || '').trim();
    }

    async function buildPdfBlob() {
      var text = getChosenText();
      if (!text) {
        setStatus('Добавьте текст перед PDF.');
        return null;
      }

      if (config.templatePdfUrl) {
        return createPdfFromTemplate(config, text);
      }

      return buildSimplePdfBlob(text);
    }

    async function ensurePdfBlob() {
      if (generatedBlob) {
        return generatedBlob;
      }
      generatedBlob = await buildPdfBlob();
      return generatedBlob;
    }

    function closeModal() {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }

    uploadInput.addEventListener('change', function () {
      selectedFile = uploadInput.files && uploadInput.files[0] ? uploadInput.files[0] : null;
      fileName.textContent = selectedFile ? ('Выбран: ' + selectedFile.name) : 'Файл не выбран';
      setStatus('');
    });

    neutralInput.addEventListener('input', function () {
      generatedBlob = null;
    });

    aggressiveInput.addEventListener('input', function () {
      generatedBlob = null;
    });

    toneSelect.addEventListener('change', function () {
      selectedTone = toneSelect.value;
      generatedBlob = null;
    });

    analyzeButton.type = 'button';
    analyzeButton.addEventListener('click', async function () {
      if (!selectedFile) {
        setStatus('Сначала загрузите файл.');
        return;
      }

      setStatus('Отправляем документ в ИИ...');

      try {
        var envConfig = await loadAiEnvConfig();
        var resolvedApiKey = config.apiKey || envConfig.AI_API_KEY || '';
        var resolvedModel = config.model || envConfig.AI_MODEL || '';
        var formData = new FormData();
        formData.append('file', selectedFile);
        if (resolvedModel) {
          formData.append('model', resolvedModel);
        }
        formData.append('request', 'Сделай анализ и дай 2 варианта ответа: neutral и aggressive на русском.');

        var response = await fetch(config.apiEndpoint || '/api/ai/document-reply', {
          method: 'POST',
          headers: resolvedApiKey ? { Authorization: 'Bearer ' + resolvedApiKey } : undefined,
          body: formData
        });

        if (!response.ok) {
          throw new Error('API ' + response.status);
        }

        var data = await response.json();
        neutralInput.value = data.neutral || (data.variants && data.variants.neutral) || '';
        aggressiveInput.value = data.aggressive || (data.variants && data.variants.aggressive) || '';
        generatedBlob = null;

        setStatus('Готово: ответы получены. Можно отредактировать вручную.');
      } catch (error) {
        setStatus('Ошибка: ' + error.message);
      }
    });

    makePdfButton.type = 'button';
    makePdfButton.addEventListener('click', async function () {
      setStatus('Собираем PDF...');
      try {
        generatedBlob = await buildPdfBlob();
        if (generatedBlob) {
          setStatus('PDF готов.');
        }
      } catch (error) {
        setStatus('Ошибка PDF: ' + error.message);
      }
    });

    printButton.type = 'button';
    printButton.addEventListener('click', async function () {
      try {
        var blob = await ensurePdfBlob();
        if (!blob) {
          return;
        }

        var url = URL.createObjectURL(blob);
        var frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.opacity = '0';
        frame.src = url;
        document.body.appendChild(frame);

        frame.onload = function () {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          setTimeout(function () {
            URL.revokeObjectURL(url);
            frame.remove();
          }, 2500);
        };
      } catch (error) {
        setStatus('Печать недоступна: ' + error.message);
      }
    });

    downloadButton.type = 'button';
    downloadButton.addEventListener('click', async function () {
      try {
        var blob = await ensurePdfBlob();
        if (!blob) {
          return;
        }

        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'response-letter.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1200);
      } catch (error) {
        setStatus('Скачать не удалось: ' + error.message);
      }
    });

    sendButton.type = 'button';
    sendButton.addEventListener('click', async function () {
      try {
        var blob = await ensurePdfBlob();
        if (!blob) {
          return;
        }

        var file = new File([blob], 'response-letter.pdf', { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Ответное письмо',
            text: 'Готовый PDF',
            files: [file]
          });
          setStatus('Файл отправлен через Share.');
          return;
        }

        if (typeof config.onSend === 'function') {
          await config.onSend(blob, {
            tone: selectedTone,
            neutral: neutralInput.value,
            aggressive: aggressiveInput.value
          });
          setStatus('Файл передан в ваш обработчик отправки.');
          return;
        }

        setStatus('Нет Share API. Передайте onSend(blob) в options.');
      } catch (error) {
        setStatus('Отправка не выполнена: ' + error.message);
      }
    });

    closeButton.type = 'button';
    closeButton.addEventListener('click', closeModal);

    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    uploadSection.appendChild(uploadLabel);
    uploadSection.appendChild(uploadInput);
    uploadSection.appendChild(fileName);
    uploadSection.appendChild(status);

    responseSection.appendChild(grid);
    responseSection.appendChild(toneField);

    actions.appendChild(analyzeButton);
    actions.appendChild(makePdfButton);
    actions.appendChild(printButton);
    actions.appendChild(sendButton);
    actions.appendChild(downloadButton);
    actions.appendChild(closeButton);

    panel.appendChild(title);
    panel.appendChild(desc);
    panel.appendChild(uploadSection);
    panel.appendChild(responseSection);
    panel.appendChild(actions);

    modal.appendChild(panel);
    document.body.appendChild(modal);
  };
  window.__documentsAiResponseModalVersion = '2026-03-25-v2';
})();
