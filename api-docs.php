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

function detectFileExtension(array $file): string
{
    $name = strtolower(trim((string)($file['name'] ?? '')));
    if ($name === '' || !str_contains($name, '.')) {
        $mimeExtension = extensionFromMimeType((string)($file['type'] ?? ''));
        if ($mimeExtension !== '') {
            return $mimeExtension;
        }
        $tmp = (string)($file['tmp_name'] ?? '');
        $archiveExtension = detectOfficeExtensionFromArchive($tmp);
        return $archiveExtension;
    }
    $parts = explode('.', $name);
    $extension = trim((string)end($parts));
    if ($extension !== '') {
        return $extension;
    }
    $mimeExtension = extensionFromMimeType((string)($file['type'] ?? ''));
    if ($mimeExtension !== '') {
        return $mimeExtension;
    }
    $tmp = (string)($file['tmp_name'] ?? '');
    return detectOfficeExtensionFromArchive($tmp);
}


function detectMimeType(array $file): string
{
    $type = trim((string)($file['type'] ?? ''));
    if ($type !== '') {
        return strtolower($type);
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp !== '' && is_file($tmp) && function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo !== false) {
            $detected = @finfo_file($finfo, $tmp);
            @finfo_close($finfo);
            if (is_string($detected) && trim($detected) !== '') {
                return strtolower(trim($detected));
            }
        }
    }

    return 'application/octet-stream';
}

function extensionFromMimeType(string $mimeType): string
{
    $mime = strtolower(trim($mimeType));
    if ($mime === '') {
        return '';
    }

    $map = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.template' => 'dotx',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'image/bmp' => 'bmp',
        'image/tiff' => 'tiff',
        'text/plain' => 'txt',
    ];
    if (isset($map[$mime])) {
        return $map[$mime];
    }

    return '';
}

function detectOfficeExtensionFromArchive(string $tmpFile): string
{
    if ($tmpFile === '' || !is_file($tmpFile) || !class_exists('ZipArchive')) {
        return '';
    }

    $zip = new ZipArchive();
    if ($zip->open($tmpFile) !== true) {
        return '';
    }

    $detected = '';
    if ($zip->locateName('word/document.xml', ZipArchive::FL_NOCASE) !== false) {
        $detected = 'docx';
    } elseif ($zip->locateName('xl/workbook.xml', ZipArchive::FL_NOCASE) !== false) {
        $detected = 'xlsx';
    } elseif ($zip->locateName('ppt/presentation.xml', ZipArchive::FL_NOCASE) !== false) {
        $detected = 'pptx';
    }

    $zip->close();
    return $detected;
}

function ensureFileNameWithExtension(string $name, string $extension): string
{
    $normalizedName = trim($name) !== '' ? trim($name) : 'document';
    if ($extension === '') {
        return $normalizedName;
    }
    if (preg_match('/\.[a-z0-9]{1,10}$/i', $normalizedName)) {
        return $normalizedName;
    }
    return $normalizedName . '.' . strtolower($extension);
}

