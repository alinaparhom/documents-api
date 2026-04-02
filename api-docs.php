<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');
const LOCAL_OCR_MAX_PAGES = 5;

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    if ($json === false) {
        $json = '{"ok":false,"error":"JSON_ENCODE_FAILED"}';
    }
    echo $json;
    exit;
}

function logApiDocs(string $level, string $message, array $context = []): void
{
    $directory = __DIR__ . '/app/logs';
    if (!is_dir($directory)) {
        @mkdir($directory, 0775, true);
    }
    $record = [
        'time' => gmdate('c'),
        'level' => $level,
        'message' => $message,
        'context' => $context,
    ];
    @file_put_contents(
        $directory . '/api-docs.log',
        (json_encode(
            $record,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        ) ?: '{"time":"' . gmdate('c') . '","level":"error","message":"LOG_JSON_ENCODE_FAILED"}') . PHP_EOL,
        FILE_APPEND
    );
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$scriptPath = (string)($_SERVER['SCRIPT_NAME'] ?? '/api-docs.php');
$endpointPath = $scriptPath !== '' ? $scriptPath : '/api-docs.php';
if ($method === 'GET') {
    $action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';
    if ($action === 'ai_models') {
        $env = loadEnv(getEnvPaths());
        $modelsConfig = resolveAiModelsConfig($env);
        $models = $modelsConfig['models'];
        $defaultModel = $modelsConfig['defaultModel'];
        $configError = trim((string)($modelsConfig['configError'] ?? ''));
        if ($configError !== '') {
            jsonResponse(500, ['ok' => false, 'error' => $configError, 'code' => 'MODEL_NOT_CONFIGURED']);
        }
        $statusRows = buildModelAvailabilityRows($models, $env);
        foreach ($statusRows as $idx => $row) {
            $value = trim((string)($row['value'] ?? ''));
            if ($value !== '' && $value === $defaultModel) {
                $statusRows[$idx]['isDefault'] = true;
                break;
            }
        }
        jsonResponse(200, [
            'ok' => true,
            'models' => $statusRows,
            'defaultModel' => $defaultModel,
            'checkedAt' => gmdate('c'),
        ]);
    }

    $isPing = isset($_GET['ping']) && (string)$_GET['ping'] === '1';
    $isDebug = isset($_GET['debug']) && (string)$_GET['debug'] === '1';
    $payload = [
        'ok' => true,
        'message' => $isPing
            ? 'pong'
            : 'API доступен. Используйте POST для action=ai_response_analyze.',
        'endpoint' => $endpointPath,
        'method' => 'POST'
    ];
    if ($isDebug) {
        $debugEnv = loadEnv(getEnvPaths());
        $debugKey = trim((string)($debugEnv['AI_API_KEY'] ?? $debugEnv['OPENAI_API_KEY'] ?? ''));
        $debugModelsConfig = resolveAiModelsConfig($debugEnv);
        $debugModel = (string)$debugModelsConfig['defaultModel'];
        $debugBase = trim((string)($debugEnv['AI_BASE_URL'] ?? $debugEnv['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));
        $payload['debug'] = [
            'key_present' => $debugKey !== '',
            'key_prefix' => $debugKey !== '' ? substr($debugKey, 0, 4) : '',
            'model' => $debugModel,
            'base_url' => $debugBase
        ];
    }
    jsonResponse(200, $payload);
}
if ($method !== 'POST') {
    logApiDocs('warn', 'Unsupported HTTP method', ['method' => $method]);
    jsonResponse(405, ['ok' => false, 'error' => 'Method Not Allowed']);
}

function loadEnv(array $paths): array
{
    $env = [];
    foreach ($paths as $path) {
        if (!is_string($path) || $path === '' || !is_file($path)) {
            continue;
        }
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            continue;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $pos));
            $value = trim(substr($line, $pos + 1));
            if ($key === '') {
                continue;
            }
            if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
                $value = substr($value, 1, -1);
            }
            $env[$key] = $value;
        }
    }
    return $env;
}

function getEnvPaths(): array
{
    return [
        __DIR__ . '/app/.env',
        __DIR__ . '/.env',
        __DIR__ . '/app/env.txt'
    ];
}

function parseAiModelsFromEnv(array $env): array
{
    $rawModels = trim((string)($env['AI_MODELS'] ?? $env['OPENAI_MODELS'] ?? ''));
    if ($rawModels === '') {
        return [];
    }

    $models = [];
    $parts = preg_split('/[,\n]+/u', $rawModels);
    if (is_array($parts)) {
        foreach ($parts as $part) {
            $value = trim((string)$part);
            if ($value !== '') {
                $models[] = $value;
            }
        }
    }

    return array_values(array_unique($models));
}

function resolveAiModelsConfig(array $env): array
{
    $models = parseAiModelsFromEnv($env);
    $defaultModel = trim((string)($env['AI_MODEL'] ?? $env['OPENAI_MODEL'] ?? ''));
    $baseUrl = trim((string)($env['AI_BASE_URL'] ?? $env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));

    $provider = mb_strtolower(trim((string)($env['AI_PROVIDER'] ?? '')));
    if ($provider === '') {
        if (stripos($baseUrl, 'groq.com') !== false) {
            $provider = 'groq';
        } elseif (stripos($baseUrl, 'openai.com') !== false) {
            $provider = 'openai';
        }
    }

    if ($defaultModel !== '' && !in_array($defaultModel, $models, true)) {
        array_unshift($models, $defaultModel);
    }

    if ($defaultModel === '' && $models) {
        $defaultModel = (string)$models[0];
    }

    $models = array_values(array_unique($models));
    $configError = '';
    if ($defaultModel === '' && !$models) {
        $configError = 'Не настроены AI_MODEL и AI_MODELS в .env. Укажите AI_MODEL или заполните AI_MODELS (например: AI_MODELS=model-1,model-2).';
    }

    return [
        'models' => $models,
        'defaultModel' => $defaultModel,
        'provider' => $provider,
        'configError' => $configError,
    ];
}

function normalizeUploadedFiles(string $field): array
{
    if (!isset($_FILES[$field])) {
        return [];
    }

    $raw = $_FILES[$field];
    if (!is_array($raw) || !isset($raw['name'])) {
        return [];
    }

    $files = [];
    if (is_array($raw['name'])) {
        $count = count($raw['name']);
        for ($i = 0; $i < $count; $i += 1) {
            if (($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                continue;
            }
            $files[] = [
                'name' => (string)($raw['name'][$i] ?? ''),
                'tmp_name' => (string)($raw['tmp_name'][$i] ?? ''),
                'type' => (string)($raw['type'][$i] ?? ''),
                'size' => (int)($raw['size'][$i] ?? 0),
            ];
        }
        return $files;
    }

    if (($raw['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $files[] = [
            'name' => (string)($raw['name'] ?? ''),
            'tmp_name' => (string)($raw['tmp_name'] ?? ''),
            'type' => (string)($raw['type'] ?? ''),
            'size' => (int)($raw['size'] ?? 0),
        ];
    }

    return $files;
}

function collectAttachmentUrlsFromContext(array $context): array
{
    $urls = [];
    $rows = isset($context['attachedFiles']) && is_array($context['attachedFiles']) ? $context['attachedFiles'] : [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $url = trim((string)($row['url'] ?? ''));
        if ($url === '' || !preg_match('#^https?://#i', $url)) {
            continue;
        }
        $urls[] = $url;
    }
    return array_values(array_unique($urls));
}

function downloadAttachmentToTempFile(string $url, int $maxBytes = 20_971_520): ?array
{
    $tmp = tempnam(sys_get_temp_dir(), 'att_url_');
    if ($tmp === false) {
        return null;
    }
    $fp = @fopen($tmp, 'wb');
    if (!is_resource($fp)) {
        @unlink($tmp);
        return null;
    }
    $written = 0;
    $ch = curl_init($url);
    if ($ch === false) {
        fclose($fp);
        @unlink($tmp);
        return null;
    }
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_FAILONERROR => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'documents-api/1.0',
        CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$written, $maxBytes): int {
            return strlen($header);
        },
        CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use ($fp, &$written, $maxBytes): int {
            $len = strlen($chunk);
            $written += $len;
            if ($written > $maxBytes) {
                return 0;
            }
            return fwrite($fp, $chunk);
        },
    ]);
    $ok = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    fclose($fp);

    if ($ok === false || $status >= 400 || !is_file($tmp) || (int)@filesize($tmp) <= 0) {
        @unlink($tmp);
        return null;
    }

    $pathPart = (string)parse_url($url, PHP_URL_PATH);
    $name = basename($pathPart);
    if ($name === '' || $name === '/' || $name === '.') {
        $name = 'attachment-' . substr(md5($url), 0, 8) . '.bin';
    }

    return [
        'name' => $name,
        'tmp_name' => $tmp,
        'type' => trim($contentType) !== '' ? trim($contentType) : 'application/octet-stream',
        'size' => (int)@filesize($tmp),
    ];
}

function safeJsonDecode(?string $value): array
{
    if (!is_string($value) || trim($value) === '') {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}

function normalizeRetryAfterSeconds(mixed $rawValue, int $default = 8, int $min = 3): int
{
    $resolvedDefault = $default >= $min ? $default : $min;

    if (is_string($rawValue)) {
        $rawValue = trim($rawValue);
    }

    if ($rawValue === '' || $rawValue === null || !is_numeric($rawValue)) {
        return $resolvedDefault;
    }

    $seconds = (int)ceil((float)$rawValue);
    if ($seconds < $min) {
        return $min;
    }
    return $seconds;
}

function normalizeFloatSetting(mixed $rawValue, float $default, float $min, float $max): float
{
    if (is_string($rawValue)) {
        $rawValue = trim($rawValue);
    }
    if ($rawValue === '' || $rawValue === null || !is_numeric($rawValue)) {
        return $default;
    }
    $value = (float)$rawValue;
    if ($value < $min) {
        return $min;
    }
    if ($value > $max) {
        return $max;
    }
    return $value;
}

function normalizeIntSetting(mixed $rawValue, int $default, int $min, int $max): int
{
    if (is_string($rawValue)) {
        $rawValue = trim($rawValue);
    }
    if ($rawValue === '' || $rawValue === null || !is_numeric($rawValue)) {
        return $default;
    }
    $value = (int)$rawValue;
    if ($value < $min) {
        return $min;
    }
    if ($value > $max) {
        return $max;
    }
    return $value;
}

function resolveAiGenerationSettings(array $env, array $requestData): array
{
    $temperature = normalizeFloatSetting(
        $requestData['temperature'] ?? ($env['AI_TEMPERATURE'] ?? 0.75),
        0.75,
        0.0,
        2.0
    );
    $topP = normalizeFloatSetting(
        $requestData['top_p'] ?? ($env['AI_TOP_P'] ?? 0.9),
        0.9,
        0.0,
        1.0
    );
    $presencePenalty = normalizeFloatSetting(
        $requestData['presence_penalty'] ?? ($env['AI_PRESENCE_PENALTY'] ?? 0.3),
        0.3,
        -2.0,
        2.0
    );
    $frequencyPenalty = normalizeFloatSetting(
        $requestData['frequency_penalty'] ?? ($env['AI_FREQUENCY_PENALTY'] ?? 0.2),
        0.2,
        -2.0,
        2.0
    );
    $maxTokens = normalizeIntSetting(
        $requestData['max_tokens'] ?? ($env['AI_MAX_TOKENS'] ?? 4000),
        4000,
        256,
        8000
    );

    return [
        'temperature' => $temperature,
        'top_p' => $topP,
        'presence_penalty' => $presencePenalty,
        'frequency_penalty' => $frequencyPenalty,
        'max_tokens' => $maxTokens,
    ];
}

function withRetryPayload(int $retryAfterSeconds): array
{
    return [
        'retryAfterSeconds' => $retryAfterSeconds,
        // Для обратной совместимости со старым фронтом.
        'retryAfter' => $retryAfterSeconds,
    ];
}

function findSuggestedModel(array $availableModels, string $currentModel): ?string
{
    foreach ($availableModels as $candidate) {
        $name = trim((string)$candidate);
        if ($name !== '' && $name !== $currentModel) {
            return $name;
        }
    }
    return null;
}

function buildModelAvailabilityRows(array $models, array $env): array
{
    $normalizedModels = [];
    foreach ($models as $model) {
        $name = trim((string)$model);
        if ($name !== '') {
            $normalizedModels[] = $name;
        }
    }
    $normalizedModels = array_values(array_unique($normalizedModels));
    if (!$normalizedModels) {
        return [];
    }

    $apiKey = trim((string)($env['AI_API_KEY'] ?? $env['OPENAI_API_KEY'] ?? ''));
    $baseUrl = trim((string)($env['AI_BASE_URL'] ?? $env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));
    $shouldCheck = trim((string)($env['AI_MODELS_HEALTHCHECK'] ?? '1')) !== '0';
    if ($apiKey === '' || !$shouldCheck) {
        return array_map(static function (string $name): array {
            return ['value' => $name, 'label' => $name, 'available' => true];
        }, $normalizedModels);
    }

    $endpoint = rtrim($baseUrl, '/') . '/chat/completions';

    $result = [];
    foreach ($normalizedModels as $modelName) {
        $probeBody = [
            'model' => $modelName,
            'max_tokens' => 1,
            'temperature' => 0,
            'messages' => [
                ['role' => 'user', 'content' => 'ping'],
            ],
        ];
        $requestResult = performAiRequestWithRetry($endpoint, $apiKey, $probeBody, [
            'timeout' => 20,
            'connect_timeout' => 8,
            'attempts' => 2,
            'base_delay_ms' => 400,
        ]);
        $statusCode = (int)($requestResult['status'] ?? 0);
        $bodyRaw = $requestResult['body'];
        $curlError = trim((string)($requestResult['curl_error'] ?? ''));
        $isAvailable = $statusCode > 0 && $statusCode < 400 && $bodyRaw !== false;
        $reason = '';
        $code = '';

        if (!$isAvailable) {
            if ($curlError !== '') {
                $reason = 'Проверка заняла слишком много времени, модель доступна без строгой проверки';
                $code = 'HEALTHCHECK_TIMEOUT';
                $isAvailable = true;
            } else {
                $decoded = is_string($bodyRaw) ? json_decode($bodyRaw, true) : [];
                $providerError = textFromMixed($decoded['error']['message'] ?? '');
                if ($statusCode === 404 || stripos($providerError, 'not found') !== false || stripos($providerError, 'does not exist') !== false) {
                    $reason = 'Модель не найдена у провайдера';
                    $code = 'MODEL_NOT_FOUND';
                } elseif ($statusCode === 401 || $statusCode === 403) {
                    $reason = 'Проверьте API ключ и права доступа к модели';
                    $code = 'ACCESS_DENIED';
                } elseif ($statusCode === 429 || $statusCode === 408 || stripos($providerError, 'quota') !== false || stripos($providerError, 'rate') !== false) {
                    $reason = 'Временная ошибка проверки, попробуйте снова';
                    $code = 'HEALTHCHECK_TEMPORARY';
                    $isAvailable = true;
                } elseif ($statusCode === 503 || stripos($providerError, 'not available') !== false) {
                    $reason = 'Временная ошибка проверки, попробуйте снова';
                    $code = 'HEALTHCHECK_TEMPORARY';
                    $isAvailable = true;
                } elseif ($statusCode >= 500) {
                    $reason = 'Временная ошибка проверки, попробуйте снова';
                    $code = 'HEALTHCHECK_TEMPORARY';
                    $isAvailable = true;
                } else {
                    $reason = 'Проверка не подтверждена, но модель оставлена доступной';
                    $code = 'HEALTHCHECK_UNKNOWN';
                    $isAvailable = true;
                }
            }
        }

        $entry = [
            'value' => $modelName,
            'label' => $modelName,
            'available' => $isAvailable,
        ];
        if ($reason !== '') {
            $entry['reason'] = $reason;
        }
        if ($code !== '') {
            $entry['statusCode'] = $code;
        }
        $result[] = $entry;
    }
    return $result;
}

function buildFilesSummary(array $files): array
{
    $summary = [];
    foreach ($files as $file) {
        $entry = [
            'name' => (string)($file['name'] ?? ''),
            'type' => (string)($file['type'] ?? ''),
            'size' => (int)($file['size'] ?? 0),
            'preview' => ''
        ];
        $tmp = (string)($file['tmp_name'] ?? '');
        if ($tmp !== '' && is_file($tmp)) {
            $type = strtolower((string)($file['type'] ?? ''));
            $name = strtolower((string)($file['name'] ?? ''));
            $isText = str_contains($type, 'text') || str_ends_with($name, '.txt') || str_ends_with($name, '.md') || str_ends_with($name, '.csv') || str_ends_with($name, '.json');
            if ($isText) {
                $content = @file_get_contents($tmp, false, null, 0, 3000);
                if (is_string($content) && $content !== '') {
                    $entry['preview'] = trim($content);
                }
            }
        }
        $summary[] = $entry;
    }
    return $summary;
}

function detectFileExtension(array $file): string
{
    $name = strtolower(trim((string)($file['name'] ?? '')));
    if ($name !== '' && str_contains($name, '.')) {
        $parts = explode('.', $name);
        return trim((string)end($parts));
    }
    $mime = mb_strtolower(trim((string)($file['type'] ?? '')));
    $mimeToExtension = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'image/bmp' => 'bmp',
        'image/tiff' => 'tiff',
        'image/x-tiff' => 'tiff',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/msword' => 'doc',
        'text/plain' => 'txt',
        'text/markdown' => 'md',
        'text/csv' => 'csv',
        'application/json' => 'json',
        'application/xml' => 'xml',
        'text/xml' => 'xml',
        'text/html' => 'html',
    ];
    if ($mime !== '' && isset($mimeToExtension[$mime])) {
        return $mimeToExtension[$mime];
    }
    return '';
}

