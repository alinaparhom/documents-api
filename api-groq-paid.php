<?php

declare(strict_types=1);

/**
 * Гибкий API-обработчик для Groq (paid).
 * Поддерживает маршрутизацию по методам и action.
 * PHP 8.1+
 */

header('Content-Type: application/json; charset=utf-8');

const MAX_TOTAL_UPLOAD_BYTES = 0; // 0 = без ограничения
const MAX_TEXT_CHARS = 0; // 0 = без обрезки
const MAX_TEXT_CHARS_PER_CHUNK = 12000;
const MAX_TEXT_CHUNKS_TOTAL = 30;
const MAX_TEXT_PAYLOAD_CHARS = 90000;
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

function getRuntimeEnv(): array
{
    return array_merge(
        loadEnvFromFile(__DIR__ . '/.env'),
        loadEnvFromFile(__DIR__ . '/app/.env')
    );
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

function normalizeRemoteFilesFromPost(): array
{
    $rawJson = trim((string)($_POST['file_urls'] ?? ''));
    if ($rawJson === '') {
        return [];
    }
    $decoded = json_decode($rawJson, true);
    if (!is_array($decoded)) {
        return [];
    }

    $result = [];
    foreach ($decoded as $index => $item) {
        if (!is_array($item)) {
            continue;
        }
        $url = trim((string)($item['url'] ?? ''));
        if ($url === '' || !preg_match('/^https?:\/\//i', $url)) {
            continue;
        }
        $name = sanitizeFileName((string)($item['name'] ?? ('file-' . ($index + 1))));
        $result[] = [
            'url' => $url,
            'name' => $name !== '' ? $name : ('file-' . ($index + 1)),
            'client_type' => trim((string)($item['type'] ?? '')),
        ];
    }
    return $result;
}

function downloadRemoteFiles(array $remoteFiles): array
{
    $downloaded = [];
    $cleanup = [];

    foreach ($remoteFiles as $file) {
        $url = (string)($file['url'] ?? '');
        if ($url === '') {
            continue;
        }

        $context = stream_context_create([
            'http' => ['method' => 'GET', 'timeout' => 20, 'ignore_errors' => true],
            'https' => ['method' => 'GET', 'timeout' => 20, 'ignore_errors' => true],
        ]);
        $binary = @file_get_contents($url, false, $context);
        if ($binary === false || $binary === '') {
            continue;
        }

        $tmpPath = tempnam(sys_get_temp_dir(), 'groq_remote_');
        if ($tmpPath === false) {
            continue;
        }
        $written = @file_put_contents($tmpPath, $binary);
        if ($written === false || $written <= 0) {
            @unlink($tmpPath);
            continue;
        }

        $cleanup[] = $tmpPath;
        $downloaded[] = [
            'name' => sanitizeFileName((string)($file['name'] ?? 'file')),
            'tmp_name' => $tmpPath,
            'size' => (int)$written,
            'client_type' => (string)($file['client_type'] ?? ''),
        ];
    }

    if ($cleanup) {
        register_shutdown_function(static function () use ($cleanup): void {
            foreach ($cleanup as $path) {
                @unlink((string)$path);
            }
        });
    }

    return $downloaded;
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

function detectFileExtension(string $name): string
{
    $ext = strtolower((string)pathinfo($name, PATHINFO_EXTENSION));
    return trim($ext);
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
    $maxPages = OCR_MAX_PAGES > 0 ? OCR_MAX_PAGES : 500;

    try {
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

function takeChunksByCharBudget(array $chunks, int $maxChars): array
{
    if ($maxChars <= 0) {
        return ['items' => [], 'omitted' => count($chunks), 'usedChars' => 0];
    }

    $selected = [];
    $usedChars = 0;

    foreach ($chunks as $chunk) {
        $text = trim((string)$chunk);
        if ($text === '') {
            continue;
        }
        $chunkLen = mb_strlen($text);
        if ($usedChars > 0 && ($usedChars + 2 + $chunkLen) > $maxChars) {
            break;
        }
        if ($usedChars === 0 && $chunkLen > $maxChars) {
            $selected[] = mb_substr($text, 0, $maxChars);
            $usedChars = mb_strlen((string)$selected[0]);
            break;
        }
        $selected[] = $text;
        $usedChars += ($usedChars > 0 ? 2 : 0) + $chunkLen;
    }

    return [
        'items' => $selected,
        'omitted' => max(0, count($chunks) - count($selected)),
        'usedChars' => $usedChars,
    ];
}

function extractDocxText(string $path): string
{
    if (!class_exists('ZipArchive')) {
        return '';
    }

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        return '';
    }

    try {
        $xml = (string)$zip->getFromName('word/document.xml');
        if ($xml === '') {
            return '';
        }

        $xml = preg_replace('/<w:p[^>]*>/u', "\n", $xml) ?? $xml;
        $xml = preg_replace('/<[^>]+>/u', ' ', $xml) ?? $xml;
        $xml = html_entity_decode($xml, ENT_QUOTES | ENT_XML1, 'UTF-8');

        return cleanExtractedText($xml);
    } finally {
        $zip->close();
    }
}

function extractDocText(string $path): string
{
    if (!commandExists('antiword')) {
        return '';
    }
    $cmd = 'antiword ' . escapeshellarg($path) . ' 2>/dev/null';
    $output = shell_exec($cmd);
    return cleanExtractedText((string)$output);
}

function extractImageTextWithOcr(string $path): string
{
    if (!commandExists('tesseract')) {
        return '';
    }
    $cmd = 'tesseract ' . escapeshellarg($path) . ' stdout -l rus+eng 2>/dev/null';
    $output = shell_exec($cmd);
    return cleanExtractedText((string)$output);
}

function getGroqKey(array $env): string
{
    return trim((string)(getenv('GROQ_API_KEY') ?: ($env['GROQ_API_KEY'] ?? '')));
}

function resolveModel(array $env): string
{
    $model = trim((string)(getenv('AI_MODEL') ?: ($env['AI_MODEL'] ?? MODEL_TEXT_DEFAULT)));
    return $model !== '' ? $model : MODEL_TEXT_DEFAULT;
}

function callGroqChat(array $requestPayload, string $apiKey): array
{
    $ch = curl_init(GROQ_API_URL);
    if ($ch === false) {
        return ['ok' => false, 'status' => 500, 'error' => 'Не удалось инициализировать cURL'];
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
        return ['ok' => false, 'status' => 502, 'error' => 'Ошибка запроса к Groq: ' . $curlErr];
    }

    $decoded = json_decode((string)$rawResponse, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Groq вернул невалидный JSON'];
    }

    if ($httpCode >= 400) {
        $msg = trim((string)($decoded['error']['message'] ?? 'Ошибка Groq API'));
        return ['ok' => false, 'status' => $httpCode, 'error' => $msg, 'raw' => $decoded];
    }

    return ['ok' => true, 'status' => 200, 'raw' => $decoded];
}

function buildExtractedTextsFromFiles(array $files): array
{
    $entries = [];
    $allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    $supportedDocMimes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.ms-word',
        'application/zip',
    ];

    foreach ($files as $file) {
        $name = (string)($file['name'] ?? 'Файл');
        $tmp = (string)($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_file($tmp)) {
            continue;
        }
        $mime = detectMime($tmp, (string)($file['client_type'] ?? ''));
        $ext = detectFileExtension($name);
        $text = '';

        if (str_starts_with($mime, 'text/')) {
            $text = (string)@file_get_contents($tmp);
        } elseif (in_array($mime, $supportedDocMimes, true) && $ext === 'docx') {
            $text = extractDocxText($tmp);
        } elseif (in_array($mime, $supportedDocMimes, true) && $ext === 'doc') {
            $text = extractDocText($tmp);
        } elseif (in_array($mime, $allowedImageMimes, true)) {
            $text = extractImageTextWithOcr($tmp);
        } elseif ($mime === 'application/pdf') {
            $pdfExtract = extractPdfText($tmp);
            $text = (string)($pdfExtract['text'] ?? '');
        }

        $text = cleanExtractedText($text);
        if ($text === '') {
            continue;
        }
        $entries[] = [
            'name' => $name !== '' ? $name : 'Документ',
            'type' => $mime,
            'text' => mb_substr($text, 0, 24000),
        ];
    }

    return $entries;
}

function handleAnalyzePaidAction(array $env): void
{
    $files = normalizeUploadedFiles('files');
    if (!$files) {
        $remoteFiles = normalizeRemoteFilesFromPost();
        if ($remoteFiles) {
            $files = downloadRemoteFiles($remoteFiles);
        }
    }
    if (!$files) {
        respond(422, ['ok' => false, 'error' => 'Файлы не переданы (поле files).']);
    }

    $totalBytes = array_reduce($files, static function (int $sum, array $f): int {
        return $sum + (int)($f['size'] ?? 0);
    }, 0);
    if ($totalBytes <= 0) {
        respond(422, ['ok' => false, 'error' => 'Пустая загрузка файлов.']);
    }
    if (MAX_TOTAL_UPLOAD_BYTES > 0 && $totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        respond(413, ['ok' => false, 'error' => 'Общий размер файлов превышает лимит.']);
    }

    $apiKey = getGroqKey($env);
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
    $supportedDocMimes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.ms-word',
        'application/zip', // иногда docx приходит как zip
    ];

    foreach ($files as $file) {
        $name = (string)$file['name'];
        $size = (int)$file['size'];
        $tmp = (string)$file['tmp_name'];
        $mime = detectMime($tmp, (string)($file['client_type'] ?? ''));
        $ext = detectFileExtension($name);

        $isText = str_starts_with($mime, 'text/');
        $isImage = in_array($mime, $allowedImageMimes, true);
        $isPdf = $mime === 'application/pdf';
        $isDocx = in_array($mime, $supportedDocMimes, true) && $ext === 'docx';
        $isDoc = in_array($mime, $supportedDocMimes, true) && $ext === 'doc';

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

        if ($isDocx) {
            $docxText = extractDocxText($tmp);
            if ($docxText !== '') {
                $chunks = splitTextIntoChunks($docxText);
                foreach ($chunks as $index => $chunk) {
                    $textChunks[] = "[DOCX: {$name}, часть " . ($index + 1) . '/' . count($chunks) . "]\n" . $chunk;
                }
                $metaChunks[] = "[DOCX: {$name}, {$size} байт, чанков: " . count($chunks) . ']';
                $hasReadableContent = true;
            } else {
                $metaChunks[] = "[DOCX: {$name}, {$size} байт, приложен]";
            }
            continue;
        }

        if ($isDoc) {
            $docText = extractDocText($tmp);
            if ($docText !== '') {
                $chunks = splitTextIntoChunks($docText);
                foreach ($chunks as $index => $chunk) {
                    $textChunks[] = "[DOC: {$name}, часть " . ($index + 1) . '/' . count($chunks) . "]\n" . $chunk;
                }
                $metaChunks[] = "[DOC: {$name}, {$size} байт, чанков: " . count($chunks) . ']';
                $hasReadableContent = true;
            } else {
                $metaChunks[] = "[DOC: {$name}, {$size} байт, приложен]";
            }
            continue;
        }

        if ($isImage) {
            $imgText = extractImageTextWithOcr($tmp);
            if ($imgText !== '') {
                $chunks = splitTextIntoChunks($imgText);
                foreach ($chunks as $index => $chunk) {
                    $textChunks[] = "[Изображение OCR: {$name}, часть " . ($index + 1) . '/' . count($chunks) . "]\n" . $chunk;
                }
                $metaChunks[] = "[Изображение: {$name}, {$size} байт, {$mime}, OCR чанков: " . count($chunks) . ']';
                $hasReadableContent = true;
            } else {
                $metaChunks[] = "[Изображение: {$name}, {$size} байт, {$mime}, приложено]";
            }
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
                    $metaChunks[] = "[PDF: {$name}, {$size} байт, приложен]";
                }
                $hasReadableContent = true;
                continue;
            }
            $metaChunks[] = "[PDF: {$name}, {$size} байт, приложен]";
            continue;
        }

        $metaChunks[] = "[Неподдерживаемый формат: {$name}, {$size} байт, MIME={$mime}]";
    }

    $limitedContextNotice = '';
    if (!$hasReadableContent) {
        $limitedContextNotice = '⚠️ Вложенные файлы могут быть сканами без извлекаемого текста. '
            . 'Не отклоняй запрос и не пиши про невозможность обработки/OCR. '
            . 'Сформируй готовый нейтральный ответ на письмо по запросу пользователя и доступным данным.';
    }

    $model = resolveModel($env);
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
        . "- Никогда не пиши про OCR, технические ограничения, ошибки чтения файла или невозможность извлечения текста.\n"
        . "- Если часть вложений нечитаема, всё равно дай практичное решение по доступным данным, без технических пояснений.\n"
        . "- Ответ должен быть готов к вставке в документ как основное содержание.\n\n";

    $textPayload = $userPrompt;
    if ($limitedContextNotice !== '') {
        $textPayload .= "\n\n" . $limitedContextNotice;
    }

    $reservedForMeta = $metaChunks ? 12000 : 0;
    $payloadBaseLen = mb_strlen($textPayload);
    $textBudget = max(0, MAX_TEXT_PAYLOAD_CHARS - $payloadBaseLen - $reservedForMeta);
    if ($textChunks) {
        $limitedChunks = takeChunksByCharBudget($textChunks, $textBudget);
        $selectedTextChunks = $limitedChunks['items'];
        if ($selectedTextChunks) {
            $textPayload .= "\n\nТекстовые файлы:\n" . implode("\n\n", $selectedTextChunks);
        }
        if (($limitedChunks['omitted'] ?? 0) > 0) {
            $textPayload .= "\n\n[Контекст ограничен: пропущено частей текста: " . (int)$limitedChunks['omitted'] . ']';
        }
    }
    if ($metaChunks) {
        $metaText = "Сводка файлов:\n" . implode("\n", $metaChunks);
        $metaBudget = max(0, MAX_TEXT_PAYLOAD_CHARS - mb_strlen($textPayload) - 2);
        if ($metaBudget > 0) {
            if (mb_strlen($metaText) > $metaBudget) {
                $metaText = mb_substr($metaText, 0, $metaBudget);
            }
            $textPayload .= "\n\n" . $metaText;
        }
    }

    $requestPayload = [
        'model' => $model,
        'temperature' => 0.2,
        'max_tokens' => 1800,
        'messages' => [
            ['role' => 'system', 'content' => $systemMessagePaid],
            ['role' => 'user', 'content' => $textPayload],
        ],
    ];

    $groqResult = callGroqChat($requestPayload, $apiKey);
    if (($groqResult['ok'] ?? false) !== true) {
        respond((int)($groqResult['status'] ?? 502), ['ok' => false, 'error' => (string)($groqResult['error'] ?? 'Ошибка Groq API')]);
    }

    $decoded = (array)($groqResult['raw'] ?? []);
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
}

