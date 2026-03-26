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
        $name = (string)($file['name'] ?? '');
        $type = (string)($file['type'] ?? '');
        $tmp = (string)($file['tmp_name'] ?? '');
        $preview = extractTextPreviewFromFile($tmp, $name, $type);
        $entry = [
            'name' => $name,
            'type' => $type,
            'size' => (int)($file['size'] ?? 0),
            'preview' => $preview
        ];
        $summary[] = $entry;
    }
    return $summary;
}

function mbSafeSubstring(string $value, int $limit): string
{
    if ($limit <= 0) {
        return '';
    }
    if (function_exists('mb_substr')) {
        return (string)mb_substr($value, 0, $limit);
    }
    return substr($value, 0, $limit);
}

function normalizeExtractedText(string $text, int $maxLength = 12000): string
{
    $clean = trim((string)preg_replace('/\s+/u', ' ', $text));
    if ($clean === '') {
        return '';
    }
    if (function_exists('mb_strlen') && mb_strlen($clean) > $maxLength) {
        return mbSafeSubstring($clean, $maxLength) . '…';
    }
    if (strlen($clean) > $maxLength) {
        return substr($clean, 0, $maxLength) . '…';
    }
    return $clean;
}

function runCommand(array $parts): string
{
    if (!$parts) {
        return '';
    }
    $command = implode(' ', array_map('escapeshellarg', $parts));
    $output = @shell_exec($command . ' 2>/dev/null');
    return is_string($output) ? trim($output) : '';
}

