<?php

declare(strict_types=1);

/**
 * Универсальный обработчик файлов для Groq API.
 * PHP 8.1+
 */

header('Content-Type: application/json; charset=utf-8');

const MAX_TOTAL_UPLOAD_BYTES = 0; // 0 = без ограничения
const MAX_TEXT_CHARS = 0; // 0 = без обрезки
const MAX_TEXT_CHARS_PER_CHUNK = 12000;
const MAX_TEXT_CHUNKS_TOTAL = 30;
const OCR_MAX_PAGES = 0; // 0 = все страницы PDF
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_TEXT_DEFAULT = 'llama-3.1-8b-instant';

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
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field])) {
        return [];
    }
    $raw = $_FILES[$field];
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

function normalizeSelectedFilesFromPost(string $field): array
{
    $raw = trim((string)($_POST[$field] ?? ''));
    if ($raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    $result = [];
    foreach ($decoded as $item) {
        if (!is_array($item)) {
            continue;
        }
        $url = trim((string)($item['url'] ?? ''));
        if ($url === '') {
            continue;
        }
        if (!preg_match('#^https?://#i', $url)) {
            $isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off');
            $scheme = $isHttps ? 'https' : 'http';
            $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
            if ($host !== '' && str_starts_with($url, '/')) {
                $url = $scheme . '://' . $host . $url;
            }
        }
        if (!preg_match('#^https?://#i', $url)) {
            continue;
        }
        $result[] = [
            'name' => sanitizeFileName((string)($item['name'] ?? 'file')),
            'url' => $url,
            'client_type' => trim((string)($item['type'] ?? '')),
            'size' => (int)($item['size'] ?? 0),
        ];
    }
    return $result;
}

function downloadSelectedFileToTemp(array $selected, string $cookieHeader = ''): ?array
{
    $url = (string)($selected['url'] ?? '');
    if ($url === '') {
        return null;
    }
    $tmpPath = tempnam(sys_get_temp_dir(), 'paid_ai_');
    if ($tmpPath === false) {
        return null;
    }

    $fp = @fopen($tmpPath, 'wb');
    if ($fp === false) {
        @unlink($tmpPath);
        return null;
    }

    $ch = curl_init($url);
    if ($ch === false) {
        fclose($fp);
        @unlink($tmpPath);
        return null;
    }

    $headers = [];
    if ($cookieHeader !== '') {
        $headers[] = 'Cookie: ' . $cookieHeader;
    }

    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 40,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'documents-paid-ai/1.0',
        CURLOPT_HTTPHEADER => $headers,
    ]);
    $ok = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $ctype = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    fclose($fp);

    if ($ok === false || $status < 200 || $status >= 300 || !is_file($tmpPath)) {
        @unlink($tmpPath);
        return null;
    }

    $size = (int)@filesize($tmpPath);
    if ($size <= 0) {
        @unlink($tmpPath);
        return null;
    }

    return [
        'name' => sanitizeFileName((string)($selected['name'] ?? 'file')),
        'tmp_name' => $tmpPath,
        'size' => $size,
        'client_type' => $ctype !== '' ? $ctype : (string)($selected['client_type'] ?? ''),
    ];
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

function commandExists(string $command): bool
{
    $output = [];
    $exitCode = 1;
    @exec('command -v ' . escapeshellarg($command) . ' 2>/dev/null', $output, $exitCode);
    return $exitCode === 0 && !empty($output);
}