function ensureFileNameHasExtension(string $name, string $extension): string
{
    $safeName = trim($name);
    if ($safeName === '') {
        $safeName = 'document';
    }
    if ($extension === '') {
        return $safeName;
    }
    if (str_contains($safeName, '.')) {
        return $safeName;
    }
    return $safeName . '.' . $extension;
}

function getUploadedTemplateFile(string $field = 'templateFile'): ?array
{
    $templates = normalizeUploadedFiles($field);
    if (!$templates) {
        return null;
    }
    $candidate = $templates[0];
    $tmpName = (string)($candidate['tmp_name'] ?? '');
    if ($tmpName === '' || !is_file($tmpName)) {
        return null;
    }
    $extension = detectFileExtension($candidate);
    if ($extension !== 'docx' && $extension !== 'pdf') {
        jsonResponse(400, ['ok' => false, 'error' => 'Шаблон должен быть в формате DOCX или PDF']);
    }
    $size = (int)($candidate['size'] ?? 0);
    if ($size > 20 * 1024 * 1024) {
        jsonResponse(400, ['ok' => false, 'error' => 'Шаблон слишком большой (максимум 20MB)']);
    }
    $candidate['extension'] = $extension;
    return $candidate;
}

function decodeDocxXmlText(string $xml): string
{
    $dom = new DOMDocument();
    $loaded = @$dom->loadXML($xml, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET | LIBXML_COMPACT);
    if (!$loaded) {
        return '';
    }

    $xpath = new DOMXPath($dom);
    $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    $nodes = $xpath->query('//*[self::w:t or self::w:tab or self::w:br or self::w:cr or self::w:p or self::w:tr or self::w:tc]');
    if (!$nodes instanceof DOMNodeList) {
        return '';
    }

    $result = '';
    foreach ($nodes as $node) {
        if (!$node instanceof DOMElement) {
            continue;
        }
        $name = $node->nodeName;
        if ($name === 'w:t') {
            $result .= (string)$node->textContent;
        } elseif ($name === 'w:tab' || $name === 'w:tc') {
            $result .= "\t";
        } elseif ($name === 'w:br' || $name === 'w:cr' || $name === 'w:p' || $name === 'w:tr') {
            $result .= "\n";
        }
    }

    $result = str_replace(["\r\n", "\r"], "\n", $result);
    $result = preg_replace('/[^\P{C}\n\t]+/u', '', (string)$result);
    $result = preg_replace('/[ \t]+\n/u', "\n", (string)$result);
    $result = preg_replace('/\n{3,}/u', "\n\n", (string)$result);
    return trim((string)$result);
}

function extractDocxText(string $tmpFile): string
{
    if ($tmpFile === '' || !is_file($tmpFile) || !class_exists('ZipArchive')) {
        return '';
    }

    $zip = new ZipArchive();
    if ($zip->open($tmpFile) !== true) {
        return '';
    }

    $targets = [];
    for ($i = 0; $i < $zip->numFiles; $i += 1) {
        $entryName = $zip->getNameIndex($i);
        if (!is_string($entryName)) {
            continue;
        }
        if (preg_match('/^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/u', $entryName)) {
            $targets[] = $entryName;
        }
    }
    sort($targets);

    if (!$targets) {
        $zip->close();
        return '';
    }

    $parts = [];
    foreach ($targets as $entryName) {
        $xml = $zip->getFromName($entryName);
        if (!is_string($xml) || trim($xml) === '') {
            continue;
        }
        $chunk = decodeDocxXmlText($xml);
        if ($chunk !== '') {
            $parts[] = $chunk;
        }
    }
    $zip->close();

    return trim(implode("\n\n", $parts));
}

function extractTextWithoutOcr(array $file): string
{
    $tmpFile = (string)($file['tmp_name'] ?? '');
    if ($tmpFile === '' || !is_file($tmpFile)) {
        return '';
    }

    $extension = detectFileExtension($file);
    if ($extension === 'docx' || $extension === 'docm') {
        return extractDocxText($tmpFile);
    }

    if (in_array($extension, ['txt', 'md', 'csv', 'json', 'xml', 'html'], true)) {
        $raw = @file_get_contents($tmpFile);
        if (!is_string($raw) || $raw === '') {
            return '';
        }
        return trim((string)$raw);
    }

    return '';
}

function localCommandExists(string $command): bool
{
    $output = [];
    $exitCode = 1;
    @exec('command -v ' . escapeshellarg($command) . ' 2>/dev/null', $output, $exitCode);
    return $exitCode === 0 && !empty($output);
}

function extractPdfTextWithPdftotextLocal(string $pdfPath): string
{
    if (!localCommandExists('pdftotext')) {
        return '';
    }
    $tmpTextPath = tempnam(sys_get_temp_dir(), 'pdftext_local_');
    if ($tmpTextPath === false) {
        return '';
    }
    try {
        $cmd = 'pdftotext -enc UTF-8 -f 1 -l ' . LOCAL_OCR_MAX_PAGES . ' '
            . escapeshellarg($pdfPath) . ' ' . escapeshellarg($tmpTextPath);
        @exec($cmd, $out, $code);
        if ($code !== 0 || !is_file($tmpTextPath)) {
            return '';
        }
        return trim((string)@file_get_contents($tmpTextPath));
    } finally {
        @unlink($tmpTextPath);
    }
}

function extractPdfTextWithTesseractLocal(string $pdfPath): string
{
    if (!localCommandExists('pdftoppm') || !localCommandExists('tesseract')) {
        return '';
    }
    $tmpBase = tempnam(sys_get_temp_dir(), 'pdfocr_local_');
    if ($tmpBase === false) {
        return '';
    }
    @unlink($tmpBase);
    $parts = [];
    try {
        for ($page = 1; $page <= LOCAL_OCR_MAX_PAGES; $page += 1) {
            $jpgPath = $tmpBase . '-p' . $page . '.jpg';
            $cmdRender = 'pdftoppm -jpeg -f ' . $page . ' -singlefile '
                . escapeshellarg($pdfPath) . ' ' . escapeshellarg(substr($jpgPath, 0, -4));
            @exec($cmdRender, $renderOut, $renderCode);
            if ($renderCode !== 0 || !is_file($jpgPath)) {
                if ($page === 1) {
                    break;
                }
                continue;
            }
            $ocr = shell_exec('tesseract ' . escapeshellarg($jpgPath) . ' stdout -l rus+eng 2>/dev/null');
            $text = trim((string)$ocr);
            if ($text !== '') {
                $parts[] = $text;
            }
            @unlink($jpgPath);
        }
    } finally {
        for ($page = 1; $page <= LOCAL_OCR_MAX_PAGES; $page += 1) {
            @unlink($tmpBase . '-p' . $page . '.jpg');
        }
    }
    return trim(implode("\n\n", $parts));
}

function extractImageTextWithTesseractLocal(string $imagePath): string
{
    if (!localCommandExists('tesseract') || !is_file($imagePath)) {
        return '';
    }
    $ocr = shell_exec('tesseract ' . escapeshellarg($imagePath) . ' stdout -l rus+eng 2>/dev/null');
    return trim((string)$ocr);
}

function extractTextWithLocalOcrFallback(array $file): string
{
    $tmpFile = (string)($file['tmp_name'] ?? '');
    if ($tmpFile === '' || !is_file($tmpFile)) {
        return '';
    }
    $extension = detectFileExtension($file);
    if ($extension === 'pdf') {
        $text = extractPdfTextWithPdftotextLocal($tmpFile);
        if ($text !== '') {
            return $text;
        }
        return extractPdfTextWithTesseractLocal($tmpFile);
    }
    if (in_array($extension, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'], true)) {
        return extractImageTextWithTesseractLocal($tmpFile);
    }
    return '';
}

function performOcrRequest(
    string $endpoint,
    string $apiKey,
    array $file,
    string $language = 'rus',
    ?string $fileUrl = null,
    array $extraPostFields = []
): array
{
    $ch = curl_init($endpoint);
    if ($ch === false) {
        return ['status' => 500, 'body' => false, 'curl_error' => 'Не удалось инициализировать cURL'];
    }

    $postFields = [
        'apikey' => $apiKey,
        'language' => $language,
    ];
    foreach ($extraPostFields as $key => $value) {
        if (is_string($key) && $key !== '' && (is_scalar($value) || $value === null)) {
            $postFields[$key] = $value;
        }
    }
    if (is_string($fileUrl) && trim($fileUrl) !== '') {
        $postFields['url'] = trim($fileUrl);
    } else {
        $tmpName = (string)($file['tmp_name'] ?? '');
        if ($tmpName === '' || !is_file($tmpName)) {
            return ['status' => 400, 'body' => false, 'curl_error' => 'Файл для OCR не найден'];
        }
        $mime = (string)($file['type'] ?? 'application/octet-stream');
        $extension = detectFileExtension($file);
        $name = ensureFileNameHasExtension((string)($file['name'] ?? 'document'), $extension);
        $postFields['file'] = curl_file_create($tmpName, $mime, $name);
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_TIMEOUT => 300,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $statusCode, 'body' => $responseBody, 'curl_error' => $curlError];
}

function normalizeOcrLanguageCode(string $language): string
{
    $value = mb_strtolower(trim($language));
    if ($value === '') {
        return 'rus';
    }
    if (preg_match('/^[a-z]{3}$/u', $value) === 1) {
        return $value;
    }
    if (preg_match('/([a-z]{3})/u', $value, $match) === 1) {
        return (string)$match[1];
    }
    return 'rus';
}

function shouldFallbackToUploadedOcr(array $ocrJson, int $statusCode): bool
{
    $message = mb_strtolower(textFromMixed($ocrJson['ErrorMessage'] ?? ''));
    if ($statusCode >= 500) {
        return true;
    }
    if (str_contains($message, 'file failed validation')) {
        return true;
    }
    if (str_contains($message, 'valid extension')) {
        return true;
    }
    if (str_contains($message, 'error e301')) {
        return true;
    }
    if (str_contains($message, 'error e500')) {
        return true;
    }
    if (str_contains($message, 'input file corrupted')) {
        return true;
    }
    if (str_contains($message, 'system resource exhaustion')) {
        return true;
    }
    return false;
}

function isOcrE301Error(array $ocrJson): bool
{
    $message = mb_strtolower(textFromMixed($ocrJson['ErrorMessage'] ?? ''));
    return str_contains($message, 'error e301') || str_contains($message, 'input file corrupted');
}

function ocrE301HelpText(): string
{
    return 'OCR не смог прочитать файл (E301). Возможные причины: файл повреждён при передаче, PDF защищён паролем/ограничениями, либо структура PDF нестандартная.';
}

function getImageDiagnostics(string $filePath): array
{
    $meta = [
        'path' => $filePath,
        'exists' => is_file($filePath),
        'sizeBytes' => is_file($filePath) ? (int)@filesize($filePath) : 0,
    ];
    if (!class_exists('Imagick') || !is_file($filePath)) {
        $meta['imagick'] = false;
        return $meta;
    }
    $meta['imagick'] = true;
    try {
        $img = new Imagick();
        $img->readImage($filePath);
        $res = $img->getImageResolution();
        $meta['format'] = (string)$img->getImageFormat();
        $meta['width'] = (int)$img->getImageWidth();
        $meta['height'] = (int)$img->getImageHeight();
        $meta['depth'] = (int)$img->getImageDepth();
        $meta['xDpi'] = isset($res['x']) ? (float)$res['x'] : 0.0;
        $meta['yDpi'] = isset($res['y']) ? (float)$res['y'] : 0.0;
        $img->clear();
        $img->destroy();
    } catch (Throwable $e) {
        $meta['error'] = $e->getMessage();
    }
    return $meta;
}

function ensureOcrTempDir(): string
{
    $baseDir = __DIR__ . '/app/tmp/ocr-preprocess';
    if (!is_dir($baseDir)) {
        @mkdir($baseDir, 0775, true);
    }
    try {
        $suffix = bin2hex(random_bytes(4));
    } catch (Throwable $e) {
        $suffix = (string)mt_rand(1000, 9999);
    }
    $runDir = $baseDir . '/' . gmdate('Ymd-His') . '-' . $suffix;
    if (!is_dir($runDir)) {
        @mkdir($runDir, 0775, true);
    }
    return $runDir;
}

function cleanupDirectory(string $directory): void
{
    if ($directory === '' || !is_dir($directory)) {
        return;
    }
    $items = @scandir($directory);
    if (!is_array($items)) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $directory . '/' . $item;
        if (is_dir($path)) {
            cleanupDirectory($path);
            @rmdir($path);
            continue;
        }
        @unlink($path);
    }
    @rmdir($directory);
}

function preprocessImageForOcr(string $sourcePath, string $outputPath, int $targetDpi = 300): bool
{
    if (!class_exists('Imagick')) {
        return false;
    }
    try {
        $image = new Imagick();
        $image->readImage($sourcePath);
        $image->setImageColorspace(Imagick::COLORSPACE_GRAY);
        $image->deskewImage(0.4 * Imagick::getQuantum());
        $image->contrastImage(true);
        $image->contrastImage(true);
        $image->reduceNoiseImage(1);
        $image->normalizeImage();
        $threshold = 0.62 * Imagick::getQuantum();
        $image->thresholdImage($threshold);
        $image->setImageUnits(Imagick::RESOLUTION_PIXELSPERINCH);
        $image->setImageResolution($targetDpi, $targetDpi);
        $image->setImageFormat('png');
        $written = $image->writeImage($outputPath);
        $image->clear();
        $image->destroy();
        return $written && is_file($outputPath);
    } catch (Throwable $e) {
        logApiDocs('warn', 'Image preprocess failed', ['error' => $e->getMessage()]);
        return false;
    }
}

function convertPdfToImages(string $pdfPath, string $tempDir, int $targetDpi = 300): array
{
    if (!class_exists('Imagick')) {
        return [];
    }
    $result = [];
    try {
        $imagick = new Imagick();
        $imagick->setResolution($targetDpi, $targetDpi);
        $imagick->readImage($pdfPath);
        $index = 1;
        foreach ($imagick as $page) {
            if (!$page instanceof Imagick) {
                continue;
            }
            $page->setImageUnits(Imagick::RESOLUTION_PIXELSPERINCH);
            $page->setImageResolution($targetDpi, $targetDpi);
            $page->setImageFormat('png');
            $imagePath = $tempDir . '/page-' . str_pad((string)$index, 4, '0', STR_PAD_LEFT) . '.png';
            if ($page->writeImage($imagePath) && is_file($imagePath)) {
                $result[] = $imagePath;
                $index += 1;
            }
        }
        $imagick->clear();
        $imagick->destroy();
    } catch (Throwable $e) {
        logApiDocs('warn', 'PDF to image conversion failed', ['error' => $e->getMessage()]);
        return [];
    }
    return $result;
}

function buildPreparedOcrFiles(array $file, bool $preprocessEnabled, string $tempDir): array
{
    $tmpName = (string)($file['tmp_name'] ?? '');
    $targetDpi = 300;
    $diagnostics = [
        'imagickAvailable' => class_exists('Imagick'),
        'targetDpi' => $targetDpi,
        'sourceExtension' => detectFileExtension($file),
        'sourceMime' => (string)($file['type'] ?? ''),
        'sourceSizeBytes' => (int)($file['size'] ?? 0),
    ];
    if ($tmpName === '' || !is_file($tmpName)) {
        $diagnostics['error'] = 'source_not_found';
        return ['files' => [], 'preprocessed' => false, 'mode' => 'none', 'diagnostics' => $diagnostics];
    }
    $extension = $diagnostics['sourceExtension'];
    $isPdf = $extension === 'pdf';

    if ($isPdf) {
        $pages = convertPdfToImages($tmpName, $tempDir, $targetDpi);
        if (!$pages) {
            $diagnostics['pdfPagesGenerated'] = 0;
            return ['files' => [$file], 'preprocessed' => false, 'mode' => 'pdf_original', 'diagnostics' => $diagnostics];
        }
        $prepared = [];
        $preparedDiagnostics = [];
        foreach ($pages as $i => $pagePath) {
            $prepared[] = [
                'name' => 'page-' . ($i + 1) . '.png',
                'tmp_name' => $pagePath,
                'type' => 'image/png',
                'size' => (int)@filesize($pagePath),
            ];
            $preparedDiagnostics[] = getImageDiagnostics($pagePath);
        }
        $diagnostics['pdfPagesGenerated'] = count($prepared);
        $diagnostics['prepared'] = $preparedDiagnostics;
        return ['files' => $prepared, 'preprocessed' => $preprocessEnabled, 'mode' => 'pdf_pages', 'diagnostics' => $diagnostics];
    }

    if (!$preprocessEnabled) {
        $diagnostics['prepared'] = [getImageDiagnostics($tmpName)];
        return ['files' => [$file], 'preprocessed' => false, 'mode' => 'original', 'diagnostics' => $diagnostics];
    }

    $preparedPath = $tempDir . '/preprocessed.png';
    $ok = preprocessImageForOcr($tmpName, $preparedPath, $targetDpi);
    if (!$ok) {
        $diagnostics['prepared'] = [getImageDiagnostics($tmpName)];
        return ['files' => [$file], 'preprocessed' => false, 'mode' => 'fallback_original', 'diagnostics' => $diagnostics];
    }
    $diagnostics['prepared'] = [getImageDiagnostics($preparedPath)];

    return [
        'files' => [[
            'name' => 'preprocessed.png',
            'tmp_name' => $preparedPath,
            'type' => 'image/png',
            'size' => (int)@filesize($preparedPath),
        ]],
        'preprocessed' => true,
        'mode' => 'image_preprocessed',
        'diagnostics' => $diagnostics,
    ];
}

