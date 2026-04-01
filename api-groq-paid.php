<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        $json = '{"ok":false,"error":"JSON_ENCODE_FAILED"}';
    }
    echo $json;
    exit;
}

function loadEnv(array $paths): array
{
    $env = [];
    foreach ($paths as $path) {
        if (!is_file($path)) {
            continue;
        }
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            continue;
        }
        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $eqPos = strpos($line, '=');
            if ($eqPos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eqPos));
            $value = trim(substr($line, $eqPos + 1));
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

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Method Not Allowed']);
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
    $items = [];
    if (is_array($raw['name'])) {
        $count = count($raw['name']);
        for ($i = 0; $i < $count; $i += 1) {
            if ((int)($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                continue;
            }
            $tmpName = (string)($raw['tmp_name'][$i] ?? '');
            if ($tmpName === '' || !is_uploaded_file($tmpName)) {
                continue;
            }
            $items[] = [
                'name' => (string)($raw['name'][$i] ?? 'file.bin'),
                'type' => (string)($raw['type'][$i] ?? 'application/octet-stream'),
                'size' => (int)($raw['size'][$i] ?? 0),
                'tmp_name' => $tmpName,
            ];
        }
        return $items;
    }
    if ((int)($raw['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $tmpName = (string)($raw['tmp_name'] ?? '');
        if ($tmpName !== '' && is_uploaded_file($tmpName)) {
            $items[] = [
                'name' => (string)($raw['name'] ?? 'file.bin'),
                'type' => (string)($raw['type'] ?? 'application/octet-stream'),
                'size' => (int)($raw['size'] ?? 0),
                'tmp_name' => $tmpName,
            ];
        }
    }
    return $items;
}

$files = normalizeUploadedFiles('files');
if (!$files) {
    $files = normalizeUploadedFiles('file');
}
if (!$files) {
    jsonResponse(422, ['ok' => false, 'error' => 'Не передан файл']);
}

$maxBytes = 2 * 1024 * 1024;
$fileBlocks = [];
foreach ($files as $file) {
    $raw = @file_get_contents((string)$file['tmp_name']);
    if ($raw === false) {
        continue;
    }
    if (strlen($raw) > $maxBytes) {
        $raw = substr($raw, 0, $maxBytes);
    }
    $fileType = (string)($file['type'] ?? 'application/octet-stream');
    $textPreview = '';
    if (str_starts_with(strtolower($fileType), 'text/')) {
        $textPreview = trim((string)$raw);
    } else {
        $textPreview = base64_encode($raw);
        $textPreview = 'BASE64 (первые ' . strlen($raw) . ' байт): ' . substr($textPreview, 0, 1800);
    }
    $fileBlocks[] = "fileName: " . (string)$file['name']
        . "\nfileType: " . $fileType
        . "\nfileSize: " . (string)((int)$file['size'])
        . "\nСодержимое файла (или фрагмент):\n" . $textPreview;
}
if (!$fileBlocks) {
    jsonResponse(422, ['ok' => false, 'error' => 'Не удалось прочитать загруженные файлы']);
}

$userPrompt = trim((string)($_POST['prompt'] ?? ''));

$env = loadEnv([
    __DIR__ . '/app/.env',
    __DIR__ . '/.env',
    __DIR__ . '/app/env.txt',
]);

$apiKey = trim((string)($env['AI_API_KEY_PAID'] ?? ''));
if ($apiKey === '') {
    jsonResponse(500, ['ok' => false, 'error' => 'Не задан AI_API_KEY_PAID']);
}

$model = trim((string)($env['GROQ_MODEL'] ?? $env['AI_MODEL'] ?? 'llama-3.3-70b-versatile'));

$messages = [
    [
        'role' => 'system',
        'content' => 'Ты помощник по деловым документам. Ответ короткий, понятный для новичка, на русском языке.',
    ],
    [
        'role' => 'user',
        'content' => ($userPrompt !== '' ? $userPrompt : "Сформируй ответ по приложенному файлу.")
            . "\n\n" . implode("\n\n--------------------\n\n", $fileBlocks),
    ],
];

$payload = [
    'model' => $model,
    'temperature' => 0.2,
    'max_tokens' => 900,
    'messages' => $messages,
];

$ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
if ($ch === false) {
    jsonResponse(500, ['ok' => false, 'error' => 'cURL init failed']);
}

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_TIMEOUT => 60,
]);

$responseRaw = curl_exec($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($responseRaw === false) {
    jsonResponse(502, ['ok' => false, 'error' => 'Ошибка запроса к Groq: ' . $curlError]);
}

$decoded = json_decode((string)$responseRaw, true);
if (!is_array($decoded)) {
    jsonResponse(502, ['ok' => false, 'error' => 'Groq вернул невалидный JSON']);
}

if ($httpCode >= 400) {
    $errorText = trim((string)($decoded['error']['message'] ?? 'Ошибка Groq API'));
    jsonResponse($httpCode, ['ok' => false, 'error' => $errorText]);
}

$answer = trim((string)($decoded['choices'][0]['message']['content'] ?? ''));
if ($answer === '') {
    jsonResponse(502, ['ok' => false, 'error' => 'Groq не вернул текст ответа']);
}

jsonResponse(200, [
    'ok' => true,
    'response' => $answer,
    'model' => (string)($decoded['model'] ?? $model),
    'tokensUsed' => (int)($decoded['usage']['total_tokens'] ?? 0),
]);