function decodeDocxXmlText(string $xml): string
{
    if (!class_exists('DOMDocument') || !class_exists('DOMXPath')) {
        return '';
    }

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

function shellCommandExists(string $command): bool
{
    $output = [];
    $code = 1;
    @exec('command -v ' . escapeshellarg($command) . ' 2>/dev/null', $output, $code);
    return $code === 0 && !empty($output);
}

function extractPdfTextFast(string $pdfPath): string
{
    if ($pdfPath === '' || !is_file($pdfPath) || !shellCommandExists('pdftotext')) {
        return '';
    }

    $tmpTextPath = tempnam(sys_get_temp_dir(), 'ocr_pdftxt_');
    if ($tmpTextPath === false) {
        return '';
    }

    try {
        $cmd = 'pdftotext -enc UTF-8 -f 1 -l 25 '
            . escapeshellarg($pdfPath) . ' ' . escapeshellarg($tmpTextPath) . ' 2>/dev/null';
        @exec($cmd, $out, $code);
        if ($code !== 0 || !is_file($tmpTextPath)) {
            return '';
        }
        $raw = @file_get_contents($tmpTextPath);
        return is_string($raw) ? trim($raw) : '';
    } finally {
        @unlink($tmpTextPath);
    }
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
    if ($extension === 'pdf') {
        return extractPdfTextFast($tmpFile);
    }

    return '';
}

function performOcrRequest(string $endpoint, string $apiKey, array $file, string $language = 'rus', ?string $fileUrl = null): array
{
    $ch = curl_init($endpoint);
    if ($ch === false) {
        return ['status' => 500, 'body' => false, 'curl_error' => 'Не удалось инициализировать cURL'];
    }

    $postFields = [
        'language' => $language,
    ];
    if (is_string($fileUrl) && trim($fileUrl) !== '') {
        $postFields['url'] = trim($fileUrl);
    } else {
        $tmpName = (string)($file['tmp_name'] ?? '');
        if ($tmpName === '' || !is_file($tmpName)) {
            curl_close($ch);
            return ['status' => 400, 'body' => false, 'curl_error' => 'Файл для OCR не найден'];
        }
        $mime = detectMimeType($file);
        $extension = detectFileExtension($file);
        $name = ensureFileNameWithExtension((string)($file['name'] ?? 'document'), $extension);
        $postFields['file'] = curl_file_create($tmpName, $mime, $name);
        if ($extension !== '') {
            $postFields['filetype'] = strtoupper($extension);
        }
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_NOSIGNAL => 1,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $statusCode, 'body' => $responseBody, 'curl_error' => $curlError];
}

function guessExtensionFromUrl(string $url): string
{
    $path = (string)parse_url($url, PHP_URL_PATH);
    if ($path === '') {
        return '';
    }
    $basename = strtolower((string)pathinfo($path, PATHINFO_BASENAME));
    if ($basename === '' || !str_contains($basename, '.')) {
        return '';
    }
    $extension = strtolower((string)pathinfo($basename, PATHINFO_EXTENSION));
    if ($extension === '') {
        return '';
    }
    if ($extension === 'jpeg') {
        return 'jpg';
    }
    return preg_replace('/[^a-z0-9]+/i', '', $extension) ?: '';
}

function downloadRemoteFileForOcr(string $url): ?array
{
    $normalizedUrl = trim($url);
    if ($normalizedUrl === '' || !filter_var($normalizedUrl, FILTER_VALIDATE_URL)) {
        return null;
    }

    $parts = parse_url($normalizedUrl);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true)) {
        return null;
    }

    $tmpFile = tempnam(sys_get_temp_dir(), 'ocr_url_');
    if (!is_string($tmpFile) || $tmpFile === '') {
        return null;
    }

    $fp = @fopen($tmpFile, 'wb');
    if ($fp === false) {
        @unlink($tmpFile);
        return null;
    }

    $maxBytes = 50 * 1024 * 1024;
    $writtenBytes = 0;
    $contentType = '';
    $httpStatus = 0;
    $downloadFailed = false;
    $sizeExceeded = false;
    $curlError = '';

    $ch = curl_init($normalizedUrl);
    if ($ch === false) {
        @fclose($fp);
        @unlink($tmpFile);
        return null;
    }

    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 4,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_FILE => $fp,
        CURLOPT_HEADERFUNCTION => static function ($curl, string $headerLine) use (&$contentType): int {
            $length = strlen($headerLine);
            $parts = explode(':', $headerLine, 2);
            if (count($parts) === 2 && strtolower(trim($parts[0])) === 'content-type') {
                $contentType = strtolower(trim((string)$parts[1]));
            }
            return $length;
        },
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use ($fp, &$writtenBytes, $maxBytes, &$sizeExceeded): int {
            $chunkLength = strlen($chunk);
            $writtenBytes += $chunkLength;
            if ($writtenBytes > $maxBytes) {
                $sizeExceeded = true;
                return 0;
            }
            $written = @fwrite($fp, $chunk);
            if ($written === false) {
                return 0;
            }
            return $written;
        },
    ]);

    $execResult = curl_exec($ch);
    $httpStatus = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = (string)curl_error($ch);
    curl_close($ch);
    @fclose($fp);

    if ($execResult === false || $httpStatus < 200 || $httpStatus >= 300) {
        $downloadFailed = true;
    }

    if ($downloadFailed || $sizeExceeded || !is_file($tmpFile) || filesize($tmpFile) <= 0) {
        @unlink($tmpFile);
        return null;
    }

    $extension = extensionFromMimeType($contentType);
    if ($extension === '') {
        $extension = guessExtensionFromUrl($normalizedUrl);
    }
    $name = ensureFileNameWithExtension('remote-ocr-file', $extension);
    $mime = $contentType !== '' ? trim(explode(';', $contentType)[0]) : 'application/octet-stream';

    return [
        'name' => $name,
        'tmp_name' => $tmpFile,
        'type' => $mime !== '' ? $mime : 'application/octet-stream',
        'size' => (int)filesize($tmpFile),
        '_from_remote_url' => true,
        '_source_url' => $normalizedUrl,
        '_download_error' => $curlError,
    ];
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

    $defaultPrefixes = ['сформируй официальный ответ', 'подготовь официальный ответ', 'решение ии:', 'причина:', 'действия:'];
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
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '') {
            $cleaned[] = '';
            continue;
        }
        $lower = mb_strtolower($trimmed);
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

    return trim(preg_replace('/\n{3,}/u', "\n\n", implode("\n", $cleaned)) ?? '');
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
                continue;
            }
            $crossRunResult = replacePlaceholderAcrossWordTextRuns($updated, (string)$search, (string)$replace);
            if (is_array($crossRunResult) && !empty($crossRunResult['replaced']) && isset($crossRunResult['xml'])) {
                $updated = (string)$crossRunResult['xml'];
                $replacedAny = true;
            }
        }
        if ($updated !== $content) {
            $zip->addFromString($internalFile, $updated);
        }
    }

    $fallbackAnswer = isset($replacements['[ОТВЕТ ИИ]']) ? (string)$replacements['[ОТВЕТ ИИ]'] : '';
    if (!$replacedAny && $fallbackAnswer !== '') {
        $zip->close();
        return false;
    }

    return $zip->close();
}

