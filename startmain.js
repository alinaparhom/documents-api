(function() {
  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function fitMap() {
    var container = window.su21Map && window.su21Map.container;
    if (container && typeof container.fitToViewport === 'function') {
      container.fitToViewport();
    }
  }

  var bcryptPromise = null;
  var detectedOrganization = '';

  var ADMIN_ACCESS_EVENT = 'su21:admin-access-changed';
  var ADMIN_ACCESS_STORAGE_KEY = 'su21.adminAccessState';

  function createDefaultAdminAccessState() {
    return { active: false, login: '', name: '' };
  }

  function cloneAdminAccessState(state) {
    if (!state || typeof state !== 'object') {
      return createDefaultAdminAccessState();
    }
    return {
      active: Boolean(state.active),
      login: typeof state.login === 'string' ? state.login : '',
      name: typeof state.name === 'string' ? state.name : ''
    };
  }

  function loadAdminAccessStateFromStorage() {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return createDefaultAdminAccessState();
    }
    try {
      var raw = window.sessionStorage.getItem(ADMIN_ACCESS_STORAGE_KEY);
      if (!raw) {
        return createDefaultAdminAccessState();
      }
      var parsed = JSON.parse(raw);
      return cloneAdminAccessState(parsed);
    } catch (error) {
      return createDefaultAdminAccessState();
    }
  }

  var globalAdminAccessState = loadAdminAccessStateFromStorage();

  function adminAccessStatesEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return Boolean(a.active) === Boolean(b.active)
      && (a.login || '') === (b.login || '')
      && (a.name || '') === (b.name || '');
  }

  function persistAdminAccessState(state) {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }
    try {
      if (!state || !state.active) {
        window.sessionStorage.removeItem(ADMIN_ACCESS_STORAGE_KEY);
        return;
      }
      var payload = JSON.stringify({
        active: true,
        login: state.login || '',
        name: state.name || ''
      });
      window.sessionStorage.setItem(ADMIN_ACCESS_STORAGE_KEY, payload);
    } catch (storageError) {
      // ignore storage errors
    }
  }

  function dispatchAdminAccessState(state) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    try {
      var detail = { state: cloneAdminAccessState(state) };
      var event = null;
      if (typeof window.CustomEvent === 'function') {
        event = new CustomEvent(ADMIN_ACCESS_EVENT, { detail: detail });
      } else if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
        event = document.createEvent('Event');
        event.initEvent(ADMIN_ACCESS_EVENT, false, false);
        event.detail = detail;
      }
      if (event) {
        window.dispatchEvent(event);
      }
    } catch (dispatchError) {
      // ignore dispatch errors
    }
  }

  function updateGlobalAdminAccessState(state) {
    var nextState = cloneAdminAccessState(state);
    if (adminAccessStatesEqual(globalAdminAccessState, nextState)) {
      return;
    }
    globalAdminAccessState = nextState;
    persistAdminAccessState(globalAdminAccessState);
    dispatchAdminAccessState(globalAdminAccessState);
  }

  function setAdminAccessState(active, userInfo) {
    var loginValue = userInfo && typeof userInfo.login === 'string' ? userInfo.login : '';
    var nameValue = userInfo && typeof userInfo.name === 'string' ? userInfo.name : '';
    updateGlobalAdminAccessState({
      active: Boolean(active),
      login: loginValue,
      name: nameValue
    });
  }

  function getAdminAccessState() {
    return cloneAdminAccessState(globalAdminAccessState);
  }

  function ensureBcrypt() {
    if (window.dcodeIO && window.dcodeIO.bcrypt) {
      return Promise.resolve(window.dcodeIO.bcrypt);
    }

    if (bcryptPromise) {
      return bcryptPromise;
    }

    bcryptPromise = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js';
      script.async = true;

      script.onload = function() {
        if (window.dcodeIO && window.dcodeIO.bcrypt) {
          resolve(window.dcodeIO.bcrypt);
        } else {
          bcryptPromise = null;
          reject(new Error('bcrypt.js не инициализирован'));
        }
      };

      script.onerror = function() {
        bcryptPromise = null;
        reject(new Error('Не удалось загрузить библиотеку bcrypt.js'));
      };

      document.head.appendChild(script);
    });

    return bcryptPromise;
  }

  function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[abxy]\$/.test(value);
  }

  function normalizeBcryptHashForCompare(hash) {
    if (typeof hash !== 'string') {
      return '';
    }

    if (hash.length >= 4) {
      var prefix = hash.slice(0, 4);
      if (prefix === '$2y$' || prefix === '$2x$') {
        return '$2a$' + hash.slice(4);
      }
    }

    return hash;
  }

  function stripInvisiblePasswordChars(value) {
    if (typeof value !== 'string' || value === '') {
      return typeof value === 'string' ? value : '';
    }

    return value.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');
  }

  function trimPasswordEdges(value) {
    if (typeof value !== 'string' || value === '') {
      return typeof value === 'string' ? value : '';
    }

    var edgePattern = /^[\s\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]+|[\s\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]+$/g;
    return value.replace(edgePattern, '');
  }

  function normalizePasswordSpaces(value) {
    if (typeof value !== 'string' || value === '') {
      return typeof value === 'string' ? value : '';
    }

    return value.replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  }

  function sanitizeDebugDetails(details, depth) {
    if (depth === undefined) {
      depth = 0;
    }

    if (depth > 3) {
      return '…';
    }

    if (details === null || details === undefined) {
      return details === undefined ? null : null;
    }

    if (typeof details === 'string') {
      if (details.length > 200) {
        return details.slice(0, 200) + '…';
      }
      return details;
    }

    if (typeof details === 'number' || typeof details === 'boolean') {
      return details;
    }

    if (Array.isArray && Array.isArray(details)) {
      return details.slice(0, 5).map(function(item) {
        return sanitizeDebugDetails(item, depth + 1);
      });
    }

    if (typeof details === 'object') {
      var result = {};
      var keys = Object.keys(details).slice(0, 20);

      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        if (!Object.prototype.hasOwnProperty.call(details, key)) {
          continue;
        }

        var value = details[key];
        var normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
        if (normalizedKey && normalizedKey.indexOf('password') !== -1) {
          result[key] = '[filtered]';
          continue;
        }

        result[key] = sanitizeDebugDetails(value, depth + 1);
      }

      return result;
    }

    try {
      return String(details);
    } catch (stringifyError) {
      return Object.prototype.toString.call(details);
    }
  }

  function logDocumentsDebug(eventName, details) {
    if (typeof fetch !== 'function') {
      return;
    }

    var normalizedEvent = '';
    if (typeof eventName === 'string') {
      normalizedEvent = eventName.trim();
    }

    if (!normalizedEvent) {
      return;
    }

    var payload = {
      event: normalizedEvent,
      organization: detectedOrganization || '',
      details: sanitizeDebugDetails(details || {}, 0),
      location: typeof window !== 'undefined' && window.location && typeof window.location.href === 'string'
        ? window.location.href
        : '',
      userAgent: typeof navigator !== 'undefined' && navigator.userAgent
        ? navigator.userAgent
        : ''
    };

    try {
      fetch('docs.php?action=client_debug', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function(error) {
        if (window.console && typeof window.console.warn === 'function') {
          console.warn('Не удалось отправить отладочное событие документов:', error);
        }
      });
    } catch (error) {
      if (window.console && typeof window.console.warn === 'function') {
        console.warn('Ошибка подготовки отладочного события документов:', error);
      }
    }
  }

  function generatePasswordVariants(password) {
    if (typeof password !== 'string') {
      return [];
    }

    var variants = [];
    var seen = Object.create(null);

    function pushVariant(label, candidate) {
      if (typeof candidate !== 'string') {
        return;
      }
      var key = candidate;
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      variants.push({ label: label, value: candidate });
    }

    pushVariant('original', password);

    var stripped = stripInvisiblePasswordChars(password);
    if (stripped !== password) {
      pushVariant('stripped_invisible', stripped);
    }

    var trimmed = trimPasswordEdges(password);
    if (trimmed !== password) {
      pushVariant('trimmed', trimmed);
    }

    var normalizedSpaces = normalizePasswordSpaces(password);
    if (normalizedSpaces !== password) {
      pushVariant('normalized_spaces', normalizedSpaces);
    }

    var normalizedTrimmed = trimPasswordEdges(normalizedSpaces);
    if (normalizedTrimmed !== password && normalizedTrimmed !== trimmed) {
      pushVariant('normalized_trimmed', normalizedTrimmed);
    }

    return variants;
  }

  function hashPasswordToBase64(value, fallbackHash) {
    var trimmed = (value || '').trim();
    if (!trimmed) {
      return Promise.resolve(fallbackHash || '');
    }

    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      var encoder = new TextEncoder();
      return window.crypto.subtle.digest('SHA-256', encoder.encode(trimmed))
        .then(function(buffer) {
          var bytes = Array.from(new Uint8Array(buffer));
          return btoa(String.fromCharCode.apply(null, bytes));
        })
        .catch(function() {
          return fallbackHash || '';
        });
    }

    return Promise.resolve(fallbackHash || '');
  }

  function buildPasswordVariantHashes(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
      return Promise.resolve([]);
    }

    var hashPromises = variants.map(function(variant) {
      var candidate = variant && typeof variant.value === 'string' ? variant.value : '';
      if (!candidate) {
        return Promise.resolve('');
      }
      return hashPasswordToBase64(candidate, '');
    });

    return Promise.all(hashPromises);
  }

  function fetchAdminUsers() {
    return fetch('lg/user.json?ts=' + Date.now(), {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Не удалось получить список администраторов');
        }
        return response.json();
      })
      .then(function(payload) {
        if (Array.isArray(payload)) {
          return payload;
        }
        throw new Error('Некорректный формат файла пользователей');
      });
  }

  function normalizePagePath(path) {
    if (typeof path !== 'string') {
      return '';
    }
    return path.replace(/^\/+/, '').trim();
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

  function sanitizeOrganizationForFileName(name) {
    if (typeof name !== 'string') {
      return 'organization';
    }

    var normalized = name.trim();
    if (!normalized) {
      return 'organization';
    }

    normalized = normalized.replace(/[\s]+/g, '_');
    normalized = normalized.replace(/[^\p{L}\p{N}_\-]+/gu, '_');
    normalized = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

    return normalized || 'organization';
  }

  function sanitizeOrganizationForFrontWorksFolder(name) {
    if (typeof name !== 'string') {
      return 'organization';
    }

    var normalized = name.trim();
    if (!normalized) {
      return 'organization';
    }

    normalized = normalized.replace(/[\\/]+/g, '_');
    normalized = normalized.replace(/[^\p{L}\p{N}_\-\. ]+/gu, '_');
    normalized = normalized.replace(/_+/g, '_').replace(/^[_\s]+|[_\s]+$/g, '');

    return normalized || 'organization';
  }

  function normalizeFrontWorksUser(record) {
    if (!record || typeof record !== 'object') {
      return null;
    }

    var login = typeof record.login === 'string' ? record.login.trim() : '';
    var password = typeof record.password === 'string' ? record.password : '';

    if (!login || !password) {
      return null;
    }

    return {
      login: login,
      password: password,
      name: typeof record.name === 'string' ? record.name.trim() : ''
    };
  }

  function normalizeFrontWorksUsersList(payload) {
    var source = [];

    if (Array.isArray(payload)) {
      source = payload;
    } else if (payload && Array.isArray(payload.users)) {
      source = payload.users;
    }

    var result = [];

    for (var i = 0; i < source.length; i += 1) {
      var normalized = normalizeFrontWorksUser(source[i]);
      if (normalized) {
        result.push(normalized);
      }
    }

    return result;
  }

  function sendFrontWorksDebugLog(message, context) {
    if (!message) {
      return;
    }

    var payload = {
      message: message,
      context: context || {},
      page: window && window.location ? window.location.pathname : '',
      ts: new Date().toISOString()
    };

    try {
      var body = JSON.stringify(payload);
      if (window && window.navigator && typeof window.navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        window.navigator.sendBeacon('frontworks_log.php', blob);
        return;
      }

      fetch('frontworks_log.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: body,
        cache: 'no-store',
        credentials: 'same-origin',
        keepalive: true
      }).catch(function() {});
    } catch (error) {
      return;
    }
  }

  function extractFrontWorksAdmins(payload) {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    var byKey = null;
    var keys = ['frontworks', 'frontWorks', 'front_works', 'frontworks_admins', 'frontworksAdmins', 'frontWorksAdmins'];

    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (payload[key]) {
        byKey = payload[key];
        break;
      }
    }

    if (byKey && Array.isArray(byKey)) {
      return byKey;
    }

    if (byKey && byKey.admins && Array.isArray(byKey.admins)) {
      return byKey.admins;
    }

    if (payload.frontworks && Array.isArray(payload.frontworks.admins)) {
      return payload.frontworks.admins;
    }

    return [];
  }

  function normalizeMainAdminUsersList(data) {
    if (!data || typeof data !== 'object') {
      return [];
    }

    var result = [];
    var seen = Object.create(null);
    var bucket = 'blockThreeUsers';
    var source = Array.isArray(data[bucket]) ? data[bucket].slice() : [];

    for (var j = 0; j < source.length; j += 1) {
      var normalized = normalizeFrontWorksUser({
        login: source[j] && source[j].login,
        password: source[j] && source[j].password,
        name: (source[j] && (source[j].name || source[j].fullName)) || ''
      });

      if (!normalized) {
        continue;
      }

      var loginKey = normalized.login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push(normalized);
    }

    return result;
  }

  function normalizeTabelAdminsList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    var source = [];
    var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (Array.isArray(data.blockFourUsers)) {
      source = data.blockFourUsers.slice();
    }

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var normalized = normalizeFrontWorksUser({
        login: source[i] && source[i].login,
        password: source[i] && source[i].password,
        name: (source[i] && (source[i].name || source[i].fullName)) || ''
      });

      if (!normalized) {
        continue;
      }

      var loginKey = normalized.login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push(normalized);
    }

    return result;
  }

  function normalizeTabelUsersList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    if (payload.success === false) {
      return [];
    }

    var source = Array.isArray(payload.users)
      ? payload.users.slice()
      : Array.isArray(payload.data)
        ? payload.data.slice()
        : [];

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var item = source[i];
      if (!item || typeof item !== 'object') {
        continue;
      }

      var login = typeof item.login === 'string' ? item.login.trim() : '';
      var password = typeof item.password === 'string' ? item.password : '';
      if (!login || !password) {
        continue;
      }

      var loginKey = login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push({
        id: item.id || '',
        fio: item.fio || '',
        email: item.email || '',
        telegram: item.telegram || '',
        object_ids: Array.isArray(item.object_ids)
          ? item.object_ids.map(function(value) { return String(value).trim(); }).filter(Boolean)
          : [],
        role: item.role || '',
        login: login,
        password: password,
        note: item.note || ''
      });
    }

    return result;
  }

  function normalizeAllTrackAdminsList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    var source = [];
    var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (Array.isArray(data.blockFiveUsers)) {
      source = data.blockFiveUsers.slice();
    }

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var normalized = normalizeFrontWorksUser({
        login: source[i] && source[i].login,
        password: source[i] && source[i].password,
        name: (source[i] && (source[i].name || source[i].fullName)) || ''
      });

      if (!normalized) {
        continue;
      }

      var loginKey = normalized.login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push(normalized);
    }

    return result;
  }

  function normalizeOhranaAdminsList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    var source = [];
    var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (Array.isArray(data.blockEightUsers)) {
      source = data.blockEightUsers.slice();
    }

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var normalized = normalizeFrontWorksUser({
        login: source[i] && source[i].login,
        password: source[i] && source[i].password,
        name: (source[i] && (source[i].name || source[i].fullName)) || ''
      });

      if (!normalized) {
        continue;
      }

      var loginKey = normalized.login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push(normalized);
    }

    return result;
  }

  function normalizeZavodAdminsList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    var source = [];
    var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (Array.isArray(data.blockNineUsers)) {
      source = data.blockNineUsers.slice();
    }

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var normalized = normalizeFrontWorksUser({
        login: source[i] && source[i].login,
        password: source[i] && source[i].password,
        name: (source[i] && (source[i].name || source[i].fullName)) || ''
      });

      if (!normalized) {
        continue;
      }

      var loginKey = normalized.login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push(normalized);
    }

    return result;
  }

  function normalizeZa9vkaAdminsList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    var source = [];
    var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (Array.isArray(data.blockSevenUsers)) {
      source = data.blockSevenUsers.slice();
    }

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var normalized = normalizeFrontWorksUser({
        login: source[i] && source[i].login,
        password: source[i] && source[i].password,
        name: (source[i] && (source[i].name || source[i].fullName)) || ''
      });

      if (!normalized) {
        continue;
      }

      var loginKey = normalized.login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push(normalized);
    }

    return result;
  }

  function normalizeZa9vkaUsersList(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    if (payload.success === false) {
      return [];
    }

    var source = Array.isArray(payload.users)
      ? payload.users.slice()
      : Array.isArray(payload.data)
        ? payload.data.slice()
        : [];

    var result = [];
    var seen = Object.create(null);

    for (var i = 0; i < source.length; i += 1) {
      var item = source[i];
      if (!item || typeof item !== 'object') {
        continue;
      }

      var login = typeof item.login === 'string' ? item.login.trim() : '';
      var password = typeof item.password === 'string' ? item.password : '';
      if (!login || !password) {
        continue;
      }

      var loginKey = login.toLowerCase();
      if (seen[loginKey]) {
        continue;
      }

      seen[loginKey] = true;
      result.push({
        id: item.id || '',
        fio: item.fio || '',
        email: item.email || '',
        telegram: item.telegram || '',
        object_ids: Array.isArray(item.object_ids)
          ? item.object_ids.map(function(value) { return String(value).trim(); }).filter(Boolean)
          : [],
        role: item.role || '',
        login: login,
        password: password,
        name: item.name || item.fio || '',
        note: item.note || ''
      });
    }

    return result;
  }

  function fetchFrontWorksAdminsData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'frontworks');
    var url = 'mainadmin.php?organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        sendFrontWorksDebugLog('front-works: admins fetch response', {
          url: url,
          status: response.status,
          ok: response.ok
        });
        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new Error('Не удалось получить список администраторов');
        }
        return response.json();
      })
      .then(function(payload) {
        if (!payload) {
          return [];
        }

        if (payload.success === false) {
          return [];
        }

        var data = payload.data || payload;
        var normalized = normalizeMainAdminUsersList(data);
        sendFrontWorksDebugLog('front-works: admins normalized', {
          url: url,
          count: normalized.length
        });
        return normalized;
      })
      .catch(function() {
        sendFrontWorksDebugLog('front-works: admins fetch failed', { url: url });
        return [];
      });
  }

  function fetchFrontWorksRegularUsers(orgName) {
    var safeName = sanitizeOrganizationForFrontWorksFolder(orgName || 'frontworks');
    var encodedFolder = encodeURIComponent(safeName);
    var url = 'FRbaza/' + encodedFolder + '/FRuser.json?ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        sendFrontWorksDebugLog('front-works: users fetch response', {
          url: url,
          status: response.status,
          ok: response.ok
        });
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить пользователей Фронта работ');
        }
        return response.json();
      })
      .then(function(payload) {
        var normalized = normalizeFrontWorksUsersList(payload);
        sendFrontWorksDebugLog('front-works: users normalized', {
          url: url,
          count: normalized.length
        });
        return normalized;
      })
      .catch(function() {
        sendFrontWorksDebugLog('front-works: users fetch failed', { url: url });
        return [];
      });
  }

  function fetchTabelAdminsData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'tabel');
    var url = 'mainadmin.php?organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить администраторов табеля');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeTabelAdminsList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function fetchTabelUsersData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'tabel');
    var url = 'tabel.php?action=list&organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить пользователей табеля');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeTabelUsersList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function fetchAllTrackAdminsData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'alltrack');
    var url = 'mainadmin.php?organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить пользователей AllTrack');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeAllTrackAdminsList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function fetchZa9vkaAdminsData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'za9vka');
    var url = 'mainadmin.php?organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить администраторов заявки материалов');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeZa9vkaAdminsList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function fetchOhranaAdminsData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'ohrana');
    var url = 'mainadmin.php?organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить пользователей Охраны труда');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeOhranaAdminsList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function fetchZavodAdminsData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'zavod');
    var url = 'mainadmin.php?organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить пользователей Завода');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeZavodAdminsList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function fetchZa9vkaUsersData(orgName) {
    var organization = sanitizeOrganizationForFileName(orgName || 'za9vka');
    var url = 'za9vka.php?action=list&organization=' + encodeURIComponent(organization) + '&ts=' + Date.now();

    return fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function(response) {
        if (response.status === 404) {
          return [];
        }
        if (!response.ok) {
          throw new Error('Не удалось получить пользователей заявки материалов');
        }
        return response.json();
      })
      .then(function(payload) {
        return normalizeZa9vkaUsersList(payload);
      })
      .catch(function() {
        return [];
      });
  }

  function isPasswordValidForUser(storedPassword, passwordVariants, passwordHashes, bcrypt) {
    if (typeof storedPassword !== 'string' || storedPassword === '') {
      return false;
    }

    var variants = Array.isArray(passwordVariants) ? passwordVariants : [];
    var hashes = Array.isArray(passwordHashes) ? passwordHashes : [];

    for (var i = 0; i < variants.length; i += 1) {
      var candidate = variants[i] && typeof variants[i].value === 'string'
        ? variants[i].value
        : '';

      if (!candidate) {
        continue;
      }

      var candidateHash = hashes[i] || '';
      if (candidateHash && storedPassword === candidateHash) {
        return true;
      }

      if (isBcryptHash(storedPassword)) {
        if (!bcrypt) {
          continue;
        }

        try {
          if (bcrypt.compareSync(candidate, normalizeBcryptHashForCompare(storedPassword))) {
            return true;
          }
        } catch (compareError) {
          continue;
        }
      } else if (storedPassword === candidate) {
        return true;
      }
    }

    return false;
  }

  function findFrontWorksUser(users, loginValue, passwordVariants, passwordHashes, bcrypt, sourceLabel) {
    if (!Array.isArray(users) || !users.length) {
      return null;
    }

    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim().toLowerCase() : '';
    var foundLogin = false;

    for (var i = 0; i < users.length; i += 1) {
      var user = users[i];
      if (!user || typeof user.login !== 'string') {
        continue;
      }

      var userLogin = user.login.trim().toLowerCase();
      if (!userLogin || userLogin !== normalizedLogin) {
        continue;
      }

      foundLogin = true;
      if (isPasswordValidForUser(user.password, passwordVariants, passwordHashes, bcrypt)) {
        return user;
      }
    }

    if (foundLogin) {
      sendFrontWorksDebugLog('front-works: login matched but password invalid', {
        source: sourceLabel || 'unknown',
        login: normalizedLogin
      });
    }

    return null;
  }

  function validateFrontWorksCredentials(loginValue, passwordValue, organizationName) {
    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim() : '';
    if (!normalizedLogin || typeof passwordValue !== 'string' || !passwordValue) {
      return Promise.reject(new Error('Введите логин и пароль.'));
    }

    var organization = organizationName || detectedOrganization || '';
    var passwordVariants = generatePasswordVariants(passwordValue);

    sendFrontWorksDebugLog('front-works: start validation', {
      organization: organization,
      login: normalizedLogin.toLowerCase(),
      passwordLength: passwordValue.length
    });

    return Promise.all([
      fetchFrontWorksAdminsData(organization),
      fetchFrontWorksRegularUsers(organization),
      ensureBcrypt(),
      buildPasswordVariantHashes(passwordVariants)
    ]).then(function(results) {
      var admins = results[0];
      var users = results[1];
      var bcrypt = results[2];
      var passwordHashes = results[3];

      sendFrontWorksDebugLog('front-works: validation inputs ready', {
        adminsCount: Array.isArray(admins) ? admins.length : 0,
        usersCount: Array.isArray(users) ? users.length : 0,
        bcryptReady: Boolean(bcrypt)
      });

      var matchedAdmin = findFrontWorksUser(admins, normalizedLogin, passwordVariants, passwordHashes, bcrypt, 'admins');
      if (matchedAdmin) {
        sendFrontWorksDebugLog('front-works: admin matched', {
          login: matchedAdmin.login || normalizedLogin
        });
        return {
          isAdmin: true,
          login: matchedAdmin.login,
          name: matchedAdmin.name || ''
        };
      }

      var matchedUser = findFrontWorksUser(users, normalizedLogin, passwordVariants, passwordHashes, bcrypt, 'users');
      if (matchedUser) {
        sendFrontWorksDebugLog('front-works: user matched', {
          login: matchedUser.login || normalizedLogin
        });
        return {
          isAdmin: false,
          login: matchedUser.login,
          name: matchedUser.name || ''
        };
      }

      sendFrontWorksDebugLog('front-works: credentials rejected', {
        login: normalizedLogin.toLowerCase()
      });

      throw new Error('Неверный логин или пароль.');
    });
  }

  function validateTabelCredentials(loginValue, passwordValue, organizationName) {
    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim() : '';
    if (!normalizedLogin || typeof passwordValue !== 'string' || !passwordValue) {
      return Promise.reject(new Error('Введите логин и пароль.'));
    }

    var organization = organizationName || detectedOrganization || '';
    var passwordVariants = generatePasswordVariants(passwordValue);

    return Promise.all([
      fetchTabelAdminsData(organization),
      fetchTabelUsersData(organization),
      ensureBcrypt(),
      buildPasswordVariantHashes(passwordVariants)
    ]).then(function(results) {
      var admins = results[0];
      var users = results[1];
      var bcrypt = results[2];
      var passwordHashes = results[3];

      var matchedAdmin = findFrontWorksUser(admins, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
      if (matchedAdmin) {
        return {
          isAdmin: true,
          login: matchedAdmin.login,
          name: matchedAdmin.name || '',
          user: null
        };
      }

      var matchedUser = findFrontWorksUser(users, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
      if (matchedUser) {
        return {
          isAdmin: false,
          login: matchedUser.login,
          name: matchedUser.fio || matchedUser.name || '',
          user: {
            id: matchedUser.id || '',
            fio: matchedUser.fio || '',
            email: matchedUser.email || '',
            telegram: matchedUser.telegram || '',
            object_ids: Array.isArray(matchedUser.object_ids) ? matchedUser.object_ids.slice() : [],
            role: matchedUser.role || '',
            login: matchedUser.login || '',
            note: matchedUser.note || ''
          }
        };
      }

      throw new Error('Неверный логин или пароль.');
    });
  }

  function validateAllTrackCredentials(loginValue, passwordValue, organizationName) {
    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim() : '';
    if (!normalizedLogin || typeof passwordValue !== 'string' || !passwordValue) {
      return Promise.reject(new Error('Введите логин и пароль.'));
    }

    var organization = organizationName || detectedOrganization || '';
    var passwordVariants = generatePasswordVariants(passwordValue);

    return Promise.all([
      fetchAllTrackAdminsData(organization),
      ensureBcrypt(),
      buildPasswordVariantHashes(passwordVariants)
    ]).then(function(results) {
      var users = results[0];
      var bcrypt = results[1];
      var passwordHashes = results[2];

      var matchedUser = findFrontWorksUser(users, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
      if (matchedUser) {
        return {
          login: matchedUser.login,
          name: matchedUser.name || ''
        };
      }

      throw new Error('Неверный логин или пароль.');
    });
  }

  function validateOhranaCredentials(loginValue, passwordValue, organizationName) {
    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim() : '';
    if (!normalizedLogin || typeof passwordValue !== 'string' || !passwordValue) {
      return Promise.reject(new Error('Введите логин и пароль.'));
    }

    var organization = organizationName || detectedOrganization || '';

    return fetch('Ohrana.php?action=auth', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization: organization,
        login: normalizedLogin,
        password: passwordValue,
        ts: Date.now()
      })
    }).then(function(response) {
      return response.json().catch(function() {
        return null;
      }).then(function(payload) {
        if (!response.ok) {
          var message = payload && payload.error
            ? payload.error
            : (response.status >= 500
              ? 'Сервис проверки Охраны труда недоступен.'
              : 'Неверный логин или пароль.');
          throw new Error(message);
        }
        return payload;
      });
    }).then(function(payload) {
      if (!payload || payload.success !== true || !payload.user || !payload.user.login) {
        throw new Error(payload && payload.error ? payload.error : 'Неверный логин или пароль.');
      }

      return {
        login: payload.user.login,
        name: payload.user.name || ''
      };
    }).catch(function(error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }

      var passwordVariants = generatePasswordVariants(passwordValue);
      return Promise.all([
        fetchOhranaAdminsData(organization),
        ensureBcrypt(),
        buildPasswordVariantHashes(passwordVariants)
      ]).then(function(results) {
        var users = results[0];
        var bcrypt = results[1];
        var passwordHashes = results[2];
        var matchedUser = findFrontWorksUser(users, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
        if (matchedUser) {
          return {
            login: matchedUser.login,
            name: matchedUser.name || ''
          };
        }
        throw new Error('Неверный логин или пароль.');
      });
    });
  }

  function validateZavodCredentials(loginValue, passwordValue, organizationName) {
    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim() : '';
    if (!normalizedLogin || typeof passwordValue !== 'string' || !passwordValue) {
      return Promise.reject(new Error('Введите логин и пароль.'));
    }

    var organization = organizationName || detectedOrganization || '';

    return fetch('Zavod.php?action=auth', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization: organization,
        login: normalizedLogin,
        password: passwordValue,
        ts: Date.now()
      })
    }).then(function(response) {
      return response.json().catch(function() {
        return null;
      }).then(function(payload) {
        if (!response.ok) {
          var message = payload && payload.error
            ? payload.error
            : (response.status >= 500
              ? 'Сервис проверки Завода недоступен.'
              : 'Неверный логин или пароль.');
          throw new Error(message);
        }
        return payload;
      });
    }).then(function(payload) {
      if (!payload || payload.success !== true || !payload.user || !payload.user.login) {
        throw new Error(payload && payload.error ? payload.error : 'Неверный логин или пароль.');
      }

      return {
        login: payload.user.login,
        name: payload.user.name || ''
      };
    }).catch(function(error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }

      var passwordVariants = generatePasswordVariants(passwordValue);
      return Promise.all([
        fetchZavodAdminsData(organization),
        ensureBcrypt(),
        buildPasswordVariantHashes(passwordVariants)
      ]).then(function(results) {
        var users = results[0];
        var bcrypt = results[1];
        var passwordHashes = results[2];
        var matchedUser = findFrontWorksUser(users, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
        if (matchedUser) {
          return {
            login: matchedUser.login,
            name: matchedUser.name || ''
          };
        }
        throw new Error('Неверный логин или пароль.');
      });
    });
  }

  function validateZa9vkaCredentials(loginValue, passwordValue, organizationName) {
    var normalizedLogin = typeof loginValue === 'string' ? loginValue.trim() : '';
    if (!normalizedLogin || typeof passwordValue !== 'string' || !passwordValue) {
      return Promise.reject(new Error('Введите логин и пароль.'));
    }

    var organization = organizationName || detectedOrganization || '';
    var passwordVariants = generatePasswordVariants(passwordValue);

    return Promise.all([
      fetchZa9vkaAdminsData(organization),
      fetchZa9vkaUsersData(organization),
      ensureBcrypt(),
      buildPasswordVariantHashes(passwordVariants)
    ]).then(function(results) {
      var admins = results[0];
      var users = results[1];
      var bcrypt = results[2];
      var passwordHashes = results[3];

      var matchedAdmin = findFrontWorksUser(admins, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
      if (matchedAdmin) {
        return {
          isAdmin: true,
          login: matchedAdmin.login,
          name: matchedAdmin.name || '',
          user: null
        };
      }

      var matchedUser = findFrontWorksUser(users, normalizedLogin, passwordVariants, passwordHashes, bcrypt);
      if (matchedUser) {
        return {
          isAdmin: false,
          login: matchedUser.login,
          name: matchedUser.fio || matchedUser.name || '',
          user: {
            id: matchedUser.id || '',
            fio: matchedUser.fio || '',
            email: matchedUser.email || '',
            telegram: matchedUser.telegram || '',
            object_ids: Array.isArray(matchedUser.object_ids) ? matchedUser.object_ids.slice() : [],
            role: matchedUser.role || '',
            login: matchedUser.login || '',
            note: matchedUser.note || ''
          }
        };
      }

      throw new Error('Неверный логин или пароль.');
    });
  }

  function createDocumentsLoginModal() {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title';
    title.id = 'documents-login-title';
    title.textContent = 'Доступ к документообороту';

    var subtitle = document.createElement('p');
    subtitle.className = 'documents-login-modal__subtitle';
    subtitle.textContent = 'Укажите данные из блока «Администратор», чтобы открыть документы.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(subtitle);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'documents-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input';
    loginInput.placeholder = 'Например: admin';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'documents-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input';
    passwordInput.placeholder = 'Пароль из раздела';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error';
    errorNode.id = 'documents-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit';
    submitButton.textContent = 'Открыть';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'documents-login-title');
    dialog.setAttribute('aria-describedby', 'documents-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var isVisible = false;
    var lastFocusedElement = null;
    var allowedLogins = [];
    var allowAnyLogin = true;
    var pendingResolve = null;
    var isProcessing = false;

    function normalizeLogin(value) {
      return typeof value === 'string' ? value.trim().toLowerCase() : '';
    }

    function setLoading(active) {
      var shouldDisable = Boolean(active);
      loginInput.disabled = shouldDisable;
      passwordInput.disabled = shouldDisable;
      submitButton.disabled = shouldDisable;
    }

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function close(result) {
      var resolvedResult = result && typeof result === 'object'
        ? result
        : { success: false };

      var debugContext = {
        success: Boolean(resolvedResult.success),
        cancelled: Boolean(resolvedResult.cancelled),
        hasLogin: typeof resolvedResult.login === 'string' && resolvedResult.login.trim() !== '',
        allowAnyLogin: allowAnyLogin,
        allowedLoginsCount: allowedLogins.length
      };

      if (debugContext.hasLogin) {
        debugContext.login = resolvedResult.login;
      }

      if (resolvedResult.reason) {
        debugContext.reason = resolvedResult.reason;
      }

      if (!isVisible) {
        if (pendingResolve) {
          pendingResolve(resolvedResult);
          pendingResolve = null;
        }
        return;
      }

      logDocumentsDebug('documents_login_modal_close', debugContext);

      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      if (document.body) {
        document.body.classList.remove('documents-login-modal-open');
      }
      setError('');
      loginInput.value = '';
      passwordInput.value = '';
      setLoading(false);
      isProcessing = false;

      if (pendingResolve) {
        var resolver = pendingResolve;
        pendingResolve = null;
        resolver(resolvedResult);
      }

      if (!resolvedResult.success && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close({ success: false, cancelled: true });
      }
    }

    function open(credentials) {
      var currentOrganization = '';

      if (typeof detectOrganizationFromPage === 'function') {
        try {
          currentOrganization = detectOrganizationFromPage() || '';
        } catch (organizationError) {
          currentOrganization = '';
        }
      }

      allowedLogins = [];
      allowAnyLogin = true;

      if (credentials && typeof credentials === 'object') {
        var providedList = null;

        if (Array.isArray(credentials.allowedLogins)) {
          providedList = credentials.allowedLogins;
        } else if (typeof credentials.login === 'string' && typeof credentials.password === 'string') {
          providedList = [{ login: credentials.login, password: credentials.password }];
        }

        if (providedList && providedList.length) {
          var seenLogins = Object.create(null);
          allowedLogins = providedList.reduce(function(acc, entry) {
            if (!entry || typeof entry.login !== 'string') {
              return acc;
            }
            var loginValue = entry.login.trim();
            if (!loginValue || typeof entry.password !== 'string') {
              return acc;
            }
            var normalized = normalizeLogin(loginValue);
            if (normalized && !seenLogins[normalized]) {
              seenLogins[normalized] = true;
              acc.push({ login: loginValue, password: entry.password });
            }
            return acc;
          }, []);
        }

        if (typeof credentials.allowAnyLogin === 'boolean') {
          allowAnyLogin = credentials.allowAnyLogin;
        } else {
          allowAnyLogin = allowedLogins.length === 0;
        }
      }

      if (!allowedLogins.length && !allowAnyLogin) {
        allowAnyLogin = true;
      }

      if (isVisible) {
        return Promise.resolve({ success: false });
      }

      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('documents-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);

      setError('');
      loginInput.value = '';
      passwordInput.value = '';
      setLoading(false);
      isProcessing = false;

      logDocumentsDebug('documents_login_modal_open', {
        organization: currentOrganization || detectedOrganization || '',
        allowAnyLogin: allowAnyLogin,
        allowedLoginsCount: allowedLogins.length,
        credentialsProvided: Boolean(credentials && typeof credentials === 'object'),
        hasAllowedLogins: allowedLogins.length > 0
      });

      setTimeout(function() {
        try {
          loginInput.focus({ preventScroll: true });
        } catch (focusError) {
          loginInput.focus();
        }
      }, 50);

      return new Promise(function(resolve) {
        pendingResolve = resolve;
      });
    }

    function handleSubmit(event) {
      event.preventDefault();

      if (isProcessing) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      var normalizedLoginValue = normalizeLogin(loginValue);
      var hasAllowedLogins = allowedLogins.length > 0;

      logDocumentsDebug('documents_login_submit', {
        login: loginValue,
        hasPassword: passwordValue !== '',
        allowAnyLogin: allowAnyLogin,
        allowedLoginsCount: allowedLogins.length,
        hasAllowedLogins: hasAllowedLogins
      });

      if (!loginValue || !passwordValue) {
        logDocumentsDebug('documents_login_submit_validation_error', {
          login: loginValue,
          hasPassword: passwordValue !== '',
          reason: 'missing_fields',
          allowAnyLogin: allowAnyLogin,
          allowedLoginsCount: allowedLogins.length
        });
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      var matchedEntry = null;


      if (hasAllowedLogins) {
        for (var i = 0; i < allowedLogins.length; i += 1) {
          var candidate = allowedLogins[i];
          if (!candidate || typeof candidate.login !== 'string') {
            continue;
          }
          if (normalizeLogin(candidate.login) === normalizedLoginValue) {
            matchedEntry = candidate;
            break;
          }
        }

        if (!matchedEntry) {
          logDocumentsDebug('documents_login_submit_rejected', {
            login: loginValue,
            reason: 'login_not_allowed',
            allowAnyLogin: allowAnyLogin,
            allowedLoginsCount: allowedLogins.length
          });
          setError('Неверный логин или пароль.');
          passwordInput.value = '';
          try {
            passwordInput.focus({ preventScroll: true });
          } catch (focusError) {
            passwordInput.focus();
          }
          return;
        }

      }

      if (!hasAllowedLogins && allowAnyLogin) {
        logDocumentsDebug('documents_login_submit_pass_through', {
          login: loginValue,
          allowAnyLogin: allowAnyLogin,
          allowedLoginsCount: allowedLogins.length
        });
        close({ success: true, login: loginValue, password: passwordValue });
        return;
      }

      var expectedPassword = matchedEntry && typeof matchedEntry.password === 'string'
        ? matchedEntry.password
        : '';

      if (!expectedPassword) {
        logDocumentsDebug('documents_login_submit_no_expected_password', {
          login: loginValue,
          allowAnyLogin: allowAnyLogin,
          allowedLoginsCount: allowedLogins.length
        });
        close({ success: true, login: loginValue, password: passwordValue });
        return;
      }

      if (isBcryptHash(expectedPassword)) {
        isProcessing = true;
        setLoading(true);
        ensureBcrypt()
          .then(function(bcrypt) {
            var hashForCompare = normalizeBcryptHashForCompare(expectedPassword);
            if (!hashForCompare) {
              throw new Error('Некорректный формат сохранённого пароля.');
            }

            var variants = generatePasswordVariants(passwordValue);
            if (variants.length === 0) {
              variants.push({ label: 'original', value: passwordValue });
            }

            var matchedPassword = null;
            var matchedVariantLabel = '';

            for (var v = 0; v < variants.length; v += 1) {
              var variant = variants[v];
              try {
                if (bcrypt.compareSync(variant.value, hashForCompare)) {
                  matchedPassword = variant.value;
                  matchedVariantLabel = variant.label || '';
                  break;
                }
              } catch (compareError) {
                throw compareError;
              }
            }

            if (matchedPassword !== null) {
              logDocumentsDebug('documents_login_submit_verified', {
                login: loginValue,
                method: 'bcrypt',
                variant: matchedVariantLabel || 'original',
                allowAnyLogin: allowAnyLogin,
                allowedLoginsCount: allowedLogins.length
              });

              close({ success: true, login: loginValue, password: matchedPassword });
              return;
            }

            logDocumentsDebug('documents_login_submit_invalid_password', {
              login: loginValue,
              method: 'bcrypt',
              allowAnyLogin: allowAnyLogin,
              allowedLoginsCount: allowedLogins.length
            });
            setError('Неверный логин или пароль.');
            passwordInput.value = '';
            try {
              passwordInput.focus({ preventScroll: true });
            } catch (focusError) {
              passwordInput.focus();
            }
          })
          .catch(function(error) {
            logDocumentsDebug('documents_login_submit_error', {
              login: loginValue,
              method: 'bcrypt',
              message: error && error.message ? error.message : 'bcrypt_compare_failed',
              allowAnyLogin: allowAnyLogin,
              allowedLoginsCount: allowedLogins.length
            });
            setError('Не удалось проверить данные. Попробуйте позже.');
            passwordInput.value = '';
            try {
              passwordInput.focus({ preventScroll: true });
            } catch (focusError) {
              passwordInput.focus();
            }
          })
          .finally(function() {
            isProcessing = false;
            setLoading(false);
          });
        return;
      }

      var plainMatch = passwordValue === expectedPassword;
      var matchedVariant = '';
      if (!plainMatch) {
        var passwordVariants = generatePasswordVariants(passwordValue);
        for (var pv = 0; pv < passwordVariants.length; pv += 1) {
          if (passwordVariants[pv].value === expectedPassword) {
            plainMatch = true;
            passwordValue = passwordVariants[pv].value;
            matchedVariant = passwordVariants[pv].label || '';
            break;
          }
        }
      }

      if (plainMatch) {
        logDocumentsDebug('documents_login_submit_verified', {
          login: loginValue,
          method: 'plain',
          variant: matchedVariant || (passwordValue === expectedPassword ? 'original' : 'adjusted'),
          allowAnyLogin: allowAnyLogin,
          allowedLoginsCount: allowedLogins.length
        });
        close({ success: true, login: loginValue, password: passwordValue });
      } else {
        logDocumentsDebug('documents_login_submit_invalid_password', {
          login: loginValue,
          method: 'plain',
          allowAnyLogin: allowAnyLogin,
          allowedLoginsCount: allowedLogins.length
        });
        setError('Неверный логин или пароль.');
        passwordInput.value = '';
        try {
          passwordInput.focus({ preventScroll: true });
        } catch (focusError) {
          passwordInput.focus();
        }
      }
    }

    closeButton.addEventListener('click', function() {
      close({ success: false, cancelled: true });
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close({ success: false, cancelled: true });
      }
    });

    form.addEventListener('submit', handleSubmit);

    return {
      open: open,
      close: close,
      showError: setError
    };
  }

  function createTabelLoginModal(submitHandler) {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal tabel-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog tabel-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close tabel-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title tabel-login-modal__title';
    title.id = 'tabel-login-title';
    title.textContent = 'Вход в табель';

    var helper = document.createElement('p');
    helper.className = 'documents-login-modal__subtitle tabel-login-modal__subtitle';
    helper.textContent = 'Доступ выдаётся в разделе «Главная → Администратор», блок 4. Один вход — и карточка Табеля готова к работе.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header tabel-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon tabel-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⏱';

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading tabel-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(helper);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form tabel-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field tabel-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label tabel-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'tabel-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input tabel-login-modal__input';
    loginInput.placeholder = 'Например: master или user1';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field tabel-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label tabel-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'tabel-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input tabel-login-modal__input';
    passwordInput.placeholder = 'Минимум 4 символа';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error tabel-login-modal__error';
    errorNode.id = 'tabel-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions tabel-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit tabel-login-modal__submit';
    submitButton.textContent = 'Открыть табель';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'tabel-login-title');
    dialog.setAttribute('aria-describedby', 'tabel-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var pendingResolve = null;
    var pendingReject = null;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(result, rejected) {
      if (!isVisible) {
        return;
      }

      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('tabel-login-modal-open');
      }

      if (rejected && typeof pendingReject === 'function') {
        pendingReject(rejected instanceof Error ? rejected : new Error('Вход отменён'));
      } else if (typeof pendingResolve === 'function') {
        pendingResolve(result || { cancelled: true });
      }

      pendingResolve = null;
      pendingReject = null;

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null, new Error('Вход отменён'));
      }
    }

    function handleSubmit(event) {
      event.preventDefault();
      if (isLoading) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        return;
      }

      if (typeof submitHandler !== 'function') {
        setError('Проверка недоступна.');
        return;
      }

      setError('');
      setLoading(true);

      Promise.resolve(submitHandler({ login: loginValue, password: passwordValue }))
        .then(function(result) {
          if (!result || !result.success || !result.user) {
            setError('Неверный логин или пароль.');
            setLoading(false);
            return;
          }

          close(result, false);
        })
        .catch(function(error) {
          setError(error && error.message ? error.message : 'Не удалось проверить данные.');
          setLoading(false);
        });
    }

    function open() {
      if (isVisible) {
        return Promise.resolve({ success: false, cancelled: true });
      }

      isVisible = true;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      document.addEventListener('keydown', handleKeydown, true);
      if (document.body) {
        document.body.classList.add('tabel-login-modal-open');
      }
      lastFocusedElement = document.activeElement;
      setTimeout(function() {
        loginInput.focus();
      }, 50);

      return new Promise(function(resolve, reject) {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    }

    closeButton.addEventListener('click', function() {
      close();
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close();
      }
    });

    form.addEventListener('submit', handleSubmit);

    loginInput.addEventListener('input', function() {
      if (errorNode.classList.contains('is-visible')) {
        setError('');
      }
    });

    passwordInput.addEventListener('input', function() {
      if (errorNode.classList.contains('is-visible')) {
        setError('');
      }
    });

    return {
      open: open,
      close: close,
      showError: setError
    };
  }

  function createFrontWorksLoginModal(submitHandler) {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal frontworks-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog frontworks-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close frontworks-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title frontworks-login-modal__title';
    title.id = 'frontworks-login-title';
    title.textContent = 'Доступ к Фронту работ';

    var subtitle = document.createElement('p');
    subtitle.className = 'documents-login-modal__subtitle frontworks-login-modal__subtitle';
    subtitle.textContent = 'Введите логин и пароль администратора из файла «users.json» или сотрудника из файла «FRbaza/Организация/FRuser.json».';

    var helper = document.createElement('p');
    helper.className = 'documents-login-modal__subtitle frontworks-login-modal__subtitle';
    helper.textContent = 'При совпадении данных откроется карточка Фронта работ без лишних шагов.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header frontworks-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon frontworks-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚒';

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading frontworks-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(subtitle);
    heading.appendChild(helper);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form frontworks-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field frontworks-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label frontworks-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'frontworks-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input frontworks-login-modal__input';
    loginInput.placeholder = 'Например: admin или master';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field frontworks-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label frontworks-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'frontworks-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input frontworks-login-modal__input';
    passwordInput.placeholder = 'Минимум 4 символа';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error frontworks-login-modal__error';
    errorNode.id = 'frontworks-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions frontworks-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit frontworks-login-modal__submit';
    submitButton.textContent = 'Открыть фронт работ';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'frontworks-login-title');
    dialog.setAttribute('aria-describedby', 'frontworks-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var pendingResolve = null;
    var pendingReject = null;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(result, rejected) {
      if (!isVisible) {
        return;
      }

      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('frontworks-login-modal-open');
      }

      if (rejected && typeof pendingReject === 'function') {
        pendingReject(rejected instanceof Error ? rejected : new Error('Вход отменён'));
      } else if (typeof pendingResolve === 'function') {
        pendingResolve(result || { cancelled: true });
      }

      pendingResolve = null;
      pendingReject = null;

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null, new Error('Вход отменён'));
      }
    }

    function handleSubmit(event) {
      event.preventDefault();

      if (isLoading) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      setError('');
      setLoading(true);

      var handler = typeof submitHandler === 'function'
        ? submitHandler
        : function() { return Promise.reject(new Error('Авторизация недоступна.')); };

      Promise.resolve()
        .then(function() {
          return handler({ login: loginValue, password: passwordValue });
        })
        .then(function(result) {
          setError('');
          close(result, null);
        })
        .catch(function(error) {
          setError(error && error.message ? error.message : 'Не удалось проверить данные.');
          passwordInput.value = '';
          try {
            passwordInput.focus({ preventScroll: true });
          } catch (focusError) {
            passwordInput.focus();
          }
        })
        .finally(function() {
          setLoading(false);
        });
    }

    function open() {
      if (isVisible) {
        return Promise.resolve({ cancelled: false });
      }

      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('frontworks-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);

      setError('');
      setLoading(false);
      loginInput.value = '';
      passwordInput.value = '';

      setTimeout(function() {
        try {
          loginInput.focus({ preventScroll: true });
        } catch (focusError) {
          loginInput.focus();
        }
      }, 40);

      return new Promise(function(resolve, reject) {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    }

    closeButton.addEventListener('click', function() {
      close(null, new Error('Вход отменён'));
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close(null, new Error('Вход отменён'));
      }
    });

    form.addEventListener('submit', handleSubmit);

    return {
      open: open,
      close: close,
      showError: setError
    };
  }

  function createAllTrackLoginModal(submitHandler) {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal alltrack-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog alltrack-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close alltrack-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title alltrack-login-modal__title';
    title.id = 'alltrack-login-title';
    title.textContent = 'Доступ к AllTrack';

    var subtitle = document.createElement('p');
    subtitle.className = 'documents-login-modal__subtitle alltrack-login-modal__subtitle';
    subtitle.textContent = 'Введите логин и пароль ответственного из блока 5 в файле «Организация.mainadmin.json» (папка lg).';

    var helper = document.createElement('p');
    helper.className = 'documents-login-modal__subtitle alltrack-login-modal__subtitle';
    helper.textContent = 'После проверки откроется полноэкранная страница AllTrack.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header alltrack-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon alltrack-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🧰';

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading alltrack-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(subtitle);
    heading.appendChild(helper);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form alltrack-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field alltrack-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label alltrack-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'alltrack-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input alltrack-login-modal__input';
    loginInput.placeholder = 'Например: master';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field alltrack-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label alltrack-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'alltrack-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input alltrack-login-modal__input';
    passwordInput.placeholder = 'Минимум 4 символа';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error alltrack-login-modal__error';
    errorNode.id = 'alltrack-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions alltrack-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit alltrack-login-modal__submit';
    submitButton.textContent = 'Открыть AllTrack';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'alltrack-login-title');
    dialog.setAttribute('aria-describedby', 'alltrack-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var pendingResolve = null;
    var pendingReject = null;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(result, rejected) {
      if (!isVisible) {
        return;
      }

      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('alltrack-login-modal-open');
      }

      if (rejected && typeof pendingReject === 'function') {
        pendingReject(rejected instanceof Error ? rejected : new Error('Вход отменён'));
      } else if (typeof pendingResolve === 'function') {
        pendingResolve(result || { cancelled: true });
      }

      pendingResolve = null;
      pendingReject = null;

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null, new Error('Вход отменён'));
      }
    }

    function handleSubmit(event) {
      event.preventDefault();

      if (isLoading) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      setError('');
      setLoading(true);

      var handler = typeof submitHandler === 'function'
        ? submitHandler
        : function() { return Promise.reject(new Error('Авторизация недоступна.')); };

      Promise.resolve()
        .then(function() {
          return handler({ login: loginValue, password: passwordValue });
        })
        .then(function(result) {
          setError('');
          close(result, null);
        })
        .catch(function(error) {
          setError(error && error.message ? error.message : 'Не удалось проверить данные.');
          passwordInput.value = '';
          try {
            passwordInput.focus({ preventScroll: true });
          } catch (focusError) {
            passwordInput.focus();
          }
        })
        .finally(function() {
          setLoading(false);
        });
    }

    function open() {
      if (isVisible) {
        return Promise.resolve({ cancelled: false });
      }

      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('alltrack-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);

      setError('');
      setLoading(false);
      loginInput.value = '';
      passwordInput.value = '';

      setTimeout(function() {
        try {
          loginInput.focus({ preventScroll: true });
        } catch (focusError) {
          loginInput.focus();
        }
      }, 40);

      return new Promise(function(resolve, reject) {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    }

    closeButton.addEventListener('click', function() {
      close(null, new Error('Вход отменён'));
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close(null, new Error('Вход отменён'));
      }
    });

    form.addEventListener('submit', handleSubmit);

    return {
      open: open,
      close: close,
      showError: setError
    };
  }

  function createOhranaLoginModal(submitHandler) {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal ohrana-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog ohrana-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close ohrana-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title ohrana-login-modal__title';
    title.id = 'ohrana-login-title';
    title.textContent = 'Доступ к Охране труда';

    var subtitle = document.createElement('p');
    subtitle.className = 'documents-login-modal__subtitle ohrana-login-modal__subtitle';
    subtitle.textContent = 'Введите логин и пароль из блока «Блок 8. Охрана труда».';

    var helper = document.createElement('p');
    helper.className = 'documents-login-modal__subtitle ohrana-login-modal__subtitle';
    helper.textContent = 'После успешного входа откроется рабочее окно Охраны труда.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header ohrana-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon ohrana-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🦺';

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading ohrana-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(subtitle);
    heading.appendChild(helper);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form ohrana-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field ohrana-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label ohrana-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'ohrana-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input ohrana-login-modal__input';
    loginInput.placeholder = 'Например: master';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field ohrana-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label ohrana-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'ohrana-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input ohrana-login-modal__input';
    passwordInput.placeholder = 'Введите пароль';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error ohrana-login-modal__error';
    errorNode.id = 'ohrana-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions ohrana-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit ohrana-login-modal__submit';
    submitButton.textContent = 'Открыть Охрану труда';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'ohrana-login-title');
    dialog.setAttribute('aria-describedby', 'ohrana-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var pendingResolve = null;
    var pendingReject = null;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(result, rejected) {
      if (!isVisible) {
        return;
      }

      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('ohrana-login-modal-open');
      }

      if (rejected && typeof pendingReject === 'function') {
        pendingReject(rejected instanceof Error ? rejected : new Error('Вход отменён'));
      } else if (typeof pendingResolve === 'function') {
        pendingResolve(result || { cancelled: true });
      }

      pendingResolve = null;
      pendingReject = null;

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null, new Error('Вход отменён'));
      }
    }

    function handleSubmit(event) {
      event.preventDefault();

      if (isLoading) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      setError('');
      setLoading(true);

      var handler = typeof submitHandler === 'function'
        ? submitHandler
        : function() { return Promise.reject(new Error('Авторизация недоступна.')); };

      Promise.resolve()
        .then(function() {
          return handler({ login: loginValue, password: passwordValue });
        })
        .then(function(result) {
          setError('');
          close(result, null);
        })
        .catch(function(error) {
          setError(error && error.message ? error.message : 'Не удалось проверить данные.');
          passwordInput.value = '';
          try {
            passwordInput.focus({ preventScroll: true });
          } catch (focusError) {
            passwordInput.focus();
          }
        })
        .finally(function() {
          setLoading(false);
        });
    }

    function open() {
      if (isVisible) {
        return Promise.resolve({ cancelled: false });
      }

      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('ohrana-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);

      setError('');
      setLoading(false);
      loginInput.value = '';
      passwordInput.value = '';

      setTimeout(function() {
        try {
          loginInput.focus({ preventScroll: true });
        } catch (focusError) {
          loginInput.focus();
        }
      }, 40);

      return new Promise(function(resolve, reject) {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    }

    closeButton.addEventListener('click', function() {
      close(null, new Error('Вход отменён'));
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close(null, new Error('Вход отменён'));
      }
    });

    form.addEventListener('submit', handleSubmit);

    return {
      open: open,
      close: close,
      showError: setError
    };
  }

  function createZavodLoginModal(submitHandler) {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal ohrana-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog ohrana-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close ohrana-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title ohrana-login-modal__title';
    title.id = 'zavod-login-title';
    title.textContent = 'Доступ к Заводу';

    var subtitle = document.createElement('p');
    subtitle.className = 'documents-login-modal__subtitle ohrana-login-modal__subtitle';
    subtitle.textContent = 'Введите логин и пароль из блока «Блок 9. Завод».';

    var helper = document.createElement('p');
    helper.className = 'documents-login-modal__subtitle ohrana-login-modal__subtitle';
    helper.textContent = 'После успешного входа откроется рабочее окно Завода.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header ohrana-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon ohrana-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🏭';

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading ohrana-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(subtitle);
    heading.appendChild(helper);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form ohrana-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field ohrana-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label ohrana-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'zavod-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input ohrana-login-modal__input';
    loginInput.placeholder = 'Например: zavod';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field ohrana-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label ohrana-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'zavod-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input ohrana-login-modal__input';
    passwordInput.placeholder = 'Введите пароль';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error ohrana-login-modal__error';
    errorNode.id = 'zavod-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions ohrana-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit ohrana-login-modal__submit';
    submitButton.textContent = 'Открыть Завод';

    actions.appendChild(submitButton);
    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'zavod-login-title');
    dialog.setAttribute('aria-describedby', 'zavod-login-error');
    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var pendingResolve = null;
    var pendingReject = null;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(result, rejected) {
      if (!isVisible) {
        return;
      }
      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('zavod-login-modal-open');
      }
      if (rejected && typeof pendingReject === 'function') {
        pendingReject(rejected instanceof Error ? rejected : new Error('Вход отменён'));
      } else if (typeof pendingResolve === 'function') {
        pendingResolve(result || { cancelled: true });
      }
      pendingResolve = null;
      pendingReject = null;

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null, new Error('Вход отменён'));
      }
    }

    function handleSubmit(event) {
      event.preventDefault();
      if (isLoading) {
        return;
      }
      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;
      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      setError('');
      setLoading(true);
      var handler = typeof submitHandler === 'function'
        ? submitHandler
        : function() { return Promise.reject(new Error('Авторизация недоступна.')); };

      Promise.resolve()
        .then(function() {
          return handler({ login: loginValue, password: passwordValue });
        })
        .then(function(result) {
          close(result, null);
        })
        .catch(function(error) {
          setError(error && error.message ? error.message : 'Не удалось проверить данные.');
          passwordInput.value = '';
          passwordInput.focus();
        })
        .finally(function() {
          setLoading(false);
        });
    }

    function open() {
      if (isVisible) {
        return Promise.resolve({ cancelled: false });
      }

      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('zavod-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);
      setError('');
      setLoading(false);
      loginInput.value = '';
      passwordInput.value = '';
      setTimeout(function() { loginInput.focus(); }, 40);

      return new Promise(function(resolve, reject) {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    }

    closeButton.addEventListener('click', function() {
      close(null, new Error('Вход отменён'));
    });
    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close(null, new Error('Вход отменён'));
      }
    });
    form.addEventListener('submit', handleSubmit);

    return { open: open, close: close, showError: setError };
  }

  function createZa9vkaLoginModal(submitHandler) {
    var overlay = document.createElement('div');
    overlay.className = 'documents-login-modal za9vka-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'documents-login-modal__dialog za9vka-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'documents-login-modal__close za9vka-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно входа');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'documents-login-modal__title za9vka-login-modal__title';
    title.id = 'za9vka-login-title';
    title.textContent = 'Доступ к заявке материалов';

    var subtitle = document.createElement('p');
    subtitle.className = 'documents-login-modal__subtitle za9vka-login-modal__subtitle';
    subtitle.textContent = 'Введите логин и пароль администратора из файла «Организация.mainadmin.json» или сотрудника из файла «Организация.za9vka.json» в папке lg.';

    var helper = document.createElement('p');
    helper.className = 'documents-login-modal__subtitle za9vka-login-modal__subtitle';
    helper.textContent = 'Доступ выдаётся в разделе «Главная → Администратор», блок 7. После входа откроется модуль заявки материалов.';

    var header = document.createElement('div');
    header.className = 'documents-login-modal__header za9vka-login-modal__header';

    var icon = document.createElement('span');
    icon.className = 'documents-login-modal__icon za9vka-login-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📦';

    var heading = document.createElement('div');
    heading.className = 'documents-login-modal__heading za9vka-login-modal__heading';
    heading.appendChild(title);
    heading.appendChild(subtitle);
    heading.appendChild(helper);

    header.appendChild(icon);
    header.appendChild(heading);

    var form = document.createElement('form');
    form.className = 'documents-login-modal__form za9vka-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'documents-login-modal__field za9vka-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'documents-login-modal__label za9vka-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'za9vka-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'documents-login-modal__input za9vka-login-modal__input';
    loginInput.placeholder = 'Например: manager';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'documents-login-modal__field za9vka-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'documents-login-modal__label za9vka-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'za9vka-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'documents-login-modal__input za9vka-login-modal__input';
    passwordInput.placeholder = 'Минимум 4 символа';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'documents-login-modal__error za9vka-login-modal__error';
    errorNode.id = 'za9vka-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'documents-login-modal__actions za9vka-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'documents-login-modal__submit za9vka-login-modal__submit';
    submitButton.textContent = 'Открыть заявку материалов';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'za9vka-login-title');
    dialog.setAttribute('aria-describedby', 'za9vka-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var pendingResolve = null;
    var pendingReject = null;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(result, rejected) {
      if (!isVisible) {
        return;
      }

      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('za9vka-login-modal-open');
      }

      if (rejected && typeof pendingReject === 'function') {
        pendingReject(rejected instanceof Error ? rejected : new Error('Вход отменён'));
      } else if (typeof pendingResolve === 'function') {
        pendingResolve(result || { cancelled: true });
      }

      pendingResolve = null;
      pendingReject = null;

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
          lastFocusedElement.focus({ preventScroll: true });
        } catch (focusError) {
          lastFocusedElement.focus();
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null, new Error('Вход отменён'));
      }
    }

    function handleSubmit(event) {
      event.preventDefault();

      if (isLoading) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      setError('');
      setLoading(true);

      var handler = typeof submitHandler === 'function'
        ? submitHandler
        : function() { return Promise.reject(new Error('Авторизация недоступна.')); };

      Promise.resolve()
        .then(function() {
          return handler({ login: loginValue, password: passwordValue });
        })
        .then(function(result) {
          setError('');
          close(result, null);
        })
        .catch(function(error) {
          setError(error && error.message ? error.message : 'Не удалось проверить данные.');
          passwordInput.value = '';
          try {
            passwordInput.focus({ preventScroll: true });
          } catch (focusError) {
            passwordInput.focus();
          }
        })
        .finally(function() {
          setLoading(false);
        });
    }

    function open() {
      if (isVisible) {
        return Promise.resolve({ cancelled: false });
      }

      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('za9vka-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);

      setError('');
      setLoading(false);
      loginInput.value = '';
      passwordInput.value = '';

      setTimeout(function() {
        try {
          loginInput.focus({ preventScroll: true });
        } catch (focusError) {
          loginInput.focus();
        }
      }, 40);

      return new Promise(function(resolve, reject) {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    }

    closeButton.addEventListener('click', function() {
      close(null, new Error('Вход отменён'));
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close(null, new Error('Вход отменён'));
      }
    });

    form.addEventListener('submit', handleSubmit);

    return {
      open: open,
      close: close,
      showError: setError
    };
  }

  function createAdminAccessManager(triggerButton) {
    var overlay = document.createElement('div');
    overlay.className = 'admin-login-modal';
    overlay.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'admin-login-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'admin-login-modal__close';
    closeButton.setAttribute('aria-label', 'Закрыть окно авторизации');
    closeButton.innerHTML = '&times;';

    var title = document.createElement('h2');
    title.className = 'admin-login-modal__title';
    title.id = 'admin-login-title';
    title.textContent = 'Доступ администратора';

    var subtitle = document.createElement('p');
    subtitle.className = 'admin-login-modal__subtitle';
    subtitle.textContent = 'Введите логин и пароль для перехода в администрирование.';

    var form = document.createElement('form');
    form.className = 'admin-login-modal__form';
    form.setAttribute('novalidate', 'novalidate');

    var loginField = document.createElement('label');
    loginField.className = 'admin-login-modal__field';

    var loginCaption = document.createElement('span');
    loginCaption.className = 'admin-login-modal__label';
    loginCaption.textContent = 'Логин';

    var loginInput = document.createElement('input');
    loginInput.type = 'text';
    loginInput.name = 'admin-login';
    loginInput.autocomplete = 'username';
    loginInput.required = true;
    loginInput.className = 'admin-login-modal__input';

    loginField.appendChild(loginCaption);
    loginField.appendChild(loginInput);

    var passwordField = document.createElement('label');
    passwordField.className = 'admin-login-modal__field';

    var passwordCaption = document.createElement('span');
    passwordCaption.className = 'admin-login-modal__label';
    passwordCaption.textContent = 'Пароль';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'admin-password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.required = true;
    passwordInput.className = 'admin-login-modal__input';

    passwordField.appendChild(passwordCaption);
    passwordField.appendChild(passwordInput);

    var errorNode = document.createElement('div');
    errorNode.className = 'admin-login-modal__error';
    errorNode.id = 'admin-login-error';
    errorNode.setAttribute('role', 'alert');

    var actions = document.createElement('div');
    actions.className = 'admin-login-modal__actions';

    var submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'admin-login-modal__submit';
    submitButton.textContent = 'Войти';

    actions.appendChild(submitButton);

    form.appendChild(loginField);
    form.appendChild(passwordField);
    form.appendChild(errorNode);
    form.appendChild(actions);

    dialog.setAttribute('aria-labelledby', 'admin-login-title');
    dialog.setAttribute('aria-describedby', 'admin-login-error');

    dialog.appendChild(closeButton);
    dialog.appendChild(title);
    dialog.appendChild(subtitle);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    var submitDefaultText = submitButton.textContent;
    var isVisible = false;
    var isLoading = false;
    var lastFocusedElement = null;

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.classList.toggle('is-visible', !!message);
    }

    function setLoading(loading) {
      isLoading = !!loading;
      loginInput.disabled = isLoading;
      passwordInput.disabled = isLoading;
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Проверяем…' : submitDefaultText;
    }

    function close(options) {
      if (!isVisible) {
        return;
      }
      isVisible = false;
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown, true);
      setLoading(false);
      setError('');
      form.reset();
      if (document.body) {
        document.body.classList.remove('admin-login-modal-open');
      }

      var shouldRestoreFocus = !options || options.restoreFocus !== false;
      if (shouldRestoreFocus) {
        var focusTarget = triggerButton || lastFocusedElement;
        if (focusTarget && typeof focusTarget.focus === 'function') {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch (focusError) {
            focusTarget.focus();
          }
        }
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }

    function open() {
      if (isVisible) {
        return;
      }
      isVisible = true;
      lastFocusedElement = document.activeElement;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      if (document.body) {
        document.body.classList.add('admin-login-modal-open');
      }
      document.addEventListener('keydown', handleKeydown, true);

      setTimeout(function() {
        try {
          loginInput.focus({ preventScroll: true });
        } catch (focusError) {
          loginInput.focus();
        }
      }, 50);
    }

    function handleSubmit(event) {
      event.preventDefault();
      if (isLoading) {
        return;
      }

      var loginValue = loginInput.value.trim();
      var passwordValue = passwordInput.value;

      if (!loginValue || !passwordValue) {
        setError('Введите логин и пароль.');
        if (!loginValue) {
          loginInput.focus();
        } else {
          passwordInput.focus();
        }
        return;
      }

      setError('');
      setLoading(true);

      var redirected = false;

      Promise.all([fetchAdminUsers(), ensureBcrypt()])
        .then(function(results) {
          var users = results[0];
          var bcrypt = results[1];

          var normalizedLogin = loginValue.toLowerCase();
          var matchedUser = null;

          for (var i = 0; i < users.length; i += 1) {
            var candidate = users[i];
            if (!candidate || typeof candidate.login !== 'string') {
              continue;
            }
            if (candidate.login.trim().toLowerCase() === normalizedLogin) {
              matchedUser = candidate;
              break;
            }
          }

          if (!matchedUser || typeof matchedUser.password !== 'string' || matchedUser.password.trim() === '') {
            setError('Неверный логин или пароль.');
            passwordInput.value = '';
            passwordInput.focus();
            return;
          }

          var storedPassword = matchedUser.password;
          var useBcrypt = isBcryptHash(storedPassword);
          var isValid = false;
          try {
            if (useBcrypt) {
              var adminHash = normalizeBcryptHashForCompare(storedPassword);
              if (!adminHash) {
                throw new Error('Некорректный формат сохранённого пароля.');
              }
              isValid = bcrypt.compareSync(passwordValue, adminHash);
            } else {
              isValid = passwordValue === storedPassword;
            }
          } catch (compareError) {
            setError('Не удалось проверить данные. Попробуйте позже.');
            passwordInput.value = '';
            passwordInput.focus();
            return;
          }

          if (!isValid) {
            setError('Неверный логин или пароль.');
            passwordInput.value = '';
            passwordInput.focus();
            return;
          }

          setAdminAccessState(true, {
            login: typeof matchedUser.login === 'string' ? matchedUser.login : loginValue,
            name: typeof matchedUser.name === 'string' ? matchedUser.name : ''
          });

          var redirectTarget = matchedUser.redirect_page || matchedUser.page || '';
          redirectTarget = redirectTarget.trim();

          close({ restoreFocus: false });

          if (redirectTarget) {
            var normalizedTarget = normalizePagePath(redirectTarget);
            var normalizedCurrent = normalizePagePath(window.location.pathname);
            if (normalizedTarget && normalizedTarget !== normalizedCurrent) {
              redirected = true;
              window.location.href = redirectTarget;
              return;
            }
          }

          setTimeout(function() {
            if (window.startAdminInterface && typeof window.startAdminInterface.open === 'function') {
              window.startAdminInterface.open();
            }
          }, 0);
        })
        .catch(function(error) {
          setError('Не удалось проверить данные. Попробуйте позже.');
        })
        .finally(function() {
          if (!redirected) {
            setLoading(false);
          }
        });
    }

    closeButton.addEventListener('click', function() {
      close();
    });

    overlay.addEventListener('mousedown', function(event) {
      if (event.target === overlay) {
        close();
      }
    });

    form.addEventListener('submit', handleSubmit);
    loginInput.addEventListener('input', function() {
      if (errorNode.classList.contains('is-visible')) {
        setError('');
      }
    });
    passwordInput.addEventListener('input', function() {
      if (errorNode.classList.contains('is-visible')) {
        setError('');
      }
    });

    return {
      open: open,
      close: close,
      showError: setError
    };
  }


  var BIMMAX_MAIN_NEWS_ENDPOINT = 'ssanews.php';
  var BIMMAX_MAIN_NEWS_STYLE_ID = 'bimmax-main-news-style';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureMainNewsStyles() {
    if (document.getElementById(BIMMAX_MAIN_NEWS_STYLE_ID)) {
      return;
    }

    var style = document.createElement('style');
    style.id = BIMMAX_MAIN_NEWS_STYLE_ID;
    style.textContent = ""
      + ".bimmax-main-news-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(241,245,249,.72);backdrop-filter:blur(10px);}"
      + ".bimmax-main-news-modal[hidden]{display:none!important;}"
      + ".bimmax-main-news-modal__panel{position:relative;width:min(920px,100%);max-height:min(88vh,920px);overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;gap:12px;padding:16px;border-radius:24px;border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.88);box-shadow:0 24px 60px rgba(15,23,42,.18);backdrop-filter:blur(18px);}"
      + ".bimmax-main-news-modal__hero{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 56px 18px 16px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.98),rgba(239,246,255,.95));border:1px solid rgba(191,219,254,.9);}"
      + ".bimmax-main-news-modal__hero-main{display:grid;gap:8px;}"
      + ".bimmax-main-news-modal__eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8;}"
      + ".bimmax-main-news-modal__eyebrow::before{content:'●';font-size:10px;color:#22c55e;}"
      + ".bimmax-main-news-modal__title{margin:0;font-size:clamp(28px,4vw,40px);line-height:1.05;color:#0f172a;}"
      + ".bimmax-main-news-modal__badge{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:14px;background:rgba(37,99,235,.08);color:#1d4ed8;font-size:12px;font-weight:700;text-align:center;min-width:120px;}"
      + ".bimmax-main-news-modal__tools{position:absolute;top:14px;right:60px;display:flex;align-items:center;gap:8px;}"
      + ".bimmax-main-news-modal__pdf{display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid rgba(148,163,184,.32);border-radius:12px;background:rgba(255,255,255,.95);color:#0f172a;font-size:13px;font-weight:700;line-height:1;cursor:pointer;box-shadow:0 10px 24px rgba(15,23,42,.08);transition:.2s ease;}"
      + ".bimmax-main-news-modal__pdf::before{content:'📄';font-size:14px;}"
      + ".bimmax-main-news-modal__pdf:hover{transform:translateY(-1px);background:#fff;border-color:rgba(59,130,246,.45);}"
      + ".bimmax-main-news-modal__pdf:disabled{opacity:.6;cursor:not-allowed;transform:none;}"
      + ".bimmax-main-news-modal__close{position:absolute;top:14px;right:14px;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid rgba(148,163,184,.35);border-radius:12px;background:rgba(255,255,255,.92);color:#334155;font-size:20px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(15,23,42,.08);transition:.2s ease;}"
      + ".bimmax-main-news-modal__close:hover{transform:translateY(-1px);background:#fff;color:#0f172a;}"
      + ".bimmax-main-news-modal__content{min-height:0;overflow:auto;padding-right:4px;display:grid;gap:12px;}"
      + ".bimmax-main-news-modal__media{padding:12px;border-radius:20px;background:rgba(248,250,252,.9);border:1px solid rgba(203,213,225,.75);display:grid;gap:10px;}"
      + ".bimmax-main-news-modal__viewer{display:flex;align-items:center;justify-content:center;min-height:min(42vh,420px);border-radius:16px;background:#fff;overflow:hidden;}"
      + ".bimmax-main-news-modal__viewer img,.bimmax-main-news-modal__viewer video,.bimmax-main-news-modal__viewer iframe{display:block;width:100%;height:min(62vh,540px);border:0;background:#fff;object-fit:contain;}"
      + ".bimmax-main-news-modal__files{display:grid;gap:8px;}"
      + ".bimmax-main-news-modal__file{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(191,219,254,.9);background:rgba(255,255,255,.96);cursor:pointer;transition:.2s ease;}"
      + ".bimmax-main-news-modal__file.is-active{border-color:#2563eb;background:rgba(239,246,255,.98);box-shadow:0 10px 20px rgba(37,99,235,.12);}"
      + ".bimmax-main-news-modal__file-name{font-size:14px;font-weight:600;color:#0f172a;overflow-wrap:anywhere;}"
      + ".bimmax-main-news-modal__file-order{font-size:12px;color:#64748b;white-space:nowrap;}"
      + ".bimmax-main-news-modal__text{position:sticky;top:0;z-index:2;padding:14px 16px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(248,250,252,.97));border:1px solid rgba(203,213,225,.82);color:#1e293b;line-height:1.55;overflow-wrap:anywhere;box-shadow:0 10px 24px rgba(148,163,184,.12);}"
      + ".bimmax-main-news-modal__status{margin:0;text-align:center;color:#475569;font-size:13px;}"
      + ".bimmax-main-news-modal__actions{display:flex;justify-content:center;}"
      + "@keyframes bimmaxMainNewsAckPulse{0%{transform:scale(1);box-shadow:0 18px 34px rgba(220,38,38,.34);}50%{transform:scale(1.05);box-shadow:0 24px 44px rgba(220,38,38,.52);}100%{transform:scale(1);box-shadow:0 18px 34px rgba(220,38,38,.34);}}"
      + ".bimmax-main-news-modal__ack{min-width:min(100%,320px);padding:14px 18px;border:0;border-radius:16px;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-size:15px;font-weight:800;box-shadow:0 18px 34px rgba(220,38,38,.34);cursor:pointer;transition:.2s ease;animation:bimmaxMainNewsAckPulse 1.7s ease-in-out infinite;}"
      + ".bimmax-main-news-modal__ack:hover{transform:translateY(-1px) scale(1.02);box-shadow:0 22px 40px rgba(220,38,38,.42);}"
      + ".bimmax-main-news-modal__ack:disabled{opacity:.6;cursor:not-allowed;transform:none;box-shadow:none;animation:none;}"
      + ".bimmax-main-news-note{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483001;width:min(92vw,460px);padding:14px 16px;border-radius:18px;background:rgba(15,23,42,.92);color:#fff;box-shadow:0 18px 40px rgba(15,23,42,.24);backdrop-filter:blur(12px);}"
      + ".bimmax-main-news-note[hidden]{display:none!important;}"
      + ".bimmax-main-news-note__title{margin:0 0 6px;font-size:15px;font-weight:700;}"
      + ".bimmax-main-news-note__text{margin:0;font-size:13px;line-height:1.45;color:rgba(255,255,255,.86);}"
      + "@media (max-width: 768px){.bimmax-main-news-modal{padding:10px;align-items:flex-end;}.bimmax-main-news-modal__panel{width:100%;max-height:92vh;padding:12px;border-radius:22px 22px 0 0;}.bimmax-main-news-modal__hero{flex-direction:column;padding:18px 52px 16px 14px;}.bimmax-main-news-modal__hero-main{gap:6px;}.bimmax-main-news-modal__eyebrow{font-size:12px;}.bimmax-main-news-modal__title{font-size:clamp(22px,7vw,30px);}.bimmax-main-news-modal__tools{position:static;right:auto;top:auto;width:100%;justify-content:flex-start;}.bimmax-main-news-modal__pdf{width:100%;justify-content:center;padding:11px 12px;}.bimmax-main-news-modal__close{top:12px;right:12px;width:36px;height:36px;}.bimmax-main-news-modal__viewer{min-height:220px;}.bimmax-main-news-modal__viewer img,.bimmax-main-news-modal__viewer video,.bimmax-main-news-modal__viewer iframe{height:min(46vh,320px);}.bimmax-main-news-modal__text{top:0;}.bimmax-main-news-modal__ack{width:min(100%,100%);}}";
    document.head.appendChild(style);
  }

  function sanitizeMainNewsHtml(html) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = String(html || '');
    Array.prototype.slice.call(wrapper.querySelectorAll('script,style,iframe')).forEach(function(node) {
      node.parentNode.removeChild(node);
    });
    Array.prototype.slice.call(wrapper.querySelectorAll('*')).forEach(function(node) {
      Array.prototype.slice.call(node.attributes).forEach(function(attr) {
        if (/^on/i.test(attr.name)) {
          node.removeAttribute(attr.name);
        }
      });
    });
    return wrapper.innerHTML;
  }

  function formatMainNewsDate(value) {
    if (!value) return 'Сейчас';
    var date = new Date(value);
    if (isNaN(date.getTime())) return 'Сейчас';
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getMainNewsFileType(fileName) {
    var ext = String(fileName || '').split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','gif','webp','svg','bmp'].indexOf(ext) !== -1) return 'image';
    if (['mp4','webm','ogg','mov'].indexOf(ext) !== -1) return 'video';
    if (ext === 'pdf') return 'pdf';
    return 'file';
  }

  function renderMainNewsViewer(file) {
    if (!file || !file.url) {
      return '<div class="bimmax-main-news-modal__viewer"><div class="bimmax-main-news-modal__text">Файлы обновления не найдены.</div></div>';
    }
    var type = getMainNewsFileType(file.name || '');
    var cacheUrl = file.url + (file.url.indexOf('?') === -1 ? '?' : '&') + 'ts=' + Date.now();
    if (type === 'image') return '<div class="bimmax-main-news-modal__viewer"><img src="' + escapeHtml(cacheUrl) + '" alt="' + escapeHtml(file.name || 'Обновление') + '"></div>';
    if (type === 'video') return '<div class="bimmax-main-news-modal__viewer"><video controls preload="metadata" src="' + escapeHtml(cacheUrl) + '"></video></div>';
    if (type === 'pdf') return '<div class="bimmax-main-news-modal__viewer"><iframe src="' + escapeHtml(cacheUrl) + '#toolbar=0&navpanes=0&view=FitH"></iframe></div>';
    return '<div class="bimmax-main-news-modal__viewer"><div class="bimmax-main-news-modal__text"><p><strong>Файл:</strong> ' + escapeHtml(file.name || 'Без названия') + '</p><p><a href="' + escapeHtml(cacheUrl) + '" target="_blank" rel="noopener">Открыть файл в новой вкладке</a></p></div></div>';
  }

  function loadMainNewsScript(src) {
    return new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[data-main-news-src="' + src + '"]');
      if (existing && existing.getAttribute('data-main-news-ready') === '1') {
        resolve();
        return;
      }
      if (existing) {
        existing.addEventListener('load', function() { resolve(); }, { once: true });
        existing.addEventListener('error', function() { reject(new Error('Не удалось загрузить скрипт: ' + src)); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-main-news-src', src);
      script.addEventListener('load', function() {
        script.setAttribute('data-main-news-ready', '1');
        resolve();
      }, { once: true });
      script.addEventListener('error', function() {
        reject(new Error('Не удалось загрузить скрипт: ' + src));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function getAuthorizedMainNewsUserName() {
    var access = getAdminAccessState();
    if (access && access.active) {
      return String(access.name || access.login || '').trim();
    }
    return '';
  }

  function resolveDocumentsMainNewsUserName() {
    var access = window.documentsAccessContext;
    if (!access || typeof access !== 'object') {
      return '';
    }

    if (access.user && typeof access.user === 'object') {
      if (typeof access.user.fio === 'string' && access.user.fio.trim()) {
        return access.user.fio.trim();
      }
      if (typeof access.user.fullName === 'string' && access.user.fullName.trim()) {
        return access.user.fullName.trim();
      }
      if (typeof access.user.name === 'string' && access.user.name.trim()) {
        return access.user.name.trim();
      }
      if (typeof access.user.login === 'string' && access.user.login.trim()) {
        return access.user.login.trim();
      }
    }

    if (typeof access.name === 'string' && access.name.trim()) {
      return access.name.trim();
    }
    if (typeof access.login === 'string' && access.login.trim()) {
      return access.login.trim();
    }

    return '';
  }

  function initCardNewsModal() {
    if (!/su-\d+\.php$/i.test(window.location.pathname.split('/').pop() || '')) {
      return { openForCard: function() {} };
    }

    ensureMainNewsStyles();

    var modal = document.createElement('div');
    modal.className = 'bimmax-main-news-modal';
    modal.hidden = true;
    modal.innerHTML = ''
      + '<div class="bimmax-main-news-modal__panel">'
      + '  <div class="bimmax-main-news-modal__hero">'
      + '    <div class="bimmax-main-news-modal__hero-main">'
      + '      <span class="bimmax-main-news-modal__eyebrow">Обновления на платформе BIMMAX</span>'
      + '      <h2 class="bimmax-main-news-modal__title" data-main-news-title>Карточка</h2>'
      + '    </div>'
      + '    <div class="bimmax-main-news-modal__badge" data-main-news-badge>Карточка</div>'
      + '    <div class="bimmax-main-news-modal__tools"><button type="button" class="bimmax-main-news-modal__pdf" data-main-news-pdf>Сохранить в PDF</button></div>'
      + '    <button type="button" class="bimmax-main-news-modal__close" data-main-news-close aria-label="Закрыть окно">×</button>'
      + '  </div>'
      + '  <div class="bimmax-main-news-modal__content" data-main-news-content></div>'
      + '  <p class="bimmax-main-news-modal__status" data-main-news-status>Проверяем наличие новых обновлений…</p>'
      + '  <div class="bimmax-main-news-modal__actions"><button type="button" class="bimmax-main-news-modal__ack" data-main-news-ack>Ознакомлен</button></div>'
      + '</div>';

    var note = document.createElement('div');
    note.className = 'bimmax-main-news-note';
    note.hidden = true;
    document.body.appendChild(modal);
    document.body.appendChild(note);

    var contentNode = modal.querySelector('[data-main-news-content]');
    var statusNode = modal.querySelector('[data-main-news-status]');
    var ackButton = modal.querySelector('[data-main-news-ack]');
    var titleNode = modal.querySelector('[data-main-news-title]');
    var badgeNode = modal.querySelector('[data-main-news-badge]');
    var closeButton = modal.querySelector('[data-main-news-close]');
    var pdfButton = modal.querySelector('[data-main-news-pdf]');
    var noteTimer = null;
    var currentUpdate = null;
    var currentFileIndex = 0;
    var activeCard = '';
    var activeUserName = '';
    var dismissedCardSessions = Object.create(null);

    function mainNewsToAbsoluteUrl(url) {
      if (!url) return '';
      try {
        return String(new URL(String(url), window.location.origin));
      } catch (error) {
        return String(url);
      }
    }

    function makeMainNewsCacheUrl(url) {
      var absUrl = mainNewsToAbsoluteUrl(url);
      if (!absUrl) return '';
      return absUrl + (absUrl.indexOf('?') === -1 ? '?' : '&') + 'ts=' + Date.now();
    }

    function htmlToMainNewsText(html) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = String(html || '');
      var text = (wrapper.textContent || wrapper.innerText || '').replace(/\u00A0/g, ' ');
      return text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function blobToDataUrl(blob) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(new Error('Не удалось прочитать файл')); };
        reader.readAsDataURL(blob);
      });
    }

    function mainNewsLoadImageSize(dataUrl) {
      return new Promise(function(resolve, reject) {
        var image = new Image();
        image.onload = function() {
          resolve({
            width: image.naturalWidth || image.width || 1,
            height: image.naturalHeight || image.height || 1
          });
        };
        image.onerror = function() { reject(new Error('Не удалось обработать изображение')); };
        image.src = dataUrl;
      });
    }

    function mainNewsEnsurePdfTools() {
      var needPdfLib = !(window.jspdf && window.jspdf.jsPDF);
      var tasks = [];
      if (needPdfLib) {
        tasks.push(loadMainNewsScript('scripts/jspdf.umd.min.js'));
      }
      return Promise.all(tasks).then(function() {
        if (window.jspdf && window.jspdf.jsPDF) {
          window.jsPDF = window.jspdf.jsPDF;
        }
        if (window.jsPDF && !window.__bimmaxMainNewsPdfFontReady) {
          return loadMainNewsScript('shrift/pdfFont.js').then(function() {
            window.__bimmaxMainNewsPdfFontReady = true;
          }).catch(function() {
            window.__bimmaxMainNewsPdfFontReady = false;
          });
        }
        if (window.__bimmaxMainNewsPdfFontReady !== false) {
          window.__bimmaxMainNewsPdfFontReady = true;
        }
      });
    }

    function sanitizeMainNewsJsPdfEvents(jsPdfApi) {
      if (!jsPdfApi || !jsPdfApi.API || !Array.isArray(jsPdfApi.API.events)) {
        return;
      }
      jsPdfApi.API.events = jsPdfApi.API.events.filter(function(item) {
        return Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'function';
      });
    }

    var mainNewsPdfFontDataPromise = null;

    function mainNewsArrayBufferToBase64(arrayBuffer) {
      var bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
      var chunkSize = 0x8000;
      var binary = '';
      for (var i = 0; i < bytes.length; i += chunkSize) {
        var chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    }

    function loadMainNewsRobotoFontBase64() {
      if (!mainNewsPdfFontDataPromise) {
        mainNewsPdfFontDataPromise = fetch('shrift/Roboto-Regular.ttf?ts=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Не удалось загрузить шрифт для PDF.');
            }
            return response.arrayBuffer();
          })
          .then(mainNewsArrayBufferToBase64);
      }
      return mainNewsPdfFontDataPromise;
    }

    function ensureMainNewsPdfFontOnDoc(doc) {
      if (!doc || !doc.getFontList || !doc.addFileToVFS || !doc.addFont) {
        return Promise.resolve(false);
      }
      var fontList = doc.getFontList();
      if (fontList && fontList.Roboto && fontList.Roboto.indexOf('normal') !== -1) {
        return Promise.resolve(true);
      }
      return loadMainNewsRobotoFontBase64()
        .then(function(base64) {
          doc.addFileToVFS('Roboto-Regular.ttf', base64);
          doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
          return true;
        })
        .catch(function() {
          return false;
        });
    }

    function addMainNewsParagraph(doc, text, options) {
      var cfg = options || {};
      var pageWidth = doc.internal.pageSize.getWidth();
      var margin = cfg.margin || 14;
      var y = typeof cfg.y === 'number' ? cfg.y : margin;
      var maxWidth = cfg.maxWidth || (pageWidth - margin * 2);
      var fontSize = cfg.fontSize || 12;
      var lineHeight = cfg.lineHeight || (fontSize * 0.42 + 4);
      var paragraphs = String(text || '').split(/\r?\n/);
      doc.setFontSize(fontSize);
      paragraphs.forEach(function(paragraph, paragraphIndex) {
        var normalized = paragraph && paragraph.trim() ? paragraph : ' ';
        var lines = doc.splitTextToSize(normalized, maxWidth);
        lines.forEach(function(line) {
          if (y > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            if (doc.setFont && cfg.fontName) doc.setFont(cfg.fontName, 'normal');
            y = margin;
            doc.setFontSize(fontSize);
          }
          doc.text(line, margin, y);
          y += lineHeight;
        });
        if (paragraphIndex < paragraphs.length - 1) {
          y += Math.max(1.5, lineHeight * 0.35);
        }
      });
      return y;
    }

    function exportMainNewsToPdf() {
      if (!currentUpdate) {
        statusNode.textContent = 'Нет данных для сохранения в PDF.';
        return;
      }
      var files = Array.isArray(currentUpdate.files) ? currentUpdate.files : [];
      var cleanText = htmlToMainNewsText(currentUpdate.textHtml || '');
      pdfButton.disabled = true;
      pdfButton.textContent = 'Формируем PDF…';
      statusNode.textContent = 'Готовим PDF: добавляем текст и медиафайлы.';

      mainNewsEnsurePdfTools()
        .then(function() {
          var jsPdfApi = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
          if (!jsPdfApi) {
            throw new Error('Библиотека PDF не загружена.');
          }
          sanitizeMainNewsJsPdfEvents(jsPdfApi);
          var doc = new jsPdfApi({ orientation: 'p', unit: 'mm', format: 'a4', compress: false, putOnlyUsedFonts: true });
          return ensureMainNewsPdfFontOnDoc(doc).then(function(hasRobotoFont) {
            var preferredFontName = hasRobotoFont ? 'Roboto' : 'helvetica';
            if (doc.setFont) {
              doc.setFont(preferredFontName, 'normal');
            }
            var pageWidth = doc.internal.pageSize.getWidth();
          var pageHeight = doc.internal.pageSize.getHeight();
          var margin = 14;
          var cursorY = margin;
          var organization = window.location.pathname.split('/').pop() || '';

          doc.setFontSize(18);
          doc.text('Обновления BIMMAX', margin, cursorY);
          cursorY += 9;
          doc.setFontSize(12);
          cursorY = addMainNewsParagraph(doc, 'Раздел: ' + (activeCard || 'Карточка'), { margin: margin, y: cursorY, fontSize: 12, fontName: preferredFontName });
          cursorY = addMainNewsParagraph(doc, 'Организация: ' + organization, { margin: margin, y: cursorY + 1, fontSize: 11, fontName: preferredFontName });
          cursorY = addMainNewsParagraph(doc, 'Обновление: ' + (currentUpdate.name || 'Без названия'), { margin: margin, y: cursorY + 1, fontSize: 11, fontName: preferredFontName });
          cursorY = addMainNewsParagraph(doc, 'Дата выгрузки: ' + formatMainNewsDate(new Date().toISOString()), { margin: margin, y: cursorY + 1, fontSize: 11, fontName: preferredFontName });

          if (cleanText) {
            cursorY += 3;
            doc.setFontSize(13);
            doc.text('Описание', margin, cursorY);
            cursorY += 6;
            cursorY = addMainNewsParagraph(doc, cleanText, { margin: margin, y: cursorY, fontSize: 11, fontName: preferredFontName });
          }

          if (files.length) {
            if (cursorY > pageHeight - margin - 30) {
              doc.addPage();
              if (doc.setFont) doc.setFont(preferredFontName, 'normal');
              cursorY = margin;
            } else {
              cursorY += 3;
            }
            doc.setFontSize(14);
            doc.text('Медиафайлы', margin, cursorY);
            cursorY += 8;
          }

          var sequence = Promise.resolve();
          files.forEach(function(file, index) {
            sequence = sequence.then(function() {
              var rawUrl = file && file.url ? String(file.url) : '';
              if (!rawUrl) return;
              var fileName = file.name || ('Файл ' + (index + 1));
              var fileType = getMainNewsFileType(fileName);
              var fileUrl = makeMainNewsCacheUrl(rawUrl);

              if (fileType !== 'image') {
                if (cursorY > pageHeight - margin - 20) {
                  doc.addPage();
                  if (doc.setFont) doc.setFont(preferredFontName, 'normal');
                  cursorY = margin;
                }
                doc.setFontSize(12);
                doc.text((index + 1) + '. ' + fileName, margin, cursorY);
                cursorY += 6;
                cursorY = addMainNewsParagraph(doc, 'Тип: ' + fileType.toUpperCase() + '. Открыть исходный файл: ' + mainNewsToAbsoluteUrl(rawUrl), { margin: margin, y: cursorY, fontSize: 10, fontName: preferredFontName });
                cursorY += 4;
                return;
              }

              return fetch(fileUrl, { cache: 'no-store', credentials: 'same-origin' })
                .then(function(response) {
                  if (!response.ok) throw new Error('Не удалось загрузить изображение: ' + fileName);
                  return response.blob();
                })
                .then(function(blob) {
                  return blobToDataUrl(blob).then(function(dataUrl) {
                    return {
                      dataUrl: dataUrl,
                      blobType: String(blob.type || '').toLowerCase()
                    };
                  });
                })
                .then(function(imageData) {
                  return mainNewsLoadImageSize(imageData.dataUrl).then(function(size) {
                    var titleHeight = 6;
                    var availableW = pageWidth - margin * 2;
                    var availableH = pageHeight - cursorY - margin - titleHeight;
                    if (availableH < 60) {
                      doc.addPage();
                      if (doc.setFont) doc.setFont(preferredFontName, 'normal');
                      cursorY = margin;
                      availableH = pageHeight - cursorY - margin - titleHeight;
                    }
                    var ratio = Math.min(availableW / size.width, availableH / size.height, 1);
                    var drawW = Math.max(1, size.width * ratio);
                    var drawH = Math.max(1, size.height * ratio);
                    doc.setFontSize(12);
                    doc.text((index + 1) + '. ' + fileName, margin, cursorY);
                    cursorY += titleHeight;
                    var drawX = (pageWidth - drawW) / 2;
                    var drawY = cursorY;
                    var fmt = imageData.blobType.indexOf('png') !== -1 ? 'PNG' : 'JPEG';
                    doc.addImage(imageData.dataUrl, fmt, drawX, drawY, drawW, drawH, undefined, 'NONE');
                    cursorY = drawY + drawH + 6;
                  });
                });
            });
          });

            return sequence.then(function() {
              var safeCard = String(activeCard || 'card').replace(/[^\wа-яё-]+/gi, '_');
              var safeUpdate = String(currentUpdate.name || 'update').replace(/[^\wа-яё-]+/gi, '_');
              var fileName = ('BIMMAX_' + safeCard + '_' + safeUpdate + '.pdf').replace(/_+/g, '_');
              doc.save(fileName);
            });
          });
        })
        .then(function() {
          statusNode.textContent = 'PDF сохранён. В файле добавлены описание и медиа.';
        })
        .catch(function(error) {
          statusNode.textContent = error && error.message ? error.message : 'Не удалось сохранить PDF.';
        })
        .finally(function() {
          pdfButton.disabled = false;
          pdfButton.textContent = 'Сохранить в PDF';
        });
    }

    function getCardSessionKey(cardName, userName) {
      return String(cardName || '').trim() + '::' + String(userName || '').trim();
    }

    function rememberDismissedSession(cardName, userName) {
      var sessionKey = getCardSessionKey(cardName, userName);
      if (!sessionKey || sessionKey === '::') {
        return;
      }
      dismissedCardSessions[sessionKey] = true;
    }

    function clearDismissedSession(cardName, userName) {
      var sessionKey = getCardSessionKey(cardName, userName);
      if (!sessionKey || sessionKey === '::') {
        return;
      }
      delete dismissedCardSessions[sessionKey];
    }

    function isDismissedSession(cardName, userName) {
      var sessionKey = getCardSessionKey(cardName, userName);
      if (!sessionKey || sessionKey === '::') {
        return false;
      }
      return dismissedCardSessions[sessionKey] === true;
    }

    function readCardUserName(cardName) {
      var card = String(cardName || '').trim();
      var resolvedUserName = '';
      if (!card) {
        console.log('Обновление: карточка не указана, имя пользователя определить нельзя');
        return '';
      }
      if (card === 'Фронт работ') {
        resolvedUserName = frontWorksAccessState && frontWorksAccessState.authenticated ? String(frontWorksAccessState.name || frontWorksAccessState.login || '').trim() : '';
      } else if (card === 'Табель') {
        resolvedUserName = tabelAccessState && tabelAccessState.authenticated ? String(tabelAccessState.name || tabelAccessState.login || '').trim() : '';
      } else if (card === 'AllTrack') {
        resolvedUserName = allTrackAccessState && allTrackAccessState.authenticated ? String(allTrackAccessState.name || allTrackAccessState.login || '').trim() : '';
      } else if (card === 'Заявка материалов') {
        resolvedUserName = za9vkaAccessState && za9vkaAccessState.authenticated ? String(za9vkaAccessState.name || za9vkaAccessState.login || '').trim() : '';
      } else if (card === 'Документооборот') {
        resolvedUserName = resolveDocumentsMainNewsUserName() || getAuthorizedMainNewsUserName();
      } else {
        resolvedUserName = getAuthorizedMainNewsUserName();
      }
      console.log('Обновление: определение пользователя для карточки', {
        cardName: card,
        userName: resolvedUserName || '',
        hasDocumentsAccessContext: !!(window.documentsAccessContext && typeof window.documentsAccessContext === 'object'),
        documentsAuthenticated: !!(window.documentsAccessContext && window.documentsAccessContext.authenticated),
        adminUserName: getAuthorizedMainNewsUserName() || ''
      });
      return resolvedUserName;
    }

    function showNote(userName, cardName) {
      if (noteTimer) {
        clearTimeout(noteTimer);
      }
      note.innerHTML = '<p class="bimmax-main-news-note__title">Ознакомление сохранено</p><p class="bimmax-main-news-note__text">Раздел: ' + escapeHtml(cardName || 'Карточка') + '<br>Пользователь: ' + escapeHtml(userName || 'Пользователь') + '<br>Дата: ' + escapeHtml(formatMainNewsDate(new Date().toISOString())) + '</p>';
      note.hidden = false;
      noteTimer = setTimeout(function() { note.hidden = true; }, 5000);
    }

    function renderUpdate() {
      if (!currentUpdate) {
        contentNode.innerHTML = '';
        return;
      }
      var files = Array.isArray(currentUpdate.files) ? currentUpdate.files : [];
      var activeFile = files[currentFileIndex] || files[0] || null;
      var filesHtml = files.map(function(file, index) {
        return '<button type="button" class="bimmax-main-news-modal__file' + (index === currentFileIndex ? ' is-active' : '') + '" data-main-news-file-index="' + index + '"><span class="bimmax-main-news-modal__file-name">' + escapeHtml(file.name || ('Файл ' + (index + 1))) + '</span><span class="bimmax-main-news-modal__file-order">' + (index + 1) + '/' + files.length + '</span></button>';
      }).join('');
      var textHtml = sanitizeMainNewsHtml(currentUpdate.textHtml || '');
      contentNode.innerHTML = ''
        + (textHtml ? '<section class="bimmax-main-news-modal__text">' + textHtml + '</section>' : '')
        + '<section class="bimmax-main-news-modal__media">'
        + renderMainNewsViewer(activeFile)
        + (files.length > 1 ? '<div class="bimmax-main-news-modal__files">' + filesHtml + '</div>' : '')
        + '</section>';
      Array.prototype.slice.call(contentNode.querySelectorAll('[data-main-news-file-index]')).forEach(function(button) {
        button.addEventListener('click', function() {
          currentFileIndex = Number(button.getAttribute('data-main-news-file-index')) || 0;
          renderUpdate();
        });
      });
    }

    function saveAcknowledgement(userName, updateName) {
      return fetch(BIMMAX_MAIN_NEWS_ENDPOINT + '?action=user-ack&ts=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ organization: window.location.pathname.split('/').pop() || '', userName: userName, updateName: updateName })
      }).then(function(response) { return response.json().then(function(payload) { return { ok: response.ok, payload: payload }; }); })
        .then(function(result) {
          if (!result.ok || !result.payload || !result.payload.ok) {
            throw new Error(result.payload && result.payload.message ? result.payload.message : 'Ошибка сохранения');
          }
          return result.payload;
        });
    }

    function loadNewsForCard(cardName, forcedUserName, options) {
      var settings = options && typeof options === 'object' ? options : {};
      activeCard = String(cardName || '').trim();
      activeUserName = String(forcedUserName || readCardUserName(activeCard)).trim();
      if (settings.resetDismissed) {
        clearDismissedSession(activeCard, activeUserName);
      }
      if (titleNode) titleNode.textContent = activeCard || 'Карточка';
      badgeNode.textContent = activeCard || 'Карточка';
      console.log('Обновление: запуск проверки окна обновления', {
        cardName: activeCard,
        userName: activeUserName || '',
        organization: window.location.pathname.split('/').pop() || '',
        forcedUserName: forcedUserName || ''
      });
      if (!activeCard || !activeUserName) {
        console.log('Обновление: окно не будет показано — не хватает данных', {
          hasCardName: !!activeCard,
          hasUserName: !!activeUserName
        });
        currentUpdate = null;
        modal.hidden = true;
        return Promise.resolve();
      }
      if (isDismissedSession(activeCard, activeUserName)) {
        console.log('Обновление: окно скрыто после ручного закрытия до повторного входа в карточку', {
          cardName: activeCard,
          userName: activeUserName || ''
        });
        currentUpdate = null;
        modal.hidden = true;
        return Promise.resolve();
      }
      modal.style.zIndex = '2147483000';
      if (modal.parentNode === document.body) {
        document.body.appendChild(modal);
      }
      if (note.parentNode === document.body) {
        document.body.appendChild(note);
      }
      statusNode.textContent = 'Проверяем наличие новых обновлений…';
      return fetch(BIMMAX_MAIN_NEWS_ENDPOINT + '?action=user-get&organization=' + encodeURIComponent(window.location.pathname.split('/').pop() || '') + '&userName=' + encodeURIComponent(activeUserName) + '&mailingType=' + encodeURIComponent(activeCard) + '&ts=' + Date.now(), {
        cache: 'no-store',
        credentials: 'same-origin'
      })
        .then(function(response) { return response.json().then(function(payload) { return { ok: response.ok, payload: payload }; }); })
        .then(function(result) {
          console.log('Обновление: ответ сервера по карточке', {
            cardName: activeCard,
            userName: activeUserName || '',
            responseOk: !!result.ok,
            payloadOk: !!(result.payload && result.payload.ok),
            hasUpdate: !!(result.payload && result.payload.update),
            updateName: result.payload && result.payload.update ? (result.payload.update.name || '') : ''
          });
          if (!result.ok || !result.payload || !result.payload.ok || !result.payload.update) {
            console.log('Обновление: сервер не вернул новое обновление для карточки', {
              cardName: activeCard,
              userName: activeUserName || ''
            });
            currentUpdate = null;
            modal.hidden = true;
            return;
          }
          currentUpdate = result.payload.update;
          currentUpdate.textHtml = result.payload.updateTextHtml || '';
          currentFileIndex = 0;
          renderUpdate();
          statusNode.textContent = 'Ознакомьтесь с обновлением и подтвердите просмотр.';
          ackButton.disabled = false;
          modal.hidden = false;
        })
        .catch(function(error) {
          console.log('Обновление: ошибка при запросе обновления', {
            cardName: activeCard,
            userName: activeUserName || '',
            message: error && error.message ? error.message : 'unknown_error'
          });
          currentUpdate = null;
          modal.hidden = true;
        });
    }

    closeButton.addEventListener('click', function() {
      rememberDismissedSession(activeCard, activeUserName);
      modal.hidden = true;
    });
    pdfButton.addEventListener('click', exportMainNewsToPdf);

    ackButton.addEventListener('click', function() {
      var userName = activeUserName || readCardUserName(activeCard);
      if (!userName || !currentUpdate || !currentUpdate.name) {
        modal.hidden = true;
        return;
      }
      ackButton.disabled = true;
      statusNode.textContent = 'Сохраняем отметку об ознакомлении…';
      saveAcknowledgement(userName, currentUpdate.name)
        .then(function() {
          modal.hidden = true;
          showNote(userName, activeCard);
        })
        .catch(function(error) {
          ackButton.disabled = false;
          statusNode.textContent = error && error.message ? error.message : 'Не удалось сохранить отметку.';
        });
    });

    window.addEventListener(ADMIN_ACCESS_EVENT, function() {
      if (!activeCard) {
        return;
      }
      loadNewsForCard(activeCard);
    });

    window.setInterval(function() {
      if (!activeCard) {
        return;
      }
      loadNewsForCard(activeCard);
    }, 20000);

    return {
      openForCard: function(cardName, userName) {
        return loadNewsForCard(cardName, userName, { resetDismissed: true });
      }
    };
  }

  ready(function() {
    var mapTile = document.getElementById('map-tile');
    var materialsTile = document.getElementById('materials-tile');
    var materialsRequestTile = document.getElementById('materials-request-tile');
    var mapClose = document.getElementById('map-close');
    var mapBackdrop = document.getElementById('map-backdrop');
    var summaryBackdrop = document.getElementById('summary-backdrop');
    var summaryButton = document.getElementById('summary-launch');
    var summaryPanel = document.getElementById('master-plan-container');
    var roleMenuToggle = document.getElementById('role-menu-toggle');
    var menuContainer = document.querySelector('.menu-container');
    var toolbarTitle = document.querySelector('.su21-toolbar__title');
    var adminButton = null;
    var adminAccessManager = null;
    var interfaceTiles = document.querySelector('.su21-interface__tiles');
    var documentsTile = document.getElementById('documents-tile');
    var engineeringTile = document.getElementById('engineering-tile');
    var frontWorksTile = document.getElementById('front-works-tile');
    var ispDocsTile = document.getElementById('ispdocs-tile');
    var tabelTile = document.getElementById('tabel-tile');
    var allTrackTile = document.getElementById('alltrack-tile');
    var ohranaTile = document.getElementById('ohrana-tile');
    var zavodTile = document.getElementById('zavod-tile');
    var protocol2Tile = document.getElementById('protocol2-tile');
    var protocol2ScriptPromise = null;
    var documentsBackdrop = document.getElementById('documents-backdrop');
    var documentsPanel = document.getElementById('documents-panel');
    var documentsClose = document.getElementById('documents-close');
    var documentsLogoutButton = document.getElementById('documents-logout-button');
    var documentsRefreshButton = document.getElementById('documents-refresh-button');
    var documentsRoot = document.getElementById('documents-root');
    var documentsOpen = false;
    var documentsInitialized = false;
    var documentsLoginManager = null;
    var documentsCredentialsCache = null;
    var documentsCredentialsPromise = null;
    var documentsAccessInProgress = false;
    detectedOrganization = detectOrganizationFromPage();
    var documentsAuthStorageKey = detectedOrganization
      ? 'documents.access.' + detectedOrganization.toLowerCase()
      : '';
    var documentsAuthenticated = false;
    var documentsAccessContext = null;
    var documentsSessionPromise = null;
    var engineeringModulePromise = null;
    var engineeringModuleInitialized = false;
    var frontWorksScriptPromise = null;
    var frontWorksLoginManager = null;
    var frontWorksAuthStorageKey = detectedOrganization
      ? 'frontworks.access.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
      : '';
    var frontWorksAccessState = null;
    var tabelLoginManager = null;
    var tabelAuthStorageKey = detectedOrganization
      ? 'tabel.access.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
      : '';
    var tabelAccessState = null;
    var allTrackLoginManager = null;
    var allTrackAuthStorageKey = detectedOrganization
      ? 'alltrack.access.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
      : '';
    var allTrackAccessState = null;
    var ohranaLoginManager = null;
    var ohranaAuthStorageKey = detectedOrganization
      ? 'ohrana.access.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
      : '';
    var ohranaAccessState = null;
    var zavodLoginManager = null;
    var zavodAuthStorageKey = detectedOrganization
      ? 'zavod.access.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
      : '';
    var zavodAccessState = null;
    var za9vkaLoginManager = null;
    var za9vkaAuthStorageKey = detectedOrganization
      ? 'za9vka.access.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
      : '';
    var za9vkaAccessState = null;
    var adminAccessState = getAdminAccessState();
    var documentsLogoutAvailable = false;
    var documentsLogoutInProgress = false;
    var documentsLogoutButtonLabel = documentsLogoutButton ? documentsLogoutButton.textContent : '';
    var documentsRefreshInProgress = false;
    var documentsRefreshButtonLabel = documentsRefreshButton ? documentsRefreshButton.textContent : '';
    var tabelOverlay = null;
    var tabelRoot = null;
    var tabelCloseButton = null;
    var tabelLogoutButton = null;
    var tabelSettingsButton = null;
    var tabelRefreshButton = null;
    var tabelAdminButton = null;
    var tabelTitle = null;
    var tabelUserInfo = null;
    var tabelUserName = null;
    var tabelNowWorkingBlock = null;
    var tabelNowWorkingList = null;
    var tabelAddSheetButton = null;
    var tabelWorks2dButton = null;
    var tabelSalaryCalcButton = null;
    var tabelDeleteSheetButton = null;
    var tabelOnlineButton = null;
    var tabelOnlineCounter = null;
    var tabelPresenceState = {
      sessionId: '',
      timerId: null,
      active: false,
      modal: null,
      listContainer: null,
      buttonBusy: false
    };
    var tabelScriptPromise = null;
    var tabelOpen = false;
    var lastTabelTrigger = null;
    var tabelApi = null;
    var allTrackOverlay = null;
    var allTrackOpen = false;
    var lastAllTrackTrigger = null;
    var allTrackScriptPromise = null;
    var cardAccessToast = null;
    var cardAccessToastTimer = null;
    var cardAccessRefreshTimer = null;
    var cardAccessMessage = 'В функционал для данной организации это не входит в подписку на услуги.';
    var cardDefaultStatuses = {};
    var cardAccessTiles = [
      { id: 'map-tile', label: 'Карта объектов' },
      { id: 'materials-tile', label: 'Материалы' },
      { id: 'materials-request-tile', label: 'Заявка материалов' },
      { id: 'documents-tile', label: 'Документооборот' },
      { id: 'engineering-tile', label: 'Инженерная подготовка' },
      { id: 'front-works-tile', label: 'Фронт работ' },
      { id: 'ispdocs-tile', label: 'Исполнительная документация' },
      { id: 'tabel-tile', label: 'Табель' },
      { id: 'alltrack-tile', label: 'AllTrack' },
      { id: 'ohrana-tile', label: 'Охрана труда' },
      { id: 'zavod-tile', label: 'Завод' },
      { id: 'protocol2-tile', label: 'Протокол совещания' }
    ];
    var tilesActiveGroup = null;
    var tilesLockedGroup = null;

    function ensureTileGroups() {
      if (!interfaceTiles) {
        return null;
      }
      if (tilesActiveGroup && tilesLockedGroup && interfaceTiles.contains(tilesActiveGroup) && interfaceTiles.contains(tilesLockedGroup)) {
        return { active: tilesActiveGroup, locked: tilesLockedGroup };
      }

      tilesActiveGroup = document.createElement('section');
      tilesActiveGroup.className = 'su21-tiles-group su21-tiles-group--active';
      tilesActiveGroup.dataset.group = 'active';
      tilesActiveGroup.innerHTML =
        '<header class="su21-tiles-group__header">' +
          '<h2 class="su21-tiles-group__title">Доступные разделы</h2>' +
          '<p class="su21-tiles-group__description">Разделы, с которыми можно работать прямо сейчас.</p>' +
        '</header>' +
        '<div class="su21-tiles-group__grid"></div>';

      tilesLockedGroup = document.createElement('section');
      tilesLockedGroup.className = 'su21-tiles-group su21-tiles-group--locked';
      tilesLockedGroup.dataset.group = 'locked';
      tilesLockedGroup.innerHTML =
        '<header class="su21-tiles-group__header">' +
          '<h2 class="su21-tiles-group__title">Недоступные разделы</h2>' +
          '<p class="su21-tiles-group__description">Разделы ниже пока закрыты для вашей организации.</p>' +
        '</header>' +
        '<div class="su21-tiles-group__grid"></div>';

      var existingTiles = Array.prototype.slice.call(interfaceTiles.querySelectorAll('.map-tile'));
      interfaceTiles.innerHTML = '';
      interfaceTiles.appendChild(tilesActiveGroup);
      interfaceTiles.appendChild(tilesLockedGroup);

      existingTiles.forEach(function(tile) {
        tilesActiveGroup.querySelector('.su21-tiles-group__grid').appendChild(tile);
      });

      return { active: tilesActiveGroup, locked: tilesLockedGroup };
    }

    function placeTileInGroup(tile, locked) {
      if (!tile) {
        return;
      }
      var groups = ensureTileGroups();
      if (!groups) {
        return;
      }
      var targetGrid = (locked ? groups.locked : groups.active).querySelector('.su21-tiles-group__grid');
      if (!targetGrid) {
        return;
      }
      if (tile.parentNode !== targetGrid) {
        targetGrid.appendChild(tile);
      }
      updateTileGroupVisibility();
    }

    function updateTileGroupVisibility() {
      if (!tilesActiveGroup || !tilesLockedGroup) {
        return;
      }
      var activeCount = tilesActiveGroup.querySelectorAll('.map-tile').length;
      var lockedCount = tilesLockedGroup.querySelectorAll('.map-tile').length;
      tilesActiveGroup.classList.toggle('is-empty', activeCount === 0);
      tilesLockedGroup.classList.toggle('is-empty', lockedCount === 0);
      tilesLockedGroup.hidden = lockedCount === 0;
    }

    function syncAllTilesToGroups() {
      cardAccessTiles.forEach(function(card) {
        var tile = document.getElementById(card.id);
        if (!tile) {
          return;
        }
        placeTileInGroup(tile, tile.classList.contains('is-locked'));
      });
      updateTileGroupVisibility();
    }

    function normalizePageName(pathname) {
      if (!pathname || typeof pathname !== 'string') {
        return '';
      }
      var parts = pathname.split('/');
      var lastPart = parts.pop() || '';
      if (!lastPart && parts.length) {
        lastPart = parts.pop() || '';
      }
      return lastPart.trim();
    }

    function ensureCardAccessToast() {
      if (cardAccessToast) {
        return cardAccessToast;
      }
      cardAccessToast = document.createElement('div');
      cardAccessToast.className = 'card-access-toast';
      cardAccessToast.setAttribute('role', 'status');
      cardAccessToast.setAttribute('aria-live', 'polite');
      document.body.appendChild(cardAccessToast);
      return cardAccessToast;
    }

    function showCardAccessToast(message) {
      var toast = ensureCardAccessToast();
      toast.textContent = message || cardAccessMessage;
      toast.classList.add('is-visible');
      if (cardAccessToastTimer) {
        clearTimeout(cardAccessToastTimer);
      }
      cardAccessToastTimer = setTimeout(function() {
        toast.classList.remove('is-visible');
      }, 3000);
    }

    function ensureTileDefaultStatus(tileId) {
      if (!tileId || cardDefaultStatuses[tileId]) {
        return;
      }
      var tile = document.getElementById(tileId);
      if (!tile) {
        return;
      }
      var statusNode = tile.querySelector('.map-tile__status');
      cardDefaultStatuses[tileId] = {
        text: statusNode ? String(statusNode.textContent || '').trim() : '',
      };
    }

    function setTileStatusText(tile, statusText) {
      if (!tile) {
        return;
      }
      var statusNode = tile.querySelector('.map-tile__status');
      if (!statusNode) {
        return;
      }
      var normalizedStatus = typeof statusText === 'string' ? statusText.trim() : '';
      if (!normalizedStatus) {
        statusNode.textContent = '';
        statusNode.hidden = true;
        statusNode.style.display = 'none';
        return;
      }
      statusNode.hidden = false;
      statusNode.style.display = '';
      statusNode.textContent = normalizedStatus;
    }

    function setTileLocked(tile, locked) {
      if (!tile) {
        return;
      }
      tile.classList.toggle('is-locked', locked);
      tile.setAttribute('aria-disabled', locked ? 'true' : 'false');

      var lock = tile.querySelector('.map-tile__lock');
      if (locked) {
        if (!lock) {
          lock = document.createElement('div');
          lock.className = 'map-tile__lock';
          lock.setAttribute('aria-hidden', 'true');
          lock.textContent = '\uD83D\uDD12';
          tile.appendChild(lock);
        }
      } else if (lock) {
        lock.remove();
      }

      placeTileInGroup(tile, locked);
    }

    function attachLockGuard(tile) {
      if (!tile || tile.dataset.lockGuard === 'true') {
        return;
      }
      tile.dataset.lockGuard = 'true';
      tile.addEventListener('click', function(event) {
        if (!tile.classList.contains('is-locked')) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        showCardAccessToast();
      }, true);
      tile.addEventListener('keydown', function(event) {
        if (!tile.classList.contains('is-locked')) {
          return;
        }
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          event.preventDefault();
          event.stopPropagation();
          showCardAccessToast();
        }
      }, true);
    }

    function applyCardAccessConfig(config) {
      var allowedCards = config && Array.isArray(config.cards) ? new Set(config.cards) : null;
      var statuses = config && config.statuses && typeof config.statuses === 'object' ? config.statuses : {};
      cardAccessTiles.forEach(function(card) {
        var tile = document.getElementById(card.id);
        if (!tile) {
          return;
        }
        ensureTileDefaultStatus(card.id);
        attachLockGuard(tile);
        if (!allowedCards) {
          setTileLocked(tile, false);
          setTileStatusText(tile, cardDefaultStatuses[card.id] ? cardDefaultStatuses[card.id].text : '');
          return;
        }
        setTileLocked(tile, !allowedCards.has(card.id));
        if (Object.prototype.hasOwnProperty.call(statuses, card.id)) {
          setTileStatusText(tile, statuses[card.id]);
        } else {
          setTileStatusText(tile, cardDefaultStatuses[card.id] ? cardDefaultStatuses[card.id].text : '');
        }
      });
    }

    function refreshCardAccess() {
      var pageName = normalizePageName(window.location.pathname || '');
      if (!pageName) {
        applyCardAccessConfig(null);
        return;
      }

      fetch('lg/dostupcard.json?ts=' + Date.now(), { cache: 'no-store' })
        .then(function(response) {
          if (!response.ok) {
            throw new Error('access-config-not-found');
          }
          return response.json();
        })
        .then(function(data) {
          if (!data || !Array.isArray(data.blocks)) {
            applyCardAccessConfig(null);
            return;
          }
          var matched = data.blocks.find(function(block) {
            return block && typeof block.page === 'string' && block.page === pageName;
          });
          if (!matched) {
            applyCardAccessConfig(null);
            return;
          }
          applyCardAccessConfig(matched);
        })
        .catch(function() {
          applyCardAccessConfig(null);
        });
    }

    function createDefaultFrontWorksAccess() {
      return { authenticated: false, isAdmin: false, login: '', name: '' };
    }

    function createDefaultTabelAccess() {
      return { authenticated: false, isAdmin: false, login: '', name: '', user: null };
    }

    function createDefaultAllTrackAccess() {
      return { authenticated: false, login: '', name: '' };
    }

    function createDefaultOhranaAccess() {
      return { authenticated: false, login: '', name: '' };
    }

    function createDefaultZavodAccess() {
      return { authenticated: false, login: '', name: '' };
    }

    function createDefaultZa9vkaAccess() {
      return { authenticated: false, isAdmin: false, login: '', name: '', user: null };
    }

    function loadFrontWorksAccessState() {
      if (!frontWorksAuthStorageKey || !window.sessionStorage) {
        return createDefaultFrontWorksAccess();
      }

      try {
        var raw = window.sessionStorage.getItem(frontWorksAuthStorageKey);
        if (!raw) {
          return createDefaultFrontWorksAccess();
        }

        var parsed = JSON.parse(raw);
        return {
          authenticated: Boolean(parsed.authenticated),
          isAdmin: Boolean(parsed.isAdmin),
          login: typeof parsed.login === 'string' ? parsed.login : '',
          name: typeof parsed.name === 'string' ? parsed.name : ''
        };
      } catch (storageError) {
        return createDefaultFrontWorksAccess();
      }
    }

    function loadTabelAccessState() {
      if (!tabelAuthStorageKey || !window.sessionStorage) {
        return createDefaultTabelAccess();
      }

      try {
        var raw = window.sessionStorage.getItem(tabelAuthStorageKey);
        if (!raw) {
          return createDefaultTabelAccess();
        }

        var parsed = JSON.parse(raw);
        return {
          authenticated: Boolean(parsed.authenticated),
          isAdmin: Boolean(parsed.isAdmin),
          login: typeof parsed.login === 'string' ? parsed.login : '',
          name: typeof parsed.name === 'string' ? parsed.name : '',
          user: parsed.user && typeof parsed.user === 'object' ? parsed.user : null
        };
      } catch (storageError) {
        return createDefaultTabelAccess();
      }
    }

    function loadAllTrackAccessState() {
      if (!allTrackAuthStorageKey || !window.sessionStorage) {
        return createDefaultAllTrackAccess();
      }

      try {
        var raw = window.sessionStorage.getItem(allTrackAuthStorageKey);
        if (!raw) {
          return createDefaultAllTrackAccess();
        }

        var parsed = JSON.parse(raw);
        return {
          authenticated: Boolean(parsed.authenticated),
          login: typeof parsed.login === 'string' ? parsed.login : '',
          name: typeof parsed.name === 'string' ? parsed.name : ''
        };
      } catch (storageError) {
        return createDefaultAllTrackAccess();
      }
    }

    function loadOhranaAccessState() {
      if (!ohranaAuthStorageKey || !window.sessionStorage) {
        return createDefaultOhranaAccess();
      }

      try {
        var raw = window.sessionStorage.getItem(ohranaAuthStorageKey);
        if (!raw) {
          return createDefaultOhranaAccess();
        }

        var parsed = JSON.parse(raw);
        return {
          authenticated: Boolean(parsed.authenticated),
          login: typeof parsed.login === 'string' ? parsed.login : '',
          name: typeof parsed.name === 'string' ? parsed.name : ''
        };
      } catch (storageError) {
        return createDefaultOhranaAccess();
      }
    }

    function persistFrontWorksAccessState() {
      if (!frontWorksAuthStorageKey || !window.sessionStorage || !frontWorksAccessState) {
        return;
      }

      try {
        if (!frontWorksAccessState.authenticated) {
          window.sessionStorage.removeItem(frontWorksAuthStorageKey);
          return;
        }

        var payload = JSON.stringify({
          authenticated: true,
          isAdmin: Boolean(frontWorksAccessState.isAdmin),
          login: frontWorksAccessState.login || '',
          name: frontWorksAccessState.name || ''
        });

        window.sessionStorage.setItem(frontWorksAuthStorageKey, payload);
      } catch (storageError) {
        // ignore storage errors
      }
    }

    function updateFrontWorksAccessState(nextState) {
      var state = nextState && typeof nextState === 'object' ? nextState : {};

      frontWorksAccessState = {
        authenticated: Boolean(state.authenticated),
        isAdmin: Boolean(state.isAdmin),
        login: typeof state.login === 'string' ? state.login : '',
        name: typeof state.name === 'string' ? state.name : ''
      };

      persistFrontWorksAccessState();

      return frontWorksAccessState;
    }

    function persistTabelAccessState() {
      if (!tabelAuthStorageKey || !window.sessionStorage || !tabelAccessState) {
        return;
      }

      try {
        if (!tabelAccessState.authenticated) {
          window.sessionStorage.removeItem(tabelAuthStorageKey);
          return;
        }

        var payload = JSON.stringify({
          authenticated: true,
          isAdmin: Boolean(tabelAccessState.isAdmin),
          login: tabelAccessState.login || '',
          name: tabelAccessState.name || '',
          user: tabelAccessState.user && typeof tabelAccessState.user === 'object' ? tabelAccessState.user : null
        });

        window.sessionStorage.setItem(tabelAuthStorageKey, payload);
      } catch (storageError) {
        // ignore storage errors
      }
    }

    function updateTabelAccessState(nextState) {
      var state = nextState && typeof nextState === 'object' ? nextState : {};

      tabelAccessState = {
        authenticated: Boolean(state.authenticated),
        isAdmin: Boolean(state.isAdmin),
        login: typeof state.login === 'string' ? state.login : '',
        name: typeof state.name === 'string' ? state.name : '',
        user: state.user && typeof state.user === 'object' ? state.user : null
      };

      persistTabelAccessState();

      return tabelAccessState;
    }

    function persistAllTrackAccessState() {
      if (!allTrackAuthStorageKey || !window.sessionStorage || !allTrackAccessState) {
        return;
      }

      try {
        if (!allTrackAccessState.authenticated) {
          window.sessionStorage.removeItem(allTrackAuthStorageKey);
          return;
        }

        var payload = JSON.stringify({
          authenticated: true,
          login: allTrackAccessState.login || '',
          name: allTrackAccessState.name || ''
        });

        window.sessionStorage.setItem(allTrackAuthStorageKey, payload);
      } catch (storageError) {
        // ignore storage errors
      }
    }

    function updateAllTrackAccessState(nextState) {
      var state = nextState && typeof nextState === 'object' ? nextState : {};

      allTrackAccessState = {
        authenticated: Boolean(state.authenticated),
        login: typeof state.login === 'string' ? state.login : '',
        name: typeof state.name === 'string' ? state.name : ''
      };

      persistAllTrackAccessState();

      return allTrackAccessState;
    }

    function persistOhranaAccessState() {
      if (!ohranaAuthStorageKey || !window.sessionStorage || !ohranaAccessState) {
        return;
      }

      try {
        if (!ohranaAccessState.authenticated) {
          window.sessionStorage.removeItem(ohranaAuthStorageKey);
          return;
        }

        var payload = JSON.stringify({
          authenticated: true,
          login: ohranaAccessState.login || '',
          name: ohranaAccessState.name || ''
        });

        window.sessionStorage.setItem(ohranaAuthStorageKey, payload);
      } catch (storageError) {
        // ignore storage errors
      }
    }

    function updateOhranaAccessState(nextState) {
      var state = nextState && typeof nextState === 'object' ? nextState : {};

      ohranaAccessState = {
        authenticated: Boolean(state.authenticated),
        login: typeof state.login === 'string' ? state.login : '',
        name: typeof state.name === 'string' ? state.name : ''
      };

      persistOhranaAccessState();

      return ohranaAccessState;
    }

    function loadZavodAccessState() {
      if (!zavodAuthStorageKey || !window.sessionStorage) {
        return createDefaultZavodAccess();
      }
      try {
        var raw = window.sessionStorage.getItem(zavodAuthStorageKey);
        if (!raw) {
          return createDefaultZavodAccess();
        }
        var parsed = JSON.parse(raw);
        return {
          authenticated: Boolean(parsed.authenticated),
          login: typeof parsed.login === 'string' ? parsed.login : '',
          name: typeof parsed.name === 'string' ? parsed.name : ''
        };
      } catch (storageError) {
        return createDefaultZavodAccess();
      }
    }

    function persistZavodAccessState() {
      if (!zavodAuthStorageKey || !window.sessionStorage || !zavodAccessState) {
        return;
      }
      try {
        if (!zavodAccessState.authenticated) {
          window.sessionStorage.removeItem(zavodAuthStorageKey);
          return;
        }
        var payload = JSON.stringify({
          authenticated: true,
          login: zavodAccessState.login || '',
          name: zavodAccessState.name || ''
        });
        window.sessionStorage.setItem(zavodAuthStorageKey, payload);
      } catch (storageError) {
        // ignore storage errors
      }
    }

    function updateZavodAccessState(nextState) {
      var state = nextState && typeof nextState === 'object' ? nextState : {};
      zavodAccessState = {
        authenticated: Boolean(state.authenticated),
        login: typeof state.login === 'string' ? state.login : '',
        name: typeof state.name === 'string' ? state.name : ''
      };
      persistZavodAccessState();
      return zavodAccessState;
    }

    function loadZa9vkaAccessState() {
      if (!za9vkaAuthStorageKey || !window.sessionStorage) {
        return createDefaultZa9vkaAccess();
      }

      try {
        var raw = window.sessionStorage.getItem(za9vkaAuthStorageKey);
        if (!raw) {
          return createDefaultZa9vkaAccess();
        }

        var parsed = JSON.parse(raw);
        return {
          authenticated: Boolean(parsed.authenticated),
          isAdmin: Boolean(parsed.isAdmin),
          login: typeof parsed.login === 'string' ? parsed.login : '',
          name: typeof parsed.name === 'string' ? parsed.name : '',
          user: parsed.user || null
        };
      } catch (storageError) {
        return createDefaultZa9vkaAccess();
      }
    }

    function persistZa9vkaAccessState() {
      if (!za9vkaAuthStorageKey || !window.sessionStorage || !za9vkaAccessState) {
        return;
      }

      try {
        if (!za9vkaAccessState.authenticated) {
          window.sessionStorage.removeItem(za9vkaAuthStorageKey);
          return;
        }

        var payload = JSON.stringify({
          authenticated: true,
          isAdmin: za9vkaAccessState.isAdmin || false,
          login: za9vkaAccessState.login || '',
          name: za9vkaAccessState.name || '',
          user: za9vkaAccessState.user || null
        });

        window.sessionStorage.setItem(za9vkaAuthStorageKey, payload);
      } catch (storageError) {
        // ignore storage errors
      }
    }

    function updateZa9vkaAccessState(nextState) {
      var state = nextState && typeof nextState === 'object' ? nextState : {};

      za9vkaAccessState = {
        authenticated: Boolean(state.authenticated),
        isAdmin: Boolean(state.isAdmin),
        login: typeof state.login === 'string' ? state.login : '',
        name: typeof state.name === 'string' ? state.name : '',
        user: state.user || null
      };

      persistZa9vkaAccessState();

      return za9vkaAccessState;
    }

    function logoutTabelAccess() {
      tabelAccessState = updateTabelAccessState(createDefaultTabelAccess());
    }

    function logoutAllTrackAccess() {
      allTrackAccessState = updateAllTrackAccessState(createDefaultAllTrackAccess());
    }

    function logoutOhranaAccess() {
      ohranaAccessState = updateOhranaAccessState(createDefaultOhranaAccess());
    }

    function logoutZavodAccess() {
      zavodAccessState = updateZavodAccessState(createDefaultZavodAccess());
    }

    function logoutFrontWorksAccess() {
      frontWorksAccessState = updateFrontWorksAccessState(createDefaultFrontWorksAccess());
    }

    function logoutZa9vkaAccess() {
      za9vkaAccessState = updateZa9vkaAccessState(createDefaultZa9vkaAccess());
    }

    frontWorksAccessState = loadFrontWorksAccessState();
    tabelAccessState = loadTabelAccessState();
    za9vkaAccessState = loadZa9vkaAccessState();
    allTrackAccessState = loadAllTrackAccessState();
    ohranaAccessState = loadOhranaAccessState();
    zavodAccessState = loadZavodAccessState();

    if (documentsAuthStorageKey && window.sessionStorage) {
      try {
        documentsAuthenticated = window.sessionStorage.getItem(documentsAuthStorageKey) === '1';
      } catch (storageError) {
        documentsAuthenticated = false;
      }
    }

    documentsLoginManager = createDocumentsLoginModal();
    syncDocumentsControls();

    function syncDocumentsControls() {
      if (documentsLogoutButton) {
        var defaultLabel = documentsLogoutButtonLabel || 'Выйти';
        documentsLogoutButton.textContent = documentsLogoutInProgress ? 'Выходим...' : defaultLabel;

        var logoutVisible = documentsOpen && (documentsLogoutAvailable || documentsLogoutInProgress);
        documentsLogoutButton.disabled = !documentsLogoutAvailable || documentsLogoutInProgress;

        if (logoutVisible) {
          documentsLogoutButton.hidden = false;
          documentsLogoutButton.setAttribute('aria-hidden', 'false');
          documentsLogoutButton.setAttribute('tabindex', '0');
        } else {
          documentsLogoutButton.hidden = true;
          documentsLogoutButton.setAttribute('aria-hidden', 'true');
          documentsLogoutButton.setAttribute('tabindex', '-1');
        }
      }

      if (documentsRefreshButton) {
        var refreshDefaultLabel = documentsRefreshButtonLabel || 'Обновить';
        documentsRefreshButton.textContent = documentsRefreshInProgress ? 'Обновляем...' : refreshDefaultLabel;

        var refreshVisible = documentsOpen && (documentsLogoutAvailable || documentsRefreshInProgress);
        documentsRefreshButton.disabled = !documentsLogoutAvailable || documentsRefreshInProgress;

        if (refreshVisible) {
          documentsRefreshButton.hidden = false;
          documentsRefreshButton.setAttribute('aria-hidden', 'false');
          documentsRefreshButton.setAttribute('tabindex', '0');
        } else {
          documentsRefreshButton.hidden = true;
          documentsRefreshButton.setAttribute('aria-hidden', 'true');
          documentsRefreshButton.setAttribute('tabindex', '-1');
        }
      }
    }

    function persistDocumentsAuthentication() {
      if (!documentsAuthStorageKey || !window.sessionStorage) {
        return;
      }
      try {
        window.sessionStorage.setItem(documentsAuthStorageKey, '1');
      } catch (error) {
        // ignore storage errors
      }
    }

    function clearDocumentsAuthentication() {
      documentsAuthenticated = false;
      documentsLogoutAvailable = false;
      documentsLogoutInProgress = false;
      syncDocumentsControls();
      if (!documentsAuthStorageKey || !window.sessionStorage) {
        return;
      }
      try {
        window.sessionStorage.removeItem(documentsAuthStorageKey);
      } catch (error) {
        // ignore storage errors
      }
    }

    function updateDocumentsAccessContext(session) {
      var context = {
        role: 'guest',
        authenticated: false,
        accessGranted: false,
        forceAccess: false,
        organization: detectedOrganization || null,
        organizations: detectedOrganization ? [detectedOrganization] : [],
        user: null,
        adminScope: '',
        permissions: { canManageInstructions: false, canCreateDocuments: false }
      };

      if (session && typeof session === 'object') {
        if (typeof session.role === 'string') {
          context.role = session.role;
        }
        if (typeof session.authenticated === 'boolean') {
          context.authenticated = session.authenticated;
        }
        if (typeof session.accessGranted === 'boolean') {
          context.accessGranted = session.accessGranted;
        }
        if (typeof session.forceAccess === 'boolean') {
          context.forceAccess = session.forceAccess;
        }
        if (session.organization) {
          context.organization = session.organization;
        }
        if (Array.isArray(session.organizations)) {
          context.organizations = session.organizations.slice();
        } else if (context.organization) {
          context.organizations = [context.organization];
        }
        if (session.user && typeof session.user === 'object') {
          context.user = session.user;
        }
        if (typeof session.adminScope === 'string') {
          context.adminScope = session.adminScope;
        }
        if (session.permissions && typeof session.permissions === 'object') {
          var permissions = context.permissions || {};
          for (var key in session.permissions) {
            if (!Object.prototype.hasOwnProperty.call(session.permissions, key)) {
              continue;
            }
            if (typeof session.permissions[key] === 'boolean') {
              permissions[key] = session.permissions[key];
            }
          }
          if (!Object.prototype.hasOwnProperty.call(permissions, 'canManageInstructions')) {
            permissions.canManageInstructions = false;
          }
          if (!Object.prototype.hasOwnProperty.call(permissions, 'canCreateDocuments')) {
            permissions.canCreateDocuments = false;
          }
          context.permissions = permissions;
        }
      }

      if (context.authenticated && context.role === 'admin' && !context.accessGranted) {
        if (!context.organization && detectedOrganization) {
          context.organization = detectedOrganization;
        }
        if (!Array.isArray(context.organizations) || !context.organizations.length) {
          context.organizations = context.organization ? [context.organization] : [];
        }
        if (context.organization && context.organizations.length) {
          context.accessGranted = true;
        }
      }

      documentsAccessContext = context;
      documentsLogoutAvailable = Boolean(context && context.authenticated && context.accessGranted);
      if (!documentsLogoutAvailable) {
        documentsLogoutInProgress = false;
        documentsRefreshInProgress = false;
      }
      syncDocumentsControls();

      if (typeof window !== 'undefined') {
        window.documentsAccessContext = context;
        if (typeof window.dispatchEvent === 'function') {
          try {
            var accessEvent = null;
            if (typeof window.CustomEvent === 'function') {
              accessEvent = new CustomEvent('documentsAccessContextChanged', { detail: { context: context } });
            } else if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
              accessEvent = document.createEvent('Event');
              accessEvent.initEvent('documentsAccessContextChanged', false, false);
              accessEvent.detail = { context: context };
            }
            if (accessEvent) {
              window.dispatchEvent(accessEvent);
            }
          } catch (dispatchError) {
            // ignore event dispatch issues
          }
        }
      }

      return context;
    }

    function applySessionAuthenticationFlag(session) {
      var context = updateDocumentsAccessContext(session);
      if (context.authenticated && context.accessGranted) {
        documentsAuthenticated = true;
        persistDocumentsAuthentication();
      } else {
        clearDocumentsAuthentication();
      }
      return context;
    }

    function fetchDocumentsSessionInfo() {
      if (!detectedOrganization) {
        return Promise.resolve(applySessionAuthenticationFlag(null));
      }

      if (documentsSessionPromise) {
        return documentsSessionPromise;
      }

      var url = 'docs.php?action=session_info&organization=' + encodeURIComponent(detectedOrganization) + '&_=' + Date.now();

      documentsSessionPromise = fetch(url, { credentials: 'same-origin' })
        .then(function(response) {
          if (!response.ok) {
            throw new Error('Не удалось получить данные сессии.');
          }
          return response.json();
        })
        .then(function(payload) {
          var session = payload && payload.session ? payload.session : null;
          return applySessionAuthenticationFlag(session);
        })
        .catch(function(error) {
          return applySessionAuthenticationFlag(null);
        })
        .finally(function() {
          documentsSessionPromise = null;
        });

      return documentsSessionPromise;
    }

    function authenticateDocumentsSession(login, password) {
      if (!detectedOrganization) {
        return Promise.reject(new Error('Организация для этой страницы не определена.'));
      }


      return fetch('docs.php?action=login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization: detectedOrganization,
          login: login,
          password: password
        })
      })
        .then(function(response) {
          if (!response.ok) {
            return response.json().catch(function() {
              return {};
            }).then(function(payload) {
              var message = payload && payload.error ? String(payload.error) : 'Не удалось подтвердить доступ.';
              throw new Error(message);
            });
          }
          return response.json();
        })
        .then(function(payload) {
          if (payload && payload.session && payload.session.authenticated) {
            return applySessionAuthenticationFlag(payload.session);
          }
          if (!payload || payload.success !== true) {
            var message = payload && payload.error ? String(payload.error) : 'Не удалось подтвердить доступ.';
            throw new Error(message);
          }
          var session = payload.session || null;
          return applySessionAuthenticationFlag(session);
        })
        .catch(function(error) {
          logDocumentsDebug('documents_session_authenticate_fallback', {
            login: login,
            message: error && error.message ? error.message : 'unknown_error'
          });
          return fetchDocumentsSessionInfo()
            .then(function(context) {
              if (context && context.authenticated && context.accessGranted) {
                logDocumentsDebug('documents_session_authenticate_fallback_success', {
                  login: login
                });
                return context;
              }
              throw error;
            });
        });
    }

    function handleDocumentsLogout(event) {
      if (event) {
        event.preventDefault();
      }
      if (documentsLogoutInProgress || !documentsLogoutButton || !documentsLogoutAvailable) {
        return;
      }

      documentsLogoutInProgress = true;
      syncDocumentsControls();

      fetch('docs.php?action=logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
        .then(function(response) {
          if (!response.ok) {
            return response.json().catch(function() {
              return {};
            }).then(function(payload) {
              var message = payload && payload.error ? String(payload.error) : 'Не удалось выйти из документооборота.';
              throw new Error(message);
            });
          }
          return response.json().catch(function() {
            return {};
          });
        })
        .then(function(payload) {
          clearDocumentsAuthentication();
          applySessionAuthenticationFlag(null);
          closeDocuments();
          var message = payload && payload.message ? String(payload.message) : 'Вы вышли из документооборота.';
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(message);
          }
        })
        .catch(function(error) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(error && error.message ? error.message : 'Не удалось выйти из документооборота. Попробуйте ещё раз.');
          }
        })
        .finally(function() {
          documentsLogoutInProgress = false;
          syncDocumentsControls();
        });
    }

    function handleDocumentsRefresh(event) {
      if (event) {
        event.preventDefault();
      }
      if (documentsRefreshInProgress || !documentsRefreshButton || !documentsLogoutAvailable || !documentsOpen) {
        return;
      }

      documentsRefreshInProgress = true;
      syncDocumentsControls();

      var refreshPromise = null;
      try {
        if (typeof window !== 'undefined' && typeof window.refreshDocumentsRegistry === 'function') {
          refreshPromise = window.refreshDocumentsRegistry();
        }
      } catch (refreshError) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Ошибка обновления реестра документов:', refreshError);
        }
      }

      var finalizeRefresh = function() {
        documentsRefreshInProgress = false;
        syncDocumentsControls();
      };

      if (refreshPromise && typeof refreshPromise.then === 'function') {
        refreshPromise.then(function() {
          finalizeRefresh();
        }, function(error) {
          if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error('Не удалось обновить реестр документов:', error);
          }
          finalizeRefresh();
        });
      } else {
        finalizeRefresh();
      }
    }

    updateDocumentsAccessContext(null);
    fetchDocumentsSessionInfo().catch(function() {});

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(ADMIN_ACCESS_EVENT, function(event) {
        var detailState = event && event.detail && event.detail.state ? event.detail.state : null;
        adminAccessState = cloneAdminAccessState(detailState);
      });
    }

    function loadDocumentsCredentials() {
      if (documentsCredentialsCache !== null) {
        return Promise.resolve(documentsCredentialsCache);
      }
      if (!detectedOrganization) {
        documentsCredentialsCache = null;
        return Promise.resolve(null);
      }
      if (documentsCredentialsPromise) {
        return documentsCredentialsPromise;
      }

    function normalizeLoginForDocuments(value) {
      return typeof value === 'string' ? value.trim().toLowerCase() : '';
    }

    function sanitizeAllowedLogins(entries) {
      if (!Array.isArray(entries) || entries.length === 0) {
        return [];
      }

      var seen = Object.create(null);
      var sanitized = [];

      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i];
        if (!entry || typeof entry.login !== 'string' || typeof entry.password !== 'string') {
          continue;
        }
        var loginValue = entry.login.trim();
        if (!loginValue) {
          continue;
        }
        var normalized = normalizeLoginForDocuments(loginValue);
        if (!normalized || seen[normalized]) {
          continue;
        }
        seen[normalized] = true;
        sanitized.push({ login: loginValue, password: entry.password });
      }

      return sanitized;
    }

    function normalizeDocumentsCredentials(credentials) {
      if (!credentials || typeof credentials !== 'object') {
        return null;
      }

      var allowed = [];

      if (Array.isArray(credentials.allowedLogins)) {
        allowed = sanitizeAllowedLogins(credentials.allowedLogins);
      } else if (typeof credentials.login === 'string' && typeof credentials.password === 'string') {
        allowed = sanitizeAllowedLogins([{ login: credentials.login, password: credentials.password }]);
      }

      var allowAny = false;
      if (typeof credentials.allowAnyLogin === 'boolean') {
        allowAny = credentials.allowAnyLogin;
      } else {
        allowAny = allowed.length === 0;
      }

      if (allowed.length === 0 && !allowAny) {
        return null;
      }

      return {
        allowedLogins: allowed,
        allowAnyLogin: allowAny
      };
    }

    function hasAllowedLogins(credentials) {
      return Boolean(credentials && Array.isArray(credentials.allowedLogins) && credentials.allowedLogins.length > 0);
    }

    function isAllowAny(credentials) {
      return Boolean(credentials && credentials.allowAnyLogin);
    }

    function cacheCredentials(credentials) {
      documentsCredentialsCache = normalizeDocumentsCredentials(credentials);
      return documentsCredentialsCache;
    }

      function fetchMainadminCredentials() {
        var url = 'mainadmin.php?organization=' + encodeURIComponent(detectedOrganization) + '&_=' + Date.now();

        return fetch(url, { credentials: 'same-origin' })
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Не удалось получить данные администратора.');
            }
            return response.json();
          })
          .then(function(payload) {
            if (!payload || payload.success !== true) {
              var message = payload && payload.error ? String(payload.error) : 'Не удалось получить данные администратора.';
              throw new Error(message);
            }
            var data = payload.data || {};
            var collected = [];
            var seen = Object.create(null);

            function addCandidate(login, password) {
              var loginTrimmed = typeof login === 'string' ? login.trim() : '';
              var passwordValue = typeof password === 'string' ? password : '';
              if (!loginTrimmed || !passwordValue) {
                return;
              }
              var normalized = loginTrimmed.toLowerCase();
              if (seen[normalized]) {
                return;
              }
              seen[normalized] = true;
              collected.push({ login: loginTrimmed, password: passwordValue });
            }

            addCandidate(data.login, data.password);

            // Для документооборота используем только "свой" блок админов.
            // Логины из других блоков не добавляем, чтобы не было пересечений между карточками.
            var documentsBlockKey = 'blockOneUsers';
            var documentsBlock = Array.isArray(data[documentsBlockKey]) ? data[documentsBlockKey] : [];
            for (var d = 0; d < documentsBlock.length; d += 1) {
              var documentsEntry = documentsBlock[d];
              if (!documentsEntry || typeof documentsEntry !== 'object') {
                continue;
              }
              addCandidate(documentsEntry.login, documentsEntry.password);
            }

            if (collected.length === 0) {
              return null;
            }

            return {
              allowedLogins: collected,
              allowAnyLogin: false
            };
          })
          .catch(function(error) {
            throw error;
          });
      }

      function normalizeOrganizationSlug(value) {
        if (typeof value !== 'string') {
          return '';
        }
        return value.trim().toLowerCase();
      }

      function fetchSettingsDocsCredentials() {
        var organizationSlug = normalizeOrganizationSlug(detectedOrganization);
        if (!organizationSlug) {
          return Promise.resolve({ allowAnyLogin: true, allowedLogins: [] });
        }

        var url = 'documents/' + encodeURIComponent(organizationSlug) + '/settingsdocs.json?_=' + Date.now();

        return fetch(url, {
          cache: 'no-store',
          credentials: 'same-origin'
        })
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Не удалось получить настройки документооборота.');
            }
            return response.json();
          })
          .then(function(payload) {
            if (!payload || typeof payload !== 'object') {
              return null;
            }

            var sections = [];
            var keys = Object.keys(payload);
            for (var i = 0; i < keys.length; i += 1) {
              var value = payload[keys[i]];
              if (Array.isArray(value)) {
                sections.push(value);
              }
            }

            if (sections.length === 0 && Array.isArray(payload)) {
              sections.push(payload);
            }

            var collected = [];
            var seenLogins = Object.create(null);

            for (var s = 0; s < sections.length; s += 1) {
              var section = sections[s];
              for (var j = 0; j < section.length; j += 1) {
                var candidate = section[j];
                if (!candidate || typeof candidate !== 'object') {
                  continue;
                }

                var loginValue = typeof candidate.login === 'string' ? candidate.login.trim() : '';
                var passwordValue = '';

                if (typeof candidate.password === 'string' && candidate.password.trim() !== '') {
                  passwordValue = candidate.password;
                } else if (typeof candidate.passwordHash === 'string' && candidate.passwordHash.trim() !== '') {
                  passwordValue = candidate.passwordHash;
                } else if (typeof candidate.password_hash === 'string' && candidate.password_hash.trim() !== '') {
                  passwordValue = candidate.password_hash;
                }

                if (loginValue && passwordValue) {
                  var normalizedLogin = normalizeLoginForDocuments(loginValue);
                  if (normalizedLogin && !seenLogins[normalizedLogin]) {
                    seenLogins[normalizedLogin] = true;
                    collected.push({ login: loginValue, password: passwordValue });
                  }
                }
              }
            }

            if (collected.length > 0) {
              return { allowedLogins: collected, allowAnyLogin: false };
            }

            return { allowedLogins: [], allowAnyLogin: true };
          })
          .catch(function(error) {
            return null;
          });
      }

      var mergedAllowedLogins = [];
      var mergedAllowAnyLogin = false;
      var mergedSeenLogins = Object.create(null);

      function includeCredentials(credentials, sourceLabel) {
        var normalized = normalizeDocumentsCredentials(credentials);
        if (!normalized) {
          return;
        }

        var entries = Array.isArray(normalized.allowedLogins) ? normalized.allowedLogins : [];
        if (entries.length > 0) {

          for (var i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (!entry || typeof entry.login !== 'string') {
              continue;
            }
            var normalizedLogin = normalizeLoginForDocuments(entry.login);
            if (!normalizedLogin || mergedSeenLogins[normalizedLogin]) {
              continue;
            }
            mergedSeenLogins[normalizedLogin] = true;
            mergedAllowedLogins.push({ login: entry.login, password: entry.password });
          }
        } else if (normalized.allowAnyLogin && !mergedAllowedLogins.length) {
          mergedAllowAnyLogin = true;
        }
      }

      function finalizeMergedCredentials() {
        if (!mergedAllowedLogins.length && !mergedAllowAnyLogin) {
          return cacheCredentials(null);
        }

        var result = {
          allowedLogins: mergedAllowedLogins.slice(),
          allowAnyLogin: mergedAllowAnyLogin && mergedAllowedLogins.length === 0
        };

        return cacheCredentials(result);
      }

      documentsCredentialsPromise = fetchMainadminCredentials()
        .catch(function() {
          return null;
        })
        .then(function(mainadminCredentials) {
          if (hasAllowedLogins(mainadminCredentials) || isAllowAny(mainadminCredentials)) {
            includeCredentials(mainadminCredentials, 'mainadmin.php');
          }
          return fetchSettingsDocsCredentials();
        })
        .then(function(settingsCredentials) {
          if (hasAllowedLogins(settingsCredentials) || isAllowAny(settingsCredentials)) {
            includeCredentials(settingsCredentials, 'settingsdocs.json');
          }
          return finalizeMergedCredentials();
        })
        .catch(function(error) {
          documentsCredentialsCache = null;
          throw error;
        })
        .finally(function() {
          documentsCredentialsPromise = null;
        });

      return documentsCredentialsPromise;
    }

    function ensureDocumentsAccess(event) {
      if (documentsOpen) {
        return;
      }

      if (event) {
        event.preventDefault();
      }

      if (documentsAccessInProgress) {
        return;
      }

      if (documentsAuthenticated && documentsAccessContext && documentsAccessContext.authenticated && documentsAccessContext.accessGranted) {
        openDocuments();
        return;
      }

      documentsAccessInProgress = true;

      fetchDocumentsSessionInfo()
        .catch(function() {
          return documentsAccessContext;
        })
        .then(function(context) {
          if (context && context.authenticated && context.accessGranted) {
            openDocuments();
            return null;
          }

          return loadDocumentsCredentials().then(function(credentials) {
            var loginOptions = credentials && typeof credentials === 'object'
              ? credentials
              : { allowAnyLogin: true, allowedLogins: [] };

            if (!documentsLoginManager || typeof documentsLoginManager.open !== 'function') {
              logDocumentsDebug('documents_login_modal_missing', {
                allowAnyLogin: loginOptions && !!loginOptions.allowAnyLogin,
                allowedLoginsCount: loginOptions && Array.isArray(loginOptions.allowedLogins)
                  ? loginOptions.allowedLogins.length
                  : 0
              });
              var fallbackAdmin = {
                role: 'admin',
                authenticated: true,
                accessGranted: true,
                forceAccess: true,
                organization: detectedOrganization || null,
                organizations: detectedOrganization ? [detectedOrganization] : []
              };
              applySessionAuthenticationFlag(fallbackAdmin);
              openDocuments();
              return null;
            }

            return documentsLoginManager.open(loginOptions).then(function(result) {
              logDocumentsDebug('documents_login_modal_result', {
                success: result && !!result.success,
                cancelled: result && !!result.cancelled,
                loginProvided: result && typeof result.login === 'string' && result.login.trim() !== '',
                allowAnyLogin: loginOptions.allowAnyLogin,
                allowedLoginsCount: Array.isArray(loginOptions.allowedLogins) ? loginOptions.allowedLogins.length : 0
              });
              if (!result || !result.success) {
                return null;
              }

              logDocumentsDebug('documents_session_authenticate_start', {
                login: result.login,
                hasPassword: typeof result.password === 'string' && result.password !== ''
              });
              return authenticateDocumentsSession(result.login, result.password)
                .then(function(contextAfterLogin) {
                  logDocumentsDebug('documents_session_authenticate_result', {
                    login: result.login,
                    authenticated: Boolean(contextAfterLogin && contextAfterLogin.authenticated),
                    accessGranted: Boolean(contextAfterLogin && contextAfterLogin.accessGranted)
                  });
                  if (contextAfterLogin && contextAfterLogin.authenticated && contextAfterLogin.accessGranted) {
                    openDocuments();
                    return null;
                  }
                  logDocumentsDebug('documents_session_authenticate_denied', {
                    login: result.login,
                    authenticated: Boolean(contextAfterLogin && contextAfterLogin.authenticated),
                    accessGranted: Boolean(contextAfterLogin && contextAfterLogin.accessGranted)
                  });
                  throw new Error('Доступ к документам ограничен.');
                })
                .catch(function(error) {
                  logDocumentsDebug('documents_session_authenticate_error', {
                    login: result.login,
                    message: error && error.message ? error.message : 'unknown_error'
                  });
                  throw error;
                });
            });
          });
        })
        .catch(function(error) {
          logDocumentsDebug('documents_access_error', {
            message: error && error.message ? error.message : 'access_failed'
          });
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(error && error.message ? error.message : 'Не удалось получить доступ к документообороту.');
          }
        })
        .finally(function() {
          documentsAccessInProgress = false;
        });
    }

    var materialsRequestOverlay = null;
    var materialsRequestClose = null;
    var materialsRequestRoot = null;
    var materialsRequestOpen = false;
    var materialsRequestScriptPromise = null;
    var lastMaterialsRequestTrigger = null;

    function buildMaterialsRequestTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--materials map-tile--materials-request';
      tile.id = 'materials-request-tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', 'Открыть Заявку материалов');

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Заявка материалов';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = 'новое';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--materials';

      var content = document.createElement('div');
      content.className = 'map-tile__materials-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__materials-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\uD83D\uDCDD';

      var text = document.createElement('span');
      text.className = 'map-tile__materials-text';
      text.textContent = 'Открыть заявки на материалы';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function buildMaterialsTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--materials';
      tile.id = 'materials-tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', 'Открыть панель материалов');

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Материалы';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(в разработке)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--materials';

      var content = document.createElement('div');
      content.className = 'map-tile__materials-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__materials-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\uD83D\uDCE6';

      var text = document.createElement('span');
      text.className = 'map-tile__materials-text';
      text.textContent = 'Открыть панель материалов';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function buildDocumentsTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--documents';
      tile.id = 'documents-tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', 'Открыть Документооборот');

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Документооборот';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(в разработке)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--documents';

      var content = document.createElement('div');
      content.className = 'map-tile__documents-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__documents-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\uD83D\uDDC2\uFE0F';

      var text = document.createElement('span');
      text.className = 'map-tile__documents-text';
      text.textContent = 'Открыть пространство документов';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function ensureZa9vkaStyles() {
      if (document.getElementById('za9vka-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'za9vka-style';
      link.rel = 'stylesheet';
      link.href = 'css/za9vka.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureZa9vkaScript() {
      if (typeof window.startZa9vka === 'function') {
        return Promise.resolve(window.startZa9vka);
      }
      if (materialsRequestScriptPromise) {
        return materialsRequestScriptPromise;
      }
      materialsRequestScriptPromise = new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = 'js/za9vka/za9vka.js?v=' + Date.now();
        script.async = true;

        script.onload = function() {
          if (typeof window.startZa9vka === 'function') {
            resolve(window.startZa9vka);
          } else {
            materialsRequestScriptPromise = null;
            reject(new Error('Скрипт za9vka.js загружен, но функция инициализации не найдена'));
          }
        };

        script.onerror = function() {
          materialsRequestScriptPromise = null;
          reject(new Error('Не удалось загрузить модуль заявки материалов'));
        };

        document.head.appendChild(script);
      });

      return materialsRequestScriptPromise;
    }

    function buildTabelTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--tabel';
      tile.id = 'tabel-tile';

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Табель';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(тестирование)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--tabel';

      var content = document.createElement('div');
      content.className = 'map-tile__tabel-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__tabel-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\u23F3';

      var text = document.createElement('span');
      text.className = 'map-tile__tabel-text';
      text.textContent = 'Открыть табель';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function buildAllTrackTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--alltrack';
      tile.id = 'alltrack-tile';

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'AllTrack';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(в разработке)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--alltrack';

      var content = document.createElement('div');
      content.className = 'map-tile__alltrack-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__alltrack-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\uD83E\uDDF0';

      var text = document.createElement('span');
      text.className = 'map-tile__alltrack-text';
      text.textContent = 'Перемещение инструмента';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function buildOhranaTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--ohrana';
      tile.id = 'ohrana-tile';

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Охрана труда';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(в разработке)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--ohrana';

      var content = document.createElement('div');
      content.className = 'map-tile__ohrana-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__ohrana-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '🦺';

      var text = document.createElement('span');
      text.className = 'map-tile__ohrana-text';
      text.textContent = 'Журнал инструктажей и доступов';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function buildZavodTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--zavod';
      tile.id = 'zavod-tile';

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Завод';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(в разработке)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--zavod';

      var content = document.createElement('div');
      content.className = 'map-tile__zavod-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__zavod-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '🏭';

      var text = document.createElement('span');
      text.className = 'map-tile__zavod-text';
      text.textContent = 'Планирование и контроль заводских задач';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function ensureTabelStyles() {
      if (document.getElementById('tabel-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'tabel-style';
      link.rel = 'stylesheet';
      link.href = 'css/tabel.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureScriptFile(id, src) {
      return new Promise(function(resolve, reject) {
        var script = document.getElementById(id);
        if (script && script.dataset.loaded === 'true') {
          resolve();
          return;
        }
        if (!script) {
          script = document.createElement('script');
          script.id = id;
          script.src = src;
          script.async = true;
          document.head.appendChild(script);
        }
        function handleLoad() {
          script.dataset.loaded = 'true';
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
          resolve();
        }
        function handleError() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
          reject(new Error('Не удалось загрузить скрипт: ' + src));
        }
        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
      });
    }

    function ensureTabelScript() {
      if (typeof window.startTabel === 'function' && document.getElementById('tabel-script-extra')) {
        return Promise.resolve(window.startTabel);
      }

      if (tabelScriptPromise) {
        return tabelScriptPromise;
      }

      tabelScriptPromise = ensureScriptFile('tabel-script', 'js/tabel/tabelstart.js?v=' + Date.now())
        .then(function() {
          return ensureScriptFile('tabel-script-extra', 'js/tabel/tabelstartA.js?v=' + Date.now());
        })
        .then(function() {
          if (typeof window.startTabel === 'function') {
            return window.startTabel;
          }
          tabelScriptPromise = null;
          throw new Error('Скрипт табеля загружен, но инициализация не найдена');
        })
        .catch(function(error) {
          tabelScriptPromise = null;
          throw error;
        });

      return tabelScriptPromise;
    }

    function ensureAllTrackStyles() {
      if (document.getElementById('alltrack-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'alltrack-style';
      link.rel = 'stylesheet';
      link.href = '/css/AllTrackstart.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureAllTrackScript() {
      if (window.AllTrackStart && typeof window.AllTrackStart.open === 'function') {
        return Promise.resolve(window.AllTrackStart);
      }

      if (allTrackScriptPromise) {
        return allTrackScriptPromise;
      }

      ensureAllTrackStyles();

      allTrackScriptPromise = new Promise(function(resolve, reject) {
        var script = document.getElementById('alltrack-script');
        if (!script) {
          script = document.createElement('script');
          script.id = 'alltrack-script';
          script.src = '/js/alltrack/AllTrackstart.js?v=' + Date.now();
          script.async = true;
          document.head.appendChild(script);
        }

        function handleLoad() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);

          if (window.AllTrackStart && typeof window.AllTrackStart.open === 'function') {
            resolve(window.AllTrackStart);
          } else {
            allTrackScriptPromise = null;
            reject(new Error('Модуль AllTrack не найден.'));
          }
        }

        function handleError() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
          allTrackScriptPromise = null;
          reject(new Error('Не удалось загрузить модуль AllTrack.'));
        }

        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
      });

      return allTrackScriptPromise;
    }

    function ensureOhranaStyles() {
      if (document.getElementById('ohrana-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'ohrana-style';
      link.rel = 'stylesheet';
      link.href = '/css/Ohrana.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureOhranaScript() {
      if (window.OhranaApp && typeof window.OhranaApp.open === 'function') {
        return Promise.resolve(window.OhranaApp);
      }

      ensureOhranaStyles();

      return ensureScriptFile('ohrana-script', '/js/Ohrana/Ohrana.js?v=' + Date.now())
        .then(function() {
          if (window.OhranaApp && typeof window.OhranaApp.open === 'function') {
            return window.OhranaApp;
          }
          throw new Error('Модуль Охраны труда не найден.');
        });
    }

    function ensureZavodStyles() {
      if (document.getElementById('zavod-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'zavod-style';
      link.rel = 'stylesheet';
      link.href = '/css/Zavod.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureZavodScript() {
      if (window.ZavodApp && typeof window.ZavodApp.open === 'function') {
        return Promise.resolve(window.ZavodApp);
      }

      ensureZavodStyles();
      return ensureScriptFile('zavod-script', '/js/Zavod/Zavod.js?v=' + Date.now())
        .then(function() {
          if (window.ZavodApp && typeof window.ZavodApp.open === 'function') {
            return window.ZavodApp;
          }
          throw new Error('Модуль Завода не найден.');
        });
    }

    function ensureTabelOverlay() {
      if (
        tabelOverlay
        && tabelRoot
        && tabelCloseButton
        && tabelAdminButton
        && tabelLogoutButton
        && tabelSettingsButton
        && tabelRefreshButton
        && tabelUserName
        && tabelNowWorkingList
        && tabelWorks2dButton
        && tabelSalaryCalcButton
        && tabelAddSheetButton
        && tabelDeleteSheetButton
        && tabelOnlineButton
      ) {
        return;
      }

      var labels = getTabelPanelLabels();

      tabelOverlay = document.createElement('div');
      tabelOverlay.className = 'tabel-overlay';
      tabelOverlay.setAttribute('aria-hidden', 'true');
      tabelOverlay.setAttribute('role', 'dialog');
      tabelOverlay.setAttribute('aria-modal', 'true');

      var container = document.createElement('div');
      container.className = 'tabel-panel';

      var header = document.createElement('header');
      header.className = 'tabel-panel__header';

      var headerContent = document.createElement('div');
      headerContent.className = 'tabel-panel__title-group';

      var title = document.createElement('h2');
      title.className = 'tabel-panel__title';
      title.textContent = 'Табель · ' + (detectedOrganization || '');
      tabelTitle = title;

      var userInfo = document.createElement('div');
      userInfo.className = 'tabel-panel__user';

      var userLabel = document.createElement('span');
      userLabel.className = 'tabel-panel__user-label';
      userLabel.textContent = 'Вы';

      var userValue = document.createElement('span');
      userValue.className = 'tabel-panel__user-value';
      userValue.textContent = '—';
      tabelUserName = userValue;
      tabelUserInfo = userInfo;

      userInfo.appendChild(userLabel);
      userInfo.appendChild(userValue);

      var nowWorking = document.createElement('div');
      nowWorking.className = 'tabel-panel__now';
      var nowLabel = document.createElement('span');
      nowLabel.className = 'tabel-panel__now-label';
      nowLabel.textContent = 'Сейчас работает';
      var nowList = document.createElement('div');
      nowList.className = 'tabel-panel__now-list';
      nowList.textContent = 'никого';
      tabelNowWorkingBlock = nowWorking;
      tabelNowWorkingList = nowList;
      nowWorking.appendChild(nowLabel);
      nowWorking.appendChild(nowList);

      tabelWorks2dButton = document.createElement('button');
      tabelWorks2dButton.type = 'button';
      tabelWorks2dButton.className = 'tabel-panel__button tabel-panel__button--works2d';
      tabelWorks2dButton.textContent = 'Список работ 2Д';
      tabelWorks2dButton.setAttribute('aria-label', 'Открыть список работ 2Д');
      tabelWorks2dButton.hidden = true;
      tabelWorks2dButton.setAttribute('aria-hidden', 'true');
      tabelWorks2dButton.setAttribute('tabindex', '-1');

      tabelSalaryCalcButton = document.createElement('button');
      tabelSalaryCalcButton.type = 'button';
      tabelSalaryCalcButton.className = 'tabel-panel__button tabel-panel__button--salary-calc';
      tabelSalaryCalcButton.textContent = 'Расчёт ЗП';
      tabelSalaryCalcButton.setAttribute('aria-label', 'Открыть расчёт заработной платы');
      tabelSalaryCalcButton.hidden = true;
      tabelSalaryCalcButton.setAttribute('aria-hidden', 'true');
      tabelSalaryCalcButton.setAttribute('tabindex', '-1');

      tabelAddSheetButton = document.createElement('button');
      tabelAddSheetButton.type = 'button';
      tabelAddSheetButton.className = 'tabel-panel__button tabel-panel__button--add';
      if (labels.addText) {
        tabelAddSheetButton.textContent = labels.addText;
      }
      if (labels.addAriaLabel) {
        tabelAddSheetButton.setAttribute('aria-label', labels.addAriaLabel);
      }

      tabelDeleteSheetButton = document.createElement('button');
      tabelDeleteSheetButton.type = 'button';
      tabelDeleteSheetButton.className = 'tabel-panel__button tabel-panel__button--delete';
      if (labels.deleteText) {
        tabelDeleteSheetButton.textContent = labels.deleteText;
      }
      if (labels.deleteAriaLabel) {
        tabelDeleteSheetButton.setAttribute('aria-label', labels.deleteAriaLabel);
      }

      tabelOnlineButton = document.createElement('button');
      tabelOnlineButton.type = 'button';
      tabelOnlineButton.className = 'tabel-panel__button tabel-panel__button--online';

      var onlineText = document.createElement('span');
      onlineText.className = 'tabel-panel__online-text';
      if (labels.onlineText) {
        onlineText.textContent = labels.onlineText;
      }

      var onlineCounter = document.createElement('span');
      onlineCounter.className = 'tabel-panel__online-count';
      onlineCounter.textContent = '0';
      tabelOnlineCounter = onlineCounter;

      tabelOnlineButton.appendChild(onlineText);
      tabelOnlineButton.appendChild(onlineCounter);

      tabelAdminButton = document.createElement('button');
      tabelAdminButton.type = 'button';
      tabelAdminButton.className = 'tabel-panel__button tabel-panel__button--ghost';
      if (labels.adminText) {
        tabelAdminButton.textContent = labels.adminText;
      }

      tabelSettingsButton = document.createElement('button');
      tabelSettingsButton.type = 'button';
      tabelSettingsButton.className = 'tabel-panel__button tabel-panel__button--settings';
      if (labels.settingsText) {
        tabelSettingsButton.textContent = labels.settingsText;
      } else {
        tabelSettingsButton.textContent = 'Настройки';
      }

      tabelRefreshButton = document.createElement('button');
      tabelRefreshButton.type = 'button';
      tabelRefreshButton.className = 'tabel-panel__button tabel-panel__button--refresh';
      if (labels.refreshText) {
        tabelRefreshButton.textContent = labels.refreshText;
      } else {
        tabelRefreshButton.textContent = 'Обновить';
      }
      if (labels.refreshAriaLabel) {
        tabelRefreshButton.setAttribute('aria-label', labels.refreshAriaLabel);
      }

      tabelLogoutButton = document.createElement('button');
      tabelLogoutButton.type = 'button';
      tabelLogoutButton.className = 'tabel-panel__button tabel-panel__button--logout';
      if (labels.logoutText) {
        tabelLogoutButton.textContent = labels.logoutText;
      } else {
        tabelLogoutButton.textContent = 'Выйти';
      }
      if (labels.logoutAriaLabel) {
        tabelLogoutButton.setAttribute('aria-label', labels.logoutAriaLabel);
      } else {
        tabelLogoutButton.setAttribute('aria-label', 'Выйти для смены пользователя');
      }
      tabelLogoutButton.setAttribute('data-tooltip', 'Выйти для смены пользователя');

      tabelCloseButton = document.createElement('button');
      tabelCloseButton.type = 'button';
      tabelCloseButton.className = 'tabel-panel__button tabel-panel__button--close';
      if (labels.closeText && String(labels.closeText).trim()) {
        tabelCloseButton.textContent = String(labels.closeText).trim() === 'Закрыть' ? 'Свернуть' : labels.closeText;
      } else {
        tabelCloseButton.textContent = 'Свернуть';
      }
      if (labels.closeAriaLabel) {
        tabelCloseButton.setAttribute('aria-label', labels.closeAriaLabel);
      } else {
        tabelCloseButton.setAttribute('aria-label', 'Свернуть панель табеля');
      }

      headerContent.appendChild(title);
      headerContent.appendChild(userInfo);
      headerContent.appendChild(nowWorking);
      headerContent.appendChild(tabelWorks2dButton);
      headerContent.appendChild(tabelSalaryCalcButton);
      headerContent.appendChild(tabelAddSheetButton);
      headerContent.appendChild(tabelDeleteSheetButton);
      headerContent.appendChild(tabelOnlineButton);
      headerContent.appendChild(tabelAdminButton);
      headerContent.appendChild(tabelSettingsButton);
      headerContent.appendChild(tabelRefreshButton);
      headerContent.appendChild(tabelLogoutButton);
      headerContent.appendChild(tabelCloseButton);

      header.appendChild(headerContent);

      tabelRoot = document.createElement('div');
      tabelRoot.className = 'tabel-panel__body';
      tabelRoot.id = 'tabel-root';
      tabelRoot.setAttribute('role', 'region');
      tabelRoot.setAttribute('aria-label', 'Содержимое модуля табеля');

      container.appendChild(header);
      container.appendChild(tabelRoot);

      tabelOverlay.appendChild(container);

      tabelOverlay.addEventListener('mousedown', function(event) {
        if (event.target === tabelOverlay) {
          event.preventDefault();
        }
      });

      tabelLogoutButton.addEventListener('click', function(event) {
        event.preventDefault();
        logoutTabelAccess();
        closeTabel();
      });

      tabelCloseButton.addEventListener('click', function(event) {
        event.preventDefault();
        closeTabel();
      });

      tabelOverlay.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
        }
      });

      tabelOnlineButton.addEventListener('click', function(event) {
        event.preventDefault();
        openTabelOnlineModal();
      });

      document.body.appendChild(tabelOverlay);
    }

    function getTabelPanelLabels() {
      if (window.TabelPanelLabels && typeof window.TabelPanelLabels === 'object') {
        return window.TabelPanelLabels;
      }
      return {};
    }

    function resolveTabelUserName(access) {
      if (!access || typeof access !== 'object') {
        return '';
      }

      if (access.user && typeof access.user === 'object') {
        if (typeof access.user.fio === 'string' && access.user.fio.trim()) {
          return access.user.fio.trim();
        }
        if (typeof access.user.fullName === 'string' && access.user.fullName.trim()) {
          return access.user.fullName.trim();
        }
        if (typeof access.user.name === 'string' && access.user.name.trim()) {
          return access.user.name.trim();
        }
      }

      if (typeof access.name === 'string' && access.name.trim()) {
        return access.name.trim();
      }

      if (typeof access.login === 'string' && access.login.trim()) {
        return access.login.trim();
      }

      return '';
    }

    function resolveTabelUserLogin(access) {
      if (!access || typeof access !== 'object') {
        return '';
      }

      if (access.user && typeof access.user === 'object') {
        if (typeof access.user.login === 'string' && access.user.login.trim()) {
          return access.user.login.trim();
        }
      }

      if (typeof access.login === 'string' && access.login.trim()) {
        return access.login.trim();
      }

      return '';
    }

    function updateTabelUserInfo(access) {
      if (!tabelUserName) {
        return;
      }

      var name = resolveTabelUserName(access);
      tabelUserName.textContent = name || 'Неизвестно';
    }

    function updateTabelNowWorking(users) {
      if (!tabelNowWorkingList) {
        return;
      }

      var list = Array.isArray(users) ? users : [];
      var names = [];
      list.forEach(function(user) {
        var name = user && user.userName ? String(user.userName).trim() : '';
        if (!name) {
          return;
        }
        if (names.indexOf(name) === -1) {
          names.push(name);
        }
      });

      tabelNowWorkingList.innerHTML = '';
      if (!names.length) {
        tabelNowWorkingList.textContent = 'никого';
        return;
      }

      var maxVisible = 3;
      names.slice(0, maxVisible).forEach(function(name) {
        var chip = document.createElement('span');
        chip.className = 'tabel-panel__now-chip';
        chip.textContent = name;
        tabelNowWorkingList.appendChild(chip);
      });

      if (names.length > maxVisible) {
        var extra = document.createElement('span');
        extra.className = 'tabel-panel__now-more';
        extra.textContent = '+' + (names.length - maxVisible);
        tabelNowWorkingList.appendChild(extra);
      }
    }

    function formatTabelOnlineDuration(seconds) {
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

    function formatTabelOnlineTime(isoValue) {
      if (!isoValue) {
        return '—';
      }
      var date = new Date(isoValue);
      if (Number.isNaN(date.getTime())) {
        return '—';
      }
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function updateTabelOnlineCounter(count) {
      if (!tabelOnlineCounter) {
        return;
      }
      var safe = Math.max(0, Number(count) || 0);
      tabelOnlineCounter.textContent = safe;
    }

    function closeTabelOnlineModal() {
      if (tabelPresenceState.modal) {
        tabelPresenceState.modal.remove();
        tabelPresenceState.modal = null;
        tabelPresenceState.listContainer = null;
      }
      tabelPresenceState.buttonBusy = false;
    }

    function renderTabelOnlineList(users) {
      if (!tabelPresenceState.listContainer) {
        return;
      }
      tabelPresenceState.listContainer.innerHTML = '';
      if (!users || !users.length) {
        var empty = document.createElement('div');
        empty.className = 'tabel-online-empty';
        empty.textContent = 'Сейчас онлайн никого нет.';
        tabelPresenceState.listContainer.appendChild(empty);
        return;
      }

      var table = document.createElement('table');
      table.className = 'tabel-online-table';
      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      ['ФИО', 'Время входа', 'На странице'].forEach(function(label) {
        var th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      users.forEach(function(user) {
        var row = document.createElement('tr');
        var nameCell = document.createElement('td');
        nameCell.textContent = user.userName || 'Без имени';
        var timeCell = document.createElement('td');
        timeCell.textContent = formatTabelOnlineTime(user.startedAt);
        var durationCell = document.createElement('td');
        durationCell.textContent = formatTabelOnlineDuration(user.onlineSeconds || 0);
        row.appendChild(nameCell);
        row.appendChild(timeCell);
        row.appendChild(durationCell);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      tabelPresenceState.listContainer.appendChild(table);
    }

    function openTabelOnlineModal() {
      if (tabelPresenceState.buttonBusy) {
        return;
      }
      tabelPresenceState.buttonBusy = true;
      closeTabelOnlineModal();

      var modal = document.createElement('div');
      modal.className = 'tabel-online-modal';

      var panel = document.createElement('div');
      panel.className = 'tabel-online-panel';

      var header = document.createElement('div');
      header.className = 'tabel-online-panel__header';

      var title = document.createElement('div');
      title.className = 'tabel-online-panel__title';
      title.textContent = 'Кто сейчас онлайн';

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tabel-online-panel__close';
      closeBtn.textContent = 'Закрыть';
      closeBtn.addEventListener('click', closeTabelOnlineModal);

      header.appendChild(title);
      header.appendChild(closeBtn);

      var body = document.createElement('div');
      body.className = 'tabel-online-panel__body';
      tabelPresenceState.listContainer = body;

      panel.appendChild(header);
      panel.appendChild(body);
      modal.appendChild(panel);
      modal.addEventListener('click', function(event) {
        if (event.target === modal) {
          closeTabelOnlineModal();
        }
      });

      document.body.appendChild(modal);
      tabelPresenceState.modal = modal;

      fetchTabelOnlineUsers()
        .catch(function() { return []; })
        .then(function(users) {
          renderTabelOnlineList(users);
        })
        .finally(function() {
          tabelPresenceState.buttonBusy = false;
        });
    }

    function fetchTabelOnlineUsers() {
      if (!detectedOrganization) {
        updateTabelOnlineCounter(0);
        updateTabelNowWorking([]);
        return Promise.resolve([]);
      }
      var url = 'tabel_presence.php?organization=' + encodeURIComponent(detectedOrganization) + '&ts=' + Date.now();
      return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
        .then(function(response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.json();
        })
        .then(function(payload) {
          if (!payload || payload.success !== true) {
            updateTabelOnlineCounter(0);
            updateTabelNowWorking([]);
            return [];
          }
          var users = Array.isArray(payload.users) ? payload.users : [];
          updateTabelOnlineCounter(users.length);
          updateTabelNowWorking(users);
          if (tabelPresenceState.modal) {
            renderTabelOnlineList(users);
          }
          return users;
        })
        .catch(function() {
          updateTabelOnlineCounter(0);
          updateTabelNowWorking([]);
          if (tabelPresenceState.modal) {
            renderTabelOnlineList([]);
          }
          return [];
        });
    }

    function getTabelPresenceSessionId() {
      if (tabelPresenceState.sessionId) {
        return tabelPresenceState.sessionId;
      }
      var storageKey = detectedOrganization
        ? 'tabel.presence.' + sanitizeOrganizationForFileName(detectedOrganization).toLowerCase()
        : 'tabel.presence.global';
      if (window.sessionStorage) {
        var stored = '';
        try {
          stored = window.sessionStorage.getItem(storageKey) || '';
        } catch (storageError) {
          stored = '';
        }
        if (stored) {
          tabelPresenceState.sessionId = stored;
          return tabelPresenceState.sessionId;
        }
      }
      var randomId = '';
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        randomId = window.crypto.randomUUID();
      } else {
        randomId = 'sess-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
      }
      tabelPresenceState.sessionId = randomId;
      if (window.sessionStorage) {
        try {
          window.sessionStorage.setItem(storageKey, randomId);
        } catch (writeError) {
          // ignore
        }
      }
      return tabelPresenceState.sessionId;
    }

    function pingTabelPresence(access) {
      if (!detectedOrganization) {
        updateTabelOnlineCounter(0);
        return Promise.resolve([]);
      }

      var userName = resolveTabelUserName(access);
      if (!userName) {
        updateTabelOnlineCounter(0);
        return Promise.resolve([]);
      }

      var payload = {
        action: 'ping',
        organization: detectedOrganization,
        sessionId: getTabelPresenceSessionId(),
        userName: userName,
        userLogin: resolveTabelUserLogin(access)
      };

      return fetch('tabel_presence.php', {
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
        .catch(function() {
          return { success: false };
        })
        .then(function() {
          return fetchTabelOnlineUsers();
        });
    }

    function stopTabelPresenceTracking() {
      tabelPresenceState.active = false;
      if (tabelPresenceState.timerId) {
        clearInterval(tabelPresenceState.timerId);
        tabelPresenceState.timerId = null;
      }
      if (detectedOrganization && tabelPresenceState.sessionId) {
        fetch('tabel_presence.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'leave',
            organization: detectedOrganization,
            sessionId: tabelPresenceState.sessionId
          })
        }).catch(function() {});
      }
      updateTabelOnlineCounter(0);
      updateTabelNowWorking([]);
      closeTabelOnlineModal();
    }

    function startTabelPresenceTracking(access) {
      if (!detectedOrganization || !resolveTabelUserName(access)) {
        stopTabelPresenceTracking();
        return;
      }
      if (tabelPresenceState.active) {
        return;
      }
      tabelPresenceState.active = true;
      pingTabelPresence(access);
      tabelPresenceState.timerId = setInterval(function() {
        pingTabelPresence(access);
      }, 25000);
    }

    function ensureTabelLoginManager() {
      if (!tabelLoginManager) {
        tabelLoginManager = createTabelLoginModal(function(credentials) {
          return validateTabelCredentials(credentials.login, credentials.password, detectedOrganization)
            .then(function(access) {
              var nextState = updateTabelAccessState({
                authenticated: true,
                isAdmin: Boolean(access.isAdmin),
                login: access.login || credentials.login,
                name: access.name || '',
                user: access.user || null
              });

              return { success: true, user: nextState };
            });
        });
      }

      return tabelLoginManager;
    }

    function ensureTabelAccess() {
      if (tabelAccessState && tabelAccessState.authenticated) {
        return Promise.resolve(tabelAccessState);
      }

      return ensureTabelLoginManager().open().then(function(result) {
        if (result && result.user) {
          return updateTabelAccessState({
            authenticated: true,
            isAdmin: Boolean(result.user.isAdmin),
            login: result.user.login || '',
            name: result.user.name || '',
            user: result.user.user || null
          });
        }

        if (tabelAccessState && tabelAccessState.authenticated) {
          return tabelAccessState;
        }

        throw new Error('Вход отменён');
      });
    }

    function ensureAllTrackLoginManager() {
      if (!allTrackLoginManager) {
        allTrackLoginManager = createAllTrackLoginModal(function(credentials) {
          return validateAllTrackCredentials(credentials.login, credentials.password, detectedOrganization)
            .then(function(access) {
              return updateAllTrackAccessState({
                authenticated: true,
                login: access.login || credentials.login,
                name: access.name || ''
              });
            });
        });
      }

      return allTrackLoginManager;
    }

    function ensureAllTrackAccess() {
      if (allTrackAccessState && allTrackAccessState.authenticated) {
        return Promise.resolve(allTrackAccessState);
      }

      return ensureAllTrackLoginManager().open().then(function(result) {
        if (result && result.login) {
          return updateAllTrackAccessState({
            authenticated: true,
            login: result.login,
            name: result.name || ''
          });
        }

        if (allTrackAccessState && allTrackAccessState.authenticated) {
          return allTrackAccessState;
        }

        throw new Error('Вход отменён');
      });
    }

    function ensureOhranaLoginManager() {
      if (!ohranaLoginManager) {
        ohranaLoginManager = createOhranaLoginModal(function(credentials) {
          return validateOhranaCredentials(credentials.login, credentials.password, detectedOrganization)
            .then(function(access) {
              return updateOhranaAccessState({
                authenticated: true,
                login: access.login || credentials.login,
                name: access.name || ''
              });
            });
        });
      }

      return ohranaLoginManager;
    }

    function ensureOhranaAccess() {
      if (ohranaAccessState && ohranaAccessState.authenticated) {
        return Promise.resolve(ohranaAccessState);
      }

      return ensureOhranaLoginManager().open().then(function(result) {
        if (result && result.login) {
          return updateOhranaAccessState({
            authenticated: true,
            login: result.login,
            name: result.name || ''
          });
        }

        if (ohranaAccessState && ohranaAccessState.authenticated) {
          return ohranaAccessState;
        }

        throw new Error('Вход отменён');
      });
    }

    function ensureZavodLoginManager() {
      if (!zavodLoginManager) {
        zavodLoginManager = createZavodLoginModal(function(credentials) {
          return validateZavodCredentials(credentials.login, credentials.password, detectedOrganization)
            .then(function(access) {
              return updateZavodAccessState({
                authenticated: true,
                login: access.login || credentials.login,
                name: access.name || ''
              });
            });
        });
      }
      return zavodLoginManager;
    }

    function ensureZavodAccess() {
      if (zavodAccessState && zavodAccessState.authenticated) {
        return Promise.resolve(zavodAccessState);
      }
      return ensureZavodLoginManager().open().then(function(result) {
        if (result && result.login) {
          return updateZavodAccessState({
            authenticated: true,
            login: result.login,
            name: result.name || ''
          });
        }
        if (zavodAccessState && zavodAccessState.authenticated) {
          return zavodAccessState;
        }
        throw new Error('Вход отменён');
      });
    }

    function ensureZa9vkaLoginManager() {
      if (!za9vkaLoginManager) {
        za9vkaLoginManager = createZa9vkaLoginModal(function(credentials) {
          return validateZa9vkaCredentials(credentials.login, credentials.password, detectedOrganization)
            .then(function(access) {
              var nextState = updateZa9vkaAccessState({
                authenticated: true,
                isAdmin: Boolean(access.isAdmin),
                login: access.login || credentials.login,
                name: access.name || '',
                user: access.user || null
              });

              return { success: true, user: nextState };
            });
        });
      }

      return za9vkaLoginManager;
    }

    function ensureZa9vkaAccess() {
      if (za9vkaAccessState && za9vkaAccessState.authenticated) {
        return Promise.resolve(za9vkaAccessState);
      }

      return ensureZa9vkaLoginManager().open().then(function(result) {
        if (result && result.user) {
          return updateZa9vkaAccessState({
            authenticated: true,
            isAdmin: Boolean(result.user.isAdmin),
            login: result.user.login || '',
            name: result.user.name || '',
            user: result.user.user || null
          });
        }

        if (za9vkaAccessState && za9vkaAccessState.authenticated) {
          return za9vkaAccessState;
        }

        throw new Error('Вход отменён');
      });
    }

    function buildEngineeringTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--engineering';
      tile.id = 'engineering-tile';

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Инженерная подготовка';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = '(в разработке)';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--engineering';

      var content = document.createElement('div');
      content.className = 'map-tile__engineering-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__engineering-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\u2699\uFE0F';

      var text = document.createElement('span');
      text.className = 'map-tile__engineering-text';
      text.textContent = 'Открыть раздел инженерной подготовки';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function ensureEngineeringStyles() {
      if (document.getElementById('engineering-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'engineering-style';
      link.rel = 'stylesheet';
      link.href = 'css/eng.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureEngineeringModule() {
      if (typeof window.BimEngineering === 'object' && window.BimEngineering) {
        if (!engineeringModuleInitialized && typeof window.BimEngineering.init === 'function') {
          window.BimEngineering.init({ organization: detectedOrganization || '' });
          engineeringModuleInitialized = true;
        } else if (typeof window.BimEngineering.init === 'function') {
          window.BimEngineering.init({ organization: detectedOrganization || '' });
        }
        return Promise.resolve(window.BimEngineering);
      }

      if (engineeringModulePromise) {
        return engineeringModulePromise;
      }

      ensureEngineeringStyles();

      engineeringModulePromise = new Promise(function(resolve, reject) {
        var script = document.getElementById('engineering-script');
        if (!script) {
          script = document.createElement('script');
          script.id = 'engineering-script';
          script.src = 'js/engineering/eng.js?v=' + Date.now();
          script.async = true;
          document.head.appendChild(script);
        }

        function handleLoad() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);

          if (typeof window.BimEngineering === 'object' && window.BimEngineering) {
            if (typeof window.BimEngineering.init === 'function') {
              window.BimEngineering.init({ organization: detectedOrganization || '' });
            }
            engineeringModuleInitialized = true;
            resolve(window.BimEngineering);
          } else {
            engineeringModulePromise = null;
            reject(new Error('Модуль инженерной подготовки не найден.'));
          }
        }

        function handleError() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
          engineeringModulePromise = null;
          reject(new Error('Не удалось загрузить модуль инженерной подготовки.'));
        }

        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
      });

      return engineeringModulePromise;
    }

    function openEngineeringModule(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      ensureEngineeringModule().then(function(module) {
        if (!module || typeof module.open !== 'function') {
          return;
        }
        module.open({
          organization: detectedOrganization || '',
          trigger: engineeringTile || null
        });
        if (cardNewsModal) {
          cardNewsModal.openForCard('Инженерная подготовка');
        }
      }).catch(function(error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Ошибка открытия инженерной подготовки:', error);
        }
      });
    }

    function buildFrontWorksTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--documents map-tile--frontworks';
      tile.id = 'front-works-tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', 'Открыть Фронт работ');

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Фронт работ';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = 'новое · в разработке';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--documents';

      var content = document.createElement('div');
      content.className = 'map-tile__documents-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__documents-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\u2692';

      var text = document.createElement('span');
      text.className = 'map-tile__documents-text';
      text.textContent = 'Открыть карточку фронта работ';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function ensureFrontWorksStyles() {
      if (document.getElementById('frontworks-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'frontworks-style';
      link.rel = 'stylesheet';
      link.href = 'css/FR.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureFrontWorksModule() {
      ensureFrontWorksStyles();

      if (typeof window.FrontWorks === 'object' && window.FrontWorks) {
        return Promise.resolve(window.FrontWorks);
      }

      if (frontWorksScriptPromise) {
        return frontWorksScriptPromise;
      }

      frontWorksScriptPromise = new Promise(function(resolve, reject) {
        var script = document.getElementById('frontworks-script');
        if (!script) {
          script = document.createElement('script');
          script.id = 'frontworks-script';
          script.src = 'js/FR/FR.js?v=' + Date.now();
          script.async = true;
          document.head.appendChild(script);
        }

        function handleLoad() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
          if (typeof window.FrontWorks === 'object' && window.FrontWorks) {
            resolve(window.FrontWorks);
          } else {
            frontWorksScriptPromise = null;
            reject(new Error('Модуль Фронт работ не найден'));
          }
        }

        function handleError() {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
          frontWorksScriptPromise = null;
          reject(new Error('Не удалось загрузить Фронт работ'));
        }

        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
      });

      return frontWorksScriptPromise;
    }

    function ensureFrontWorksLoginManager() {
      if (!frontWorksLoginManager) {
        frontWorksLoginManager = createFrontWorksLoginModal(function(credentials) {
          return validateFrontWorksCredentials(credentials.login, credentials.password, detectedOrganization)
            .then(function(access) {
              return updateFrontWorksAccessState({
                authenticated: true,
                isAdmin: Boolean(access.isAdmin),
                login: access.login || credentials.login,
                name: access.name || ''
              });
            });
        });
      }

      return frontWorksLoginManager;
    }

    function ensureFrontWorksAccess() {
      if (frontWorksAccessState && frontWorksAccessState.authenticated) {
        return Promise.resolve(frontWorksAccessState);
      }

      return ensureFrontWorksLoginManager().open().then(function(result) {
        if (result && result.login) {
          return updateFrontWorksAccessState({
            authenticated: true,
            isAdmin: Boolean(result.isAdmin),
            login: result.login,
            name: result.name || ''
          });
        }

        if (frontWorksAccessState && frontWorksAccessState.authenticated) {
          return frontWorksAccessState;
        }

        throw new Error('Вход отменён');
      });
    }

    function handleFrontWorksOpen(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      ensureFrontWorksAccess()
        .then(function(access) {
          return ensureFrontWorksModule()
            .then(function(module) {
              if (!module) {
                throw new Error('Модуль Фронт работ не найден');
              }

              var userName = access && access.name ? access.name : (access && access.login ? access.login : '');
              var accessPayload = {
                isAdmin: Boolean(access && access.isAdmin),
                userName: userName,
                onLogout: logoutFrontWorksAccess
              };

              if (typeof module.setAccess === 'function') {
                module.setAccess(accessPayload);
              }

              if (typeof module.open === 'function') {
                module.open(accessPayload);
              }

              if (cardNewsModal) {
                cardNewsModal.openForCard('Фронт работ', userName);
              }
            });
        })
        .catch(function(error) {
          if (error && error.message === 'Вход отменён') {
            return;
          }

          if (window.console && typeof window.console.error === 'function') {
            console.error(error);
          }
          window.alert(error && error.message ? error.message : 'Не удалось открыть Фронт работ');
        });
    }

    function buildIspDocsTile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--ispdocs';
      tile.id = 'ispdocs-tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', 'Открыть Исполнительную документацию');

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Исполнительная документация';

      var status = document.createElement('span');
      status.className = 'map-tile__status';
      status.textContent = 'новое';

      header.appendChild(title);
      header.appendChild(status);

      var body = document.createElement('div');
      body.className = 'map-tile__body';

      var content = document.createElement('div');
      content.className = 'ispdocs-tile__content';

      var icon = document.createElement('span');
      icon.className = 'ispdocs-tile__icon';
      icon.textContent = '📑';

      var text = document.createElement('div');
      text.className = 'ispdocs-tile__text';

      var textTitle = document.createElement('span');
      textTitle.className = 'ispdocs-tile__title';
      textTitle.textContent = 'Открыть кабинет документов';

      var subtitle = document.createElement('span');
      subtitle.className = 'ispdocs-tile__subtitle';
     

      text.appendChild(textTitle);
      text.appendChild(subtitle);

      content.appendChild(icon);
      content.appendChild(text);

      body.appendChild(content);
      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function handleIspDocsOpen(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (window.IspDocs && typeof window.IspDocs.open === 'function') {
        window.IspDocs.open(event && event.currentTarget);
        if (cardNewsModal) {
          cardNewsModal.openForCard('Исполнительная документация');
        }
      } else {
        window.alert('Модуль Исполнительной документации недоступен.');
      }
    }

    function ensureMaterialsRequestOverlay() {
      if (materialsRequestOverlay) {
        return;
      }

      materialsRequestOverlay = document.createElement('div');
      materialsRequestOverlay.id = 'materials-request-overlay';
      materialsRequestOverlay.className = 'za9vka-overlay';
      materialsRequestOverlay.setAttribute('role', 'dialog');
      materialsRequestOverlay.setAttribute('aria-modal', 'true');
      materialsRequestOverlay.setAttribute('aria-hidden', 'true');

      var container = document.createElement('div');
      container.className = 'za9vka-overlay__container';

      var header = document.createElement('header');
      header.className = 'za9vka-overlay__header';

      var title = document.createElement('h2');
      title.className = 'za9vka-overlay__title';
      title.textContent = 'Заявка материалов';

      var closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'za9vka-overlay__close';
      closeButton.textContent = 'Выйти';
      closeButton.setAttribute('aria-label', 'Закрыть модуль Заявка материалов');

      var body = document.createElement('div');
      body.className = 'za9vka-overlay__body';
      body.id = 'za9vka-root';
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', 'Содержимое модуля Заявка материалов');

      header.appendChild(title);
      header.appendChild(closeButton);

      container.appendChild(header);
      container.appendChild(body);
      materialsRequestOverlay.appendChild(container);

      materialsRequestOverlay.addEventListener('mousedown', function(event) {
        if (event.target === materialsRequestOverlay) {
          closeMaterialsRequest();
        }
      });

      closeButton.addEventListener('click', function(event) {
        event.preventDefault();
        closeMaterialsRequest();
      });

      materialsRequestOverlay.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          closeMaterialsRequest();
        }
      });

      document.body.appendChild(materialsRequestOverlay);

      materialsRequestClose = closeButton;
      materialsRequestRoot = body;
    }

    function openMaterialsRequest(event) {
      if (materialsRequestOpen) {
        return;
      }

      ensureZa9vkaStyles();
      ensureMaterialsRequestOverlay();

      materialsRequestOpen = true;
      var potentialTrigger = (event && event.currentTarget) ? event.currentTarget : document.activeElement;
      if (potentialTrigger && typeof potentialTrigger.focus === 'function') {
        lastMaterialsRequestTrigger = potentialTrigger;
      } else {
        lastMaterialsRequestTrigger = materialsRequestTile;
      }

      if (materialsRequestOverlay) {
        materialsRequestOverlay.classList.add('is-visible');
        materialsRequestOverlay.setAttribute('aria-hidden', 'false');
      }

      document.body.classList.add('za9vka-open');

      ensureZa9vkaScript()
        .then(function(startZa9vka) {
          if (typeof startZa9vka === 'function' && materialsRequestRoot) {
            try {
              startZa9vka(materialsRequestRoot);
            } catch (error) {
            }
          }
        })
        .catch(function(error) {
        });

      if (materialsRequestClose) {
        try {
          materialsRequestClose.focus({ preventScroll: true });
        } catch (focusError) {
          materialsRequestClose.focus();
        }
      }

      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }

    function closeMaterialsRequest() {
      if (!materialsRequestOpen) {
        return;
      }

      materialsRequestOpen = false;

      if (materialsRequestOverlay) {
        materialsRequestOverlay.classList.remove('is-visible');
        materialsRequestOverlay.setAttribute('aria-hidden', 'true');
      }

      document.body.classList.remove('za9vka-open');

      if (lastMaterialsRequestTrigger && typeof lastMaterialsRequestTrigger.focus === 'function') {
        try {
          lastMaterialsRequestTrigger.focus({ preventScroll: true });
        } catch (focusError) {
          lastMaterialsRequestTrigger.focus();
        }
      } else if (materialsRequestTile) {
        try {
          materialsRequestTile.focus({ preventScroll: true });
        } catch (fallbackError) {
          materialsRequestTile.focus();
        }
      }

      lastMaterialsRequestTrigger = null;
    }

    function openTabel(event) {
      if (tabelOpen) {
        return;
      }

      var trigger = event && event.currentTarget ? event.currentTarget : document.activeElement;

      ensureTabelAccess()
        .then(function(access) {
          ensureTabelStyles();
          return ensureTabelScript()
            .then(function(startTabel) {
              ensureTabelOverlay();
              tabelOpen = true;

              if (tabelTitle) {
                tabelTitle.textContent = 'Табель · ' + (detectedOrganization || '');
              }

              updateTabelUserInfo(access);

              if (tabelAdminButton) {
                if (access && access.isAdmin) {
                  tabelAdminButton.hidden = false;
                  tabelAdminButton.setAttribute('aria-hidden', 'false');
                  tabelAdminButton.setAttribute('tabindex', '0');
                } else {
                  tabelAdminButton.hidden = true;
                  tabelAdminButton.setAttribute('aria-hidden', 'true');
                  tabelAdminButton.setAttribute('tabindex', '-1');
                }
              }

              if (tabelDeleteSheetButton) {
                if (access && access.isAdmin) {
                  tabelDeleteSheetButton.hidden = false;
                  tabelDeleteSheetButton.setAttribute('aria-hidden', 'false');
                  tabelDeleteSheetButton.setAttribute('tabindex', '0');
                } else {
                  tabelDeleteSheetButton.hidden = true;
                  tabelDeleteSheetButton.setAttribute('aria-hidden', 'true');
                  tabelDeleteSheetButton.setAttribute('tabindex', '-1');
                }
              }

              if (trigger && typeof trigger.focus === 'function') {
                lastTabelTrigger = trigger;
              } else {
                lastTabelTrigger = tabelTile;
              }

              tabelOverlay.classList.add('is-visible');
              tabelOverlay.setAttribute('aria-hidden', 'false');
              document.body.classList.add('tabel-open');

              if (tabelWorks2dButton) {
                (function() {
                  var pageName = normalizePageName(window.location.pathname || '');
                  fetch('lg/settingsdostuporg.json?ts=' + Date.now(), {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache, no-store' }
                  })
                    .then(function(response) {
                      if (!response.ok) throw new Error('settings-not-found');
                      return response.json();
                    })
                    .then(function(payload) {
                      var items = Array.isArray(payload && payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
                      var hasConstructionHours = items.some(function(item) {
                        if (!item) return false;
                        var itemPage = normalizePageName(item.page || '');
                        if (pageName && itemPage && itemPage !== pageName) return false;
                        var settings = item && typeof item.settings === 'object' ? item.settings : {};
                        if (settings.constructionHours === true) return true;
                        var feature = typeof item.feature === 'string' ? item.feature.trim() : '';
                        return feature === '\u0427\u0430\u0441\u044b\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438' || feature === '\u0427\u0430\u0441\u044b\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0439';
                      });

                      if (hasConstructionHours) {
                        tabelWorks2dButton.hidden = false;
                        tabelWorks2dButton.setAttribute('aria-hidden', 'false');
                        tabelWorks2dButton.setAttribute('tabindex', '0');
                        tabelWorks2dButton.onclick = function(e) {
                          e.preventDefault();
                          window.dispatchEvent(new CustomEvent('tabel:open-works-2d', {
                            detail: { organization: detectedOrganization || '' }
                          }));
                        };
                        if (tabelSalaryCalcButton) {
                          tabelSalaryCalcButton.hidden = false;
                          tabelSalaryCalcButton.setAttribute('aria-hidden', 'false');
                          tabelSalaryCalcButton.setAttribute('tabindex', '0');
                          tabelSalaryCalcButton.onclick = function(e) {
                            e.preventDefault();
                            window.dispatchEvent(new CustomEvent('tabel:open-salary-calc', {
                              detail: { organization: detectedOrganization || '' }
                            }));
                          };
                        }
                      } else {
                        tabelWorks2dButton.hidden = true;
                        tabelWorks2dButton.setAttribute('aria-hidden', 'true');
                        tabelWorks2dButton.setAttribute('tabindex', '-1');
                        if (tabelSalaryCalcButton) {
                          tabelSalaryCalcButton.hidden = true;
                          tabelSalaryCalcButton.setAttribute('aria-hidden', 'true');
                          tabelSalaryCalcButton.setAttribute('tabindex', '-1');
                        }
                      }
                    })
                    .catch(function() {
                      tabelWorks2dButton.hidden = true;
                      tabelWorks2dButton.setAttribute('aria-hidden', 'true');
                      tabelWorks2dButton.setAttribute('tabindex', '-1');
                      if (tabelSalaryCalcButton) {
                        tabelSalaryCalcButton.hidden = true;
                        tabelSalaryCalcButton.setAttribute('aria-hidden', 'true');
                        tabelSalaryCalcButton.setAttribute('tabindex', '-1');
                      }
                    });
                })();
              }

              startTabelPresenceTracking(access);

              if (typeof startTabel === 'function' && tabelRoot) {
                var api = startTabel(tabelRoot, {
                  organization: detectedOrganization || '',
                  access: access || null,
                  onClose: closeTabel,
                  onAdmin: function() {
                    tabelAdminButton.classList.add('is-active');
                  },
                  onAdminClose: function() {
                    tabelAdminButton.classList.remove('is-active');
                  }
                }) || {};
                tabelApi = api;
                if (tabelApi && typeof tabelApi.startLiveSync === 'function') {
                  tabelApi.startLiveSync();
                }

                var handleAdmin = typeof api.openAdmin === 'function' ? api.openAdmin : null;
                var handleDeleteTimesheet = typeof api.deleteTimesheet === 'function'
                  ? api.deleteTimesheet
                  : null;
                var handleSettings = typeof api.openSettings === 'function'
                  ? api.openSettings
                  : null;
                var handleRefresh = typeof api.refreshData === 'function'
                  ? api.refreshData
                  : null;
                tabelAdminButton.onclick = function(adminEvent) {
                  adminEvent.preventDefault();
                  if (handleAdmin) {
                    handleAdmin();
                  }
                };

                if (tabelDeleteSheetButton) {
                  tabelDeleteSheetButton.onclick = function(event) {
                    event.preventDefault();
                    if (handleDeleteTimesheet) {
                      handleDeleteTimesheet();
                    }
                  };
                }

                if (tabelSettingsButton) {
                  tabelSettingsButton.onclick = function(event) {
                    event.preventDefault();
                    if (handleSettings) {
                      handleSettings();
                    }
                  };
                }

                if (tabelRefreshButton) {
                  tabelRefreshButton.onclick = function(event) {
                    event.preventDefault();
                    if (!handleRefresh) {
                      return;
                    }
                    var defaultLabel = tabelRefreshButton.dataset.defaultLabel
                      || tabelRefreshButton.textContent
                      || 'Обновить';
                    tabelRefreshButton.dataset.defaultLabel = defaultLabel;
                    tabelRefreshButton.disabled = true;
                    tabelRefreshButton.textContent = 'Обновляем…';
                    Promise.resolve(handleRefresh())
                      .catch(function() {
                        return null;
                      })
                      .finally(function() {
                        tabelRefreshButton.disabled = false;
                        tabelRefreshButton.textContent = defaultLabel;
                      });
                  };
                }
              } else {
                tabelApi = null;
              }

              if (cardNewsModal) {
                cardNewsModal.openForCard('Табель', access && (access.name || access.login) ? (access.name || access.login) : '');
              }

              if (tabelCloseButton) {
                try {
                  tabelCloseButton.focus({ preventScroll: true });
                } catch (focusError) {
                  tabelCloseButton.focus();
                }
              }
            });
        })
        .catch(function() {
          tabelOpen = false;
        });
    }

    function closeTabel() {
      if (!tabelOpen) {
        return;
      }

      tabelOpen = false;
      stopTabelPresenceTracking();
      if (tabelApi && typeof tabelApi.stopLiveSync === 'function') {
        tabelApi.stopLiveSync();
      }
      tabelApi = null;
      if (tabelOverlay) {
        tabelOverlay.classList.remove('is-visible');
        tabelOverlay.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('tabel-open');

      if (lastTabelTrigger && typeof lastTabelTrigger.focus === 'function') {
        try {
          lastTabelTrigger.focus({ preventScroll: true });
        } catch (error) {
          lastTabelTrigger.focus();
        }
      } else if (tabelTile && typeof tabelTile.focus === 'function') {
        try {
          tabelTile.focus({ preventScroll: true });
        } catch (error) {
          tabelTile.focus();
        }
      }

      lastTabelTrigger = null;
    }

    function ensureAllTrackModule() {
      return ensureAllTrackScript();
    }

    function openAllTrack(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      if (allTrackOpen) {
        return;
      }

      var trigger = event && event.currentTarget ? event.currentTarget : document.activeElement;

      ensureAllTrackAccess()
        .then(function(access) {
          return ensureAllTrackModule()
            .then(function(module) {
              if (!module || typeof module.open !== 'function') {
                throw new Error('Модуль AllTrack не найден');
              }

              if (trigger && typeof trigger.focus === 'function') {
                lastAllTrackTrigger = trigger;
              } else {
                lastAllTrackTrigger = allTrackTile;
              }

              allTrackOpen = true;
              var allTrackUserName = access && (access.name || access.login) ? (access.name || access.login) : '';
              module.open({
                organization: detectedOrganization || '',
                userName: allTrackUserName,
                onLogout: logoutAllTrackAccess,
                trigger: lastAllTrackTrigger,
                onClose: function() {
                  allTrackOpen = false;
                  if (lastAllTrackTrigger && typeof lastAllTrackTrigger.focus === 'function') {
                    try {
                      lastAllTrackTrigger.focus({ preventScroll: true });
                    } catch (focusError) {
                      lastAllTrackTrigger.focus();
                    }
                  }
                  lastAllTrackTrigger = null;
                }
              });

              if (cardNewsModal) {
                cardNewsModal.openForCard('AllTrack', allTrackUserName);
              }
            });
        })
        .catch(function(error) {
          if (error && error.message === 'Вход отменён') {
            return;
          }

          if (window.console && typeof window.console.error === 'function') {
            console.error(error);
          }
          window.alert(error && error.message ? error.message : 'Не удалось открыть AllTrack');
          allTrackOpen = false;
        });
    }

    function openOhrana(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      ensureOhranaAccess()
        .then(function(access) {
          return ensureOhranaScript().then(function(module) {
            if (!module || typeof module.open !== 'function') {
              throw new Error('Модуль Охраны труда не найден');
            }

            var ohranaUserName = access && (access.name || access.login) ? (access.name || access.login) : '';
            module.open({
              organization: detectedOrganization || '',
              userName: ohranaUserName,
              onLogout: logoutOhranaAccess,
              trigger: ohranaTile || null
            });

            if (cardNewsModal) {
              cardNewsModal.openForCard('Охрана труда', ohranaUserName);
            }
          });
        })
        .catch(function(error) {
          if (error && error.message === 'Вход отменён') {
            return;
          }
          window.alert(error && error.message ? error.message : 'Не удалось открыть Охрану труда');
        });
    }

    function openZavod(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      ensureZavodAccess()
        .then(function(access) {
          return ensureZavodScript().then(function(module) {
            if (!module || typeof module.open !== 'function') {
              throw new Error('Модуль Завода не найден');
            }

            var zavodUserName = access && (access.name || access.login) ? (access.name || access.login) : '';
            module.open({
              organization: detectedOrganization || '',
              userName: zavodUserName,
              onLogout: logoutZavodAccess,
              trigger: zavodTile || null
            });

            if (cardNewsModal) {
              cardNewsModal.openForCard('Завод', zavodUserName);
            }
          });
        })
        .catch(function(error) {
          if (error && error.message === 'Вход отменён') {
            return;
          }
          window.alert(error && error.message ? error.message : 'Не удалось открыть Завод');
        });
    }

    function buildProtocol2Tile() {
      var tile = document.createElement('div');
      tile.className = 'map-tile map-tile--protocol2';
      tile.id = 'protocol2-tile';

      var header = document.createElement('div');
      header.className = 'map-tile__header map-tile__header--stacked';

      var title = document.createElement('span');
      title.textContent = 'Протокол совещания';

      header.appendChild(title);

      var body = document.createElement('div');
      body.className = 'map-tile__body map-tile__body--protocol2';

      var content = document.createElement('div');
      content.className = 'map-tile__protocol2-content';

      var icon = document.createElement('span');
      icon.className = 'map-tile__protocol2-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '📝';

      var text = document.createElement('span');
      text.className = 'map-tile__protocol2-text';
      text.textContent = 'Учёт поручений по итогам совещаний';

      content.appendChild(icon);
      content.appendChild(text);
      body.appendChild(content);

      tile.appendChild(header);
      tile.appendChild(body);

      return tile;
    }

    function ensureProtocol2Styles() {
      if (document.getElementById('protocol2-style')) {
        return;
      }
      var link = document.createElement('link');
      link.id = 'protocol2-style';
      link.rel = 'stylesheet';
      link.href = 'css/protocol2.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    function ensureProtocol2Script() {
      if (window.Protocol2App && typeof window.Protocol2App.open === 'function') {
        return Promise.resolve(window.Protocol2App);
      }
      if (protocol2ScriptPromise) {
        return protocol2ScriptPromise;
      }
      ensureProtocol2Styles();
      protocol2ScriptPromise = ensureScriptFile('protocol2-script', 'js/protocol2/protocol2.js?v=' + Date.now())
        .then(function() {
          if (window.Protocol2App && typeof window.Protocol2App.open === 'function') {
            return window.Protocol2App;
          }
          protocol2ScriptPromise = null;
          throw new Error('Модуль «Протокол совещания» не найден.');
        })
        .catch(function(error) {
          protocol2ScriptPromise = null;
          throw error;
        });
      return protocol2ScriptPromise;
    }

    function openProtocol2(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      ensureProtocol2Script()
        .then(function(module) {
          module.open({
            organization: detectedOrganization || '',
            trigger: protocol2Tile || null
          });
        })
        .catch(function(error) {
          window.alert(error && error.message ? error.message : 'Не удалось открыть «Протокол совещания».');
        });
    }

    if (!materialsTile && interfaceTiles) {
      materialsTile = buildMaterialsTile();
      if (mapTile && mapTile.parentNode === interfaceTiles) {
        mapTile.insertAdjacentElement('afterend', materialsTile);
      } else {
        interfaceTiles.appendChild(materialsTile);
      }
    }

    ensureTileGroups();
    updateTileGroupVisibility();

    if (!documentsTile && interfaceTiles) {
      documentsTile = buildDocumentsTile();
      if (materialsTile && materialsTile.parentNode === interfaceTiles) {
        materialsTile.insertAdjacentElement('afterend', documentsTile);
      } else if (mapTile && mapTile.parentNode === interfaceTiles) {
        mapTile.insertAdjacentElement('afterend', documentsTile);
      } else {
        interfaceTiles.appendChild(documentsTile);
      }
    }

    if (!materialsRequestTile && interfaceTiles) {
      materialsRequestTile = buildMaterialsRequestTile();
      if (documentsTile && documentsTile.parentNode === interfaceTiles) {
        interfaceTiles.insertBefore(materialsRequestTile, documentsTile);
      } else {
        interfaceTiles.appendChild(materialsRequestTile);
      }
    }

    if (!tabelTile && interfaceTiles) {
      tabelTile = buildTabelTile();
      if (documentsTile && documentsTile.parentNode === interfaceTiles) {
        documentsTile.insertAdjacentElement('afterend', tabelTile);
      } else {
        interfaceTiles.appendChild(tabelTile);
      }
    }

    if (!allTrackTile && interfaceTiles) {
      allTrackTile = buildAllTrackTile();
      if (tabelTile && tabelTile.parentNode === interfaceTiles) {
        tabelTile.insertAdjacentElement('afterend', allTrackTile);
      } else if (documentsTile && documentsTile.parentNode === interfaceTiles) {
        documentsTile.insertAdjacentElement('afterend', allTrackTile);
      } else {
        interfaceTiles.appendChild(allTrackTile);
      }
    }

    if (!ohranaTile && interfaceTiles) {
      ohranaTile = buildOhranaTile();
      if (allTrackTile && allTrackTile.parentNode === interfaceTiles) {
        allTrackTile.insertAdjacentElement('afterend', ohranaTile);
      } else {
        interfaceTiles.appendChild(ohranaTile);
      }
    }

    if (!zavodTile && interfaceTiles) {
      zavodTile = buildZavodTile();
      if (ohranaTile && ohranaTile.parentNode === interfaceTiles) {
        ohranaTile.insertAdjacentElement('afterend', zavodTile);
      } else if (allTrackTile && allTrackTile.parentNode === interfaceTiles) {
        allTrackTile.insertAdjacentElement('afterend', zavodTile);
      } else {
        interfaceTiles.appendChild(zavodTile);
      }
    }

    if (!protocol2Tile && interfaceTiles) {
      protocol2Tile = buildProtocol2Tile();
      if (zavodTile && zavodTile.parentNode) {
        zavodTile.insertAdjacentElement('afterend', protocol2Tile);
      } else {
        interfaceTiles.appendChild(protocol2Tile);
      }
    }

    if (!engineeringTile && interfaceTiles) {
      engineeringTile = buildEngineeringTile();
      if (documentsTile && documentsTile.parentNode === interfaceTiles) {
        documentsTile.insertAdjacentElement('afterend', engineeringTile);
      } else {
        interfaceTiles.appendChild(engineeringTile);
      }
    }

    if (!frontWorksTile && interfaceTiles) {
      frontWorksTile = buildFrontWorksTile();
      if (documentsTile && documentsTile.parentNode === interfaceTiles) {
        documentsTile.insertAdjacentElement('afterend', frontWorksTile);
      } else {
        interfaceTiles.appendChild(frontWorksTile);
      }
    }

    if (!ispDocsTile && interfaceTiles) {
      ispDocsTile = buildIspDocsTile();
      interfaceTiles.appendChild(ispDocsTile);
    }

    syncAllTilesToGroups();

    if (materialsRequestTile) {
      if (!materialsRequestTile.getAttribute('role')) {
        materialsRequestTile.setAttribute('role', 'button');
      }
      if (!materialsRequestTile.hasAttribute('tabindex')) {
        materialsRequestTile.setAttribute('tabindex', '0');
      }
      if (!materialsRequestTile.getAttribute('aria-label')) {
        materialsRequestTile.setAttribute('aria-label', 'Открыть Заявку материалов');
      }
    }

    if (tabelTile) {
      ensureTabelStyles();
      if (!tabelTile.getAttribute('role')) {
        tabelTile.setAttribute('role', 'button');
      }
      if (!tabelTile.hasAttribute('tabindex')) {
        tabelTile.setAttribute('tabindex', '0');
      }
      if (!tabelTile.getAttribute('aria-label')) {
        tabelTile.setAttribute('aria-label', 'Открыть табель');
      }

      tabelTile.addEventListener('click', openTabel);
      tabelTile.addEventListener('keydown', function(event) {
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          openTabel(event);
        }
      });
    }

    if (allTrackTile) {
      if (!allTrackTile.getAttribute('role')) {
        allTrackTile.setAttribute('role', 'button');
      }
      if (!allTrackTile.hasAttribute('tabindex')) {
        allTrackTile.setAttribute('tabindex', '0');
      }
      if (!allTrackTile.getAttribute('aria-label')) {
        allTrackTile.setAttribute('aria-label', 'Открыть AllTrack');
      }

      allTrackTile.addEventListener('click', openAllTrack);
      allTrackTile.addEventListener('keydown', function(event) {
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          openAllTrack(event);
        }
      });
    }

    if (ohranaTile) {
      ensureOhranaStyles();
      if (!ohranaTile.getAttribute('role')) {
        ohranaTile.setAttribute('role', 'button');
      }
      if (!ohranaTile.hasAttribute('tabindex')) {
        ohranaTile.setAttribute('tabindex', '0');
      }
      if (!ohranaTile.getAttribute('aria-label')) {
        ohranaTile.setAttribute('aria-label', 'Открыть Охрану труда');
      }

      ohranaTile.addEventListener('click', openOhrana);
      ohranaTile.addEventListener('keydown', function(event) {
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          openOhrana(event);
        }
      });
    }

    if (zavodTile) {
      ensureZavodStyles();
      if (!zavodTile.getAttribute('role')) {
        zavodTile.setAttribute('role', 'button');
      }
      if (!zavodTile.hasAttribute('tabindex')) {
        zavodTile.setAttribute('tabindex', '0');
      }
      if (!zavodTile.getAttribute('aria-label')) {
        zavodTile.setAttribute('aria-label', 'Открыть Завод');
      }

      zavodTile.addEventListener('click', openZavod);
      zavodTile.addEventListener('keydown', function(event) {
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          openZavod(event);
        }
      });
    }

    if (protocol2Tile) {
      ensureProtocol2Styles();
      if (!protocol2Tile.getAttribute('role')) {
        protocol2Tile.setAttribute('role', 'button');
      }
      if (!protocol2Tile.hasAttribute('tabindex')) {
        protocol2Tile.setAttribute('tabindex', '0');
      }
      if (!protocol2Tile.getAttribute('aria-label')) {
        protocol2Tile.setAttribute('aria-label', 'Открыть «Протокол совещания»');
      }

      protocol2Tile.addEventListener('click', openProtocol2);
      protocol2Tile.addEventListener('keydown', function(event) {
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          openProtocol2(event);
        }
      });
    }

    if (engineeringTile) {
      ensureEngineeringStyles();
      if (!engineeringTile.getAttribute('role')) {
        engineeringTile.setAttribute('role', 'button');
      }
      if (!engineeringTile.hasAttribute('tabindex')) {
        engineeringTile.setAttribute('tabindex', '0');
      }
      if (!engineeringTile.getAttribute('aria-label')) {
        engineeringTile.setAttribute('aria-label', 'Открыть инженерную подготовку');
      }

      engineeringTile.addEventListener('click', openEngineeringModule);
      engineeringTile.addEventListener('keydown', function(event) {
        if (!event) {
          return;
        }
        var key = event.key || event.keyCode;
        if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
          openEngineeringModule(event);
        }
      });
    }

    if (frontWorksTile) {
      ensureFrontWorksStyles();
      if (!frontWorksTile.getAttribute('role')) {
        frontWorksTile.setAttribute('role', 'button');
      }
      if (!frontWorksTile.hasAttribute('tabindex')) {
        frontWorksTile.setAttribute('tabindex', '0');
      }
      if (!frontWorksTile.getAttribute('aria-label')) {
        frontWorksTile.setAttribute('aria-label', 'Открыть Фронт работ');
      }
    }

    if (ispDocsTile) {
      if (!ispDocsTile.getAttribute('role')) {
        ispDocsTile.setAttribute('role', 'button');
      }
      if (!ispDocsTile.hasAttribute('tabindex')) {
        ispDocsTile.setAttribute('tabindex', '0');
      }
      if (!ispDocsTile.getAttribute('aria-label')) {
        ispDocsTile.setAttribute('aria-label', 'Открыть Исполнительную документацию');
      }

      ispDocsTile.addEventListener('click', handleIspDocsOpen);
      ispDocsTile.addEventListener('keydown', function(event) {
        var key = event && (event.key || event.code || '');
        if (key === 'Enter' || key === ' ' || key === 'Space' || key === 'Spacebar') {
          event.preventDefault();
          handleIspDocsOpen(event);
        }
      });
    }

    var isExpanded = false;

    if (toolbarTitle) {
      adminButton = document.createElement('button');
      adminButton.type = 'button';
      adminButton.className = 'su21-toolbar__button su21-toolbar__button--admin';
      adminButton.textContent = 'Администратор';
      toolbarTitle.insertAdjacentElement('afterend', adminButton);

      adminAccessManager = createAdminAccessManager(adminButton);

      adminButton.addEventListener('click', function() {
        if (adminAccessManager) {
          adminAccessManager.open();
        }
      });
    }

    if (mapClose) {
      mapClose.setAttribute('aria-hidden', 'true');
      mapClose.setAttribute('tabindex', '-1');
    }

    if (mapBackdrop) {
      mapBackdrop.setAttribute('aria-hidden', 'true');
    }

    if (summaryBackdrop) {
      summaryBackdrop.setAttribute('aria-hidden', 'true');
    }

    function openMapTile() {
      if (!mapTile || isExpanded) return;
      isExpanded = true;
      mapTile.classList.add('is-expanded');
      var mapGroup = mapTile.closest('.su21-tiles-group');
      if (mapGroup) {
        mapGroup.classList.add('is-map-host');
      }
      if (mapBackdrop) {
        mapBackdrop.classList.add('is-visible');
        mapBackdrop.setAttribute('aria-hidden', 'false');
      }
      document.body.classList.add('map-open');
      setTimeout(fitMap, 120);
      if (mapClose) {
        mapClose.setAttribute('aria-hidden', 'false');
        mapClose.setAttribute('tabindex', '0');
        try {
          mapClose.focus({ preventScroll: true });
        } catch (e) {
          mapClose.focus();
        }
      }
    }

    function closeMapTile() {
      if (!mapTile || !isExpanded) return;
      isExpanded = false;
      mapTile.classList.remove('is-expanded');
      var mapGroup = mapTile.closest('.su21-tiles-group');
      if (mapGroup) {
        mapGroup.classList.remove('is-map-host');
      }
      if (mapBackdrop) {
        mapBackdrop.classList.remove('is-visible');
        mapBackdrop.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('map-open');
      if (mapClose) {
        mapClose.setAttribute('aria-hidden', 'true');
        mapClose.setAttribute('tabindex', '-1');
      }
      setTimeout(fitMap, 160);
    }

    function launchMaterials() {
      if (typeof window.startMaterial === 'function') {
        window.startMaterial();
      } else {
      }
    }

    function initDocuments() {
      if (documentsInitialized) {
        return;
      }
      if (typeof window.startDocuments === 'function') {
        window.startDocuments(documentsRoot);
        documentsInitialized = true;
      } else {
      }
    }

    function openDocuments(event) {
      if (!documentsPanel || documentsOpen) {
        return;
      }
      documentsOpen = true;
      initDocuments();
      documentsPanel.classList.add('is-visible');
      documentsPanel.setAttribute('aria-hidden', 'false');
      if (documentsBackdrop) {
        documentsBackdrop.classList.add('is-visible');
        documentsBackdrop.setAttribute('aria-hidden', 'false');
      }
      document.body.classList.add('documents-open');
      if (documentsClose) {
        documentsClose.removeAttribute('aria-hidden');
        documentsClose.setAttribute('tabindex', '0');
        try {
          documentsClose.focus({ preventScroll: true });
        } catch (focusError) {
          documentsClose.focus();
        }
      }
      syncDocumentsControls();
      if (cardNewsModal) {
        cardNewsModal.openForCard('Документооборот');
      }
      if (event) {
        event.preventDefault();
      }
    }

    function closeDocuments() {
      if (!documentsPanel || !documentsOpen) {
        return;
      }
      documentsOpen = false;
      documentsPanel.classList.remove('is-visible');
      documentsPanel.setAttribute('aria-hidden', 'true');
      if (documentsBackdrop) {
        documentsBackdrop.classList.remove('is-visible');
        documentsBackdrop.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('documents-open');
      if (documentsClose) {
        documentsClose.setAttribute('aria-hidden', 'true');
        documentsClose.setAttribute('tabindex', '-1');
      }
      documentsRefreshInProgress = false;
      syncDocumentsControls();
      if (documentsTile) {
        try {
          documentsTile.focus({ preventScroll: true });
        } catch (focusError) {
          documentsTile.focus();
        }
      }
    }

    if (mapTile) {
      mapTile.addEventListener('click', function(event) {
        if (isExpanded) return;
        if (event.target === mapClose) return;
        openMapTile();
      });

      mapTile.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!isExpanded) {
            openMapTile();
          }
        }
      });
    }

    if (materialsTile) {
      materialsTile.addEventListener('click', function(event) {
        event.preventDefault();
        launchMaterials();
      });

      materialsTile.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          launchMaterials();
        }
      });
    }

    if (materialsRequestTile) {
      materialsRequestTile.addEventListener('click', function(event) {
        event.preventDefault();
        ensureZa9vkaAccess()
          .then(function() {
            openMaterialsRequest(event);
          })
          .catch(function() {
            // Вход отменён - ничего не делаем
          });
      });

      materialsRequestTile.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          ensureZa9vkaAccess()
            .then(function() {
              openMaterialsRequest(event);
            })
            .catch(function() {
              // Вход отменён - ничего не делаем
            });
        }
      });
    }

    if (frontWorksTile) {
      frontWorksTile.addEventListener('click', handleFrontWorksOpen);

      frontWorksTile.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleFrontWorksOpen(event);
        }
      });
    }

    if (documentsTile) {
      documentsTile.addEventListener('click', ensureDocumentsAccess);

      documentsTile.addEventListener('keydown', function(event) {
        var key = event.key || event.code || '';
        if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space') {
          event.preventDefault();
          ensureDocumentsAccess(event);
        }
      });
    }

    if (mapClose) {
      mapClose.addEventListener('click', function(event) {
        event.stopPropagation();
        closeMapTile();
      });
    }

    if (mapBackdrop) {
      mapBackdrop.addEventListener('click', closeMapTile);
    }

    if (documentsClose) {
      documentsClose.setAttribute('aria-hidden', 'true');
      documentsClose.setAttribute('tabindex', '-1');
      documentsClose.addEventListener('click', function(event) {
        event.preventDefault();
        closeDocuments();
      });
    }

    if (documentsBackdrop) {
      documentsBackdrop.setAttribute('aria-hidden', 'true');
      documentsBackdrop.addEventListener('click', closeDocuments);
    }

    if (documentsLogoutButton) {
      documentsLogoutButton.addEventListener('click', handleDocumentsLogout);
    }

    if (documentsRefreshButton) {
      documentsRefreshButton.addEventListener('click', handleDocumentsRefresh);
    }

    var originalToggle = typeof window.toggleMasterPlanCollapse === 'function'
      ? window.toggleMasterPlanCollapse
      : null;

    function updateSummaryState() {
      if (!summaryPanel) return;
      var opened = summaryPanel.style.display !== 'none';
      document.body.classList.toggle('summary-open', opened);
      summaryPanel.setAttribute('aria-hidden', opened ? 'false' : 'true');
      if (summaryBackdrop) {
        summaryBackdrop.classList.toggle('is-visible', opened);
        summaryBackdrop.setAttribute('aria-hidden', opened ? 'false' : 'true');
      }
    }

    if (originalToggle) {
      window.toggleMasterPlanCollapse = function() {
        originalToggle.apply(this, arguments);
        updateSummaryState();
      };
    }

    function callSummaryToggle() {
      if (typeof window.toggleMasterPlanCollapse === 'function') {
        window.toggleMasterPlanCollapse();
        return true;
      }
      return false;
    }

    if (summaryButton) {
      summaryButton.addEventListener('click', function(event) {
        event.preventDefault();
        if (!callSummaryToggle() && summaryPanel) {
          summaryPanel.style.display = summaryPanel.style.display === 'none' ? 'block' : 'none';
          updateSummaryState();
        }
      });
    }

    if (roleMenuToggle && menuContainer) {
      var updateExpandedState = function() {
        var expanded = menuContainer.classList.contains('menu-open');
        roleMenuToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      };

      var observer = new MutationObserver(updateExpandedState);
      observer.observe(menuContainer, { attributes: true, attributeFilter: ['class'] });

      roleMenuToggle.addEventListener('click', function(event) {
        event.preventDefault();
        menuContainer.classList.toggle('menu-open');
        updateExpandedState();
      });

      updateExpandedState();
    }

    refreshCardAccess();
    if (cardAccessRefreshTimer) {
      clearInterval(cardAccessRefreshTimer);
    }
    cardAccessRefreshTimer = setInterval(refreshCardAccess, 60000);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        refreshCardAccess();
      }
    });

    // Логирование работы пользователя с карточками разделов на главной странице
    // организации (section.su21-tiles-group--active > div). События падают в
    // lg/statistiklog.json через unified_entry_log.php наравне с входами/выходами
    // и дублируются оперативными уведомлениями в Telegram.
    function resolveOrgCardLabel(tile) {
      if (!tile) return '';
      try {
        if (Array.isArray(cardAccessTiles)) {
          for (var i = 0; i < cardAccessTiles.length; i++) {
            if (cardAccessTiles[i] && cardAccessTiles[i].id === tile.id) {
              return cardAccessTiles[i].label || '';
            }
          }
        }
      } catch (_findError) {}
      var header = tile.querySelector('.map-tile__header, .map-tile__title, h2, h3');
      if (header && header.textContent) {
        return header.textContent.replace(/\s+/g, ' ').trim();
      }
      return '';
    }

    // Текущая открытая карточка организации (модалка поверх главной страницы).
    // Нужна, чтобы при клике по другой карточке/закрытии страницы сгенерировать
    // событие org-card-exit с продолжительностью работы внутри карточки.
    var activeOrgCard = null;

    function postUnifiedEntryLog(payload) {
      try {
        var body = JSON.stringify(payload);
        var sent = false;
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          try {
            var blob = new Blob([body], { type: 'application/json' });
            sent = navigator.sendBeacon('unified_entry_log.php', blob);
          } catch (_beaconError) {
            sent = false;
          }
        }
        if (!sent && typeof fetch === 'function') {
          fetch('unified_entry_log.php', {
            method: 'POST',
            cache: 'no-store',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            },
            body: body
          }).catch(function() {});
        }
      } catch (_logError) {}
    }

    function resolveUnifiedLogUserName() {
      var session = (typeof window !== 'undefined' && window.unifiedServiceSession) ? window.unifiedServiceSession : null;
      if (session && typeof session.name === 'string' && session.name.trim()) {
        return session.name.trim();
      }

      if (typeof resolveDocumentsMainNewsUserName === 'function') {
        var documentsUserName = resolveDocumentsMainNewsUserName();
        if (typeof documentsUserName === 'string' && documentsUserName.trim()) {
          return documentsUserName.trim();
        }
      }

      if (typeof window !== 'undefined' && typeof window.currentUserName === 'string' && window.currentUserName.trim()) {
        return window.currentUserName.trim();
      }

      return '';
    }

    function buildOrgCardPayload(eventName, tile, extraDetails) {
      var session = (typeof window !== 'undefined' && window.unifiedServiceSession) ? window.unifiedServiceSession : null;
      var userName = resolveUnifiedLogUserName();
      var tabSessionId = '';
      var tabSessionName = '';
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          var tabRaw = window.sessionStorage.getItem('bimmax.unifiedTabSession.v1');
          if (tabRaw) {
            var tabParsed = JSON.parse(tabRaw);
            if (tabParsed && typeof tabParsed.sessionId === 'string') {
              tabSessionId = tabParsed.sessionId;
            }
            if (tabParsed && typeof tabParsed.name === 'string') {
              tabSessionName = tabParsed.name.trim();
            }
          }
        }
      } catch (_tabError) {}
      if (!userName && tabSessionName) {
        userName = tabSessionName;
      }

      var details = {
        cardId: (tile && tile.id) || (extraDetails && extraDetails.cardId) || '',
        cardLabel: (tile ? resolveOrgCardLabel(tile) : '') || (extraDetails && extraDetails.cardLabel) || '',
        locked: !!(tile && tile.classList && tile.classList.contains('is-locked')),
        organization: detectedOrganization || ''
      };
      if (extraDetails && typeof extraDetails === 'object') {
        for (var key in extraDetails) {
          if (Object.prototype.hasOwnProperty.call(extraDetails, key)) {
            details[key] = extraDetails[key];
          }
        }
      }
      if (userName) {
        details.name = userName;
      }

      var payload = {
        event: eventName,
        page: (window.location && window.location.pathname) ? window.location.pathname : '',
        ts: new Date().toISOString(),
        fio: userName,
        details: details
      };
      if (tabSessionId) {
        payload.sessionId = tabSessionId;
      }
      return payload;
    }

    function sendOrgCardEnter(tile, extraDetails) {
      if (!tile) return;
      // Если пользователь переключается между карточками без явного закрытия —
      // сперва фиксируем выход из предыдущей.
      if (activeOrgCard && activeOrgCard.cardId && activeOrgCard.cardId !== tile.id) {
        sendOrgCardExit('switch');
      }
      if (activeOrgCard && activeOrgCard.cardId === tile.id) {
        // Повторный клик по уже открытой карточке — не засчитываем повторный вход.
        return;
      }
      var enteredAt = Date.now();
      var payload = buildOrgCardPayload('org-card-enter', tile, extraDetails);
      activeOrgCard = {
        cardId: payload.details.cardId || '',
        cardLabel: payload.details.cardLabel || '',
        enteredAt: enteredAt,
        enteredIso: payload.ts
      };
      postUnifiedEntryLog(payload);
    }

    function sendOrgCardExit(reason) {
      if (!activeOrgCard || !activeOrgCard.cardId) return;
      var card = activeOrgCard;
      activeOrgCard = null;
      var tile = document.getElementById(card.cardId);
      var durationMs = Math.max(0, Date.now() - (card.enteredAt || Date.now()));
      var extra = {
        cardId: card.cardId,
        cardLabel: card.cardLabel,
        enteredAt: card.enteredIso || '',
        durationSeconds: Math.round(durationMs / 1000),
        reason: reason || 'manual'
      };
      var payload = buildOrgCardPayload('org-card-exit', tile, extra);
      postUnifiedEntryLog(payload);
    }

    document.addEventListener('click', function(event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      var tile = target.closest('.map-tile');
      if (!tile) return;
      var group = tile.closest('.su21-tiles-group--active');
      if (!group) return;
      sendOrgCardEnter(tile, {
        trigger: 'click',
        pointerType: (event.pointerType || (event.detail === 0 ? 'keyboard' : 'mouse'))
      });
    }, true);

    document.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      var tile = target.closest('.map-tile');
      if (!tile) return;
      var group = tile.closest('.su21-tiles-group--active');
      if (!group) return;
      sendOrgCardEnter(tile, {
        trigger: 'keyboard',
        key: event.key
      });
    }, true);

    // Если пользователь закрыл карточку клавишей Escape — фиксируем выход.
    document.addEventListener('keydown', function(event) {
      if (event.key !== 'Escape') return;
      if (!activeOrgCard) return;
      sendOrgCardExit('escape');
    }, true);

    // При закрытии/перезагрузке страницы — отправляем выход из активной карточки
    // через sendBeacon, чтобы событие гарантированно ушло до выгрузки документа.
    var orgCardUnloadSent = false;
    function handleOrgCardUnload() {
      if (orgCardUnloadSent) return;
      if (!activeOrgCard) return;
      orgCardUnloadSent = true;
      sendOrgCardExit('page-hide');
    }
    window.addEventListener('pagehide', handleOrgCardUnload);
    window.addEventListener('beforeunload', handleOrgCardUnload);

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        var documentModalOpen = document.querySelector('.documents-modal');
        if (documentModalOpen) {
          return;
        }
        var adminModal = document.getElementById('documents-admin');
        if (adminModal && adminModal.classList.contains('is-visible')) {
          return;
        }
        var tabelModalSelectors = [
          '.tabel-admin-overlay.is-visible',
          '.tabel-objects-overlay.is-visible',
          '.tabel-brigades-overlay.is-visible',
          '.tabel-workers-overlay.is-visible',
          '.tabel-dismissed-overlay.is-visible',
          '.tabel-timesheet-modal.is-visible',
          '.tabel-work-list-overlay.is-visible',
          '.tabel-worker-performance-overlay.is-visible',
          '.tabel-work-context-popover.is-visible'
        ];
        var tabelModalOpen = tabelModalSelectors.some(function(sel) {
          return document.querySelector(sel);
        });
        if (tabelModalOpen) {
          return;
        }
        if (materialsRequestOpen) {
          closeMaterialsRequest();
          return;
        }
        if (tabelOpen) {
          closeTabel();
          return;
        }
        if (isExpanded) {
          closeMapTile();
          return;
        }
        if (documentsOpen) {
          closeDocuments();
          return;
        }
        if (summaryPanel && summaryPanel.style.display !== 'none') {
          if (callSummaryToggle()) {
            return;
          }
          summaryPanel.style.display = 'none';
          updateSummaryState();
        }
      }
    });

    document.addEventListener('su21:map-ready', fitMap);

    var cardNewsModal = initCardNewsModal();
    updateSummaryState();
  });
})();