function shrinkImageToLimit(string $sourcePath, string $targetPath, int $maxBytes): array
{
    $result = [
        'ok' => false,
        'path' => $sourcePath,
        'sizeBytes' => is_file($sourcePath) ? (int)@filesize($sourcePath) : 0,
        'attempts' => [],
    ];
    if ($maxBytes <= 0 || !is_file($sourcePath)) {
        return $result;
    }
    if ($result['sizeBytes'] > 0 && $result['sizeBytes'] <= $maxBytes) {
        $result['ok'] = true;
        return $result;
    }
    if (!class_exists('Imagick')) {
        return $result;
    }
    try {
        $qualitySteps = [78, 68, 58, 50, 42, 35];
        $scaleSteps = [1.0, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52];
        $base = new Imagick();
        $base->readImage($sourcePath);
        $base->setImageColorspace(Imagick::COLORSPACE_GRAY);
        $baseWidth = max(1, (int)$base->getImageWidth());
        $baseHeight = max(1, (int)$base->getImageHeight());

        foreach ($scaleSteps as $scale) {
            $width = max(900, (int)round($baseWidth * $scale));
            $height = max(1200, (int)round($baseHeight * $scale));
            foreach ($qualitySteps as $quality) {
                $img = clone $base;
                $img->resizeImage($width, $height, Imagick::FILTER_LANCZOS, 1, true);
                $img->setImageFormat('jpeg');
                $img->setImageCompressionQuality($quality);
                $img->stripImage();
                $written = $img->writeImage($targetPath);
                $size = $written && is_file($targetPath) ? (int)@filesize($targetPath) : 0;
                $result['attempts'][] = ['scale' => $scale, 'quality' => $quality, 'sizeBytes' => $size];
                $img->clear();
                $img->destroy();
                if ($written && $size > 0 && $size <= $maxBytes) {
                    $result['ok'] = true;
                    $result['path'] = $targetPath;
                    $result['sizeBytes'] = $size;
                    $base->clear();
                    $base->destroy();
                    return $result;
                }
            }
        }
        $base->clear();
        $base->destroy();
    } catch (Throwable $e) {
        $result['error'] = $e->getMessage();
    }
    $result['sizeBytes'] = is_file($targetPath) ? (int)@filesize($targetPath) : $result['sizeBytes'];
    $result['path'] = is_file($targetPath) ? $targetPath : $sourcePath;
    return $result;
}

function textFromMixed(mixed $value): string
{
    if (is_string($value)) {
        return trim($value);
    }
    if (is_numeric($value) || is_bool($value)) {
        return trim((string)$value);
    }
    if (!is_array($value)) {
        return '';
    }
    $parts = [];
    foreach ($value as $item) {
        $chunk = textFromMixed($item);
        if ($chunk !== '') {
            $parts[] = $chunk;
        }
    }
    return trim(implode('; ', $parts));
}

function parseAiJson(string $content): array
{
    $content = trim($content);
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        return $decoded;
    }

    if (preg_match('/\{[\s\S]*\}/u', $content, $matches)) {
        $decoded = json_decode($matches[0], true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return [];
}

function normalizeTextList(mixed $value): array
{
    if (is_array($value)) {
        $source = $value;
    } else {
        $raw = trim((string)$value);
        if ($raw === '') {
            return [];
        }
        $source = preg_split('/[,;\n|]+/u', $raw) ?: [];
    }
    $result = [];
    foreach ($source as $item) {
        $line = trim((string)$item);
        if ($line !== '') {
            $result[] = $line;
        }
    }
    return array_values(array_unique($result));
}

function sanitizeGeneratedResponse(string $value, array $sanitizePrefixes = []): string
{
    $text = trim(str_replace(["\r\n", "\r"], "\n", $value));
    if ($text === '') {
        return '';
    }

    $defaultPrefixes = ['сформируй официальный ответ', 'подготовь официальный ответ', 'решение ии:'];
    $prefixes = normalizeTextList($sanitizePrefixes);
    if (!$prefixes) {
        $prefixes = $defaultPrefixes;
    } else {
        $prefixes = array_merge($defaultPrefixes, $prefixes);
    }
    $prefixes = array_values(array_unique(array_map(static function (string $item): string {
        return mb_strtolower(trim($item));
    }, $prefixes)));

    $lines = explode("\n", $text);
    $cleaned = [];
    $signatureStarted = false;
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '') {
            if ($cleaned !== [] && end($cleaned) !== '') {
                $cleaned[] = '';
            }
            continue;
        }
        if ($signatureStarted) {
            continue;
        }
        $lower = mb_strtolower($trimmed);
        if (preg_match('/^(с уважением|подпись|signature)$/ui', $trimmed)) {
            $signatureStarted = true;
            continue;
        }
        if (preg_match('/^(тел|телефон|тел\.\/факс|e-?mail|унп|инн|кпп|огрн|бик|р\/с|расчетный счет)\b/ui', $trimmed)) {
            continue;
        }
        if (preg_match('/\b\S+@\S+\.\S+\b/u', $trimmed) || preg_match('/\(\d{3,}\)|\+\d[\d\-\s()]{5,}/u', $trimmed)) {
            continue;
        }
        $isMeta = false;
        foreach ($prefixes as $prefix) {
            if ($prefix !== '' && str_starts_with($lower, $prefix)) {
                $isMeta = true;
                break;
            }
        }
        if ($isMeta) {
            continue;
        }
        $cleaned[] = $line;
    }

    return trim(preg_replace('/\n{2,}/u', "\n\n", implode("\n", $cleaned)) ?? '');
}

function assessResponseQuality(string $response, array $extractedTexts): array
{
    $issues = [];
    $responseTrimmed = trim($response);
    if ($responseTrimmed === '') {
        $issues[] = 'Пустой текст ответа';
    }

    $hasDate = preg_match('/\b\d{2}\.\d{2}\.\d{4}\b/u', $responseTrimmed) === 1;
    if (!$hasDate) {
        $issues[] = 'Нет явной даты в формате ДД.ММ.ГГГГ';
    }

    $sourceHints = [];
    foreach ($extractedTexts as $entry) {
        $text = mb_strtolower(trim((string)($entry['text'] ?? '')));
        if ($text === '') {
            continue;
        }
        if (preg_match('/\b(договор|контракт|письм|акт|смет|срок)\b/u', $text, $m)) {
            $sourceHints[] = $m[1];
        }
        if (count($sourceHints) >= 3) {
            break;
        }
    }
    $sourceHints = array_values(array_unique($sourceHints));
    if ($sourceHints) {
        $responseLower = mb_strtolower($responseTrimmed);
        $hasOverlap = false;
        foreach ($sourceHints as $hint) {
            if (str_contains($responseLower, $hint)) {
                $hasOverlap = true;
                break;
            }
        }
        if (!$hasOverlap) {
            $issues[] = 'Слабая связь текста ответа с фактами из документов';
        }
    }

    return ['ok' => $issues === [], 'issues' => $issues];
}



function normalizeDecisionValue(string $value): string
{
    $normalized = mb_strtolower(trim($value));
    if ($normalized === '') {
        return '';
    }
    if (in_array($normalized, ['approve', 'approved', 'ok', 'accept', 'accepted', 'согласовать', 'утвердить'], true)) {
        return 'approve';
    }
    if (in_array($normalized, ['reject', 'rejected', 'deny', 'decline', 'отклонить', 'отказать'], true)) {
        return 'reject';
    }
    if (in_array($normalized, ['need_clarification', 'need_info', 'need_information', 'request_info', 'clarify', 'уточнить'], true)) {
        return 'need_clarification';
    }
    return '';
}

function normalizeStringList(mixed $value, int $maxItems = 6, int $maxLen = 240): array
{
    if (!is_array($value)) {
        $single = textFromMixed($value);
        return $single !== '' ? [mb_substr($single, 0, $maxLen)] : [];
    }
    $result = [];
    foreach ($value as $item) {
        $text = textFromMixed($item);
        if ($text === '') {
            continue;
        }
        $result[] = mb_substr($text, 0, $maxLen);
        if (count($result) >= $maxItems) {
            break;
        }
    }
    return $result;
}

function extractDecisionBlock(array $parsed): array
{
    $decision = normalizeDecisionValue(textFromMixed($parsed['decision'] ?? ''));
    $decisionReason = textFromMixed($parsed['decision_reason'] ?? '');
    $risks = normalizeStringList($parsed['risks'] ?? []);
    $requiredActions = normalizeStringList($parsed['required_actions'] ?? []);

    return [
        'decision' => $decision,
        'decision_reason' => $decisionReason,
        'risks' => $risks,
        'required_actions' => $requiredActions,
        'valid' => $decision !== '' && $decisionReason !== '',
    ];
}

function extractRequirementsFromTexts(array $extractedTexts, array $triggerPhrases = [], array $stopPrefixes = []): array
{
    $triggers = normalizeTextList($triggerPhrases);
    if (!$triggers) {
        $triggers = ['требуется выполнить', 'необходимо выполнить', 'следует выполнить', 'для выполнения работ необходимо'];
    }
    $skipPrefixes = normalizeTextList($stopPrefixes);
    if (!$skipPrefixes) {
        $skipPrefixes = ['стоимость', 'итого', 'приложение', 'директор', 'тел', 'факс', 'e-mail', 'email', 'унип', 'инн'];
    }

    $items = [];
    foreach ($extractedTexts as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $text = str_replace(["\r\n", "\r"], "\n", (string)($entry['text'] ?? ''));
        if ($text === '') {
            continue;
        }
        $normalized = preg_replace('/[•●▪◦·]/u', '-', $text);
        if (!is_string($normalized)) {
            continue;
        }
        $match = null;
        foreach ($triggers as $trigger) {
            $quoted = preg_quote($trigger, '/');
            if (preg_match('/' . $quoted . '\s*:?(?<tail>[\s\S]{0,1200})/iu', $normalized, $m)) {
                $match = $m;
                break;
            }
        }
        if (!is_array($match)) {
            continue;
        }
        $tail = (string)($match['tail'] ?? '');
        $lines = preg_split('/\n+/u', $tail) ?: [];
        foreach ($lines as $line) {
            $line = trim((string)$line);
            $line = preg_replace('/^\s*[-–—]\s*/u', '', $line ?? '');
            $line = trim((string)$line);
            if ($line === '') {
                continue;
            }
            if (mb_strlen($line) < 8) {
                continue;
            }
            $lineLower = mb_strtolower($line);
            $skip = false;
            foreach ($skipPrefixes as $prefix) {
                if ($prefix !== '' && str_starts_with($lineLower, mb_strtolower($prefix))) {
                    $skip = true;
                    break;
                }
            }
            if ($skip) {
                continue;
            }
            $items[] = rtrim($line, " .;") . '.';
            if (count($items) >= 8) {
                break 2;
            }
        }
    }

    return array_values(array_unique($items));
}

function xmlEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function normalizeDocText(string $value): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    return trim($normalized);
}

function textToWordParagraphsXml(string $text): string
{
    $lines = explode("\n", normalizeDocText($text));
    $chunks = [];
    foreach ($lines as $line) {
        $chunks[] = '<w:p><w:r><w:t xml:space="preserve">' . xmlEscape($line) . '</w:t></w:r></w:p>';
    }
    return implode('', $chunks);
}

function replaceDocxPlaceholders(string $templatePath, string $outputPath, array $replacements): bool
{
    if (!@copy($templatePath, $outputPath)) {
        return false;
    }

    $zip = new ZipArchive();
    if ($zip->open($outputPath) !== true) {
        return false;
    }

    $internalFiles = [];
    for ($i = 0; $i < $zip->numFiles; $i += 1) {
        $name = $zip->getNameIndex($i);
        if (is_string($name) && preg_match('/^word\\/(document|header\\d+|footer\\d+)\\.xml$/u', $name)) {
            $internalFiles[] = $name;
        }
    }

    $replacedAny = false;
    foreach ($internalFiles as $internalFile) {
        $content = $zip->getFromName($internalFile);
        if (!is_string($content) || $content === '') {
            continue;
        }
        $updated = $content;
        foreach ($replacements as $search => $replace) {
            $escaped = str_replace("\n", '</w:t><w:br/><w:t xml:space="preserve">', xmlEscape($replace));
            if (strpos($updated, $search) !== false) {
                $updated = str_replace($search, $escaped, $updated);
                $replacedAny = true;
            }
        }
        if ($updated !== $content) {
            $zip->addFromString($internalFile, $updated);
        }
    }

    if (!$replacedAny && isset($replacements['[ОТВЕТ_ИИ]'])) {
        $docXml = $zip->getFromName('word/document.xml');
        if (is_string($docXml) && $docXml !== '' && str_contains($docXml, '</w:body>')) {
            $appendXml = textToWordParagraphsXml((string)$replacements['[ОТВЕТ_ИИ]']);
            $docXml = str_replace('</w:body>', $appendXml . '</w:body>', $docXml);
            $zip->addFromString('word/document.xml', $docXml);
        }
    }

    return $zip->close();
}

function createPdfFromText(string $outputPath, string $documentTitle, string $answerText): bool
{
    if (!class_exists('TCPDF')) {
        return false;
    }
    $pdf = new TCPDF();
    $pdf->SetCreator('documents-api');
    $pdf->SetAuthor('documents-api');
    $pdf->SetTitle($documentTitle !== '' ? $documentTitle : 'Ответ');
    $pdf->SetMargins(16, 16, 16);
    $pdf->SetAutoPageBreak(true, 18);
    $pdf->AddPage();
    $pdf->SetFont('dejavusans', '', 10);
    if ($documentTitle !== '') {
        $pdf->SetFont('dejavusans', 'B', 12);
        $pdf->MultiCell(0, 0, $documentTitle, 0, 'L', false, 1);
        $pdf->Ln(2);
        $pdf->SetFont('dejavusans', '', 10);
    }
    $pdf->MultiCell(0, 0, $answerText, 0, 'L', false, 1);
    $pdf->Output($outputPath, 'F');
    return is_file($outputPath) && filesize($outputPath) > 0;
}

function convertDocxToPdfViaLibreOffice(string $docxPath, string $outputPath): bool
{
    if (!is_file($docxPath) || filesize($docxPath) <= 0) {
        return false;
    }
    $soffice = trim((string)@shell_exec('command -v soffice 2>/dev/null'));
    if ($soffice === '') {
        return false;
    }
    $outDir = dirname($outputPath);
    if (!is_dir($outDir)) {
        return false;
    }
    $command = escapeshellarg($soffice)
        . ' --headless --convert-to pdf --outdir '
        . escapeshellarg($outDir)
        . ' '
        . escapeshellarg($docxPath)
        . ' 2>&1';
    @shell_exec($command);
    $generatedPdf = preg_replace('/\.[^.]+$/u', '.pdf', $docxPath);
    if (!is_string($generatedPdf) || !is_file($generatedPdf) || filesize($generatedPdf) <= 0) {
        return false;
    }
    $moved = @rename($generatedPdf, $outputPath);
    if (!$moved) {
        $content = @file_get_contents($generatedPdf);
        if (!is_string($content) || $content === '') {
            return false;
        }
        if (@file_put_contents($outputPath, $content) === false) {
            return false;
        }
        @unlink($generatedPdf);
    }
    return is_file($outputPath) && filesize($outputPath) > 0;
}

function htmlToPlainText(string $html): string
{
    $text = trim(strip_tags($html));
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    $text = preg_replace('/\R{3,}/u', "\n\n", (string)$text);
    return trim((string)$text);
}

function normalizeHtmlColor(string $value): ?string
{
    $color = trim(mb_strtolower($value));
    if ($color === '') {
        return null;
    }
    if (preg_match('/^#[0-9a-f]{3}([0-9a-f]{3})?$/u', $color)) {
        return $color;
    }
    if (preg_match('/^rgb\\((\\s*\\d+\\s*,){2}\\s*\\d+\\s*\\)$/u', $color)) {
        return $color;
    }
    return null;
}

function normalizeAllowedInlineStyle(string $style): string
{
    $safe = [];
    $allowed = [
        'text-align',
        'font-weight',
        'font-style',
        'text-decoration',
        'color',
        'background-color',
        'font-size',
    ];
    $pairs = explode(';', $style);
    foreach ($pairs as $pair) {
        $parts = explode(':', $pair, 2);
        if (count($parts) !== 2) {
            continue;
        }
        $name = trim(mb_strtolower((string)$parts[0]));
        $value = trim((string)$parts[1]);
        if ($name === '' || $value === '' || !in_array($name, $allowed, true)) {
            continue;
        }
        if ($name === 'font-size') {
            if (!preg_match('/^\\d{1,2}(px|pt|em|rem|%)$/u', $value)) {
                continue;
            }
        } elseif ($name === 'text-align') {
            if (!in_array(mb_strtolower($value), ['left', 'center', 'right', 'justify'], true)) {
                continue;
            }
        } elseif ($name === 'color' || $name === 'background-color') {
            $normalizedColor = normalizeHtmlColor($value);
            if ($normalizedColor === null) {
                continue;
            }
            $value = $normalizedColor;
        }
        $safe[] = $name . ':' . $value;
    }
    return implode(';', $safe);
}

