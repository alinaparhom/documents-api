(function() {
  var SETTINGS_LOG_PREFIX = '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438';
  var API_URL = 'docssettings.php';
  var state = {
    organization: '',
    host: null,
    apply: null,
    defaults: null,
    getCurrent: null,
    getAccess: null,
    getUserKey: null,
    getTelegramId: null,
    modal: null,
    panel: null,
    status: null,
    saving: false,
    loading: false,
    loadingPromise: null,
    loaded: false,
    currentSettings: null,
    previewSettings: null,
    originalSettings: null,
    readyPromise: null,
    inputs: {},
    columns: [],
    activeTab: 'table',
    initialized: false,
    previewFrame: 0,
    previewScheduled: false
  };

  var MAILING_DEFAULTS = {
    notifyDirectorAboutAttachedReplies: false
  };

  function logSettings(message, payload) {
    if (typeof console === 'undefined' || typeof console.info !== 'function') {
      return;
    }
    var details = payload;
    try {
      details = payload && typeof payload === 'object'
        ? JSON.parse(JSON.stringify(payload))
        : payload;
    } catch (error) {}
    console.info(SETTINGS_LOG_PREFIX + ': ' + message, details);
  }

  function resolveUserKey(access) {
    if (!access || !access.user) {
      return '';
    }
    var user = access.user;
    if (user.id !== undefined && user.id !== null) {
      return 'id:' + String(user.id);
    }
    if (user.login) {
      return 'login:' + String(user.login).toLowerCase();
    }
    if (user.username) {
      return 'username:' + String(user.username).toLowerCase();
    }
    if (user.fullName) {
      return 'name:' + String(user.fullName).toLowerCase();
    }
    return '';
  }

  var COLUMN_WIDTH_MIN = 1;
  var COLUMN_WIDTH_MAX = 420;
  var COLUMN_FONT_MIN = 12;
  var COLUMN_FONT_MAX = 22;

  function clamp(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) {
      return fallback;
    }
    if (min !== undefined && number < min) {
      number = min;
    }
    if (max !== undefined && number > max) {
      number = max;
    }
    return number;
  }

  function normalizeColor(value, fallback) {
    if (!value || typeof value !== 'string') {
      return fallback;
    }
    var trimmed = value.trim();
    var match = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
      return fallback;
    }
    var hex = match[1];
    if (hex.length === 3) {
      hex = hex.split('').map(function(char) { return char + char; }).join('');
    }
    return '#' + hex.toLowerCase();
  }

  function parseNumberInput(input) {
    if (!input || input.value === undefined || input.value === null) {
      return undefined;
    }
    var raw = String(input.value).trim();
    if (raw === '') {
      return undefined;
    }
    var number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  }

  function getDefaultColumnConfig(key) {
    var baseFont = state.defaults && state.defaults.fontSize ? state.defaults.fontSize : 14;
    var defaults = state.defaults && state.defaults.columns && state.defaults.columns[key]
      ? state.defaults.columns[key]
      : null;
    var widthFallback = defaults && defaults.width !== undefined ? defaults.width : 200;
    var fontFallback = defaults && defaults.fontSize !== undefined ? defaults.fontSize : baseFont;
    return {
      width: clamp(widthFallback, COLUMN_WIDTH_MIN, COLUMN_WIDTH_MAX, 200),
      fontSize: clamp(fontFallback, COLUMN_FONT_MIN, COLUMN_FONT_MAX, baseFont),
      visible: true
    };
  }

  function buildDefaultColumns() {
    var map = {};
    if (Array.isArray(state.columns)) {
      state.columns.forEach(function(column) {
        map[column.key] = getDefaultColumnConfig(column.key);
      });
    }
    return map;
  }

  function normalizeColumnSettings(settings) {
    var normalized = buildDefaultColumns();
    if (!settings || typeof settings !== 'object') {
      return normalized;
    }
    Object.keys(normalized).forEach(function(key) {
      var value = settings[key];
      if (!value || typeof value !== 'object') {
        return;
      }
      var width = clamp(value.width, COLUMN_WIDTH_MIN, COLUMN_WIDTH_MAX, normalized[key].width);
      var fontSize = clamp(value.fontSize, COLUMN_FONT_MIN, COLUMN_FONT_MAX, normalized[key].fontSize);
      var visible = value.visible !== false;
      normalized[key] = {
        width: width,
        fontSize: fontSize,
        visible: visible
      };
    });
    return normalized;
  }


  function normalizeSortDirection(value) {
    return String(value || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  }

  function buildDefaultSorting() {
    return {
      enabled: false,
      rules: []
    };
  }

  function normalizeSorting(raw) {
    var normalized = buildDefaultSorting();
    if (!raw || typeof raw !== 'object') {
      return normalized;
    }
    var seen = {};
    if (Array.isArray(raw.rules)) {
      raw.rules.forEach(function(rule) {
        if (!rule || typeof rule !== 'object') {
          return;
        }
        var column = rule.column ? String(rule.column) : '';
        if (!column || seen[column]) {
          return;
        }
        var exists = state.columns.some(function(item) { return item && item.key === column; });
        if (!exists || column === 'files' || column === 'actions') {
          return;
        }
        seen[column] = true;
        normalized.rules.push({
          column: column,
          direction: normalizeSortDirection(rule.direction)
        });
      });
    }
    normalized.enabled = raw.enabled === true && normalized.rules.length > 0;
    return normalized;
  }

  function normalizeMailingSettings(settings) {
    var normalized = Object.assign({}, MAILING_DEFAULTS);
    if (!settings || typeof settings !== 'object') {
      return normalized;
    }
    normalized.notifyDirectorAboutAttachedReplies = settings.notifyDirectorAboutAttachedReplies === true;
    return normalized;
  }

  function normalizeSettings(settings) {
    var defaults = state.defaults || { fontSize: 14, lineHeight: 1.45, borderColor: '#e2e8f0', borderWidth: 1, borderOpacity: 0.85 };
    var normalized = Object.assign({}, defaults);
    normalized.columns = normalizeColumnSettings(defaults.columns);
    normalized.sorting = normalizeSorting(defaults.sorting);
    normalized.mailing = normalizeMailingSettings(defaults.mailing);
    if (!settings || typeof settings !== 'object') {
      return normalized;
    }
    if (settings.fontSize !== undefined) {
      normalized.fontSize = clamp(settings.fontSize, 12, 22, defaults.fontSize);
    }
    if (settings.lineHeight !== undefined) {
      normalized.lineHeight = clamp(settings.lineHeight, 1.2, 2, defaults.lineHeight);
    }
    if (settings.borderWidth !== undefined) {
      normalized.borderWidth = clamp(settings.borderWidth, 0, 4, defaults.borderWidth);
    }
    if (settings.borderOpacity !== undefined) {
      normalized.borderOpacity = clamp(settings.borderOpacity, 0, 1, defaults.borderOpacity);
    }
    if (settings.borderColor !== undefined) {
      normalized.borderColor = normalizeColor(settings.borderColor, defaults.borderColor);
    }
    normalized.columns = normalizeColumnSettings(settings.columns);
    normalized.sorting = normalizeSorting(settings.sorting);
    normalized.mailing = normalizeMailingSettings(settings.mailing);
    return normalized;
  }

  function buildApiUrl(action) {
    var params = new URLSearchParams();
    params.set('action', action);
    if (state.organization) {
      params.set('organization', state.organization);
    }
    var access = typeof state.getAccess === 'function' ? state.getAccess() : null;
    var user = access && access.user ? access.user : null;
    var userKey = typeof state.getUserKey === 'function'
      ? state.getUserKey()
      : resolveUserKey(access);
    if (!user || !userKey) {
      logSettings('Ожидаем контекст доступа перед запросом настроек', {
        action: action,
        hasAccess: Boolean(access),
        hasUser: Boolean(user),
        userKey: userKey
      });
      return '';
    }
    if (user && typeof user === 'object') {
      if (user.login) {
        params.set('user[login]', user.login);
      }
      if (user.username) {
        params.set('user[username]', user.username);
      }
      if (user.id !== undefined && user.id !== null) {
        params.set('user[id]', user.id);
      }
    }
    if (userKey) {
      params.set('user_key', userKey);
    }
    var telegramId = typeof state.getTelegramId === 'function' ? state.getTelegramId() : '';
    if (telegramId) {
      params.set('telegram_user_id', telegramId);
    }
    return API_URL + '?' + params.toString();
  }

  function setStatus(text, isError) {
    if (!state.status) {
      return;
    }
    state.status.textContent = text || '';
    state.status.classList.toggle('documents-modal__status--error', Boolean(text && isError));
    state.status.style.display = text ? 'inline-flex' : 'none';
  }

  function closeModal() {
    cancelScheduledPreview();
    if (state.modal) {
      state.modal.remove();
      state.modal = null;
      state.panel = null;
      state.status = null;
      state.inputs = {};
    }
    if (state.currentSettings && state.previewSettings) {
      var saved = JSON.stringify(state.currentSettings);
      var preview = JSON.stringify(state.previewSettings);
      if (saved !== preview && typeof state.apply === 'function') {
        state.apply(state.currentSettings);
      }
    }
  }

  function createTabButton(id, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'docs-settings-tab';
    button.dataset.target = id;
    button.textContent = label;
    button.addEventListener('click', function() {
      switchTab(id, button);
    });
    return button;
  }

  function switchTab(id, button) {
    state.activeTab = id;
    var tabs = state.modal ? state.modal.querySelectorAll('.docs-settings-tab') : [];
    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].classList.toggle('docs-settings-tab--active', tabs[i] === button || tabs[i].dataset.target === id);
    }
    var panels = state.modal ? state.modal.querySelectorAll('.docs-settings-panel') : [];
    for (var j = 0; j < panels.length; j += 1) {
      var panel = panels[j];
      var active = panel.id === id;
      panel.classList.toggle('docs-settings-panel--active', active);
    }
  }

  function formatValue(key, value) {
    if (key === 'fontSize') {
      return value + ' px';
    }
    if (key === 'lineHeight') {
      return value.toFixed(2) + '×';
    }
    if (key === 'borderWidth') {
      return value + ' px';
    }
    if (key === 'borderOpacity') {
      return Math.round(value * 100) + '%';
    }
    return value;
  }

  function updateControlValues(settings) {
    if (!settings) {
      return;
    }
    var controls = state.inputs;
    if (controls.fontSize) {
      controls.fontSize.value = settings.fontSize;
      controls.fontSizeLabel.textContent = formatValue('fontSize', settings.fontSize);
    }
    if (controls.lineHeight) {
      controls.lineHeight.value = settings.lineHeight;
      controls.lineHeightLabel.textContent = formatValue('lineHeight', settings.lineHeight);
    }
    if (controls.borderWidth) {
      controls.borderWidth.value = settings.borderWidth;
      controls.borderWidthLabel.textContent = formatValue('borderWidth', settings.borderWidth);
    }
    if (controls.borderOpacity) {
      controls.borderOpacity.value = Math.round(settings.borderOpacity * 100);
      controls.borderOpacityLabel.textContent = formatValue('borderOpacity', settings.borderOpacity);
    }
    if (controls.borderColor) {
      controls.borderColor.value = settings.borderColor;
    }
    if (controls.columns) {
      state.columns.forEach(function(column) {
        var columnControls = controls.columns[column.key];
        var columnSettings = settings.columns && settings.columns[column.key]
          ? settings.columns[column.key]
          : null;
        if (!columnControls) {
          return;
        }
        var width = columnSettings ? columnSettings.width : getDefaultColumnConfig(column.key).width;
        var fontSize = columnSettings ? columnSettings.fontSize : getDefaultColumnConfig(column.key).fontSize;
        if (columnControls.width) {
          columnControls.width.value = width;
        }
        if (columnControls.widthNumber) {
          columnControls.widthNumber.value = width;
        }
        if (columnControls.widthValue) {
          columnControls.widthValue.textContent = width + ' px';
        }
        if (columnControls.fontSize) {
          columnControls.fontSize.value = fontSize;
        }
        if (columnControls.fontValue) {
          columnControls.fontValue.textContent = fontSize + ' px';
        }
      });
    }
    if (controls.visibility) {
      state.columns.forEach(function(column) {
        var checkbox = controls.visibility[column.key];
        var columnSettings = settings.columns && settings.columns[column.key]
          ? settings.columns[column.key]
          : null;
        if (checkbox) {
          checkbox.checked = !columnSettings || columnSettings.visible !== false;
        }
      });
    }
    if (controls.sortingEnabled) {
      controls.sortingEnabled.checked = Boolean(settings.sorting && settings.sorting.enabled);
    }
    if (controls.sortingRows) {
      var rules = settings.sorting && Array.isArray(settings.sorting.rules) ? settings.sorting.rules : [];
      controls.sortingRows.forEach(function(rowRefs, index) {
        var rule = rules[index] || null;
        if (!rowRefs || !rowRefs.column || !rowRefs.direction) {
          return;
        }
        rowRefs.column.value = rule && rule.column ? rule.column : '';
        rowRefs.direction.value = rule ? normalizeSortDirection(rule.direction) : 'asc';
      });
    }
    if (controls.mailing && controls.mailing.notifyDirectorAboutAttachedReplies) {
      controls.mailing.notifyDirectorAboutAttachedReplies.checked = Boolean(settings.mailing && settings.mailing.notifyDirectorAboutAttachedReplies);
    }
  }

  function collectSettingsFromForm() {
    var controls = state.inputs;
    var currentColumns = state.previewSettings && state.previewSettings.columns
      ? state.previewSettings.columns
      : {};
    var opacityValue = controls.borderOpacity ? parseNumberInput(controls.borderOpacity) : undefined;
    var settings = {
      fontSize: parseNumberInput(controls.fontSize),
      lineHeight: parseNumberInput(controls.lineHeight),
      borderWidth: parseNumberInput(controls.borderWidth),
      borderOpacity: opacityValue !== undefined ? opacityValue / 100 : undefined,
      borderColor: controls.borderColor ? controls.borderColor.value : undefined,
      columns: {},
      sorting: buildDefaultSorting(),
      mailing: state.previewSettings && state.previewSettings.mailing
        ? Object.assign({}, state.previewSettings.mailing)
        : normalizeMailingSettings(null)
    };
    if (controls.columns) {
      state.columns.forEach(function(column) {
        var columnControls = controls.columns[column.key];
        if (!columnControls) {
          return;
        }
        settings.columns[column.key] = {
          width: parseNumberInput(columnControls.width) || parseNumberInput(columnControls.widthNumber)
            || (currentColumns[column.key] ? currentColumns[column.key].width : undefined),
          fontSize: parseNumberInput(columnControls.fontSize)
            || (currentColumns[column.key] ? currentColumns[column.key].fontSize : undefined),
          visible: controls.visibility && controls.visibility[column.key]
            ? controls.visibility[column.key].checked
            : true
        };
      });
    }
    if (controls.sortingEnabled) {
      settings.sorting.enabled = controls.sortingEnabled.checked;
    }
    if (controls.sortingRows) {
      controls.sortingRows.forEach(function(rowRefs) {
        if (!rowRefs || !rowRefs.column || !rowRefs.direction) {
          return;
        }
        var column = rowRefs.column.value ? String(rowRefs.column.value) : '';
        if (!column) {
          return;
        }
        settings.sorting.rules.push({
          column: column,
          direction: normalizeSortDirection(rowRefs.direction.value)
        });
      });
    }
    if (controls.mailing && controls.mailing.notifyDirectorAboutAttachedReplies) {
      settings.mailing.notifyDirectorAboutAttachedReplies = controls.mailing.notifyDirectorAboutAttachedReplies.checked;
    }
    return normalizeSettings(settings);
  }

  function syncColumnFontControls(fontSize) {
    if (!state.inputs.columns) {
      return;
    }
    Object.keys(state.inputs.columns).forEach(function(key) {
      var columnControls = state.inputs.columns[key];
      if (!columnControls || !columnControls.fontSize) {
        return;
      }
      columnControls.fontSize.value = fontSize;
      if (columnControls.fontValue) {
        columnControls.fontValue.textContent = fontSize + ' px';
      }
    });
  }

  function applyPreview(settings) {
    state.previewSettings = normalizeSettings(settings);
    updateControlValues(state.previewSettings);
    if (typeof state.apply === 'function') {
      state.apply(state.previewSettings);
    }
  }

  function cancelScheduledPreview() {
    if (state.previewFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(state.previewFrame);
    }
    state.previewFrame = 0;
    state.previewScheduled = false;
  }

  function schedulePreview(settings) {
    var nextSettings = normalizeSettings(settings);
    state.previewSettings = nextSettings;
    updateControlValues(nextSettings);
    if (state.previewScheduled) {
      return;
    }
    state.previewScheduled = true;
    var applyPreviewFrame = function() {
      state.previewFrame = 0;
      state.previewScheduled = false;
      if (typeof state.apply === 'function') {
        state.apply(state.previewSettings);
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      state.previewFrame = window.requestAnimationFrame(applyPreviewFrame);
    } else {
      applyPreviewFrame();
    }
  }

  function handleInputChange(event) {
    if (event && state.inputs && event.target === state.inputs.fontSize) {
      var baseFont = parseNumberInput(state.inputs.fontSize);
      if (baseFont !== undefined) {
        syncColumnFontControls(baseFont);
      }
    }
    schedulePreview(collectSettingsFromForm());
  }

  function attachInputHandlers() {
    ['fontSize', 'lineHeight', 'borderWidth', 'borderOpacity', 'borderColor'].forEach(function(key) {
      var control = state.inputs[key];
      if (!control) {
        return;
      }
      control.addEventListener('input', handleInputChange);
    });
    if (state.inputs.columns) {
      Object.keys(state.inputs.columns).forEach(function(key) {
        var refs = state.inputs.columns[key];
        if (refs.width) {
          refs.width.addEventListener('input', handleInputChange);
        }
        if (refs.widthNumber) {
          refs.widthNumber.addEventListener('input', handleInputChange);
          refs.widthNumber.addEventListener('change', handleInputChange);
        }
        if (refs.fontSize) {
          refs.fontSize.addEventListener('input', handleInputChange);
        }
      });
    }
    if (state.inputs.visibility) {
      Object.keys(state.inputs.visibility).forEach(function(key) {
        var checkbox = state.inputs.visibility[key];
        checkbox.addEventListener('change', handleInputChange);
      });
    }
    if (state.inputs.sortingEnabled) {
      state.inputs.sortingEnabled.addEventListener('change', handleInputChange);
    }
    if (state.inputs.mailing && state.inputs.mailing.notifyDirectorAboutAttachedReplies) {
      state.inputs.mailing.notifyDirectorAboutAttachedReplies.addEventListener('change', handleInputChange);
    }
    if (Array.isArray(state.inputs.sortingRows)) {
      state.inputs.sortingRows.forEach(function(rowRefs) {
        if (!rowRefs) {
          return;
        }
        if (rowRefs.column) {
          rowRefs.column.addEventListener('change', handleInputChange);
        }
        if (rowRefs.direction) {
          rowRefs.direction.addEventListener('change', handleInputChange);
        }
      });
    }
  }

  function buildControls() {
    var panel = document.createElement('div');
    panel.className = 'docs-settings-panel docs-settings-panel--active';
    panel.id = 'docs-settings-table';

    var grid = document.createElement('div');
    grid.className = 'docs-settings-grid';

    var typography = document.createElement('div');
    typography.className = 'docs-settings-card';
    var typographyTitle = document.createElement('h3');
    typographyTitle.className = 'docs-settings-card__title';
    typographyTitle.textContent = 'Шрифт и высота строк';
    var typographyHint = document.createElement('p');
    typographyHint.className = 'docs-settings-card__hint';
    typographyHint.textContent = 'Подберите комфортный размер шрифта и высоту строк. Все изменения применяются сразу.';
    var fontSizeRow = document.createElement('div');
    fontSizeRow.className = 'docs-settings-control';
    var fontSizeLabel = document.createElement('label');
    fontSizeLabel.textContent = 'Размер текста';
    var fontSizeInput = document.createElement('input');
    fontSizeInput.type = 'range';
    fontSizeInput.min = '12';
    fontSizeInput.max = '22';
    fontSizeInput.step = '1';
    var fontSizeValue = document.createElement('span');
    fontSizeValue.className = 'docs-settings-value';
    fontSizeRow.appendChild(fontSizeLabel);
    fontSizeRow.appendChild(fontSizeInput);
    fontSizeRow.appendChild(fontSizeValue);

    var lineHeightRow = document.createElement('div');
    lineHeightRow.className = 'docs-settings-control';
    var lineHeightLabel = document.createElement('label');
    lineHeightLabel.textContent = 'Высота строк';
    var lineHeightInput = document.createElement('input');
    lineHeightInput.type = 'range';
    lineHeightInput.min = '1.2';
    lineHeightInput.max = '2';
    lineHeightInput.step = '0.05';
    var lineHeightValue = document.createElement('span');
    lineHeightValue.className = 'docs-settings-value';
    lineHeightRow.appendChild(lineHeightLabel);
    lineHeightRow.appendChild(lineHeightInput);
    lineHeightRow.appendChild(lineHeightValue);

    typography.appendChild(typographyTitle);
    typography.appendChild(typographyHint);
    typography.appendChild(fontSizeRow);
    typography.appendChild(lineHeightRow);

    var borderCard = document.createElement('div');
    borderCard.className = 'docs-settings-card';
    var borderTitle = document.createElement('h3');
    borderTitle.className = 'docs-settings-card__title';
    borderTitle.textContent = 'Границы ячеек';
    var borderHint = document.createElement('p');
    borderHint.className = 'docs-settings-card__hint';
    borderHint.textContent = 'Настройте толщину, прозрачность и цвет линий таблицы, чтобы они не отвлекали от содержания.';

    var borderColorRow = document.createElement('div');
    borderColorRow.className = 'docs-settings-control';
    var borderColorLabel = document.createElement('label');
    borderColorLabel.textContent = 'Цвет линий';
    var borderColorWrap = document.createElement('div');
    borderColorWrap.className = 'docs-settings-color';
    var borderColorInput = document.createElement('input');
    borderColorInput.type = 'color';
    borderColorWrap.appendChild(borderColorInput);
    borderColorRow.appendChild(borderColorLabel);
    borderColorRow.appendChild(borderColorWrap);

    var borderWidthRow = document.createElement('div');
    borderWidthRow.className = 'docs-settings-control';
    var borderWidthLabel = document.createElement('label');
    borderWidthLabel.textContent = 'Толщина';
    var borderWidthInput = document.createElement('input');
    borderWidthInput.type = 'range';
    borderWidthInput.min = '0';
    borderWidthInput.max = '4';
    borderWidthInput.step = '0.5';
    var borderWidthValue = document.createElement('span');
    borderWidthValue.className = 'docs-settings-value';
    borderWidthRow.appendChild(borderWidthLabel);
    borderWidthRow.appendChild(borderWidthInput);
    borderWidthRow.appendChild(borderWidthValue);

    var borderOpacityRow = document.createElement('div');
    borderOpacityRow.className = 'docs-settings-control';
    var borderOpacityLabel = document.createElement('label');
    borderOpacityLabel.textContent = 'Прозрачность';
    var borderOpacityInput = document.createElement('input');
    borderOpacityInput.type = 'range';
    borderOpacityInput.min = '10';
    borderOpacityInput.max = '100';
    borderOpacityInput.step = '5';
    var borderOpacityValue = document.createElement('span');
    borderOpacityValue.className = 'docs-settings-value';
    borderOpacityRow.appendChild(borderOpacityLabel);
    borderOpacityRow.appendChild(borderOpacityInput);
    borderOpacityRow.appendChild(borderOpacityValue);

    borderCard.appendChild(borderTitle);
    borderCard.appendChild(borderHint);
    borderCard.appendChild(borderColorRow);
    borderCard.appendChild(borderWidthRow);
    borderCard.appendChild(borderOpacityRow);

    var columnsCard = document.createElement('div');
    columnsCard.className = 'docs-settings-card docs-settings-card--wide';
    var columnsTitle = document.createElement('h3');
    columnsTitle.className = 'docs-settings-card__title';
    columnsTitle.textContent = 'Столбцы таблицы';
    var columnsHint = document.createElement('p');
    columnsHint.className = 'docs-settings-card__hint';
    columnsHint.textContent = 'Подберите ширину и размер шрифта для каждого столбца. Значения применяются сразу.';
    var columnsList = document.createElement('div');
    columnsList.className = 'docs-settings-columns';
    var columnInputs = {};

    state.columns.forEach(function(column) {
      var columnRow = document.createElement('div');
      columnRow.className = 'docs-settings-column';

      var headerLine = document.createElement('div');
      headerLine.className = 'docs-settings-column__header';
      var columnLabel = document.createElement('div');
      columnLabel.className = 'docs-settings-column__label';
      columnLabel.textContent = column.label;
      var columnMeta = document.createElement('span');
      columnMeta.className = 'docs-settings-column__meta';
      columnMeta.textContent = column.group ? 'Группа: ' + column.group : '';
      headerLine.appendChild(columnLabel);
      headerLine.appendChild(columnMeta);

      var widthControl = document.createElement('div');
      widthControl.className = 'docs-settings-column__control';
      var widthLabel = document.createElement('label');
      widthLabel.textContent = 'Ширина';
      var widthSlider = document.createElement('input');
      widthSlider.type = 'range';
      widthSlider.min = String(COLUMN_WIDTH_MIN);
      widthSlider.max = String(COLUMN_WIDTH_MAX);
      widthSlider.step = '10';
      var widthNumber = document.createElement('input');
      widthNumber.type = 'number';
      widthNumber.min = String(COLUMN_WIDTH_MIN);
      widthNumber.max = String(COLUMN_WIDTH_MAX);
      widthNumber.step = '10';
      widthNumber.className = 'docs-settings-column__number';
      var widthValue = document.createElement('span');
      widthValue.className = 'docs-settings-column__value';
      widthControl.appendChild(widthLabel);
      widthControl.appendChild(widthSlider);
      widthControl.appendChild(widthNumber);
      widthControl.appendChild(widthValue);

      var fontControl = document.createElement('div');
      fontControl.className = 'docs-settings-column__control';
      var fontLabel = document.createElement('label');
      fontLabel.textContent = 'Шрифт';
      var fontSlider = document.createElement('input');
      fontSlider.type = 'range';
      fontSlider.min = String(COLUMN_FONT_MIN);
      fontSlider.max = String(COLUMN_FONT_MAX);
      fontSlider.step = '1';
      var fontValue = document.createElement('span');
      fontValue.className = 'docs-settings-column__value';
      fontControl.appendChild(fontLabel);
      fontControl.appendChild(fontSlider);
      fontControl.appendChild(fontValue);

      columnRow.appendChild(headerLine);
      columnRow.appendChild(widthControl);
      columnRow.appendChild(fontControl);
      columnsList.appendChild(columnRow);

      columnInputs[column.key] = {
        width: widthSlider,
        widthNumber: widthNumber,
        widthValue: widthValue,
        fontSize: fontSlider,
        fontValue: fontValue
      };
    });

    columnsCard.appendChild(columnsTitle);
    columnsCard.appendChild(columnsHint);
    columnsCard.appendChild(columnsList);

    var visibilityCard = document.createElement('div');
    visibilityCard.className = 'docs-settings-card docs-settings-card--wide';
    var visibilityTitle = document.createElement('h3');
    visibilityTitle.className = 'docs-settings-card__title';
    visibilityTitle.textContent = 'Отображение столбцов';
    var visibilityHint = document.createElement('p');
    visibilityHint.className = 'docs-settings-card__hint';
    visibilityHint.textContent = 'Выберите, какие столбцы показывать в таблице. Можно быстро спрятать лишнее.';
    var visibilityList = document.createElement('div');
    visibilityList.className = 'docs-settings-visibility';
    var visibilityInputs = {};
    state.columns.forEach(function(column) {
      var item = document.createElement('label');
      item.className = 'docs-settings-visibility__item';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      var text = document.createElement('span');
      text.textContent = column.label;
      item.appendChild(checkbox);
      item.appendChild(text);
      visibilityList.appendChild(item);
      visibilityInputs[column.key] = checkbox;
    });
    visibilityCard.appendChild(visibilityTitle);
    visibilityCard.appendChild(visibilityHint);
    visibilityCard.appendChild(visibilityList);

    var sortingCard = document.createElement('div');
    sortingCard.className = 'docs-settings-card docs-settings-card--wide';
    var sortingTitle = document.createElement('h3');
    sortingTitle.className = 'docs-settings-card__title';
    sortingTitle.textContent = 'Сортировка';
    var sortingHint = document.createElement('p');
    sortingHint.className = 'docs-settings-card__hint';
    sortingHint.textContent = 'Выберите до 3 уровней сортировки. Первый уровень — главный, далее уточняющие.';
    var sortingToggle = document.createElement('label');
    sortingToggle.className = 'docs-settings-visibility__item docs-settings-sorting__toggle';
    var sortingEnabled = document.createElement('input');
    sortingEnabled.type = 'checkbox';
    var sortingEnabledText = document.createElement('span');
    sortingEnabledText.textContent = 'Включить сортировку таблицы';
    sortingToggle.appendChild(sortingEnabled);
    sortingToggle.appendChild(sortingEnabledText);

    var sortingRows = document.createElement('div');
    sortingRows.className = 'docs-settings-sorting';
    var sortingRowInputs = [];
    var sortingColumns = state.columns.filter(function(column) {
      return column && column.key !== 'files' && column.key !== 'actions';
    });

    for (var sortIndex = 0; sortIndex < 3; sortIndex += 1) {
      var row = document.createElement('div');
      row.className = 'docs-settings-sorting__row';
      var level = document.createElement('span');
      level.className = 'docs-settings-sorting__level';
      level.textContent = 'Уровень ' + (sortIndex + 1);

      var columnSelect = document.createElement('select');
      columnSelect.className = 'docs-settings-sorting__select';
      var emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'Не выбрано';
      columnSelect.appendChild(emptyOption);
      sortingColumns.forEach(function(column) {
        var option = document.createElement('option');
        option.value = column.key;
        option.textContent = column.label;
        columnSelect.appendChild(option);
      });

      var directionSelect = document.createElement('select');
      directionSelect.className = 'docs-settings-sorting__select docs-settings-sorting__select--direction';
      var ascOption = document.createElement('option');
      ascOption.value = 'asc';
      ascOption.textContent = 'По возрастанию';
      var descOption = document.createElement('option');
      descOption.value = 'desc';
      descOption.textContent = 'По убыванию';
      directionSelect.appendChild(ascOption);
      directionSelect.appendChild(descOption);

      row.appendChild(level);
      row.appendChild(columnSelect);
      row.appendChild(directionSelect);
      sortingRows.appendChild(row);

      sortingRowInputs.push({ column: columnSelect, direction: directionSelect });
    }

    sortingCard.appendChild(sortingTitle);
    sortingCard.appendChild(sortingHint);
    sortingCard.appendChild(sortingToggle);
    sortingCard.appendChild(sortingRows);

    grid.appendChild(typography);
    grid.appendChild(borderCard);
    grid.appendChild(columnsCard);
    grid.appendChild(visibilityCard);
    grid.appendChild(sortingCard);
    panel.appendChild(grid);

    state.inputs = {
      fontSize: fontSizeInput,
      fontSizeLabel: fontSizeValue,
      lineHeight: lineHeightInput,
      lineHeightLabel: lineHeightValue,
      borderColor: borderColorInput,
      borderWidth: borderWidthInput,
      borderWidthLabel: borderWidthValue,
      borderOpacity: borderOpacityInput,
      borderOpacityLabel: borderOpacityValue,
      columns: columnInputs,
      visibility: visibilityInputs,
      sortingEnabled: sortingEnabled,
      sortingRows: sortingRowInputs
    };

    attachInputHandlers();
    return panel;
  }

  function buildMailingPanel() {
    var panel = document.createElement('div');
    panel.className = 'docs-settings-panel';
    panel.id = 'docs-settings-mailing';

    var grid = document.createElement('div');
    grid.className = 'docs-settings-grid';

    var card = document.createElement('div');
    card.className = 'docs-settings-card docs-settings-card--wide';

    var title = document.createElement('h3');
    title.className = 'docs-settings-card__title';
    title.textContent = 'Рассылка';

    var hint = document.createElement('p');
    hint.className = 'docs-settings-card__hint';
    hint.textContent = 'Компактные уведомления. Переключатели сохраняются сразу в общий JSON настроек документооборота.';

    var list = document.createElement('div');
    list.className = 'docs-settings-toggle-list';

    var row = document.createElement('label');
    row.className = 'docs-settings-toggle';

    var textWrap = document.createElement('span');
    textWrap.className = 'docs-settings-toggle__text';
    var rowTitle = document.createElement('span');
    rowTitle.className = 'docs-settings-toggle__title';
    rowTitle.textContent = 'Оповещать Директора о прикреплённых Ответах';
    textWrap.appendChild(rowTitle);

    var toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.className = 'docs-settings-toggle__input';
    toggleInput.addEventListener('change', handleInputChange);

    var toggleUi = document.createElement('span');
    toggleUi.className = 'docs-settings-toggle__switch';
    toggleUi.setAttribute('aria-hidden', 'true');

    row.appendChild(textWrap);
    row.appendChild(toggleInput);
    row.appendChild(toggleUi);
    list.appendChild(row);

    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(list);
    grid.appendChild(card);
    panel.appendChild(grid);

    state.inputs.mailing = {
      notifyDirectorAboutAttachedReplies: toggleInput
    };

    return panel;
  }

  function openModal() {
    if (state.modal) {
      document.body.appendChild(state.modal);
      switchTab(state.activeTab, state.modal.querySelector('.docs-settings-tab'));
      return;
    }

    var modal = document.createElement('div');
    modal.className = 'documents-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    var shell = document.createElement('div');
    shell.className = 'documents-modal__shell documents-modal__shell--narrow';

    var header = document.createElement('header');
    header.className = 'documents-modal__header documents-modal__header--compact';
    var title = document.createElement('h2');
    title.className = 'documents-modal__title';
    title.textContent = 'Настройки Документооборота';
    var actions = document.createElement('div');
    actions.className = 'documents-modal__actions documents-modal__actions--with-save';
    var closeTop = document.createElement('button');
    closeTop.type = 'button';
    closeTop.className = 'documents-panel__close docs-settings-actions__close';
    closeTop.textContent = 'Закрыть';
    closeTop.addEventListener('click', closeModal);
    var saveTop = document.createElement('button');
    saveTop.type = 'button';
    saveTop.className = 'docs-settings-actions__save';
    saveTop.textContent = 'Сохранить';
    saveTop.addEventListener('click', saveSettings);
    var status = document.createElement('p');
    status.className = 'documents-modal__status documents-modal__status--inline';
    status.style.display = 'none';
    actions.appendChild(closeTop);
    actions.appendChild(saveTop);
    actions.appendChild(status);
    header.appendChild(title);
    header.appendChild(actions);

    var tabs = document.createElement('div');
    tabs.className = 'docs-settings-tabs';
    var tableTab = createTabButton('docs-settings-table', 'Таблица');
    var mailingTab = createTabButton('docs-settings-mailing', 'Рассылка');
    tabs.appendChild(tableTab);
    tabs.appendChild(mailingTab);

    var tablePanel = buildControls();
    var mailingPanel = buildMailingPanel();

    shell.appendChild(header);
    shell.appendChild(tabs);
    shell.appendChild(tablePanel);
    shell.appendChild(mailingPanel);
    modal.appendChild(shell);

    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    state.modal = modal;
    state.panel = tablePanel;
    state.status = status;
    document.body.appendChild(modal);
    switchTab('docs-settings-table', tableTab);
    setStatus('', false);

    var initialSettings = state.previewSettings
      || state.currentSettings
      || state.defaults
      || normalizeSettings(null);
    applyPreview(initialSettings);
  }

  function loadSettings() {
    if (state.loadingPromise) {
      logSettings('Повторно используем промис загрузки настроек', { organization: state.organization });
      return state.loadingPromise;
    }
    if (!state.organization) {
      return Promise.reject(new Error('Организация не определена'));
    }
    var access = state.getAccess && typeof state.getAccess === 'function'
      ? state.getAccess()
      : null;
    var user = access && access.user ? access.user : null;
    var resolvedUserKey = typeof state.getUserKey === 'function' ? state.getUserKey() : resolveUserKey(access);

    var requestUrl = buildApiUrl('load');
    if (!requestUrl) {
      logSettings('Пропускаем загрузку настроек — нет данных пользователя', {
        organization: state.organization,
        userKey: resolvedUserKey
      });
      return Promise.resolve(null);
    }
    logSettings('Начинаем загрузку личных настроек', {
      organization: state.organization,
      user: user,
      userKey: resolvedUserKey
    });
    state.loading = true;
    setStatus('Загружаем личные настройки...', false);
    state.loadingPromise = fetch(requestUrl, {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function(payload) {
        state.loaded = true;
        if (!payload || payload.success !== true) {
          throw new Error(payload && payload.error ? payload.error : 'Ответ без данных');
        }
        var normalized = normalizeSettings(payload.settings || {});
        logSettings('Настройки успешно загружены', {
          organization: state.organization,
          settings: normalized
        });
        state.currentSettings = normalized;
        state.previewSettings = normalized;
        state.originalSettings = normalized;
        applyPreview(normalized);
        setStatus('Настройки применены и готовы к работе.', false);
        return normalized;
      })
      .catch(function(error) {
        logSettings('Ошибка загрузки настроек', { organization: state.organization, error: error && error.message });
        setStatus('Не удалось загрузить настройки: ' + error.message, true);
        throw error;
      })
      .finally(function() {
        state.loading = false;
        state.loadingPromise = null;
      });
    return state.loadingPromise;
  }

  function buildSavePayload() {
    var payload = {
      action: 'save',
      organization: state.organization,
      settings: state.previewSettings || state.currentSettings || normalizeSettings(null)
    };
    var access = typeof state.getAccess === 'function' ? state.getAccess() : null;
    var userKey = typeof state.getUserKey === 'function'
      ? state.getUserKey()
      : resolveUserKey(access);
    if (access && typeof access === 'object' && access.user) {
      payload.user = access.user;
    }
    if (userKey) {
      payload.user_key = userKey;
    }
    var telegramId = typeof state.getTelegramId === 'function' ? state.getTelegramId() : '';
    if (telegramId) {
      payload.telegram_user_id = telegramId;
    }
    return payload;
  }

  function saveSettings() {
    if (state.saving) {
      return;
    }
    var latestSettings = collectSettingsFromForm();
    state.previewSettings = latestSettings;

    var payload = buildSavePayload();
    state.saving = true;
    setStatus('Сохраняем настройки...', false);
    fetch(API_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function(result) {
        if (!result || result.success !== true) {
          throw new Error(result && result.error ? result.error : 'Неизвестная ошибка');
        }
        var normalized = normalizeSettings(result.settings || payload.settings);
        state.currentSettings = normalized;
        state.previewSettings = normalized;
        state.originalSettings = normalized;
        applyPreview(normalized);
        setStatus('Настройки сохранены. Приятной работы!', false);
      })
      .catch(function(error) {
        setStatus('Не удалось сохранить: ' + error.message, true);
      })
      .finally(function() {
        state.saving = false;
      });
  }

  function bootstrap(options) {
    if (!options || state.initialized) {
      return;
    }
    logSettings('Bootstrap настроек', { organization: options.organization, host: options.host });
    state.organization = options.organization || '';
    state.host = options.host || null;
    state.apply = options.apply || null;
    state.columns = Array.isArray(options.columns) ? options.columns : [];
    state.defaults = options.defaults || null;
    state.getCurrent = options.getCurrent || null;
    state.getAccess = options.getAccess || null;
    state.getUserKey = options.getUserKey || null;
    state.getTelegramId = options.getTelegramId || null;
    state.initialized = true;
    state.defaults = normalizeSettings(state.defaults);
    state.currentSettings = normalizeSettings(typeof state.getCurrent === 'function' ? state.getCurrent() : null);
    state.previewSettings = state.currentSettings;
    state.originalSettings = state.currentSettings;
    state.readyPromise = loadSettings()
      .then(function(settings) {
        logSettings('Настройки применены в bootstrap', { organization: state.organization });
        if (typeof state.apply === 'function') {
          state.apply(settings);
        }
        return settings;
      })
      .catch(function() {
        applyPreview(state.currentSettings);
        return state.currentSettings;
      });
  }

  function open() {
    logSettings('Открытие модального окна настроек', { organization: state.organization });
    openModal();
    if (!state.readyPromise) {
      logSettings('Запускаем загрузку настроек из open()', { organization: state.organization });
      state.readyPromise = loadSettings();
    }
  }

  window.docsSettings = {
    bootstrap: bootstrap,
    open: open,
    refresh: function() {
      if (!state.initialized) {
        return Promise.resolve(state.currentSettings || state.defaults);
      }

      state.loaded = false;
      state.loadingPromise = null;
      logSettings('Принудительное обновление настроек', {
        organization: state.organization,
        userKey: typeof state.getUserKey === 'function' ? state.getUserKey() : resolveUserKey(state.getAccess && state.getAccess())
      });
      state.readyPromise = loadSettings()
        .then(function(settings) {
          logSettings('Настройки обновлены', { organization: state.organization });
          if (typeof state.apply === 'function') {
            state.apply(settings);
          }
          return settings;
        })
        .catch(function(error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Не удалось обновить личные настройки документов:', error);
          }
          applyPreview(state.currentSettings || state.defaults);
          return state.currentSettings || state.defaults;
        });

      return state.readyPromise;
    },
    ready: function() {
      return state.readyPromise || Promise.resolve(state.currentSettings || state.defaults);
    }
  };
})();