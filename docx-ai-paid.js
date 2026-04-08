(function() {
  var VISION_BATCH_SIZE = 5;
  var AI_PDF_PAGE_LIMIT = 5;
  var VISION_QUALITY_DIRECTIVE = [
    'Сформируй сильный итоговый ответ по задаче пользователя, а не пересказ документа.',
    'Запрещено писать разделы типа: "Анализ", "Разбор", "Краткое содержание", "Итог по блокам".',
    'Дай готовый практический результат: письмо/решение/инструкцию с конкретными действиями и формулировками.',
    'Используй факты из файлов как основу, но не копируй их подряд — преврати в полезный финальный ответ.',
    'Пиши только основной текст: без шапки, без подписи, без блоков "С уважением" и без реквизитов.'
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

  function resolveVipStyle(styleValue) {
    return SYSTEM_TONE_PROMPTS[styleValue] || SYSTEM_TONE_PROMPTS.neutral;
  }

  function ensureVipAiModalStyles() {
    if (document.getElementById('documents-vip-ai-modal-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-vip-ai-modal-style';
    style.textContent = '.documents-vip-ai{position:fixed;inset:0;background:linear-gradient(180deg,rgba(226,232,240,.34),rgba(148,163,184,.28));backdrop-filter:blur(10px);z-index:4100;display:flex;align-items:stretch;justify-content:center;padding:4px}.documents-vip-ai__panel{width:100%;height:100%;max-height:none;overflow:auto;border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(248,250,252,.9));border:1px solid rgba(255,255,255,.92);box-shadow:0 18px 44px rgba(15,23,42,.16)}.documents-vip-ai__head{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(226,232,240,.9);position:sticky;top:0;background:rgba(255,255,255,.78);backdrop-filter:blur(8px);z-index:2}.documents-vip-ai__title{font-size:18px;font-weight:800;color:#0f172a}.documents-vip-ai__sub{font-size:12px;color:#64748b;margin-top:3px}.documents-vip-ai__close{border:none;background:rgba(255,255,255,.95);width:34px;height:34px;border-radius:10px;color:#334155;font-size:20px}.documents-vip-ai__body{padding:14px;display:grid;gap:10px}.documents-vip-ai__meta{display:flex;flex-wrap:wrap;gap:8px}.documents-vip-ai__chip{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.84);border:1px solid rgba(203,213,225,.95);font-size:12px;color:#334155}.documents-vip-ai__block{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.78);border-radius:14px;padding:11px}.documents-vip-ai__label{font-size:12px;color:#64748b;margin-bottom:7px}.documents-vip-ai__files{display:grid;gap:6px;font-size:13px;color:#0f172a;max-height:20dvh;overflow:auto}.documents-vip-ai__chat{height:min(50dvh,520px);overflow:auto;display:flex;flex-direction:column;gap:8px}.documents-vip-ai__msg{padding:9px 10px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap}.documents-vip-ai__msg--user{align-self:flex-end;background:#dbeafe;color:#1e3a8a}.documents-vip-ai__msg--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(203,213,225,.9)}.documents-vip-ai__composer{display:flex;gap:8px}.documents-vip-ai__select{flex:1;border:1px solid rgba(203,213,225,.95);border-radius:12px;min-height:44px;padding:0 12px;font-size:13px;background:#fff;color:#0f172a;-webkit-appearance:menulist;appearance:menulist}.documents-vip-ai__error{color:#b91c1c}@media (max-width:768px){.documents-vip-ai{padding:0}.documents-vip-ai__panel{border-radius:0}.documents-vip-ai__body{padding:12px}.documents-vip-ai__chat{height:52dvh}.documents-vip-ai__composer{flex-direction:column}}';
    document.head.appendChild(style);
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
            var pagesToRender = Math.min(AI_PDF_PAGE_LIMIT, Math.max(1, totalPages));
            var pages = Array.from({ length: pagesToRender }, function(_, i) { return i + 1; });
            var images = [];
            return pages.reduce(function(chain, pageNumber, index) {
              return chain.then(function() {
                if (onProgress) onProgress('Рендер страницы ' + pageNumber + ' (первые ' + pagesToRender + '/' + totalPages + ')...');
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
              return { kind: 'multimodal', messageText: 'Проанализируй первые 5 страниц этого PDF', images: images, totalPages: totalPages, selectedPages: pages };
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
    panel.innerHTML = '<div class="documents-vip-ai__head"><div><div class="documents-vip-ai__title">VIP AI Ассистент</div><div class="documents-vip-ai__sub">Отдельный чат по приложенным файлам</div><div class="documents-vip-ai__sub">⚠️ ИИ анализирует только первые 5 страниц документа.</div></div><button class="documents-vip-ai__close" aria-label="Закрыть">×</button></div><div class="documents-vip-ai__body"><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Файлы для анализа</div><div class="documents-vip-ai__files"></div></div><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Чат с VIP ИИ</div><div class="documents-vip-ai__chat"></div></div><div class="documents-vip-ai__meta"></div><div class="documents-vip-ai__composer"><select class="documents-vip-ai__select" data-style aria-label="Стиль ответа"></select></div></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var filesNode = panel.querySelector('.documents-vip-ai__files');
    var chatNode = panel.querySelector('.documents-vip-ai__chat');
    var metaNode = panel.querySelector('.documents-vip-ai__meta');
    var styleNode = panel.querySelector('[data-style]');
    var closeButtonVip = panel.querySelector('.documents-vip-ai__close');
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

    var chatHistory = [];
    function pushChat(role, text) {
      var message = createElement('div', 'documents-vip-ai__msg documents-vip-ai__msg--' + role, String(text || ''));
      chatNode.appendChild(message);
      chatNode.scrollTop = chatNode.scrollHeight;
    }

    pushChat('assistant', 'Готов. Выберите режим в выпадающем списке, и после этого запрос отправится автоматически. Важно: ИИ анализирует только первые 5 страниц документа.');

    var isSending = false;

    function sendByCurrentStyle() {
      if (isSending) {
        return;
      }
      if (!styleNode || !String(styleNode.value || '').trim()) {
        pushChat('assistant', 'Пожалуйста, выберите режим.');
        return;
      }
      var promptText = 'Подготовь готовый текст для вставки в шаблон: только основная часть, без шапки, без подписи и без служебных приписок.';
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
          window.DOCUMENTS_LAST_AI_ANSWER = aiText;
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

  function collectTargetContainers() {
    var selectors = [
      '[contenteditable="true"]',
      '.docs-editor__content',
      '.docx-editor',
      '.document-editor',
      '.js-docx-editor',
      '[data-docx-editor]',
      '[data-template-container]'
    ];
    var seen = [];
    selectors.forEach(function(selector) {
      var nodes = document.querySelectorAll(selector);
      Array.prototype.forEach.call(nodes, function(node) {
        if (node && seen.indexOf(node) === -1) {
          seen.push(node);
        }
      });
    });
    if (!seen.length && document.body) {
      seen.push(document.body);
    }
    return seen;
  }

  function replaceMarkerInContainer(container, markerText, replacementText) {
    if (!container || !markerText) return 0;
    var textNodes = [];
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!node || !node.nodeValue || node.nodeValue.indexOf(markerText) === -1 && node.nodeValue.trim() === '') {
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }
    if (!textNodes.length) return 0;

    var fullText = '';
    var map = [];
    textNodes.forEach(function(node) {
      var start = fullText.length;
      var value = String(node.nodeValue || '');
      fullText += value;
      map.push({ node: node, start: start, end: fullText.length });
    });

    var matches = [];
    var cursor = 0;
    while (cursor < fullText.length) {
      var index = fullText.indexOf(markerText, cursor);
      if (index < 0) break;
      matches.push({ start: index, end: index + markerText.length });
      cursor = index + markerText.length;
    }
    if (!matches.length) return 0;

    function resolvePosition(position) {
      for (var i = 0; i < map.length; i += 1) {
        var item = map[i];
        if (position >= item.start && position <= item.end) {
          return { node: item.node, offset: Math.max(0, position - item.start) };
        }
      }
      var last = map[map.length - 1];
      return { node: last.node, offset: String(last.node.nodeValue || '').length };
    }

    for (var m = matches.length - 1; m >= 0; m -= 1) {
      var match = matches[m];
      var startPos = resolvePosition(match.start);
      var endPos = resolvePosition(match.end);
      var range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
      range.deleteContents();
      range.insertNode(document.createTextNode(replacementText));
      range.detach();
    }
    return matches.length;
  }

  function replaceAiMarkerInDocument(replacementText, markerText) {
    var marker = String(markerText || '[ОТВЕТ ИИ]');
    var replacement = String(replacementText || 'Сгенерированный ответ ИИ — здесь может быть любой контент');
    var containers = collectTargetContainers();
    var replacedCount = 0;
    containers.forEach(function(container) {
      replacedCount += replaceMarkerInContainer(container, marker, replacement);
    });
    return replacedCount;
  }

  function ensureTemplateInsertButton() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById('docx-template-insert-btn')) return;

    var style = document.createElement('style');
    style.id = 'docx-template-insert-style';
    style.textContent = '#docx-template-insert-btn{position:fixed;right:12px;bottom:12px;z-index:4200;border:1px solid rgba(255,255,255,.88);background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(241,245,249,.9));backdrop-filter:blur(12px);color:#0f172a;padding:11px 13px;border-radius:13px;font-size:13px;font-weight:700;box-shadow:0 10px 28px rgba(15,23,42,.16);max-width:calc(100vw - 24px)}#docx-template-insert-btn:active{transform:translateY(1px)}.docx-template-modal{position:fixed;inset:0;z-index:4300;background:linear-gradient(180deg,rgba(226,232,240,.52),rgba(148,163,184,.38));backdrop-filter:blur(12px);display:flex;align-items:stretch;justify-content:center;padding:10px}.docx-template-modal__panel{width:min(960px,100%);height:100%;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(248,250,252,.92));border:1px solid rgba(255,255,255,.9);border-radius:22px;box-shadow:0 20px 50px rgba(15,23,42,.18);display:flex;flex-direction:column;overflow:hidden}.docx-template-modal__head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:14px 16px;border-bottom:1px solid rgba(226,232,240,.95);background:rgba(255,255,255,.72);backdrop-filter:blur(8px)}.docx-template-modal__title{font-size:18px;font-weight:800;color:#0f172a}.docx-template-modal__sub{font-size:12px;color:#64748b;margin-top:3px}.docx-template-modal__close{width:36px;height:36px;border:none;border-radius:11px;background:#fff;color:#475569;font-size:21px}.docx-template-modal__body{padding:14px;display:grid;gap:10px;flex:1;min-height:0}.docx-template-modal__hint{font-size:12px;color:#475569;background:rgba(219,234,254,.5);border:1px solid rgba(191,219,254,.9);border-radius:12px;padding:9px 10px}.docx-template-modal__textarea{width:100%;height:100%;min-height:44dvh;max-height:100%;resize:none;border:1px solid rgba(203,213,225,.95);border-radius:14px;background:rgba(255,255,255,.9);padding:12px 13px;font-size:14px;line-height:1.55;color:#0f172a;outline:none}.docx-template-modal__textarea:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(147,197,253,.22)}.docx-template-modal__foot{display:flex;justify-content:flex-end;gap:10px;padding:12px 14px;border-top:1px solid rgba(226,232,240,.95);background:rgba(255,255,255,.78)}.docx-template-modal__btn{border:1px solid rgba(148,163,184,.45);background:#fff;color:#334155;border-radius:12px;padding:10px 14px;font-weight:700;min-height:42px}.docx-template-modal__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8}.docx-template-modal__btn[disabled]{opacity:.6}.docx-template-modal__error{font-size:12px;color:#b91c1c;min-height:16px}@media (max-width:768px){#docx-template-insert-btn{left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));width:auto;padding:12px 14px;font-size:14px;border-radius:14px}.docx-template-modal{padding:0}.docx-template-modal__panel{border-radius:0}.docx-template-modal__head{padding:12px}.docx-template-modal__body{padding:12px}.docx-template-modal__textarea{min-height:54dvh;font-size:16px}.docx-template-modal__foot{padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom));flex-direction:column}.docx-template-modal__btn{width:100%}}';
    document.head.appendChild(style);

    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'docx-template-insert-btn';
    button.textContent = 'Шаблон';
    button.setAttribute('aria-label', 'Вставить текст в маркер [ОТВЕТ ИИ]');
    button.addEventListener('click', function() {
      openTemplateAnswerEditor(button);
    });
    document.body.appendChild(button);
  }

  function ensureTemplatePreviewStyles() {
    if (document.getElementById('docx-template-preview-style')) return;
    var style = document.createElement('style');
    style.id = 'docx-template-preview-style';
    style.textContent = '.docx-template-preview{position:fixed;inset:0;z-index:4400;background:rgba(2,6,23,.56);backdrop-filter:blur(8px);display:flex;align-items:stretch;justify-content:center;padding:0}.docx-template-preview__card{width:100%;height:100dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:0;border:1px solid rgba(255,255,255,.7);background:linear-gradient(150deg,rgba(255,255,255,.98),rgba(239,246,255,.95));box-shadow:0 24px 52px rgba(15,23,42,.32)}.docx-template-preview__head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(203,213,225,.85)}.docx-template-preview__title{font-size:14px;font-weight:800;color:#0f172a}.docx-template-preview__hint{font-size:12px;color:#64748b;margin-top:2px}.docx-template-preview__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.docx-template-preview__btn{border:1px solid rgba(203,213,225,.9);background:#fff;border-radius:10px;padding:6px 10px;min-height:36px;font-weight:700;color:#0f172a}.docx-template-preview__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8}.docx-template-preview__body{flex:1;min-height:0;background:#e2e8f0}.docx-template-preview__frame{width:100%;height:100%;border:0;background:#e2e8f0}.docx-template-preview__status{padding:8px 12px;border-top:1px solid rgba(203,213,225,.82);font-size:12px;color:#334155;background:rgba(248,250,252,.95)}@media (max-width:768px){.docx-template-preview__head{padding:10px}.docx-template-preview__actions{width:100%}.docx-template-preview__btn{flex:1;min-width:0;padding:8px 10px}}';
    document.head.appendChild(style);
  }

  function resolveLatestAiAnswerText() {
    var stored = typeof window.DOCUMENTS_LAST_AI_ANSWER === 'string' ? window.DOCUMENTS_LAST_AI_ANSWER.trim() : '';
    if (stored) return stored;
    var messages = document.querySelectorAll('.documents-vip-ai__msg--assistant');
    for (var i = messages.length - 1; i >= 0; i -= 1) {
      var text = String(messages[i].textContent || '').trim();
      if (text && text !== '⏳ Обрабатываю запрос...') return text;
    }
    return 'Сгенерированный ответ ИИ — здесь может быть любой контент';
  }

  function openTemplateAnswerEditor(triggerButton) {
    if (document.querySelector('.docx-template-modal')) return;
    var overlay = document.createElement('div');
    overlay.className = 'docx-template-modal';
    overlay.innerHTML = '<div class="docx-template-modal__panel" role="dialog" aria-modal="true" aria-label="Редактор ответа ИИ для шаблона"><div class="docx-template-modal__head"><div><div class="docx-template-modal__title">Ответ ИИ для шаблона</div><div class="docx-template-modal__sub">Проверьте текст перед генерацией DOCX</div></div><button class="docx-template-modal__close" type="button" aria-label="Закрыть">×</button></div><div class="docx-template-modal__body"><div class="docx-template-modal__hint">Можно отредактировать ответ, затем нажать «Готово». После этого откроется красивое превью с кнопкой скачивания.</div><textarea class="docx-template-modal__textarea" spellcheck="true"></textarea><div class="docx-template-modal__error" aria-live="polite"></div></div><div class="docx-template-modal__foot"><button type="button" class="docx-template-modal__btn" data-action="cancel">Отмена</button><button type="button" class="docx-template-modal__btn docx-template-modal__btn--primary" data-action="done">Готово</button></div></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var textarea = overlay.querySelector('.docx-template-modal__textarea');
    var closeButton = overlay.querySelector('.docx-template-modal__close');
    var cancelButton = overlay.querySelector('[data-action="cancel"]');
    var doneButton = overlay.querySelector('[data-action="done"]');
    var errorNode = overlay.querySelector('.docx-template-modal__error');
    var previousButtonText = triggerButton ? triggerButton.textContent : '';
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.textContent = 'Редактирование...';
    }
    textarea.value = resolveLatestAiAnswerText();
    setTimeout(function() { textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 10);

    function closeEditor() {
      document.body.style.overflow = '';
      overlay.remove();
      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.textContent = previousButtonText || 'Шаблон';
      }
    }

    function renderError(message) {
      if (errorNode) errorNode.textContent = message || '';
    }

    closeButton.addEventListener('click', closeEditor);
    cancelButton.addEventListener('click', closeEditor);
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeEditor();
    });
    document.addEventListener('keydown', function escListener(event) {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', escListener);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
      }
    });

    doneButton.addEventListener('click', function() {
      var aiTextRaw = String(textarea.value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!aiTextRaw.trim()) {
        renderError('Введите текст ответа, чтобы сформировать шаблон.');
        textarea.focus();
        return;
      }
      var aiText = aiTextRaw.replace(/[ \t]+$/gm, '');
      renderError('');
      doneButton.disabled = true;
      doneButton.textContent = 'Генерирую...';
      var replaced = replaceAiMarkerInDocument(aiText, '[ОТВЕТ ИИ]');
      if (replaced <= 0) {
        console.warn('[documents] Метка [ОТВЕТ ИИ] не найдена в текущем DOM-превью, продолжаю генерацию через серверный шаблон.');
      }
      window.DOCUMENTS_LAST_AI_ANSWER = aiText;
      generateTemplateFilesViaApi(aiText)
        .then(function(files) {
          if (!files || !files.docxBlob || !files.pdfBlob) throw new Error('empty_blob');
          closeEditor();
          openDocxRenderPreviewPage(files);
        })
        .catch(function(error) {
          renderError('Не удалось создать превью: ' + (error && error.message ? error.message : 'неизвестная ошибка'));
        })
        .finally(function() {
          doneButton.disabled = false;
          doneButton.textContent = 'Готово';
        });
    });
  }

  function openDocxRenderPreviewPage(files) {
    ensureTemplatePreviewStyles();
    if (!files || !files.docxBlob || !files.pdfBlob) throw new Error('empty_blob');
    var existing = document.querySelector('.docx-template-preview');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.className = 'docx-template-preview';
    overlay.innerHTML = '<div class="docx-template-preview__card"><div class="docx-template-preview__head"><div><div class="docx-template-preview__title">Предварительный просмотр PDF</div><div class="docx-template-preview__hint">Текст уже вставлен в DOCX и конвертирован в PDF</div></div><div class="docx-template-preview__actions"><button type="button" class="docx-template-preview__btn" data-preview-open>Открыть как «Просмотреть»</button><button type="button" class="docx-template-preview__btn docx-template-preview__btn--primary" data-preview-download-pdf>Скачать PDF</button><button type="button" class="docx-template-preview__btn" data-preview-download-docx>Скачать DOCX</button><button type="button" class="docx-template-preview__btn" data-preview-close>Закрыть</button></div></div><div class="docx-template-preview__body"><iframe class="docx-template-preview__frame" title="PDF preview" data-preview-frame></iframe></div><div class="docx-template-preview__status" data-preview-status>Подготовка PDF предпросмотра…</div></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var frame = overlay.querySelector('[data-preview-frame]');
    var statusNode = overlay.querySelector('[data-preview-status]');
    var downloadPdfBtn = overlay.querySelector('[data-preview-download-pdf]');
    var downloadDocxBtn = overlay.querySelector('[data-preview-download-docx]');
    var openBtn = overlay.querySelector('[data-preview-open]');
    var closeBtn = overlay.querySelector('[data-preview-close]');
    var docxBlobUrl = URL.createObjectURL(files.docxBlob);
    var pdfBlobUrl = URL.createObjectURL(files.pdfBlob);

    function closeModal() {
      document.body.style.overflow = '';
      URL.revokeObjectURL(docxBlobUrl);
      URL.revokeObjectURL(pdfBlobUrl);
      overlay.remove();
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeModal();
    });
    downloadPdfBtn.addEventListener('click', function() {
      var a = document.createElement('a');
      a.href = pdfBlobUrl;
      a.download = 'template-answer.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    downloadDocxBtn.addEventListener('click', function() {
      var a = document.createElement('a');
      a.href = docxBlobUrl;
      a.download = 'template-answer.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    var openExternalViewer = typeof window !== 'undefined' && typeof window.__APPDOSC_OPEN_FILES_VIEWER__ === 'function'
      ? window.__APPDOSC_OPEN_FILES_VIEWER__
      : null;
    openBtn.addEventListener('click', function() {
      if (!openExternalViewer) {
        statusNode.textContent = 'Просмотрщик «Просмотреть» сейчас недоступен.';
        return;
      }
      statusNode.textContent = 'Открываю через логику «Просмотреть»...';
      Promise.resolve(openExternalViewer([{ name: 'template-answer.pdf', originalName: 'template-answer.pdf', storedName: 'template-answer.pdf', url: pdfBlobUrl, resolvedUrl: pdfBlobUrl, previewUrl: pdfBlobUrl, fileUrl: pdfBlobUrl, mimeType: 'application/pdf' }], {}, { notify: true, hasMultiple: false }))
        .then(function() {
          statusNode.textContent = 'Файл открыт через «Просмотреть».';
        })
        .catch(function(error) {
          statusNode.textContent = (error && error.message) ? error.message : 'Не удалось открыть через «Просмотреть».';
        });
    });

    frame.src = pdfBlobUrl;
    statusNode.textContent = 'Готово: PDF открыт в предпросмотре. Можно скачать PDF и DOCX.';
  }

  async function generateTemplateFileViaApi(answerText, format) {
    var apiUrl = (window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php');
    var formData = new FormData();
    formData.append('action', 'generate_document');
    formData.append('format', format);
    formData.append('answer', String(answerText || ''));
    formData.append('documentTitle', 'Ответ ИИ');
    var response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    if (!response.ok) {
      throw new Error('Ошибка генерации шаблона (' + response.status + ')');
    }
    var blob = await response.blob();
    if (!blob || !blob.size) {
      return null;
    }
    return blob;
  }

  async function generateTemplateFilesViaApi(answerText) {
    var docxBlob = await generateTemplateFileViaApi(answerText, 'docx');
    if (!docxBlob) throw new Error('docx_not_generated');
    var pdfBlob = null;
    try {
      pdfBlob = await generatePdfFromDocxViaApi(docxBlob);
    } catch (error) {
      console.warn('[documents] DOCX→PDF конвертация недоступна, fallback на прямую генерацию PDF:', error && error.message ? error.message : error);
      pdfBlob = await generateTemplateFileViaApi(answerText, 'pdf');
    }
    if (!pdfBlob) throw new Error('pdf_not_generated');
    return { docxBlob: docxBlob, pdfBlob: pdfBlob };
  }

  async function generatePdfFromDocxViaApi(docxBlob) {
    if (!docxBlob) throw new Error('docx_blob_missing');
    var apiUrl = (window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php');
    var formData = new FormData();
    formData.append('action', 'convert_docx_to_pdf');
    formData.append('file', new File([docxBlob], 'template-answer.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    var response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    if (!response.ok) {
      throw new Error('Ошибка конвертации DOCX→PDF (' + response.status + ')');
    }
    var pdfBlob = await response.blob();
    if (!pdfBlob || !pdfBlob.size) return null;
    return pdfBlob;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTemplateInsertButton);
  } else {
    ensureTemplateInsertButton();
  }

  window.openDocumentsVipAiPaidModal = openDocumentsVipAiPaidModal;
  window.replaceAiMarkerInDocument = replaceAiMarkerInDocument;
})();