function extractPdfTextWithPdftotext(string $pdfPath): string
{
    if (!commandExists('pdftotext')) {
        return '';
    }
    $tmpTextPath = tempnam(sys_get_temp_dir(), 'pdftext_');
    if ($tmpTextPath === false) {
        return '';
    }
    try {
        $cmd = 'pdftotext -enc UTF-8 -f 1 '
            . (OCR_MAX_PAGES > 0 ? ('-l ' . OCR_MAX_PAGES . ' ') : '')
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

function extractPdfTextWithOcr(string $pdfPath): string
{
    if (!commandExists('pdftoppm') || !commandExists('tesseract')) {
        return '';
    }
    $tmpBase = tempnam(sys_get_temp_dir(), 'pdfocr_');
    if ($tmpBase === false) {
        return '';
    }
    @unlink($tmpBase);
    $textParts = [];
    try {
        $maxPages = OCR_MAX_PAGES > 0 ? OCR_MAX_PAGES : 500;
        for ($page = 1; $page <= $maxPages; $page += 1) {
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
            $cmdOcr = 'tesseract ' . escapeshellarg($jpgPath) . ' stdout -l rus+eng 2>/dev/null';
            $ocr = shell_exec($cmdOcr);
            $ocrText = trim((string)$ocr);
            if ($ocrText !== '') {
                $textParts[] = $ocrText;
            }
            @unlink($jpgPath);
        }
    } finally {
        for ($page = 1; $page <= $maxPages; $page += 1) {
            @unlink($tmpBase . '-p' . $page . '.jpg');
        }
    }

    return trim(implode("\n\n", $textParts));
}

function extractPdfText(string $pdfPath): array
{
    $text = extractPdfTextWithPdftotext($pdfPath);
    if ($text !== '') {
        return ['text' => $text, 'source' => 'pdftotext'];
    }
    $ocrText = extractPdfTextWithOcr($pdfPath);
    if ($ocrText !== '') {
        return ['text' => $ocrText, 'source' => 'ocr'];
    }
    return ['text' => '', 'source' => ''];
}

function cleanExtractedText(string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
    $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?? $text;
    $text = trim($text);
    if ($text === '') {
        return '';
    }
    if (MAX_TEXT_CHARS > 0) {
        return trim(mb_substr($text, 0, MAX_TEXT_CHARS));
    }
    return $text;
}

function splitTextIntoChunks(string $text, int $maxChunkChars = MAX_TEXT_CHARS_PER_CHUNK): array
{
    $text = cleanExtractedText($text);
    if ($text === '') {
        return [];
    }

    if (mb_strlen($text) <= $maxChunkChars) {
        return [$text];
    }

    $paragraphs = preg_split("/\n{2,}/u", $text) ?: [$text];
    $chunks = [];
    $current = '';

    foreach ($paragraphs as $paragraph) {
        $paragraph = trim((string)$paragraph);
        if ($paragraph === '') {
            continue;
        }
        $candidate = $current === '' ? $paragraph : ($current . "\n\n" . $paragraph);
        if (mb_strlen($candidate) <= $maxChunkChars) {
            $current = $candidate;
            continue;
        }
        if ($current !== '') {
            $chunks[] = $current;
            $current = '';
            if (count($chunks) >= MAX_TEXT_CHUNKS_TOTAL) {
                return $chunks;
            }
        }
        if (mb_strlen($paragraph) <= $maxChunkChars) {
            $current = $paragraph;
            continue;
        }

        $offset = 0;
        $paragraphLen = mb_strlen($paragraph);
        while ($offset < $paragraphLen) {
            $part = mb_substr($paragraph, $offset, $maxChunkChars);
            $part = trim((string)$part);
            if ($part !== '') {
                $chunks[] = $part;
                if (count($chunks) >= MAX_TEXT_CHUNKS_TOTAL) {
                    return $chunks;
                }
            }
            $offset += $maxChunkChars;
        }
    }

    if ($current !== '' && count($chunks) < MAX_TEXT_CHUNKS_TOTAL) {
        $chunks[] = $current;
    }

    return array_slice($chunks, 0, MAX_TEXT_CHUNKS_TOTAL);
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
$tempFilesToDelete = [];
register_shutdown_function(static function () use (&$tempFilesToDelete): void {
    foreach ($tempFilesToDelete as $tmpFile) {
        if (is_string($tmpFile) && $tmpFile !== '') {
            @unlink($tmpFile);
        }
    }
});
if (!$files) {
    $selectedFiles = normalizeSelectedFilesFromPost('selectedFiles');
    $cookieHeader = trim((string)($_SERVER['HTTP_COOKIE'] ?? ''));
    foreach ($selectedFiles as $selectedFile) {
        $downloaded = downloadSelectedFileToTemp($selectedFile, $cookieHeader);
        if (!$downloaded) {
            continue;
        }
        $files[] = $downloaded;
        $tempFilesToDelete[] = (string)$downloaded['tmp_name'];
    }
}
if (!$files) {
    respond(422, ['ok' => false, 'error' => 'Файлы не переданы. Выберите файлы и попробуйте снова.']);
}

$totalBytes = array_reduce($files, static function (int $sum, array $f): int {
    return $sum + (int)($f['size'] ?? 0);
}, 0);
if ($totalBytes <= 0) {
    respond(422, ['ok' => false, 'error' => 'Пустая загрузка файлов.']);
}
if (MAX_TOTAL_UPLOAD_BYTES > 0 && $totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    respond(413, ['ok' => false, 'error' => 'Общий размер файлов превышает 20 МБ.']);
}

$env = array_merge(
    loadEnvFromFile(__DIR__ . '/.env'),
    loadEnvFromFile(__DIR__ . '/app/.env')
);
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
$hasReadableContent = false;

$allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

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
        $chunks = splitTextIntoChunks($raw);
        if ($chunks) {
            foreach ($chunks as $index => $chunk) {
                $textChunks[] = "[Файл: {$name}, часть " . ($index + 1) . '/' . count($chunks) . "]\n" . $chunk;
            }
            $metaChunks[] = "[Текст: {$name}, чанков: " . count($chunks) . ']';
            $hasReadableContent = true;
        }
        continue;
    }

    if ($isImage) {
        $metaChunks[] = "[Изображение: {$name}, {$size} байт, {$mime}]";
        continue;
    }

    if ($isPdf) {
        $pdfExtract = extractPdfText($tmp);
        $pdfText = trim((string)($pdfExtract['text'] ?? ''));
        $pdfSource = (string)($pdfExtract['source'] ?? '');
        if ($pdfText !== '') {
            $chunks = splitTextIntoChunks($pdfText);
            if ($chunks) {
                foreach ($chunks as $index => $chunk) {
                    $textChunks[] = "[PDF: {$name}, часть " . ($index + 1) . '/' . count($chunks) . "]\n" . $chunk;
                }
                $metaChunks[] = $pdfSource === 'ocr'
                    ? "[PDF: {$name}, {$size} байт, OCR, чанков: " . count($chunks) . ']'
                    : "[PDF: {$name}, {$size} байт, текстовый слой, чанков: " . count($chunks) . ']';
            } else {
                $metaChunks[] = "[PDF: {$name}, {$size} байт, текст не извлечен]";
            }
            $hasReadableContent = true;
            continue;
        }
        $metaChunks[] = "[PDF: {$name}, {$size} байт, текст не извлечен]";
        continue;
    }

    // Неподдерживаемый формат: только метаданные.
    $metaChunks[] = "[Неподдерживаемый формат: {$name}, {$size} байт, MIME={$mime}]";
}

if (!$hasReadableContent) {
    respond(422, [
        'ok' => false,
        'error' => 'Недостаточно данных для решения. Нужны документы с распознанным текстом (TXT/PDF с текстовым слоем) или более качественный скан.',
    ]);
}

$model = trim((string)(getenv('AI_MODEL') ?: ($env['AI_MODEL'] ?? MODEL_TEXT_DEFAULT)));
if ($model === '') {
    $model = MODEL_TEXT_DEFAULT;
}
$systemMessagePaid = "Ты — сотрудник строительной компании, отвечающий за официальную переписку.\n\n"
    . "Твоя задача: на основе предоставленных документов сформулировать ответ в деловом стиле.\n\n"
    . "Правила:\n"
    . "- Не добавляй шапку (кому, от кого), не добавляй подпись.\n"
    . "- Не пересказывай документ дословно.\n"
    . "- Выдели суть: что требуется, какие факты, какие решения.\n"
    . "- Дай чёткий ответ: согласие/отказ/уточнение, сроки, действия.\n"
    . "- Если есть претензии — либо прими с обоснованием, либо отклони с аргументацией.\n"
    . "- Используй деловой язык, без воды, без эмодзи.\n"
    . "- Если недостаточно информации — укажи, какие данные нужны.\n"
    . "- Ответ должен быть готов к вставке в документ как основное содержание.\n\n";

$textPayload = $userPrompt;
if ($textChunks) {
    $textPayload .= "\n\nТекстовые файлы:\n" . implode("\n\n", $textChunks);
}
if ($metaChunks) {
    $textPayload .= "\n\nСводка файлов:\n" . implode("\n", $metaChunks);
}

$messages = [
    ['role' => 'system', 'content' => $systemMessagePaid],
    ['role' => 'user', 'content' => $textPayload],
];

$requestPayload = [
    'model' => $model,
    'temperature' => 0.2,
    'max_tokens' => 1800,
    'messages' => $messages,
];

$ch = curl_init(GROQ_API_URL);
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