function sanitizeHtmlForExport(string $html): string
{
    $maxInputBytes = 2 * 1024 * 1024;
    if (strlen($html) > $maxInputBytes) {
        throw new RuntimeException('too large content: max 2MB HTML');
    }
    $dom = new DOMDocument();
    $wrapped = '<!DOCTYPE html><html><body>' . $html . '</body></html>';
    @$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
    $body = $dom->getElementsByTagName('body')->item(0);
    if (!$body instanceof DOMElement) {
        throw new RuntimeException('invalid html content');
    }
    $allowedTags = [
        'p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'br',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a',
    ];
    $nodes = [$body];
    while ($nodes) {
        $node = array_pop($nodes);
        if (!$node instanceof DOMElement) {
            continue;
        }
        for ($i = $node->childNodes->length - 1; $i >= 0; $i -= 1) {
            $child = $node->childNodes->item($i);
            if ($child instanceof DOMElement) {
                $tag = mb_strtolower($child->tagName);
                if (!in_array($tag, $allowedTags, true)) {
                    while ($child->firstChild) {
                        $node->insertBefore($child->firstChild, $child);
                    }
                    $node->removeChild($child);
                    continue;
                }
                if ($child->hasAttributes()) {
                    for ($a = $child->attributes->length - 1; $a >= 0; $a -= 1) {
                        $attr = $child->attributes->item($a);
                        if (!$attr) {
                            continue;
                        }
                        $name = mb_strtolower($attr->name);
                        $value = trim((string)$attr->value);
                        if (str_starts_with($name, 'on')) {
                            $child->removeAttribute($attr->name);
                            continue;
                        }
                        if ($name === 'style') {
                            $safeStyle = normalizeAllowedInlineStyle($value);
                            if ($safeStyle === '') {
                                $child->removeAttribute('style');
                            } else {
                                $child->setAttribute('style', $safeStyle);
                            }
                            continue;
                        }
                        if ($tag === 'a' && $name === 'href') {
                            if (!preg_match('/^(https?:|mailto:|tel:|#)/iu', $value)) {
                                $child->removeAttribute('href');
                            }
                            continue;
                        }
                        if ($tag === 'img' && $name === 'src') {
                            $isDataImage = str_starts_with($value, 'data:image/');
                            $isHttpImage = preg_match('/^https?:\\/\\//iu', $value) === 1;
                            if (!$isDataImage && !$isHttpImage) {
                                throw new RuntimeException('unsupported image type: allowed data:image/* or https URLs');
                            }
                            if ($isDataImage) {
                                if (!preg_match('/^data:image\\/(png|jpeg|jpg|gif|webp);base64,/iu', $value)) {
                                    throw new RuntimeException('unsupported image type: use png/jpeg/jpg/gif/webp');
                                }
                                if (strlen($value) > 4 * 1024 * 1024) {
                                    throw new RuntimeException('too large content: image payload exceeds 4MB');
                                }
                            }
                            continue;
                        }
                        if (!in_array($name, ['style', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan'], true)) {
                            $child->removeAttribute($attr->name);
                        }
                    }
                }
                $nodes[] = $child;
            }
        }
    }

    $clean = '';
    foreach ($body->childNodes as $child) {
        $clean .= $dom->saveHTML($child) ?: '';
    }
    $clean = trim($clean);
    if ($clean === '') {
        throw new RuntimeException('html is empty after sanitize');
    }
    if (strlen($clean) > $maxInputBytes) {
        throw new RuntimeException('too large content after sanitize');
    }
    return $clean;
}

function buildDocxFromHtmlPipeline(string $outputPath, string $html, ?string $templatePath = null): bool
{
    $safeTemplate = is_string($templatePath) && $templatePath !== '' && is_file($templatePath) ? $templatePath : null;
    if ($safeTemplate && replaceDocxPlaceholderWithHtml(
        $safeTemplate,
        $outputPath,
        $html,
        ['{{AI_RESPONSE}}', '[AI_RESPONSE]', '{AI_RESPONSE}', '[[AI_RESPONSE]]']
    )) {
        return true;
    }
    if (createDocxFromHtmlUsingPhpWord($outputPath, $html)) {
        return true;
    }
    if ($safeTemplate && replaceDocxWithHtml($safeTemplate, $outputPath, $html)) {
        return true;
    }
    return false;
}

function nodeToHtml(DOMNode $node, DOMXPath $xpath): string
{
    $html = '';
    foreach ($node->childNodes as $child) {
        if ($child->nodeType === XML_TEXT_NODE) {
            $html .= htmlspecialchars((string)$child->textContent, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            continue;
        }
        if (!($child instanceof DOMElement)) {
            continue;
        }
        $tag = $child->nodeName;
        if ($tag === 'w:p') {
            $html .= '<p>' . nodeToHtml($child, $xpath) . '</p>';
        } elseif ($tag === 'w:r') {
            $html .= nodeToHtml($child, $xpath);
        } elseif ($tag === 'w:t') {
            $html .= htmlspecialchars((string)$child->textContent, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        } elseif ($tag === 'w:br' || $tag === 'w:cr') {
            $html .= '<br>';
        } elseif ($tag === 'w:tab') {
            $html .= '&emsp;';
        } elseif ($tag === 'w:hyperlink') {
            $html .= '<a href="#">' . nodeToHtml($child, $xpath) . '</a>';
        } else {
            $html .= nodeToHtml($child, $xpath);
        }
    }
    return $html;
}

function docxToHtml(string $docxPath): string
{
    if (is_file(__DIR__ . '/vendor/autoload.php')) {
        require_once __DIR__ . '/vendor/autoload.php';
    }

    if (class_exists('\\PhpOffice\\PhpWord\\IOFactory') && class_exists('\\PhpOffice\\PhpWord\\Writer\\HTML')) {
        try {
            $phpWord = \PhpOffice\PhpWord\IOFactory::load($docxPath);
            $htmlWriter = new \PhpOffice\PhpWord\Writer\HTML($phpWord);
            ob_start();
            $htmlWriter->save('php://output');
            $content = (string)ob_get_clean();
            if (trim($content) !== '') {
                return $content;
            }
        } catch (Throwable $e) {
            logApiDocs('warn', 'PhpWord DOCX->HTML conversion failed', ['error' => $e->getMessage()]);
        }
    }

    $zip = new ZipArchive();
    if ($zip->open($docxPath) !== true) {
        return '<p>Ошибка чтения шаблона</p>';
    }
    $xml = $zip->getFromName('word/document.xml');
    $zip->close();
    if (!$xml) {
        return '<p>Некорректный DOCX</p>';
    }

    $dom = new DOMDocument();
    $loaded = @$dom->loadXML((string)$xml, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET | LIBXML_COMPACT);
    if (!$loaded) {
        return '<p>Некорректный XML в DOCX</p>';
    }
    $xpath = new DOMXPath($dom);
    $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    $body = $xpath->query('/w:document/w:body')->item(0);
    if (!$body) {
        return '<p>Нет содержимого</p>';
    }
    return '<div class="docx-preview">' . nodeToHtml($body, $xpath) . '</div>';
}

function htmlNodeInnerXml(DOMNode $node): string
{
    $xml = '';
    foreach ($node->childNodes as $child) {
        $xml .= $node->ownerDocument?->saveXML($child) ?? '';
    }
    return $xml;
}

function htmlToWordBodyXml(string $html): string
{
    $wrapped = '<!DOCTYPE html><html><body>' . $html . '</body></html>';
    $dom = new DOMDocument();
    @$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    $body = $dom->getElementsByTagName('body')->item(0);
    if (!$body instanceof DOMElement) {
        return textToWordParagraphsXml(htmlToPlainText($html));
    }

    $chunks = [];
    foreach ($body->childNodes as $node) {
        if (!$node instanceof DOMElement) {
            continue;
        }
        $tag = strtolower($node->tagName);
        if (in_array($tag, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], true)) {
            $text = trim($node->textContent ?? '');
            if ($text !== '') {
                $chunks[] = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">' . xmlEscape($text) . '</w:t></w:r></w:p>';
            }
            continue;
        }
        if ($tag === 'ul' || $tag === 'ol') {
            foreach ($node->getElementsByTagName('li') as $li) {
                $prefix = $tag === 'ol' ? '1. ' : '• ';
                $text = trim($li->textContent ?? '');
                if ($text !== '') {
                    $chunks[] = '<w:p><w:r><w:t xml:space="preserve">' . xmlEscape($prefix . $text) . '</w:t></w:r></w:p>';
                }
            }
            continue;
        }
        if ($tag === 'table') {
            $rowsXml = [];
            foreach ($node->getElementsByTagName('tr') as $tr) {
                $cellXml = [];
                foreach ($tr->childNodes as $cell) {
                    if (!$cell instanceof DOMElement) {
                        continue;
                    }
                    $cellTag = strtolower($cell->tagName);
                    if ($cellTag !== 'td' && $cellTag !== 'th') {
                        continue;
                    }
                    $cellText = trim($cell->textContent ?? '');
                    $cellXml[] = '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">' . xmlEscape($cellText) . '</w:t></w:r></w:p></w:tc>';
                }
                if ($cellXml) {
                    $rowsXml[] = '<w:tr>' . implode('', $cellXml) . '</w:tr>';
                }
            }
            if ($rowsXml) {
                $chunks[] = '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders></w:tblPr>' . implode('', $rowsXml) . '</w:tbl>';
            }
            continue;
        }

        $innerText = trim(strip_tags(htmlNodeInnerXml($node)));
        if ($innerText !== '') {
            $chunks[] = '<w:p><w:r><w:t xml:space="preserve">' . xmlEscape($innerText) . '</w:t></w:r></w:p>';
        }
    }
    return $chunks ? implode('', $chunks) : textToWordParagraphsXml(htmlToPlainText($html));
}

function replaceDocxWithHtml(string $templatePath, string $outputPath, string $html): bool
{
    if (!@copy($templatePath, $outputPath)) {
        return false;
    }
    $zip = new ZipArchive();
    if ($zip->open($outputPath) !== true) {
        return false;
    }
    $documentXml = $zip->getFromName('word/document.xml');
    if (!is_string($documentXml) || $documentXml === '' || !str_contains($documentXml, '<w:body>')) {
        $zip->close();
        return false;
    }
    $bodyXml = htmlToWordBodyXml($html);
    $updatedXml = preg_replace('/<w:body>.*<\/w:body>/su', '<w:body>' . $bodyXml . '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>', $documentXml);
    if (!is_string($updatedXml) || $updatedXml === '') {
        $zip->close();
        return false;
    }
    $zip->addFromString('word/document.xml', $updatedXml);
    return $zip->close();
}

function replaceDocxPlaceholderWithHtml(string $templatePath, string $outputPath, string $html, array $placeholders): bool
{
    if (!@copy($templatePath, $outputPath)) {
        return false;
    }
    $zip = new ZipArchive();
    if ($zip->open($outputPath) !== true) {
        return false;
    }

    $documentXml = $zip->getFromName('word/document.xml');
    if (!is_string($documentXml) || $documentXml === '') {
        $zip->close();
        return false;
    }

    $bodyXml = htmlToWordBodyXml($html);
    $updatedXml = $documentXml;
    $replaced = false;

    foreach ($placeholders as $placeholder) {
        $marker = trim((string)$placeholder);
        if ($marker === '') {
            continue;
        }
        $escapedMarker = xmlEscape($marker);
        $pattern = '/<w:p\\b[^>]*>.*?' . preg_quote($escapedMarker, '/') . '.*?<\\/w:p>/su';
        $candidate = preg_replace($pattern, $bodyXml, $updatedXml, 1, $count);
        if (is_string($candidate) && $count > 0) {
            $updatedXml = $candidate;
            $replaced = true;
            break;
        }
    }

    if (!$replaced || $updatedXml === '') {
        $zip->close();
        return false;
    }

    $zip->addFromString('word/document.xml', $updatedXml);
    return $zip->close();
}

function resolveDocxPlaceholdersFromRequest(): array
{
    $defaults = ['{{AI_RESPONSE}}', '[AI_RESPONSE]', '{AI_RESPONSE}', '[[AI_RESPONSE]]'];
    $raw = trim((string)($_POST['placeholders'] ?? ''));
    if ($raw === '') {
        return $defaults;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        $single = trim($raw);
        return $single !== '' ? array_values(array_unique(array_merge([$single], $defaults))) : $defaults;
    }
    $result = [];
    foreach ($decoded as $item) {
        $marker = trim((string)$item);
        if ($marker !== '') {
            $result[] = $marker;
        }
    }
    if (!$result) {
        return $defaults;
    }
    return array_values(array_unique(array_merge($result, $defaults)));
}

function createDocxFromHtmlUsingPhpWord(string $outputPath, string $html): bool
{
    if (!class_exists('\\PhpOffice\\PhpWord\\PhpWord') || !class_exists('\\PhpOffice\\PhpWord\\Shared\\Html')) {
        return false;
    }

    try {
        $phpWord = new \PhpOffice\PhpWord\PhpWord();
        $section = $phpWord->addSection([
            'pageSizeW' => 11906,
            'pageSizeH' => 16838,
            'marginTop' => 1134,
            'marginRight' => 1134,
            'marginBottom' => 1134,
            'marginLeft' => 1134,
        ]);
        \PhpOffice\PhpWord\Shared\Html::addHtml($section, $html, false, false);
        $writer = \PhpOffice\PhpWord\IOFactory::createWriter($phpWord, 'Word2007');
        $writer->save($outputPath);
        return is_file($outputPath) && filesize($outputPath) > 0;
    } catch (Throwable $e) {
        logApiDocs('warn', 'PhpWord conversion failed', ['error' => $e->getMessage()]);
        return false;
    }
}

function resolveTemplatePath(string $fileName, array $extraDirectories = []): string
{
    $normalizedName = ltrim($fileName, '/');
    $documentRoot = isset($_SERVER['DOCUMENT_ROOT']) ? rtrim((string)$_SERVER['DOCUMENT_ROOT'], '/') : '';
    $candidates = [
        __DIR__ . '/app/templates/' . $normalizedName,
        __DIR__ . '/templates/' . $normalizedName,
        dirname(__DIR__) . '/templates/' . $normalizedName,
        dirname(__DIR__, 2) . '/templates/' . $normalizedName,
        '/app/templates/' . $normalizedName,
    ];
    if ($documentRoot !== '') {
        $candidates[] = $documentRoot . '/js/documents/templates/' . $normalizedName;
        $candidates[] = $documentRoot . '/templates/' . $normalizedName;
    }
    foreach ($extraDirectories as $directory) {
        $normalizedDir = is_string($directory) ? rtrim(trim($directory), '/') : '';
        if ($normalizedDir !== '') {
            $candidates[] = $normalizedDir . '/' . $normalizedName;
        }
    }

    foreach ($candidates as $candidate) {
        if (is_string($candidate) && $candidate !== '' && is_file($candidate)) {
            return $candidate;
        }
    }

    return '';
}

function looksLikeJsonText(string $value): bool
{
    $trimmed = trim($value);
    if ($trimmed === '') {
        return false;
    }
    return (str_starts_with($trimmed, '{') && str_ends_with($trimmed, '}'))
        || (str_starts_with($trimmed, '[') && str_ends_with($trimmed, ']'));
}

function normalizeInputText(string $value): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    $normalized = preg_replace('/[ \t]+/u', ' ', $normalized);
    $normalized = preg_replace('/\n{3,}/u', "\n\n", (string)$normalized);
    return trim((string)$normalized);
}

function deduplicateAndNormalizeExtractedTexts(array $entries): array
{
    $result = [];
    $seen = [];
    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $rawText = isset($entry['text']) ? (string)$entry['text'] : '';
        $text = normalizeInputText($rawText);
        if ($text === '') {
            continue;
        }
        $name = trim((string)($entry['name'] ?? 'Файл'));
        $type = trim((string)($entry['type'] ?? ''));
        $fingerprint = md5(mb_strtolower($name . '|' . $type . '|' . $text));
        if (isset($seen[$fingerprint])) {
            continue;
        }
        $seen[$fingerprint] = true;
        $result[] = [
            'name' => $name !== '' ? $name : 'Файл',
            'type' => $type,
            'text' => $text,
        ];
    }
    return $result;
}

function deduplicateExtractedTextsByNameAndHash(array $entries): array
{
    $result = [];
    $seen = [];
    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $text = normalizeInputText((string)($entry['text'] ?? ''));
        if ($text === '') {
            continue;
        }
        $name = trim((string)($entry['name'] ?? 'Файл'));
        $type = trim((string)($entry['type'] ?? ''));
        $fingerprint = md5(mb_strtolower(($name !== '' ? $name : 'Файл') . '|' . $text));
        if (isset($seen[$fingerprint])) {
            continue;
        }
        $seen[$fingerprint] = true;
        $result[] = [
            'name' => $name !== '' ? $name : 'Файл',
            'type' => $type,
            'text' => $text,
        ];
    }
    return $result;
}

