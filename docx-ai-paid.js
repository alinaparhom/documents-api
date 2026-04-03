(function() {
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
    style.textContent = '.documents-vip-ai{position:fixed;inset:0;background:rgba(15,23,42,.42);backdrop-filter:blur(8px);z-index:4100;display:flex;align-items:center;justify-content:center;padding:10px}.documents-vip-ai__panel{width:min(860px,100%);max-height:calc(100dvh - 20px);overflow:auto;border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(241,245,249,.9));border:1px solid rgba(255,255,255,.95);box-shadow:0 24px 56px rgba(15,23,42,.24)}.documents-vip-ai__head{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(226,232,240,.9)}.documents-vip-ai__title{font-size:18px;font-weight:800;color:#0f172a}.documents-vip-ai__sub{font-size:12px;color:#64748b;margin-top:3px}.documents-vip-ai__close{border:none;background:rgba(255,255,255,.95);width:34px;height:34px;border-radius:10px;color:#334155;font-size:20px}.documents-vip-ai__body{padding:14px;display:grid;gap:10px}.documents-vip-ai__meta{display:flex;flex-wrap:wrap;gap:8px}.documents-vip-ai__chip{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.84);border:1px solid rgba(203,213,225,.95);font-size:12px;color:#334155}.documents-vip-ai__block{border:1px solid rgba(203,213,225,.9);background:rgba(255,255,255,.78);border-radius:14px;padding:11px}.documents-vip-ai__label{font-size:12px;color:#64748b;margin-bottom:7px}.documents-vip-ai__files{display:grid;gap:6px;font-size:13px;color:#0f172a;max-height:110px;overflow:auto}.documents-vip-ai__chat{height:min(44dvh,360px);overflow:auto;display:flex;flex-direction:column;gap:8px}.documents-vip-ai__msg{padding:9px 10px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap}.documents-vip-ai__msg--user{align-self:flex-end;background:#dbeafe;color:#1e3a8a}.documents-vip-ai__msg--assistant{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(203,213,225,.9)}.documents-vip-ai__composer{display:flex;gap:8px}.documents-vip-ai__input{flex:1;border:1px solid rgba(203,213,225,.95);border-radius:12px;min-height:44px;max-height:110px;padding:9px;font-size:13px}.documents-vip-ai__send{border:none;background:linear-gradient(135deg,#38bdf8,#14b8a6);color:#fff;padding:12px 14px;border-radius:12px;font-size:14px;font-weight:700}.documents-vip-ai__send:disabled{opacity:.6}.documents-vip-ai__error{color:#b91c1c}@media (max-width:768px){.documents-vip-ai{padding:0}.documents-vip-ai__panel{max-height:100dvh;border-radius:0}.documents-vip-ai__composer{flex-direction:column}}';
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
    var handleResponse = options.handleResponse;
    if (!createElement || !closeModal || !escapeHtmlText || !handleResponse) {
      throw new Error('Недостаточно зависимостей для VIP ИИ модуля.');
    }

    var payload = options.payload || {};
    var overlay = createElement('div', 'documents-vip-ai');
    var panel = createElement('div', 'documents-vip-ai__panel');
    panel.innerHTML = '<div class="documents-vip-ai__head"><div><div class="documents-vip-ai__title">VIP AI Ассистент</div><div class="documents-vip-ai__sub">Отдельный чат по приложенным файлам</div></div><button class="documents-vip-ai__close" aria-label="Закрыть">×</button></div><div class="documents-vip-ai__body"><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Файлы для анализа</div><div class="documents-vip-ai__files"></div></div><div class="documents-vip-ai__block"><div class="documents-vip-ai__label">Чат с VIP ИИ</div><div class="documents-vip-ai__chat"></div></div><div class="documents-vip-ai__meta"></div><div class="documents-vip-ai__composer"><select class="documents-vip-ai__input" data-style></select><textarea class="documents-vip-ai__input" data-prompt placeholder="Напишите запрос для VIP ИИ"></textarea><button class="documents-vip-ai__send" type="button">Отправить</button></div></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var filesNode = panel.querySelector('.documents-vip-ai__files');
    var chatNode = panel.querySelector('.documents-vip-ai__chat');
    var metaNode = panel.querySelector('.documents-vip-ai__meta');
    var styleNode = panel.querySelector('[data-style]');
    var inputNode = panel.querySelector('[data-prompt]');
    var sendButton = panel.querySelector('.documents-vip-ai__send');
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
      styleNode.innerHTML = VIP_RESPONSE_STYLE_OPTIONS.map(function(item) {
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
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        closeModal(overlay);
      }
    });

    var chatHistory = [];
    function pushChat(role, text) {
      var message = createElement('div', 'documents-vip-ai__msg documents-vip-ai__msg--' + role, String(text || ''));
      chatNode.appendChild(message);
      chatNode.scrollTop = chatNode.scrollHeight;
    }

    pushChat('assistant', 'Готов. Я учту все приложенные файлы (включая сканы) и подготовлю решение.');

    sendButton.addEventListener('click', function() {
      var promptText = String(inputNode.value || '').trim();
      var selectedStyle = styleNode && styleNode.value ? String(styleNode.value) : 'neutral';
      if (!promptText) {
        return;
      }
      sendButton.disabled = true;
      pushChat('user', promptText);
      pushChat('assistant', '⏳ Обрабатываю запрос...');
      metaNode.innerHTML = '';
      var startedAt = Date.now();
      var requestContext = {};
      var sourceContext = payload.context || {};
      Object.keys(sourceContext).forEach(function(key) {
        requestContext[key] = sourceContext[key];
      });
      var selectedLinked = linkedEntries.filter(function(entry) { return selectedFiles[entry.key]; }).map(function(entry) { return entry.file; });
      var selectedPending = pendingEntries.filter(function(entry) { return selectedFiles[entry.key]; }).map(function(entry) { return entry.file; });
      requestContext.attachedFiles = []
        .concat(selectedLinked.map(function(file) {
          return {
            name: file && file.name ? file.name : '',
            url: resolveLinkedFileUrl(file),
            size: file && file.size ? file.size : 0,
            type: file && file.type ? file.type : ''
          };
        }))
        .concat(selectedPending.map(function(file) {
          return { name: file.name || '', size: file.size || 0, type: file.type || '' };
        }));
      chatHistory.push({ role: 'user', text: promptText, ts: Date.now() });
      requestContext.chatHistory = chatHistory.slice(-8);

      Promise.resolve()
        .then(function() {
          var paidEndpoints = ['/js/documents/api-groq-paid.php', '/api-groq-paid.php'];
          function tryEndpoint(index) {
            if (index >= paidEndpoints.length) {
              throw new Error('Не удалось подключиться к VIP API. Проверьте endpoint api-groq-paid.php.');
            }
            return buildVipRequestFormData(payload, promptText, selectedLinked, selectedPending, requestContext, selectedStyle)
              .then(function(formData) {
                return fetch(paidEndpoints[index], { method: 'POST', body: formData, credentials: 'same-origin' });
              })
              .then(function(response) {
                if ((response.status === 404 || response.status === 405) && index < paidEndpoints.length - 1) {
                  return tryEndpoint(index + 1);
                }
                return response;
              });
          }
          return tryEndpoint(0);
        })
        .then(handleResponse)
        .then(function(data) {
          var aiText = String((data && data.response) || (data && data.answer) || '').trim() || 'Пустой ответ.';
          pushChat('assistant', aiText);
          chatHistory.push({ role: 'assistant', text: aiText, ts: Date.now() });
          var elapsed = Date.now() - startedAt;
          var tokens = data && data.tokensUsed ? data.tokensUsed : '—';
          metaNode.innerHTML = '<span class="documents-vip-ai__chip">Модель: ' + escapeHtmlText(data && data.model ? data.model : '—') + '</span><span class="documents-vip-ai__chip">Время: ' + elapsed + ' мс</span><span class="documents-vip-ai__chip">Токены: ' + escapeHtmlText(String(tokens)) + '</span>';
          inputNode.value = '';
        })
        .catch(function(error) {
          pushChat('assistant', 'Ошибка: ' + (error && error.message ? error.message : 'Неизвестная ошибка'));
        })
        .finally(function() {
          sendButton.disabled = false;
        });
    });
  }

  window.openDocumentsVipAiPaidModal = openDocumentsVipAiPaidModal;
})();
