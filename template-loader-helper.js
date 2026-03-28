(function(global) {
  var DEFAULT_TEMPLATE_PATHS = [
    '/app/templates/template.docx',
    '/templates/template.docx',
    './templates/template.docx'
  ];

  function toUniqueList(list) {
    var result = [];
    (Array.isArray(list) ? list : []).forEach(function(item) {
      var value = String(item || '').trim();
      if (!value || result.indexOf(value) >= 0) {
        return;
      }
      result.push(value);
    });
    return result;
  }

  function buildTemplatePathList(options) {
    var config = options && typeof options === 'object' ? options : {};
    var preferred = [];
    if (config.templateUrl) {
      preferred.push(config.templateUrl);
    }
    if (Array.isArray(config.templateUrls)) {
      preferred = preferred.concat(config.templateUrls);
    }
    return toUniqueList(preferred.concat(DEFAULT_TEMPLATE_PATHS));
  }

  async function fetchTemplateBuffer(options) {
    var paths = buildTemplatePathList(options);
    var attempts = [];
    for (var i = 0; i < paths.length; i += 1) {
      var url = paths[i];
      try {
        var response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) {
          return {
            buffer: await response.arrayBuffer(),
            url: url,
            attempts: attempts,
            response: response
          };
        }
        attempts.push({ url: url, status: response.status, reason: 'http_error' });
      } catch (error) {
        attempts.push({
          url: url,
          status: 0,
          reason: 'network_error',
          message: error && error.message ? String(error.message) : 'Ошибка сети'
        });
      }
    }

    var error = new Error('Не удалось загрузить шаблон DOCX.');
    error.attempts = attempts;
    error.paths = paths;
    throw error;
  }

  global.DocumentsTemplateLoader = {
    DEFAULT_TEMPLATE_PATHS: DEFAULT_TEMPLATE_PATHS.slice(),
    buildTemplatePathList: buildTemplatePathList,
    fetchTemplateBuffer: fetchTemplateBuffer
  };
})(window);