function extractTextsFromUploadedFiles(array $files, array $env): array
{
    $supportedOcrExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'];
    $ocrApiKey = trim((string)($env['OCR_API_KEY'] ?? ''));
    $ocrBaseUrl = trim((string)($env['OCR_BASE_URL'] ?? 'https://api.ocr.space/parse/image'));
    $ocrLanguage = trim((string)($env['OCR_DEFAULT_LANGUAGE'] ?? 'rus'));
    $ocrPreprocessEnabled = !in_array(mb_strtolower(trim((string)($env['OCR_PREPROCESS'] ?? '1'))), ['0', 'false', 'off', 'no'], true);
    $ocrExtraFields = [
        'OCREngine' => trim((string)($env['OCR_ENGINE'] ?? '2')) ?: '2',
        'scale' => trim((string)($env['OCR_SCALE'] ?? 'true')) ?: 'true',
        'detectOrientation' => trim((string)($env['OCR_DETECT_ORIENTATION'] ?? 'true')) ?: 'true',
    ];

    $entries = [];
    $diagnostics = [
        'totalFiles' => count($files),
        'readFiles' => 0,
        'skippedFiles' => 0,
        'skipped' => [],
    ];

    foreach ($files as $file) {
        if (!is_array($file)) {
            continue;
        }
        $name = trim((string)($file['name'] ?? 'Файл'));
        $tmpName = (string)($file['tmp_name'] ?? '');
        $type = trim((string)($file['type'] ?? ''));
        $extension = detectFileExtension($file);
        if ($tmpName === '' || !is_file($tmpName)) {
            $diagnostics['skippedFiles'] += 1;
            $diagnostics['skipped'][] = ['name' => $name, 'reason' => 'file_not_found'];
            continue;
        }

        $directText = extractTextWithoutOcr($file);
        if ($directText !== '') {
            $entries[] = ['name' => $name, 'type' => $type, 'text' => mb_substr($directText, 0, 12000)];
            $diagnostics['readFiles'] += 1;
            continue;
        }

        $localOcrText = extractTextWithLocalOcrFallback($file);
        if ($localOcrText !== '') {
            $entries[] = ['name' => $name, 'type' => $type, 'text' => mb_substr($localOcrText, 0, 12000)];
            $diagnostics['readFiles'] += 1;
            continue;
        }

        if (!in_array($extension, $supportedOcrExtensions, true)) {
            $diagnostics['skippedFiles'] += 1;
            $diagnostics['skipped'][] = ['name' => $name, 'reason' => 'unsupported_format'];
            continue;
        }
        if ($ocrApiKey === '') {
            $diagnostics['skippedFiles'] += 1;
            $diagnostics['skipped'][] = ['name' => $name, 'reason' => 'ocr_not_configured'];
            continue;
        }

        $tempDir = ensureOcrTempDir();
        $prepared = buildPreparedOcrFiles($file, $ocrPreprocessEnabled, $tempDir);
        $preparedFiles = isset($prepared['files']) && is_array($prepared['files']) ? $prepared['files'] : [];
        $texts = [];
        $failed = false;
        foreach ($preparedFiles as $preparedFile) {
            if (!is_array($preparedFile)) {
                continue;
            }
            $ocrResult = performOcrRequest($ocrBaseUrl, $ocrApiKey, $preparedFile, $ocrLanguage, null, $ocrExtraFields);
            $body = $ocrResult['body'];
            if ($body === false) {
                $failed = true;
                continue;
            }
            $ocrJson = json_decode((string)$body, true);
            if (!is_array($ocrJson) || (($ocrJson['IsErroredOnProcessing'] ?? false) === true)) {
                $failed = true;
                continue;
            }
            $parsedResults = isset($ocrJson['ParsedResults']) && is_array($ocrJson['ParsedResults']) ? $ocrJson['ParsedResults'] : [];
            foreach ($parsedResults as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $piece = trim((string)($row['ParsedText'] ?? ''));
                if ($piece !== '') {
                    $texts[] = $piece;
                }
            }
        }
        cleanupDirectory($tempDir);

        $ocrText = trim(implode("\n\n", $texts));
        if ($ocrText !== '') {
            $entries[] = ['name' => $name, 'type' => $type, 'text' => mb_substr($ocrText, 0, 12000)];
            $diagnostics['readFiles'] += 1;
            continue;
        }

        $diagnostics['skippedFiles'] += 1;
        $diagnostics['skipped'][] = ['name' => $name, 'reason' => $failed ? 'ocr_failed' : 'empty_text'];
    }

    return ['entries' => $entries, 'diagnostics' => $diagnostics];
}

function chunkPriorityScore(string $text, int $maxPage): int
{
    $lower = mb_strtolower($text);
    $score = 0;
    $requisitesKeywords = ['реквизит', 'инн', 'кпп', 'огрн', 'бик', 'корр', 'расчетный счет', 'р/с', 'банк'];
    foreach ($requisitesKeywords as $keyword) {
        if (str_contains($lower, $keyword)) {
            $score += 220;
            break;
        }
    }

    if (preg_match('/страница\s*(\d{1,4})/ui', $text, $matches)) {
        $pageNumber = (int)($matches[1] ?? 0);
        if ($pageNumber > 0) {
            $score += 80;
            if ($maxPage > 0) {
                $score += max(0, $pageNumber - max(1, $maxPage - 3)) * 40;
            }
            $score += min($pageNumber, 30);
        }
    }

    return $score;
}

function applyInputBudget(array $entries, int $maxChars): array
{
    $chunks = [];
    $maxPage = 0;
    foreach ($entries as $entry) {
        $text = trim((string)($entry['text'] ?? ''));
        if ($text === '') {
            continue;
        }
        if (preg_match_all('/страница\s*(\d{1,4})/ui', $text, $matches)) {
            foreach ($matches[1] as $pageRaw) {
                $maxPage = max($maxPage, (int)$pageRaw);
            }
        }
        $chunks[] = [
            'name' => (string)($entry['name'] ?? 'Файл'),
            'type' => (string)($entry['type'] ?? ''),
            'text' => $text,
        ];
    }
    if (!$chunks) {
        return ['entries' => [], 'charsIn' => 0, 'chunksUsed' => 0, 'filesUsed' => 0];
    }

    foreach ($chunks as $index => $chunk) {
        $chunks[$index]['score'] = chunkPriorityScore($chunk['text'], $maxPage);
        $chunks[$index]['index'] = $index;
    }
    usort($chunks, static function (array $a, array $b): int {
        if ($a['score'] === $b['score']) {
            return $a['index'] <=> $b['index'];
        }
        return $b['score'] <=> $a['score'];
    });

    $selected = [];
    $usedChars = 0;
    $usedFiles = [];
    $selectedFingerprints = [];
    $fileFirstChunkUsed = [];
    $minDistinctFiles = min(3, count($chunks));
    $minCharsPerFile = max(2000, min(12000, (int)floor($maxChars / max(1, $minDistinctFiles))));

    foreach ($chunks as $chunk) {
        if (count($fileFirstChunkUsed) >= $minDistinctFiles || $usedChars >= $maxChars) {
            break;
        }
        $fileName = $chunk['name'];
        if (isset($fileFirstChunkUsed[$fileName])) {
            continue;
        }
        $available = $maxChars - $usedChars;
        if ($available < 200) {
            break;
        }
        $budgetForChunk = min($available, $minCharsPerFile);
        if ($budgetForChunk < 200) {
            continue;
        }
        $text = $chunk['text'];
        $length = mb_strlen($text);
        if ($length > $budgetForChunk) {
            $headSize = (int)floor($budgetForChunk * 0.7);
            $tailSize = max(0, $budgetForChunk - $headSize - 40);
            $head = trim(mb_substr($text, 0, max(0, $headSize)));
            $tail = $tailSize > 0 ? trim(mb_substr($text, -$tailSize)) : '';
            $text = $tail !== ''
                ? $head . "\n...\n[сокращено]\n...\n" . $tail
                : $head . '…';
            $length = mb_strlen($text);
        }
        if ($length <= 0) {
            continue;
        }
        $fingerprint = md5(mb_strtolower($fileName . '|' . $chunk['type'] . '|' . $text));
        if (isset($selectedFingerprints[$fingerprint])) {
            continue;
        }
        $selectedFingerprints[$fingerprint] = true;
        $selected[] = [
            'name' => $fileName,
            'type' => $chunk['type'],
            'text' => $text,
        ];
        $fileFirstChunkUsed[$fileName] = true;
        $usedChars += $length;
        $usedFiles[$fileName] = true;
    }

    foreach ($chunks as $chunk) {
        if ($usedChars >= $maxChars) {
            break;
        }
        $available = $maxChars - $usedChars;
        if ($available <= 0) {
            break;
        }
        $text = $chunk['text'];
        $length = mb_strlen($text);
        if ($length > $available) {
            if ($available < 200) {
                continue;
            }
            $text = mb_substr($text, 0, $available) . '…';
            $length = mb_strlen($text);
        }
        $fingerprint = md5(mb_strtolower($chunk['name'] . '|' . $chunk['type'] . '|' . $text));
        if (isset($selectedFingerprints[$fingerprint])) {
            continue;
        }
        $selectedFingerprints[$fingerprint] = true;
        $selected[] = [
            'name' => $chunk['name'],
            'type' => $chunk['type'],
            'text' => $text,
        ];
        $usedChars += $length;
        $usedFiles[$chunk['name']] = true;
    }

    return [
        'entries' => $selected,
        'charsIn' => $usedChars,
        'chunksUsed' => count($selected),
        'filesUsed' => count($usedFiles),
    ];
}

$env = loadEnv(getEnvPaths());

$prompt = trim((string)($_POST['prompt'] ?? ''));
$documentTitle = trim((string)($_POST['documentTitle'] ?? ''));
$contextRaw = isset($_POST['context']) ? (string)$_POST['context'] : '';
$maxContextChars = (int)($env['AI_MAX_CONTEXT_CHARS'] ?? 120000);
if ($maxContextChars < 2000) {
    $maxContextChars = 2000;
}
$contextSizeErrorHint = trim((string)($env['AI_CONTEXT_SIZE_ERROR_HINT'] ?? 'Переключите режим на «кратко» или сократите вложения.'));
if ($contextRaw !== '' && mb_strlen($contextRaw) > $maxContextChars) {
    jsonResponse(400, [
        'ok' => false,
        'error' => 'Контекст слишком большой: ' . mb_strlen($contextRaw) . ' символов. Максимум: ' . $maxContextChars . '. ' . $contextSizeErrorHint,
    ]);
}
if ($contextRaw !== '' && !looksLikeJsonText($contextRaw)) {
    jsonResponse(400, ['ok' => false, 'error' => 'Некорректный формат context: ожидается JSON-объект.']);
}
$context = safeJsonDecode($contextRaw);
if (!is_array($context)) {
    $context = [];
}
$runtimeConfig = [
    'sanitizePrefixes' => normalizeTextList($env['AI_SANITIZE_PREFIXES'] ?? []),
    'requirementTriggers' => normalizeTextList($env['AI_REQUIREMENT_TRIGGERS'] ?? []),
    'requirementStopPrefixes' => normalizeTextList($env['AI_REQUIREMENT_STOP_PREFIXES'] ?? []),
];
if (isset($context['aiRuntime']) && is_array($context['aiRuntime'])) {
    if (isset($context['aiRuntime']['sanitizePrefixes'])) {
        $runtimeConfig['sanitizePrefixes'] = normalizeTextList($context['aiRuntime']['sanitizePrefixes']);
    }
    if (isset($context['aiRuntime']['requirementTriggers'])) {
        $runtimeConfig['requirementTriggers'] = normalizeTextList($context['aiRuntime']['requirementTriggers']);
    }
    if (isset($context['aiRuntime']['requirementStopPrefixes'])) {
        $runtimeConfig['requirementStopPrefixes'] = normalizeTextList($context['aiRuntime']['requirementStopPrefixes']);
    }
}
$normalizedContextRaw = (string)json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($normalizedContextRaw !== '' && mb_strlen($normalizedContextRaw) > $maxContextChars) {
    jsonResponse(400, [
        'ok' => false,
        'error' => 'Контекст после нормализации слишком большой: ' . mb_strlen($normalizedContextRaw) . ' символов. Максимум: ' . $maxContextChars . '. ' . $contextSizeErrorHint,
    ]);
}
$responseStyle = trim((string)($_POST['responseStyle'] ?? ''));
$aiBehavior = trim((string)($_POST['aiBehavior'] ?? ''));
$modeRaw = trim((string)($_POST['mode'] ?? 'free'));
$aiMode = mb_strtolower($modeRaw);
if (!in_array($aiMode, ['free', 'paid'], true)) {
    $aiMode = 'free';
}
$requestedModel = trim((string)($_POST['model'] ?? ''));
$briefModeRaw = $_POST['briefMode'] ?? '';
$action = trim((string)($_POST['action'] ?? ''));
$extractedTextsRaw = isset($_POST['extractedTexts']) ? (string)$_POST['extractedTexts'] : '';
$maxExtractedTextsChars = normalizeIntSetting($env['AI_MAX_EXTRACTED_TEXTS_CHARS'] ?? 200000, 200000, 20000, 1500000);
if ($extractedTextsRaw !== '' && mb_strlen($extractedTextsRaw) > $maxExtractedTextsChars) {
    jsonResponse(413, [
        'ok' => false,
        'error' => 'extractedTexts слишком большой: ' . mb_strlen($extractedTextsRaw) . ' символов. Максимум: ' . $maxExtractedTextsChars,
    ]);
}

$briefMode = false;
if (is_bool($briefModeRaw)) {
    $briefMode = $briefModeRaw;
} elseif (is_numeric($briefModeRaw)) {
    $briefMode = (int)$briefModeRaw === 1;
} elseif (is_string($briefModeRaw)) {
    $normalizedBriefMode = mb_strtolower(trim($briefModeRaw));
    $briefMode = in_array($normalizedBriefMode, ['1', 'true', 'yes', 'on'], true);
}
if (!$briefMode && isset($context['isolatedFileMode'])) {
    $isolatedModeRaw = $context['isolatedFileMode'];
    if (is_bool($isolatedModeRaw)) {
        $briefMode = $isolatedModeRaw;
    } elseif (is_numeric($isolatedModeRaw)) {
        $briefMode = (int)$isolatedModeRaw === 1;
    } elseif (is_string($isolatedModeRaw)) {
        $normalizedIsolatedMode = mb_strtolower(trim($isolatedModeRaw));
        $briefMode = in_array($normalizedIsolatedMode, ['1', 'true', 'yes', 'on'], true);
    }
}
if ($briefMode) {
    $aiMode = 'paid';
}

if (
    $action !== ''
    && $action !== 'ai_response_analyze'
    && $action !== 'generate_summary'
    && $action !== 'ocr_extract'
    && $action !== 'generate_document'
    && $action !== 'generate_from_html'
    && $action !== 'generate_from_editor'
    && $action !== 'load_template_html'
) {
    logApiDocs('warn', 'Invalid action', ['action' => $action]);
    jsonResponse(400, ['ok' => false, 'error' => 'Неверный action']);
}

if ($action === 'load_template_html') {
    $templatePath = resolveTemplatePath('template.docx', []);
    if (!is_file($templatePath)) {
        jsonResponse(404, ['ok' => false, 'error' => 'Шаблон template.docx не найден']);
    }
    $html = docxToHtml($templatePath);
    jsonResponse(200, ['ok' => true, 'html' => $html]);
}

if ($action === 'generate_document') {
    $format = strtolower(trim((string)($_POST['format'] ?? 'docx')));
    $rawHtml = trim((string)($_POST['html'] ?? ''));
    $answerText = normalizeDocText((string)($_POST['answer'] ?? ''));
    $documentTitle = trim((string)($_POST['documentTitle'] ?? ''));
    $uploadedTemplate = getUploadedTemplateFile('templateFile');

    if ($rawHtml === '' && $answerText !== '') {
        $rawHtml = '<div>' . nl2br(htmlspecialchars($answerText, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</div>';
    }
    if ($rawHtml === '') {
        jsonResponse(400, ['ok' => false, 'error' => 'empty html: передайте html из редактора']);
    }
    if ($format !== 'docx' && $format !== 'pdf') {
        jsonResponse(400, ['ok' => false, 'error' => 'unsupported format: поддерживаются только docx и pdf']);
    }
    try {
        $safeHtml = sanitizeHtmlForExport($rawHtml);
    } catch (Throwable $e) {
        jsonResponse(400, ['ok' => false, 'error' => 'invalid html: ' . $e->getMessage()]);
    }

    $templateDirFromRequest = trim((string)($_POST['templateDir'] ?? $_POST['templatePath'] ?? ''));
    $extraTemplateDirs = array_filter([
        trim((string)($env['DOCUMENT_TEMPLATE_DIR'] ?? '')),
        trim((string)($env['DOC_TEMPLATES_DIR'] ?? '')),
        trim((string)($env['TEMPLATE_DIR'] ?? '')),
        $templateDirFromRequest,
    ], static function ($value): bool {
        return is_string($value) && $value !== '';
    });

    $templateDocxPath = $uploadedTemplate && (($uploadedTemplate['extension'] ?? '') === 'docx')
        ? (string)($uploadedTemplate['tmp_name'] ?? '')
        : resolveTemplatePath('template.docx', $extraTemplateDirs);
    $templatePdfPath = $uploadedTemplate && (($uploadedTemplate['extension'] ?? '') === 'pdf')
        ? (string)($uploadedTemplate['tmp_name'] ?? '')
        : resolveTemplatePath('template.pdf', $extraTemplateDirs);
    if (!is_file($templateDocxPath) && !is_file($templatePdfPath)) {
        jsonResponse(500, ['ok' => false, 'error' => 'Шаблоны не найдены. Проверьте: /js/documents/app/templates/, /js/documents/templates/ или переменную окружения DOCUMENT_TEMPLATE_DIR']);
    }

    $tmpFile = tempnam(sys_get_temp_dir(), 'answer_');
    if ($tmpFile === false) {
        jsonResponse(500, ['ok' => false, 'error' => 'Не удалось создать временный файл']);
    }

    if ($format === 'docx') {
        if (!is_file($templateDocxPath)) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'DOCX шаблон не найден. Добавьте template.docx в /js/documents/app/templates/, /js/documents/templates/ или укажите DOCUMENT_TEMPLATE_DIR']);
        }
        if (!buildDocxFromHtmlPipeline($tmpFile, $safeHtml, $templateDocxPath)) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'docx conversion failed: проверьте HTML или установку phpoffice/phpword']);
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        header('Content-Disposition: attachment; filename="answer.docx"');
    } else {
        $tmpDocx = tempnam(sys_get_temp_dir(), 'answer_docx_');
        $pdfCreated = false;
        if ($tmpDocx !== false && buildDocxFromHtmlPipeline($tmpDocx, $safeHtml, $templateDocxPath)) {
            $pdfCreated = convertDocxToPdfViaLibreOffice($tmpDocx, $tmpFile);
            @unlink($tmpDocx);
        } elseif ($tmpDocx !== false) {
            @unlink($tmpDocx);
        }
        if (!$pdfCreated) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'pdf conversion failed: установите LibreOffice (soffice)']);
        }
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="answer.pdf"');
    }

    header('Content-Length: ' . filesize($tmpFile));
    readfile($tmpFile);
    if ($tmpFile !== $templatePdfPath) {
        @unlink($tmpFile);
    }
    exit;
}

