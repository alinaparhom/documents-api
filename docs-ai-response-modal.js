(function() {
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
      '.documents-ai-modal{position:fixed;inset:0;z-index:1700;background:rgba(15,23,42,0.2);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;}' +
      '.documents-ai-modal__panel{width:min(640px,100%);max-height:min(88vh,780px);display:flex;flex-direction:column;gap:12px;background:rgba(255,255,255,0.9);border:1px solid rgba(255,255,255,0.72);border-radius:20px;box-shadow:0 24px 56px rgba(15,23,42,0.2);padding:14px;}' +
      '.documents-ai-modal__title{font-size:17px;font-weight:700;color:#0f172a;}' +
      '.documents-ai-modal__desc{font-size:12px;color:#64748b;line-height:1.45;}' +
      '.documents-ai-modal__field{display:flex;flex-direction:column;gap:6px;}' +
      '.documents-ai-modal__label{font-size:12px;color:#475569;font-weight:600;}' +
      '.documents-ai-modal__textarea{width:100%;min-height:110px;resize:vertical;border:1px solid rgba(148,163,184,0.35);border-radius:14px;background:rgba(255,255,255,0.86);padding:12px;font-size:14px;color:#0f172a;box-sizing:border-box;}' +
      '.documents-ai-modal__textarea:focus{outline:none;border-color:rgba(37,99,235,0.6);box-shadow:0 0 0 3px rgba(37,99,235,0.1);}' +
      '.documents-ai-modal__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}' +
      '.documents-ai-modal__button{border:1px solid rgba(148,163,184,0.34);background:rgba(255,255,255,0.72);border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.documents-ai-modal__button--primary{background:linear-gradient(135deg, rgba(37,99,235,0.9), rgba(14,165,233,0.9));border-color:transparent;color:#fff;}' +
      '.documents-ai-modal__button--ghost{background:rgba(59,130,246,0.1);color:#1d4ed8;border-color:rgba(37,99,235,0.3);}' +
      '@media (max-width:768px){' +
      '.documents-ai-modal{padding:8px;align-items:flex-end;}' +
      '.documents-ai-modal__panel{width:100%;max-height:calc(100vh - 12px);border-radius:18px;padding:12px;}' +
      '.documents-ai-modal__actions .documents-ai-modal__button{flex:1 1 calc(50% - 8px);}' +
      '.documents-ai-modal__textarea{min-height:96px;font-size:16px;}' +
      '}';
    document.head.appendChild(style);
  }

  function buildDraft(prompt, title) {
    var topic = prompt ? String(prompt).trim() : '';
    var taskTitle = title ? String(title).trim() : '';
    var intro = taskTitle ? ('По задаче «' + taskTitle + '».') : 'По задаче:';
    if (!topic) {
      return intro + '\n\nПодтверждаю получение и беру в работу. Срок и статус обновлю после проверки материалов.';
    }
    return intro + '\n\n' +
      'Подготовил ответ по запросу: ' + topic + '.\n' +
      '1) Проверил входные данные и требования.\n' +
      '2) Выполнил необходимые действия по задаче.\n' +
      '3) Готов предоставить детали и подтверждающие материалы при необходимости.';
  }

  window.openDocumentsAiResponseModal = function(options) {
    ensureStyle();
    var config = options || {};
    var modal = createElement('div', 'documents-ai-modal');
    var panel = createElement('div', 'documents-ai-modal__panel');
    var title = createElement('div', 'documents-ai-modal__title', 'Ответ с помощью ИИ');
    var desc = createElement('div', 'documents-ai-modal__desc', 'Введите короткий запрос, затем нажмите «Сгенерировать». Текст можно сразу вставить в документ.');

    var promptField = createElement('div', 'documents-ai-modal__field');
    var promptLabel = createElement('div', 'documents-ai-modal__label', 'Ваш запрос');
    var promptInput = createElement('textarea', 'documents-ai-modal__textarea');
    promptInput.placeholder = 'Например: подготовить вежливый ответ о готовности выполнить задачу';

    var resultField = createElement('div', 'documents-ai-modal__field');
    var resultLabel = createElement('div', 'documents-ai-modal__label', 'Готовый текст ответа');
    var resultInput = createElement('textarea', 'documents-ai-modal__textarea');
    resultInput.placeholder = 'Здесь появится сгенерированный текст';

    var actions = createElement('div', 'documents-ai-modal__actions');
    var closeButton = createElement('button', 'documents-ai-modal__button', 'Закрыть');
    var generateButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--ghost', 'Сгенерировать');
    var applyButton = createElement('button', 'documents-ai-modal__button documents-ai-modal__button--primary', 'Использовать текст');

    function closeModal() {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }

    closeButton.type = 'button';
    closeButton.addEventListener('click', closeModal);

    generateButton.type = 'button';
    generateButton.addEventListener('click', function() {
      resultInput.value = buildDraft(promptInput.value, config.documentTitle || '');
      resultInput.focus();
      resultInput.select();
    });

    applyButton.type = 'button';
    applyButton.addEventListener('click', function() {
      var text = String(resultInput.value || '').trim();
      if (!text) {
        resultInput.focus();
        return;
      }
      if (typeof config.onApply === 'function') {
        config.onApply(text);
      }
      closeModal();
    });

    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    promptField.appendChild(promptLabel);
    promptField.appendChild(promptInput);
    resultField.appendChild(resultLabel);
    resultField.appendChild(resultInput);

    actions.appendChild(generateButton);
    actions.appendChild(applyButton);
    actions.appendChild(closeButton);

    panel.appendChild(title);
    panel.appendChild(desc);
    panel.appendChild(promptField);
    panel.appendChild(resultField);
    panel.appendChild(actions);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    promptInput.focus({ preventScroll: true });
  };
})();