function handleGenerateSummaryAction(array $env): void
{
    $apiKey = getGroqKey($env);
    if ($apiKey === '') {
        respond(500, ['ok' => false, 'error' => 'Не найден GROQ_API_KEY в окружении или .env']);
    }

    $rawExtractedTexts = (string)($_POST['extractedTexts'] ?? '');
    $decodedExtractedTexts = json_decode($rawExtractedTexts, true);
    if (!is_array($decodedExtractedTexts)) {
        $decodedExtractedTexts = [];
    }
    $uploadedFiles = array_merge(
        normalizeUploadedFiles('files'),
        normalizeUploadedFiles('file'),
        normalizeUploadedFiles('attachments')
    );
    if (!$decodedExtractedTexts && $uploadedFiles) {
        $decodedExtractedTexts = buildExtractedTextsFromFiles($uploadedFiles);
    }
    if (!is_array($decodedExtractedTexts) || !$decodedExtractedTexts) {
        respond(422, ['ok' => false, 'error' => 'Передайте extractedTexts или файлы (files[]) для формирования summary.']);
    }

    $summaryParts = [];
    $summaryChunks = [];
    foreach ($decodedExtractedTexts as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $text = trim((string)($entry['text'] ?? ''));
        if ($text === '') {
            continue;
        }
        $name = trim((string)($entry['name'] ?? 'Документ'));
        $safeName = $name !== '' ? $name : 'Документ';
        $summaryParts[] = '[' . $safeName . "]\n" . $text;
        $chunks = splitTextIntoChunks($text);
        foreach ($chunks as $chunkText) {
            $chunkText = trim((string)$chunkText);
            if ($chunkText === '') {
                continue;
            }
            $summaryChunks[] = '[' . $safeName . "]\n" . $chunkText;
        }
    }
    $fullText = trim(implode("\n\n", $summaryParts));
    if ($fullText === '') {
        respond(422, ['ok' => false, 'error' => 'Текст документов пустой, summary сформировать невозможно.']);
    }
    if (!$summaryChunks) {
        $summaryChunks = splitTextIntoChunks($fullText);
    }

    $model = resolveModel($env);
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

    $startedAt = microtime(true);
    $summarySegments = [];
    $chunkBudget = max(5000, (int)(MAX_TEXT_PAYLOAD_CHARS * 0.6));
    $limitedChunks = takeChunksByCharBudget($summaryChunks, $chunkBudget);
    $chunksToProcess = $limitedChunks['items'] ?? [];
    if (!$chunksToProcess) {
        $chunksToProcess = [mb_substr($fullText, 0, 6000)];
    }
    foreach ($chunksToProcess as $chunkIndex => $chunkText) {
        $requestPayload = [
            'model' => $model,
            'temperature' => 0.2,
            'max_tokens' => 420,
            'top_p' => 0.85,
            'messages' => [
                ['role' => 'system', 'content' => $summarySystemMessage],
                ['role' => 'user', 'content' => "Сделай краткое содержание части документа №" . ($chunkIndex + 1) . ":\n\n" . $chunkText],
            ],
        ];
        $groqResult = callGroqChat($requestPayload, $apiKey);
        if (($groqResult['ok'] ?? false) !== true) {
            respond((int)($groqResult['status'] ?? 502), ['ok' => false, 'error' => (string)($groqResult['error'] ?? 'Ошибка Groq API')]);
        }
        $decodedChunk = (array)($groqResult['raw'] ?? []);
        $chunkSummary = trim((string)($decodedChunk['choices'][0]['message']['content'] ?? ''));
        if ($chunkSummary !== '') {
            $summarySegments[] = $chunkSummary;
        }
    }

    if (!$summarySegments) {
        respond(502, ['ok' => false, 'error' => 'Пустой summary от Groq']);
    }

    $mergedSegments = implode("\n\n", $summarySegments);
    $finalInput = "Собери единое итоговое краткое содержание из промежуточных резюме:\n\n" . $mergedSegments;
    if (($limitedChunks['omitted'] ?? 0) > 0) {
        $finalInput .= "\n\n[Контекст ограничен: пропущено частей: " . (int)$limitedChunks['omitted'] . ']';
    }
    $finalPayload = [
        'model' => $model,
        'temperature' => 0.2,
        'max_tokens' => 800,
        'top_p' => 0.85,
        'messages' => [
            ['role' => 'system', 'content' => $summarySystemMessage],
            ['role' => 'user', 'content' => $finalInput],
        ],
    ];
    $groqResult = callGroqChat($finalPayload, $apiKey);
    if (($groqResult['ok'] ?? false) !== true) {
        respond((int)($groqResult['status'] ?? 502), ['ok' => false, 'error' => (string)($groqResult['error'] ?? 'Ошибка Groq API')]);
    }

    $decoded = (array)($groqResult['raw'] ?? []);
    $summary = trim((string)($decoded['choices'][0]['message']['content'] ?? ''));
    if ($summary === '') {
        respond(502, ['ok' => false, 'error' => 'Пустой summary от Groq']);
    }

    respond(200, [
        'ok' => true,
        'summary' => $summary,
        'model' => (string)($decoded['model'] ?? $model),
        'durationMs' => max(1, (int)round((microtime(true) - $startedAt) * 1000)),
        'tokensUsed' => (int)($decoded['usage']['total_tokens'] ?? 0),
    ]);
}