if ($action === 'generate_from_html') {
    $format = strtolower(trim((string)($_POST['format'] ?? 'docx')));
    $html = trim((string)($_POST['html'] ?? ''));
    $documentTitle = trim((string)($_POST['documentTitle'] ?? 'Ответ'));
    $uploadedTemplate = getUploadedTemplateFile('templateFile');
    if ($html === '') {
        jsonResponse(400, ['ok' => false, 'error' => 'HTML пустой']);
    }
    if ($format !== 'docx' && $format !== 'pdf') {
        jsonResponse(400, ['ok' => false, 'error' => 'Неподдерживаемый формат']);
    }

    $templateDirFromRequest = trim((string)($_POST['templateDir'] ?? $_POST['templatePath'] ?? ''));
    $extraTemplateDirs = array_filter([
        trim((string)($env['DOCUMENT_TEMPLATE_DIR'] ?? '')),
        trim((string)($env['DOC_TEMPLATES_DIR'] ?? '')),
        trim((string)($env['TEMPLATE_DIR'] ?? '')),
        $templateDirFromRequest,
    ], static function ($value): bool {
        return is_string($value) && $value !== '';
    });
    $templateDocxPath = $uploadedTemplate && (($uploadedTemplate['extension'] ?? '') === 'docx')
        ? (string)($uploadedTemplate['tmp_name'] ?? '')
        : resolveTemplatePath('template.docx', $extraTemplateDirs);
    if (!is_file($templateDocxPath)) {
        jsonResponse(500, ['ok' => false, 'error' => 'DOCX шаблон не найден']);
    }

    $tmpFile = tempnam(sys_get_temp_dir(), 'html_');
    if ($tmpFile === false) {
        jsonResponse(500, ['ok' => false, 'error' => 'Не удалось создать временный файл']);
    }

    if ($format === 'docx') {
        $placeholders = resolveDocxPlaceholdersFromRequest();
        $generated = replaceDocxPlaceholderWithHtml(
            $templateDocxPath,
            $tmpFile,
            $html,
            $placeholders
        );
        if (!$generated) {
            $generated = createDocxFromHtmlUsingPhpWord($tmpFile, $html);
        }
        if (!$generated) {
            $generated = replaceDocxWithHtml($templateDocxPath, $tmpFile, $html);
        }
        if (!$generated) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'Не удалось сформировать DOCX из HTML (установите phpoffice/phpword или проверьте шаблон)']);
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        header('Content-Disposition: attachment; filename="answer-from-html.docx"');
        header('Content-Length: ' . filesize($tmpFile));
        readfile($tmpFile);
        @unlink($tmpFile);
        exit;
    }

    $tmpDocx = tempnam(sys_get_temp_dir(), 'html_pdf_docx_');
    $pdfCreated = false;
    if ($tmpDocx !== false) {
        $placeholders = resolveDocxPlaceholdersFromRequest();
        $docxReady = replaceDocxPlaceholderWithHtml(
            $templateDocxPath,
            $tmpDocx,
            $html,
            $placeholders
        );
        if (!$docxReady) {
            $docxReady = createDocxFromHtmlUsingPhpWord($tmpDocx, $html);
        }
        if (!$docxReady) {
            $docxReady = replaceDocxWithHtml($templateDocxPath, $tmpDocx, $html);
        }
        if ($docxReady) {
            $pdfCreated = convertDocxToPdfViaLibreOffice($tmpDocx, $tmpFile);
        }
        @unlink($tmpDocx);
    }

    if (!$pdfCreated) {
        @unlink($tmpFile);
        jsonResponse(500, ['ok' => false, 'error' => 'PDF экспорт в режиме "как в шаблоне" недоступен: установите LibreOffice (soffice)']);
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="answer-from-html.pdf"');
    header('Content-Length: ' . filesize($tmpFile));
    readfile($tmpFile);
    @unlink($tmpFile);
    exit;
}

if ($action === 'generate_from_editor') {
    $format = strtolower(trim((string)($_POST['format'] ?? 'docx')));
    $rawHtml = trim((string)($_POST['html'] ?? ''));
    $documentTitle = trim((string)($_POST['documentTitle'] ?? 'Ответ'));

    if ($rawHtml === '') {
        jsonResponse(400, ['ok' => false, 'error' => 'empty html: редактор вернул пустое содержимое']);
    }
    if ($format !== 'docx' && $format !== 'pdf') {
        jsonResponse(400, ['ok' => false, 'error' => 'unsupported format: поддерживаются только docx и pdf']);
    }
    try {
        $html = sanitizeHtmlForExport($rawHtml);
    } catch (Throwable $e) {
        jsonResponse(400, ['ok' => false, 'error' => 'invalid html: ' . $e->getMessage()]);
    }

    $tmpFile = tempnam(sys_get_temp_dir(), 'editor_');
    if ($tmpFile === false) {
        jsonResponse(500, ['ok' => false, 'error' => 'Ошибка tempnam']);
    }

    if ($format === 'docx') {
        $templatePath = resolveTemplatePath('template.docx', []);
        $ok = buildDocxFromHtmlPipeline($tmpFile, $html, $templatePath);
        if (!$ok) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'docx conversion failed: проверьте таблицы/стили/изображения в HTML']);
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        header('Content-Disposition: attachment; filename="edited.docx"');
    } else {
        $tmpDocx = tempnam(sys_get_temp_dir(), 'editor_docx_');
        $pdfCreated = false;
        if ($tmpDocx !== false) {
            $templatePath = resolveTemplatePath('template.docx', []);
            $docxCreated = buildDocxFromHtmlPipeline($tmpDocx, $html, $templatePath);
            if ($docxCreated) {
                $pdfCreated = convertDocxToPdfViaLibreOffice($tmpDocx, $tmpFile);
            }
            @unlink($tmpDocx);
        }

        if (!$pdfCreated) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'pdf conversion failed: установите LibreOffice (soffice)']);
        }
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="edited.pdf"');
    }

    header('Content-Length: ' . filesize($tmpFile));
    readfile($tmpFile);
    @unlink($tmpFile);
    exit;
}

$attachments = normalizeUploadedFiles('attachments');
$singleAttachment = normalizeUploadedFiles('attachment');
$ocrFile = normalizeUploadedFiles('file');
$files = array_merge($attachments, $singleAttachment, $ocrFile);
$downloadedUrlFiles = [];
$attachmentUrls = collectAttachmentUrlsFromContext($context);
foreach ($attachmentUrls as $attachmentUrl) {
    $downloaded = downloadAttachmentToTempFile($attachmentUrl);
    if (is_array($downloaded)) {
        $downloadedUrlFiles[] = $downloaded;
    }
}
if ($downloadedUrlFiles) {
    $files = array_merge($files, $downloadedUrlFiles);
    register_shutdown_function(static function () use ($downloadedUrlFiles): void {
        foreach ($downloadedUrlFiles as $entry) {
            $tmp = (string)($entry['tmp_name'] ?? '');
            if ($tmp !== '' && is_file($tmp)) {
                @unlink($tmp);
            }
        }
    });
}
$serverExtractedTexts = [];
$extractedTextsDiagnostics = [
    'totalFiles' => count($files),
    'readFiles' => 0,
    'skippedFiles' => 0,
    'skipped' => [],
];
if ($action === 'ai_response_analyze' || $action === 'generate_summary') {
    $serverExtraction = extractTextsFromUploadedFiles($files, $env);
    $serverExtractedTexts = isset($serverExtraction['entries']) && is_array($serverExtraction['entries'])
        ? $serverExtraction['entries']
        : [];
    $extractedTextsDiagnostics = isset($serverExtraction['diagnostics']) && is_array($serverExtraction['diagnostics'])
        ? $serverExtraction['diagnostics']
        : $extractedTextsDiagnostics;
}

