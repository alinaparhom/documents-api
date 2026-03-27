<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
        json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND
    );
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method === 'GET') {
    $action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';
    if ($action === 'ai_models') {
        $env = loadEnv(getEnvPaths());
        $rawModels = trim((string)($env['AI_MODELS'] ?? $env['OPENAI_MODELS'] ?? ''));
        $defaultModel = trim((string)($env['AI_MODEL'] ?? $env['OPENAI_MODEL'] ?? 'gpt-4o-mini'));
        $models = [];
        if ($rawModels !== '') {
            $parts = preg_split('/[,\\n]+/u', $rawModels);
            if (is_array($parts)) {
                foreach ($parts as $part) {
                    $value = trim((string)$part);
                    if ($value !== '') {
                        $models[] = $value;
                    }
                }
            }
        }
        if (!$models) {
            $models = [$defaultModel];
        }
        jsonResponse(200, ['ok' => true, 'models' => array_values(array_unique($models)), 'defaultModel' => $defaultModel]);
    }

    $isPing = isset($_GET['ping']) && (string)$_GET['ping'] === '1';
    $isDebug = isset($_GET['debug']) && (string)$_GET['debug'] === '1';
    $payload = [
        'ok' => true,
        'message' => $isPing
            ? 'pong'
            : 'API доступен. Используйте POST для action=ai_response_analyze.',
        'endpoint' => '/js/documents/api-docs.php',
        'method' => 'POST'
    ];
    if ($isDebug) {
        $debugEnv = loadEnv(getEnvPaths());
        $debugKey = trim((string)($debugEnv['AI_API_KEY'] ?? $debugEnv['OPENAI_API_KEY'] ?? ''));
        $debugModel = trim((string)($debugEnv['AI_MODEL'] ?? $debugEnv['OPENAI_MODEL'] ?? ''));
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

function safeJsonDecode(?string $value): array
{
    if (!is_string($value) || trim($value) === '') {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
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

function performOcrRequest(string $endpoint, string $apiKey, array $file, string $language = 'rus'): array
{
    $tmpName = (string)($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_file($tmpName)) {
        return ['status' => 400, 'body' => false, 'curl_error' => 'Файл для OCR не найден'];
    }

    $mime = (string)($file['type'] ?? 'application/octet-stream');
    $name = (string)($file['name'] ?? 'document');
    $curlFile = curl_file_create($tmpName, $mime, $name);

    $ch = curl_init($endpoint);
    if ($ch === false) {
        return ['status' => 500, 'body' => false, 'curl_error' => 'Не удалось инициализировать cURL'];
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => [
            'file' => $curlFile,
            'language' => $language,
        ],
        CURLOPT_TIMEOUT => 120,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $statusCode, 'body' => $responseBody, 'curl_error' => $curlError];
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

function buildLocalFallback(string $documentTitle, string $prompt, array $context = []): array
{
    $title = trim($documentTitle) !== '' ? $documentTitle : 'документу';
    $topic = trim($prompt) !== '' ? $prompt : 'обработке входящих материалов';
    $organization = isset($context['organization']) && is_string($context['organization'])
        ? trim($context['organization'])
        : '';
    $orgPart = $organization !== '' ? (' (' . $organization . ')') : '';

    $analysis = 'Сервер ИИ недоступен, сформирован локальный черновик по ' . $title . $orgPart . '.';
    $neutral = 'По ' . $title . $orgPart . ' сообщаем: материалы получены и приняты в работу. '
      . 'По запросу о ' . $topic . ' предоставим уточнённый статус и сроки после проверки данных.';
    $aggressive = 'По ' . $title . $orgPart . ' уведомляем: материалы приняты к исполнению в приоритетном порядке. '
      . 'По запросу о ' . $topic . ' ответ будет предоставлен в максимально короткий срок.';
    $style = isset($context['responseStyle']) && is_string($context['responseStyle'])
        ? trim($context['responseStyle'])
        : '';
    $legacyTone = isset($context['selectedTone']) && is_string($context['selectedTone'])
        ? trim($context['selectedTone'])
        : '';
    $response = ($style === 'concise' || $legacyTone === 'aggressive') ? $aggressive : $neutral;

    return [
        'ok' => true,
        'analysis' => $analysis,
        'response' => $response,
        'neutral' => $neutral,
        'aggressive' => $aggressive,
        'fallback' => true
    ];
}

$env = loadEnv(getEnvPaths());

$prompt = trim((string)($_POST['prompt'] ?? ''));
$documentTitle = trim((string)($_POST['documentTitle'] ?? ''));
$context = safeJsonDecode(isset($_POST['context']) ? (string)$_POST['context'] : '');
$responseStyle = trim((string)($_POST['responseStyle'] ?? ''));
$aiBehavior = trim((string)($_POST['aiBehavior'] ?? ''));
$requestedModel = trim((string)($_POST['model'] ?? ''));
$action = trim((string)($_POST['action'] ?? ''));

if ($action !== '' && $action !== 'ai_response_analyze' && $action !== 'ocr_extract') {
    logApiDocs('warn', 'Invalid action', ['action' => $action]);
    jsonResponse(400, ['ok' => false, 'error' => 'Неверный action']);
}

$attachments = normalizeUploadedFiles('attachments');
$singleAttachment = normalizeUploadedFiles('attachment');
$ocrFile = normalizeUploadedFiles('file');
$files = array_merge($attachments, $singleAttachment, $ocrFile);

if ($action === 'ocr_extract') {
    $ocrApiKey = trim((string)($env['OCR_API_KEY'] ?? ''));
    $ocrBaseUrl = trim((string)($env['OCR_BASE_URL'] ?? 'https://api.ocr.space/parse/image'));
    $ocrLanguage = trim((string)($_POST['language'] ?? 'rus'));

    if ($ocrApiKey === '') {
        jsonResponse(500, ['ok' => false, 'error' => 'OCR_API_KEY не найден в .env']);
    }
    if (!$files) {
        jsonResponse(400, ['ok' => false, 'error' => 'Файл для OCR не передан']);
    }

    $ocrResult = performOcrRequest($ocrBaseUrl, $ocrApiKey, $files[0], $ocrLanguage !== '' ? $ocrLanguage : 'rus');
    $ocrResponseBody = $ocrResult['body'];
    $ocrCurlError = (string)$ocrResult['curl_error'];
    $ocrStatusCode = (int)$ocrResult['status'];

    if ($ocrResponseBody === false) {
        logApiDocs('error', 'OCR request failed', ['curlError' => $ocrCurlError]);
        jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к OCR API: ' . $ocrCurlError]);
    }

    $ocrJson = json_decode((string)$ocrResponseBody, true);
    if (!is_array($ocrJson)) {
        logApiDocs('error', 'OCR API returned non-JSON', ['response' => mb_substr((string)$ocrResponseBody, 0, 500)]);
        jsonResponse(502, ['ok' => false, 'error' => 'Некорректный ответ OCR API']);
    }

    if ($ocrStatusCode >= 400) {
        $message = isset($ocrJson['ErrorMessage']) && is_string($ocrJson['ErrorMessage'])
            ? $ocrJson['ErrorMessage']
            : 'OCR API error';
        jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $ocrStatusCode]);
    }

    $hasErrorOnProcessing = isset($ocrJson['IsErroredOnProcessing']) && $ocrJson['IsErroredOnProcessing'] === true;
    if ($hasErrorOnProcessing) {
        $errorMessage = '';
        if (isset($ocrJson['ErrorMessage']) && is_string($ocrJson['ErrorMessage'])) {
            $errorMessage = $ocrJson['ErrorMessage'];
        } elseif (isset($ocrJson['ErrorMessage']) && is_array($ocrJson['ErrorMessage'])) {
            $errorMessage = implode('; ', array_map('strval', $ocrJson['ErrorMessage']));
        }
        jsonResponse(400, ['ok' => false, 'error' => $errorMessage !== '' ? $errorMessage : 'OCR не смог обработать файл']);
    }

    $parsedResults = isset($ocrJson['ParsedResults']) && is_array($ocrJson['ParsedResults']) ? $ocrJson['ParsedResults'] : [];
    $parts = [];
    foreach ($parsedResults as $entry) {
        if (is_array($entry) && isset($entry['ParsedText']) && is_string($entry['ParsedText'])) {
            $textPart = trim($entry['ParsedText']);
            if ($textPart !== '') {
                $parts[] = $textPart;
            }
        }
    }

    $ocrText = trim(implode("\n\n", $parts));
    jsonResponse(200, [
        'ok' => true,
        'text' => $ocrText,
        'raw' => $ocrJson,
    ]);
}

$apiKey = trim((string)($env['AI_API_KEY'] ?? $env['OPENAI_API_KEY'] ?? ''));
$model = trim((string)($env['AI_MODEL'] ?? $env['OPENAI_MODEL'] ?? 'gpt-4o-mini'));
$baseUrl = trim((string)($env['AI_BASE_URL'] ?? $env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));
$isGroqKey = str_starts_with($apiKey, 'gsk_');
if ($baseUrl === 'https://api.openai.com/v1' && $isGroqKey) {
    $baseUrl = 'https://api.groq.com/openai/v1';
}
$isGroq = stripos($baseUrl, 'groq.com') !== false;
$isGoogleOpenAiCompat = stripos($baseUrl, 'generativelanguage.googleapis.com') !== false;

if ($apiKey === '') {
    jsonResponse(500, ['ok' => false, 'error' => 'AI API key не найден в .env']);
}

$filesSummary = buildFilesSummary($files);

$effectiveStyle = $responseStyle !== ''
    ? $responseStyle
    : (isset($context['responseStyle']) && is_string($context['responseStyle']) ? trim($context['responseStyle']) : '');
$styleInstruction = 'Пиши в деловом стиле.';
if ($effectiveStyle === 'aggressive') {
    $styleInstruction = 'Пиши напористо, уверенно и жёстко, но без оскорблений.';
} elseif ($effectiveStyle === 'informational') {
    $styleInstruction = 'Пиши спокойно, нейтрально и максимально информативно.';
} elseif ($effectiveStyle === 'neutral') {
    $styleInstruction = 'Пиши в нейтральном деловом тоне.';
} elseif ($effectiveStyle === 'concise') {
    // Обратная совместимость со старыми значениями
    $styleInstruction = 'Пиши кратко и строго по делу.';
} elseif ($effectiveStyle === 'friendly') {
    // Обратная совместимость со старыми значениями
    $styleInstruction = 'Пиши развёрнуто, дружелюбно и понятно.';
} elseif ($effectiveStyle === 'technical') {
    // Обратная совместимость со старыми значениями
    $styleInstruction = 'Пиши технически, с пояснениями и структурой.';
}
$effectiveBehavior = $aiBehavior !== ''
    ? $aiBehavior
    : (isset($context['aiBehavior']) && is_string($context['aiBehavior']) ? trim($context['aiBehavior']) : '');
$behaviorInstruction = $effectiveBehavior !== ''
    ? ('Дополнительная настройка поведения: ' . $effectiveBehavior . '.')
    : '';

$effectiveModel = $requestedModel !== '' ? $requestedModel : $model;
$allowedModelsRaw = trim((string)($env['AI_MODELS'] ?? $env['OPENAI_MODELS'] ?? ''));
if ($allowedModelsRaw !== '') {
    $allowedModels = [];
    $allowedParts = preg_split('/[,\\n]+/u', $allowedModelsRaw);
    if (is_array($allowedParts)) {
        foreach ($allowedParts as $allowedPart) {
            $normalized = trim((string)$allowedPart);
            if ($normalized !== '') {
                $allowedModels[$normalized] = true;
            }
        }
    }
    if ($requestedModel !== '' && !isset($allowedModels[$requestedModel])) {
        $effectiveModel = $model;
    }
}

$systemMessage = "Ты помощник по деловой переписке на русском языке. Верни только JSON объект с полями: analysis, response. "
  . "Всегда в первую очередь анализируй файлы из user payload: files[*].preview и context.attachedFiles[*].content. "
  . "Если контент файла присутствует, не проси путь или имя файла повторно, а используй этот контент напрямую. "
  . "Если контент пустой, кратко сообщи, что файл не удалось прочитать. "
  . $styleInstruction . ' ' . $behaviorInstruction;

$userPayload = [
    'documentTitle' => $documentTitle,
    'prompt' => $prompt,
    'context' => $context,
    'files' => $filesSummary,
];

$body = [
    'model' => $effectiveModel,
    'temperature' => 0.3,
    'messages' => [
        ['role' => 'system', 'content' => $systemMessage],
        ['role' => 'user', 'content' => json_encode($userPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
    ],
];
if (!$isGroq && !$isGoogleOpenAiCompat) {
    $body['response_format'] = ['type' => 'json_object'];
}

$endpoint = rtrim($baseUrl, '/') . '/chat/completions';
function performAiRequest(string $endpoint, string $apiKey, array $body): array
{
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
        CURLOPT_TIMEOUT => 90,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $statusCode, 'body' => $responseBody, 'curl_error' => $curlError];
}

$requestResult = performAiRequest($endpoint, $apiKey, $body);
$responseBody = $requestResult['body'];
$curlError = (string)$requestResult['curl_error'];
$statusCode = (int)$requestResult['status'];

if ($responseBody === false) {
    logApiDocs('error', 'AI request failed', ['curlError' => $curlError]);
    jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к AI API: ' . $curlError]);
}

$responseJson = json_decode($responseBody, true);
if (!is_array($responseJson)) {
    logApiDocs('error', 'AI API returned non-JSON', ['response' => mb_substr($responseBody, 0, 500)]);
    jsonResponse(502, ['ok' => false, 'error' => 'Некорректный ответ AI API']);
}

if ($statusCode >= 400 && $isGoogleOpenAiCompat) {
    $errorMessage = isset($responseJson['error']['message']) && is_string($responseJson['error']['message'])
        ? $responseJson['error']['message']
        : '';
    $isUnsupportedField = stripos($errorMessage, 'response_format') !== false
        || stripos($errorMessage, 'temperature') !== false
        || stripos($errorMessage, 'Unknown name') !== false;
    if ($isUnsupportedField) {
        $retryBody = $body;
        unset($retryBody['response_format'], $retryBody['temperature']);
        $retryResult = performAiRequest($endpoint, $apiKey, $retryBody);
        $retryResponseBody = $retryResult['body'];
        $retryCurlError = (string)$retryResult['curl_error'];
        $retryStatusCode = (int)$retryResult['status'];

        if ($retryResponseBody === false) {
            logApiDocs('error', 'Google AI retry request failed', ['curlError' => $retryCurlError]);
            jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к AI API: ' . $retryCurlError]);
        }

        $retryJson = json_decode($retryResponseBody, true);
        if (is_array($retryJson)) {
            $responseJson = $retryJson;
            $statusCode = $retryStatusCode;
        }
    }
}

if ($statusCode >= 400) {
    $message = 'AI API error';
    if (isset($responseJson['error']['message']) && is_string($responseJson['error']['message'])) {
        $message = $responseJson['error']['message'];
    }
    logApiDocs('error', 'AI API HTTP error', ['status' => $statusCode, 'message' => $message]);
    $unsupportedRegion = stripos($message, 'Country, region, or territory not supported') !== false;
    if ($statusCode === 403 && $unsupportedRegion) {
        logApiDocs('warn', 'AI provider blocked by region, fallback enabled', ['status' => $statusCode]);
        jsonResponse(200, buildLocalFallback($documentTitle, $prompt, $context));
    }
    jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $statusCode]);
}

$content = (string)($responseJson['choices'][0]['message']['content'] ?? '');
$parsed = parseAiJson($content);

$analysis = trim((string)($parsed['analysis'] ?? ''));
$response = trim((string)($parsed['response'] ?? ''));
$neutral = trim((string)($parsed['neutral'] ?? ''));
$aggressive = trim((string)($parsed['aggressive'] ?? ''));

if ($response === '') {
    $selectedTone = isset($context['selectedTone']) && is_string($context['selectedTone'])
        ? trim($context['selectedTone'])
        : '';
    if (($effectiveStyle === 'aggressive' || $effectiveStyle === 'concise' || $selectedTone === 'aggressive') && $aggressive !== '') {
        $response = $aggressive;
    } elseif ($neutral !== '') {
        $response = $neutral;
    } elseif ($aggressive !== '') {
        $response = $aggressive;
    }
}

if ($analysis === '' && $response === '' && $neutral === '' && $aggressive === '') {
    $analysis = 'ИИ вернул ответ в свободной форме.';
    $response = $content;
    $neutral = $content;
    $aggressive = $content;
}

jsonResponse(200, [
    'ok' => true,
    'analysis' => $analysis,
    'response' => $response,
    'neutral' => $neutral,
    'aggressive' => $aggressive,
]);