function handleGetRequest(array $env): void
{
    $action = trim((string)($_GET['action'] ?? ''));
    if ($action === 'health' || $action === 'ping') {
        respond(200, [
            'ok' => true,
            'message' => 'pong',
            'apiKeyConfigured' => getGroqKey($env) !== '',
            'model' => resolveModel($env),
            'actions' => ['analyze_paid', 'generate_summary'],
        ]);
    }

    respond(200, [
        'ok' => true,
        'message' => 'API доступен. Для обработки документов используйте POST action=analyze_paid и files[].',
        'method' => 'POST',
        'defaultAction' => 'analyze_paid',
        'availablePostActions' => ['analyze_paid', 'generate_summary'],
        'availableGetActions' => ['health', 'ping'],
    ]);
}

function handlePostRequest(array $env): void
{
    $action = trim((string)($_POST['action'] ?? 'analyze_paid'));
    if ($action === '') {
        $action = 'analyze_paid';
    }

    $handlers = [
        'analyze_paid' => static function (array $currentEnv): void {
            handleAnalyzePaidAction($currentEnv);
        },
        'generate_summary' => static function (array $currentEnv): void {
            handleGenerateSummaryAction($currentEnv);
        },
    ];

    if (!isset($handlers[$action])) {
        respond(422, [
            'ok' => false,
            'error' => 'Неизвестный action.',
            'provided' => $action,
            'available' => array_keys($handlers),
        ]);
    }

    $handlers[$action]($env);
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$env = getRuntimeEnv();

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method === 'GET') {
    handleGetRequest($env);
}
if ($method === 'POST') {
    handlePostRequest($env);
}

respond(405, [
    'ok' => false,
    'error' => 'Method Not Allowed',
    'allowed' => ['GET', 'POST', 'OPTIONS'],
]);