if ($action === 'ocr_extract') {
    $ocrApiKey = trim((string)($env['OCR_API_KEY'] ?? ''));
    $ocrBaseUrl = trim((string)($env['OCR_BASE_URL'] ?? 'https://api.ocr.space/parse/image'));
    $ocrLanguage = trim((string)($_POST['language'] ?? ($env['OCR_LANGUAGE'] ?? 'rus')));
    $ocrFileUrl = trim((string)($_POST['file_url'] ?? ''));
    $ocrEngine = trim((string)($_POST['OCREngine'] ?? ($env['OCR_ENGINE'] ?? '2')));
    $ocrScale = trim((string)($_POST['scale'] ?? ($env['OCR_SCALE'] ?? 'true')));
    $ocrDetectOrientation = trim((string)($_POST['detectOrientation'] ?? ($env['OCR_DETECT_ORIENTATION'] ?? 'true')));
    $ocrPreprocessRaw = trim((string)($_POST['preprocess'] ?? ($env['OCR_PREPROCESS'] ?? '1')));
    $ocrMaxSizeKbRaw = (int)($_POST['max_size_kb'] ?? ($env['OCR_MAX_FILE_KB'] ?? 1024));

    if (!$files && $ocrFileUrl === '') {
        jsonResponse(400, ['ok' => false, 'error' => 'Файл для OCR не передан']);
    }

    $downloadedOcrUrlFile = null;
    if ($ocrApiKey === '' && $ocrFileUrl !== '') {
        $downloadedOcrUrlFile = downloadAttachmentToTempFile($ocrFileUrl);
        if (is_array($downloadedOcrUrlFile)) {
            $files = array_merge([$downloadedOcrUrlFile], $files);
            $ocrFileUrl = '';
            register_shutdown_function(static function () use ($downloadedOcrUrlFile): void {
                $tmp = (string)($downloadedOcrUrlFile['tmp_name'] ?? '');
                if ($tmp !== '' && is_file($tmp)) {
                    @unlink($tmp);
                }
            });
        }
    }

    if ($ocrApiKey === '') {
        $localFile = $files[0] ?? null;
        $downloadedLocal = null;
        if (!$localFile && $ocrFileUrl !== '') {
            $downloadedLocal = downloadAttachmentToTempFile($ocrFileUrl);
            if (is_array($downloadedLocal)) {
                $localFile = $downloadedLocal;
            }
        }
        if (!$localFile || !is_array($localFile)) {
            jsonResponse(500, ['ok' => false, 'error' => 'OCR_API_KEY не найден в .env и локальный OCR не смог подготовить файл']);
        }
        $localText = extractTextWithLocalOcrFallback($localFile);
        if (is_array($downloadedLocal)) {
            $tmpPath = (string)($downloadedLocal['tmp_name'] ?? '');
            if ($tmpPath !== '' && is_file($tmpPath)) {
                @unlink($tmpPath);
            }
        }
        if ($localText === '') {
            jsonResponse(500, ['ok' => false, 'error' => 'OCR_API_KEY не найден в .env. Локальный OCR тоже не вернул текст.']);
        }
        jsonResponse(200, [
            'ok' => true,
            'text' => $localText,
            'raw' => [
                'source' => 'local_fallback',
            ],
        ]);
    }

    $targetLanguage = normalizeOcrLanguageCode($ocrLanguage);
    $firstFile = isset($files[0]) && is_array($files[0]) ? $files[0] : null;
    if (is_array($firstFile)) {
        $extension = detectFileExtension($firstFile);
        if (in_array($extension, ['docx', 'docm', 'txt', 'md', 'csv', 'json', 'xml', 'html'], true)) {
            $localText = extractTextWithoutOcr($firstFile);
            if ($localText !== '') {
                jsonResponse(200, [
                    'ok' => true,
                    'text' => $localText,
                    'raw' => [
                        'source' => 'local_text_extract',
                        'extension' => $extension,
                    ],
                ]);
            }
        }
        if (in_array($extension, ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'], true)) {
            $localOcrText = extractTextWithLocalOcrFallback($firstFile);
            if ($localOcrText !== '') {
                jsonResponse(200, [
                    'ok' => true,
                    'text' => $localOcrText,
                    'raw' => [
                        'source' => 'local_ocr_first',
                        'extension' => $extension,
                    ],
                ]);
            }
        }
    }
    $primarySourceFile = isset($files[0]) && is_array($files[0]) ? $files[0] : null;
    $ocrPreprocessEnabled = !in_array(mb_strtolower($ocrPreprocessRaw), ['0', 'false', 'off', 'no'], true);
    $ocrMaxSizeKb = max(128, min(8192, $ocrMaxSizeKbRaw > 0 ? $ocrMaxSizeKbRaw : 1024));
    $ocrMaxBytes = $ocrMaxSizeKb * 1024;
    $ocrExtraFields = [
        'OCREngine' => $ocrEngine !== '' ? $ocrEngine : '2',
        'scale' => $ocrScale !== '' ? $ocrScale : 'true',
        'detectOrientation' => $ocrDetectOrientation !== '' ? $ocrDetectOrientation : 'true',
    ];

    if ($ocrFileUrl !== '') {
        $ocrResult = performOcrRequest(
            $ocrBaseUrl,
            $ocrApiKey,
            [],
            $targetLanguage,
            $ocrFileUrl,
            $ocrExtraFields
        );
        $ocrResponseBody = $ocrResult['body'];
        $ocrCurlError = (string)$ocrResult['curl_error'];
        $ocrStatusCode = (int)$ocrResult['status'];
        if ($ocrResponseBody === false) {
            jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к OCR API: ' . $ocrCurlError]);
        }
        $ocrJson = json_decode((string)$ocrResponseBody, true);
        if (!is_array($ocrJson)) {
            $preview = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$ocrResponseBody) ?? ''), 0, 200);
            jsonResponse(502, ['ok' => false, 'error' => 'OCR вернул не JSON ответ', 'preview' => $preview]);
        }
        if ($ocrStatusCode >= 400) {
            $message = textFromMixed($ocrJson['ErrorMessage'] ?? '');
            if ($message === '') {
                $message = 'OCR API error';
            }
            if (!shouldFallbackToUploadedOcr($ocrJson, $ocrStatusCode)) {
                if (isOcrE301Error($ocrJson)) {
                    $message = trim($message . ' ' . ocrE301HelpText());
                }
                jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $ocrStatusCode]);
            }
            $downloadedOcrUrlFile = downloadAttachmentToTempFile($ocrFileUrl);
            if (!is_array($downloadedOcrUrlFile)) {
                if (isOcrE301Error($ocrJson)) {
                    $message = trim($message . ' ' . ocrE301HelpText());
                }
                jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $ocrStatusCode]);
            }
            $files = array_merge([$downloadedOcrUrlFile], $files);
            $ocrFileUrl = '';
            register_shutdown_function(static function () use ($downloadedOcrUrlFile): void {
                $tmp = (string)($downloadedOcrUrlFile['tmp_name'] ?? '');
                if ($tmp !== '' && is_file($tmp)) {
                    @unlink($tmp);
                }
            });
        } elseif (isset($ocrJson['IsErroredOnProcessing']) && $ocrJson['IsErroredOnProcessing'] === true) {
            $errorMessage = textFromMixed($ocrJson['ErrorMessage'] ?? '');
            if (!shouldFallbackToUploadedOcr($ocrJson, $ocrStatusCode)) {
                if (isOcrE301Error($ocrJson)) {
                    $errorMessage = trim(($errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл') . ' ' . ocrE301HelpText());
                }
                jsonResponse(400, ['ok' => false, 'error' => $errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл']);
            }
            $downloadedOcrUrlFile = downloadAttachmentToTempFile($ocrFileUrl);
            if (!is_array($downloadedOcrUrlFile)) {
                if (isOcrE301Error($ocrJson)) {
                    $errorMessage = trim(($errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл') . ' ' . ocrE301HelpText());
                }
                jsonResponse(400, ['ok' => false, 'error' => $errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл']);
            }
            $files = array_merge([$downloadedOcrUrlFile], $files);
            $ocrFileUrl = '';
            register_shutdown_function(static function () use ($downloadedOcrUrlFile): void {
                $tmp = (string)($downloadedOcrUrlFile['tmp_name'] ?? '');
                if ($tmp !== '' && is_file($tmp)) {
                    @unlink($tmp);
                }
            });
        } else {
            $parsedResults = isset($ocrJson['ParsedResults']) && is_array($ocrJson['ParsedResults']) ? $ocrJson['ParsedResults'] : [];
            $ocrText = '';
            if (isset($parsedResults[0]) && is_array($parsedResults[0]) && isset($parsedResults[0]['ParsedText']) && is_string($parsedResults[0]['ParsedText'])) {
                $ocrText = $parsedResults[0]['ParsedText'];
            }
            jsonResponse(200, [
                'ok' => true,
                'text' => $ocrText,
                'raw' => [
                    'response' => $ocrJson,
                ],
            ]);
        }
    }

    $tempDir = ensureOcrTempDir();
    $prepared = buildPreparedOcrFiles($files[0], $ocrPreprocessEnabled, $tempDir);
    $preparedFiles = isset($prepared['files']) && is_array($prepared['files']) ? $prepared['files'] : [];
    if (!$preparedFiles) {
        cleanupDirectory($tempDir);
        jsonResponse(400, ['ok' => false, 'error' => 'Не удалось подготовить файл для OCR']);
    }

    $texts = [];
    $rawResponses = [];
    $fileDiagnostics = [];
    foreach ($preparedFiles as $index => $preparedFile) {
        $currentPath = (string)($preparedFile['tmp_name'] ?? '');
        $currentSize = (int)($preparedFile['size'] ?? (is_file($currentPath) ? @filesize($currentPath) : 0));
        $effectiveFile = $preparedFile;
        $compression = ['ok' => true, 'sizeBytes' => $currentSize, 'path' => $currentPath, 'attempts' => []];

        if ($currentSize > $ocrMaxBytes) {
            $compressedPath = $tempDir . '/compressed-' . str_pad((string)($index + 1), 4, '0', STR_PAD_LEFT) . '.jpg';
            $compression = shrinkImageToLimit($currentPath, $compressedPath, $ocrMaxBytes);
            if ($compression['ok'] === true && is_file((string)$compression['path'])) {
                $effectiveFile = [
                    'name' => 'compressed-' . ($index + 1) . '.jpg',
                    'tmp_name' => (string)$compression['path'],
                    'type' => 'image/jpeg',
                    'size' => (int)($compression['sizeBytes'] ?? 0),
                ];
            }
        }

        $effectiveSize = (int)($effectiveFile['size'] ?? 0);
        if ($effectiveSize <= 0 && is_file((string)($effectiveFile['tmp_name'] ?? ''))) {
            $effectiveSize = (int)@filesize((string)$effectiveFile['tmp_name']);
            $effectiveFile['size'] = $effectiveSize;
        }
        if ($effectiveSize > $ocrMaxBytes) {
            cleanupDirectory($tempDir);
            jsonResponse(400, [
                'ok' => false,
                'error' => 'Файл слишком большой для OCR лимита ' . $ocrMaxSizeKb . ' КБ. Попробуйте загрузить по страницам или уменьшить качество.',
                'page' => $index + 1,
                'sizeBytes' => $effectiveSize,
            ]);
        }

        $ocrResult = performOcrRequest($ocrBaseUrl, $ocrApiKey, $effectiveFile, $targetLanguage, null, $ocrExtraFields);
        $ocrResponseBody = $ocrResult['body'];
        $ocrCurlError = (string)$ocrResult['curl_error'];
        $ocrStatusCode = (int)$ocrResult['status'];
        if ($ocrResponseBody === false) {
            cleanupDirectory($tempDir);
            jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к OCR API: ' . $ocrCurlError, 'page' => $index + 1]);
        }

        $ocrJson = json_decode((string)$ocrResponseBody, true);
        if (!is_array($ocrJson)) {
            $preview = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$ocrResponseBody) ?? ''), 0, 200);
            cleanupDirectory($tempDir);
            jsonResponse(502, ['ok' => false, 'error' => 'OCR вернул не JSON ответ', 'preview' => $preview, 'page' => $index + 1]);
        }
        if ($ocrStatusCode >= 400) {
            $message = textFromMixed($ocrJson['ErrorMessage'] ?? '');
            if ($message === '') {
                $message = 'OCR API error';
            }
            if (isOcrE301Error($ocrJson) && is_array($primarySourceFile)) {
                $localFallbackText = extractTextWithLocalOcrFallback($primarySourceFile);
                if ($localFallbackText !== '') {
                    cleanupDirectory($tempDir);
                    jsonResponse(200, [
                        'ok' => true,
                        'text' => $localFallbackText,
                        'raw' => [
                            'source' => 'local_fallback_after_e301',
                            'status' => $ocrStatusCode,
                        ],
                    ]);
                }
                $message = trim($message . ' ' . ocrE301HelpText());
            }
            cleanupDirectory($tempDir);
            jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $ocrStatusCode, 'page' => $index + 1]);
        }
        if (isset($ocrJson['IsErroredOnProcessing']) && $ocrJson['IsErroredOnProcessing'] === true) {
            $errorMessage = textFromMixed($ocrJson['ErrorMessage'] ?? '');
            if (isOcrE301Error($ocrJson) && is_array($primarySourceFile)) {
                $localFallbackText = extractTextWithLocalOcrFallback($primarySourceFile);
                if ($localFallbackText !== '') {
                    cleanupDirectory($tempDir);
                    jsonResponse(200, [
                        'ok' => true,
                        'text' => $localFallbackText,
                        'raw' => [
                            'source' => 'local_fallback_after_e301',
                        ],
                    ]);
                }
                $errorMessage = trim(($errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл') . ' ' . ocrE301HelpText());
            }
            cleanupDirectory($tempDir);
            jsonResponse(400, ['ok' => false, 'error' => $errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл', 'page' => $index + 1]);
        }

        $rawResponses[] = $ocrJson;
        $parsedResults = isset($ocrJson['ParsedResults']) && is_array($ocrJson['ParsedResults']) ? $ocrJson['ParsedResults'] : [];
        foreach ($parsedResults as $parsed) {
            if (is_array($parsed) && isset($parsed['ParsedText']) && is_string($parsed['ParsedText'])) {
                $textPart = trim($parsed['ParsedText']);
                if ($textPart !== '') {
                    $texts[] = $textPart;
                }
            }
        }
        $fileDiagnostics[] = [
            'index' => $index + 1,
            'sourceSizeBytes' => $currentSize,
            'finalSizeBytes' => $effectiveSize,
            'compressed' => $currentSize > $effectiveSize,
            'compression' => $compression,
        ];
    }
    cleanupDirectory($tempDir);
    $ocrText = trim(implode("\n\n", $texts));

    jsonResponse(200, [
        'ok' => true,
        'text' => $ocrText,
        'raw' => [
            'responses' => $rawResponses,
            'preparation' => $prepared,
            'files' => $fileDiagnostics,
            'maxFileKb' => $ocrMaxSizeKb,
        ],
    ]);
}

$freeApiKey = trim((string)($env['AI_API_KEY'] ?? $env['AI_API_KEY_FREE'] ?? ''));
$paidApiKey = trim((string)($env['AI_API_KEY_PAID'] ?? $env['OPENAI_API_KEY'] ?? ''));
$apiKey = $aiMode === 'paid' ? $paidApiKey : $freeApiKey;
$modelsConfig = resolveAiModelsConfig($env);
$model = (string)$modelsConfig['defaultModel'];
$freeModel = trim((string)($env['AI_MODEL_FREE'] ?? ''));
$paidModel = trim((string)($env['AI_MODEL_PAID'] ?? ''));
if ($aiMode === 'paid' && $paidModel !== '') {
    $model = $paidModel;
}
if ($aiMode === 'free' && $freeModel !== '') {
    $model = $freeModel;
}
$baseUrl = trim((string)($env['AI_BASE_URL'] ?? $env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));
$retryAfterSeconds = normalizeRetryAfterSeconds($env['AI_RETRY_AFTER_SECONDS'] ?? null);
$isGroqKey = str_starts_with($apiKey, 'gsk_');
if ($baseUrl === 'https://api.openai.com/v1' && $isGroqKey) {
    $baseUrl = 'https://api.groq.com/openai/v1';
}
$isGroq = stripos($baseUrl, 'groq.com') !== false;
$isGoogleOpenAiCompat = stripos($baseUrl, 'generativelanguage.googleapis.com') !== false;

if ($apiKey === '') {
    jsonResponse(500, ['ok' => false, 'error' => 'AI API key не найден в .env для режима ' . $aiMode]);
}

$filesSummary = buildFilesSummary($files);
foreach ($filesSummary as $index => $summaryItem) {
    if (!is_array($summaryItem)) {
        continue;
    }
    $filesSummary[$index] = [
        'name' => (string)($summaryItem['name'] ?? ''),
        'type' => (string)($summaryItem['type'] ?? ''),
        'size' => (int)($summaryItem['size'] ?? 0),
    ];
}

$extractedTexts = [];
$decodedExtractedTexts = safeJsonDecode($extractedTextsRaw);
if (isset($context['extractedTexts']) && is_array($context['extractedTexts']) && !$decodedExtractedTexts) {
    $decodedExtractedTexts = $context['extractedTexts'];
}
if (is_array($decodedExtractedTexts)) {
    foreach ($decodedExtractedTexts as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $text = trim((string)($entry['text'] ?? ''));
        if ($text === '') {
            continue;
        }
        $extractedTexts[] = [
            'name' => trim((string)($entry['name'] ?? 'Файл')),
            'type' => trim((string)($entry['type'] ?? '')),
            'text' => mb_substr($text, 0, 12000),
        ];
    }
}
$legacyAttachedFiles = isset($context['attachedFiles']) && is_array($context['attachedFiles'])
    ? $context['attachedFiles']
    : [];
foreach ($legacyAttachedFiles as $legacyFile) {
    if (!is_array($legacyFile)) {
        continue;
    }
    $legacyText = trim((string)($legacyFile['content'] ?? ''));
    if ($legacyText === '') {
        continue;
    }
    $extractedTexts[] = [
        'name' => trim((string)($legacyFile['name'] ?? 'Файл')),
        'type' => trim((string)($legacyFile['type'] ?? '')),
        'text' => mb_substr($legacyText, 0, 12000),
    ];
}
$extractedTexts = array_merge($extractedTexts, $serverExtractedTexts);
$extractedTexts = deduplicateExtractedTextsByNameAndHash($extractedTexts);
$attachedFilesFromContext = isset($context['attachedFiles']) && is_array($context['attachedFiles'])
    ? $context['attachedFiles']
    : [];
$attachedFilesCount = 0;
foreach ($attachedFilesFromContext as $attachedFileEntry) {
    if (!is_array($attachedFileEntry)) {
        continue;
    }
    $name = trim((string)($attachedFileEntry['name'] ?? ''));
    $url = trim((string)($attachedFileEntry['url'] ?? ''));
    if ($name !== '' || $url !== '') {
        $attachedFilesCount += 1;
    }
}
if ($action === 'ai_response_analyze'
    && $aiMode === 'free'
    && $attachedFilesCount > 0
    && !$extractedTexts
    && (int)($extractedTextsDiagnostics['readFiles'] ?? 0) === 0
) {
    jsonResponse(422, [
        'ok' => false,
        'error' => 'Файлы прикреплены, но текст из них не был извлечён. Проверьте доступ к файлам, формат и качество скана, затем повторите.',
        'code' => 'FILES_WITHOUT_EXTRACTED_TEXT',
        'attachedFiles' => $attachedFilesCount,
        'extractedTextsDiagnostics' => $extractedTextsDiagnostics,
    ]);
}
$maxInputChars = (int)($env['AI_MAX_INPUT_CHARS'] ?? 60000);
if ($maxInputChars < 2000) {
    $maxInputChars = 2000;
}
$limitedInput = applyInputBudget($extractedTexts, $maxInputChars);
$extractedTexts = $limitedInput['entries'];
$promptStats = [
    'charsIn' => (int)$limitedInput['charsIn'],
    'filesUsed' => (int)$limitedInput['filesUsed'],
    'chunksUsed' => (int)$limitedInput['chunksUsed'],
];
$requirements = extractRequirementsFromTexts(
    $extractedTexts,
    $runtimeConfig['requirementTriggers'] ?? [],
    $runtimeConfig['requirementStopPrefixes'] ?? []
);
if ($requirements) {
    $context['requirements'] = $requirements;
}

$effectiveStyle = $responseStyle !== ''
    ? mb_strtolower($responseStyle)
    : (isset($context['responseStyle']) && is_string($context['responseStyle']) ? mb_strtolower(trim($context['responseStyle'])) : 'neutral');
if (!in_array($effectiveStyle, ['positive', 'negative', 'neutral'], true)) {
    $effectiveStyle = 'neutral';
}

$styleInstruction = 'Тон ответа: нейтральный (рассмотрение) — фиксируем текущее состояние, подтверждаем рассмотрение и указываем следующие действия с датами.';
if ($effectiveStyle === 'positive') {
    $styleInstruction = 'Тон ответа: положительный (одобрение/выполнение) — подтверждай выполнение, обеспечивай результат и фиксируй сроки.';
} elseif ($effectiveStyle === 'negative') {
    $styleInstruction = 'Тон ответа: отрицательный (отклонение/невыполнение) — четко указывай причину отклонения и что требуется для пересмотра.';
}
$styleExampleInstruction = 'Структура response обязательна: краткое обращение по сути, фактический статус работ (выполнено/выполняется/приостановлено), план действий с датами (ДД.ММ.ГГГГ), подтверждение условий для фронта работ.';
$effectiveBehavior = $aiBehavior !== ''
    ? $aiBehavior
    : (isset($context['aiBehavior']) && is_string($context['aiBehavior']) ? trim($context['aiBehavior']) : '');
if ($effectiveBehavior !== '' && mb_strlen($effectiveBehavior) > 10000) {
    $effectiveBehavior = mb_substr($effectiveBehavior, 0, 10000);
}

$effectiveModel = $requestedModel !== '' ? $requestedModel : $model;
$availableModels = (array)($modelsConfig['models'] ?? []);
if ($model !== '' && !in_array($model, $availableModels, true)) {
    array_unshift($availableModels, $model);
}
if ($effectiveModel === '') {
    $configError = trim((string)($modelsConfig['configError'] ?? ''));
    jsonResponse(500, [
        'ok' => false,
        'error' => $configError !== ''
            ? $configError
            : 'Не настроены AI_MODEL и AI_MODELS в .env. Укажите AI_MODEL или заполните AI_MODELS.',
        'code' => 'MODEL_NOT_CONFIGURED',
    ]);
}
if (!in_array($effectiveModel, $availableModels, true)) {
    logApiDocs('warn', 'Requested model is not in local whitelist', [
        'requestedModel' => $effectiveModel,
        'availableModels' => $availableModels,
    ]);
    jsonResponse(422, [
        'ok' => false,
        'error' => 'Выбранная модель не разрешена в настройках сервера. Выберите модель из доступного списка.',
        'code' => 'MODEL_NOT_ALLOWED',
        'requestedModel' => $effectiveModel,
        'availableModels' => $availableModels,
    ]);
}

$defaultSystemMessage = "Ты — помощник по официальным ответам на документы. "
  . "Верни JSON-объект, где главное поле — response (готовый текст ответа), остальные поля — вспомогательные. "
  . "Опирайся только на user payload, особенно files[*].preview и extractedTexts[*].text; не выдумывай факты или реквизиты. "
  . "Если данных не хватает, кратко укажи это в analysis и в response запроси недостающие сведения деловым языком. "
  . "response должен быть понятным, последовательным и без повторов: вводная часть, факты, выводы, действия и сроки. "
  . "Если дата/номер письма/договора есть во входных данных — укажи их, если нет — используй нейтральную формулировку без фиктивных значений. "
  . "Не добавляй подпись, контакты, банковские реквизиты, e-mail и ФИО подписанта. "
  . "Терминологию выбирай по домену исходных документов (строительство, юриспруденция, бухгалтерия, ИТ и т.д.). "
  . $styleInstruction . ' '
  . $styleExampleInstruction . ' '
  . 'Поле response — только готовый текст письма без служебных заголовков.';
$paidSystemMessage = "Ты — VIP ИИ-ассистент для официальной переписки строительной компании. "
  . "Работай только по приложенным файлам и extractedTexts, принимай обоснованное решение и возвращай JSON-объект с полем response. "
  . "Не добавляй шапку и подпись. Нужны: краткий анализ фактов, решение (согласие/отказ/уточнение), сроки и чёткие действия. "
  . "Если данных мало — прямо перечисли, каких данных не хватает для финального ответа. "
  . "Используй деловой язык без воды. Опирайся на факты из файлов и не выдумывай реквизиты.";
$defaultSystemMessage = $aiMode === 'paid' ? $paidSystemMessage : $defaultSystemMessage;
$systemMessage = $effectiveBehavior !== '' ? $effectiveBehavior : $defaultSystemMessage;

$userPayload = [
    'instruction' => 'Сформируй официальный ответ в деловом стиле без повторов, с фактами из документов, конкретными действиями и сроками (если возможно).',
    'documentTitle' => $documentTitle,
    'prompt' => $prompt,
    'context' => $context,
    'files' => $filesSummary,
    'extractedTexts' => $extractedTexts,
    'requirements' => $requirements,
    'aiRuntime' => $runtimeConfig,
];

$generationSettings = resolveAiGenerationSettings($env, $_POST);

$body = [
    'model' => $effectiveModel,
    'temperature' => $generationSettings['temperature'],
    'top_p' => $generationSettings['top_p'],
    'presence_penalty' => $generationSettings['presence_penalty'],
    'frequency_penalty' => $generationSettings['frequency_penalty'],
    'max_tokens' => $generationSettings['max_tokens'],
    'messages' => [
        ['role' => 'system', 'content' => $systemMessage],
        ['role' => 'user', 'content' => json_encode($userPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
    ],
];
if (
    !$isGroq
    && !$isGoogleOpenAiCompat
    && normalizeBoolSetting($env['AI_FORCE_JSON_RESPONSE_FORMAT'] ?? false)
) {
    $body['response_format'] = ['type' => 'json_object'];
}

$responseCacheTtl = normalizeIntSetting($env['AI_RESPONSE_CACHE_TTL'] ?? 3600, 3600, 60, 86400);
$cachePayload = [
    'model' => $effectiveModel,
    'system' => $systemMessage,
    'userPayload' => $userPayload,
    'generation' => $generationSettings,
];
$responseCacheKey = hash('sha256', json_encode($cachePayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
$aiResponseCache = readJsonCache('ai-responses');
$cachedEntry = $aiResponseCache[$responseCacheKey] ?? null;
if (is_array($cachedEntry)) {
    $cachedAt = (int)($cachedEntry['timestamp'] ?? 0);
    $cachedPayload = $cachedEntry['payload'] ?? null;
    if ($cachedAt > 0 && (time() - $cachedAt) <= $responseCacheTtl && is_array($cachedPayload)) {
        $cachedPayload['cached'] = true;
        jsonResponse(200, $cachedPayload);
    }
}

$endpoint = rtrim($baseUrl, '/') . '/chat/completions';
function performAiRequest(string $endpoint, string $apiKey, array $body): array
{
    $timeout = normalizeIntSetting($body['_request_timeout'] ?? 90, 90, 10, 300);
    $connectTimeout = normalizeIntSetting($body['_connect_timeout'] ?? 10, 10, 3, 60);
    unset($body['_request_timeout'], $body['_connect_timeout']);
    $ch = curl_init($endpoint);
    if ($ch === false) {
        return ['status' => 500, 'body' => false, 'curl_error' => 'Не удалось инициализировать cURL'];
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => $connectTimeout,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $statusCode, 'body' => $responseBody, 'curl_error' => $curlError];
}

function performAiRequestWithRetry(string $endpoint, string $apiKey, array $body, array $options = []): array
{
    $attempts = normalizeIntSetting($options['attempts'] ?? 2, 2, 1, 5);
    $baseDelayMs = normalizeIntSetting($options['base_delay_ms'] ?? 500, 500, 100, 3000);
    $timeout = normalizeIntSetting($options['timeout'] ?? 90, 90, 10, 300);
    $connectTimeout = normalizeIntSetting($options['connect_timeout'] ?? 10, 10, 3, 60);
    $retryStatuses = [408, 425, 429, 500, 502, 503, 504];
    $lastResult = ['status' => 0, 'body' => false, 'curl_error' => ''];

    for ($attempt = 1; $attempt <= $attempts; $attempt += 1) {
        $requestBody = $body;
        $requestBody['_request_timeout'] = $timeout;
        $requestBody['_connect_timeout'] = $connectTimeout;
        $lastResult = performAiRequest($endpoint, $apiKey, $requestBody);
        $statusCode = (int)($lastResult['status'] ?? 0);
        $curlError = trim((string)($lastResult['curl_error'] ?? ''));
        $shouldRetry = $curlError !== '' || in_array($statusCode, $retryStatuses, true);
        if (!$shouldRetry || $attempt >= $attempts) {
            return $lastResult;
        }
        $sleepMs = $baseDelayMs * (2 ** ($attempt - 1));
        usleep($sleepMs * 1000);
    }

    return $lastResult;
}

$requestAttempts = normalizeIntSetting($env['AI_REQUEST_RETRY_ATTEMPTS'] ?? 2, 2, 1, 5);
$requestTimeout = normalizeIntSetting($env['AI_REQUEST_TIMEOUT'] ?? 120, 120, 20, 300);
$connectTimeout = normalizeIntSetting($env['AI_CONNECT_TIMEOUT'] ?? 12, 12, 3, 60);
if ($action === 'generate_summary') {
    if (!$extractedTexts) {
        jsonResponse(422, ['ok' => false, 'error' => 'Нет extractedTexts для формирования summary.']);
    }

    $summaryBlocks = [];
    foreach ($extractedTexts as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $textPart = trim((string)($entry['text'] ?? ''));
        if ($textPart === '') {
            continue;
        }
        $namePart = trim((string)($entry['name'] ?? 'Документ'));
        $summaryBlocks[] = '[' . ($namePart !== '' ? $namePart : 'Документ') . "]\n" . $textPart;
    }
    $fullText = trim(implode("\n\n", $summaryBlocks));
    if ($fullText === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Текст документов пустой, summary сформировать невозможно.']);
    }

    $summarySystemMessage = "Ты — ассистент, который делает краткое и точное изложение документов.\n\n"
        . "Твоя задача: на основе предоставленного текста составить summary (резюме, краткое содержание).\n\n"
        . "Правила:\n"
        . "- Не добавляй шапку (кому, от кого), не добавляй подпись, не используй обращения.\n"
        . "- Не пересказывай документ дословно и не цитируй большие куски.\n"
        . "- Выдели самое главное: суть документа, ключевые факты, даты, суммы, требования, решения.\n"
        . "- Структурируй summary в виде коротких пунктов или абзацев (2-5 предложений).\n"
        . "- Используй деловой, нейтральный язык, без эмоций и без эмодзи.\n"
        . "- Не добавляй оценку документу («хорошо», «плохо», «важно») — только факты.\n"
        . "- Если документ содержит несколько частей (требования, просьбы, сроки) — отрази каждую.\n"
        . "- Если информации недостаточно — укажи, какие данные отсутствуют.\n\n"
        . "Формат ответа: только текст summary, без лишних слов.";
    $summaryBody = [
        'model' => $effectiveModel,
        'temperature' => 0.3,
        'max_tokens' => 800,
        'top_p' => 0.85,
        'messages' => [
            ['role' => 'system', 'content' => $summarySystemMessage],
            ['role' => 'user', 'content' => "Сделай краткое содержание документа:\n\n" . $fullText],
        ],
    ];
    $summaryStartedAt = microtime(true);
    $summaryResult = performAiRequestWithRetry($endpoint, $apiKey, $summaryBody, [
        'attempts' => $requestAttempts,
        'timeout' => $requestTimeout,
        'connect_timeout' => $connectTimeout,
        'base_delay_ms' => 500,
    ]);
    $summaryResponseBody = $summaryResult['body'];
    $summaryCurlError = (string)($summaryResult['curl_error'] ?? '');
    $summaryStatusCode = (int)($summaryResult['status'] ?? 0);
    if ($summaryResponseBody === false) {
        jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к AI API: ' . $summaryCurlError]);
    }
    $summaryJson = json_decode((string)$summaryResponseBody, true);
    if (!is_array($summaryJson)) {
        jsonResponse(502, ['ok' => false, 'error' => 'Некорректный ответ AI API при generate_summary']);
    }
    if ($summaryStatusCode >= 400) {
        $summaryMessage = textFromMixed($summaryJson['error']['message'] ?? '');
        jsonResponse(502, [
            'ok' => false,
            'error' => $summaryMessage !== '' ? $summaryMessage : 'AI API error при generate_summary',
            'status' => $summaryStatusCode,
        ]);
    }
    $summary = trim((string)($summaryJson['choices'][0]['message']['content'] ?? ''));
    if ($summary === '') {
        jsonResponse(502, ['ok' => false, 'error' => 'Пустой summary от AI']);
    }
    jsonResponse(200, [
        'ok' => true,
        'summary' => $summary,
        'model' => (string)($summaryJson['model'] ?? $effectiveModel),
        'durationMs' => max(1, (int)round((microtime(true) - $summaryStartedAt) * 1000)),
        'tokensUsed' => (int)($summaryJson['usage']['total_tokens'] ?? 0),
    ]);
}
$requestStartedAt = microtime(true);
$requestResult = performAiRequestWithRetry($endpoint, $apiKey, $body, [
    'attempts' => $requestAttempts,
    'timeout' => $requestTimeout,
    'connect_timeout' => $connectTimeout,
    'base_delay_ms' => 500,
]);
$responseBody = $requestResult['body'];
$curlError = (string)$requestResult['curl_error'];
$statusCode = (int)$requestResult['status'];

if ($responseBody === false) {
    logApiDocs('error', 'AI request failed', ['curlError' => $curlError]);
    jsonResponse(502, array_merge(['ok' => false, 'error' => 'Ошибка запроса к AI API: ' . $curlError, 'model' => $effectiveModel], withRetryPayload($retryAfterSeconds)));
}

$responseJson = json_decode($responseBody, true);
if (!is_array($responseJson)) {
    logApiDocs('error', 'AI API returned non-JSON', ['response' => mb_substr($responseBody, 0, 500)]);
    jsonResponse(502, array_merge(['ok' => false, 'error' => 'Некорректный ответ AI API', 'model' => $effectiveModel], withRetryPayload($retryAfterSeconds)));
}

if ($statusCode >= 400) {
    $errorMessage = isset($responseJson['error']['message']) && is_string($responseJson['error']['message'])
        ? $responseJson['error']['message']
        : '';
    $isUnsupportedField = stripos($errorMessage, 'response_format') !== false
        || stripos($errorMessage, 'temperature') !== false
        || stripos($errorMessage, 'top_p') !== false
        || stripos($errorMessage, 'presence_penalty') !== false
        || stripos($errorMessage, 'frequency_penalty') !== false
        || stripos($errorMessage, 'max_tokens') !== false
        || stripos($errorMessage, 'max_completion_tokens') !== false
        || stripos($errorMessage, 'Unknown name') !== false
        || stripos($errorMessage, 'unsupported') !== false;
    if ($isUnsupportedField) {
        $retryBody = $body;
        unset(
            $retryBody['response_format'],
            $retryBody['temperature'],
            $retryBody['top_p'],
            $retryBody['presence_penalty'],
            $retryBody['frequency_penalty']
        );
        $retryBody['max_tokens'] = min((int)($generationSettings['max_tokens'] ?? 1800), 1800);
        $retryResult = performAiRequestWithRetry($endpoint, $apiKey, $retryBody, [
            'attempts' => $requestAttempts,
            'timeout' => $requestTimeout,
            'connect_timeout' => $connectTimeout,
            'base_delay_ms' => 500,
        ]);
        $retryResponseBody = $retryResult['body'];
        $retryCurlError = (string)$retryResult['curl_error'];
        $retryStatusCode = (int)$retryResult['status'];

        if ($retryResponseBody === false) {
            logApiDocs('error', 'AI retry request failed after unsupported fields', ['curlError' => $retryCurlError]);
            jsonResponse(502, array_merge(['ok' => false, 'error' => 'Ошибка запроса к AI API: ' . $retryCurlError, 'model' => $effectiveModel], withRetryPayload($retryAfterSeconds)));
        }

        $retryJson = json_decode($retryResponseBody, true);
        if (is_array($retryJson)) {
            $responseJson = $retryJson;
            $statusCode = $retryStatusCode;
            logApiDocs('info', 'AI request recovered via retry without unsupported fields', [
                'model' => $effectiveModel,
                'providerBaseUrl' => $baseUrl,
                'initialStatus' => $requestResult['status'],
                'retryStatus' => $retryStatusCode,
            ]);
        }
    }
}

if ($statusCode >= 400) {
    $message = 'AI API error';
    $errorMessage = textFromMixed($responseJson['error']['message'] ?? '');
    if ($errorMessage !== '') {
        $message = $errorMessage;
    }
    logApiDocs('error', 'AI API HTTP error', ['status' => $statusCode, 'message' => $message]);
    $unsupportedRegion = stripos($message, 'Country, region, or territory not supported') !== false;
    if ($statusCode === 403 && $unsupportedRegion) {
        logApiDocs('error', 'AI provider blocked by region, no local fallback in autonomous mode', ['status' => $statusCode]);
        jsonResponse(502, array_merge(['ok' => false, 'error' => 'Провайдер ИИ недоступен в вашем регионе. Локальный fallback отключён.', 'status' => $statusCode, 'model' => $effectiveModel], withRetryPayload($retryAfterSeconds)));
    }
    if ($statusCode === 429) {
        $waitSeconds = $retryAfterSeconds;
        if (preg_match('/try again in\s+([0-9.]+)\s*s/i', $message, $match)) {
            $waitSeconds = normalizeRetryAfterSeconds($match[1], $retryAfterSeconds);
        }
        $suggestedModel = findSuggestedModel($availableModels, $effectiveModel);
        jsonResponse(429, array_merge([
            'ok' => false,
            'error' => 'До бесплатной попытки осталось: ' . $waitSeconds . ' сек.',
            'status' => $statusCode,
            'model' => $effectiveModel,
            'availableModels' => $availableModels,
            'suggestedModel' => $suggestedModel,
        ], withRetryPayload($waitSeconds)));
    }
    $modelUnavailable = stripos($message, 'model') !== false
        && (
            stripos($message, 'not found') !== false
            || stripos($message, 'not available') !== false
            || stripos($message, 'decommissioned') !== false
            || stripos($message, 'does not exist') !== false
        );
    if ($modelUnavailable) {
        jsonResponse(503, array_merge([
            'ok' => false,
            'error' => 'Текущая модель временно недоступна. Выберите другую модель из списка.',
            'status' => $statusCode,
            'requestedModel' => $effectiveModel,
            'availableModels' => $availableModels,
        ], withRetryPayload($retryAfterSeconds)));
    }
    jsonResponse(502, array_merge(['ok' => false, 'error' => $message, 'status' => $statusCode, 'model' => $effectiveModel], withRetryPayload($retryAfterSeconds)));
}

$content = (string)($responseJson['choices'][0]['message']['content'] ?? '');
$parsed = parseAiJson($content);
$decisionBlock = extractDecisionBlock($parsed);
$fallbackDecision = 'need_clarification';
if ($effectiveStyle === 'positive') {
    $fallbackDecision = 'approve';
} elseif ($effectiveStyle === 'negative') {
    $fallbackDecision = 'reject';
}
if (!$decisionBlock['valid']) {
    $decisionBlock = [
        'valid' => true,
        'decision' => $fallbackDecision,
        'decision_reason' => 'Решение сформировано по выбранному стилю ответа.',
        'risks' => [],
        'required_actions' => [],
        'requirements' => $requirements,
    ];
}

$analysis = '';
if (isset($parsed['analysis']) && (is_string($parsed['analysis']) || is_numeric($parsed['analysis']) || is_bool($parsed['analysis']))) {
    $analysis = textFromMixed($parsed['analysis']);
}
$response = sanitizeGeneratedResponse(textFromMixed($parsed['response'] ?? ''), $runtimeConfig['sanitizePrefixes'] ?? []);
$positive = textFromMixed($parsed['positive'] ?? '');
$negative = textFromMixed($parsed['negative'] ?? '');
$neutral = textFromMixed($parsed['neutral'] ?? '');

if ($response === '') {
    if ($effectiveStyle === 'positive' && $positive !== '') {
        $response = sanitizeGeneratedResponse($positive, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($effectiveStyle === 'negative' && $negative !== '') {
        $response = sanitizeGeneratedResponse($negative, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($effectiveStyle === 'neutral' && $neutral !== '') {
        $response = sanitizeGeneratedResponse($neutral, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($positive !== '') {
        $response = sanitizeGeneratedResponse($positive, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($negative !== '') {
        $response = sanitizeGeneratedResponse($negative, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($neutral !== '') {
        $response = sanitizeGeneratedResponse($neutral, $runtimeConfig['sanitizePrefixes'] ?? []);
    }
}

if ($analysis === '' && $response === '' && $neutral === '' && $positive === '' && $negative === '') {
    $analysis = 'ИИ вернул ответ в свободной форме.';
    $response = sanitizeGeneratedResponse($content, $runtimeConfig['sanitizePrefixes'] ?? []);
    $neutral = $content;
    $positive = $content;
    $negative = $content;
}

if ((looksLikeJsonText($response) || $response === '') && !$briefMode) {
    if ($aiMode === 'paid') {
        $fallbackResponse = sanitizeGeneratedResponse($content, $runtimeConfig['sanitizePrefixes'] ?? []);
        if ($fallbackResponse === '' || looksLikeJsonText($fallbackResponse)) {
            $fallbackResponse = 'Не удалось получить структурированный ответ. Попробуйте более чёткий запрос или документ лучшего качества.';
        }
        if ($analysis === '') {
            $analysis = 'VIP fallback: использован прямой ответ модели из-за пустого структурированного блока.';
        }
        $response = $fallbackResponse;
    } else {
        logApiDocs('error', 'AI returned empty or JSON-like response text', [
            'documentTitle' => $documentTitle,
            'contentPreview' => mb_substr($content, 0, 220),
        ]);
        jsonResponse(502, array_merge(['ok' => false, 'error' => 'ИИ вернул пустой/некорректный текст ответа. Повторите запрос.', 'model' => $effectiveModel], withRetryPayload($retryAfterSeconds)));
    }
}
if ($briefMode && (looksLikeJsonText($response) || $response === '')) {
    if ($analysis !== '') {
        $response = $analysis;
    } elseif ($neutral !== '') {
        $response = sanitizeGeneratedResponse($neutral, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($positive !== '') {
        $response = sanitizeGeneratedResponse($positive, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($negative !== '') {
        $response = sanitizeGeneratedResponse($negative, $runtimeConfig['sanitizePrefixes'] ?? []);
    } else {
        $response = 'Краткий анализ сформирован без отдельного текста письма.';
    }
}
$decisionBlock['response'] = $response;
if (!isset($decisionBlock['requirements']) || !is_array($decisionBlock['requirements'])) {
    $decisionBlock['requirements'] = $requirements;
}

if (mb_strlen($analysis) > 1200) {
    $analysis = mb_substr($analysis, 0, 1200) . '…';
}
if (mb_strlen($response) > 20000) {
    $response = mb_substr($response, 0, 20000) . '…';
}
$qualityCheck = assessResponseQuality($response, $extractedTexts);
if (!$qualityCheck['ok']) {
    $qualitySummary = implode('; ', $qualityCheck['issues']);
    $analysis = trim($analysis . ($analysis !== '' ? "\n\n" : '') . 'Проверка качества: ' . $qualitySummary);
}

$successPayload = [
    'ok' => true,
    'mode' => $aiMode,
    'model' => $effectiveModel,
    ...withRetryPayload($retryAfterSeconds),
    'analysis' => $analysis,
    'response' => $response,
    'neutral' => $neutral,
    'positive' => $positive,
    'negative' => $negative,
    'promptStats' => $promptStats,
    'extractedTextsDiagnostics' => $extractedTextsDiagnostics,
    'decisionBlock' => [
        'decision' => (string)($decisionBlock['decision'] ?? ''),
        'decision_reason' => (string)($decisionBlock['decision_reason'] ?? ''),
        'risks' => normalizeStringList($decisionBlock['risks'] ?? []),
        'required_actions' => normalizeStringList($decisionBlock['required_actions'] ?? []),
        'requirements' => normalizeStringList($decisionBlock['requirements'] ?? $requirements, 8, 300),
    ],
    'tokensUsed' => (int)($responseJson['usage']['total_tokens'] ?? 0),
    'timeMs' => max(1, (int)round((microtime(true) - $requestStartedAt) * 1000)),
];
$aiResponseCache[$responseCacheKey] = [
    'timestamp' => time(),
    'payload' => $successPayload,
];
writeJsonCache('ai-responses', $aiResponseCache);

jsonResponse(200, $successPayload);
