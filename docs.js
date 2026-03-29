(function() {
  var API_URL = 'docs.php';
  var DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU');
  var DATE_TIME_FORMATTER;
  var docsLogger = {
    log: function() {},
    warn: function() {},
    error: function() {}
  };
  var SETTINGS_LOG_PREFIX = '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438';
  var TELEGRAM_MISSING_MESSAGE = '\u0423 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u043d\u0435\u0442 ID Telegram. \u041e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0443.';

  try {
    DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch (dateTimeError) {
    DATE_TIME_FORMATTER = null;
  }

  function detectOrganizationFromPage() {
    var explicit = document.body && document.body.dataset
      ? document.body.dataset.organization || ''
      : '';
    if (explicit) {
      return explicit;
    }
    var path = window.location && window.location.pathname
      ? window.location.pathname
      : '';
    var match = path.match(/\/([^\/?#]+)\.php$/i);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch (error) {
        return match[1];
      }
    }
    return '';
  }

  function createDefaultAccessContext() {
    return {
      role: 'guest',
      authenticated: false,
      accessGranted: false,
      forceAccess: false,
      organization: '',
      organizations: [],
      user: null,
      adminScope: '',
      permissions: { canManageInstructions: false, canCreateDocuments: false, canDeleteDocuments: false }
    };
  }

  function normalizeAccessContext(context) {
    var normalized = createDefaultAccessContext();

    if (!context || typeof context !== 'object') {
      return normalized;
    }

    var role = typeof context.role === 'string' ? context.role.toLowerCase() : '';
    if (role === 'admin') {
      normalized.role = 'admin';
    } else if (role === 'user') {
      normalized.role = 'user';
    }

    if (typeof context.authenticated === 'boolean') {
      normalized.authenticated = context.authenticated;
    }
    if (typeof context.accessGranted === 'boolean') {
      normalized.accessGranted = context.accessGranted;
    }
    if (typeof context.forceAccess === 'boolean') {
      normalized.forceAccess = context.forceAccess;
    }

    if (context.organization) {
      normalized.organization = String(context.organization);
    }

    if (typeof context.adminScope === 'string') {
      normalized.adminScope = context.adminScope;
    }

    if (Array.isArray(context.organizations)) {
      var organizations = [];
      for (var i = 0; i < context.organizations.length; i += 1) {
        var orgCandidate = context.organizations[i];
        if (orgCandidate === null || orgCandidate === undefined) {
          continue;
        }
        var orgName = String(orgCandidate).trim();
        if (orgName) {
          organizations.push(orgName);
        }
      }
      if (organizations.length) {
        normalized.organizations = organizations;
      }
    } else if (normalized.organization) {
      normalized.organizations = [normalized.organization];
    }

    if (context.user && typeof context.user === 'object') {
      normalized.user = context.user;
    }

    if (context.permissions && typeof context.permissions === 'object') {
      normalized.permissions = {};
      for (var key in context.permissions) {
        if (!Object.prototype.hasOwnProperty.call(context.permissions, key)) {
          continue;
        }
        if (typeof context.permissions[key] === 'boolean') {
          normalized.permissions[key] = context.permissions[key];
        }
      }
      if (!Object.prototype.hasOwnProperty.call(normalized.permissions, 'canManageInstructions')) {
        normalized.permissions.canManageInstructions = false;
      }
      if (!Object.prototype.hasOwnProperty.call(normalized.permissions, 'canCreateDocuments')) {
        normalized.permissions.canCreateDocuments = false;
      }
      if (!Object.prototype.hasOwnProperty.call(normalized.permissions, 'canDeleteDocuments')) {
        normalized.permissions.canDeleteDocuments = false;
      }
    }

    return normalized;
  }

  function stableStringify(value) {
    try {
      return JSON.stringify(value, function(key, innerValue) {
        if (innerValue && typeof innerValue === 'object' && !Array.isArray(innerValue)) {
          var ordered = {};
          Object.keys(innerValue).sort().forEach(function(innerKey) {
            ordered[innerKey] = innerValue[innerKey];
          });
          return ordered;
        }
        return innerValue;
      });
    } catch (stringifyError) {
      return '';
    }
  }

  function buildDefaultColumnSettings(baseFontSize) {
    var fontSize = clampNumber(baseFontSize, COLUMN_FONT_MIN, COLUMN_FONT_MAX, DEFAULT_COLUMN_FONT_SIZE);
    var map = {};
    TABLE_COLUMNS.forEach(function(column) {
      map[column.key] = {
        width: getColumnDefaultWidth(column.key),
        fontSize: fontSize,
        visible: true
      };
    });
    return map;
  }

  function normalizeColumnSettings(settings, baseFontSize) {
    var normalized = buildDefaultColumnSettings(baseFontSize);
    if (!settings || typeof settings !== 'object') {
      return normalized;
    }
    Object.keys(normalized).forEach(function(key) {
      var value = settings[key];
      if (!value || typeof value !== 'object') {
        return;
      }
      var width = clampColumnWidth(value.width);
      var fontSize = clampNumber(value.fontSize, COLUMN_FONT_MIN, COLUMN_FONT_MAX, normalized[key].fontSize);
      var visible = value.visible !== false;
      normalized[key] = {
        width: width !== null ? width : normalized[key].width,
        fontSize: fontSize,
        visible: visible
      };
    });
    return normalized;
  }

  function normalizeSortDirection(value) {
    return String(value || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  }

  function buildDefaultSortingSettings() {
    return {
      enabled: false,
      rules: []
    };
  }

  function normalizeSortingSettings(settings) {
    var fallback = buildDefaultSortingSettings();
    if (!settings || typeof settings !== 'object') {
      return fallback;
    }
    var rules = [];
    if (Array.isArray(settings.rules)) {
      for (var i = 0; i < settings.rules.length; i += 1) {
        var rule = settings.rules[i];
        if (!rule || typeof rule !== 'object') {
          continue;
        }
        var column = rule.column ? String(rule.column) : '';
        if (!column || !Object.prototype.hasOwnProperty.call(TABLE_COLUMN_MAP, column)) {
          continue;
        }
        if (column === 'files' || column === 'actions') {
          continue;
        }
        var duplicate = false;
        for (var j = 0; j < rules.length; j += 1) {
          if (rules[j].column === column) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) {
          continue;
        }
        rules.push({
          column: column,
          direction: normalizeSortDirection(rule.direction)
        });
      }
    }
    return {
      enabled: settings.enabled === true && rules.length > 0,
      rules: rules
    };
  }

  function buildDefaultVisualSettings() {
    return {
      fontSize: DEFAULT_COLUMN_FONT_SIZE,
      lineHeight: 1.45,
      borderColor: '#e2e8f0',
      borderWidth: 1,
      borderOpacity: 0.85,
      columns: buildDefaultColumnSettings(DEFAULT_COLUMN_FONT_SIZE),
      sorting: buildDefaultSortingSettings()
    };
  }

  function cloneVisualSettings(settings) {
    var base = settings || buildDefaultVisualSettings();
    return {
      fontSize: base.fontSize,
      lineHeight: base.lineHeight,
      borderColor: base.borderColor,
      borderWidth: base.borderWidth,
      borderOpacity: base.borderOpacity,
      columns: normalizeColumnSettings(base.columns, base.fontSize),
      sorting: normalizeSortingSettings(base.sorting)
    };
  }

  function normalizeRoleValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return normalized.replace(/ё/g, 'е');
  }

  function isAdminRoleLabel(roleLabel) {
    var normalized = normalizeRoleValue(roleLabel);
    if (!normalized) {
      return false;
    }
    if (normalized === 'admin' || normalized === 'administrator') {
      return true;
    }
    if (normalized.indexOf('администратор') !== -1) {
      return true;
    }
    return normalized === 'админ' || normalized.indexOf('админ') !== -1;
  }

  function isCurrentUserAdmin() {
    var candidates = [];
    if (state.access && typeof state.access === 'object') {
      if (state.access.role) {
        candidates.push(state.access.role);
      }
      if (state.access.user && typeof state.access.user === 'object') {
        if (state.access.user.role) {
          candidates.push(state.access.user.role);
        }
        if (state.access.user.responsibleRole) {
          candidates.push(state.access.user.responsibleRole);
        }
      }
    }
    if (state.effectiveUserRole) {
      candidates.push(state.effectiveUserRole);
    }
    for (var i = 0; i < candidates.length; i += 1) {
      if (isAdminRoleLabel(candidates[i])) {
        return true;
      }
    }
    return false;
  }

  function shouldUsePersonalUnviewed() {
    return Boolean(state.access && state.access.role === 'user' && !isCurrentUserAdmin());
  }

  function isSubordinateRole(role) {
    var normalized = normalizeRoleValue(role);
    if (!normalized) {
      return false;
    }
    if (normalized === 'subordinate') {
      return true;
    }
    return normalized.indexOf('подчин') !== -1;
  }

  function resolveEffectiveUserRole(access) {
    if (!access || typeof access !== 'object') {
      return '';
    }
    var candidates = [];
    if (access.user && typeof access.user === 'object') {
      if (access.user.role) {
        candidates.push(access.user.role);
      }
      if (access.user.responsibleRole) {
        candidates.push(access.user.responsibleRole);
      }
    }
    for (var i = 0; i < candidates.length; i += 1) {
      var resolved = normalizeRoleValue(candidates[i]);
      if (resolved) {
        return resolved;
      }
    }
    return '';
  }

  function collectUserAssignmentKeyMap(user, telegramId, role) {
    var map = Object.create(null);

    function addNameCandidate(candidate) {
      var normalized = normalizeUserIdentifier(candidate);
      if (!normalized) {
        return;
      }
      map['name::' + normalized] = true;
    }

    if (telegramId) {
      addAssignmentIdKey(map, telegramId);
    }

    if (user && typeof user === 'object') {
      var idCandidates = [
        user.id,
        user.userId,
        user.telegramId,
        user.telegram_id,
        user.telegram,
        user.chatId,
        user.chat_id,
        user.login,
        user.username,
        user.userName,
        user.responsibleNumber,
        user.responsibleId,
        user.number,
        user.email,
        user.phone
      ];
      for (var i = 0; i < idCandidates.length; i += 1) {
        addAssignmentIdKey(map, idCandidates[i]);
      }

      var nameCandidates = [
        user.fullName,
        user.name,
        user.displayName,
        user.firstName && user.lastName ? String(user.lastName) + ' ' + String(user.firstName) : '',
        user.firstName,
        user.lastName
      ];
      for (var j = 0; j < nameCandidates.length; j += 1) {
        addNameCandidate(nameCandidates[j]);
      }
    }

    if (role && isAdminRoleLabel(role)) {
      map['role::admin'] = true;
    }

    return map;
  }

  function addAssignmentIdKey(map, candidate) {
    if (!map) {
      return false;
    }
    var normalized = normalizeAssigneeIdentifier(candidate);
    if (!normalized) {
      return false;
    }
    var key = 'id::' + normalized;
    if (!map[key]) {
      map[key] = true;
      return true;
    }
    return false;
  }

  function extendAssignmentKeysWithSubordinate(map, user, telegramId) {
    if (!map) {
      return false;
    }
    var candidates = [];
    if (telegramId) {
      candidates.push(telegramId);
    }
    if (user && typeof user === 'object') {
      candidates = candidates.concat([
        user.id,
        user.userId,
        user.telegramId,
        user.telegram_id,
        user.telegram,
        user.chatId,
        user.chat_id,
        user.login,
        user.username
      ]);
    }
    var subordinateEntry = null;
    for (var i = 0; i < candidates.length; i += 1) {
      if (!candidates[i]) {
        continue;
      }
      subordinateEntry = findSubordinateById(candidates[i]);
      if (subordinateEntry) {
        break;
      }
    }
    if (!subordinateEntry || typeof subordinateEntry !== 'object') {
      return false;
    }
    var added = false;
    added = addAssignmentIdKey(map, subordinateEntry.id) || added;
    added = addAssignmentIdKey(map, subordinateEntry.telegram) || added;
    added = addAssignmentIdKey(map, subordinateEntry.login) || added;
    added = addAssignmentIdKey(map, subordinateEntry.username) || added;
    return added;
  }

  function refreshUserAssignmentKeys() {
    state.effectiveUserRole = resolveEffectiveUserRole(state.access);
    var map = collectUserAssignmentKeyMap(
      state.access && state.access.user ? state.access.user : null,
      state.telegramUserId,
      state.effectiveUserRole || (state.access ? state.access.role : '')
    );
    extendAssignmentKeysWithSubordinate(map, state.access && state.access.user ? state.access.user : null, state.telegramUserId);
    var hasKeys = false;
    for (var key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        continue;
      }
      hasKeys = true;
      break;
    }
    state.userAssignmentKeyMap = hasKeys ? map : null;
    state.hasUserAssignmentKeys = hasKeys;
  }

  function roleRequiresAssignmentRestriction(role) {
    if (!role) {
      return false;
    }
    var normalized = normalizeRoleValue(role);
    if (!normalized) {
      return false;
    }
    var restricted = {
      responsible: true,
      subordinate: true,
      'ответственный': true,
      'подчиненный': true,
      'подчинённый': true
    };
    if (Object.prototype.hasOwnProperty.call(restricted, normalized) && restricted[normalized]) {
      return true;
    }
    if (normalized.indexOf('ответствен') !== -1) {
      return true;
    }
    if (normalized.indexOf('подчин') !== -1) {
      return true;
    }
    return false;
  }

  function shouldRestrictByUserAssignments() {
    if (!state.access || state.access.role !== 'user') {
      return false;
    }
    if (isCurrentUserAdmin()) {
      return false;
    }
    if (!state.effectiveUserRole) {
      return false;
    }
    return roleRequiresAssignmentRestriction(state.effectiveUserRole);
  }

  function isCurrentUserSubordinate() {
    if (isSubordinateRole(state.effectiveUserRole)) {
      return true;
    }
    if (state.access && state.access.user && typeof state.access.user === 'object') {
      if (isSubordinateRole(state.access.user.role)) {
        return true;
      }
      if (isSubordinateRole(state.access.user.responsibleRole)) {
        return true;
      }
    }
    return false;
  }

  function documentMatchesUserAssignments(doc) {
    if (!doc || !state.userAssignmentKeyMap) {
      return false;
    }
    var assignees = resolveAssigneeList(doc);
    if (!assignees.length) {
      return false;
    }
    for (var i = 0; i < assignees.length; i += 1) {
      var entry = assignees[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      var keys = buildAssigneeKeyCandidates(entry);
      for (var j = 0; j < keys.length; j += 1) {
        var key = keys[j];
        if (key && Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, key)) {
          return true;
        }
      }
    }
    return false;
  }

  function documentVisibleForCurrentUser(doc) {
    if (!shouldRestrictByUserAssignments()) {
      return true;
    }
    if (!state.hasUserAssignmentKeys) {
      return false;
    }
    return documentMatchesUserAssignments(doc);
  }

  var TELEGRAM_INIT_DATA_COOKIE = 'docsapp_init_data';
  var TELEGRAM_INIT_DATA_STORAGE_KEY = 'docsapp.initData';
  var elements = {
    addButton: null,
    adminButton: null,
    settingsButton: null,
    onlineButton: null,
    onlineCounter: null,
    responsibleButton: null,
    unviewedButton: null,
    unviewedCounter: null,
    message: null,
    tableWrapper: null,
    tableBody: null,
    tableScroll: null,
    tableTopSpacer: null,
    tableBottomSpacer: null,
    emptyState: null,
    filterBar: null,
    searchPopover: null,
    searchLabel: null,
    searchInput: null,
    searchApply: null,
    searchReset: null,
    searchButtons: {},
    headerCells: {},
    groupCells: {}
  };
  var adminElements = {
    modal: null,
    backdrop: null,
    dialog: null,
    sections: {},
    message: null,
    saveButton: null,
    closeButton: null,
    logButton: null,
    logPanel: null,
    logStatus: null,
    logList: null,
    logTextarea: null,
    logCopyButton: null,
    logCloseButton: null
  };
  var clockState = {
    container: null,
    time: null,
    user: null,
    date: null,
    separatorBeforeUser: null,
    separatorBeforeDate: null,
    intervalId: null,
    pendingUserName: ''
  };
  var presenceState = {
    sessionId: '',
    timerId: null,
    active: false,
    modal: null,
    listContainer: null,
    buttonBusy: false
  };
  var lastFocusedElement = null;
  var diagnosticsState = {
    startSent: false,
    sessionRequested: false
  };
  var docsSettingsBootstrapStarted = false;
  var docsSettingsBootstrapPending = false;
  var settingsUserKey = '';
  var settingsUserKeyRetryTimer = null;
  var settingsUserKeyRetryAttempts = 0;
  var SETTINGS_USER_KEY_MAX_RETRIES = 5;
  var SETTINGS_USER_KEY_RETRY_DELAY = 300;

  function logSettings(message, payload) {
    if (typeof console === 'undefined' || typeof docsLogger.log !== 'function') {
      return;
    }
    var details = payload;
    try {
      details = payload && typeof payload === 'object'
        ? JSON.parse(JSON.stringify(payload))
        : payload;
    } catch (error) {}
    docsLogger.log(SETTINGS_LOG_PREFIX + ': ' + message, details);
  }

  function getCurrentUserKey() {
    return resolveUserKey(state.access);
  }

  function resolveUserKey(access) {
    if (!access || !access.user) {
      return '';
    }
    var user = access.user;
    if (user.id !== undefined && user.id !== null && String(user.id).trim() !== '') {
      return 'id:' + String(user.id);
    }
    if (user.telegramId !== undefined && user.telegramId !== null && String(user.telegramId).trim() !== '') {
      return 'id:' + String(user.telegramId);
    }
    if (user.chatId !== undefined && user.chatId !== null && String(user.chatId).trim() !== '') {
      return 'id:' + String(user.chatId);
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
    if (user.displayName) {
      return 'name:' + String(user.displayName).toLowerCase();
    }
    if (user.name) {
      return 'name:' + String(user.name).toLowerCase();
    }
    if (user.lastName || user.firstName) {
      var parts = [];
      if (user.lastName) {
        parts.push(String(user.lastName));
      }
      if (user.firstName) {
        parts.push(String(user.firstName));
      }
      var combined = parts.join(' ').trim();
      if (combined) {
        return 'name:' + combined.toLowerCase();
      }
    }
    if (user.responsible) {
      return 'name:' + String(user.responsible).toLowerCase();
    }
    return '';
  }

  function refreshPersonalSettingsIfNeeded(access) {
    var nextKey = resolveUserKey(access);
    var user = access && access.user ? access.user : null;
    var hasIdentity = Boolean(
      user && (
        user.id !== undefined ||
        user.login ||
        user.username ||
        user.fullName ||
        user.displayName ||
        user.name ||
        (user.lastName && user.firstName) ||
        user.responsible
      )
    );

    if (!hasIdentity) {
      logSettings('Отложенная попытка получения ключа — нет данных пользователя', {
        accessReady: Boolean(access),
        availableUserFields: user ? Object.keys(user) : []
      });
      scheduleSettingsUserKeyRetry();
    } else {
      resetSettingsUserKeyRetry();
    }
    if (nextKey === settingsUserKey) {
      logSettings('Пропускаем обновление настроек, ключ пользователя не изменился', { userKey: nextKey });
      return;
    }
    logSettings('Обнаружен новый пользователь, обновляем настройки', {
      previousKey: settingsUserKey,
      nextKey: nextKey
    });
    settingsUserKey = nextKey;

    if (!nextKey) {
      logSettings('Личные настройки не загружаем — ключ пользователя пустой', {
        userHasLogin: Boolean(user && user.login),
        userHasId: Boolean(user && user.id !== undefined && user.id !== null)
      });
      return;
    }

    logSettings('Сформирован ключ пользователя для загрузки настроек', {
      userKey: nextKey,
      hasLogin: Boolean(user && user.login),
      hasId: Boolean(user && user.id !== undefined && user.id !== null)
    });

    if (docsSettingsBootstrapPending && !docsSettingsBootstrapStarted) {
      logSettings('Повторяем bootstrap настроек после появления ключа пользователя', {
        userKey: nextKey
      });
      bootstrapDocsSettingsIfReady();
    }

    if (window.docsSettings && typeof window.docsSettings.refresh === 'function') {
      logSettings('Запрос на обновление личных настроек через docsSettings.refresh()', { userKey: settingsUserKey });
      window.docsSettings.refresh().catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось обновить личные настройки документов:', error);
        }
      });
    }
  }

  function scheduleSettingsUserKeyRetry() {
    if (settingsUserKeyRetryAttempts >= SETTINGS_USER_KEY_MAX_RETRIES) {
      return;
    }
    if (settingsUserKeyRetryTimer) {
      return;
    }

    settingsUserKeyRetryAttempts += 1;
    settingsUserKeyRetryTimer = window.setTimeout(function() {
      settingsUserKeyRetryTimer = null;
      refreshPersonalSettingsIfNeeded(state.access);
    }, SETTINGS_USER_KEY_RETRY_DELAY);
  }

  function resetSettingsUserKeyRetry() {
    settingsUserKeyRetryAttempts = 0;
    if (settingsUserKeyRetryTimer) {
      window.clearTimeout(settingsUserKeyRetryTimer);
      settingsUserKeyRetryTimer = null;
    }
  }

  function bootstrapDocsSettingsIfReady() {
    if (!window.docsSettings || typeof window.docsSettings.bootstrap !== 'function') {
      return;
    }

    var userKey = getCurrentUserKey();
    if (!userKey) {
      docsSettingsBootstrapPending = true;
      logSettings('Откладываем инициализацию настроек — нет ключа пользователя', {
        accessReady: Boolean(state.access && state.access.user)
      });
      return;
    }

    if (docsSettingsBootstrapStarted) {
      return;
    }

    docsSettingsBootstrapStarted = true;
    docsSettingsBootstrapPending = false;

    logSettings('Инициализация настроек документации', {
      organization: state.organization,
      userKey: settingsUserKey
    });
    window.docsSettings.bootstrap({
      organization: state.organization,
      host: state.host,
      defaults: DEFAULT_VISUAL_SETTINGS,
      columns: TABLE_COLUMNS,
      apply: applyVisualSettings,
      getCurrent: function() {
        return injectCurrentColumnWidthsIntoSettings(state.visualSettings);
      },
      getAccess: function() {
        return state.access;
      },
      getUserKey: function() {
        return settingsUserKey;
      },
      getTelegramId: function() {
        return state.telegramUserId || '';
      }
    });
    if (typeof window.docsSettings.ready === 'function') {
      logSettings('Ожидание готовности настроек', {
        hasReady: typeof window.docsSettings.ready === 'function',
        readyPromiseSet: Boolean(window.docsSettings.ready),
        userKey: settingsUserKey,
        bootstrapStarted: docsSettingsBootstrapStarted,
        bootstrapPending: docsSettingsBootstrapPending
      });
      window.docsSettings.ready()
        .then(function(settings) {
          if (settings) {
            logSettings('Применяем настройки после ready()', { userKey: settingsUserKey });
            applyVisualSettings(settings);
          }
          if (window.docsSettings && typeof window.docsSettings.refresh === 'function') {
            logSettings('Повторный запрос refresh() после ready()', {
              userKey: settingsUserKey,
              hadSettingsFromReady: Boolean(settings),
              loadedBeforeRefresh: Boolean(state.visualSettings)
            });
            return window.docsSettings.refresh();
          }
          return null;
        })
        .catch(function(error) {
          if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
            docsLogger.warn('Не удалось применить личные настройки:', error);
          }
          logSettings('Ошибка при применении личных настроек', { error: error && error.message });
        });
    }
  }
  function accessContextsEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    if (a.role !== b.role) {
      return false;
    }
    if (!!a.authenticated !== !!b.authenticated) {
      return false;
    }
    if (!!a.accessGranted !== !!b.accessGranted) {
      return false;
    }
    if (!!a.forceAccess !== !!b.forceAccess) {
      return false;
    }
    if ((a.organization || '') !== (b.organization || '')) {
      return false;
    }
    var aOrgs = Array.isArray(a.organizations) ? stableStringify(a.organizations) : '[]';
    var bOrgs = Array.isArray(b.organizations) ? stableStringify(b.organizations) : '[]';
    if (aOrgs !== bOrgs) {
      return false;
    }
    if ((a.adminScope || '') !== (b.adminScope || '')) {
      return false;
    }
    var aUserJson = a.user ? stableStringify(a.user) : '';
    var bUserJson = b.user ? stableStringify(b.user) : '';
    if (aUserJson !== bUserJson) {
      return false;
    }
    var aPermissions = a.permissions ? stableStringify(a.permissions) : '';
    var bPermissions = b.permissions ? stableStringify(b.permissions) : '';
    if (aPermissions !== bPermissions) {
      return false;
    }
    return true;
  }

  function applyAccessContext(context) {
    var normalized = normalizeAccessContext(context);

    if (accessContextsEqual(state.access, normalized)) {
      return normalized;
    }

    state.access = normalized;
    refreshUserAssignmentKeys();
    if (normalized.permissions && typeof normalized.permissions === 'object') {
      if (!state.permissions || typeof state.permissions !== 'object') {
        state.permissions = { canManageInstructions: false, canCreateDocuments: false, canDeleteDocuments: false };
      }
      if (Object.prototype.hasOwnProperty.call(normalized.permissions, 'canManageInstructions')
        && typeof normalized.permissions.canManageInstructions === 'boolean') {
        state.permissions.canManageInstructions = normalized.permissions.canManageInstructions;
      }
      if (Object.prototype.hasOwnProperty.call(normalized.permissions, 'canCreateDocuments')
        && typeof normalized.permissions.canCreateDocuments === 'boolean') {
        state.permissions.canCreateDocuments = normalized.permissions.canCreateDocuments;
      }
      if (Object.prototype.hasOwnProperty.call(normalized.permissions, 'canDeleteDocuments')
        && typeof normalized.permissions.canDeleteDocuments === 'boolean') {
        state.permissions.canDeleteDocuments = normalized.permissions.canDeleteDocuments;
      }
    }
    setToolbarState();
    updateTable();
    refreshColumnWidthsIfNeeded();
    updateClockUserDisplay();
    refreshPersonalSettingsIfNeeded(normalized);
    syncPresenceTracking();

    return normalized;
  }

  function extractAccessContextFromEvent(event) {
    if (!event) {
      return null;
    }
    if (event.detail && typeof event.detail === 'object' && event.detail.context) {
      return event.detail.context;
    }
    if (event.context && typeof event.context === 'object') {
      return event.context;
    }
    return null;
  }

  function handleAccessContextChange(event) {
    var previousUserKey = settingsUserKey;
    var context = extractAccessContextFromEvent(event);
    if (!context && typeof window !== 'undefined' && window.documentsAccessContext) {
      context = window.documentsAccessContext;
    }
    var normalized = normalizeAccessContext(context);
    var accessChanged = !accessContextsEqual(state.access, normalized);
    applyAccessContext(normalized);
    bootstrapDocsSettingsIfReady();

    var nextUserKey = resolveUserKey(state.access);
    if (nextUserKey && nextUserKey !== previousUserKey && window.docsSettings && typeof window.docsSettings.refresh === 'function') {
      logSettings('Принудительно обновляем настройки для нового пользователя', { userKey: nextUserKey });
      window.docsSettings.refresh().catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось обновить личные настройки документов после смены пользователя:', error);
        }
      });
    }

    if (accessChanged && normalized && normalized.accessGranted && state.organization) {
      loadRegistry(state.organization).catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.error === 'function') {
          docsLogger.error('Не удалось обновить реестр документов после смены пользователя:', error);
        }
      });
    }
  }

  var TABLE_GROUPS = [
    { key: 'flow', label: 'Входящие и исходящие', span: 7 },
    { key: 'execution', label: 'Исполнение', span: 5 },
    { key: 'resolution', label: 'Резолюция', span: 1 },
    { key: 'control', label: 'Контроль', span: 3 },
    { key: 'files', label: 'Файлы и действия', span: 2 }
  ];
  var TABLE_COLUMNS = [
    { key: 'entryNumber', label: '№', group: 'flow', searchable: true, searchHint: 'Введите номер записи' },
    { key: 'registryNumber', label: 'Рег. №', group: 'flow', searchable: true, searchHint: 'Введите регистрационный номер' },
    { key: 'registrationDate', label: 'Дата регистрации', group: 'flow', searchable: true, searchHint: 'Например: 12.03.2024' },
    { key: 'direction', label: 'Тип', group: 'flow', searchable: true, searchHint: 'Введите входящий или исходящий' },
    { key: 'correspondent', label: 'Корреспондент', group: 'flow', searchable: true, searchHint: 'Введите имя корреспондента' },
    { key: 'documentNumber', label: '№ документа', group: 'flow', searchable: true, searchHint: 'Введите номер документа' },
    { key: 'documentDate', label: 'Дата документа', group: 'flow', searchable: true, searchHint: 'Например: 05.02.2024' },
    { key: 'executor', label: 'Исполнитель', group: 'execution', searchable: true, searchHint: 'Введите исполнителя' },
    { key: 'director', label: 'Директор', group: 'execution', searchable: true, searchHint: 'Введите директора' },
    { key: 'assignee', label: 'Ответственный', group: 'execution', searchable: true, searchHint: 'Введите ответственного или отдел' },
    { key: 'subordinates', label: 'Подчинённые', group: 'execution', searchable: true, searchHint: 'Введите подчинённого или отдел' },
    { key: 'summary', label: 'Содержание', group: 'execution', searchable: true, searchHint: 'Введите ключевые слова' },
    { key: 'resolution', label: 'Резолюция', group: 'resolution', searchable: true, searchHint: 'Введите текст резолюции' },
    { key: 'dueDate', label: 'Срок', group: 'control', searchable: true, searchHint: 'Например: 01.04.2024' },
    { key: 'instruction', label: 'Поручения', group: 'control', searchable: true, searchHint: 'Выберите поручение' },
    { key: 'status', label: 'Статус', group: 'control', searchable: true, searchHint: 'Введите статус' },
    { key: 'files', label: 'Файлы', group: 'files', searchable: false },
    { key: 'actions', label: 'Действия', group: 'files', searchable: false }
  ];
  var STATUS_OPTIONS = ['Принято в работу', 'На проверке', 'Выполнено', 'Отменено'];
  var ASSIGNEE_STATUS_OPTIONS = STATUS_OPTIONS.slice();
  var INSTRUCTION_OPTIONS = ['В работу', 'Для информации', 'Для участия', 'Пояснить', 'Предоставить объяснение', 'Предоставить информацию'];
  var TABLE_COLUMN_MAP = (function() {
    var map = {};
    for (var i = 0; i < TABLE_COLUMNS.length; i += 1) {
      var column = TABLE_COLUMNS[i];
      map[column.key] = column;
    }
    return map;
  })();
  var COLUMN_WIDTH_MIN = 1;
  var COLUMN_WIDTH_MAX = 420;
  var COLUMN_WIDTH_STEP = 10;
  var COLUMN_WIDTH_DEFAULTS = {
    entryNumber: 80,
    registryNumber: 140,
    registrationDate: 150,
    direction: 140,
    correspondent: 240,
    documentNumber: 160,
    documentDate: 150,
    executor: 200,
    director: 200,
    assignee: 220,
    subordinates: 220,
    summary: 320,
    resolution: 260,
    dueDate: 160,
    instruction: 210,
    status: 180,
    files: 160,
    actions: 160
  };
  var COLUMN_FONT_MIN = 12;
  var COLUMN_FONT_MAX = 22;
  var DEFAULT_COLUMN_FONT_SIZE = 14;
  var COLUMN_WIDTH_CONTROLS = TABLE_COLUMNS.map(function(column) {
    return { key: column.key, label: column.label };
  });
  var searchEventsBound = false;

  var DEFAULT_VISUAL_SETTINGS = buildDefaultVisualSettings();

  var state = {
    host: null,
    organization: detectOrganizationFromPage(),
    telegramUserId: '',
    storagePath: '',
    storageDisplayPath: '',
    documents: [],
    visualSettings: cloneVisualSettings(DEFAULT_VISUAL_SETTINGS),
    columnWidthOverrides: null,
    columnVisibility: {},
    columnWidths: {},
    columnWidthProfile: '',
    columnWidthOrganization: '',
    columnWidthProfileKey: '',
    columnWidthsLoaded: false,
    columnWidthsLoadingPromise: null,
    rowCache: new Map(),
    rowExpandedState: new Map(),
    virtualTable: {
      rowHeight: 0,
      minVisibleRows: 30,
      maxVisibleRows: 80,
      overscan: 12,
      filteredEntries: [],
      renderFrame: 0
    },
    directorCache: {},
    responsiblesIndex: {},
    subordinatesIndex: {},
    directorsIndex: {},
    filters: {},
    filterOrder: [],
    showUnassignedOnly: false,
    showUnviewedOnly: false,
    unviewedCount: 0,
    activeSearchColumn: '',
    activeSearchButton: null,
    access: createDefaultAccessContext(),
    permissions: { canManageInstructions: false, canCreateDocuments: false, canDeleteDocuments: false },
    userAssignmentKeyMap: null,
    hasUserAssignmentKeys: false,
    effectiveUserRole: '',
    admin: {
      settings: {
        responsibles: [],
        block2: [],
        block3: []
      },
      loaded: false,
      saving: false,
      loadingPromise: null,
      userLog: {
        entries: [],
        loading: false,
        error: '',
        visible: false,
        promise: null,
        lastLoadedAt: 0
      }
    },
    resizeTimer: null,
    resizeListenerAttached: false
  };

  function readCookieValue(name) {
    if (!name || typeof document === 'undefined' || typeof document.cookie !== 'string') {
      return '';
    }
    try {
      var parts = document.cookie.split(';');
      for (var i = 0; i < parts.length; i += 1) {
        var fragment = parts[i] ? parts[i].trim() : '';
        if (!fragment) {
          continue;
        }
        if (fragment.indexOf(name + '=') === 0) {
          var value = fragment.slice(name.length + 1);
          try {
            return decodeURIComponent(value);
          } catch (error) {
            return value;
          }
        }
      }
    } catch (error) {
      // ignore cookie access issues
    }
    return '';
  }

  function readSessionStorageValue(key) {
    if (!key || typeof window === 'undefined' || !window.sessionStorage) {
      return '';
    }
    try {
      return window.sessionStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function parseTelegramUserIdFromCandidate(candidate) {
    if (candidate === null || candidate === undefined) {
      return '';
    }
    var raw = String(candidate).trim();
    if (!raw) {
      return '';
    }
    if (/^-?\d+$/.test(raw)) {
      return raw;
    }
    var params = null;
    if (raw.indexOf('=') !== -1 || raw.indexOf('%3D') !== -1) {
      try {
        params = new URLSearchParams(raw);
      } catch (error) {
        var questionIndex = raw.indexOf('?');
        if (questionIndex !== -1 && questionIndex < raw.length - 1) {
          try {
            params = new URLSearchParams(raw.slice(questionIndex + 1));
          } catch (innerError) {
            params = null;
          }
        }
      }
    }
    if (!params) {
      return '';
    }
    var directKeys = ['telegram_user_id', 'telegramId', 'user_id', 'userid', 'id'];
    for (var i = 0; i < directKeys.length; i += 1) {
      var directValue = params.get(directKeys[i]);
      if (directValue !== null) {
        var trimmed = String(directValue).trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    var userParam = params.get('user');
    if (userParam) {
      try {
        var parsedUser = JSON.parse(userParam);
        if (parsedUser && parsedUser.id !== undefined && parsedUser.id !== null) {
          var id = String(parsedUser.id).trim();
          if (id) {
            return id;
          }
        }
      } catch (error) {
        // ignore JSON parse errors
      }
    }
    return '';
  }

  function detectTelegramUserId() {
    var candidates = [];
    var cookieCandidate = readCookieValue(TELEGRAM_INIT_DATA_COOKIE);
    if (cookieCandidate) {
      candidates.push(cookieCandidate);
    }
    var storedCandidate = readSessionStorageValue(TELEGRAM_INIT_DATA_STORAGE_KEY);
    if (storedCandidate) {
      candidates.push(storedCandidate);
    }
    if (typeof window !== 'undefined') {
      var search = window.location && typeof window.location.search === 'string'
        ? window.location.search
        : '';
      var hash = window.location && typeof window.location.hash === 'string'
        ? window.location.hash
        : '';
      var rawParts = [];
      if (search) {
        rawParts.push(search);
      }
      if (hash) {
        rawParts.push(hash);
      }
      for (var partIndex = 0; partIndex < rawParts.length; partIndex += 1) {
        var part = rawParts[partIndex];
        if (!part) {
          continue;
        }
        var trimmed = part.charAt(0) === '?' || part.charAt(0) === '#'
          ? part.slice(1)
          : part;
        if (!trimmed) {
          continue;
        }
        try {
          var params = new URLSearchParams(trimmed);
          var directKeys = ['telegram_user_id', 'telegramId', 'user_id', 'userid', 'id'];
          for (var i = 0; i < directKeys.length; i += 1) {
            var value = params.get(directKeys[i]);
            if (value !== null) {
              var cleaned = String(value).trim();
              if (cleaned) {
                candidates.push(cleaned);
              }
            }
          }
          var initCandidate = params.get('init_data') || params.get('tgWebAppData') || params.get('tgwebappdata');
          if (initCandidate) {
            candidates.push(initCandidate);
          }
        } catch (error) {
          // ignore URLSearchParams errors
        }
      }
    }
    if (typeof document !== 'undefined' && document.body && document.body.dataset) {
      var datasetId = document.body.dataset.telegramUserId || document.body.dataset.telegramUser || '';
      if (datasetId) {
        candidates.push(datasetId);
      }
    }
    for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      var resolved = parseTelegramUserIdFromCandidate(candidates[candidateIndex]);
      if (resolved) {
        return resolved;
      }
    }
    return '';
  }

  function getTelegramUserId() {
    var cached = state.telegramUserId ? String(state.telegramUserId).trim() : '';
    if (cached) {
      return cached;
    }
    var detected = detectTelegramUserId();
    if (detected) {
      state.telegramUserId = detected;
      return detected;
    }
    return '';
  }

  function appendTelegramUserIdParam(params) {
    if (!params || typeof params.set !== 'function') {
      return params;
    }
    var telegramId = getTelegramUserId();
    if (telegramId) {
      params.set('telegram_user_id', telegramId);
    }
    return params;
  }

  function mergeTelegramUserId(target) {
    if (!target || typeof target !== 'object') {
      return target;
    }
    var telegramId = getTelegramUserId();
    if (!telegramId) {
      return target;
    }
    if (!Object.prototype.hasOwnProperty.call(target, 'telegram_user_id') || !target.telegram_user_id) {
      target.telegram_user_id = telegramId;
    }
    return target;
  }

  function appendTelegramUserIdToFormData(formData) {
    if (!formData || typeof formData.append !== 'function') {
      return formData;
    }
    var telegramId = getTelegramUserId();
    if (!telegramId) {
      return formData;
    }
    try {
      if (typeof formData.get === 'function') {
        var existing = formData.get('telegram_user_id');
        if (existing !== null && String(existing).trim() !== '') {
          return formData;
        }
      }
    } catch (error) {
      // ignore access errors and still append
    }
    formData.append('telegram_user_id', telegramId);
    return formData;
  }

  function setFormDataValue(formData, name, value) {
    if (!formData || !name) {
      return;
    }
    if (typeof formData.set === 'function') {
      formData.set(name, value);
      return;
    }
    if (typeof formData.delete === 'function') {
      formData.delete(name);
    }
    formData.append(name, value);
  }

  function normalizeTextInputValue(value) {
    if (value === undefined || value === null) {
      return '';
    }
    return String(value)
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  function buildApiUrl(action, extraParams) {
    var params = new URLSearchParams();
    if (action) {
      params.set('action', action);
    }
    if (extraParams && typeof extraParams === 'object') {
      for (var key in extraParams) {
        if (!Object.prototype.hasOwnProperty.call(extraParams, key)) {
          continue;
        }
        var value = extraParams[key];
        if (value === undefined || value === null) {
          continue;
        }
        params.set(key, value);
      }
    }
    appendTelegramUserIdParam(params);
    var query = params.toString();
    return query ? API_URL + '?' + query : API_URL;
  }

  function cloneDiagnosticsObject(source) {
    var result = {};
    if (!source || typeof source !== 'object') {
      return result;
    }
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        result[key] = source[key];
      }
    }
    return result;
  }

  function sendClientDiagnostics(eventName, diagnostics) {
    if (typeof fetch !== 'function') {
      return;
    }

    var normalizedEvent = '';
    if (typeof eventName === 'string' && eventName.trim) {
      normalizedEvent = eventName.trim();
    }
    if (!normalizedEvent) {
      normalizedEvent = 'client_event';
    }

    var details = {};
    if (diagnostics && typeof diagnostics === 'object') {
      if (Array.isArray && Array.isArray(diagnostics)) {
        details.sample = diagnostics.slice(0, 5);
      } else {
        details = cloneDiagnosticsObject(diagnostics);
      }
    } else if (typeof diagnostics === 'string') {
      details.message = diagnostics;
    } else if (diagnostics !== undefined && diagnostics !== null) {
      details.value = diagnostics;
    }

    var href = '';
    if (typeof window !== 'undefined' && window.location && typeof window.location.href === 'string') {
      href = window.location.href;
    }

    var agent = '';
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      agent = navigator.userAgent;
    }

    var payload = {
      event: normalizedEvent,
      organization: state.organization || '',
      diagnostics: details,
      location: href,
      userAgent: agent
    };

    mergeTelegramUserId(payload);

    try {
      fetch(buildApiUrl('client_diagnostics'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function(error) {
        if (typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось отправить диагностику документов:', error);
        }
      });
    } catch (error) {
      if (typeof docsLogger.warn === 'function') {
        docsLogger.warn('Ошибка подготовки диагностики документов:', error);
      }
    }
  }

  function requestSessionDiagnostics() {
    if (diagnosticsState.sessionRequested) {
      return;
    }
    diagnosticsState.sessionRequested = true;

    if (typeof fetch !== 'function') {
      sendClientDiagnostics('session_info_error', { message: 'Fetch API недоступен' });
      return;
    }

    fetch(buildApiUrl('session_info'), { credentials: 'same-origin' })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function(payload) {
        if (!payload || payload.success !== true) {
          var fallback = payload && payload.error ? payload.error : 'Некорректный ответ';
          throw new Error(fallback);
        }
        var session = payload.session || null;
        if (!session) {
          throw new Error('Данные сессии отсутствуют');
        }
        var organizations = session.organizations;
        var organizationsCount = 0;
        if (Array.isArray && Array.isArray(organizations)) {
          organizationsCount = organizations.length;
        } else if (organizations && typeof organizations.length === 'number') {
          organizationsCount = organizations.length;
        }
        var summary = {
          authenticated: !!session.authenticated,
          mode: session.mode || '',
          organization: session.organization || '',
          organizationsCount: organizationsCount,
          accessGranted: !!session.accessGranted
        };
        if (session.user && typeof session.user === 'object') {
          var userSummary = {};
          var hasUserInfo = false;
          if (session.user.id) {
            userSummary.id = session.user.id;
            hasUserInfo = true;
          }
          if (session.user.username) {
            userSummary.username = session.user.username;
            hasUserInfo = true;
          }
          if (hasUserInfo) {
            summary.user = userSummary;
          }
        }
        sendClientDiagnostics('session_info', summary);
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : String(error);
        sendClientDiagnostics('session_info_error', { message: message });
      });
  }

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

  function ensureClockStyle() {
    if (document.getElementById('documents-clock-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-clock-style';
    style.textContent = '' +
      '.documents-clock{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:12px;' +
      'padding:8px 16px;' +
      'border-radius:14px;' +
      'background:rgba(15,23,42,0.06);' +
      'color:var(--documents-text,#0f172a);' +
      'font-size:14px;' +
      'font-weight:500;' +
      'letter-spacing:0.02em;' +
      'box-shadow:0 6px 18px rgba(15,23,42,0.08);' +
      '}' +
      '.documents-clock__time{' +
      'font-variant-numeric:tabular-nums;' +
      'font-weight:600;' +
      '}' +
      '.documents-clock__user{' +
      'font-weight:600;' +
      '}' +
      '.documents-clock__date{' +
      'text-transform:lowercase;' +
      'opacity:0.75;' +
      '}' +
      '.documents-clock__separator{' +
      'opacity:0.35;' +
      'font-size:18px;' +
      '}';
    document.head.appendChild(style);
  }

  function formatClockTime(date) {
    return date
      .toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      .replace(/:/g, '.');
  }

  function formatClockDate(date) {
    var day = date.toLocaleDateString('ru-RU', { day: '2-digit' });
    var month = date.toLocaleDateString('ru-RU', { month: 'long' }).toLowerCase();
    var year = String(date.getFullYear());
    return day + '.' + month + '.' + year;
  }

  function updateClockDisplay() {
    if (!clockState.time || !clockState.date) {
      return;
    }
    var now = new Date();
    clockState.time.textContent = formatClockTime(now);
    clockState.date.textContent = formatClockDate(now);
  }

  function resolveAccessUserDisplayName() {
    var accessUser = state.access && state.access.user ? state.access.user : null;
    if (!accessUser || typeof accessUser !== 'object') {
      return '';
    }

    var seen = Object.create(null);
    var candidates = [];

    function pushCandidate(candidate) {
      if (candidate === null || candidate === undefined) {
        return;
      }
      var text = String(candidate).trim();
      if (!text) {
        return;
      }
      var normalized = text.toLowerCase();
      if (seen[normalized]) {
        return;
      }
      seen[normalized] = true;
      candidates.push(text);
    }

    pushCandidate(accessUser.fullName);
    pushCandidate(accessUser.displayName);
    pushCandidate(accessUser.name);

    var lastFirst = [];
    if (accessUser.lastName) {
      lastFirst.push(String(accessUser.lastName).trim());
    }
    if (accessUser.firstName) {
      lastFirst.push(String(accessUser.firstName).trim());
    }
    if (lastFirst.length) {
      pushCandidate(lastFirst.join(' '));
    }

    var firstLast = [];
    if (accessUser.firstName) {
      firstLast.push(String(accessUser.firstName).trim());
    }
    if (accessUser.lastName) {
      firstLast.push(String(accessUser.lastName).trim());
    }
    if (firstLast.length) {
      pushCandidate(firstLast.join(' '));
    }

    if (accessUser.responsible) {
      pushCandidate(accessUser.responsible);
    }
    if (accessUser.login) {
      pushCandidate(accessUser.login);
    }

    return candidates.length ? candidates[0] : '';
  }

  function assigneeMatchesIdentifiers(entry, idLookup, nameLookup, displayName) {
    if (!entry) {
      return false;
    }

    if (state.userAssignmentKeyMap && matchesCurrentUserAssignee(entry)) {
      return true;
    }

    var idCandidates = [entry.id, entry.telegram, entry.chatId, entry.email, entry.number, entry.login];
    if (idLookup) {
      for (var i = 0; i < idCandidates.length; i += 1) {
        var idCandidate = idCandidates[i];
        if (!idCandidate) {
          continue;
        }
        var normalizedId = normalizeUserIdentifier(idCandidate);
        if (normalizedId && idLookup[normalizedId]) {
          return true;
        }
        var alternateId = normalizeAssigneeIdentifier(idCandidate);
        if (alternateId && idLookup[alternateId]) {
          return true;
        }
      }
    }

    if (nameLookup) {
      var nameCandidates = [entry.name, entry.responsible, displayName];
      for (var j = 0; j < nameCandidates.length; j += 1) {
        var nameCandidate = nameCandidates[j];
        if (!nameCandidate) {
          continue;
        }
        var normalizedName = normalizeUserIdentifier(nameCandidate);
        if (normalizedName && nameLookup[normalizedName]) {
          return true;
        }
      }
    }

    return false;
  }

  function resolveAssignmentDisplayName() {
    if (!Array.isArray(state.documents) || !state.documents.length) {
      return '';
    }

    var identifiers = collectCurrentUserIdentifiers();
    var hasIds = identifiers.ids && identifiers.ids.length;
    var hasNames = identifiers.names && identifiers.names.length;
    if (!hasIds && !hasNames) {
      return '';
    }

    var idLookup = null;
    if (hasIds) {
      idLookup = Object.create(null);
      for (var i = 0; i < identifiers.ids.length; i += 1) {
        var idValue = identifiers.ids[i];
        if (!idValue) {
          continue;
        }
        idLookup[idValue] = true;
        if (idValue.charAt(0) === '@' && idValue.length > 1) {
          idLookup[idValue.slice(1)] = true;
        }
      }
    }

    var nameLookup = null;
    if (hasNames) {
      nameLookup = Object.create(null);
      for (var j = 0; j < identifiers.names.length; j += 1) {
        var nameValue = identifiers.names[j];
        if (!nameValue) {
          continue;
        }
        nameLookup[nameValue] = true;
      }
    }

    for (var docIndex = 0; docIndex < state.documents.length; docIndex += 1) {
      var doc = state.documents[docIndex];
      var assignees = resolveAssigneeList(doc);
      for (var assigneeIndex = 0; assigneeIndex < assignees.length; assigneeIndex += 1) {
        var entry = assignees[assigneeIndex];
        if (!entry) {
          continue;
        }
        var displayName = buildAssigneeDisplayName(entry);
        if (assigneeMatchesIdentifiers(entry, idLookup, nameLookup, displayName) && displayName) {
          return displayName;
        }
      }
    }

    return '';
  }

  function resolveCurrentResponsibleName() {
    var assignmentName = resolveAssignmentDisplayName();
    if (assignmentName) {
      return assignmentName;
    }
    return resolveAccessUserDisplayName();
  }

  function applyClockUserName(name) {
    var text = name ? String(name).trim() : '';
    clockState.pendingUserName = text;

    if (clockState.container) {
      if (text) {
        clockState.container.classList.add('documents-clock--has-user');
      } else {
        clockState.container.classList.remove('documents-clock--has-user');
      }
    }

    if (!clockState.user || !clockState.separatorBeforeUser) {
      return;
    }

    if (text) {
      clockState.user.textContent = text;
      clockState.user.removeAttribute('hidden');
      clockState.separatorBeforeUser.removeAttribute('hidden');
    } else {
      clockState.user.textContent = '';
      clockState.user.setAttribute('hidden', '');
      clockState.separatorBeforeUser.setAttribute('hidden', '');
    }
  }

  function updateClockUserDisplay() {
    applyClockUserName(resolveCurrentResponsibleName());
  }

  function ensureClock(addButton) {
    if (!addButton || !addButton.parentElement) {
      return;
    }

    ensureClockStyle();

    var parent = addButton.parentElement;
    if (!clockState.container) {
      var container = createElement('div', 'documents-clock');
      container.setAttribute('aria-live', 'polite');

      var timeNode = createElement('span', 'documents-clock__time');
      var separatorBeforeUser = createElement('span', 'documents-clock__separator', '•');
      var userNode = createElement('span', 'documents-clock__user');
      var separatorBeforeDate = createElement('span', 'documents-clock__separator', '•');
      var dateNode = createElement('span', 'documents-clock__date');

      userNode.setAttribute('hidden', '');
      separatorBeforeUser.setAttribute('hidden', '');

      container.appendChild(timeNode);
      container.appendChild(separatorBeforeUser);
      container.appendChild(userNode);
      container.appendChild(separatorBeforeDate);
      container.appendChild(dateNode);

      clockState.container = container;
      clockState.time = timeNode;
      clockState.user = userNode;
      clockState.date = dateNode;
      clockState.separatorBeforeUser = separatorBeforeUser;
      clockState.separatorBeforeDate = separatorBeforeDate;
    }

    if (!parent.contains(clockState.container)) {
      if (addButton.nextSibling) {
        parent.insertBefore(clockState.container, addButton.nextSibling);
      } else {
        parent.appendChild(clockState.container);
      }
    }

    updateClockDisplay();

    if (clockState.pendingUserName) {
      applyClockUserName(clockState.pendingUserName);
    } else {
      updateClockUserDisplay();
    }

    if (!clockState.intervalId) {
      clockState.intervalId = window.setInterval(updateClockDisplay, 1000);
    }
  }


  function ensureResponsesStyle() {
    if (document.getElementById('documents-responses-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-responses-style';
    style.textContent = '' +
      '.documents-responses-modal{' +
      'position:fixed;inset:0;z-index:1600;background:rgba(148,163,184,0.16);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;' +
      '}' +
      '.documents-responses-panel{' +
      'width:min(760px,100%);max-height:min(88vh,920px);margin:0;background:rgba(255,255,255,0.88);border:1px solid rgba(255,255,255,0.75);border-radius:22px;box-shadow:0 20px 55px rgba(15,23,42,0.16);overflow:hidden;display:flex;flex-direction:column;' +
      '}' +
      '.documents-responses-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(226,232,240,0.95);}' +
      '.documents-responses-title{font-size:18px;font-weight:700;color:#0f172a;}' +
      '.documents-responses-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}' +
      '.documents-responses-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px;min-height:0;}' +
      '.documents-responses-toolbar{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:12px;border-radius:18px;background:rgba(248,250,252,0.92);border:1px solid rgba(226,232,240,0.95);}' +
      '.documents-responses-dropzone{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:18px;border:1px dashed rgba(59,130,246,0.32);background:linear-gradient(135deg, rgba(255,255,255,0.94), rgba(239,246,255,0.96));cursor:pointer;transition:border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;}' +
      '.documents-responses-dropzone:hover,.documents-responses-dropzone:focus-visible{border-color:rgba(37,99,235,0.52);box-shadow:0 10px 24px rgba(37,99,235,0.12);outline:none;transform:translateY(-1px);}' +
      '.documents-responses-dropzone.is-dragover{border-color:rgba(37,99,235,0.78);box-shadow:0 14px 28px rgba(37,99,235,0.18);background:linear-gradient(135deg, rgba(219,234,254,0.95), rgba(239,246,255,0.98));}' +
      '.documents-responses-dropzone-copy{display:flex;flex-direction:column;gap:6px;min-width:0;}' +
      '.documents-responses-dropzone-title{font-size:14px;font-weight:700;color:#0f172a;}' +
      '.documents-responses-dropzone-hint{font-size:12px;line-height:1.45;color:#64748b;}' +
      '.documents-responses-dropzone-badge{flex:0 0 auto;padding:8px 12px;border-radius:999px;background:rgba(37,99,235,0.1);color:#1d4ed8;font-size:12px;font-weight:700;white-space:nowrap;}' +
      '.documents-responses-hint{font-size:12px;color:#64748b;}' +
      '.documents-responses-message{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:rgba(255,255,255,0.9);border:1px solid rgba(226,232,240,0.95);}' +
      '.documents-responses-message-label{font-size:12px;font-weight:700;color:#334155;display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.documents-responses-message-counter{font-weight:600;color:#64748b;}' +
      '.documents-responses-message textarea{width:100%;min-height:92px;max-height:200px;resize:vertical;border:1px solid rgba(148,163,184,0.4);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.45;color:#0f172a;background:rgba(255,255,255,0.98);box-sizing:border-box;}' +
      '.documents-responses-message textarea:focus{outline:none;border-color:rgba(37,99,235,0.55);box-shadow:0 0 0 3px rgba(37,99,235,0.12);}' +
      '.documents-responses-table-wrap{overflow:auto;border:1px solid rgba(226,232,240,0.95);border-radius:18px;background:rgba(255,255,255,0.8);min-height:0;}' +
      '.documents-responses-table{width:100%;border-collapse:collapse;font-size:13px;color:#0f172a;}' +
      '.documents-responses-table th,.documents-responses-table td{padding:8px 10px;border-bottom:1px solid rgba(226,232,240,0.85);text-align:left;vertical-align:middle;}' +
      '.documents-responses-table th{font-size:12px;font-weight:700;color:#475569;background:rgba(248,250,252,0.92);position:sticky;top:0;}' +
      '.documents-responses-table tr:last-child td{border-bottom:none;}' +
      '.documents-responses-file{display:flex;flex-direction:column;gap:4px;min-width:180px;}' +
      '.documents-responses-file a{color:#2563eb;text-decoration:none;word-break:break-word;}' +
      '.documents-responses-file a:hover{text-decoration:underline;}' +
      '.documents-responses-text-preview{margin:0;padding:10px 12px;border-radius:12px;background:rgba(241,245,249,0.82);border:1px solid rgba(226,232,240,0.95);font-size:12px;line-height:1.45;color:#0f172a;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;}' +
      '.documents-responses-meta{font-size:12px;color:#64748b;}' +
      '.documents-responses-status{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(59,130,246,0.12);color:#1d4ed8;font-size:12px;font-weight:600;}' +
      '.documents-responses-status--pending{background:rgba(245,158,11,0.14);color:#b45309;}' +
      '.documents-responses-empty{padding:18px;text-align:center;color:#64748b;font-size:13px;}' +
      '.documents-responses-danger{color:#dc2626;}' +
      '.documents-responses-actions .documents-button--ai{background:linear-gradient(135deg, rgba(37,99,235,0.9), rgba(14,165,233,0.9));color:#ffffff;border-color:transparent;}' +
      '.documents-responses-actions .documents-button--ai:hover{filter:brightness(1.03);}' +
      '.documents-brief-modal{position:fixed;inset:0;z-index:1700;background:linear-gradient(180deg, rgba(148,163,184,0.24), rgba(148,163,184,0.3));backdrop-filter:blur(12px);display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;}' +
      '.documents-brief-panel{width:min(980px,100%);max-height:min(90vh,920px);background:linear-gradient(165deg, rgba(255,255,255,0.97), rgba(255,255,255,0.9));border:1px solid rgba(255,255,255,0.95);border-radius:24px;box-shadow:0 30px 60px rgba(15,23,42,0.2);display:flex;flex-direction:column;overflow:hidden;}' +
      '.documents-brief-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid rgba(226,232,240,0.95);background:rgba(255,255,255,0.7);}' +
      '.documents-brief-title{font-size:18px;font-weight:700;color:#0f172a;}' +
      '.documents-brief-subtitle{font-size:12px;color:#64748b;margin-top:2px;}' +
      '.documents-brief-body{display:grid;grid-template-columns:minmax(260px,380px) minmax(0,1fr);gap:14px;padding:14px;min-height:0;flex:1;background:linear-gradient(180deg, rgba(248,250,252,0.55), rgba(255,255,255,0.78));}' +
      '.documents-brief-list{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;padding:2px 6px 2px 0;scrollbar-width:thin;}' +
      '.documents-brief-item{border:1px solid rgba(203,213,225,0.95);background:rgba(255,255,255,0.96);border-radius:14px;padding:11px 12px;text-align:left;color:#0f172a;font-size:13px;cursor:pointer;transition:all .2s ease;box-shadow:0 8px 20px rgba(15,23,42,0.05);display:flex;flex-direction:column;align-items:flex-start;gap:4px;}' +
      '.documents-brief-item-name{display:block;width:100%;font-size:13px;font-weight:600;line-height:1.35;white-space:normal;word-break:break-word;overflow-wrap:anywhere;}' +
      '.documents-brief-item-meta{display:block;width:100%;font-size:11px;color:#64748b;white-space:normal;word-break:break-word;overflow-wrap:anywhere;}' +
      '.documents-brief-item:hover,.documents-brief-item:focus-visible{border-color:rgba(37,99,235,0.48);box-shadow:0 0 0 3px rgba(37,99,235,0.12);outline:none;}' +
      '.documents-brief-item.is-active{background:linear-gradient(135deg, rgba(239,246,255,0.96), rgba(255,255,255,0.98));border-color:rgba(37,99,235,0.52);}' +
      '.documents-brief-preview{border:1px solid rgba(203,213,225,0.9);border-radius:18px;background:rgba(255,255,255,0.98);padding:16px;font-size:13px;line-height:1.58;color:#0f172a;white-space:pre-wrap;word-break:break-word;overflow:auto;min-height:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.75), 0 12px 26px rgba(15,23,42,0.06);}' +
      '.documents-brief-preview.is-loading{color:#2563eb;}' +
      '@media (max-width: 768px){' +
      '.documents-responses-modal{padding:8px;align-items:center;}' +
      '.documents-responses-panel{width:100%;max-height:calc(100vh - 16px);border-radius:18px;}' +
      '.documents-responses-header,.documents-responses-body{padding:12px;}' +
      '.documents-responses-actions{width:100%;justify-content:stretch;}' +
      '.documents-responses-actions .documents-button{flex:1 1 auto;}' +
      '.documents-responses-dropzone{flex-direction:column;align-items:flex-start;}' +
      '.documents-responses-dropzone-badge{white-space:normal;}' +
      '.documents-responses-message textarea{min-height:80px;}' +
      '.documents-responses-table th,.documents-responses-table td{padding:8px;}' +
      '.documents-brief-modal{padding:8px;align-items:flex-end;}' +
      '.documents-brief-panel{width:100%;max-height:calc(100vh - 16px);border-radius:20px;}' +
      '.documents-brief-body{grid-template-columns:1fr;padding:12px;}' +
      '.documents-brief-item{padding:10px 11px;}' +
      '.documents-brief-item-name{font-size:12px;}' +
      '}';
    document.head.appendChild(style);
  }

  var aiResponseModalScriptPromise = null;

  function ensureAiResponseModalScript() {
    if (window.openDocumentsAiResponseModal) {
      return Promise.resolve(window.openDocumentsAiResponseModal);
    }
    if (aiResponseModalScriptPromise) {
      return aiResponseModalScriptPromise;
    }
    aiResponseModalScriptPromise = new Promise(function(resolve, reject) {
      var version = (window.__ASSET_VERSION__ || Date.now()).toString();
      var scriptDirectory = '';
      var scripts = document.getElementsByTagName('script');
      for (var s = scripts.length - 1; s >= 0; s -= 1) {
        var source = scripts[s] && scripts[s].src ? String(scripts[s].src) : '';
        var docsIndex = source.indexOf('/docs.js');
        if (docsIndex === -1) {
          docsIndex = source.indexOf('/js/documents/docs.js');
        }
        if (docsIndex !== -1) {
          scriptDirectory = source.slice(0, source.lastIndexOf('/') + 1);
          break;
        }
      }

      var candidates = [
        '/js/documents/docs-ai-response-modal.js',
        '/docs-ai-response-modal.js',
        'docs-ai-response-modal.js',
        './docs-ai-response-modal.js'
      ];
      if (scriptDirectory) {
        candidates.unshift(scriptDirectory + 'docs-ai-response-modal.js');
      }
      var index = 0;

      function loadNext() {
        if (window.openDocumentsAiResponseModal) {
          resolve(window.openDocumentsAiResponseModal);
          return;
        }
        if (index >= candidates.length) {
          aiResponseModalScriptPromise = null;
          reject(new Error('Не удалось загрузить модуль ИИ-ответа. Проверьте путь к docs-ai-response-modal.js.'));
          return;
        }
        var src = candidates[index] + '?v=' + encodeURIComponent(version);
        index += 1;
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function() {
          if (window.openDocumentsAiResponseModal) {
            resolve(window.openDocumentsAiResponseModal);
            return;
          }
          loadNext();
        };
        script.onerror = function() {
          loadNext();
        };
        document.head.appendChild(script);
      }

      loadNext();
    });
    return aiResponseModalScriptPromise;
  }

  function openAiResponseModal(config) {
    var options = config && typeof config === 'object' ? config : {};
    ensureAiResponseModalScript()
      .then(function(openModal) {
        openModal(options);
      })
      .catch(function(error) {
        showMessage('error', error && error.message ? error.message : 'Не удалось открыть окно ИИ-ответа.');
      });
  }

  function collectBriefSentences(text, limit) {
    var safeLimit = typeof limit === 'number' && limit > 0 ? limit : 8;
    return String(text || '')
      .split(/[\n.;!?]+/g)
      .map(function(part) { return String(part || '').trim(); })
      .filter(function(part) { return part.length > 5; })
      .slice(0, safeLimit);
  }

  function buildBriefSummaryText(text) {
    var lines = collectBriefSentences(text, 8);
    var reason = lines.slice(0, 2).join('. ');
    var actions = lines.slice(2, 5);
    var requirements = lines.slice(5, 8);
    return [
      'Причина:',
      reason || 'Нужны дополнительные сведения по документу и стоимости изменений.',
      '',
      'Действия:',
      actions.length ? actions.map(function(item) { return '• ' + item; }).join('\n') : '• Получить недостающие сведения по стоимости.\n• Согласовать дальнейшие действия.',
      '',
      'Требования из файла:',
      requirements.length ? requirements.map(function(item) { return '• ' + item; }).join('\n') : '• Проверить все изменения работ, суммы и основания.'
    ].join('\n');
  }

  function buildAiBriefSummaryText(payload) {
    var data = payload && typeof payload === 'object' ? payload : {};
    var analysis = data.analysis ? String(data.analysis).trim() : '';
    var decision = data.decisionBlock && typeof data.decisionBlock === 'object' ? data.decisionBlock : {};
    var risks = Array.isArray(decision.risks) ? decision.risks : [];
    var actions = Array.isArray(decision.required_actions) ? decision.required_actions : [];
    var requirements = Array.isArray(decision.requirements) ? decision.requirements : [];
    var participants = '';
    var cleanedActions = [];
    var cleanedRequirements = [];

    function normalizeSentence(text) {
      var value = String(text || '')
        .replace(/-\s*\n\s*/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.:;,\s]+$/g, '')
        .trim();
      if (!value) {
        return '';
      }
      if (value.length < 12) {
        return '';
      }
      if (/^[\d.\-–—\s]+$/.test(value)) {
        return '';
      }
      if (/^(прошу вас|прошу|1|2|3)\b/i.test(value)) {
        return '';
      }
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function sanitizeList(items, maxItems) {
      var seen = {};
      return (Array.isArray(items) ? items : [])
        .map(normalizeSentence)
        .filter(function(item) {
          var key = item.toLowerCase();
          if (!item || seen[key]) {
            return false;
          }
          seen[key] = true;
          return true;
        })
        .slice(0, maxItems);
    }

    risks.some(function(item) {
      var line = String(item || '').trim();
      if (!line) {
        return false;
      }
      if (/^отправитель\s*:/i.test(line) || /^кто\s+прислал\s*:/i.test(line)) {
        participants = line;
        return true;
      }
      return false;
    });
    analysis = normalizeSentence(analysis) || 'Не удалось определить суть документа.';
    cleanedActions = sanitizeList(actions, 4);
    cleanedRequirements = sanitizeList(requirements, 4);

    return [
      '✨ Кратко по документу',
      '',
      '📄 О чем файл',
      analysis,
      '',
      '👤 Кто прислал / кому',
      participants || 'Не удалось точно определить отправителя и получателя.',
      '',
      '🔎 Важные детали',
      cleanedActions.length ? cleanedActions.map(function(item) { return '• ' + item; }).join('\n') : '• Важные детали не найдены.',
      '',
      '✅ Требования',
      cleanedRequirements.length ? cleanedRequirements.map(function(item) { return '• ' + item; }).join('\n') : '• Явные требования не выделены.'
    ].join('\n');
  }

  function requestOcrTextForSource(source, apiUrl) {
    var endpoint = apiUrl || (window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php');
    var formData = new FormData();
    formData.append('action', 'ocr_extract');
    formData.append('language', 'rus');
    if (source && source.fileObject) {
      formData.append('file', source.fileObject);
    } else if (source && source.url) {
      formData.append('file_url', source.url);
    } else {
      return Promise.reject(new Error('Источник для OCR не найден.'));
    }
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    }).then(function(response) {
      return response.json().catch(function() { return null; }).then(function(payload) {
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка OCR (' + response.status + ')'));
        }
        var extractedText = payload && payload.text ? String(payload.text).trim() : '';
        if (!extractedText) {
          throw new Error('OCR не вернул текст.');
        }
        return extractedText;
      });
    });
  }

  function requestAiBriefSummaryForText(source, sourceText, apiUrl) {
    var endpoint = apiUrl || (window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php');
    var briefText = String(sourceText || '').trim();
    if (!briefText) {
      return Promise.reject(new Error('Текст для анализа пустой.'));
    }
    var sourceLabel = source && source.label ? String(source.label) : 'Файл';
    var context = {
      extractedTexts: [
        {
          name: sourceLabel,
          type: 'text/plain',
          text: briefText
        }
      ],
      aiBehavior: 'Режим "Кратко ИИ". Поле analysis: 2-3 предложения о сути документа. В risks первой строкой верни "Отправитель: ...; Получатель: ...". Если данных нет, пиши "Отправитель: не определён; Получатель: не определён". В required_actions перечисли 3-5 ключевых фактов/деталей. В requirements перечисли ключевые требования.'
    };
    var formData = new FormData();
    formData.append('action', 'ai_response_analyze');
    formData.append('documentTitle', sourceLabel);
    formData.append('prompt', 'Кратко проанализируй OCR-текст и выдели важные детали, отправителя и получателя.');
    formData.append('responseStyle', 'concise');
    formData.append('context', JSON.stringify(context));
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    }).then(function(response) {
      return response.json().catch(function() { return null; }).then(function(payload) {
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && payload.error ? payload.error : ('Ошибка анализа ИИ (' + response.status + ')'));
        }
        return payload;
      });
    });
  }

  function openAiBriefSummaryModal(config) {
    ensureResponsesStyle();
    var options = config && typeof config === 'object' ? config : {};
    var documentData = options.documentData && typeof options.documentData === 'object' ? options.documentData : {};
    var linkedFiles = Array.isArray(options.linkedFiles) ? options.linkedFiles : [];
    var pendingFiles = Array.isArray(options.pendingFiles) ? options.pendingFiles : [];
    var showStatusMessage = typeof options.showMessage === 'function' ? options.showMessage : function() {};
    var modal = createElement('div', 'documents-brief-modal');
    var panel = createElement('div', 'documents-brief-panel');
    var header = createElement('div', 'documents-brief-header');
    var titleWrap = createElement('div', '');
    titleWrap.appendChild(createElement('div', 'documents-brief-title', 'Кратко ИИ'));
    titleWrap.appendChild(createElement('div', 'documents-brief-subtitle', 'Выберите источник: текст задачи или файл'));
    var closeButton = createElement('button', 'documents-button documents-button--secondary', 'Закрыть');
    var body = createElement('div', 'documents-brief-body');
    var list = createElement('div', 'documents-brief-list');
    var preview = createElement('pre', 'documents-brief-preview', 'Нажмите на источник слева, чтобы получить краткое резюме.');

    var baseContextText = [
      documentData.description,
      documentData.summary,
      documentData.instruction,
      documentData.resolution
    ].map(function(item) {
      return String(item || '').trim();
    }).filter(Boolean).join('\n');

    var sources = [];
    if (baseContextText) {
      sources.push({
        id: 'task_context',
        label: 'Текст задачи',
        text: baseContextText
      });
    }

    linkedFiles.forEach(function(file, index) {
      sources.push({
        id: 'linked_' + index,
        label: file && file.name ? String(file.name) : ('Файл ' + (index + 1)),
        text: '',
        url: file && file.url ? String(file.url) : '',
        extracted: false
      });
    });

    pendingFiles.forEach(function(file, index) {
      sources.push({
        id: 'pending_' + index,
        label: file && file.name ? String(file.name) : ('Новый файл ' + (index + 1)),
        text: '',
        fileObject: file,
        extracted: false
      });
    });

    function setPreviewLoading(loading, label) {
      preview.classList.toggle('is-loading', Boolean(loading));
      if (loading) {
        preview.textContent = '⏳ Обрабатываю: ' + label;
      }
    }

    function makeActive(button) {
      Array.from(list.querySelectorAll('.documents-brief-item')).forEach(function(item) {
        item.classList.remove('is-active');
      });
      button.classList.add('is-active');
    }

    function resolveSourceText(source) {
      if (source.text && String(source.text).trim()) {
        return Promise.resolve(String(source.text).trim());
      }
      if (!source || (!source.fileObject && !source.url)) {
        return Promise.reject(new Error('Для этого источника нет текста. Добавьте файл или заполните описание задачи.'));
      }
      return requestOcrTextForSource(source, options.apiUrl).then(function(ocrText) {
        source.text = ocrText;
        source.extracted = true;
        return ocrText;
      });
    }

    function addSourceButton(source) {
      var button = createElement('button', 'documents-brief-item');
      var nameNode = createElement('span', 'documents-brief-item-name', source.label);
      var metaLabel = source.id === 'task_context'
        ? 'Текст карточки задачи'
        : (source.fileObject ? 'Новый файл (локально)' : 'Файл из документа');
      var metaNode = createElement('span', 'documents-brief-item-meta', metaLabel);
      button.appendChild(nameNode);
      button.appendChild(metaNode);
      button.title = source.label;
      button.type = 'button';
      button.addEventListener('click', function() {
        makeActive(button);
        setPreviewLoading(true, source.label);
        resolveSourceText(source)
          .then(function(sourceText) {
            var aiStartedAt = Date.now();
            var estimatedSeconds = 35;
            var timerId = null;
            function updateAiProgress() {
              var elapsed = Math.floor((Date.now() - aiStartedAt) / 1000);
              var remain = Math.max(0, estimatedSeconds - elapsed);
              preview.textContent = '⏳ OCR завершён. ИИ анализирует документ...\nОсталось примерно: ' + remain + ' сек.';
            }
            updateAiProgress();
            timerId = window.setInterval(updateAiProgress, 1000);
            return requestAiBriefSummaryForText(source, sourceText, options.apiUrl)
              .then(function(aiPayload) {
                if (timerId) {
                  window.clearInterval(timerId);
                }
                preview.classList.remove('is-loading');
                preview.textContent = buildAiBriefSummaryText(aiPayload);
              })
              .catch(function(error) {
                if (timerId) {
                  window.clearInterval(timerId);
                }
                var elapsed = Math.floor((Date.now() - aiStartedAt) / 1000);
                var retryAfter = Math.max(10, 45 - elapsed);
                var waitHint = 'ИИ временно недоступен. Попробуйте снова через ~' + retryAfter + ' сек.';
                preview.classList.remove('is-loading');
                preview.textContent = waitHint + '\n\n' + buildBriefSummaryText(sourceText) + '\n\n[Fallback] ' + (error && error.message ? error.message : 'неизвестная ошибка');
                showStatusMessage('warning', 'ИИ недоступен для "' + source.label + '". ' + waitHint + ' Пока показан краткий fallback.');
              });
          })
          .catch(function(error) {
            preview.classList.remove('is-loading');
            preview.textContent = 'Не удалось получить summary: ' + (error && error.message ? error.message : 'неизвестная ошибка');
            showStatusMessage('warning', 'Не удалось обработать "' + source.label + '".');
          });
      });
      list.appendChild(button);
    }

    sources.forEach(addSourceButton);

    if (!sources.length) {
      list.appendChild(createElement('div', 'documents-responses-empty', 'Нет файлов для анализа.'));
    }

    function closeBriefModal() {
      closeModal(modal);
    }

    closeButton.type = 'button';
    closeButton.addEventListener('click', closeBriefModal);
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeBriefModal();
      }
    });

    header.appendChild(titleWrap);
    header.appendChild(closeButton);
    body.appendChild(list);
    body.appendChild(preview);
    panel.appendChild(header);
    panel.appendChild(body);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  function ensureSearchStyles() {
    if (document.getElementById('documents-search-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'documents-search-style';
    style.textContent = '' +
      '.documents-table__head th{' +
      'position:sticky;' +
      'top:var(--documents-sticky-top,0px);' +
      'z-index:6;' +
      '}' +
      '.documents-table__header-row th{' +
      'z-index:5;' +
      '}' +
      '.documents-table__header-cell{' +
      'position:relative;' +
      'vertical-align:middle;' +
      '}' +
      '.documents-header-content{' +
      'display:flex;' +
      'align-items:center;' +
      'width:100%;' +
      'gap:6px;' +
      'flex-wrap:wrap;' +
      '}' +
      '.documents-table__header-cell .documents-header-label{' +
      'display:block;' +
      'font-weight:600;' +
      'color:#0f172a;' +
      'line-height:1.35;' +
      'word-break:break-word;' +
      'flex:1 1 auto;' +
      'min-width:0;' +
      'transition:color 0.2s ease;' +
      '}' +
      '.documents-table__header-cell--searchable{' +
      'cursor:pointer;' +
      'user-select:none;' +
      'border-radius:0;' +
      'transition:background-color 0.2s ease;' +
      '}' +
      '.documents-table__header-cell--searchable:hover{' +
      'background:rgba(37,99,235,0.08);' +
      '}' +
      '.documents-table__header-cell--searchable:focus,' +
      '.documents-table__header-cell--searchable:focus-visible{' +
      'outline:2px solid rgba(37,99,235,0.35);' +
      'outline-offset:2px;' +
      '}' +
      '.documents-table__header-cell--searchable:focus:not(:focus-visible){' +
      'outline:none;' +
      '}' +
      '.documents-table__header-cell--active{' +
      'background:rgba(37,99,235,0.12);' +
      '}' +
      '.documents-table__header-cell--active .documents-header-label{' +
      'color:#1d4ed8;' +
      '}' +
      '.documents-search-popover{' +
      'position:fixed;' +
      'z-index:2500;' +
      'min-width:260px;' +
      'max-width:340px;' +
      'background:#ffffff;' +
      'border-radius:16px;' +
      'box-shadow:0 22px 48px rgba(15,23,42,0.18);' +
      'border:1px solid rgba(148,163,184,0.28);' +
      'padding:0;' +
      'display:none;' +
      '}' +
      '.documents-search-popover--visible{' +
      'display:block;' +
      '}' +
      '.documents-search-popover__content{' +
      'padding:16px;' +
      'display:flex;' +
      'flex-direction:column;' +
      'gap:12px;' +
      '}' +
      '.documents-search-popover__label{' +
      'font-weight:600;' +
      'font-size:14px;' +
      'color:#0f172a;' +
      '}' +
      '.documents-search-popover__input{' +
      'width:100%;' +
      'padding:10px 12px;' +
      'border-radius:12px;' +
      'border:1px solid rgba(148,163,184,0.45);' +
      'background:rgba(248,250,252,0.85);' +
      'font-size:14px;' +
      'transition:border-color 0.2s ease, box-shadow 0.2s ease;' +
      '}' +
      '.documents-search-popover__input:focus{' +
      'outline:none;' +
      'border-color:#2563eb;' +
      'box-shadow:0 0 0 3px rgba(37,99,235,0.2);' +
      'background:#ffffff;' +
      '}' +
      '.documents-search-popover__actions{' +
      'display:flex;' +
      'gap:10px;' +
      '}' +
      '.documents-search-popover__button{' +
      'flex:1 1 auto;' +
      'padding:10px 12px;' +
      'border-radius:12px;' +
      'font-weight:600;' +
      'font-size:14px;' +
      'cursor:pointer;' +
      'border:none;' +
      'transition:transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;' +
      '}' +
      '.documents-search-popover__button--apply{' +
      'background:linear-gradient(120deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9));' +
      'color:#ffffff;' +
      'box-shadow:0 14px 28px rgba(37,99,235,0.28);' +
      '}' +
      '.documents-search-popover__button--reset{' +
      'background:rgba(148,163,184,0.18);' +
      'color:#1e293b;' +
      '}' +
      '.documents-search-popover__button:hover{' +
      'transform:translateY(-1px);' +
      '}' +
      '.documents-filter-bar{' +
      'display:flex;' +
      'flex-wrap:wrap;' +
      'gap:10px;' +
      'align-items:center;' +
      'margin:18px 0 12px;' +
      'padding:12px 16px;' +
      'background:rgba(37,99,235,0.08);' +
      'border-radius:16px;' +
      'border:1px solid rgba(59,130,246,0.22);' +
      'color:#0f172a;' +
      '}' +
      '.documents-filter-bar--hidden{' +
      'display:none;' +
      '}' +
      '.documents-filter-bar__title{' +
      'font-weight:600;' +
      'font-size:13px;' +
      '}' +
      '.documents-filter-chip{' +
      'display:flex;' +
      'align-items:center;' +
      'gap:6px;' +
      'padding:6px 14px;' +
      'background:#ffffff;' +
      'border-radius:999px;' +
      'border:1px solid rgba(59,130,246,0.35);' +
      'box-shadow:0 10px 20px rgba(37,99,235,0.18);' +
      'font-size:13px;' +
      '}' +
      '.documents-filter-chip__value{' +
      'font-weight:600;' +
      '}' +
      '.documents-filter-chip__remove{' +
      'border:none;' +
      'background:transparent;' +
      'color:#1d4ed8;' +
      'cursor:pointer;' +
      'font-size:16px;' +
      'line-height:1;' +
      'padding:0 4px;' +
      '}' +
      '.documents-filter-chip__remove:hover{' +
      'color:#1e3a8a;' +
      '}' +
      '.documents-filter-chip--responsible{' +
      'border-color:rgba(16,185,129,0.42);' +
      'box-shadow:0 10px 22px rgba(16,185,129,0.22);' +
      '}' +
      '.documents-filter-chip--responsible .documents-filter-chip__value{' +
      'color:#047857;' +
      '}' +
      '.documents-filter-bar__clear{' +
      'border:none;' +
      'border-radius:999px;' +
      'padding:8px 18px;' +
      'font-weight:600;' +
      'font-size:13px;' +
      'cursor:pointer;' +
      'margin-left:12px;' +
      'background:linear-gradient(120deg, rgba(59,130,246,0.95), rgba(14,165,233,0.9));' +
      'color:#ffffff;' +
      'box-shadow:0 16px 32px rgba(37,99,235,0.28);' +
      '}' +
      '.documents-filter-bar__clear:hover{' +
      'transform:translateY(-1px);' +
      '}' +
      '.documents-cell--highlight{' +
      'background:rgba(59,130,246,0.12);' +
      'box-shadow:inset 0 0 0 2px rgba(37,99,235,0.25);' +
      '}' +
      '.documents-panel__admin--responsible{' +
      'position:relative;' +
      'margin-right:12px;' +
      'background:linear-gradient(120deg, rgba(16,185,129,0.95), rgba(34,197,94,0.88));' +
      'box-shadow:0 14px 28px rgba(16,185,129,0.28);' +
      '}' +
      '.documents-panel__admin--toggled{' +
      'transform:translateY(-1px);' +
      'box-shadow:0 18px 36px rgba(16,185,129,0.35);' +
      '}' +
      '.documents-panel__admin--toggled::after{' +
      'content:"";' +
      'position:absolute;' +
      'inset:-3px;' +
      'border-radius:inherit;' +
      'border:1px solid rgba(16,185,129,0.45);' +
      'opacity:0.7;' +
      'pointer-events:none;' +
      '}' +
      '.documents-panel__admin--responsible:disabled{' +
      'opacity:0.55;' +
      'cursor:default;' +
      'box-shadow:none;' +
      '}' +
      '.documents-search-popover__button--reset:hover{' +
      'background:rgba(148,163,184,0.28);' +
      '}' +
      '.documents-filter-bar__hint{' +
      'margin-left:auto;' +
      'font-size:12px;' +
      'opacity:0.75;' +
      'font-weight:500;' +
      '}' +
      '';
    document.head.appendChild(style);
  }

  function updateStickyHeaderOffsets() {
    if (!elements.groupRow || !elements.headerRow) {
      return;
    }
    var groupHeight = elements.groupRow.offsetHeight || 0;
    elements.groupRow.style.setProperty('--documents-sticky-top', '0px');
    elements.headerRow.style.setProperty('--documents-sticky-top', groupHeight + 'px');
  }

  function isPopoverVisible() {
    return !!(elements.searchPopover && elements.searchPopover.classList.contains('documents-search-popover--visible'));
  }

  function ensureSearchPopover(container) {
    ensureSearchStyles();
    if (elements.searchPopover || !container) {
      return;
    }
    var popover = createElement('div', 'documents-search-popover documents-search-popover--hidden');
    var content = createElement('div', 'documents-search-popover__content');
    var label = createElement('div', 'documents-search-popover__label', 'Поиск');
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'documents-search-popover__input';
    input.placeholder = 'Введите запрос';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    var actions = createElement('div', 'documents-search-popover__actions');
    var applyButton = createElement('button', 'documents-search-popover__button documents-search-popover__button--apply', 'Искать');
    applyButton.type = 'button';
    var resetButton = createElement('button', 'documents-search-popover__button documents-search-popover__button--reset', 'Сброс');
    resetButton.type = 'button';

    actions.appendChild(applyButton);
    actions.appendChild(resetButton);

    content.appendChild(label);
    content.appendChild(input);
    content.appendChild(actions);
    popover.appendChild(content);

    container.appendChild(popover);

    elements.searchPopover = popover;
    elements.searchLabel = label;
    elements.searchInput = input;
    elements.searchApply = applyButton;
    elements.searchReset = resetButton;

    popover.setAttribute('aria-hidden', 'true');
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');

    applyButton.addEventListener('click', function() {
      applyPopoverFilter();
    });
    resetButton.addEventListener('click', function() {
      resetPopoverFilter();
    });
    input.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyPopoverFilter();
      } else if (event.key === 'Escape') {
        handleSearchEscape(event);
      }
    });

    popover.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        handleSearchEscape(event);
      }
    });
  }

  function bindSearchEvents() {
    if (searchEventsBound) {
      return;
    }
    document.addEventListener('mousedown', handleDocumentClick, true);
    window.addEventListener('resize', handleWindowPositionChange);
    window.addEventListener('scroll', handleWindowPositionChange, true);
    document.addEventListener('keydown', handleGlobalKeydown);
    searchEventsBound = true;
  }

  function positionSearchPopover(anchor) {
    if (!elements.searchPopover || !anchor) {
      return;
    }
    var rect = anchor.getBoundingClientRect();
    var popover = elements.searchPopover;
    var width = popover.offsetWidth || 300;
    var height = popover.offsetHeight || 160;
    var top = rect.bottom + 8;
    var left = rect.left + rect.width / 2 - width / 2;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;

    if (left + width > viewportWidth - 16) {
      left = viewportWidth - width - 16;
    }
    if (left < 16) {
      left = 16;
    }
    if (top + height > viewportHeight - 16) {
      top = rect.top - height - 8;
    }
    if (top < 16) {
      top = 16;
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function openSearchPopover(columnKey, button) {
    if (!columnKey || !button) {
      return;
    }
    ensureSearchPopover(document.body);
    bindSearchEvents();

    state.activeSearchColumn = columnKey;
    state.activeSearchButton = button;

    var popover = elements.searchPopover;
    var definition = getColumnDefinition(columnKey);
    if (popover) {
      popover.dataset.columnKey = columnKey;
      popover.classList.remove('documents-search-popover--hidden');
      popover.classList.add('documents-search-popover--visible');
      popover.setAttribute('aria-hidden', 'false');
    }
    if (elements.searchLabel) {
      elements.searchLabel.textContent = definition ? 'Поиск: ' + definition.label : 'Поиск';
    }
    if (elements.searchInput) {
      elements.searchInput.placeholder = definition && definition.searchHint
        ? definition.searchHint
        : 'Введите запрос';
      elements.searchInput.value = state.filters[columnKey] || '';
      window.setTimeout(function() {
        if (elements.searchInput) {
          elements.searchInput.focus({ preventScroll: true });
          elements.searchInput.select();
        }
      }, 0);
    }

    if (popover) {
      positionSearchPopover(button);
    }
    updateSearchButtonStates();
  }

  function closeSearchPopover() {
    if (!elements.searchPopover) {
      state.activeSearchColumn = '';
      state.activeSearchButton = null;
      updateSearchButtonStates();
      return;
    }
    elements.searchPopover.classList.remove('documents-search-popover--visible');
    elements.searchPopover.classList.add('documents-search-popover--hidden');
    elements.searchPopover.setAttribute('aria-hidden', 'true');
    elements.searchPopover.dataset.columnKey = '';
    state.activeSearchColumn = '';
    state.activeSearchButton = null;
    updateSearchButtonStates();
  }

  function handleDocumentClick(event) {
    if (!isPopoverVisible()) {
      return;
    }
    if (elements.searchPopover && elements.searchPopover.contains(event.target)) {
      return;
    }
    if (state.activeSearchButton && state.activeSearchButton.contains(event.target)) {
      return;
    }
    closeSearchPopover();
  }

  function handleWindowPositionChange() {
    if (!isPopoverVisible() || !state.activeSearchButton) {
      return;
    }
    positionSearchPopover(state.activeSearchButton);
  }

  function applyPopoverFilter() {
    if (!elements.searchPopover) {
      return;
    }
    var columnKey = elements.searchPopover.dataset.columnKey || state.activeSearchColumn;
    if (!columnKey) {
      closeSearchPopover();
      return;
    }
    var value = elements.searchInput ? elements.searchInput.value : '';
    applyFilter(columnKey, value);
    closeSearchPopover();
  }

  function resetPopoverFilter() {
    if (!elements.searchPopover) {
      return;
    }
    var columnKey = elements.searchPopover.dataset.columnKey || state.activeSearchColumn;
    if (columnKey) {
      applyFilter(columnKey, '');
    }
    closeSearchPopover();
  }

  function handleSearchEscape(event) {
    if (!event || event.key !== 'Escape') {
      return;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    } else if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    resetPopoverFilter();
  }

  function normalizeValueForMatch(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var string = String(value);
    if (!string) {
      return '';
    }
    if (string === '—') {
      return '';
    }
    return string.replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
  }

  function valueMatchesQuery(value, query) {
    var normalizedValue = normalizeValueForMatch(value);
    var normalizedQuery = normalizeValueForMatch(query);
    if (!normalizedQuery) {
      return true;
    }
    var parts = normalizedQuery.split(' ');
    for (var i = 0; i < parts.length; i += 1) {
      if (!parts[i]) {
        continue;
      }
      if (normalizedValue.indexOf(parts[i]) === -1) {
        return false;
      }
    }
    return true;
  }

  function computeFilterValues(doc, originalIndex) {
    var values = {
      entryNumber: '',
      registryNumber: '',
      registrationDate: '',
      direction: '',
      correspondent: '',
      documentNumber: '',
      documentDate: '',
      executor: '',
      director: '',
      assignee: '',
      subordinates: '',
      summary: '',
      resolution: '',
      dueDate: '',
      status: '',
      instruction: '',
      __hasAssignee: false
    };
    if (!doc) {
      return values;
    }
    var index = typeof originalIndex === 'number' ? originalIndex : 0;
    values.entryNumber = doc.entryNumber !== undefined && doc.entryNumber !== null
      ? String(doc.entryNumber)
      : String(index + 1);
    values.registryNumber = doc.registryNumber ? String(doc.registryNumber) : '';
    var registrationFormatted = formatDate(doc.registrationDate);
    values.registrationDate = registrationFormatted === '—' ? '' : registrationFormatted;
    values.direction = doc.direction ? String(doc.direction) : '';
    values.correspondent = doc.correspondent ? String(doc.correspondent) : '';
    values.documentNumber = doc.documentNumber ? String(doc.documentNumber) : '';
    var documentFormatted = formatDate(doc.documentDate);
    values.documentDate = documentFormatted === '—' ? '' : documentFormatted;
    values.executor = doc.executor ? String(doc.executor) : '';
    var summary = doc.summary ? String(doc.summary) : '';
    values.summary = summary;
    var resolution = doc.resolution ? String(doc.resolution) : '';
    values.resolution = resolution;
    var dueFormatted = formatDate(doc.dueDate);
    values.dueDate = dueFormatted === '—' ? '' : dueFormatted;
    values.status = resolveCurrentUserStatus(doc) || (doc.status ? String(doc.status) : '');
    values.instruction = doc.instruction ? String(doc.instruction) : '';

    var instructionAssignments = buildInstructionAssignments(doc);
    if (instructionAssignments.length) {
      var instructionParts = [];
      if (values.instruction) {
        instructionParts.push(values.instruction);
      }
      instructionAssignments.forEach(function(entry) {
        if (!entry) {
          return;
        }
        var formatted = entry.formatted || formatInstructionAssignment(entry);
        if (formatted) {
          instructionParts.push(formatted);
        }
      });
      if (instructionParts.length) {
        values.instruction = instructionParts.join(' ').trim();
      }
    }

    var dueAssignments = buildDueDateAssignments(doc);
    if (dueAssignments.length) {
      var dueParts = [];
      dueAssignments.forEach(function(entry) {
        if (!entry) {
          return;
        }
        var dueText = formatDueDateValue(entry.dueDate);
        var label = entry.label ? String(entry.label).trim() : '';
        if (label) {
          dueParts.push(label + ' ' + dueText);
        } else {
          dueParts.push(dueText);
        }
      });
      if (dueParts.length) {
        values.dueDate = dueParts.join(' ').trim();
      }
    }

    var directorEntry = resolveDirectorEntry(doc);
    if (directorEntry) {
      var directorTokens = [];
      if (directorEntry.name) {
        directorTokens.push(String(directorEntry.name));
      }
      if (directorEntry.responsible) {
        directorTokens.push(String(directorEntry.responsible));
      }
      if (directorEntry.id) {
        directorTokens.push('ID:' + String(directorEntry.id));
      }
      if (directorEntry.department) {
        directorTokens.push(String(directorEntry.department));
      }
      if (directorEntry.telegram) {
        directorTokens.push('tg ' + String(directorEntry.telegram));
      }
      if (directorEntry.chatId) {
        directorTokens.push('CHAT:' + String(directorEntry.chatId));
      }
      if (directorEntry.login) {
        directorTokens.push('LOGIN:' + String(directorEntry.login));
      }
      if (directorEntry.email) {
        directorTokens.push(String(directorEntry.email));
      }
      if (directorEntry.note) {
        directorTokens.push(String(directorEntry.note));
      }
      values.director = directorTokens.join(' ').trim();
    }

    var allAssignees = resolveAssigneeList(doc);
    var assignees = allAssignees.filter(function(entry) {
      return !isSubordinateSnapshot(entry);
    });
    var viewState = collectAssigneeViewState(doc);
    values.__viewState = viewState;
    if (assignees.length) {
      var assigneeTokens = [];
      assignees.forEach(function(entry) {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        if (entry.name) {
          assigneeTokens.push(String(entry.name));
        } else if (entry.id) {
          assigneeTokens.push('Ответственный #' + String(entry.id));
        }
        if (entry.id) {
          assigneeTokens.push('ID:' + String(entry.id));
        }
        if (entry.department) {
          assigneeTokens.push(String(entry.department));
        }
        if (entry.telegram) {
          assigneeTokens.push('tg ' + String(entry.telegram));
        }
        if (entry.chatId) {
          assigneeTokens.push('CHAT:' + String(entry.chatId));
        }
        if (entry.email) {
          assigneeTokens.push(String(entry.email));
        }
        if (entry.login) {
          assigneeTokens.push('LOGIN:' + String(entry.login));
          assigneeTokens.push(String(entry.login));
        }
        if (entry.note) {
          assigneeTokens.push(String(entry.note));
        }
      });
      values.assignee = assigneeTokens.join(' ').trim();
      values.__hasAssignee = true;
    }

    var subordinateList = resolveSubordinateList(doc);
    if (subordinateList.length) {
      var subordinateTokens = [];
      subordinateList.forEach(function(entry) {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        if (entry.name) {
          subordinateTokens.push(String(entry.name));
        } else if (entry.id) {
          subordinateTokens.push('Подчинённый #' + String(entry.id));
        }
        if (entry.id) {
          subordinateTokens.push('ID:' + String(entry.id));
        }
        if (entry.department) {
          subordinateTokens.push(String(entry.department));
        }
        if (entry.telegram) {
          subordinateTokens.push('tg ' + String(entry.telegram));
        }
        if (entry.chatId) {
          subordinateTokens.push('CHAT:' + String(entry.chatId));
        }
        if (entry.email) {
          subordinateTokens.push(String(entry.email));
        }
        if (entry.login) {
          subordinateTokens.push('LOGIN:' + String(entry.login));
          subordinateTokens.push(String(entry.login));
        }
        if (entry.note) {
          subordinateTokens.push(String(entry.note));
        }
      });
      values.subordinates = subordinateTokens.join(' ').trim();
    }

    values.__unviewedResponsibleCount = viewState.unviewedResponsibles.length;
    values.__unviewedSubordinateCount = viewState.unviewedSubordinates.length;
    values.__hasUnviewed = isDocumentUnviewed(viewState);

    return values;
  }

  function matchesDocumentFilters(values) {
    if (!values) {
      return false;
    }
    for (var key in state.filters) {
      if (!Object.prototype.hasOwnProperty.call(state.filters, key)) {
        continue;
      }
      var query = state.filters[key];
      if (!query) {
        continue;
      }
      if (!valueMatchesQuery(values[key], query)) {
        return false;
      }
    }
    if (state.showUnassignedOnly && values.__hasAssignee) {
      return false;
    }
    if (state.showUnviewedOnly && !values.__hasUnviewed) {
      return false;
    }
    return true;
  }

  function hasActiveFilters() {
    for (var key in state.filters) {
      if (!Object.prototype.hasOwnProperty.call(state.filters, key)) {
        continue;
      }
      if (String(state.filters[key]).trim()) {
        return true;
      }
    }
    if (state.showUnviewedOnly) {
      return true;
    }
    return false;
  }

  function getColumnDefinition(columnKey) {
    return TABLE_COLUMN_MAP[columnKey] || null;
  }

  function applyFilter(columnKey, query) {
    if (!columnKey) {
      return;
    }
    var trimmed = typeof query === 'string' ? query.trim() : '';
    if (trimmed) {
      state.filters[columnKey] = trimmed;
      if (state.filterOrder.indexOf(columnKey) === -1) {
        state.filterOrder.push(columnKey);
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(state.filters, columnKey)) {
        delete state.filters[columnKey];
      }
      state.filterOrder = state.filterOrder.filter(function(key) {
        return key !== columnKey;
      });
    }
    updateSearchButtonStates();
    updateFilterBar();
    updateTable();
  }

  function removeFilter(columnKey) {
    if (!columnKey || !Object.prototype.hasOwnProperty.call(state.filters, columnKey)) {
      return;
    }
    delete state.filters[columnKey];
    state.filterOrder = state.filterOrder.filter(function(key) {
      return key !== columnKey;
    });
    if (state.activeSearchColumn === columnKey) {
      closeSearchPopover();
    }
    updateSearchButtonStates();
    updateFilterBar();
    updateTable();
  }

  function resetAllFilters() {
    if (!hasActiveFilters() && !state.showUnassignedOnly && !isPopoverVisible()) {
      return;
    }
    state.filters = {};
    state.filterOrder = [];
    state.showUnassignedOnly = false;
    state.showUnviewedOnly = false;
    closeSearchPopover();
    updateResponsibleButtonState();
    updateUnviewedButtonState();
    updateSearchButtonStates();
    updateFilterBar();
    updateTable();
  }

  function updateSearchButtonStates() {
    if (!elements.searchButtons) {
      return;
    }
    for (var key in elements.searchButtons) {
      if (!Object.prototype.hasOwnProperty.call(elements.searchButtons, key)) {
        continue;
      }
      var button = elements.searchButtons[key];
      if (!button) {
        continue;
      }
      var isCurrent = state.activeSearchColumn === key && isPopoverVisible();
      var hasFilter = !!(state.filters[key] && String(state.filters[key]).trim());
      if (isCurrent || hasFilter) {
        button.classList.add('documents-table__header-cell--active');
      } else {
        button.classList.remove('documents-table__header-cell--active');
      }
    }
    updateResponsibleButtonState();
    updateUnviewedButtonState();
  }

  function createFilterChip(columnKey, value) {
    var column = getColumnDefinition(columnKey);
    var chip = createElement('div', 'documents-filter-chip');
    var labelText = column ? column.label : columnKey;
    var label = createElement('span', 'documents-filter-chip__label', labelText + ':');
    var valueNode = createElement('span', 'documents-filter-chip__value', value);
    var removeButton = createElement('button', 'documents-filter-chip__remove', '×');
    removeButton.type = 'button';
    removeButton.title = 'Удалить фильтр «' + labelText + '»';
    removeButton.addEventListener('click', function() {
      removeFilter(columnKey);
    });
    chip.appendChild(label);
    chip.appendChild(valueNode);
    chip.appendChild(removeButton);
    return chip;
  }

  function createResponsibleChip() {
    var chip = createElement('div', 'documents-filter-chip documents-filter-chip--responsible');
    chip.appendChild(createElement('span', 'documents-filter-chip__label', 'Фильтр:'));
    chip.appendChild(createElement('span', 'documents-filter-chip__value', 'Без ответственных'));
    var removeButton = createElement('button', 'documents-filter-chip__remove', '×');
    removeButton.type = 'button';
    removeButton.title = 'Показать все документы';
    removeButton.addEventListener('click', function() {
      toggleResponsibleFilter(false);
    });
    chip.appendChild(removeButton);
    return chip;
  }

  function createUnviewedChip() {
    var chip = createElement('div', 'documents-filter-chip documents-filter-chip--unviewed');
    chip.appendChild(createElement('span', 'documents-filter-chip__label', 'Фильтр:'));
    chip.appendChild(createElement('span', 'documents-filter-chip__value', 'Не просмотрено'));
    var removeButton = createElement('button', 'documents-filter-chip__remove', '×');
    removeButton.type = 'button';
    removeButton.title = 'Показать все документы';
    removeButton.addEventListener('click', function() {
      toggleUnviewedFilter(false);
    });
    chip.appendChild(removeButton);
    return chip;
  }

  function updateFilterBar() {
    if (!elements.filterBar) {
      return;
    }
    var hasFilters = hasActiveFilters() || state.showUnassignedOnly || state.showUnviewedOnly;
    if (!hasFilters) {
      elements.filterBar.innerHTML = '';
      elements.filterBar.classList.add('documents-filter-bar--hidden');
      return;
    }

    elements.filterBar.classList.remove('documents-filter-bar--hidden');
    elements.filterBar.innerHTML = '';

    elements.filterBar.appendChild(createElement('span', 'documents-filter-bar__title', 'Активные фильтры:'));

    for (var i = 0; i < state.filterOrder.length; i += 1) {
      var key = state.filterOrder[i];
      if (!state.filters[key]) {
        continue;
      }
      elements.filterBar.appendChild(createFilterChip(key, state.filters[key]));
    }

    if (state.showUnassignedOnly) {
      elements.filterBar.appendChild(createResponsibleChip());
    }
    if (state.showUnviewedOnly) {
      elements.filterBar.appendChild(createUnviewedChip());
    }

    elements.filterBar.appendChild(createElement('span', 'documents-filter-bar__hint', 'Esc — сбросить поиск'));

    var clearButton = createElement('button', 'documents-filter-bar__clear', 'Сбросить все');
    clearButton.type = 'button';
    clearButton.addEventListener('click', function() {
      resetAllFilters();
    });
    elements.filterBar.appendChild(clearButton);
  }

  function updateResponsibleButtonState() {
    if (!elements.responsibleButton) {
      return;
    }
    if (state.showUnassignedOnly) {
      elements.responsibleButton.classList.add('documents-panel__admin--toggled');
      elements.responsibleButton.setAttribute('aria-pressed', 'true');
    } else {
      elements.responsibleButton.classList.remove('documents-panel__admin--toggled');
      elements.responsibleButton.setAttribute('aria-pressed', 'false');
    }
  }

  function updateUnviewedButtonState() {
    if (!elements.unviewedButton) {
      return;
    }
    var count = typeof state.unviewedCount === 'number' ? state.unviewedCount : 0;
    if (elements.unviewedCounter) {
      elements.unviewedCounter.textContent = String(count);
      elements.unviewedCounter.classList.toggle('documents-unviewed-button__counter--hidden', count === 0);
    }
    var disable = !state.organization || count === 0;
    elements.unviewedButton.disabled = disable;
    elements.unviewedButton.setAttribute('aria-disabled', disable ? 'true' : 'false');
    var toggled = state.showUnviewedOnly && !disable;
    elements.unviewedButton.classList.toggle('documents-panel__admin--toggled', toggled);
    elements.unviewedButton.setAttribute('aria-pressed', toggled ? 'true' : 'false');
    if (count > 0) {
      elements.unviewedButton.setAttribute('aria-label', 'Показать документы без просмотра (' + count + ')');
      elements.unviewedButton.title = 'Показать документы без просмотра (' + count + ')';
    } else {
      elements.unviewedButton.setAttribute('aria-label', 'Непросмотренные документы отсутствуют');
      elements.unviewedButton.title = 'Все документы просмотрены';
    }
  }

  function toggleResponsibleFilter(forceState) {
    if (elements.responsibleButton && elements.responsibleButton.disabled && typeof forceState !== 'boolean') {
      return;
    }
    if (typeof forceState === 'boolean') {
      state.showUnassignedOnly = forceState;
    } else {
      state.showUnassignedOnly = !state.showUnassignedOnly;
    }
    updateResponsibleButtonState();
    updateFilterBar();
    updateTable();
  }

  function toggleUnviewedFilter(forceState) {
    if (elements.unviewedButton && elements.unviewedButton.disabled && typeof forceState !== 'boolean') {
      return;
    }
    if (typeof forceState === 'boolean') {
      state.showUnviewedOnly = forceState;
    } else {
      state.showUnviewedOnly = !state.showUnviewedOnly;
    }
    updateUnviewedButtonState();
    updateFilterBar();
    updateTable();
  }

  function handleGlobalKeydown(event) {
    if (event.key !== 'Escape') {
      return;
    }
    if (isPopoverVisible()) {
      handleSearchEscape(event);
      return;
    }
    resetAllFilters();
  }

  function normalizeResponsibleId(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var string = String(value).trim();
    return string;
  }

  function normalizeCompositeKeyValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var string = String(value).trim().toLowerCase();
    if (!string) {
      return '';
    }
    if (string.indexOf('combo::') === 0) {
      string = string.slice(7);
    }
    return string.replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function normalizeAssigneeIdentifier(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var string = String(value).trim();
    if (!string) {
      return '';
    }
    if (string.charAt(0) === '@') {
      string = string.slice(1);
    }
    return string.toLowerCase();
  }

  function normalizeAssignmentName(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var string = String(value).trim().toLowerCase();
    if (!string) {
      return '';
    }
    return string.replace(/ё/g, 'е');
  }

  function buildCompositeResponsibleKey(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var number = normalizeResponsibleId(entry.number);
    var name = entry.responsible || entry.name || '';
    var trimmedName = name ? String(name).trim() : '';
    if (!number || !trimmedName) {
      return '';
    }
    return normalizeCompositeKeyValue(number + ' ' + trimmedName);
  }

  function buildAssignmentNumberKey(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var compositeKey = buildCompositeResponsibleKey(entry);
    if (compositeKey) {
      return 'combo::' + compositeKey;
    }
    var number = normalizeResponsibleId(entry.number);
    if (!number) {
      return '';
    }
    return 'number::' + number;
  }

  function getResponsibleId(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var candidates = [entry.id, entry.number, entry.telegram, entry.chatId, entry.email, entry.login, entry.responsible];
    for (var i = 0; i < candidates.length; i += 1) {
      var normalized = normalizeResponsibleId(candidates[i]);
      if (normalized) {
        return normalized;
      }
    }
    return '';
  }

  function buildResponsibleIdCandidates(entry) {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    var candidates = [entry.id, entry.number, entry.telegram, entry.chatId, entry.email, entry.login, entry.responsible];
    var result = [];
    var seen = Object.create(null);
    var compositeKey = buildCompositeResponsibleKey(entry);
    if (compositeKey) {
      result.push({
        raw: compositeKey,
        normalized: compositeKey
      });
      seen[compositeKey] = true;
    }
    for (var i = 0; i < candidates.length; i += 1) {
      var normalized = normalizeResponsibleId(candidates[i]);
      if (!normalized || seen[normalized]) {
        continue;
      }
      seen[normalized] = true;
      result.push({
        raw: String(candidates[i]).trim(),
        normalized: normalized
      });
    }
    return result;
  }

  function applyAdminSettings(settings) {
    var next = settings && typeof settings === 'object' ? settings : {};
    var responsibles = sortAdminEntriesByResponsible(Array.isArray(next.responsibles) ? next.responsibles.slice() : []);
    var block2 = sortAdminEntriesByResponsible(Array.isArray(next.block2) ? next.block2.slice() : []);
    var block3 = sortAdminEntriesByResponsible(Array.isArray(next.block3) ? next.block3.slice() : []);

    state.admin.settings = {
      responsibles: responsibles,
      block2: block2,
      block3: block3
    };
    state.admin.loaded = true;

    state.responsiblesIndex = Object.create(null);
    state.subordinatesIndex = Object.create(null);
    state.directorsIndex = Object.create(null);

    function registerDirectorKey(prefix, value, entry) {
      if (!state.directorsIndex || !prefix) {
        return;
      }
      var normalizedValue = value !== undefined && value !== null ? String(value).trim() : '';
      if (!normalizedValue) {
        return;
      }
      var key = prefix + normalizedValue;
      if (!Object.prototype.hasOwnProperty.call(state.directorsIndex, key)) {
        state.directorsIndex[key] = entry;
      }
    }

    function registerDirectorEntry(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var id = getResponsibleId(entry);
      var normalizedId = normalizeResponsibleId(id);
      if (normalizedId) {
        registerDirectorKey('id::', normalizedId, entry);
      }
      if (entry.responsible) {
        var normalizedName = normalizeUserIdentifier(entry.responsible);
        if (normalizedName) {
          registerDirectorKey('name::', normalizedName, entry);
        }
      }
      if (entry.login) {
        var normalizedLogin = normalizeUserIdentifier(entry.login);
        if (normalizedLogin) {
          registerDirectorKey('login::', normalizedLogin, entry);
        }
      }
      if (entry.email) {
        var normalizedEmail = normalizeUserIdentifier(entry.email);
        if (normalizedEmail) {
          registerDirectorKey('email::', normalizedEmail, entry);
        }
      }
      if (entry.telegram) {
        var normalizedTelegram = normalizeResponsibleId(entry.telegram);
        if (normalizedTelegram) {
          registerDirectorKey('id::', normalizedTelegram, entry);
          registerDirectorKey('telegram::', normalizedTelegram, entry);
        }
      }
      if (entry.chatId) {
        var normalizedChat = normalizeResponsibleId(entry.chatId);
        if (normalizedChat) {
          registerDirectorKey('id::', normalizedChat, entry);
          registerDirectorKey('chat::', normalizedChat, entry);
        }
      }
    }

    function registerResponsibleEntry(entry, targetIndex, preserveExisting) {
      if (!entry || typeof entry !== 'object' || !targetIndex) {
        return;
      }
      var shouldPreserve = Boolean(preserveExisting);
      function assign(key) {
        if (!key) {
          return;
        }
        var stringKey = String(key);
        if (stringKey === '') {
          return;
        }
        if (shouldPreserve && Object.prototype.hasOwnProperty.call(targetIndex, stringKey)) {
          return;
        }
        targetIndex[stringKey] = entry;
      }

      var compositeKey = buildCompositeResponsibleKey(entry);
      if (compositeKey) {
        assign('combo::' + compositeKey);
      }

      var id = getResponsibleId(entry);
      var normalizedId = normalizeResponsibleId(id);
      if (normalizedId) {
        assign(normalizedId);
        var numericId = Number(normalizedId);
        if (!Number.isNaN(numericId)) {
          var numericKey = normalizeResponsibleId(String(numericId));
          if (numericKey) {
            assign(numericKey);
          }
        }
      }
      if (entry.responsible) {
        assign('name::' + String(entry.responsible).toLowerCase());
      }
      if (entry.email) {
        assign('email::' + String(entry.email).toLowerCase());
      }
      if (entry.login) {
        assign('login::' + String(entry.login).toLowerCase());
      }
      if (entry.telegram) {
        var normalizedTelegram = normalizeResponsibleId(entry.telegram);
        if (normalizedTelegram) {
          assign('telegram::' + normalizedTelegram);
          assign(normalizedTelegram);
        }
      }
      if (entry.chatId) {
        var normalizedChat = normalizeResponsibleId(entry.chatId);
        if (normalizedChat) {
          assign('chat::' + normalizedChat);
          assign(normalizedChat);
        }
      }
    }

    responsibles.forEach(function(entry) {
      registerResponsibleEntry(entry, state.responsiblesIndex, false);
    });

    block3.forEach(function(entry) {
      if (entry && typeof entry === 'object') {
        if (!entry.role) {
          entry.role = 'subordinate';
        }
        registerResponsibleEntry(entry, state.responsiblesIndex, true);
        registerResponsibleEntry(entry, state.subordinatesIndex, false);
      }
    });

    block2.forEach(function(entry) {
      registerDirectorEntry(entry);
    });

    return state.admin.settings;
  }

  function findResponsibleById(id) {
    var normalized = normalizeResponsibleId(id);
    if (!normalized) {
      return null;
    }
    if (state.responsiblesIndex[normalized]) {
      return state.responsiblesIndex[normalized];
    }
    var compositeCandidate = normalizeCompositeKeyValue(id);
    if (compositeCandidate) {
      var compositeKey = 'combo::' + compositeCandidate;
      if (state.responsiblesIndex[compositeKey]) {
        return state.responsiblesIndex[compositeKey];
      }
    }
    var numeric = Number(normalized);
    if (!Number.isNaN(numeric)) {
      var numericKey = normalizeResponsibleId(String(numeric));
      if (numericKey && state.responsiblesIndex[numericKey]) {
        return state.responsiblesIndex[numericKey];
      }
    }
    var nameKey = 'name::' + normalized.toLowerCase();
    if (state.responsiblesIndex[nameKey]) {
      return state.responsiblesIndex[nameKey];
    }
    var emailKey = 'email::' + normalized.toLowerCase();
    if (state.responsiblesIndex[emailKey]) {
      return state.responsiblesIndex[emailKey];
    }
    var telegramKey = 'telegram::' + normalized;
    if (state.responsiblesIndex[telegramKey]) {
      return state.responsiblesIndex[telegramKey];
    }
    var chatKey = 'chat::' + normalized;
    if (state.responsiblesIndex[chatKey]) {
      return state.responsiblesIndex[chatKey];
    }
    var loginKey = 'login::' + normalized.toLowerCase();
    if (state.responsiblesIndex[loginKey]) {
      return state.responsiblesIndex[loginKey];
    }
    return null;
  }

  function findSubordinateById(id) {
    var normalized = normalizeResponsibleId(id);
    if (!normalized) {
      return null;
    }
    var index = state.subordinatesIndex || {};
    if (index[normalized]) {
      return index[normalized];
    }
    var compositeCandidate = normalizeCompositeKeyValue(id);
    if (compositeCandidate) {
      var compositeKey = 'combo::' + compositeCandidate;
      if (index[compositeKey]) {
        return index[compositeKey];
      }
    }
    var numeric = Number(normalized);
    if (!Number.isNaN(numeric)) {
      var numericKey = normalizeResponsibleId(String(numeric));
      if (numericKey && index[numericKey]) {
        return index[numericKey];
      }
    }
    var nameKey = 'name::' + normalized.toLowerCase();
    if (index[nameKey]) {
      return index[nameKey];
    }
    var emailKey = 'email::' + normalized.toLowerCase();
    if (index[emailKey]) {
      return index[emailKey];
    }
    var telegramKey = 'telegram::' + normalized;
    if (index[telegramKey]) {
      return index[telegramKey];
    }
    var chatKey = 'chat::' + normalized;
    if (index[chatKey]) {
      return index[chatKey];
    }
    var loginKey = 'login::' + normalized.toLowerCase();
    if (index[loginKey]) {
      return index[loginKey];
    }
    return null;
  }

  function buildAssigneeSnapshot(entry, fallbackLabel, fallbackId) {
    var snapshot = {};
    var idFromEntry = entry ? getResponsibleId(entry) : '';
    var resolvedId = normalizeResponsibleId(idFromEntry || fallbackId);
    if (resolvedId) {
      snapshot.id = resolvedId;
    }
    if (entry && typeof entry === 'object') {
      if (entry.responsible) {
        snapshot.name = entry.responsible;
      }
      if (entry.department) {
        snapshot.department = entry.department;
      }
      if (entry.telegram) {
        snapshot.telegram = entry.telegram;
      }
      if (entry.chatId) {
        snapshot.chatId = entry.chatId;
      }
      if (entry.login) {
        snapshot.login = entry.login;
      }
      if (entry.email) {
        snapshot.email = entry.email;
      }
      if (entry.note) {
        snapshot.note = entry.note;
      }
      if (entry.assignmentComment) {
        snapshot.assignmentComment = String(entry.assignmentComment);
      }
      if (entry.assignmentDueDate) {
        snapshot.assignmentDueDate = String(entry.assignmentDueDate);
      }
      if (entry.assignmentInstruction) {
        snapshot.assignmentInstruction = String(entry.assignmentInstruction);
      }
      if (entry.status) {
        snapshot.status = String(entry.status);
      }
      if (entry.role) {
        snapshot.role = String(entry.role).toLowerCase();
      }
      if (entry.assignedAt && !snapshot.assignedAt) {
        snapshot.assignedAt = entry.assignedAt;
      }
      if (entry.assignedBy && !snapshot.assignedBy) {
        snapshot.assignedBy = entry.assignedBy;
      }
    }
    if (!snapshot.name && fallbackLabel) {
      snapshot.name = fallbackLabel;
    }
    if (snapshot.status) {
      snapshot.status = String(snapshot.status).trim();
      if (!snapshot.status) {
        delete snapshot.status;
      }
    }
    return snapshot;
  }

  function fetchAdminSettings() {
    if (!state.organization) {
      return Promise.reject(new Error('Организация не определена.'));
    }
    if (state.admin.loadingPromise) {
      return state.admin.loadingPromise;
    }
    var request = fetch(buildApiUrl('get_admin_settings', { organization: state.organization }), {
      credentials: 'same-origin'
    })
      .then(handleResponse)
      .then(function(data) {
        var settings = data && data.settings ? data.settings : { responsibles: [], block2: [], block3: [] };
        applyAdminSettings(settings);
        return data;
      })
      .finally(function() {
        state.admin.loadingPromise = null;
      });

    state.admin.loadingPromise = request;
    return request;
  }

  function runWithResponsibles(callback, onError) {
    var promise = state.admin.loadingPromise;
    if (!promise && !state.admin.loaded) {
      promise = fetchAdminSettings();
    }
    if (promise) {
      promise
        .then(function() {
          callback();
        })
        .catch(function(error) {
          if (typeof onError === 'function') {
            onError(error);
          }
        });
      return;
    }
    callback();
  }

  function resolveAssignmentSourceTag(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var source = entry.assignmentSource ? String(entry.assignmentSource).toLowerCase() : '';
    if (source === 'responsible') {
      return '(о)';
    }
    if (source === 'subordinate') {
      return '(п)';
    }
    if (source === 'both') {
      return '(о/п)';
    }
    return '';
  }

  function buildResponsibleLabel(entry, options) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var config = options && typeof options === 'object' ? options : {};
    var includeRoleSuffix = !config.omitRoleSuffix;
    var includeSourceTag = Boolean(config.includeSourceTag);
    var name = entry.responsible ? String(entry.responsible).trim() : '';
    var meta = [];
    if (entry.department) {
      meta.push(String(entry.department).trim());
    }
    if (!name && entry.email) {
      name = String(entry.email).trim();
    }
    if (!name && entry.telegram) {
      name = String(entry.telegram).trim();
    }
    if (!name && entry.number) {
      name = 'Ответственный #' + String(entry.number).trim();
    }
    var sourceTag = includeSourceTag ? resolveAssignmentSourceTag(entry) : '';
    if (sourceTag) {
      name = name ? name + ' ' + sourceTag : sourceTag;
    }
    var label = meta.length ? name + ' (' + meta.join(', ') + ')' : name;
    var role = entry && entry.role ? String(entry.role).toLowerCase() : '';
    if (includeRoleSuffix && role === 'subordinate') {
      label = label ? label + ' — подчинённый' : 'Подчинённый';
    }
    return label;
  }

  function buildAssignmentDirectoryKeys(entry) {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    var keys = [];
    var seen = Object.create(null);

    function addKey(value, useAssigneeNormalizer) {
      if (value === null || value === undefined) {
        return;
      }
      var normalized = useAssigneeNormalizer
        ? normalizeAssigneeIdentifier(value)
        : normalizeResponsibleId(value);
      if (!normalized || seen[normalized]) {
        return;
      }
      seen[normalized] = true;
      keys.push(normalized);
    }

    addKey(entry.id, false);
    addKey(buildAssignmentNumberKey(entry), false);
    addKey(entry.telegram, true);
    addKey(entry.chatId, false);
    addKey(entry.email, true);
    addKey(entry.login, true);

    return keys;
  }

  function resolveAssignmentSortName(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var candidates = [
      entry.responsible,
      entry.name,
      entry.email,
      entry.telegram,
      entry.number
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] === null || candidates[i] === undefined) {
        continue;
      }
      var text = String(candidates[i]).trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  function mergeAssignmentSource(existing, incoming) {
    var existingValue = existing ? String(existing).toLowerCase() : '';
    var incomingValue = incoming ? String(incoming).toLowerCase() : '';
    if (!existingValue) {
      return incomingValue;
    }
    if (!incomingValue || existingValue === incomingValue) {
      return existingValue;
    }
    if (existingValue === 'both') {
      return existingValue;
    }
    return 'both';
  }

  function getAssignmentDirectoryEntries() {
    var responsibles = state.admin.settings && Array.isArray(state.admin.settings.responsibles)
      ? state.admin.settings.responsibles
      : [];
    var subordinates = state.admin.settings && Array.isArray(state.admin.settings.block3)
      ? state.admin.settings.block3
      : [];
    var result = [];
    var keyIndex = Object.create(null);

    function registerEntry(entry, source) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var keys = buildAssignmentDirectoryKeys(entry);
      var existingIndex = null;
      for (var i = 0; i < keys.length; i += 1) {
        if (keyIndex[keys[i]] !== undefined) {
          existingIndex = keyIndex[keys[i]];
          break;
        }
      }
      if (existingIndex !== null) {
        var existingEntry = result[existingIndex];
        existingEntry.assignmentSource = mergeAssignmentSource(existingEntry.assignmentSource, source);
        keys.forEach(function(key) {
          keyIndex[key] = existingIndex;
        });
        return;
      }
      var clone = {};
      for (var prop in entry) {
        if (Object.prototype.hasOwnProperty.call(entry, prop)) {
          clone[prop] = entry[prop];
        }
      }
      clone.assignmentSource = source;
      result.push(clone);
      var newIndex = result.length - 1;
      keys.forEach(function(key) {
        keyIndex[key] = newIndex;
      });
    }

    responsibles.forEach(function(entry) {
      registerEntry(entry, 'responsible');
    });
    subordinates.forEach(function(entry) {
      registerEntry(entry, 'subordinate');
    });

    result.sort(function(a, b) {
      var nameA = resolveAssignmentSortName(a);
      var nameB = resolveAssignmentSortName(b);
      return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
    });

    return result;
  }

  function fillResponsibleSelect(select, selectedId) {
    if (!select) {
      return;
    }
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }

    var emptyOption = createElement('option', '', 'Не назначен');
    emptyOption.value = '';
    select.appendChild(emptyOption);

    var responsibles = getAssignmentDirectoryEntries();
    var seen = Object.create(null);

    function appendOption(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var compositeKey = buildCompositeResponsibleKey(entry);
      var id = getResponsibleId(entry);
      if (!id) {
        return;
      }
      var normalizedId = normalizeResponsibleId(id);
      var listKey = compositeKey || normalizedId;
      if (listKey && seen[listKey]) {
        return;
      }
      if (listKey) {
        seen[listKey] = true;
      }
      var optionValue = compositeKey || id;
      var option = createElement('option', '', buildResponsibleLabel(entry, { omitRoleSuffix: true, includeSourceTag: true }) || id);
      option.value = optionValue;
      option.dataset.name = entry.responsible || '';
      if (entry.department) {
        option.dataset.department = entry.department;
      }
      if (entry.telegram) {
        option.dataset.telegram = entry.telegram;
      }
      if (entry.chatId) {
        option.dataset.chatId = entry.chatId;
      }
      if (entry.email) {
        option.dataset.email = entry.email;
      }
      if (entry.note) {
        option.dataset.note = entry.note;
      }
      option.dataset.role = 'responsible';
      var selectedComposite = normalizeCompositeKeyValue(selectedId);
      var matchById = selectedId && normalizeResponsibleId(selectedId) === normalizeResponsibleId(id);
      var matchByComposite = compositeKey && selectedComposite && selectedComposite === compositeKey;
      if (matchById || matchByComposite) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    responsibles.forEach(appendOption);
  }

  function fillSubordinateSelect(select, selectedId) {
    if (!select) {
      return;
    }
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }

    var emptyOption = createElement('option', '', 'Не назначен');
    emptyOption.value = '';
    select.appendChild(emptyOption);

    var subordinates = getAssignmentDirectoryEntries();
    var seen = Object.create(null);
    var selectedNormalized = normalizeResponsibleId(selectedId);
    var selectedComposite = normalizeCompositeKeyValue(selectedId);

    subordinates.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var candidates = buildResponsibleIdCandidates(entry);
      if (!candidates.length) {
        return;
      }
      var optionValue = '';
      var shouldSelect = false;

      if (selectedNormalized || selectedComposite) {
        for (var si = 0; si < candidates.length; si += 1) {
          if ((selectedNormalized && candidates[si].normalized === selectedNormalized)
            || (selectedComposite && candidates[si].normalized === selectedComposite)) {
            shouldSelect = true;
            if (!seen[candidates[si].normalized]) {
              optionValue = candidates[si].raw;
              seen[candidates[si].normalized] = true;
            }
            break;
          }
        }
      }

      if (!optionValue) {
        for (var ci = 0; ci < candidates.length; ci += 1) {
          if (!seen[candidates[ci].normalized]) {
            optionValue = candidates[ci].raw;
            seen[candidates[ci].normalized] = true;
            break;
          }
        }
      }

      if (!optionValue && candidates[0]) {
        optionValue = candidates[0].raw;
      }

      if (!optionValue) {
        return;
      }

      var option = createElement('option', '', buildResponsibleLabel(entry, { omitRoleSuffix: true, includeSourceTag: true }) || optionValue);
      option.value = optionValue;
      option.dataset.name = entry.responsible || '';
      if (entry.department) {
        option.dataset.department = entry.department;
      }
      if (entry.telegram) {
        option.dataset.telegram = entry.telegram;
      }
      if (entry.chatId) {
        option.dataset.chatId = entry.chatId;
      }
      if (entry.email) {
        option.dataset.email = entry.email;
      }
      if (entry.note) {
        option.dataset.note = entry.note;
      }
      option.dataset.role = 'subordinate';
      if (shouldSelect || (selectedId && normalizeResponsibleId(selectedId) === normalizeResponsibleId(optionValue))) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  function resolveTelegramIdFromOption(option) {
    if (!option || !option.dataset) {
      return '';
    }
    var candidate = option.dataset.telegram || option.dataset.chatId || '';
    return candidate ? String(candidate).trim() : '';
  }

  function hasTelegramIdForSelect(select) {
    if (!select || !select.value) {
      return true;
    }
    var selectedOption = select.options[select.selectedIndex];
    return Boolean(resolveTelegramIdFromOption(selectedOption));
  }

  function markMissingTelegram(select, hintNode) {
    if (select) {
      select.dataset.telegramMissing = 'true';
    }
    if (hintNode) {
      hintNode.textContent = TELEGRAM_MISSING_MESSAGE;
    }
  }

  function clearMissingTelegram(select) {
    if (select && select.dataset && select.dataset.telegramMissing) {
      delete select.dataset.telegramMissing;
    }
  }

  function updateResponsibleHint(select, hintNode) {
    if (!hintNode) {
      return;
    }
    if (!select || !select.value) {
      clearMissingTelegram(select);
      if (state.admin.settings.responsibles && state.admin.settings.responsibles.length) {
        hintNode.textContent = 'Ответственный не выбран.';
      } else {
        hintNode.textContent = 'Список ответственных пуст. Добавьте их в настройках администратора.';
      }
      return;
    }

    var entry = findResponsibleById(select.value);
    var selectedOption = select.options[select.selectedIndex];
    var snapshot = buildAssigneeSnapshot(entry, selectedOption ? selectedOption.textContent : '', select.value);
    if (selectedOption && selectedOption.dataset) {
      if (!snapshot.name && selectedOption.dataset.name) {
        snapshot.name = selectedOption.dataset.name;
      }
      if (!snapshot.department && selectedOption.dataset.department) {
        snapshot.department = selectedOption.dataset.department;
      }
      if (!snapshot.telegram && selectedOption.dataset.telegram) {
        snapshot.telegram = selectedOption.dataset.telegram;
      }
      if (!snapshot.chatId && selectedOption.dataset.chatId) {
        snapshot.chatId = selectedOption.dataset.chatId;
      }
      if (!snapshot.email && selectedOption.dataset.email) {
        snapshot.email = selectedOption.dataset.email;
      }
      if (!snapshot.note && selectedOption.dataset.note) {
        snapshot.note = selectedOption.dataset.note;
      }
    }
    if (!(snapshot.telegram || snapshot.chatId || resolveTelegramIdFromOption(selectedOption))) {
      markMissingTelegram(select, hintNode);
      return;
    }
    clearMissingTelegram(select);
    var parts = [];
    if (snapshot.department) {
      parts.push(snapshot.department);
    }
    if (snapshot.telegram) {
      parts.push('TG: ' + snapshot.telegram);
    }
    if (snapshot.chatId) {
      parts.push('ID: ' + snapshot.chatId);
    }
    if (snapshot.email) {
      parts.push(snapshot.email);
    }
    if (snapshot.note) {
      parts.push(snapshot.note);
    }
    hintNode.textContent = parts.length ? parts.join(' • ') : 'Дополнительных данных нет.';
  }

  function updateSubordinateHint(select, hintNode) {
    if (!hintNode) {
      return;
    }
    if (!select || !select.value) {
      clearMissingTelegram(select);
      if (state.admin.settings.block3 && state.admin.settings.block3.length) {
        hintNode.textContent = 'Подчинённый не выбран.';
      } else {
        hintNode.textContent = 'Список подчинённых пуст. Добавьте их в настройках администратора (Блок 3).';
      }
      return;
    }

    var entry = findResponsibleById(select.value);
    var selectedOption = select.options[select.selectedIndex];
    var snapshot = buildAssigneeSnapshot(entry, selectedOption ? selectedOption.textContent : '', select.value);
    if (selectedOption && selectedOption.dataset) {
      if (!snapshot.name && selectedOption.dataset.name) {
        snapshot.name = selectedOption.dataset.name;
      }
      if (!snapshot.department && selectedOption.dataset.department) {
        snapshot.department = selectedOption.dataset.department;
      }
      if (!snapshot.telegram && selectedOption.dataset.telegram) {
        snapshot.telegram = selectedOption.dataset.telegram;
      }
      if (!snapshot.chatId && selectedOption.dataset.chatId) {
        snapshot.chatId = selectedOption.dataset.chatId;
      }
      if (!snapshot.email && selectedOption.dataset.email) {
        snapshot.email = selectedOption.dataset.email;
      }
      if (!snapshot.note && selectedOption.dataset.note) {
        snapshot.note = selectedOption.dataset.note;
      }
    }
    if (!(snapshot.telegram || snapshot.chatId || resolveTelegramIdFromOption(selectedOption))) {
      markMissingTelegram(select, hintNode);
      return;
    }
    clearMissingTelegram(select);
    var parts = [];
    if (snapshot.department) {
      parts.push(snapshot.department);
    }
    if (snapshot.telegram) {
      parts.push('TG: ' + snapshot.telegram);
    }
    if (snapshot.chatId) {
      parts.push('ID: ' + snapshot.chatId);
    }
    if (snapshot.email) {
      parts.push(snapshot.email);
    }
    if (snapshot.note) {
      parts.push(snapshot.note);
    }
    hintNode.textContent = parts.length ? parts.join(' • ') : 'Дополнительных данных нет.';
  }

  function formatDate(value) {
    if (!value) {
      return '—';
    }
    var date = new Date(value);
    if (!isNaN(date.getTime())) {
      return DATE_FORMATTER.format(date);
    }
    if (typeof value === 'string' && value.split('-').length === 3) {
      var parts = value.split('-');
      return parts[2] + '.' + parts[1] + '.' + parts[0];
    }
    return value;
  }

  function formatDateTime(value) {
    if (!value) {
      return '';
    }
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    return DATE_FORMATTER.format(date) + ' ' + date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatStatusTimestamp(value) {
    if (!value) {
      return '';
    }
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    var day = String(date.getDate()).padStart(2, '0');
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var year = String(date.getFullYear() % 100).padStart(2, '0');
    var hours = String(date.getHours()).padStart(2, '0');
    var minutes = String(date.getMinutes()).padStart(2, '0');
    return day + '.' + month + '.' + year + ' ' + hours + '.' + minutes;
  }

  function formatSize(bytes) {
    var size = Number(bytes);
    if (!isFinite(size) || size <= 0) {
      return '';
    }
    var units = ['Б', 'КБ', 'МБ', 'ГБ'];
    var index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return size.toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
  }

  function pad2(value) {
    var string = String(value);
    return string.length < 2 ? '0' + string : string;
  }

  function showMessage(type, text) {
    if (!elements.message) {
      return;
    }
    elements.message.className = 'documents-message';
    if (!text || type !== 'error') {
      elements.message.style.display = 'none';
      elements.message.textContent = '';
      return;
    }
    elements.message.classList.add('documents-message--error');
    elements.message.style.display = 'block';
    elements.message.textContent = text;
  }

  function clearMessage() {
    showMessage('', '');
  }

  function normalizeErrorMessage(error) {
    if (!error) {
      return '';
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error.message) {
      return String(error.message);
    }
    return String(error);
  }

  function shouldSuppressViewedStatusError(error) {
    var message = normalizeErrorMessage(error);
    if (!message) {
      return false;
    }
    return message.indexOf('Ответственным разрешено изменять только статус') !== -1;
  }

  function clampNumber(value, min, max, fallback) {
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

  function normalizeHexColor(value) {
    if (!value || typeof value !== 'string') {
      return DEFAULT_VISUAL_SETTINGS.borderColor;
    }
    var trimmed = value.trim();
    var match = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
      return DEFAULT_VISUAL_SETTINGS.borderColor;
    }
    var hex = match[1];
    if (hex.length === 3) {
      hex = hex.split('').map(function(char) { return char + char; }).join('');
    }
    return '#' + hex.toLowerCase();
  }

  function hexToRgb(hex) {
    var normalized = normalizeHexColor(hex);
    var match = normalized.match(/^#([0-9a-f]{6})$/i);
    if (!match) {
      return { r: 226, g: 232, b: 240 };
    }
    var value = match[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function buildRgbaString(hex, opacity) {
    var rgb = hexToRgb(hex);
    var alpha = clampNumber(opacity, 0, 1, DEFAULT_VISUAL_SETTINGS.borderOpacity);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  function extractColumnWidthOverrides(columnSettings) {
    var map = {};
    if (!columnSettings || typeof columnSettings !== 'object') {
      return map;
    }
    TABLE_COLUMNS.forEach(function(column) {
      var value = columnSettings[column.key];
      if (!value || typeof value !== 'object') {
        return;
      }
      var width = clampColumnWidth(value.width);
      var baselineWidth = getColumnDefaultWidth(column.key);
      if (state.columnWidths && Object.prototype.hasOwnProperty.call(state.columnWidths, column.key)) {
        var storedWidth = clampColumnWidth(state.columnWidths[column.key]);
        if (storedWidth !== null) {
          baselineWidth = storedWidth;
        }
      }
      if (width !== null && width !== baselineWidth) {
        map[column.key] = width;
      }
    });
    return map;
  }

  function normalizeVisualSettings(settings) {
    var normalized = cloneVisualSettings(DEFAULT_VISUAL_SETTINGS);
    if (!settings || typeof settings !== 'object') {
      return normalized;
    }

    if (settings.fontSize !== undefined) {
      normalized.fontSize = clampNumber(settings.fontSize, 12, 22, DEFAULT_VISUAL_SETTINGS.fontSize);
    }
    if (settings.lineHeight !== undefined) {
      normalized.lineHeight = clampNumber(settings.lineHeight, 1.2, 2, DEFAULT_VISUAL_SETTINGS.lineHeight);
    }
    if (settings.borderWidth !== undefined) {
      normalized.borderWidth = clampNumber(settings.borderWidth, 0, 4, DEFAULT_VISUAL_SETTINGS.borderWidth);
    }
    if (settings.borderOpacity !== undefined) {
      normalized.borderOpacity = clampNumber(settings.borderOpacity, 0, 1, DEFAULT_VISUAL_SETTINGS.borderOpacity);
    }
    if (settings.borderColor !== undefined) {
      normalized.borderColor = normalizeHexColor(String(settings.borderColor));
    }

    if (settings.columns !== undefined) {
      normalized.columns = normalizeColumnSettings(settings.columns, normalized.fontSize);
    }
    if (settings.sorting !== undefined) {
      normalized.sorting = normalizeSortingSettings(settings.sorting);
    }

    return normalized;
  }

  function getWorkspaceElement() {
    var host = state.host || document.getElementById('documents-root');
    if (!host || typeof host.querySelector !== 'function') {
      return null;
    }
    return host.querySelector('.documents-workspace');
  }

  function getColumnFontSize(key, columnSettings, baseFontSize) {
    var fallback = clampNumber(baseFontSize || state.visualSettings.fontSize, COLUMN_FONT_MIN, COLUMN_FONT_MAX, DEFAULT_COLUMN_FONT_SIZE);
    var config = columnSettings && columnSettings[key] ? columnSettings[key] : null;
    if (config && config.fontSize !== undefined) {
      return clampNumber(config.fontSize, COLUMN_FONT_MIN, COLUMN_FONT_MAX, fallback);
    }
    return fallback;
  }

  function applyColumnTypography(columnSettings, baseFontSize) {
    TABLE_COLUMNS.forEach(function(column) {
      var fontSize = getColumnFontSize(column.key, columnSettings, baseFontSize);
      var headerCell = elements.headerCells[column.key];
      if (headerCell) {
        headerCell.style.fontSize = fontSize + 'px';
      }
      if (elements.tableBody) {
        var cells = elements.tableBody.querySelectorAll('td[data-column-key="' + column.key + '"]');
        for (var i = 0; i < cells.length; i += 1) {
          cells[i].style.fontSize = fontSize + 'px';
        }
      }
    });
  }

  function applyColumnVisibility(visibilityMap) {
    var visibleCounts = {};
    TABLE_GROUPS.forEach(function(group) {
      visibleCounts[group.key] = 0;
    });

    TABLE_COLUMNS.forEach(function(column) {
      var config = visibilityMap && visibilityMap[column.key] ? visibilityMap[column.key] : null;
      var visible = !config || config.visible !== false;
      if (visible) {
        visibleCounts[column.group] = (visibleCounts[column.group] || 0) + 1;
      }
      var headerCell = elements.headerCells[column.key];
      if (headerCell) {
        headerCell.style.display = visible ? '' : 'none';
      }
      if (elements.tableBody) {
        var cells = elements.tableBody.querySelectorAll('td[data-column-key="' + column.key + '"]');
        for (var i = 0; i < cells.length; i += 1) {
          cells[i].style.display = visible ? '' : 'none';
        }
      }
    });

    if (elements.groupCells) {
      TABLE_GROUPS.forEach(function(group) {
        var cell = elements.groupCells[group.key];
        if (!cell) {
          return;
        }
        var count = visibleCounts[group.key] || 0;
        cell.style.display = count > 0 ? '' : 'none';
        if (count > 0) {
          cell.colSpan = count;
          cell.setAttribute('colspan', String(count));
        }
      });
    }
  }

  function areSortingSettingsEqual(left, right) {
    var a = left && typeof left === 'object' ? left : {};
    var b = right && typeof right === 'object' ? right : {};
    if (Boolean(a.enabled) !== Boolean(b.enabled)) {
      return false;
    }
    var aRules = Array.isArray(a.rules) ? a.rules : [];
    var bRules = Array.isArray(b.rules) ? b.rules : [];
    if (aRules.length !== bRules.length) {
      return false;
    }
    for (var i = 0; i < aRules.length; i += 1) {
      var aRule = aRules[i] || {};
      var bRule = bRules[i] || {};
      if (String(aRule.column || '') !== String(bRule.column || '')) {
        return false;
      }
      if (String(aRule.direction || 'asc') !== String(bRule.direction || 'asc')) {
        return false;
      }
    }
    return true;
  }

  function areColumnFontSettingsEqual(leftColumns, rightColumns, leftBaseFont, rightBaseFont) {
    var leftBase = clampNumber(leftBaseFont, COLUMN_FONT_MIN, COLUMN_FONT_MAX, DEFAULT_COLUMN_FONT_SIZE);
    var rightBase = clampNumber(rightBaseFont, COLUMN_FONT_MIN, COLUMN_FONT_MAX, DEFAULT_COLUMN_FONT_SIZE);
    if (leftBase !== rightBase) {
      return false;
    }
    for (var i = 0; i < TABLE_COLUMNS.length; i += 1) {
      var key = TABLE_COLUMNS[i].key;
      if (getColumnFontSize(key, leftColumns, leftBase) !== getColumnFontSize(key, rightColumns, rightBase)) {
        return false;
      }
    }
    return true;
  }

  function areColumnVisibilitySettingsEqual(leftColumns, rightColumns) {
    for (var i = 0; i < TABLE_COLUMNS.length; i += 1) {
      var key = TABLE_COLUMNS[i].key;
      var leftConfig = leftColumns && leftColumns[key] ? leftColumns[key] : null;
      var rightConfig = rightColumns && rightColumns[key] ? rightColumns[key] : null;
      var leftVisible = !leftConfig || leftConfig.visible !== false;
      var rightVisible = !rightConfig || rightConfig.visible !== false;
      if (leftVisible !== rightVisible) {
        return false;
      }
    }
    return true;
  }

  function areWidthOverrideMapsEqual(left, right) {
    for (var i = 0; i < TABLE_COLUMNS.length; i += 1) {
      var key = TABLE_COLUMNS[i].key;
      var leftValue = left && Object.prototype.hasOwnProperty.call(left, key)
        ? clampColumnWidth(left[key])
        : null;
      var rightValue = right && Object.prototype.hasOwnProperty.call(right, key)
        ? clampColumnWidth(right[key])
        : null;
      if (leftValue !== rightValue) {
        return false;
      }
    }
    return true;
  }

  function applyVisualSettings(settings) {
    var normalized = normalizeVisualSettings(settings);
    var previous = state.visualSettings || DEFAULT_VISUAL_SETTINGS;
    var sortingChanged = !areSortingSettingsEqual(previous.sorting, normalized.sorting);
    var workspaceCssChanged = previous.fontSize !== normalized.fontSize
      || previous.lineHeight !== normalized.lineHeight
      || previous.borderWidth !== normalized.borderWidth
      || previous.borderOpacity !== normalized.borderOpacity
      || String(previous.borderColor || '').toLowerCase() !== String(normalized.borderColor || '').toLowerCase();
    var typographyChanged = !areColumnFontSettingsEqual(
      previous.columns,
      normalized.columns,
      previous.fontSize,
      normalized.fontSize
    );
    var visibilityChanged = !areColumnVisibilitySettingsEqual(previous.columns, normalized.columns);
    state.visualSettings = normalized;
    var widthOverrides = extractColumnWidthOverrides(normalized.columns);
    var widthOverridesChanged = !areWidthOverrideMapsEqual(state.columnWidthOverrides, widthOverrides);
    state.columnWidthOverrides = Object.keys(widthOverrides).length ? widthOverrides : null;
    state.columnVisibility = normalized.columns;
    var workspace = getWorkspaceElement();
    if (!workspace) {
      return normalized;
    }
    if (workspaceCssChanged) {
      workspace.style.setProperty('--docs-font-size', normalized.fontSize + 'px');
      workspace.style.setProperty('--docs-line-height', normalized.lineHeight.toFixed(2));
      workspace.style.setProperty('--docs-border-width', normalized.borderWidth + 'px');
      workspace.style.setProperty('--docs-border-color', buildRgbaString(normalized.borderColor, normalized.borderOpacity));
    }
    if (sortingChanged) {
      updateTable();
    }
    if (sortingChanged || typographyChanged) {
      applyColumnTypography(normalized.columns, normalized.fontSize);
    }
    if (sortingChanged || visibilityChanged) {
      applyColumnVisibility(normalized.columns);
    }
    if (sortingChanged || widthOverridesChanged) {
      applyColumnWidths(state.columnWidthOverrides);
    }
    if (sortingChanged || typographyChanged || visibilityChanged || widthOverridesChanged || workspaceCssChanged) {
      handleTableResize();
    }
    return normalized;
  }

  function setToolbarState() {
    var organizationReady = !!state.organization;
    var accessContext = state.access || {};
    var adminScope = typeof accessContext.adminScope === 'string'
      ? accessContext.adminScope.toLowerCase()
      : '';
    var hasAdminAccess = isCurrentUserAdmin() && adminScope !== 'director';
    var canCreateDocuments = Boolean(state.permissions && state.permissions.canCreateDocuments);
    var showAddButton = hasAdminAccess && canCreateDocuments;

    if (elements.addButton) {
      var canUseAdd = organizationReady && showAddButton;
      var addHidden = !showAddButton;
      var addAriaHidden = addHidden || !canUseAdd;
      elements.addButton.disabled = !canUseAdd;
      elements.addButton.setAttribute('aria-hidden', addAriaHidden ? 'true' : 'false');
      elements.addButton.tabIndex = addAriaHidden ? -1 : 0;
      elements.addButton.classList.toggle('documents-button--hidden', addHidden);
    }
    if (elements.adminButton) {
      var canUseAdmin = organizationReady && hasAdminAccess;
      elements.adminButton.disabled = !canUseAdmin;
      elements.adminButton.setAttribute('aria-hidden', canUseAdmin ? 'false' : 'true');
      elements.adminButton.tabIndex = canUseAdmin ? 0 : -1;
      elements.adminButton.classList.toggle('documents-button--hidden', !hasAdminAccess);
      if (hasAdminAccess) {
        elements.adminButton.removeAttribute('hidden');
      } else {
        elements.adminButton.setAttribute('hidden', '');
      }
    }
    if (elements.responsibleButton) {
      var canUseResponsible = organizationReady && hasAdminAccess;
      elements.responsibleButton.disabled = !canUseResponsible;
      elements.responsibleButton.setAttribute('aria-hidden', canUseResponsible ? 'false' : 'true');
      elements.responsibleButton.tabIndex = canUseResponsible ? 0 : -1;
      elements.responsibleButton.classList.toggle('documents-button--hidden', !hasAdminAccess);
      updateResponsibleButtonState();
    }
    if (elements.unviewedButton) {
      updateUnviewedButtonState();
    }
    if (elements.settingsButton) {
      var canUseSettings = organizationReady && (accessContext.forceAccess || accessContext.accessGranted);
      elements.settingsButton.disabled = !canUseSettings;
      elements.settingsButton.setAttribute('aria-hidden', canUseSettings ? 'false' : 'true');
      elements.settingsButton.tabIndex = canUseSettings ? 0 : -1;
      elements.settingsButton.classList.toggle('documents-button--hidden', !canUseSettings);
    }
    if (elements.onlineButton) {
      var canUseOnline = organizationReady && (accessContext.forceAccess || accessContext.accessGranted || !!resolveUserKey(accessContext));
      elements.onlineButton.disabled = !canUseOnline;
      elements.onlineButton.setAttribute('aria-hidden', canUseOnline ? 'false' : 'true');
      elements.onlineButton.tabIndex = canUseOnline ? 0 : -1;
      elements.onlineButton.classList.toggle('documents-button--hidden', !canUseOnline);
    }
  }

  function formatOnlineDuration(seconds) {
    var total = Math.max(0, Math.floor(seconds || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var parts = [];
    if (hours > 0) {
      parts.push(hours + ' ч');
    }
    parts.push((minutes < 10 && hours > 0 ? '0' : '') + minutes + ' мин');
    return parts.join(' ');
  }

  function updateOnlineCounter(count) {
    if (!elements.onlineCounter) {
      return;
    }
    var safe = Math.max(0, Number(count) || 0);
    elements.onlineCounter.textContent = safe;
  }

  function closeOnlineModal() {
    if (presenceState.modal) {
      presenceState.modal.remove();
      presenceState.modal = null;
      presenceState.listContainer = null;
    }
    presenceState.buttonBusy = false;
  }

  function renderOnlineList(users) {
    if (!presenceState.listContainer) {
      return;
    }
    presenceState.listContainer.innerHTML = '';
    if (!users || !users.length) {
      var empty = createElement('div', 'documents-online-empty', 'Сейчас онлайн никого нет.');
      presenceState.listContainer.appendChild(empty);
      return;
    }
    var table = createElement('table', 'documents-online-table');
    var thead = createElement('thead', '');
    var headRow = createElement('tr', '');
    ['ФИО', 'Логин', 'Время на странице'].forEach(function(label) {
      var th = createElement('th', '', label);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = createElement('tbody', '');
    users.forEach(function(user) {
      var row = createElement('tr', '');
      var nameCell = createElement('td', '', user.userName || 'Без имени');
      var loginCell = createElement('td', '', user.userLogin || '—');
      var durationCell = createElement('td', '', formatOnlineDuration(user.onlineSeconds || 0));
      row.appendChild(nameCell);
      row.appendChild(loginCell);
      row.appendChild(durationCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    presenceState.listContainer.appendChild(table);
  }

  function openOnlineModal() {
    if (presenceState.buttonBusy) {
      return;
    }
    presenceState.buttonBusy = true;
    closeOnlineModal();

    var modal = createElement('div', 'documents-online-modal');
    var panel = createElement('div', 'documents-online-panel');
    var header = createElement('div', 'documents-online-panel__header');
    var title = createElement('div', 'documents-online-panel__title', 'Кто сейчас онлайн');
    var closeBtn = createElement('button', 'documents-online-panel__close', 'Закрыть');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', closeOnlineModal);
    header.appendChild(title);
    header.appendChild(closeBtn);

    var body = createElement('div', 'documents-online-panel__body');
    presenceState.listContainer = body;
    panel.appendChild(header);
    panel.appendChild(body);
    modal.appendChild(panel);
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeOnlineModal();
      }
    });

    document.body.appendChild(modal);
    presenceState.modal = modal;

    fetchOnlineUsers()
      .catch(function() { return []; })
      .then(function(users) {
        renderOnlineList(users);
      })
      .finally(function() {
        presenceState.buttonBusy = false;
      });
  }

  function fetchOnlineUsers() {
    if (!state.organization) {
      return Promise.resolve([]);
    }
    var url = 'documents_presence.php?organization=' + encodeURIComponent(state.organization);
    return fetch(url, { credentials: 'same-origin' })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function(payload) {
        if (!payload || payload.success !== true) {
          return [];
        }
        var users = Array.isArray(payload.users) ? payload.users : [];
        updateOnlineCounter(users.length);
        if (presenceState.modal) {
          renderOnlineList(users);
        }
        return users;
      })
      .catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось загрузить список онлайн пользователей:', error);
        }
        if (presenceState.modal) {
          renderOnlineList([]);
        }
        updateOnlineCounter(0);
        return [];
      });
  }

  function getPresenceSessionId() {
    if (presenceState.sessionId) {
      return presenceState.sessionId;
    }
    var storageKey = state.organization ? 'documents.presence.' + state.organization : 'documents.presence.global';
    if (window.sessionStorage) {
      var stored = '';
      try {
        stored = window.sessionStorage.getItem(storageKey) || '';
      } catch (storageError) {
        stored = '';
      }
      if (stored) {
        presenceState.sessionId = stored;
        return presenceState.sessionId;
      }
    }
    var randomId = '';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      randomId = window.crypto.randomUUID();
    } else {
      randomId = 'sess-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
    presenceState.sessionId = randomId;
    if (window.sessionStorage) {
      try {
        window.sessionStorage.setItem(storageKey, randomId);
      } catch (writeError) {
        // ignore
      }
    }
    return presenceState.sessionId;
  }

  function pingPresence() {
    if (!state.organization || !state.access || !state.access.user) {
      updateOnlineCounter(0);
      return Promise.resolve([]);
    }

    var sessionId = getPresenceSessionId();
    var user = state.access.user || {};
    var payload = {
      action: 'ping',
      organization: state.organization,
      sessionId: sessionId,
      userName: user.fullName || user.username || user.login || 'Пользователь',
      userLogin: user.login || user.username || ''
    };

    return fetch('documents_presence.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось обновить присутствие:', error);
        }
        return { success: false };
      })
      .then(function() {
        return fetchOnlineUsers();
      });
  }

  function stopPresenceTracking() {
    presenceState.active = false;
    if (presenceState.timerId) {
      clearInterval(presenceState.timerId);
      presenceState.timerId = null;
    }
    if (state.organization && presenceState.sessionId) {
      fetch('documents_presence.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave',
          organization: state.organization,
          sessionId: presenceState.sessionId
        })
      }).catch(function() {});
    }
    updateOnlineCounter(0);
    closeOnlineModal();
  }

  function startPresenceTracking() {
    if (!state.organization || !resolveUserKey(state.access)) {
      stopPresenceTracking();
      return;
    }
    if (presenceState.active) {
      return;
    }
    presenceState.active = true;
    pingPresence();
    presenceState.timerId = setInterval(pingPresence, 25000);
  }

  function syncPresenceTracking() {
    if (state.access && state.access.user && (state.access.accessGranted || state.access.forceAccess || resolveUserKey(state.access))) {
      startPresenceTracking();
    } else {
      stopPresenceTracking();
    }
  }

  function ensureAdminModal() {
    if (adminElements.modal) {
      return;
    }

    var modal = createElement('div', 'documents-admin');
    modal.id = 'documents-admin';
    modal.setAttribute('aria-hidden', 'true');

    var backdrop = createElement('div', 'documents-admin__backdrop');
    modal.appendChild(backdrop);

    var dialog = createElement('div', 'documents-admin__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'documents-admin-title');

    var header = createElement('header', 'documents-admin__header');
    var title = createElement('h2', 'documents-admin__title', 'Администратор документооборота');
    title.id = 'documents-admin-title';
    header.appendChild(title);

    var headerActions = createElement('div', 'documents-admin__header-actions');
    var message = createElement('div', 'documents-admin__message');
    message.id = 'documents-admin-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    headerActions.appendChild(message);

    var logButton = createElement('button', 'documents-admin__log-button', 'Журнал мини-приложения');
    logButton.type = 'button';
    logButton.setAttribute('aria-expanded', 'false');
    headerActions.appendChild(logButton);

    var dismiss = createElement('button', 'documents-admin__dismiss', 'Закрыть');
    dismiss.type = 'button';
    headerActions.appendChild(dismiss);

    header.appendChild(headerActions);
    dialog.appendChild(header);

    var body = createElement('div', 'documents-admin__body');

    adminElements.sections = {};

    var logPanel = createElement('section', 'documents-admin__log-panel');
    logPanel.setAttribute('aria-live', 'polite');
    logPanel.setAttribute('hidden', 'true');

    var logHeader = createElement('div', 'documents-admin__log-header');
    var logTitle = createElement('h3', 'documents-admin__log-title', 'Журнал посещений мини-приложения');
    var logClose = createElement('button', 'documents-admin__log-close', 'Скрыть журнал');
    logClose.type = 'button';
    logHeader.appendChild(logTitle);
    logHeader.appendChild(logClose);
    logPanel.appendChild(logHeader);

    var logStatus = createElement('div', 'documents-admin__log-status');
    logStatus.setAttribute('role', 'status');
    logPanel.appendChild(logStatus);

    var logList = createElement('ol', 'documents-admin__log-list');
    logPanel.appendChild(logList);

    var logTextarea = document.createElement('textarea');
    logTextarea.className = 'documents-admin__log-textarea';
    logTextarea.rows = 6;
    logTextarea.readOnly = true;
    logTextarea.setAttribute('aria-label', 'Список пользователей мини-приложения');
    logPanel.appendChild(logTextarea);

    var logCopy = createElement('button', 'documents-admin__log-copy', 'Скопировать список');
    logCopy.type = 'button';
    logPanel.appendChild(logCopy);

    var logHint = createElement('p', 'documents-admin__log-hint', 'В журнал попадает ФИО и Telegram ID каждого пользователя, открывшего мини-приложение.');
    logPanel.appendChild(logHint);

    body.appendChild(logPanel);

    function buildAdminSection(key, titleText) {
      var includeCredentials = sectionHasCredentials(key);
      var section = createElement('section', 'documents-admin__section');
      var sectionTitle = createElement('h3', 'documents-admin__section-title', titleText);
      section.appendChild(sectionTitle);

      var tableWrapper = createElement('div', 'documents-admin__table-wrapper');
      var table = createElement('table', 'documents-admin__table');
      var headerCells = [
        '<th>№ п/п</th>',
        '<th>Ответственный</th>',
        '<th>ID Telegram</th>',
        '<th>ID чата</th>',
        '<th>Эл. почта</th>'
      ];
      if (includeCredentials) {
        headerCells.push('<th>Логин</th>');
        headerCells.push('<th>Пароль</th>');
      }
      headerCells.push('<th>Отдел</th>');
      headerCells.push('<th>Примечание</th>');
      headerCells.push('<th></th>');
      table.innerHTML = '' +
        '<thead>' +
        '  <tr>' + headerCells.join('') + '</tr>' +
        '</thead>' +
        '<tbody></tbody>';
      tableWrapper.appendChild(table);
      section.appendChild(tableWrapper);

      var addRowButton = createElement('button', 'documents-admin__add-row', 'Добавить строку');
      addRowButton.type = 'button';
      section.appendChild(addRowButton);

      body.appendChild(section);

      adminElements.sections[key] = {
        section: section,
        tableBody: table.querySelector('tbody'),
        addRowButton: addRowButton
      };

      addRowButton.addEventListener('click', function() {
        addAdminRow(null, key);
      });
    }

    buildAdminSection('responsibles', 'Блок 1. Ответственные');
    buildAdminSection('block2', 'Блок 2. Директор');
    buildAdminSection('block3', 'Блок 3. Подчинённые');

    dialog.appendChild(body);

    var footer = createElement('div', 'documents-admin__footer');
    var closeButton = createElement('button', 'documents-admin__close', 'Закрыть без сохранения');
    closeButton.type = 'button';
    var saveButton = createElement('button', 'documents-admin__save', 'Сохранить и закрыть');
    saveButton.type = 'button';
    footer.appendChild(closeButton);
    footer.appendChild(saveButton);
    dialog.appendChild(footer);

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    adminElements.modal = modal;
    adminElements.backdrop = backdrop;
    adminElements.dialog = dialog;
    adminElements.message = message;
    adminElements.saveButton = saveButton;
    adminElements.closeButton = closeButton;
    adminElements.logButton = logButton;
    adminElements.logPanel = logPanel;
    adminElements.logStatus = logStatus;
    adminElements.logList = logList;
    adminElements.logTextarea = logTextarea;
    adminElements.logCopyButton = logCopy;
    adminElements.logCloseButton = logClose;

    closeButton.addEventListener('click', function() {
      closeAdminModal();
    });

    dismiss.addEventListener('click', function() {
      closeAdminModal();
    });

    logButton.addEventListener('click', function() {
      toggleAdminLogPanel();
    });

    logClose.addEventListener('click', function() {
      closeAdminLogPanel();
    });

    logCopy.addEventListener('click', function() {
      copyAdminLogToClipboard();
    });

    saveButton.addEventListener('click', function() {
      handleAdminSave();
    });

    backdrop.addEventListener('click', function() {
      closeAdminModal();
    });

    updateAdminLogPanel();
  }

  function getAdminSection(sectionKey) {
    var key = sectionKey || 'responsibles';
    ensureAdminModal();
    if (!adminElements.sections || !adminElements.sections[key]) {
      return null;
    }
    return adminElements.sections[key];
  }

  function sectionHasCredentials(sectionKey) {
    return sectionKey === 'responsibles' || sectionKey === 'block2' || sectionKey === 'block3';
  }

  function resolveAdminRole(sectionKey) {
    if (sectionKey === 'block3') {
      return 'subordinate';
    }
    if (sectionKey === 'responsibles') {
      return 'responsible';
    }
    if (sectionKey === 'block2') {
      return 'director';
    }
    return '';
  }

  function createAdminInput(field, value, type) {
    var input = document.createElement('input');
    input.className = 'documents-admin__input';
    input.type = type || 'text';
    input.value = typeof value === 'string' ? value : '';
    input.dataset.field = field;
    input.placeholder = '';
    return input;
  }

  function createEmptyAdminEntry(sectionKey) {
    var base = {
      number: '',
      responsible: '',
      telegram: '',
      chatId: '',
      email: '',
      department: '',
      note: ''
    };
    if (sectionHasCredentials(sectionKey)) {
      base.login = '';
      base.passwordHash = '';
    }
    var role = resolveAdminRole(sectionKey);
    if (role) {
      base.role = role;
    }
    return base;
  }

  function createAdminRow(entry, index, sectionKey) {
    var tr = document.createElement('tr');
    var includeCredentials = sectionHasCredentials(sectionKey);
    var data = Object.assign({}, createEmptyAdminEntry(sectionKey), entry || {});
    var resolvedRole = resolveAdminRole(sectionKey);
    if (resolvedRole && !data.role) {
      data.role = resolvedRole;
    }
    if (data.role) {
      tr.dataset.role = data.role;
    }

    function appendInputCell(field, value, type, autocomplete) {
      var td = document.createElement('td');
      var input = createAdminInput(field, value, type);
      if (field === 'number') {
        input.placeholder = String(index + 1);
        if (!input.value) {
          input.value = String(index + 1);
        }
      }
      if (autocomplete) {
        input.autocomplete = autocomplete;
      }
      td.appendChild(input);
      tr.appendChild(td);
      return input;
    }

    appendInputCell('number', data.number, 'text', 'off');
    appendInputCell('responsible', data.responsible, 'text', 'name');
    appendInputCell('telegram', data.telegram, 'text', 'off');
    appendInputCell('chatId', data.chatId, 'text', 'off');
    appendInputCell('email', data.email, 'email', 'email');

    var passwordInput = null;
    var clearPasswordButton = null;
    if (includeCredentials) {
      appendInputCell('login', data.login, 'text', 'username');
      passwordInput = appendInputCell('password', '', 'password', 'new-password');
      passwordInput.value = '';
      passwordInput.placeholder = '';
      passwordInput.setAttribute('aria-label', 'Новый пароль');
      var initialHash = data.passwordHash ? String(data.passwordHash) : '';
      tr.dataset.passwordHash = initialHash;
      tr.dataset.initialPasswordHash = initialHash;

      clearPasswordButton = createElement('button', 'documents-admin__clear-password', 'Сбросить пароль');
      clearPasswordButton.type = 'button';
      clearPasswordButton.title = 'Удалить текущий пароль';

      function refreshPasswordState() {
        var hasHash = Boolean(tr.dataset.passwordHash);
        clearPasswordButton.disabled = !hasHash;
        passwordInput.placeholder = hasHash
          ? 'Оставьте пустым, чтобы не менять пароль'
          : 'Введите пароль';
      }

      passwordInput.addEventListener('input', function() {
        var value = passwordInput.value.trim();
        if (value !== '') {
          tr.dataset.passwordHash = '';
        } else {
          tr.dataset.passwordHash = tr.dataset.initialPasswordHash || '';
        }
        refreshPasswordState();
      });

      clearPasswordButton.addEventListener('click', function() {
        tr.dataset.passwordHash = '';
        tr.dataset.initialPasswordHash = '';
        passwordInput.value = '';
        refreshPasswordState();
        passwordInput.focus();
      });

      refreshPasswordState();
    } else {
      tr.dataset.passwordHash = '';
      tr.dataset.initialPasswordHash = '';
    }

    appendInputCell('department', data.department, 'text', 'organization-title');
    appendInputCell('note', data.note, 'text', 'off');

    var actions = document.createElement('td');
    actions.className = 'documents-admin__row-actions';
    if (includeCredentials && clearPasswordButton) {
      actions.appendChild(clearPasswordButton);
    }
    var removeButton = createElement('button', 'documents-admin__remove-row', 'Удалить');
    removeButton.type = 'button';
    removeButton.addEventListener('click', function() {
      removeAdminRow(sectionKey, tr);
    });
    actions.appendChild(removeButton);
    tr.appendChild(actions);

    return tr;
  }

  function collectAdminNumbers(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return { used: Object.create(null), max: 0 };
    }
    var used = Object.create(null);
    var max = 0;
    section.tableBody.querySelectorAll('input[data-field="number"]').forEach(function(input) {
      var value = input && input.value ? String(input.value).trim() : '';
      var parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        used[String(parsed)] = true;
        if (parsed > max) {
          max = parsed;
        }
      }
    });
    return { used: used, max: max };
  }

  function findNextAdminNumber(sectionKey, numbersInfo) {
    var info = numbersInfo || collectAdminNumbers(sectionKey);
    var used = info.used || Object.create(null);
    var max = typeof info.max === 'number' ? info.max : 0;
    var candidate = 1;
    while (used[String(candidate)]) {
      candidate += 1;
    }
    if (candidate <= max + 1) {
      return candidate;
    }
    return max + 1;
  }

  function renumberAdminRows(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var rows = section.tableBody.querySelectorAll('tr');
    rows.forEach(function(row, index) {
      var numberInput = row.querySelector('input[data-field="number"]');
      if (numberInput) {
        numberInput.placeholder = String(index + 1);
      }
    });
  }

  function getAdminRowSortKey(row) {
    if (!row) {
      return '';
    }
    var responsibleInput = row.querySelector('input[data-field="responsible"]');
    var value = responsibleInput && responsibleInput.value ? String(responsibleInput.value).trim().toLowerCase() : '';
    return value;
  }

  function sortAdminTableRows(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var rows = Array.prototype.slice.call(section.tableBody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var aKey = getAdminRowSortKey(a);
      var bKey = getAdminRowSortKey(b);
      if (aKey && bKey) {
        var compare = aKey.localeCompare(bKey, 'ru', { sensitivity: 'base' });
        if (compare !== 0) {
          return compare;
        }
      }
      if (aKey && !bKey) {
        return -1;
      }
      if (!aKey && bKey) {
        return 1;
      }
      return 0;
    });
    rows.forEach(function(row) {
      section.tableBody.appendChild(row);
    });
    renumberAdminRows(sectionKey);
  }

  function sortAdminEntriesByResponsible(entries) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    return list.sort(function(a, b) {
      var aName = a && a.responsible ? String(a.responsible).trim().toLowerCase() : '';
      var bName = b && b.responsible ? String(b.responsible).trim().toLowerCase() : '';
      if (aName && bName) {
        var compare = aName.localeCompare(bName, 'ru', { sensitivity: 'base' });
        if (compare !== 0) {
          return compare;
        }
      }
      if (aName && !bName) {
        return -1;
      }
      if (!aName && bName) {
        return 1;
      }
      var aNumber = a && a.number ? parseInt(a.number, 10) : NaN;
      var bNumber = b && b.number ? parseInt(b.number, 10) : NaN;
      if (!isNaN(aNumber) && !isNaN(bNumber)) {
        return aNumber - bNumber;
      }
      return 0;
    });
  }

  function renderAdminRows(sectionKey, rows, shouldFocus) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    section.tableBody.innerHTML = '';
    var list = Array.isArray(rows) && rows.length ? rows : [createEmptyAdminEntry(sectionKey)];
    list = sortAdminEntriesByResponsible(list);
    list.forEach(function(entry, index) {
      section.tableBody.appendChild(createAdminRow(entry, index, sectionKey));
    });
    sortAdminTableRows(sectionKey);
    if (shouldFocus) {
      focusFirstAdminInput(sectionKey);
    }
  }

  function focusFirstAdminInput(sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var firstInput = section.tableBody.querySelector('input');
    if (firstInput && typeof firstInput.focus === 'function') {
      firstInput.focus();
      if (typeof firstInput.select === 'function') {
        firstInput.select();
      }
    }
  }

  function addAdminRow(entry, sectionKey) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return;
    }
    var index = section.tableBody.children.length;
    var numbersInfo = collectAdminNumbers(sectionKey);
    var data = Object.assign({}, createEmptyAdminEntry(sectionKey), entry || {});
    var numberValue = data.number ? String(data.number).trim() : '';
    var normalizedNumber = '';
    if (numberValue) {
      var parsedNumber = parseInt(numberValue, 10);
      if (!isNaN(parsedNumber) && parsedNumber > 0) {
        normalizedNumber = String(parsedNumber);
      }
    }
    if (!normalizedNumber || numbersInfo.used[normalizedNumber]) {
      data.number = String(findNextAdminNumber(sectionKey, numbersInfo));
    } else {
      data.number = normalizedNumber;
    }
    section.tableBody.appendChild(createAdminRow(data, index, sectionKey));
    sortAdminTableRows(sectionKey);
  }

  function removeAdminRow(sectionKey, row) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody || !row) {
      return;
    }
    section.tableBody.removeChild(row);
    if (!section.tableBody.children.length) {
      addAdminRow(null, sectionKey);
    } else {
      renumberAdminRows(sectionKey);
    }
  }

  function collectAdminRows(sectionKey, options) {
    var section = getAdminSection(sectionKey);
    if (!section || !section.tableBody) {
      return options && options.includeMeta ? { rows: [], meta: [] } : [];
    }
    var includeMeta = Boolean(options && options.includeMeta);
    var rows = [];
    var meta = includeMeta ? [] : null;
    section.tableBody.querySelectorAll('tr').forEach(function(row) {
      var includeCredentials = sectionHasCredentials(sectionKey);
      var entry = createEmptyAdminEntry(sectionKey);
      row.querySelectorAll('input').forEach(function(input) {
        var field = input.dataset.field;
        if (!field) {
          return;
        }
        entry[field] = input.value.trim();
      });
      if (includeCredentials) {
        var passwordValue = entry.password ? entry.password.trim() : '';
        delete entry.password;
        var storedHash = row.dataset && row.dataset.passwordHash ? String(row.dataset.passwordHash) : '';
        if (passwordValue !== '') {
          entry.password = passwordValue;
          entry.passwordHash = '';
        } else {
          entry.passwordHash = entry.passwordHash ? entry.passwordHash.trim() : storedHash;
          if (entry.login === '') {
            entry.passwordHash = '';
          }
        }
        if (!passwordValue) {
          delete entry.password;
        }
        if (!entry.passwordHash) {
          delete entry.passwordHash;
        }
      }
      var hasValue = Object.keys(entry).some(function(key) {
        return entry[key] !== '';
      });
      if (hasValue) {
        var role = resolveAdminRole(sectionKey);
        if (role) {
          entry.role = role;
        } else if (entry.role) {
          entry.role = String(entry.role).trim();
          if (entry.role === '') {
            delete entry.role;
          }
        }
        rows.push(entry);
        if (includeMeta) {
          var loginValue = entry.login ? String(entry.login).trim() : '';
          if (loginValue) {
            meta.push({
              sectionKey: sectionKey,
              login: loginValue,
              normalizedLogin: normalizeUserIdentifier(loginValue),
              input: includeCredentials ? row.querySelector('input[data-field="login"]') : null
            });
          }
        }
      }
    });
    if (includeMeta) {
      return { rows: rows, meta: meta };
    }
    return rows;
  }

  function clearAdminLoginValidationState() {
    if (!adminElements.sections) {
      return;
    }
    Object.keys(adminElements.sections).forEach(function(key) {
      var section = adminElements.sections[key];
      if (!section || !section.tableBody) {
        return;
      }
      section.tableBody.querySelectorAll('input[data-field="login"]').forEach(function(input) {
        input.classList.remove('documents-admin__input--error');
        input.removeAttribute('aria-invalid');
      });
    });
  }

  function sanitizeLoginSuggestionBase(login) {
    var base = typeof login === 'string' ? login.trim().toLowerCase() : '';
    if (!base) {
      return 'user';
    }
    base = base.replace(/\s+/g, '');
    base = base.replace(/[^a-z0-9._-]/g, '');
    if (!base) {
      return 'user';
    }
    return base.slice(0, 40);
  }

  function generateLoginSuggestions(baseLogin, usedSet, reservedSet, limit) {
    var maxSuggestions = typeof limit === 'number' && limit > 0 ? limit : 3;
    var sanitizedBase = sanitizeLoginSuggestionBase(baseLogin);
    var suggestions = [];
    var suffix = 1;
    var attempts = 0;
    var maxAttempts = maxSuggestions * 30;
    while (suggestions.length < maxSuggestions && attempts < maxAttempts) {
      var candidate = sanitizedBase + String(suffix);
      suffix += 1;
      attempts += 1;
      var normalized = normalizeUserIdentifier(candidate);
      if (!normalized) {
        continue;
      }
      if (usedSet[normalized] || reservedSet[normalized]) {
        continue;
      }
      suggestions.push(candidate);
      reservedSet[normalized] = true;
    }
    if (!suggestions.length) {
      var fallback = sanitizedBase + '-' + String(Math.floor(Math.random() * 900 + 100));
      var normalizedFallback = normalizeUserIdentifier(fallback);
      if (normalizedFallback && !usedSet[normalizedFallback] && !reservedSet[normalizedFallback]) {
        suggestions.push(fallback);
        reservedSet[normalizedFallback] = true;
      }
    }
    return suggestions;
  }

  function validateAdminLoginUniqueness(sectionDataList) {
    var sections = Array.isArray(sectionDataList) ? sectionDataList : [];
    var loginMap = Object.create(null);
    sections.forEach(function(sectionData) {
      if (!sectionData || !Array.isArray(sectionData.meta)) {
        return;
      }
      sectionData.meta.forEach(function(metaEntry) {
        if (!metaEntry) {
          return;
        }
        var normalized = metaEntry.normalizedLogin;
        if (!normalized) {
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(loginMap, normalized)) {
          loginMap[normalized] = [];
        }
        loginMap[normalized].push(metaEntry);
      });
    });

    var duplicateGroups = [];
    Object.keys(loginMap).forEach(function(normalized) {
      if (loginMap[normalized].length > 1) {
        duplicateGroups.push({
          normalized: normalized,
          entries: loginMap[normalized]
        });
      }
    });

    if (!duplicateGroups.length) {
      return { valid: true };
    }

    var usedSet = Object.create(null);
    Object.keys(loginMap).forEach(function(normalized) {
      usedSet[normalized] = true;
    });

    var reservedSet = Object.create(null);
    var suggestionMap = Object.create(null);
    duplicateGroups.forEach(function(group) {
      var entries = group.entries || [];
      var baseLogin = '';
      for (var i = 0; i < entries.length; i += 1) {
        if (entries[i] && entries[i].login) {
          baseLogin = entries[i].login;
          break;
        }
      }
      var suggestions = generateLoginSuggestions(baseLogin || group.normalized, usedSet, reservedSet, 3);
      if (suggestions.length) {
        suggestionMap[group.normalized] = suggestions;
      } else {
        suggestionMap[group.normalized] = [];
      }
    });

    return {
      valid: false,
      duplicateGroups: duplicateGroups,
      suggestions: suggestionMap
    };
  }

  function applyAdminLoginValidationFailure(result) {
    if (!result || !Array.isArray(result.duplicateGroups)) {
      return;
    }
    var focusTarget = null;
    var messages = [];
    result.duplicateGroups.forEach(function(group) {
      if (!group || !Array.isArray(group.entries)) {
        return;
      }
      var groupLogin = '';
      group.entries.forEach(function(metaEntry) {
        if (!metaEntry) {
          return;
        }
        if (metaEntry.input) {
          metaEntry.input.classList.add('documents-admin__input--error');
          metaEntry.input.setAttribute('aria-invalid', 'true');
          if (!focusTarget) {
            focusTarget = metaEntry.input;
          }
        }
        if (!groupLogin && metaEntry.login) {
          groupLogin = metaEntry.login;
        }
      });
      if (!groupLogin) {
        groupLogin = group.normalized;
      }
      var suggestionList = result.suggestions && result.suggestions[group.normalized]
        ? result.suggestions[group.normalized]
        : [];
      var message = 'Логин «' + groupLogin + '» уже используется.';
      if (suggestionList.length) {
        message += ' Попробуйте: ' + suggestionList.join(', ') + '.';
      }
      messages.push(message);
    });

    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
      if (typeof focusTarget.select === 'function') {
        focusTarget.select();
      }
    }

    var combinedMessage = messages.join(' ');
    updateAdminMessage(combinedMessage || 'Логин уже используется.', true);
  }

  function updateAdminMessage(text, isError) {
    ensureAdminModal();
    if (!adminElements.message) {
      return;
    }
    adminElements.message.textContent = text || '';
    adminElements.message.style.display = text ? 'block' : 'none';
    adminElements.message.classList.toggle('documents-admin__message--error', Boolean(text && isError));
  }

  function setAdminSaving(isSaving) {
    state.admin.saving = Boolean(isSaving);
    if (adminElements.saveButton) {
      adminElements.saveButton.disabled = state.admin.saving;
      adminElements.saveButton.textContent = state.admin.saving ? 'Сохранение...' : 'Сохранить и закрыть';
    }
  }

  function ensureAdminUserLogState() {
    if (!state.admin.userLog) {
      state.admin.userLog = {
        entries: [],
        loading: false,
        error: '',
        visible: false,
        promise: null,
        lastLoadedAt: 0
      };
    }
    return state.admin.userLog;
  }

  function setAdminLogStatus(text, type) {
    ensureAdminModal();
    if (!adminElements.logStatus) {
      return;
    }
    var status = adminElements.logStatus;
    status.textContent = text || '';
    status.style.display = text ? 'block' : 'none';
    status.classList.remove('documents-admin__log-status--error', 'documents-admin__log-status--success');
    if (!text) {
      return;
    }
    if (type === 'error') {
      status.classList.add('documents-admin__log-status--error');
    } else if (type === 'success') {
      status.classList.add('documents-admin__log-status--success');
    }
  }

  function formatAdminLogTimestamp(value) {
    if (!value) {
      return '';
    }
    var date = value instanceof Date ? value : new Date(value);
    if (!date || isNaN(date.getTime())) {
      return '';
    }
    if (DATE_TIME_FORMATTER && typeof DATE_TIME_FORMATTER.format === 'function') {
      try {
        return DATE_TIME_FORMATTER.format(date);
      } catch (formatterError) {
        // fallback to locale string below
      }
    }
    try {
      return date.toLocaleString('ru-RU');
    } catch (localeError) {
      return date.toISOString();
    }
  }

  function buildAdminLogCopyText(entries) {
    if (!entries || !entries.length) {
      return '';
    }
    var lines = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i] || {};
      var position = String(i + 1) + '.';
      var name = entry.fullName || 'Без имени';
      var username = entry.username ? '@' + entry.username : '';
      var id = entry.id ? 'ID: ' + entry.id : '';
      var lastSeen = entry.lastSeen ? 'последнее посещение: ' + formatAdminLogTimestamp(entry.lastSeen) : '';
      var parts = [position, name];
      if (username) {
        parts.push(username);
      }
      if (id) {
        parts.push(id);
      }
      if (lastSeen) {
        parts.push(lastSeen);
      }
      lines.push(parts.filter(Boolean).join(' — '));
    }
    return lines.join('\n');
  }

  function updateAdminLogPanel() {
    ensureAdminModal();
    var logState = ensureAdminUserLogState();

    if (!adminElements.logPanel || !adminElements.logButton) {
      return;
    }

    var organizationReady = Boolean(state.organization);
    if (!organizationReady) {
      logState.visible = false;
    }

    adminElements.logButton.disabled = !organizationReady;
    adminElements.logButton.textContent = logState.visible ? 'Скрыть журнал' : 'Журнал мини-приложения';
    adminElements.logButton.setAttribute('aria-expanded', logState.visible ? 'true' : 'false');

    if (logState.visible && organizationReady) {
      adminElements.logPanel.classList.add('is-visible');
      adminElements.logPanel.removeAttribute('hidden');
    } else {
      adminElements.logPanel.classList.remove('is-visible');
      adminElements.logPanel.setAttribute('hidden', 'true');
    }

    var entries = Array.isArray(logState.entries) ? logState.entries : [];
    if (adminElements.logList) {
      adminElements.logList.innerHTML = '';
      if (entries.length) {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i] || {};
          var item = createElement('li', 'documents-admin__log-item');
          var index = createElement('span', 'documents-admin__log-index', String(i + 1));
          item.appendChild(index);

          var content = createElement('div', 'documents-admin__log-item-content');
          var mainRow = createElement('div', 'documents-admin__log-row');
          var name = createElement('span', 'documents-admin__log-name', entry.fullName || 'Без имени');
          var id = createElement('span', 'documents-admin__log-id', entry.id ? 'ID ' + entry.id : 'ID не указан');
          mainRow.appendChild(name);
          mainRow.appendChild(id);

          var extraRow = createElement('div', 'documents-admin__log-row documents-admin__log-row--muted');
          if (entry.username) {
            extraRow.appendChild(createElement('span', 'documents-admin__log-username', '@' + entry.username));
          }
          var formattedDate = entry.lastSeen ? formatAdminLogTimestamp(entry.lastSeen) : '';
          extraRow.appendChild(createElement('span', 'documents-admin__log-date', formattedDate ? formattedDate : 'Нет данных о посещении'));

          content.appendChild(mainRow);
          content.appendChild(extraRow);
          item.appendChild(content);
          adminElements.logList.appendChild(item);
        }
      } else if (logState.visible) {
        var emptyItem = createElement('li', 'documents-admin__log-empty', 'Журнал пока пуст.');
        adminElements.logList.appendChild(emptyItem);
      }
    }

    if (adminElements.logTextarea) {
      adminElements.logTextarea.value = buildAdminLogCopyText(entries);
    }

    if (adminElements.logCopyButton) {
      adminElements.logCopyButton.disabled = entries.length === 0;
    }

    if (!logState.visible) {
      setAdminLogStatus('', 'info');
      return;
    }

    if (logState.loading) {
      setAdminLogStatus('Загружаем журнал...', 'info');
      return;
    }

    if (logState.error) {
      setAdminLogStatus(logState.error, 'error');
      return;
    }

    if (entries.length) {
      setAdminLogStatus('Всего записей: ' + entries.length, 'success');
    } else {
      setAdminLogStatus('Журнал пока пуст. Пользователи ещё не заходили.', 'info');
    }
  }

  function fetchAdminUserLog(options) {
    var logState = ensureAdminUserLogState();
    var force = options && options.force;

    if (!state.organization) {
      logState.error = 'Организация не выбрана.';
      logState.loading = false;
      updateAdminLogPanel();
      return Promise.reject(new Error(logState.error));
    }

    if (logState.loading && logState.promise) {
      return logState.promise;
    }

    var freshThreshold = 60000;
    if (!force && logState.entries.length && Date.now() - logState.lastLoadedAt < freshThreshold) {
      return Promise.resolve(logState.entries);
    }

    logState.loading = true;
    logState.error = '';
    updateAdminLogPanel();

    var request = fetch(buildApiUrl('mini_app_user_journal', {
      organization: state.organization
    }), {
      credentials: 'same-origin'
    })
      .then(handleResponse)
      .then(function(data) {
        var entries = [];
        if (data && Array.isArray(data.entries)) {
          for (var i = 0; i < data.entries.length; i += 1) {
            var entry = data.entries[i];
            if (!entry || typeof entry !== 'object') {
              continue;
            }
            entries.push({
              id: entry.id ? String(entry.id) : '',
              fullName: entry.fullName ? String(entry.fullName) : '',
              username: entry.username ? String(entry.username).replace(/^@/, '') : '',
              lastSeen: entry.lastSeen ? String(entry.lastSeen) : ''
            });
          }
        }

        logState.entries = entries;
        logState.error = '';
        logState.lastLoadedAt = Date.now();
        updateAdminLogPanel();
        return entries;
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : 'Не удалось загрузить журнал.';
        logState.error = message;
        updateAdminLogPanel();
        throw error;
      })
      .finally(function() {
        logState.loading = false;
        logState.promise = null;
        updateAdminLogPanel();
      });

    logState.promise = request;
    return request;
  }

  function openAdminLogPanel() {
    var logState = ensureAdminUserLogState();
    if (!state.organization) {
      setAdminLogStatus('Сначала выберите организацию.', 'error');
      return;
    }
    if (logState.visible) {
      fetchAdminUserLog({ force: true }).catch(function(error) {
        docsLogger.warn('Не удалось обновить журнал:', error);
      });
      return;
    }
    logState.visible = true;
    updateAdminLogPanel();
    fetchAdminUserLog({ force: true }).catch(function(error) {
      docsLogger.warn('Не удалось загрузить журнал:', error);
    });
  }

  function closeAdminLogPanel() {
    var logState = ensureAdminUserLogState();
    if (!logState.visible) {
      return;
    }
    logState.visible = false;
    updateAdminLogPanel();
    if (adminElements.logButton) {
      adminElements.logButton.focus();
    }
  }

  function toggleAdminLogPanel() {
    var logState = ensureAdminUserLogState();
    if (logState.visible) {
      closeAdminLogPanel();
    } else {
      openAdminLogPanel();
    }
  }

  function copyAdminLogToClipboard() {
    ensureAdminModal();
    var logState = ensureAdminUserLogState();
    if (!adminElements.logTextarea) {
      return;
    }
    var text = buildAdminLogCopyText(logState.entries);
    if (!text) {
      setAdminLogStatus('Журнал пуст — копировать нечего.', 'error');
      return;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text)
        .then(function() {
          setAdminLogStatus('Список скопирован в буфер обмена.', 'success');
        })
        .catch(function() {
          fallbackCopy();
        });
      return;
    }

    fallbackCopy();

    function fallbackCopy() {
      try {
        adminElements.logTextarea.focus();
        adminElements.logTextarea.select();
        adminElements.logTextarea.setSelectionRange(0, adminElements.logTextarea.value.length);
        var executed = document.execCommand && document.execCommand('copy');
        if (executed) {
          setAdminLogStatus('Список скопирован в буфер обмена.', 'success');
        } else {
          setAdminLogStatus('Не удалось скопировать автоматически. Выделите текст вручную.', 'error');
        }
      } catch (copyError) {
        setAdminLogStatus('Не удалось скопировать автоматически. Выделите текст вручную.', 'error');
      }
    }
  }

  function openAdminModal() {
    if (!state.organization) {
      showMessage('error', 'Организация для этой страницы не определена.');
      return;
    }
    var adminScope = state.access && typeof state.access.adminScope === 'string'
      ? state.access.adminScope.toLowerCase()
      : '';
    if (!isCurrentUserAdmin() || adminScope === 'director') {
      showMessage('error', 'Доступ к настройкам документов ограничен.');
      return;
    }
    ensureAdminModal();
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ensureAdminUserLogState().visible = false;
    updateAdminLogPanel();
    adminElements.modal.classList.add('is-visible');
    adminElements.modal.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', handleAdminKeydown, true);
    renderAdminRows('responsibles', state.admin.settings.responsibles, true);
    renderAdminRows('block2', state.admin.settings.block2, false);
    renderAdminRows('block3', state.admin.settings.block3, false);
    updateAdminMessage(state.admin.loaded ? '' : 'Загружаем настройки...', false);
    loadAdminSettings({ focus: !state.admin.loaded }).catch(function() {
      // сообщение уже показано в updateAdminMessage
    });
  }

  function closeAdminModal() {
    if (!adminElements.modal) {
      return;
    }
    adminElements.modal.classList.remove('is-visible');
    adminElements.modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleAdminKeydown, true);
    ensureAdminUserLogState().visible = false;
    updateAdminLogPanel();
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function handleAdminKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (ensureAdminUserLogState().visible) {
        closeAdminLogPanel();
      } else {
        closeAdminModal();
      }
    }
  }

  function loadAdminSettings(options) {
    var shouldFocus = Boolean(options && options.focus);
    return fetchAdminSettings()
      .then(function(data) {
        renderAdminRows('responsibles', state.admin.settings.responsibles, shouldFocus);
        renderAdminRows('block2', state.admin.settings.block2, false);
        renderAdminRows('block3', state.admin.settings.block3, false);
        updateAdminMessage(data && data.message ? data.message : 'Настройки загружены.', false);
        return data;
      })
      .catch(function(error) {
        updateAdminMessage('Не удалось загрузить настройки: ' + error.message, true);
        throw error;
      });
  }

  function handleAdminSave() {
    if (state.admin.saving) {
      return;
    }
    clearAdminLoginValidationState();

    var responsiblesData = collectAdminRows('responsibles', { includeMeta: true });
    var directorsData = collectAdminRows('block2', { includeMeta: true });
    var subordinatesData = collectAdminRows('block3', { includeMeta: true });

    var loginValidation = validateAdminLoginUniqueness([responsiblesData, directorsData, subordinatesData]);
    if (!loginValidation.valid) {
      applyAdminLoginValidationFailure(loginValidation);
      return;
    }

    var responsibles = Array.isArray(responsiblesData.rows) ? responsiblesData.rows : [];
    var directors = Array.isArray(directorsData.rows) ? directorsData.rows : [];
    var subordinates = Array.isArray(subordinatesData.rows) ? subordinatesData.rows : [];
    var payload = {
      action: 'save_admin_settings',
      organization: state.organization,
      settings: {
        responsibles: responsibles,
        block2: directors,
        block3: subordinates
      }
    };

    mergeTelegramUserId(payload);

    setAdminSaving(true);
    updateAdminMessage('Сохраняем данные...', false);

    fetch(buildApiUrl('save_admin_settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        if (data && data.settings) {
          applyAdminSettings(data.settings);
        } else {
          applyAdminSettings(payload.settings);
        }
        updateAdminMessage(data && data.message ? data.message : 'Настройки сохранены.', false);
        showMessage('success', data && data.message ? data.message : 'Настройки администратора сохранены.');
        closeAdminModal();
      })
      .catch(function(error) {
        updateAdminMessage('Ошибка сохранения: ' + error.message, true);
      })
      .finally(function() {
        setAdminSaving(false);
      });
  }

  function logSubordinateResolution(details) {
    if (!details || typeof details !== 'object') {
      return;
    }

    var payload = {
      documentId: details.documentId || '',
      candidateId: details.candidateId || '',
      candidateName: details.candidateName || '',
      source: details.source || '',
      matchedRole: details.matchedRole || '',
      telegram: details.telegram || '',
      login: details.login || ''
    };

    if (typeof console !== 'undefined' && typeof docsLogger.log === 'function') {
      docsLogger.log('[documents] subordinate-resolution', payload);
    }

    sendClientDiagnostics('documents_subordinate_resolution', payload);
  }

  function resolveAssigneeList(doc) {
    if (!doc) {
      return [];
    }

    var documentId = doc && doc.id ? doc.id : '';
    var sources = [];
    if (Array.isArray(doc.assignees)) {
      sources = sources.concat(doc.assignees.filter(function(item) {
        return item && typeof item === 'object';
      }));
    }
    if (doc.assignee && typeof doc.assignee === 'object') {
      sources.unshift(doc.assignee);
    }
    if (Array.isArray(doc.subordinates)) {
      doc.subordinates.forEach(function(entry) {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        var clone = {};
        for (var key in entry) {
          if (Object.prototype.hasOwnProperty.call(entry, key)) {
            clone[key] = entry[key];
          }
        }
        if (!clone.role) {
          clone.role = 'subordinate';
        }
        sources.push(clone);
      });
    }
    if (doc.subordinate && typeof doc.subordinate === 'object') {
      var subordinateClone = {};
      for (var subKey in doc.subordinate) {
        if (Object.prototype.hasOwnProperty.call(doc.subordinate, subKey)) {
          subordinateClone[subKey] = doc.subordinate[subKey];
        }
      }
      if (!subordinateClone.role) {
        subordinateClone.role = 'subordinate';
      }
      sources.push(subordinateClone);
    }

    var results = [];
    var seen = Object.create(null);

    sources.forEach(function(info) {
      if (!info || typeof info !== 'object') {
        return;
      }

      var fallbackLabel = '';
      if (info.name) {
        fallbackLabel = String(info.name);
      } else if (info.responsible) {
        fallbackLabel = String(info.responsible);
      } else if (info.email) {
        fallbackLabel = String(info.email);
      } else if (info.telegram) {
        fallbackLabel = String(info.telegram);
      } else if (info.chatId) {
        fallbackLabel = String(info.chatId);
      }

      var fallbackId = info.id || info.telegram || info.chatId || info.email || info.number || fallbackLabel;
      var entry = null;
      var resolutionSource = '';
      var normalizedRole = info.role ? String(info.role).toLowerCase() : '';

      var candidateValues = [
        info.id,
        info.telegram,
        info.chatId,
        info.email,
        info.number,
        info.login,
        info.name,
        info.responsible
      ];

      function matchesInfoName(resolvedEntry) {
        if (!resolvedEntry || typeof resolvedEntry !== 'object') {
          return false;
        }
        var infoName = info.name || info.responsible || '';
        var normalizedInfo = normalizeAssignmentName(infoName);
        if (!normalizedInfo) {
          return true;
        }
        var entryName = resolvedEntry.responsible || resolvedEntry.name || '';
        var normalizedEntry = normalizeAssignmentName(entryName);
        if (!normalizedEntry) {
          return true;
        }
        return normalizedInfo === normalizedEntry;
      }

      function tryResolve(resolver, sourceLabel) {
        if (entry || typeof resolver !== 'function') {
          return;
        }
        for (var i = 0; i < candidateValues.length; i += 1) {
          var candidate = candidateValues[i];
          if (!candidate) {
            continue;
          }
          var resolved = resolver(candidate);
          if (resolved && matchesInfoName(resolved)) {
            entry = resolved;
            resolutionSource = sourceLabel;
            break;
          }
        }
      }

      if (normalizedRole === 'subordinate') {
        tryResolve(findSubordinateById, 'subordinate_index');
      }

      if (!entry) {
        tryResolve(findResponsibleById, normalizedRole === 'subordinate' ? 'responsible_fallback' : 'responsible_index');
      }

      var snapshot = buildAssigneeSnapshot(entry, fallbackLabel, fallbackId);
      if (normalizedRole) {
        snapshot.role = normalizedRole;
      }
      if (normalizedRole === 'subordinate' && info.id) {
        var originalSubordinateId = normalizeResponsibleId(info.id);
        if (originalSubordinateId) {
          snapshot.id = originalSubordinateId;
        }
      }
      if (info.department && !snapshot.department) {
        snapshot.department = info.department;
      }
      if (info.telegram && !snapshot.telegram) {
        snapshot.telegram = info.telegram;
      }
      if (info.chatId && !snapshot.chatId) {
        snapshot.chatId = info.chatId;
      }
      if (info.email && !snapshot.email) {
        snapshot.email = info.email;
      }
      if (info.login && !snapshot.login) {
        snapshot.login = info.login;
      }
      if (info.note && !snapshot.note) {
        snapshot.note = info.note;
      }
      if (info.assignmentComment && !snapshot.assignmentComment) {
        snapshot.assignmentComment = String(info.assignmentComment);
      }
      if (info.assignmentDueDate && !snapshot.assignmentDueDate) {
        snapshot.assignmentDueDate = String(info.assignmentDueDate);
      }
      if (info.assignmentInstruction && !snapshot.assignmentInstruction) {
        snapshot.assignmentInstruction = String(info.assignmentInstruction);
      }
      if (info.assignedAt && !snapshot.assignedAt) {
        snapshot.assignedAt = info.assignedAt;
      }
      if (info.assignedBy && !snapshot.assignedBy) {
        snapshot.assignedBy = info.assignedBy;
      }
      if (info.status) {
        snapshot.status = String(info.status).trim() || snapshot.status;
      }
      if (normalizedRole === 'subordinate' && info.responsible) {
        snapshot.name = info.responsible;
      } else if (!snapshot.name && info.responsible) {
        snapshot.name = info.responsible;
      }
      if (!snapshot.name && info.email) {
        snapshot.name = info.email;
      }
      if (!snapshot.name && snapshot.id) {
        snapshot.name = 'Ответственный #' + snapshot.id;
      }
      if (!snapshot.role && info.role) {
        snapshot.role = String(info.role).toLowerCase();
      }
      if (normalizedRole === 'subordinate') {
        snapshot.role = 'subordinate';
        if (resolutionSource === 'responsible_fallback') {
          logSubordinateResolution({
            documentId: documentId,
            candidateId: fallbackId,
            candidateName: snapshot.name,
            source: resolutionSource,
            matchedRole: entry && entry.role ? String(entry.role) : '',
            telegram: info.telegram || '',
            login: info.login || ''
          });
        }
      }

      var normalizedId = snapshot.id ? normalizeResponsibleId(snapshot.id) : '';
      var normalizedName = snapshot.name ? String(snapshot.name).toLowerCase() : '';
      var roleKey = snapshot.role ? String(snapshot.role).toLowerCase() : '';
      var baseKey = '';
      if (normalizedId) {
        baseKey = 'id::' + normalizedId;
      } else if (normalizedName) {
        baseKey = 'name::' + normalizedName;
      }

      var roleMap = null;
      var matchedIndex = -1;
      if (baseKey) {
        if (!seen[baseKey]) {
          seen[baseKey] = Object.create(null);
        }
        roleMap = seen[baseKey];
        if (roleKey && Object.prototype.hasOwnProperty.call(roleMap, roleKey)) {
          matchedIndex = roleMap[roleKey];
        } else if (roleKey && Object.prototype.hasOwnProperty.call(roleMap, '')) {
          matchedIndex = roleMap[''];
        } else if (!roleKey && Object.prototype.hasOwnProperty.call(roleMap, '')) {
          matchedIndex = roleMap[''];
        } else if (!roleKey) {
          var roleKeys = Object.keys(roleMap);
          for (var rk = 0; rk < roleKeys.length; rk += 1) {
            var candidateRole = roleKeys[rk];
            if (candidateRole !== '') {
              matchedIndex = roleMap[candidateRole];
              break;
            }
          }
          if (matchedIndex === -1 && roleKeys.length === 1) {
            matchedIndex = roleMap[roleKeys[0]];
          }
        }
      }

      if (matchedIndex !== -1) {
        var existing = results[matchedIndex];
        if (!existing.department && snapshot.department) {
          existing.department = snapshot.department;
        }
        if (!existing.telegram && snapshot.telegram) {
          existing.telegram = snapshot.telegram;
        }
        if (!existing.chatId && snapshot.chatId) {
          existing.chatId = snapshot.chatId;
        }
        if (!existing.email && snapshot.email) {
          existing.email = snapshot.email;
        }
        if (!existing.note && snapshot.note) {
          existing.note = snapshot.note;
        }
        if (!existing.assignmentComment && snapshot.assignmentComment) {
          existing.assignmentComment = snapshot.assignmentComment;
        }
        if (!existing.assignmentDueDate && snapshot.assignmentDueDate) {
          existing.assignmentDueDate = snapshot.assignmentDueDate;
        }
        if (!existing.assignmentInstruction && snapshot.assignmentInstruction) {
          existing.assignmentInstruction = snapshot.assignmentInstruction;
        }
        if (!existing.login && snapshot.login) {
          existing.login = snapshot.login;
        }
        if (!existing.assignedAt && snapshot.assignedAt) {
          existing.assignedAt = snapshot.assignedAt;
        }
        if (!existing.assignedBy && snapshot.assignedBy) {
          existing.assignedBy = snapshot.assignedBy;
        }
        if (!existing.role && snapshot.role) {
          existing.role = snapshot.role;
        }
        if (roleMap && roleKey && !Object.prototype.hasOwnProperty.call(roleMap, roleKey)) {
          roleMap[roleKey] = matchedIndex;
        }
        if (roleMap && !roleKey && !Object.prototype.hasOwnProperty.call(roleMap, '')) {
          roleMap[''] = matchedIndex;
        }
        return;
      }

      results.push(snapshot);
      if (roleMap) {
        var newIndex = results.length - 1;
        if (roleKey) {
          roleMap[roleKey] = newIndex;
        } else {
          roleMap[''] = newIndex;
        }
      }
    });

    return results;
  }

  function resolvePrimaryAssignee(doc) {
    var assignees = resolveAssigneeList(doc);
    if (!assignees.length) {
      return null;
    }
    for (var i = 0; i < assignees.length; i += 1) {
      var entry = assignees[i];
      if (!isSubordinateSnapshot(entry)) {
        return entry;
      }
    }
    return assignees[0];
  }

  function isSubordinateSnapshot(entry) {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    var role = entry.role ? String(entry.role).toLowerCase() : '';
    if (role !== '') {
      return role === 'subordinate';
    }
    var index = state.subordinatesIndex || {};
    function has(key) {
      return key && Object.prototype.hasOwnProperty.call(index, key);
    }
    var normalizedId = entry.id ? normalizeResponsibleId(entry.id) : '';
    if (normalizedId) {
      if (has(normalizedId) || has('id::' + normalizedId) || has('telegram::' + normalizedId) || has('chat::' + normalizedId)) {
        return true;
      }
    }
    var telegramId = entry.telegram ? normalizeResponsibleId(entry.telegram) : '';
    if (telegramId) {
      if (has(telegramId) || has('telegram::' + telegramId)) {
        return true;
      }
    }
    var chatId = entry.chatId ? normalizeResponsibleId(entry.chatId) : '';
    if (chatId) {
      if (has(chatId) || has('chat::' + chatId)) {
        return true;
      }
    }
    var email = entry.email ? String(entry.email).toLowerCase() : '';
    if (email && has('email::' + email)) {
      return true;
    }
    var login = entry.login ? String(entry.login).toLowerCase() : '';
    if (login && has('login::' + login)) {
      return true;
    }
    var name = entry.name ? String(entry.name).toLowerCase() : '';
    if (name && has('name::' + name)) {
      return true;
    }
    return false;
  }

  function resolveSubordinateList(doc) {
    var assignees = resolveAssigneeList(doc);
    if (!assignees.length) {
      return [];
    }
    var result = [];
    var seen = Object.create(null);
    assignees.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      if (!isSubordinateSnapshot(entry)) {
        return;
      }
      var key = '';
      if (entry.id) {
        key = 'id::' + normalizeResponsibleId(entry.id);
      }
      if (!key && entry.login) {
        key = 'login::' + String(entry.login).toLowerCase();
      }
      if (!key && entry.name) {
        key = 'name::' + String(entry.name).toLowerCase();
      }
      if (key) {
        if (seen[key]) {
          return;
        }
        seen[key] = true;
      }
      result.push(entry);
    });
    return result;
  }

  function cloneDirectorEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    var clone = {};
    for (var key in entry) {
      if (!Object.prototype.hasOwnProperty.call(entry, key)) {
        continue;
      }
      clone[key] = entry[key];
    }
    return clone;
  }

  function mergeDirectorEntries(primary, secondary) {
    var base = primary && typeof primary === 'object' ? cloneDirectorEntry(primary) || {} : {};
    if (!secondary || typeof secondary !== 'object') {
      return base;
    }

    var overrideFields = ['name', 'responsible'];
    overrideFields.forEach(function(field) {
      if (secondary[field]) {
        base[field] = secondary[field];
      }
    });

    var fillFields = ['id', 'department', 'telegram', 'chatId', 'login', 'email', 'note', 'assignedBy', 'assignedAt'];
    fillFields.forEach(function(field) {
      if (!base[field] && secondary[field]) {
        base[field] = secondary[field];
      }
    });

    return base;
  }

  function normalizeDirectorLabel(label) {
    if (label === null || label === undefined) {
      return '';
    }
    var raw = String(label).trim();
    if (!raw) {
      return '';
    }
    var withoutParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    var cleaned = withoutParens || raw;
    var firstSegment = cleaned.split(/[,;|]/)[0].trim();
    var target = firstSegment || cleaned;
    return normalizeUserIdentifier(target);
  }

  function findDirectorByLabel(label) {
    if (!label) {
      return null;
    }
    var index = state.directorsIndex || {};
    if (!index || typeof index !== 'object') {
      return null;
    }
    var trimmed = String(label).trim();
    if (!trimmed) {
      return null;
    }

    var normalizedIdCandidate = normalizeResponsibleId(trimmed);
    if (normalizedIdCandidate) {
      var directIdKey = 'id::' + normalizedIdCandidate;
      if (Object.prototype.hasOwnProperty.call(index, directIdKey)) {
        return index[directIdKey];
      }
    }

    var digitsOnly = trimmed.replace(/\D+/g, '');
    if (digitsOnly) {
      var idKey = 'id::' + digitsOnly;
      if (Object.prototype.hasOwnProperty.call(index, idKey)) {
        return index[idKey];
      }
      var telegramKey = 'telegram::' + digitsOnly;
      if (Object.prototype.hasOwnProperty.call(index, telegramKey)) {
        return index[telegramKey];
      }
      var chatKey = 'chat::' + digitsOnly;
      if (Object.prototype.hasOwnProperty.call(index, chatKey)) {
        return index[chatKey];
      }
    }

    var normalizedLabel = normalizeDirectorLabel(trimmed);
    if (normalizedLabel) {
      var nameKey = 'name::' + normalizedLabel;
      if (Object.prototype.hasOwnProperty.call(index, nameKey)) {
        return index[nameKey];
      }
      var loginKey = 'login::' + normalizedLabel;
      if (Object.prototype.hasOwnProperty.call(index, loginKey)) {
        return index[loginKey];
      }
      var emailKey = 'email::' + normalizedLabel;
      if (Object.prototype.hasOwnProperty.call(index, emailKey)) {
        return index[emailKey];
      }
    }

    return null;
  }

  function inferDirectorFromAssignments(doc) {
    if (!doc || typeof doc !== 'object') {
      return null;
    }
    var assignees = resolveAssigneeList(doc);
    if (!assignees.length) {
      return null;
    }
    for (var i = 0; i < assignees.length; i += 1) {
      var info = assignees[i];
      if (!info || typeof info !== 'object') {
        continue;
      }
      var assignedBy = info.assignedBy ? String(info.assignedBy).trim() : '';
      if (!assignedBy) {
        continue;
      }
      var matchedDirector = findDirectorByLabel(assignedBy);
      var snapshot = matchedDirector
        ? (cloneDirectorEntry(matchedDirector) || matchedDirector)
        : { name: assignedBy, responsible: assignedBy };
      if (info.assignedAt && !snapshot.assignedAt) {
        snapshot.assignedAt = info.assignedAt;
      }
      if (!snapshot.assignedBy) {
        snapshot.assignedBy = assignedBy;
      }
      return snapshot;
    }
    return null;
  }

  function buildDirectorCacheKey(prefix, value) {
    if (value === null || value === undefined) {
      return '';
    }
    var stringValue = String(value).trim();
    if (!stringValue) {
      return '';
    }
    return prefix + ':' + stringValue;
  }

  function getDocumentDirectorCacheKey(doc) {
    if (!doc || typeof doc !== 'object') {
      return '';
    }

    var candidates = [
      buildDirectorCacheKey('id', doc.id),
      buildDirectorCacheKey('registry', doc.registryNumber || doc.registry_number),
      buildDirectorCacheKey('doc', doc.documentId || doc.document_id),
      buildDirectorCacheKey('number', doc.documentNumber || doc.document_number)
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i]) {
        return candidates[i];
      }
    }

    var organization = doc.organization ? String(doc.organization).trim() : '';
    var title = doc.document ? String(doc.document).trim() : '';
    if (organization || title) {
      return 'fallback:' + organization + ':' + title;
    }

    return '';
  }

  function buildDirectorEntryFromAdmin(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    var snapshot = buildAssigneeSnapshot(entry, entry.responsible || '', getResponsibleId(entry));
    if (!snapshot) {
      return null;
    }
    if (!snapshot.responsible && entry.responsible) {
      snapshot.responsible = entry.responsible;
    }
    if (!snapshot.name && snapshot.responsible) {
      snapshot.name = snapshot.responsible;
    }
    return snapshot;
  }

  function resolveDirectorFromAdminSettings() {
    var list = state.admin && state.admin.settings && Array.isArray(state.admin.settings.block2)
      ? state.admin.settings.block2
      : [];
    for (var i = 0; i < list.length; i += 1) {
      var snapshot = buildDirectorEntryFromAdmin(list[i]);
      if (snapshot) {
        return snapshot;
      }
    }
    return null;
  }

  function resolveDirectorEntry(doc) {
    if (!doc || typeof doc !== 'object') {
      return null;
    }

    var storedDirector = resolveStoredDirectorEntry(doc);
    if (storedDirector) {
      return storedDirector;
    }

    var inferredDirector = inferDirectorFromAssignments(doc);
    if (inferredDirector) {
      var inferredSnapshot = cloneDirectorEntry(inferredDirector) || inferredDirector;
      if (doc.director && typeof doc.director === 'object') {
        doc.director = mergeDirectorEntries(doc.director, inferredSnapshot);
      } else {
        doc.director = inferredSnapshot;
      }
      return doc.director;
    }

    var adminDirector = resolveDirectorFromAdminSettings();
    if (adminDirector) {
      return adminDirector;
    }
    return null;
  }

  function resolveStoredDirectorEntry(doc) {
    if (!doc || typeof doc !== 'object') {
      return null;
    }
    if (doc.director && typeof doc.director === 'object' && Object.keys(doc.director).length) {
      return doc.director;
    }
    if (Array.isArray(doc.directors) && doc.directors.length) {
      for (var d = 0; d < doc.directors.length; d += 1) {
        if (doc.directors[d] && typeof doc.directors[d] === 'object' && Object.keys(doc.directors[d]).length) {
          return doc.directors[d];
        }
      }
    }
    return null;
  }

  function buildDirectorMetaLines(entry) {
    var lines = [];
    if (!entry || typeof entry !== 'object') {
      return lines;
    }
    if (entry.department) {
      lines.push(String(entry.department));
    }
    if (entry.telegram) {
      lines.push('TG: ' + String(entry.telegram));
    }
    if (entry.chatId) {
      lines.push('ID: ' + String(entry.chatId));
    }
    if (entry.login) {
      lines.push('Логин: ' + String(entry.login));
    }
    if (entry.email) {
      lines.push(String(entry.email));
    }
    if (entry.note) {
      lines.push(String(entry.note));
    }
    if (entry.assignedBy) {
      lines.push('Назначил: ' + String(entry.assignedBy));
    }
    if (entry.assignedAt) {
      var assignedAt = formatDateTime(entry.assignedAt);
      if (assignedAt && assignedAt !== '—') {
        lines.push('Назначено: ' + assignedAt);
      }
    }
    return lines;
  }

  function formatDirectorSummary(doc) {
    var entry = resolveDirectorEntry(doc);
    if (!entry) {
      return '—';
    }
    var parts = [];
    var name = entry.name || entry.responsible || entry.email || entry.telegram || entry.id || '';
    if (name) {
      parts.push(String(name));
    }
    var metaLines = buildDirectorMetaLines(entry);
    for (var i = 0; i < metaLines.length; i += 1) {
      parts.push(metaLines[i]);
    }
    return parts.length ? parts.join('\n') : '—';
  }

  function resolveAssigneeData(doc) {
    var list = resolveAssigneeList(doc);
    return list.length ? list[0] : null;
  }

  var pdfLibLoadingPromise = null;
  var pdfFontBytesPromise = null;
  var pdfFontkitPromise = null;

  function ensurePdfLib() {
    if (window.PDFLib && window.PDFLib.PDFDocument) {
      return Promise.resolve(window.PDFLib);
    }
    if (pdfLibLoadingPromise) {
      return pdfLibLoadingPromise;
    }
    pdfLibLoadingPromise = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.async = true;
      script.onload = function() {
        if (window.PDFLib && window.PDFLib.PDFDocument) {
          resolve(window.PDFLib);
        } else {
          reject(new Error('PDF библиотека недоступна.'));
        }
      };
      script.onerror = function() {
        reject(new Error('Не удалось загрузить PDF библиотеку.'));
      };
      document.head.appendChild(script);
    }).catch(function(error) {
      pdfLibLoadingPromise = null;
      throw error;
    });
    return pdfLibLoadingPromise;
  }

  function resolvePdfFontkitGlobal() {
    if (window.__pdfFontkitInstance) {
      return window.__pdfFontkitInstance;
    }
    var candidate = window.fontkit || window.Fontkit || window.pdfFontkit;
    if (candidate && candidate.default) {
      candidate = candidate.default;
    }
    if (candidate) {
      window.__pdfFontkitInstance = candidate;
      return candidate;
    }
    return null;
  }

  function ensurePdfFontkit() {
    var existing = resolvePdfFontkitGlobal();
    if (existing) {
      return Promise.resolve(existing);
    }
    if (pdfFontkitPromise) {
      return pdfFontkitPromise;
    }
    pdfFontkitPromise = new Promise(function(resolve, reject) {
      var script = document.querySelector('script[data-pdf-fontkit]');
      if (script && script.dataset.fontkitState === 'error') {
        try {
          script.parentNode.removeChild(script);
        } catch (removeError) {
          docsLogger.warn('Не удалось удалить неуспешно загруженный скрипт fontkit.', removeError);
        }
        script = null;
      }
      var resolved = false;

      function handleLoad() {
        if (resolved) {
          return;
        }
        resolved = true;
        if (script) {
          script.dataset.fontkitState = 'loaded';
        }
        var instance = resolvePdfFontkitGlobal();
        if (instance) {
          resolve(instance);
        } else {
          reject(new Error('fontkit недоступен после загрузки.'));
        }
      }

      function handleError() {
        if (resolved) {
          return;
        }
        resolved = true;
        if (script) {
          script.dataset.fontkitState = 'error';
        }
        reject(new Error('Не удалось загрузить fontkit.'));
      }

      if (!script) {
        script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
        script.async = true;
        script.dataset.pdfFontkit = 'true';
        script.dataset.fontkitState = 'loading';
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });
        document.head.appendChild(script);
      } else {
        if (!script.dataset.fontkitState) {
          script.dataset.fontkitState = 'loading';
        }
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });
        if (script.readyState === 'loaded' || script.readyState === 'complete') {
          setTimeout(handleLoad, 0);
        }
      }
    })
      .catch(function(error) {
        pdfFontkitPromise = null;
        throw error;
      });
    return pdfFontkitPromise;
  }

  function fetchPdfFontBytes(url) {
    return fetch(url)
      .then(function(response) {
        if (!response || !response.ok) {
          throw new Error('HTTP ' + (response ? response.status : '0') + ' при загрузке ' + url);
        }
        return response.arrayBuffer();
      })
      .then(function(buffer) {
        return new Uint8Array(buffer);
      });
  }

  function loadPdfFontBytes() {
    if (pdfFontBytesPromise) {
      return pdfFontBytesPromise;
    }
    pdfFontBytesPromise = Promise.all([
      fetchPdfFontBytes('/shrift/Roboto-Regular.ttf'),
      fetchPdfFontBytes('/shrift/RobotoFlex.ttf').catch(function() {
        return null;
      })
    ])
      .then(function(fonts) {
        var regularFont = fonts[0];
        var boldFont = fonts[1] || fonts[0];
        if (!regularFont) {
          throw new Error('Основной шрифт для PDF недоступен.');
        }
        return {
          regular: regularFont,
          bold: boldFont
        };
      })
      .catch(function(error) {
        pdfFontBytesPromise = null;
        throw error;
      });
    return pdfFontBytesPromise;
  }

  function sanitizeFileName(value) {
    if (!value) {
      return '';
    }
    var text = String(value).trim();
    if (!text) {
      return '';
    }
    text = text.replace(/[\\/:*?"<>|]+/g, '');
    text = text.replace(/\s+/g, '_');
    if (text.length > 120) {
      text = text.slice(0, 120);
    }
    return text;
  }

  function buildPdfFileName(doc) {
    var parts = ['Документ'];
    if (doc.registryNumber) {
      parts.push(doc.registryNumber);
    } else if (doc.documentNumber) {
      parts.push(doc.documentNumber);
    } else if (doc.entryNumber) {
      parts.push(String(doc.entryNumber));
    }
    if (state.organization) {
      parts.push(state.organization);
    }
    var base = sanitizeFileName(parts.join('_')) || 'document';
    return base + '.pdf';
  }

  function sanitizePdfText(font, text) {
    if (text === null || text === undefined) {
      return '';
    }
    var value = String(text);
    if (!font) {
      return value;
    }
    var sanitizer = font.__bimmaxSanitize;
    if (typeof sanitizer === 'function') {
      try {
        return sanitizer(value);
      } catch (error) {
        docsLogger.warn('Не удалось обработать текст для PDF.', error);
        return value;
      }
    }
    return value;
  }

  function drawPdfText(page, text, options) {
    if (!page || !options) {
      return;
    }
    var drawOptions = options;
    var font = drawOptions.font;
    var preparedText = sanitizePdfText(font, text);
    page.drawText(preparedText, drawOptions);
  }

  function drawPdfUnderline(page, text, options) {
    if (!page || !options || !text) {
      return;
    }
    var font = options.font;
    if (!font || typeof font.widthOfTextAtSize !== 'function') {
      return;
    }
    var preparedText = sanitizePdfText(font, text);
    if (!preparedText) {
      return;
    }
    var size = options.size || 10;
    var x = options.x || 0;
    var y = options.y || 0;
    var thickness = options.thickness || 0.8;
    var width = font.widthOfTextAtSize(preparedText, size);
    if (!width || width <= 0) {
      return;
    }
    page.drawRectangle({
      x: x,
      y: y - thickness - 1.5,
      width: width,
      height: thickness,
      color: options.color,
      opacity: options.opacity
    });
  }

  function wrapTextForPdf(font, text, maxWidth, fontSize) {
    var result = [];
    if (text === null || text === undefined) {
      result.push('—');
      return result;
    }
    var content = String(text);
    if (!content.trim()) {
      result.push('—');
      return result;
    }
    var paragraphs = content.split(/\r?\n/);
    for (var i = 0; i < paragraphs.length; i += 1) {
      var paragraph = paragraphs[i].trim();
      if (!paragraph) {
        result.push('');
        continue;
      }
      var words = paragraph.split(/\s+/);
      var current = '';
      for (var j = 0; j < words.length; j += 1) {
        var word = sanitizePdfText(font, words[j]);
        var candidate = current ? current + ' ' + word : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !current) {
          current = candidate;
        } else {
          result.push(current);
          current = word;
        }
      }
      if (current) {
        result.push(current);
      }
    }
    if (!result.length) {
      result.push('—');
    }
    return result;
  }

  function formatDateTimeDisplay(value) {
    var text = formatDateTime(value);
    return text ? text : '—';
  }

  function getFileExtension(file) {
    if (!file) {
      return '';
    }
    var name = '';
    if (file.originalName) {
      name = file.originalName;
    } else if (file.storedName) {
      name = file.storedName;
    }
    if (!name) {
      return '';
    }
    var index = name.lastIndexOf('.');
    if (index === -1) {
      return '';
    }
    return name.slice(index + 1).toLowerCase();
  }

  function getAttachmentName(file, fallbackIndex) {
    if (!file) {
      return fallbackIndex ? 'Файл ' + fallbackIndex : 'Файл';
    }
    return file.originalName || file.storedName || file.fileName || file.name || (fallbackIndex ? 'Файл ' + fallbackIndex : 'Файл');
  }

  function getAttachmentSummaryList(list) {
    return Array.isArray(list) ? list : [];
  }

  function isOfficeAttachment(file, mimeType) {
    var extension = getFileExtension(file);
    var officeExtensions = [
      'doc', 'docx', 'docm',
      'xls', 'xlsx', 'xlsm',
      'ppt', 'pptx', 'pptm'
    ];
    if (extension && officeExtensions.indexOf(extension) !== -1) {
      return true;
    }
    var type = mimeType ? String(mimeType).toLowerCase() : '';
    if (!type) {
      type = file && file.type ? String(file.type).toLowerCase() : '';
    }
    return type.indexOf('officedocument') !== -1
      || type.indexOf('msword') !== -1
      || type.indexOf('msexcel') !== -1
      || type.indexOf('excel') !== -1
      || type.indexOf('powerpoint') !== -1;
  }

  function isHeicAttachment(file, mimeType) {
    var extension = getFileExtension(file);
    if (extension === 'heic' || extension === 'heif') {
      return true;
    }
    var type = mimeType ? String(mimeType).toLowerCase() : '';
    if (!type && file && file.type) {
      type = String(file.type).toLowerCase();
    }
    return type.indexOf('heic') !== -1 || type.indexOf('heif') !== -1;
  }

  function appendCacheBuster(raw) {
    if (!raw) {
      return '';
    }
    try {
      var parsed = new URL(raw, window.location.origin);
      parsed.searchParams.set('_', Date.now());
      return parsed.href;
    } catch (error) {
      var separator = raw.indexOf('?') === -1 ? '?' : '&';
      return raw + separator + '_=' + Date.now();
    }
  }

  function buildDocumentSummaryRows(doc, attachmentsOverride) {
    function resolveStatusValue() {
      if (!doc || typeof doc !== 'object') {
        return '—';
      }
      var userStatus = resolveCurrentUserStatus(doc);
      if (userStatus) {
        return userStatus;
      }
      if (doc.assignee && doc.assignee.status) {
        var assigneeStatus = String(doc.assignee.status).trim();
        if (assigneeStatus) {
          return assigneeStatus;
        }
      }
      var primaryAssignee = resolvePrimaryAssignee(doc);
      if (primaryAssignee && primaryAssignee.status) {
        var primaryStatus = String(primaryAssignee.status).trim();
        if (primaryStatus) {
          return primaryStatus;
        }
      }
      var directStatus = doc.status ? String(doc.status).trim() : '';
      if (directStatus) {
        return directStatus;
      }
      return '—';
    }

    function buildAssignmentLines(list, fallbackRole, emptyText) {
      if (!Array.isArray(list) || !list.length) {
        return [emptyText];
      }
      var lines = [];
      list.forEach(function(assignee, index) {
        if (!assignee) {
          return;
        }
        var nameLine = assignee.name
          ? assignee.name
          : (assignee.id ? fallbackRole + ' #' + assignee.id : fallbackRole);
        lines.push(nameLine);
        var meta = [];
        if (assignee.department) {
          meta.push(assignee.department);
        }
        if (assignee.telegram) {
          meta.push('TG: ' + assignee.telegram);
        }
        if (assignee.email) {
          meta.push(assignee.email);
        }
        if (assignee.status) {
          meta.push('Статус: ' + assignee.status);
        }
        if (assignee.chatId) {
          meta.push('ID: ' + assignee.chatId);
        }
        if (meta.length) {
          lines.push(meta.join(' • '));
        }
        var role = assignee.role ? String(assignee.role).toLowerCase() : '';
        if (assignee.note && role !== 'subordinate') {
          lines.push(assignee.note);
        }
        if (assignee.assignmentComment) {
          lines.push('Комментарий: ' + assignee.assignmentComment);
        }
        if (assignee.assignedAt) {
          var assignedAt = formatDateTime(assignee.assignedAt);
          if (assignedAt) {
            lines.push('Назначено: ' + assignedAt);
          }
        }
        if (index < list.length - 1) {
          lines.push('');
        }
      });
      return lines;
    }

    function resolveInstructionSummary() {
      if (!doc || typeof doc !== 'object') {
        return '—';
      }
      var instructionValue = doc.instruction ? String(doc.instruction).trim() : '';
      var primaryAssignee = resolvePrimaryAssignee(doc);
      if (!instructionValue && primaryAssignee && primaryAssignee.assignmentInstruction) {
        instructionValue = String(primaryAssignee.assignmentInstruction).trim();
      }
      var assignments = buildInstructionAssignments(doc);
      var lines = [];
      if (instructionValue) {
        lines.push(instructionValue);
      }
      if (assignments.length) {
        assignments.forEach(function(entry) {
          if (entry && entry.formatted) {
            lines.push(entry.formatted);
          }
        });
      }
      return lines.length ? lines.join('\n') : '—';
    }

    function resolveDueDateSummary() {
      var dueEntries = buildDueDateAssignments(doc);
      if (!dueEntries.length) {
        return formatDate(doc.dueDate);
      }
      var lines = [];
      dueEntries.forEach(function(entry) {
        if (!entry) {
          return;
        }
        var label = entry.label ? String(entry.label).trim() : '';
        var dueText = formatDueDateValue(entry.dueDate);
        if (label) {
          lines.push(label + ': ' + dueText);
        } else {
          lines.push(dueText);
        }
      });
      return lines.length ? lines.join('\n') : '—';
    }

    var allAssignees = resolveAssigneeList(doc);
    var assigneeList = allAssignees.filter(function(entry) {
      return !isSubordinateSnapshot(entry);
    });
    var subordinateList = resolveSubordinateList(doc);
    var assigneeLines = buildAssignmentLines(assigneeList, 'Ответственный', 'Не назначен');
    var subordinateLines = buildAssignmentLines(subordinateList, 'Подчинённый', 'Не назначены');

    var attachmentsList = getAttachmentSummaryList(attachmentsOverride);
    if (!attachmentsList.length && Array.isArray(doc.files) && doc.files.length) {
      attachmentsList = doc.files;
    }

    var attachmentsText = 'Нет вложений';
    if (attachmentsList.length) {
      var lines = [];
      for (var i = 0; i < attachmentsList.length; i += 1) {
        var file = attachmentsList[i];
        var fileName = getAttachmentName(file, i + 1);
        lines.push((i + 1) + '. ' + fileName);
      }
      attachmentsText = lines.join('\n');
    }

    return [
      { label: 'Номер записи', value: doc.entryNumber ? String(doc.entryNumber) : '—' },
      { label: 'Регистрационный №', value: doc.registryNumber || '—' },
      { label: 'Дата регистрации', value: formatDate(doc.registrationDate) },
      { label: 'Тип', value: doc.direction || '—' },
      { label: 'Корреспондент', value: doc.correspondent || '—' },
      { label: '№ документа', value: doc.documentNumber || '—' },
      { label: 'Дата документа', value: formatDate(doc.documentDate) },
      { label: 'Исполнитель', value: doc.executor || '—' },
      { label: 'Директор', value: formatDirectorSummary(doc) },
      { label: 'Ответственный', value: assigneeLines.join('\n') },
      { label: 'Подчинённые', value: subordinateLines.join('\n') },
      { label: 'Содержание', value: doc.summary || '—' },
      { label: 'Резолюция', value: doc.resolution || '—' },
      { label: 'Срок исполнения', value: resolveDueDateSummary() },
      { label: 'Поручения', value: resolveInstructionSummary() },
      { label: 'Статус', value: resolveStatusValue() },
      { label: 'Файлы', value: attachmentsText }
    ];
  }

  function downloadBlob(blob, filename) {
    if (!blob) {
      return;
    }
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename || 'document.pdf';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function resolveAttachmentUrl(file, options) {
    var raw = file && file.url ? file.url : '';
    if (!raw) {
      return '';
    }
    try {
      var parsed = new URL(raw, window.location.origin);
      if (options && options.bustCache) {
        parsed.searchParams.set('_', Date.now());
      }
      return parsed.href;
    } catch (error) {
      if (options && options.bustCache) {
        return appendCacheBuster(raw);
      }
      return raw;
    }
  }

  function buildAttachmentErrorPage(pdfDoc, PDFLib, fonts, colors, margin, file, errorMessage, fileUrl) {
    var page = pdfDoc.addPage([595.28, 841.89]);
    drawAttachmentHeader(page, fonts, colors, file, {
      margin: margin,
      subtitle: errorMessage,
      titlePrefix: 'Вложение'
    });
    var size = page.getSize();
    var width = size.width;
    var startY = size.height - 160;
    var fontSize = 12;
    var lines = [];
    if (fileUrl) {
      lines = wrapTextForPdf(fonts.regular, 'Ссылка на оригинал: ' + fileUrl, width - margin * 2, fontSize);
    }
    if (!lines.length) {
      lines = wrapTextForPdf(fonts.regular, 'Ссылка на оригинал недоступна.', width - margin * 2, fontSize);
    }
    for (var i = 0; i < lines.length; i += 1) {
      drawPdfText(page, lines[i], {
        x: margin,
        y: startY - i * (fontSize + 2),
        size: fontSize,
        font: fonts.regular,
        color: colors.value
      });
    }
  }

  function decodeTextAttachmentBuffer(buffer) {
    if (!buffer) {
      return '';
    }
    var decodeWith = function(encoding) {
      try {
        var decoder = new TextDecoder(encoding, { fatal: false });
        return decoder.decode(buffer);
      } catch (error) {
        return '';
      }
    };
    var utf8 = decodeWith('utf-8');
    var hasReplacement = utf8.indexOf('\uFFFD') !== -1;
    var windows1251 = decodeWith('windows-1251');
    var rawText = windows1251 && hasReplacement ? windows1251 : utf8;
    var normalized = (rawText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
    if (!normalized) {
      return '';
    }
    return normalized.length > 12000 ? normalized.slice(0, 12000) : normalized;
  }

  function buildAttachmentTextPage(pdfDoc, fonts, colors, margin, file, textContent) {
    var page = pdfDoc.addPage([595.28, 841.89]);
    drawAttachmentHeader(page, fonts, colors, file, {
      margin: margin,
      subtitle: 'TXT-вложение',
      titlePrefix: 'Вложение'
    });
    var size = page.getSize();
    var width = size.width;
    var cursorY = size.height - 98;
    var lineHeight = 13;
    var fontSize = 11;
    var maxBottom = 38;
    var lines = wrapTextForPdf(fonts.regular, textContent || 'Пустой TXT-файл.', width - margin * 2, fontSize);
    for (var i = 0; i < lines.length; i += 1) {
      if (cursorY < maxBottom) {
        page = pdfDoc.addPage([595.28, 841.89]);
        drawAttachmentHeader(page, fonts, colors, file, {
          margin: margin,
          subtitle: 'TXT-вложение (продолжение)',
          titlePrefix: 'Вложение'
        });
        cursorY = page.getSize().height - 98;
      }
      drawPdfText(page, lines[i], {
        x: margin,
        y: cursorY,
        size: fontSize,
        font: fonts.regular,
        color: colors.value
      });
      cursorY -= lineHeight;
    }
  }

  function drawAttachmentHeader(page, fonts, colors, file, options) {
    var margin = options && options.margin ? options.margin : 40;
    var headerHeight = options && options.headerHeight ? options.headerHeight : 72;
    var size = page.getSize();
    var width = size.width;
    var height = size.height;
    page.drawRectangle({
      x: 0,
      y: height - headerHeight,
      width: width,
      height: headerHeight,
      color: colors.header,
      opacity: 0.9
    });
    var titlePrefix = options && options.titlePrefix ? options.titlePrefix : 'Вложение';
    var fileName = file && (file.originalName || file.storedName)
      ? (file.originalName || file.storedName)
      : 'Файл';
    var titleText = titlePrefix + ': ' + fileName;
    var titleLines = wrapTextForPdf(fonts.bold, titleText, width - margin * 2, 14);
    var currentY = height - 28;
    for (var i = 0; i < titleLines.length; i += 1) {
      drawPdfText(page, titleLines[i], {
        x: margin,
        y: currentY,
        size: 14,
        font: fonts.bold,
        color: colors.title
      });
      currentY -= 16;
    }
    var subtitle = options && options.subtitle ? options.subtitle : '';
    if (!subtitle) {
      var metaParts = [];
      if (file && file.size) {
        var sizeText = formatSize(file.size);
        if (sizeText) {
          metaParts.push(sizeText);
        }
      }
      if (file && file.uploadedAt) {
        var uploadedText = formatDateTime(file.uploadedAt);
        if (uploadedText) {
          metaParts.push(uploadedText);
        }
      }
      if (metaParts.length) {
        subtitle = metaParts.join(' • ');
      }
    }
    if (subtitle) {
      var subtitleLines = wrapTextForPdf(fonts.regular, subtitle, width - margin * 2, 10);
      var subtitleY = height - headerHeight + 18;
      for (var j = 0; j < subtitleLines.length; j += 1) {
        drawPdfText(page, subtitleLines[j], {
          x: margin,
          y: subtitleY,
          size: 10,
          font: fonts.regular,
          color: colors.muted
        });
        subtitleY += 12;
      }
    }
  }

  async function appendAttachmentPages(pdfDoc, PDFLib, fonts, colors, margin, attachments) {
    if (!Array.isArray(attachments) || !attachments.length) {
      return;
    }
    for (var i = 0; i < attachments.length; i += 1) {
      var file = attachments[i];
      if (!file || !file.url) {
        continue;
      }
      if (isOfficeAttachment(file)) {
        continue;
      }
      var resolvedUrl = resolveAttachmentUrl(file, { bustCache: true });
      try {
        var response = await fetch(resolvedUrl, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Статус ' + response.status);
        }
        var buffer = await response.arrayBuffer();
        var mimeType = '';
        if (response.headers && response.headers.get) {
          mimeType = (response.headers.get('Content-Type') || '').toLowerCase();
        }
        var extension = getFileExtension(file);
        var isPdf = mimeType.indexOf('pdf') !== -1 || extension === 'pdf';
        var isPng = mimeType.indexOf('png') !== -1 || extension === 'png';
        var isJpeg = mimeType.indexOf('jpeg') !== -1 || mimeType.indexOf('jpg') !== -1 || extension === 'jpg' || extension === 'jpeg';
        var isOffice = isOfficeAttachment(file, mimeType);
        var isTxt = mimeType.indexOf('text/plain') !== -1 || extension === 'txt';

        if (isOffice) {
          continue;
        }
        if (isPdf) {
          var attachment = await PDFLib.PDFDocument.load(buffer);
          var indices = attachment.getPageIndices();
          var copied = await pdfDoc.copyPages(attachment, indices);
          for (var p = 0; p < copied.length; p += 1) {
            var page = copied[p];
            pdfDoc.addPage(page);
            try {
              var noteLines = wrapTextForPdf(fonts.regular, (i + 1) + '. ' + (file.originalName || file.storedName || 'PDF-файл'), page.getWidth() - margin * 2, 9);
              for (var nl = 0; nl < noteLines.length; nl += 1) {
                drawPdfText(page, noteLines[nl], {
                  x: margin,
                  y: 18 + nl * 12,
                  size: 9,
                  font: fonts.regular,
                  color: colors.muted,
                  opacity: 0.8
                });
              }
            } catch (footnoteError) {
              docsLogger.warn('Не удалось добавить подпись к PDF-вложению:', footnoteError);
            }
          }
        } else if (isPng || isJpeg) {
          var imagePage = pdfDoc.addPage([595.28, 841.89]);
          drawAttachmentHeader(imagePage, fonts, colors, file, { margin: margin });
          var embedded;
          if (isPng) {
            embedded = await pdfDoc.embedPng(buffer);
          } else {
            embedded = await pdfDoc.embedJpg(buffer);
          }
          var pageSize = imagePage.getSize();
          var maxWidth = pageSize.width - margin * 2;
          var headerHeight = 72;
          var maxHeight = pageSize.height - headerHeight - margin;
          var dimensions = embedded.scale(1);
          var widthScale = maxWidth / dimensions.width;
          var heightScale = maxHeight / dimensions.height;
          var scale = Math.min(widthScale, heightScale, 1);
          var scaled = embedded.scale(scale);
          var x = (pageSize.width - scaled.width) / 2;
          var y = (pageSize.height - headerHeight - scaled.height) / 2;
          if (y < margin / 2) {
            y = margin / 2;
          }
          imagePage.drawImage(embedded, {
            x: x,
            y: y,
            width: scaled.width,
            height: scaled.height
          });
        } else if (isTxt) {
          var textContent = decodeTextAttachmentBuffer(buffer);
          buildAttachmentTextPage(pdfDoc, fonts, colors, margin, file, textContent);
        } else {
          buildAttachmentErrorPage(pdfDoc, PDFLib, fonts, colors, margin, file, 'Формат вложения не поддерживается в предпросмотре.', resolvedUrl);
        }
      } catch (attachmentError) {
        docsLogger.error('Ошибка обработки вложения:', attachmentError);
        buildAttachmentErrorPage(pdfDoc, PDFLib, fonts, colors, margin, file, 'Не удалось загрузить файл: ' + attachmentError.message, resolvedUrl);
      }
    }
  }

  async function generateDocumentPdf(doc, options) {
    if (!doc) {
      throw new Error('Документ не найден.');
    }
    var config = options && typeof options === 'object' ? options : {};
    var summaryAttachments = getAttachmentSummaryList(config.summaryAttachments);
    if (!summaryAttachments.length && Array.isArray(doc.files)) {
      summaryAttachments = doc.files;
    }
    var appendAttachments = getAttachmentSummaryList(config.appendAttachments);
    if (!appendAttachments.length && Array.isArray(doc.files)) {
      appendAttachments = doc.files;
    }
    var PDFLib = await ensurePdfLib();
    if (!PDFLib || !PDFLib.PDFDocument) {
      throw new Error('PDF библиотека недоступна.');
    }
    var pdfDoc = await PDFLib.PDFDocument.create();
    try {
      var fontkitInstance = await ensurePdfFontkit();
      if (fontkitInstance && typeof pdfDoc.registerFontkit === 'function') {
        pdfDoc.registerFontkit(fontkitInstance);
      }
    } catch (fontkitError) {
      docsLogger.warn('Не удалось подключить fontkit для PDF, будут использоваться встроенные шрифты библиотеки.', fontkitError);
    }
    var page = pdfDoc.addPage([595.28, 841.89]);
    var size = page.getSize();
    var width = size.width;
    var height = size.height;
    var margin = 48;
    var fonts;
    try {
      var fontBytes = await loadPdfFontBytes();
      fonts = {
        regular: await pdfDoc.embedFont(fontBytes.regular, { subset: true }),
        bold: await pdfDoc.embedFont(fontBytes.bold, { subset: true })
      };
    } catch (fontError) {
      docsLogger.warn('Не удалось загрузить пользовательские шрифты для PDF, используется Helvetica.', fontError);
      fonts = {
        regular: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold)
      };
      var fallbackSanitizer = function(value) {
        var text = value === null || value === undefined ? '' : String(value);
        return text.replace(/[^\x00-\x7F]/g, '?');
      };
      fonts.regular.__bimmaxSanitize = fallbackSanitizer;
      fonts.bold.__bimmaxSanitize = fallbackSanitizer;
    }
    var colors = {
      header: PDFLib.rgb(0.94, 0.97, 1),
      title: PDFLib.rgb(0.13, 0.2, 0.34),
      value: PDFLib.rgb(0.09, 0.14, 0.24),
      muted: PDFLib.rgb(0.45, 0.52, 0.6),
      label: PDFLib.rgb(0.33, 0.4, 0.52),
      separator: PDFLib.rgb(0.85, 0.9, 0.95)
    };

    page.drawRectangle({
      x: 0,
      y: height - 96,
      width: width,
      height: 96,
      color: colors.header
    });
    var title = 'Карточка документа';
    drawPdfText(page, title, {
      x: margin,
      y: height - 44,
      size: 22,
      font: fonts.bold,
      color: colors.title
    });
    if (state.organization) {
      drawPdfText(page, 'Организация: ' + state.organization, {
        x: margin,
        y: height - 70,
        size: 11,
        font: fonts.regular,
        color: colors.muted
      });
    }
    var generatedAt = formatDateTimeDisplay(new Date());
    drawPdfText(page, 'Сформировано: ' + generatedAt, {
      x: margin,
      y: height - 86,
      size: 10,
      font: fonts.regular,
      color: colors.muted
    });

    var rows = buildDocumentSummaryRows(doc, summaryAttachments);
    var labelFontSize = 10;
    var valueFontSize = 10;
    var lineHeight = 14;
    var labelX = margin;
    var valueX = margin + 160;
    var maxValueWidth = width - valueX - margin;
    var currentY = height - 132;

    page.drawRectangle({
      x: margin,
      y: currentY + 10,
      width: width - margin * 2,
      height: 1.2,
      color: colors.separator
    });
    currentY -= 20;

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var isInstructionRow = row.label === 'Поручения';
      var valueLines = wrapTextForPdf(fonts.regular, row.value, maxValueWidth, valueFontSize);
      drawPdfText(page, row.label + ':', {
        x: labelX,
        y: currentY,
        size: labelFontSize,
        font: fonts.bold,
        color: colors.label
      });
      if (isInstructionRow) {
        drawPdfUnderline(page, row.label + ':', {
          x: labelX,
          y: currentY,
          size: labelFontSize,
          font: fonts.bold,
          color: colors.label,
          thickness: 0.9
        });
      }
      for (var j = 0; j < valueLines.length; j += 1) {
        drawPdfText(page, valueLines[j], {
          x: valueX,
          y: currentY - j * lineHeight,
          size: valueFontSize,
          font: isInstructionRow ? fonts.bold : fonts.regular,
          color: colors.value
        });
        if (isInstructionRow) {
          drawPdfUnderline(page, valueLines[j], {
            x: valueX,
            y: currentY - j * lineHeight,
            size: valueFontSize,
            font: fonts.bold,
            color: colors.value,
            thickness: 0.9
          });
        }
      }
      currentY -= valueLines.length * lineHeight + 6;
    }

    var storageLine = state.storageDisplayPath || state.storagePath || '';
    if (storageLine) {
      var storageText = 'Путь хранения: ' + storageLine;
      var storageLines = wrapTextForPdf(fonts.regular, storageText, width - margin * 2, 10);
      for (var s = 0; s < storageLines.length; s += 1) {
        drawPdfText(page, storageLines[s], {
          x: margin,
          y: margin + 12 + s * 12,
          size: 10,
          font: fonts.regular,
          color: colors.muted
        });
      }
    }

    await appendAttachmentPages(pdfDoc, PDFLib, fonts, colors, margin, appendAttachments);

    var pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }

  function handlePdfDownload(button, doc) {
    if (!button || !doc) {
      return;
    }
    recordDocumentView(doc, 'download_button');
    var initialText = button.textContent;
    button.disabled = true;
    button.textContent = 'Скачиваем...';
    var allAttachments = Array.isArray(doc.files) ? doc.files.slice() : [];
    generateDocumentPdf(doc, {
      summaryAttachments: allAttachments,
      appendAttachments: []
    })
      .then(function(blob) {
        downloadBlob(blob, buildPdfFileName(doc));
        return Promise.allSettled(allAttachments.map(function(file) {
          return downloadAttachmentFile(file);
        })).then(function(results) {
          var hasFailures = results.some(function(result) {
            return result.status === 'rejected';
          });
          if (hasFailures) {
            showMessage('warning', 'Карточка скачана, но часть файлов не удалось загрузить.');
          } else if (allAttachments.length) {
            showMessage('success', 'Карточка и файлы скачаны.');
          } else {
            showMessage('success', 'Карточка скачана.');
          }
        });
      })
      .catch(function(error) {
        docsLogger.error('Ошибка скачивания:', error);
        showMessage('error', 'Не удалось скачать данные: ' + error.message);
      })
      .finally(function() {
        button.disabled = false;
        button.textContent = initialText;
      });
  }

  function buildAttachmentPdfFileName(doc, file) {
    var baseName = buildPdfFileName(doc).replace(/\.pdf$/i, '');
    var fileName = sanitizeFileName(getAttachmentName(file));
    if (fileName) {
      return baseName + '_' + fileName + '.pdf';
    }
    return baseName + '_вложение.pdf';
  }

  function triggerAttachmentDownload(file) {
    var url = resolveAttachmentUrl(file, { bustCache: true });
    if (!url) {
      return;
    }
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadAttachmentFile(file) {
    if (!file) {
      return Promise.resolve();
    }
    var url = resolveAttachmentUrl(file, { bustCache: true });
    if (!url) {
      return Promise.resolve();
    }
    return fetch(url, { credentials: 'include', cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Статус ' + response.status);
        }
        return response.blob();
      })
      .then(function(blob) {
        var fileName = sanitizeFileName(getAttachmentName(file));
        downloadBlob(blob, fileName || 'attachment');
      });
  }

  function openBlobInNewTab(blob) {
    if (!blob) {
      return;
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function handleAttachmentPreview(doc, file, link) {
    if (!doc || !file) {
      return;
    }
    recordDocumentView(doc, 'file_link');
    var attachmentName = getAttachmentName(file);
    if (link) {
      link.setAttribute('aria-busy', 'true');
    }
    showMessage('info', 'Готовим предпросмотр файла: ' + attachmentName);
    var isOffice = isOfficeAttachment(file);
    var isHeic = isHeicAttachment(file);

    if (isHeic) {
      var heicUrl = resolveAttachmentUrl(file, { bustCache: true });
      if (heicUrl) {
        var heicLink = document.createElement('a');
        heicLink.href = heicUrl;
        heicLink.target = '_blank';
        heicLink.rel = 'noopener';
        document.body.appendChild(heicLink);
        heicLink.click();
        document.body.removeChild(heicLink);
        showMessage('success', 'Файл HEIC открыт в новой вкладке.');
      } else {
        showMessage('error', 'Не удалось открыть файл HEIC: отсутствует ссылка.');
      }
      if (link) {
        link.removeAttribute('aria-busy');
      }
      return;
    }

    var summaryAttachments = [file];
    var appendAttachments = isOffice ? [] : [file];
    generateDocumentPdf(doc, {
      summaryAttachments: summaryAttachments,
      appendAttachments: appendAttachments
    })
      .then(function(blob) {
        if (isOffice) {
          openBlobInNewTab(blob);
          triggerAttachmentDownload(file);
          showMessage('success', 'Информация и офисный файл открыты отдельно.');
          return;
        }
        openBlobInNewTab(blob);
        showMessage('success', 'Предпросмотр готов.');
      })
      .catch(function(error) {
        docsLogger.error('Ошибка предпросмотра файла:', error);
        showMessage('error', 'Не удалось подготовить файл: ' + error.message);
      })
      .finally(function() {
        if (link) {
          link.removeAttribute('aria-busy');
        }
      });
  }

  function createAssigneeEntryNode(assignee, options) {
    var entryNode = createElement('div', 'documents-assignee__entry');
    var config = options && typeof options === 'object' ? options : {};
    if (config.unviewed) {
      entryNode.classList.add('documents-assignee__entry--unviewed');
    }
    var nameText = assignee && assignee.name
      ? assignee.name
      : (assignee && assignee.id ? 'Ответственный #' + assignee.id : 'Не назначен');
    entryNode.appendChild(createElement('div', 'documents-assignee__name', nameText));

    if (assignee) {
      var metaParts = [];
      if (assignee.department) {
        metaParts.push(assignee.department);
      }
      if (assignee.telegram) {
        metaParts.push('TG: ' + assignee.telegram);
      }
      if (assignee.chatId) {
        metaParts.push('ID: ' + assignee.chatId);
      }
      if (assignee.email) {
        metaParts.push(assignee.email);
      }
      if (metaParts.length) {
        entryNode.appendChild(createElement('div', 'documents-assignee__meta', metaParts.join(' • ')));
      }
      if (assignee.note) {
        entryNode.appendChild(createElement('div', 'documents-assignee__note', assignee.note));
      }
      if (assignee.status) {
        entryNode.appendChild(createElement('div', 'documents-assignee__status', 'Статус: ' + assignee.status));
      }
      if (assignee.assignedBy) {
        entryNode.appendChild(createElement('div', 'documents-assignee__meta', 'Назначил: ' + assignee.assignedBy));
      }
      if (assignee.assignedAt) {
        var assignedAt = formatDateTime(assignee.assignedAt);
        if (assignedAt) {
          entryNode.appendChild(createElement('div', 'documents-assignee__meta documents-assignee__meta--muted', 'Назначено: ' + assignedAt));
        }
      }
    }

    if (config.viewedAt && !config.unviewed) {
      var viewedAt = formatStatusTimestamp(config.viewedAt) || formatDateTime(config.viewedAt);
      if (viewedAt) {
        entryNode.appendChild(createElement('div', 'documents-assignee__meta documents-assignee__meta--muted', 'Просмотрено: ' + viewedAt));
      }
    }

    if (config.unviewed) {
      entryNode.appendChild(createElement('div', 'documents-assignee__badge documents-assignee__badge--unviewed', 'Не просмотрено'));
    }

    if (config.unviewed && typeof config.onResend === 'function') {
      entryNode.classList.add('documents-assignee__entry--actionable');
      entryNode.setAttribute('role', 'button');
      entryNode.setAttribute('tabindex', '0');
      var handle = function(event) {
        event.preventDefault();
        event.stopPropagation();
        config.onResend({ event: event, entryNode: entryNode });
      };
      entryNode.addEventListener('click', handle);
      entryNode.addEventListener('keydown', function(event) {
        var key = event.key || '';
        if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space') {
          handle(event);
        }
      });
    }

    return entryNode;
  }

  function shouldAllowAssigneeStatusSelection() {
    var disallowed = {
      director: true,
      administrator: true,
      admin: true,
      responsible: true,
      subordinate: true,
      'директор': true,
      'администратор': true,
      'ответственный': true,
      'подчиненный': true,
      'подчинённый': true,
      'руководитель': true
    };

    var candidates = [];
    if (state.access && typeof state.access === 'object') {
      if (state.access.role) {
        candidates.push(state.access.role);
      }
      if (state.access.user && typeof state.access.user === 'object') {
        if (state.access.user.role) {
          candidates.push(state.access.user.role);
        }
        if (state.access.user.responsibleRole) {
          candidates.push(state.access.user.responsibleRole);
        }
      }
    }
    if (state.effectiveUserRole) {
      candidates.push(state.effectiveUserRole);
    }

    for (var i = 0; i < candidates.length; i += 1) {
      var normalized = normalizeRoleValue(candidates[i]);
      if (!normalized) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(disallowed, normalized) && disallowed[normalized]) {
        return false;
      }
    }

    return true;
  }

  function createAssignmentEditor(initialAssignees, options) {
    var config = options && typeof options === 'object' ? options : {};
    var fillSelect = typeof config.fillSelect === 'function' ? config.fillSelect : fillResponsibleSelect;
    var updateHintFn = typeof config.updateHint === 'function' ? config.updateHint : updateResponsibleHint;
    var addButtonLabel = config.addButtonLabel || 'Добавить';
    var defaultRole = config.role ? String(config.role).toLowerCase() : 'responsible';
    var resolveEntry = typeof config.resolveEntry === 'function' ? config.resolveEntry : findResponsibleById;
    var allowStatusSelection = shouldAllowAssigneeStatusSelection();
    var statusPlaceholder = defaultRole === 'subordinate'
      ? 'Статус подчинённого не выбран'
      : 'Статус ответственного не выбран';
    var statusAriaLabel = defaultRole === 'subordinate'
      ? 'Статус подчинённого'
      : 'Статус ответственного';

    var showHint = config.showHint !== undefined ? Boolean(config.showHint) : defaultRole !== 'responsible';
    var directorEnhanced = defaultRole === 'responsible' && normalizeRoleValue(state.effectiveUserRole || '') === 'director';
    var allowDeadline = config.allowDeadline === true;
    var allowInstructionAssignment = canAssignInstructionsToUsers();
    var isSubordinateEditor = defaultRole === 'subordinate';
    var isSubordinateUser = isSubordinateEditor && isCurrentUserSubordinate();

    var wrapper = createElement('div', 'documents-assignees');
    var list = createElement('div', 'documents-assignees__list');
    wrapper.appendChild(list);

    var rows = [];
    var initialMap = Object.create(null);
    if (Array.isArray(initialAssignees)) {
      initialAssignees.forEach(function(entry) {
        if (!entry || !entry.id) {
          return;
        }
        var key = normalizeResponsibleId(entry.id);
        if (key) {
          initialMap[key] = entry;
        }
        var compositeKey = buildCompositeResponsibleKey(entry);
        if (compositeKey) {
          initialMap[compositeKey] = entry;
        }
      });
    }

    function isHigherRoleLabel(label) {
      if (!label) {
        return false;
      }
      var normalized = normalizeRoleValue(label);
      if (!normalized) {
        return false;
      }
      if (normalized === 'admin' || normalized === 'administrator') {
        return true;
      }
      if (normalized === 'director') {
        return true;
      }
      if (normalized === 'responsible') {
        return true;
      }
      if (normalized.indexOf('администратор') !== -1) {
        return true;
      }
      if (normalized.indexOf('директор') !== -1) {
        return true;
      }
      if (normalized.indexOf('руководител') !== -1) {
        return true;
      }
      if (normalized.indexOf('ответствен') !== -1) {
        return true;
      }
      return false;
    }

    function isAssignedByCurrentUser(label) {
      if (!label || !state.userAssignmentKeyMap) {
        return false;
      }
      var trimmed = String(label).trim();
      if (!trimmed) {
        return false;
      }
      var resolvedAssigner = findResponsibleById(trimmed) || findDirectorByLabel(trimmed);
      if (resolvedAssigner && matchesCurrentUserAssignee(resolvedAssigner)) {
        return true;
      }
      var normalizedId = normalizeAssigneeIdentifier(trimmed);
      if (normalizedId && Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, 'id::' + normalizedId)) {
        return true;
      }
      var normalizedName = normalizeUserIdentifier(trimmed);
      if (normalizedName && Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, 'name::' + normalizedName)) {
        return true;
      }
      var simplifiedName = normalizeDirectorLabel(trimmed);
      if (simplifiedName && Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, 'name::' + simplifiedName)) {
        return true;
      }
      return false;
    }

    function isProtectedSubordinateAssignment(entry) {
      if (!isSubordinateUser) {
        return false;
      }
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      var assignedBy = entry.assignedBy ? String(entry.assignedBy).trim() : '';
      if (!assignedBy) {
        return false;
      }
      if (isAssignedByCurrentUser(assignedBy)) {
        return false;
      }
      if (isHigherRoleLabel(assignedBy)) {
        return true;
      }
      var directorMatch = findDirectorByLabel(assignedBy);
      if (directorMatch) {
        return true;
      }
      var responsibleMatch = findResponsibleById(assignedBy);
      if (responsibleMatch) {
        var matchRole = responsibleMatch.role ? String(responsibleMatch.role) : '';
        if (!isSubordinateRole(matchRole)) {
          return true;
        }
      }
      return false;
    }

    function syncRemoveButtons() {
      var activeRows = rows.filter(function(item) {
        return item && item.row && list.contains(item.row);
      });
      var disable = activeRows.length <= 1;
      activeRows.forEach(function(item) {
        if (item.removeButton) {
          item.removeButton.disabled = disable || item.locked;
        }
      });
    }

    function ensureOption(select, snapshot) {
      if (!select || !snapshot) {
        return;
      }
      var normalizedId = snapshot.id ? normalizeResponsibleId(snapshot.id) : '';
      var compositeKey = buildCompositeResponsibleKey(snapshot);
      if (!normalizedId && !compositeKey) {
        return;
      }
      var targetOption = null;
      Array.prototype.forEach.call(select.options, function(option) {
        var optionValue = normalizeResponsibleId(option.value);
        if ((normalizedId && optionValue === normalizedId)
          || (compositeKey && optionValue === compositeKey)) {
          targetOption = option;
        }
      });
      if (!targetOption) {
        var optionValue = compositeKey || snapshot.id || normalizedId;
        targetOption = createElement('option', '', snapshot.name || optionValue);
        targetOption.value = optionValue;
        select.appendChild(targetOption);
      }
      if (snapshot.name) {
        targetOption.dataset.name = snapshot.name;
      }
      if (snapshot.department) {
        targetOption.dataset.department = snapshot.department;
      }
      if (snapshot.telegram) {
        targetOption.dataset.telegram = snapshot.telegram;
      }
      if (snapshot.chatId) {
        targetOption.dataset.chatId = snapshot.chatId;
      }
      if (snapshot.email) {
        targetOption.dataset.email = snapshot.email;
      }
      if (snapshot.note) {
        targetOption.dataset.note = snapshot.note;
      }
      var roleValue = snapshot.role ? String(snapshot.role).toLowerCase() : defaultRole;
      if (roleValue) {
        targetOption.dataset.role = roleValue;
      }
      select.value = compositeKey || snapshot.id || normalizedId;
    }

    function fillStatusSelect(select, selectedValue) {
      if (!select) {
        return;
      }
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
      var placeholderOption = createElement('option', '', statusPlaceholder);
      placeholderOption.value = '';
      select.appendChild(placeholderOption);

      var normalized = selectedValue ? String(selectedValue).trim() : '';
      var matched = false;
      ASSIGNEE_STATUS_OPTIONS.forEach(function(statusOption) {
        var option = createElement('option', '', statusOption);
        option.value = statusOption;
        if (normalized && statusOption === normalized) {
          option.selected = true;
          matched = true;
        }
        select.appendChild(option);
      });

      if (normalized && !matched) {
        var customOption = createElement('option', '', normalized);
        customOption.value = normalized;
        customOption.selected = true;
        select.appendChild(customOption);
      }

      if (!normalized) {
        select.value = '';
      }
    }

    function addRow(prefill) {
      var row = createElement('div', 'documents-assignees__row');
      if (defaultRole === 'subordinate') {
        row.classList.add('documents-assignees__row--subordinate');
      } else if (directorEnhanced) {
        row.classList.add('documents-assignees__row--director');
      } else if (allowDeadline && defaultRole === 'responsible') {
        row.classList.add('documents-assignees__row--deadline');
      }
      var selectWrapper = createElement('div', 'documents-assignees__select');
      var select = document.createElement('select');
      selectWrapper.appendChild(select);
      row.appendChild(selectWrapper);

      var commentWrapper = null;
      var commentInput = null;
      var deadlineWrapper = null;
      var deadlineInput = null;
      var instructionWrapper = null;
      var instructionSelect = null;
      var showComment = defaultRole === 'subordinate' || directorEnhanced;
      var showDeadline = defaultRole === 'subordinate' || directorEnhanced || allowDeadline;
      if (showComment) {
        commentWrapper = createElement('div', 'documents-assignees__comment');
        commentInput = document.createElement('textarea');
        commentInput.className = 'documents-assignees__comment-input';
        commentInput.setAttribute('rows', '2');
        commentInput.setAttribute('maxlength', '500');
        commentInput.placeholder = directorEnhanced ? 'Комментарий для ответственного' : 'Комментарий для подчинённого';
        commentWrapper.appendChild(commentInput);
        row.appendChild(commentWrapper);
      }
      if (showDeadline) {
        deadlineWrapper = createElement('div', 'documents-assignees__deadline');
        var deadlineLabel = createElement('div', 'documents-assignees__deadline-label', 'Срок исполнения');
        deadlineWrapper.appendChild(deadlineLabel);
        deadlineInput = document.createElement('input');
        deadlineInput.type = 'date';
        deadlineInput.className = 'documents-assignees__deadline-input';
        deadlineWrapper.appendChild(deadlineInput);
        if (directorEnhanced || (allowDeadline && defaultRole === 'responsible') || !showComment) {
          row.appendChild(deadlineWrapper);
        } else if (commentWrapper) {
          commentWrapper.appendChild(deadlineWrapper);
        }
      }

      if (allowInstructionAssignment) {
        instructionWrapper = createElement('div', 'documents-assignees__instruction');
        var instructionLabel = createElement('div', 'documents-assignees__instruction-label', 'Поручение');
        instructionWrapper.appendChild(instructionLabel);
        instructionSelect = document.createElement('select');
        instructionSelect.className = 'documents-assignees__instruction-select';
        instructionWrapper.appendChild(instructionSelect);
        row.appendChild(instructionWrapper);
        if (!directorEnhanced) {
          row.classList.add('documents-assignees__row--instruction');
        }
      }

      var statusWrapper = null;
      var statusSelect = null;
      if (allowStatusSelection) {
        statusWrapper = createElement('div', 'documents-assignees__status');
        statusSelect = document.createElement('select');
        statusSelect.setAttribute('aria-label', statusAriaLabel);
        statusWrapper.appendChild(statusSelect);
        row.appendChild(statusWrapper);
      }

      fillSelect(select, prefill && prefill.id ? prefill.id : '');

      if (prefill && prefill.id) {
        ensureOption(select, prefill);
      }

      var isLocked = isProtectedSubordinateAssignment(prefill);
      if (isLocked) {
        var lockedValue = select.value;
        if (lockedValue) {
          select.dataset.lockedValue = lockedValue;
        }
      }

      if (commentInput) {
        commentInput.value = prefill && prefill.assignmentComment ? String(prefill.assignmentComment) : '';
      }

      if (deadlineInput) {
        deadlineInput.value = prefill && prefill.assignmentDueDate ? String(prefill.assignmentDueDate) : '';
      }

      if (instructionSelect) {
        buildInstructionSelectOptions(instructionSelect, prefill && prefill.assignmentInstruction ? String(prefill.assignmentInstruction) : '');
      }

      if (statusSelect) {
        var prefillStatus = prefill && prefill.status ? String(prefill.status) : '';
        fillStatusSelect(statusSelect, prefillStatus);
        if (select.disabled) {
          statusSelect.disabled = true;
        }
      }

      var removeButton = createElement('button', 'documents-assignees__remove', 'Убрать');
      removeButton.type = 'button';
      if (isLocked) {
        removeButton.disabled = true;
        removeButton.title = 'Нельзя удалить подчинённого, назначенного руководством';
      }
      row.appendChild(removeButton);

      var hint = null;
      if (showHint) {
        hint = createElement('div', 'documents-assignee__hint', '');
        row.appendChild(hint);
      }

      function syncStatusAvailability() {
        if (!statusSelect) {
          return;
        }
        if (select.disabled) {
          statusSelect.disabled = true;
          return;
        }
        var hasAssignee = Boolean(select.value);
        statusSelect.disabled = !hasAssignee;
        if (!hasAssignee) {
          statusSelect.value = '';
        }
      }

      function syncCommentAvailability() {
        if (commentInput) {
          if (select.disabled) {
            commentInput.disabled = true;
          } else {
            commentInput.disabled = !select.value;
          }
        }
        if (deadlineInput) {
          if (select.disabled) {
            deadlineInput.disabled = true;
          } else {
            deadlineInput.disabled = !select.value;
          }
        }
        if (instructionSelect) {
          if (select.disabled) {
            instructionSelect.disabled = true;
          } else {
            instructionSelect.disabled = !select.value;
          }
          if (instructionSelect.disabled) {
            instructionSelect.value = '';
          }
        }
      }

      select.addEventListener('change', function() {
        if (select.dataset && select.dataset.lockedValue) {
          var lockedRaw = select.dataset.lockedValue;
          var locked = normalizeResponsibleId(lockedRaw);
          var current = normalizeResponsibleId(select.value);
          if (locked && locked !== current) {
            select.value = lockedRaw;
            updateHintFn(select, hint);
            syncRemoveButtons();
            syncStatusAvailability();
            syncCommentAvailability();
            return;
          }
        }
        updateHintFn(select, hint);
        syncRemoveButtons();
        syncStatusAvailability();
        syncCommentAvailability();
        if (commentInput) {
          var normalizedSelected = normalizeResponsibleId(select.value);
          if (!normalizedSelected) {
            commentInput.value = '';
          } else if (initialMap[normalizedSelected] && initialMap[normalizedSelected].assignmentComment) {
            commentInput.value = String(initialMap[normalizedSelected].assignmentComment);
          } else {
            commentInput.value = '';
          }
        }
        if (deadlineInput) {
          var normalizedForDue = normalizeResponsibleId(select.value);
          if (!normalizedForDue) {
            deadlineInput.value = '';
          } else if (initialMap[normalizedForDue] && initialMap[normalizedForDue].assignmentDueDate) {
            deadlineInput.value = String(initialMap[normalizedForDue].assignmentDueDate);
          } else {
            deadlineInput.value = '';
          }
        }
        if (instructionSelect) {
          var normalizedForInstruction = normalizeResponsibleId(select.value);
          if (!normalizedForInstruction) {
            buildInstructionSelectOptions(instructionSelect, '');
          } else if (initialMap[normalizedForInstruction] && initialMap[normalizedForInstruction].assignmentInstruction) {
            buildInstructionSelectOptions(instructionSelect, String(initialMap[normalizedForInstruction].assignmentInstruction));
          } else {
            buildInstructionSelectOptions(instructionSelect, '');
          }
        }
      });

      if (statusSelect) {
        statusSelect.addEventListener('change', function() {
          if (statusSelect.disabled || !select.value) {
            statusSelect.value = '';
          }
        });
      }

      removeButton.addEventListener('click', function() {
        if (isLocked) {
          return;
        }
        if (rows.length <= 1) {
          select.value = '';
          updateHintFn(select, hint);
          return;
        }
        if (list.contains(row)) {
          list.removeChild(row);
        }
        rows = rows.filter(function(item) {
          return item.row !== row;
        });
        syncRemoveButtons();
      });

      list.appendChild(row);
      rows.push({
        row: row,
        select: select,
        statusSelect: statusSelect,
        commentInput: commentInput,
        deadlineInput: deadlineInput,
        instructionSelect: instructionSelect,
        hint: hint,
        removeButton: removeButton,
        locked: isLocked
      });
      updateHintFn(select, hint);
      syncStatusAvailability();
      syncCommentAvailability();
      syncRemoveButtons();
    }

    if (Array.isArray(initialAssignees) && initialAssignees.length) {
      initialAssignees.forEach(function(entry) {
        addRow(entry);
      });
    } else {
      addRow(null);
    }

    var addButton = createElement('button', 'documents-assignees__add', addButtonLabel);
    addButton.type = 'button';
    addButton.addEventListener('click', function() {
      addRow(null);
      var lastRow = rows[rows.length - 1];
      if (lastRow && lastRow.select) {
        lastRow.select.focus();
      }
    });
    wrapper.appendChild(addButton);

    function hasMissingTelegramSelection() {
      var hasMissing = false;
      rows.forEach(function(item) {
        if (!item || !item.select || !list.contains(item.row)) {
          return;
        }
        if (!item.select.value) {
          return;
        }
        if (!hasTelegramIdForSelect(item.select)) {
          markMissingTelegram(item.select, item.hint);
          hasMissing = true;
        } else {
          clearMissingTelegram(item.select);
        }
      });
      return hasMissing;
    }

    function collect() {
      var result = [];
      var seen = Object.create(null);
      rows.forEach(function(item) {
        if (!item || !item.select || !list.contains(item.row)) {
          return;
        }
        var value = normalizeResponsibleId(item.select.value);
        if (!value || seen[value]) {
          return;
        }
        if (!hasTelegramIdForSelect(item.select)) {
          markMissingTelegram(item.select, item.hint);
          return;
        }
        var selectedOption = item.select.options[item.select.selectedIndex];
        var snapshot = buildAssigneeSnapshot(
          resolveEntry(value),
          selectedOption ? selectedOption.textContent : '',
          value
        );
        if (selectedOption && selectedOption.dataset) {
          if (selectedOption.dataset.name) {
            snapshot.name = selectedOption.dataset.name;
          }
          if (selectedOption.dataset.department) {
            snapshot.department = selectedOption.dataset.department;
          }
          if (selectedOption.dataset.telegram) {
            snapshot.telegram = selectedOption.dataset.telegram;
          }
          if (selectedOption.dataset.chatId) {
            snapshot.chatId = selectedOption.dataset.chatId;
          }
          if (selectedOption.dataset.email) {
            snapshot.email = selectedOption.dataset.email;
          }
          if (selectedOption.dataset.note) {
            snapshot.note = selectedOption.dataset.note;
          }
          if (selectedOption.dataset.role) {
            snapshot.role = String(selectedOption.dataset.role).toLowerCase();
          }
        }
        var existing = initialMap[value];
        if (existing && existing.assignedAt && !snapshot.assignedAt) {
          snapshot.assignedAt = existing.assignedAt;
        }
        if (existing && existing.status && !snapshot.status) {
          snapshot.status = String(existing.status);
        }
        if (existing && existing.assignmentDueDate && !snapshot.assignmentDueDate) {
          snapshot.assignmentDueDate = String(existing.assignmentDueDate);
        }
        if (!snapshot.role) {
          snapshot.role = defaultRole;
        }
        if (item.statusSelect && !item.statusSelect.disabled) {
          var statusValue = String(item.statusSelect.value || '').trim();
          if (statusValue) {
            snapshot.status = statusValue;
          } else if (snapshot.status) {
            delete snapshot.status;
          }
        }
        if (item.commentInput) {
          var commentValue = String(item.commentInput.value || '').trim();
          if (commentValue) {
            snapshot.assignmentComment = commentValue;
          } else if (snapshot.assignmentComment) {
            delete snapshot.assignmentComment;
          }
        }
        if (item.deadlineInput) {
          var dueValue = String(item.deadlineInput.value || '').trim();
          if (dueValue) {
            snapshot.assignmentDueDate = dueValue;
          } else if (snapshot.assignmentDueDate) {
            delete snapshot.assignmentDueDate;
          }
        }
        if (item.instructionSelect) {
          var instructionValue = String(item.instructionSelect.value || '').trim();
          if (instructionValue) {
            snapshot.assignmentInstruction = instructionValue;
          } else if (snapshot.assignmentInstruction) {
            delete snapshot.assignmentInstruction;
          }
        }
        result.push(snapshot);
        seen[value] = true;
      });
      return result;
    }

    return {
      element: wrapper,
      collect: collect,
      hasMissingTelegramSelection: hasMissingTelegramSelection,
      focus: function() {
        if (rows[0] && rows[0].select) {
          rows[0].select.focus();
        }
      }
    };
  }

  function createAssigneesEditor(initialAssignees) {
    return createAssignmentEditor(initialAssignees, {
      fillSelect: fillResponsibleSelect,
      updateHint: updateResponsibleHint,
      addButtonLabel: 'Добавить ответственного',
      role: 'responsible',
      allowDeadline: true
    });
  }

  function createSubordinatesEditor(initialAssignees) {
    return createAssignmentEditor(initialAssignees, {
      fillSelect: fillSubordinateSelect,
      updateHint: updateSubordinateHint,
      addButtonLabel: 'Добавить подчинённого',
      role: 'subordinate',
      resolveEntry: findSubordinateById
    });
  }

  function createDirectorCell(doc) {
    var container = createElement('div', 'documents-director');
    var entry = resolveDirectorEntry(doc);

    if (!entry) {
      container.appendChild(createElement('div', 'documents-director__empty', 'Не выбран'));
      return container;
    }

    var name = entry.name || entry.responsible || entry.email || entry.telegram || entry.id || '';
    var nameNode = createElement('div', 'documents-director__name', name || '—');
    container.appendChild(nameNode);

    var metaLines = buildDirectorMetaLines(entry);
    metaLines.forEach(function(line) {
      container.appendChild(createElement('div', 'documents-director__meta', line));
    });

    var canRemindDirector = isCurrentUserAdmin();
    if (canRemindDirector) {
      var actions = createElement('div', 'documents-director__actions');
      var remindButton = createElement(
        'button',
        'documents-action documents-action--remind',
        'Отправить напоминание'
      );
      remindButton.type = 'button';
      var hasTelegram = Boolean(entry.telegram || entry.chatId);
      if (!hasTelegram) {
        remindButton.disabled = true;
        remindButton.title = TELEGRAM_MISSING_MESSAGE;
      } else {
        remindButton.addEventListener('click', function() {
          resendDirectorNotification(doc, entry, remindButton);
        });
      }
      actions.appendChild(remindButton);
      container.appendChild(actions);
    }

    return container;
  }

  function createAssigneeCell(doc, viewState) {
    var container = createElement('div', 'documents-assignee');
    var info = createElement('div', 'documents-assignee__info');
    var allAssignees = resolveAssigneeList(doc);
    var assignees = allAssignees.filter(function(entry) {
      return !isSubordinateSnapshot(entry);
    });
    var resolvedViewState = viewState && typeof viewState === 'object'
      ? viewState
      : collectAssigneeViewState(doc);
    var primaryAssignee = assignees.length ? assignees[0] : (allAssignees.length ? allAssignees[0] : null);

    if (resolvedViewState.responsibles.length) {
      resolvedViewState.responsibles.forEach(function(entryInfo) {
        var entry = entryInfo.assignee;
        var options = {
          viewedAt: entryInfo.viewedAt,
          unviewed: !entryInfo.isViewed,
          role: entryInfo.role
        };
        if (!entryInfo.isViewed) {
          options.onResend = function(context) {
            resendAssigneeNotification(doc, entryInfo, context.entryNode);
          };
        }
        info.appendChild(createAssigneeEntryNode(entry, options));
      });
    } else {
      info.appendChild(createElement('div', 'documents-assignee__empty', 'Не назначен'));
    }

    container.appendChild(info);

    var unviewedResponsibles = resolvedViewState.unviewedResponsibles || [];
    if (unviewedResponsibles.length) {
      container.dataset.unviewed = 'true';
      var names = unviewedResponsibles.map(function(item) {
        var assignee = item && item.assignee ? item.assignee : null;
        if (!assignee) {
          return '';
        }
        if (assignee.name) {
          return String(assignee.name);
        }
        if (assignee.responsible) {
          return String(assignee.responsible);
        }
        if (assignee.email) {
          return String(assignee.email);
        }
        if (assignee.telegram) {
          return String(assignee.telegram);
        }
        return '';
      }).filter(function(value) {
        return value !== null && value !== undefined && String(value).trim() !== '';
      });
      if (names.length) {
        container.title = 'Не просмотрено: ' + names.join(', ');
      } else if (container.hasAttribute('title')) {
        container.removeAttribute('title');
      }
    } else {
      container.dataset.unviewed = 'false';
      if (container.hasAttribute('title')) {
        container.removeAttribute('title');
      }
    }

    var canManageAssignees = isCurrentUserAdmin();
    if (canManageAssignees) {
      var button = createElement('button', 'documents-action documents-action--assign', primaryAssignee ? 'Изменить' : 'Назначить');
      button.type = 'button';
      button.addEventListener('click', function() {
        openAssigneeModal(doc);
      });
      container.appendChild(button);
    }

    return container;
  }

  function canManageSubordinates() {
    if (!state.access) {
      return false;
    }
    if (isCurrentUserAdmin()) {
      return true;
    }
    if (state.access.role !== 'user') {
      return false;
    }
    var userRole = '';
    if (state.access.user && typeof state.access.user === 'object') {
      if (state.access.user.role) {
        userRole = String(state.access.user.role);
      } else if (state.access.user.responsibleRole) {
        userRole = String(state.access.user.responsibleRole);
      }
    }
    userRole = userRole ? userRole.toLowerCase() : '';
    if (!userRole) {
      return false;
    }
    var allowed = {
      director: true,
      responsible: true,
      administrator: true,
      admin: true,
      'директор': true,
      'ответственный': true,
      'администратор': true,
      'руководитель': true
    };
    return Boolean(allowed[userRole]);
  }

  function createSubordinateCell(doc, viewState) {
    var container = createElement('div', 'documents-assignee');
    var info = createElement('div', 'documents-assignee__info');
    var subordinates = resolveSubordinateList(doc);
    var resolvedViewState = viewState && typeof viewState === 'object'
      ? viewState
      : collectAssigneeViewState(doc);

    if (resolvedViewState.subordinates.length) {
      resolvedViewState.subordinates.forEach(function(entryInfo) {
        var entry = entryInfo.assignee;
        var options = {
          viewedAt: entryInfo.viewedAt,
          unviewed: !entryInfo.isViewed,
          role: entryInfo.role
        };
        if (!entryInfo.isViewed) {
          options.onResend = function(context) {
            resendAssigneeNotification(doc, entryInfo, context.entryNode);
          };
        }
        info.appendChild(createAssigneeEntryNode(entry, options));
      });
    } else {
      info.appendChild(createElement('div', 'documents-assignee__empty', 'Не назначены'));
    }

    container.appendChild(info);

    var unviewedSubordinates = resolvedViewState.unviewedSubordinates || [];
    if (unviewedSubordinates.length) {
      container.dataset.unviewed = 'true';
      var names = unviewedSubordinates.map(function(item) {
        var assignee = item && item.assignee ? item.assignee : null;
        if (!assignee) {
          return '';
        }
        if (assignee.name) {
          return String(assignee.name);
        }
        if (assignee.responsible) {
          return String(assignee.responsible);
        }
        if (assignee.email) {
          return String(assignee.email);
        }
        if (assignee.telegram) {
          return String(assignee.telegram);
        }
        return '';
      }).filter(function(value) {
        return value !== null && value !== undefined && String(value).trim() !== '';
      });
      if (names.length) {
        container.title = 'Не просмотрено: ' + names.join(', ');
      } else if (container.hasAttribute('title')) {
        container.removeAttribute('title');
      }
    } else {
      container.dataset.unviewed = 'false';
      if (container.hasAttribute('title')) {
        container.removeAttribute('title');
      }
    }

    if (canManageSubordinates()) {
      var button = createElement('button', 'documents-action documents-action--assign', subordinates.length ? 'Изменить' : 'Назначить');
      button.type = 'button';
      button.addEventListener('click', function() {
        openSubordinateModal(doc);
      });
      container.appendChild(button);
    }

    return container;
  }

  function normalizeUserIdentifier(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var normalized = String(value).trim();
    return normalized ? normalized.toLowerCase() : '';
  }

  function buildAssigneeKeyCandidates(entry) {
    var keys = [];
    if (!entry || typeof entry !== 'object') {
      return keys;
    }
    var seen = Object.create(null);
    var idCandidates = [
      entry.id,
      entry.telegram,
      entry.telegramId,
      entry.telegramUsername,
      entry.chatId,
      entry.number,
      entry.responsibleNumber,
      entry.email,
      entry.login,
      entry.username
    ];
    for (var i = 0; i < idCandidates.length; i += 1) {
      var normalizedId = normalizeAssigneeIdentifier(idCandidates[i]);
      if (!normalizedId) {
        continue;
      }
      var idKey = 'id::' + normalizedId;
      if (!seen[idKey]) {
        keys.push(idKey);
        seen[idKey] = true;
      }
    }
    var nameCandidates = [];
    if (entry.name) {
      nameCandidates.push(entry.name);
    }
    if (entry.fullName && entry.fullName !== entry.name) {
      nameCandidates.push(entry.fullName);
    }
    if (entry.responsible && entry.responsible !== entry.name) {
      nameCandidates.push(entry.responsible);
    }
    for (var j = 0; j < nameCandidates.length; j += 1) {
      var normalizedName = normalizeUserIdentifier(nameCandidates[j]);
      if (!normalizedName) {
        continue;
      }
      var nameKey = 'name::' + normalizedName;
      if (!seen[nameKey]) {
        keys.push(nameKey);
        seen[nameKey] = true;
      }
    }
    var compositeKey = buildCompositeResponsibleKey(entry);
    if (compositeKey) {
      var compositeIndexKey = 'combo::' + compositeKey;
      if (!seen[compositeIndexKey]) {
        keys.push(compositeIndexKey);
        seen[compositeIndexKey] = true;
      }
    }

    var roleCandidates = [];
    if (entry.role) {
      roleCandidates.push(entry.role);
    }
    if (entry.name) {
      roleCandidates.push(entry.name);
    }
    if (entry.responsible) {
      roleCandidates.push(entry.responsible);
    }
    var hasAdminRole = roleCandidates.some(function(candidate) {
      return isAdminRoleLabel(candidate);
    });
    if (hasAdminRole && !seen['role::admin']) {
      keys.push('role::admin');
      seen['role::admin'] = true;
    }

    return keys;
  }

  function matchesCurrentUserAssignee(entry) {
    if (!entry || !state.userAssignmentKeyMap) {
      return false;
    }
    var keys = buildAssigneeKeyCandidates(entry);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!key) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, key)) {
        return true;
      }
    }
    return false;
  }

  function buildAssigneeDisplayName(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var candidates = [
      entry.name,
      entry.responsible,
      entry.email,
      entry.telegram,
      entry.chatId,
      entry.login,
      entry.id
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (candidate === null || candidate === undefined) {
        continue;
      }
      var text = String(candidate).trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  function isViewEntryNewer(candidate, current) {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    var candidateTime = candidate.viewedAt ? Date.parse(candidate.viewedAt) : NaN;
    if (isNaN(candidateTime)) {
      return false;
    }
    if (!current || typeof current !== 'object') {
      return true;
    }
    var currentTime = current.viewedAt ? Date.parse(current.viewedAt) : NaN;
    if (isNaN(currentTime)) {
      return true;
    }
    return candidateTime > currentTime;
  }

  function findAssigneeViewEntry(doc, assignee) {
    if (!doc || typeof doc !== 'object') {
      return null;
    }
    var views = Array.isArray(doc.assigneeViews) ? doc.assigneeViews : [];
    if (!views.length) {
      return null;
    }

    var viewIndex = Object.create(null);
    views.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var candidates = [];
      if (entry.assigneeKey) {
        candidates.push(String(entry.assigneeKey).trim());
      }
      if (entry.id) {
        var normalizedId = normalizeAssigneeIdentifier(entry.id);
        if (normalizedId) {
          candidates.push('id::' + normalizedId);
        }
      }
      if (entry.name) {
        var normalizedName = normalizeUserIdentifier(entry.name);
        if (normalizedName) {
          candidates.push('name::' + normalizedName);
        }
      }
      candidates.forEach(function(rawKey) {
        if (!rawKey) {
          return;
        }
        var normalizedKey = rawKey.toLowerCase();
        if (!normalizedKey) {
          return;
        }
        var currentEntry = viewIndex[normalizedKey];
        if (!currentEntry || isViewEntryNewer(entry, currentEntry)) {
          viewIndex[normalizedKey] = entry;
        }
      });
    });

    if (!Object.keys(viewIndex).length) {
      return null;
    }

    if (assignee && typeof assignee === 'object') {
      var assigneeKeys = buildAssigneeKeyCandidates(assignee);
      for (var idx = 0; idx < assigneeKeys.length; idx += 1) {
        var assigneeKey = assigneeKeys[idx];
        if (!assigneeKey) {
          continue;
        }
        var lookupKey = assigneeKey.toLowerCase();
        if (viewIndex[lookupKey]) {
          return viewIndex[lookupKey];
        }
      }
      return null;
    }

    var assignees = resolveAssigneeList(doc);
    for (var i = 0; i < assignees.length; i += 1) {
      var keys = buildAssigneeKeyCandidates(assignees[i]);
      for (var j = 0; j < keys.length; j += 1) {
        var lookupKey = keys[j].toLowerCase();
        if (viewIndex[lookupKey]) {
          return viewIndex[lookupKey];
        }
      }
    }

    return null;
  }

  function buildAssigneeViewMap(doc) {
    var map = Object.create(null);
    if (!doc || typeof doc !== 'object') {
      return map;
    }
    var views = Array.isArray(doc.assigneeViews) ? doc.assigneeViews : [];
    views.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var candidates = [];
      if (entry.assigneeKey) {
        candidates.push(String(entry.assigneeKey).trim());
      }
      if (entry.id) {
        var normalizedId = normalizeAssigneeIdentifier(entry.id);
        if (normalizedId) {
          candidates.push('id::' + normalizedId);
        }
      }
      if (entry.name) {
        var normalizedName = normalizeUserIdentifier(entry.name);
        if (normalizedName) {
          candidates.push('name::' + normalizedName);
        }
      }
      candidates.forEach(function(rawKey) {
        if (!rawKey) {
          return;
        }
        var normalizedKey = rawKey.toLowerCase();
        if (!normalizedKey) {
          return;
        }
        var current = map[normalizedKey];
        if (!current || isViewEntryNewer(entry, current)) {
          map[normalizedKey] = entry;
        }
      });
    });
    return map;
  }

  function resolveAssigneeViewEntry(viewMap, assignee) {
    if (!viewMap || !assignee || typeof assignee !== 'object') {
      return null;
    }
    var keys = buildAssigneeKeyCandidates(assignee);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!key) {
        continue;
      }
      var normalized = key.toLowerCase();
      if (normalized && viewMap[normalized]) {
        return viewMap[normalized];
      }
    }
    return null;
  }

  function collectAssigneeViewState(doc) {
    var viewState = {
      responsibles: [],
      subordinates: [],
      unviewedResponsibles: [],
      unviewedSubordinates: [],
      totalUnviewed: 0
    };
    if (!doc || typeof doc !== 'object') {
      return viewState;
    }
    var assignees = resolveAssigneeList(doc);
    if (!Array.isArray(assignees) || !assignees.length) {
      return viewState;
    }
    var viewMap = buildAssigneeViewMap(doc);
    assignees.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var viewEntry = resolveAssigneeViewEntry(viewMap, entry);
      var viewedAtRaw = viewEntry && viewEntry.viewedAt ? String(viewEntry.viewedAt).trim() : '';
      var info = {
        assignee: entry,
        viewEntry: viewEntry || null,
        viewedAt: viewedAtRaw,
        isViewed: Boolean(viewedAtRaw),
        keys: buildAssigneeKeyCandidates(entry),
        role: isSubordinateSnapshot(entry) ? 'subordinate' : 'responsible'
      };
      if (info.role === 'subordinate') {
        viewState.subordinates.push(info);
        if (!info.isViewed) {
          viewState.unviewedSubordinates.push(info);
          viewState.totalUnviewed += 1;
        }
      } else {
        viewState.responsibles.push(info);
        if (!info.isViewed) {
          viewState.unviewedResponsibles.push(info);
          viewState.totalUnviewed += 1;
        }
      }
    });
    return viewState;
  }

  function matchesCurrentUserViewInfo(info) {
    if (!info || !state.userAssignmentKeyMap) {
      return false;
    }
    if (info.assignee && matchesCurrentUserAssignee(info.assignee)) {
      return true;
    }
    var keys = Array.isArray(info.keys) ? info.keys : [];
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!key) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, key)) {
        return true;
      }
    }
    return false;
  }

  function hasUnviewedForCurrentUser(viewState) {
    if (!viewState || !state.userAssignmentKeyMap) {
      return false;
    }
    var unviewedResponsibles = Array.isArray(viewState.unviewedResponsibles)
      ? viewState.unviewedResponsibles
      : [];
    for (var i = 0; i < unviewedResponsibles.length; i += 1) {
      if (matchesCurrentUserViewInfo(unviewedResponsibles[i])) {
        return true;
      }
    }
    var unviewedSubordinates = Array.isArray(viewState.unviewedSubordinates)
      ? viewState.unviewedSubordinates
      : [];
    for (var j = 0; j < unviewedSubordinates.length; j += 1) {
      if (matchesCurrentUserViewInfo(unviewedSubordinates[j])) {
        return true;
      }
    }
    return false;
  }

  function isDocumentUnviewed(viewState) {
    if (!viewState) {
      return false;
    }
    if (shouldUsePersonalUnviewed()) {
      return hasUnviewedForCurrentUser(viewState);
    }
    return viewState.totalUnviewed > 0;
  }

  function buildAssigneeStatusHistoryMap(doc) {
    var map = Object.create(null);
    if (!doc || typeof doc !== 'object') {
      return map;
    }
    var rawHistory = Array.isArray(doc.assigneeStatusHistory) ? doc.assigneeStatusHistory : [];
    rawHistory.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var key = entry.assigneeKey ? String(entry.assigneeKey).trim().toLowerCase() : '';
      if (!key) {
        return;
      }
      var records = Array.isArray(entry.entries) ? entry.entries : [];
      if (!records.length) {
        return;
      }
      var prepared = [];
      var seen = Object.create(null);
      records.forEach(function(record) {
        if (!record || typeof record !== 'object') {
          return;
        }
        var statusText = record.status ? String(record.status).trim() : '';
        var changedAtRaw = record.changedAt ? String(record.changedAt).trim() : '';
        if (!statusText || !changedAtRaw) {
          return;
        }
        var authorText = record.changedBy ? String(record.changedBy).trim() : '';
        var parsed = new Date(changedAtRaw);
        var timestamp = isNaN(parsed.getTime()) ? null : parsed.getTime();
        var duplicateKey = (timestamp !== null ? timestamp : changedAtRaw) + '|' + statusText + '|' + authorText;
        if (seen[duplicateKey]) {
          return;
        }
        seen[duplicateKey] = true;
        prepared.push({
          status: statusText,
          changedAt: changedAtRaw,
          changedBy: authorText,
          time: timestamp
        });
      });
      if (!prepared.length) {
        return;
      }
      prepared.sort(function(a, b) {
        if (a.time === null && b.time === null) {
          return 0;
        }
        if (a.time === null) {
          return -1;
        }
        if (b.time === null) {
          return 1;
        }
        return a.time - b.time;
      });
      map[key] = prepared.map(function(item) {
        return {
          status: item.status,
          changedAt: item.changedAt,
          changedBy: item.changedBy
        };
      });
    });
    return map;
  }

  function collectAssigneeStatusHistory(doc, assignee, statusMap) {
    if (!statusMap) {
      statusMap = buildAssigneeStatusHistoryMap(doc);
    }
    if (!assignee || typeof assignee !== 'object') {
      return [];
    }
    var keys = buildAssigneeKeyCandidates(assignee);
    for (var i = 0; i < keys.length; i += 1) {
      var candidate = keys[i];
      if (!candidate) {
        continue;
      }
      var normalized = candidate.toLowerCase();
      if (statusMap[normalized]) {
        return statusMap[normalized];
      }
    }
    return [];
  }

  function resolveCurrentUserAssigneeStatusEntry(doc) {
    if (!doc || !state.userAssignmentKeyMap) {
      return null;
    }

    var statusMap = buildAssigneeStatusHistoryMap(doc);
    var latest = null;
    var latestTime = null;

    for (var key in state.userAssignmentKeyMap) {
      if (!Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, key)) {
        continue;
      }
      var normalizedKey = key ? String(key).toLowerCase() : '';
      if (!normalizedKey || !statusMap[normalizedKey]) {
        continue;
      }
      var history = statusMap[normalizedKey];
      if (!Array.isArray(history) || !history.length) {
        continue;
      }
      var entry = history[history.length - 1];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      var timestamp = entry.changedAt ? new Date(entry.changedAt).getTime() : NaN;
      if (!isNaN(timestamp)) {
        if (latestTime === null || timestamp > latestTime) {
          latestTime = timestamp;
          latest = entry;
        }
      } else if (!latest) {
        latest = entry;
      }
    }

    return latest;
  }

  function resolveCurrentUserStatus(doc) {
    var entry = resolveCurrentUserAssigneeStatusEntry(doc);
    if (entry && entry.status) {
      var statusText = String(entry.status).trim();
      if (statusText) {
        return statusText;
      }
    }
    return '';
  }

  function resolveDocumentStatus(doc) {
    var userStatus = resolveCurrentUserStatus(doc);
    if (userStatus) {
      return userStatus;
    }
    var directStatus = doc && doc.status ? String(doc.status).trim() : '';
    return directStatus || '—';
  }

  function resolveLatestStatusTimestamp(doc) {
    var latest = null;
    if (doc && Array.isArray(doc.statusHistory)) {
      doc.statusHistory.forEach(function(entry) {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        var changedAt = entry.changedAt || entry.date || entry.updatedAt || entry.timestamp || '';
        if (!changedAt) {
          return;
        }
        var parsed = new Date(changedAt);
        if (isNaN(parsed.getTime())) {
          return;
        }
        var time = parsed.getTime();
        if (latest === null || time > latest) {
          latest = time;
        }
      });
    }
    var userEntry = resolveCurrentUserAssigneeStatusEntry(doc);
    if (userEntry && userEntry.changedAt) {
      var userParsed = new Date(userEntry.changedAt);
      if (!isNaN(userParsed.getTime())) {
        var userTime = userParsed.getTime();
        if (latest === null || userTime > latest) {
          latest = userTime;
        }
      }
    }
    if (doc && doc.statusUpdatedAt) {
      var statusParsed = new Date(doc.statusUpdatedAt);
      if (!isNaN(statusParsed.getTime())) {
        var statusTime = statusParsed.getTime();
        if (latest === null || statusTime > latest) {
          latest = statusTime;
        }
      }
    }
    return latest;
  }

  function buildNextStatusTimestamp(doc) {
    var now = Date.now();
    var latest = resolveLatestStatusTimestamp(doc);
    var nextTime = now;
    if (latest !== null && latest >= now) {
      nextTime = latest + 1000;
    }
    return new Date(nextTime).toISOString();
  }

  function collectGeneralStatusHistoryEntries(doc) {
    if (!doc || typeof doc !== 'object') {
      return [];
    }
    var entries = [];
    var rawHistory = Array.isArray(doc.statusHistory) ? doc.statusHistory : [];
    var seen = Object.create(null);

    rawHistory.forEach(function(item) {
      if (!item || typeof item !== 'object') {
        return;
      }
      var statusText = item.status ? String(item.status).trim() : '';
      var timestampValue = item.changedAt || item.date || item.updatedAt || item.timestamp || '';
      if (!timestampValue) {
        return;
      }
      var parsedDate = new Date(timestampValue);
      if (isNaN(parsedDate.getTime())) {
        return;
      }
      var author = item.changedBy ? String(item.changedBy).trim() : '';
      var dedupeKey = parsedDate.getTime() + '|' + statusText + '|' + author;
      if (seen[dedupeKey]) {
        return;
      }
      seen[dedupeKey] = true;
      entries.push({
        time: parsedDate.getTime(),
        changedAt: timestampValue,
        status: statusText || (doc.status ? String(doc.status) : '—'),
        author: author
      });
    });

    if (!entries.length) {
      var fallbackCandidates = [doc.statusUpdatedAt, doc.completedAt, doc.updatedAt, doc.createdAt];
      for (var i = 0; i < fallbackCandidates.length; i += 1) {
        var candidate = fallbackCandidates[i];
        if (!candidate) {
          continue;
        }
        var fallbackDate = new Date(candidate);
        if (isNaN(fallbackDate.getTime())) {
          continue;
        }
        entries.push({
          time: fallbackDate.getTime(),
          changedAt: candidate,
          status: doc.status ? String(doc.status) : '—',
          author: ''
        });
        break;
      }
    }

    entries.sort(function(a, b) {
      if (a.time === null && b.time === null) {
        return 0;
      }
      if (a.time === null) {
        return -1;
      }
      if (b.time === null) {
        return 1;
      }
      return a.time - b.time;
    });

    return entries;
  }

  function buildFallbackStatusHistoryText(doc) {
    var entries = collectGeneralStatusHistoryEntries(doc);
    if (!entries.length) {
      return '';
    }
    var lines = entries.map(function(entry) {
      var formattedTime = formatStatusTimestamp(entry.changedAt);
      var statusText = entry.status ? String(entry.status).trim() : '—';
      var line = (formattedTime || '—') + ' — ' + statusText;
      if (entry.author) {
        line += ' (' + entry.author + ')';
      }
      return line;
    });
    return lines.length ? 'История статусов:\n' + lines.join('\n') : '';
  }

  function buildAssigneeViewSection(doc, assignees, title) {
    if (!Array.isArray(assignees) || !assignees.length) {
      return '';
    }
    var lines = assignees.map(function(entry) {
      var label = buildAssigneeDisplayName(entry) || '—';
      var viewEntry = findAssigneeViewEntry(doc, entry);
      var viewedAt = viewEntry ? formatStatusTimestamp(viewEntry.viewedAt) : '';
      return '- ' + label + ' — ' + (viewedAt || '—');
    });
    return title + ':\n' + lines.join('\n');
  }

  function buildAssigneeStatusSection(doc, assignees, statusMap, title) {
    if (!Array.isArray(assignees) || !assignees.length) {
      return '';
    }
    var lines = assignees.map(function(entry) {
      var label = buildAssigneeDisplayName(entry) || '—';
      var history = collectAssigneeStatusHistory(doc, entry, statusMap);
      if (!history.length) {
        return '- ' + label + ': —';
      }
      var historyLines = [];
      history.forEach(function(item) {
        if (!item || typeof item !== 'object') {
          return;
        }
        var statusText = item.status ? String(item.status).trim() : '';
        var changedAt = item.changedAt ? formatStatusTimestamp(item.changedAt) : '';
        if (!statusText && !changedAt) {
          return;
        }
        var line = (changedAt || '—') + ' — ' + (statusText || '—');
        if (item.changedBy) {
          line += ' (' + item.changedBy + ')';
        }
        historyLines.push(line);
      });
      if (!historyLines.length) {
        return '- ' + label + ': —';
      }
      return '- ' + label + ':\n    - ' + historyLines.join('\n    - ');
    });
    return title + ':\n' + lines.join('\n');
  }

  function collectCurrentUserIdentifiers() {
    var result = { ids: [], names: [] };
    var seenIds = Object.create(null);
    var seenNames = Object.create(null);

    function addId(candidate) {
      var normalized = normalizeUserIdentifier(candidate);
      if (!normalized || seenIds[normalized]) {
        return;
      }
      seenIds[normalized] = true;
      result.ids.push(normalized);
    }

    function addName(candidate) {
      var normalized = normalizeUserIdentifier(candidate);
      if (!normalized || seenNames[normalized]) {
        return;
      }
      seenNames[normalized] = true;
      result.names.push(normalized);
    }

    if (state.telegramUserId) {
      addId(state.telegramUserId);
    }

    var accessUser = state.access && state.access.user ? state.access.user : null;
    if (accessUser) {
      if (accessUser.id) {
        addId(accessUser.id);
      }
      if (accessUser.telegramId) {
        addId(accessUser.telegramId);
      }
      if (accessUser.telegram) {
        addId(accessUser.telegram);
      }
      if (accessUser.telegramUsername) {
        addId(accessUser.telegramUsername);
      }
      if (accessUser.chatId) {
        addId(accessUser.chatId);
      }
      if (accessUser.responsibleNumber) {
        addId(accessUser.responsibleNumber);
      }
      if (accessUser.login) {
        addId(accessUser.login);
      }
      if (accessUser.username) {
        addId(accessUser.username);
      }
      if (accessUser.email) {
        addId(accessUser.email);
      }

      if (accessUser.fullName) {
        addName(accessUser.fullName);
      }
      if (accessUser.name) {
        addName(accessUser.name);
      }
      var first = accessUser.firstName || '';
      var last = accessUser.lastName || '';
      if (first) {
        addName(first);
      }
      if (last) {
        addName(last);
      }
      var combined = (first + ' ' + last).trim();
      if (combined) {
        addName(combined);
      }
    }

    return result;
  }

  function buildCurrentUserViewKeys() {
    var identifiers = collectCurrentUserIdentifiers();
    var keys = [];
    if (!identifiers || typeof identifiers !== 'object') {
      return keys;
    }

    var i;
    if (Array.isArray(identifiers.ids)) {
      for (i = 0; i < identifiers.ids.length; i += 1) {
        if (identifiers.ids[i]) {
          keys.push('id::' + identifiers.ids[i]);
        }
      }
    }

    if (Array.isArray(identifiers.names)) {
      for (i = 0; i < identifiers.names.length; i += 1) {
        if (identifiers.names[i]) {
          keys.push('name::' + identifiers.names[i]);
        }
      }
    }

    var role = normalizeRoleValue(state.effectiveUserRole || (state.access ? state.access.role : ''));
    if (role && isAdminRoleLabel(role)) {
      keys.push('role::admin');
    }

    return keys;
  }

  function findCurrentUserViewEntry(doc) {
    if (!doc || typeof doc !== 'object') {
      return null;
    }
    var views = Array.isArray(doc.assigneeViews) ? doc.assigneeViews : [];
    if (!views.length) {
      return null;
    }

    var keys = buildCurrentUserViewKeys();
    if (!keys.length) {
      return null;
    }

    var lookup = Object.create(null);
    for (var i = 0; i < keys.length; i += 1) {
      lookup[keys[i].toLowerCase()] = true;
    }

    for (var j = 0; j < views.length; j += 1) {
      var entry = views[j];
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      var candidates = [];
      if (entry.assigneeKey) {
        candidates.push(String(entry.assigneeKey));
      }
      if (entry.id) {
        var normalizedId = normalizeAssigneeIdentifier(entry.id);
        if (normalizedId) {
          candidates.push('id::' + normalizedId);
        }
      }
      if (entry.name) {
        var normalizedName = normalizeUserIdentifier(entry.name);
        if (normalizedName) {
          candidates.push('name::' + normalizedName);
        }
      }

      for (var k = 0; k < candidates.length; k += 1) {
        var candidateKey = String(candidates[k]).toLowerCase();
        if (candidateKey && lookup[candidateKey]) {
          return entry;
        }
      }
    }

    return null;
  }

  function resolveCurrentUserDisplayName() {
    var accessUser = state.access && state.access.user ? state.access.user : null;
    if (!accessUser || typeof accessUser !== 'object') {
      return '';
    }

    if (accessUser.fullName) {
      return String(accessUser.fullName);
    }

    var parts = [];
    if (accessUser.firstName) {
      parts.push(String(accessUser.firstName));
    }
    if (accessUser.lastName) {
      parts.push(String(accessUser.lastName));
    }
    var combined = parts.join(' ').trim();
    if (combined) {
      return combined;
    }

    if (accessUser.username) {
      return '@' + String(accessUser.username);
    }
    if (accessUser.login) {
      return String(accessUser.login);
    }

    return '';
  }

  function resolveCurrentUserAssigneeMatch(doc) {
    if (!doc || typeof doc !== 'object') {
      return null;
    }
    var assignees = resolveAssigneeList(doc);
    if (!assignees.length) {
      return null;
    }
    var lookup = state.userAssignmentKeyMap;
    if (!lookup) {
      var keys = buildCurrentUserViewKeys();
      if (keys.length) {
        lookup = Object.create(null);
        for (var k = 0; k < keys.length; k += 1) {
          if (keys[k]) {
            lookup[String(keys[k]).toLowerCase()] = true;
          }
        }
      }
    }
    if (!lookup) {
      return null;
    }
    var normalizedLookup = Object.create(null);
    for (var key in lookup) {
      if (Object.prototype.hasOwnProperty.call(lookup, key)) {
        normalizedLookup[String(key).toLowerCase()] = true;
      }
    }
    for (var i = 0; i < assignees.length; i += 1) {
      var entry = assignees[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      var assigneeKeys = buildAssigneeKeyCandidates(entry);
      for (var j = 0; j < assigneeKeys.length; j += 1) {
        var candidateKey = assigneeKeys[j];
        if (candidateKey && normalizedLookup[candidateKey.toLowerCase()]) {
          return { key: candidateKey, entry: entry };
        }
      }
    }
    return null;
  }

  function resolveCurrentUserAssigneeKey(doc) {
    var match = resolveCurrentUserAssigneeMatch(doc);
    return match && match.key ? match.key : '';
  }

  function resolveAdminRoleAssigneeKey(doc) {
    if (!doc || !isCurrentUserAdmin() || !isDocumentAssignedToAdminRole(doc)) {
      return '';
    }
    var assignees = resolveAssigneeList(doc);
    for (var i = 0; i < assignees.length; i += 1) {
      var entry = assignees[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      var keys = buildAssigneeKeyCandidates(entry);
      for (var j = 0; j < keys.length; j += 1) {
        if (keys[j] === 'role::admin') {
          return 'role::admin';
        }
      }
    }
    return 'role::admin';
  }

  function normalizeStatusValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return normalized.replace(/ё/g, 'е');
  }

  function isDocumentViewedStatus(status) {
    var normalized = normalizeStatusValue(status);
    return normalized.indexOf('просмотр') !== -1;
  }

  function appendStatusHistoryEntry(doc, status, timestamp) {
    if (!doc || typeof doc !== 'object') {
      return;
    }
    var statusText = status ? String(status).trim() : '';
    var timeValue = timestamp ? String(timestamp).trim() : '';
    if (!statusText || !timeValue) {
      return;
    }
    if (!Array.isArray(doc.statusHistory)) {
      doc.statusHistory = [];
    }
    var author = resolveCurrentUserDisplayName();
    for (var i = doc.statusHistory.length - 1; i >= 0; i -= 1) {
      var entry = doc.statusHistory[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      var entryStatus = entry.status ? String(entry.status).trim() : '';
      var entryTime = entry.changedAt || entry.date || entry.updatedAt || entry.timestamp || '';
      if (entryStatus === statusText && entryTime === timeValue) {
        return;
      }
    }
    var record = { status: statusText, changedAt: timeValue };
    if (author) {
      record.changedBy = author;
    }
    doc.statusHistory.push(record);
  }

  function applyLocalDocumentViewUpdate(doc, timestamp, meta) {
    if (!doc || typeof doc !== 'object') {
      return;
    }

    var isoTimestamp = typeof timestamp === 'string' && timestamp ? timestamp : new Date().toISOString();
    var metaInfo = meta && typeof meta === 'object' ? meta : {};
    if (!Array.isArray(doc.assigneeViews)) {
      doc.assigneeViews = [];
    }

    var preferredKey = metaInfo.assigneeKey ? String(metaInfo.assigneeKey).trim() : '';
    var assigneeMatch = resolveCurrentUserAssigneeMatch(doc);
    var resolvedKey = preferredKey || (assigneeMatch && assigneeMatch.key ? assigneeMatch.key : '') || resolveCurrentUserAssigneeKey(doc);
    if (!resolvedKey) {
      resolvedKey = resolveAdminRoleAssigneeKey(doc);
    }
    var keys = buildCurrentUserViewKeys();
    if (!resolvedKey && keys.length) {
      resolvedKey = keys[0];
    }
    var resolvedId = metaInfo.id ? String(metaInfo.id).trim() : '';
    if (!resolvedId && resolvedKey && resolvedKey.indexOf('id::') === 0) {
      resolvedId = resolvedKey.slice(4);
    }
    var resolvedName = metaInfo.name ? String(metaInfo.name).trim() : '';
    if (!resolvedName && assigneeMatch && assigneeMatch.entry) {
      resolvedName = buildAssigneeDisplayName(assigneeMatch.entry);
    }
    if (!resolvedName) {
      resolvedName = resolveCurrentUserDisplayName();
    }
    if (!resolvedId && assigneeMatch && assigneeMatch.entry && assigneeMatch.entry.id) {
      resolvedId = normalizeAssigneeIdentifier(assigneeMatch.entry.id);
    }

    var existingEntry = findCurrentUserViewEntry(doc);
    if (existingEntry) {
      if (!existingEntry.viewedAt) {
        existingEntry.viewedAt = isoTimestamp;
      }
      if (resolvedKey && !existingEntry.assigneeKey) {
        existingEntry.assigneeKey = resolvedKey;
      }
      if (resolvedId && !existingEntry.id) {
        existingEntry.id = resolvedId;
      }
      if (resolvedName && !existingEntry.name) {
        existingEntry.name = resolvedName;
      }
      return;
    }

    var newEntry = { viewedAt: isoTimestamp };
    if (resolvedKey) {
      newEntry.assigneeKey = resolvedKey;
    }
    if (resolvedId) {
      newEntry.id = resolvedId;
    }
    if (resolvedName) {
      newEntry.name = resolvedName;
    }

    doc.assigneeViews.push(newEntry);
  }

  function markDocumentAsViewed(doc, button) {
    if (!doc || typeof doc !== 'object' || !doc.id) {
      return;
    }
    if (!Array.isArray(doc.files) || !doc.files.length) {
      showMessage('info', 'У этой задачи нет прикреплённых файлов.');
      return;
    }
    if (doc.__markViewedPending) {
      return;
    }

    var existingView = findCurrentUserViewEntry(doc);
    if (existingView && existingView.viewedAt) {
      showMessage('info', 'Документ уже отмечен как просмотренный.');
      return;
    }

    var timestamp = new Date().toISOString();

    doc.__markViewedPending = true;
    if (button) {
      button.disabled = true;
      button.classList.add('documents-action--pending');
    }

    applyLocalDocumentViewUpdate(doc, timestamp);
    recalculateUnviewedCounters();
    recordDocumentView(doc, 'manual_viewed_button', { force: true });
    updateTable();

    doc.__markViewedPending = false;
    if (button) {
      button.disabled = true;
      button.classList.remove('documents-action--pending');
    }
  }

  function recordDocumentView(doc, trigger, options) {
    if (!doc || typeof doc !== 'object' || !doc.id || !state.organization) {
      return;
    }

    if (doc.__recordViewPending) {
      return;
    }

    var force = options && options.force === true;
    var currentEntry = findCurrentUserViewEntry(doc);
    if (!force && currentEntry && currentEntry.viewedAt) {
      return;
    }

    var adminAssignmentOverride = isCurrentUserAdmin() && isDocumentAssignedToAdminRole(doc);
    if (!force && !adminAssignmentOverride && !isDocumentAssignedToCurrentUser(doc)) {
      return;
    }

    var timestamp = new Date().toISOString();
    applyLocalDocumentViewUpdate(doc, timestamp);
    recalculateUnviewedCounters();
    updateTable();

    var assigneeMatch = resolveCurrentUserAssigneeMatch(doc);
    var payload = {
      action: 'register_view',
      organization: state.organization,
      documentId: doc.id,
      viewedAt: timestamp
    };
    var viewerRole = '';
    if (isCurrentUserAdmin()) {
      viewerRole = 'admin';
    } else if (state.access && state.access.user && state.access.user.responsibleRole) {
      viewerRole = state.access.user.responsibleRole;
    } else if (state.effectiveUserRole && state.effectiveUserRole !== 'user') {
      viewerRole = state.effectiveUserRole;
    }
    if (viewerRole) {
      payload.viewerRole = viewerRole;
    }
    var adminRoleKey = resolveAdminRoleAssigneeKey(doc);
    if (adminRoleKey) {
      payload.assigneeKey = adminRoleKey;
    }
    if (!payload.assigneeKey && assigneeMatch && assigneeMatch.key) {
      payload.assigneeKey = assigneeMatch.key;
    }
    var userAssigneeKey = resolveCurrentUserAssigneeKey(doc);
    if (userAssigneeKey && !payload.assigneeKey) {
      payload.assigneeKey = userAssigneeKey;
    }
    if (payload.assigneeKey && payload.assigneeKey.indexOf('id::') === 0) {
      payload.assigneeId = payload.assigneeKey.slice(4);
    }
    var accessUser = state.access && state.access.user ? state.access.user : null;
    if (accessUser && typeof accessUser === 'object') {
      if (accessUser.id) {
        payload.viewerId = accessUser.id;
      } else if (accessUser.login) {
        payload.viewerId = accessUser.login;
      } else if (accessUser.username) {
        payload.viewerId = accessUser.username;
      }
      if (accessUser.login) {
        payload.login = accessUser.login;
      } else if (accessUser.username) {
        payload.login = accessUser.username;
      }
      if (accessUser.fullName) {
        payload.fullName = accessUser.fullName;
      }
    }
    var displayName = resolveCurrentUserDisplayName();
    if (displayName) {
      payload.viewerName = displayName;
    }
    if (trigger) {
      payload.trigger = trigger;
    }
    mergeTelegramUserId(payload);

    doc.__recordViewPending = true;

    fetch(buildApiUrl('register_view', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        var result = data && typeof data === 'object' ? data : {};
        var recorded = result.recorded === true || result.alreadyRecorded === true;
        if (!recorded) {
          return;
        }
        var recordedAt = typeof result.viewedAt === 'string' && result.viewedAt ? result.viewedAt : timestamp;
        applyLocalDocumentViewUpdate(doc, recordedAt, {
          assigneeKey: result.assigneeKey,
          id: result.id,
          name: result.name
        });
        recalculateUnviewedCounters();
        updateTable();
      })
      .catch(function(error) {
        docsLogger.error('Не удалось зафиксировать просмотр документа:', error);
      })
      .finally(function() {
        doc.__recordViewPending = false;
      });
  }

  function isDocumentAssignedToAdminRole(doc) {
    if (!doc || typeof doc !== 'object') {
      return false;
    }
    var assignees = resolveAssigneeList(doc);
    for (var i = 0; i < assignees.length; i += 1) {
      var entry = assignees[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      var candidates = [entry.role, entry.name, entry.responsible];
      for (var j = 0; j < candidates.length; j += 1) {
        if (isAdminRoleLabel(candidates[j])) {
          return true;
        }
      }
    }
    return false;
  }

  function isDocumentAssignedToCurrentUser(doc) {
    if (!doc) {
      return false;
    }

    if (isCurrentUserAdmin() && isDocumentAssignedToAdminRole(doc)) {
      return true;
    }

    if (state.userAssignmentKeyMap) {
      var assigneeList = resolveAssigneeList(doc);
      for (var ai = 0; ai < assigneeList.length; ai += 1) {
        var assigneeEntry = assigneeList[ai];
        if (!assigneeEntry || typeof assigneeEntry !== 'object') {
          continue;
        }
        var assigneeKeys = buildAssigneeKeyCandidates(assigneeEntry);
        for (var ak = 0; ak < assigneeKeys.length; ak += 1) {
          var assigneeKey = assigneeKeys[ak];
          if (assigneeKey && Object.prototype.hasOwnProperty.call(state.userAssignmentKeyMap, assigneeKey)) {
            return true;
          }
        }
      }
    }

    var identifiers = collectCurrentUserIdentifiers();
    if (!identifiers.ids.length && !identifiers.names.length) {
      return false;
    }

    var assignees = resolveAssigneeList(doc);

    for (var i = 0; i < assignees.length; i += 1) {
      var entry = assignees[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      var idCandidates = [entry.id, entry.telegram, entry.chatId, entry.number, entry.login, entry.email];
      for (var j = 0; j < idCandidates.length; j += 1) {
        var idCandidate = normalizeUserIdentifier(idCandidates[j]);
        if (idCandidate && identifiers.ids.indexOf(idCandidate) !== -1) {
          return true;
        }
      }

      var nameCandidates = [entry.name, entry.responsible];
      for (var k = 0; k < nameCandidates.length; k += 1) {
        var nameCandidate = normalizeUserIdentifier(nameCandidates[k]);
        if (nameCandidate && identifiers.names.indexOf(nameCandidate) !== -1) {
          return true;
        }
      }
    }

    return false;
  }

  function formatStatusMetaText(doc) {
    if (!doc || typeof doc !== 'object') {
      return 'Просмотрено: —\nИстория статусов: —';
    }

    var assignees = resolveAssigneeList(doc);
    if (!Array.isArray(assignees) || !assignees.length) {
      var fallbackOnly = buildFallbackStatusHistoryText(doc);
      var fallbackBlock = fallbackOnly || 'История статусов: —';
      return 'Просмотрено: —\n' + fallbackBlock;
    }

    var responsibles = [];
    var subordinates = [];
    assignees.forEach(function(entry) {
      if (isSubordinateSnapshot(entry)) {
        subordinates.push(entry);
      } else {
        responsibles.push(entry);
      }
    });

    var statusMap = buildAssigneeStatusHistoryMap(doc);

    var viewSections = [];
    var responsibleView = buildAssigneeViewSection(doc, responsibles, 'Ответственные');
    if (responsibleView) {
      viewSections.push(responsibleView);
    }
    var subordinateView = buildAssigneeViewSection(doc, subordinates, 'Подчинённые');
    if (subordinateView) {
      viewSections.push(subordinateView);
    }
    var viewBlock = viewSections.length ? 'Просмотрено:\n' + viewSections.join('\n') : 'Просмотрено: —';

    var statusSections = [];
    var responsibleStatus = buildAssigneeStatusSection(doc, responsibles, statusMap, 'Ответственные');
    if (responsibleStatus) {
      statusSections.push(responsibleStatus);
    }
    var subordinateStatus = buildAssigneeStatusSection(doc, subordinates, statusMap, 'Подчинённые');
    if (subordinateStatus) {
      statusSections.push(subordinateStatus);
    }

    if (!statusSections.length) {
      var fallback = buildFallbackStatusHistoryText(doc);
      if (fallback) {
        statusSections.push(fallback);
      }
    }

    var statusBlock;
    if (!statusSections.length) {
      statusBlock = 'История статусов: —';
    } else if (statusSections.length === 1 && statusSections[0].indexOf('История статусов:') === 0) {
      statusBlock = statusSections[0];
    } else {
      var normalizedSections = statusSections.map(function(section) {
        if (section.indexOf('История статусов:') === 0) {
          return section.replace(/^История статусов:\s*/i, '').replace(/^\n+/, '');
        }
        return section;
      }).filter(function(section) {
        return Boolean(section);
      });
      statusBlock = normalizedSections.length
        ? 'История статусов:\n' + normalizedSections.join('\n')
        : 'История статусов: —';
    }

    return viewBlock + '\n\n' + statusBlock;
  }

  function buildStatusSelectOptions(select, currentStatus) {
    if (!select) {
      return;
    }
    var normalized = currentStatus ? String(currentStatus) : '';
    if (normalized && isDocumentViewedStatus(normalized)) {
      normalized = '';
    }
    var added = {};
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Не выбран';
    select.appendChild(placeholder);
    added[''] = true;
    for (var i = 0; i < STATUS_OPTIONS.length; i += 1) {
      var statusOption = STATUS_OPTIONS[i];
      var option = document.createElement('option');
      option.value = statusOption;
      option.textContent = statusOption;
      select.appendChild(option);
      added[statusOption] = true;
    }
    if (normalized && !added[normalized]) {
      var custom = document.createElement('option');
      custom.value = normalized;
      custom.textContent = normalized;
      select.appendChild(custom);
    }
    if (normalized) {
      select.value = normalized;
    } else {
      select.value = '';
    }
  }

  function canManageInstructions() {
    if (state.permissions && typeof state.permissions.canManageInstructions === 'boolean') {
      return state.permissions.canManageInstructions;
    }
    return false;
  }

  function canAssignInstructionsToUsers() {
    if (canManageInstructions()) {
      return true;
    }
    var candidates = [];
    if (state.access && typeof state.access === 'object') {
      if (state.access.role) {
        candidates.push(state.access.role);
      }
      if (state.access.user && typeof state.access.user === 'object') {
        if (state.access.user.role) {
          candidates.push(state.access.user.role);
        }
        if (state.access.user.responsibleRole) {
          candidates.push(state.access.user.responsibleRole);
        }
      }
    }
    if (state.effectiveUserRole) {
      candidates.push(state.effectiveUserRole);
    }
    var allowed = {
      director: true,
      administrator: true,
      admin: true,
      'директор': true,
      'администратор': true
    };
    for (var i = 0; i < candidates.length; i += 1) {
      var normalized = normalizeRoleValue(candidates[i]);
      if (!normalized) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(allowed, normalized) && allowed[normalized]) {
        return true;
      }
    }
    return false;
  }

  function buildInstructionSelectOptions(select, currentValue) {
    if (!select) {
      return;
    }
    var normalized = currentValue ? String(currentValue) : '';
    select.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Не выбрано';
    select.appendChild(placeholder);

    for (var i = 0; i < INSTRUCTION_OPTIONS.length; i += 1) {
      var option = document.createElement('option');
      option.value = INSTRUCTION_OPTIONS[i];
      option.textContent = INSTRUCTION_OPTIONS[i];
      select.appendChild(option);
    }

    if (normalized) {
      select.value = normalized;
    } else {
      select.value = '';
    }
  }

  function clampColumnWidth(value) {
    if (value === undefined || value === null) {
      return null;
    }
    var number = Number(value);
    if (!isFinite(number)) {
      return null;
    }
    var width = Math.round(number);
    if (width < COLUMN_WIDTH_MIN) {
      width = COLUMN_WIDTH_MIN;
    } else if (width > COLUMN_WIDTH_MAX) {
      width = COLUMN_WIDTH_MAX;
    }
    return width;
  }

  function getColumnDefaultWidth(key) {
    if (Object.prototype.hasOwnProperty.call(COLUMN_WIDTH_DEFAULTS, key)) {
      return COLUMN_WIDTH_DEFAULTS[key];
    }
    return 200;
  }

  function cloneColumnWidthMap(source) {
    var clone = {};
    if (!source || typeof source !== 'object') {
      return clone;
    }
    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(COLUMN_WIDTH_DEFAULTS, key)) {
        continue;
      }
      var width = clampColumnWidth(source[key]);
      if (width !== null) {
        clone[key] = width;
      }
    }
    return clone;
  }

  function normalizeColumnWidthResponse(map) {
    return cloneColumnWidthMap(map);
  }

  function buildColumnWidthMap(overrides) {
    var map = {};
    TABLE_COLUMNS.forEach(function(column) {
      map[column.key] = getEffectiveColumnWidth(column.key, overrides);
    });
    return map;
  }

  function getTableAvailableWidth() {
    var host = state.host;
    if (!host || typeof host.querySelector !== 'function') {
      return 0;
    }
    var wrapper = host.querySelector('.documents-table-wrapper');
    var container = wrapper || host;
    if (!container) {
      return 0;
    }
    var width = container.clientWidth || 0;
    if (!width && typeof container.getBoundingClientRect === 'function') {
      var rect = container.getBoundingClientRect();
      width = rect && rect.width ? rect.width : 0;
    }
    return width > 0 ? width : 0;
  }

  function scaleColumnWidthsToFit(widthMap, availableWidth) {
    if (!widthMap || typeof widthMap !== 'object') {
      return {};
    }
    if (!availableWidth || !(availableWidth > 0)) {
      return Object.assign({}, widthMap);
    }

    var totalWidth = 0;
    TABLE_COLUMNS.forEach(function(column) {
      var key = column.key;
      var width = Number(widthMap[key]);
      if (!isFinite(width) || width <= 0) {
        width = getColumnDefaultWidth(key);
      }
      totalWidth += width;
    });

    if (totalWidth <= availableWidth) {
      return Object.assign({}, widthMap);
    }

    var ratio = availableWidth / totalWidth;
    var scaled = {};
    var adjustableKeys = [];
    var scaledTotal = 0;

    TABLE_COLUMNS.forEach(function(column) {
      var key = column.key;
      var baseWidth = Number(widthMap[key]);
      if (!isFinite(baseWidth) || baseWidth <= 0) {
        baseWidth = getColumnDefaultWidth(key);
      }
      var nextWidth = Math.max(Math.round(baseWidth * ratio), COLUMN_WIDTH_MIN);
      scaled[key] = nextWidth;
      scaledTotal += nextWidth;
      if (nextWidth > COLUMN_WIDTH_MIN) {
        adjustableKeys.push(key);
      }
    });

    var excess = scaledTotal - availableWidth;
    while (excess > 0 && adjustableKeys.length) {
      var progress = false;
      for (var i = 0; i < adjustableKeys.length && excess > 0; i += 1) {
        var adjustableKey = adjustableKeys[i];
        if (scaled[adjustableKey] > COLUMN_WIDTH_MIN) {
          scaled[adjustableKey] -= 1;
          excess -= 1;
          progress = true;
          if (scaled[adjustableKey] <= COLUMN_WIDTH_MIN) {
            adjustableKeys.splice(i, 1);
            i -= 1;
          }
        }
      }
      if (!progress) {
        break;
      }
    }

    return scaled;
  }

  function getEffectiveColumnWidth(key, overrides) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      var override = clampColumnWidth(overrides[key]);
      if (override !== null) {
        return override;
      }
    }
    if (state.columnWidthOverrides && Object.prototype.hasOwnProperty.call(state.columnWidthOverrides, key)) {
      var personalWidth = clampColumnWidth(state.columnWidthOverrides[key]);
      if (personalWidth !== null) {
        return personalWidth;
      }
    }
    if (state.columnWidths && Object.prototype.hasOwnProperty.call(state.columnWidths, key)) {
      var stored = clampColumnWidth(state.columnWidths[key]);
      if (stored !== null) {
        return stored;
      }
    }
    return getColumnDefaultWidth(key);
  }

  function setElementColumnWidth(element, width) {
    if (!element) {
      return;
    }
    var resolved = clampColumnWidth(width);
    if (resolved === null) {
      element.style.removeProperty('width');
      element.style.removeProperty('minWidth');
      element.style.removeProperty('maxWidth');
      return;
    }
    var value = resolved + 'px';
    element.style.width = value;
    element.style.minWidth = value;
    element.style.maxWidth = value;
  }

  function applyColumnWidths(previewWidths) {
    var overrides = previewWidths || state.columnWidthOverrides || null;
    var widthMap = buildColumnWidthMap(overrides);
    var totalWidth = 0;

    if (!elements.headerCells) {
      elements.headerCells = {};
    }

    TABLE_COLUMNS.forEach(function(column) {
      var key = column.key;
      var width = Number(widthMap[key]);
      if (!isFinite(width) || width <= 0) {
        width = getColumnDefaultWidth(key);
      }
      totalWidth += width;
      var headerCell = elements.headerCells[key];
      if (headerCell) {
        setElementColumnWidth(headerCell, width);
      }
      if (elements.columnCols && elements.columnCols[key]) {
        setElementColumnWidth(elements.columnCols[key], width);
      }
    });

    if (elements.table) {
      var tableWidth = totalWidth > 0 ? totalWidth + 'px' : '';
      elements.table.style.width = tableWidth || '';
      elements.table.style.minWidth = tableWidth || '100%';
    }
  }

  function handleTableResize() {
    if (state.resizeTimer !== null) {
      clearTimeout(state.resizeTimer);
    }
    state.resizeTimer = setTimeout(function() {
      state.resizeTimer = null;
      state.virtualTable.rowHeight = 0;
      applyColumnWidths();
      updateStickyHeaderOffsets();
      scheduleVirtualTableRender();
    }, 120);
  }

  function buildDefaultColumnWidthMap() {
    var defaults = {};
    TABLE_COLUMNS.forEach(function(column) {
      defaults[column.key] = getColumnDefaultWidth(column.key);
    });
    return defaults;
  }

  function injectCurrentColumnWidthsIntoSettings(settings) {
    var normalized = normalizeVisualSettings(settings);
    var currentWidths = buildColumnWidthMap(state.columnWidthOverrides || state.columnWidths || null);
    var columns = {};

    TABLE_COLUMNS.forEach(function(column) {
      var key = column.key;
      var baseColumn = normalized.columns && normalized.columns[key] && typeof normalized.columns[key] === 'object'
        ? normalized.columns[key]
        : {};
      columns[key] = Object.assign({}, baseColumn, {
        width: currentWidths[key]
      });
    });

    normalized.columns = columns;
    return normalized;
  }

  function getAccessProfileKey(context) {
    var role = context && context.role ? context.role : '';
    var canManage = state.permissions && state.permissions.canManageInstructions ? '1' : '0';
    return role + ':' + canManage;
  }

  function loadColumnWidths(organization, force) {
    if (!organization) {
      state.columnWidths = {};
      state.columnWidthOrganization = '';
      state.columnWidthsLoaded = false;
      applyColumnWidths();
      return Promise.resolve({});
    }
    if (!force && state.columnWidthsLoaded && state.columnWidthOrganization === organization) {
      return Promise.resolve(state.columnWidths);
    }
    if (!force && state.columnWidthsLoadingPromise) {
      return state.columnWidthsLoadingPromise;
    }
    var promise = fetch(buildApiUrl('load_column_widths', { organization: organization }), { credentials: 'same-origin' })
      .then(handleResponse)
      .then(function(data) {
        var normalized = normalizeColumnWidthResponse(data && data.columns);
        state.columnWidths = normalized;
        state.columnWidthProfile = data && data.profile ? String(data.profile) : state.columnWidthProfile;
        state.columnWidthOrganization = organization;
        state.columnWidthsLoaded = true;
        state.columnWidthProfileKey = getAccessProfileKey(state.access);
        applyColumnWidths();
        return normalized;
      })
      .catch(function(error) {
        state.columnWidthsLoaded = false;
        if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось загрузить настройки ширины столбцов:', error);
        }
        throw error;
      })
      .finally(function() {
        if (state.columnWidthsLoadingPromise === promise) {
          state.columnWidthsLoadingPromise = null;
        }
      });
    state.columnWidthsLoadingPromise = promise;
    return promise;
  }

  function saveColumnWidths(widths) {
    if (!state.organization) {
      return Promise.reject(new Error('Организация не определена.'));
    }
    var payload = {
      action: 'save_column_widths',
      organization: state.organization,
      columns: widths || {}
    };
    return fetch(buildApiUrl('save_column_widths', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        var normalized = normalizeColumnWidthResponse(data && data.columns);
        state.columnWidths = normalized;
        state.columnWidthProfile = data && data.profile ? String(data.profile) : state.columnWidthProfile;
        state.columnWidthOrganization = state.organization;
        state.columnWidthsLoaded = true;
        state.columnWidthProfileKey = getAccessProfileKey(state.access);
        applyColumnWidths();
        return normalized;
      });
  }

  function refreshColumnWidthsIfNeeded() {
    var key = getAccessProfileKey(state.access);
    if (state.columnWidthProfileKey !== key) {
      state.columnWidthProfileKey = key;
      state.columnWidthsLoaded = false;
      if (state.organization) {
        loadColumnWidths(state.organization, true).catch(function(error) {
          if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
            docsLogger.warn('Не удалось обновить настройки ширины столбцов:', error);
          }
        });
      }
    }
  }

  function handleInstructionSelectChange(doc, select) {
    if (!doc || !doc.id || !select) {
      return;
    }
    var previous = doc.instruction ? String(doc.instruction) : '';
    var nextValue = select.value || '';
    if (nextValue === previous) {
      return;
    }
    select.disabled = true;
    select.classList.add('documents-instruction__select--pending');
    sendUpdate(doc.id, { instruction: nextValue }, 'Поручение обновлено.')
      .catch(function(error) {
        showMessage('error', 'Не удалось обновить поручение: ' + error.message);
        select.value = previous;
      })
      .finally(function() {
        select.disabled = false;
        select.classList.remove('documents-instruction__select--pending');
      });
  }

  function formatInstructionAssignment(entry) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    var label = entry.label ? String(entry.label).trim() : '';
    var comment = entry.comment ? String(entry.comment).trim() : '';
    var instruction = entry.instruction ? String(entry.instruction).trim() : '';
    var dueDate = entry.dueDate ? String(entry.dueDate).trim() : '';

    var descriptionParts = [];
    if (comment) {
      descriptionParts.push(comment);
    }
    if (instruction && (!comment || instruction.toLowerCase() !== comment.toLowerCase())) {
      descriptionParts.push(instruction);
    }
    var description = descriptionParts.join('. ');

    var text = label;
    if (description) {
      text = label ? label + ' - ' + description : description;
    }

    if (dueDate) {
      var formattedDue = formatDate(dueDate);
      var dueText = formattedDue && formattedDue !== '—' ? formattedDue : dueDate;
      if (dueText) {
        text = text ? text + '. Срок: ' + dueText : 'Срок: ' + dueText;
      }
    }

    return text.trim();
  }

  function resolveAssigneeLabel(entry, fallbackRole) {
    if (!entry || typeof entry !== 'object') {
      return fallbackRole || '';
    }
    var label = '';
    if (entry.name) {
      label = String(entry.name).trim();
    } else if (entry.responsible) {
      label = String(entry.responsible).trim();
    } else if (entry.id) {
      label = (fallbackRole ? fallbackRole + ' #' : 'Исполнитель #') + String(entry.id).trim();
    } else if (entry.email) {
      label = String(entry.email).trim();
    } else if (entry.telegram) {
      label = String(entry.telegram).trim();
    } else if (entry.chatId) {
      label = String(entry.chatId).trim();
    }
    return label || (fallbackRole || '');
  }

  function extractSurname(label) {
    if (!label) {
      return '';
    }
    var sanitized = String(label).replace(/[.,]+/g, ' ').trim();
    if (!sanitized) {
      return '';
    }
    var parts = sanitized.split(/\s+/);
    return parts[0] || sanitized;
  }

  function formatDueDateValue(raw) {
    if (!raw) {
      return '—';
    }
    var formatted = formatDate(raw);
    return formatted && formatted !== '—' ? formatted : String(raw);
  }

  function buildDueDateAssignments(doc) {
    var assignees = resolveAssigneeList(doc);
    if (!Array.isArray(assignees) || !assignees.length) {
      return [];
    }

    var showAll = !isCurrentUserSubordinate();
    var entries = [];

    assignees.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var isSubordinate = isSubordinateSnapshot(entry);
      if (isSubordinate && !showAll && !matchesCurrentUserAssignee(entry)) {
        return;
      }
      var fallbackRole = isSubordinate ? 'Подчинённый' : 'Ответственный';
      var label = resolveAssigneeLabel(entry, fallbackRole) || 'Исполнитель';
      var dueDate = entry.assignmentDueDate ? String(entry.assignmentDueDate).trim() : '';

      if (!dueDate && !isSubordinate && doc && doc.dueDate) {
        dueDate = String(doc.dueDate).trim();
      }

      entries.push({
        label: label,
        shortLabel: extractSurname(label),
        dueDate: dueDate
      });
    });

    return entries;
  }

  function buildInstructionAssignments(doc) {
    var assignees = resolveAssigneeList(doc);
    if (!Array.isArray(assignees) || !assignees.length) {
      return [];
    }

    var showAll = !isCurrentUserSubordinate();
    var entries = [];

    assignees.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      var isSubordinate = isSubordinateSnapshot(entry);
      if (isSubordinate && !showAll && !matchesCurrentUserAssignee(entry)) {
        return;
      }

      var fallbackRole = isSubordinate ? 'Подчинённый' : 'Ответственный';
      var label = resolveAssigneeLabel(entry, fallbackRole) || 'Исполнитель';

      var comment = entry.assignmentComment ? String(entry.assignmentComment).trim() : '';
      var dueDate = entry.assignmentDueDate ? String(entry.assignmentDueDate).trim() : '';
      var instruction = entry.assignmentInstruction ? String(entry.assignmentInstruction).trim() : '';

      if (!dueDate && !isSubordinate && doc && doc.dueDate) {
        dueDate = String(doc.dueDate).trim();
      }

      var formatted = formatInstructionAssignment({
        label: label,
        comment: comment,
        instruction: instruction,
        dueDate: dueDate
      });

      if (!formatted) {
        return;
      }

      entries.push({
        label: label,
        comment: comment,
        dueDate: dueDate,
        instruction: instruction,
        formatted: formatted
      });
    });

    return entries;
  }

  function createInstructionCell(doc) {
    var container = createElement('div', 'documents-instruction');
    var primaryAssignee = resolvePrimaryAssignee(doc);
    var assignmentInstruction = primaryAssignee && primaryAssignee.assignmentInstruction
      ? String(primaryAssignee.assignmentInstruction)
      : '';

    var instructionValue = doc && doc.instruction ? String(doc.instruction) : '';
    if (!instructionValue && assignmentInstruction) {
      instructionValue = assignmentInstruction;
    }

    var assignments = buildInstructionAssignments(doc);
    var compact = null;

    if (assignments.length) {
      compact = createElement('div', 'documents-instruction__compact');
      var firstEntry = assignments[0];
      var previewLabel = firstEntry && firstEntry.label ? String(firstEntry.label).trim() : 'Исполнитель';
      var previewInstruction = firstEntry && firstEntry.instruction
        ? String(firstEntry.instruction).trim()
        : String(instructionValue || '').trim();
      var compactText = previewLabel;
      if (previewInstruction) {
        compactText += ' — ' + previewInstruction;
      }
      if (assignments.length > 1) {
        compactText += ' (ещё: ' + (assignments.length - 1) + ')';
      }
      compact.appendChild(createElement('div', 'documents-instruction__compact-item', compactText || '—'));
      if (compact.childNodes.length) {
        container.appendChild(compact);
      }
    } else {
      compact = createElement('div', 'documents-instruction__compact');
      compact.appendChild(createElement('div', 'documents-instruction__compact-item', instructionValue || '—'));
      container.appendChild(compact);
    }

    if (canManageInstructions()) {
      var select = document.createElement('select');
      select.className = 'documents-instruction__select';
      select.setAttribute('aria-label', 'Поручение по документу');
      buildInstructionSelectOptions(select, instructionValue);
      select.addEventListener('change', function() {
        handleInstructionSelectChange(doc, select);
      });
      container.appendChild(select);
    } else if (!assignments.length) {
      var valueList = createElement('div', 'documents-instruction__list');
      valueList.appendChild(createElement('div', 'documents-instruction__item', instructionValue || '—'));
      container.appendChild(valueList);
    }

    if (assignments.length) {
      var list = createElement('div', 'documents-instruction__list');
      assignments.forEach(function(entry) {
        if (!entry || !entry.formatted) {
          return;
        }
        list.appendChild(createElement('div', 'documents-instruction__item', entry.formatted));
      });
      if (list.childNodes.length) {
        container.appendChild(list);
      }
    }

    return container;
  }

  function createDueDateCell(doc) {
    var container = createElement('div', 'documents-due');
    var compact = createElement('div', 'documents-due__compact');
    var list = createElement('div', 'documents-due__list');
    var entries = buildDueDateAssignments(doc);

    if (!entries.length) {
      var fallback = formatDueDateValue(doc && doc.dueDate ? String(doc.dueDate).trim() : '');
      compact.appendChild(createElement('div', 'documents-due__compact-item', fallback));
      list.appendChild(createElement('div', 'documents-due__item', fallback));
    } else {
      entries.forEach(function(entry) {
        if (!entry) {
          return;
        }
        var dueText = formatDueDateValue(entry.dueDate);
        var label = entry.label ? String(entry.label).trim() : '';
        var itemText = label ? label + ': ' + dueText : dueText;
        list.appendChild(createElement('div', 'documents-due__item', itemText));
        compact.appendChild(createElement('div', 'documents-due__compact-item', itemText));
      });
    }

    container.appendChild(compact);
    container.appendChild(list);
    return container;
  }

  function handleStatusSelectChange(doc, select, meta) {
    if (!doc || !doc.id || !select) {
      return;
    }
    var previous = resolveDocumentStatus(doc);
    if (previous === '—') {
      previous = '';
    }
    previous = String(previous || '').trim();
    var nextStatus = String(select.value || '').trim();
    if (nextStatus === previous) {
      return;
    }
    var previousMeta = meta ? meta.textContent : '';
    select.disabled = true;
    select.classList.add('documents-status__select--pending');
    if (meta) {
      meta.textContent = 'Сохраняем...';
    }
    sendUpdate(doc.id, { status: nextStatus, statusUpdatedAt: buildNextStatusTimestamp(doc) }, 'Статус документа обновлён.')
      .catch(function(error) {
        showMessage('error', 'Не удалось обновить статус: ' + error.message);
        if (select) {
          select.value = previous;
        }
        if (meta) {
          meta.textContent = previousMeta || formatStatusMetaText(doc);
        }
      })
      .finally(function() {
        select.disabled = false;
        select.classList.remove('documents-status__select--pending');
        if (meta && meta.textContent === 'Сохраняем...') {
          meta.textContent = formatStatusMetaText(doc);
        }
      });
  }

  function createStatusCell(doc) {
    var container = createElement('div', 'documents-status');
    var statusText = resolveDocumentStatus(doc);
    var role = state.access ? state.access.role : '';
    var hasPermission = state.permissions && state.permissions.canManageInstructions && role !== 'admin';
    var canEditStatus = hasPermission || (role === 'user' && isDocumentAssignedToCurrentUser(doc));
    var meta = createElement('div', 'documents-status__meta', formatStatusMetaText(doc));

    if (canEditStatus) {
      var select = document.createElement('select');
      select.className = 'documents-status__select';
      select.setAttribute('aria-label', 'Статус документа');
      buildStatusSelectOptions(select, statusText !== '—' ? statusText : '');
      select.addEventListener('change', function() {
        handleStatusSelectChange(doc, select, meta);
      });
      container.appendChild(select);
    } else {
      container.appendChild(createElement('div', 'documents-status__value', statusText));
    }

    container.appendChild(meta);
    return container;
  }

  function syncTableRowState(tr, doc) {
    var status = resolveDocumentStatus(doc).toLowerCase();
    tr.classList.remove('documents-row--completed', 'documents-row--control', 'documents-row--overdue');
    if (status.indexOf('выполн') !== -1) {
      tr.classList.add('documents-row--completed');
    } else if (status.indexOf('провер') !== -1) {
      tr.classList.add('documents-row--control');
    }

    if (doc.dueDate && status.indexOf('выполн') === -1) {
      var due = new Date(doc.dueDate);
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!isNaN(due.getTime())) {
        due.setHours(0, 0, 0, 0);
        if (due < today) {
          tr.classList.add('documents-row--overdue');
        }
      }
    }
  }

  function setTableRowExpanded(tr, docId, expanded) {
    var isExpanded = Boolean(expanded);
    tr.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    tr.classList.toggle('documents-row--expanded', isExpanded);
    tr.classList.toggle('documents-row--collapsed', !isExpanded);
    if (docId !== null && docId !== undefined) {
      state.rowExpandedState.set(String(docId), isExpanded);
    }
  }

  function createTableRow(doc, index, filterValues) {
    var tr = createElement('tr', '');
    tr.classList.add('documents-row');
    tr.setAttribute('tabindex', '0');
    tr.dataset.docId = doc && doc.id !== undefined && doc.id !== null ? String(doc.id) : '';
    tr._cellSignatures = {};

    function toggleRowExpanded(forceState) {
      if (typeof forceState === 'boolean') {
        setTableRowExpanded(tr, doc && doc.id, forceState);
        return;
      }
      var currentlyExpanded = tr.getAttribute('aria-expanded') === 'true';
      setTableRowExpanded(tr, doc && doc.id, !currentlyExpanded);
    }

    function isInteractiveElement(element) {
      if (!element || typeof element.closest !== 'function') {
        return false;
      }
      return Boolean(element.closest('button, a, select, input, textarea, label'));
    }

    tr.addEventListener('click', function(event) {
      if (isInteractiveElement(event.target)) {
        return;
      }
      if (typeof tr.focus === 'function') {
        try {
          tr.focus({ preventScroll: true });
        } catch (error) {
          try {
            tr.focus();
          } catch (focusError) {
            // ignore focus errors
          }
        }
      }
      toggleRowExpanded();
    });

    tr.addEventListener('keydown', function(event) {
      var key = event.key || '';
      var target = event.target || null;
      var rowFocused = target === tr;
      if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space') {
        if (!rowFocused || isInteractiveElement(target)) {
          return;
        }
        event.preventDefault();
        toggleRowExpanded();
      } else if (key === 'ArrowRight' && rowFocused) {
        event.preventDefault();
        toggleRowExpanded(true);
      } else if ((key === 'ArrowLeft' || key === 'Escape') && rowFocused) {
        event.preventDefault();
        toggleRowExpanded(false);
      }
    });

    setTableRowExpanded(
      tr,
      doc && doc.id,
      doc && doc.id !== undefined && doc.id !== null
        ? state.rowExpandedState.get(String(doc.id)) === true
        : false
    );
    syncTableRowState(tr, doc);

    renderTableRowCells(tr, doc, index, filterValues, true);
    return tr;
  }

  function updateTableCell(td, descriptor, signature, force) {
    if (!td) {
      return false;
    }
    var columnKey = descriptor.columnKey || '';
    var previousSignature = td.dataset.renderSignature || '';
    if (!force && previousSignature === signature) {
      return false;
    }
    td.className = descriptor.className || '';
    if (columnKey) {
      td.dataset.columnKey = columnKey;
      td.style.fontSize = getColumnFontSize(
        columnKey,
        state.visualSettings && state.visualSettings.columns,
        state.visualSettings && state.visualSettings.fontSize
      ) + 'px';
    } else {
      delete td.dataset.columnKey;
      td.style.fontSize = '';
    }
    td.textContent = '';
    if (typeof descriptor.content === 'string') {
      td.textContent = descriptor.content;
    } else if (descriptor.content instanceof HTMLElement) {
      td.appendChild(descriptor.content);
    } else {
      td.textContent = '—';
    }
    td.dataset.renderSignature = signature;
    return true;
  }

  function renderTableRowCells(tr, doc, index, filterValues, force) {
    if (!tr) {
      return;
    }

    function buildCellDescriptor(content, className, columnKey) {
      var normalizedClass = className || '';
      var displayValue = '';
      if (typeof content === 'string') {
        displayValue = content;
      } else if (content instanceof HTMLElement) {
        displayValue = '';
      } else {
        displayValue = '—';
      }
      if (columnKey === 'entryNumber') {
        normalizedClass += (normalizedClass ? ' ' : '') + 'documents-cell--toggle';
      }
      if (columnKey && state.filters[columnKey]) {
        var valueForMatch = filterValues && Object.prototype.hasOwnProperty.call(filterValues, columnKey)
          ? filterValues[columnKey]
          : displayValue;
        if (valueMatchesQuery(valueForMatch, state.filters[columnKey])) {
          normalizedClass += (normalizedClass ? ' ' : '') + 'documents-cell--highlight';
        }
      }
      if (columnKey === 'assignee' && state.showUnassignedOnly) {
        var hasAssignee = filterValues && filterValues.__hasAssignee;
        if (!hasAssignee) {
          normalizedClass += (normalizedClass ? ' ' : '') + 'documents-cell--highlight';
        }
      }
      if (content instanceof HTMLElement && content.dataset && content.dataset.unviewed === 'true') {
        normalizedClass += (normalizedClass ? ' ' : '') + 'documents-cell--unviewed';
      }
      var signature = stableStringify({
        key: columnKey || '',
        className: normalizedClass,
        displayValue: displayValue,
        filterValue: filterValues && columnKey ? filterValues[columnKey] : '',
        unassignedHighlighted: columnKey === 'assignee' && state.showUnassignedOnly && !(filterValues && filterValues.__hasAssignee),
        contentHtml: content instanceof HTMLElement ? content.outerHTML : ''
      });
      return {
        content: content,
        className: normalizedClass,
        columnKey: columnKey,
        signature: signature
      };
    }

    var displayNumber = doc.entryNumber !== undefined && doc.entryNumber !== null
      ? String(doc.entryNumber)
      : String(index + 1);

    var viewState = filterValues && filterValues.__viewState
      ? filterValues.__viewState
      : collectAssigneeViewState(doc);

    var descriptors = [];
    descriptors.push(buildCellDescriptor(displayNumber, '', 'entryNumber'));
    descriptors.push(buildCellDescriptor(doc.registryNumber || '—', '', 'registryNumber'));
    descriptors.push(buildCellDescriptor(formatDate(doc.registrationDate), '', 'registrationDate'));
    descriptors.push(buildCellDescriptor(doc.direction || '—', '', 'direction'));
    descriptors.push(buildCellDescriptor(doc.correspondent || '—', '', 'correspondent'));
    descriptors.push(buildCellDescriptor(doc.documentNumber || '—', '', 'documentNumber'));
    descriptors.push(buildCellDescriptor(formatDate(doc.documentDate), '', 'documentDate'));
    descriptors.push(buildCellDescriptor(doc.executor || '—', '', 'executor'));
    descriptors.push(buildCellDescriptor(createDirectorCell(doc), 'documents-cell--director', 'director'));
    descriptors.push(buildCellDescriptor(createAssigneeCell(doc, viewState), 'documents-cell--assignee', 'assignee'));
    descriptors.push(buildCellDescriptor(
      createSubordinateCell(doc, viewState),
      'documents-cell--assignee documents-cell--subordinates',
      'subordinates'
    ));
    descriptors.push(buildCellDescriptor(doc.summary || '—', '', 'summary'));
    descriptors.push(buildCellDescriptor(doc.resolution || '—', '', 'resolution'));
    descriptors.push(buildCellDescriptor(createDueDateCell(doc), '', 'dueDate'));
    descriptors.push(buildCellDescriptor(createInstructionCell(doc), 'documents-cell--instruction', 'instruction'));
    descriptors.push(buildCellDescriptor(createStatusCell(doc), 'documents-cell--status', 'status'));

    var filesCell = createElement('div', 'documents-files');
    var attachments = Array.isArray(doc.files) ? doc.files : [];
    var filesSummary = createElement('div', 'documents-files__summary', 'Файлы (' + attachments.length + ')');
    filesCell.appendChild(filesSummary);

    var filesList = createElement('div', 'documents-files__list');
    if (attachments.length) {
      attachments.forEach(function(file) {
        var link = createElement('a', 'documents-file-link', getAttachmentName(file));
        link.href = resolveAttachmentUrl(file, { bustCache: true }) || '';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        var meta = [];
        if (file.size) {
          meta.push(formatSize(file.size));
        }
        if (file.uploadedAt) {
          meta.push(formatDateTime(file.uploadedAt));
        }
        if (meta.length) {
          link.title = meta.join(' • ');
        }
        link.addEventListener('click', function(event) {
          event.preventDefault();
          handleAttachmentPreview(doc, file, link);
        });
        filesList.appendChild(link);
      });
    } else {
      filesList.textContent = '—';
    }
    filesCell.appendChild(filesList);
    descriptors.push(buildCellDescriptor(filesCell, '', 'files'));

    var actions = createElement('div', 'documents-actions');
    var isAdmin = isCurrentUserAdmin();
    var canDeleteDocuments = isAdmin || (state.permissions && state.permissions.canDeleteDocuments === true);
    var directorScope = state.access && typeof state.access.adminScope === 'string'
      ? normalizeRoleValue(state.access.adminScope)
      : '';
    var effectiveRole = normalizeRoleValue(state.effectiveUserRole || '');
    var isDirectorRole = directorScope === 'director'
      || effectiveRole === 'director'
      || effectiveRole.indexOf('директор') !== -1;

    var pdfButton = createElement('button', 'documents-action documents-action--pdf', 'Скачать');
    pdfButton.type = 'button';
    pdfButton.addEventListener('click', function() {
      handlePdfDownload(pdfButton, doc);
    });
    actions.appendChild(pdfButton);

    var responseButton = createElement('button', 'documents-action documents-action--assign', 'Ответ');
    responseButton.type = 'button';
    responseButton.addEventListener('click', function() {
      openResponseModal(doc);
    });
    actions.appendChild(responseButton);

    var hasAttachments = Array.isArray(doc.files) && doc.files.length;
    var viewEntry = findCurrentUserViewEntry(doc);
    var alreadyViewed = Boolean(viewEntry && viewEntry.viewedAt);
    var viewedButton = createElement('button', 'documents-action documents-action--viewed', 'Просмотрено');
    viewedButton.type = 'button';
    viewedButton.disabled = !hasAttachments || alreadyViewed;
    if (!hasAttachments) {
      viewedButton.title = 'Нет прикреплённых файлов.';
    } else if (alreadyViewed) {
      viewedButton.title = 'Уже просмотрено.';
    } else {
      viewedButton.title = 'Отметить как просмотренное.';
    }
    viewedButton.addEventListener('click', function() {
      markDocumentAsViewed(doc, viewedButton);
    });
    actions.appendChild(viewedButton);

    if (isAdmin && state.permissions && state.permissions.canCreateDocuments) {
      var editButton = createElement('button', 'documents-action documents-action--edit', 'Редактировать');
      editButton.type = 'button';
      editButton.addEventListener('click', function() {
        openDocumentForm(doc);
      });
      actions.appendChild(editButton);
    }

    if (isAdmin && canDeleteDocuments && !isDirectorRole) {
      var deleteButton = createElement('button', 'documents-action documents-action--delete', 'Удалить');
      deleteButton.type = 'button';
      deleteButton.addEventListener('click', function() {
        deleteDocument(doc);
      });
      actions.appendChild(deleteButton);
    }

    descriptors.push(buildCellDescriptor(actions, '', 'actions'));

    while (tr.children.length > descriptors.length) {
      tr.removeChild(tr.lastChild);
    }
    for (var cellIndex = 0; cellIndex < descriptors.length; cellIndex += 1) {
      var descriptor = descriptors[cellIndex];
      var td = tr.children[cellIndex];
      if (!td) {
        td = document.createElement('td');
        tr.appendChild(td);
      }
      updateTableCell(td, descriptor, descriptor.signature, force);
    }

    tr.dataset.docId = doc && doc.id !== undefined && doc.id !== null ? String(doc.id) : '';
    syncTableRowState(tr, doc);
  }

  function recalculateUnviewedCounters() {
    var documents = Array.isArray(state.documents) ? state.documents : [];
    var count = 0;
    for (var i = 0; i < documents.length; i += 1) {
      var doc = documents[i];
      if (!documentVisibleForCurrentUser(doc)) {
        continue;
      }
      var viewState = collectAssigneeViewState(doc);
      if (isDocumentUnviewed(viewState)) {
        count += 1;
      }
    }
    var filterDisabled = false;
    if (state.showUnviewedOnly && count === 0) {
      state.showUnviewedOnly = false;
      filterDisabled = true;
    }
    var countChanged = state.unviewedCount !== count;
    state.unviewedCount = count;
    updateUnviewedButtonState();
    if (filterDisabled) {
      updateFilterBar();
    }
    return { countChanged: countChanged, filterDisabled: filterDisabled };
  }

  function parseSortableDate(value) {
    if (!value) {
      return null;
    }
    var text = String(value).trim();
    if (!text || text === '—') {
      return null;
    }
    var isoLike = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (isoLike) {
      var isoYear = Number(isoLike[1]);
      var isoMonth = Number(isoLike[2]) - 1;
      var isoDay = Number(isoLike[3]);
      var isoDate = new Date(isoYear, isoMonth, isoDay);
      if (!isNaN(isoDate.getTime())) {
        return isoDate.getTime();
      }
    }
    var match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!match) {
      return null;
    }
    var day = Number(match[1]);
    var month = Number(match[2]) - 1;
    var year = Number(match[3]);
    if (year < 100) {
      year += 2000;
    }
    var parsed = new Date(year, month, day);
    if (isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.getTime();
  }

  function compareSortValues(a, b) {
    function classifySortValue(value) {
      var text = String(value === undefined || value === null ? '' : value).trim();
      if (!text || text === '—') {
        return { type: 'empty', text: '' };
      }
      var compact = text.replace(/\s+/g, '');
      if (/^\d+(?:[.,]\d+)?$/.test(compact)) {
        return { type: 'number', number: Number(compact.replace(',', '.')), text: text };
      }
      var leadingNumberMatch = compact.match(/^\d+/);
      if (leadingNumberMatch) {
        return {
          type: 'digitPrefix',
          prefixNumber: Number(leadingNumberMatch[0]),
          text: text
        };
      }
      var firstLetterMatch = text.match(/[\p{L}]/u);
      if (firstLetterMatch) {
        return { type: 'letter', firstLetter: firstLetterMatch[0].toLowerCase(), text: text };
      }
      return { type: 'text', text: text };
    }

    var leftDate = parseSortableDate(a);
    var rightDate = parseSortableDate(b);
    if (leftDate !== null && rightDate !== null) {
      if (leftDate < rightDate) {
        return -1;
      }
      if (leftDate > rightDate) {
        return 1;
      }
      return 0;
    }

    var leftMeta = classifySortValue(a);
    var rightMeta = classifySortValue(b);

    if (leftMeta.type === 'number' && rightMeta.type === 'number') {
      if (leftMeta.number < rightMeta.number) {
        return -1;
      }
      if (leftMeta.number > rightMeta.number) {
        return 1;
      }
      return 0;
    }

    if (leftMeta.type === 'digitPrefix' && rightMeta.type === 'digitPrefix') {
      if (leftMeta.prefixNumber < rightMeta.prefixNumber) {
        return -1;
      }
      if (leftMeta.prefixNumber > rightMeta.prefixNumber) {
        return 1;
      }
    }

    if ((leftMeta.type === 'number' || leftMeta.type === 'digitPrefix')
      && (rightMeta.type === 'number' || rightMeta.type === 'digitPrefix')) {
      var leftBase = leftMeta.type === 'number' ? leftMeta.number : leftMeta.prefixNumber;
      var rightBase = rightMeta.type === 'number' ? rightMeta.number : rightMeta.prefixNumber;
      if (leftBase < rightBase) {
        return -1;
      }
      if (leftBase > rightBase) {
        return 1;
      }
    }

    var leftNumericLike = leftMeta.type === 'number' || leftMeta.type === 'digitPrefix';
    var rightNumericLike = rightMeta.type === 'number' || rightMeta.type === 'digitPrefix';
    if (leftNumericLike !== rightNumericLike) {
      return leftNumericLike ? -1 : 1;
    }

    if (leftMeta.type === 'letter' && rightMeta.type === 'letter') {
      var letterCompare = leftMeta.firstLetter.localeCompare(rightMeta.firstLetter, 'ru', { sensitivity: 'base' });
      if (letterCompare !== 0) {
        return letterCompare;
      }
    }

    return String(a || '').localeCompare(String(b || ''), 'ru', { sensitivity: 'base', numeric: true });
  }

  function applyTableSorting(entries) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    var sorting = state.visualSettings && state.visualSettings.sorting
      ? normalizeSortingSettings(state.visualSettings.sorting)
      : buildDefaultSortingSettings();
    if (!sorting.enabled || !sorting.rules.length) {
      return list;
    }
    list.sort(function(left, right) {
      var leftValues = left && left.values ? left.values : {};
      var rightValues = right && right.values ? right.values : {};
      for (var i = 0; i < sorting.rules.length; i += 1) {
        var rule = sorting.rules[i];
        var key = rule.column;
        var direction = normalizeSortDirection(rule.direction);
        var result = compareSortValues(leftValues[key], rightValues[key]);
        if (result !== 0) {
          return direction === 'desc' ? -result : result;
        }
      }
      return (left && typeof left.index === 'number' ? left.index : 0) - (right && typeof right.index === 'number' ? right.index : 0);
    });
    return list;
  }

  function createTableSpacerRow(className) {
    var row = createElement('tr', className);
    row.setAttribute('aria-hidden', 'true');
    var cell = document.createElement('td');
    cell.colSpan = TABLE_COLUMNS.length;
    cell.style.padding = '0';
    cell.style.border = '0';
    cell.style.height = '0px';
    row.appendChild(cell);
    return row;
  }

  function ensureVirtualTableStructure() {
    if (!elements.tableBody) {
      return;
    }
    if (!elements.tableTopSpacer) {
      elements.tableTopSpacer = createTableSpacerRow('documents-table__spacer documents-table__spacer--top');
    }
    if (!elements.tableBottomSpacer) {
      elements.tableBottomSpacer = createTableSpacerRow('documents-table__spacer documents-table__spacer--bottom');
    }
    if (elements.tableTopSpacer.parentNode !== elements.tableBody) {
      elements.tableBody.insertBefore(elements.tableTopSpacer, elements.tableBody.firstChild);
    }
    if (elements.tableBottomSpacer.parentNode !== elements.tableBody) {
      elements.tableBody.appendChild(elements.tableBottomSpacer);
    }
  }

  function setSpacerHeight(spacer, height) {
    if (!spacer || !spacer.firstChild) {
      return;
    }
    spacer.firstChild.style.height = Math.max(0, Math.round(height || 0)) + 'px';
  }

  function ensureVirtualRowHeight() {
    var rowHeight = Number(state.virtualTable.rowHeight) || 0;
    if (rowHeight > 0) {
      return rowHeight;
    }
    state.rowCache.forEach(function(row) {
      if (rowHeight > 0 || !row || typeof row.getBoundingClientRect !== 'function') {
        return;
      }
      var rect = row.getBoundingClientRect();
      if (rect && rect.height > 0) {
        rowHeight = rect.height;
      }
    });
    if (!(rowHeight > 0)) {
      rowHeight = 52;
    }
    state.virtualTable.rowHeight = rowHeight;
    return rowHeight;
  }

  function getVirtualRange(totalRows) {
    var rowHeight = ensureVirtualRowHeight();
    var scrollContainer = elements.tableScroll;
    var viewportHeight = scrollContainer ? scrollContainer.clientHeight : 0;
    var scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    if (!(viewportHeight > 0)) {
      viewportHeight = rowHeight * state.virtualTable.minVisibleRows;
    }

    var visibleEstimate = Math.ceil(viewportHeight / rowHeight);
    var visibleRows = Math.max(
      state.virtualTable.minVisibleRows,
      Math.min(state.virtualTable.maxVisibleRows, visibleEstimate)
    );
    var startIndex = Math.floor(scrollTop / rowHeight) - state.virtualTable.overscan;
    if (startIndex < 0) {
      startIndex = 0;
    }
    var endIndex = startIndex + visibleRows + state.virtualTable.overscan * 2 - 1;
    if (endIndex >= totalRows) {
      endIndex = totalRows - 1;
      startIndex = Math.max(0, endIndex - (visibleRows + state.virtualTable.overscan * 2 - 1));
    }

    return {
      startIndex: startIndex,
      endIndex: endIndex,
      rowHeight: rowHeight
    };
  }

  function clearVirtualTableRows(clearExpansionState) {
    if (state.virtualTable.renderFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(state.virtualTable.renderFrame);
      state.virtualTable.renderFrame = 0;
    }
    state.virtualTable.filteredEntries = [];
    setSpacerHeight(elements.tableTopSpacer, 0);
    setSpacerHeight(elements.tableBottomSpacer, 0);
    state.rowCache.forEach(function(row, cacheId) {
      if (row && row.parentNode) {
        row.parentNode.removeChild(row);
      }
      state.rowCache.delete(cacheId);
      if (clearExpansionState) {
        state.rowExpandedState.delete(cacheId);
      }
    });
  }

  function renderVirtualTableRows() {
    if (!elements.tableBody) {
      return;
    }
    ensureVirtualTableStructure();
    var entries = Array.isArray(state.virtualTable.filteredEntries) ? state.virtualTable.filteredEntries : [];
    if (!entries.length) {
      clearVirtualTableRows(false);
      return;
    }

    var range = getVirtualRange(entries.length);
    var fragment = document.createDocumentFragment();
    var visibleIds = {};

    for (var rowIndex = range.startIndex; rowIndex <= range.endIndex; rowIndex += 1) {
      var filteredEntry = entries[rowIndex] || {};
      var filteredDoc = filteredEntry.doc;
      if (!filteredDoc || filteredDoc.id === undefined || filteredDoc.id === null) {
        continue;
      }
      var valueSet = filteredEntry.values || {};
      valueSet.entryNumber = filteredDoc.entryNumber !== undefined && filteredDoc.entryNumber !== null
        ? String(filteredDoc.entryNumber)
        : String(rowIndex + 1);

      var cacheKey = String(filteredDoc.id);
      var row = state.rowCache.get(cacheKey);
      if (!row) {
        row = createTableRow(filteredDoc, rowIndex, valueSet);
        state.rowCache.set(cacheKey, row);
      } else {
        renderTableRowCells(row, filteredDoc, rowIndex, valueSet, false);
      }
      setTableRowExpanded(row, cacheKey, state.rowExpandedState.get(cacheKey) === true);
      fragment.appendChild(row);
      visibleIds[cacheKey] = true;
    }

    state.rowCache.forEach(function(cachedRow, cachedId) {
      if (visibleIds[cachedId]) {
        return;
      }
      if (cachedRow && cachedRow.parentNode) {
        cachedRow.parentNode.removeChild(cachedRow);
      }
      state.rowCache.delete(cachedId);
    });

    if (elements.tableTopSpacer.parentNode === elements.tableBody) {
      elements.tableBody.removeChild(elements.tableTopSpacer);
    }
    if (elements.tableBottomSpacer.parentNode === elements.tableBody) {
      elements.tableBody.removeChild(elements.tableBottomSpacer);
    }

    elements.tableBody.appendChild(elements.tableTopSpacer);
    elements.tableBody.appendChild(fragment);
    elements.tableBody.appendChild(elements.tableBottomSpacer);

    setSpacerHeight(elements.tableTopSpacer, range.startIndex * range.rowHeight);
    setSpacerHeight(elements.tableBottomSpacer, (entries.length - range.endIndex - 1) * range.rowHeight);

    if (!state.virtualTable.rowHeight && state.rowCache.size) {
      state.virtualTable.rowHeight = ensureVirtualRowHeight();
    }
  }

  function scheduleVirtualTableRender() {
    if (state.virtualTable.renderFrame) {
      return;
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      state.virtualTable.renderFrame = window.requestAnimationFrame(function() {
        state.virtualTable.renderFrame = 0;
        renderVirtualTableRows();
      });
      return;
    }
    renderVirtualTableRows();
  }

  function bindVirtualTableScroll(container) {
    if (!container || container.dataset.virtualScrollBound === 'true') {
      return;
    }
    container.dataset.virtualScrollBound = 'true';
    container.addEventListener('scroll', function() {
      scheduleVirtualTableRender();
    }, { passive: true });
  }

  function updateTable() {
    if (!elements.tableBody) {
      return;
    }

    var documents = Array.isArray(state.documents) ? state.documents : [];
    var filteredEntries = [];

    for (var i = 0; i < documents.length; i += 1) {
      var doc = documents[i];
      if (!documentVisibleForCurrentUser(doc)) {
        continue;
      }
      var values = computeFilterValues(doc, i);
      if (matchesDocumentFilters(values)) {
        filteredEntries.push({ doc: doc, values: values, index: i });
      }
    }

    filteredEntries = applyTableSorting(filteredEntries);

    var filtersActive = hasActiveFilters() || state.showUnassignedOnly;

    if (!filteredEntries.length) {
      clearVirtualTableRows(true);
      if (elements.emptyState) {
        elements.emptyState.style.display = 'block';
        if (!documents.length) {
          elements.emptyState.textContent = state.organization
            ? 'Реестр пуст. Добавьте первый документ.'
            : 'Организация не определена для этой страницы.';
        } else if (filtersActive) {
          elements.emptyState.textContent = 'По текущим фильтрам ничего не найдено.';
        } else {
          elements.emptyState.textContent = 'Документы не найдены.';
        }
      }
      applyColumnWidths();
      setToolbarState();
      return;
    }

    if (elements.emptyState) {
      elements.emptyState.style.display = 'none';
    }

    state.virtualTable.filteredEntries = filteredEntries;
    renderVirtualTableRows();

    applyColumnWidths();
    setToolbarState();
  }

  function handleResponse(response) {
    var contentType = response.headers ? response.headers.get('Content-Type') || '' : '';

    if (!response.ok) {
      if (contentType.indexOf('application/json') !== -1) {
        return response.json().then(function(data) {
          var message = data && typeof data === 'object'
            ? (data.error || data.message || '')
            : '';
          throw new Error(message || ('Статус ответа: ' + response.status));
        }).catch(function(error) {
          if (error instanceof Error) {
            throw error;
          }
          throw new Error('Статус ответа: ' + response.status);
        });
      }
      return Promise.reject(new Error('Статус ответа: ' + response.status));
    }

    if (contentType.indexOf('application/json') === -1) {
      return response.text().then(function() {
        return {};
      });
    }
    return response.json();
  }

  function uploadFormDataWithProgress(url, formData, progressHandler) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.withCredentials = true;

      if (xhr.upload && typeof progressHandler === 'function') {
        xhr.upload.onprogress = function(event) {
          progressHandler({
            loaded: event && typeof event.loaded === 'number' ? event.loaded : 0,
            total: event && typeof event.total === 'number' ? event.total : 0,
            lengthComputable: Boolean(event && event.lengthComputable)
          });
        };
      }

      xhr.onerror = function() {
        reject(new Error('Сетевая ошибка при загрузке данных.'));
      };

      xhr.onload = function() {
        var contentType = xhr.getResponseHeader('Content-Type') || '';
        var isJson = contentType.indexOf('application/json') !== -1;
        var payload = xhr.responseText || '';
        var data = {};

        if (isJson && payload) {
          try {
            data = JSON.parse(payload);
          } catch (parseError) {
            reject(new Error('Сервер вернул некорректный JSON.'));
            return;
          }
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          var message = isJson && data && typeof data === 'object'
            ? (data.error || data.message || '')
            : '';
          reject(new Error(message || ('Статус ответа: ' + xhr.status)));
          return;
        }

        resolve(data);
      };

      xhr.send(formData);
    });
  }

  var DOCUMENTS_UPLOAD_BATCH_SIZE = 8;

  function splitFilesToBatches(files, batchSize) {
    if (!Array.isArray(files) || !files.length) {
      return [];
    }
    var size = Math.max(1, Number(batchSize) || DOCUMENTS_UPLOAD_BATCH_SIZE);
    var batches = [];
    for (var i = 0; i < files.length; i += size) {
      batches.push(files.slice(i, i + size));
    }
    return batches;
  }

  function resolveDocumentsCollection(payload) {
    if (!payload || payload.documents === undefined || payload.documents === null) {
      return [];
    }

    var documents = payload.documents;
    if (Array.isArray && Array.isArray(documents)) {
      return documents;
    }

    if (documents && typeof documents === 'object') {
      var candidateKeys = ['items', 'records', 'list', 'data', 'value'];
      for (var i = 0; i < candidateKeys.length; i += 1) {
        var candidateKey = candidateKeys[i];
        if (Array.isArray && Array.isArray(documents[candidateKey])) {
          return documents[candidateKey];
        }
      }

      if (typeof documents.length === 'number') {
        var arrayLike = [];
        for (var index = 0; index < documents.length; index += 1) {
          if (Object.prototype.hasOwnProperty.call(documents, index)) {
            arrayLike.push(documents[index]);
          }
        }
        if (arrayLike.length || documents.length === 0) {
          return arrayLike;
        }
      }

      var values = [];
      for (var key in documents) {
        if (Object.prototype.hasOwnProperty.call(documents, key)) {
          values.push(documents[key]);
        }
      }
      return values;
    }

    return [];
  }

  function updateStateFromPayload(data) {
    if (!state.directorCache || typeof state.directorCache !== 'object') {
      state.directorCache = {};
    }

    var rawDocuments = resolveDocumentsCollection(data);
    var processedDocuments = [];
    var activeDirectorKeys = {};

    for (var i = 0; i < rawDocuments.length; i += 1) {
      var doc = rawDocuments[i];
      if (doc && typeof doc === 'object') {
        var cacheKey = getDocumentDirectorCacheKey(doc);
        if (cacheKey) {
          activeDirectorKeys[cacheKey] = true;
          var directorEntry = resolveDirectorEntry(doc);
          if (directorEntry) {
            state.directorCache[cacheKey] = cloneDirectorEntry(directorEntry) || directorEntry;
          } else if (state.directorCache && state.directorCache[cacheKey]) {
            var cachedDirector = cloneDirectorEntry(state.directorCache[cacheKey]) || state.directorCache[cacheKey];
            if (cachedDirector && typeof cachedDirector === 'object') {
              if (!doc.director || typeof doc.director !== 'object') {
                doc.director = cloneDirectorEntry(cachedDirector) || cachedDirector;
              }
              if (!Array.isArray(doc.directors) || !doc.directors.length) {
                doc.directors = [cloneDirectorEntry(cachedDirector) || cachedDirector];
              }
            }
          }
        }
      }
      processedDocuments.push(doc);
    }

    state.documents = processedDocuments;

    for (var cacheKey in state.directorCache) {
      if (!Object.prototype.hasOwnProperty.call(state.directorCache, cacheKey)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(activeDirectorKeys, cacheKey)) {
        delete state.directorCache[cacheKey];
      }
    }

    if (data && typeof data.storagePath === 'string') {
      state.storagePath = data.storagePath;
    }
    if (data && typeof data.storageDisplayPath === 'string') {
      state.storageDisplayPath = data.storageDisplayPath;
    }
    if (!state.permissions || typeof state.permissions !== 'object') {
      state.permissions = { canManageInstructions: false, canCreateDocuments: false, canDeleteDocuments: false };
    }
    if (data && data.permissions && typeof data.permissions === 'object') {
      if (Object.prototype.hasOwnProperty.call(data.permissions, 'canManageInstructions')
        && typeof data.permissions.canManageInstructions === 'boolean') {
        state.permissions.canManageInstructions = data.permissions.canManageInstructions;
      }
      if (Object.prototype.hasOwnProperty.call(data.permissions, 'canCreateDocuments')
        && typeof data.permissions.canCreateDocuments === 'boolean') {
        state.permissions.canCreateDocuments = data.permissions.canCreateDocuments;
      }
      if (Object.prototype.hasOwnProperty.call(data.permissions, 'canDeleteDocuments')
        && typeof data.permissions.canDeleteDocuments === 'boolean') {
        state.permissions.canDeleteDocuments = data.permissions.canDeleteDocuments;
      }
    }
    if (data && typeof data.canManageInstructions === 'boolean') {
      state.permissions.canManageInstructions = data.canManageInstructions;
    }
    if (data && typeof data.canCreateDocuments === 'boolean') {
      state.permissions.canCreateDocuments = data.canCreateDocuments;
    }
    if (data && typeof data.canDeleteDocuments === 'boolean') {
      state.permissions.canDeleteDocuments = data.canDeleteDocuments;
    }
    if (data && data.userId !== undefined && data.userId !== null) {
      var resolvedId = String(data.userId).trim();
      if (resolvedId) {
        state.telegramUserId = resolvedId;
      }
    } else if (data && data.user && typeof data.user === 'object') {
      var candidateId = data.user.id !== undefined && data.user.id !== null
        ? String(data.user.id).trim()
        : '';
      if (candidateId) {
        state.telegramUserId = candidateId;
      }
    }
    refreshUserAssignmentKeys();
    recalculateUnviewedCounters();
    updateClockUserDisplay();
    updateTable();
    return state.documents;
  }

  function applyLocalDocumentUpdate(documentId, fields) {
    if (!documentId || !fields || !state || !Array.isArray(state.documents)) {
      return;
    }

    var target = null;
    for (var i = 0; i < state.documents.length; i += 1) {
      var candidate = state.documents[i];
      if (candidate && candidate.id && String(candidate.id) === String(documentId)) {
        target = candidate;
        break;
      }
    }

    if (!target) {
      return;
    }

    var stringFields = [
      'registryNumber',
      'registrationDate',
      'direction',
      'correspondent',
      'documentNumber',
      'documentDate',
      'executor',
      'dueDate',
      'summary',
      'resolution',
      'notes',
      'instruction',
      'status',
      'statusUpdatedAt',
      'completedAt'
    ];

    stringFields.forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        target[key] = fields[key];
      }
    });

    if (Object.prototype.hasOwnProperty.call(fields, 'assignees') || Object.prototype.hasOwnProperty.call(fields, 'assignee')) {
      var resolvedAssignees = [];
      if (Array.isArray(fields.assignees)) {
        resolvedAssignees = fields.assignees.slice();
      } else if (fields.assignee && typeof fields.assignee === 'object' && !Array.isArray(fields.assignee)) {
        resolvedAssignees = Object.keys(fields.assignee).length ? [fields.assignee] : [];
      }
      if (resolvedAssignees.length) {
        target.assignees = resolvedAssignees;
      } else {
        delete target.assignees;
      }
      delete target.assignee;
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'subordinates')) {
      if (Array.isArray(fields.subordinates) && fields.subordinates.length) {
        target.subordinates = fields.subordinates.slice();
      } else {
        delete target.subordinates;
      }
      delete target.subordinate;
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'directors') || Object.prototype.hasOwnProperty.call(fields, 'director')) {
      var resolvedDirectors = [];
      if (Array.isArray(fields.directors)) {
        resolvedDirectors = fields.directors.slice();
      } else if (fields.director && typeof fields.director === 'object' && !Array.isArray(fields.director)) {
        resolvedDirectors = Object.keys(fields.director).length ? [fields.director] : [];
      }
      if (resolvedDirectors.length) {
        target.director = resolvedDirectors[0];
        target.directors = resolvedDirectors;
      } else {
        delete target.director;
        delete target.directors;
      }
    }

    if (!target.updatedAt) {
      target.updatedAt = new Date().toISOString();
    }
  }

  function loadRegistry(organization) {
    if (!organization) {
      state.documents = [];
      updateTable();
      sendClientDiagnostics('registry_skipped', { reason: 'organization_missing' });
      return Promise.resolve([]);
    }

    clearMessage();

    return fetch(buildApiUrl('list', { organization: organization }), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(handleResponse)
      .then(function(data) {
        var documents = updateStateFromPayload(data);
        var summary = {
          count: documents.length
        };
        if (data && typeof data.storagePath === 'string' && data.storagePath !== '') {
          summary.storagePath = data.storagePath;
        }
        if (documents.length) {
          var sampleIds = [];
          for (var i = 0; i < documents.length && sampleIds.length < 3; i += 1) {
            var doc = documents[i];
            if (doc && doc.id) {
              sampleIds.push(doc.id);
            }
          }
          if (sampleIds.length) {
            summary.sampleIds = sampleIds;
          }
        }
        sendClientDiagnostics('registry_loaded', summary);
        showMessage('success', documents.length
          ? 'Загружено документов: ' + documents.length
          : 'Реестр пока пуст.');
        return documents;
      })
      .catch(function(error) {
        sendClientDiagnostics('registry_load_error', { message: error && error.message ? error.message : String(error) });
        showMessage('error', 'Не удалось загрузить реестр: ' + (error && error.message ? error.message : String(error)));
        throw error;
      });
  }

  function refreshRegistrySilently() {
    if (!state.organization) {
      return Promise.reject(new Error('Организация не определена.'));
    }

    return fetch(buildApiUrl('list', { organization: state.organization, cacheBust: Date.now() }), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(handleResponse)
      .then(function(data) {
        return updateStateFromPayload(data);
      });
  }

  function sendUpdate(documentId, fields, successMessage) {
    if (!state.organization) {
      return Promise.reject(new Error('Не выбрана организация.'));
    }
    var payload = {
      action: 'update',
      organization: state.organization,
      documentId: documentId,
      fields: fields || {}
    };
    mergeTelegramUserId(payload);
    return fetch(buildApiUrl('update', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        updateStateFromPayload(data);
        if (successMessage) {
          showMessage('success', successMessage);
        } else if (data && data.message) {
          showMessage('success', data.message);
        }
      });
  }

  function deleteDocument(doc) {
    if (!doc || !doc.id) {
      return;
    }
    if (!isCurrentUserAdmin() && (!state.permissions || state.permissions.canDeleteDocuments !== true)) {
      showMessage('error', 'Удаление документов недоступно для вашего аккаунта.');
      return;
    }
    var confirmationText = 'Удалить запись № ' + (doc.entryNumber || '') + ' без возможности восстановления?';
    if (!window.confirm(confirmationText)) {
      return;
    }
    var payload = {
      action: 'delete',
      organization: state.organization,
      documentId: doc.id
    };
    mergeTelegramUserId(payload);
    fetch(buildApiUrl('delete', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        updateStateFromPayload(data);
        if (data && data.message) {
          showMessage('success', data.message);
        }
      })
      .catch(function(error) {
        showMessage('error', 'Не удалось удалить документ: ' + error.message);
      });
  }


  function findDocumentById(documentId) {
    var list = Array.isArray(state.documents) ? state.documents : [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && String(list[i].id || '') === String(documentId || '')) {
        return list[i];
      }
    }
    return null;
  }

  function logResponseDeletion(message, payload) {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    if (payload === undefined) {
      console.log('[Удаление] ' + message);
      return;
    }
    console.log('[Удаление] ' + message, payload);
  }

  function getCurrentResponseUserKeys() {
    var keys = [];
    var seen = Object.create(null);

    function pushKey(value) {
      var key = value ? String(value).trim().toLowerCase() : '';
      if (!key || seen[key]) {
        return;
      }
      seen[key] = true;
      keys.push(key);
    }

    var accessUser = state.access && state.access.user ? state.access.user : null;
    buildAssigneeKeyCandidates(accessUser).forEach(function(key) {
      pushKey(key);
      if (key.indexOf('id::') === 0) {
        pushKey('id:' + key.slice(4));
      } else if (key.indexOf('name::') === 0) {
        pushKey('name:' + key.slice(6));
      }
    });

    if (accessUser && typeof accessUser === 'object') {
      [
        accessUser.id,
        accessUser.telegram,
        accessUser.telegramId,
        accessUser.chatId,
        accessUser.number,
        accessUser.responsibleNumber
      ].forEach(function(candidate) {
        var normalizedId = normalizeAssigneeIdentifier(candidate);
        if (!normalizedId) {
          return;
        }
        pushKey('id:' + normalizedId);
        pushKey('id::' + normalizedId);
      });
      [accessUser.login, accessUser.username].forEach(function(candidate) {
        var normalizedLogin = normalizeUserIdentifier(candidate);
        if (!normalizedLogin) {
          return;
        }
        pushKey('login:' + normalizedLogin);
        pushKey('username:' + normalizedLogin);
        pushKey('id:' + normalizedLogin);
        pushKey('id::' + normalizedLogin);
      });
      [accessUser.name, accessUser.fullName, accessUser.displayName, accessUser.responsible].forEach(function(candidate) {
        var normalizedName = normalizeUserIdentifier(candidate);
        if (!normalizedName) {
          return;
        }
        pushKey('name:' + normalizedName);
        pushKey('name::' + normalizedName);
      });
    }

    var accessKey = resolveUserKey(state.access);
    if (accessKey) {
      pushKey(accessKey);
    }

    var telegramId = getTelegramUserId();
    if (telegramId) {
      pushKey('id:' + String(telegramId));
      pushKey('id::' + String(telegramId));
    }

    logResponseDeletion('Текущие ключи пользователя для удаления ответа', {
      documentOrganization: state.organization || '',
      accessUser: accessUser,
      telegramUserId: telegramId || '',
      keys: keys
    });

    return keys;
  }

  function canDeleteResponseFile(file) {
    if (!file || typeof file !== 'object') {
      logResponseDeletion('Проверка удаления ответа пропущена: неверный объект файла', file);
      return false;
    }
    var currentKeys = getCurrentResponseUserKeys();
    if (!currentKeys.length) {
      logResponseDeletion('Проверка удаления ответа: не удалось определить ключи текущего пользователя', {
        file: file
      });
      return false;
    }
    var uploadedByKey = file.uploadedByKey ? String(file.uploadedByKey).trim().toLowerCase() : '';
    if (uploadedByKey && currentKeys.indexOf(uploadedByKey) !== -1) {
      logResponseDeletion('Кнопка удаления показана по совпадению uploadedByKey', {
        file: file,
        matchedKey: uploadedByKey,
        currentKeys: currentKeys
      });
      return true;
    }
    logResponseDeletion('Кнопка удаления скрыта: совпадение не найдено', {
      file: file,
      currentKeys: currentKeys,
      uploadedByKey: uploadedByKey,
      uploadedBy: file.uploadedBy ? String(file.uploadedBy) : ''
    });
    return false;
  }

  function openResponseModal(doc) {
    if (!doc || !doc.id) {
      showMessage('error', 'Не удалось определить задачу для ответа.');
      return;
    }
    ensureResponsesStyle();

    var currentDoc = findDocumentById(doc.id) || doc;
    var pendingFiles = [];
    var dragCounter = 0;
    var editingResponse = null;
    var modal = createElement('div', 'documents-responses-modal');
    var panel = createElement('div', 'documents-responses-panel');
    var header = createElement('div', 'documents-responses-header');
    var title = createElement('div', 'documents-responses-title', 'Загрузить ответ');
    var headerActions = createElement('div', 'documents-responses-actions');
    var aiButton = createElement('button', 'documents-button documents-button--ai', 'Ответ с помощью ИИ');
    var aiBriefButton = createElement('button', 'documents-button documents-button--ai', 'Кратко ИИ');
    var saveButton = createElement('button', 'documents-button documents-button--primary', 'Сохранить');
    var closeButton = createElement('button', 'documents-button documents-button--secondary', 'Закрыть');
    var body = createElement('div', 'documents-responses-body');
    var toolbar = createElement('div', 'documents-responses-toolbar');
    var addButton = createElement('button', 'documents-button documents-button--secondary', 'Выбрать документы');
    var dropzone = createElement('div', 'documents-responses-dropzone');
    var dropzoneCopy = createElement('div', 'documents-responses-dropzone-copy');
    var dropzoneTitle = createElement('div', 'documents-responses-dropzone-title', 'Перетащите файлы сюда');
    var dropzoneHint = createElement('div', 'documents-responses-dropzone-hint', 'Можно также нажать для выбора, вставить файлы из буфера обмена или перетащить их в это окно.');
    var dropzoneBadge = createElement('div', 'documents-responses-dropzone-badge', 'Drag & Drop • Ctrl+V');
    var hint = createElement('div', 'documents-responses-hint', 'Ответы привязаны к задаче и показываются сразу без перезагрузки страницы.');
    var messageWrap = createElement('div', 'documents-responses-message');
    var messageLabel = createElement('label', 'documents-responses-message-label', 'Текстовый ответ (.txt)');
    var messageCounter = createElement('span', 'documents-responses-message-counter', '0 / 12000');
    var messageInput = document.createElement('textarea');
    messageInput.placeholder = 'Напишите комментарий к задаче. Можно сохранить только текст без прикрепления файлов.';
    messageInput.maxLength = 12000;
    messageInput.setAttribute('aria-label', 'Текстовый ответ к задаче');
    var tableWrap = createElement('div', 'documents-responses-table-wrap');
    var hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.multiple = true;
    hiddenInput.hidden = true;

    function syncCurrentDoc() {
      currentDoc = findDocumentById(doc.id) || currentDoc || doc;
      logResponseDeletion('Синхронизация окна ответа', {
        documentId: doc.id,
        registryNumber: currentDoc && currentDoc.registryNumber ? currentDoc.registryNumber : '',
        responsesCount: currentDoc && Array.isArray(currentDoc.responses) ? currentDoc.responses.length : 0
      });
    }

    function mergePendingFiles(selected, sourceLabel) {
      var files = Array.isArray(selected) ? selected.filter(Boolean) : [];
      if (!files.length) {
        return 0;
      }
      var nextFiles = pendingFiles.slice();
      var addedCount = 0;
      files.forEach(function(file) {
        var duplicate = nextFiles.some(function(item) {
          return item.name === file.name && item.size === file.size && item.lastModified === file.lastModified;
        });
        if (!duplicate) {
          nextFiles.push(file);
          addedCount += 1;
        }
      });
      pendingFiles = nextFiles;
      renderTable();
      if (addedCount && sourceLabel) {
        showMessage('success', 'Добавлено файлов: ' + addedCount + ' (' + sourceLabel + ').');
      }
      return addedCount;
    }

    function getClipboardFiles(event) {
      var items = event && event.clipboardData && event.clipboardData.items
        ? Array.from(event.clipboardData.items)
        : [];
      var files = [];
      items.forEach(function(item) {
        if (!item || item.kind !== 'file') {
          return;
        }
        var file = item.getAsFile ? item.getAsFile() : null;
        if (file) {
          files.push(file);
        }
      });
      return files;
    }

    function setDragState(active) {
      dropzone.classList.toggle('is-dragover', Boolean(active));
    }

    function isTextResponseFile(file) {
      if (!file || typeof file !== 'object') {
        return false;
      }
      if (file.isTextFile) {
        return true;
      }
      var name = getAttachmentName(file);
      return /\.txt$/i.test(name || '');
    }

    function renderTable() {
      syncCurrentDoc();
      tableWrap.innerHTML = '';
      var uploaded = currentDoc && Array.isArray(currentDoc.responses) ? currentDoc.responses.slice() : [];
      if (!uploaded.length && !pendingFiles.length) {
        tableWrap.appendChild(createElement('div', 'documents-responses-empty', 'Пока нет загруженных ответов. Добавьте документ кнопкой, перетаскиванием или вставкой из буфера.'));
        return;
      }
      var table = createElement('table', 'documents-responses-table');
      var thead = createElement('thead', '');
      var headRow = createElement('tr', '');
      ['Документ', 'Кто загрузил', 'Статус', 'Действие'].forEach(function(text) {
        headRow.appendChild(createElement('th', '', text));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = createElement('tbody', '');

      uploaded.forEach(function(file) {
        var row = createElement('tr', '');
        var nameCell = createElement('td', '');
        var fileBox = createElement('div', 'documents-responses-file');
        var isTxtFile = isTextResponseFile(file);
        var textContent = typeof file.textContent === 'string' ? file.textContent.trim() : '';
        if (isTxtFile && textContent) {
          fileBox.appendChild(createElement('div', '', getAttachmentName(file)));
          var preview = createElement('pre', 'documents-responses-text-preview', textContent);
          fileBox.appendChild(preview);
        } else {
          var link = createElement('a', '', getAttachmentName(file));
          link.href = resolveAttachmentUrl(file, { bustCache: true }) || '';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.addEventListener('click', function(event) {
            event.preventDefault();
            handleAttachmentPreview(currentDoc, file, link);
          });
          fileBox.appendChild(link);
        }
        var metaParts = [];
        if (file.size) {
          metaParts.push(formatSize(file.size));
        }
        if (file.uploadedAt) {
          metaParts.push(formatDateTime(file.uploadedAt));
        }
        if (metaParts.length) {
          fileBox.appendChild(createElement('div', 'documents-responses-meta', metaParts.join(' • ')));
        }
        nameCell.appendChild(fileBox);
        row.appendChild(nameCell);
        row.appendChild(createElement('td', '', file.uploadedBy || '—'));
        var statusCell = createElement('td', '');
        statusCell.appendChild(createElement('span', 'documents-responses-status', 'Загружен'));
        row.appendChild(statusCell);
        var actionCell = createElement('td', '');
        if (isTxtFile && textContent && canDeleteResponseFile(file)) {
          var editButton = createElement('button', 'documents-button documents-button--secondary', 'Редактировать txt');
          editButton.type = 'button';
          editButton.addEventListener('click', function() {
            editingResponse = {
              storedName: file.storedName,
              originalName: getAttachmentName(file)
            };
            messageInput.value = textContent;
            updateMessageCounter();
            renderTable();
            messageInput.focus();
          });
          actionCell.appendChild(editButton);
        }
        if (canDeleteResponseFile(file)) {
          var deleteButton = createElement('button', 'documents-button documents-button--secondary documents-responses-danger', 'Удалить');
          deleteButton.type = 'button';
          deleteButton.addEventListener('click', function() {
            logResponseDeletion('Нажата кнопка удаления ответа', {
              documentId: currentDoc && currentDoc.id ? currentDoc.id : doc.id,
              registryNumber: currentDoc && currentDoc.registryNumber ? currentDoc.registryNumber : '',
              file: file
            });
            if (!window.confirm('Удалить этот ответ?')) {
              logResponseDeletion('Удаление ответа отменено пользователем', { file: file });
              return;
            }
            deleteButton.disabled = true;
            fetch(buildApiUrl('response_delete', { organization: state.organization }), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ action: 'response_delete', organization: state.organization, documentId: currentDoc.id, storedName: file.storedName })
            })
              .then(handleResponse)
              .then(function(data) {
                logResponseDeletion('Ответ сервера на удаление ответа', data);
                updateStateFromPayload(data);
                syncCurrentDoc();
                renderTable();
                showMessage('success', data && data.message ? data.message : 'Ответ удалён.');
              })
              .catch(function(error) {
                logResponseDeletion('Ошибка удаления ответа', {
                  message: error && error.message ? error.message : String(error || '') ,
                  file: file
                });
                deleteButton.disabled = false;
                showMessage('error', 'Не удалось удалить ответ: ' + error.message);
              });
          });
          if (actionCell.childNodes.length) {
            actionCell.appendChild(document.createTextNode(' '));
          }
          actionCell.appendChild(deleteButton);
        } else {
          actionCell.textContent = '—';
        }
        row.appendChild(actionCell);
        tbody.appendChild(row);
      });

      pendingFiles.forEach(function(file, index) {
        var row = createElement('tr', '');
        var nameCell = createElement('td', '');
        var fileBox = createElement('div', 'documents-responses-file');
        fileBox.appendChild(createElement('div', '', file.name));
        var pendingMeta = formatSize(file.size);
        fileBox.appendChild(createElement('div', 'documents-responses-meta', (pendingMeta ? pendingMeta + ' • ' : '') + 'локальный файл'));
        nameCell.appendChild(fileBox);
        row.appendChild(nameCell);
        row.appendChild(createElement('td', '', 'Будет сохранён'));
        var statusCell = createElement('td', '');
        statusCell.appendChild(createElement('span', 'documents-responses-status documents-responses-status--pending', 'Ожидает'));
        row.appendChild(statusCell);
        var actionCell = createElement('td', '');
        var removeButton = createElement('button', 'documents-button documents-button--secondary documents-responses-danger', 'Удалить');
        removeButton.type = 'button';
        removeButton.addEventListener('click', function() {
          pendingFiles.splice(index, 1);
          renderTable();
        });
        actionCell.appendChild(removeButton);
        row.appendChild(actionCell);
        tbody.appendChild(row);
      });

      var pendingMessage = normalizeTextInputValue(messageInput.value);
      if (pendingMessage) {
        var messageRow = createElement('tr', '');
        var messageNameCell = createElement('td', '');
        var messageBox = createElement('div', 'documents-responses-file');
        messageBox.appendChild(createElement('div', '', 'Ответ-сообщение.txt'));
        var previewText = pendingMessage.length > 90 ? pendingMessage.slice(0, 90) + '…' : pendingMessage;
        var messageSize = 0;
        try {
          messageSize = new Blob([pendingMessage], { type: 'text/plain;charset=utf-8' }).size;
        } catch (error) {
          messageSize = pendingMessage.length;
        }
        messageBox.appendChild(createElement('div', 'documents-responses-meta', (formatSize(messageSize) || 'текст') + ' • ' + previewText));
        messageNameCell.appendChild(messageBox);
        messageRow.appendChild(messageNameCell);
        var messageByCell = createElement('td', '', editingResponse ? 'Редактирование txt' : 'Будет сохранён');
        messageRow.appendChild(messageByCell);
        var messageStatus = createElement('td', '');
        messageStatus.appendChild(createElement('span', 'documents-responses-status documents-responses-status--pending', 'Ожидает'));
        messageRow.appendChild(messageStatus);
        var messageAction = createElement('td', '');
        var clearMessageButton = createElement('button', 'documents-button documents-button--secondary documents-responses-danger', 'Очистить');
        clearMessageButton.type = 'button';
        clearMessageButton.addEventListener('click', function() {
          messageInput.value = '';
          editingResponse = null;
          updateMessageCounter();
          renderTable();
        });
        messageAction.appendChild(clearMessageButton);
        messageRow.appendChild(messageAction);
        tbody.appendChild(messageRow);
      }

      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }

    function updateMessageCounter() {
      var length = messageInput.value ? messageInput.value.length : 0;
      messageCounter.textContent = length + ' / 12000';
    }

    function uploadPendingFiles() {
      var responseMessage = normalizeTextInputValue(messageInput.value);
      if (editingResponse && responseMessage && !pendingFiles.length) {
        saveButton.disabled = true;
        addButton.disabled = true;
        aiButton.disabled = true;
        aiBriefButton.disabled = true;
        closeButton.disabled = true;
        return fetch(buildApiUrl('response_text_update', { organization: state.organization }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            action: 'response_text_update',
            organization: state.organization,
            documentId: currentDoc.id,
            storedName: editingResponse.storedName,
            text: responseMessage
          })
        })
          .then(handleResponse)
          .then(function(data) {
            messageInput.value = '';
            editingResponse = null;
            updateMessageCounter();
            updateStateFromPayload(data);
            syncCurrentDoc();
            renderTable();
            showMessage('success', data && data.message ? data.message : 'Текстовый ответ обновлён.');
          })
          .finally(function() {
            saveButton.disabled = false;
            addButton.disabled = false;
            aiButton.disabled = false;
            aiBriefButton.disabled = false;
            closeButton.disabled = false;
          });
      }
      if (!pendingFiles.length && !responseMessage) {
        return refreshRegistrySilently().then(function() {
          syncCurrentDoc();
          renderTable();
        });
      }
      saveButton.disabled = true;
      addButton.disabled = true;
      aiButton.disabled = true;
      aiBriefButton.disabled = true;
      closeButton.disabled = true;
      var formData = new FormData();
      formData.append('action', 'response_upload');
      formData.append('organization', state.organization);
      formData.append('documentId', currentDoc.id);
      if (responseMessage) {
        formData.append('responseMessage', responseMessage);
      }
      pendingFiles.forEach(function(file) {
        formData.append('attachments[]', file);
      });
      appendTelegramUserIdToFormData(formData);
      return fetch(buildApiUrl('response_upload', { organization: state.organization }), {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      })
        .then(handleResponse)
        .then(function(data) {
          pendingFiles = [];
          messageInput.value = '';
          editingResponse = null;
          updateMessageCounter();
          updateStateFromPayload(data);
          syncCurrentDoc();
          renderTable();
          showMessage('success', data && data.message ? data.message : 'Ответы загружены.');
        })
        .finally(function() {
          saveButton.disabled = false;
          addButton.disabled = false;
          aiButton.disabled = false;
          aiBriefButton.disabled = false;
          closeButton.disabled = false;
        });
    }

    hiddenInput.addEventListener('change', function(event) {
      var selected = Array.from(event.target.files || []);
      if (!selected.length) {
        return;
      }
      mergePendingFiles(selected, 'выбор');
      hiddenInput.value = '';
    });

    addButton.type = 'button';
    addButton.addEventListener('click', function() {
      hiddenInput.click();
    });

    dropzone.tabIndex = 0;
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('aria-label', 'Добавить документы перетаскиванием, вставкой или выбором файлов');
    dropzone.addEventListener('click', function() {
      hiddenInput.click();
    });
    dropzone.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        hiddenInput.click();
      }
    });
    dropzone.addEventListener('dragenter', function(event) {
      event.preventDefault();
      dragCounter += 1;
      setDragState(true);
    });
    dropzone.addEventListener('dragover', function(event) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setDragState(true);
    });
    dropzone.addEventListener('dragleave', function(event) {
      event.preventDefault();
      dragCounter = Math.max(0, dragCounter - 1);
      if (!dragCounter || event.target === dropzone) {
        setDragState(false);
      }
    });
    dropzone.addEventListener('drop', function(event) {
      event.preventDefault();
      dragCounter = 0;
      setDragState(false);
      var droppedFiles = event.dataTransfer && event.dataTransfer.files
        ? Array.from(event.dataTransfer.files)
        : [];
      mergePendingFiles(droppedFiles, 'перетаскивание');
    });
    modal.addEventListener('paste', function(event) {
      var files = getClipboardFiles(event);
      if (!files.length) {
        return;
      }
      event.preventDefault();
      mergePendingFiles(files, 'буфер обмена');
    });

    messageInput.addEventListener('input', function() {
      updateMessageCounter();
      renderTable();
    });

    saveButton.type = 'button';
    saveButton.addEventListener('click', function() {
      uploadPendingFiles().catch(function(error) {
        showMessage('error', 'Не удалось сохранить ответы: ' + error.message);
      });
    });

    aiButton.type = 'button';
    aiButton.addEventListener('click', function() {
      var uploadedResponses = currentDoc && Array.isArray(currentDoc.responses)
        ? currentDoc.responses.map(function(file) {
          return {
            name: getAttachmentName(file),
            size: file && file.size ? file.size : 0,
            uploadedBy: file && file.uploadedBy ? String(file.uploadedBy) : '',
            uploadedAt: file && file.uploadedAt ? String(file.uploadedAt) : '',
            isTextFile: Boolean(file && file.isTextFile)
          };
        })
        : [];
      var linkedFiles = [];
      if (currentDoc && Array.isArray(currentDoc.files)) {
        linkedFiles = currentDoc.files.map(function(file) {
          return {
            name: getAttachmentName(file),
            url: resolveAttachmentUrl(file, { bustCache: true }) || '',
            size: file && file.size ? file.size : 0,
            type: file && file.type ? String(file.type) : ''
          };
        }).filter(function(file) {
          return Boolean(file && file.url);
        });
      }
      openAiResponseModal({
        apiUrl: (window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php'),
        showMessage: showMessage,
        documentData: currentDoc || doc || {},
        documentTitle: currentDoc && currentDoc.title ? String(currentDoc.title) : '',
        pendingFiles: pendingFiles.slice(),
        linkedFiles: linkedFiles,
        context: {
          organization: state.organization || '',
          documentId: currentDoc && currentDoc.id ? currentDoc.id : doc.id,
          registryNumber: currentDoc && currentDoc.registryNumber ? String(currentDoc.registryNumber) : '',
          description: currentDoc && currentDoc.description ? String(currentDoc.description) : '',
          status: currentDoc && currentDoc.status ? String(currentDoc.status) : '',
          pendingFilesCount: pendingFiles.length,
          uploadedResponsesCount: uploadedResponses.length,
          uploadedResponses: uploadedResponses
        }
      });
    });
    aiBriefButton.type = 'button';
    aiBriefButton.addEventListener('click', function() {
      var linkedFiles = [];
      if (currentDoc && Array.isArray(currentDoc.files)) {
        linkedFiles = currentDoc.files.map(function(file) {
          return {
            name: getAttachmentName(file),
            url: resolveAttachmentUrl(file, { bustCache: true }) || ''
          };
        }).filter(function(file) {
          return Boolean(file && file.url);
        });
      }
      openAiBriefSummaryModal({
        apiUrl: (window.DOCUMENTS_AI_API_URL || '/js/documents/api-docs.php'),
        showMessage: showMessage,
        documentData: currentDoc || doc || {},
        pendingFiles: pendingFiles.slice(),
        linkedFiles: linkedFiles
      });
    });

    closeButton.type = 'button';
    closeButton.addEventListener('click', function() {
      closeModal(modal);
    });

    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeModal(modal);
      }
    });

    headerActions.appendChild(aiButton);
    headerActions.appendChild(aiBriefButton);
    headerActions.appendChild(saveButton);
    headerActions.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(headerActions);
    dropzoneCopy.appendChild(dropzoneTitle);
    dropzoneCopy.appendChild(dropzoneHint);
    dropzone.appendChild(dropzoneCopy);
    dropzone.appendChild(dropzoneBadge);
    toolbar.appendChild(addButton);
    toolbar.appendChild(dropzone);
    toolbar.appendChild(hint);
    messageLabel.appendChild(messageCounter);
    messageWrap.appendChild(messageLabel);
    messageWrap.appendChild(messageInput);
    toolbar.appendChild(messageWrap);
    body.appendChild(toolbar);
    body.appendChild(tableWrap);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(hiddenInput);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    renderTable();
    updateMessageCounter();
    dropzone.focus({ preventScroll: true });
  }

  function resendAssigneeNotification(doc, assigneeInfo, entryNode) {
    if (!doc || !doc.id) {
      showMessage('error', 'Не удалось определить документ для повторной отправки.');
      return;
    }
    if (!state.organization) {
      showMessage('error', 'Организация не выбрана. Обновите страницу и попробуйте снова.');
      return;
    }
    var info = assigneeInfo || {};
    var assignee = info.assignee || null;
    var keys = Array.isArray(info.keys) && info.keys.length ? info.keys : buildAssigneeKeyCandidates(assignee);
    if (!keys || !keys.length) {
      showMessage('error', 'Не удалось определить пользователя для уведомления.');
      return;
    }
    var assigneeName = '';
    if (assignee) {
      if (assignee.name) {
        assigneeName = String(assignee.name);
      } else if (assignee.responsible) {
        assigneeName = String(assignee.responsible);
      }
    }
    var confirmLabel = assigneeName ? ('пользователю ' + assigneeName) : 'пользователю';
    var confirmationText = 'Отправить напоминание ' + confirmLabel + ' ещё раз?';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(confirmationText)) {
        return;
      }
    }
    var targetKey = keys[0];
    var payload = {
      action: 'resend_assignment_notification',
      organization: state.organization,
      documentId: doc.id,
      assigneeKey: targetKey
    };
    if (assigneeName) {
      payload.assigneeName = assigneeName;
    }
    if (info.role) {
      payload.assigneeRole = info.role;
    }
    mergeTelegramUserId(payload);
    if (entryNode && entryNode.classList) {
      entryNode.classList.add('documents-assignee__entry--pending');
    }
    fetch(buildApiUrl('resend_assignment_notification', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        var message = data && data.message ? data.message : 'Напоминание отправлено.';
        showMessage('success', message);
        return refreshDocumentsRegistry();
      })
      .catch(function(error) {
        showMessage('error', 'Не удалось отправить напоминание: ' + (error && error.message ? error.message : String(error)));
      })
      .finally(function() {
        if (entryNode && entryNode.classList) {
          entryNode.classList.remove('documents-assignee__entry--pending');
        }
      });
  }

  function resendDirectorNotification(doc, directorEntry, button) {
    if (!doc || !doc.id) {
      showMessage('error', 'Не удалось определить документ для отправки напоминания.');
      return;
    }
    if (!state.organization) {
      showMessage('error', 'Организация не выбрана. Обновите страницу и попробуйте снова.');
      return;
    }
    if (!directorEntry || typeof directorEntry !== 'object') {
      showMessage('error', 'Директор для напоминания не выбран.');
      return;
    }
    if (!(directorEntry.telegram || directorEntry.chatId)) {
      showMessage('error', TELEGRAM_MISSING_MESSAGE);
      return;
    }

    var keys = buildAssigneeKeyCandidates(directorEntry);
    if (!keys || !keys.length) {
      showMessage('error', 'Не удалось определить директора для напоминания.');
      return;
    }

    var directorName = '';
    if (directorEntry.name) {
      directorName = String(directorEntry.name);
    } else if (directorEntry.responsible) {
      directorName = String(directorEntry.responsible);
    }
    var confirmLabel = directorName ? ('директору ' + directorName) : 'директору';
    var confirmationText = 'Отправить напоминание ' + confirmLabel + ' ещё раз?';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(confirmationText)) {
        return;
      }
    }

    var payload = {
      action: 'resend_director_notification',
      organization: state.organization,
      documentId: doc.id,
      directorKey: keys[0]
    };
    if (directorName) {
      payload.directorName = directorName;
    }
    mergeTelegramUserId(payload);
    if (button) {
      button.disabled = true;
      button.classList.add('documents-action--pending');
    }

    fetch(buildApiUrl('resend_director_notification', { organization: state.organization }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(handleResponse)
      .then(function(data) {
        var message = data && data.message ? data.message : 'Напоминание отправлено директору.';
        showMessage('success', message);
        return refreshDocumentsRegistry();
      })
      .catch(function(error) {
        showMessage('error', 'Не удалось отправить напоминание: ' + (error && error.message ? error.message : String(error)));
      })
      .finally(function() {
        if (button) {
          button.disabled = false;
          button.classList.remove('documents-action--pending');
        }
      });
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }
    modal.parentNode && modal.parentNode.removeChild(modal);
    document.removeEventListener('keydown', handleEscape);
  }

  function handleEscape(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      var modal = document.querySelector('.documents-modal');
      closeModal(modal);
    }
  }

  function openDocumentForm(doc) {
    if (!state.organization) {
      showMessage('error', 'Организация для этой страницы не определена.');
      return;
    }
    if (!isCurrentUserAdmin()) {
      showMessage('error', 'Добавление документов доступно только администратору.');
      return;
    }
    if (!state.permissions || !state.permissions.canCreateDocuments) {
      showMessage('error', 'Добавление документов недоступно для вашей роли.');
      return;
    }

    runWithResponsibles(function() {
      var isEditMode = Boolean(doc && doc.id);
      var modal = createElement('div', 'documents-modal');
      var shell = createElement('div', 'documents-modal__shell');
      var title = createElement('h3', 'documents-modal__title', 'Добавить документ');
      var form = createElement('form', 'documents-form');
      var formId = 'documents-form-' + Date.now();
      form.id = formId;
      form.setAttribute('autocomplete', 'off');
      form.setAttribute('enctype', 'multipart/form-data');

      var cancelButton = createElement('button', 'documents-button documents-button--secondary', 'Отмена');
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', function() {
        closeModal(modal);
      });

      var submitButton = createElement(
        'button',
        'documents-button documents-button--primary',
        isEditMode ? 'Сохранить' : 'Добавить'
      );
      submitButton.type = 'submit';
      submitButton.setAttribute('form', formId);

      var header = createElement('div', 'documents-modal__header documents-modal__header--compact');
      var actions = createElement('div', 'documents-modal__actions');
      actions.appendChild(cancelButton);
      actions.appendChild(submitButton);
      header.appendChild(title);
      header.appendChild(actions);

      var grid = createElement('div', 'documents-form__grid');

      function addField(options) {
        var field = createElement('div', 'documents-form__field');
        var label = createElement('label', '', options.label);
        var input;
        if (options.type === 'textarea') {
          input = document.createElement('textarea');
        } else if (options.type === 'select') {
          input = document.createElement('select');
          (options.choices || []).forEach(function(choice) {
            var option = createElement('option', '', choice);
            option.value = choice;
            input.appendChild(option);
          });
        } else {
          input = document.createElement('input');
          input.type = options.type || 'text';
        }
        input.name = options.name;
        if (options.required) {
          input.required = true;
        }
        if (options.placeholder) {
          input.placeholder = options.placeholder;
        }
        field.appendChild(label);
        field.appendChild(input);
        return { field: field, input: input };
      }

      var registryField = addField({ name: 'registry_number', label: 'Регистрационный номер *', required: true });
      grid.appendChild(registryField.field);

      var registrationDateField = addField({ name: 'registration_date', label: 'Дата регистрации *', type: 'date', required: true });
      grid.appendChild(registrationDateField.field);

      var directionField = addField({
        name: 'direction',
        label: 'Тип документа *',
        type: 'select',
        required: true,
        choices: ['Входящий', 'Исходящий', 'Внутренний']
      });
      grid.appendChild(directionField.field);

      var correspondentField = addField({ name: 'correspondent', label: 'Отправитель / получатель *', required: true });
      grid.appendChild(correspondentField.field);

      var documentNumberField = addField({ name: 'document_number', label: 'Номер документа', placeholder: 'Например, № 45/1' });
      grid.appendChild(documentNumberField.field);

      var documentDateField = addField({ name: 'document_date', label: 'Дата документа', type: 'date' });
      grid.appendChild(documentDateField.field);

      var executorField = addField({ name: 'executor', label: 'Исполнитель', placeholder: 'ФИО или отдел' });
      grid.appendChild(executorField.field);

      var directorField = addField({ name: 'director_index', label: 'Директор', type: 'select' });
      var directorSelect = directorField.input;
      var directorPlaceholder = createElement('option', '', 'Не выбран');
      directorPlaceholder.value = '';
      directorSelect.appendChild(directorPlaceholder);
      var storedDirectorEntry = isEditMode ? resolveStoredDirectorEntry(doc) : null;
      var directorsList = state.admin && state.admin.settings && Array.isArray(state.admin.settings.block2)
        ? state.admin.settings.block2
        : [];
      directorsList.forEach(function(entry, index) {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        var option = createElement('option', '', buildResponsibleLabel(entry) || '—');
        option.value = String(index);
        directorSelect.appendChild(option);
      });
      if (!directorsList.length) {
        directorSelect.disabled = true;
        directorSelect.title = 'Список директоров пуст. Добавьте их в настройках администратора.';
      }
      if (!isEditMode) {
        directorSelect.required = true;
      }
      grid.appendChild(directorField.field);

      var assigneesField = createElement('div', 'documents-form__field');
      var assigneesLabel = createElement('label', '', 'Ответственные');
      assigneesField.appendChild(assigneesLabel);
      var currentAssignees = [];
      var preservedSubordinates = [];
      if (isEditMode) {
        var existingAssignees = resolveAssigneeList(doc);
        if (existingAssignees && existingAssignees.length) {
          for (var i = 0; i < existingAssignees.length; i += 1) {
            var assigneeEntry = existingAssignees[i];
            if (!assigneeEntry) {
              continue;
            }
            if (isSubordinateSnapshot(assigneeEntry)) {
              preservedSubordinates.push(assigneeEntry);
            } else {
              currentAssignees.push(assigneeEntry);
            }
          }
        }
      }
      var assigneesEditor = createAssigneesEditor(currentAssignees);
      assigneesField.appendChild(assigneesEditor.element);
      grid.appendChild(assigneesField);

      var dueDateField = addField({ name: 'due_date', label: 'Срок исполнения', type: 'date' });
      grid.appendChild(dueDateField.field);

      var attachmentsField = addField({ name: 'attachments[]', label: 'Файлы', type: 'file' });
      attachmentsField.input.multiple = true;
      attachmentsField.field.classList.add('documents-form__field--file');
      attachmentsField.input.classList.add('documents-file-input');

      var attachmentsWrapper = createElement('div', 'documents-file');
      attachmentsWrapper.tabIndex = 0;
      attachmentsWrapper.setAttribute('aria-label', 'Зона загрузки файлов, можно вставлять из буфера обмена');
      var attachmentsMeta = createElement('div', 'documents-file__meta');
      var attachmentsHint = createElement(
        'div',
        'documents-file__hint',
        'Выберите несколько файлов сразу или добавляйте по одному — они объединятся в одну задачу. Поддерживаются PDF, JPG, PNG, DOCX.'
      );
      var attachmentsSummary = createElement('div', 'documents-file__summary documents-file__summary--empty', 'Файлы не выбраны');
      var uploadProgress = createElement('div', 'documents-upload-progress');
      var uploadProgressHeader = createElement('div', 'documents-upload-progress__header');
      var uploadProgressTitle = createElement('strong', 'documents-upload-progress__title', 'Загрузка файлов');
      var uploadProgressPercent = createElement('span', 'documents-upload-progress__percent', '0%');
      var uploadProgressStatus = createElement('div', 'documents-upload-progress__status', 'Ожидание отправки');
      var uploadProgressBar = createElement('div', 'documents-upload-progress__bar');
      var uploadProgressFill = createElement('div', 'documents-upload-progress__fill');
      uploadProgressBar.appendChild(uploadProgressFill);
      uploadProgressHeader.appendChild(uploadProgressTitle);
      uploadProgressHeader.appendChild(uploadProgressPercent);
      uploadProgress.appendChild(uploadProgressHeader);
      uploadProgress.appendChild(uploadProgressStatus);
      uploadProgress.appendChild(uploadProgressBar);

      var uploadState = {
        active: false,
        percent: 0
      };

      function updateUploadProgress(percent, statusText, stageClass) {
        var normalizedPercent = Math.max(0, Math.min(100, Math.round(percent || 0)));
        uploadState.percent = normalizedPercent;
        uploadProgressPercent.textContent = normalizedPercent + '%';
        uploadProgressFill.style.width = normalizedPercent + '%';
        if (statusText) {
          uploadProgressStatus.textContent = statusText;
        }
        uploadProgress.classList.remove('is-stage-preparing', 'is-stage-uploading', 'is-stage-processing', 'is-stage-success', 'is-stage-error');
        if (stageClass) {
          uploadProgress.classList.add(stageClass);
        }
      }

      function setUploadProgressActive(active) {
        uploadState.active = Boolean(active);
        uploadProgress.classList.toggle('is-active', uploadState.active);
      }

      updateUploadProgress(0, 'Ожидание отправки', 'is-stage-preparing');

      attachmentsMeta.appendChild(attachmentsHint);
      attachmentsMeta.appendChild(attachmentsSummary);
      attachmentsMeta.appendChild(uploadProgress);

      attachmentsWrapper.appendChild(attachmentsField.input);
      attachmentsWrapper.appendChild(attachmentsMeta);

      attachmentsField.field.appendChild(attachmentsWrapper);

      var attachmentsDataTransfer = new DataTransfer();
      var attachmentsStore = [];
      var existingAttachments = Array.isArray(doc && doc.files) ? doc.files.slice() : [];
      var removedAttachmentKeys = Object.create(null);

      function logFilesDiagnostics(action, details) {
        if (typeof sendClientDiagnostics !== 'function') {
          return;
        }
        var payload = {
          action: action,
          formId: formId,
          documentId: doc && doc.id ? doc.id : null
        };
        if (details && typeof details === 'object') {
          for (var key in details) {
            if (Object.prototype.hasOwnProperty.call(details, key)) {
              payload[key] = details[key];
            }
          }
        }
        sendClientDiagnostics('Файлы', payload);
      }

      function resolveAttachmentUrlName(file) {
        if (!file || typeof file !== 'object') {
          return '';
        }
        if (!file.url || typeof file.url !== 'string') {
          return '';
        }
        var url = file.url.trim();
        if (!url) {
          return '';
        }
        var path = url.split('?')[0].split('#')[0];
        var parts = path.split('/');
        var lastPart = parts[parts.length - 1] || '';
        return lastPart ? decodeURIComponent(lastPart) : '';
      }

      function collectAttachmentKeys(file) {
        if (!file || typeof file !== 'object') {
          return [];
        }
        var candidates = [
          file.storedName,
          file.originalName,
          file.fileName,
          file.name,
          resolveAttachmentUrlName(file)
        ];
        var unique = [];
        var seen = Object.create(null);
        candidates.forEach(function(candidate) {
          if (candidate === undefined || candidate === null) {
            return;
          }
          var text = String(candidate).trim();
          if (!text || seen[text]) {
            return;
          }
          seen[text] = true;
          unique.push(text);
        });
        return unique;
      }

      function resolveAttachmentKey(file) {
        var keys = collectAttachmentKeys(file);
        return keys.length ? keys[0] : '';
      }

      function buildAttachmentBadge(label, options) {
        var badge = createElement('span', 'documents-file__badge', label);
        if (options && options.variant) {
          badge.classList.add('documents-file__badge--' + options.variant);
        }
        if (options && options.removable) {
          var removeButton = createElement('button', 'documents-file__badge-button', '×');
          removeButton.type = 'button';
          removeButton.setAttribute('aria-label', 'Удалить файл');
          removeButton.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof options.onRemove === 'function') {
              options.onRemove();
            }
          });
          badge.appendChild(removeButton);
        }
        return badge;
      }

      function renderAttachmentsSummary(files) {
        attachmentsSummary.innerHTML = '';

        var existingVisible = existingAttachments.filter(function(file) {
          var keys = collectAttachmentKeys(file);
          if (!keys.length) {
            return true;
          }
          for (var i = 0; i < keys.length; i += 1) {
            if (removedAttachmentKeys[keys[i]]) {
              return false;
            }
          }
          return true;
        });

        if (!files.length && !existingVisible.length) {
          attachmentsSummary.textContent = 'Файлы не выбраны';
          attachmentsSummary.classList.add('documents-file__summary--empty');
          return;
        }

        attachmentsSummary.classList.remove('documents-file__summary--empty');

        if (existingVisible.length) {
          var existingGroup = createElement('div', 'documents-file__group');
          var existingTitle = createElement('div', 'documents-file__group-title', 'Текущие');
          existingGroup.appendChild(existingTitle);
          var existingList = createElement('div', 'documents-file__group-list');
          existingVisible.forEach(function(file) {
            var name = file.originalName || file.storedName || file.fileName || resolveAttachmentUrlName(file) || 'Файл';
            var key = resolveAttachmentKey(file) || name;
            var badge = buildAttachmentBadge(name, {
              variant: 'existing',
              removable: true,
              onRemove: function() {
                var keys = collectAttachmentKeys(file);
                if (!keys.length && key) {
                  keys = [key];
                }
                keys.forEach(function(item) {
                  removedAttachmentKeys[item] = true;
                });
                docsLogger.log('Перезапись', {
                  action: 'remove-existing',
                  documentId: doc && doc.id ? doc.id : null,
                  removedKeys: Object.keys(removedAttachmentKeys),
                  file: {
                    originalName: file.originalName || '',
                    storedName: file.storedName || '',
                    url: file.url || ''
                  }
                });
                logFilesDiagnostics('remove-existing', {
                  removedKeys: keys,
                  documentId: doc && doc.id ? doc.id : null
                });
                renderAttachmentsSummary(attachmentsStore);
              }
            });
            existingList.appendChild(badge);
          });
          existingGroup.appendChild(existingList);
          attachmentsSummary.appendChild(existingGroup);
        }

        if (files.length) {
          var newGroup = createElement('div', 'documents-file__group');
          var newTitle = createElement('div', 'documents-file__group-title', 'Новые');
          newGroup.appendChild(newTitle);
          var newList = createElement('div', 'documents-file__group-list');
          files.forEach(function(file, index) {
            var badge = buildAttachmentBadge(file.name, {
              variant: 'new',
              removable: true,
              onRemove: function() {
                if (index < 0 || index >= attachmentsStore.length) {
                  return;
                }
                var beforeCount = attachmentsStore.length;
                attachmentsStore.splice(index, 1);
                syncAttachmentsInput();
                logFilesDiagnostics('remove-new', {
                  name: file.name,
                  index: index,
                  beforeCount: beforeCount,
                  afterCount: attachmentsStore.length
                });
                renderAttachmentsSummary(attachmentsStore);
              }
            });
            newList.appendChild(badge);
          });
          newGroup.appendChild(newList);
          attachmentsSummary.appendChild(newGroup);
        }
      }

      function syncAttachmentsInput() {
        attachmentsDataTransfer = new DataTransfer();
        attachmentsStore.forEach(function(file) {
          attachmentsDataTransfer.items.add(file);
        });
        attachmentsField.input.files = attachmentsDataTransfer.files;
      }

      function syncAttachments(files, append, source) {
        if (!append) {
          attachmentsStore = [];
        }

        var currentFiles = attachmentsStore.slice();
        var addedCount = 0;
        var duplicateCount = 0;
        var incomingNames = [];
        var duplicateNames = [];

        files.forEach(function(file) {
          incomingNames.push(file.name);
          var isDuplicate = currentFiles.some(function(existingFile) {
            return (
              existingFile.name === file.name &&
              existingFile.size === file.size &&
              existingFile.lastModified === file.lastModified
            );
          });

          if (!isDuplicate) {
            currentFiles.push(file);
            addedCount += 1;
          } else {
            duplicateCount += 1;
            duplicateNames.push(file.name);
          }
        });

        attachmentsStore = currentFiles.slice();
        syncAttachmentsInput();
        renderAttachmentsSummary(attachmentsStore);

        logFilesDiagnostics('sync', {
          source: source || 'unknown',
          append: Boolean(append),
          incomingCount: files.length,
          addedCount: addedCount,
          duplicateCount: duplicateCount,
          totalCount: attachmentsStore.length,
          incomingNames: incomingNames.slice(0, 10),
          duplicateNames: duplicateNames.slice(0, 10)
        });
      }

      attachmentsField.input.addEventListener('change', function(event) {
        var fileList = Array.from(event.target.files || []);
        syncAttachments(fileList, true, 'input');
        attachmentsField.input.value = '';
        syncAttachmentsInput();
        logFilesDiagnostics('input-change', {
          selectedCount: fileList.length,
          totalCount: attachmentsStore.length
        });
      });

      function handleAttachmentsPaste(event) {
        var clipboardFiles = Array.from((event.clipboardData && event.clipboardData.files) || []);
        if (!clipboardFiles.length) {
          return;
        }

        event.preventDefault();
        syncAttachments(clipboardFiles, true, 'paste');
        logFilesDiagnostics('paste', {
          selectedCount: clipboardFiles.length,
          totalCount: attachmentsStore.length
        });
      }

      attachmentsWrapper.addEventListener('paste', handleAttachmentsPaste);
      attachmentsField.input.addEventListener('paste', handleAttachmentsPaste);

      grid.appendChild(attachmentsField.field);

      form.appendChild(grid);

      var areas = createElement('div', 'documents-form__areas');

      var summaryField = addField({ name: 'summary', label: 'Содержание', type: 'textarea' });
      summaryField.field.classList.add('documents-form__field--wide');
      areas.appendChild(summaryField.field);

      var resolutionField = addField({ name: 'resolution', label: 'Резолюция', type: 'textarea' });
      areas.appendChild(resolutionField.field);

      var notesField = addField({ name: 'notes', label: 'Примечания', type: 'textarea' });
      areas.appendChild(notesField.field);

      form.appendChild(areas);

      function fillFieldsFromForm() {
        return {
          registryNumber: normalizeTextInputValue(registryField.input.value),
          registrationDate: normalizeTextInputValue(registrationDateField.input.value),
          direction: normalizeTextInputValue(directionField.input.value),
          correspondent: normalizeTextInputValue(correspondentField.input.value),
          documentNumber: normalizeTextInputValue(documentNumberField.input.value),
          documentDate: normalizeTextInputValue(documentDateField.input.value),
          executor: normalizeTextInputValue(executorField.input.value),
          dueDate: normalizeTextInputValue(dueDateField.input.value),
          summary: normalizeTextInputValue(summaryField.input.value),
          resolution: normalizeTextInputValue(resolutionField.input.value),
          notes: normalizeTextInputValue(notesField.input.value)
        };
      }

      function resolveDirectorSelection() {
        var selection = directorSelect.value ? String(directorSelect.value).trim() : '';
        if (!selection) {
          return { director: {}, directors: [] };
        }
        var index = parseInt(selection, 10);
        if (isNaN(index)) {
          return { director: {}, directors: [] };
        }
        var list = state.admin && state.admin.settings && Array.isArray(state.admin.settings.block2)
          ? state.admin.settings.block2
          : [];
        if (!list[index]) {
          return { director: {}, directors: [] };
        }
        var entry = buildDirectorEntryFromAdmin(list[index]);
        if (!entry) {
          return { director: {}, directors: [] };
        }
        return { director: entry, directors: [entry] };
      }

      function mergeAssigneesWithSubordinates(selectedAssignees, preservedList) {
        var combinedAssignees = selectedAssignees.slice();
        if (!preservedList || !preservedList.length) {
          return combinedAssignees;
        }
        var combinedSeen = Object.create(null);

        function buildAssignmentKey(entry) {
          if (!entry || typeof entry !== 'object') {
            return '';
          }
          var key = '';
          if (entry.id) {
            key = 'id::' + normalizeResponsibleId(entry.id);
          } else if (entry.login) {
            key = 'login::' + String(entry.login).toLowerCase();
          } else if (entry.telegram) {
            key = 'telegram::' + normalizeResponsibleId(entry.telegram);
          } else if (entry.chatId) {
            key = 'chat::' + normalizeResponsibleId(entry.chatId);
          } else if (entry.email) {
            key = 'email::' + String(entry.email).toLowerCase();
          } else if (entry.name) {
            key = 'name::' + String(entry.name).toLowerCase();
          }
          var roleKey = entry.role ? String(entry.role).toLowerCase() : '';
          if (roleKey) {
            key = key ? key + '::role::' + roleKey : 'role::' + roleKey;
          }
          return key;
        }

        combinedAssignees.forEach(function(existingEntry) {
          var existingKey = buildAssignmentKey(existingEntry);
          if (existingKey) {
            combinedSeen[existingKey] = true;
          }
        });

        preservedList.forEach(function(subordinateEntry) {
          if (!subordinateEntry || typeof subordinateEntry !== 'object') {
            return;
          }
          var clone = {};
          for (var prop in subordinateEntry) {
            if (Object.prototype.hasOwnProperty.call(subordinateEntry, prop)) {
              clone[prop] = subordinateEntry[prop];
            }
          }
          if (!clone.role) {
            clone.role = 'subordinate';
          }

          var duplicateKey = buildAssignmentKey(clone);

          if (!duplicateKey || !combinedSeen[duplicateKey]) {
            if (duplicateKey) {
              combinedSeen[duplicateKey] = true;
            }
            combinedAssignees.push(clone);
          }
        });
        return combinedAssignees;
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        clearMessage();
        submitButton.disabled = true;
        setUploadProgressActive(true);
        updateUploadProgress(5, 'Подготавливаем данные формы…', 'is-stage-preparing');
        var formData = new FormData();
        var attachmentFiles = attachmentsStore.slice();
        var updateFields = null;

        if (!isEditMode && !directorSelect.value) {
          submitButton.disabled = false;
          directorSelect.focus();
          showMessage('error', 'Выберите директора перед созданием задачи.');
          return;
        }

        if (assigneesEditor.hasMissingTelegramSelection()) {
          submitButton.disabled = false;
          showMessage('error', TELEGRAM_MISSING_MESSAGE);
          return;
        }

        correspondentField.input.value = normalizeTextInputValue(correspondentField.input.value);
        if (!correspondentField.input.value) {
          submitButton.disabled = false;
          correspondentField.input.focus();
          showMessage('error', 'Заполните поле «Отправитель / получатель».');
          return;
        }

        var selectedAssignees = assigneesEditor.collect();
        var combinedAssignees = mergeAssigneesWithSubordinates(selectedAssignees, preservedSubordinates);

        if (isEditMode) {
          updateFields = fillFieldsFromForm();
          var directorSelection = resolveDirectorSelection();
          updateFields.director = directorSelection.director;
          updateFields.directors = directorSelection.directors;
          updateFields.assignees = combinedAssignees;
          updateFields.assignee = selectedAssignees.length ? selectedAssignees[0] : {};

          formData.append('action', 'update');
          formData.append('organization', state.organization);
          formData.append('documentId', doc.id);

          var removedKeys = Object.keys(removedAttachmentKeys);
          updateFields.filesToDelete = removedKeys;
          if (removedKeys.length) {
            removedKeys.forEach(function(key) {
              formData.append('filesToDelete[]', key);
            });
          }
          var remainingLookup = Object.create(null);
          existingAttachments.forEach(function(file) {
            var keys = collectAttachmentKeys(file);
            if (!keys.length) {
              return;
            }
            for (var i = 0; i < keys.length; i += 1) {
              var key = keys[i];
              if (!removedAttachmentKeys[key]) {
                remainingLookup[key] = true;
              }
            }
          });
          var remainingKeys = Object.keys(remainingLookup);
          updateFields.filesRemaining = remainingKeys;
          if (remainingKeys.length) {
            remainingKeys.forEach(function(key) {
              formData.append('filesRemaining[]', key);
            });
          }
          formData.append('fields', new Blob([JSON.stringify(updateFields)], { type: 'application/json; charset=utf-8' }));
          logFilesDiagnostics('submit-update', {
            documentId: doc && doc.id ? doc.id : null,
            newFilesCount: attachmentFiles.length,
            newFileNames: attachmentFiles.map(function(file) { return file.name; }).slice(0, 10),
            removedKeys: removedKeys,
            remainingKeys: remainingKeys
          });
          docsLogger.log('Перезапись', {
            action: 'submit-update',
            documentId: doc && doc.id ? doc.id : null,
            fields: updateFields,
            filesToDelete: removedKeys,
            filesRemaining: remainingKeys,
            newFilesCount: attachmentFiles.length
          });
        } else {
          var createFields = fillFieldsFromForm();
          formData = new FormData(form);
          formData.append('action', 'create');
          formData.append('organization', state.organization);
          setFormDataValue(formData, 'correspondent', createFields.correspondent);

          if (typeof formData.delete === 'function') {
            formData.delete('assignee_name');
            formData.delete('assignee_department');
            formData.delete('assignee_telegram');
            formData.delete('assignee_chat_id');
            formData.delete('assignee_email');
            formData.delete('assignee_note');
            formData.delete('assignee_status');
          }

          if (typeof formData.delete === 'function') {
            formData.delete('assignee_id');
            formData.delete('assignees');
            formData.delete('assignee_status');
          }
          if (combinedAssignees.length) {
            formData.append('assignees', JSON.stringify(combinedAssignees));
            var primaryAssignee = combinedAssignees[0];
            if (primaryAssignee.id) {
              formData.append('assignee_id', primaryAssignee.id);
            }
            if (primaryAssignee.name) {
              formData.append('assignee_name', primaryAssignee.name);
            }
            if (primaryAssignee.department) {
              formData.append('assignee_department', primaryAssignee.department);
            }
            if (primaryAssignee.telegram) {
              formData.append('assignee_telegram', primaryAssignee.telegram);
            }
            if (primaryAssignee.chatId) {
              formData.append('assignee_chat_id', primaryAssignee.chatId);
            }
            if (primaryAssignee.email) {
              formData.append('assignee_email', primaryAssignee.email);
            }
            if (primaryAssignee.note) {
              formData.append('assignee_note', primaryAssignee.note);
            }
            if (primaryAssignee.status) {
              formData.append('assignee_status', primaryAssignee.status);
            }
          }
          if (typeof formData.delete === 'function') {
            formData.delete('attachments[]');
          }
          logFilesDiagnostics('submit-create', {
            newFilesCount: attachmentFiles.length,
            newFileNames: attachmentFiles.map(function(file) { return file.name; }).slice(0, 10)
          });
        }

        appendTelegramUserIdToFormData(formData);

        updateUploadProgress(12, 'Сохраняем карточку документа…', 'is-stage-uploading');

        uploadFormDataWithProgress(buildApiUrl(isEditMode ? 'update' : 'create'), formData, function(progress) {
          var uploadPercent = 12;
          if (progress && progress.lengthComputable && progress.total > 0) {
            uploadPercent = 12 + Math.round((progress.loaded / progress.total) * 18);
          }
          uploadPercent = Math.max(12, Math.min(30, uploadPercent));
          updateUploadProgress(uploadPercent, 'Сохраняем карточку документа…', 'is-stage-uploading');
        })
          .then(function(data) {
            updateUploadProgress(34, 'Документ сохранён. Готовим загрузку файлов…', 'is-stage-processing');
            if (isEditMode) {
              docsLogger.log('Перезапись', {
                action: 'submit-update-response',
                documentId: doc && doc.id ? doc.id : null,
                response: data
              });
            }
            updateStateFromPayload(data);

            if (!isEditMode && data && data.createdDocument && data.createdDocument.id) {
              var createdDocumentId = String(data.createdDocument.id);
              var hasCreatedDocument = false;
              for (var createdIndex = 0; createdIndex < state.documents.length; createdIndex += 1) {
                var existingCreatedDoc = state.documents[createdIndex];
                if (existingCreatedDoc && existingCreatedDoc.id && String(existingCreatedDoc.id) === createdDocumentId) {
                  hasCreatedDocument = true;
                  break;
                }
              }
              if (!hasCreatedDocument) {
                state.documents = [data.createdDocument].concat(state.documents || []);
                updateTable();
              }
            }

            if (isEditMode && updateFields && doc && doc.id) {
              var payloadDocuments = resolveDocumentsCollection(data);
              var hasUpdatedDocument = false;
              if (payloadDocuments.length) {
                for (var payloadIndex = 0; payloadIndex < payloadDocuments.length; payloadIndex += 1) {
                  var payloadDoc = payloadDocuments[payloadIndex];
                  if (payloadDoc && payloadDoc.id && String(payloadDoc.id) === String(doc.id)) {
                    hasUpdatedDocument = true;
                    break;
                  }
                }
              }
              if (!hasUpdatedDocument) {
                applyLocalDocumentUpdate(doc.id, updateFields);
                updateTable();
              }
            }
            var createdOrUpdatedDocumentId = null;
            if (isEditMode) {
              createdOrUpdatedDocumentId = doc && doc.id ? String(doc.id) : '';
            } else if (data && data.createdDocument && data.createdDocument.id) {
              createdOrUpdatedDocumentId = String(data.createdDocument.id);
            }

            var uploadPromise = Promise.resolve();
            if (attachmentFiles.length && createdOrUpdatedDocumentId) {
              var batches = splitFilesToBatches(attachmentFiles, DOCUMENTS_UPLOAD_BATCH_SIZE);
              uploadPromise = batches.reduce(function(chain, batch, batchIndex) {
                return chain.then(function() {
                  var batchFormData = new FormData();
                  batchFormData.append('action', 'update');
                  batchFormData.append('organization', state.organization);
                  batchFormData.append('documentId', createdOrUpdatedDocumentId);
                  batch.forEach(function(file) {
                    batchFormData.append('attachments[]', file);
                  });
                  appendTelegramUserIdToFormData(batchFormData);

                  return uploadFormDataWithProgress(buildApiUrl('update'), batchFormData, function(progress) {
                    var progressInsideBatch = 0;
                    if (progress && progress.lengthComputable && progress.total > 0) {
                      progressInsideBatch = progress.loaded / progress.total;
                    }
                    var overallProgress = (batchIndex + progressInsideBatch) / batches.length;
                    var uploadPercent = 35 + Math.round(overallProgress * 60);
                    uploadPercent = Math.max(35, Math.min(95, uploadPercent));
                    updateUploadProgress(uploadPercent, 'Загружаем файлы: ' + (batchIndex + 1) + '/' + batches.length, 'is-stage-uploading');
                  }).then(function(batchData) {
                    updateStateFromPayload(batchData);
                  });
                });
              }, Promise.resolve());
            }

            return uploadPromise.then(function() {
              closeModal(modal);
              if (data && data.message) {
                showMessage('success', data.message);
              } else {
                showMessage('success', isEditMode ? 'Документ обновлён.' : 'Документ добавлен.');
              }
              updateUploadProgress(100, 'Готово. Документ и файлы успешно сохранены.', 'is-stage-success');
              return refreshRegistrySilently();
            })
              .catch(function(error) {
                docsLogger.warn('Перезапись', {
                  action: 'refresh-error',
                  documentId: doc && doc.id ? doc.id : null,
                  message: error && error.message ? error.message : String(error)
                });
                if (typeof window !== 'undefined' && window.refreshDocumentsRegistry) {
                  return window.refreshDocumentsRegistry();
                }
                return Promise.reject(error);
              });
          })
          .catch(function(error) {
            submitButton.disabled = false;
            setUploadProgressActive(true);
            updateUploadProgress(Math.max(uploadState.percent, 12), 'Ошибка загрузки: ' + (error && error.message ? error.message : 'повторите попытку.'), 'is-stage-error');
            if (isEditMode) {
              docsLogger.warn('Перезапись', {
                action: 'submit-update-error',
                documentId: doc && doc.id ? doc.id : null,
                message: error && error.message ? error.message : String(error)
              });
            }
            showMessage('error', 'Не удалось сохранить документ: ' + error.message);
          });
      });

      if (isEditMode) {
        registryField.input.value = doc.registryNumber || doc.registry_number || '';
        registrationDateField.input.value = doc.registrationDate || doc.registration_date || '';
        directionField.input.value = doc.direction || '';
        correspondentField.input.value = doc.correspondent || '';
        documentNumberField.input.value = doc.documentNumber || doc.document_number || '';
        documentDateField.input.value = doc.documentDate || doc.document_date || '';
        executorField.input.value = doc.executor || '';
        dueDateField.input.value = doc.dueDate || '';
        summaryField.input.value = doc.summary || '';
        resolutionField.input.value = doc.resolution || '';
        notesField.input.value = doc.notes || '';

        var directorEntry = storedDirectorEntry || resolveDirectorEntry(doc);
        if (directorEntry) {
          var directorsListForSelection = state.admin && state.admin.settings && Array.isArray(state.admin.settings.block2)
            ? state.admin.settings.block2
            : [];
          var selectedIndex = '';
          for (var dIndex = 0; dIndex < directorsListForSelection.length; dIndex += 1) {
            var candidate = directorsListForSelection[dIndex];
            if (!candidate) {
              continue;
            }
            var candidateId = candidate.id ? normalizeResponsibleId(candidate.id) : '';
            var candidateTelegram = candidate.telegram ? normalizeResponsibleId(candidate.telegram) : '';
            var candidateChat = candidate.chatId ? normalizeResponsibleId(candidate.chatId) : '';
            var candidateEmail = candidate.email ? String(candidate.email).toLowerCase() : '';
            var candidateLogin = candidate.login ? String(candidate.login).toLowerCase() : '';
            var candidateName = normalizeUserIdentifier(candidate.responsible || candidate.name || '');

            var directorId = directorEntry.id ? normalizeResponsibleId(directorEntry.id) : '';
            var directorTelegram = directorEntry.telegram ? normalizeResponsibleId(directorEntry.telegram) : '';
            var directorChat = directorEntry.chatId ? normalizeResponsibleId(directorEntry.chatId) : '';
            var directorEmail = directorEntry.email ? String(directorEntry.email).toLowerCase() : '';
            var directorLogin = directorEntry.login ? String(directorEntry.login).toLowerCase() : '';
            var directorName = normalizeUserIdentifier(directorEntry.responsible || directorEntry.name || '');

            if (
              (directorId && candidateId && directorId === candidateId)
              || (directorTelegram && candidateTelegram && directorTelegram === candidateTelegram)
              || (directorChat && candidateChat && directorChat === candidateChat)
              || (directorEmail && candidateEmail && directorEmail === candidateEmail)
              || (directorLogin && candidateLogin && directorLogin === candidateLogin)
              || (directorName && candidateName && directorName === candidateName)
            ) {
              selectedIndex = String(dIndex);
              break;
            }
          }
          if (selectedIndex !== '') {
            directorSelect.value = selectedIndex;
          } else if (directorEntry) {
            var lockedLabel = buildResponsibleLabel(directorEntry) || 'Назначен ранее';
            var lockedOption = createElement('option', '', lockedLabel);
            lockedOption.value = 'locked-director';
            directorSelect.appendChild(lockedOption);
            directorSelect.value = lockedOption.value;
          }
        }
        renderAttachmentsSummary(attachmentsStore);
      }

      shell.appendChild(header);
      shell.appendChild(form);
      modal.appendChild(shell);

      modal.addEventListener('click', function(event) {
        if (event.target === modal) {
          closeModal(modal);
        }
      });

      document.addEventListener('keydown', handleEscape);
      document.body.appendChild(modal);
    }, function(error) {
      showMessage('error', 'Не удалось загрузить список ответственных: ' + error.message);
    });
  }

  function openSubordinateModal(doc) {
    if (!doc || !doc.id) {
      return;
    }

    runWithResponsibles(function() {
      var modal = createElement('div', 'documents-modal');
      var shell = createElement('div', 'documents-modal__shell documents-modal__shell--narrow documents-modal__shell--assign');
      var title = createElement('h3', 'documents-modal__title', 'Назначить подчинённых');

      var form = createElement('form', 'documents-form');
      var formId = 'documents-form-' + Date.now();
      form.id = formId;
      form.setAttribute('autocomplete', 'off');

      var cancelButton = createElement('button', 'documents-button documents-button--secondary', 'Отмена');
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', function() {
        closeModal(modal);
      });

      var submitButton = createElement('button', 'documents-button documents-button--primary', 'Сохранить');
      submitButton.type = 'submit';
      submitButton.setAttribute('form', formId);

      var header = createElement('div', 'documents-modal__header');
      var actions = createElement('div', 'documents-modal__actions');
      actions.appendChild(cancelButton);
      actions.appendChild(submitButton);
      header.appendChild(title);
      header.appendChild(actions);

      var statusNode = createElement('div', 'documents-modal__status', '');

      var grid = createElement('div', 'documents-form__grid documents-form__grid--single');

      var subordinateField = createElement('div', 'documents-form__field');
      var subordinateLabel = createElement('label', '', 'Подчинённые');
      subordinateField.appendChild(subordinateLabel);
      var currentSubordinates = resolveSubordinateList(doc);
      var subordinatesEditor = createSubordinatesEditor(currentSubordinates);
      subordinateField.appendChild(subordinatesEditor.element);
      grid.appendChild(subordinateField);

      var instructionSelect = null;
      if (canManageInstructions()) {
        var instructionField = createElement('div', 'documents-form__field');
        var instructionLabel = createElement('label', '', 'Поручения');
        instructionField.appendChild(instructionLabel);
        instructionSelect = document.createElement('select');
        instructionSelect.name = 'instruction';
        instructionSelect.setAttribute('aria-label', 'Поручения по документу');
        buildInstructionSelectOptions(instructionSelect, doc && doc.instruction ? String(doc.instruction) : '');
        instructionField.appendChild(instructionSelect);
        grid.appendChild(instructionField);
      }

      form.appendChild(grid);

      function updateStatus(text, isError) {
        statusNode.textContent = text || '';
        statusNode.style.display = text ? 'block' : 'none';
        statusNode.classList.toggle('documents-modal__status--error', Boolean(text && isError));
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        submitButton.disabled = true;
        updateStatus('Сохраняем изменения...', false);

        if (subordinatesEditor.hasMissingTelegramSelection()) {
          submitButton.disabled = false;
          updateStatus(TELEGRAM_MISSING_MESSAGE, true);
          return;
        }
        var selectedSubordinates = subordinatesEditor.collect();
        var fields = { subordinates: selectedSubordinates };
        if (instructionSelect) {
          fields.instruction = instructionSelect.value || '';
        }

        sendUpdate(doc.id, fields, 'Подчинённые обновлены.')
          .then(function() {
            closeModal(modal);
          })
          .catch(function(error) {
            submitButton.disabled = false;
            updateStatus('Не удалось сохранить изменения: ' + error.message, true);
          });
      });

      shell.appendChild(header);
      shell.appendChild(statusNode);
      shell.appendChild(form);
      modal.appendChild(shell);

      modal.addEventListener('click', function(event) {
        if (event.target === modal) {
          closeModal(modal);
        }
      });

      document.addEventListener('keydown', handleEscape);
      document.body.appendChild(modal);
    }, function(error) {
      showMessage('error', 'Не удалось загрузить список подчинённых: ' + error.message);
    });
  }

  function openAssigneeModal(doc) {
    if (!doc || !doc.id) {
      return;
    }

    runWithResponsibles(function() {
      var modal = createElement('div', 'documents-modal');
      var shell = createElement('div', 'documents-modal__shell documents-modal__shell--narrow documents-modal__shell--assign');
      var title = createElement('h3', 'documents-modal__title', 'Назначить ответственного');

      var form = createElement('form', 'documents-form');
      var formId = 'documents-form-' + Date.now();
      form.id = formId;
      form.setAttribute('autocomplete', 'off');

      var cancelButton = createElement('button', 'documents-button documents-button--secondary', 'Отмена');
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', function() {
        closeModal(modal);
      });

      var submitButton = createElement('button', 'documents-button documents-button--primary', 'Сохранить');
      submitButton.type = 'submit';
      submitButton.setAttribute('form', formId);

      var header = createElement('div', 'documents-modal__header');
      var actions = createElement('div', 'documents-modal__actions');
      actions.appendChild(cancelButton);
      actions.appendChild(submitButton);
      header.appendChild(title);
      header.appendChild(actions);

      var statusNode = createElement('div', 'documents-modal__status', '');

      var grid = createElement('div', 'documents-form__grid documents-form__grid--single');

      var assigneeField = createElement('div', 'documents-form__field');
      var assigneeLabel = createElement('label', '', 'Ответственные');
      assigneeField.appendChild(assigneeLabel);
      var allAssignees = resolveAssigneeList(doc);
      var preservedSubordinates = [];
      var currentAssignees = [];

      if (allAssignees && allAssignees.length) {
        for (var ca = 0; ca < allAssignees.length; ca += 1) {
          var assigneeEntry = allAssignees[ca];
          if (!assigneeEntry) {
            continue;
          }
          if (isSubordinateSnapshot(assigneeEntry)) {
            preservedSubordinates.push(assigneeEntry);
          } else {
            currentAssignees.push(assigneeEntry);
          }
        }
      }

      var assigneesEditor = createAssigneesEditor(currentAssignees);
      assigneeField.appendChild(assigneesEditor.element);
      grid.appendChild(assigneeField);

      var primaryAssignee = resolvePrimaryAssignee(doc);

      var instructionSelect = null;
      if (canManageInstructions()) {
        var instructionField = createElement('div', 'documents-form__field');
        var instructionLabel = createElement('label', '', 'Поручения');
        instructionField.appendChild(instructionLabel);
        instructionSelect = document.createElement('select');
        instructionSelect.name = 'instruction';
        instructionSelect.setAttribute('aria-label', 'Поручения по документу');
        var initialInstruction = '';
        if (primaryAssignee && primaryAssignee.assignmentInstruction) {
          initialInstruction = String(primaryAssignee.assignmentInstruction);
        } else if (doc && doc.instruction) {
          initialInstruction = String(doc.instruction);
        }
        buildInstructionSelectOptions(instructionSelect, initialInstruction);
        instructionField.appendChild(instructionSelect);
        grid.appendChild(instructionField);
      }

      var dueField = createElement('div', 'documents-form__field');
      var dueLabel = createElement('label', '', 'Общий срок исполнения');
      var dueInput = document.createElement('input');
      dueInput.type = 'date';
      dueInput.name = 'due_date';
      var initialDueDate = '';
      if (doc && doc.dueDate) {
        initialDueDate = String(doc.dueDate);
      }
      dueInput.value = initialDueDate;
      dueField.appendChild(dueLabel);
      dueField.appendChild(dueInput);
      grid.appendChild(dueField);

      var commentField = createElement('div', 'documents-form__field');
      var commentLabel = createElement('label', '', 'Комментарий');
      var commentInput = document.createElement('textarea');
      var commentId = 'documents-assignment-comment-' + Date.now();
      commentLabel.setAttribute('for', commentId);
      commentInput.id = commentId;
      commentInput.name = 'assignment_comment';
      commentInput.setAttribute('rows', '3');
      commentInput.setAttribute('maxlength', '500');
      commentInput.placeholder = 'Комментарий по задаче';

      var initialComment = '';
      for (var caIndex = 0; caIndex < currentAssignees.length; caIndex += 1) {
        var commentCandidate = currentAssignees[caIndex];
        if (commentCandidate && commentCandidate.assignmentComment) {
          initialComment = String(commentCandidate.assignmentComment);
          break;
        }
      }
      if (!initialComment && primaryAssignee && primaryAssignee.assignmentComment) {
        initialComment = String(primaryAssignee.assignmentComment);
      } else if (!initialComment && doc && doc.assignee && doc.assignee.assignmentComment) {
        initialComment = String(doc.assignee.assignmentComment);
      }
      commentInput.value = initialComment;

      commentField.appendChild(commentLabel);
      commentField.appendChild(commentInput);
      grid.appendChild(commentField);

      form.appendChild(grid);

      function updateStatus(text, isError) {
        statusNode.textContent = text || '';
        statusNode.style.display = text ? 'block' : 'none';
        statusNode.classList.toggle('documents-modal__status--error', Boolean(text && isError));
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        submitButton.disabled = true;
        updateStatus('Сохраняем изменения...', false);

        if (assigneesEditor.hasMissingTelegramSelection()) {
          submitButton.disabled = false;
          updateStatus(TELEGRAM_MISSING_MESSAGE, true);
          return;
        }
        var selectedAssignees = assigneesEditor.collect();
        var combinedAssignees = selectedAssignees.slice();

        var assignmentComment = commentInput ? String(commentInput.value || '').trim() : '';
        if (selectedAssignees.length) {
          if (assignmentComment) {
            selectedAssignees[0].assignmentComment = assignmentComment;
          } else if (selectedAssignees[0].assignmentComment) {
            delete selectedAssignees[0].assignmentComment;
          }
        }

        if (preservedSubordinates.length) {
          var combinedSeen = Object.create(null);

          function buildAssignmentKey(entry) {
            if (!entry || typeof entry !== 'object') {
              return '';
            }
            var key = '';
            if (entry.id) {
              key = 'id::' + normalizeResponsibleId(entry.id);
            } else if (entry.login) {
              key = 'login::' + String(entry.login).toLowerCase();
            } else if (entry.telegram) {
              key = 'telegram::' + normalizeResponsibleId(entry.telegram);
            } else if (entry.chatId) {
              key = 'chat::' + normalizeResponsibleId(entry.chatId);
            } else if (entry.email) {
              key = 'email::' + String(entry.email).toLowerCase();
            } else if (entry.name) {
              key = 'name::' + String(entry.name).toLowerCase();
            }
            var roleKey = entry.role ? String(entry.role).toLowerCase() : '';
            if (roleKey) {
              key = key ? key + '::role::' + roleKey : 'role::' + roleKey;
            }
            return key;
          }

          combinedAssignees.forEach(function(existingEntry) {
            var existingKey = buildAssignmentKey(existingEntry);
            if (existingKey) {
              combinedSeen[existingKey] = true;
            }
          });

          preservedSubordinates.forEach(function(subordinateEntry) {
            if (!subordinateEntry || typeof subordinateEntry !== 'object') {
              return;
            }
            var clone = {};
            for (var prop in subordinateEntry) {
              if (Object.prototype.hasOwnProperty.call(subordinateEntry, prop)) {
                clone[prop] = subordinateEntry[prop];
              }
            }
            if (!clone.role) {
              clone.role = 'subordinate';
            }

            var duplicateKey = buildAssignmentKey(clone);

            if (!duplicateKey || !combinedSeen[duplicateKey]) {
              if (duplicateKey) {
                combinedSeen[duplicateKey] = true;
              }
              combinedAssignees.push(clone);
            }
          });
        }

        var fields = {};
        fields.assignees = combinedAssignees;
        fields.assignee = selectedAssignees.length ? selectedAssignees[0] : {};
        var assignmentDueDate = dueInput.value ? String(dueInput.value).trim() : '';
        fields.dueDate = assignmentDueDate;
        if (assignmentDueDate) {
          selectedAssignees.forEach(function(entry) {
            if (entry && !entry.assignmentDueDate) {
              entry.assignmentDueDate = assignmentDueDate;
            }
          });
        }
        if (instructionSelect) {
          var assignmentInstruction = String(instructionSelect.value || '').trim();
          fields.instruction = assignmentInstruction;
          if (selectedAssignees.length) {
            if (assignmentInstruction) {
              selectedAssignees[0].assignmentInstruction = assignmentInstruction;
            } else if (selectedAssignees[0].assignmentInstruction) {
              delete selectedAssignees[0].assignmentInstruction;
            }
          }
          if (assignmentInstruction) {
            fields.assignee.assignmentInstruction = assignmentInstruction;
          } else if (fields.assignee.assignmentInstruction) {
            delete fields.assignee.assignmentInstruction;
          }
        }
        if (assignmentComment) {
          fields.assignee.assignmentComment = assignmentComment;
        } else if (fields.assignee.assignmentComment) {
          delete fields.assignee.assignmentComment;
        }

        sendUpdate(doc.id, fields, 'Ответственный обновлён.')
          .then(function() {
            closeModal(modal);
          })
          .catch(function(error) {
            submitButton.disabled = false;
            updateStatus('Не удалось сохранить изменения: ' + error.message, true);
          });
      });

      shell.appendChild(header);
      shell.appendChild(statusNode);
      shell.appendChild(form);
      modal.appendChild(shell);

      modal.addEventListener('click', function(event) {
        if (event.target === modal) {
          closeModal(modal);
        }
      });

      document.addEventListener('keydown', handleEscape);
      document.body.appendChild(modal);
    }, function(error) {
      showMessage('error', 'Не удалось загрузить список ответственных: ' + error.message);
    });
  }

  function buildLayout(host) {
    host.innerHTML = '';

    ensureSearchStyles();

    if (!state.resizeListenerAttached && typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', handleTableResize);
      state.resizeListenerAttached = true;
    }

    var workspace = createElement('div', 'documents-workspace');

    var addButton = document.getElementById('documents-add-button');
    if (addButton) {
      addButton.addEventListener('click', openDocumentForm);
      ensureClock(addButton);
    }

    var adminButton = document.getElementById('documents-admin-button');
    if (adminButton) {
      adminButton.addEventListener('click', openAdminModal);
    }

    var settingsButton = document.getElementById('documents-settings-button');
    if (settingsButton && !settingsButton.dataset.settingsBound) {
      settingsButton.dataset.settingsBound = 'true';
      settingsButton.addEventListener('click', function() {
        if (window.docsSettings && typeof window.docsSettings.open === 'function') {
          window.docsSettings.open();
        }
      });
    }

    var onlineButton = document.getElementById('documents-online-button');
    if (onlineButton && !onlineButton.dataset.onlineBound) {
      onlineButton.dataset.onlineBound = 'true';
      var counter = onlineButton.querySelector('.documents-online__counter');
      elements.onlineCounter = counter;
      onlineButton.addEventListener('click', function() {
        openOnlineModal();
      });
    }

    var buttonContainer = null;
    if (adminButton && adminButton.parentElement) {
      buttonContainer = adminButton.parentElement;
    } else {
      var header = document.querySelector('.documents-panel__header');
      if (header) {
        buttonContainer = header;
      }
    }

    var responsibleButton = document.getElementById('documents-responsible-button');
    if (!responsibleButton && buttonContainer) {
      responsibleButton = createElement('button', 'documents-panel__admin documents-panel__admin--responsible', 'Ответственный');
      responsibleButton.id = 'documents-responsible-button';
      responsibleButton.type = 'button';
      var responsibleAnchor = adminButton || settingsButton || null;
      if (responsibleAnchor && responsibleAnchor.parentElement === buttonContainer) {
        buttonContainer.insertBefore(responsibleButton, responsibleAnchor);
      } else {
        buttonContainer.appendChild(responsibleButton);
      }
    }
    if (responsibleButton && !responsibleButton.dataset.toggleBound) {
      responsibleButton.dataset.toggleBound = 'true';
      responsibleButton.addEventListener('click', function() {
        toggleResponsibleFilter();
      });
    }

    var unviewedButton = document.getElementById('documents-unviewed-button');
    var unviewedCounter = null;
    if (!unviewedButton && buttonContainer) {
      unviewedButton = createElement('button', 'documents-panel__admin documents-panel__admin--unviewed', '');
      unviewedButton.id = 'documents-unviewed-button';
      unviewedButton.type = 'button';
      var unviewedLabel = createElement('span', 'documents-unviewed-button__label', 'Не просмотрено');
      unviewedCounter = createElement('span', 'documents-unviewed-button__counter documents-unviewed-button__counter--hidden', '0');
      unviewedCounter.setAttribute('role', 'status');
      unviewedCounter.setAttribute('aria-live', 'polite');
      unviewedCounter.setAttribute('aria-atomic', 'true');
      unviewedButton.appendChild(unviewedLabel);
      unviewedButton.appendChild(unviewedCounter);
      var unviewedAnchor = adminButton || settingsButton || null;
      if (unviewedAnchor && unviewedAnchor.parentElement === buttonContainer) {
        buttonContainer.insertBefore(unviewedButton, unviewedAnchor);
      } else {
        buttonContainer.appendChild(unviewedButton);
      }
    } else if (unviewedButton) {
      unviewedCounter = unviewedButton.querySelector('.documents-unviewed-button__counter');
    }
    if (unviewedButton && !unviewedButton.dataset.toggleBound) {
      unviewedButton.dataset.toggleBound = 'true';
      unviewedButton.addEventListener('click', function() {
        toggleUnviewedFilter();
      });
    }

    var message = createElement('div', 'documents-message');
    var filterBar = createElement('div', 'documents-filter-bar documents-filter-bar--hidden');

    var tableWrapper = createElement('div', 'documents-table-wrapper');
    tableWrapper.style.maxHeight = '100vh';
    tableWrapper.style.overflow = 'auto';
    tableWrapper.style.webkitOverflowScrolling = 'touch';
    var table = createElement('table', 'documents-table');
    var colgroup = createElement('colgroup', 'documents-table__colgroup');
    elements.columnCols = {};
    TABLE_COLUMNS.forEach(function(column) {
      var col = document.createElement('col');
      col.dataset.columnKey = column.key;
      elements.columnCols[column.key] = col;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);
    var thead = createElement('thead', 'documents-table__head');
    var groupRow = createElement('tr', 'documents-table__group-row');
    elements.groupRow = groupRow;
    elements.groupCells = {};
    TABLE_GROUPS.forEach(function(group) {
      var groupCell = createElement('th', '');
      groupCell.dataset.groupKey = group.key;
      groupCell.colSpan = group.span;
      groupCell.setAttribute('colspan', group.span);
      groupCell.textContent = group.label;
      elements.groupCells[group.key] = groupCell;
      groupRow.appendChild(groupCell);
    });
    thead.appendChild(groupRow);

    var headerRow = createElement('tr', 'documents-table__header-row');
    elements.headerRow = headerRow;
    elements.searchButtons = {};
    elements.headerCells = {};
    TABLE_COLUMNS.forEach(function(column) {
      var headerCell = createElement('th', 'documents-table__header-cell');
      headerCell.setAttribute('scope', 'col');
      headerCell.dataset.columnKey = column.key;
      elements.headerCells[column.key] = headerCell;
      var headerContent = createElement('div', 'documents-header-content');
      headerCell.appendChild(headerContent);
      var label = createElement('span', 'documents-header-label', column.label);
      headerContent.appendChild(label);
      if (column.searchable) {
        headerCell.classList.add('documents-table__header-cell--searchable');
        headerCell.title = 'Поиск по столбцу «' + column.label + '»';
        headerCell.setAttribute('tabindex', '0');
        headerCell.setAttribute('aria-haspopup', 'dialog');
        headerCell.addEventListener('click', function() {
          openSearchPopover(column.key, headerCell);
        });
        headerCell.addEventListener('keydown', function(event) {
          var key = event.key || '';
          if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space') {
            event.preventDefault();
            openSearchPopover(column.key, headerCell);
          }
        });
        elements.searchButtons[column.key] = headerCell;
      }
      setElementColumnWidth(headerCell, getEffectiveColumnWidth(column.key));
      headerRow.appendChild(headerCell);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    var tbody = createElement('tbody', '');
    table.appendChild(tbody);
    tableWrapper.appendChild(table);

    var empty = createElement('div', 'documents-empty', 'Загрузка реестра документов...');
    tableWrapper.appendChild(empty);

    workspace.appendChild(message);
    workspace.appendChild(filterBar);
    workspace.appendChild(tableWrapper);

    host.appendChild(workspace);

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(updateStickyHeaderOffsets);
    } else {
      updateStickyHeaderOffsets();
    }

    elements.addButton = addButton;
    elements.adminButton = adminButton;
    elements.onlineButton = onlineButton;
    elements.responsibleButton = responsibleButton;
    elements.unviewedButton = unviewedButton;
    elements.unviewedCounter = unviewedCounter;
    elements.settingsButton = settingsButton;
    elements.message = message;
    elements.filterBar = filterBar;
    elements.tableWrapper = tableWrapper;
    elements.table = table;
    elements.tableBody = tbody;
    elements.tableScroll = tableWrapper;
    elements.emptyState = empty;

    bindVirtualTableScroll(tableWrapper);

    updateResponsibleButtonState();
    updateUnviewedButtonState();
    updateSearchButtonStates();
    updateFilterBar();
    ensureSearchPopover(document.body);
    bindSearchEvents();
    handleTableResize();
  }

  window.startDocuments = function(target) {
    var host = target || document.getElementById('documents-root');
    if (!host) {
      return;
    }
    if (host.dataset.initialized === 'true') {
      return;
    }

    state.host = host;

    var initialAccessContext = null;
    if (typeof window !== 'undefined' && window.documentsAccessContext) {
      initialAccessContext = window.documentsAccessContext;
    }
    applyAccessContext(initialAccessContext);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('documentsAccessContextChanged', handleAccessContextChange);
      window.addEventListener('beforeunload', stopPresenceTracking);
      window.addEventListener('pagehide', stopPresenceTracking);
    }
    state.telegramUserId = getTelegramUserId();
    if (!diagnosticsState.startSent) {
      diagnosticsState.startSent = true;
      var startDetails = {
        hostId: host.id || null
      };
      if (host.dataset && host.dataset.organization) {
        startDetails.datasetOrganization = host.dataset.organization;
      }
      if (state.organization) {
        startDetails.organizationDetected = state.organization;
      }
      sendClientDiagnostics('start_documents', startDetails);
    }
    requestSessionDiagnostics();
    state.admin.loaded = false;
    state.admin.settings = {
      responsibles: [],
      block2: [],
      block3: []
    };
    state.responsiblesIndex = {};
    state.subordinatesIndex = {};
    state.admin.loadingPromise = null;
    state.admin.userLog = {
      entries: [],
      loading: false,
      error: '',
      visible: false,
      promise: null,
      lastLoadedAt: 0
    };
    buildLayout(host);
    applyVisualSettings(state.visualSettings);
    setToolbarState();

    var title = document.getElementById('documents-title');
    if (title && state.organization) {
      title.textContent = 'Документооборот — ' + state.organization;
    }

    var panel = document.getElementById('documents-panel');
    if (panel) {
      panel.classList.add('documents-panel--fullscreen');
    }

    bootstrapDocsSettingsIfReady();

    if (state.organization) {
      loadColumnWidths(state.organization).catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.warn === 'function') {
          docsLogger.warn('Не удалось загрузить настройки ширины столбцов:', error);
        }
      });
      fetchAdminSettings().catch(function(error) {
        docsLogger.warn('Не удалось загрузить настройки ответственных:', error);
      });
      loadRegistry(state.organization).catch(function(error) {
        if (typeof console !== 'undefined' && typeof docsLogger.error === 'function') {
          docsLogger.error('Не удалось загрузить реестр документов при инициализации:', error);
        }
      });
    } else {
      showMessage('error', 'Не удалось определить организацию для этой страницы.');
    }

    host.dataset.initialized = 'true';
  };

  window.refreshDocumentsRegistry = function() {
    if (!state.organization) {
      showMessage('error', 'Не удалось определить организацию для этой страницы.');
      return Promise.reject(new Error('Организация не определена.'));
    }

    return loadRegistry(state.organization);
  };
})();
