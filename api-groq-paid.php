<?php

declare(strict_types=1);

/**
 * Универсальный обработчик файлов для Groq API.
 * PHP 8.1+
 */

header('Content-Type: application/json; charset=utf-8');

const MAX_TOTAL_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_TEXT_CHARS = 10000;

function respond(int $status, array $payload): void
{
    http_response_code($status);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    echo $json === false ? '{"ok":false,"error":"JSON_ENCODE_FAILED"}' : $json;
    exit;
}

function loadEnvFromFile(string $path): array
{
    $env = [];
    if (!is_file($path)) {
        return $env;
    }
    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return $env;
    }
    foreach ($lines as $line) {
        $line = trim((string)$line);
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
    return $env;
}

function sanitizeFileName(string $name): string
{
    $name = preg_replace('/[^a-zA-Zа-яА-Я0-9._-]/u', '_', $name) ?? 'file';
    $name = trim($name, '._- ');
    return $name !== '' ? $name : 'file';
}

function normalizeUploadedFiles(string $field): array
{
    $raw = $_FILES[$field] ?? $_FILES[$field . '[]'] ?? null;
    if (!is_array($raw)) {
        return [];
    }
    if (!isset($raw['name'])) {
        return [];
    }

    $out = [];
    if (is_array($raw['name'])) {
        $count = count($raw['name']);
        for ($i = 0; $i < $count; $i += 1) {
            if ((int)($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                continue;
            }
            $tmp = (string)($raw['tmp_name'][$i] ?? '');
            if ($tmp === '' || !is_uploaded_file($tmp)) {
                continue;
            }
            $out[] = [
                'name' => sanitizeFileName((string)($raw['name'][$i] ?? 'file')),
                'tmp_name' => $tmp,
                'size' => (int)($raw['size'][$i] ?? 0),
                'client_type' => (string)($raw['type'][$i] ?? ''),
            ];
        }
        return $out;
    }

    if ((int)($raw['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $tmp = (string)($raw['tmp_name'] ?? '');
        if ($tmp !== '' && is_uploaded_file($tmp)) {
            $out[] = [
                'name' => sanitizeFileName((string)($raw['name'] ?? 'file')),
                'tmp_name' => $tmp,
                'size' => (int)($raw['size'] ?? 0),
                'client_type' => (string)($raw['type'] ?? ''),
            ];
        }
    }

    return $out;
}

function detectMime(string $path, string $fallback = ''): string
{
    $mime = '';
    if (class_exists('finfo')) {
        $f = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)($f->file($path) ?: '');
    }
    if ($mime === '') {
        $mime = strtolower(trim($fallback));
    }
    return strtolower(trim($mime));
}

function makeDataUriFromBinary(string $binary, string $mime): string
{
    return 'data:' . $mime . ';base64,' . base64_encode($binary);
}

function normalizeFloatEnv(mixed $value, float $default, float $min, float $max): float
{
    if (is_string($value)) {
        $value = trim($value);
    }
    if ($value === '' || $value === null || !is_numeric($value)) {
        return $default;
    }
    $number = (float)$value;
    if ($number < $min) {
        return $min;
    }
    if ($number > $max) {
        return $max;
    }
    return $number;
}

function normalizeIntEnv(mixed $value, int $default, int $min, int $max): int
{
    if (is_string($value)) {
        $value = trim($value);
    }
    if ($value === '' || $value === null || !is_numeric($value)) {
        return $default;
    }
    $number = (int)$value;
    if ($number < $min) {
        return $min;
    }
    if ($number > $max) {
        return $max;
    }
    return $number;
}

function resolveGroqPaidConfig(array $env): array
{
    $apiUrl = trim((string)($env['AI_PAID_API_URL'] ?? $env['GROQ_API_URL'] ?? 'https://api.groq.com/openai/v1/chat/completions'));
    if ($apiUrl === '') {
        $apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    }

    $textModel = trim((string)($env['AI_MODEL_PAID_TEXT'] ?? $env['GROQ_MODEL_TEXT'] ?? $env['AI_MODEL_PAID'] ?? 'llama-3.3-70b-versatile'));
    $visionModel = trim((string)($env['AI_MODEL_PAID_VISION'] ?? $env['GROQ_MODEL_VISION'] ?? $env['AI_MODEL_PAID'] ?? 'meta-llama/llama-4-scout-17b-16e-instruct'));
    $systemPrompt = trim((string)($env['AI_PAID_SYSTEM_PROMPT'] ?? ''));
    if ($systemPrompt === '') {
        $systemPrompt = 'Ты помощник по деловым документам. Проанализируй приложенные файлы. Прими итоговое решение. Ответь только решением, без пояснений, шапки и подписей.';
    }

    return [
        'apiUrl' => $apiUrl,
        'textModel' => $textModel,
        'visionModel' => $visionModel,
        'temperature' => normalizeFloatEnv($env['AI_PAID_TEMPERATURE'] ?? 0.2, 0.2, 0.0, 2.0),
        'maxTokens' => normalizeIntEnv($env['AI_PAID_MAX_TOKENS'] ?? 900, 900, 128, 8192),
        'systemPrompt' => $systemPrompt,
    ];
}

/**
 * PDF -> JPEG (первая страница).
 * Порядок: Imagick -> pdftoppm -> gs
 */
function convertPdfFirstPageToJpegDataUri(string $pdfPath): ?string
{
    // 1) Imagick
    if (class_exists('Imagick')) {
        try {
            $im = new Imagick();
            $im->setResolution(180, 180);
            $im->readImage($pdfPath . '[0]');
            $im->setImageFormat('jpeg');
            $jpeg = $im->getImageBlob();
            $im->clear();
            $im->destroy();
            if ($jpeg !== '') {
                return makeDataUriFromBinary($jpeg, 'image/jpeg');
            }
        } catch (Throwable $e) {
            // fallback below
        }
    }

    $tmpBase = tempnam(sys_get_temp_dir(), 'pdfimg_');
    if ($tmpBase === false) {
        return null;
    }
    @unlink($tmpBase);

    $jpgFromPpm = $tmpBase . '.jpg';
    $jpgFromGs = $tmpBase . '-gs.jpg';

    try {
        // 2) pdftoppm
        $cmdPpm = 'pdftoppm -jpeg -f 1 -singlefile ' . escapeshellarg($pdfPath) . ' ' . escapeshellarg($tmpBase);
        @exec($cmdPpm, $outPpm, $codePpm);
        if ($codePpm === 0 && is_file($jpgFromPpm)) {
            $bin = (string)@file_get_contents($jpgFromPpm);
            if ($bin !== '') {
                return makeDataUriFromBinary($bin, 'image/jpeg');
            }
        }

        // 3) ghostscript
        $cmdGs = 'gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 -r180 '
            . '-sOutputFile=' . escapeshellarg($jpgFromGs) . ' ' . escapeshellarg($pdfPath);
        @exec($cmdGs, $outGs, $codeGs);
        if ($codeGs === 0 && is_file($jpgFromGs)) {
            $bin = (string)@file_get_contents($jpgFromGs);
            if ($bin !== '') {
                return makeDataUriFromBinary($bin, 'image/jpeg');
            }
        }
    } finally {
        @unlink($jpgFromPpm);
        @unlink($jpgFromGs);
    }

    return null;
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Method Not Allowed']);
}

$files = normalizeUploadedFiles('files');
if (!$files) {
    respond(422, ['ok' => false, 'error' => 'Файлы не переданы (поле files).']);
}

$totalBytes = array_reduce($files, static function (int $sum, array $f): int {
    return $sum + (int)($f['size'] ?? 0);
}, 0);
if ($totalBytes <= 0) {
    respond(422, ['ok' => false, 'error' => 'Пустая загрузка файлов.']);
}
if ($totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    respond(413, ['ok' => false, 'error' => 'Общий размер файлов превышает 20 МБ.']);
}

$env = array_merge(
    loadEnvFromFile(__DIR__ . '/.env'),
    loadEnvFromFile(__DIR__ . '/app/.env')
);
$paidConfig = resolveGroqPaidConfig($env);
$apiKey = trim((string)(getenv('GROQ_API_KEY') ?: ($env['GROQ_API_KEY'] ?? '')));
if ($apiKey === '') {
    respond(500, ['ok' => false, 'error' => 'Не найден GROQ_API_KEY в окружении или .env']);
}

$userPrompt = trim((string)($_POST['prompt'] ?? ''));
if ($userPrompt === '') {
    $userPrompt = 'Прими решение по приложенным документам.';
}

$textChunks = [];
$metaChunks = [];
$visionImages = [];
$hasVisionInput = false;

$allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];

foreach ($files as $file) {
    $name = (string)$file['name'];
    $size = (int)$file['size'];
    $tmp = (string)$file['tmp_name'];
    $mime = detectMime($tmp, (string)($file['client_type'] ?? ''));

    // Дополнительная безопасность: ограничиваем обработку только безопасными типами.
    $isText = str_starts_with($mime, 'text/');
    $isImage = in_array($mime, $allowedImageMimes, true);
    $isPdf = $mime === 'application/pdf';

    if ($isText) {
        $raw = (string)@file_get_contents($tmp);
        $normalized = trim(mb_substr($raw, 0, MAX_TEXT_CHARS));
        $textChunks[] = "[Файл: {$name}]\n" . ($normalized !== '' ? $normalized : '[пустой текст]');
        continue;
    }

    if ($isImage) {
        $raw = (string)@file_get_contents($tmp);
        if ($raw !== '') {
            $visionImages[] = makeDataUriFromBinary($raw, $mime);
            $hasVisionInput = true;
            $metaChunks[] = "[Изображение: {$name}, {$size} байт, {$mime}]";
            continue;
        }
    }

    if ($isPdf) {
        $jpegDataUri = convertPdfFirstPageToJpegDataUri($tmp);
        if ($jpegDataUri !== null) {
            $visionImages[] = $jpegDataUri;
            $hasVisionInput = true;
            $metaChunks[] = "[PDF: {$name}, {$size} байт, первая страница преобразована в JPEG]";
            continue;
        }
        $metaChunks[] = "[PDF: {$name}, {$size} байт, ошибка конвертации]";
        continue;
    }

    // Неподдерживаемый формат: только метаданные.
    $metaChunks[] = "[Неподдерживаемый формат: {$name}, {$size} байт, MIME={$mime}]";
}

$model = $hasVisionInput ? (string)$paidConfig['visionModel'] : (string)$paidConfig['textModel'];
$systemPrompt = (string)$paidConfig['systemPrompt'];

if ($hasVisionInput) {
    $visionText = $userPrompt;
    if ($textChunks) {
        $visionText .= "\n\nТекстовые файлы:\n" . implode("\n\n", $textChunks);
    }
    if ($metaChunks) {
        $visionText .= "\n\nСводка файлов:\n" . implode("\n", $metaChunks);
    }

    $content = [
        ['type' => 'text', 'text' => $visionText],
    ];
    foreach ($visionImages as $dataUri) {
        $content[] = [
            'type' => 'image_url',
            'image_url' => ['url' => $dataUri],
        ];
    }

    $messages = [
        ['role' => 'system', 'content' => $systemPrompt],
        ['role' => 'user', 'content' => $content],
    ];
} else {
    $textPayload = $userPrompt;
    if ($textChunks) {
        $textPayload .= "\n\nТекстовые файлы:\n" . implode("\n\n", $textChunks);
    }
    if ($metaChunks) {
        $textPayload .= "\n\nСводка файлов:\n" . implode("\n", $metaChunks);
    }

    $messages = [
        ['role' => 'system', 'content' => $systemPrompt],
        ['role' => 'user', 'content' => $textPayload],
    ];
}

$requestPayload = [
    'model' => $model,
    'temperature' => (float)$paidConfig['temperature'],
    'max_tokens' => (int)$paidConfig['maxTokens'],
    'messages' => $messages,
];

$ch = curl_init((string)$paidConfig['apiUrl']);
if ($ch === false) {
    respond(500, ['ok' => false, 'error' => 'Не удалось инициализировать cURL']);
}

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_TIMEOUT => 90,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($requestPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
]);

$rawResponse = curl_exec($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($rawResponse === false) {
    respond(502, ['ok' => false, 'error' => 'Ошибка запроса к Groq: ' . $curlErr]);
}

$decoded = json_decode((string)$rawResponse, true);
if (!is_array($decoded)) {
    respond(502, ['ok' => false, 'error' => 'Groq вернул невалидный JSON']);
}

if ($httpCode >= 400) {
    $msg = trim((string)($decoded['error']['message'] ?? 'Ошибка Groq API'));
    respond($httpCode, ['ok' => false, 'error' => $msg]);
}

$answer = trim((string)($decoded['choices'][0]['message']['content'] ?? ''));
if ($answer === '') {
    respond(502, ['ok' => false, 'error' => 'Пустой ответ от Groq']);
}

respond(200, [
    'ok' => true,
    'response' => $answer,
    'model' => (string)($decoded['model'] ?? $model),
    'tokensUsed' => (int)($decoded['usage']['total_tokens'] ?? 0),
]);