function replacePlaceholderAcrossWordTextRuns(string $xml, string $search, string $replace): array
{
    if ($xml === '' || $search === '') {
        return ['xml' => $xml, 'replaced' => false];
    }

    $dom = new DOMDocument();
    $loaded = @$dom->loadXML($xml, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET);
    if (!$loaded) {
        return ['xml' => $xml, 'replaced' => false];
    }

    $xpath = new DOMXPath($dom);
    $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    $textNodes = $xpath->query('//w:t');
    if (!$textNodes || $textNodes->length === 0) {
        return ['xml' => $xml, 'replaced' => false];
    }

    $fullText = '';
    $map = [];
    for ($i = 0; $i < $textNodes->length; $i += 1) {
        $node = $textNodes->item($i);
        if (!$node instanceof DOMElement) {
            continue;
        }
        $value = (string)$node->nodeValue;
        $start = mb_strlen($fullText, 'UTF-8');
        $fullText .= $value;
        $end = mb_strlen($fullText, 'UTF-8');
        $map[] = ['node' => $node, 'start' => $start, 'end' => $end];
    }
    if (!$map || mb_strpos($fullText, $search, 0, 'UTF-8') === false) {
        return ['xml' => $xml, 'replaced' => false];
    }

    $matches = [];
    $cursor = 0;
    $searchLen = mb_strlen($search, 'UTF-8');
    while ($cursor <= mb_strlen($fullText, 'UTF-8')) {
        $index = mb_strpos($fullText, $search, $cursor, 'UTF-8');
        if ($index === false) {
            break;
        }
        $matches[] = ['start' => $index, 'end' => $index + $searchLen];
        $cursor = $index + $searchLen;
    }
    if (!$matches) {
        return ['xml' => $xml, 'replaced' => false];
    }

    $lineBreakToken = '__DOCX_LINE_BREAK__';
    while (mb_strpos($replace, $lineBreakToken, 0, 'UTF-8') !== false) {
        $lineBreakToken .= '_X';
    }
    $replaceText = str_replace(["\r\n", "\r"], "\n", $replace);
    $replaceText = str_replace("\n", $lineBreakToken, $replaceText);
    for ($m = count($matches) - 1; $m >= 0; $m -= 1) {
        $match = $matches[$m];
        $startInfo = null;
        $endInfo = null;
        foreach ($map as $item) {
            if ($startInfo === null && $match['start'] >= $item['start'] && $match['start'] <= $item['end']) {
                $startInfo = $item;
            }
            if ($endInfo === null && $match['end'] >= $item['start'] && $match['end'] <= $item['end']) {
                $endInfo = $item;
            }
            if ($startInfo && $endInfo) {
                break;
            }
        }
        if (!$startInfo || !$endInfo) {
            continue;
        }
        $startNode = $startInfo['node'];
        $endNode = $endInfo['node'];
        $startOffset = max(0, $match['start'] - $startInfo['start']);
        $endOffset = max(0, $match['end'] - $endInfo['start']);

        $startValue = (string)$startNode->nodeValue;
        $endValue = (string)$endNode->nodeValue;
        $startPrefix = mb_substr($startValue, 0, $startOffset, 'UTF-8');
        $endSuffix = mb_substr($endValue, $endOffset, null, 'UTF-8');

        if ($startNode->isSameNode($endNode)) {
            $startNode->nodeValue = $startPrefix . $replaceText . $endSuffix;
            continue;
        }

        $startNode->nodeValue = $startPrefix . $replaceText;
        $passedStart = false;
        foreach ($map as $item) {
            $node = $item['node'];
            if ($node->isSameNode($startNode)) {
                $passedStart = true;
                continue;
            }
            if (!$passedStart) {
                continue;
            }
            if ($node->isSameNode($endNode)) {
                $node->nodeValue = $endSuffix;
                break;
            }
            $node->nodeValue = '';
        }
    }

    $newXml = $dom->saveXML($dom->documentElement);
    if (!is_string($newXml)) {
        return ['xml' => $xml, 'replaced' => true];
    }

    if (str_contains($newXml, $lineBreakToken)) {
        $newXml = str_replace(
            $lineBreakToken,
            '</w:t><w:br/><w:t xml:space="preserve">',
            $newXml
        );
    }

    return ['xml' => $newXml, 'replaced' => true];
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

function htmlToPlainText(string $html): string
{
    $text = trim(strip_tags($html));
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    $text = preg_replace('/\R{3,}/u', "\n\n", (string)$text);
    return trim((string)$text);
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

function createDocxFromHtmlUsingPhpWord(string $outputPath, string $html): bool
{
    if (!class_exists('\\PhpOffice\\PhpWord\\PhpWord') || !class_exists('\\PhpOffice\\PhpWord\\Shared\\Html')) {
        return false;
    }

    try {
        $phpWord = new \PhpOffice\PhpWord\PhpWord();
        $section = $phpWord->addSection([
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
$requestedModel = trim((string)($_POST['model'] ?? ''));
$action = trim((string)($_POST['action'] ?? ''));
$extractedTextsRaw = isset($_POST['extractedTexts']) ? (string)$_POST['extractedTexts'] : '';

if ($action !== '' && $action !== 'ai_response_analyze' && $action !== 'ocr_extract' && $action !== 'generate_document' && $action !== 'generate_from_html') {
    logApiDocs('warn', 'Invalid action', ['action' => $action]);
    jsonResponse(400, ['ok' => false, 'error' => 'Неверный action']);
}

if ($action === 'generate_document') {
    $format = strtolower(trim((string)($_POST['format'] ?? 'docx')));
    $answerText = normalizeDocText((string)($_POST['answer'] ?? ''));
    $documentTitle = trim((string)($_POST['documentTitle'] ?? ''));

    if ($answerText === '') {
        jsonResponse(400, ['ok' => false, 'error' => 'Нет текста ответа']);
    }
    if (mb_strlen($answerText) > 40000) {
        jsonResponse(400, ['ok' => false, 'error' => 'Ответ слишком большой для экспорта']);
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

    $templateDocxPath = resolveTemplatePath('template.docx', $extraTemplateDirs);
    $templatePdfPath = resolveTemplatePath('template.pdf', $extraTemplateDirs);
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
        if (!replaceDocxPlaceholders($templateDocxPath, $tmpFile, [
            '[ОТВЕТ ИИ]' => $answerText,
            '[DOCUMENT_TITLE]' => $documentTitle,
        ])) {
            @unlink($tmpFile);
            jsonResponse(500, ['ok' => false, 'error' => 'Не удалось сформировать DOCX: проверьте, что в шаблоне есть метка [ОТВЕТ ИИ]']);
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        header('Content-Disposition: attachment; filename="answer.docx"');
    } else {
        if (is_file($templatePdfPath)) {
            @unlink($tmpFile);
            $tmpFile = $templatePdfPath;
        } else {
            if (is_file(__DIR__ . '/vendor/autoload.php')) {
                require_once __DIR__ . '/vendor/autoload.php';
            }
            if (!createPdfFromText($tmpFile, $documentTitle, $answerText)) {
                @unlink($tmpFile);
                jsonResponse(500, ['ok' => false, 'error' => 'PDF экспорт недоступен: установите tecnickcom/tcpdf или добавьте template.pdf в директорию шаблонов']);
            }
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
    $templateDocxPath = resolveTemplatePath('template.docx', $extraTemplateDirs);
    if (!is_file($templateDocxPath)) {
        jsonResponse(500, ['ok' => false, 'error' => 'DOCX шаблон не найден']);
    }

    $tmpFile = tempnam(sys_get_temp_dir(), 'html_');
    if ($tmpFile === false) {
        jsonResponse(500, ['ok' => false, 'error' => 'Не удалось создать временный файл']);
    }

    if ($format === 'docx') {
        $generated = createDocxFromHtmlUsingPhpWord($tmpFile, $html);
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

    if (is_file(__DIR__ . '/vendor/autoload.php')) {
        require_once __DIR__ . '/vendor/autoload.php';
    }
    $text = htmlToPlainText($html);
    if (!createPdfFromText($tmpFile, $documentTitle, $text)) {
        @unlink($tmpFile);
        jsonResponse(500, ['ok' => false, 'error' => 'PDF экспорт недоступен для HTML']);
    }
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="answer-from-html.pdf"');
    header('Content-Length: ' . filesize($tmpFile));
    readfile($tmpFile);
    @unlink($tmpFile);
    exit;
}

$attachments = normalizeUploadedFiles('attachments');
$singleAttachment = normalizeUploadedFiles('attachment');
$ocrFile = normalizeUploadedFiles('file');
$files = array_merge($attachments, $singleAttachment, $ocrFile);

if ($action === 'ocr_extract') {
    $ocrApiKey = trim((string)($env['OCR_API_KEY'] ?? ''));
    $ocrBaseUrl = trim((string)($env['OCR_BASE_URL'] ?? 'https://api.ocr.space/parse/image'));
    $ocrLanguage = trim((string)($_POST['language'] ?? 'rus'));
    $ocrFileUrl = trim((string)($_POST['file_url'] ?? ''));

    if (!$files && $ocrFileUrl === '') {
        jsonResponse(400, ['ok' => false, 'error' => 'Файл для OCR не передан']);
    }

    if ($files) {
        $directText = extractTextWithoutOcr($files[0]);
        if ($directText !== '') {
            jsonResponse(200, [
                'ok' => true,
                'text' => $directText,
                'raw' => [
                    'source' => 'direct_text',
                    'extension' => detectFileExtension($files[0])
                ],
            ]);
        }
    }

    if ($ocrApiKey === '') {
        jsonResponse(500, ['ok' => false, 'error' => 'OCR_API_KEY не найден в .env']);
    }

    $ocrUploadFile = $files ? $files[0] : [];
    $ocrUrlUsed = '';
    if (!$ocrUploadFile && $ocrFileUrl !== '') {
        $downloadedFile = downloadRemoteFileForOcr($ocrFileUrl);
        if (is_array($downloadedFile)) {
            $ocrUploadFile = $downloadedFile;
            logApiDocs('info', 'OCR file_url downloaded and sent as multipart file', [
                'url' => $ocrFileUrl,
                'size' => (int)($downloadedFile['size'] ?? 0),
                'name' => (string)($downloadedFile['name'] ?? ''),
            ]);
        } else {
            $ocrUrlUsed = $ocrFileUrl;
            logApiDocs('warn', 'OCR file_url download failed, fallback to OCR url mode', ['url' => $ocrFileUrl]);
        }
    }

    $cleanupRemoteOcrTemp = static function () use ($ocrUploadFile): void {
        if (!is_array($ocrUploadFile) || (($ocrUploadFile['_from_remote_url'] ?? false) !== true)) {
            return;
        }
        $tmpRemoteFile = (string)($ocrUploadFile['tmp_name'] ?? '');
        if ($tmpRemoteFile !== '') {
            @unlink($tmpRemoteFile);
        }
    };

    $ocrResult = performOcrRequest($ocrBaseUrl, $ocrApiKey, $ocrUploadFile, $ocrLanguage !== '' ? $ocrLanguage : 'rus', $ocrUrlUsed !== '' ? $ocrUrlUsed : null);
    $ocrResponseBody = $ocrResult['body'];
    $ocrCurlError = (string)$ocrResult['curl_error'];
    $ocrStatusCode = (int)$ocrResult['status'];

    if ($ocrResponseBody === false) {
        $cleanupRemoteOcrTemp();
        logApiDocs('error', 'OCR request failed', ['curlError' => $ocrCurlError]);
        jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к OCR API: ' . $ocrCurlError]);
    }

    $ocrJson = json_decode((string)$ocrResponseBody, true);
    if (!is_array($ocrJson)) {
        $cleanupRemoteOcrTemp();
        logApiDocs('error', 'OCR API returned non-JSON', ['response' => mb_substr((string)$ocrResponseBody, 0, 500)]);
        jsonResponse(502, ['ok' => false, 'error' => 'Некорректный ответ OCR API']);
    }

    if ($ocrStatusCode >= 400) {
        $cleanupRemoteOcrTemp();
        $message = textFromMixed($ocrJson['ErrorMessage'] ?? '');
        if ($message === '') {
            $message = 'OCR API error';
        }
        jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $ocrStatusCode]);
    }

    $hasErrorOnProcessing = isset($ocrJson['IsErroredOnProcessing']) && $ocrJson['IsErroredOnProcessing'] === true;
    if ($hasErrorOnProcessing) {
        $cleanupRemoteOcrTemp();
        $errorMessage = textFromMixed($ocrJson['ErrorMessage'] ?? '');
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
    $cleanupRemoteOcrTemp();
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
$extractedTexts = deduplicateAndNormalizeExtractedTexts($extractedTexts);
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
    ? $responseStyle
    : (isset($context['responseStyle']) && is_string($context['responseStyle']) ? trim($context['responseStyle']) : '');
$styleInstruction = 'Пиши в официально-деловом стиле.';
$styleExampleInstruction = "Ориентируйся на форму ответа: «В ответ на Ваше письмо от 20.03.2026 г. сообщаем следующее... Работы выполняются в рабочем порядке в рамках утверждённого графика.»";
if ($effectiveStyle === 'aggressive') {
    $styleInstruction = 'Пиши напористо, уверенно и жёстко, но без оскорблений.';
    $styleExampleInstruction = '';
} elseif ($effectiveStyle === 'informational') {
    $styleInstruction = 'Пиши спокойно, нейтрально и максимально информативно.';
} elseif ($effectiveStyle === 'neutral') {
    $styleInstruction = 'Пиши в нейтральном официально-деловом тоне.';
} elseif ($effectiveStyle === 'concise') {
    // Обратная совместимость со старыми значениями
    $styleInstruction = 'Пиши кратко и строго по делу.';
    $styleExampleInstruction = '';
} elseif ($effectiveStyle === 'friendly') {
    // Обратная совместимость со старыми значениями
    $styleInstruction = 'Пиши развёрнуто, дружелюбно и понятно.';
    $styleExampleInstruction = '';
} elseif ($effectiveStyle === 'technical') {
    // Обратная совместимость со старыми значениями
    $styleInstruction = 'Пиши технически, с пояснениями и структурой.';
    $styleExampleInstruction = '';
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

$systemMessage = "Ты помощник по деловой переписке на русском языке. Верни только JSON объект с полями: analysis, decision, decision_reason, risks, required_actions, response. "
  . "Всегда в первую очередь анализируй файлы из user payload: files[*].preview. "
  . "Главный источник текста — user payload: extractedTexts[*].text. "
  . "Если контент файла присутствует, не проси путь или имя файла повторно, а используй этот контент напрямую. "
  . "Если контент пустой, кратко сообщи, что файл не удалось прочитать. "
  . $styleInstruction . ' '
  . ($styleExampleInstruction !== '' ? ($styleExampleInstruction . ' ') : '')
  . $behaviorInstruction . ' Решение decision должно быть строго одним из: approve, reject, need_clarification. Поля risks и required_actions верни массивами строк. '
  . 'При наличии requirements из OCR обязательно опирайся на них и сформируй решение по этим пунктам. '
  . 'Поле response — это только готовый официальный ответ на письмо без служебных фраз, без повторения задания пользователя, без строк "Решение ИИ:", "Причина:", "Действия:".';

$userPayload = [
    'documentTitle' => $documentTitle,
    'prompt' => $prompt,
    'context' => $context,
    'files' => $filesSummary,
    'extractedTexts' => $extractedTexts,
    'requirements' => $requirements,
    'aiRuntime' => $runtimeConfig,
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
    $errorMessage = textFromMixed($responseJson['error']['message'] ?? '');
    if ($errorMessage !== '') {
        $message = $errorMessage;
    }
    logApiDocs('error', 'AI API HTTP error', ['status' => $statusCode, 'message' => $message]);
    $unsupportedRegion = stripos($message, 'Country, region, or territory not supported') !== false;
    if ($statusCode === 403 && $unsupportedRegion) {
        logApiDocs('error', 'AI provider blocked by region, no local fallback in autonomous mode', ['status' => $statusCode]);
        jsonResponse(502, ['ok' => false, 'error' => 'Провайдер ИИ недоступен в вашем регионе. Локальный fallback отключён.', 'status' => $statusCode]);
    }
    jsonResponse(502, ['ok' => false, 'error' => $message, 'status' => $statusCode]);
}

$content = (string)($responseJson['choices'][0]['message']['content'] ?? '');
$parsed = parseAiJson($content);
$decisionBlock = extractDecisionBlock($parsed);

if (!$decisionBlock['valid']) {
    $repairBody = $body;
    $repairBody['messages'][] = ['role' => 'assistant', 'content' => $content];
    $repairBody['messages'][] = [
        'role' => 'user',
        'content' => 'Верни только корректный JSON без пояснений. Обязательные поля: analysis, decision (approve|reject|need_clarification), decision_reason, risks[], required_actions[], response.'
    ];
    $repairResult = performAiRequest($endpoint, $apiKey, $repairBody);
    $repairResponseBody = $repairResult['body'];
    if ($repairResponseBody !== false) {
        $repairJson = json_decode((string)$repairResponseBody, true);
        if (is_array($repairJson)) {
            $repairContent = (string)($repairJson['choices'][0]['message']['content'] ?? '');
            $repairParsed = parseAiJson($repairContent);
            $repairDecision = extractDecisionBlock($repairParsed);
            if ($repairDecision['valid']) {
                $parsed = $repairParsed;
                $content = $repairContent;
                $decisionBlock = $repairDecision;
            }
        }
    }
}
if (!$decisionBlock['valid']) {
    logApiDocs('error', 'AI decision block invalid after repair', [
        'documentTitle' => $documentTitle,
        'promptPreview' => mb_substr($prompt, 0, 180),
    ]);
    jsonResponse(502, ['ok' => false, 'error' => 'ИИ вернул некорректный decision JSON. Повторите запрос.']);
}

$analysis = '';
if (isset($parsed['analysis']) && (is_string($parsed['analysis']) || is_numeric($parsed['analysis']) || is_bool($parsed['analysis']))) {
    $analysis = textFromMixed($parsed['analysis']);
}
$response = sanitizeGeneratedResponse(textFromMixed($parsed['response'] ?? ''), $runtimeConfig['sanitizePrefixes'] ?? []);
$neutral = textFromMixed($parsed['neutral'] ?? '');
$aggressive = textFromMixed($parsed['aggressive'] ?? '');

if ($response === '') {
    $selectedTone = isset($context['selectedTone']) && is_string($context['selectedTone'])
        ? trim($context['selectedTone'])
        : '';
    if (($effectiveStyle === 'aggressive' || $effectiveStyle === 'concise' || $selectedTone === 'aggressive') && $aggressive !== '') {
        $response = sanitizeGeneratedResponse($aggressive, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($neutral !== '') {
        $response = sanitizeGeneratedResponse($neutral, $runtimeConfig['sanitizePrefixes'] ?? []);
    } elseif ($aggressive !== '') {
        $response = sanitizeGeneratedResponse($aggressive, $runtimeConfig['sanitizePrefixes'] ?? []);
    }
}

if ($analysis === '' && $response === '' && $neutral === '' && $aggressive === '') {
    $analysis = 'ИИ вернул ответ в свободной форме.';
    $response = sanitizeGeneratedResponse($content, $runtimeConfig['sanitizePrefixes'] ?? []);
    $neutral = $content;
    $aggressive = $content;
}

if (looksLikeJsonText($response) || $response === '') {
    logApiDocs('error', 'AI returned empty or JSON-like response text', [
        'documentTitle' => $documentTitle,
        'contentPreview' => mb_substr($content, 0, 220),
    ]);
    jsonResponse(502, ['ok' => false, 'error' => 'ИИ вернул пустой/некорректный текст ответа. Повторите запрос.']);
}
$decisionBlock['response'] = $response;
if (!isset($decisionBlock['requirements']) || !is_array($decisionBlock['requirements'])) {
    $decisionBlock['requirements'] = $requirements;
}

if (mb_strlen($analysis) > 1200) {
    $analysis = mb_substr($analysis, 0, 1200) . '…';
}
if (mb_strlen($response) > 8000) {
    $response = mb_substr($response, 0, 8000) . '…';
}

jsonResponse(200, [
    'ok' => true,
    'analysis' => $analysis,
    'response' => $response,
    'neutral' => $neutral,
    'aggressive' => $aggressive,
    'promptStats' => $promptStats,
    'decisionBlock' => [
        'decision' => (string)($decisionBlock['decision'] ?? ''),
        'decision_reason' => (string)($decisionBlock['decision_reason'] ?? ''),
        'risks' => normalizeStringList($decisionBlock['risks'] ?? []),
        'required_actions' => normalizeStringList($decisionBlock['required_actions'] ?? []),
        'requirements' => normalizeStringList($decisionBlock['requirements'] ?? $requirements, 8, 300),
    ],
]);