function extractTextFromDocx(string $path): string
{
    if (!class_exists('ZipArchive')) {
        return '';
    }
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        return '';
    }
    $xml = $zip->getFromName('word/document.xml');
    $zip->close();
    if (!is_string($xml) || $xml === '') {
        return '';
    }
    $xml = str_replace(['</w:p>', '</w:tr>', '</w:tc>', '<w:br/>', '<w:tab/>'], ["\n", "\n", " ", "\n", " "], $xml);
    $text = strip_tags($xml);
    return normalizeExtractedText(html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function extractTextFromPdf(string $path): string
{
    $fromPdfToText = runCommand(['pdftotext', '-layout', '-enc', 'UTF-8', '-nopgbrk', $path, '-']);
    if ($fromPdfToText !== '') {
        return normalizeExtractedText($fromPdfToText);
    }
    return '';
}

function extractTextFromImageByOcr(string $path): string
{
    $text = runCommand(['tesseract', $path, 'stdout', '-l', 'rus+eng']);
    if ($text !== '') {
        return normalizeExtractedText($text);
    }
    return '';
}

function extractTextFromScannedPdf(string $path): string
{
    $tmpBase = tempnam(sys_get_temp_dir(), 'pdf-ocr-');
    if (!is_string($tmpBase) || $tmpBase === '') {
        return '';
    }
    @unlink($tmpBase);
    $prefix = $tmpBase . '-page';
    runCommand(['pdftoppm', '-f', '1', '-singlefile', '-png', $path, $prefix]);
    $imagePath = $prefix . '.png';
    if (!is_file($imagePath)) {
        return '';
    }
    $text = extractTextFromImageByOcr($imagePath);
    @unlink($imagePath);
    return $text;
}

function extractTextPreviewFromFile(string $tmpPath, string $originalName, string $mimeType): string
{
    if ($tmpPath === '' || !is_file($tmpPath)) {
        return '';
    }
    $name = strtolower($originalName);
    $type = strtolower($mimeType);
    $isText = str_contains($type, 'text')
        || str_ends_with($name, '.txt')
        || str_ends_with($name, '.md')
        || str_ends_with($name, '.csv')
        || str_ends_with($name, '.json');
    if ($isText) {
        $content = @file_get_contents($tmpPath, false, null, 0, 15000);
        return is_string($content) ? normalizeExtractedText($content) : '';
    }
    if (str_ends_with($name, '.docx')) {
        return extractTextFromDocx($tmpPath);
    }
    if (str_ends_with($name, '.doc')) {
        $docText = runCommand(['catdoc', $tmpPath]);
        return normalizeExtractedText($docText);
    }
    if (str_ends_with($name, '.pdf') || str_contains($type, 'pdf')) {
        $pdfText = extractTextFromPdf($tmpPath);
        if ($pdfText !== '') {
            return $pdfText;
        }
        return extractTextFromScannedPdf($tmpPath);
    }
    $isImage = str_starts_with($type, 'image/')
        || str_ends_with($name, '.png')
        || str_ends_with($name, '.jpg')
        || str_ends_with($name, '.jpeg')
        || str_ends_with($name, '.webp');
    if ($isImage) {
        return extractTextFromImageByOcr($tmpPath);
    }
    return '';
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

function collectResponseText(array $responseJson): string
{
    if (isset($responseJson['output_text']) && is_string($responseJson['output_text'])) {
        return trim($responseJson['output_text']);
    }
    $chunks = [];
    if (!isset($responseJson['output']) || !is_array($responseJson['output'])) {
        return '';
    }
    foreach ($responseJson['output'] as $outputItem) {
        if (!is_array($outputItem) || !isset($outputItem['content']) || !is_array($outputItem['content'])) {
            continue;
        }
        foreach ($outputItem['content'] as $contentItem) {
            if (is_array($contentItem) && isset($contentItem['text']) && is_string($contentItem['text'])) {
                $chunks[] = $contentItem['text'];
            }
        }
    }
    return trim(implode("\n", $chunks));
}

function aiValueToText(mixed $value): string
{
    if (is_string($value)) {
        return trim($value);
    }
    if (is_numeric($value) || is_bool($value)) {
        return (string)$value;
    }
    if (is_array($value)) {
        $parts = [];
        foreach ($value as $item) {
            if (is_string($item) && trim($item) !== '') {
                $parts[] = trim($item);
                continue;
            }
            if (is_array($item) || is_object($item)) {
                $json = json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if (is_string($json) && $json !== '') {
                    $parts[] = $json;
                }
            }
        }
        if ($parts) {
            return trim(implode("\n", $parts));
        }
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return is_string($json) ? trim($json) : '';
    }
    if (is_object($value)) {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return is_string($json) ? trim($json) : '';
    }
    return '';
}

function uploadFileToOpenAi(string $baseUrl, string $apiKey, array $file): ?string
{
    $tmp = (string)($file['tmp_name'] ?? '');
    $name = (string)($file['name'] ?? 'attachment');
    $type = (string)($file['type'] ?? 'application/octet-stream');
    if ($tmp === '' || !is_file($tmp)) {
        return null;
    }
    $endpoint = rtrim($baseUrl, '/') . '/files';
    $curlFile = curl_file_create($tmp, $type, $name);
    $postFields = [
        'purpose' => 'user_data',
        'file' => $curlFile,
    ];
    $ch = curl_init($endpoint);
    if ($ch === false) {
        return null;
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_TIMEOUT => 120,
    ]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($response === false || $status >= 400) {
        return null;
    }
    $decoded = json_decode((string)$response, true);
    if (!is_array($decoded) || !isset($decoded['id']) || !is_string($decoded['id'])) {
        return null;
    }
    return $decoded['id'];
}

function requestResponsesApi(
    string $baseUrl,
    string $apiKey,
    string $model,
    string $systemMessage,
    array $userPayload,
    array $fileIds
): array {
    $userContent = [
        [
            'type' => 'input_text',
            'text' => json_encode($userPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ],
    ];
    foreach ($fileIds as $fileId) {
        if (!is_string($fileId) || trim($fileId) === '') {
            continue;
        }
        $userContent[] = [
            'type' => 'input_file',
            'file_id' => $fileId,
        ];
    }

    $body = [
        'model' => $model,
        'input' => [
            [
                'role' => 'system',
                'content' => [
                    ['type' => 'input_text', 'text' => $systemMessage]
                ]
            ],
            [
                'role' => 'user',
                'content' => $userContent
            ]
        ],
        'max_output_tokens' => 3500,
        'text' => [
            'format' => ['type' => 'json_object']
        ]
    ];

    $endpoint = rtrim($baseUrl, '/') . '/responses';
    $ch = curl_init($endpoint);
    if ($ch === false) {
        return ['ok' => false, 'status' => 500, 'error' => 'Не удалось инициализировать cURL'];
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 120,
    ]);
    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($responseBody === false) {
        return ['ok' => false, 'status' => 502, 'error' => $curlError];
    }
    $json = json_decode((string)$responseBody, true);
    if (!is_array($json)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Некорректный ответ Responses API'];
    }
    if ($statusCode >= 400) {
        $message = isset($json['error']['message']) && is_string($json['error']['message'])
            ? $json['error']['message']
            : 'Responses API error';
        return ['ok' => false, 'status' => $statusCode, 'error' => $message];
    }
    $content = collectResponseText($json);
    return ['ok' => true, 'content' => $content, 'raw' => $json];
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
    $style = isset($context['selectedTone']) && is_string($context['selectedTone'])
        ? trim($context['selectedTone'])
        : 'neutral';
    $response = $style === 'aggressive' ? $aggressive : $neutral;

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

$apiKey = trim((string)($env['AI_API_KEY'] ?? $env['OPENAI_API_KEY'] ?? ''));
$model = trim((string)($env['AI_MODEL'] ?? $env['OPENAI_MODEL'] ?? 'gpt-4.1'));
$baseUrl = trim((string)($env['AI_BASE_URL'] ?? $env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'));
$isGroqKey = str_starts_with($apiKey, 'gsk_');
if ($baseUrl === 'https://api.openai.com/v1' && $isGroqKey) {
    $baseUrl = 'https://api.groq.com/openai/v1';
}
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

$systemMessage = "Ты senior-аналитик по деловой переписке. Отвечай только в JSON."
  . " Обязательные поля: analysis, response, neutral, aggressive, citations."
  . " response делай максимально подробным, структурированным (заголовки, списки, шаги, риски, выводы)."
  . " В analysis сделай глубокий анализ, включи проверку противоречий и предположения."
  . " В citations укажи массив коротких цитат/фрагментов из файлов, на которые ты опирался."
  . " Если данных мало — явно напиши, чего не хватает. Стиль ответа бери из context.selectedTone (neutral/aggressive).";

$userPayload = [
    'documentTitle' => $documentTitle,
    'prompt' => $prompt,
    'context' => $context,
    'files' => $filesSummary,
];

$content = '';
if (!$isGroq && stripos($baseUrl, 'api.openai.com') !== false) {
    $fileIds = [];
    foreach ($files as $file) {
        $fileId = uploadFileToOpenAi($baseUrl, $apiKey, $file);
        if ($fileId !== null) {
            $fileIds[] = $fileId;
        }
    }
    $responsesResult = requestResponsesApi($baseUrl, $apiKey, $model, $systemMessage, $userPayload, $fileIds);
    if (!$responsesResult['ok']) {
        $message = (string)($responsesResult['error'] ?? 'Responses API error');
        $statusCode = (int)($responsesResult['status'] ?? 502);
        logApiDocs('error', 'Responses API error', ['status' => $statusCode, 'message' => $message]);
        jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $statusCode]);
    }
    $content = isset($responsesResult['content']) && is_string($responsesResult['content'])
        ? $responsesResult['content']
        : '';
} else {
    $body = [
        'model' => $model,
        'temperature' => 0.2,
        'max_tokens' => 3500,
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
    $responseJson = json_decode((string)$responseBody, true);
    if (!is_array($responseJson)) {
        logApiDocs('error', 'AI API returned non-JSON', ['response' => mb_substr((string)$responseBody, 0, 500)]);
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
}
$parsed = parseAiJson($content);

$analysis = aiValueToText($parsed['analysis'] ?? '');
$response = aiValueToText($parsed['response'] ?? '');
$neutral = aiValueToText($parsed['neutral'] ?? '');
$aggressive = aiValueToText($parsed['aggressive'] ?? '');
$citations = [];
if (isset($parsed['citations'])) {
    $rawCitations = $parsed['citations'];
    if (is_array($rawCitations)) {
        foreach ($rawCitations as $citationItem) {
            $itemText = aiValueToText($citationItem);
            if ($itemText !== '') {
                $citations[] = $itemText;
            }
        }
    } else {
        $singleCitation = aiValueToText($rawCitations);
        if ($singleCitation !== '') {
            $citations[] = $singleCitation;
        }
    }
}

if ($response === '') {
    $selectedTone = isset($context['selectedTone']) && is_string($context['selectedTone'])
        ? trim($context['selectedTone'])
        : 'neutral';
    if ($selectedTone === 'aggressive' && $aggressive !== '') {
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
    'citations' => $citations,
]);
