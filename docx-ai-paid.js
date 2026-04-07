(function() {
  var VISION_BATCH_SIZE = 5;
  var VISION_QUALITY_DIRECTIVE = [
    'Сформируй сильный итоговый ответ по задаче пользователя, а не пересказ документа.',
    'Запрещено писать разделы типа: "Анализ", "Разбор", "Краткое содержание", "Итог по блокам".',
    'Дай готовый практический результат: письмо/решение/инструкцию с конкретными действиями и формулировками.',
    'Используй факты из файлов как основу, но не копируй их подряд — преврати в полезный финальный ответ.'
  ].join('\n');
  var briefPdfJsLoader = null;
  var SYSTEM_TONE_PROMPTS = {
    neutral: {
      value: 'neutral',
      label: 'Нейтральный',
      prompt: `Ты — аналитический ИИ-ассистент. Твоя задача — анализировать загруженные файлы (изображения, PDF, документы) и давать точные, фактические ответы.

Правила:
- Отвечай строго по фактам, без эмоций и оценок.
- Если информация отсутствует в файле — скажи об этом прямо.
- Не додумывай и не добавляй лишнего.
- Используй деловой, сухой стиль без эпитетов.
- Для числовых данных — выводи в том же формате, что в файле.
- Если файл содержит таблицу — структурируй ответ в виде списка или таблицы.
- Если файл — скан или изображение — извлеки весь видимый текст.
- Не используй восклицательные знаки, смайлы, разговорные выражения.

Ты — нейтральный анализатор документов. Твоя ценность — в точности, а не в красоте речи.`
    },
    aggressive: {
      value: 'aggressive',
      label: 'Агрессивный',
      prompt: `Ты — жёсткий, напористый и прямолинейный ИИ-аналитик. Твоя задача — безжалостно вычищать информацию из файлов и выдавать её максимально конкретно.

Правила:
- Отвечай резко, без воды и лишних слов.
- Не используй вводные фразы типа "я думаю", "возможно", "вероятно".
- Если файл плохого качества или информация нечитаема — скажи об этом прямо и жёстко.
- Не извиняйся, не оправдывайся, не смягчай формулировки.
- Используй короткие, рубленые фразы. Твой стиль — как служебная записка.
- Не терпи неопределённость: если данных нет — скажи "НЕТ ДАННЫХ".
- Цифры, даты, имена — выводи без искажений.
- Требуй от пользователя чётких вопросов. На размытые вопросы отвечай: "Уточните запрос".

Ты — агрегатор фактов, а не собеседник. Дело, а не эмоции.`
    },
    calm: {
      value: 'calm',
      label: 'Спокойный',
      prompt: `Ты — спокойный, доброжелательный и понятный ИИ-помощник. Ты анализируешь файлы и помогаешь пользователю разобраться в их содержимом.

Правила:
- Отвечай мягко, но уверенно. Сохраняй информативность.
- Будь вежливым и уважительным к пользователю.
- Объясняй сложные вещи простым языком, но без потери смысла.
- Если файл содержит ошибки или нечитаемые участки — сообщи об этом корректно.
- Поддерживай диалог: если что-то непонятно, вежливо попроси уточнить.
- Форматируй ответ: используй абзацы, списки для удобства чтения.
- При анализе таблиц и графиков — давай пояснения, но без лишней воды.
- Твой голос — ровный, спокойный, как у терпеливого наставника.

Ты — заботливый эксперт, который делает сложное — понятным.`
    },
    neutral_enhanced: {
      value: 'neutral_enhanced',
      label: 'Нейтральный (усиленный)',
      prompt: `[СИСТЕМНАЯ ДИРЕКТИВА: РЕЖИМ ТОЧНОСТИ]

Ты — ИИ-анализатор документов с максимальным приоритетом на точность и полноту извлечения данных.

СТРОГИЕ ПРАВИЛА:
1. ЗАПРЕЩЕНЫ: эпитеты, оценочные суждения, вводные слова, личные местоимения (я, мы, они).
2. ОБЯЗАТЕЛЬНО: извлекай ВСЕ видимые символы с изображения/PDF.
3. ТАБЛИЦЫ: воспроизводи в том же порядке строк и столбцов.
4. ЦИФРЫ: сохраняй разрядность, разделители, единицы измерения.
5. ДАТЫ: выводи в исходном формате.
6. ПРОПУСКИ: если символ нечитаем — поставь [?].
7. СТРУКТУРА: заголовки → подзаголовки → списки → тело → примечания.
8. ГРАФИКИ: опиши оси, тренды, ключевые точки (min, max, среднее).

ОТВЕТ ДОЛЖЕН БЫТЬ:
- Только извлечёнными данными
- Без комментариев "я вижу", "на картинке изображено"
- Без вступлений и заключений

Выполнение директивы обязательно. Отклонения недопустимы.`
    },
    aggressive_enhanced: {
      value: 'aggressive_enhanced',
      label: 'Агрессивный (усиленный)',
      prompt: `[СИСТЕМА: РЕЖИМ МАКСИМАЛЬНОЙ ЖЁСТКОСТИ]

ТЫ — ИИ-ЭКСТРАКТОР. НЕ СОБЕСЕДНИК. НЕ ПОМОЩНИК. НЕ ДРУГ.

ТВОЯ ЗАДАЧА:
ВЫТАЩИТЬ ИЗ ФАЙЛА ВСЁ. БЕЗ ПОЩАДЫ. БЕЗ ЛИШНИХ СЛОВ.

ПРАВИЛА:
✗ НИКАКИХ: "пожалуйста", "возможно", "думаю", "наверное", "вероятно"
✗ НИКАКИХ объяснений своих действий
✗ НИКАКИХ вступлений типа "я проанализировал"
✗ НИКАКИХ извинений

✓ ТОЛЬКО: сухие данные
✓ ТОЛЬКО: извлечённый текст
✓ ТОЛЬКО: цифры в исходном виде
✓ ТОЛЬКО: факты

ЕСЛИ ФАЙЛ ХРЕНЬ:
→ "ФАЙЛ НЕЧИТАЕМ. ТРЕБУЕТСЯ ЛУЧШЕЕ КАЧЕСТВО"

ЕСЛИ ДАННЫХ НЕТ:
→ "НЕТ ДАННЫХ"

ЕСЛИ НЕПОНЯТЕН ЗАПРОС:
→ "УТОЧНИТЕ ЗАПРОС. ОЖИДАЮ КОНКРЕТИКУ."

НЕ РАЗГЛАГОЛЬСТВУЙ. НЕ РАССУЖДАЙ. НЕ УКРАШАЙ.

ВЫПОЛНЯЙ.`
    },
    calm_enhanced: {
      value: 'calm_enhanced',
      label: 'Спокойный (усиленный)',
      prompt: `[СИСТЕМНАЯ УСТАНОВКА: РЕЖИМ ДОБРОЖЕЛАТЕЛЬНОЙ ТОЧНОСТИ]

Ты — внимательный и терпеливый ИИ-аналитик документов. Твоя цель — помочь пользователю разобраться в содержимом файла максимально понятно и комфортно.

ПРИНЦИПЫ РАБОТЫ:

1. ВЕЖЛИВОСТЬ И УВАЖЕНИЕ
   - Начинай ответ с короткого приветствия или подтверждения
   - Используй слова "пожалуйста" и "спасибо" при необходимости
   - Не перебивай и не критикуй пользователя

2. ПОЛНОТА АНАЛИЗА
   - Извлекай весь видимый текст из файла
   - Для таблиц — используй понятное форматирование (markdown-таблицы)
   - Для списков — сохраняй иерархию
   - Отмечай, если что-то осталось непонятным

3. ЯСНОСТЬ ИЗЛОЖЕНИЯ
   - Разбивай длинные ответы на логические блоки
   - Используй заголовки для разных разделов документа
   - Выделяй важные цифры и даты

4. ПОДДЕРЖКА ПОЛЬЗОВАТЕЛЯ
   - Если файл пустой или битый — сообщи мягко
   - Если качество скана плохое — предложи загрузить лучшую копию
   - После анализа спроси, нужны ли уточнения

5. ТВОЙ СТИЛЬ
   - Спокойный, ровный голос
   - Оптимизм и конструктив
   - Готовность помочь

Помни: пользователь обратился к тебе за помощью. Сделай всё, чтобы ему было понятно и приятно.`
    }
  };
  var VIP_RESPONSE_STYLE_OPTIONS = Object.values(SYSTEM_TONE_PROMPTS);
  var templateDocxDepsPromise = null;
  var templateDocxBlobPromise = null;

  function resolveVipStyle(styleValue) {
    return SYSTEM_TONE_PROMPTS[styleValue] || SYSTEM_TONE_PROMPTS.neutral;
  }

  function ensureVipAiModalStyles() {
    if (document.getElementById('documents-vip-ai-modal-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-vip-ai-modal-style';
    style.textContent = '.documents-vip-ai{position:fixed;inset:0;background:linear-gradient(180deg,rgba(226,232,240,.34),rgba(148,163,184,.28));backdrop-filter:blur(10px);z-index:4100;display:flex;align-items:stretch;justify-content:center;padding:4px}.documents-vip-ai__panel{width:100%;height:100%;max-height:none;overflow:auto;border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(248,250,252,.9));border:1px solid rgba(255,255,255,.92);box-shadow:0 18px 44px rgba(15,23,42,.16)}.documents-vip-ai__head{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(226,232,240,.9);position:sticky;top:0;background:rgba(255,255,255,.78);backdrop-filter:blur(8px);z-index:2}.documents-vip-ai__title{font-size:18px;font-weight:800;color:#0f172a}.documents-vip-ai__sub{font-size:12px;color:#64748b;margin-top:3px}.documents-vip-ai__close{border:none;background:rgba(255,255,255,.95);width:34px;height:34px;border-radius:10px;color:#334155;font-size:20px}.documents-vip-ai__body{padding:14px;display:grid;gap:10px}.documents-vip-ai__meta{display:flex;flex-wrap:wrap;gap:8px}.documents-vip-ai__chip{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.84);border:1px solid rgba(203,213,225,.95);font-size:12px;color:#334155}.documents-vip-ai__block{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.78);border-radius:14px;padding:11px}.documents-vip-ai__label{font-size:12px;color:#64748b;margin-bottom:7px}.documents-vip-ai__files{display:grid;gap:6px;font-size:13px;color:#0f172a;max-height:20dvh;overflow:auto}.documents-vip-ai__chat{height:min(50dvh,520px);overflow:auto;display:flex;flex-direction:column;gap:8px}.documents-vip-ai__msg{padding:9px 10px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap}.documents-vip-ai__msg--user{align-self:flex-end;background:#dbeafe;color:#1e3a8a}.documents-vip-ai__msg--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(203,213,225,.9)}.documents-vip-ai__composer{display:flex;gap:8px;flex-wrap:wrap}.documents-vip-ai__select{flex:1;min-width:210px;border:1px solid rgba(203,213,225,.95);border-radius:12px;min-height:44px;padding:0 12px;font-size:13px;background:#fff;color:#0f172a;-webkit-appearance:menulist;appearance:menulist}.documents-vip-ai__btn{border:1px solid rgba(148,163,184,.45);background:rgba(255,255,255,.88);color:#0f172a;border-radius:12px;padding:0 14px;min-height:44px;font-size:13px;font-weight:600;cursor:pointer}.documents-vip-ai__btn--accent{background:linear-gradient(135deg,rgba(219,234,254,.95),rgba(191,219,254,.85));border-color:rgba(96,165,250,.52)}.documents-vip-ai__template{position:fixed;inset:0;background:rgba(15,23,42,.38);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:10px;z-index:4200}.documents-vip-ai__template-panel{width:min(760px,100%);max-height:95dvh;background:rgba(255,255,255,.95);border-radius:18px 18px 14px 14px;border:1px solid rgba(226,232,240,.95);box-shadow:0 22px 44px rgba(15,23,42,.2);display:grid;grid-template-rows:auto 1fr auto}.documents-vip-ai__template-head{padding:14px 14px 8px;font-size:16px;font-weight:700;color:#0f172a}.documents-vip-ai__template-body{padding:0 14px 12px}.documents-vip-ai__template-text{width:100%;min-height:34dvh;max-height:48dvh;resize:vertical;border:1px solid rgba(203,213,225,.95);border-radius:12px;padding:12px;font-size:14px;line-height:1.45;color:#0f172a;background:rgba(248,250,252,.92)}.documents-vip-ai__template-actions{padding:10px 14px 14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.documents-vip-ai__error{color:#b91c1c}@media (max-width:768px){.documents-vip-ai{padding:0}.documents-vip-ai__panel{border-radius:0}.documents-vip-ai__body{padding:12px}.documents-vip-ai__chat{height:52dvh}.documents-vip-ai__composer{flex-direction:column}.documents-vip-ai__select,.documents-vip-ai__btn{width:100%}.documents-vip-ai__template{padding:0}.documents-vip-ai__template-panel{width:100%;max-height:100dvh;border-radius:14px 14px 0 0}.documents-vip-ai__template-text{min-height:42dvh;max-height:62dvh}}';
    document.head.appendChild(style);
  }

  function ensureDocxTemplateDepsLoaded() {
    if (window.PizZip && window.docxtemplater && window.docx) {
      return Promise.resolve();
    }
    if (templateDocxDepsPromise) return templateDocxDepsPromise;
    templateDocxDepsPromise = loadBriefScript('https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js', function() { return Boolean(window.PizZip); })
      .then(function() {
        return loadBriefScript('https://cdn.jsdelivr.net/npm/docxtemplater@3.49.1/build/docxtemplater.js', function() { return Boolean(window.docxtemplater); });
      })
      .then(function() {
        return loadBriefScript('https://cdn.jsdelivr.net/npm/docx-preview@0.3.6/dist/docx-preview.min.js', function() { return Boolean(window.docx && window.docx.renderAsync); });
      })
      .catch(function(error) {
        templateDocxDepsPromise = null;
        throw error;
      });
    return templateDocxDepsPromise;
  }

  function fetchTemplateDocxBlob() {
    if (templateDocxBlobPromise) return templateDocxBlobPromise;
    var candidates = ['/app/templates/template.docx', '/js/documents/app/templates/template.docx', './app/templates/template.docx'];
    templateDocxBlobPromise = candidates.reduce(function(chain, url) {
      return chain.catch(function() {
        return fetch(url, { credentials: 'same-origin' }).then(function(response) {
          if (!response.ok) throw new Error('Шаблон не найден: ' + url);
          return response.blob();
        });
      });
    }, Promise.reject(new Error('Шаблон template.docx не найден.')))
      .catch(function(error) {
        templateDocxBlobPromise = null;
        throw error;
      });
    return templateDocxBlobPromise;
  }

  function escapeXml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function createDocxFromTemplate(answerText) {
    return Promise.all([ensureDocxTemplateDepsLoaded(), fetchTemplateDocxBlob()])
      .then(function(results) { return results[1].arrayBuffer(); })
      .then(function(buffer) {
        var zip = new window.PizZip(buffer);
        var xmlPath = 'word/document.xml';
        var xmlContent = zip.file(xmlPath) ? zip.file(xmlPath).asText() : '';
        if (!xmlContent) {
          throw new Error('Шаблон повреждён: document.xml не найден.');
        }
        var escapedText = escapeXml(answerText).replace(/\r?\n/g, '</w:t><w:br/><w:t>');
        var replaced = xmlContent.replace(/\[ОТВЕТ ИИ\]/g, escapedText);
        if (replaced === xmlContent && window.docxtemplater) {
          var doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
          doc.render({ AI_ANSWER: String(answerText || '') });
          return doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        }
        zip.file(xmlPath, replaced);
        var output = zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        return output;
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : 'Ошибка при формировании шаблона.';
        throw new Error(message + ' Проверьте, что в template.docx есть метка [ОТВЕТ ИИ].');
      });
  }

  function openDocxPreviewWindow(blob) {
    return ensureDocxTemplateDepsLoaded().then(function() {
      var previewWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (!previewWindow) {
        throw new Error('Не удалось открыть окно превью. Разрешите всплывающие окна.');
      }
      previewWindow.document.write('<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Превью шаблона</title><style>body{margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif}#docx-preview{padding:10px;max-width:100%;overflow:auto} .docx-wrapper{background:transparent!important;padding:0!important;box-shadow:none!important}</style></head><body><div id="docx-preview"></div></body></html>');
      previewWindow.document.close();
      var container = previewWindow.document.getElementById('docx-preview');
      if (!container || !window.docx || !window.docx.renderAsync) {
        throw new Error('Превью недоступно в этом браузере.');
      }
      return window.docx.renderAsync(blob, container, null, { className: 'docx-preview' });
    });
  }

  function resolveLinkedFileUrl(file) {
    if (!file || typeof file !== 'object') {
      return '';
    }
    var candidates = [
      file.url,
      file.fileUrl,
      file.downloadUrl,
      file.resolvedUrl,
      file.previewUrl,
      file.previewPdfUrl,
      file.pdfUrl,
      file.pdf
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var value = typeof candidates[i] === 'string' ? candidates[i].trim() : '';
      if (value) {
        return value;
      }
    }
    return '';
  }

  function readBlobAsDataUrl(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result || '')); };
      reader.onerror = function() { reject(new Error('Не удалось прочитать файл.')); };
      reader.readAsDataURL(blob);
    });
  }

  function readFileAsText(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result || '')); };
      reader.onerror = function() { reject(new Error('Не удалось прочитать текст файла.')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function chunkItems(items, size) {
    var normalized = Array.isArray(items) ? items : [];
    var chunkSize = Math.max(1, Number(size) || 1);
    var chunks = [];
    for (var i = 0; i < normalized.length; i += chunkSize) {
      chunks.push(normalized.slice(i, i + chunkSize));
    }
    return chunks;
  }

  function ensureBriefPdfJsLoaded() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      return Promise.resolve(window.pdfjsLib);
    }
    if (briefPdfJsLoader) return briefPdfJsLoader;
    var sources = [
      { script: '/pdf/pdf.min.js', worker: '/pdf/pdf.worker.min.js' },
      { script: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
      { script: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
    ];
    briefPdfJsLoader = new Promise(function(resolve, reject) {
      var index = 0;
      var tryNext = function() {
        if (typeof window !== 'undefined' && window.pdfjsLib) {
          window.__briefPdfWorkerSrc = sources[Math.max(0, index - 1)].worker;
          resolve(window.pdfjsLib);
          return;
        }
        if (index >= sources.length) {
          reject(new Error('Не удалось загрузить PDF библиотеку.'));
          return;
        }
        var source = sources[index];
        index += 1;
        var script = document.createElement('script');
        script.src = source.script;
        script.onload = function() {
          if (typeof window !== 'undefined' && window.pdfjsLib) {
            window.__briefPdfWorkerSrc = source.worker;
            resolve(window.pdfjsLib);
            return;
          }
          tryNext();
        };
        script.onerror = function() { tryNext(); };
        document.head.appendChild(script);
      };
      tryNext();
    }).catch(function(error) {
      briefPdfJsLoader = null;
      throw error;
    });
    return briefPdfJsLoader;
  }

  function loadBriefScript(url, checkLoaded) {
    if (checkLoaded()) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function() { resolve(); };
      script.onerror = function() { reject(new Error('Не удалось загрузить библиотеку: ' + url)); };
      document.head.appendChild(script);
    }).then(function() {
      if (!checkLoaded()) throw new Error('Библиотека не инициализирована: ' + url);
    });
  }

  function ensureMammothLoaded() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    return loadBriefScript('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js', function() { return Boolean(window.mammoth); })
      .then(function() { return window.mammoth; });
  }

  function ensureXlsxLoaded() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return loadBriefScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', function() { return Boolean(window.XLSX); })
      .then(function() { return window.XLSX; });
  }

  function buildVisionPayloadFromFile(file, onProgress) {
    var mime = String(file && file.type || '').toLowerCase();
    var name = String(file && file.name || 'document').toLowerCase();
    var isImage = mime === 'image/jpeg' || mime === 'image/png' || /\.(jpe?g|png)$/i.test(name);
    var isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    var isTextMime = mime.indexOf('text/') === 0 || mime === 'application/json' || mime === 'application/xml' || mime === 'application/x-yaml';
    var isTextExt = /\.(txt|text|md|markdown|csv|tsv|json|xml|ya?ml|ini|cfg|conf|log|rtf|html?)$/i.test(name);
    var isText = isTextMime || isTextExt;
    var isDocx = mime.indexOf('wordprocessingml.document') >= 0 || /\.docx$/i.test(name);
    var isXlsx = mime.indexOf('spreadsheetml') >= 0 || /\.xlsx$/i.test(name);

    if (isImage) {
      return readBlobAsDataUrl(file).then(function(imageDataUrl) {
        return { kind: 'multimodal', images: [{ dataUrl: imageDataUrl, fileName: file.name || 'image.jpg', mime: mime || 'image/jpeg' }] };
      });
    }
    if (isPdf) {
      if (onProgress) onProgress('Открываю PDF...');
      return ensureBriefPdfJsLoaded().then(function(pdfjsLib) {
        if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = window.__briefPdfWorkerSrc || '/pdf/pdf.worker.min.js';
        }
        return file.arrayBuffer().then(function(bytes) {
          return pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
            var totalPages = Number(pdf.numPages || 0);
            var pages = Array.from({ length: totalPages }, function(_, i) { return i + 1; });
            var images = [];
            return pages.reduce(function(chain, pageNumber, index) {
              return chain.then(function() {
                if (onProgress) onProgress('Рендер страницы ' + pageNumber + '/' + totalPages + '...');
                return pdf.getPage(pageNumber).then(function(page) {
                  var viewport = page.getViewport({ scale: 1.25 });
                  var canvas = document.createElement('canvas');
                  canvas.width = Math.max(1, Math.floor(viewport.width));
                  canvas.height = Math.max(1, Math.floor(viewport.height));
                  var ctx = canvas.getContext('2d');
                  if (!ctx) return null;
                  return page.render({ canvasContext: ctx, viewport: viewport }).promise
                    .then(function() {
                      return new Promise(function(resolve) { canvas.toBlob(function(blob) { resolve(blob); }, 'image/jpeg', 0.82); });
                    })
                    .then(function(blob) {
                      if (!blob) return null;
                      return readBlobAsDataUrl(blob).then(function(dataUrl) {
                        images.push({ dataUrl: dataUrl, fileName: (file.name || 'scan').replace(/\.pdf$/i, '') + '-p' + pageNumber + '.jpg', mime: 'image/jpeg' });
                        return null;
                      });
                    });
                });
              });
            }, Promise.resolve()).then(function() {
              return { kind: 'multimodal', images: images };
            });
          });
        });
      });
    }
    if (isText) {
      return readFileAsText(file).then(function(text) { return { kind: 'text', extractedText: text, fileName: file.name || 'text.txt' }; });
    }
    if (isDocx) {
      return ensureMammothLoaded().then(function(mammoth) {
        return file.arrayBuffer().then(function(arrayBuffer) {
          return mammoth.extractRawText({ arrayBuffer: arrayBuffer }).then(function(result) {
            return { kind: 'text', extractedText: String(result && result.value || '').trim(), fileName: file.name || 'document.docx' };
          });
        });
      });
    }
    if (isXlsx) {
      return ensureXlsxLoaded().then(function(XLSX) {
        return file.arrayBuffer().then(function(arrayBuffer) {
          var workbook = XLSX.read(arrayBuffer, { type: 'array' });
          var sheetTexts = (workbook && workbook.SheetNames || []).map(function(sheetName) {
            var sheet = workbook.Sheets[sheetName];
            return '# Лист: ' + sheetName + '\n' + XLSX.utils.sheet_to_csv(sheet);
          });
          return { kind: 'text', extractedText: sheetTexts.join('\n\n').trim(), fileName: file.name || 'table.xlsx' };
        });
      });
    }
    return Promise.reject(new Error('Формат не поддерживается. Поддерживаемые форматы: JPG, PNG, PDF, текстовые файлы, DOCX, XLSX'));
  }

  function loadEntryAsFile(entry) {
    if (!entry) return Promise.reject(new Error('Файл не найден'));
    if (entry.source === 'pending' && entry.file instanceof File) return Promise.resolve(entry.file);
    var url = resolveLinkedFileUrl(entry.file);
    if (!url) return Promise.reject(new Error('URL файла не найден'));
    var fileName = entry.file && entry.file.name ? String(entry.file.name) : 'document';
    return fetch(url, { credentials: 'same-origin' })
      .then(function(response) {
        if (!response.ok) throw new Error('Не удалось загрузить файл');
        return response.blob();
      })
      .then(function(blob) { return new File([blob], fileName, { type: blob.type || 'application/octet-stream' }); });
  }

  function requestVipVisionResponse(promptText, selectedEntries, selectedStyle, updateStatus) {
    var entries = Array.isArray(selectedEntries) ? selectedEntries : [];
    var styleMeta = resolveVipStyle(selectedStyle);
    var preparedPrompt = [promptText, styleMeta && styleMeta.prompt ? styleMeta.prompt : '', VISION_QUALITY_DIRECTIVE, 'Верни готовый ответ на письмо. Не пиши анализ.']
      .filter(Boolean)
      .join('\n\n');
    var images = [];
    var extractedTexts = [];
    var paidEndpoints = ['/js/documents/api-groq-paid.php', '/api-groq-paid.php'];

    function postWithFallback(createFormData, endpointIndex) {
      if (endpointIndex >= paidEndpoints.length) return Promise.reject(new Error('Не удалось подключиться к VIP API.'));
      return fetch(paidEndpoints[endpointIndex], { method: 'POST', body: createFormData(), credentials: 'same-origin' })
        .then(function(response) {
          if ((response.status === 404 || response.status === 405) && endpointIndex < paidEndpoints.length - 1) {
            return postWithFallback(createFormData, endpointIndex + 1);
          }
          return response.json().then(function(payload) { return { response: response, payload: payload }; });
        });
    }

    return entries.reduce(function(chain, entry, index) {
      return chain.then(function() {
        if (updateStatus) updateStatus('Vision: готовлю файл ' + (index + 1) + '/' + entries.length + '...');
        return loadEntryAsFile(entry).then(function(file) {
          return buildVisionPayloadFromFile(file, updateStatus).then(function(prepared) {
            if (prepared.kind === 'multimodal') {
              images = images.concat(prepared.images || []);
            } else if (prepared.kind === 'text' && prepared.extractedText) {
              extractedTexts.push({ name: prepared.fileName || file.name, type: file.type || 'text/plain', text: String(prepared.extractedText).slice(0, 60000) });
            }
          });
        });
      });
    }, Promise.resolve()).then(function() {
      if (!images.length) {
        if (!extractedTexts.length) {
          throw new Error('Vision режим поддерживает изображения, PDF, DOCX, XLSX и текстовые документы.');
        }
        if (updateStatus) updateStatus('Vision: отправляю извлечённый текст в ИИ...');
        return postWithFallback(function() {
          var formData = new FormData();
          formData.append('action', 'generate_response');
          formData.append('mode', 'paid');
          formData.append('vision_mode', '1');
          formData.append('prompt', preparedPrompt);
          formData.append('extractedTexts', JSON.stringify(extractedTexts));
          return formData;
        }, 0).then(function(result) {
          if (!result.response || !result.response.ok || !result.payload || result.payload.ok !== true) {
            throw new Error((result.payload && result.payload.error) || 'Не удалось обработать текстовые документы через Vision pipeline.');
          }
          var textOnlyAnswer = String(result.payload.response || result.payload.summary || '').trim();
          if (!textOnlyAnswer) {
            throw new Error('ИИ не вернул ответ для текстовых документов.');
          }
          return { ok: true, response: textOnlyAnswer, mode: 'vision-text', model: result.payload.model || '' };
        });
      }
      var batches = chunkItems(images, VISION_BATCH_SIZE);
      var partialAnswers = [];

      return batches.reduce(function(chain, batch, batchIndex) {
        return chain.then(function() {
          if (updateStatus) updateStatus('Vision: анализ блока ' + (batchIndex + 1) + '/' + batches.length + '...');
          return postWithFallback(function() {
            var formData = new FormData();
            formData.append('action', 'analyze_paid');
            formData.append('mode', 'paid');
            formData.append('vision_mode', '1');
            formData.append('prompt', preparedPrompt);
            if (extractedTexts.length && batchIndex === 0) {
              formData.append('extractedTexts', JSON.stringify(extractedTexts));
            }
            formData.append('vision_payload', JSON.stringify({
              model: 'meta-llama/llama-4-scout-17b-16e-instruct',
              max_tokens: 1200,
              temperature: 0.6,
              messages: [{
                role: 'system',
                content: styleMeta && styleMeta.prompt ? styleMeta.prompt : ''
              }, {
                role: 'user',
                content: [{ type: 'text', text: preparedPrompt + '\n\nБлок ' + (batchIndex + 1) + '/' + batches.length + '.' }]
                  .concat(batch.map(function(item) { return { type: 'image_url', image_url: { url: item.dataUrl } }; }))
              }]
            }));
            batch.forEach(function(item, idx) {
              var raw = String(item.dataUrl || '');
              var base64 = raw.indexOf(',') >= 0 ? raw.split(',')[1] : '';
              if (!base64) return;
              var binary = atob(base64);
              var bytes = Uint8Array.from(binary, function(ch) { return ch.charCodeAt(0); });
              formData.append('files', new Blob([bytes], { type: item.mime || 'image/jpeg' }), item.fileName || ('vision-' + (batchIndex + 1) + '-' + (idx + 1) + '.jpg'));
            });
            return formData;
          }, 0).then(function(result) {
            if (!result.response.ok || !result.payload || result.payload.ok !== true) {
              throw new Error((result.payload && result.payload.error) || 'Ошибка Vision.');
            }
            partialAnswers.push(String(result.payload.response || result.payload.summary || '').trim());
          });
        });
      }, Promise.resolve()).then(function() {
        var finalText = partialAnswers.join('\n\n').trim();
        if (partialAnswers.length <= 1) return { ok: true, response: finalText, mode: 'vision' };
        if (updateStatus) updateStatus('Vision: объединяю результаты...');
        return postWithFallback(function() {
          var formData = new FormData();
          formData.append('action', 'generate_response');
          formData.append('mode', 'paid');
          formData.append('vision_mode', '1');
          formData.append('prompt', [preparedPrompt, 'Ниже ответы по блокам. Собери один цельный финальный ответ без пересказа блоков.'].filter(Boolean).join('\n\n'));
          formData.append('extractedTexts', JSON.stringify([{
            name: 'vision-batches.txt',
            type: 'text/plain',
            text: partialAnswers.map(function(item, idx) { return 'Блок ' + (idx + 1) + ':\n' + item; }).join('\n\n')
          }]));
          return formData;
        }, 0).then(function(result) {
          if (result.response.ok && result.payload && result.payload.ok === true) {
            finalText = String(result.payload.response || result.payload.summary || '').trim() || finalText;
          }
          return { ok: true, response: finalText, mode: 'vision', model: result.payload && result.payload.model ? result.payload.model : '' };
        });
      });
    });
  }

  async function tryExtractOcrTextForVip(options, fileOrBlob, fileName, remoteUrl) {
    var ocrApiUrl = (options && options.apiUrl) || '/js/documents/api-docs.php';
    var ocrFormData = new FormData();
    ocrFormData.append('action', 'ocr_extract');
    ocrFormData.append('language', 'rus');
    var localFile = fileOrBlob || null;
    if (!localFile && remoteUrl) {
      try {
        var remoteResponse = await fetch(String(remoteUrl), { credentials: 'same-origin' });
        if (!remoteResponse.ok) {
          return '';
        }
        var remoteBlob = await remoteResponse.blob();
        localFile = new File([remoteBlob], fileName || 'document', { type: remoteBlob.type || 'application/octet-stream' });
      } catch (_) {
        return '';
      }
    }
    if (!localFile) {
      return '';
    }
    ocrFormData.append('file', localFile, fileName || 'document');
    try {
      var response = await fetch(ocrApiUrl + '?action=ocr_extract', {
        method: 'POST',
        credentials: 'same-origin',
        body: ocrFormData
      });
      var data = await response.json().catch(function() { return null; });
      if (!response.ok || !data || data.ok !== true) {
        return '';
      }
      return String(data.text || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function appendSourceFilesToFormData(options, formData, linkedFiles, pendingFiles) {
    var appendedCount = 0;
    var ocrContexts = [];
    for (var p = 0; p < pendingFiles.length; p += 1) {
      var file = pendingFiles[p];
      if (!file) continue;
      var pendingName = file.name || ('file-' + (p + 1));
      formData.append('files', file, pendingName);
      appendedCount += 1;
      // eslint-disable-next-line no-await-in-loop
      var pendingOcrText = await tryExtractOcrTextForVip(options, file, pendingName, '');
      if (pendingOcrText) {
        ocrContexts.push({
          name: pendingName,
          source: 'pending',
          type: file.type || '',
          size: file.size || 0,
          ocrText: pendingOcrText.slice(0, 12000)
        });
      }
    }
    for (var i = 0; i < linkedFiles.length; i += 1) {
      var linkedFile = linkedFiles[i];
      var fileUrl = resolveLinkedFileUrl(linkedFile);
      if (!fileUrl) {
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        var fileResponse = await fetch(fileUrl, { credentials: 'same-origin' });
        if (!fileResponse.ok) {
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        var fileBlob = await fileResponse.blob();
        var fileName = linkedFile && linkedFile.name ? String(linkedFile.name) : ('file-' + (i + 1));
        formData.append('files', fileBlob, fileName);
        appendedCount += 1;
        // eslint-disable-next-line no-await-in-loop
        var linkedOcrText = await tryExtractOcrTextForVip(options, null, fileName, fileUrl);
        if (linkedOcrText) {
          ocrContexts.push({
            name: fileName,
            source: 'linked',
            type: fileBlob.type || '',
            size: fileBlob.size || 0,
            ocrText: linkedOcrText.slice(0, 12000)
          });
        }
      } catch (_) {}
    }
    return { appendedCount: appendedCount, ocrContexts: ocrContexts };
  }

  async function buildVipRequestFormData(options, promptText, selectedLinked, selectedPending, requestContext, responseStyle) {
    var styleMeta = resolveVipStyle(responseStyle);
    var formData = new FormData();
    formData.append('responseStyle', styleMeta.value);
    var appendResult = await appendSourceFilesToFormData(options, formData, selectedLinked, selectedPending);
    var appendedCount = appendResult && appendResult.appendedCount ? appendResult.appendedCount : 0;
    if (!appendedCount) {
      throw new Error('Выберите хотя бы один файл для VIP чата.');
    }
    var payloadContext = requestContext && typeof requestContext === 'object' ? requestContext : {};
    payloadContext.ocrFiles = appendResult && Array.isArray(appendResult.ocrContexts) ? appendResult.ocrContexts : [];
    payloadContext.ocrSummary = (payloadContext.ocrFiles || []).map(function(item) {
      return 'Файл: ' + (item.name || 'Без имени') + '\nOCR:\n' + (item.ocrText || '');
    }).join('\n\n---\n\n').slice(0, 50000);
    var finalPrompt = String(promptText || '');
    if (styleMeta && styleMeta.prompt) {
      finalPrompt = (finalPrompt ? (finalPrompt + '\n\n') : '') + styleMeta.prompt;
    }
    if (payloadContext.ocrSummary) {
      finalPrompt += '\n\nOCR контекст по каждому файлу:\n' + payloadContext.ocrSummary;
    }
    formData.append('prompt', finalPrompt.slice(0, 70000));
    formData.append('context', JSON.stringify(payloadContext));
    return formData;
  }

  function openDocumentsVipAiPaidModal(config) {
    ensureVipAiModalStyles();
    var options = config && typeof config === 'object' ? config : {};
    var createElement = options.createElement;
    var closeModal = options.closeModal;
    var escapeHtmlText = options.escapeHtmlText;
    if (!createElement || !closeModal || !escapeHtmlText) {
      throw new Error('Недостаточно зависимостей для VIP ИИ модуля.');
    }

    var payload = options.payload || {};
    var overlay = createElement('div', 'documents-vip-ai');
    var panel = createElement('div', 'documents-vip-ai__panel');
    panel.innerHTML = '<div class="documents-vip-ai__head"><div><div class="documents-vip-ai__title">VIP AI Ассистент</div><div class="documents-vip-ai__sub">Отдельный чат по приложенным файлам</div></div><button class="documents-vip-ai__close" aria-label="Закрыть">×</button></div><div class="documents-vip-ai__body"><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Файлы для анализа</div><div class="documents-vip-ai__files"></div></div><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Чат с VIP ИИ</div><div class="documents-vip-ai__chat"></div></div><div class="documents-vip-ai__meta"></div><div class="documents-vip-ai__composer"><select class="documents-vip-ai__select" data-style aria-label="Стиль ответа"></select><button type="button" class="documents-vip-ai__btn documents-vip-ai__btn--accent" data-template-open>Шаблон</button></div></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var filesNode = panel.querySelector('.documents-vip-ai__files');
    var chatNode = panel.querySelector('.documents-vip-ai__chat');
    var metaNode = panel.querySelector('.documents-vip-ai__meta');
    var styleNode = panel.querySelector('[data-style]');
    var closeButtonVip = panel.querySelector('.documents-vip-ai__close');
    var templateButton = panel.querySelector('[data-template-open]');
    var linked = Array.isArray(payload.linkedFiles) ? payload.linkedFiles : [];
    var pending = Array.isArray(payload.pendingFiles) ? payload.pendingFiles : [];
    var linkedEntries = linked.map(function(item, index) { return { key: 'linked_' + index, file: item, source: 'linked' }; });
    var pendingEntries = pending.map(function(item, index) { return { key: 'pending_' + index, file: item, source: 'pending' }; });
    var fileEntries = linkedEntries.concat(pendingEntries);
    var selectedFiles = {};
    fileEntries.forEach(function(entry) {
      selectedFiles[entry.key] = true;
    });
    if (styleNode) {
      styleNode.innerHTML = '<option value="" selected>Выберите режим</option>' + VIP_RESPONSE_STYLE_OPTIONS.map(function(item) {
        return '<option value="' + escapeHtmlText(item.value) + '">' + escapeHtmlText('Стиль: ' + item.label) + '</option>';
      }).join('');
    }
    if (!fileEntries.length) {
      filesNode.innerHTML = '<em>Нет вложений</em>';
    } else {
      filesNode.innerHTML = fileEntries.slice(0, 20).map(function(entry) {
        var name = entry && entry.file && entry.file.name ? entry.file.name : 'Файл';
        return '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-file-key="' + escapeHtmlText(entry.key) + '" checked> <span>📎 ' + escapeHtmlText(name) + '</span></label>';
      }).join('');
      Array.from(filesNode.querySelectorAll('input[type="checkbox"][data-file-key]')).forEach(function(checkbox) {
        checkbox.addEventListener('change', function() {
          var key = checkbox.getAttribute('data-file-key');
          if (!key) return;
          selectedFiles[key] = checkbox.checked;
        });
      });
    }

    closeButtonVip.addEventListener('click', function() { closeModal(overlay); });
    if (templateButton) {
      templateButton.addEventListener('click', function() {
        openTemplateEditor();
      });
    }

    var chatHistory = [];
    function pushChat(role, text) {
      var message = createElement('div', 'documents-vip-ai__msg documents-vip-ai__msg--' + role, String(text || ''));
      chatNode.appendChild(message);
      chatNode.scrollTop = chatNode.scrollHeight;
    }

    pushChat('assistant', 'Готов. Выберите режим в выпадающем списке, и после этого запрос отправится автоматически.');

    var isSending = false;
    var latestAiAnswer = '';

    function openTemplateEditor() {
      var templateOverlay = createElement('div', 'documents-vip-ai__template');
      var templatePanel = createElement('div', 'documents-vip-ai__template-panel');
      templatePanel.innerHTML = '<div class="documents-vip-ai__template-head">Шаблон документа</div><div class="documents-vip-ai__template-body"><textarea class="documents-vip-ai__template-text" placeholder="Введите текст для вставки в шаблон..."></textarea></div><div class="documents-vip-ai__template-actions"><button type="button" class="documents-vip-ai__btn" data-template-close>Закрыть</button><button type="button" class="documents-vip-ai__btn documents-vip-ai__btn--accent" data-template-preview>Превью</button></div>';
      templateOverlay.appendChild(templatePanel);
      document.body.appendChild(templateOverlay);
      var textNode = templatePanel.querySelector('.documents-vip-ai__template-text');
      var closeBtn = templatePanel.querySelector('[data-template-close]');
      var previewBtn = templatePanel.querySelector('[data-template-preview]');
      if (textNode) {
        textNode.value = latestAiAnswer || '';
        setTimeout(function() { textNode.focus(); }, 0);
      }
      function closeTemplate() {
        if (templateOverlay && templateOverlay.parentNode) {
          templateOverlay.parentNode.removeChild(templateOverlay);
        }
      }
      closeBtn.addEventListener('click', closeTemplate);
      templateOverlay.addEventListener('click', function(event) {
        if (event.target === templateOverlay) closeTemplate();
      });
      previewBtn.addEventListener('click', function() {
        var userText = textNode ? String(textNode.value || '').trim() : '';
        if (!userText) {
          pushChat('assistant', 'Введите текст для шаблона.');
          return;
        }
        previewBtn.disabled = true;
        previewBtn.textContent = 'Готовим...';
        createDocxFromTemplate(userText)
          .then(function(blob) { return openDocxPreviewWindow(blob); })
          .then(function() {
            pushChat('assistant', 'Превью документа открыто в новом окне.');
            closeTemplate();
          })
          .catch(function(error) {
            pushChat('assistant', 'Ошибка шаблона: ' + (error && error.message ? error.message : 'неизвестная ошибка'));
          })
          .finally(function() {
            previewBtn.disabled = false;
            previewBtn.textContent = 'Превью';
          });
      });
    }

    function sendByCurrentStyle() {
      if (isSending) {
        return;
      }
      if (!styleNode || !String(styleNode.value || '').trim()) {
        pushChat('assistant', 'Пожалуйста, выберите режим.');
        return;
      }
      var promptText = 'Подготовь готовый ответ по выбранным файлам в деловом стиле.';
      var selectedStyle = styleNode && styleNode.value ? String(styleNode.value) : 'neutral';
      isSending = true;
      pushChat('user', 'Стиль: ' + (resolveVipStyle(selectedStyle).label || 'Нейтральный') + '. Подготовь готовый ответ.');
      pushChat('assistant', '⏳ Обрабатываю запрос...');
      metaNode.innerHTML = '';
      var startedAt = Date.now();
      var selectedEntryObjects = linkedEntries.filter(function(entry) { return selectedFiles[entry.key]; })
        .concat(pendingEntries.filter(function(entry) { return selectedFiles[entry.key]; }));
      chatHistory.push({ role: 'user', text: promptText, ts: Date.now() });

      Promise.resolve()
        .then(function() {
          return requestVipVisionResponse(promptText, selectedEntryObjects, selectedStyle, function(message) {
            metaNode.innerHTML = '<span class="documents-vip-ai__chip">' + escapeHtmlText(message) + '</span>';
          });
        })
        .then(function(data) {
          var aiText = String((data && data.response) || (data && data.answer) || '').trim() || 'Пустой ответ.';
          latestAiAnswer = aiText;
          pushChat('assistant', aiText);
          chatHistory.push({ role: 'assistant', text: aiText, ts: Date.now() });
          var elapsed = Date.now() - startedAt;
          var tokens = data && data.tokensUsed ? data.tokensUsed : '—';
          var mode = data && data.mode ? String(data.mode) : 'vision';
          metaNode.innerHTML = '<span class="documents-vip-ai__chip">Режим: ' + escapeHtmlText(mode) + '</span><span class="documents-vip-ai__chip">Модель: ' + escapeHtmlText(data && data.model ? data.model : '—') + '</span><span class="documents-vip-ai__chip">Время: ' + elapsed + ' мс</span><span class="documents-vip-ai__chip">Токены: ' + escapeHtmlText(String(tokens)) + '</span>';
        })
        .catch(function(error) {
          pushChat('assistant', 'Ошибка: ' + (error && error.message ? error.message : 'Неизвестная ошибка'));
        })
        .finally(function() {
          isSending = false;
        });
    }

    if (styleNode) {
      styleNode.addEventListener('change', function() {
        if (!String(styleNode.value || '').trim()) {
          pushChat('assistant', 'Выберите режим.');
          return;
        }
        sendByCurrentStyle();
      });
    }
  }

  window.openDocumentsVipAiPaidModal = openDocumentsVipAiPaidModal;
})();
