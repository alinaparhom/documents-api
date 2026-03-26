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
    $isPing = isset($_GET['ping']) && (string)$_GET['ping'] === '1';
    jsonResponse(200, [
        'ok' => true,
        'message' => $isPing
            ? 'pong'
            : 'API доступен. Используйте POST для action=ai_response_analyze.',
        'endpoint' => '/js/documents/api-docs.php',
        'method' => 'POST'
    ]);
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

    return [
        'ok' => true,
        'analysis' => $analysis,
        'neutral' => $neutral,
        'aggressive' => $aggressive,
        'fallback' => true
    ];
}

$env = loadEnv([
    __DIR__ . '/app/.env',
    __DIR__ . '/.env',
    __DIR__ . '/app/env.txt'
]);

$apiKey = trim((string)($env['AI_API_KEY'] ?? $env['OPENAI_API_KEY'] ?? ''));
$model = trim((string)($env['AI_MODEL'] ?? $env['OPENAI_MODEL'] ?? 'gpt-4o-mini'));
$baseUrl = trim((string)($env['AI_BASE_URL'] ?? $env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));
$isGroq = stripos($baseUrl, 'groq.com') !== false;

if ($apiKey === '') {
    jsonResponse(500, ['ok' => false, 'error' => 'AI API key не найден в .env']);
}

$prompt = trim((string)($_POST['prompt'] ?? ''));
$documentTitle = trim((string)($_POST['documentTitle'] ?? ''));
$context = safeJsonDecode(isset($_POST['context']) ? (string)$_POST['context'] : '');
$action = trim((string)($_POST['action'] ?? ''));

if ($action !== '' && $action !== 'ai_response_analyze') {
    logApiDocs('warn', 'Invalid action', ['action' => $action]);
    jsonResponse(400, ['ok' => false, 'error' => 'Неверный action']);
}

$attachments = normalizeUploadedFiles('attachments');
$singleAttachment = normalizeUploadedFiles('attachment');
$files = array_merge($attachments, $singleAttachment);

$filesSummary = buildFilesSummary($files);

$systemMessage = "Ты помощник по деловой переписке на русском языке. Верни только JSON объект с полями: analysis, neutral, aggressive. Тексты ясные и короткие.";

$userPayload = [
    'documentTitle' => $documentTitle,
    'prompt' => $prompt,
    'context' => $context,
    'files' => $filesSummary,
];

$body = [
    'model' => $model,
    'temperature' => 0.3,
    'messages' => [
        ['role' => 'system', 'content' => $systemMessage],
        ['role' => 'user', 'content' => json_encode($userPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
    ],
];
if (!$isGroq) {
    $body['response_format'] = ['type' => 'json_object'];
}

$endpoint = rtrim($baseUrl, '/') . '/chat/completions';
$ch = curl_init($endpoint);
if ($ch === false) {
    jsonResponse(500, ['ok' => false, 'error' => 'Не удалось инициализировать cURL']);
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

if ($responseBody === false) {
    logApiDocs('error', 'AI request failed', ['curlError' => $curlError]);
    jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к AI API: ' . $curlError]);
}

$responseJson = json_decode($responseBody, true);
if (!is_array($responseJson)) {
    logApiDocs('error', 'AI API returned non-JSON', ['response' => mb_substr($responseBody, 0, 500)]);
    jsonResponse(502, ['ok' => false, 'error' => 'Некорректный ответ AI API']);
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
$neutral = trim((string)($parsed['neutral'] ?? ''));
$aggressive = trim((string)($parsed['aggressive'] ?? ''));

if ($analysis === '' && $neutral === '' && $aggressive === '') {
    $analysis = 'ИИ вернул ответ в свободной форме.';
    $neutral = $content;
    $aggressive = $content;
}

jsonResponse(200, [
    'ok' => true,
    'analysis' => $analysis,
    'neutral' => $neutral,
    'aggressive' => $aggressive,
]);
