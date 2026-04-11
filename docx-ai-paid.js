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
  var RESPONSE_OUTPUT_DIRECTIVE = [
    'РЕЖИМ «Ответ с помощью ИИ»: верни только текст, который сразу вставляется в документ.',
    'Запрещены приветствия, обращения, подписи, имена, должности, реквизиты, номера счетов и контакты.',
    'Запрещены мета-блоки и фразы вроде: «Анализ», «Разбор», «Я проанализировал».',
    'Если данных недостаточно — укажи только недостающие данные, без служебных фраз.'
  ].join('\n');

  var briefPdfJsLoader = null;
  var docxPreviewHtmlCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
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

  function escapeHtmlInline(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureVipAiModalStyles() {
    if (document.getElementById('documents-vip-ai-modal-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-vip-ai-modal-style';
    style.textContent = '.documents-vip-ai{position:fixed;inset:0;background:linear-gradient(180deg,rgba(226,232,240,.34),rgba(148,163,184,.28));backdrop-filter:blur(10px);z-index:4100;display:flex;align-items:stretch;justify-content:center;padding:4px}.documents-vip-ai__panel{width:100%;height:100%;max-height:none;overflow:auto;border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(248,250,252,.9));border:1px solid rgba(255,255,255,.92);box-shadow:0 18px 44px rgba(15,23,42,.16)}.documents-vip-ai__head{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(226,232,240,.9);position:sticky;top:0;background:rgba(255,255,255,.78);backdrop-filter:blur(8px);z-index:2}.documents-vip-ai__title{font-size:18px;font-weight:800;color:#0f172a}.documents-vip-ai__sub{font-size:12px;color:#64748b;margin-top:3px}.documents-vip-ai__close{border:none;background:rgba(255,255,255,.95);width:34px;height:34px;border-radius:10px;color:#334155;font-size:20px}.documents-vip-ai__body{padding:14px;display:grid;gap:10px}.documents-vip-ai__meta{display:flex;flex-wrap:wrap;gap:8px}.documents-vip-ai__chip{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.84);border:1px solid rgba(203,213,225,.95);font-size:12px;color:#334155}.documents-vip-ai__block{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.78);border-radius:14px;padding:11px}.documents-vip-ai__label{font-size:12px;color:#64748b;margin-bottom:7px}.documents-vip-ai__files{display:grid;gap:6px;font-size:13px;color:#0f172a;max-height:20dvh;overflow:auto}.documents-vip-ai__chat{height:min(50dvh,520px);overflow:auto;display:flex;flex-direction:column;gap:8px}.documents-vip-ai__msg{padding:9px 10px;border-radius:12px;font-size:13px;line-height:1.58;white-space:pre-wrap}.documents-vip-ai__msg--user{align-self:flex-end;background:#dbeafe;color:#1e3a8a}.documents-vip-ai__msg--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(203,213,225,.9)}.documents-vip-ai__msg-content{display:block;line-height:1.62}.documents-vip-ai__msg-content p,.documents-vip-ai__msg-content ul,.documents-vip-ai__msg-content ol,.documents-vip-ai__msg-content h4{margin:0 0 10px}.documents-vip-ai__msg-content p:last-child,.documents-vip-ai__msg-content ul:last-child,.documents-vip-ai__msg-content ol:last-child,.documents-vip-ai__msg-content h4:last-child{margin-bottom:0}.documents-vip-ai__msg-content ul,.documents-vip-ai__msg-content ol{padding-left:18px}.documents-vip-ai__msg-content li{margin:0 0 6px}.documents-vip-ai__msg-content h4{font-size:14px;font-weight:700;line-height:1.4;color:#0b1220}.documents-vip-ai__composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px;border:1px solid rgba(203,213,225,.9);border-radius:14px;background:rgba(255,255,255,.7)}.documents-vip-ai__select{min-width:0;border:1px solid rgba(203,213,225,.95);border-radius:12px;min-height:44px;padding:0 12px;font-size:13px;background:#fff;color:#0f172a;-webkit-appearance:menulist;appearance:menulist}.documents-vip-ai__template-btn{border:1px solid rgba(148,163,184,.42);background:linear-gradient(135deg,rgba(255,255,255,.98),rgba(241,245,249,.92));color:#0f172a;border-radius:12px;padding:0 14px;min-height:44px;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 8px 20px rgba(15,23,42,.11)}.documents-vip-ai__template-btn:active{transform:translateY(1px)}.documents-vip-ai__template-btn[disabled]{opacity:.56;box-shadow:none;cursor:not-allowed}.documents-vip-ai__error{color:#b91c1c}@media (max-width:768px){.documents-vip-ai{padding:0}.documents-vip-ai__panel{border-radius:0}.documents-vip-ai__body{padding:12px}.documents-vip-ai__chat{height:52dvh}.documents-vip-ai__msg{font-size:14px;line-height:1.64}.documents-vip-ai__composer{grid-template-columns:1fr}.documents-vip-ai__template-btn{width:100%;font-size:14px;min-height:46px}}';
    style.textContent += '.documents-vip-ai__loading{display:none;align-items:center;gap:8px;padding:10px 12px;border:1px solid rgba(191,219,254,.95);background:rgba(239,246,255,.75);color:#1e3a8a;border-radius:12px;font-size:12px;font-weight:600}.documents-vip-ai__loading.is-active{display:flex}.documents-vip-ai__loading-spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(37,99,235,.25);border-top-color:#2563eb;animation:documents-vip-spin .8s linear infinite;flex:none}@keyframes documents-vip-spin{to{transform:rotate(360deg)}}';
    style.textContent += '.documents-vip-ai__panel{position:relative}.documents-vip-ai__head::after{content:\"\";position:absolute;left:14px;right:14px;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(148,163,184,.45),transparent)}.documents-vip-ai__files label{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(226,232,240,.95);border-radius:12px;background:rgba(255,255,255,.8);transition:all .18s ease}.documents-vip-ai__files label:active{transform:scale(.995)}.documents-vip-ai__files input[type=\"checkbox\"]{width:18px;height:18px;accent-color:#2563eb;flex:none}.documents-vip-ai__files span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.documents-vip-ai__block{box-shadow:0 8px 24px rgba(15,23,42,.06)}.documents-vip-ai__msg--assistant{box-shadow:0 6px 18px rgba(15,23,42,.06)}.documents-vip-ai__msg--user{box-shadow:0 6px 16px rgba(37,99,235,.2)}.documents-vip-ai__meta{padding:2px 0}.documents-vip-ai__chip{background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(241,245,249,.9));box-shadow:0 4px 12px rgba(15,23,42,.05)}.documents-vip-ai__template-btn{transition:transform .16s ease,box-shadow .16s ease}.documents-vip-ai__template-btn:hover{transform:translateY(-1px);box-shadow:0 10px 20px rgba(15,23,42,.14)}.documents-vip-ai__select:focus,.documents-vip-ai__template-btn:focus,.documents-vip-ai__close:focus{outline:none;box-shadow:0 0 0 3px rgba(37,99,235,.2)}.documents-vip-ai__startup{position:absolute;inset:0;display:none;place-items:center;padding:18px;background:linear-gradient(180deg,rgba(248,250,252,.92),rgba(241,245,249,.9));backdrop-filter:blur(4px);z-index:4}.documents-vip-ai__startup.is-active{display:grid}.documents-vip-ai__startup-card{width:min(420px,94%);border:1px solid rgba(191,219,254,.95);background:rgba(255,255,255,.9);border-radius:16px;padding:14px;display:grid;gap:8px;box-shadow:0 14px 30px rgba(15,23,42,.14)}.documents-vip-ai__startup-title{font-size:14px;font-weight:800;color:#0f172a}.documents-vip-ai__startup-sub{font-size:12px;color:#475569}.documents-vip-ai__startup-progress{height:7px;border-radius:999px;background:rgba(191,219,254,.45);overflow:hidden}.documents-vip-ai__startup-progress::after{content:\"\";display:block;height:100%;width:36%;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#38bdf8);animation:documents-vip-progress 1.3s ease-in-out infinite}.documents-vip-ai__startup-spinner{width:16px;height:16px;border-radius:50%;border:2px solid rgba(37,99,235,.25);border-top-color:#2563eb;animation:documents-vip-spin .8s linear infinite}@keyframes documents-vip-progress{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}@media (max-width:768px){.documents-vip-ai__files label{padding:9px 10px}.documents-vip-ai__chip{font-size:11px}.documents-vip-ai__startup-card{padding:13px}}';
    style.textContent += '.documents-vip-ai__body{gap:8px;padding:12px}.documents-vip-ai__block{padding:10px;border-radius:12px}.documents-vip-ai__label{margin-bottom:6px}.documents-vip-ai__chat{height:min(46dvh,480px)}.documents-vip-ai__msg{padding:8px 10px;font-size:13px;line-height:1.52}.documents-vip-ai__composer{padding:8px;border-radius:12px}.documents-vip-ai__select,.documents-vip-ai__template-btn{min-height:42px;font-size:13px}.documents-vip-ai__head{padding:12px 14px}.documents-vip-ai__title{font-size:17px}@media (max-width:768px){.documents-vip-ai__body{padding:10px;gap:7px}.documents-vip-ai__chat{height:48dvh}.documents-vip-ai__msg{font-size:13px;line-height:1.56}.documents-vip-ai__head{padding:10px 12px}.documents-vip-ai__title{font-size:16px}.documents-vip-ai__template-btn,.documents-vip-ai__select{min-height:44px}}';
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
    var preparedPrompt = [promptText, styleMeta && styleMeta.prompt ? styleMeta.prompt : '', VISION_QUALITY_DIRECTIVE, RESPONSE_OUTPUT_DIRECTIVE, 'Верни готовый ответ на письмо. Не пиши анализ.']
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
    finalPrompt = [finalPrompt, RESPONSE_OUTPUT_DIRECTIVE].filter(Boolean).join('\n\n');
    if (payloadContext.ocrSummary) {
      finalPrompt += '\n\nOCR контекст по каждому файлу:\n' + payloadContext.ocrSummary;
    }
    formData.append('prompt', finalPrompt.slice(0, 70000));
    formData.append('context', JSON.stringify(payloadContext));
    return formData;
  }

  function resolveOrganizationSlugFromPath(pathname) {
    var pathValue = String(pathname || '');
    var match = pathValue.match(/\/js\/documents\/([^/?#]+)/i);
    if (!match || !match[1]) {
      return '';
    }
    var candidate = decodeURIComponent(String(match[1] || '')).trim();
    if (!candidate) return '';
    if (/\.(js|php|html?)$/i.test(candidate)) return '';
    return candidate;
  }

  function resolveOrganizationSlug(payload) {
    var context = payload && payload.context && typeof payload.context === 'object' ? payload.context : {};
    var documentData = payload && payload.documentData && typeof payload.documentData === 'object' ? payload.documentData : {};
    var directCandidates = [
      payload && typeof payload.organization === 'string' ? payload.organization : '',
      typeof context.organization === 'string' ? context.organization : '',
      typeof documentData.organization === 'string' ? documentData.organization : ''
    ];
    for (var i = 0; i < directCandidates.length; i += 1) {
      var directValue = String(directCandidates[i] || '').trim();
      if (directValue) return directValue;
    }
    var pathCandidates = [];
    if (typeof window !== 'undefined' && window.location) {
      pathCandidates.push(window.location.pathname || '');
    }
    if (typeof document !== 'undefined') {
      if (document.currentScript && document.currentScript.src) {
        pathCandidates.push(document.currentScript.src);
      }
      var scripts = document.querySelectorAll('script[src]');
      for (var s = 0; s < scripts.length; s += 1) {
        pathCandidates.push(scripts[s].getAttribute('src') || '');
      }
    }
    for (var j = 0; j < pathCandidates.length; j += 1) {
      var fromPath = resolveOrganizationSlugFromPath(pathCandidates[j]);
      if (fromPath) return fromPath;
    }
    return '';
  }

  function buildOrganizationTemplateConfig(organizationName) {
    var normalizedOrg = String(organizationName || '').trim();
    if (!normalizedOrg) {
      return {
        organization: '',
        templateFileName: '',
        templatePath: ''
      };
    }
    var folderPart = encodeURIComponent(normalizedOrg);
    var fileName = normalizedOrg + '_template.docx';
    var filePart = encodeURIComponent(fileName);
    return {
      organization: normalizedOrg,
      templateFileName: fileName,
      templatePath: '/documents/' + folderPart + '/' + filePart
    };
  }

  function showAttachSuccessToast(message) {
    if (typeof document === 'undefined') return;
    var style = document.getElementById('docx-attach-toast-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'docx-attach-toast-style';
      style.textContent = '.docx-attach-toast{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4700;max-width:min(92vw,560px);padding:10px 12px;border-radius:14px;border:1px solid rgba(187,247,208,.95);background:linear-gradient(145deg,rgba(240,253,244,.95),rgba(220,252,231,.92));backdrop-filter:blur(8px);box-shadow:0 12px 28px rgba(15,23,42,.18);color:#14532d;font-size:12px;line-height:1.45;font-weight:700}';
      document.head.appendChild(style);
    }
    var existing = document.querySelector('.docx-attach-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'docx-attach-toast';
    toast.textContent = String(message || '');
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3500);
  }

  function resolveTaskContext(options) {
    var safeOptions = options && typeof options === 'object' ? options : {};
    var payload = safeOptions.payload && typeof safeOptions.payload === 'object' ? safeOptions.payload : {};
    var context = payload.context && typeof payload.context === 'object' ? payload.context : {};
    var documentData = payload.documentData && typeof payload.documentData === 'object' ? payload.documentData : {};
    var directTask = safeOptions.task && typeof safeOptions.task === 'object'
      ? safeOptions.task
      : (payload.task && typeof payload.task === 'object' ? payload.task : (context.task && typeof context.task === 'object' ? context.task : null));
    if (directTask) {
      return directTask;
    }
    var taskId = String(
      safeOptions.documentId
      || safeOptions.taskId
      || payload.documentId
      || payload.taskId
      || context.documentId
      || context.taskId
      || documentData.id
      || ''
    ).trim();
    if (!taskId) {
      return null;
    }
    return {
      id: taskId,
      entryNumber: String(documentData.entryNumber || documentData.number || context.entryNumber || context.number || '').trim(),
      responsible: documentData.responsible || context.responsible || payload.responsible || '',
      organization: String(safeOptions.organization || payload.organization || context.organization || documentData.organization || '').trim(),
      organizationName: String(documentData.organizationName || '').trim()
    };
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
    var organizationSlug = resolveOrganizationSlug(payload);
    var organizationCaption = organizationSlug
      ? '<div class="documents-vip-ai__sub">🏢 Организация: ' + escapeHtmlText(organizationSlug) + '</div>'
      : '';
    var overlay = createElement('div', 'documents-vip-ai');
    var panel = createElement('div', 'documents-vip-ai__panel');
    panel.innerHTML = '<div class="documents-vip-ai__head"><div><div class="documents-vip-ai__title">VIP AI Ассистент</div><div class="documents-vip-ai__sub">Отдельный чат по приложенным файлам</div>' + organizationCaption + '<div class="documents-vip-ai__sub">⚠️ Важно: ИИ анализирует только первые 5 страниц каждого PDF-документа.</div></div><button class="documents-vip-ai__close" aria-label="Закрыть">×</button></div><div class="documents-vip-ai__body"><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Файлы для анализа</div><div class="documents-vip-ai__files"></div></div><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Чат с VIP ИИ</div><div class="documents-vip-ai__chat"></div></div><div class="documents-vip-ai__loading" data-vip-loading><span class="documents-vip-ai__loading-spinner" aria-hidden="true"></span><span data-vip-loading-text>Готовим ответ с помощью ИИ…</span></div><div class="documents-vip-ai__meta"></div><div class="documents-vip-ai__composer"><select class="documents-vip-ai__select" data-style aria-label="Стиль ответа"></select><button class="documents-vip-ai__template-btn" data-template-open type="button">Шаблон</button></div></div><div class="documents-vip-ai__startup is-active" data-vip-startup><div class="documents-vip-ai__startup-card"><div style="display:flex;align-items:center;gap:8px"><span class="documents-vip-ai__startup-spinner" aria-hidden="true"></span><div class="documents-vip-ai__startup-title">Открываем AI-модуль</div></div><div class="documents-vip-ai__startup-sub">Подготавливаем интерфейс и список файлов…</div><div class="documents-vip-ai__startup-progress" aria-hidden="true"></div></div></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var filesNode = panel.querySelector('.documents-vip-ai__files');
    var chatNode = panel.querySelector('.documents-vip-ai__chat');
    var metaNode = panel.querySelector('.documents-vip-ai__meta');
    var loadingNode = panel.querySelector('[data-vip-loading]');
    var loadingTextNode = panel.querySelector('[data-vip-loading-text]');
    var startupNode = panel.querySelector('[data-vip-startup]');
    var styleNode = panel.querySelector('[data-style]');
    var templateButton = panel.querySelector('[data-template-open]');
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
    if (templateButton) {
      templateButton.disabled = !String(typeof window.DOCUMENTS_LAST_AI_ANSWER === 'string' ? window.DOCUMENTS_LAST_AI_ANSWER : '').trim();
    }
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
        var taskContext = resolveTaskContext({
          task: payload && payload.task ? payload.task : null,
          payload: payload,
          organization: organizationSlug
        });
        openTemplateAnswerEditor(templateButton, {
          organization: organizationSlug,
          task: taskContext,
          payload: payload
        });
      });
    }
    setTimeout(function() {
      if (startupNode) {
        startupNode.classList.remove('is-active');
      }
    }, 260);

    var chatHistory = [];
    function setVipLoading(active, text) {
      if (loadingNode) {
        loadingNode.classList.toggle('is-active', Boolean(active));
      }
      if (loadingTextNode && text) {
        loadingTextNode.textContent = String(text);
      }
    }
    function sanitizeWhitelistedHtml(html) {
      var template = document.createElement('template');
      template.innerHTML = String(html || '');
      var allowedTags = {
        P: true,
        UL: true,
        OL: true,
        LI: true,
        H4: true,
        BR: true
      };
      var nodes = template.content.querySelectorAll('*');
      Array.prototype.forEach.call(nodes, function(node) {
        var tagName = String(node.tagName || '').toUpperCase();
        if (!allowedTags[tagName]) {
          var parent = node.parentNode;
          while (node.firstChild) {
            parent.insertBefore(node.firstChild, node);
          }
          parent.removeChild(node);
          return;
        }
        while (node.attributes.length) {
          node.removeAttribute(node.attributes[0].name);
        }
      });
      return template.innerHTML;
    }

    function formatAiTextToHtml(text) {
      var normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
      if (!normalized) {
        return '<p>Пустой ответ.</p>';
      }
      var paragraphs = normalized.split(/\n{2,}/).map(function(part) {
        return part.trim();
      }).filter(Boolean);
      var htmlParts = [];
      paragraphs.forEach(function(paragraph) {
        var lines = paragraph.split('\n').map(function(line) {
          return line.trim();
        }).filter(Boolean);
        if (!lines.length) {
          return;
        }
        var bulletLines = lines.filter(function(line) { return /^[-*•]\s+/.test(line); });
        var numberedLines = lines.filter(function(line) { return /^\d+[.)]\s+/.test(line); });
        if (bulletLines.length === lines.length) {
          htmlParts.push('<ul>' + lines.map(function(line) {
            return '<li>' + escapeHtmlText(line.replace(/^[-*•]\s+/, '')) + '</li>';
          }).join('') + '</ul>');
          return;
        }
        if (numberedLines.length === lines.length) {
          htmlParts.push('<ol>' + lines.map(function(line) {
            return '<li>' + escapeHtmlText(line.replace(/^\d+[.)]\s+/, '')) + '</li>';
          }).join('') + '</ol>');
          return;
        }
        if (lines.length === 1) {
          var headingCandidate = lines[0];
          if (headingCandidate.length > 2 && headingCandidate.length <= 70 && !/[.!?:]$/.test(headingCandidate)) {
            htmlParts.push('<h4>' + escapeHtmlText(headingCandidate) + '</h4>');
            return;
          }
        }
        htmlParts.push('<p>' + lines.map(function(line) { return escapeHtmlText(line); }).join('<br>') + '</p>');
      });
      return sanitizeWhitelistedHtml(htmlParts.join('') || ('<p>' + escapeHtmlText(normalized) + '</p>'));
    }

    function pushChat(role, text) {
      var message = createElement('div', 'documents-vip-ai__msg documents-vip-ai__msg--' + role);
      message.setAttribute('data-raw-text', String(text || ''));
      if (role === 'assistant') {
        var content = createElement('div', 'documents-vip-ai__msg-content');
        content.innerHTML = formatAiTextToHtml(text);
        message.appendChild(content);
        var normalizedAssistant = String(text || '').trim();
        if (normalizedAssistant && normalizedAssistant !== '⏳ Обрабатываю запрос...') {
          window.DOCUMENTS_LAST_AI_ANSWER = normalizedAssistant;
          if (templateButton) templateButton.disabled = false;
        }
      } else {
        message.textContent = String(text || '');
      }
      chatNode.appendChild(message);
      chatNode.scrollTop = chatNode.scrollHeight;
    }

    pushChat('assistant', 'Готов. Выберите режим в выпадающем списке — запрос отправится автоматически. Важно: ИИ анализирует только первые 5 страниц каждого PDF-документа.');

    var isSending = false;

    function sendByCurrentStyle() {
      if (isSending) {
        return;
      }
      if (!styleNode || !String(styleNode.value || '').trim()) {
        pushChat('assistant', 'Пожалуйста, выберите режим.');
        return;
      }
      var promptText = 'Дай готовый текст ответа по файлу для вставки в документ: только суть, без приветствия, подписи, реквизитов и счетов.';
      var selectedStyle = styleNode && styleNode.value ? String(styleNode.value) : 'neutral';
      isSending = true;
      pushChat('user', 'Стиль: ' + (resolveVipStyle(selectedStyle).label || 'Нейтральный') + '. Нужен только готовый текст для вставки в документ.');
      pushChat('assistant', '⏳ Обрабатываю запрос...');
      setVipLoading(true, 'Готовим ответ с помощью ИИ…');
      metaNode.innerHTML = '<span class="documents-vip-ai__chip">⏳ Запрос отправлен, ждём ответ…</span>';
      var startedAt = Date.now();
      var selectedEntryObjects = linkedEntries.filter(function(entry) { return selectedFiles[entry.key]; })
        .concat(pendingEntries.filter(function(entry) { return selectedFiles[entry.key]; }));
      chatHistory.push({ role: 'user', text: promptText, ts: Date.now() });

      Promise.resolve()
        .then(function() {
          return requestVipVisionResponse(promptText, selectedEntryObjects, selectedStyle, function(message) {
            setVipLoading(true, message || 'Обрабатываем файлы…');
            metaNode.innerHTML = '<span class="documents-vip-ai__chip">' + escapeHtmlText(message) + '</span>';
          });
        })
        .then(function(data) {
          var aiText = String((data && data.response) || (data && data.answer) || '').trim() || 'Пустой ответ.';
          window.DOCUMENTS_LAST_AI_ANSWER = aiText;
          if (templateButton) templateButton.disabled = false;
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
          setVipLoading(false);
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
    if (document.getElementById('docx-template-insert-style')) return;

    var style = document.createElement('style');
    style.id = 'docx-template-insert-style';
    style.textContent = '.docx-template-modal{position:fixed;inset:0;z-index:4300;background:linear-gradient(180deg,rgba(226,232,240,.52),rgba(148,163,184,.38));backdrop-filter:blur(12px);display:flex;align-items:stretch;justify-content:center;padding:0}.docx-template-modal__panel{width:100%;height:100dvh;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(248,250,252,.92));border:1px solid rgba(255,255,255,.9);border-radius:0;box-shadow:0 20px 50px rgba(15,23,42,.18);display:flex;flex-direction:column;overflow:hidden}.docx-template-modal__head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:14px 16px;border-bottom:1px solid rgba(226,232,240,.95);background:rgba(255,255,255,.72);backdrop-filter:blur(8px)}.docx-template-modal__title{font-size:18px;font-weight:800;color:#0f172a}.docx-template-modal__sub{font-size:12px;color:#64748b;margin-top:3px}.docx-template-modal__close{width:36px;height:36px;border:none;border-radius:11px;background:#fff;color:#475569;font-size:21px}.docx-template-modal__body{padding:14px;display:grid;gap:10px;flex:1;min-height:0;overflow:auto}.docx-template-modal__hint{font-size:12px;color:#334155;background:rgba(219,234,254,.45);border:1px solid rgba(191,219,254,.9);border-radius:12px;padding:10px 11px}.docx-template-modal__paper{margin:0 auto;width:min(760px,100%);background:linear-gradient(175deg,rgba(255,255,255,.97),rgba(255,255,255,.9));border:1px solid rgba(203,213,225,.85);border-radius:18px;box-shadow:0 16px 36px rgba(15,23,42,.12);padding:14px;display:grid;gap:14px}.docx-template-modal__paper-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.docx-template-modal__paper-title{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em}.docx-template-modal__paper-chip{font-size:11px;font-weight:700;color:#1e40af;background:rgba(219,234,254,.65);border:1px solid rgba(191,219,254,.95);border-radius:999px;padding:4px 10px}.docx-template-modal__line-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.docx-template-modal__line{display:grid;gap:5px;min-width:0}.docx-template-modal__line--full{grid-column:1/-1}.docx-template-modal__field-label{font-size:12px;font-weight:600;color:#334155}.docx-template-modal__date-pack{display:grid;grid-template-columns:minmax(68px,110px) minmax(0,1fr);gap:8px;min-width:0}.docx-template-modal__input{width:100%;box-sizing:border-box;border:none;border-bottom:1px dashed rgba(100,116,139,.7);background:rgba(255,255,255,.75);padding:8px 2px 6px;font-size:15px;line-height:1.25;color:#0f172a;outline:none;border-radius:0}.docx-template-modal__input:focus{border-bottom-color:#2563eb}.docx-template-modal__textarea-label{font-size:12px;font-weight:700;color:#334155}.docx-template-modal__editor{background:linear-gradient(180deg,rgba(248,250,252,.88),rgba(241,245,249,.72));border:1px solid rgba(203,213,225,.8);border-radius:14px;padding:10px}.docx-template-modal__textarea{width:100%;box-sizing:border-box;height:100%;min-height:34dvh;max-height:100%;resize:none;border:1px solid rgba(203,213,225,.95);border-radius:12px;background:rgba(255,255,255,.96);padding:13px 14px;font-size:14px;line-height:1.64;color:#0f172a;outline:none}.docx-template-modal__textarea:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(147,197,253,.22)}.docx-template-modal__foot{display:flex;justify-content:flex-end;gap:10px;padding:12px 14px;border-top:1px solid rgba(226,232,240,.95);background:rgba(255,255,255,.78)}.docx-template-modal__btn{border:1px solid rgba(148,163,184,.45);background:rgba(255,255,255,.96);color:#334155;border-radius:12px;padding:10px 16px;font-weight:700;min-height:42px;transition:all .2s ease}.docx-template-modal__btn:active{transform:translateY(1px)}.docx-template-modal__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8;box-shadow:0 10px 20px rgba(37,99,235,.25)}.docx-template-modal__btn[disabled]{opacity:.6}.docx-template-modal__error{font-size:12px;color:#b91c1c;min-height:16px}@media (max-width:768px){.docx-template-modal{padding:0}.docx-template-modal__panel{border-radius:0}.docx-template-modal__head{padding:12px}.docx-template-modal__body{padding:12px}.docx-template-modal__paper{padding:12px;border-radius:14px}.docx-template-modal__line-grid{grid-template-columns:1fr}.docx-template-modal__date-pack{grid-template-columns:90px minmax(0,1fr)}.docx-template-modal__editor{padding:8px}.docx-template-modal__textarea{min-height:40dvh;font-size:16px}.docx-template-modal__foot{padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom));flex-direction:column}.docx-template-modal__btn{width:100%}}';
    style.textContent += '.docx-template-modal__busy{position:absolute;inset:0;display:none;place-items:center;padding:16px;background:linear-gradient(180deg,rgba(248,250,252,.92),rgba(241,245,249,.9));backdrop-filter:blur(2px);z-index:3}.docx-template-modal__busy.is-active{display:grid}.docx-template-modal__busy-card{width:min(420px,94%);border:1px solid rgba(191,219,254,.95);background:rgba(255,255,255,.88);border-radius:16px;padding:14px;display:grid;gap:8px;box-shadow:0 14px 30px rgba(15,23,42,.14)}.docx-template-modal__busy-title{font-size:14px;font-weight:800;color:#0f172a}.docx-template-modal__busy-sub{font-size:12px;color:#475569}.docx-template-modal__busy-spinner{width:16px;height:16px;border-radius:50%;border:2px solid rgba(37,99,235,.25);border-top-color:#2563eb;animation:docx-template-busy-spin .8s linear infinite}@keyframes docx-template-busy-spin{to{transform:rotate(360deg)}}';
    style.textContent += '.docx-template-modal__head{padding:12px 14px}.docx-template-modal__title{font-size:17px}.docx-template-modal__body{padding:10px;gap:8px}.docx-template-modal__paper{width:min(920px,100%);padding:12px;gap:12px;border-radius:14px}.docx-template-modal__hint{padding:9px 10px;font-size:12px}.docx-template-modal__line-grid{gap:8px}.docx-template-modal__input{font-size:14px;padding:7px 2px 6px}.docx-template-modal__editor{padding:8px;border-radius:12px}.docx-template-modal__textarea{min-height:38dvh;padding:11px 12px;font-size:14px;line-height:1.58}.docx-template-modal__foot{padding:10px 12px;gap:8px}.docx-template-modal__btn{min-height:40px;padding:9px 14px;border-radius:11px}@media (max-width:768px){.docx-template-modal__paper{width:100%;padding:10px;border-radius:12px}.docx-template-modal__textarea{min-height:36dvh;font-size:15px}.docx-template-modal__btn{min-height:42px}}';
    style.textContent += '.docx-template-modal__sub{max-width:980px;line-height:1.5}.docx-template-modal__body{padding-top:8px}.docx-template-modal__paper{width:min(1040px,100%);min-height:calc(100dvh - 220px)}.docx-template-modal__line{min-width:0}.docx-template-modal__line:last-child{display:flex;flex-direction:column;flex:1;min-height:0}.docx-template-modal__editor{display:flex;flex:1;min-height:0}.docx-template-modal__textarea{flex:1;min-height:46dvh}@media (max-width:768px){.docx-template-modal__paper{min-height:calc(100dvh - 200px)}.docx-template-modal__textarea{min-height:42dvh}}';
    document.head.appendChild(style);
  }

  function ensureTemplatePreviewStyles() {
    if (document.getElementById('docx-template-preview-style')) return;
    var style = document.createElement('style');
    style.id = 'docx-template-preview-style';
    style.textContent = '.docx-template-preview{position:fixed;inset:0;z-index:4400;background:rgba(2,6,23,.56);backdrop-filter:blur(8px);display:flex;align-items:stretch;justify-content:center;padding:0}.docx-template-preview__card{width:100%;height:100dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:0;border:1px solid rgba(255,255,255,.7);background:linear-gradient(150deg,rgba(255,255,255,.98),rgba(239,246,255,.95));box-shadow:0 24px 52px rgba(15,23,42,.32)}.docx-template-preview__head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(203,213,225,.85)}.docx-template-preview__title{font-size:14px;font-weight:800;color:#0f172a}.docx-template-preview__hint{font-size:12px;color:#64748b;margin-top:2px}.docx-template-preview__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.docx-template-preview__btn{border:1px solid rgba(203,213,225,.9);background:#fff;border-radius:10px;padding:6px 10px;min-height:36px;font-weight:700;color:#0f172a}.docx-template-preview__btn--primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8}.docx-template-preview__btn[disabled]{opacity:.62;cursor:not-allowed}.docx-template-preview__body{position:relative;flex:1;min-height:0;background:#e2e8f0;overflow:auto;padding:12px}.docx-template-preview__doc{max-width:920px;height:100%;margin:0 auto;background:rgba(255,255,255,.82);border-radius:16px;padding:8px;border:1px solid rgba(203,213,225,.85);box-shadow:0 10px 24px rgba(15,23,42,.12)}.docx-template-preview__doc .docx-wrapper{background:transparent!important;box-shadow:none!important;padding:0!important;border:0!important}.docx-template-preview__doc .docx{max-width:100%;overflow:auto}.docx-template-preview__status{padding:8px 12px;border-top:1px solid rgba(203,213,225,.82);font-size:12px;color:#334155;background:rgba(248,250,252,.95)}.docx-template-preview__loading{position:absolute;inset:0;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at 20% 20%,rgba(147,197,253,.2),transparent 42%),linear-gradient(180deg,rgba(248,250,252,.96),rgba(241,245,249,.94))}.docx-template-preview__loading-card{width:min(500px,95%);border:1px solid rgba(191,219,254,.9);background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border-radius:18px;padding:15px;box-shadow:0 18px 32px rgba(15,23,42,.12);display:grid;gap:10px}.docx-template-preview__loading-title{font-size:14px;font-weight:800;color:#0f172a}.docx-template-preview__loading-sub{font-size:12px;color:#475569}.docx-template-preview__bar{height:8px;border-radius:999px;background:rgba(191,219,254,.45);overflow:hidden}.docx-template-preview__bar::after{content:\"\";display:block;height:100%;width:36%;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#38bdf8);animation:docx-preview-progress 1.4s ease-in-out infinite}.docx-template-preview__steps{display:grid;gap:5px}.docx-template-preview__step{font-size:12px;color:#334155;display:flex;align-items:center;gap:7px}.docx-template-preview__step-dot{width:8px;height:8px;border-radius:50%;background:rgba(148,163,184,.7)}.docx-template-preview__step--active .docx-template-preview__step-dot{background:#2563eb;box-shadow:0 0 0 6px rgba(37,99,235,.16)}.docx-template-preview__step--done .docx-template-preview__step-dot{background:#16a34a}.docx-template-preview__spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(37,99,235,.22);border-top-color:#2563eb;animation:docx-preview-spin .8s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}@keyframes docx-preview-progress{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}@keyframes docx-preview-spin{to{transform:rotate(360deg)}}@media (max-width:768px){.docx-template-preview__head{padding:10px}.docx-template-preview__actions{width:100%}.docx-template-preview__btn{flex:1;min-width:0;padding:8px 10px}.docx-template-preview__body{padding:10px}.docx-template-preview__doc{border-radius:12px;padding:6px}.docx-template-preview__loading-card{padding:13px}}';
    document.head.appendChild(style);
  }

  function resolveLatestAiAnswerText() {
    var stored = typeof window.DOCUMENTS_LAST_AI_ANSWER === 'string' ? window.DOCUMENTS_LAST_AI_ANSWER.trim() : '';
    if (stored && stored !== 'Пустой ответ.') return stored;
    var messages = document.querySelectorAll('.documents-vip-ai__msg--assistant');
    for (var i = messages.length - 1; i >= 0; i -= 1) {
      var raw = String(messages[i].getAttribute('data-raw-text') || '').trim();
      if (raw && raw !== '⏳ Обрабатываю запрос...' && raw !== 'Пожалуйста, выберите режим.' && raw !== 'Выберите режим.') {
        return raw;
      }
      var text = String(messages[i].textContent || '').trim();
      if (text && text !== '⏳ Обрабатываю запрос...' && text !== 'Пожалуйста, выберите режим.' && text !== 'Выберите режим.') {
        return text;
      }
    }
    return '';
  }

  function openTemplateAnswerEditor(triggerButton, options) {
    if (document.querySelector('.docx-template-modal')) return;
    var templateConfig = buildOrganizationTemplateConfig(options && options.organization ? options.organization : '');
    var templateLabel = templateConfig.templateFileName || 'template.docx';
    var compactTemplateInfo = escapeHtmlInline(templateLabel.length > 38 ? (templateLabel.slice(0, 35) + '...') : templateLabel);
    var overlay = document.createElement('div');
    overlay.className = 'docx-template-modal';
    overlay.innerHTML = '<div class="docx-template-modal__panel" role="dialog" aria-modal="true" aria-label="Редактор ответа ИИ для шаблона"><div class="docx-template-modal__head"><div><div class="docx-template-modal__title">Ответ ИИ для шаблона</div><div class="docx-template-modal__sub">Заполните поля как в документе и сразу отредактируйте текст ответа. Визуализация ниже имитирует реальный лист: заполните дату, адресата, номер и внесите правки в ответ ИИ.</div></div><button class="docx-template-modal__close" type="button" aria-label="Закрыть">×</button></div><div class="docx-template-modal__body"><div class="docx-template-modal__paper"><div class="docx-template-modal__paper-head"><div class="docx-template-modal__paper-title">Черновик документа · ' + compactTemplateInfo + '</div><div class="docx-template-modal__paper-chip">Режим заполнения</div></div><div class="docx-template-modal__line-grid"><label class="docx-template-modal__line"><span class="docx-template-modal__field-label">Дата</span><span class="docx-template-modal__date-pack"><input class="docx-template-modal__input" data-template-day type="text" inputmode="numeric" maxlength="2" placeholder="09"><input class="docx-template-modal__input" data-template-month type="text" placeholder="апреля"></span></label><label class="docx-template-modal__line"><span class="docx-template-modal__field-label">Номер</span><input class="docx-template-modal__input" data-template-number type="text" placeholder="12/Д"></label><label class="docx-template-modal__line docx-template-modal__line--full"><span class="docx-template-modal__field-label">Адресат</span><input class="docx-template-modal__input" data-template-addressee type="text" placeholder="ООО «Компания»"></label></div><label class="docx-template-modal__line"><span class="docx-template-modal__textarea-label">Текст ответа ИИ (можно редактировать)</span><div class="docx-template-modal__editor"><textarea class="docx-template-modal__textarea" spellcheck="true"></textarea></div></label></div><div class="docx-template-modal__error" aria-live="polite"></div></div><div class="docx-template-modal__foot"><button type="button" class="docx-template-modal__btn" data-action="cancel">Отмена</button><button type="button" class="docx-template-modal__btn docx-template-modal__btn--primary" data-action="done">Готово</button></div><div class="docx-template-modal__busy" data-template-busy><div class="docx-template-modal__busy-card"><div class="docx-template-modal__busy-title">Формируем документ…</div><div class="docx-template-modal__busy-sub">Подождите, готовим файл и открываем предпросмотр.</div><div class="docx-template-modal__busy-spinner" aria-hidden="true"></div></div></div></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var textarea = overlay.querySelector('.docx-template-modal__textarea');
    var closeButton = overlay.querySelector('.docx-template-modal__close');
    var cancelButton = overlay.querySelector('[data-action="cancel"]');
    var doneButton = overlay.querySelector('[data-action="done"]');
    var errorNode = overlay.querySelector('.docx-template-modal__error');
    var busyNode = overlay.querySelector('[data-template-busy]');
    var dayInput = overlay.querySelector('[data-template-day]');
    var monthInput = overlay.querySelector('[data-template-month]');
    var numberInput = overlay.querySelector('[data-template-number]');
    var addresseeInput = overlay.querySelector('[data-template-addressee]');
    var storedTemplateMeta = window.DOCUMENTS_TEMPLATE_META && typeof window.DOCUMENTS_TEMPLATE_META === 'object' ? window.DOCUMENTS_TEMPLATE_META : {};
    if (dayInput) dayInput.value = String(storedTemplateMeta.day || '').trim();
    if (monthInput) monthInput.value = String(storedTemplateMeta.month || '').trim();
    if (numberInput) numberInput.value = String(storedTemplateMeta.number || '').trim();
    if (addresseeInput) addresseeInput.value = String(storedTemplateMeta.addressee || '');
    var previousButtonText = triggerButton ? triggerButton.textContent : '';
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.textContent = 'Редактирование...';
    }
    textarea.value = resolveLatestAiAnswerText();
    if (!textarea.value.trim()) {
      textarea.placeholder = 'Сначала получите ответ от VIP ИИ, затем нажмите «Шаблон».';
      renderError('Пока нет готового ответа ИИ для подстановки в шаблон.');
    }
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
      var defaultTemplateFieldValue = '_____';
      var rawDayValue = dayInput ? String(dayInput.value || '').trim() : '';
      var rawMonthValue = monthInput ? String(monthInput.value || '').trim() : '';
      var rawNumberValue = numberInput ? String(numberInput.value || '').trim() : '';
      var rawAddresseeValue = addresseeInput ? String(addresseeInput.value || '').replace(/\s+$/g, '') : '';
      var dayValue = rawDayValue || defaultTemplateFieldValue;
      var monthValue = rawMonthValue || defaultTemplateFieldValue;
      var numberValue = rawNumberValue || defaultTemplateFieldValue;
      var addresseeValue = String(rawAddresseeValue || '').trim() || defaultTemplateFieldValue;
      var addresseeTemplateValue = /^\s/.test(addresseeValue) ? addresseeValue : ('\u00A0' + addresseeValue);
      window.DOCUMENTS_TEMPLATE_META = {
        day: rawDayValue,
        month: rawMonthValue,
        number: rawNumberValue,
        addressee: rawAddresseeValue
      };
      renderError('');
      doneButton.disabled = true;
      doneButton.textContent = 'Генерирую...';
      if (busyNode) busyNode.classList.add('is-active');
      var preparedAnswer = String(aiText || '')
        .replace(/\[ДЕНЬ\]/g, dayValue)
        .replace(/\[МЕСЯЦ\]/g, monthValue)
        .replace(/\[НОМЕР\]/g, numberValue)
        .replace(/\[АДРЕСАТ\]/g, addresseeTemplateValue);
      window.DOCUMENTS_LAST_AI_ANSWER = aiText;
      generateDocxFromTemplateViaApi(preparedAnswer, {
        day: dayValue,
        month: monthValue,
        number: numberValue,
        addressee: addresseeTemplateValue,
        organization: templateConfig.organization,
        templatePath: templateConfig.templatePath,
        templateFileName: templateConfig.templateFileName
      })
        .then(function(previewPayload) {
          if (!previewPayload) throw new Error('empty_preview_payload');
          closeEditor();
          openDocxRenderPreviewPage(previewPayload, options);
        })
        .catch(function(error) {
          renderError('Не удалось создать превью: ' + (error && error.message ? error.message : 'неизвестная ошибка'));
        })
        .finally(function() {
          if (busyNode) busyNode.classList.remove('is-active');
          doneButton.disabled = false;
          doneButton.textContent = 'Готово';
        });
    });
  }

  function ensureDocxPreviewLibrariesLoaded() {
    return loadBriefScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', function() {
      return Boolean(window.JSZip && typeof window.JSZip.loadAsync === 'function');
    }).then(function() {
      return loadBriefScript('https://cdn.jsdelivr.net/npm/docx-preview@0.3.6/dist/docx-preview.min.js', function() {
        return Boolean((window.docx && window.docx.renderAsync) || (window.docxPreview && window.docxPreview.renderAsync));
      });
    }).then(function() {
      var renderer = (window.docx && window.docx.renderAsync) ? window.docx : ((window.docxPreview && window.docxPreview.renderAsync) ? window.docxPreview : null);
      if (!window.JSZip || typeof window.JSZip.loadAsync !== 'function') {
        throw new Error('jszip_not_loaded');
      }
      if (!renderer || typeof renderer.renderAsync !== 'function') {
        throw new Error('docx_preview_not_loaded');
      }
      return renderer;
    });
  }

  function openDocxRenderPreviewLocal(blob, fileName) {
    ensureTemplatePreviewStyles();
    if (!blob) throw new Error('empty_blob');
    var overlay = document.createElement('div');
    overlay.className = 'docx-template-preview';
    overlay.innerHTML = '<div class="docx-template-preview__card"><div class="docx-template-preview__head"><div><div class="docx-template-preview__title">Локальный предпросмотр</div><div class="docx-template-preview__hint">Рендерим файл прямо в браузере</div></div><div class="docx-template-preview__actions"><button type="button" class="docx-template-preview__btn docx-template-preview__btn--primary" data-preview-download>Скачать</button><button type="button" class="docx-template-preview__btn" data-preview-close>Закрыть</button></div></div><div class="docx-template-preview__body"><div class="docx-template-preview__doc" data-preview-doc aria-label="DOCX preview"></div><div class="docx-template-preview__loading" data-preview-loading><div class="docx-template-preview__loading-card"><div class="docx-template-preview__loading-title">Готовим локальный предпросмотр…</div><div class="docx-template-preview__loading-sub">Это может занять несколько секунд на телефоне.</div><div class="docx-template-preview__bar"></div></div></div></div><div class="docx-template-preview__status" data-preview-status>Подготовка локального предпросмотра…</div></div>';
    document.body.appendChild(overlay);
    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var docPreviewNode = overlay.querySelector('[data-preview-doc]');
    var statusNode = overlay.querySelector('[data-preview-status]');
    var downloadBtn = overlay.querySelector('[data-preview-download]');
    var closeBtn = overlay.querySelector('[data-preview-close]');
    var loadingNode = overlay.querySelector('[data-preview-loading]');
    var blobUrl = URL.createObjectURL(blob);
    var setStatus = function(text) {
      if (statusNode) statusNode.textContent = text;
    };

    function closeModal() {
      document.body.style.overflow = previousOverflow;
      URL.revokeObjectURL(blobUrl);
      overlay.remove();
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeModal();
    });
    downloadBtn.addEventListener('click', function() {
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || 'template-answer.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    var cachedHtml = docxPreviewHtmlCache && docxPreviewHtmlCache.get(blob);
    if (cachedHtml) {
      if (loadingNode) loadingNode.style.display = 'none';
      docPreviewNode.innerHTML = cachedHtml;
      setStatus('Готово: предпросмотр открыт из кэша.');
      return;
    }

    setStatus('Шаг 1/3: подключаем движок предпросмотра…');
    ensureDocxPreviewLibrariesLoaded().then(function(renderer) {
      setStatus('Шаг 2/3: читаем и подготавливаем DOCX…');
      return blob.arrayBuffer().then(function(arrayBuffer) {
        setStatus('Шаг 3/3: рендерим документ…');
        docPreviewNode.innerHTML = '';
        return renderer.renderAsync(arrayBuffer, docPreviewNode, null, {
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          useBase64URL: true,
          ignoreWidth: true,
          ignoreHeight: true,
          ignoreFonts: true,
          experimental: false,
          debug: false
        });
      });
    }).then(function() {
      if (docxPreviewHtmlCache) docxPreviewHtmlCache.set(blob, docPreviewNode.innerHTML);
      if (loadingNode) loadingNode.style.display = 'none';
      setStatus('Готово: локальный предпросмотр открыт.');
    }).catch(function(error) {
      if (loadingNode) loadingNode.style.display = 'none';
      setStatus('Ошибка предпросмотра: ' + (error && error.message ? error.message : 'unknown'));
    });
  }

  function toAbsoluteUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.indexOf('blob:') === 0 || raw.indexOf('data:') === 0) return raw;
    try {
      return new URL(raw, window.location.origin).toString();
    } catch (error) {
      return raw;
    }
  }

  function getDocsGenerateEndpoints() {
    var configured = String(window.DOCUMENTS_AI_API_URL || '').trim();
    var fallback = ['/js/documents/api-docs.php', '/api-docs.php'];
    var list = configured ? [configured].concat(fallback) : fallback;
    return list.filter(function(item, index) { return item && list.indexOf(item) === index; });
  }

  async function deleteGeneratedTempFile(previewPayload) {
    var fileName = String(previewPayload && previewPayload.fileName || '').trim();
    var previewUrl = String(previewPayload && previewPayload.previewUrl || '').trim();
    if (!fileName && !previewUrl) return;
    var endpoints = getDocsGenerateEndpoints();
    for (var i = 0; i < endpoints.length; i += 1) {
      var formData = new FormData();
      formData.append('action', 'delete_generated_temp');
      if (fileName) formData.append('fileName', fileName);
      if (previewUrl) formData.append('url', previewUrl);
      try {
        var response = await fetch(endpoints[i], {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });
        if (response && response.ok) return;
      } catch (error) {}
    }
  }

  async function openDocxRenderPreviewPage(previewPayload, context) {
    ensureTemplatePreviewStyles();
    if (!previewPayload || typeof previewPayload !== 'object') throw new Error('empty_preview_payload');
    var existing = document.querySelector('.docx-template-preview');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.className = 'docx-template-preview';
    overlay.innerHTML = '<div class="docx-template-preview__card"><div class="docx-template-preview__head"><div><div class="docx-template-preview__title">Предварительный просмотр</div><div class="docx-template-preview__hint">Документ открыт через Office Web Viewer</div></div><div class="docx-template-preview__actions"><button type="button" class="docx-template-preview__btn" data-preview-attach>Прикрепить к задаче</button><button type="button" class="docx-template-preview__btn docx-template-preview__btn--primary" data-preview-download>Скачать</button><button type="button" class="docx-template-preview__btn" data-preview-local>Локально</button><button type="button" class="docx-template-preview__btn" data-preview-close>Закрыть</button></div></div><div class="docx-template-preview__body"><div class="docx-template-preview__doc" style="height:100%;max-width:none;padding:0;overflow:hidden;" data-preview-doc><iframe title="Office Web Viewer" data-preview-frame style="width:100%;height:100%;border:0;background:#e2e8f0;visibility:hidden"></iframe></div><div class="docx-template-preview__loading" data-preview-loading><div class="docx-template-preview__loading-card"><div class="docx-template-preview__loading-title">Открываем документ…</div><div class="docx-template-preview__loading-sub" data-loading-sub>Подготавливаем безопасную ссылку для Office Web Viewer.</div><div class="docx-template-preview__bar"></div><div class="docx-template-preview__steps"><div class="docx-template-preview__step docx-template-preview__step--active" data-step="1"><span class="docx-template-preview__step-dot"></span><span>1. Подготовка файла</span></div><div class="docx-template-preview__step" data-step="2"><span class="docx-template-preview__step-dot"></span><span>2. Подключение Office Viewer</span></div><div class="docx-template-preview__step" data-step="3"><span class="docx-template-preview__step-dot"></span><span>3. Загрузка предпросмотра</span></div></div></div></div></div><div class="docx-template-preview__status" data-preview-status><span class="docx-template-preview__spinner"></span>Подключаем Office Web Viewer…</div></div>';
    document.body.appendChild(overlay);
    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var frameNode = overlay.querySelector('[data-preview-frame]');
    var statusNode = overlay.querySelector('[data-preview-status]');
    var loadingNode = overlay.querySelector('[data-preview-loading]');
    var loadingSubNode = overlay.querySelector('[data-loading-sub]');
    var loadingSteps = Array.prototype.slice.call(overlay.querySelectorAll('[data-step]'));
    var downloadBtn = overlay.querySelector('[data-preview-download]');
    var attachBtn = overlay.querySelector('[data-preview-attach]');
    var localBtn = overlay.querySelector('[data-preview-local]');
    var closeBtn = overlay.querySelector('[data-preview-close]');
    var previewUrl = String(previewPayload.previewUrl || '').trim();
    var fileName = String(previewPayload.fileName || 'template-answer.docx').trim();
    var safeContext = context && typeof context === 'object' ? context : {};
    var fallbackBlob = previewPayload.blob instanceof Blob ? previewPayload.blob : null;
    var blobUrl = fallbackBlob ? URL.createObjectURL(fallbackBlob) : '';
    var sourceUrl = previewUrl || blobUrl;
    var isClosed = false;
    var stepTimer = null;
    var slowTimer = null;

    function closeModal() {
      if (isClosed) return;
      isClosed = true;
      document.body.style.overflow = previousOverflow;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (stepTimer) clearInterval(stepTimer);
      if (slowTimer) clearTimeout(slowTimer);
      overlay.remove();
      deleteGeneratedTempFile(previewPayload).catch(function() {});
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeModal();
    });
    downloadBtn.addEventListener('click', function() {
      var a = document.createElement('a');
      a.href = sourceUrl;
      a.download = fileName || 'template-answer.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    var resolvedTask = resolveTaskContext(safeContext);
    if (attachBtn) {
      var hasTaskId = Boolean(resolvedTask && resolvedTask.id);
      if (!hasTaskId) {
        attachBtn.disabled = true;
        attachBtn.textContent = 'Нет задачи';
      }
      attachBtn.addEventListener('click', function() {
        if (attachBtn.disabled) return;
        var oldText = attachBtn.textContent;
        attachBtn.disabled = true;
        attachBtn.textContent = 'Прикрепляем...';
        attachGeneratedDocxToTaskResponse(previewPayload, {
          task: resolvedTask,
          organization: safeContext.organization,
          payload: safeContext.payload
        })
          .then(function(result) {
            var taskNo = String(resolvedTask && (resolvedTask.entryNumber || resolvedTask.taskNumber || resolvedTask.number || resolvedTask.id) || '').trim();
            statusNode.textContent = 'Документ прикреплён: ' + (result && result.fileName ? result.fileName : 'DOCX-файл') + '.';
            showAttachSuccessToast('✅ Задача №' + (taskNo || '—') + ' · файл: ' + (result && result.fileName ? result.fileName : 'DOCX-файл'));
            attachBtn.textContent = 'Прикреплено';
          })
          .catch(function(error) {
            statusNode.textContent = 'Не удалось прикрепить: ' + (error && error.message ? error.message : 'неизвестная ошибка');
            attachBtn.disabled = false;
            attachBtn.textContent = oldText;
          });
      });
    }
    localBtn.addEventListener('click', async function() {
      localBtn.disabled = true;
      var previousText = localBtn.textContent;
      localBtn.textContent = 'Открываю...';
      statusNode.textContent = 'Готовим локальный режим...';
      try {
        var localBlob = fallbackBlob;
        if (!localBlob && previewUrl) {
          var localResponse = await fetch(previewUrl, { credentials: 'same-origin' });
          if (!localResponse.ok) throw new Error('download_failed');
          localBlob = await localResponse.blob();
        }
        if (!localBlob || !localBlob.size) throw new Error('empty_blob');
        openDocxRenderPreviewLocal(localBlob, fileName);
      } catch (error) {
        statusNode.textContent = 'Не удалось открыть локальный предпросмотр.';
      } finally {
        localBtn.disabled = false;
        localBtn.textContent = previousText;
      }
    });

    if (!sourceUrl) {
      statusNode.textContent = 'Ошибка: не получена ссылка на документ.';
      return;
    }
    var currentStep = 1;
    function setStep(step, subtitle) {
      currentStep = step;
      loadingSteps.forEach(function(node) {
        var index = Number(node.getAttribute('data-step') || '0');
        node.classList.toggle('docx-template-preview__step--active', index === currentStep);
        node.classList.toggle('docx-template-preview__step--done', index < currentStep);
      });
      if (loadingSubNode && subtitle) loadingSubNode.textContent = subtitle;
    }
    setStep(1, 'Подготавливаем файл...');
    stepTimer = setInterval(function() {
      if (currentStep < 3) {
        setStep(currentStep + 1, currentStep === 1 ? 'Подключаем Office Viewer…' : 'Ждём рендер предпросмотра…');
      }
    }, 1300);
    slowTimer = setTimeout(function() {
      statusNode.textContent = 'Открытие занимает чуть дольше обычного, пожалуйста подождите…';
      if (loadingSubNode) loadingSubNode.textContent = 'Office Viewer отвечает медленно, но документ уже загружается.';
    }, 7000);
    frameNode.addEventListener('load', function() {
      if (stepTimer) clearInterval(stepTimer);
      if (slowTimer) clearTimeout(slowTimer);
      setStep(4, 'Готово.');
      frameNode.style.visibility = '';
      if (loadingNode) loadingNode.style.display = 'none';
      statusNode.textContent = 'Готово: документ открыт через Office Web Viewer.';
    }, { once: true });
    frameNode.src = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(sourceUrl);
  }

  async function generateDocxFromTemplateViaApi(answerText, meta) {
    var endpoints = getDocsGenerateEndpoints();
    var safeMeta = meta && typeof meta === 'object' ? meta : {};
    var lastError = null;
    for (var i = 0; i < endpoints.length; i += 1) {
      var formData = new FormData();
      formData.append('action', 'generate_document');
      formData.append('format', 'docx');
      formData.append('answer', String(answerText || ''));
      formData.append('templateDay', String(safeMeta.day || ''));
      formData.append('templateMonth', String(safeMeta.month || ''));
      formData.append('templateNumber', String(safeMeta.number || ''));
      formData.append('templateAddressee', String(safeMeta.addressee || ''));
      if (safeMeta.organization) formData.append('organization', String(safeMeta.organization || ''));
      if (safeMeta.templatePath) formData.append('templatePath', String(safeMeta.templatePath || ''));
      if (safeMeta.templateFileName) formData.append('templateFileName', String(safeMeta.templateFileName || ''));
      formData.append('documentTitle', 'Ответ ИИ');
      formData.append('responseMode', 'json_url');
      try {
        var response = await fetch(endpoints[i], {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });
        if (!response || !response.ok) {
          lastError = new Error('Ошибка генерации шаблона (' + (response ? response.status : 0) + ')');
          continue;
        }
        var responseType = String(response.headers.get('content-type') || '').toLowerCase();
        if (responseType.indexOf('application/json') !== -1) {
          var payload = await response.json().catch(function() { return null; });
          var url = String(payload && payload.url || '').trim();
          if (payload && payload.ok && url) {
            return {
              previewUrl: toAbsoluteUrl(url),
              fileName: String(payload.fileName || 'answer.docx').trim()
            };
          }
          lastError = new Error((payload && payload.error) || 'Сервер не вернул ссылку для предпросмотра.');
          continue;
        }
        var blob = await response.blob();
        if (blob && blob.size) {
          return { blob: blob, fileName: 'answer.docx' };
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Не удалось сформировать DOCX.');
  }

  async function resolveGeneratedDocxBlob(previewPayload) {
    if (previewPayload && previewPayload.blob instanceof Blob) {
      return previewPayload.blob;
    }
    var previewUrl = String(previewPayload && previewPayload.previewUrl || '').trim();
    if (!previewUrl) {
      throw new Error('Не удалось получить файл документа для прикрепления.');
    }
    var response = await fetch(previewUrl, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response || !response.ok) {
      throw new Error('Не удалось скачать документ для прикрепления (' + (response ? response.status : 0) + ').');
    }
    var blob = await response.blob();
    if (!blob || !blob.size) {
      throw new Error('Получен пустой файл документа.');
    }
    return blob;
  }

  async function attachGeneratedDocxToTaskResponse(previewPayload, options) {
    var safeOptions = options && typeof options === 'object' ? options : {};
    var task = resolveTaskContext(safeOptions) || {};
    var documentId = String(task.id || '').trim();
    var organization = String(
      task.organization
      || task.organizationName
      || task.organizationTitle
      || task.organizationFullName
      || task.organizationShortName
      || task.org
      || safeOptions.organization
      || ''
    ).trim();
    if (!documentId || !organization) {
      return { ok: false, skipped: true, reason: 'task_context_missing' };
    }
    var fileBlob = await resolveGeneratedDocxBlob(previewPayload);
    var responsibleRaw = task && (task.responsible || task.responsibles);
    var responsibleName = '';
    if (Array.isArray(responsibleRaw)) {
      responsibleName = responsibleRaw
        .map(function(item) { return String(item && (item.responsible || item.name || item.fullName || item.fio || item.label || item.value || item) || '').trim(); })
        .filter(Boolean)
        .join(', ');
    } else if (responsibleRaw && typeof responsibleRaw === 'object') {
      responsibleName = String(responsibleRaw.responsible || responsibleRaw.fullName || responsibleRaw.name || responsibleRaw.fio || responsibleRaw.label || responsibleRaw.value || '').trim();
    } else {
      responsibleName = String(responsibleRaw || '').trim();
    }
    var responsibleFinal = String(responsibleName || 'Неизвестный').trim();
    var now = new Date();
    var dateStamp = String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var timeStamp = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0');
    var taskNumberRaw = String(
      task.entryNumber
      || task.taskNumber
      || task.number
      || task.regNumber
      || task.documentNumber
      || task.id
      || ''
    ).trim();
    var safeAuthor = responsibleFinal.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'Неизвестный';
    var safeTaskNumber = taskNumberRaw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || documentId;
    var fileName = safeAuthor + '_' + dateStamp + '_' + timeStamp + '_' + safeTaskNumber + '.docx';
    var formData = new FormData();
    formData.append('action', 'response_upload');
    formData.append('organization', organization);
    formData.append('documentId', documentId);
    formData.append('responsible', responsibleFinal);
    formData.append('uploaderName', responsibleFinal);
    formData.append('attachments[]', fileBlob, fileName);

    var headers = {};
    var initData = String(
      window
      && window.Telegram
      && window.Telegram.WebApp
      && window.Telegram.WebApp.initData
        ? window.Telegram.WebApp.initData
        : ''
    ).trim();
    if (initData) {
      headers['X-Telegram-Init-Data'] = initData;
    }

    var response = await fetch('/docs.php?action=response_upload&organization=' + encodeURIComponent(organization), {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: formData
    });
    var data = await response.json().catch(function() { return null; });
    if (!response.ok || !data || data.success !== true) {
      throw new Error((data && (data.error || data.message)) || ('Ошибка прикрепления к задаче (' + response.status + ').'));
    }
    try {
      if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('documents:response-attached', {
          detail: { documentId: documentId, organization: organization, fileName: fileName, payload: data }
        }));
      }
      if (typeof window.__APPDOSC_FORCE_REFRESH_TASKS__ === 'function') {
        Promise.resolve(window.__APPDOSC_FORCE_REFRESH_TASKS__()).catch(function() {});
      }
    } catch (notifyError) {}
    return { ok: true, fileName: fileName, payload: data };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTemplateInsertButton);
  } else {
    ensureTemplateInsertButton();
  }

  window.openDocumentsVipAiPaidModal = openDocumentsVipAiPaidModal;
  window.openDocxAiTemplateAnswerEditor = openTemplateAnswerEditor;
  window.replaceAiMarkerInDocument = replaceAiMarkerInDocument;
})();
