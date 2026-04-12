<?php
declare(strict_types=1);

// Предварительно извлекаем действие, чтобы использовать его при дальнейшем
// разборе запроса (в том числе при обработке JSON-данных).
$preloadedAction = $_GET['action'] ?? $_POST['action'] ?? '';
if (!is_string($preloadedAction)) {
    $preloadedAction = '';
}

$preloadedAction = trim($preloadedAction);

function resolve_documents_root(): string
{
    $candidates = [];

    $envPath = getenv('BIMMAX_DOCUMENTS_ROOT');
    if (is_string($envPath) && trim($envPath) !== '') {
        $candidates[] = trim($envPath);
    }

    $candidates[] = '/var/www/www-root/data/www/bimmax.pro/documents';
    $candidates[] = __DIR__ . '/documents';

    foreach ($candidates as $candidate) {
        $normalized = rtrim($candidate, '/');
        if ($normalized !== '' && is_dir($normalized)) {
            return $normalized;
        }
    }

    return rtrim($candidates[0], '/');
}

define('DOCUMENTS_ROOT', resolve_documents_root());
const REGISTRY_FILENAME = 'registry.json';
const SETTINGS_FILENAME = 'settingsdocs.json';
const DOCS_COLUMN_WIDTH_MIN = 1;
const DOCS_COLUMN_WIDTH_MAX = 420;
const DOCS_COLUMN_WIDTH_DEFAULTS = [
    'entryNumber' => 80,
    'registryNumber' => 140,
    'registrationDate' => 150,
    'direction' => 140,
    'correspondent' => 240,
    'documentNumber' => 160,
    'documentDate' => 150,
    'executor' => 200,
    'director' => 200,
    'assignee' => 220,
    'subordinates' => 220,
    'summary' => 320,
    'resolution' => 260,
    'dueDate' => 160,
    'instruction' => 210,
    'status' => 180,
    'files' => 160,
    'actions' => 160,
];
const MINI_APP_USER_LOG_FILENAME = 'miniappuser.json';
const LOG_DIRECTORY = __DIR__ . '/Прочее';
const DOCS_SERVER_LOG_DIRECTORY = __DIR__ . '/Прочее/Документооборот';
const LOG_FILE = LOG_DIRECTORY . '/botdoc.log';
const DOCS_AUTH_LOG_FILE = LOG_DIRECTORY . '/docs_auth.log';
const DOCS_DEBUG_LOG_FILE = LOG_DIRECTORY . '/docsM.log';
const DOCS_PDF_LOG_FILE = LOG_DIRECTORY . '/docspdf.log';
const DOCS_FILES_LOG_FILE = LOG_DIRECTORY . '/1docks.log';
const DOCS_ANDROID_DOWNLOAD_LOG_FILE = LOG_DIRECTORY . '/1docs.log';
const DOCS_ENTRY_LOG_FILE = LOG_DIRECTORY . '/2docs.log';
const DOCS_MINI_APP_DEBUG_LOG_FILE = LOG_DIRECTORY . '/1docs.log';
const DOCS_DOC_LOAD_LOG_FILE = DOCS_SERVER_LOG_DIRECTORY . '/1ЗагрузкаДок.log';
const DOCS_VIEW_TRACE_LOG_FILE = DOCS_SERVER_LOG_DIRECTORY . '/Просмотреть.log';
const DOCS_RESPONSE_LOG_FILE = DOCS_SERVER_LOG_DIRECTORY . '/Ответ.log';
const DOCS_KRUGLIK_LOG_FILE = DOCS_SERVER_LOG_DIRECTORY . '/Kruglik.log';
const TELEGRAM_BOT_TOKEN_SECURE_DIRECTORY = '/var/www/www-root/data/www/1/.ev';
const TELEGRAM_INIT_DATA_MAX_AGE = 86400; // 24 часа
const MINI_APP_PDF_CACHE_DIRECTORY = __DIR__ . '/cache/miniapp_pdf';
const MINI_APP_PDF_CACHE_TTL = 900; // 15 минут
const MINI_APP_PDF_MAX_FILE_SIZE = 15728640; // 15 МБ
const DOCS_MAINADMIN_STORAGE_DIR = __DIR__ . '/lg';
const DOCS_MAINADMIN_FILE_SUFFIX = '.mainadmin.json';
const DOCS_ORGANIZATION_ADMIN_FILE_SUFFIX = '.admin.json';
const DOCS_MAINADMIN_SECRET_FILE = DOCS_MAINADMIN_STORAGE_DIR . '/.mainadmin-secret';
const DOCS_ADMIN_USERS_FILE = __DIR__ . '/lg/user.json';
const DOCS_SESSION_KEY = 'docs_auth';

function sanitize_instruction(?string $value): string
{
    if ($value === null) {
        return '';
    }

    $normalized = (string) $value;
    $normalized = str_replace(["\r\n", "\r"], "\n", $normalized);
    $normalized = strip_tags($normalized);
    $normalized = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $normalized);
    $normalized = trim($normalized);

    if ($normalized === '') {
        return '';
    }

    if (mb_strlen($normalized, 'UTF-8') > 600) {
        $normalized = mb_substr($normalized, 0, 600, 'UTF-8');
    }

    return $normalized;
}

function sanitize_assignment_comment(?string $value): string
{
    return sanitize_text_field($value, 600);
}

function normalize_log_value($value, int $depth = 0)
{
    if ($depth > 3) {
        return '…';
    }

    if (is_array($value)) {
        $result = [];
        $count = 0;
        foreach ($value as $key => $item) {
            if ($count >= 20) {
                $result['__truncated__'] = '…';
                break;
            }

            $result[$key] = normalize_log_value($item, $depth + 1);
            $count++;
        }

        return $result;
    }

    if (is_string($value)) {
        if (mb_strlen($value, 'UTF-8') > 500) {
            return mb_substr($value, 0, 500, 'UTF-8') . '…';
        }

        return $value;
    }

    if (is_bool($value) || is_null($value) || is_int($value) || is_float($value)) {
        return $value;
    }

    if (is_object($value)) {
        return '(object ' . get_class($value) . ')';
    }

    return '(' . gettype($value) . ')';
}

function docs_normalize_debug_details($value, int $depth = 0)
{
    if ($depth > 4) {
        return '…';
    }

    if (is_array($value)) {
        $result = [];
        $count = 0;
        foreach ($value as $key => $item) {
            if ($count >= 20) {
                $result['__truncated__'] = '…';
                break;
            }

            $count++;
            $normalizedKey = '';
            if (is_string($key)) {
                $normalizedKey = function_exists('mb_strtolower')
                    ? mb_strtolower($key, 'UTF-8')
                    : strtolower($key);
            }

            if ($normalizedKey !== '' && strpos($normalizedKey, 'password') !== false) {
                $result[$key] = '[filtered]';
                continue;
            }

            $result[$key] = docs_normalize_debug_details($item, $depth + 1);
        }

        return $result;
    }

    if (is_string($value)) {
        if (mb_strlen($value, 'UTF-8') > 300) {
            return mb_substr($value, 0, 300, 'UTF-8') . '…';
        }

        return $value;
    }

    if (is_bool($value) || is_null($value) || is_int($value) || is_float($value)) {
        return $value;
    }

    if (is_object($value)) {
        return '(object ' . get_class($value) . ')';
    }

    return '(' . gettype($value) . ')';
}

function log_docs_event(string $message, array $context = []): void
{
    return;
}

function docs_write_mini_app_log(string $message, array $context = []): void
{
    $scope = isset($context['scope']) ? (string) $context['scope'] : '';
    if ($scope !== 'docs_status_view') {
        return;
    }
    $normalizedContext = docs_normalize_debug_details($context);
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => $normalizedContext,
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(LOG_DIRECTORY)) {
        @mkdir(LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_FILES_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function docs_write_entry_task_log(string $message, array $context = []): void
{
    $normalizedContext = docs_normalize_debug_details($context);
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => $normalizedContext,
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(LOG_DIRECTORY)) {
        @mkdir(LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_ENTRY_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}


function docs_write_response_log(string $message, array $context = []): void
{
    $normalizedContext = docs_normalize_debug_details($context);
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => $normalizedContext,
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(DOCS_SERVER_LOG_DIRECTORY)) {
        @mkdir(DOCS_SERVER_LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_RESPONSE_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function docs_collect_response_log_sources(string $folder): array
{
    return [
        'registry' => get_registry_path($folder),
        'settings' => get_settings_path($folder),
        'miniAppUsers' => docs_get_mini_app_user_log_path($folder),
    ];
}

function docs_write_android_download_log(string $message, array $context = []): void
{
    $normalizedContext = docs_normalize_debug_details($context);
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => $normalizedContext,
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(LOG_DIRECTORY)) {
        @mkdir(LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_ANDROID_DOWNLOAD_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function docs_write_mini_app_debug_log(string $message, array $context = []): void
{
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => normalize_log_value($context),
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(LOG_DIRECTORY)) {
        @mkdir(LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_MINI_APP_DEBUG_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function docs_write_kruglik_log(string $message, array $context = []): void
{
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => docs_normalize_debug_details($context),
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(DOCS_SERVER_LOG_DIRECTORY)) {
        @mkdir(DOCS_SERVER_LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_KRUGLIK_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function docs_write_view_trace_log(string $message, array $context = []): void
{
    $payload = [
        'time' => date('c'),
        'message' => $message,
        'context' => docs_normalize_debug_details($context),
    ];

    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $encoded = json_encode([
            'time' => $payload['time'],
            'message' => $message,
            'context' => ['error' => 'encode_failed'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (!is_dir(DOCS_SERVER_LOG_DIRECTORY)) {
        @mkdir(DOCS_SERVER_LOG_DIRECTORY, 0775, true);
    }

    if ($encoded !== false) {
        @file_put_contents(DOCS_VIEW_TRACE_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function docs_log_view_status_event(string $message, array $context = []): void
{
    $context['scope'] = 'docs_status_view';
    docs_write_mini_app_log($message, $context);
}

function docs_write_pdf_log(string $message, array $context = []): void
{
    docs_write_mini_app_log($message, $context);
}

function docs_log_file_debug(string $message, array $context = []): void
{
    return;
}
function docs_log_auth_attempt(string $message, array $context = []): void
{
    return;
}

function docs_debug_log(string $message, array $context = []): void
{
    return;
}

function docs_detect_client_platform(?string $userAgent): string
{
    if ($userAgent === null) {
        return 'unknown';
    }

    $normalized = trim(mb_strtolower($userAgent, 'UTF-8'));
    if ($normalized === '') {
        return 'unknown';
    }

    if (strpos($normalized, 'iphone') !== false || strpos($normalized, 'ipad') !== false
        || strpos($normalized, 'ipod') !== false) {
        return 'ios';
    }

    if (strpos($normalized, 'android') !== false) {
        return 'android';
    }

    if (strpos($normalized, 'mac os') !== false || strpos($normalized, 'macintosh') !== false) {
        return 'macos';
    }

    if (strpos($normalized, 'windows') !== false) {
        return 'windows';
    }

    if (strpos($normalized, 'linux') !== false) {
        return 'linux';
    }

    return 'unknown';
}

function docs_trim_wrapping_quotes(string $value): string
{
    $value = trim($value);
    $length = strlen($value);

    if ($length < 2) {
        return $value;
    }

    $first = $value[0];
    $last = $value[$length - 1];

    if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
        return substr($value, 1, $length - 2);
    }

    return $value;
}

function docs_extract_token_from_env_content(string $content): ?string
{
    $lines = preg_split('/\r\n|\r|\n/', $content);
    $allowedKeys = ['TELEGRAM_BOT_TOKEN', 'BOT_TOKEN', 'TOKEN'];

    foreach ($lines as $line) {
        if (!is_string($line)) {
            continue;
        }

        $trimmed = trim($line);
        if ($trimmed === '') {
            continue;
        }

        $firstChar = $trimmed[0];
        if ($firstChar === '#' || $firstChar === ';') {
            continue;
        }

        if (strpos($trimmed, '#') !== false) {
            $parts = preg_split('/\s+#/', $trimmed, 2);
            if (isset($parts[0])) {
                $trimmed = trim($parts[0]);
            }
        }

        if ($trimmed === '') {
            continue;
        }

        if (strpos($trimmed, ';') !== false) {
            $parts = preg_split('/\s+;/', $trimmed, 2);
            if (isset($parts[0])) {
                $trimmed = trim($parts[0]);
            }
        }

        if ($trimmed === '') {
            continue;
        }

        if (preg_match('/^([A-Za-z0-9_]+)\s*=\s*(.+)$/', $trimmed, $matches)) {
            $key = strtoupper(trim($matches[1]));
            $value = trim($matches[2]);

            if ($value === '') {
                continue;
            }

            $value = docs_trim_wrapping_quotes($value);

            if ($value === '') {
                continue;
            }

            if (in_array($key, $allowedKeys, true)) {
                return $value;
            }

            continue;
        }

        if (strpos($trimmed, '=') === false && $trimmed !== '') {
            return docs_trim_wrapping_quotes($trimmed);
        }
    }

    $fallback = docs_trim_wrapping_quotes(trim($content));
    if ($fallback !== '' && strpos($fallback, "\n") === false && strpos($fallback, '=') === false) {
        return $fallback;
    }

    return null;
}

function docs_resolve_telegram_bot_token(): ?string
{
    static $loaded = false;
    static $token = null;

    if ($loaded) {
        return $token;
    }

    $loaded = true;

    $envToken = getenv('TELEGRAM_BOT_TOKEN');
    if (is_string($envToken)) {
        $envToken = trim($envToken);
        if ($envToken !== '') {
            $token = $envToken;

            return $token;
        }
    }

    $candidateFiles = [];

    $envFile = getenv('TELEGRAM_BOT_TOKEN_FILE');
    if (is_string($envFile)) {
        $envFile = trim($envFile);
        if ($envFile !== '') {
            $candidateFiles[] = $envFile;
        }
    }

    $directories = [];

    if (defined('TELEGRAM_BOT_TOKEN_SECURE_DIRECTORY')) {
        $secureDir = TELEGRAM_BOT_TOKEN_SECURE_DIRECTORY;
        if (is_string($secureDir) && $secureDir !== '') {
            $directories[] = $secureDir;
        }
    }

    $directories[] = __DIR__ . '/js/documents/app';

    $filenames = [
        'telegram-appdosc.env',
        'telegram-appdosc.ev',
        'telegram-appdosc.env.local',
        'telegram-appdosc.ev.local',
        '.env',
        '.ev',
    ];

    foreach ($directories as $directory) {
        if (!is_string($directory) || $directory === '') {
            continue;
        }

        if (is_file($directory)) {
            $candidateFiles[] = $directory;
            continue;
        }

        foreach ($filenames as $filename) {
            $normalizedDirectory = rtrim($directory, "/\\");
            if ($normalizedDirectory === '') {
                $path = $filename;
            } else {
                $path = $normalizedDirectory . '/' . $filename;
            }
            $candidateFiles[] = $path;
        }
    }

    foreach ($candidateFiles as $path) {
        if (!is_string($path) || $path === '' || !is_file($path)) {
            continue;
        }

        $content = @file_get_contents($path);
        if (!is_string($content) || $content === '') {
            continue;
        }

        $candidate = docs_extract_token_from_env_content($content);
        if ($candidate !== null && $candidate !== '') {
            $token = $candidate;
            break;
        }
    }

    return $token;
}

function docs_resolve_application_base_url(): string
{
    $scheme = 'https';

    $forwardedProto = isset($_SERVER['HTTP_X_FORWARDED_PROTO'])
        ? trim((string) $_SERVER['HTTP_X_FORWARDED_PROTO'])
        : '';
    if ($forwardedProto !== '') {
        $segments = explode(',', $forwardedProto);
        $candidate = trim((string) ($segments[0] ?? ''));
        if ($candidate !== '') {
            $scheme = strtolower($candidate) === 'http' ? 'http' : 'https';
        }
    } elseif (isset($_SERVER['REQUEST_SCHEME'])) {
        $candidate = strtolower(trim((string) $_SERVER['REQUEST_SCHEME']));
        if ($candidate === 'http' || $candidate === 'https') {
            $scheme = $candidate;
        }
    } elseif (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        $scheme = 'https';
    } elseif (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '80') {
        $scheme = 'http';
    }

    $host = 'bimmax.pro';
    $forwardedHost = isset($_SERVER['HTTP_X_FORWARDED_HOST'])
        ? trim((string) $_SERVER['HTTP_X_FORWARDED_HOST'])
        : '';
    if ($forwardedHost !== '') {
        $segments = explode(',', $forwardedHost);
        $candidate = trim((string) ($segments[0] ?? ''));
        if ($candidate !== '') {
            $host = $candidate;
        }
    } elseif (!empty($_SERVER['HTTP_HOST'])) {
        $host = trim((string) $_SERVER['HTTP_HOST']);
    } elseif (!empty($_SERVER['SERVER_NAME'])) {
        $host = trim((string) $_SERVER['SERVER_NAME']);
    }

    if ($host === '') {
        $host = 'bimmax.pro';
    }

    return $scheme . '://' . $host;
}

function docs_send_telegram_message(string $chatId, string $text, ?string $botToken = null, ?array $replyMarkup = null): array
{
    $chatId = trim($chatId);
    $text = trim($text);

    if ($chatId === '' || $text === '') {
        return [
            'success' => false,
            'error' => 'chat_id_or_text_empty',
        ];
    }

    if ($botToken === null || $botToken === '') {
        $botToken = docs_resolve_telegram_bot_token();
    }

    if ($botToken === null || $botToken === '') {
        return [
            'success' => false,
            'error' => 'bot_token_missing',
        ];
    }

    $endpoint = 'https://api.telegram.org/bot' . $botToken . '/sendMessage';
    $payload = [
        'chat_id' => $chatId,
        'text' => $text,
        'disable_web_page_preview' => '1',
    ];

    if ($replyMarkup !== null) {
        $encodedReplyMarkup = json_encode($replyMarkup, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encodedReplyMarkup !== false) {
            $payload['reply_markup'] = $encodedReplyMarkup;
        }
    }

    $options = [
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query($payload, '', '&', PHP_QUERY_RFC3986),
            'timeout' => 8,
        ],
    ];

    $context = stream_context_create($options);
    $response = @file_get_contents($endpoint, false, $context);
    if ($response === false) {
        $error = error_get_last();

        return [
            'success' => false,
            'error' => $error['message'] ?? 'request_failed',
        ];
    }

    $decoded = json_decode($response, true);
    $success = is_array($decoded) ? !empty($decoded['ok']) : false;

    if ($success) {
        return [
            'success' => true,
            'response' => $decoded,
        ];
    }

    return [
        'success' => false,
        'error' => is_array($decoded) ? ($decoded['description'] ?? 'unknown_response') : 'invalid_response',
        'response' => $decoded,
    ];
}

function docs_build_task_start_param(array $record): string
{
    $taskId = sanitize_text_field((string) ($record['id'] ?? ''), 200);
    if ($taskId !== '') {
        return 'task:' . $taskId;
    }

    $entryNumber = sanitize_text_field((string) ($record['entryNumber'] ?? ''), 200);
    if ($entryNumber !== '') {
        return 'entry:' . $entryNumber;
    }

    $registryNumber = sanitize_text_field((string) ($record['registryNumber'] ?? ''), 200);
    if ($registryNumber !== '') {
        return 'registry:' . $registryNumber;
    }

    $documentNumber = sanitize_text_field((string) ($record['documentNumber'] ?? ''), 200);
    if ($documentNumber !== '') {
        return 'document:' . $documentNumber;
    }

    return '';
}

function docs_build_mini_app_link(string $baseUrl, string $appPath, ?string $chatId, string $startParam): string
{
    $link = $baseUrl . $appPath;
    $query = [];

    if ($chatId !== null && preg_match('/^\d{4,}$/', (string) $chatId)) {
        $query['telegram_user_id'] = (string) $chatId;
    }

    if ($startParam !== '') {
        $query['start_param'] = $startParam;
    }

    if (!empty($query)) {
        $separator = strpos($link, '?') === false ? '?' : '&';
        $link .= $separator . http_build_query($query);
    }

    return $link;
}

function docs_truncate_notification_text(string $text, int $limit = 350): string
{
    if ($limit < 1) {
        return '';
    }

    if (mb_strlen($text, 'UTF-8') <= $limit) {
        return $text;
    }

    $slice = mb_substr($text, 0, max(1, $limit - 1), 'UTF-8');

    return rtrim($slice) . '…';
}

function docs_format_human_date(?string $value): string
{
    $sanitized = sanitize_date_field($value);
    if ($sanitized === '') {
        return '';
    }

    $date = DateTime::createFromFormat('Y-m-d', $sanitized);
    if ($date === false) {
        return '';
    }

    return $date->format('d.m.Y');
}

function docs_resolve_telegram_chat_id_from_assignee(array $assignee): ?string
{
    foreach (['telegram', 'chatId', 'id'] as $field) {
        if (!isset($assignee[$field])) {
            continue;
        }

        $candidate = normalize_identifier_value($assignee[$field]);
        if ($candidate === '') {
            continue;
        }

        if ($candidate[0] === '@') {
            continue;
        }

        if (!preg_match('/^-?\d{4,}$/', $candidate)) {
            continue;
        }

        return $candidate;
    }

    return null;
}

function docs_extract_assignee_display_name(array $assignee): string
{
    $fields = ['name', 'responsible', 'director', 'fullName', 'fio'];

    foreach ($fields as $field) {
        if (!array_key_exists($field, $assignee)) {
            continue;
        }

        $value = sanitize_text_field((string) $assignee[$field], 200);
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function docs_collect_unique_assignee_names(array $entries): array
{
    $names = [];

    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $name = docs_extract_assignee_display_name($entry);
        if ($name === '') {
            continue;
        }

        $names[$name] = true;
    }

    if (empty($names)) {
        return [];
    }

    return array_values(array_keys($names));
}

function docs_collect_director_names_from_record(array $record): array
{
    $directors = docs_extract_directors($record);

    return docs_collect_unique_assignee_names($directors);
}

function docs_collect_responsible_names_from_record(array $record): array
{
    $assignees = docs_extract_assignees($record);
    $responsibles = [];

    foreach ($assignees as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $role = docs_normalize_assignment_role($entry['role'] ?? '');
        if ($role === 'subordinate') {
            continue;
        }

        $responsibles[] = $entry;
    }

    if (isset($record['responsibles']) && is_array($record['responsibles'])) {
        foreach ($record['responsibles'] as $entry) {
            if (is_array($entry)) {
                $responsibles[] = $entry;
            }
        }
    }

    return docs_collect_unique_assignee_names($responsibles);
}

function docs_collect_subordinate_names_from_record(array $record): array
{
    $assignees = docs_extract_assignees($record);
    $subordinates = [];

    foreach ($assignees as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $role = docs_normalize_assignment_role($entry['role'] ?? '');
        if ($role !== 'subordinate') {
            continue;
        }

        $subordinates[] = $entry;
    }

    if (isset($record['subordinates']) && is_array($record['subordinates'])) {
        foreach ($record['subordinates'] as $entry) {
            if (is_array($entry)) {
                $subordinates[] = $entry;
            }
        }
    }

    return docs_collect_unique_assignee_names($subordinates);
}

function docs_collect_file_names_from_record(array $record): array
{
    if (!isset($record['files']) || !is_array($record['files'])) {
        return [];
    }

    $names = [];

    foreach ($record['files'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $name = sanitize_text_field($entry['originalName'] ?? '', 220);
        if ($name === '') {
            $name = sanitize_text_field($entry['name'] ?? '', 220);
        }
        if ($name === '') {
            $name = sanitize_text_field($entry['storedName'] ?? '', 220);
        }
        if ($name === '') {
            $name = sanitize_text_field($entry['file'] ?? '', 220);
        }
        if ($name === '') {
            $name = sanitize_text_field($entry['url'] ?? '', 220);
        }

        if ($name !== '') {
            $names[$name] = true;
        }
    }

    if (empty($names)) {
        return [];
    }

    return array_values(array_keys($names));
}

function docs_collect_response_file_names_from_record(array $record): array
{
    if (!isset($record['responses']) || !is_array($record['responses'])) {
        return [];
    }

    $names = [];

    foreach ($record['responses'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $name = sanitize_text_field($entry['originalName'] ?? '', 220);
        if ($name === '') {
            $name = sanitize_text_field($entry['name'] ?? '', 220);
        }
        if ($name === '') {
            $name = sanitize_text_field($entry['storedName'] ?? '', 220);
        }

        if ($name !== '') {
            $names[$name] = true;
        }
    }

    return empty($names) ? [] : array_values(array_keys($names));
}

function docs_collect_uploaded_response_names(array $responses, array $uploadedStoredNames = []): array
{
    if (empty($responses) || !is_array($responses)) {
        return [];
    }

    $storedFilter = [];
    foreach ($uploadedStoredNames as $storedName) {
        $normalized = sanitize_text_field((string) $storedName, 255);
        if ($normalized !== '') {
            $storedFilter[$normalized] = true;
        }
    }

    $names = [];
    foreach ($responses as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $storedName = sanitize_text_field((string) ($entry['storedName'] ?? ''), 255);
        if (!empty($storedFilter) && ($storedName === '' || !isset($storedFilter[$storedName]))) {
            continue;
        }

        $name = sanitize_text_field((string) ($entry['originalName'] ?? ''), 220);
        if ($name === '') {
            $name = $storedName;
        }

        if ($name !== '') {
            $names[$name] = true;
        }
    }

    return empty($names) ? [] : array_values(array_keys($names));
}

function docs_find_assignment_entry_for_user(array $record, array $requestContext, bool $allowNameMatch = true): ?array
{
    $userCandidates = docs_collect_request_identity_candidates($requestContext);
    if (!$allowNameMatch) {
        $userCandidates['names'] = [];
    }
    return docs_find_assignment_entry_by_candidates($record, $userCandidates);
}

function docs_find_assignment_entry_with_upload_fallback(
    array $record,
    array $requestContext,
    ?array $sessionAuth = null,
    bool $allowNameMatch = true
): ?array {
    $directEntry = docs_find_assignment_entry_for_user($record, $requestContext, $allowNameMatch);
    if ($directEntry !== null) {
        return $directEntry;
    }

    $ids = [];
    $names = [];

    $appendId = static function ($value) use (&$ids): void {
        $normalized = docs_normalize_identifier_candidate_value($value);
        if ($normalized !== '') {
            $ids[$normalized] = true;
        }
    };

    $appendName = static function ($value) use (&$names): void {
        $normalized = docs_normalize_name_candidate_value($value);
        if ($normalized !== '') {
            $names[$normalized] = true;
        }
    };

    $userKey = docs_resolve_current_user_key($requestContext, $sessionAuth);
    $appendId($userKey);
    if ($userKey !== '' && preg_match('/^[a-z_]+:(.+)$/iu', $userKey, $matches)) {
        $appendId($matches[1]);
    }

    if ($allowNameMatch) {
        $appendName(docs_resolve_current_user_label($requestContext, $sessionAuth));
    }

    $fallbackCandidates = [
        'ids' => array_keys($ids),
        'names' => array_keys($names),
    ];

    return docs_find_assignment_entry_by_candidates($record, $fallbackCandidates);
}

function docs_user_has_assignee_view_access(array $record, array $requestContext): bool
{
    if (empty($record['assigneeViews']) || !is_array($record['assigneeViews'])) {
        return false;
    }

    $candidates = docs_collect_request_identity_candidates($requestContext);
    if (empty($candidates['ids'])) {
        return false;
    }

    $idMap = [];
    foreach ($candidates['ids'] as $candidateId) {
        $normalizedId = docs_normalize_identifier_candidate_value($candidateId);
        if ($normalizedId !== '') {
            $idMap[$normalizedId] = true;
        }
    }

    if (empty($idMap)) {
        return false;
    }

    foreach ($record['assigneeViews'] as $viewEntry) {
        if (!is_array($viewEntry) || empty($viewEntry)) {
            continue;
        }

        $viewId = docs_normalize_identifier_candidate_value($viewEntry['id'] ?? '');
        if ($viewId !== '' && isset($idMap[$viewId])) {
            return true;
        }

        $assigneeKey = mb_strtolower(trim((string) ($viewEntry['assigneeKey'] ?? '')), 'UTF-8');
        if ($assigneeKey !== '' && strpos($assigneeKey, 'id::') === 0) {
            $assigneeId = docs_normalize_identifier_candidate_value(substr($assigneeKey, 4));
            if ($assigneeId !== '' && isset($idMap[$assigneeId])) {
                return true;
            }
        }
    }

    return false;
}

function docs_collect_assignment_log_snapshot(array $record): array
{
    $groups = [
        'assignees' => $record['assignees'] ?? null,
        'subordinates' => $record['subordinates'] ?? null,
        'responsibles' => $record['responsibles'] ?? null,
    ];
    $snapshot = [];

    foreach ($groups as $groupName => $groupEntries) {
        if (!is_array($groupEntries)) {
            continue;
        }

        $snapshot[$groupName] = [];
        foreach ($groupEntries as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $snapshot[$groupName][] = [
                'name' => sanitize_text_field((string) ($entry['name'] ?? $entry['responsible'] ?? ''), 160),
                'role' => sanitize_text_field((string) ($entry['role'] ?? ''), 60),
                'keys' => docs_collect_assignee_index_keys($entry),
            ];
        }
    }

    return $snapshot;
}

function docs_find_assignment_entry_by_candidates(array $record, array $userCandidates): ?array
{
    if (empty($userCandidates['ids']) && empty($userCandidates['names'])) {
        return null;
    }

    $normalizedIdMap = [];
    if (!empty($userCandidates['ids']) && is_array($userCandidates['ids'])) {
        foreach ($userCandidates['ids'] as $candidateId) {
            $normalizedId = docs_normalize_identifier_candidate_value($candidateId);
            if ($normalizedId !== '') {
                $normalizedIdMap[$normalizedId] = true;
            }
        }
    }

    $normalizedNameMap = [];
    if (!empty($userCandidates['names']) && is_array($userCandidates['names'])) {
        foreach ($userCandidates['names'] as $candidateName) {
            $normalizedName = docs_normalize_name_candidate_value($candidateName);
            if ($normalizedName !== '') {
                $normalizedNameMap[$normalizedName] = true;
            }
        }
    }

    $groups = [
        $record['assignees'] ?? null,
        $record['subordinates'] ?? null,
        $record['responsibles'] ?? null,
    ];

    foreach ($groups as $group) {
        if (!is_array($group)) {
            continue;
        }

        foreach ($group as $entry) {
            if (!is_array($entry) || empty($entry)) {
                continue;
            }

            foreach (docs_collect_assignee_index_keys($entry) as $key) {
                $normalizedKey = mb_strtolower(trim((string) $key), 'UTF-8');
                if ($normalizedKey === '') {
                    continue;
                }

                if (strpos($normalizedKey, 'id::') === 0) {
                    $entryId = docs_normalize_identifier_candidate_value(substr($normalizedKey, 4));
                    if ($entryId !== '' && isset($normalizedIdMap[$entryId])) {
                        return $entry;
                    }
                }

                if (strpos($normalizedKey, 'name::') === 0) {
                    $entryName = docs_normalize_name_candidate_value(substr($normalizedKey, 6));
                    if ($entryName !== '' && isset($normalizedNameMap[$entryName])) {
                        return $entry;
                    }
                }
            }
        }
    }

    return null;
}

function docs_collect_response_uploader_identity_candidates(array $responses, array $uploadedStoredNames = []): array
{
    $ids = [];
    $names = [];
    $storedFilter = [];

    foreach ($uploadedStoredNames as $storedName) {
        $normalized = sanitize_text_field((string) $storedName, 255);
        if ($normalized !== '') {
            $storedFilter[$normalized] = true;
        }
    }

    $pushId = static function ($value) use (&$ids): void {
        $value = trim((string) $value);
        if ($value === '') {
            return;
        }

        $variants = [$value];
        if (preg_match('/^[a-z_]+:(.+)$/iu', $value, $matches)) {
            $variants[] = trim((string) $matches[1]);
        }

        foreach ($variants as $variant) {
            $normalized = docs_normalize_identifier_candidate_value($variant);
            if ($normalized !== '') {
                $ids[$normalized] = true;
            }
        }
    };

    $pushName = static function ($value) use (&$names): void {
        $normalized = docs_normalize_name_candidate_value($value);
        if ($normalized !== '') {
            $names[$normalized] = true;
        }
    };

    foreach ($responses as $response) {
        if (!is_array($response)) {
            continue;
        }

        $storedName = sanitize_text_field((string) ($response['storedName'] ?? ''), 255);
        if (!empty($storedFilter) && ($storedName === '' || !isset($storedFilter[$storedName]))) {
            continue;
        }

        $pushId($response['uploadedByKey'] ?? '');
        $pushId($response['uploadedById'] ?? '');
        $pushId($response['uploadedByTelegram'] ?? '');
        $pushName($response['uploadedBy'] ?? '');
        $pushName($response['uploadedByName'] ?? '');
    }

    return [
        'ids' => array_values(array_keys($ids)),
        'names' => array_values(array_keys($names)),
    ];
}

function docs_find_assignment_entry_for_uploaded_responses(array $record, array $requestContext, array $uploadedStoredNames = []): ?array
{
    $entry = docs_find_assignment_entry_for_user($record, $requestContext);
    if ($entry !== null) {
        return $entry;
    }

    $responseCandidates = docs_collect_response_uploader_identity_candidates(
        isset($record['responses']) && is_array($record['responses']) ? $record['responses'] : [],
        $uploadedStoredNames
    );

    return docs_find_assignment_entry_by_candidates($record, $responseCandidates);
}

function docs_find_fallback_response_notification_author(array $record, array $assignmentEntry): ?array
{
    $assignmentKeys = [];
    foreach (docs_collect_assignee_index_keys($assignmentEntry) as $key) {
        $normalizedKey = mb_strtolower(trim((string) $key), 'UTF-8');
        if ($normalizedKey !== '') {
            $assignmentKeys[$normalizedKey] = true;
        }
    }

    $pickFirstDifferent = static function (array $entries) use ($assignmentKeys): ?array {
        foreach ($entries as $entry) {
            if (!is_array($entry) || empty($entry)) {
                continue;
            }

            $matchedSelf = false;
            foreach (docs_collect_assignee_index_keys($entry) as $key) {
                $normalizedKey = mb_strtolower(trim((string) $key), 'UTF-8');
                if ($normalizedKey !== '' && isset($assignmentKeys[$normalizedKey])) {
                    $matchedSelf = true;
                    break;
                }
            }

            if (!$matchedSelf) {
                return $entry;
            }
        }

        return null;
    };

    $role = docs_normalize_assignment_role((string) ($assignmentEntry['role'] ?? ''));
    if ($role === 'subordinate') {
        $responsibles = [];
        foreach (docs_extract_assignees($record) as $entry) {
            if (!is_array($entry) || empty($entry)) {
                continue;
            }

            if (docs_normalize_assignment_role((string) ($entry['role'] ?? '')) === 'subordinate') {
                continue;
            }

            $responsibles[] = $entry;
        }

        $responsible = $pickFirstDifferent($responsibles);
        if ($responsible !== null) {
            $responsible['source'] = $responsible['source'] ?? 'fallback_responsible';
            return $responsible;
        }
    }

    $director = $pickFirstDifferent(docs_extract_directors($record));
    if ($director !== null) {
        $director['source'] = $director['source'] ?? 'fallback_director';
        return $director;
    }

    return null;
}

function docs_find_assignment_author_entry(array $record, string $folder, array $assignmentEntry): ?array
{
    $assignedByRaw = sanitize_text_field((string) ($assignmentEntry['assignedBy'] ?? ''), 200);
    $assignedByTelegramRaw = normalize_identifier_value($assignmentEntry['assignedByTelegram'] ?? '');
    $assignedByIdRaw = normalize_identifier_value($assignmentEntry['assignedById'] ?? '');
    $assignedByLoginRaw = sanitize_text_field((string) ($assignmentEntry['assignedByLogin'] ?? ''), 120);

    $candidates = array_values(array_filter([
        $assignedByTelegramRaw,
        $assignedByRaw,
        $assignedByIdRaw,
        $assignedByLoginRaw,
    ], static fn($value) => is_string($value) && trim($value) !== ''));

    if (empty($candidates)) {
        return null;
    }

    $searchPools = [];
    $searchPools[] = docs_extract_directors($record);
    $searchPools[] = docs_extract_assignees($record);
    if (isset($record['subordinates']) && is_array($record['subordinates'])) {
        $searchPools[] = $record['subordinates'];
    }

    $settings = load_admin_settings($folder);
    if (isset($settings['block2']) && is_array($settings['block2'])) {
        $searchPools[] = $settings['block2'];
    }
    if (isset($settings['block3']) && is_array($settings['block3'])) {
        $searchPools[] = $settings['block3'];
    }

    foreach ($searchPools as $pool) {
        if (!is_array($pool)) {
            continue;
        }
        foreach ($pool as $entry) {
            if (!is_array($entry) || empty($entry)) {
                continue;
            }

            $matched = false;
            foreach ($candidates as $candidate) {
                if (docs_entry_matches_candidate($entry, $candidate)) {
                    $matched = true;
                    break;
                }
            }
            if (!$matched) {
                continue;
            }

            $candidateKeys = docs_collect_assignee_index_keys($entry);
            $assignmentKeys = docs_collect_assignee_index_keys($assignmentEntry);
            $intersects = array_intersect(
                array_map(static fn($value) => mb_strtolower(trim((string) $value), 'UTF-8'), $candidateKeys),
                array_map(static fn($value) => mb_strtolower(trim((string) $value), 'UTF-8'), $assignmentKeys)
            );
            if (!empty($intersects)) {
                continue;
            }

            return $entry;
        }
    }

    $miniAppUsers = docs_load_mini_app_user_log($folder);
    if (!empty($miniAppUsers['entries']) && is_array($miniAppUsers['entries'])) {
        foreach ($miniAppUsers['entries'] as $entry) {
            if (!is_array($entry) || empty($entry)) {
                continue;
            }

            $matched = false;
            foreach ($candidates as $candidate) {
                if (docs_entry_matches_candidate($entry, $candidate)) {
                    $matched = true;
                    break;
                }
            }
            if (!$matched) {
                continue;
            }

            $resolvedId = normalize_identifier_value($entry['id'] ?? '');
            if ($resolvedId === '') {
                continue;
            }

            $candidateEntry = [
                'id' => $resolvedId,
                'telegram' => $resolvedId,
                'chatId' => $resolvedId,
                'name' => sanitize_text_field((string) ($entry['fullName'] ?? ($entry['username'] ?? $assignedByRaw)), 200),
                'username' => sanitize_text_field((string) ($entry['username'] ?? ''), 120),
                'source' => 'miniappuser',
            ];

            $intersects = array_intersect(
                array_map(static fn($value) => mb_strtolower(trim((string) $value), 'UTF-8'), docs_collect_assignee_index_keys($candidateEntry)),
                array_map(static fn($value) => mb_strtolower(trim((string) $value), 'UTF-8'), docs_collect_assignee_index_keys($assignmentEntry))
            );
            if (!empty($intersects)) {
                continue;
            }

            return $candidateEntry;
        }
    }

    return null;
}

function docs_build_response_notification_message(array $record, array $organizationRecord, string $organization, array $uploaderEntry, array $uploadedResponses, string $appUrl): string
{
    $lines = [];

    $uploaderName = docs_extract_assignee_display_name($uploaderEntry);
    if ($uploaderName === '') {
        $uploaderName = sanitize_text_field((string) ($uploaderEntry['uploadedBy'] ?? ''), 200);
    }

    $lines[] = ($uploaderName !== '' ? '📎 ' . $uploaderName : '📎 Назначенный пользователь') . ' на вашу задачу загрузил ответ:';

    $directorNames = docs_collect_director_names_from_record($record);
    $lines[] = 'Директор: ' . (!empty($directorNames) ? implode(', ', $directorNames) : 'не указан');

    $organizationName = sanitize_text_field($organization, 160);
    if ($organizationName !== '') {
        $lines[] = 'Организация: ' . $organizationName;
    }

    $registryNumber = sanitize_text_field((string) ($record['registryNumber'] ?? ''), 120);
    if ($registryNumber !== '') {
        $lines[] = 'Рег. №: ' . $registryNumber;
    }

    $content = sanitize_text_field((string) ($record['correspondent'] ?? ''), 250);
    if ($content === '') {
        $content = sanitize_text_field((string) ($record['summary'] ?? ''), 250);
    }
    $lines[] = 'Содержание: ' . ($content !== '' ? $content : 'не указано');

    $instruction = sanitize_instruction($uploaderEntry['assignmentInstruction'] ?? '');
    if ($instruction === '') {
        $instruction = sanitize_instruction($record['instruction'] ?? '');
    }
    $lines[] = 'Поручение: ' . ($instruction !== '' ? docs_truncate_notification_text($instruction, 350) : 'не указано');

    $due = sanitize_date_field($uploaderEntry['assignmentDueDate'] ?? '');
    if ($due === '') {
        $due = sanitize_date_field($record['dueDate'] ?? '');
    }
    $dueLabel = docs_format_human_date($due);
    $lines[] = 'Срок: ' . ($dueLabel !== '' ? $dueLabel : 'не указан');

    $lines[] = 'Ответственные: ' . (($responsibleNames = docs_collect_responsible_names_from_record($record)) ? implode(', ', $responsibleNames) : 'не указаны');
    $lines[] = 'Подчинённые: ' . (($subordinateNames = docs_collect_subordinate_names_from_record($record)) ? implode(', ', $subordinateNames) : 'не указаны');
    $lines[] = 'Файлы: ' . (($fileNames = docs_collect_file_names_from_record($record)) ? implode(', ', $fileNames) : 'не указаны');
    $lines[] = 'Файл Ответ: ' . (!empty($uploadedResponses) ? implode(', ', $uploadedResponses) : 'не указан');

    if ($appUrl !== '') {
        $lines[] = '';
        $lines[] = '';
        $lines[] = 'Открыть задачу: кнопка ниже.';
    }

    $message = trim(implode("\n", $lines));
    if ($message !== '' && mb_strlen($message, 'UTF-8') > 3800) {
        $message = mb_substr($message, 0, 3799, 'UTF-8');
    }

    return $message;
}

function docs_notify_assignment_author_about_response(array $record, string $folder, string $organization, array $requestContext, array $uploadedStoredNames = []): void
{
    $baseLogContext = [
        'organization' => $organization,
        'folder' => $folder,
        'documentId' => $record['id'] ?? null,
        'registryNumber' => $record['registryNumber'] ?? null,
        'uploadedStoredNames' => $uploadedStoredNames,
        'dataSources' => docs_collect_response_log_sources($folder),
    ];

    $assignmentEntry = docs_find_assignment_entry_for_uploaded_responses($record, $requestContext, $uploadedStoredNames);
    if ($assignmentEntry === null) {
        docs_write_response_log('Не найден исполнитель для уведомления по файлу Ответ к задаче', $baseLogContext + [
            'requestUser' => [
                'primaryId' => $requestContext['primaryId'] ?? null,
                'user' => isset($requestContext['user']) && is_array($requestContext['user']) ? $requestContext['user'] : null,
            ],
        ]);
        return;
    }

    $baseLogContext['uploader'] = [
        'name' => $assignmentEntry['name'] ?? ($assignmentEntry['responsible'] ?? null),
        'id' => $assignmentEntry['id'] ?? null,
        'telegram' => $assignmentEntry['telegram'] ?? null,
        'role' => $assignmentEntry['role'] ?? null,
        'assignedBy' => $assignmentEntry['assignedBy'] ?? null,
        'assignedByTelegram' => $assignmentEntry['assignedByTelegram'] ?? null,
        'assignedByRole' => $assignmentEntry['assignedByRole'] ?? null,
    ];

    $authorEntry = docs_find_assignment_author_entry($record, $folder, $assignmentEntry);
    if ($authorEntry === null) {
        docs_write_response_log('Не найден получатель уведомления по файлу Ответ к задаче', $baseLogContext);
        return;
    }

    $recipientName = docs_extract_assignee_display_name($authorEntry);
    if ($recipientName === '') {
        $recipientName = sanitize_text_field((string) ($authorEntry['name'] ?? ($authorEntry['responsible'] ?? '')), 200);
    }

    $chatId = docs_resolve_telegram_chat_id_from_assignee($authorEntry);
    if ($chatId === null) {
        docs_write_response_log('У получателя отсутствует Telegram ID для уведомления по файлу Ответ к задаче', $baseLogContext + [
            'author' => $authorEntry,
            'notificationRecipient' => [
                'name' => $recipientName,
                'chatId' => null,
            ],
        ]);
        return;
    }

    $botToken = docs_resolve_telegram_bot_token();
    if ($botToken === null || $botToken === '') {
        docs_write_response_log('Не найден токен Telegram-бота для уведомления по файлу Ответ к задаче', $baseLogContext + [
            'authorChatId' => (string) $chatId,
            'notificationRecipient' => [
                'name' => $recipientName,
                'chatId' => (string) $chatId,
            ],
        ]);
        return;
    }

    $baseUrl = docs_resolve_application_base_url();
    $appPath = '/js/documents/app/telegram-appdosc.html';
    $startParam = docs_build_task_start_param($record);
    $link = docs_build_mini_app_link($baseUrl, $appPath, (string) $chatId, $startParam);
    $uploadedResponseNames = docs_collect_uploaded_response_names($record['responses'] ?? [], $uploadedStoredNames);
    $message = docs_build_response_notification_message($record, $record, $organization, $assignmentEntry, $uploadedResponseNames, $link);
    if ($message === '') {
        return;
    }

    $replyMarkup = null;
    if ($link !== '') {
        $replyMarkup = [
            'inline_keyboard' => [
                [[
                    'text' => 'Открыть задачу',
                    'web_app' => ['url' => $link],
                ]],
            ],
        ];
    }

    $logContext = [
        'organization' => $organization,
        'folder' => $folder,
        'documentId' => $record['id'] ?? null,
        'authorChatId' => (string) $chatId,
        'author' => [
            'name' => docs_extract_assignee_display_name($authorEntry),
            'id' => $authorEntry['id'] ?? null,
            'role' => $authorEntry['role'] ?? null,
            'source' => $authorEntry['source'] ?? 'record_or_settings',
        ],
        'notificationRecipient' => [
            'name' => $recipientName,
            'chatId' => (string) $chatId,
            'id' => $authorEntry['id'] ?? null,
            'telegram' => $authorEntry['telegram'] ?? ($authorEntry['chatId'] ?? null),
        ],
        'uploader' => [
            'name' => $assignmentEntry['name'] ?? ($assignmentEntry['responsible'] ?? null),
            'id' => $assignmentEntry['id'] ?? null,
            'role' => $assignmentEntry['role'] ?? null,
        ],
        'assignedBy' => $assignmentEntry['assignedBy'] ?? null,
        'uploadedResponses' => $uploadedResponseNames,
        'dataSources' => docs_collect_response_log_sources($folder),
        'result' => null,
    ];

    docs_write_response_log('Подготовка уведомления о файле Ответ к задаче', $logContext);

    $result = docs_send_telegram_message((string) $chatId, $message, $botToken, $replyMarkup);
    $logContext['result'] = $result;

    docs_write_response_log(!empty($result['success']) ? 'Уведомление о файле Ответ к задаче отправлено' : 'Ошибка отправки уведомления о файле Ответ к задаче', $logContext);
    log_docs_event(!empty($result['success']) ? 'Response upload notification sent' : 'Response upload notification failed', $logContext);
}

function docs_normalize_assignment_role(?string $role): string
{
    if ($role === null) {
        return '';
    }

    $normalized = mb_strtolower(trim($role), 'UTF-8');
    if ($normalized === '') {
        return '';
    }

    $map = [
        'director' => 'director',
        'директор' => 'director',
        'руководитель' => 'director',
        'admin' => 'admin',
        'administrator' => 'admin',
        'администратор' => 'admin',
        'админ' => 'admin',
        'responsible' => 'responsible',
        'ответственный' => 'responsible',
        'subordinate' => 'subordinate',
        'подчиненный' => 'subordinate',
        'подчинённый' => 'subordinate',
    ];

    return $map[$normalized] ?? '';
}

function docs_resolve_assignment_author_role_from_session(?array $sessionAuth): string
{
    if (!is_array($sessionAuth)) {
        return '';
    }

    $sessionRole = docs_normalize_assignment_role((string) ($sessionAuth['role'] ?? ''));
    if ($sessionRole === 'admin') {
        return 'admin';
    }

    if (($sessionAuth['role'] ?? '') === 'user') {
        $responsibleRole = docs_normalize_assignment_role((string) ($sessionAuth['responsibleRole'] ?? ''));
        if ($responsibleRole !== '') {
            return $responsibleRole;
        }
    }

    return $sessionRole;
}

function docs_resolve_assignment_author_role_from_context(bool $isDirector, bool $isTaskAssignee, bool $isTaskSubordinate): string
{
    if ($isDirector) {
        return 'director';
    }

    if ($isTaskAssignee) {
        return 'responsible';
    }

    if ($isTaskSubordinate) {
        return 'subordinate';
    }

    return '';
}

function docs_build_director_responsible_chain_label(array $record): string
{
    $directorNames = docs_collect_director_names_from_record($record);
    $responsibleNames = docs_collect_responsible_names_from_record($record);

    if (empty($directorNames) && empty($responsibleNames)) {
        return '';
    }

    $parts = [];

    if (!empty($directorNames)) {
        $parts[] = 'Директор: ' . implode(', ', $directorNames);
    }

    if (!empty($responsibleNames)) {
        $parts[] = 'Ответственный: ' . implode(', ', $responsibleNames);
    }

    return implode(' → ', $parts);
}

function docs_build_assignment_notification_message(array $record, array $assignee, string $organization, string $appUrl): string
{
    $lines = [];

    $assignmentComment = sanitize_assignment_comment($assignee['assignmentComment'] ?? '');
    $assignmentDueRaw = sanitize_date_field($assignee['assignmentDueDate'] ?? '');
    $assignmentDueFormatted = docs_format_human_date($assignmentDueRaw);
    $assignmentInstruction = sanitize_text_field($assignee['assignmentInstruction'] ?? '', 800);
    if ($assignmentInstruction === '') {
        $assignmentInstruction = $assignmentComment;
    }
    if ($assignmentInstruction === '') {
        $assignmentInstruction = sanitize_text_field($record['instruction'] ?? '', 800);
    }

    $assigneeName = sanitize_text_field($assignee['name'] ?? '', 200);
    if ($assigneeName !== '') {
        $lines[] = '📌 ' . $assigneeName . ', вам назначена новая задача от:';
    } else {
        $lines[] = '📌 Вам назначена новая задача от:';
    }

    $directorNames = docs_collect_director_names_from_record($record);
    $directorLabel = !empty($directorNames) ? implode(', ', $directorNames) : 'не указан';
    $lines[] = 'Директор: ' . $directorLabel;

    $assignedByName = sanitize_text_field($assignee['assignedBy'] ?? '', 200);
    $assignedByRole = docs_normalize_assignment_role((string) ($assignee['assignedByRole'] ?? ''));
    if ($assignedByName !== '') {
        if ($assignedByRole === 'admin') {
            $lines[] = 'Администратор: ' . $assignedByName;
        } elseif ($assignedByRole === 'responsible') {
            $lines[] = 'Ответственный: ' . $assignedByName;
        } elseif ($assignedByRole === 'subordinate') {
            $lines[] = 'Подчинённый: ' . $assignedByName;
        }
    }

    $organizationName = sanitize_text_field($organization, 160);
    if ($organizationName !== '') {
        $lines[] = 'Организация: ' . $organizationName;
    }

    $registryNumber = sanitize_text_field($record['registryNumber'] ?? '', 120);
    if ($registryNumber !== '') {
        $lines[] = 'Рег. №: ' . $registryNumber;
    }

    $content = sanitize_text_field($record['correspondent'] ?? '', 200);
    if ($content === '') {
        $content = sanitize_text_field($record['summary'] ?? '', 200);
    }
    $lines[] = 'Содержание: ' . ($content !== '' ? $content : 'не указано');

    $lines[] = 'Поручение:' . ($assignmentInstruction !== '' ? ' ' . docs_truncate_notification_text($assignmentInstruction, 350) : '');

    $recordDueDate = docs_format_human_date($record['dueDate'] ?? '');
    $dueDisplay = $assignmentDueFormatted !== '' ? $assignmentDueFormatted : $recordDueDate;
    $lines[] = 'Срок: ' . ($dueDisplay !== '' ? $dueDisplay : 'не указан');

    $responsibleNames = docs_collect_responsible_names_from_record($record);
    $responsibleLabel = !empty($responsibleNames) ? implode(', ', $responsibleNames) : 'не указаны';
    $lines[] = 'Ответственные: ' . $responsibleLabel;

    $subordinateNames = docs_collect_subordinate_names_from_record($record);
    $subordinateLabel = !empty($subordinateNames) ? implode(', ', $subordinateNames) : 'не указаны';
    $lines[] = 'Подчинённые: ' . $subordinateLabel;

    $fileNames = docs_collect_file_names_from_record($record);
    $fileLabel = !empty($fileNames) ? implode(', ', $fileNames) : 'не указаны';
    $lines[] = 'Файлы: ' . $fileLabel;

    if ($appUrl !== '') {
        $lines[] = '';
        $lines[] = '';
        $lines[] = 'Открыть задачу: кнопка ниже.';
    }

    $message = trim(implode("\n", array_filter($lines, static function ($line) {
        return $line !== null;
    })));

    if ($message === '') {
        return '';
    }

    if (mb_strlen($message, 'UTF-8') > 3800) {
        $message = mb_substr($message, 0, 3799, 'UTF-8');
    }

    return $message;
}

function docs_build_director_reminder_message(array $record, array $director, string $organization, string $appUrl): string
{
    $lines = [];

    $directorName = sanitize_text_field($director['name'] ?? '', 200);
    if ($directorName === '') {
        $directorName = sanitize_text_field($director['responsible'] ?? '', 200);
    }

    if ($directorName !== '') {
        $lines[] = '🔔 ' . $directorName . ', напоминание по задаче';
    } else {
        $lines[] = '🔔 Напоминание по задаче';
    }

    $lines[] = 'Пожалуйста, распределите задачу на ответственных и подчинённых.';

    $organizationName = sanitize_text_field($organization, 160);
    if ($organizationName !== '') {
        $lines[] = 'Организация: ' . $organizationName;
    }

    $documentParts = [];
    $documentNumber = sanitize_text_field($record['documentNumber'] ?? '', 120);
    if ($documentNumber !== '') {
        $documentParts[] = '№ ' . $documentNumber;
    }
    $documentDate = docs_format_human_date($record['documentDate'] ?? '');
    if ($documentDate !== '') {
        $documentParts[] = 'от ' . $documentDate;
    }
    $documentTitle = sanitize_text_field($record['document'] ?? '', 200);
    if ($documentTitle !== '') {
        $documentParts[] = $documentTitle;
    }

    if (!empty($documentParts)) {
        $lines[] = 'Документ: ' . implode(' ', $documentParts);
    }

    $registryNumber = sanitize_text_field($record['registryNumber'] ?? '', 120);
    if ($registryNumber !== '') {
        $lines[] = 'Рег. №: ' . $registryNumber;
    }

    $correspondent = sanitize_text_field($record['correspondent'] ?? '', 200);
    if ($correspondent !== '') {
        $lines[] = 'Корреспондент: ' . $correspondent;
    }

    $recordDueDate = docs_format_human_date($record['dueDate'] ?? '');
    $lines[] = 'Срок: ' . ($recordDueDate !== '' ? $recordDueDate : 'не указан');

    $summary = sanitize_text_field($record['summary'] ?? '', 800);
    if ($summary !== '') {
        $lines[] = '';
        $lines[] = 'Кратко: ' . docs_truncate_notification_text($summary, 350);
    }

    $resolution = sanitize_text_field($record['resolution'] ?? '', 800);
    if ($resolution !== '') {
        $lines[] = '';
        $lines[] = 'Резолюция: ' . docs_truncate_notification_text($resolution, 350);
    }

    if ($appUrl !== '') {
        $lines[] = '';
        $lines[] = 'Открыть задачу: кнопка ниже.';
    }

    $message = trim(implode("\n", array_filter($lines, static function ($line) {
        return $line !== null;
    })));

    if ($message === '') {
        return '';
    }

    if (mb_strlen($message, 'UTF-8') > 3800) {
        $message = mb_substr($message, 0, 3799, 'UTF-8');
    }

    return $message;
}

function docs_build_subordinate_instruction_summary(array $entries): string
{
    $lines = [];

    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $comment = sanitize_assignment_comment($entry['assignmentComment'] ?? '');
        $dueRaw = sanitize_date_field($entry['assignmentDueDate'] ?? '');
        $hasComment = $comment !== '';
        $hasDue = $dueRaw !== '';

        if (!$hasComment && !$hasDue) {
            continue;
        }

        $name = sanitize_text_field($entry['name'] ?? '', 200);
        if ($name === '') {
            $name = sanitize_text_field($entry['responsible'] ?? '', 200);
        }
        if ($name === '') {
            $name = sanitize_text_field($entry['login'] ?? '', 120);
        }
        if ($name === '') {
            $name = sanitize_text_field($entry['id'] ?? '', 120);
        }

        $parts = [];
        if ($hasComment) {
            $parts[] = $comment;
        }
        if ($hasDue) {
            $parts[] = 'Срок: ' . docs_format_human_date($dueRaw);
        }

        $lineBody = trim(implode(' • ', array_filter($parts)));
        if ($name !== '') {
            $lines[] = trim($name . ($lineBody !== '' ? ' — ' . $lineBody : ''));
        } elseif ($lineBody !== '') {
            $lines[] = $lineBody;
        }
    }

    return trim(implode("\n", array_filter($lines)));
}

function docs_update_instruction_from_subordinates(array &$record): void
{
    $entries = [];

    if (isset($record['subordinates']) && is_array($record['subordinates'])) {
        $entries = $record['subordinates'];
    } elseif (isset($record['subordinate']) && is_array($record['subordinate'])) {
        $entries = [$record['subordinate']];
    }

    $summary = docs_build_subordinate_instruction_summary($entries);
    $record['instruction'] = sanitize_instruction($summary);
}

function docs_send_task_assignment_notifications(array $assignees, array $record, string $organization): void
{
    if (empty($assignees)) {
        return;
    }

    $botToken = docs_resolve_telegram_bot_token();
    if ($botToken === null || $botToken === '') {
        log_docs_event('Assignment notification skipped: bot token missing', [
            'organization' => $organization,
            'documentId' => $record['id'] ?? null,
        ]);

        return;
    }

    $baseUrl = docs_resolve_application_base_url();
    $appPath = '/js/documents/app/telegram-appdosc.html';

    $sentChatIds = [];

    foreach ($assignees as $assignee) {
        if (!is_array($assignee)) {
            continue;
        }

        $chatId = docs_resolve_telegram_chat_id_from_assignee($assignee);
        if ($chatId === null) {
            log_docs_event('Assignment notification skipped: chat id unavailable', [
                'organization' => $organization,
                'documentId' => $record['id'] ?? null,
                'assignee' => $assignee,
            ]);
            continue;
        }

        if (isset($sentChatIds[$chatId])) {
            continue;
        }

        $startParam = docs_build_task_start_param($record);
        $link = docs_build_mini_app_link($baseUrl, $appPath, $chatId, $startParam);

        $message = docs_build_assignment_notification_message($record, $assignee, $organization, $link);
        if ($message === '') {
            continue;
        }

        $replyMarkup = null;
        if ($link !== '') {
            $replyMarkup = [
                'inline_keyboard' => [
                    [
                        [
                            'text' => 'Открыть задачу',
                            'web_app' => [
                                'url' => $link,
                            ],
                        ],
                    ],
                ],
            ];
        }

        if ($startParam !== '') {
            docs_write_entry_task_log('Мини-приложение: сформирована ссылка на задачу', [
                'scope' => 'assignment_notification',
                'organization' => $organization,
                'documentId' => $record['id'] ?? null,
                'startParam' => $startParam,
                'chatId' => $chatId,
                'assigneeRole' => $assignee['role'] ?? null,
            ]);
        }

        $result = docs_send_telegram_message($chatId, $message, $botToken, $replyMarkup);

        $logContext = [
            'organization' => $organization,
            'documentId' => $record['id'] ?? null,
            'chatId' => $chatId,
            'assignee' => [
                'id' => $assignee['id'] ?? null,
                'name' => $assignee['name'] ?? null,
                'telegram' => $assignee['telegram'] ?? null,
                'chatId' => $assignee['chatId'] ?? null,
                'role' => $assignee['role'] ?? null,
            ],
        ];

        if (!empty($result['success'])) {
            $logContext['response'] = $result['response'] ?? null;
            log_docs_event('Assignment notification sent', $logContext);
        } else {
            $logContext['error'] = $result['error'] ?? null;
            if (isset($result['response'])) {
                $logContext['response'] = $result['response'];
            }
            log_docs_event('Assignment notification failed', $logContext);
        }

        $sentChatIds[$chatId] = true;
    }
}

function docs_parse_telegram_init_data_string(string $initData): ?array
{
    $initData = trim($initData);
    if ($initData === '') {
        return null;
    }

    $pairs = preg_split('/&/', $initData, -1, PREG_SPLIT_NO_EMPTY);
    if (empty($pairs)) {
        return null;
    }

    $fields = [];

    foreach ($pairs as $pair) {
        if (!is_string($pair) || $pair === '') {
            continue;
        }

        $parts = explode('=', $pair, 2);
        $key = rawurldecode($parts[0] ?? '');
        $value = rawurldecode($parts[1] ?? '');

        if ($key === '') {
            continue;
        }

        $fields[$key] = $value;
    }

    if (empty($fields)) {
        return null;
    }

    $hash = $fields['hash'] ?? '';
    if (!is_string($hash) || trim($hash) === '') {
        return null;
    }

    unset($fields['hash']);

    return [
        'fields' => $fields,
        'hash' => trim($hash),
    ];
}

function docs_verify_telegram_init_data(array $parsed, string $botToken): ?array
{
    if (empty($parsed['fields']) || !is_array($parsed['fields'])) {
        return null;
    }

    $fields = [];
    foreach ($parsed['fields'] as $key => $value) {
        if (!is_string($key)) {
            continue;
        }

        if (is_array($value)) {
            $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
            $fields[$key] = $encoded !== false ? $encoded : '';
            continue;
        }

        if (is_bool($value)) {
            $fields[$key] = $value ? '1' : '0';
            continue;
        }

        if ($value === null) {
            $fields[$key] = '';
            continue;
        }

        $fields[$key] = (string) $value;
    }

    if (empty($fields)) {
        return null;
    }

    ksort($fields, SORT_STRING);

    $pieces = [];
    foreach ($fields as $key => $value) {
        $pieces[] = $key . '=' . $value;
    }

    $dataCheckString = implode("\n", $pieces);

    $secretKey = hash_hmac('sha256', $botToken, 'WebAppData', true);
    $calculatedHash = hash_hmac('sha256', $dataCheckString, $secretKey);

    if (!hash_equals($parsed['hash'], $calculatedHash)) {
        return null;
    }

    $user = null;
    if (isset($parsed['fields']['user']) && is_string($parsed['fields']['user'])) {
        $decoded = json_decode($parsed['fields']['user'], true);
        if (is_array($decoded)) {
            $user = $decoded;
        }
    }

    return [
        'fields' => $parsed['fields'],
        'hash' => $parsed['hash'],
        'dataCheckString' => $dataCheckString,
        'user' => $user,
    ];
}

function docs_resolve_telegram_init_data_context(): array
{
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $cached = [
        'present' => false,
        'valid' => false,
        'hashValid' => false,
        'error' => null,
        'source' => [],
        'user' => null,
        'authDate' => null,
        'sourceType' => 'none',
    ];

    $initData = '';
    $sourceType = 'none';

    $headerValue = $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? null;
    if (is_string($headerValue) && trim($headerValue) !== '') {
        $initData = trim($headerValue);
        $sourceType = 'header';
    } else {
        $candidates = [];

        if (!empty($_POST) && is_array($_POST)) {
            $candidates[] = $_POST;
        }

        if (!empty($_GET) && is_array($_GET)) {
            $candidates[] = $_GET;
        }

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
            $jsonPayload = load_json_payload();
            if (!empty($jsonPayload) && is_array($jsonPayload)) {
                $candidates[] = $jsonPayload;
            }
        }

        foreach ($candidates as $candidate) {
            foreach (['telegram_init_data', 'init_data', 'initData', 'telegramInitData'] as $key) {
                if (!isset($candidate[$key])) {
                    continue;
                }

                $value = $candidate[$key];
                if (!is_string($value) && !is_numeric($value)) {
                    continue;
                }

                $stringValue = trim((string) $value);
                if ($stringValue === '') {
                    continue;
                }

                $initData = $stringValue;
                $sourceType = 'payload';
                break 2;
            }
        }
    }

    if ($initData === '') {
        return $cached;
    }

    $cached['present'] = true;
    $cached['sourceType'] = $sourceType;
    $cached['initDataLength'] = strlen($initData);

    $botToken = docs_resolve_telegram_bot_token();
    if ($botToken === null || $botToken === '') {
        $cached['error'] = 'missing_token';
        log_docs_event('Telegram init data received but bot token missing', [
            'source' => $sourceType,
            'initDataLength' => strlen($initData),
        ]);

        return $cached;
    }

    $parsed = docs_parse_telegram_init_data_string($initData);
    if ($parsed === null) {
        $cached['error'] = 'invalid_payload';
        log_docs_event('Telegram init data parsing failed', [
            'source' => $sourceType,
            'initDataLength' => strlen($initData),
        ]);

        return $cached;
    }

    $verification = docs_verify_telegram_init_data($parsed, $botToken);
    if ($verification === null) {
        $cached['error'] = 'hash_mismatch';
        log_docs_event('Telegram init data hash mismatch', [
            'source' => $sourceType,
            'initDataLength' => strlen($initData),
            'hasHash' => true,
        ]);

        return $cached;
    }

    $cached['hashValid'] = true;

    $fields = $verification['fields'];
    $authDate = null;
    if (isset($fields['auth_date']) && $fields['auth_date'] !== '') {
        $authDate = (int) $fields['auth_date'];
        if ($authDate <= 0) {
            $authDate = null;
        }
    }

    $cached['authDate'] = $authDate;

    $now = time();
    if ($authDate !== null) {
        if ($authDate > $now + 300) {
            $cached['error'] = 'invalid_auth_date';
            log_docs_event('Telegram init data auth_date is in the future', [
                'source' => $sourceType,
                'authDate' => $authDate,
                'now' => $now,
            ]);

            return $cached;
        }

        if ($authDate < $now - TELEGRAM_INIT_DATA_MAX_AGE) {
            $cached['error'] = 'expired';
            log_docs_event('Telegram init data auth_date expired', [
                'source' => $sourceType,
                'authDate' => $authDate,
                'now' => $now,
            ]);

            return $cached;
        }
    }

    $user = $verification['user'];
    $source = [];

    if (is_array($user)) {
        if (isset($user['id'])) {
            $source['telegram_user_id'] = (string) $user['id'];
        }
        if (!empty($user['username'])) {
            $source['telegram_username'] = (string) $user['username'];
        }

        $nameParts = [];
        if (!empty($user['first_name'])) {
            $nameParts[] = (string) $user['first_name'];
        }
        if (!empty($user['last_name'])) {
            $nameParts[] = (string) $user['last_name'];
        }

        if (!empty($nameParts)) {
            $source['telegram_full_name'] = trim(implode(' ', $nameParts));
        }
    }

    if (!isset($source['telegram_user_id']) || $source['telegram_user_id'] === '') {
        $cached['error'] = 'user_missing';
        log_docs_event('Telegram init data user information missing', [
            'source' => $sourceType,
            'initDataLength' => strlen($initData),
        ]);

        return $cached;
    }

    $cached['source'] = $source;
    $cached['user'] = is_array($user) ? array_filter([
        'id' => isset($user['id']) ? (string) $user['id'] : null,
        'username' => $user['username'] ?? null,
        'firstName' => $user['first_name'] ?? null,
        'lastName' => $user['last_name'] ?? null,
        'languageCode' => $user['language_code'] ?? null,
        'isBot' => isset($user['is_bot']) ? (bool) $user['is_bot'] : null,
    ], static function ($value) {
        return $value !== null && $value !== '';
    }) : null;

    $cached['valid'] = true;

    $logContext = [
        'source' => $sourceType,
        'initDataLength' => strlen($initData),
        'authDate' => $authDate,
        'userId' => $source['telegram_user_id'],
        'usernameProvided' => isset($source['telegram_username']) && $source['telegram_username'] !== '',
        'fullNameProvided' => isset($source['telegram_full_name']) && $source['telegram_full_name'] !== '',
    ];

    if (isset($fields['query_id']) && $fields['query_id'] !== '') {
        $logContext['queryIdPresent'] = true;
    }

    log_docs_event('Telegram init data verified successfully', $logContext);

    return $cached;
}

function docs_current_action(): string
{
    global $docsCurrentAction;

    return isset($docsCurrentAction) && is_string($docsCurrentAction) ? $docsCurrentAction : '';
}

function summarize_response_payload(array $payload): array
{
    $summary = [];

    foreach ($payload as $key => $value) {
        if ($key === 'documents' && is_array($value)) {
            $ids = [];
            foreach (array_slice($value, 0, 5) as $item) {
                if (is_array($item) && isset($item['id'])) {
                    $ids[] = (string) $item['id'];
                }
            }

            $summary[$key] = [
                'count' => count($value),
                'ids' => $ids,
            ];
            continue;
        }

        $summary[$key] = normalize_log_value($value);
    }

    return $summary;
}

function summarize_document_record_for_log(array $record): array
{
    $summary = [];

    if (isset($record['id']) && $record['id'] !== '') {
        $summary['id'] = (string) $record['id'];
    }

    if (isset($record['entryNumber']) && $record['entryNumber'] !== '') {
        $summary['entryNumber'] = (string) $record['entryNumber'];
    }

    if (isset($record['status']) && $record['status'] !== '') {
        $summary['status'] = (string) $record['status'];
    }

    if (isset($record['dueDate']) && $record['dueDate'] !== '') {
        $summary['dueDate'] = (string) $record['dueDate'];
    }

    if (isset($record['organization']) && $record['organization'] !== '') {
        $summary['organization'] = (string) $record['organization'];
    }

    $assignees = docs_extract_assignees($record);
    $primaryAssignee = $assignees[0] ?? [];

    $assigneeName = $primaryAssignee['name'] ?? $primaryAssignee['responsible'] ?? ($record['responsible'] ?? null);
    if (!empty($assigneeName)) {
        $summary['assigneeName'] = (string) $assigneeName;
    }

    if (!empty($assignees)) {
        $summary['assigneesCount'] = count($assignees);
    }

    $assigneeId = null;
    foreach (['id', 'telegram', 'chatId'] as $field) {
        if (!empty($primaryAssignee[$field])) {
            $assigneeId = (string) $primaryAssignee[$field];
            break;
        }
    }

    if ($assigneeId === null && !empty($record['assigneeId'])) {
        $assigneeId = (string) $record['assigneeId'];
    }

    if ($assigneeId !== null) {
        $summary['assigneeId'] = $assigneeId;
    }

    if (isset($record['updatedAt']) && $record['updatedAt'] !== '') {
        $summary['updatedAt'] = (string) $record['updatedAt'];
    }

    if (isset($record['files']) && is_array($record['files'])) {
        $summary['filesCount'] = count($record['files']);
    }

    return $summary;
}

function summarize_documents_collection_for_log(array $records, int $limit = 10): array
{
    $samples = [];
    $total = 0;

    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        $total++;
        if (count($samples) < $limit) {
            $samples[] = summarize_document_record_for_log($record);
        }
    }

    return [
        'count' => $total,
        'samples' => $samples,
    ];
}

function build_document_record_key(array $record): string
{
    if (isset($record['id']) && $record['id'] !== '') {
        return 'id:' . (string) $record['id'];
    }

    if (isset($record['entryNumber']) && $record['entryNumber'] !== '') {
        return 'entry:' . (string) $record['entryNumber'];
    }

    return 'hash:' . md5(json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function get_raw_input(): string
{
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false) {
        $raw = '';
    }

    $cached = $raw;

    return $cached;
}

require_once __DIR__ . '/sanitize.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

register_shutdown_function(static function () use ($preloadedAction): void {
    $error = error_get_last();
    if (!is_array($error)) {
        return;
    }

    $getAction = $_GET['action'] ?? '';
    if (!is_string($getAction)) {
        $getAction = '';
    }

    $resolvedAction = $preloadedAction;
    if ($resolvedAction === '') {
        $resolvedAction = $getAction;
    }

    if ($resolvedAction === '' && isset($_POST['action']) && is_string($_POST['action'])) {
        $resolvedAction = trim($_POST['action']);
    }

    $jsonPayload = [];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $jsonPayload = load_json_payload();
    }

    if ($resolvedAction === '' && isset($jsonPayload['action']) && is_string($jsonPayload['action'])) {
        $resolvedAction = trim($jsonPayload['action']);
    }

    $sessionAuth = docs_get_session_auth();
    $login = is_array($sessionAuth) ? ($sessionAuth['login'] ?? null) : null;
    $organization = is_array($sessionAuth) ? ($sessionAuth['organization'] ?? null) : null;

    $stage = null;
    if (isset($jsonPayload['stage']) && is_string($jsonPayload['stage'])) {
        $stage = $jsonPayload['stage'];
    } elseif (isset($_POST['stage']) && is_string($_POST['stage'])) {
        $stage = $_POST['stage'];
    } elseif (isset($_GET['stage']) && is_string($_GET['stage'])) {
        $stage = $_GET['stage'];
    }

    $context = [
        'message' => $error['message'] ?? 'unknown_error',
        'type' => $error['type'] ?? null,
        'file' => $error['file'] ?? null,
        'line' => $error['line'] ?? null,
        'action' => $resolvedAction,
        'login' => $login,
        'organization' => $organization,
        'getAction' => $getAction,
        'session' => $_SESSION ?? [],
        'post' => is_array($_POST) ? $_POST : [],
        'json' => $jsonPayload,
    ];

    if ($stage !== null && $stage !== '') {
        $context['stage'] = $stage;
    }

    docs_log_auth_attempt('shutdown_error', $context);
});

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if (!is_dir(DOCUMENTS_ROOT)) {
    mkdir(DOCUMENTS_ROOT, 0775, true);
}

$action = $preloadedAction;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
$rawBodyForLog = '';
if ($action === '' && stripos($contentType, 'application/json') !== false) {
    $rawBodyForLog = get_raw_input();
    if ((!is_string($action) || $action === '') && $rawBodyForLog !== '') {
        $decodedForAction = json_decode($rawBodyForLog, true);
        if (is_array($decodedForAction) && isset($decodedForAction['action'])) {
            $action = (string) $decodedForAction['action'];
        }
    }
}

if (!is_string($action)) {
    $action = '';
} else {
    $action = trim($action);
}

$docsCurrentAction = $action;

$filesSummary = [];
if (!empty($_FILES) && is_array($_FILES)) {
    foreach ($_FILES as $key => $fileInfo) {
        if (!is_array($fileInfo)) {
            continue;
        }

        $filesSummary[$key] = [
            'name' => $fileInfo['name'] ?? null,
            'type' => $fileInfo['type'] ?? null,
            'error' => $fileInfo['error'] ?? null,
            'size' => $fileInfo['size'] ?? null,
        ];
    }
}

$requestOverview = function_exists('bot_auth_get_request_overview')
    ? bot_auth_get_request_overview()
    : null;

$logContext = [
    'action' => $action,
    'method' => $method,
    'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
    'user' => $_SERVER['PHP_AUTH_USER'] ?? null,
    'query' => $_GET,
    'post' => $_POST,
    'rawBody' => $rawBodyForLog,
    'files' => $filesSummary,
    'contentType' => $contentType,
];

if (is_array($requestOverview)) {
    $logContext['requestOverview'] = $requestOverview;
}

log_docs_event('Request received', $logContext);

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function respond_error(string $message, int $status = 400, array $extra = []): void
{
    log_docs_event('Error response', [
        'status' => $status,
        'message' => $message,
        'extra' => $extra,
        'action' => docs_current_action(),
    ]);
    $action = docs_current_action();
    if ($action === 'mini_app_update_task' || $action === 'mini_app_log') {
        docs_log_file_debug('Mini app error response', [
            'status' => $status,
            'message' => $message,
            'extra' => $extra,
            'action' => $action,
        ]);
    }

    respond(array_merge(['success' => false, 'error' => $message], $extra), $status);
}

function respond_success(array $payload = []): void
{
    log_docs_event('Success response', [
        'status' => 200,
        'action' => docs_current_action(),
        'payload' => summarize_response_payload($payload),
    ]);

    respond(array_merge(['success' => true], $payload));
}

function respond_success_with_background_task(array $payload, callable $backgroundTask): void
{
    log_docs_event('Success response', [
        'status' => 200,
        'action' => docs_current_action(),
        'payload' => summarize_response_payload($payload),
    ]);

    if (!function_exists('fastcgi_finish_request')) {
        log_docs_event('Background task skipped: fastcgi_finish_request unavailable', [
            'action' => docs_current_action(),
        ]);
        respond(array_merge(['success' => true], $payload));
    }

    http_response_code(200);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(array_merge(['success' => true], $payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    fastcgi_finish_request();
    $backgroundTask();
    exit;
}

function docs_collect_login_response_diagnostics(array $sessionSummary, string $stage): array
{
    $setCookieHeader = null;
    if (function_exists('headers_list')) {
        foreach (headers_list() as $header) {
            if (stripos($header, 'Set-Cookie:') === 0) {
                $setCookieHeader = $header;
                break;
            }
        }
    }

    return [
        'stage' => $stage,
        'sessionId' => session_id(),
        'sessionStatus' => session_status(),
        'sessionAuthenticated' => $sessionSummary['authenticated'] ?? null,
        'sessionAccessGranted' => $sessionSummary['accessGranted'] ?? null,
        'sessionRole' => $sessionSummary['role'] ?? null,
        'sessionOrganization' => $sessionSummary['organization'] ?? null,
        'setCookiePresent' => $setCookieHeader !== null,
        'setCookieHeader' => $setCookieHeader,
    ];
}

function load_json_payload(): array
{
    $raw = get_raw_input();
    if (trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return [];
    }

    return $data;
}

function sanitize_text_field(?string $value, int $maxLength = 500): string
{
    if ($value === null) {
        return '';
    }

    $value = trim($value);
    if ($value === '') {
        return '';
    }

    $value = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value);
    $value = preg_replace('/\s+/u', ' ', $value);

    if ($maxLength > 0 && mb_strlen($value) > $maxLength) {
        $value = mb_substr($value, 0, $maxLength);
    }

    return $value;
}

function sanitize_date_field(?string $value): string
{
    if ($value === null) {
        return '';
    }

    $value = trim($value);
    if ($value === '') {
        return '';
    }

    $date = DateTime::createFromFormat('Y-m-d', $value);
    if ($date === false) {
        return '';
    }

    return $date->format('Y-m-d');
}

function docs_normalize_uploaded_filename(?string $name): string
{
    if ($name === null) {
        return 'attachment';
    }

    $normalized = trim((string) $name);
    if ($normalized === '') {
        return 'attachment';
    }

    $converted = @iconv('UTF-8', 'UTF-8//IGNORE', $normalized);
    if (is_string($converted)) {
        $normalized = $converted;
    }

    $normalized = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $normalized) ?? '';
    $normalized = preg_replace('/\s+/u', ' ', $normalized) ?? '';
    $normalized = trim($normalized);

    return $normalized !== '' ? $normalized : 'attachment';
}

function sanitize_status(?string $value, bool $useDefault = false): string
{
    $value = sanitize_text_field($value, 80);
    if ($value === '') {
        return $useDefault ? 'Принято в работу' : '';
    }

    $normalized = mb_strtolower($value);
    $map = [
        'в работе'        => 'Принято в работу',
        'принято в работу'=> 'Принято в работу',
        'принято вработу' => 'Принято в работу',
        'принято в работ' => 'Принято в работу',
        'распределено'    => 'Распределено',
        'распределен'     => 'Распределено',
        'распределена'    => 'Распределено',
        'распределены'    => 'Распределено',
        'на контроле'     => 'На проверке',
        'на проверке'     => 'На проверке',
        'на проверку'     => 'На проверке',
        'завершено'       => 'Выполнено',
        'выполнено'       => 'Выполнено',
        'отменено'        => 'Отменено',
    ];

    if (isset($map[$normalized])) {
        return $map[$normalized];
    }

    return mb_convert_case($normalized, MB_CASE_TITLE, 'UTF-8');
}

function docs_init_status_counters(): array
{
    return [
        'distributed' => 0,
        'accepted' => 0,
        'review' => 0,
        'done' => 0,
        'cancelled' => 0,
    ];
}

function docs_status_key_from_status($status): ?string
{
    if ($status === null) {
        return null;
    }

    $raw = trim((string) $status);
    if ($raw === '') {
        return null;
    }

    $sanitized = sanitize_status($raw);
    $normalized = mb_strtolower($sanitized, 'UTF-8');

    switch ($normalized) {
        case 'распределено':
            return 'distributed';
        case 'принято в работу':
            return 'accepted';
        case 'на проверке':
            return 'review';
        case 'выполнено':
            return 'done';
        case 'отменено':
            return 'cancelled';
        default:
            return null;
    }
}

function docs_normalize_datetime_iso(?string $value): ?string
{
    if ($value === null) {
        return null;
    }

    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }

    try {
        $date = new DateTime($raw);
        return $date->format(DateTime::ATOM);
    } catch (Exception $exception) {
        return null;
    }
}

function docs_sanitize_filename(string $name, string $default = 'document.pdf'): string
{
    $candidate = trim($name);
    if ($candidate === '') {
        $candidate = $default;
    }

    $candidate = preg_replace('/[\x00-\x1F\x7F]+/u', '', $candidate);
    $candidate = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '_', $candidate);
    $candidate = preg_replace('/\s+/u', '_', $candidate);

    if ($candidate === '' || $candidate === '_') {
        $candidate = $default;
    }

    if (mb_strlen($candidate, 'UTF-8') > 200) {
        $candidate = mb_substr($candidate, 0, 200, 'UTF-8');
    }

    return $candidate;
}

function docs_get_pdf_cache_directory(): string
{
    static $ensured = false;

    if (!is_dir(MINI_APP_PDF_CACHE_DIRECTORY)) {
        $created = @mkdir(MINI_APP_PDF_CACHE_DIRECTORY, 0775, true);
        if (!$created) {
            log_docs_event('Mini app PDF cache directory unavailable', [
                'directory' => MINI_APP_PDF_CACHE_DIRECTORY,
                'exists' => is_dir(MINI_APP_PDF_CACHE_DIRECTORY),
                'writable' => is_writable(dirname(MINI_APP_PDF_CACHE_DIRECTORY)),
            ]);
        }
    }

    if (!$ensured && is_dir(MINI_APP_PDF_CACHE_DIRECTORY)) {
        $ensured = true;
        log_docs_event('Mini app PDF cache directory ready', [
            'directory' => MINI_APP_PDF_CACHE_DIRECTORY,
        ]);
    }

    return MINI_APP_PDF_CACHE_DIRECTORY;
}

function docs_cleanup_pdf_cache(string $directory, int $maxAge = MINI_APP_PDF_CACHE_TTL): void
{
    if (!is_dir($directory)) {
        return;
    }

    $now = time();
    $handle = @opendir($directory);
    if ($handle === false) {
        return;
    }

    while (($entry = readdir($handle)) !== false) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $path = $directory . '/' . $entry;
        if (!is_file($path)) {
            continue;
        }

        $mtime = @filemtime($path);
        if ($mtime === false) {
            continue;
        }

        if ($now - $mtime > $maxAge) {
            @unlink($path);
        }
    }

    closedir($handle);
}

function docs_build_public_pdf_url(string $fileName): string
{
    $safeName = ltrim($fileName, '/');

    return '/cache/miniapp_pdf/' . rawurlencode($safeName);
}

function sanitize_folder_name(string $name): string
{
    $candidate = preg_replace('/[^\p{L}\p{N}\s._-]/u', '', $name);
    $candidate = preg_replace('/\s+/u', '_', trim((string) $candidate));

    if ($candidate === '') {
        $candidate = 'organization_' . substr(sha1($name), 0, 8);
    }

    return $candidate;
}

function get_registry_path(string $folder): string
{
    return DOCUMENTS_ROOT . '/' . $folder . '/' . REGISTRY_FILENAME;
}

function get_settings_path(string $folder): string
{
    return DOCUMENTS_ROOT . '/' . $folder . '/' . SETTINGS_FILENAME;
}

function docs_sanitize_admin_object_name(string $organization): string
{
    $sanitized = preg_replace('/[^a-zA-Z0-9А-Яа-яЁё._-]/u', '_', $organization);

    if (!is_string($sanitized) || $sanitized === '') {
        $sanitized = sanitize_folder_name($organization);
    }

    return $sanitized;
}

function ensure_organization_directory(string $folder): string
{
    $dir = DOCUMENTS_ROOT . '/' . $folder;
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    return $dir;
}


function docs_get_responses_root(string $folder, bool $create = true): string
{
    $dir = ensure_organization_directory($folder) . '/Ответы';
    if ($create && !is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    return $dir;
}

function docs_get_document_responses_dir(string $folder, string $documentId, bool $create = true): string
{
    $safeDocumentId = preg_replace('/[^A-Za-z0-9._-]/', '_', trim($documentId));
    if (!is_string($safeDocumentId) || $safeDocumentId === '') {
        $safeDocumentId = 'document';
    }

    $dir = docs_get_responses_root($folder, $create) . '/' . $safeDocumentId;
    if ($create && !is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    return $dir;
}

function docs_delete_directory_recursive(string $path): void
{
    if ($path === '' || !file_exists($path)) {
        return;
    }

    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }

    $items = @scandir($path);
    if (is_array($items)) {
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            docs_delete_directory_recursive($path . '/' . $item);
        }
    }

    @rmdir($path);
}

function docs_resolve_current_user_key(array $requestContext, ?array $sessionAuth = null): string
{
    $user = isset($requestContext['user']) && is_array($requestContext['user']) ? $requestContext['user'] : [];
    $candidates = [
        ['id', $user['id'] ?? ($requestContext['primaryId'] ?? null)],
        ['login', $user['login'] ?? ($sessionAuth['login'] ?? null)],
        ['username', $user['username'] ?? null],
        ['name', $user['fullName'] ?? ($sessionAuth['fullName'] ?? null)],
    ];

    foreach ($candidates as [$prefix, $value]) {
        if ($value === null) {
            continue;
        }
        $normalized = trim((string) $value);
        if ($normalized !== '') {
            return $prefix . ':' . mb_strtolower($normalized, 'UTF-8');
        }
    }

    return '';
}

function docs_is_current_user_response_owner(array $response, array $requestContext, ?array $sessionAuth = null): bool
{
    $ownerKey = sanitize_text_field((string) ($response['uploadedByKey'] ?? ''), 200);
    $ownerKeyNormalized = $ownerKey !== '' ? mb_strtolower(trim($ownerKey), 'UTF-8') : '';

    $currentUserKey = docs_resolve_current_user_key($requestContext, $sessionAuth);
    $currentUserKeyNormalized = $currentUserKey !== '' ? mb_strtolower(trim($currentUserKey), 'UTF-8') : '';

    if ($ownerKeyNormalized !== '' && $currentUserKeyNormalized !== '' && $ownerKeyNormalized === $currentUserKeyNormalized) {
        return true;
    }

    $ownerName = docs_normalize_name_candidate_value($response['uploadedBy'] ?? '');
    if ($ownerName === '') {
        return false;
    }

    $nameCandidates = [];
    $pushNameCandidate = static function ($value) use (&$nameCandidates): void {
        $normalized = docs_normalize_name_candidate_value($value);
        if ($normalized !== '') {
            $nameCandidates[$normalized] = true;
        }
    };

    $user = isset($requestContext['user']) && is_array($requestContext['user']) ? $requestContext['user'] : [];
    $pushNameCandidate($user['fullName'] ?? null);
    $pushNameCandidate($user['username'] ?? null);
    $pushNameCandidate($sessionAuth['fullName'] ?? null);
    $pushNameCandidate($sessionAuth['login'] ?? null);
    $pushNameCandidate($user['id'] ?? ($requestContext['primaryId'] ?? null));

    return isset($nameCandidates[$ownerName]);
}

function docs_resolve_current_user_label(array $requestContext, ?array $sessionAuth = null): string
{
    $user = isset($requestContext['user']) && is_array($requestContext['user']) ? $requestContext['user'] : [];
    $candidates = [
        $user['fullName'] ?? null,
        $sessionAuth['fullName'] ?? null,
        $user['login'] ?? null,
        $sessionAuth['login'] ?? null,
        $user['username'] ?? null,
        $requestContext['primaryId'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        $value = trim((string) ($candidate ?? ''));
        if ($value !== '') {
            return sanitize_text_field($value, 200);
        }
    }

    return 'Пользователь';
}

function docs_resolve_response_upload_author(string $folder, array $requestContext, ?array $sessionAuth = null): array
{
    $defaultKey = docs_resolve_current_user_key($requestContext, $sessionAuth);
    $defaultLabel = docs_resolve_current_user_label($requestContext, $sessionAuth);

    $postLabel = sanitize_text_field((string) ($_POST['uploadedBy'] ?? ''), 200);
    $postKey = sanitize_text_field((string) ($_POST['uploadedByKey'] ?? ''), 200);
    if ($postLabel !== '') {
        return [
            'label' => $postLabel,
            'key' => $postKey !== '' ? $postKey : $defaultKey,
            'source' => 'post',
            'telegramUserId' => '',
            'matchedResponsible' => null,
        ];
    }

    $telegramCandidates = [];
    $pushTelegramCandidate = static function ($value) use (&$telegramCandidates): void {
        $normalized = normalize_identifier_value($value);
        if ($normalized === '') {
            return;
        }
        $telegramCandidates[$normalized] = true;
    };

    $pushTelegramCandidate($requestContext['raw']['telegram_user_id'] ?? '');
    $pushTelegramCandidate($requestContext['primaryId'] ?? '');
    if (isset($requestContext['user']) && is_array($requestContext['user'])) {
        $pushTelegramCandidate($requestContext['user']['id'] ?? '');
    }

    $responsibles = load_responsibles_for_folder($folder);
    foreach (array_keys($telegramCandidates) as $telegramCandidate) {
        $matchedEntry = docs_find_responsible_by_candidate($responsibles, $telegramCandidate);
        if (!is_array($matchedEntry)) {
            continue;
        }

        $responsibleName = sanitize_text_field((string) ($matchedEntry['responsible'] ?? ''), 200);
        if ($responsibleName === '') {
            continue;
        }

        return [
            'label' => $responsibleName,
            'key' => $defaultKey !== '' ? $defaultKey : ('name:' . mb_strtolower($responsibleName, 'UTF-8')),
            'source' => 'settingsdocs',
            'telegramUserId' => $telegramCandidate,
            'matchedResponsible' => $responsibleName,
        ];
    }

    return [
        'label' => $defaultLabel,
        'key' => $defaultKey !== '' ? $defaultKey : ('name:' . mb_strtolower($defaultLabel, 'UTF-8')),
        'source' => 'fallback',
        'telegramUserId' => '',
        'matchedResponsible' => null,
    ];
}

function docs_normalize_response_file_name(string $original, array $record, int $sequence = 1): string
{
    $base = normalize_file_name($original, $record, $sequence);
    return 'answer.' . $base;
}

function docs_is_text_response_file(string $fileName): bool
{
    $extension = mb_strtolower((string) pathinfo($fileName, PATHINFO_EXTENSION), 'UTF-8');
    return $extension === 'txt';
}

function docs_extract_pure_response_text(string $rawText): string
{
    $normalized = str_replace("\r\n", "\n", str_replace("\r", "\n", $rawText));
    $normalized = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $normalized) ?? '';
    if ($normalized === '') {
        return '';
    }

    $trimmed = trim($normalized);
    if ($trimmed === '') {
        return '';
    }

    $parts = preg_split('/\nОтвет к задаче\s*\n/u', "\n" . $trimmed, -1, PREG_SPLIT_NO_EMPTY);
    $candidate = is_array($parts) && !empty($parts)
        ? (string) $parts[count($parts) - 1]
        : $trimmed;

    $candidate = preg_replace('/^\s*Ответ к задаче\s*\n/u', '', $candidate) ?? $candidate;
    $candidate = preg_replace('/^\s*Дата:\s*.*\n/u', '', $candidate) ?? $candidate;
    $candidate = preg_replace('/^\s*Пользователь:\s*.*\n/u', '', $candidate) ?? $candidate;
    $candidate = preg_replace('/^\s*-{3,}\s*\n/u', '', $candidate) ?? $candidate;
    $candidate = trim((string) $candidate);

    return $candidate !== '' ? $candidate : $trimmed;
}

function docs_read_response_text_content(string $folder, string $documentId, string $storedName): string
{
    if ($documentId === '' || $storedName === '' || !docs_is_text_response_file($storedName)) {
        return '';
    }

    $path = docs_get_document_responses_dir($folder, $documentId, false) . '/' . $storedName;
    if (!is_file($path)) {
        return '';
    }

    $maxBytes = 262144;
    $raw = @file_get_contents($path, false, null, 0, $maxBytes);
    if (!is_string($raw) || $raw === '') {
        return '';
    }

    $clean = docs_extract_pure_response_text($raw);
    if ($clean === '') {
        return '';
    }

    if (mb_strlen($clean, 'UTF-8') > 12000) {
        $clean = mb_substr($clean, 0, 12000, 'UTF-8');
    }

    return $clean;
}

function docs_prepare_responses_for_record(array &$record, string $folder): void
{
    if (!isset($record['responses']) || !is_array($record['responses'])) {
        $record['responses'] = [];
        return;
    }

    $documentId = isset($record['id']) ? trim((string) $record['id']) : '';
    $prepared = [];

    foreach ($record['responses'] as $response) {
        if (!is_array($response)) {
            continue;
        }

        $storedName = isset($response['storedName']) ? sanitize_text_field((string) $response['storedName'], 255) : '';
        if ($storedName === '') {
            continue;
        }

        $item = [
            'originalName' => sanitize_text_field((string) ($response['originalName'] ?? $storedName), 255),
            'storedName' => $storedName,
            'size' => isset($response['size']) ? (int) $response['size'] : 0,
            'uploadedAt' => isset($response['uploadedAt']) ? (string) $response['uploadedAt'] : '',
            'uploadedBy' => sanitize_text_field((string) ($response['uploadedBy'] ?? ''), 200),
            'uploadedByKey' => sanitize_text_field((string) ($response['uploadedByKey'] ?? ''), 200),
        ];

        if ($documentId !== '') {
            $item['url'] = build_public_path($folder, 'Ответы/' . $documentId . '/' . $storedName);
        }
        if (docs_is_text_response_file($storedName)) {
            $item['isTextFile'] = true;
            $item['textContent'] = docs_read_response_text_content($folder, $documentId, $storedName);
        }

        $prepared[] = $item;
    }

    $record['responses'] = array_values($prepared);
}

function docs_get_mini_app_user_log_path(string $folder): string
{
    return DOCUMENTS_ROOT . '/' . $folder . '/' . MINI_APP_USER_LOG_FILENAME;
}

function docs_load_mini_app_user_log(string $folder): array
{
    $path = docs_get_mini_app_user_log_path($folder);
    $entries = [];
    $updatedAt = null;

    if (is_file($path)) {
        $raw = @file_get_contents($path);
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                foreach ($decoded as $entry) {
                    if (!is_array($entry)) {
                        continue;
                    }

                    $id = normalize_identifier_value($entry['id'] ?? '');
                    if ($id === '') {
                        continue;
                    }

                    $entries[] = array_filter([
                        'id' => $id,
                        'fullName' => sanitize_text_field($entry['fullName'] ?? '', 200),
                        'username' => sanitize_text_field($entry['username'] ?? '', 100),
                        'lastSeen' => isset($entry['lastSeen']) ? (string) $entry['lastSeen'] : '',
                    ], static function ($value) {
                        return $value !== '';
                    });
                }
            }
        }

        $mtime = @filemtime($path);
        if ($mtime !== false) {
            $updatedAt = date('c', $mtime);
        }
    }

    return [
        'entries' => $entries,
        'updatedAt' => $updatedAt,
        'path' => $path,
    ];
}

function docs_write_mini_app_user_log(string $folder, array $entries): void
{
    $directory = ensure_organization_directory($folder);
    $path = rtrim($directory, '/\\') . '/' . MINI_APP_USER_LOG_FILENAME;
    $encoded = json_encode($entries, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($encoded === false) {
        return;
    }

    @file_put_contents($path, $encoded . PHP_EOL, LOCK_EX);
    @chmod($path, 0644);
}

function docs_register_mini_app_user_visit(string $organizationName, string $folder, array $requestContext): void
{
    $userId = '';
    $fullName = '';
    $username = '';

    if (isset($requestContext['user']) && is_array($requestContext['user'])) {
        $userId = normalize_identifier_value($requestContext['user']['id'] ?? '');
        $fullName = sanitize_text_field($requestContext['user']['fullName'] ?? '', 200);
        $firstName = sanitize_text_field($requestContext['user']['firstName'] ?? '', 120);
        $lastName = sanitize_text_field($requestContext['user']['lastName'] ?? '', 120);
        if ($fullName === '' && ($firstName !== '' || $lastName !== '')) {
            $parts = array_filter([$lastName, $firstName], static function ($value): bool {
                return $value !== '';
            });
            $fullName = implode(' ', $parts);
        }
        $username = sanitize_text_field($requestContext['user']['username'] ?? '', 120);
    }

    if ($userId === '' && !empty($requestContext['primaryId'])) {
        $userId = normalize_identifier_value((string) $requestContext['primaryId']);
    }

    if ($fullName === '' && isset($requestContext['raw']['telegram_full_name'])) {
        $fullName = sanitize_text_field((string) $requestContext['raw']['telegram_full_name'], 200);
    }

    if ($username === '' && isset($requestContext['raw']['telegram_username'])) {
        $username = sanitize_text_field((string) $requestContext['raw']['telegram_username'], 120);
    }

    if ($userId === '') {
        return;
    }

    if ($fullName === '') {
        $fullName = 'Без имени';
    }

    $log = docs_load_mini_app_user_log($folder);
    $entries = [];
    foreach ($log['entries'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $entryId = normalize_identifier_value($entry['id'] ?? '');
        if ($entryId === '') {
            continue;
        }

        $existing = ['id' => $entryId];
        $existingName = sanitize_text_field($entry['fullName'] ?? '', 200);
        if ($existingName !== '') {
            $existing['fullName'] = $existingName;
        }
        $existingUsername = sanitize_text_field($entry['username'] ?? '', 120);
        if ($existingUsername !== '') {
            $existing['username'] = ltrim($existingUsername, '@');
        }
        if (!empty($entry['lastSeen'])) {
            $existing['lastSeen'] = (string) $entry['lastSeen'];
        }

        $entries[$entryId] = $existing;
    }

    $now = date('c');
    $current = $entries[$userId] ?? ['id' => $userId];
    if ($fullName !== '' && $fullName !== 'Без имени') {
        $current['fullName'] = $fullName;
    } elseif (empty($current['fullName'])) {
        $current['fullName'] = 'Без имени';
    }
    if ($username !== '') {
        $current['username'] = ltrim($username, '@');
    } elseif (isset($current['username']) && $current['username'] === '') {
        unset($current['username']);
    }
    $current['lastSeen'] = $now;

    $entries[$userId] = $current;

    $sorted = array_values($entries);
    usort($sorted, static function (array $a, array $b): int {
        $nameA = mb_strtolower((string) ($a['fullName'] ?? ''), 'UTF-8');
        $nameB = mb_strtolower((string) ($b['fullName'] ?? ''), 'UTF-8');

        if ($nameA === $nameB) {
            return strcmp((string) ($a['id'] ?? ''), (string) ($b['id'] ?? ''));
        }

        if ($nameA === '') {
            return 1;
        }

        if ($nameB === '') {
            return -1;
        }

        return strcmp($nameA, $nameB);
    });

    docs_write_mini_app_user_log($folder, $sorted);

    log_docs_event('Mini app user visit recorded', [
        'organization' => $organizationName,
        'folder' => $folder,
        'userId' => $userId,
        'fullName' => $fullName,
        'username' => $username,
        'entriesCount' => count($sorted),
    ]);
}

function docs_collect_view_candidate_keys(array $requestContext, array $details): array
{
    $idCandidates = [];
    $nameCandidates = [];

    $addIdCandidate = static function ($value) use (&$idCandidates): void {
        $normalized = docs_normalize_identifier_candidate_value($value ?? '');
        if ($normalized !== '') {
            $idCandidates[$normalized] = true;
        }
    };

    $addNameCandidate = static function ($value) use (&$nameCandidates): void {
        $normalized = docs_normalize_name_candidate_value($value ?? '');
        if ($normalized !== '') {
            $nameCandidates[$normalized] = true;
        }
    };

    $addIdCandidate($requestContext['primaryId'] ?? '');
    $addNameCandidate($requestContext['primaryId'] ?? '');
    $addIdCandidate($requestContext['identity'] ?? '');

    if (isset($requestContext['user']) && is_array($requestContext['user'])) {
        $addIdCandidate($requestContext['user']['id'] ?? '');
        $addIdCandidate($requestContext['user']['username'] ?? '');
        $addNameCandidate($requestContext['user']['fullName'] ?? '');
        $addNameCandidate($requestContext['user']['firstName'] ?? '');
        $addNameCandidate($requestContext['user']['lastName'] ?? '');
    }

    if (isset($requestContext['raw']) && is_array($requestContext['raw'])) {
        $addIdCandidate($requestContext['raw']['telegram_user_id'] ?? '');
        $addIdCandidate($requestContext['raw']['telegram_username'] ?? '');
        $addIdCandidate($requestContext['raw']['telegram_chat_id'] ?? '');
        $addNameCandidate($requestContext['raw']['telegram_full_name'] ?? '');
    }

    $addIdCandidate($details['assigneeId'] ?? '');
    $addIdCandidate($details['viewerId'] ?? '');
    $addIdCandidate($details['id'] ?? '');
    $addIdCandidate($details['telegram'] ?? '');
    $addIdCandidate($details['chatId'] ?? '');
    $addIdCandidate($details['login'] ?? '');
    $addNameCandidate($details['viewerName'] ?? '');
    $addNameCandidate($details['name'] ?? '');
    $addNameCandidate($details['fullName'] ?? '');

    $keys = [];

    $assigneeKeyCandidate = $details['assigneeKey'] ?? '';
    if (is_string($assigneeKeyCandidate)) {
        $assigneeKeyCandidate = trim($assigneeKeyCandidate);
        if ($assigneeKeyCandidate !== '') {
            $normalizedAssigneeKey = mb_strtolower($assigneeKeyCandidate, 'UTF-8');
            $keys[] = $normalizedAssigneeKey;
        }
    }

    foreach (array_keys($idCandidates) as $candidate) {
        $keys[] = 'id::' . $candidate;
    }

    foreach (array_keys($nameCandidates) as $candidate) {
        $keys[] = 'name::' . $candidate;
    }

    $viewerRoleCandidate = $details['viewerRole'] ?? ($details['role'] ?? '');
    if (is_string($viewerRoleCandidate) && docs_normalize_assignment_role($viewerRoleCandidate) === 'admin') {
        $keys[] = 'role::admin';
    }

    return $keys;
}

function docs_sanitize_assignee_view_entry($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $entry = [
        'assigneeKey' => sanitize_text_field($value['assigneeKey'] ?? '', 200),
        'id' => sanitize_text_field($value['id'] ?? '', 160),
        'name' => sanitize_text_field($value['name'] ?? '', 200),
        'viewedAt' => sanitize_text_field($value['viewedAt'] ?? '', 40),
    ];

    $entry = array_filter($entry, static function ($item) {
        return $item !== '';
    });

    return empty($entry) ? [] : $entry;
}

function docs_sanitize_assignee_views_payload($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $result = [];
    foreach ($value as $entry) {
        $sanitized = docs_sanitize_assignee_view_entry($entry);
        if (!empty($sanitized)) {
            $result[] = $sanitized;
        }
    }

    return $result;
}

function docs_collect_status_change_candidate_keys(array $requestContext, ?array $sessionAuth, string $statusChangeAuthor): array
{
    $candidates = [];

    $append = static function (string $key) use (&$candidates): void {
        if ($key === '') {
            return;
        }
        $candidates[$key] = true;
    };

    $viewKeys = docs_collect_view_candidate_keys($requestContext, ['viewerName' => $statusChangeAuthor]);
    foreach ($viewKeys as $key) {
        $append($key);
    }

    if (is_array($sessionAuth)) {
        foreach (['telegramId', 'chatId', 'responsibleNumber', 'login'] as $field) {
            if (empty($sessionAuth[$field])) {
                continue;
            }
            $normalized = docs_normalize_identifier_candidate_value($sessionAuth[$field]);
            if ($normalized !== '') {
                $append('id::' . $normalized);
            }
        }

        if (!empty($sessionAuth['fullName'])) {
            $normalized = docs_normalize_name_candidate_value($sessionAuth['fullName']);
            if ($normalized !== '') {
                $append('name::' . $normalized);
            }
        }

        if (!empty($sessionAuth['login'])) {
            $normalized = docs_normalize_name_candidate_value($sessionAuth['login']);
            if ($normalized !== '') {
                $append('name::' . $normalized);
            }
        }
    }

    $normalizedAuthor = docs_normalize_name_candidate_value($statusChangeAuthor);
    if ($normalizedAuthor !== '') {
        $append('name::' . $normalizedAuthor);
    }

    $normalizedIdentifier = docs_normalize_identifier_candidate_value($statusChangeAuthor);
    if ($normalizedIdentifier !== '') {
        $append('id::' . $normalizedIdentifier);
    }

    return array_keys($candidates);
}

function docs_sanitize_assignee_status_history_entry($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $status = sanitize_status($value['status'] ?? '', false);
    $timestamp = docs_normalize_datetime_iso($value['changedAt'] ?? null);
    if ($status === '' || $timestamp === null) {
        return [];
    }

    $entry = [
        'status' => $status,
        'changedAt' => $timestamp,
    ];

    $author = sanitize_text_field($value['changedBy'] ?? '', 200);
    if ($author !== '') {
        $entry['changedBy'] = $author;
    }

    return $entry;
}

function docs_sanitize_assignee_status_history_record($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $assigneeKey = sanitize_text_field($value['assigneeKey'] ?? '', 200);
    if ($assigneeKey === '') {
        return [];
    }

    $entries = [];
    if (isset($value['entries']) && is_array($value['entries'])) {
        foreach ($value['entries'] as $entry) {
            $sanitized = docs_sanitize_assignee_status_history_entry($entry);
            if (!empty($sanitized)) {
                $entries[] = $sanitized;
            }
        }
    }

    if (empty($entries)) {
        return [];
    }

    usort($entries, static function ($a, $b) {
        return strcmp($a['changedAt'], $b['changedAt']);
    });

    $deduplicated = [];
    foreach ($entries as $entry) {
        $key = $entry['changedAt'] . '|' . $entry['status'];
        if (isset($deduplicated[$key])) {
            if (!empty($entry['changedBy']) && empty($deduplicated[$key]['changedBy'])) {
                $deduplicated[$key]['changedBy'] = $entry['changedBy'];
            }
            continue;
        }
        $deduplicated[$key] = $entry;
    }

    return [
        'assigneeKey' => $assigneeKey,
        'entries' => array_values($deduplicated),
    ];
}

function docs_sanitize_assignee_status_history_collection($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $result = [];
    foreach ($value as $record) {
        $sanitized = docs_sanitize_assignee_status_history_record($record);
        if (!empty($sanitized)) {
            $result[] = $sanitized;
        }
    }

    if (empty($result)) {
        return [];
    }

    usort($result, static function ($a, $b) {
        return strcmp(mb_strtolower($a['assigneeKey'], 'UTF-8'), mb_strtolower($b['assigneeKey'], 'UTF-8'));
    });

    return $result;
}

function docs_sanitize_assignee_status_history_entry_collection($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $entries = [];
    foreach ($value as $entry) {
        $sanitized = docs_sanitize_assignee_status_history_entry($entry);
        if (!empty($sanitized)) {
            $entries[] = $sanitized;
        }
    }

    if (empty($entries)) {
        return [];
    }

    usort($entries, static function ($a, $b) {
        return strcmp($a['changedAt'], $b['changedAt']);
    });

    $deduplicated = [];
    foreach ($entries as $entry) {
        $key = $entry['changedAt'] . '|' . $entry['status'];
        if (isset($deduplicated[$key])) {
            if (!empty($entry['changedBy']) && empty($deduplicated[$key]['changedBy'])) {
                $deduplicated[$key]['changedBy'] = $entry['changedBy'];
            }
            continue;
        }
        $deduplicated[$key] = $entry;
    }

    return array_values($deduplicated);
}

function docs_register_task_view_event(string $organizationName, string $documentId, array $requestContext, array $details = []): array
{
    $result = [
        'recorded' => false,
        'alreadyRecorded' => false,
    ];

    $organization = docs_normalize_organization_candidate($organizationName);
    $documentId = sanitize_text_field($documentId, 200);

    if ($organization === '' || $documentId === '') {
        return $result;
    }

    $folder = sanitize_folder_name($organization);
    $records = load_registry($folder);
    $recordIndex = null;

    foreach ($records as $index => $record) {
        if (!is_array($record) || !isset($record['id'])) {
            continue;
        }

        if ((string) $record['id'] === $documentId) {
            $recordIndex = $index;
            break;
        }
    }

    if ($recordIndex === null) {
        docs_log_view_status_event('documents:register_view document_not_found', [
            'organization' => $organization,
            'documentId' => $documentId,
        ]);
        return $result;
    }

    $assignees = docs_extract_view_participants($records[$recordIndex]);
    if (empty($assignees)) {
        docs_log_view_status_event('documents:register_view no_assignees', [
            'organization' => $organization,
            'documentId' => $documentId,
        ]);
        return $result;
    }

    $assigneeIndex = docs_index_assignees($assignees);
    if (empty($assigneeIndex)) {
        docs_log_view_status_event('documents:register_view assignee_index_empty', [
            'organization' => $organization,
            'documentId' => $documentId,
            'assigneesCount' => count($assignees),
        ]);
        return $result;
    }

    $candidateKeys = docs_collect_view_candidate_keys($requestContext, $details);
    $assigneeKeys = array_keys($assigneeIndex);
    docs_log_view_status_event('documents:register_view candidates', [
        'organization' => $organization,
        'documentId' => $documentId,
        'candidateKeysCount' => count($candidateKeys),
        'candidateKeysSample' => array_slice($candidateKeys, 0, 12),
        'assigneeKeysCount' => count($assigneeKeys),
        'assigneeKeysSample' => array_slice($assigneeKeys, 0, 12),
    ]);
    $matchedKey = '';
    $matchedAssignee = null;

    foreach ($candidateKeys as $candidateKey) {
        if (isset($assigneeIndex[$candidateKey])) {
            $matchedKey = $candidateKey;
            $matchedAssignee = $assigneeIndex[$candidateKey];
            break;
        }
    }

    if ($matchedAssignee === null) {
        $rawContext = isset($requestContext['raw']) && is_array($requestContext['raw'])
            ? $requestContext['raw']
            : [];
        $userContext = isset($requestContext['user']) && is_array($requestContext['user'])
            ? $requestContext['user']
            : [];
        $userSummary = [
            'primaryId' => $requestContext['primaryId'] ?? null,
            'identity' => $requestContext['identity'] ?? null,
            'telegramUserId' => $rawContext['telegram_user_id'] ?? null,
            'telegramUsername' => $rawContext['telegram_username'] ?? null,
            'user' => [
                'id' => $userContext['id'] ?? null,
                'username' => $userContext['username'] ?? null,
                'fullName' => $userContext['fullName'] ?? null,
            ],
        ];
        docs_log_view_status_event('documents:register_view no_match', [
            'organization' => $organization,
            'documentId' => $documentId,
            'candidateKeysCount' => count($candidateKeys),
            'candidateKeysSample' => array_slice($candidateKeys, 0, 12),
            'assigneeKeysCount' => count($assigneeKeys),
            'assigneeKeysSample' => array_slice($assigneeKeys, 0, 12),
            'requestUser' => $userSummary,
        ]);

        $fallbackUserNames = [];
        $addFallbackUserName = static function ($value) use (&$fallbackUserNames): void {
            $normalized = docs_normalize_name_candidate_value($value ?? '');
            if ($normalized !== '') {
                $fallbackUserNames[$normalized] = true;
            }
        };

        $addFallbackUserName($requestContext['primaryId'] ?? '');
        $addFallbackUserName($userContext['fullName'] ?? null);
        $addFallbackUserName($userContext['firstName'] ?? null);
        $addFallbackUserName($userContext['lastName'] ?? null);
        $addFallbackUserName($rawContext['telegram_full_name'] ?? null);

        $fallbackMatchedAssignee = null;
        $fallbackMatchedKey = '';
        if (!empty($fallbackUserNames)) {
            foreach ($assignees as $assignee) {
                if (!is_array($assignee)) {
                    continue;
                }

                foreach (['fullName', 'name', 'responsible'] as $field) {
                    if (!isset($assignee[$field])) {
                        continue;
                    }

                    $normalizedName = docs_normalize_name_candidate_value($assignee[$field]);
                    if ($normalizedName === '') {
                        continue;
                    }

                    if (isset($fallbackUserNames[$normalizedName])) {
                        $fallbackMatchedAssignee = $assignee;
                        $fallbackMatchedKey = 'name::' . $normalizedName;
                        break 2;
                    }
                }
            }
        }

        if ($fallbackMatchedAssignee === null) {
            return $result;
        }

        $matchedAssignee = $fallbackMatchedAssignee;
        $matchedKey = $fallbackMatchedKey;
        docs_log_view_status_event('documents:register_view fallback_name_match', [
            'organization' => $organization,
            'documentId' => $documentId,
            'matchedKey' => $matchedKey,
        ]);
    }

    $timestamp = null;
    if (isset($details['viewedAt']) && is_string($details['viewedAt'])) {
        $normalizedTimestamp = docs_normalize_datetime_iso($details['viewedAt']);
        if ($normalizedTimestamp !== null) {
            $timestamp = $normalizedTimestamp;
        }
    }
    if ($timestamp === null) {
        $timestamp = date('c');
    }

    $normalizedKey = mb_strtolower($matchedKey, 'UTF-8');

    $normalizedId = '';
    if (strpos($normalizedKey, 'id::') === 0) {
        $normalizedId = substr($normalizedKey, 4);
    }

    if ($normalizedId === '') {
        $normalizedId = docs_normalize_identifier_candidate_value($matchedAssignee['id'] ?? '');
    }

    if ($normalizedId === '') {
        $normalizedId = docs_normalize_identifier_candidate_value($requestContext['primaryId'] ?? '');
    }

    if ($normalizedId === '') {
        $normalizedId = docs_normalize_identifier_candidate_value($requestContext['raw']['telegram_user_id'] ?? '');
    }

    if ($normalizedId === '') {
        return $result;
    }

    $viewerName = '';
    if (isset($requestContext['user']) && is_array($requestContext['user'])) {
        $viewerName = sanitize_text_field((string) ($requestContext['user']['fullName'] ?? ''), 200);
        if ($viewerName === '') {
            $firstName = sanitize_text_field((string) ($requestContext['user']['firstName'] ?? ''), 120);
            $lastName = sanitize_text_field((string) ($requestContext['user']['lastName'] ?? ''), 160);
            $viewerName = trim($firstName . ' ' . $lastName);
        }
        if ($viewerName === '' && !empty($requestContext['user']['username'])) {
            $viewerName = '@' . sanitize_text_field((string) $requestContext['user']['username'], 120);
        }
    }

    if ($viewerName === '' && isset($details['viewerName'])) {
        $viewerName = sanitize_text_field((string) $details['viewerName'], 200);
    }

    if ($viewerName === '' && isset($matchedAssignee['name'])) {
        $viewerName = (string) $matchedAssignee['name'];
    } elseif ($viewerName === '' && isset($matchedAssignee['responsible'])) {
        $viewerName = (string) $matchedAssignee['responsible'];
    }

    $viewsMap = [];
    $orderedKeys = [];

    if (isset($records[$recordIndex]['assigneeViews']) && is_array($records[$recordIndex]['assigneeViews'])) {
        foreach ($records[$recordIndex]['assigneeViews'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $entryKey = '';
            if (!empty($entry['assigneeKey'])) {
                $entryKey = mb_strtolower((string) $entry['assigneeKey'], 'UTF-8');
            }

            if ($entryKey === '' && !empty($entry['id'])) {
                $candidate = docs_normalize_identifier_candidate_value($entry['id']);
                if ($candidate !== '') {
                    $entryKey = 'id::' . $candidate;
                }
            }

            if ($entryKey === '') {
                continue;
            }

            if (!isset($viewsMap[$entryKey])) {
                $viewsMap[$entryKey] = $entry;
                $orderedKeys[] = $entryKey;
            }
        }
    }

    $existingEntry = null;
    if (isset($viewsMap[$normalizedKey]) && is_array($viewsMap[$normalizedKey])) {
        $existingEntry = $viewsMap[$normalizedKey];
    } elseif ($normalizedId !== '') {
        $idKey = 'id::' . $normalizedId;
        if (isset($viewsMap[$idKey]) && is_array($viewsMap[$idKey])) {
            $existingEntry = $viewsMap[$idKey];
            $normalizedKey = $idKey;
            $matchedKey = $idKey;
        }
    }

    if (is_array($existingEntry) && isset($existingEntry['viewedAt']) && $existingEntry['viewedAt'] !== '') {
        $result['alreadyRecorded'] = true;
        $result['viewedAt'] = (string) $existingEntry['viewedAt'];
        if (isset($existingEntry['assigneeKey'])) {
            $result['assigneeKey'] = (string) $existingEntry['assigneeKey'];
        }
        if (isset($existingEntry['id'])) {
            $result['id'] = (string) $existingEntry['id'];
        }
        if (isset($existingEntry['name'])) {
            $result['name'] = (string) $existingEntry['name'];
        }

        return $result;
    }

    $viewEntry = [
        'assigneeKey' => $matchedKey,
        'viewedAt' => $timestamp,
    ];

    if ($normalizedId !== '') {
        $viewEntry['id'] = $normalizedId;
    }

    if ($viewerName !== '') {
        $viewEntry['name'] = $viewerName;
    }

    $updatedEntry = is_array($existingEntry)
        ? array_merge($existingEntry, $viewEntry)
        : $viewEntry;
    $updatedEntry['assigneeKey'] = $matchedKey;
    $updatedEntry['viewedAt'] = $timestamp;

    $viewsMap[$normalizedKey] = $updatedEntry;
    if (!in_array($normalizedKey, $orderedKeys, true)) {
        $orderedKeys[] = $normalizedKey;
    }

    $updatedViews = [];
    foreach ($orderedKeys as $key) {
        if (!isset($viewsMap[$key])) {
            continue;
        }

        $updatedViews[] = $viewsMap[$key];
    }

    $sanitizedViews = docs_sanitize_assignee_views_payload($updatedViews);
    if (empty($sanitizedViews)) {
        return $result;
    }

    $records[$recordIndex]['assigneeViews'] = $sanitizedViews;
    save_registry($folder, $records);

    $logContext = [
        'organization' => $organization,
        'folder' => $folder,
        'documentId' => $documentId,
        'assigneeKey' => $matchedKey,
        'viewerId' => $normalizedId,
    ];

    if (isset($details['trigger'])) {
        $logContext['trigger'] = sanitize_text_field((string) $details['trigger'], 120);
    }

    log_docs_event('Task view recorded', $logContext);

    $result['recorded'] = true;
    $result['viewedAt'] = $timestamp;
    $result['assigneeKey'] = $matchedKey;
    if ($normalizedId !== '') {
        $result['id'] = $normalizedId;
    }
    if ($viewerName !== '') {
        $result['name'] = $viewerName;
    }

    return $result;
}

function load_registry(string $folder): array
{
    $file = get_registry_path($folder);
    $context = [
        'folder' => $folder,
        'path' => $file,
    ];

    if (!is_file($file)) {
        log_docs_event('Registry file missing', $context);
        return [];
    }

    $size = @filesize($file);
    if ($size !== false) {
        $context['fileSize'] = $size;
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        log_docs_event('Registry file read failed', $context);
        return [];
    }

    $context['rawLength'] = strlen($raw);

    if (trim($raw) === '') {
        log_docs_event('Registry file empty', $context);
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $context['jsonError'] = json_last_error_msg();
        log_docs_event('Registry decode error', $context);
        return [];
    }

    $context['recordsCount'] = count($data);

    $sampleIds = [];
    $sampleRecords = [];
    foreach (array_slice($data, 0, 5) as $record) {
        if (!is_array($record)) {
            continue;
        }

        if (isset($record['id'])) {
            $sampleIds[] = (string) $record['id'];
        } elseif (isset($record['entryNumber'])) {
            $sampleIds[] = (string) $record['entryNumber'];
        }

        $summary = [];
        if (isset($record['id'])) {
            $summary['id'] = (string) $record['id'];
        }
        if (isset($record['entryNumber'])) {
            $summary['entryNumber'] = (string) $record['entryNumber'];
        }
        if (isset($record['status']) && $record['status'] !== '') {
            $summary['status'] = (string) $record['status'];
        }
        $assignees = docs_extract_assignees($record);
        if (!empty($assignees)) {
            $assignee = $assignees[0];
            if (!empty($assignee['name'])) {
                $summary['assigneeName'] = (string) $assignee['name'];
            } elseif (!empty($assignee['responsible'])) {
                $summary['assigneeName'] = (string) $assignee['responsible'];
            }
            foreach (['id', 'telegram', 'chatId'] as $field) {
                if (!empty($assignee[$field])) {
                    $summary['assignee' . ucfirst($field)] = (string) $assignee[$field];
                    break;
                }
            }
            $summary['assigneesCount'] = count($assignees);
        } elseif (isset($record['responsible']) && $record['responsible'] !== '') {
            $summary['assigneeName'] = (string) $record['responsible'];
        }

        if (!empty($summary)) {
            $sampleRecords[] = $summary;
        }
    }

    if (!empty($sampleIds)) {
        $context['sampleIds'] = array_values(array_unique($sampleIds));
    }
    if (!empty($sampleRecords)) {
        $context['sampleRecords'] = $sampleRecords;
    }

    log_docs_event('Registry file loaded', $context);

    return $data;
}

function save_registry(string $folder, array $records): void
{
    $dir = ensure_organization_directory($folder);
    $file = $dir . '/' . REGISTRY_FILENAME;
    $json = json_encode(array_values($records), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents($file, $json, LOCK_EX);
}

function docs_lock_registry(string $folder): array
{
    $dir = ensure_organization_directory($folder);
    $file = $dir . '/' . REGISTRY_FILENAME;
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        log_docs_event('Registry file open failed', [
            'file' => $file,
            'folder' => $folder,
        ]);
        return [null, []];
    }

    if (!flock($handle, LOCK_EX)) {
        log_docs_event('Registry file lock failed', [
            'file' => $file,
            'folder' => $folder,
        ]);
        fclose($handle);
        return [null, []];
    }

    $raw = stream_get_contents($handle);
    if ($raw === false) {
        log_docs_event('Registry file read failed (locked)', [
            'file' => $file,
            'folder' => $folder,
        ]);
        $records = [];
    } elseif (trim($raw) === '') {
        $records = [];
    } else {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            log_docs_event('Registry decode error (locked)', [
                'file' => $file,
                'folder' => $folder,
                'jsonError' => json_last_error_msg(),
            ]);
            $records = [];
        } else {
            $records = $decoded;
        }
    }

    register_shutdown_function(function () use ($handle) {
        if (is_resource($handle)) {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    });

    return [$handle, $records];
}

function docs_save_registry_locked($handle, array $records): void
{
    if (!is_resource($handle)) {
        return;
    }

    $json = json_encode(array_values($records), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, $json);
    fflush($handle);
}

function docs_unlock_registry($handle): void
{
    if (!is_resource($handle)) {
        return;
    }
    flock($handle, LOCK_UN);
    fclose($handle);
}

function docs_generate_password_hash(string $password): ?string
{
    $password = trim($password);
    if ($password === '') {
        return null;
    }

    if (function_exists('password_hash')) {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        if (is_string($hash) && $hash !== '') {
            return $hash;
        }
    }

    $saltSource = null;
    if (function_exists('random_bytes')) {
        try {
            $saltSource = random_bytes(16);
        } catch (Throwable $exception) {
            $saltSource = null;
        }
    }

    if ($saltSource === null) {
        $saltSource = uniqid('', true);
    }

    $salt = substr(str_replace('+', '.', base64_encode($saltSource)), 0, 22);
    $fallback = crypt($password, '$2y$10$' . $salt);
    if (is_string($fallback) && $fallback !== '') {
        return $fallback;
    }

    return null;
}

function sanitize_admin_entry(array $entry): array
{
    $clean = [
        'number' => sanitize_text_field($entry['number'] ?? '', 20),
        'responsible' => sanitize_text_field($entry['responsible'] ?? '', 200),
        'telegram' => sanitize_text_field($entry['telegram'] ?? '', 120),
        'chatId' => sanitize_text_field($entry['chatId'] ?? '', 40),
        'email' => sanitize_text_field($entry['email'] ?? '', 160),
        'department' => sanitize_text_field($entry['department'] ?? '', 160),
        'note' => sanitize_text_field($entry['note'] ?? '', 300),
        'login' => sanitize_text_field($entry['login'] ?? '', 120),
    ];

    if (isset($entry['role'])) {
        $role = sanitize_text_field((string) $entry['role'], 60);
        if ($role !== '') {
            $clean['role'] = $role;
        }
    }

    $passwordRaw = isset($entry['password']) ? trim((string) $entry['password']) : '';
    $passwordHashRaw = isset($entry['passwordHash']) ? trim((string) $entry['passwordHash']) : '';
    $passwordHash = '';

    if ($passwordRaw !== '') {
        $generated = docs_generate_password_hash($passwordRaw);
        if (is_string($generated) && $generated !== '') {
            $passwordHash = sanitize_text_field($generated, 255);
        }
    } elseif ($passwordHashRaw !== '') {
        $passwordHash = sanitize_text_field($passwordHashRaw, 255);
    }

    if ($passwordHash !== '') {
        $clean['passwordHash'] = $passwordHash;
    }

    return $clean;
}

function sanitize_admin_settings(array $payload): array
{
    $responsibles = [];
    if (isset($payload['responsibles']) && is_array($payload['responsibles'])) {
        foreach ($payload['responsibles'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $clean = sanitize_admin_entry($entry);

            $hasValue = false;
            foreach ($clean as $value) {
                if ($value !== '') {
                    $hasValue = true;
                    break;
                }
            }

            if ($hasValue) {
                if (!isset($clean['role']) || $clean['role'] === '') {
                    $clean['role'] = 'responsible';
                }
                $responsibles[] = $clean;
            }
        }
    }

    $block2 = [];
    if (isset($payload['block2']) && is_array($payload['block2'])) {
        foreach ($payload['block2'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $clean = sanitize_admin_entry($entry);

            $hasValue = false;
            foreach ($clean as $value) {
                if ($value !== '') {
                    $hasValue = true;
                    break;
                }
            }

            if ($hasValue) {
                if (!isset($clean['role']) || $clean['role'] === '') {
                    $clean['role'] = 'director';
                }
                $block2[] = $clean;
            }
        }
    }

    $block3 = [];
    if (isset($payload['block3']) && is_array($payload['block3'])) {
        foreach ($payload['block3'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $clean = sanitize_admin_entry($entry);

            $hasValue = false;
            foreach ($clean as $value) {
                if ($value !== '') {
                    $hasValue = true;
                    break;
                }
            }

            if ($hasValue) {
                if (!isset($clean['role']) || $clean['role'] === '') {
                    $clean['role'] = 'subordinate';
                }
                $block3[] = $clean;
            }
        }
    }

    return [
        'responsibles' => $responsibles,
        'block2' => $block2,
        'block3' => $block3,
    ];
}

function docs_sanitize_column_widths($input): array
{
    if (!is_array($input)) {
        return [];
    }

    $allowedKeys = array_keys(DOCS_COLUMN_WIDTH_DEFAULTS);
    $normalized = [];

    foreach ($input as $key => $value) {
        if (!is_string($key) || !in_array($key, $allowedKeys, true)) {
            continue;
        }

        if (is_array($value) && array_key_exists('value', $value)) {
            $value = $value['value'];
        }

        if (is_string($value)) {
            $value = trim($value);
        }

        if ($value === '' || $value === null) {
            continue;
        }

        if (!is_numeric($value)) {
            continue;
        }

        $width = (int) round((float) $value);
        if ($width < DOCS_COLUMN_WIDTH_MIN) {
            $width = DOCS_COLUMN_WIDTH_MIN;
        } elseif ($width > DOCS_COLUMN_WIDTH_MAX) {
            $width = DOCS_COLUMN_WIDTH_MAX;
        }

        $normalized[$key] = $width;
    }

    return $normalized;
}

function docs_normalize_column_width_map($map): array
{
    if (!is_array($map)) {
        return [];
    }

    $normalized = [];

    foreach ($map as $profile => $entry) {
        if (!is_string($profile) || $profile === '') {
            continue;
        }

        $profileKey = preg_replace('/[^a-z0-9_-]/i', '', strtolower($profile));
        if ($profileKey === '') {
            continue;
        }

        $entryArray = is_array($entry) ? $entry : [];
        $columns = [];
        if (isset($entryArray['columns'])) {
            $columns = docs_sanitize_column_widths($entryArray['columns']);
        }

        $normalizedEntry = ['columns' => $columns];

        if (isset($entryArray['updatedAt']) && is_string($entryArray['updatedAt']) && $entryArray['updatedAt'] !== '') {
            $normalizedEntry['updatedAt'] = $entryArray['updatedAt'];
        }

        if (isset($entryArray['updatedBy']) && $entryArray['updatedBy'] !== '') {
            $normalizedEntry['updatedBy'] = sanitize_text_field((string) $entryArray['updatedBy'], 200);
        }

        $normalized[$profileKey] = $normalizedEntry;
    }

    return $normalized;
}

function normalize_identifier_value($value): string
{
    if (is_int($value) || is_float($value)) {
        $value = (string) $value;
    } elseif (!is_string($value)) {
        return '';
    }

    $value = trim($value);

    return $value === '' ? '' : $value;
}

function normalize_username_value($value): string
{
    $value = normalize_identifier_value($value);
    if ($value === '') {
        return '';
    }
    if ($value[0] === '@') {
        $value = substr($value, 1);
    }
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    return mb_strtolower($value, 'UTF-8');
}

function split_name_tokens(string $value): array
{
    $value = trim($value);
    if ($value === '') {
        return [];
    }

    $parts = preg_split('/\s+/u', $value, -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($parts)) {
        return [];
    }

    return array_values(array_filter(array_map(static function ($token) {
        $token = trim((string) $token);
        if ($token === '') {
            return '';
        }

        return mb_strtolower($token, 'UTF-8');
    }, $parts)));    
}

function extract_assignee_filter_from_array(array $source): ?array
{
    $ids = [];
    $userId = normalize_identifier_value($source['telegram_user_id'] ?? null);
    if ($userId !== '') {
        $ids[] = $userId;
    }

    $chatId = normalize_identifier_value($source['telegram_chat_id'] ?? null);
    if ($chatId !== '' && !in_array($chatId, $ids, true)) {
        $ids[] = $chatId;
    }

    if (empty($ids)) {
        return null;
    }

    return [
        'ids' => array_values(array_unique($ids)),
    ];
}

function extract_assignee_match_data(array $record): array
{
    $data = [
        'ids' => [],
        'usernames' => [],
        'names' => [],
    ];

    $assignees = docs_extract_assignees($record);
    if (isset($record['subordinates']) && is_array($record['subordinates'])) {
        foreach ($record['subordinates'] as $subordinateEntry) {
            if (is_array($subordinateEntry)) {
                $assignees[] = $subordinateEntry;
            }
        }
    }
    if (isset($record['responsibles']) && is_array($record['responsibles'])) {
        foreach ($record['responsibles'] as $responsibleEntry) {
            if (is_array($responsibleEntry)) {
                $assignees[] = $responsibleEntry;
            }
        }
    }
    if (isset($record['director']) && is_array($record['director'])) {
        $assignees[] = $record['director'];
    }
    if (isset($record['directors']) && is_array($record['directors'])) {
        foreach ($record['directors'] as $directorEntry) {
            if (is_array($directorEntry)) {
                $assignees[] = $directorEntry;
            }
        }
    }

    $idFields = ['id', 'chatId', 'chat_id', 'telegram', 'email', 'number', 'login'];
    foreach ($assignees as $assignee) {
        if (!is_array($assignee)) {
            continue;
        }

        foreach ($idFields as $field) {
            if (!isset($assignee[$field])) {
                continue;
            }

            $normalized = normalize_identifier_value($assignee[$field]);
            if ($normalized === '') {
                continue;
            }

            $data['ids'][] = $normalized;
            $username = normalize_username_value($normalized);
            if ($username !== '') {
                $data['usernames'][] = $username;
            }
        }

        foreach (['name', 'responsible'] as $field) {
            if (!isset($assignee[$field])) {
                continue;
            }

            $sanitized = sanitize_text_field((string) $assignee[$field], 200);
            if ($sanitized === '') {
                continue;
            }

            $tokens = split_name_tokens($sanitized);
            if (!empty($tokens)) {
                $data['names'][] = $tokens;
            }
        }

        $compositeName = $assignee['responsible'] ?? ($assignee['name'] ?? '');
        $compositeKey = docs_build_responsible_composite_key($assignee['number'] ?? '', $compositeName);
        if ($compositeKey !== '') {
            $data['ids'][] = 'combo::' . $compositeKey;
        }
    }

    if (isset($record['assigneeId'])) {
        $normalized = normalize_identifier_value($record['assigneeId']);
        if ($normalized !== '') {
            $data['ids'][] = $normalized;
        }
    }

    $data['ids'] = array_values(array_unique($data['ids']));
    $data['usernames'] = array_values(array_unique($data['usernames']));
    $data['names'] = array_values($data['names']);

    return $data;
}

function document_matches_assignee_filter_core(array $record, array $filter, ?array &$trace = null): bool
{
    if (empty($filter)) {
        if ($trace !== null) {
            $trace = array_merge($trace, [
                'matchedBy' => 'no-filter',
                'matchedValue' => null,
                'candidateIds' => [],
                'candidateUsernames' => [],
                'candidateNames' => [],
            ]);
        }
        return true;
    }

    $matchData = extract_assignee_match_data($record);

    if ($trace !== null) {
        $trace['candidateIds'] = array_slice($matchData['ids'], 0, 10);
        $trace['candidateUsernames'] = array_slice($matchData['usernames'], 0, 10);
        $trace['candidateNames'] = array_map(static function (array $tokens) {
            return implode(' ', $tokens);
        }, array_slice($matchData['names'], 0, 10));
        $trace['matchedBy'] = null;
        $trace['matchedValue'] = null;
    }

    if (!empty($filter['ids'])) {
        foreach ($filter['ids'] as $expectedId) {
            $normalizedExpected = normalize_identifier_value($expectedId);
            if ($normalizedExpected === '') {
                continue;
            }
            foreach ($matchData['ids'] as $candidateId) {
                if ($candidateId === $normalizedExpected) {
                    if ($trace !== null) {
                        $trace['matchedBy'] = 'id';
                        $trace['matchedValue'] = $normalizedExpected;
                    }
                    return true;
                }
            }
        }
    }

    if (!empty($filter['username'])) {
        foreach ($matchData['usernames'] as $candidateUsername) {
            if ($candidateUsername === $filter['username']) {
                if ($trace !== null) {
                    $trace['matchedBy'] = 'username';
                    $trace['matchedValue'] = $candidateUsername;
                }
                return true;
            }
        }
    }

    if (!empty($filter['nameTokens'])) {
        foreach ($matchData['names'] as $candidateTokens) {
            if (empty(array_diff($filter['nameTokens'], $candidateTokens))) {
                if ($trace !== null) {
                    $trace['matchedBy'] = 'nameTokens';
                    $trace['matchedValue'] = implode(' ', $candidateTokens);
                }
                return true;
            }
        }
    }

    if ($trace !== null) {
        $trace['matchedBy'] = $trace['matchedBy'] ?? null;
        $trace['matchedValue'] = $trace['matchedValue'] ?? null;
    }

    return false;
}

function normalize_responsible_name(?string $value): string
{
    if ($value === null) {
        return '';
    }

    $sanitized = sanitize_text_field($value, 200);

    return $sanitized === '' ? '' : mb_strtolower($sanitized, 'UTF-8');
}

function find_responsible_entry_for_record(array $record, array $responsibles): ?array
{
    if (empty($responsibles)) {
        return null;
    }

    $candidateIds = [];
    $candidateNames = [];
    $assignees = docs_extract_assignees($record);

    foreach ($assignees as $assignee) {
        if (!is_array($assignee)) {
            continue;
        }

        foreach (['id', 'chatId', 'chat_id', 'telegram'] as $field) {
            if (!isset($assignee[$field])) {
                continue;
            }

            $normalized = normalize_identifier_value($assignee[$field]);
            if ($normalized !== '') {
                $candidateIds[] = $normalized;
            }
        }

        foreach (['name', 'responsible'] as $field) {
            if (!isset($assignee[$field])) {
                continue;
            }

            $normalizedName = normalize_responsible_name((string) $assignee[$field]);
            if ($normalizedName !== '') {
                $candidateNames[] = $normalizedName;
            }
        }
    }

    if (isset($record['assigneeId'])) {
        $normalized = normalize_identifier_value($record['assigneeId']);
        if ($normalized !== '') {
            $candidateIds[] = $normalized;
        }
    }

    foreach ($responsibles as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        foreach (['id', 'number', 'telegram', 'chatId', 'email'] as $field) {
            if (!isset($entry[$field])) {
                continue;
            }

            $normalized = normalize_identifier_value($entry[$field]);
            if ($normalized === '') {
                continue;
            }

            foreach ($candidateIds as $candidate) {
                if ($candidate === $normalized) {
                    return $entry;
                }
            }
        }

        if (!empty($candidateNames) && isset($entry['responsible'])) {
            $entryName = normalize_responsible_name((string) $entry['responsible']);
            if ($entryName === '') {
                continue;
            }

            foreach ($candidateNames as $candidateName) {
                if ($candidateName === $entryName) {
                    return $entry;
                }
            }
        }
    }

    return null;
}

function summarize_responsible_for_log(array $responsible): array
{
    $summary = [];
    foreach (['number', 'responsible', 'telegram', 'chatId', 'email', 'department', 'note'] as $field) {
        if (!isset($responsible[$field])) {
            continue;
        }

        $value = trim((string) $responsible[$field]);
        if ($value === '') {
            continue;
        }

        $summary[$field] = $value;
    }

    return $summary;
}

function merge_record_with_responsible(array $record, array $responsible): array
{
    $merged = $record;
    $assignees = docs_extract_assignees($merged);
    $assignee = $assignees[0] ?? [];

    if ((!isset($assignee['name']) || $assignee['name'] === '') && !empty($responsible['responsible'])) {
        $assignee['name'] = $responsible['responsible'];
    }

    $map = [
        'department' => 'department',
        'telegram' => 'telegram',
        'chatId' => 'chatId',
        'email' => 'email',
        'note' => 'note',
    ];

    foreach ($map as $targetField => $sourceField) {
        if (!isset($assignee[$targetField]) || $assignee[$targetField] === '') {
            if (!empty($responsible[$sourceField])) {
                $assignee[$targetField] = $responsible[$sourceField];
            }
        }
    }

    if ((!isset($assignee['id']) || $assignee['id'] === '') && !empty($responsible['telegram'])) {
        $assignee['id'] = $responsible['telegram'];
    } elseif ((!isset($assignee['id']) || $assignee['id'] === '') && !empty($responsible['chatId'])) {
        $assignee['id'] = $responsible['chatId'];
    } elseif ((!isset($assignee['id']) || $assignee['id'] === '') && !empty($responsible['number'])) {
        $assignee['id'] = $responsible['number'];
    }

    $primarySanitized = sanitize_assignee_payload($assignee, false);
    if (empty($primarySanitized)) {
        $remaining = [];
        foreach (array_slice($assignees, 1) as $extra) {
            $sanitized = sanitize_assignee_payload($extra, false);
            if (!empty($sanitized)) {
                $remaining[] = $sanitized;
            }
        }
        docs_apply_assignees_to_record($merged, $remaining);
        return $merged;
    }

    if (!isset($primarySanitized['assignedAt']) || $primarySanitized['assignedAt'] === '') {
        $primarySanitized['assignedAt'] = date('c');
    }

    $normalizedAssignees = [$primarySanitized];
    foreach (array_slice($assignees, 1) as $extra) {
        $sanitized = sanitize_assignee_payload($extra, false);
        if (!empty($sanitized)) {
            $normalizedAssignees[] = $sanitized;
        }
    }

    docs_apply_assignees_to_record($merged, $normalizedAssignees);

    return $merged;
}

function document_matches_assignee_filter(array $record, array $filter, array $responsibles = [], ?array &$debugTrace = null): bool
{
    $coreTrace = [];
    if (document_matches_assignee_filter_core($record, $filter, $coreTrace)) {
        if ($debugTrace !== null) {
            $debugTrace = array_merge($coreTrace, [
                'resolvedViaResponsible' => false,
                'matchedResponsible' => null,
            ]);
        }

        return true;
    }

    if ($debugTrace !== null) {
        $debugTrace = array_merge($coreTrace, [
            'resolvedViaResponsible' => false,
            'matchedResponsible' => null,
        ]);
    }

    if (empty($responsibles)) {
        return false;
    }

    $matchedResponsible = find_responsible_entry_for_record($record, $responsibles);
    if ($matchedResponsible === null) {
        return false;
    }

    $augmentedRecord = merge_record_with_responsible($record, $matchedResponsible);

    $augmentedTrace = [];
    $matched = document_matches_assignee_filter_core($augmentedRecord, $filter, $augmentedTrace);

    if ($debugTrace !== null) {
        $debugTrace = array_merge($augmentedTrace, [
            'resolvedViaResponsible' => true,
            'matchedResponsible' => summarize_responsible_for_log($matchedResponsible),
        ]);
    }

    return $matched;
}

function docs_should_trace_mini_app_user(?array $filter): bool
{
    if ($filter === null || empty($filter['ids']) || !is_array($filter['ids'])) {
        return false;
    }

    return in_array('807550434', $filter['ids'], true);
}

function docs_trace_mini_app_task_visibility(
    array $record,
    array $filter,
    array $responsibles,
    string $organization,
    string $folder,
    string $stage
): void {
    $recordId = isset($record['id']) ? (string) $record['id'] : '';
    if ($recordId !== 'doc_a012f5b66c5d0a3f') {
        return;
    }

    $trace = [];
    $matched = document_matches_assignee_filter($record, $filter, $responsibles, $trace);
    $assignees = docs_extract_assignees($record);
    $assigneeSummary = [];
    foreach ($assignees as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $assigneeSummary[] = array_filter([
            'id' => $entry['id'] ?? null,
            'telegram' => $entry['telegram'] ?? null,
            'chatId' => $entry['chatId'] ?? null,
            'login' => $entry['login'] ?? null,
            'name' => $entry['name'] ?? null,
            'responsible' => $entry['responsible'] ?? null,
        ], static function ($value) {
            return $value !== null && $value !== '';
        });
    }

    docs_write_mini_app_debug_log('Mini app task visibility trace', [
        'stage' => $stage,
        'organization' => $organization,
        'folder' => $folder,
        'recordId' => $recordId,
        'entryNumber' => $record['entryNumber'] ?? null,
        'status' => $record['status'] ?? null,
        'assignees' => $assigneeSummary,
        'filter' => summarize_assignee_filter_for_log($filter),
        'matched' => $matched,
        'trace' => $trace,
    ]);
}

function summarize_assignee_filter_for_log(?array $filter): array
{
    if ($filter === null) {
        return ['applied' => false];
    }

    $summary = ['applied' => true];

    if (isset($filter['ids']) && is_array($filter['ids'])) {
        $summary['ids'] = array_slice(array_values(array_map('strval', $filter['ids'])), 0, 10);
        $summary['idsCount'] = count($filter['ids']);
    }

    if (!empty($filter['username'])) {
        $summary['username'] = (string) $filter['username'];
    }

    if (isset($filter['nameTokens']) && is_array($filter['nameTokens'])) {
        $summary['nameTokens'] = array_slice(array_values(array_map('strval', $filter['nameTokens'])), 0, 10);
        $summary['nameTokensCount'] = count($filter['nameTokens']);
    }

    return $summary;
}

function filter_documents_for_assignee(array $records, ?array $filter, array $responsibles = []): array
{
    if ($filter === null) {
        $filtered = [];
        foreach ($records as $record) {
            if (is_array($record)) {
                $filtered[] = $record;
            }
        }

        log_docs_event('Assignee filter skipped', [
            'recordsCount' => count($filtered),
            'responsiblesCount' => count($responsibles),
        ]);

        return $filtered;
    }

    $filterSummary = summarize_assignee_filter_for_log($filter);
    $totalSupplied = count($records);

    log_docs_event('Assignee filter started', [
        'recordsCount' => $totalSupplied,
        'responsiblesCount' => count($responsibles),
        'filter' => $filterSummary,
    ]);

    $filtered = [];
    $samples = [];
    $checked = 0;

    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        $checked++;

        $debugTrace = [];
        $matched = document_matches_assignee_filter($record, $filter, $responsibles, $debugTrace);
        if ($matched) {
            $filtered[] = $record;
        }

        if (count($samples) < 15) {
            $assignees = docs_extract_assignees($record);
            $primaryAssignee = $assignees[0] ?? [];

            $recordSummary = [
                'matched' => $matched,
            ];

            if (isset($record['id'])) {
                $recordSummary['id'] = (string) $record['id'];
            }
            if (isset($record['entryNumber'])) {
                $recordSummary['entryNumber'] = (string) $record['entryNumber'];
            }
            if (!empty($record['status'])) {
                $recordSummary['status'] = (string) $record['status'];
            }

            $assigneeId = null;
            foreach (['id', 'telegram', 'chatId'] as $field) {
                if (!empty($primaryAssignee[$field])) {
                    $assigneeId = (string) $primaryAssignee[$field];
                    break;
                }
            }
            if ($assigneeId === null && !empty($record['assigneeId'])) {
                $assigneeId = (string) $record['assigneeId'];
            }
            if ($assigneeId !== null) {
                $recordSummary['assigneeId'] = $assigneeId;
            }

            $assigneeName = $primaryAssignee['name']
                ?? $primaryAssignee['responsible']
                ?? ($record['responsible'] ?? null);
            if (!empty($assigneeName)) {
                $recordSummary['assigneeName'] = (string) $assigneeName;
            }

            if (!empty($assignees)) {
                $recordSummary['assigneesCount'] = count($assignees);
                $namesSample = [];
                foreach (array_slice($assignees, 0, 3) as $assigneeEntry) {
                    if (!is_array($assigneeEntry)) {
                        continue;
                    }
                    $nameCandidate = $assigneeEntry['name']
                        ?? $assigneeEntry['responsible']
                        ?? ($assigneeEntry['email'] ?? null);
                    if (!empty($nameCandidate)) {
                        $namesSample[] = (string) $nameCandidate;
                    }
                }
                if (!empty($namesSample)) {
                    $recordSummary['assigneesSample'] = $namesSample;
                }
            }

            if (!empty($debugTrace)) {
                if (array_key_exists('matchedBy', $debugTrace)) {
                    $recordSummary['matchedBy'] = $debugTrace['matchedBy'];
                }
                if (!empty($debugTrace['matchedValue'])) {
                    $recordSummary['matchedValue'] = $debugTrace['matchedValue'];
                }
                if (!empty($debugTrace['candidateIds'])) {
                    $recordSummary['candidateIds'] = array_slice($debugTrace['candidateIds'], 0, 5);
                }
                if (!empty($debugTrace['candidateUsernames'])) {
                    $recordSummary['candidateUsernames'] = array_slice($debugTrace['candidateUsernames'], 0, 5);
                }
                if (!empty($debugTrace['candidateNames'])) {
                    $recordSummary['candidateNames'] = array_slice($debugTrace['candidateNames'], 0, 5);
                }
                if (array_key_exists('resolvedViaResponsible', $debugTrace)) {
                    $recordSummary['resolvedViaResponsible'] = $debugTrace['resolvedViaResponsible'];
                }
                if (!empty($debugTrace['matchedResponsible'])) {
                    $recordSummary['matchedResponsible'] = $debugTrace['matchedResponsible'];
                }
            }

            $samples[] = $recordSummary;
        }
    }

    $logContext = [
        'recordsChecked' => $checked,
        'recordsMatched' => count($filtered),
        'recordsSupplied' => $totalSupplied,
        'recordsSkipped' => max(0, $totalSupplied - $checked),
        'responsiblesCount' => count($responsibles),
        'filter' => $filterSummary,
    ];

    if (!empty($filtered)) {
        $matchedSamples = [];
        foreach ($filtered as $record) {
            if (!is_array($record)) {
                continue;
            }

            $matchedSamples[] = summarize_document_record_for_log($record);
            if (count($matchedSamples) >= 10) {
                break;
            }
        }

        if (!empty($matchedSamples)) {
            $logContext['matchedSamples'] = $matchedSamples;
        }
    }

    if (!empty($samples)) {
        $logContext['samples'] = $samples;
    }

    log_docs_event('Assignee filter completed', $logContext);

    return $filtered;
}

function load_admin_settings(string $folder): array
{
    $defaults = [
        'responsibles' => [],
        'block2' => [],
        'block3' => [],
        'columnWidths' => [],
    ];

    $file = get_settings_path($folder);
    if (!is_file($file)) {
        return $defaults;
    }

    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return $defaults;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $defaults;
    }

    $sanitized = sanitize_admin_settings($decoded + $defaults);
    $sanitized['columnWidths'] = isset($decoded['columnWidths'])
        ? docs_normalize_column_width_map($decoded['columnWidths'])
        : [];

    return $sanitized + ['columnWidths' => []];
}

function load_responsibles_for_folder(string $folder): array
{
    $settings = load_admin_settings($folder);

    $responsibles = [];
    if (isset($settings['responsibles']) && is_array($settings['responsibles'])) {
        $responsibles = $settings['responsibles'];
    }

    if (isset($settings['block3']) && is_array($settings['block3'])) {
        foreach ($settings['block3'] as $entry) {
            if (is_array($entry)) {
                $responsibles[] = $entry;
            }
        }
    }

    return $responsibles;
}

function docs_normalize_identifier_candidate_value($value): string
{
    $normalized = normalize_identifier_value($value);
    if ($normalized === '') {
        return '';
    }

    if ($normalized[0] === '@') {
        $normalized = substr($normalized, 1);
    }

    return mb_strtolower($normalized, 'UTF-8');
}

function docs_normalize_name_candidate_value($value): string
{
    if ($value === null) {
        return '';
    }

    $string = trim((string) $value);
    if ($string === '') {
        return '';
    }

    return mb_strtolower($string, 'UTF-8');
}

function docs_normalize_responsible_composite_key_value(string $value): string
{
    $normalized = trim($value);
    if ($normalized === '') {
        return '';
    }

    if (stripos($normalized, 'combo::') === 0) {
        $normalized = substr($normalized, 7);
    }

    $normalized = mb_strtolower($normalized, 'UTF-8');
    $normalized = preg_replace('/[^\p{L}\p{N}]+/u', '', $normalized);

    return $normalized === null ? '' : $normalized;
}

function docs_build_responsible_composite_key($number, $responsible): string
{
    $normalizedNumber = normalize_identifier_value($number);
    $normalizedResponsible = $responsible === null ? '' : trim((string) $responsible);

    if ($normalizedNumber === '' || $normalizedResponsible === '') {
        return '';
    }

    $combined = $normalizedNumber . ' ' . $normalizedResponsible;

    return docs_normalize_responsible_composite_key_value($combined);
}

function docs_entry_matches_candidate(array $entry, string $candidate): bool
{
    $normalizedId = docs_normalize_identifier_candidate_value($candidate);
    if ($normalizedId !== '') {
        foreach (['telegram', 'chatId', 'id', 'number', 'email', 'login'] as $field) {
            if (!isset($entry[$field])) {
                continue;
            }
            $value = docs_normalize_identifier_candidate_value($entry[$field]);
            if ($value !== '' && $value === $normalizedId) {
                return true;
            }
        }
    }

    $normalizedName = docs_normalize_name_candidate_value($candidate);
    if ($normalizedName !== '' && isset($entry['responsible'])) {
        $entryName = docs_normalize_name_candidate_value($entry['responsible']);
        if ($entryName !== '' && $entryName === $normalizedName) {
            return true;
        }
    }

    $normalizedCompositeCandidate = docs_normalize_responsible_composite_key_value($candidate);
    if ($normalizedCompositeCandidate !== '') {
        $entryName = $entry['responsible'] ?? ($entry['name'] ?? '');
        $compositeEntryKey = docs_build_responsible_composite_key($entry['number'] ?? '', $entryName);
        if ($compositeEntryKey !== '' && $compositeEntryKey === $normalizedCompositeCandidate) {
            return true;
        }
    }

    return false;
}

function docs_collect_record_responsible_candidates(array $record): array
{
    $candidates = [];

    $assignees = docs_extract_assignees($record);
    foreach ($assignees as $assignee) {
        if (!is_array($assignee)) {
            continue;
        }

        foreach (['id', 'chatId', 'chat_id', 'telegram', 'number', 'email', 'login'] as $field) {
            if (empty($assignee[$field])) {
                continue;
            }

            $candidates[] = (string) $assignee[$field];
        }

        foreach (['name', 'responsible', 'fio'] as $field) {
            if (empty($assignee[$field])) {
                continue;
            }

            $candidates[] = (string) $assignee[$field];
        }

        if (!empty($assignee['number'])) {
            $responsibleName = $assignee['responsible'] ?? ($assignee['name'] ?? '');
            if ($responsibleName !== '') {
                $candidates[] = trim((string) $assignee['number'] . ' ' . (string) $responsibleName);
            }
        }
    }

    if (!empty($record['assigneeId'])) {
        $candidates[] = (string) $record['assigneeId'];
    }

    if (isset($record['assigneeIds']) && is_array($record['assigneeIds'])) {
        foreach ($record['assigneeIds'] as $value) {
            if ($value === null || $value === '') {
                continue;
            }

            $candidates[] = (string) $value;
        }
    }

    if (!empty($record['responsible'])) {
        $candidates[] = (string) $record['responsible'];
    }

    if (!empty($record['number']) && !empty($record['responsible'])) {
        $candidates[] = trim((string) $record['number'] . ' ' . (string) $record['responsible']);
    }

    if (isset($record['responsibles']) && is_array($record['responsibles'])) {
        foreach ($record['responsibles'] as $entry) {
            if (is_array($entry)) {
                foreach (['responsible', 'name', 'fio'] as $field) {
                    if (!empty($entry[$field])) {
                        $candidates[] = (string) $entry[$field];
                    }
                }

                foreach (['id', 'chatId', 'chat_id', 'telegram', 'number', 'email', 'login'] as $field) {
                    if (!empty($entry[$field])) {
                        $candidates[] = (string) $entry[$field];
                    }
                }

                if (!empty($entry['number'])) {
                    $responsibleName = $entry['responsible'] ?? ($entry['name'] ?? '');
                    if ($responsibleName !== '') {
                        $candidates[] = trim((string) $entry['number'] . ' ' . (string) $responsibleName);
                    }
                }
            } elseif ($entry !== null && $entry !== '') {
                $candidates[] = (string) $entry;
            }
        }
    }

    $filtered = array_filter(array_map(static function ($value) {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }, $candidates));

    return array_values(array_unique($filtered));
}

function docs_record_is_active(array $record): bool
{
    $status = isset($record['status']) ? sanitize_text_field((string) $record['status'], 120) : '';

    if ($status === '') {
        return true;
    }

    $normalized = mb_strtolower($status, 'UTF-8');
    $inactiveTokens = ['выполн', 'отмен', 'заверш', 'done', 'cancel', 'закрыт'];

    foreach ($inactiveTokens as $token) {
        if (mb_strpos($normalized, $token) !== false) {
            return false;
        }
    }

    return true;
}

function docs_enrich_responsibles_with_counts(array $responsibles, array $records): array
{
    if (empty($responsibles) || empty($records)) {
        return $responsibles;
    }

    $totals = [];
    $seen = [];

    foreach ($records as $index => $record) {
        if (!is_array($record)) {
            continue;
        }

        $candidates = docs_collect_record_responsible_candidates($record);
        if (empty($candidates)) {
            continue;
        }

        $keyParts = [];
        if (!empty($record['id'])) {
            $keyParts[] = (string) $record['id'];
        }
        if (!empty($record['organization'])) {
            $keyParts[] = (string) $record['organization'];
        }
        if (!empty($record['registryNumber'])) {
            $keyParts[] = (string) $record['registryNumber'];
        }
        if (empty($keyParts)) {
            $keyParts[] = (string) $index;
        }

        $recordKey = implode('|', $keyParts);
        $isActive = docs_record_is_active($record);

        foreach ($responsibles as $responsibleIndex => $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $matched = false;
            foreach ($candidates as $candidate) {
                if (docs_entry_matches_candidate($entry, $candidate)) {
                    $matched = true;
                    break;
                }
            }

            if (!$matched) {
                continue;
            }

            if (!isset($seen[$responsibleIndex])) {
                $seen[$responsibleIndex] = [];
                $totals[$responsibleIndex] = ['total' => 0, 'active' => 0];
            }

            if (isset($seen[$responsibleIndex][$recordKey])) {
                continue;
            }

            $seen[$responsibleIndex][$recordKey] = true;
            $totals[$responsibleIndex]['total']++;
            if ($isActive) {
                $totals[$responsibleIndex]['active']++;
            }
        }
    }

    foreach ($responsibles as $responsibleIndex => &$entry) {
        if (!is_array($entry)) {
            continue;
        }

        if (isset($totals[$responsibleIndex])) {
            $entry['totalCount'] = $totals[$responsibleIndex]['total'];
            $entry['activeCount'] = $totals[$responsibleIndex]['active'];
            if (!isset($entry['count']) || !is_numeric($entry['count'])) {
                $entry['count'] = $totals[$responsibleIndex]['active'];
            }
        } else {
            $entry['totalCount'] = $entry['totalCount'] ?? 0;
            $entry['activeCount'] = $entry['activeCount'] ?? 0;
            if (!isset($entry['count'])) {
                $entry['count'] = 0;
            }
        }
    }
    unset($entry);

    return $responsibles;
}

function docs_build_subordinate_directory(array $subordinates, array $responsibles): array
{
    $merged = $subordinates;

    foreach ($responsibles as $responsible) {
        if (!is_array($responsible)) {
            continue;
        }

        $entry = $responsible;
        $entry['role'] = 'subordinate';
        $merged[] = $entry;
    }

    if (empty($merged)) {
        return [];
    }

    return docs_filter_unique_assignees_by_primary_keys($merged);
}

function docs_user_is_block2_member(array $block2, array $requestContext): bool
{
    if (empty($block2)) {
        return false;
    }

    $candidates = [];

    if (!empty($requestContext['primaryId'])) {
        $candidates[] = (string) $requestContext['primaryId'];
    }

    if (isset($requestContext['raw']['telegram_user_id']) && $requestContext['raw']['telegram_user_id'] !== '') {
        $candidates[] = (string) $requestContext['raw']['telegram_user_id'];
    }

    if (isset($requestContext['raw']['telegram_chat_id']) && $requestContext['raw']['telegram_chat_id'] !== '') {
        $candidates[] = (string) $requestContext['raw']['telegram_chat_id'];
    }

    if (isset($requestContext['user']['username']) && $requestContext['user']['username'] !== '') {
        $candidates[] = (string) $requestContext['user']['username'];
    }

    if (isset($requestContext['user']['fullName']) && $requestContext['user']['fullName'] !== '') {
        $candidates[] = (string) $requestContext['user']['fullName'];
    }

    if (isset($requestContext['user']['firstName']) || isset($requestContext['user']['lastName'])) {
        $full = trim((string) ($requestContext['user']['firstName'] ?? '') . ' ' . (string) ($requestContext['user']['lastName'] ?? ''));
        if ($full !== '') {
            $candidates[] = $full;
        }
    }

    $candidates = array_values(array_unique(array_filter($candidates, static function ($value) {
        return $value !== null && $value !== '';
    })));

    if (empty($candidates)) {
        return false;
    }

    foreach ($block2 as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        foreach ($candidates as $candidate) {
            if (docs_entry_matches_candidate($entry, $candidate)) {
                return true;
            }
        }
    }

    return false;
}

function docs_user_can_manage_instructions(?string $organization, array $requestContext, ?array $sessionAuth = null, ?array $block2 = null): bool
{
    $sessionRole = '';
    if (is_array($sessionAuth) && isset($sessionAuth['role'])) {
        $sessionRole = strtolower((string) $sessionAuth['role']);
    }

    if ($block2 === null) {
        if ($organization === null || $organization === '') {
            return false;
        }

        $folder = sanitize_folder_name($organization);
        $settings = load_admin_settings($folder);
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
    }

    if (empty($block2)) {
        return false;
    }

    return docs_user_is_block2_member($block2, $requestContext);
}

function docs_user_can_manage_subordinates(?array $sessionAuth): bool
{
    if (!is_array($sessionAuth)) {
        return false;
    }

    $role = strtolower((string) ($sessionAuth['role'] ?? ''));
    if ($role === 'admin') {
        return true;
    }

    if ($role !== 'user') {
        return false;
    }

    $responsibleRole = strtolower((string) ($sessionAuth['responsibleRole'] ?? ''));
    if ($responsibleRole === '') {
        return false;
    }

    $allowed = [
        'director',
        'responsible',
        'administrator',
        'admin',
        'директор',
        'ответственный',
        'администратор',
        'руководитель',
    ];

    return in_array($responsibleRole, $allowed, true);
}

function docs_collect_session_auth_candidates(array $sessionAuth): array
{
    $candidates = [];

    $pushCandidate = static function ($value) use (&$candidates): void {
        if ($value === null) {
            return;
        }

        if (is_scalar($value)) {
            $string = trim((string) $value);
            if ($string !== '') {
                $candidates[] = $string;
            }
            return;
        }

        if (is_array($value)) {
            foreach ($value as $nested) {
                if (is_scalar($nested)) {
                    $string = trim((string) $nested);
                    if ($string !== '') {
                        $candidates[] = $string;
                    }
                }
            }
        }
    };

    $identifierFields = ['login', 'telegramId', 'chatId', 'responsibleNumber', 'id', 'userId', 'username'];
    foreach ($identifierFields as $field) {
        if (isset($sessionAuth[$field])) {
            $pushCandidate($sessionAuth[$field]);
        }
    }

    if (isset($sessionAuth['fullName'])) {
        $pushCandidate($sessionAuth['fullName']);
    }

    $firstName = isset($sessionAuth['firstName']) ? (string) $sessionAuth['firstName'] : '';
    $lastName = isset($sessionAuth['lastName']) ? (string) $sessionAuth['lastName'] : '';
    if ($firstName !== '') {
        $pushCandidate($firstName);
    }
    if ($lastName !== '') {
        $pushCandidate($lastName);
    }
    $combined = trim($firstName . ' ' . $lastName);
    if ($combined !== '') {
        $pushCandidate($combined);
    }

    return array_values(array_unique($candidates));
}

function docs_session_user_is_restricted_for_deletion(?array $sessionAuth, ?array $settings): bool
{
    if (!is_array($sessionAuth) || !is_array($settings)) {
        return false;
    }

    $role = strtolower((string) ($sessionAuth['role'] ?? ''));
    if ($role !== 'admin') {
        return false;
    }

    // Администратор должен сохранять полный доступ даже если указан в списках ответственных/подчинённых.
    return false;
}

function docs_user_can_delete_documents(?array $sessionAuth, ?array $settings = null): bool
{
    if (!is_array($sessionAuth)) {
        return false;
    }

    $role = strtolower((string) ($sessionAuth['role'] ?? ''));
    if ($role !== 'admin') {
        return false;
    }

    if (!is_array($settings)) {
        return true;
    }

    return !docs_session_user_is_restricted_for_deletion($sessionAuth, $settings);
}

function docs_user_can_create_documents(?array $sessionAuth): bool
{
    if (!is_array($sessionAuth)) {
        return false;
    }

    $role = strtolower((string) ($sessionAuth['role'] ?? ''));
    if ($role !== 'admin') {
        return false;
    }

    $adminScope = strtolower((string) ($sessionAuth['adminScope'] ?? ''));
    if ($adminScope === 'director') {
        return false;
    }

    return true;
}

function docs_resolve_column_width_owner_id(array $requestContext, ?array $sessionAuth = null): string
{
    $candidates = [];

    if (is_array($sessionAuth)) {
        $candidates[] = $sessionAuth['login'] ?? '';
        $candidates[] = $sessionAuth['telegramId'] ?? '';
        $candidates[] = $sessionAuth['chatId'] ?? '';
        $candidates[] = $sessionAuth['responsibleNumber'] ?? '';
    }

    if (!empty($requestContext['primaryId'])) {
        $candidates[] = (string) $requestContext['primaryId'];
    }

    if (isset($requestContext['user']) && is_array($requestContext['user'])) {
        $requestUser = $requestContext['user'];
        $candidates[] = $requestUser['id'] ?? '';
        $candidates[] = $requestUser['username'] ?? '';
        $candidates[] = $requestUser['fullName'] ?? '';
    }

    foreach ($candidates as $candidate) {
        $normalized = docs_normalize_identifier_candidate_value((string) $candidate);
        if ($normalized !== '') {
            return substr($normalized, 0, 120);
        }
    }

    return '';
}

function docs_resolve_column_width_profile(string $organization, array $requestContext, ?array $sessionAuth = null, ?array $block2 = null): string
{
    $role = '';
    if (is_array($sessionAuth) && isset($sessionAuth['role'])) {
        $role = strtolower((string) $sessionAuth['role']);
    }

    $baseProfile = 'responsible';
    if ($role === 'admin') {
        $baseProfile = 'admin';
    } else {
        if ($block2 === null) {
            if ($organization !== '') {
                $folder = sanitize_folder_name($organization);
                $settings = load_admin_settings($folder);
                $block2 = isset($settings['block2']) && is_array($settings['block2'])
                    ? $settings['block2']
                    : [];
            } else {
                $block2 = [];
            }
        }

        if (!empty($block2) && docs_user_is_block2_member($block2, $requestContext)) {
            $baseProfile = 'director';
        }
    }

    $ownerId = docs_resolve_column_width_owner_id($requestContext, $sessionAuth);
    if ($ownerId !== '') {
        return $baseProfile . ':' . $ownerId;
    }

    return $baseProfile;
}

function docs_build_permissions_summary(?string $organization, array $requestContext, ?array $sessionAuth = null, ?array $block2 = null, ?array $settings = null): array
{
    $role = is_array($sessionAuth) ? strtolower((string) ($sessionAuth['role'] ?? '')) : '';

    $settingsForDeletion = $settings;
    if ($settingsForDeletion === null && $role === 'admin' && $organization !== null && $organization !== '') {
        static $settingsCache = [];
        $folder = sanitize_folder_name($organization);
        if (!array_key_exists($folder, $settingsCache)) {
            $settingsCache[$folder] = load_admin_settings($folder);
        }
        $settingsForDeletion = $settingsCache[$folder];
    }

    return [
        'canManageInstructions' => docs_user_can_manage_instructions($organization, $requestContext, $sessionAuth, $block2),
        'canCreateDocuments' => docs_user_can_create_documents($sessionAuth),
        'canManageSubordinates' => docs_user_can_manage_subordinates($sessionAuth),
        'canDeleteDocuments' => docs_user_can_delete_documents($sessionAuth, $settingsForDeletion),
    ];
}

function docs_collect_request_identity_candidates(array $requestContext): array
{
    $ids = [];
    $names = [];

    $pushId = static function ($value) use (&$ids): void {
        $normalized = docs_normalize_identifier_candidate_value($value);
        if ($normalized !== '') {
            $ids[$normalized] = true;
        }
    };

    $pushName = static function ($value) use (&$names): void {
        $normalized = docs_normalize_name_candidate_value($value);
        if ($normalized !== '') {
            $names[$normalized] = true;
        }
    };

    if (!empty($requestContext['primaryId'])) {
        $pushId($requestContext['primaryId']);
    }

    if (isset($requestContext['raw']) && is_array($requestContext['raw'])) {
        $raw = $requestContext['raw'];
        if (!empty($raw['telegram_user_id'])) {
            $pushId($raw['telegram_user_id']);
        }
        if (!empty($raw['telegram_chat_id'])) {
            $pushId($raw['telegram_chat_id']);
        }
        if (!empty($raw['telegram_username'])) {
            $pushId($raw['telegram_username']);
        }
        if (!empty($raw['telegram_full_name'])) {
            $pushName($raw['telegram_full_name']);
        }
    }

    if (isset($requestContext['user']) && is_array($requestContext['user'])) {
        $user = $requestContext['user'];
        if (!empty($user['id'])) {
            $pushId($user['id']);
        }
        if (!empty($user['username'])) {
            $pushId($user['username']);
        }
        if (!empty($user['fullName'])) {
            $pushName($user['fullName']);
        }
        $full = trim((string) ($user['firstName'] ?? '') . ' ' . (string) ($user['lastName'] ?? ''));
        if ($full !== '') {
            $pushName($full);
        }
    }

    if (isset($requestContext['filter']) && is_array($requestContext['filter'])) {
        $filter = $requestContext['filter'];
        if (!empty($filter['ids']) && is_array($filter['ids'])) {
            foreach ($filter['ids'] as $value) {
                $pushId($value);
            }
        }
        if (!empty($filter['username'])) {
            $pushId($filter['username']);
        }
        if (!empty($filter['fullName'])) {
            $pushName($filter['fullName']);
        }
    }

    return [
        'ids' => array_keys($ids),
        'names' => array_keys($names),
    ];
}

function docs_collect_record_assignee_candidates(array $record): array
{
    $ids = [];
    $names = [];

    $pushId = static function ($value) use (&$ids): void {
        $normalized = docs_normalize_identifier_candidate_value($value);
        if ($normalized !== '') {
            $ids[$normalized] = true;
        }
    };

    $pushName = static function ($value) use (&$names): void {
        $normalized = docs_normalize_name_candidate_value($value);
        if ($normalized !== '') {
            $names[$normalized] = true;
        }
    };

    $assignees = docs_extract_assignees($record);
    foreach ($assignees as $assignee) {
        if (!is_array($assignee)) {
            continue;
        }
        foreach (['id', 'telegram', 'chatId', 'number', 'email', 'login'] as $field) {
            if (!empty($assignee[$field])) {
                $pushId($assignee[$field]);
            }
        }
        foreach (['name', 'responsible'] as $field) {
            if (!empty($assignee[$field])) {
                $pushName($assignee[$field]);
            }
        }
    }

    if (isset($record['assigneeIds']) && is_array($record['assigneeIds'])) {
        foreach ($record['assigneeIds'] as $candidate) {
            $pushId($candidate);
        }
    }

    if (!empty($record['assigneeId'])) {
        $pushId($record['assigneeId']);
    }

    if (!empty($record['responsible'])) {
        $pushName($record['responsible']);
    }

    if (isset($record['responsibles']) && is_array($record['responsibles'])) {
        foreach ($record['responsibles'] as $candidate) {
            $pushName($candidate);
        }
    }

    return [
        'ids' => array_keys($ids),
        'names' => array_keys($names),
    ];
}

function docs_collect_record_subordinate_candidates(array $record): array
{
    $ids = [];
    $names = [];

    $pushId = static function ($value) use (&$ids): void {
        $normalized = docs_normalize_identifier_candidate_value($value);
        if ($normalized !== '') {
            $ids[$normalized] = true;
        }
    };

    $pushName = static function ($value) use (&$names): void {
        $normalized = docs_normalize_name_candidate_value($value);
        if ($normalized !== '') {
            $names[$normalized] = true;
        }
    };

    $subordinates = [];
    if (isset($record['subordinates']) && is_array($record['subordinates'])) {
        $subordinates = $record['subordinates'];
    } elseif (isset($record['subordinate']) && is_array($record['subordinate'])) {
        $subordinates = [$record['subordinate']];
    }

    foreach ($subordinates as $subordinate) {
        if (!is_array($subordinate)) {
            continue;
        }
        foreach (['id', 'telegram', 'chatId', 'number', 'email', 'login'] as $field) {
            if (!empty($subordinate[$field])) {
                $pushId($subordinate[$field]);
            }
        }
        foreach (['name', 'responsible'] as $field) {
            if (!empty($subordinate[$field])) {
                $pushName($subordinate[$field]);
            }
        }
    }

    return [
        'ids' => array_keys($ids),
        'names' => array_keys($names),
    ];
}

function docs_request_matches_record_assignee(array $record, array $requestContext): bool
{
    $userCandidates = docs_collect_request_identity_candidates($requestContext);
    if (empty($userCandidates['ids']) && empty($userCandidates['names'])) {
        return false;
    }

    $recordCandidates = docs_collect_record_assignee_candidates($record);

    foreach ($userCandidates['ids'] as $candidate) {
        if (in_array($candidate, $recordCandidates['ids'], true)) {
            return true;
        }
    }

    foreach ($userCandidates['names'] as $candidate) {
        if (in_array($candidate, $recordCandidates['names'], true)) {
            return true;
        }
    }

    return false;
}

function docs_request_matches_record_subordinate(array $record, array $requestContext): bool
{
    $userCandidates = docs_collect_request_identity_candidates($requestContext);
    if (empty($userCandidates['ids']) && empty($userCandidates['names'])) {
        return false;
    }

    $recordCandidates = docs_collect_record_subordinate_candidates($record);

    foreach ($userCandidates['ids'] as $candidate) {
        if (in_array($candidate, $recordCandidates['ids'], true)) {
            return true;
        }
    }

    foreach ($userCandidates['names'] as $candidate) {
        if (in_array($candidate, $recordCandidates['names'], true)) {
            return true;
        }
    }

    return false;
}

function docs_entry_assigned_by_user(array $entry, array $requestContext): bool
{
    if (!is_array($entry)) {
        return false;
    }

    $assignedByRaw = sanitize_text_field((string) ($entry['assignedBy'] ?? ''), 200);
    if ($assignedByRaw === '') {
        return false;
    }

    $userCandidates = docs_collect_request_identity_candidates($requestContext);
    if (empty($userCandidates['ids']) && empty($userCandidates['names'])) {
        return false;
    }

    $assignedByName = docs_normalize_name_candidate_value($assignedByRaw);
    if ($assignedByName !== '' && in_array($assignedByName, $userCandidates['names'], true)) {
        return true;
    }

    $assignedById = docs_normalize_identifier_candidate_value($assignedByRaw);
    if ($assignedById !== '' && in_array($assignedById, $userCandidates['ids'], true)) {
        return true;
    }

    return false;
}

function docs_find_responsible_by_candidate(array $responsibles, string $candidate): ?array
{
    if ($candidate === '') {
        return null;
    }

    foreach ($responsibles as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        if (docs_entry_matches_candidate($entry, $candidate)) {
            return $entry;
        }
    }

    return null;
}

function docs_resolve_responsible_identifier(array $entry, string $candidate): string
{
    $normalizedCandidate = docs_normalize_identifier_candidate_value($candidate);
    if ($normalizedCandidate !== '') {
        foreach (['telegram', 'chatId', 'id', 'number', 'email', 'login'] as $field) {
            if (!isset($entry[$field])) {
                continue;
            }
            $value = docs_normalize_identifier_candidate_value($entry[$field]);
            if ($value !== '' && $value === $normalizedCandidate) {
                return (string) $entry[$field];
            }
        }
    }

    $entryName = $entry['responsible'] ?? ($entry['name'] ?? '');
    $compositeKey = docs_build_responsible_composite_key($entry['number'] ?? '', $entryName);
    $candidateComposite = docs_normalize_responsible_composite_key_value($candidate);
    if ($compositeKey !== '' && $candidateComposite !== '' && $compositeKey === $candidateComposite) {
        return (string) $candidate;
    }

    if (isset($entry['responsible'])) {
        $entryName = docs_normalize_name_candidate_value($entry['responsible']);
        $candidateName = docs_normalize_name_candidate_value($candidate);
        if ($entryName !== '' && $candidateName !== '' && $entryName === $candidateName) {
            return (string) $entry['responsible'];
        }
    }

    return (string) $candidate;
}

function docs_build_assignee_from_responsible_entry(array $entry, string $candidate): array
{
    $assignee = [
        'id' => docs_resolve_responsible_identifier($entry, $candidate),
        'name' => $entry['responsible'] ?? '',
        'department' => $entry['department'] ?? '',
        'telegram' => $entry['telegram'] ?? '',
        'chatId' => $entry['chatId'] ?? '',
        'login' => $entry['login'] ?? '',
        'email' => $entry['email'] ?? '',
        'note' => $entry['note'] ?? '',
    ];

    return sanitize_assignee_payload($assignee, true);
}

function docs_find_subordinate_by_candidate(array $subordinates, string $candidate): ?array
{
    return docs_find_responsible_by_candidate($subordinates, $candidate);
}

function docs_build_subordinate_assignment_from_entry(array $entry, string $candidate): array
{
    $assignee = docs_build_assignee_from_responsible_entry($entry, $candidate);
    if (empty($assignee)) {
        return [];
    }

    $assignee['role'] = 'subordinate';

    return sanitize_assignee_payload($assignee, false);
}

function docs_pick_responsible_candidate(array $entry): string
{
    $fields = ['telegram', 'chatId', 'id', 'number', 'email', 'login', 'responsible'];
    foreach ($fields as $field) {
        if (!isset($entry[$field])) {
            continue;
        }

        $value = docs_normalize_identifier_candidate_value($entry[$field]);
        if ($value !== '') {
            return (string) $entry[$field];
        }
    }

    return '';
}

function docs_build_director_assignment_from_entry(array $entry, string $authorLabel = '', string $authorRole = ''): array
{
    $candidate = docs_pick_responsible_candidate($entry);
    $director = docs_build_assignee_from_responsible_entry($entry, $candidate !== '' ? $candidate : ($entry['responsible'] ?? ''));
    if (empty($director)) {
        return [];
    }

    if ($authorLabel !== '') {
        $assignments = docs_assign_author_to_assignees([$director], $authorLabel, $authorRole);
        $director = $assignments[0] ?? $director;
    }

    return $director;
}

function save_admin_settings(string $folder, array $settings): void
{
    $dir = ensure_organization_directory($folder);
    $file = $dir . '/' . SETTINGS_FILENAME;
    $existing = [];
    if (is_file($file)) {
        $raw = file_get_contents($file);
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $existing = $decoded;
            }
        }
    }

    if (isset($settings['columnWidths'])) {
        $settings['columnWidths'] = docs_normalize_column_width_map($settings['columnWidths']);
    } elseif (isset($existing['columnWidths']) && is_array($existing['columnWidths'])) {
        $settings['columnWidths'] = docs_normalize_column_width_map($existing['columnWidths']);
    }

    $json = json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents($file, $json, LOCK_EX);
}

function sanitize_assignee_payload($value, bool $refreshTimestamp = false): array
{
    if (!is_array($value)) {
        return [];
    }

    $assignee = [
        'id' => sanitize_text_field($value['id'] ?? '', 120),
        'name' => sanitize_text_field($value['name'] ?? '', 200),
        'department' => sanitize_text_field($value['department'] ?? '', 160),
        'note' => sanitize_text_field($value['note'] ?? '', 200),
        'telegram' => sanitize_text_field($value['telegram'] ?? '', 120),
        'chatId' => sanitize_text_field($value['chatId'] ?? '', 40),
        'login' => sanitize_text_field($value['login'] ?? '', 120),
        'email' => sanitize_text_field($value['email'] ?? '', 160),
        'assignedBy' => sanitize_text_field($value['assignedBy'] ?? '', 200),
        'assignedByTelegram' => sanitize_text_field($value['assignedByTelegram'] ?? '', 120),
        'assignedById' => sanitize_text_field($value['assignedById'] ?? '', 120),
        'assignedByLogin' => sanitize_text_field($value['assignedByLogin'] ?? '', 120),
        'assignedByRole' => sanitize_text_field($value['assignedByRole'] ?? '', 60),
        'assignedAt' => sanitize_text_field($value['assignedAt'] ?? '', 40),
        'assignmentComment' => sanitize_assignment_comment($value['assignmentComment'] ?? ''),
        'assignmentDueDate' => sanitize_date_field($value['assignmentDueDate'] ?? ''),
        'assignmentInstruction' => sanitize_instruction($value['assignmentInstruction'] ?? ''),
    ];

    if (isset($value['status'])) {
        $status = sanitize_status((string) $value['status']);
        if ($status !== '') {
            $assignee['status'] = $status;
        }
    }

    if (isset($value['role'])) {
        $roleCandidate = sanitize_text_field((string) $value['role'], 60);
        $normalizedRole = strtolower($roleCandidate);
        if (in_array($normalizedRole, ['responsible', 'subordinate'], true)) {
            $assignee['role'] = $normalizedRole;
        }
    }

    if (!empty($assignee['assignedByRole'])) {
        $assignee['assignedByRole'] = docs_normalize_assignment_role($assignee['assignedByRole']);
    }

    $assignee = array_filter($assignee, static function ($item) {
        return $item !== '';
    });

    if (empty($assignee)) {
        return [];
    }

    if ($refreshTimestamp || !isset($assignee['assignedAt']) || $assignee['assignedAt'] === '') {
        $assignee['assignedAt'] = date('c');
    }

    return $assignee;
}

function docs_build_assignment_author_label(?array $source): string
{
    if (!is_array($source)) {
        return '';
    }

    $fullName = sanitize_text_field((string) ($source['fullName'] ?? ''), 200);
    if ($fullName !== '') {
        return $fullName;
    }

    $name = sanitize_text_field((string) ($source['name'] ?? ''), 200);
    if ($name !== '') {
        return $name;
    }

    $firstName = sanitize_text_field((string) ($source['firstName'] ?? ''), 120);
    $lastName = sanitize_text_field((string) ($source['lastName'] ?? ''), 160);
    $combined = trim($firstName . ' ' . $lastName);
    if ($combined !== '') {
        return $combined;
    }

    $login = sanitize_text_field((string) ($source['login'] ?? ''), 120);
    if ($login !== '') {
        return $login;
    }

    $username = sanitize_text_field((string) ($source['username'] ?? ''), 120);
    if ($username !== '') {
        return $username;
    }

    return '';
}

function docs_extract_assignment_author_meta(?array $source): array
{
    if (!is_array($source)) {
        return [];
    }

    $meta = [];

    $telegramCandidates = [
        $source['telegram'] ?? '',
        $source['telegramId'] ?? '',
        $source['chatId'] ?? '',
        $source['id'] ?? '',
    ];
    foreach ($telegramCandidates as $candidate) {
        $normalized = normalize_identifier_value($candidate);
        if ($normalized !== '') {
            $meta['assignedByTelegram'] = $normalized;
            break;
        }
    }

    if (!empty($source['id'])) {
        $normalized = normalize_identifier_value($source['id']);
        if ($normalized !== '') {
            $meta['assignedById'] = $normalized;
        }
    }

    $loginCandidates = [
        $source['login'] ?? '',
        $source['username'] ?? '',
    ];
    foreach ($loginCandidates as $candidate) {
        $sanitized = sanitize_text_field((string) $candidate, 120);
        if ($sanitized !== '') {
            $meta['assignedByLogin'] = $sanitized;
            break;
        }
    }

    return $meta;
}

function docs_assign_author_to_assignees(array $assignees, string $authorLabel, string $authorRole = '', array $authorMeta = []): array
{
    $label = sanitize_text_field($authorLabel, 200);
    $role = docs_normalize_assignment_role($authorRole);
    $assignedByTelegram = normalize_identifier_value($authorMeta['assignedByTelegram'] ?? '');
    $assignedById = normalize_identifier_value($authorMeta['assignedById'] ?? '');
    $assignedByLogin = sanitize_text_field((string) ($authorMeta['assignedByLogin'] ?? ''), 120);

    if ($label === '') {
        return $assignees;
    }

    foreach ($assignees as &$entry) {
        if (!is_array($entry)) {
            continue;
        }

        if (!isset($entry['assignedBy']) || $entry['assignedBy'] === '') {
            $entry['assignedBy'] = $label;
        }

        if ($role !== '' && (!isset($entry['assignedByRole']) || $entry['assignedByRole'] === '')) {
            $entry['assignedByRole'] = $role;
        }

        if ($assignedByTelegram !== '' && (!isset($entry['assignedByTelegram']) || $entry['assignedByTelegram'] === '')) {
            $entry['assignedByTelegram'] = $assignedByTelegram;
        }

        if ($assignedById !== '' && (!isset($entry['assignedById']) || $entry['assignedById'] === '')) {
            $entry['assignedById'] = $assignedById;
        }

        if ($assignedByLogin !== '' && (!isset($entry['assignedByLogin']) || $entry['assignedByLogin'] === '')) {
            $entry['assignedByLogin'] = $assignedByLogin;
        }
    }
    unset($entry);

    return $assignees;
}

function docs_assignment_details_unchanged(array $previous, array $current): bool
{
    $keys = ['assignmentComment', 'assignmentDueDate', 'assignmentInstruction', 'role'];
    foreach ($keys as $key) {
        $previousValue = docs_normalize_assignee_comparison_value($previous, $key);
        $currentValue = docs_normalize_assignee_comparison_value($current, $key);
        if ($previousValue !== $currentValue) {
            return false;
        }
    }

    return true;
}

function docs_validate_assigned_by_override(array $record, string $folder, array $assigneeEntry): ?array
{
    $explicitAssignedBy = sanitize_text_field((string) ($assigneeEntry['assignedBy'] ?? ''), 200);
    if ($explicitAssignedBy === '') {
        return null;
    }

    $matchedAuthor = docs_find_assignment_author_entry($record, $folder, $assigneeEntry);
    if ($matchedAuthor === null) {
        return null;
    }

    $source = 'unknown';
    $normalizedRole = docs_normalize_assignment_role((string) ($matchedAuthor['role'] ?? ''));
    if ($normalizedRole === 'subordinate') {
        $source = 'subordinates';
    } elseif ($normalizedRole === 'responsible') {
        $source = 'assignees';
    } elseif (isset($matchedAuthor['source']) && is_string($matchedAuthor['source']) && $matchedAuthor['source'] !== '') {
        $source = sanitize_text_field($matchedAuthor['source'], 80);
    } else {
        $source = 'directors_or_settings';
    }

    return [
        'assignedBy' => $explicitAssignedBy,
        'assignedByRole' => docs_normalize_assignment_role((string) ($assigneeEntry['assignedByRole'] ?? '')),
        'source' => $source,
    ];
}

function docs_log_self_assign_marker_warning(array $assigneeEntry, array $context = []): void
{
    $assignedByRaw = sanitize_text_field((string) ($assigneeEntry['assignedBy'] ?? ''), 200);
    if ($assignedByRaw === '') {
        return;
    }

    $assigneeKeys = [];
    foreach (docs_collect_assignee_index_keys($assigneeEntry) as $key) {
        $normalized = mb_strtolower(trim((string) $key), 'UTF-8');
        if ($normalized !== '') {
            $assigneeKeys[$normalized] = true;
        }
    }

    $assignedByCandidates = [];
    $assignedByName = docs_normalize_name_candidate_value($assignedByRaw);
    if ($assignedByName !== '') {
        $assignedByCandidates['name::' . $assignedByName] = true;
    }
    $assignedById = docs_normalize_identifier_candidate_value($assignedByRaw);
    if ($assignedById !== '') {
        $assignedByCandidates['id::' . $assignedById] = true;
    }
    foreach (['assignedById', 'assignedByLogin'] as $field) {
        if (empty($assigneeEntry[$field])) {
            continue;
        }
        $normalized = docs_normalize_identifier_candidate_value($assigneeEntry[$field]);
        if ($normalized !== '') {
            $assignedByCandidates['id::' . $normalized] = true;
        }
    }

    $isSelfAssigned = false;
    foreach (array_keys($assignedByCandidates) as $candidate) {
        if (isset($assigneeKeys[$candidate])) {
            $isSelfAssigned = true;
            break;
        }
    }

    if (!$isSelfAssigned) {
        return;
    }

    $payloadContext = array_merge($context, [
        'warning' => 'self-assign marker',
        'assignee' => sanitize_text_field((string) ($assigneeEntry['name'] ?? ''), 200),
        'assignedBy' => $assignedByRaw,
        'assigneeKeys' => array_values(array_keys($assigneeKeys)),
        'assignedByCandidates' => array_values(array_keys($assignedByCandidates)),
    ]);

    docs_write_response_log('assignment self-assign marker warning', $payloadContext);
    docs_log_view_status_event('assignment self-assign marker warning', $payloadContext);
}

function sanitize_assignees_payload($value, bool $refreshTimestamp = false): array
{
    if (!is_array($value)) {
        return [];
    }

    $result = [];
    foreach ($value as $entry) {
        $sanitized = sanitize_assignee_payload($entry, $refreshTimestamp);
        if (!empty($sanitized)) {
            $result[] = $sanitized;
        }
    }

    return $result;
}

function build_assignee_from_request(array $source): array
{
    $payload = [
        'id' => $source['assignee_id'] ?? '',
        'name' => $source['assignee_name'] ?? '',
        'department' => $source['assignee_department'] ?? '',
        'note' => $source['assignee_note'] ?? '',
        'telegram' => $source['assignee_telegram'] ?? '',
        'chatId' => $source['assignee_chat_id'] ?? '',
        'email' => $source['assignee_email'] ?? '',
        'status' => $source['assignee_status'] ?? '',
    ];

    return sanitize_assignee_payload($payload, true);
}

function build_assignees_from_request(array $source, bool $refreshTimestamp = true): array
{
    $raw = $source['assignees'] ?? [];

    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $raw = $decoded;
        } else {
            $raw = [];
        }
    }

    if (!is_array($raw)) {
        return [];
    }

    return sanitize_assignees_payload($raw, $refreshTimestamp);
}

function docs_extract_assignees(array $record): array
{
    $assignees = [];

    if (isset($record['assignees']) && is_array($record['assignees'])) {
        foreach ($record['assignees'] as $entry) {
            if (is_array($entry)) {
                $assignees[] = $entry;
            }
        }
    }

    if (isset($record['assignee']) && is_array($record['assignee'])) {
        $assignees[] = $record['assignee'];
    }

    if (empty($assignees)) {
        return [];
    }

    return docs_filter_unique_assignees_by_primary_keys($assignees);
}

function docs_extract_view_participants(array $record, ?array $assigneesOverride = null): array
{
    $participants = [];

    $baseAssignees = $assigneesOverride;
    if ($baseAssignees === null) {
        $baseAssignees = docs_extract_assignees($record);
    }

    if (!empty($baseAssignees)) {
        $participants = array_merge($participants, $baseAssignees);
    }

    $candidateGroups = [
        $record['responsibles'] ?? null,
        $record['subordinates'] ?? null,
        $record['directors'] ?? null,
    ];

    foreach ($candidateGroups as $group) {
        if (!is_array($group)) {
            continue;
        }

        foreach ($group as $entry) {
            if (is_array($entry) && !empty($entry)) {
                $participants[] = $entry;
            }
        }
    }

    foreach (['responsible', 'subordinate', 'director'] as $singleKey) {
        if (isset($record[$singleKey]) && is_array($record[$singleKey]) && !empty($record[$singleKey])) {
            $participants[] = $record[$singleKey];
        }
    }

    if (empty($participants)) {
        return [];
    }

    return docs_filter_unique_assignees_by_primary_keys($participants);
}

function docs_extract_directors(array $record): array
{
    $directors = [];

    if (isset($record['director']) && is_array($record['director']) && !empty($record['director'])) {
        $directors[] = $record['director'];
    }

    if (isset($record['directors']) && is_array($record['directors'])) {
        foreach ($record['directors'] as $entry) {
            if (is_array($entry) && !empty($entry)) {
                $directors[] = $entry;
            }
        }
    }

    return $directors;
}

function docs_collect_assignee_index_keys(array $assignee): array
{
    $keys = [];

    foreach (['id', 'telegram', 'chatId', 'number', 'email', 'login'] as $field) {
        if (!isset($assignee[$field])) {
            continue;
        }

        $normalized = docs_normalize_identifier_candidate_value($assignee[$field]);
        if ($normalized !== '') {
            $keys[] = 'id::' . $normalized;
        }
    }

    foreach (['name', 'responsible'] as $field) {
        if (!isset($assignee[$field])) {
            continue;
        }

        $normalized = docs_normalize_name_candidate_value($assignee[$field]);
        if ($normalized !== '') {
            $keys[] = 'name::' . $normalized;
        }
    }

    $compositeName = $assignee['responsible'] ?? ($assignee['name'] ?? '');
    $compositeKey = docs_build_responsible_composite_key($assignee['number'] ?? '', $compositeName);
    if ($compositeKey !== '') {
        $keys[] = 'combo::' . $compositeKey;
    }

    if (!empty($keys)) {
        $keys = array_values(array_unique($keys));
    }

    return $keys;
}

function docs_filter_unique_assignees_by_primary_keys(array $assignees): array
{
    if (empty($assignees)) {
        return [];
    }

    $unique = [];
    $seenKeys = [];

    foreach ($assignees as $entry) {
        if (!is_array($entry)) {
            $unique[] = $entry;
            continue;
        }

        $keys = [];

        if (array_key_exists('id', $entry)) {
            $normalizedId = docs_normalize_identifier_candidate_value($entry['id']);
            if ($normalizedId !== '') {
                $keys[] = 'id::' . $normalizedId;
            }
        }

        if (array_key_exists('login', $entry)) {
            $normalizedLogin = docs_normalize_identifier_candidate_value($entry['login']);
            if ($normalizedLogin !== '') {
                $keys[] = 'login::' . $normalizedLogin;
            }
        }

        if (!empty($keys)) {
            $isDuplicate = false;
            foreach ($keys as $key) {
                if (isset($seenKeys[$key])) {
                    $isDuplicate = true;
                    break;
                }
            }

            if ($isDuplicate) {
                continue;
            }

            foreach ($keys as $key) {
                $seenKeys[$key] = true;
            }
        }

        $unique[] = $entry;
    }

    return array_values($unique);
}

function docs_apply_assignees_to_record(array &$record, array $assignees, ?array &$newAssignees = null): void
{
    $assignees = array_values($assignees);
    if (!empty($assignees)) {
        $assignees = docs_filter_unique_assignees_by_primary_keys($assignees);
    }

    $previousAssignees = docs_extract_assignees($record);
    $previousIndex = empty($previousAssignees) ? [] : docs_index_assignees($previousAssignees);

    if ($newAssignees !== null) {
        $newAssignees = [];
    }

    if (empty($assignees)) {
        unset($record['assignees'], $record['assignee']);
        if ($newAssignees !== null) {
            $newAssignees = [];
        }
        return;
    }

    $record['assignees'] = $assignees;
    unset($record['assignee']);

    if (isset($record['assigneeViews']) && is_array($record['assigneeViews'])) {
        $validKeys = [];
        $viewParticipants = docs_extract_view_participants($record, $assignees);
        foreach ($viewParticipants as $assigneeEntry) {
            if (!is_array($assigneeEntry)) {
                continue;
            }

            $keys = docs_collect_assignee_index_keys($assigneeEntry);
            foreach ($keys as $key) {
                if ($key !== '') {
                    $validKeys[mb_strtolower($key, 'UTF-8')] = true;
                }
            }
        }

        $filteredViews = [];
        foreach ($record['assigneeViews'] as $viewEntry) {
            if (!is_array($viewEntry)) {
                continue;
            }

            $viewKey = '';
            if (!empty($viewEntry['assigneeKey'])) {
                $viewKey = mb_strtolower((string) $viewEntry['assigneeKey'], 'UTF-8');
            }

            $viewId = isset($viewEntry['id'])
                ? docs_normalize_identifier_candidate_value($viewEntry['id'])
                : '';

            $keep = false;
            if ($viewKey !== '' && isset($validKeys[$viewKey])) {
                $keep = true;
            } elseif ($viewId !== '') {
                foreach ($validKeys as $key => $_) {
                    if (strpos($key, 'id::') === 0 && substr($key, 4) === $viewId) {
                        $keep = true;
                        break;
                    }
                }
            }

            if ($keep) {
                $filteredViews[] = $viewEntry;
            }
        }

        if (!empty($filteredViews)) {
            $record['assigneeViews'] = docs_sanitize_assignee_views_payload(array_values($filteredViews));
        } else {
            unset($record['assigneeViews']);
        }
    }

    if (isset($record['assigneeStatusHistory']) && is_array($record['assigneeStatusHistory'])) {
        $validStatusKeys = [];
        foreach ($assignees as $assigneeEntry) {
            if (!is_array($assigneeEntry)) {
                continue;
            }

            $keys = docs_collect_assignee_index_keys($assigneeEntry);
            foreach ($keys as $key) {
                if ($key !== '') {
                    $validStatusKeys[mb_strtolower($key, 'UTF-8')] = true;
                }
            }
        }

        $filteredStatusHistory = [];
        foreach ($record['assigneeStatusHistory'] as $historyEntry) {
            if (!is_array($historyEntry)) {
                continue;
            }

            $entryKey = isset($historyEntry['assigneeKey'])
                ? mb_strtolower((string) $historyEntry['assigneeKey'], 'UTF-8')
                : '';
            if ($entryKey === '' || !isset($validStatusKeys[$entryKey])) {
                continue;
            }

            $sanitizedHistoryEntry = docs_sanitize_assignee_status_history_record($historyEntry);
            if (!empty($sanitizedHistoryEntry)) {
                $filteredStatusHistory[] = $sanitizedHistoryEntry;
            }
        }

        if (!empty($filteredStatusHistory)) {
            $record['assigneeStatusHistory'] = $filteredStatusHistory;
        } else {
            unset($record['assigneeStatusHistory']);
        }
    }

    if ($newAssignees === null) {
        return;
    }

    $seenKeys = [];

    foreach ($assignees as $assignee) {
        if (!is_array($assignee) || empty($assignee)) {
            continue;
        }

        $keys = docs_collect_assignee_index_keys($assignee);
        $isKnown = false;

        foreach ($keys as $key) {
            if ($key === '') {
                continue;
            }

            if (isset($previousIndex[$key]) || isset($seenKeys[$key])) {
                $isKnown = true;
                break;
            }
        }

        foreach ($keys as $key) {
            if ($key !== '') {
                $seenKeys[$key] = true;
            }
        }

        if (!$isKnown) {
            $newAssignees[] = $assignee;
        }
    }
}

function docs_index_assignees(array $assignees): array
{
    $index = [];

    foreach ($assignees as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        foreach (['id', 'telegram', 'chatId', 'number', 'email', 'login'] as $field) {
            if (!isset($entry[$field])) {
                continue;
            }

            $normalized = docs_normalize_identifier_candidate_value($entry[$field]);
            if ($normalized !== '') {
                $index['id::' . $normalized] = $entry;
            }
        }

        foreach (['name', 'responsible'] as $field) {
            if (!isset($entry[$field])) {
                continue;
            }

            $normalizedName = docs_normalize_name_candidate_value($entry[$field]);
            if ($normalizedName !== '') {
                $index['name::' . $normalizedName] = $entry;
            }
        }

        $compositeName = $entry['responsible'] ?? ($entry['name'] ?? '');
        $compositeKey = docs_build_responsible_composite_key($entry['number'] ?? '', $compositeName);
        if ($compositeKey !== '') {
            $index['combo::' . $compositeKey] = $entry;
        }

        $roleCandidates = [
            $entry['role'] ?? null,
            $entry['name'] ?? null,
            $entry['responsible'] ?? null,
        ];
        foreach ($roleCandidates as $roleCandidate) {
            if ($roleCandidate === null || $roleCandidate === '') {
                continue;
            }
            $normalizedRole = docs_normalize_assignment_role((string) $roleCandidate);
            if ($normalizedRole === 'admin') {
                $index['role::admin'] = $entry;
                break;
            }
        }
    }

    return $index;
}

function docs_normalize_assignee_comparison_value(array $assignee, string $field): string
{
    if (!array_key_exists($field, $assignee)) {
        return '';
    }

    $value = $assignee[$field];

    if ($value === null) {
        return '';
    }

    if (is_bool($value)) {
        return $value ? '1' : '0';
    }

    if (is_scalar($value)) {
        return (string) $value;
    }

    if (is_array($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    return (string) $value;
}

function docs_assignee_entries_differ(array $previous, array $current): bool
{
    $ignoredKeys = ['assignedAt'];

    $allKeys = array_keys(array_merge($previous, $current));
    if (empty($allKeys)) {
        return false;
    }

    sort($allKeys);

    foreach ($allKeys as $key) {
        if (in_array($key, $ignoredKeys, true)) {
            continue;
        }

        $previousValue = docs_normalize_assignee_comparison_value($previous, $key);
        $currentValue = docs_normalize_assignee_comparison_value($current, $key);

        if ($previousValue !== $currentValue) {
            return true;
        }
    }

    return false;
}

function docs_collect_changed_assignees(array $previousAssignees, array $currentAssignees): array
{
    if (empty($currentAssignees)) {
        return [];
    }

    $previousIndex = empty($previousAssignees) ? [] : docs_index_assignees($previousAssignees);
    $collected = [];
    $seen = [];

    foreach ($currentAssignees as $assignee) {
        if (!is_array($assignee) || empty($assignee)) {
            continue;
        }

        $keys = docs_collect_assignee_index_keys($assignee);
        $matched = null;

        foreach ($keys as $key) {
            if ($key === '') {
                continue;
            }

            if (isset($previousIndex[$key])) {
                $matched = $previousIndex[$key];
                break;
            }
        }

        $shouldInclude = false;
        if ($matched === null) {
            $shouldInclude = true;
        } elseif (docs_assignee_entries_differ($matched, $assignee)) {
            $shouldInclude = true;
        }

        if (!$shouldInclude) {
            continue;
        }

        $dedupeKey = '';
        if (!empty($keys)) {
            $dedupeKey = implode('|', $keys);
        }

        if ($dedupeKey === '') {
            $encoded = json_encode($assignee, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $dedupeKey = $encoded !== false ? md5($encoded) : spl_object_hash((object) $assignee);
        }

        if (isset($seen[$dedupeKey])) {
            continue;
        }

        $seen[$dedupeKey] = true;
        $collected[] = $assignee;
    }

    return array_values($collected);
}

function generate_document_id(): string
{
    try {
        return 'doc_' . bin2hex(random_bytes(8));
    } catch (Throwable $exception) {
        return 'doc_' . sha1(uniqid('', true));
    }
}

function generate_entry_number(array $records): int
{
    $max = 0;
    foreach ($records as $record) {
        if (isset($record['entryNumber'])) {
            $value = (int) $record['entryNumber'];
            if ($value > $max) {
                $max = $value;
            }
        }
    }

    return $max + 1;
}

function docs_sanitize_file_component(?string $value, string $fallback): string
{
    if ($value === null) {
        $value = '';
    }

    $value = sanitize_text_field($value, 200);
    if ($value === '') {
        return $fallback;
    }

    $value = preg_replace('/[^\p{L}\p{N}\s_-]/u', '', $value);
    $value = preg_replace('/\s+/u', '_', trim((string) $value));
    $value = trim($value, '_-');

    if ($value === '') {
        return $fallback;
    }

    return $value;
}

function docs_sanitize_status_history_entry($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $status = sanitize_status($value['status'] ?? '', false);
    if ($status === '') {
        return [];
    }

    $changedAtRaw = $value['changedAt'] ?? ($value['timestamp'] ?? ($value['date'] ?? ''));
    $normalizedChangedAt = docs_normalize_datetime_iso(is_string($changedAtRaw) ? $changedAtRaw : null);
    if ($normalizedChangedAt === null) {
        return [];
    }

    $entry = [
        'status' => $status,
        'changedAt' => $normalizedChangedAt,
    ];

    $changedBy = sanitize_text_field($value['changedBy'] ?? '', 200);
    if ($changedBy !== '') {
        $entry['changedBy'] = $changedBy;
    }

    return $entry;
}

function docs_sanitize_status_history($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $result = [];
    foreach ($value as $entry) {
        $sanitized = docs_sanitize_status_history_entry($entry);
        if (!empty($sanitized)) {
            $result[] = $sanitized;
        }
    }

    if (empty($result)) {
        return [];
    }

    usort($result, static function ($a, $b) {
        return strcmp($a['changedAt'], $b['changedAt']);
    });

    return $result;
}

function docs_append_assignee_status_history(array &$record, string $assigneeKey, array $entry): void
{
    $normalizedKey = mb_strtolower(trim($assigneeKey), 'UTF-8');
    if ($normalizedKey === '') {
        return;
    }

    $existing = [];
    if (isset($record['assigneeStatusHistory']) && is_array($record['assigneeStatusHistory'])) {
        $existing = docs_sanitize_assignee_status_history_collection($record['assigneeStatusHistory']);
    }

    $map = [];
    foreach ($existing as $historyEntry) {
        $key = mb_strtolower((string) $historyEntry['assigneeKey'], 'UTF-8');
        if ($key === '') {
            continue;
        }
        $map[$key] = $historyEntry;
    }

    if (!isset($map[$normalizedKey])) {
        $map[$normalizedKey] = [
            'assigneeKey' => $assigneeKey,
            'entries' => [],
        ];
    } else {
        $map[$normalizedKey]['assigneeKey'] = $assigneeKey;
    }

    $entries = isset($map[$normalizedKey]['entries']) && is_array($map[$normalizedKey]['entries'])
        ? $map[$normalizedKey]['entries']
        : [];
    $entries[] = $entry;

    $map[$normalizedKey]['entries'] = docs_sanitize_assignee_status_history_entry_collection($entries);

    $record['assigneeStatusHistory'] = docs_sanitize_assignee_status_history_collection(array_values($map));
}

function docs_match_status_change_assignee_key(array $record, array $requestContext, ?array $sessionAuth, string $statusChangeAuthor): ?string
{
    $assignees = docs_extract_assignees($record);
    if (empty($assignees)) {
        return null;
    }

    $index = docs_index_assignees($assignees);
    if (empty($index)) {
        return null;
    }

    $candidateKeys = docs_collect_status_change_candidate_keys($requestContext, $sessionAuth, $statusChangeAuthor);
    foreach ($candidateKeys as $candidateKey) {
        if (isset($index[$candidateKey])) {
            return $candidateKey;
        }
    }

    return null;
}

function docs_append_status_history(array &$record, string $status, string $changedBy = '', ?string $timestamp = null, ?string $assigneeKey = null): void
{
    $normalizedStatus = sanitize_status($status, false);
    if ($normalizedStatus === '') {
        return;
    }

    $normalizedTimestamp = $timestamp !== null
        ? docs_normalize_datetime_iso($timestamp)
        : null;

    if ($normalizedTimestamp === null) {
        $normalizedTimestamp = date('c');
    }

    $entry = [
        'status' => $normalizedStatus,
        'changedAt' => $normalizedTimestamp,
    ];

    $author = sanitize_text_field($changedBy, 200);
    if ($author !== '') {
        $entry['changedBy'] = $author;
    }

    $history = [];
    if (isset($record['statusHistory']) && is_array($record['statusHistory'])) {
        $history = docs_sanitize_status_history($record['statusHistory']);
    }

    if (!empty($history)) {
        $lastEntry = $history[count($history) - 1];
        if (
            isset($lastEntry['status'], $lastEntry['changedAt'])
            && $lastEntry['status'] === $entry['status']
            && $lastEntry['changedAt'] === $entry['changedAt']
        ) {
            if (!empty($entry['changedBy']) && empty($lastEntry['changedBy'])) {
                $history[count($history) - 1]['changedBy'] = $entry['changedBy'];
            }
            $record['statusHistory'] = $history;
            return;
        }
    }

    $history[] = $entry;

    usort($history, static function ($a, $b) {
        return strcmp($a['changedAt'], $b['changedAt']);
    });

    $record['statusHistory'] = $history;

    if ($assigneeKey !== null && $assigneeKey !== '') {
        docs_append_assignee_status_history($record, $assigneeKey, $entry);
    }
}

function docs_parse_datetime(string $value): ?DateTimeImmutable
{
    $value = trim($value);
    if ($value === '') {
        return null;
    }

    try {
        return new DateTimeImmutable($value);
    } catch (Exception $exception) {
        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return null;
        }

        try {
            $dateTime = new DateTimeImmutable('@' . $timestamp);
            return $dateTime->setTimezone(new DateTimeZone(date_default_timezone_get()));
        } catch (Exception $innerException) {
            return null;
        }
    }
}

function docs_build_registration_datetime_component(array $record, int $sequence): string
{
    $date = '';
    $rawDate = (string) ($record['registrationDate'] ?? '');
    if ($rawDate !== '') {
        $dateTime = docs_parse_datetime($rawDate);
        if ($dateTime !== null) {
            $date = $dateTime->format('Y-m-d');
        }
    }

    if ($date === '') {
        $date = date('Y-m-d');
    }

    $time = '';
    foreach (['registrationTime', 'createdAt'] as $field) {
        if (empty($record[$field])) {
            continue;
        }

        $dateTime = docs_parse_datetime((string) $record[$field]);
        if ($dateTime !== null) {
            $time = $dateTime->format('H-i-s');
            break;
        }
    }

    if ($time === '') {
        $time = date('H-i-s');
    }

    $component = $date . '_' . $time;
    if ($sequence > 1) {
        $component .= '-' . $sequence;
    }

    return $component;
}

function normalize_file_name(string $original, array $record, int $sequence = 1): string
{
    $name = trim($original);
    if ($name === '') {
        $name = 'attachment';
    }

    $extension = pathinfo($name, PATHINFO_EXTENSION);
    if ($extension !== '') {
        $extension = preg_replace('/[^A-Za-z0-9]/', '', $extension);
    }

    $organization = docs_sanitize_file_component($record['organization'] ?? '', 'organization');
    $registryNumber = docs_sanitize_file_component($record['registryNumber'] ?? '', 'registry');
    $dateTimeComponent = docs_build_registration_datetime_component($record, $sequence);

    $components = array_filter([$organization, $registryNumber, $dateTimeComponent], static function ($item): bool {
        return $item !== '';
    });

    if (empty($components)) {
        $components[] = 'document';
    }

    $safe = implode('.', $components);
    if ($extension !== '') {
        $safe .= '.' . $extension;
    }

    return $safe;
}

function build_public_path(string $folder, ?string $fileName = null): string
{
    $parts = [$folder];
    if ($fileName !== null && $fileName !== '') {
        $parts[] = $fileName;
    }

    $encodedParts = array_map(static function (string $part): string {
        return rawurlencode($part);
    }, $parts);

    return 'documents/' . implode('/', $encodedParts);
}

function load_organizations(): array
{
    $names = [];

    if (is_dir(DOCUMENTS_ROOT)) {
        $dir = opendir(DOCUMENTS_ROOT);
        if ($dir) {
            while (($entry = readdir($dir)) !== false) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }

                $entry = trim((string) $entry);
                if ($entry === '') {
                    continue;
                }

                $names[$entry] = true;
            }
            closedir($dir);
        }
    }

    $list = array_keys($names);
    sort($list, SORT_NATURAL | SORT_FLAG_CASE);

    return $list;
}

function docs_extract_identity_filter(string $identity): ?array
{
    $identity = trim($identity);
    if ($identity === '') {
        return null;
    }

    $source = [];

    if (preg_match('/telegram:(\d+)/i', $identity, $matches)) {
        $source['telegram_user_id'] = $matches[1];
    }

    if (preg_match('/@([A-Za-z0-9_]+)/', $identity, $matches)) {
        $source['telegram_username'] = $matches[1];
    }

    if (empty($source)) {
        return null;
    }

    return extract_assignee_filter_from_array($source);
}

function docs_collect_request_sources(): array
{
    $sources = [];

    $telegramContext = docs_resolve_telegram_init_data_context();
    if (isset($telegramContext['source']) && is_array($telegramContext['source']) && !empty($telegramContext['source'])) {
        $sources[] = $telegramContext['source'];
    }

    if (!empty($_GET) && is_array($_GET)) {
        $sources[] = $_GET;
    }

    if (!empty($_POST) && is_array($_POST)) {
        $sources[] = $_POST;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $jsonPayload = load_json_payload();
        if (!empty($jsonPayload) && is_array($jsonPayload)) {
            $sources[] = $jsonPayload;
        }
    }

    return $sources;
}

function docs_first_non_empty_string(array $sources, array $keys): string
{
    foreach ($keys as $key) {
        foreach ($sources as $source) {
            if (!is_array($source) || !array_key_exists($key, $source)) {
                continue;
            }

            $value = $source[$key];
            if (!is_string($value) && !is_numeric($value)) {
                continue;
            }

            $stringValue = trim((string) $value);
            if ($stringValue === '') {
                continue;
            }

            return $stringValue;
        }
    }

    return '';
}

function docs_build_request_user_context(): array
{
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $telegramInitData = docs_resolve_telegram_init_data_context();

    $sources = docs_collect_request_sources();

    $identity = docs_first_non_empty_string($sources, ['identity', 'user_identity']);

    $rawData = [
        'telegram_user_id' => docs_first_non_empty_string($sources, ['telegram_user_id', 'telegramId', 'user_id', 'userid', 'id']),
        'telegram_chat_id' => docs_first_non_empty_string($sources, ['telegram_chat_id', 'chat_id', 'chatId']),
        'telegram_username' => docs_first_non_empty_string($sources, ['telegram_username', 'username', 'user_name']),
        'telegram_full_name' => docs_first_non_empty_string($sources, ['telegram_full_name', 'full_name', 'name']),
    ];

    $filter = null;
    $filterSource = 'none';
    $identityUsed = false;

    $normalizedTelegramId = normalize_identifier_value($rawData['telegram_user_id']);

    if ($normalizedTelegramId !== '') {
        $filter = [
            'ids' => [$normalizedTelegramId],
            'username' => '',
            'nameTokens' => [],
            'fullName' => '',
        ];
        $filterSource = 'telegram_user_id';
    } else {
        $filterFromTelegram = extract_assignee_filter_from_array($rawData);
        if ($filterFromTelegram !== null) {
            $filter = $filterFromTelegram;
            $filterSource = 'telegram_payload';
        }
    }

    if ($filter === null && $identity !== '') {
        $filter = docs_extract_identity_filter($identity);
        if ($filter !== null) {
            $filterSource = 'identity';
            $identityUsed = true;
        }
    }

    $primaryId = $normalizedTelegramId;
    if ($primaryId === '' && is_array($filter) && !empty($filter['ids'])) {
        $primaryId = (string) $filter['ids'][0];
    }

    $username = normalize_username_value($rawData['telegram_username']);
    $fullName = sanitize_text_field($rawData['telegram_full_name'], 200);

    $firstName = '';
    $lastName = '';

    if ($fullName !== '') {
        $parts = preg_split('/\s+/u', $fullName, -1, PREG_SPLIT_NO_EMPTY);
        if (is_array($parts) && !empty($parts)) {
            $firstName = (string) array_shift($parts);
            $lastName = trim(implode(' ', $parts));
        }
    }

    $user = null;
    if ($primaryId !== '' || $username !== '' || $firstName !== '' || $lastName !== '') {
        $user = [
            'id' => $primaryId,
            'username' => $username,
            'firstName' => $firstName,
            'lastName' => $lastName,
            'fullName' => $fullName,
        ];
    }

    $sessionAuth = docs_get_session_auth();
    if (is_array($sessionAuth)) {
        $sessionRole = $sessionAuth['role'] ?? 'guest';
        if ($sessionRole === 'admin') {
            $filter = null;
            $filterSource = 'session_admin';
            if ($primaryId === '') {
                $primaryId = normalize_identifier_value($sessionAuth['login'] ?? '');
            }
        } elseif ($sessionRole === 'user') {
            $sessionFilter = docs_build_session_user_filter_from_auth($sessionAuth);
            if ($sessionFilter !== null) {
                $filter = $sessionFilter;
                $filterSource = 'session_user';
                if ($primaryId === '') {
                    $primaryId = normalize_identifier_value($sessionAuth['telegramId'] ?? '');
                }
            }
        }
    }

    $cached = [
        'filter' => $filter,
        'user' => $user,
        'raw' => $rawData,
        'identity' => $identity,
        'filterSource' => $filterSource,
        'primaryId' => $primaryId,
        'telegramInitData' => $telegramInitData,
    ];

    $logContext = [
        'identityProvided' => $identity !== '',
        'identityUsed' => $identityUsed,
        'filterSource' => $filterSource,
        'filter' => summarize_assignee_filter_for_log($filter),
        'sourcesCount' => count($sources),
    ];

    $miniAppUserIdRaw = (string) ($rawData['telegram_user_id'] ?? '');
    if ($miniAppUserIdRaw === '') {
        $miniAppUserIdRaw = null;
    }

    $logContext['miniAppUserIdRaw'] = $miniAppUserIdRaw;

    if ($normalizedTelegramId !== '') {
        $logContext['miniAppUserIdNormalized'] = $normalizedTelegramId;
    }

    if ($primaryId !== '') {
        $logContext['primaryId'] = $primaryId;
    }

    if (!empty($sources)) {
        $sourceKeysSummary = [];
        foreach (array_slice($sources, 0, 5, true) as $index => $source) {
            if (!is_array($source) || empty($source)) {
                continue;
            }

            $keys = array_keys($source);
            if (empty($keys)) {
                continue;
            }

            $sourceKeysSummary[] = [
                'index' => $index,
                'keys' => array_slice(array_map('strval', $keys), 0, 15),
            ];
        }

        if (!empty($sourceKeysSummary)) {
            $logContext['sourceKeys'] = $sourceKeysSummary;
        }
    }

    $nonEmptyRaw = [];
    foreach ($rawData as $key => $value) {
        if ($value === null) {
            continue;
        }

        $string = trim((string) $value);
        if ($string === '') {
            continue;
        }

        $nonEmptyRaw[$key] = $string;
    }

    if (!empty($nonEmptyRaw)) {
        $logContext['rawData'] = $nonEmptyRaw;
    }

    if ($normalizedTelegramId !== '' && (!isset($nonEmptyRaw['telegram_user_id']) || $nonEmptyRaw['telegram_user_id'] !== $normalizedTelegramId)) {
        $logContext['normalizedTelegramUserId'] = $normalizedTelegramId;
    }

    if (is_array($user)) {
        $logContext['resolvedUser'] = array_filter([
            'id' => (string) ($user['id'] ?? ''),
            'username' => (string) ($user['username'] ?? ''),
            'firstName' => (string) ($user['firstName'] ?? ''),
            'lastName' => (string) ($user['lastName'] ?? ''),
            'fullName' => (string) ($user['fullName'] ?? ''),
        ], static function ($value) {
            return $value !== '';
        });
    }

    log_docs_event('Request user context resolved', $logContext);

    return $cached;
}

function docs_log_missing_telegram_user_id(string $action, array $requestContext, array $extra = []): void
{
    $rawId = '';
    if (isset($requestContext['raw']) && is_array($requestContext['raw'])) {
        $rawId = trim((string) ($requestContext['raw']['telegram_user_id'] ?? ''));
    }

    $primaryId = trim((string) ($requestContext['primaryId'] ?? ''));

    if ($primaryId !== '' || $rawId !== '') {
        return;
    }

    $queryKeys = [];
    if (!empty($_GET) && is_array($_GET)) {
        $queryKeys = array_values(array_unique(array_map('strval', array_keys($_GET))));
    }

    $logContext = array_merge([
        'action' => $action,
        'queryKeys' => $queryKeys,
        'hasTelegramInitDataHeader' => isset($_SERVER['HTTP_X_TELEGRAM_INIT_DATA']),
        'hasTelegramUserHeader' => isset($_SERVER['HTTP_X_TELEGRAM_USER_ID']),
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'referer' => $_SERVER['HTTP_REFERER'] ?? null,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        'filterSource' => $requestContext['filterSource'] ?? null,
    ], $extra);

    if (!empty($_SERVER['HTTP_X_TELEGRAM_USER_ID'])) {
        $logContext['telegramUserIdHeader'] = sanitize_text_field($_SERVER['HTTP_X_TELEGRAM_USER_ID'], 80);
    }

    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH'])) {
        $logContext['requestedWith'] = sanitize_text_field($_SERVER['HTTP_X_REQUESTED_WITH'], 80);
    }

    $logContext = array_filter($logContext, static function ($value) {
        return $value !== null && $value !== '' && $value !== [];
    });

    log_docs_event('Missing telegram_user_id', $logContext);
}

function docs_get_request_user_filter(): ?array
{
    $context = docs_build_request_user_context();

    return $context['filter'] ?? null;
}

function docs_get_request_user_info(): ?array
{
    $context = docs_build_request_user_context();
    $user = $context['user'] ?? null;

    if (!is_array($user)) {
        return null;
    }

    return [
        'id' => (string) ($user['id'] ?? ''),
        'username' => (string) ($user['username'] ?? ''),
        'firstName' => (string) ($user['firstName'] ?? ''),
        'lastName' => (string) ($user['lastName'] ?? ''),
    ];
}

function docs_build_session_user_filter(): ?array
{
    $filter = docs_get_request_user_filter();

    return is_array($filter) ? $filter : null;
}

function docs_clear_session_auth(): void
{
    if (isset($_SESSION[DOCS_SESSION_KEY])) {
        unset($_SESSION[DOCS_SESSION_KEY]);
    }
}

function docs_set_session_auth(array $auth): void
{
    $role = strtolower((string) ($auth['role'] ?? ''));
    if ($role !== 'admin' && $role !== 'user') {
        $role = 'user';
    }

    $normalizedOrganization = docs_normalize_organization_candidate((string) ($auth['organization'] ?? ''));
    $login = sanitize_text_field((string) ($auth['login'] ?? ''), 120);
    $fullName = sanitize_text_field((string) ($auth['fullName'] ?? ''), 200);
    $telegramId = sanitize_text_field((string) ($auth['telegramId'] ?? ''), 120);
    $chatId = sanitize_text_field((string) ($auth['chatId'] ?? ''), 80);
    $responsibleNumber = sanitize_text_field((string) ($auth['responsibleNumber'] ?? ''), 60);
    $responsibleRole = sanitize_text_field((string) ($auth['responsibleRole'] ?? ''), 60);
    $adminScope = '';
    if ($role === 'admin') {
        $adminScope = sanitize_text_field((string) ($auth['adminScope'] ?? ''), 60);
    }

    $_SESSION[DOCS_SESSION_KEY] = [
        'role' => $role,
        'organization' => $normalizedOrganization,
        'login' => $login,
        'fullName' => $fullName,
        'telegramId' => $telegramId,
    ];

    if ($adminScope !== '') {
        $_SESSION[DOCS_SESSION_KEY]['adminScope'] = $adminScope;
    }

    if ($chatId !== '') {
        $_SESSION[DOCS_SESSION_KEY]['chatId'] = $chatId;
    }

    if ($responsibleNumber !== '') {
        $_SESSION[DOCS_SESSION_KEY]['responsibleNumber'] = $responsibleNumber;
    }

    if ($responsibleRole !== '') {
        $_SESSION[DOCS_SESSION_KEY]['responsibleRole'] = $responsibleRole;
    }
}

function docs_get_session_auth(): ?array
{
    if (!isset($_SESSION[DOCS_SESSION_KEY]) || !is_array($_SESSION[DOCS_SESSION_KEY])) {
        return null;
    }

    $raw = $_SESSION[DOCS_SESSION_KEY];
    $roleRaw = isset($raw['role']) && is_string($raw['role']) ? strtolower($raw['role']) : '';
    if ($roleRaw !== 'admin' && $roleRaw !== 'user') {
        return null;
    }

    $organization = docs_normalize_organization_candidate((string) ($raw['organization'] ?? ''));
    $login = sanitize_text_field((string) ($raw['login'] ?? ''), 120);
    $fullName = sanitize_text_field((string) ($raw['fullName'] ?? ''), 200);
    $telegramId = sanitize_text_field((string) ($raw['telegramId'] ?? ''), 120);
    $chatId = sanitize_text_field((string) ($raw['chatId'] ?? ''), 80);
    $responsibleNumber = sanitize_text_field((string) ($raw['responsibleNumber'] ?? ''), 60);
    $responsibleRole = sanitize_text_field((string) ($raw['responsibleRole'] ?? ''), 60);
    $adminScope = sanitize_text_field((string) ($raw['adminScope'] ?? ''), 60);

    $session = [
        'role' => $roleRaw,
        'organization' => $organization,
        'login' => $login,
        'fullName' => $fullName,
        'telegramId' => $telegramId,
    ];

    if ($adminScope !== '') {
        $session['adminScope'] = $adminScope;
    }

    if ($chatId !== '') {
        $session['chatId'] = $chatId;
    }

    if ($responsibleNumber !== '') {
        $session['responsibleNumber'] = $responsibleNumber;
    }

    if ($responsibleRole !== '') {
        $session['responsibleRole'] = $responsibleRole;
    }

    return $session;
}

function docs_require_admin_session(?array $accessContext = null): array
{
    $session = docs_get_session_auth();
    $role = is_array($session) ? ($session['role'] ?? '') : '';

    if ($role !== 'admin') {
        $errorContext = ['requiresAdmin' => true];

        if (is_array($accessContext)) {
            if (isset($accessContext['active']) && is_string($accessContext['active']) && $accessContext['active'] !== '') {
                $errorContext['organization'] = $accessContext['active'];
            }
            if (isset($accessContext['accessible']) && is_array($accessContext['accessible'])) {
                $errorContext['accessibleOrganizations'] = $accessContext['accessible'];
            }
        }

        respond_error('Доступ запрещён. Требуются права администратора.', 403, $errorContext);
    }

    return $session;
}

function docs_normalize_login(string $login): string
{
    $sanitized = sanitize_text_field($login, 120);
    if ($sanitized === '') {
        return '';
    }

    return mb_strtolower($sanitized, 'UTF-8');
}

function docs_load_mainadmin_secret(): ?string
{
    static $cached = false;
    static $secret = null;

    if ($cached !== false) {
        return $secret;
    }

    $cached = true;

    if (!is_file(DOCS_MAINADMIN_SECRET_FILE)) {
        return null;
    }

    $raw = @file_get_contents(DOCS_MAINADMIN_SECRET_FILE);
    if ($raw === false) {
        return null;
    }

    $decoded = base64_decode(trim((string) $raw), true);
    if ($decoded === false || strlen($decoded) !== 32) {
        return null;
    }

    $secret = $decoded;

    return $secret;
}

function docs_decrypt_mainadmin_password(string $payload, string $secret): ?string
{
    if ($payload === '') {
        return '';
    }

    $raw = base64_decode($payload, true);
    if ($raw === false || strlen($raw) <= 16) {
        return null;
    }

    $iv = substr($raw, 0, 16);
    $ciphertext = substr($raw, 16);
    $plain = openssl_decrypt($ciphertext, 'AES-256-CBC', $secret, OPENSSL_RAW_DATA, $iv);

    return $plain === false ? null : $plain;
}

function docs_load_mainadmin_credentials(string $organization): ?array
{
    $normalized = docs_normalize_organization_candidate($organization);
    if ($normalized === '') {
        return null;
    }

    $file = DOCS_MAINADMIN_STORAGE_DIR . '/' . $normalized . DOCS_MAINADMIN_FILE_SUFFIX;
    if (!is_file($file)) {
        return null;
    }

    $contents = @file_get_contents($file);
    if ($contents === false) {
        return null;
    }

    $data = json_decode($contents, true);
    if (!is_array($data)) {
        return null;
    }

    $secret = docs_load_mainadmin_secret();

    $login = sanitize_text_field((string) ($data['login'] ?? ''), 120);
    $passwordHash = '';
    if (isset($data['passwordHash']) && is_string($data['passwordHash'])) {
        $passwordHash = sanitize_text_field($data['passwordHash'], 255);
    } elseif (isset($data['password_hash']) && is_string($data['password_hash'])) {
        $passwordHash = sanitize_text_field($data['password_hash'], 255);
    }

    $password = (string) ($data['password'] ?? '');
    if ($password !== '' && $secret !== null) {
        $decrypted = docs_decrypt_mainadmin_password($password, $secret);
        if ($decrypted !== null) {
            $password = $decrypted;
        }
    }

    if ($passwordHash === '' && docs_is_password_hash($password)) {
        $passwordHash = sanitize_text_field($password, 255);
    }

    $additionalLogins = [];
    $blocks = ['blockOneUsers', 'blockTwoUsers', 'blockThreeUsers', 'blockFourUsers'];

    foreach ($blocks as $blockName) {
        if (!isset($data[$blockName]) || !is_array($data[$blockName])) {
            continue;
        }

        foreach ($data[$blockName] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $entryLogin = sanitize_text_field((string) ($entry['login'] ?? ''), 120);
            if ($entryLogin === '') {
                continue;
            }

            $entryPassword = (string) ($entry['password'] ?? '');
            if ($entryPassword !== '' && $secret !== null) {
                $decrypted = docs_decrypt_mainadmin_password($entryPassword, $secret);
                if ($decrypted !== null) {
                    $entryPassword = $decrypted;
                }
            }

            $entryPasswordHash = '';
            if ($entryPassword !== '' && docs_is_password_hash($entryPassword)) {
                $entryPasswordHash = sanitize_text_field($entryPassword, 255);
            }

            $additionalLogins[] = [
                'login' => $entryLogin,
                'password' => $entryPassword,
                'passwordHash' => $entryPasswordHash,
                'fullName' => sanitize_text_field((string) ($entry['fullName'] ?? ''), 200),
                'position' => sanitize_text_field((string) ($entry['position'] ?? ''), 200),
                'telegramId' => sanitize_text_field((string) ($entry['telegramId'] ?? ''), 120),
                'email' => sanitize_text_field((string) ($entry['email'] ?? ''), 200),
            ];
        }
    }

    return [
        'organization' => $normalized,
        'login' => $login,
        'password' => $password,
        'passwordHash' => $passwordHash,
        'fullName' => sanitize_text_field((string) ($data['fullName'] ?? ''), 200),
        'position' => sanitize_text_field((string) ($data['position'] ?? ''), 200),
        'telegramId' => sanitize_text_field((string) ($data['telegramId'] ?? ''), 120),
        'email' => sanitize_text_field((string) ($data['email'] ?? ''), 200),
        'additionalLogins' => $additionalLogins,
    ];
}

function docs_load_admin_users(): array
{
    static $cached = false;
    static $users = [];

    if ($cached) {
        return $users;
    }

    $cached = true;

    if (!is_file(DOCS_ADMIN_USERS_FILE)) {
        $users = [];
        return $users;
    }

    $contents = @file_get_contents(DOCS_ADMIN_USERS_FILE);
    if ($contents === false) {
        $users = [];
        return $users;
    }

    $decoded = json_decode($contents, true);
    if (!is_array($decoded)) {
        $users = [];
        return $users;
    }

    $users = $decoded;

    return $users;
}

function docs_password_matches_hash(string $password, string $hash, ?array &$details = null): bool
{
    if ($hash === '') {
        if ($details !== null) {
            $details = ['matchedVariant' => null, 'attempts' => []];
        }

        return false;
    }

    $variants = docs_generate_password_variants($password);
    $attempts = [];

    foreach ($variants as $variant) {
        $candidate = $variant['value'];
        $attemptDetail = [
            'variant' => $variant['label'],
        ];

        $matched = false;
        $method = null;
        $error = null;

        try {
            if (function_exists('password_verify') && password_verify($candidate, $hash)) {
                $matched = true;
                $method = 'password_verify';
            }
        } catch (Throwable $exception) {
            $error = $exception->getMessage();
        }

        if (!$matched) {
            $cryptHash = @crypt($candidate, $hash);
            if (is_string($cryptHash) && $cryptHash !== '') {
                if (function_exists('hash_equals')) {
                    $matched = hash_equals($cryptHash, $hash);
                    $method = 'crypt_hash_equals';
                } else {
                    $matched = $cryptHash === $hash;
                    $method = 'crypt';
                }
            } elseif ($method === null) {
                $method = 'crypt_unavailable';
            }
        }

        $attemptDetail['matched'] = $matched;
        if ($method !== null) {
            $attemptDetail['method'] = $method;
        }
        if ($error !== null && $error !== '') {
            $attemptDetail['error'] = $error;
        }

        $attempts[] = $attemptDetail;

        if ($matched) {
            if ($details !== null) {
                $details = [
                    'matchedVariant' => $variant['label'],
                    'attempts' => $attempts,
                ];
            }

            return true;
        }
    }

    if ($details !== null) {
        $details = [
            'matchedVariant' => null,
            'attempts' => $attempts,
        ];
    }

    return false;
}

function docs_generate_password_variants(string $password): array
{
    $variants = [];

    $variants[] = [
        'label' => 'original',
        'value' => $password,
    ];

    $stripped = docs_strip_invisible_password_chars($password);
    if ($stripped !== $password) {
        $variants[] = [
            'label' => 'stripped_invisible',
            'value' => $stripped,
        ];
    }

    $trimmed = docs_trim_password_edges($password);
    if ($trimmed !== $password) {
        $variants[] = [
            'label' => 'trimmed',
            'value' => $trimmed,
        ];
    }

    $normalizedSpaces = docs_normalize_password_spaces($password);
    if ($normalizedSpaces !== $password) {
        $variants[] = [
            'label' => 'normalized_spaces',
            'value' => $normalizedSpaces,
        ];
    }

    $normalizedTrimmed = docs_trim_password_edges($normalizedSpaces);
    if ($normalizedTrimmed !== $password && $normalizedTrimmed !== $trimmed) {
        $variants[] = [
            'label' => 'normalized_trimmed',
            'value' => $normalizedTrimmed,
        ];
    }

    $unique = [];
    foreach ($variants as $variant) {
        $hash = md5($variant['value']);
        if (!isset($unique[$hash])) {
            $unique[$hash] = $variant;
        }
    }

    return array_values($unique);
}

function docs_strip_invisible_password_chars(string $value): string
{
    $result = preg_replace('/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}]/u', '', $value);

    return is_string($result) ? $result : $value;
}

function docs_trim_password_edges(string $value): string
{
    $characterClass = '[\s\x{00A0}\x{1680}\x{180E}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}]+';

    $result = preg_replace('/^' . $characterClass . '/u', '', $value);
    if (!is_string($result)) {
        $result = $value;
    }

    $result = preg_replace('/' . $characterClass . '$/u', '', $result);

    return is_string($result) ? $result : $value;
}

function docs_normalize_password_spaces(string $value): string
{
    $result = preg_replace('/[\x{00A0}\x{1680}\x{180E}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}]/u', ' ', $value);

    return is_string($result) ? $result : $value;
}

function docs_sanitize_password_diagnostics(?array $diagnostics): array
{
    if (!is_array($diagnostics)) {
        return [];
    }

    $attempts = [];
    if (isset($diagnostics['attempts']) && is_array($diagnostics['attempts'])) {
        foreach ($diagnostics['attempts'] as $attempt) {
            if (!is_array($attempt)) {
                continue;
            }

            $entry = [];
            if (isset($attempt['variant']) && is_string($attempt['variant']) && $attempt['variant'] !== '') {
                $entry['variant'] = sanitize_text_field($attempt['variant'], 60);
            }
            if (isset($attempt['method']) && is_string($attempt['method']) && $attempt['method'] !== '') {
                $entry['method'] = sanitize_text_field($attempt['method'], 60);
            }
            if (array_key_exists('matched', $attempt)) {
                $entry['matched'] = (bool) $attempt['matched'];
            }
            if (isset($attempt['error']) && is_string($attempt['error']) && $attempt['error'] !== '') {
                $entry['error'] = sanitize_text_field($attempt['error'], 160);
            }

            if (!empty($entry)) {
                $attempts[] = $entry;
            }
        }
    }

    $result = ['attempts' => $attempts];

    if (isset($diagnostics['matchedVariant']) && is_string($diagnostics['matchedVariant']) && $diagnostics['matchedVariant'] !== '') {
        $result['matchedVariant'] = sanitize_text_field($diagnostics['matchedVariant'], 60);
    }

    return $result;
}

function docs_is_password_hash(string $value): bool
{
    if ($value === '') {
        return false;
    }

    if (preg_match('/^\$2[abxy]\$\d{2}\$/', $value) === 1) {
        return true;
    }

    if (preg_match('/^\$argon2(id|i|d)\$/i', $value) === 1) {
        return true;
    }

    if (preg_match('/^\$pbkdf2-/i', $value) === 1) {
        return true;
    }

    return false;
}

function docs_get_admin_data_file_path(string $organization): ?string
{
    $sanitizedName = docs_sanitize_admin_object_name($organization);
    if ($sanitizedName === '') {
        return null;
    }

    $file = DOCS_MAINADMIN_STORAGE_DIR . '/' . $sanitizedName . DOCS_ORGANIZATION_ADMIN_FILE_SUFFIX;

    return is_file($file) ? $file : null;
}

function docs_load_organization_admin_accounts(string $organization): array
{
    static $cache = [];

    if (array_key_exists($organization, $cache)) {
        return $cache[$organization];
    }

    $cache[$organization] = [];

    $file = docs_get_admin_data_file_path($organization);
    if ($file === null) {
        return $cache[$organization];
    }

    $contents = @file_get_contents($file);
    if ($contents === false || trim($contents) === '') {
        return $cache[$organization];
    }

    $decoded = json_decode($contents, true);
    if (!is_array($decoded)) {
        return $cache[$organization];
    }

    $sections = ['create', 'materials', 'report', 'protocol', 'upload'];
    $accounts = [];

    foreach ($sections as $section) {
        if (empty($decoded[$section]) || !is_array($decoded[$section])) {
            continue;
        }

        foreach ($decoded[$section] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $normalizedLogin = isset($entry['login']) ? docs_normalize_login((string) $entry['login']) : '';
            if ($normalizedLogin === '') {
                continue;
            }

            $hash = '';
            if (isset($entry['password_hash']) && is_string($entry['password_hash'])) {
                $hash = trim($entry['password_hash']);
            } elseif (isset($entry['password']) && is_string($entry['password'])) {
                $hash = trim($entry['password']);
            }

            if ($hash === '') {
                continue;
            }

            $accounts[] = [
                'login' => sanitize_text_field((string) ($entry['login'] ?? ''), 120),
                'normalizedLogin' => $normalizedLogin,
                'passwordHash' => $hash,
                'fullName' => sanitize_text_field((string) ($entry['name'] ?? ''), 200),
                'section' => $section,
            ];
        }
    }

    $cache[$organization] = $accounts;

    return $cache[$organization];
}

function docs_authenticate_organization_admin_user(string $organization, string $login, string $password): ?array
{
    $normalizedLogin = docs_normalize_login($login);
    if ($normalizedLogin === '') {
        return null;
    }

    foreach (docs_load_organization_admin_accounts($organization) as $account) {
        if (!is_array($account)) {
            continue;
        }

        if (($account['normalizedLogin'] ?? '') !== $normalizedLogin) {
            continue;
        }

        $hash = (string) ($account['passwordHash'] ?? '');
        if ($hash === '' || !docs_password_matches_hash($password, $hash)) {
            continue;
        }

        return [
            'login' => $account['login'] ?? $login,
            'fullName' => $account['fullName'] ?? '',
            'section' => $account['section'] ?? '',
        ];
    }

    return null;
}

function docs_authenticate_admin_user(string $login, string $password): ?array
{
    $normalizedLogin = docs_normalize_login($login);
    if ($normalizedLogin === '') {
        return null;
    }

    foreach (docs_load_admin_users() as $user) {
        if (!is_array($user)) {
            continue;
        }

        $candidateLogin = isset($user['login']) ? docs_normalize_login((string) $user['login']) : '';
        if ($candidateLogin === '' || $candidateLogin !== $normalizedLogin) {
            continue;
        }

        $hash = '';
        if (isset($user['password']) && is_string($user['password'])) {
            $hash = trim($user['password']);
        } elseif (isset($user['password_hash']) && is_string($user['password_hash'])) {
            $hash = trim($user['password_hash']);
        }

        if ($hash === '') {
            continue;
        }

        if (docs_password_matches_hash($password, $hash)) {
            return [
                'login' => (string) ($user['login'] ?? $login),
                'name' => sanitize_text_field((string) ($user['name'] ?? ''), 200),
            ];
        }
    }

    return null;
}

function docs_authenticate_director_user(string $organization, string $login, string $password): ?array
{
    $normalizedLogin = docs_normalize_login($login);
    if ($normalizedLogin === '') {
        return null;
    }

    $folder = sanitize_folder_name($organization);
    $settings = load_admin_settings($folder);
    $directors = isset($settings['block2']) && is_array($settings['block2'])
        ? $settings['block2']
        : [];

    if (empty($directors)) {
        return null;
    }

    foreach ($directors as $entryIndex => $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $entryLogin = isset($entry['login']) ? docs_normalize_login((string) $entry['login']) : '';
        if ($entryLogin === '' || $entryLogin !== $normalizedLogin) {
            continue;
        }

        $storedHash = '';
        $storedPassword = '';
        if (isset($entry['passwordHash']) && is_string($entry['passwordHash'])) {
            $storedHash = trim($entry['passwordHash']);
        }
        if (isset($entry['password']) && is_string($entry['password'])) {
            $storedPassword = trim($entry['password']);
        }

        if ($storedHash === '' && $storedPassword === '') {
            return null;
        }

        $passwordMatches = false;
        $passwordDetails = null;
        if ($storedHash !== '') {
            $passwordMatches = docs_password_matches_hash($password, $storedHash, $passwordDetails);
        } elseif ($storedPassword !== '') {
            if (docs_is_password_hash($storedPassword)) {
                $passwordMatches = docs_password_matches_hash($password, $storedPassword, $passwordDetails);
            } elseif (function_exists('hash_equals')) {
                $passwordMatches = hash_equals($storedPassword, $password);
            } else {
                $passwordMatches = $storedPassword === $password;
            }
        }

        if (!$passwordMatches) {
            $passwordSource = $storedHash !== '' ? 'hash' : 'plain';
            if ($passwordSource === 'plain' && $storedPassword !== '' && docs_is_password_hash($storedPassword)) {
                $passwordSource = 'hash';
            }
            $storedPasswordValue = $storedHash !== '' ? $storedHash : $storedPassword;
            docs_log_auth_attempt('login_stage_failed', [
                'stage' => 'director',
                'loginNormalized' => $normalizedLogin,
                'entryIndex' => $entryIndex,
                'passwordSource' => $passwordSource,
                'storedPasswordLength' => $storedPasswordValue !== '' ? strlen($storedPasswordValue) : 0,
                'inputPasswordLength' => strlen($password),
                'hasStoredHash' => $storedHash !== '',
                'hasStoredPassword' => $storedPassword !== '',
            ]);
            return null;
        }

        return [
            'login' => sanitize_text_field((string) ($entry['login'] ?? $login), 120),
            'fullName' => sanitize_text_field((string) ($entry['responsible'] ?? ''), 200),
            'telegramId' => sanitize_text_field((string) ($entry['telegram'] ?? ''), 120),
            'chatId' => sanitize_text_field((string) ($entry['chatId'] ?? ''), 80),
            'passwordHash' => sanitize_text_field($storedHash !== '' ? $storedHash : $storedPassword, 255),
            'adminScope' => 'director',
        ];
    }

    return null;
}

function docs_authenticate_responsible_user_with_diagnostics(string $organization, string $login, string $password): array
{
    $normalizedLogin = docs_normalize_login($login);
    if ($normalizedLogin === '') {
        docs_debug_log('responsible_auth_login_empty', [
            'organization' => $organization,
            'login' => $login,
        ]);
        return [
            'credentials' => null,
            'reason' => 'login_empty',
        ];
    }

    $folder = sanitize_folder_name($organization);
    $settings = load_admin_settings($folder);

    docs_debug_log('responsible_auth_attempt', [
        'organization' => $organization,
        'login' => $normalizedLogin,
        'settingsLoaded' => is_array($settings),
    ]);

    $candidateSources = [
        [
            'key' => 'responsibles',
            'role' => 'responsible',
        ],
        [
            'key' => 'block3',
            'role' => 'subordinate',
        ],
    ];

    $hasEntries = false;
    $diagnostics = [
        'credentials' => null,
        'reason' => 'login_not_found',
    ];

    $firstMatchedDiagnostics = null;

    foreach ($candidateSources as $source) {
        $entries = isset($settings[$source['key']]) && is_array($settings[$source['key']])
            ? $settings[$source['key']]
            : [];

        if (empty($entries)) {
            continue;
        }

        $hasEntries = true;

        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $entryLogin = isset($entry['login']) ? docs_normalize_login((string) $entry['login']) : '';
            if ($entryLogin === '' || $entryLogin !== $normalizedLogin) {
                continue;
            }

            $entryDiagnostics = [
                'credentials' => null,
                'matchedLogin' => sanitize_text_field((string) ($entry['login'] ?? ''), 120),
                'entryNumber' => sanitize_text_field((string) ($entry['number'] ?? ''), 60),
                'source' => $source['key'],
            ];

            docs_debug_log('responsible_auth_login_matched', [
                'organization' => $organization,
                'login' => $normalizedLogin,
                'matchedLogin' => $entryDiagnostics['matchedLogin'],
                'entryNumber' => $entryDiagnostics['entryNumber'],
                'source' => $source['key'],
            ]);

            $hash = '';
            if (isset($entry['passwordHash']) && is_string($entry['passwordHash'])) {
                $hash = trim($entry['passwordHash']);
            } elseif (isset($entry['password']) && is_string($entry['password'])) {
                $hash = trim($entry['password']);
            }

            if ($hash === '') {
                $entryDiagnostics['reason'] = 'password_missing';

                if ($firstMatchedDiagnostics === null) {
                    $firstMatchedDiagnostics = $entryDiagnostics;
                }

                docs_debug_log('responsible_auth_password_missing', [
                    'organization' => $organization,
                    'login' => $normalizedLogin,
                    'entryNumber' => $entryDiagnostics['entryNumber'],
                    'source' => $source['key'],
                ]);

                continue;
            }

            $passwordDetails = null;
            if (!docs_password_matches_hash($password, $hash, $passwordDetails)) {
                $entryDiagnostics['reason'] = 'password_mismatch';
                if (is_array($passwordDetails)) {
                    $entryDiagnostics['passwordDetails'] = docs_sanitize_password_diagnostics($passwordDetails);
                }

                if ($firstMatchedDiagnostics === null) {
                    $firstMatchedDiagnostics = $entryDiagnostics;
                }

                $passwordLog = [
                    'organization' => $organization,
                    'login' => $normalizedLogin,
                    'entryNumber' => $entryDiagnostics['entryNumber'],
                    'source' => $source['key'],
                ];
                if (isset($entryDiagnostics['passwordDetails'])) {
                    $passwordLog['passwordDetails'] = $entryDiagnostics['passwordDetails'];
                }

                docs_debug_log('responsible_auth_password_mismatch', $passwordLog);

                continue;
            }

            $role = sanitize_text_field((string) ($entry['role'] ?? ''), 60);
            if ($role === '') {
                $role = $source['role'];
            }

            $credentials = [
                'login' => sanitize_text_field((string) ($entry['login'] ?? $login), 120),
                'fullName' => sanitize_text_field((string) ($entry['responsible'] ?? ''), 200),
                'telegramId' => sanitize_text_field((string) ($entry['telegram'] ?? ''), 120),
                'chatId' => sanitize_text_field((string) ($entry['chatId'] ?? ''), 80),
                'responsibleNumber' => sanitize_text_field((string) ($entry['number'] ?? ''), 60),
                'passwordHash' => sanitize_text_field($hash, 255),
            ];

            if ($role !== '') {
                $credentials['responsibleRole'] = $role;
            }

            if (is_array($passwordDetails)) {
                $diagnostics['passwordDetails'] = docs_sanitize_password_diagnostics($passwordDetails);
            }

            docs_debug_log('responsible_auth_success', [
                'organization' => $organization,
                'login' => $credentials['login'],
                'responsibleNumber' => $credentials['responsibleNumber'],
                'role' => $credentials['responsibleRole'] ?? '',
                'source' => $source['key'],
            ]);

            return [
                'credentials' => $credentials,
                'reason' => null,
                'matchedLogin' => $entryDiagnostics['matchedLogin'] ?? null,
                'entryNumber' => $entryDiagnostics['entryNumber'] ?? null,
                'passwordDetails' => $entryDiagnostics['passwordDetails'] ?? null,
            ];
        }
    }

    if (!$hasEntries) {
        docs_debug_log('responsible_auth_no_entries', [
            'organization' => $organization,
            'login' => $normalizedLogin,
        ]);
        return [
            'credentials' => null,
            'reason' => 'settings_missing',
        ];
    }

    if ($firstMatchedDiagnostics !== null) {
        docs_debug_log('responsible_auth_failed', array_merge($firstMatchedDiagnostics, [
            'organization' => $organization,
            'login' => $normalizedLogin,
        ]));
        return $firstMatchedDiagnostics;
    }

    docs_debug_log('responsible_auth_not_found', [
        'organization' => $organization,
        'login' => $normalizedLogin,
    ]);

    return $diagnostics;
}

function docs_authenticate_responsible_user(string $organization, string $login, string $password): ?array
{
    $result = docs_authenticate_responsible_user_with_diagnostics($organization, $login, $password);

    return isset($result['credentials']) && is_array($result['credentials'])
        ? $result['credentials']
        : null;
}

function docs_authenticate_mainadmin_user(string $organization, string $login, string $password): ?array
{
    $credentials = docs_load_mainadmin_credentials($organization);
    if (!is_array($credentials)) {
        return null;
    }

    $candidateUsers = [];

    $primaryLogin = docs_normalize_login((string) ($credentials['login'] ?? ''));
    if ($primaryLogin !== '') {
        $candidateUsers[] = [
            'login' => $primaryLogin,
            'password' => (string) ($credentials['password'] ?? ''),
            'passwordHash' => (string) ($credentials['passwordHash'] ?? ''),
            'fullName' => $credentials['fullName'] ?? '',
            'telegramId' => $credentials['telegramId'] ?? '',
        ];
    }

    if (!empty($credentials['additionalLogins']) && is_array($credentials['additionalLogins'])) {
        foreach ($credentials['additionalLogins'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $normalizedLogin = docs_normalize_login((string) ($entry['login'] ?? ''));
            if ($normalizedLogin === '') {
                continue;
            }

            $candidateUsers[] = [
                'login' => $normalizedLogin,
                'password' => (string) ($entry['password'] ?? ''),
                'passwordHash' => (string) ($entry['passwordHash'] ?? ''),
                'fullName' => $entry['fullName'] ?? '',
                'telegramId' => $entry['telegramId'] ?? '',
            ];
        }
    }

    foreach ($candidateUsers as $user) {
        if ($user['login'] !== docs_normalize_login($login)) {
            continue;
        }

        $storedHash = $user['passwordHash'] ?? '';
        $storedPassword = $user['password'] ?? '';

        $passwordMatches = false;

        if ($storedHash !== '') {
            $passwordMatches = docs_password_matches_hash($password, $storedHash);
        } elseif ($storedPassword !== '') {
            if (docs_is_password_hash($storedPassword)) {
                $passwordMatches = docs_password_matches_hash($password, $storedPassword);
            } elseif (function_exists('hash_equals')) {
                $passwordMatches = hash_equals($storedPassword, $password);
            } else {
                $passwordMatches = $storedPassword === $password;
            }
        }

        if ($passwordMatches) {
            return array_merge($credentials, [
                'login' => $login,
                'password' => $storedPassword,
                'passwordHash' => $storedHash,
                'fullName' => $user['fullName'] ?? '',
                'telegramId' => $user['telegramId'] ?? '',
            ]);
        }
    }

    return null;
}

function docs_build_session_user_filter_from_auth(array $auth): ?array
{
    $ids = [];

    $userId = normalize_identifier_value($auth['id'] ?? null);
    if ($userId !== '') {
        $ids[] = $userId;
    }

    $telegram = normalize_identifier_value($auth['telegram'] ?? null);
    if ($telegram !== '') {
        $ids[] = $telegram;
    }

    $telegramId = normalize_identifier_value($auth['telegramId'] ?? null);
    if ($telegramId !== '') {
        $ids[] = $telegramId;
    }

    $chatId = normalize_identifier_value($auth['chatId'] ?? null);
    if ($chatId !== '') {
        $ids[] = $chatId;
    }

    $loginId = normalize_identifier_value($auth['login'] ?? null);
    if ($loginId !== '') {
        $ids[] = $loginId;
    }

    $username = normalize_username_value($auth['login'] ?? null);
    $fullNameRaw = sanitize_text_field($auth['fullName'] ?? '', 200);
    $fullName = $fullNameRaw !== '' ? mb_strtolower($fullNameRaw, 'UTF-8') : '';
    $nameTokens = $fullNameRaw !== '' ? split_name_tokens($fullNameRaw) : [];
    $responsibleNumber = normalize_identifier_value($auth['responsibleNumber'] ?? null);
    $compositeKey = '';
    if ($responsibleNumber !== '' && $fullNameRaw !== '') {
        $compositeKey = docs_build_responsible_composite_key($responsibleNumber, $fullNameRaw);
        if ($compositeKey !== '') {
            $ids[] = 'combo::' . $compositeKey;
        }
    }
    if ($responsibleNumber !== '' && $compositeKey === '') {
        $ids[] = $responsibleNumber;
    }

    if (empty($ids) && $username === '' && empty($nameTokens)) {
        return null;
    }

    $ids = array_values(array_unique(array_filter($ids, static function ($value) {
        return $value !== '';
    })));

    return [
        'ids' => $ids,
        'username' => $username,
        'fullName' => $fullName,
        'nameTokens' => $nameTokens,
    ];
}

function docs_describe_session(?array $auth, ?array $accessContext = null): array
{
    $role = 'guest';
    $authenticated = false;
    $forceAccess = false;
    $organization = null;
    $user = null;
    $filter = null;
    $adminScope = '';

    if (is_array($auth)) {
        $roleCandidate = isset($auth['role']) ? strtolower((string) $auth['role']) : '';
        if ($roleCandidate === 'admin' || $roleCandidate === 'user') {
            $role = $roleCandidate;
        }
        $organizationCandidate = docs_normalize_organization_candidate((string) ($auth['organization'] ?? ''));
        if ($organizationCandidate !== '') {
            $organization = $organizationCandidate;
        }
        $userData = array_filter([
            'login' => sanitize_text_field((string) ($auth['login'] ?? ''), 120),
            'fullName' => sanitize_text_field((string) ($auth['fullName'] ?? ''), 200),
            'telegramId' => sanitize_text_field((string) ($auth['telegramId'] ?? ''), 120),
            'chatId' => sanitize_text_field((string) ($auth['chatId'] ?? ''), 80),
            'responsibleNumber' => sanitize_text_field((string) ($auth['responsibleNumber'] ?? ''), 60),
            'role' => sanitize_text_field((string) ($auth['responsibleRole'] ?? ''), 60),
        ], static function ($value) {
            return $value !== '';
        });
        if (!empty($userData)) {
            $user = $userData;
        }

        if (isset($auth['adminScope'])) {
            $adminScope = sanitize_text_field((string) $auth['adminScope'], 60);
        }

        if ($role === 'admin') {
            $authenticated = true;
            $forceAccess = true;
        } elseif ($role === 'user') {
            $authenticated = true;
            $filter = docs_build_session_user_filter_from_auth($auth);
        }
    }

    $accessibleOrganizations = [];
    $activeOrganization = $organization;

    if (is_array($accessContext)) {
        if (isset($accessContext['accessible']) && is_array($accessContext['accessible'])) {
            $accessibleOrganizations = array_values(array_filter(array_map('strval', $accessContext['accessible'])));
        }
        if (isset($accessContext['active']) && is_string($accessContext['active'])) {
            $activeOrganization = $accessContext['active'];
        }
        if (isset($accessContext['forceAccess'])) {
            $forceAccess = (bool) $accessContext['forceAccess'];
        }
    }

    if ($activeOrganization !== null && $activeOrganization !== '') {
        if (!in_array($activeOrganization, $accessibleOrganizations, true)) {
            $accessibleOrganizations[] = $activeOrganization;
        }
    }

    if ($role === 'user') {
        if ($organization === null && $activeOrganization !== null) {
            $organization = $activeOrganization;
        }
        $authenticated = $authenticated && $filter !== null;
    }

    $summary = [
        'role' => $role,
        'authenticated' => $authenticated,
        'forceAccess' => $forceAccess,
        'accessGranted' => $authenticated && !empty($accessibleOrganizations),
        'organization' => $activeOrganization !== '' ? $activeOrganization : null,
        'organizations' => $accessibleOrganizations,
        'user' => $user,
        'filterSource' => $role === 'admin' ? 'session_admin' : ($role === 'user' ? 'session_user' : null),
    ];

    if ($filter !== null) {
        $summary['filter'] = $filter;
    }

    if ($role === 'admin') {
        $summary['adminScope'] = $adminScope;
    }

    return $summary;
}

function docs_get_active_session_summary(?string $requestedOrganization = null): ?array
{
    $auth = docs_get_session_auth();
    if (!is_array($auth)) {
        return null;
    }

    $role = $auth['role'] ?? 'guest';
    if ($role !== 'admin' && $role !== 'user') {
        return null;
    }

    $accessContext = docs_resolve_access_context($requestedOrganization, true);
    $summary = docs_describe_session($auth, $accessContext);
    $summary['mode'] = $role === 'admin' ? 'session_admin' : 'session_user';
    $summary['requiresTelegramId'] = false;
    $summary['accessGranted'] = isset($accessContext['active']) && $accessContext['active'] !== null;
    if (isset($accessContext['filterSource'])) {
        $summary['filterSource'] = $accessContext['filterSource'];
    }

    if ($role === 'admin' && $requestedOrganization !== null && $requestedOrganization !== '') {
        if (empty($summary['organization'])) {
            $summary['organization'] = $requestedOrganization;
        }
        if (empty($summary['organizations']) || !is_array($summary['organizations'])) {
            $summary['organizations'] = [$requestedOrganization];
        } elseif (!in_array($requestedOrganization, $summary['organizations'], true)) {
            $summary['organizations'][] = $requestedOrganization;
        }
        $summary['accessGranted'] = true;
    }

    return $summary;
}

function docs_normalize_organization_candidate($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $normalized = sanitize_text_field($value, 120);

    return $normalized === '' ? '' : $normalized;
}

function docs_responsible_matches_filter(array $responsible, array $filter): bool
{
    if (empty($filter)) {
        return false;
    }

    $record = ['assignee' => $responsible];

    return document_matches_assignee_filter($record, $filter, [$responsible]);
}

function docs_resolve_accessible_organizations(?array $filter, array $allOrganizations = []): array
{
    if (empty($allOrganizations)) {
        $allOrganizations = load_organizations();
    }

    if (empty($allOrganizations)) {
        return [];
    }

    if ($filter === null) {
        return $allOrganizations;
    }

    $matched = [];

    foreach ($allOrganizations as $organization) {
        $folder = sanitize_folder_name($organization);
        $responsibles = load_responsibles_for_folder($folder);

        $hasMatch = false;

        foreach ($responsibles as $responsible) {
            if (!is_array($responsible)) {
                continue;
            }

            if (docs_responsible_matches_filter($responsible, $filter)) {
                $hasMatch = true;
                break;
            }
        }

        if (!$hasMatch) {
            $records = load_registry($folder);
            foreach ($records as $record) {
                if (!is_array($record)) {
                    continue;
                }

                if (document_matches_assignee_filter($record, $filter, $responsibles)) {
                    $hasMatch = true;
                    break;
                }
            }
        }

        if ($hasMatch) {
            $matched[] = $organization;
        }
    }

    if (!empty($matched)) {
        return array_values(array_unique(array_filter($matched, static function ($value) {
            return is_string($value) && $value !== '';
        })));
    }

    return $allOrganizations;
}

function docs_user_can_access_organization(string $organization, ?array $filter, array $responsibles = []): bool
{
    if ($organization === '') {
        return false;
    }

    if ($filter === null) {
        return true;
    }

    foreach ($responsibles as $responsible) {
        if (!is_array($responsible)) {
            continue;
        }

        if (docs_responsible_matches_filter($responsible, $filter)) {
            return true;
        }
    }

    $folder = sanitize_folder_name($organization);
    $records = load_registry($folder);

    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        if (document_matches_assignee_filter($record, $filter, $responsibles)) {
            return true;
        }
    }

    return false;
}

function docs_resolve_access_context(?string $requestedOrganization = null, bool $suppressErrors = false): array
{
    $requestContext = docs_build_request_user_context();
    $filter = $requestContext['filter'] ?? null;
    $filterSource = $requestContext['filterSource'] ?? 'none';
    $requestedOrganization = docs_normalize_organization_candidate($requestedOrganization);

    $sessionAuth = docs_get_session_auth();
    $sessionRole = is_array($sessionAuth) ? ($sessionAuth['role'] ?? 'guest') : 'guest';
    $sessionOrganization = '';
    if (is_array($sessionAuth)) {
        $sessionOrganization = docs_normalize_organization_candidate((string) ($sessionAuth['organization'] ?? ''));
    }

    $forceAccess = $sessionRole === 'admin';

    $allOrganizations = load_organizations();
    $accessible = docs_resolve_accessible_organizations($filter, $allOrganizations);
    $active = null;

    if ($sessionRole === 'user' && $sessionOrganization !== '') {
        $accessible = [$sessionOrganization];
        if ($requestedOrganization === '' || $requestedOrganization !== $sessionOrganization) {
            $requestedOrganization = $sessionOrganization;
        }
    }

    if ($sessionRole === 'admin' && !empty($allOrganizations)) {
        $accessible = $allOrganizations;
    }

    if ($requestedOrganization !== '') {
        $active = $requestedOrganization;
        if (!in_array($requestedOrganization, $accessible, true)) {
            $accessible[] = $requestedOrganization;
        }
    }

    if ($active === null && !empty($accessible)) {
        $active = $accessible[0];
    }

    $accessible = array_values(array_unique(array_filter($accessible, static function ($value) {
        return is_string($value) && $value !== '';
    })));

    if ($active === null && !empty($accessible)) {
        $active = $accessible[0];
    }

    if ($active === null) {
        $result = [
            'forceAccess' => $forceAccess,
            'filter' => $filter,
            'filterSource' => $filterSource,
            'accessible' => $accessible,
            'active' => null,
        ];

        log_docs_event('Access context resolved', [
            'requestedOrganization' => $requestedOrganization !== '' ? $requestedOrganization : null,
            'activeOrganization' => null,
            'accessibleCount' => count($accessible),
            'accessibleSample' => array_slice($accessible, 0, 10),
            'filter' => summarize_assignee_filter_for_log($filter),
            'filterSource' => $filterSource,
            'userId' => $requestContext['primaryId'] ?? null,
            'forceAccess' => $forceAccess,
            'suppressErrors' => $suppressErrors,
        ]);

        if (!$suppressErrors) {
            log_docs_event('Access context resolved without active organization', [
                'accessibleOrganizations' => $accessible,
                'filterProvided' => $filter !== null,
                'filterSource' => $filterSource,
                'userId' => $requestContext['primaryId'] ?? null,
            ]);

            respond_error('Организации с документами не найдены.', 404);
        }

        return $result;
    }

    $result = [
        'forceAccess' => $forceAccess,
        'filter' => $filter,
        'filterSource' => $filterSource,
        'accessible' => $accessible,
        'active' => $active,
    ];

    log_docs_event('Access context resolved', [
        'requestedOrganization' => $requestedOrganization !== '' ? $requestedOrganization : null,
        'activeOrganization' => $active,
        'accessibleCount' => count($accessible),
        'accessibleSample' => array_slice($accessible, 0, 10),
        'filter' => summarize_assignee_filter_for_log($filter),
        'filterSource' => $filterSource,
        'userId' => $requestContext['primaryId'] ?? null,
        'forceAccess' => $forceAccess,
        'suppressErrors' => $suppressErrors,
    ]);

    return $result;
}

function docs_parse_datetime_to_timestamp($value): ?int
{
    if ($value === null) {
        return null;
    }

    $candidate = trim((string) $value);
    if ($candidate === '') {
        return null;
    }

    $date = DateTime::createFromFormat('Y-m-d', $candidate);
    if ($date instanceof DateTime) {
        $date->setTime(0, 0, 0);

        return $date->getTimestamp();
    }

    try {
        $date = new DateTime($candidate);

        return $date->getTimestamp();
    } catch (Exception $exception) {
        return null;
    }
}

function docs_normalize_entry_number_for_sort($value): int
{
    if ($value === null) {
        return 0;
    }

    $normalized = preg_replace('/[^0-9\-]/', '', (string) $value);
    if ($normalized === '' || $normalized === '-' || $normalized === '--') {
        return 0;
    }

    return (int) $normalized;
}

function docs_build_registration_sort_key(array $record): array
{
    $timestamp = null;
    if (isset($record['registrationDate'])) {
        $timestamp = docs_parse_datetime_to_timestamp($record['registrationDate']);
    }

    if ($timestamp === null) {
        $fallbackFields = ['statusUpdatedAt', 'updatedAt', 'createdAt', 'completedAt', 'documentDate'];
        foreach ($fallbackFields as $field) {
            if (!isset($record[$field])) {
                continue;
            }

            $candidateTimestamp = docs_parse_datetime_to_timestamp($record[$field]);
            if ($candidateTimestamp !== null) {
                $timestamp = $candidateTimestamp;
                break;
            }
        }
    }

    $entryNumber = isset($record['entryNumber'])
        ? docs_normalize_entry_number_for_sort($record['entryNumber'])
        : 0;

    $index = isset($record['__position']) ? (int) $record['__position'] : PHP_INT_MAX;
    $identifier = isset($record['id']) ? (string) $record['id'] : '';

    return [
        'timestamp' => $timestamp,
        'entry' => $entryNumber,
        'index' => $index,
        'id' => $identifier,
    ];
}

function docs_compare_records_by_registration_date($a, $b): int
{
    $first = is_array($a) ? docs_build_registration_sort_key($a) : docs_build_registration_sort_key([]);
    $second = is_array($b) ? docs_build_registration_sort_key($b) : docs_build_registration_sort_key([]);

    if ($first['timestamp'] !== $second['timestamp']) {
        if ($first['timestamp'] === null) {
            return 1;
        }
        if ($second['timestamp'] === null) {
            return -1;
        }

        return $second['timestamp'] <=> $first['timestamp'];
    }

    if ($first['entry'] !== $second['entry']) {
        return $second['entry'] <=> $first['entry'];
    }

    if ($first['index'] !== $second['index']) {
        return $first['index'] <=> $second['index'];
    }

    return strcmp($first['id'], $second['id']);
}

function docs_prepare_records_for_response(array $records, string $organization, string $folder): array
{
    foreach ($records as $position => &$record) {
        if (!is_array($record)) {
            continue;
        }

        $record['__position'] = $position;

        if (!isset($record['organization']) || $record['organization'] === '') {
            $record['organization'] = $organization;
        }

        if (isset($record['instruction'])) {
            $record['instruction'] = sanitize_instruction((string) $record['instruction']);
        }

        if (isset($record['files']) && is_array($record['files'])) {
            foreach ($record['files'] as &$file) {
                if (!is_array($file)) {
                    continue;
                }

                if (isset($file['storedName']) && !isset($file['url'])) {
                    $file['url'] = build_public_path($folder, (string) $file['storedName']);
                }
            }
            unset($file);
        }

        docs_prepare_responses_for_record($record, $folder);

        if (isset($record['assignees']) && is_array($record['assignees'])) {
            $sanitizedAssignees = sanitize_assignees_payload($record['assignees'], false);
            if (!empty($sanitizedAssignees)) {
                $uniqueAssignees = docs_filter_unique_assignees_by_primary_keys($sanitizedAssignees);
                if (!empty($uniqueAssignees)) {
                    $record['assignees'] = $uniqueAssignees;
                } else {
                    unset($record['assignees']);
                }
            } else {
                unset($record['assignees']);
            }
        } elseif (isset($record['assignee']) && is_array($record['assignee'])) {
            $sanitizedAssignee = sanitize_assignee_payload($record['assignee'], false);
            if (!empty($sanitizedAssignee)) {
                $uniqueAssignees = docs_filter_unique_assignees_by_primary_keys([$sanitizedAssignee]);
                if (!empty($uniqueAssignees)) {
                    $record['assignees'] = $uniqueAssignees;
                } else {
                    unset($record['assignees']);
                }
            } else {
                unset($record['assignees']);
            }
            unset($record['assignee']);
        } else {
            unset($record['assignee']);
        }

        unset($record['assignee']);

        if (isset($record['subordinates']) && is_array($record['subordinates'])) {
            $sanitizedSubordinates = sanitize_assignees_payload($record['subordinates'], false);
            if (!empty($sanitizedSubordinates)) {
                $record['subordinates'] = array_values($sanitizedSubordinates);
            } else {
                unset($record['subordinates']);
            }
        } elseif (isset($record['subordinate']) && is_array($record['subordinate'])) {
            $sanitizedSubordinate = sanitize_assignee_payload($record['subordinate'], false);
            if (!empty($sanitizedSubordinate)) {
                $record['subordinates'] = [$sanitizedSubordinate];
            } else {
                unset($record['subordinates']);
            }
            unset($record['subordinate']);
        } else {
            unset($record['subordinate']);
        }

        unset($record['subordinate']);

        if (isset($record['director']) && is_array($record['director'])) {
            $sanitizedDirector = sanitize_assignee_payload($record['director'], false);
            if (!empty($sanitizedDirector)) {
                $record['director'] = $sanitizedDirector;
            } else {
                unset($record['director']);
            }
        }

        if (isset($record['directors']) && is_array($record['directors'])) {
            $sanitizedDirectors = sanitize_assignees_payload($record['directors'], false);
            if (!empty($sanitizedDirectors)) {
                $record['directors'] = $sanitizedDirectors;
                if (!isset($record['director'])) {
                    $record['director'] = $sanitizedDirectors[0];
                }
            } else {
                unset($record['directors']);
            }
        }

        if (isset($record['assigneeViews']) && is_array($record['assigneeViews'])) {
            $sanitizedViews = docs_sanitize_assignee_views_payload($record['assigneeViews']);
            if (!empty($sanitizedViews)) {
                $record['assigneeViews'] = $sanitizedViews;
            } else {
                unset($record['assigneeViews']);
            }
        }

        if (isset($record['assigneeStatusHistory']) && is_array($record['assigneeStatusHistory'])) {
            $sanitizedStatusHistory = docs_sanitize_assignee_status_history_collection($record['assigneeStatusHistory']);
            if (!empty($sanitizedStatusHistory)) {
                $record['assigneeStatusHistory'] = $sanitizedStatusHistory;
            } else {
                unset($record['assigneeStatusHistory']);
            }
        }

        if (isset($record['statusHistory']) && is_array($record['statusHistory'])) {
            $history = docs_sanitize_status_history($record['statusHistory']);
            if (!empty($history)) {
                $record['statusHistory'] = $history;
                $lastHistoryEntry = $history[count($history) - 1];
                if (isset($lastHistoryEntry['changedAt'])) {
                    $record['statusUpdatedAt'] = $lastHistoryEntry['changedAt'];
                }
            } else {
                unset($record['statusHistory']);
            }
        }

        $existingStatusUpdatedAt = $record['statusUpdatedAt'] ?? null;
        $normalizedStatusUpdatedAt = docs_normalize_datetime_iso(
            is_string($existingStatusUpdatedAt) ? $existingStatusUpdatedAt : null
        );

        if ($normalizedStatusUpdatedAt !== null) {
            $record['statusUpdatedAt'] = $normalizedStatusUpdatedAt;
        } else {
            $candidates = [
                $record['completedAt'] ?? null,
                $record['updatedAt'] ?? null,
                $record['createdAt'] ?? null,
            ];

            foreach ($candidates as $candidate) {
                $normalizedCandidate = docs_normalize_datetime_iso(
                    is_string($candidate) ? $candidate : null
                );
                if ($normalizedCandidate !== null) {
                    $record['statusUpdatedAt'] = $normalizedCandidate;
                    break;
                }
            }
        }
    }
    unset($record);

    usort($records, 'docs_compare_records_by_registration_date');

    foreach ($records as &$record) {
        if (is_array($record) && array_key_exists('__position', $record)) {
            unset($record['__position']);
        }
    }
    unset($record);

    $summary = summarize_documents_collection_for_log($records);
    $logContext = [
        'organization' => $organization,
        'folder' => $folder,
        'registryPath' => get_registry_path($folder),
        'storagePath' => build_public_path($folder),
        'recordsCount' => $summary['count'],
    ];

    if (!empty($summary['samples'])) {
        $logContext['recordsSample'] = $summary['samples'];
    }

    log_docs_event('Records prepared for response', $logContext);

    return $records;
}

function validate_organization(string $organization): string
{
    $organization = sanitize_text_field($organization, 120);
    if ($organization === '') {
        respond_error('Не выбрана организация.');
    }

    return $organization;
}

function format_document_date(?string $value): string
{
    if ($value === null) {
        return '—';
    }

    $value = trim((string) $value);
    if ($value === '') {
        return '—';
    }

    $date = DateTime::createFromFormat('Y-m-d', $value);
    if ($date instanceof DateTime) {
        return $date->format('d.m.Y');
    }

    try {
        $date = new DateTime($value);
        return $date->format('d.m.Y');
    } catch (Exception $exception) {
        return '—';
    }
}

function format_document_datetime(?string $value): string
{
    if ($value === null) {
        return '—';
    }

    $value = trim((string) $value);
    if ($value === '') {
        return '—';
    }

    try {
        $date = new DateTime($value);
        return $date->format('d.m.Y H:i');
    } catch (Exception $exception) {
        return '—';
    }
}

function format_document_size($bytes): string
{
    $size = (int) $bytes;
    if ($size <= 0) {
        return '';
    }

    $units = ['Б', 'КБ', 'МБ', 'ГБ'];
    $value = (float) $size;
    $index = 0;

    while ($value >= 1024 && $index < count($units) - 1) {
        $value /= 1024;
        $index++;
    }

    $formatted = $index === 0
        ? (string) round($value)
        : number_format($value, 1, ',', ' ');

    return $formatted . ' ' . $units[$index];
}

function normalize_document_value($value): string
{
    if ($value === null) {
        return '—';
    }

    if (is_string($value) || is_numeric($value)) {
        $string = trim((string) $value);
        return $string === '' ? '—' : $string;
    }

    return '—';
}

function find_document_by_id(array $records, string $documentId): ?array
{
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        if (!isset($record['id'])) {
            continue;
        }

        if ((string) $record['id'] === $documentId) {
            return $record;
        }
    }

    return null;
}

function docs_handle_mini_app_client_log(string $method): void
{
    if ($method !== 'POST') {
        respond_error('Некорректный метод запроса.', 405, ['allowedMethod' => 'POST']);
    }

    $requestContext = docs_build_request_user_context();

    $payload = load_json_payload();
    if (empty($payload) && !empty($_POST) && is_array($_POST)) {
        $payload = $_POST;
    }

    $eventRaw = isset($payload['event']) ? (string) $payload['event'] : '';
    $event = sanitize_text_field($eventRaw, 120);
    if ($event === '') {
        $event = 'client-event';
    }

    $details = [];
    if (isset($payload['details'])) {
        if (is_array($payload['details'])) {
            $details = $payload['details'];
        } else {
            $details['message'] = sanitize_text_field((string) $payload['details'], 500);
        }
    }

    if (isset($payload['message']) && !isset($details['message'])) {
        $details['message'] = sanitize_text_field((string) $payload['message'], 500);
    }

    if (isset($payload['context']) && is_array($payload['context'])) {
        $details['context'] = $payload['context'];
    }

    $details = docs_normalize_debug_details($details);
    $contextPayload = [];
    if (isset($payload['context']) && is_array($payload['context'])) {
        $contextPayload = docs_normalize_debug_details($payload['context']);
    }

    $downloadEvents = ['viewer_download_click', 'viewer_download_success', 'viewer_download_error'];
    $viewEvents = [
        'task_view_watch_open_click',
        'task_view_watch_open_success',
        'task_view_watch_open_error',
        'task_view_watch_tab_click',
        'task_view_watch_tab_success',
        'task_view_watch_tab_error',
        'task_view_watch_tab_finish',
        'task_view_watch_tab_skip_busy',
        'task_view_watch_tab_cache_hit',
        'task_view_watch_tab_cache_save',
        'task_view_open_start',
        'task_view_open',
        'task_view_inline_mode',
        'task_view_inline_start',
        'task_view_inline_viewer_ready',
        'task_view_resolve',
        'task_view_error',
        'task_view_files_resolved',
        'task_view_fetch_success',
        'task_view_pdf_render_result',
        'task_view_pdf_diagnostics',
        'task_view_pdf_page_count',
    ];
    $platformRaw = isset($payload['platform']) ? (string) $payload['platform'] : '';
    $detailsPlatform = isset($details['platform']) ? (string) $details['platform'] : '';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $clientPlatform = docs_detect_client_platform($userAgent);
    $isAndroid = $clientPlatform === 'android'
        || mb_strtolower($platformRaw, 'UTF-8') === 'android'
        || mb_strtolower($detailsPlatform, 'UTF-8') === 'android';

    $logContext = [
        'event' => $event,
        'userId' => $requestContext['primaryId'] ?? null,
        'filterSource' => $requestContext['filterSource'] ?? null,
        'telegramInitData' => $requestContext['telegramInitData'] ?? null,
        'platform' => $isAndroid ? 'android' : $clientPlatform,
    ];

    if (!empty($details)) {
        $logContext['details'] = $details;
    }

    if (!empty($userAgent)) {
        $logContext['userAgent'] = sanitize_text_field((string) $userAgent, 200);
    }

    if (!empty($_SERVER['REMOTE_ADDR'])) {
        $logContext['ip'] = sanitize_text_field((string) $_SERVER['REMOTE_ADDR'], 80);
    }

    $logged = false;

    if (in_array($event, $downloadEvents, true) && $isAndroid) {
        docs_write_android_download_log('Mini app android download', $logContext);
        $logged = true;
    }

    if (in_array($event, $viewEvents, true)) {
        if (!empty($contextPayload)) {
            $logContext['context'] = $contextPayload;
        }

        $requestUser = docs_get_request_user_info();
        if (is_array($requestUser)) {
            $logContext['requestUser'] = array_filter([
                'id' => $requestUser['id'] ?? null,
                'username' => $requestUser['username'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
        }

        $sessionAuth = docs_get_session_auth();
        if (is_array($sessionAuth)) {
            $logContext['session'] = array_filter([
                'role' => $sessionAuth['role'] ?? null,
                'organization' => $sessionAuth['organization'] ?? null,
                'login' => $sessionAuth['login'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
        }

        docs_write_view_trace_log('mini_app:' . $event, $logContext);
        $logged = true;
    }

    respond_success(['logged' => $logged]);
}

function docs_handle_mini_app_entry_log(string $method): void
{
    if ($method !== 'POST') {
        respond_error('Некорректный метод запроса.', 405, ['allowedMethod' => 'POST']);
    }

    respond_success(['logged' => false]);
}

function docs_handle_mini_app_pdf_log(string $method): void
{
    if ($method !== 'POST') {
        respond_error('Некорректный метод запроса.', 405, ['allowedMethod' => 'POST']);
    }

    $requestContext = docs_build_request_user_context();

    $payload = load_json_payload();
    if (empty($payload) && !empty($_POST) && is_array($_POST)) {
        $payload = $_POST;
    }

    if (empty($payload) || !is_array($payload)) {
        respond_success(['logged' => false]);
        return;
    }

    $eventRaw = isset($payload['event']) ? (string) $payload['event'] : 'task_view_pdf_diagnostics';
    $event = sanitize_text_field($eventRaw, 120);
    if ($event === '') {
        $event = 'task_view_pdf_diagnostics';
    }

    $details = [];
    if (isset($payload['details'])) {
        if (is_array($payload['details'])) {
            $details = docs_normalize_debug_details($payload['details']);
        } else {
            $details = ['message' => sanitize_text_field((string) $payload['details'], 500)];
        }
    }

    $contextPayload = [];
    if (isset($payload['context']) && is_array($payload['context'])) {
        $contextPayload = docs_normalize_debug_details($payload['context']);
    }

    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $clientPlatform = docs_detect_client_platform($userAgent);
    $logContext = [
        'event' => $event,
        'userId' => $requestContext['primaryId'] ?? null,
        'filterSource' => $requestContext['filterSource'] ?? null,
        'telegramInitData' => $requestContext['telegramInitData'] ?? null,
        'platform' => $clientPlatform,
    ];

    if (!empty($details)) {
        $logContext['details'] = $details;
    }

    if (!empty($contextPayload)) {
        $logContext['context'] = $contextPayload;
    }

    if (!empty($userAgent)) {
        $logContext['userAgent'] = sanitize_text_field((string) $userAgent, 200);
    }

    if (!empty($_SERVER['REMOTE_ADDR'])) {
        $logContext['ip'] = sanitize_text_field((string) $_SERVER['REMOTE_ADDR'], 80);
    }

    docs_write_view_trace_log('mini_app:' . $event, $logContext);
    respond_success(['logged' => true]);
}

function docs_handle_mini_app_doc_load_log(string $method): void
{
    if ($method !== 'POST') {
        respond_error('Некорректный метод запроса.', 405, ['allowedMethod' => 'POST']);
    }

    $payload = load_json_payload();
    if (empty($payload) || !is_array($payload)) {
        respond_success(['logged' => false]);
        return;
    }

    $event = isset($payload['event']) ? sanitize_text_field((string) $payload['event'], 200) : '';
    $timings = [];
    if (isset($payload['timings']) && is_array($payload['timings'])) {
        foreach ($payload['timings'] as $timing) {
            if (!is_array($timing)) {
                continue;
            }

            $label = sanitize_text_field((string) ($timing['label'] ?? ''), 200);
            $ms = isset($timing['ms']) ? (int) $timing['ms'] : 0;
            if ($label === '') {
                continue;
            }

            $timings[] = [
                'label' => $label,
                'ms' => $ms,
            ];
        }
    }

    $entry = [
        'time' => date('c'),
        'event' => $event,
        'fileName' => isset($payload['fileName']) ? sanitize_text_field((string) $payload['fileName'], 300) : '',
        'fileType' => isset($payload['fileType']) ? sanitize_text_field((string) $payload['fileType'], 50) : '',
        'timings' => $timings,
        'totalMs' => isset($payload['totalMs']) ? (int) $payload['totalMs'] : 0,
        'elapsedMs' => isset($payload['elapsedMs']) ? (int) $payload['elapsedMs'] : 0,
        'stepLabel' => isset($payload['stepLabel']) ? sanitize_text_field((string) $payload['stepLabel'], 200) : '',
        'stepMs' => isset($payload['stepMs']) ? (int) $payload['stepMs'] : 0,
        'stepIndex' => isset($payload['stepIndex']) ? (int) $payload['stepIndex'] : 0,
        'sessionId' => isset($payload['sessionId']) ? sanitize_text_field((string) $payload['sessionId'], 120) : '',
        'telegramId' => isset($payload['telegramId']) ? sanitize_text_field((string) $payload['telegramId'], 50) : '',
        'platform' => isset($payload['platform']) ? sanitize_text_field((string) $payload['platform'], 50) : '',
        'taskId' => isset($payload['taskId']) ? sanitize_text_field((string) $payload['taskId'], 120) : '',
        'taskStatus' => isset($payload['taskStatus']) ? sanitize_text_field((string) $payload['taskStatus'], 120) : '',
        'organization' => isset($payload['organization']) ? sanitize_text_field((string) $payload['organization'], 200) : '',
        'filesCount' => isset($payload['filesCount']) ? (int) $payload['filesCount'] : 0,
        'firstFileIndex' => isset($payload['firstFileIndex']) ? (int) $payload['firstFileIndex'] : 0,
    ];

    if (!empty($payload['error'])) {
        $entry['error'] = sanitize_text_field((string) $payload['error'], 500);
    }

    if (!is_dir(DOCS_SERVER_LOG_DIRECTORY)) {
        @mkdir(DOCS_SERVER_LOG_DIRECTORY, 0775, true);
    }

    $encoded = @json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded !== false) {
        @file_put_contents(DOCS_DOC_LOAD_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }

    $timingsSummary = [];
    $previousMs = 0;
    foreach ($timings as $timing) {
        $currentMs = isset($timing['ms']) ? (int) $timing['ms'] : 0;
        $deltaMs = $currentMs - $previousMs;
        if ($deltaMs < 0) {
            $deltaMs = 0;
        }

        $timingsSummary[] = [
            'label' => $timing['label'] ?? '',
            'elapsedMs' => $currentMs,
            'deltaMs' => $deltaMs,
        ];
        $previousMs = $currentMs;
    }

    $viewTraceContext = [
        'event' => $entry['event'],
        'taskId' => $entry['taskId'],
        'fileName' => $entry['fileName'],
        'fileType' => $entry['fileType'],
        'platform' => $entry['platform'],
        'telegramId' => $entry['telegramId'],
        'totalMs' => $entry['totalMs'],
        'stepCount' => count($timingsSummary),
        'timingsSummary' => $timingsSummary,
    ];

    if (!empty($entry['error'])) {
        $viewTraceContext['error'] = $entry['error'];
    }

    docs_write_view_trace_log('mini_app_doc_load_timing', $viewTraceContext);

    $logMessage = $event !== '' ? ('mini_app_doc_load_' . $event) : 'mini_app_doc_load';
    docs_write_kruglik_log($logMessage, $entry);

    respond_success(['logged' => true]);
}

function docs_handle_mini_app_user_journal(string $method): void
{
    if ($method !== 'GET' && $method !== 'POST') {
        respond_error('Некорректный метод запроса.', 405, ['allowedMethods' => ['GET', 'POST']]);
    }

    $source = [];
    if ($method === 'POST') {
        $source = load_json_payload();
        if (empty($source) && !empty($_POST) && is_array($_POST)) {
            $source = $_POST;
        }
    }

    if (empty($source) && !empty($_GET) && is_array($_GET)) {
        $source = $_GET;
    }

    $organizationCandidate = docs_normalize_organization_candidate((string) ($source['organization'] ?? ''));
    $accessContext = docs_resolve_access_context($organizationCandidate);
    docs_require_admin_session($accessContext);

    $organization = $accessContext['active'];
    if ($organization === null || $organization === '') {
        respond_error('Не удалось определить организацию для журнала.', 400);
    }

    $folder = sanitize_folder_name($organization);
    $logData = docs_load_mini_app_user_log($folder);
    $entries = [];
    foreach ($logData['entries'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $id = isset($entry['id']) ? (string) $entry['id'] : '';
        if ($id === '') {
            continue;
        }

        $normalized = ['id' => $id];
        if (!empty($entry['fullName'])) {
            $normalized['fullName'] = (string) $entry['fullName'];
        }
        if (!empty($entry['username'])) {
            $normalized['username'] = ltrim((string) $entry['username'], '@');
        }
        if (!empty($entry['lastSeen'])) {
            $normalized['lastSeen'] = (string) $entry['lastSeen'];
        }

        $entries[] = $normalized;
    }

    log_docs_event('Mini app user journal requested', [
        'organization' => $organization,
        'folder' => $folder,
        'entriesCount' => count($entries),
        'accessibleOrganizations' => $accessContext['accessible'],
    ]);

    $response = [
        'organization' => $organization,
        'entries' => $entries,
        'total' => count($entries),
    ];

    if (!empty($accessContext['accessible']) && is_array($accessContext['accessible'])) {
        $response['accessibleOrganizations'] = $accessContext['accessible'];
    }

    if (!empty($logData['updatedAt'])) {
        $response['updatedAt'] = $logData['updatedAt'];
    }

    respond_success($response);
}

function docs_handle_mini_app_upload_pdf(string $method): void
{
    if ($method !== 'POST') {
        respond_error('Некорректный метод запроса.', 405, ['allowedMethod' => 'POST']);
    }

    $requestContext = docs_build_request_user_context();
    docs_log_missing_telegram_user_id('mini_app_upload_pdf', $requestContext);
    $sessionAuth = docs_get_session_auth();
    $telegramInitData = $requestContext['telegramInitData'] ?? [];
    $requestSources = docs_collect_request_sources();
    $initDataRaw = docs_first_non_empty_string($requestSources, ['telegram_init_data', 'init_data', 'initData', 'telegramInitData']);
    if ($initDataRaw === '' && !empty($_SERVER['HTTP_X_TELEGRAM_INIT_DATA'])) {
        $initDataRaw = trim((string) $_SERVER['HTTP_X_TELEGRAM_INIT_DATA']);
    }
    if ($initDataRaw !== '') {
        $initDataRaw = sanitize_text_field($initDataRaw, 300);
        if (strlen($initDataRaw) > 300) {
            $initDataRaw = substr($initDataRaw, 0, 300) . '...';
        }
    }

    $contentType = $_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '');
    $filesSummary = [];
    foreach ($_FILES as $field => $file) {
        if (!is_array($file)) {
            $filesSummary[$field] = ['type' => gettype($file)];
            continue;
        }

        $filesSummary[$field] = [
            'name' => $file['name'] ?? null,
            'size' => $file['size'] ?? null,
            'error' => $file['error'] ?? null,
            'tmp' => isset($file['tmp_name']) ? (string) $file['tmp_name'] : null,
        ];
    }

    docs_write_pdf_log('Mini app PDF upload request', [
        'method' => $method,
        'contentType' => $contentType,
        'files' => $filesSummary,
        'postKeys' => array_keys($_POST),
        'queryKeys' => array_keys($_GET),
        'telegramContext' => $requestContext['primaryId'] ?? null,
    ]);

    $telegramId = trim((string) ($requestContext['primaryId'] ?? ''));
    if ($telegramId === '' && isset($requestContext['filter']['ids'][0])) {
        $telegramId = trim((string) $requestContext['filter']['ids'][0]);
    }

    if ($telegramId === '' && !empty($telegramInitData['valid']) && is_array($telegramInitData['source'] ?? null)) {
        $telegramId = normalize_identifier_value((string) ($telegramInitData['source']['telegram_user_id'] ?? ''));
    }

    $hasValidSession = is_array($sessionAuth);
    $hasValidInitData = !empty($telegramInitData['valid']);
    $failureLogBase = array_filter([
        'telegramId' => $telegramId !== '' ? $telegramId : null,
        'initData' => $initDataRaw !== '' ? $initDataRaw : null,
        'initDataValid' => $hasValidInitData ? true : null,
        'sessionRole' => $hasValidSession ? (string) ($sessionAuth['role'] ?? '') : null,
    ], static function ($value) {
        return $value !== null && $value !== '';
    });

    if ($telegramId === '' && !$hasValidSession && !$hasValidInitData) {
        docs_write_pdf_log('Mini app PDF upload failed: telegram id missing', [
            'contentType' => $contentType,
            'files' => $filesSummary,
        ] + $failureLogBase);
        docs_write_pdf_log('Mini app PDF upload failed: auth context missing', $failureLogBase);
        respond_error('Не удалось определить Telegram ID. Откройте мини-приложение из Telegram.', 400, [
            'requiresTelegramId' => true,
        ]);
    }

    if (!isset($_FILES['pdf'])) {
        docs_write_pdf_log('Mini app PDF upload failed: pdf field missing', [
            'contentType' => $contentType,
            'files' => $filesSummary,
        ] + $failureLogBase);
        respond_error('Файл PDF не получен.', 400, ['filePresent' => false]);
    }

    $fileInfo = $_FILES['pdf'];
    if (!is_array($fileInfo)) {
        docs_write_pdf_log('Mini app PDF upload failed: pdf info not array', [
            'contentType' => $contentType,
            'fileType' => gettype($fileInfo),
        ] + $failureLogBase);
        respond_error('Некорректные данные файла.', 400, ['filePresent' => false]);
    }

    $uploadError = (int) ($fileInfo['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'Размер PDF превышает допустимый предел.',
            UPLOAD_ERR_FORM_SIZE => 'Размер PDF превышает ограничение формы.',
            UPLOAD_ERR_PARTIAL => 'Файл PDF загружен только частично.',
            UPLOAD_ERR_NO_FILE => 'Файл PDF не получен.',
            UPLOAD_ERR_NO_TMP_DIR => 'Не найдена временная директория для загрузки PDF.',
            UPLOAD_ERR_CANT_WRITE => 'Не удалось сохранить PDF на сервер.',
            UPLOAD_ERR_EXTENSION => 'Расширение файла отклонило загрузку PDF.',
        ];

        $message = $errorMessages[$uploadError] ?? 'Не удалось загрузить PDF.';
        docs_write_pdf_log('Mini app PDF upload failed: upload error', [
            'uploadError' => $uploadError,
            'message' => $message,
            'fileName' => $fileInfo['name'] ?? null,
            'fileSize' => $fileInfo['size'] ?? null,
        ] + $failureLogBase);
        respond_error($message, 400, ['uploadError' => $uploadError]);
    }

    $tmpPath = (string) ($fileInfo['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        docs_write_pdf_log('Mini app PDF upload failed: tmp file missing', [
            'tmpPath' => $tmpPath,
            'tmpExists' => $tmpPath !== '' ? file_exists($tmpPath) : false,
        ] + $failureLogBase);
        respond_error('Не удалось принять PDF от клиента.', 400, ['tmpNamePresent' => $tmpPath !== '']);
    }

    $size = isset($fileInfo['size']) ? (int) $fileInfo['size'] : 0;
    if ($size <= 0) {
        docs_write_pdf_log('Mini app PDF upload failed: empty size', [
            'size' => $size,
        ] + $failureLogBase);
        respond_error('Файл PDF пустой.', 400, ['size' => $size]);
    }

    if ($size > MINI_APP_PDF_MAX_FILE_SIZE) {
        docs_write_pdf_log('Mini app PDF upload failed: size limit', [
            'size' => $size,
            'limit' => MINI_APP_PDF_MAX_FILE_SIZE,
        ] + $failureLogBase);
        respond_error('Файл PDF слишком большой. Максимальный размер — 15 МБ.', 413, [
            'size' => $size,
            'limit' => MINI_APP_PDF_MAX_FILE_SIZE,
        ]);
    }

    $originalName = docs_sanitize_filename((string) ($fileInfo['name'] ?? 'document.pdf'), 'document.pdf');
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($extension !== 'pdf') {
        $originalName .= '.pdf';
    }

    $cacheDirectory = docs_get_pdf_cache_directory();
    if (!is_dir($cacheDirectory)) {
        log_docs_event('Mini app PDF cache directory not accessible', [
            'telegramId' => $telegramId,
            'cacheDirectory' => $cacheDirectory,
        ]);
        docs_write_pdf_log('Mini app PDF upload failed: cache directory missing', [
            'cacheDirectory' => $cacheDirectory,
        ] + $failureLogBase);
        respond_error('Не удалось подготовить каталог для PDF.', 500, [
            'cacheDirectory' => $cacheDirectory,
        ]);
    }

    docs_cleanup_pdf_cache($cacheDirectory, MINI_APP_PDF_CACHE_TTL);

    try {
        $token = bin2hex(random_bytes(8));
    } catch (\Throwable $exception) {
        try {
            $token = bin2hex(pack('N', random_int(0, PHP_INT_MAX)));
        } catch (\Throwable $fallbackException) {
            $token = bin2hex(pack('N', mt_rand(0, mt_getrandmax())));
        }
    }

    $storedFileName = 'miniapp_' . date('Ymd_His') . '_' . $token . '.pdf';
    $targetPath = rtrim($cacheDirectory, '/\\') . '/' . $storedFileName;

    $moved = @move_uploaded_file($tmpPath, $targetPath);
    if (!$moved) {
        $renamed = @rename($tmpPath, $targetPath);
        if (!$renamed) {
            log_docs_event('Mini app PDF move failed', [
                'telegramId' => $telegramId,
                'targetPath' => $targetPath,
                'tmpPathExists' => file_exists($tmpPath),
                'targetParentWritable' => is_writable(dirname($targetPath)),
            ]);
            docs_write_pdf_log('Mini app PDF upload failed: move failed', [
                'targetPath' => $targetPath,
                'tmpPathExists' => file_exists($tmpPath),
                'targetParentWritable' => is_writable(dirname($targetPath)),
            ] + $failureLogBase);
            respond_error('Не удалось сохранить PDF на сервере.', 500, ['moveUploaded' => false]);
        }
    }

    @chmod($targetPath, 0644);

    $fileExists = file_exists($targetPath);
    $actualSize = $fileExists ? @filesize($targetPath) : 0;
    $isReadable = $fileExists ? is_readable($targetPath) : false;
    $mimeType = $fileExists ? @mime_content_type($targetPath) : null;

    if (!$fileExists || !$isReadable || $actualSize <= 0) {
        log_docs_event('Mini app PDF stored with anomalies', [
            'telegramId' => $telegramId,
            'targetPath' => $targetPath,
            'fileExists' => $fileExists,
            'isReadable' => $isReadable,
            'expectedSize' => $size,
            'actualSize' => $actualSize,
            'mimeType' => $mimeType,
        ]);
    }

    $expiresAtTimestamp = time() + MINI_APP_PDF_CACHE_TTL;
    $publicUrl = docs_build_public_pdf_url($storedFileName);

    log_docs_event('Mini app PDF cached', [
        'telegramId' => $telegramId,
        'originalName' => $originalName,
        'storedFile' => $storedFileName,
        'size' => $size,
        'actualSize' => $actualSize,
        'fileExists' => $fileExists,
        'isReadable' => $isReadable,
        'mimeType' => $mimeType,
        'publicUrl' => $publicUrl,
        'expiresAt' => date('c', $expiresAtTimestamp),
    ]);

    respond_success([
        'url' => $publicUrl,
        'fileName' => $originalName,
        'size' => $size,
        'actualSize' => $actualSize,
        'fileExists' => $fileExists,
        'expiresAt' => date('c', $expiresAtTimestamp),
        'expiresIn' => MINI_APP_PDF_CACHE_TTL,
    ]);
}

switch ($action) {
    case 'client_diagnostics':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }

        $eventName = sanitize_text_field($payload['event'] ?? '', 120);
        if ($eventName === '') {
            $eventName = 'client_event';
        }

        $organizationCandidate = isset($payload['organization'])
            ? (string) $payload['organization']
            : '';
        $organization = docs_normalize_organization_candidate($organizationCandidate);

        $location = sanitize_text_field($payload['location'] ?? '', 300);
        $userAgent = sanitize_text_field($payload['userAgent'] ?? '', 200);

        $diagnostics = [];
        if (isset($payload['diagnostics'])) {
            $diagnostics = normalize_log_value($payload['diagnostics']);
        }

        $logContext = [
            'event' => $eventName,
            'organization' => $organization,
            'filterProvided' => docs_get_request_user_filter() !== null,
        ];

        $requestUser = docs_get_request_user_info();
        if (is_array($requestUser)) {
            $logContext['requestUser'] = array_filter([
                'id' => $requestUser['id'] ?? null,
                'username' => $requestUser['username'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
        }

        if ($location !== '') {
            $logContext['location'] = $location;
        }

        if ($userAgent !== '') {
            $logContext['userAgent'] = $userAgent;
        }

        if (!empty($diagnostics)) {
            $logContext['diagnostics'] = $diagnostics;
        }

        log_docs_event('Client diagnostics received', $logContext);
        if ($eventName === 'Файлы') {
            docs_log_file_debug('client:files diagnostics', $logContext);
        }

        respond_success(['message' => 'Диагностика зафиксирована.']);
        break;

    case 'client_debug':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }

        $eventName = sanitize_text_field((string) ($payload['event'] ?? ''), 120);
        if ($eventName === '') {
            $eventName = 'client_debug_event';
        }

        $organization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $location = sanitize_text_field((string) ($payload['location'] ?? ''), 300);
        $userAgent = sanitize_text_field((string) ($payload['userAgent'] ?? ''), 200);

        $details = [];
        if (array_key_exists('details', $payload)) {
            $details = docs_normalize_debug_details($payload['details']);
        }

        $logContext = [
            'event' => $eventName,
        ];

        if ($organization !== '') {
            $logContext['organization'] = $organization;
        }

        if ($location !== '') {
            $logContext['location'] = $location;
        }

        if ($userAgent !== '') {
            $logContext['userAgent'] = $userAgent;
        }

        if (!empty($details)) {
            $logContext['details'] = $details;
        }

        if (isset($_SERVER['REMOTE_ADDR']) && $_SERVER['REMOTE_ADDR'] !== '') {
            $logContext['ip'] = $_SERVER['REMOTE_ADDR'];
        }

        $requestUser = docs_get_request_user_info();
        if (is_array($requestUser)) {
            $logContext['requestUser'] = array_filter([
                'id' => $requestUser['id'] ?? null,
                'username' => $requestUser['username'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
        }

        $sessionAuth = docs_get_session_auth();
        if (is_array($sessionAuth)) {
            $logContext['session'] = array_filter([
                'role' => $sessionAuth['role'] ?? null,
                'organization' => $sessionAuth['organization'] ?? null,
                'login' => $sessionAuth['login'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
        }

        docs_debug_log('client_debug:' . $eventName, $logContext);

        respond_success(['logged' => true]);
        break;

    case 'login':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        if ($requestedOrganization === '') {
            respond_error('Не указана организация.', 400);
        }

        $loginValue = sanitize_text_field((string) ($payload['login'] ?? ''), 120);
        $passwordValue = (string) ($payload['password'] ?? '');

        if ($loginValue === '' || $passwordValue === '') {
            respond_error('Не указан логин или пароль.', 400);
        }

        $authLogBase = [
            'organization' => $requestedOrganization,
            'login' => $loginValue,
        ];

        if (isset($_SERVER['REMOTE_ADDR']) && $_SERVER['REMOTE_ADDR'] !== '') {
            $authLogBase['ip'] = $_SERVER['REMOTE_ADDR'];
        }

        if (isset($_SERVER['HTTP_USER_AGENT']) && $_SERVER['HTTP_USER_AGENT'] !== '') {
            $authLogBase['userAgent'] = sanitize_text_field((string) $_SERVER['HTTP_USER_AGENT'], 200);
        }

        $authLogStages = [];
        $authFailureReason = null;
        $authFailureDetails = [];
        docs_log_auth_attempt('login_attempt', array_merge($authLogBase, [
            'hasPassword' => $passwordValue !== '',
        ]));
        $requestContext = docs_build_request_user_context();

        $adminUser = docs_authenticate_admin_user($loginValue, $passwordValue);
        $authLogStages[] = [
            'stage' => 'admin_users',
            'matched' => is_array($adminUser),
        ];
        if (is_array($adminUser)) {
            docs_log_auth_attempt('login_success', array_merge($authLogBase, [
                'stage' => 'admin_users',
                'stages' => $authLogStages,
            ]));
            docs_set_session_auth([
                'role' => 'admin',
                'organization' => $requestedOrganization,
                'login' => $adminUser['login'] ?? $loginValue,
                'fullName' => $adminUser['name'] ?? '',
                'telegramId' => '',
            ]);

            $sessionSummary = docs_get_active_session_summary($requestedOrganization);
            if ($sessionSummary === null) {
                $sessionSummary = docs_describe_session(docs_get_session_auth(), [
                    'accessible' => [$requestedOrganization],
                    'active' => $requestedOrganization,
                    'forceAccess' => true,
                ]);
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            } else {
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['forceAccess'] = true;
                $sessionSummary['filterSource'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            }

            $sessionAuth = docs_get_session_auth();
            $sessionSummary['permissions'] = docs_build_permissions_summary(
                $requestedOrganization,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null
            );

            docs_log_auth_attempt('login_response', array_merge($authLogBase, [
                'stage' => 'admin_users',
                'session' => $sessionSummary,
                'responseDiagnostics' => docs_collect_login_response_diagnostics($sessionSummary, 'admin_users'),
            ]));
            respond_success(['session' => $sessionSummary]);
        }

        $organizationAdmin = docs_authenticate_organization_admin_user($requestedOrganization, $loginValue, $passwordValue);
        $authLogStages[] = [
            'stage' => 'organization_admin',
            'matched' => is_array($organizationAdmin),
        ];
        if (is_array($organizationAdmin)) {
            docs_log_auth_attempt('login_success', array_merge($authLogBase, [
                'stage' => 'organization_admin',
                'stages' => $authLogStages,
            ]));
            docs_set_session_auth([
                'role' => 'admin',
                'organization' => $requestedOrganization,
                'login' => $organizationAdmin['login'] ?? $loginValue,
                'fullName' => $organizationAdmin['fullName'] ?? '',
                'telegramId' => '',
            ]);

            $sessionSummary = docs_get_active_session_summary($requestedOrganization);
            if ($sessionSummary === null) {
                $sessionSummary = docs_describe_session(docs_get_session_auth(), [
                    'accessible' => [$requestedOrganization],
                    'active' => $requestedOrganization,
                    'forceAccess' => true,
                ]);
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            } else {
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['forceAccess'] = true;
                $sessionSummary['filterSource'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            }

            $sessionAuth = docs_get_session_auth();
            $sessionSummary['permissions'] = docs_build_permissions_summary(
                $requestedOrganization,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null
            );

            docs_log_auth_attempt('login_response', array_merge($authLogBase, [
                'stage' => 'organization_admin',
                'session' => $sessionSummary,
                'responseDiagnostics' => docs_collect_login_response_diagnostics($sessionSummary, 'organization_admin'),
            ]));
            respond_success(['session' => $sessionSummary]);
        }

        $userCredentials = docs_authenticate_mainadmin_user($requestedOrganization, $loginValue, $passwordValue);
        $authLogStages[] = [
            'stage' => 'mainadmin',
            'matched' => is_array($userCredentials),
        ];
        if (is_array($userCredentials)) {
            $passwordSource = '';
            if (!empty($userCredentials['passwordHash']) || docs_is_password_hash((string) ($userCredentials['password'] ?? ''))) {
                $passwordSource = 'hash';
            } else {
                $passwordSource = 'plain';
            }

            docs_log_auth_attempt('login_success', array_merge($authLogBase, [
                'stage' => 'mainadmin',
                'passwordSource' => $passwordSource,
                'stages' => $authLogStages,
            ]));
            docs_set_session_auth([
                'role' => 'admin',
                'organization' => $requestedOrganization,
                'login' => $userCredentials['login'] ?? $loginValue,
                'fullName' => $userCredentials['fullName'] ?? '',
                'telegramId' => $userCredentials['telegramId'] ?? '',
            ]);

            $sessionSummary = docs_get_active_session_summary($requestedOrganization);
            if ($sessionSummary === null) {
                $sessionSummary = docs_describe_session(docs_get_session_auth(), [
                    'accessible' => [$requestedOrganization],
                    'active' => $requestedOrganization,
                    'forceAccess' => true,
                ]);
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            } else {
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['forceAccess'] = true;
                $sessionSummary['filterSource'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            }

            $sessionAuth = docs_get_session_auth();
            $sessionSummary['permissions'] = docs_build_permissions_summary(
                $requestedOrganization,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null
            );

            docs_log_auth_attempt('login_response', array_merge($authLogBase, [
                'stage' => 'mainadmin',
                'session' => $sessionSummary,
                'responseDiagnostics' => docs_collect_login_response_diagnostics($sessionSummary, 'mainadmin'),
            ]));
            respond_success(['session' => $sessionSummary]);
        }

        $directorCredentials = docs_authenticate_director_user($requestedOrganization, $loginValue, $passwordValue);
        $authLogStages[] = [
            'stage' => 'director',
            'matched' => is_array($directorCredentials),
        ];
        if (is_array($directorCredentials)) {
            $passwordSource = !empty($directorCredentials['passwordHash'])
                ? 'hash'
                : 'plain';

            docs_log_auth_attempt('login_success', array_merge($authLogBase, [
                'stage' => 'director',
                'passwordSource' => $passwordSource,
                'stages' => $authLogStages,
            ]));
            docs_log_auth_attempt('login_flow_checkpoint', array_merge($authLogBase, [
                'stage' => 'director',
                'checkpoint' => 'before_set_session',
            ]));
            docs_set_session_auth([
                'role' => 'admin',
                'organization' => $requestedOrganization,
                'login' => $directorCredentials['login'] ?? $loginValue,
                'fullName' => $directorCredentials['fullName'] ?? '',
                'telegramId' => $directorCredentials['telegramId'] ?? '',
                'adminScope' => $directorCredentials['adminScope'] ?? 'director',
            ]);

            docs_log_auth_attempt('login_flow_checkpoint', array_merge($authLogBase, [
                'stage' => 'director',
                'checkpoint' => 'before_get_session_summary',
            ]));
            $sessionSummary = docs_get_active_session_summary($requestedOrganization);
            docs_log_auth_attempt('login_flow_checkpoint', array_merge($authLogBase, [
                'stage' => 'director',
                'checkpoint' => 'after_get_session_summary',
                'sessionSummaryPresent' => $sessionSummary !== null,
            ]));
            if ($sessionSummary === null) {
                $sessionSummary = docs_describe_session(docs_get_session_auth(), [
                    'accessible' => [$requestedOrganization],
                    'active' => $requestedOrganization,
                    'forceAccess' => true,
                ]);
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            } else {
                $sessionSummary['mode'] = 'session_admin';
                $sessionSummary['forceAccess'] = true;
                $sessionSummary['filterSource'] = 'session_admin';
                $sessionSummary['requiresTelegramId'] = false;
            }

            $sessionAuth = docs_get_session_auth();
            docs_log_auth_attempt('login_flow_checkpoint', array_merge($authLogBase, [
                'stage' => 'director',
                'checkpoint' => 'before_permissions',
            ]));
            $sessionSummary['permissions'] = docs_build_permissions_summary(
                $requestedOrganization,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null
            );
            docs_log_auth_attempt('login_flow_checkpoint', array_merge($authLogBase, [
                'stage' => 'director',
                'checkpoint' => 'after_permissions',
            ]));

            docs_log_auth_attempt('login_response', array_merge($authLogBase, [
                'stage' => 'director',
                'session' => $sessionSummary,
                'responseDiagnostics' => docs_collect_login_response_diagnostics($sessionSummary, 'director'),
            ]));
            respond_success(['session' => $sessionSummary]);
        }

        $responsibleAuth = docs_authenticate_responsible_user_with_diagnostics($requestedOrganization, $loginValue, $passwordValue);
        $responsibleCredentials = isset($responsibleAuth['credentials']) && is_array($responsibleAuth['credentials'])
            ? $responsibleAuth['credentials']
            : null;
        $responsibleStageLog = [
            'stage' => 'responsible',
            'matched' => is_array($responsibleCredentials),
        ];
        if (!is_array($responsibleCredentials) && isset($responsibleAuth['reason']) && $responsibleAuth['reason'] !== '') {
            $responsibleStageLog['reason'] = $responsibleAuth['reason'];
        }
        if (!empty($responsibleAuth['passwordDetails']['matchedVariant'])) {
            $responsibleStageLog['matchedVariant'] = $responsibleAuth['passwordDetails']['matchedVariant'];
        }
        $authLogStages[] = $responsibleStageLog;

        if (is_array($responsibleCredentials)) {
            $passwordSource = !empty($responsibleCredentials['passwordHash'])
                ? 'hash'
                : 'plain';

            docs_log_auth_attempt('login_success', array_merge($authLogBase, [
                'stage' => 'responsible',
                'passwordSource' => $passwordSource,
                'stages' => $authLogStages,
            ]));
            docs_set_session_auth([
                'role' => 'user',
                'organization' => $requestedOrganization,
                'login' => $responsibleCredentials['login'] ?? $loginValue,
                'fullName' => $responsibleCredentials['fullName'] ?? '',
                'telegramId' => $responsibleCredentials['telegramId'] ?? '',
                'chatId' => $responsibleCredentials['chatId'] ?? '',
                'responsibleNumber' => $responsibleCredentials['responsibleNumber'] ?? '',
                'responsibleRole' => $responsibleCredentials['responsibleRole'] ?? '',
            ]);

            $sessionSummary = docs_get_active_session_summary($requestedOrganization);
            if ($sessionSummary === null) {
                $sessionSummary = docs_describe_session(docs_get_session_auth(), [
                    'accessible' => [$requestedOrganization],
                    'active' => $requestedOrganization,
                    'forceAccess' => false,
                ]);
                $sessionSummary['mode'] = 'session_user';
                $sessionSummary['requiresTelegramId'] = false;
            } else {
                $sessionSummary['mode'] = 'session_user';
                $sessionSummary['filterSource'] = 'session_user';
                $sessionSummary['forceAccess'] = $sessionSummary['forceAccess'] ?? false;
                $sessionSummary['requiresTelegramId'] = false;
            }

            $sessionAuth = docs_get_session_auth();
            $sessionSummary['permissions'] = docs_build_permissions_summary(
                $requestedOrganization,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null
            );

            docs_log_auth_attempt('login_response', array_merge($authLogBase, [
                'stage' => 'responsible',
                'session' => $sessionSummary,
                'responseDiagnostics' => docs_collect_login_response_diagnostics($sessionSummary, 'responsible'),
            ]));
            respond_success(['session' => $sessionSummary]);
        }

        docs_clear_session_auth();
        if (!is_array($responsibleCredentials) && isset($responsibleAuth['reason']) && $responsibleAuth['reason'] !== '') {
            $authFailureReason = 'responsible_' . $responsibleAuth['reason'];

            $stageFailureContext = array_merge($authLogBase, [
                'stage' => 'responsible',
                'reason' => $responsibleAuth['reason'],
            ]);

            if (!empty($responsibleAuth['matchedLogin'])) {
                $stageFailureContext['loginMatched'] = $responsibleAuth['matchedLogin'];
            }

            if (!empty($responsibleAuth['entryNumber'])) {
                $stageFailureContext['entryNumber'] = $responsibleAuth['entryNumber'];
            }

            if (!empty($responsibleAuth['passwordDetails'])) {
                $stageFailureContext['passwordDetails'] = $responsibleAuth['passwordDetails'];
            }

            docs_log_auth_attempt('login_stage_failed', $stageFailureContext);

            $authFailureDetails['responsible'] = array_filter([
                'reason' => $responsibleAuth['reason'],
                'loginMatched' => $responsibleAuth['matchedLogin'] ?? null,
                'entryNumber' => $responsibleAuth['entryNumber'] ?? null,
                'passwordDetails' => $responsibleAuth['passwordDetails'] ?? null,
            ], static function ($value) {
                if (is_array($value)) {
                    return !empty($value);
                }

                return $value !== null && $value !== '';
            });
        }

        $failureLogContext = array_merge($authLogBase, [
            'stages' => $authLogStages,
        ]);

        if ($authFailureReason !== null) {
            $failureLogContext['failureReason'] = $authFailureReason;
        }

        if (!empty($authFailureDetails)) {
            $failureLogContext['failureDetails'] = $authFailureDetails;
        }

        docs_log_auth_attempt('login_failed', $failureLogContext);
        respond_error('Неверный логин или пароль.', 401);
        break;

    case 'logout':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $sessionAuth = docs_get_session_auth();
        docs_clear_session_auth();

        $logContext = [];
        if (is_array($sessionAuth)) {
            $logContext = array_filter([
                'role' => $sessionAuth['role'] ?? null,
                'organization' => $sessionAuth['organization'] ?? null,
                'login' => $sessionAuth['login'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
            $logMessage = 'Documents session logout';
        } else {
            $logMessage = 'Documents logout requested without active session';
        }

        log_docs_event($logMessage, $logContext);

        respond_success(['message' => 'Сессия документооборота завершена.']);
        break;

    case 'session_info':
        $requestedOrganization = docs_normalize_organization_candidate((string) ($_GET['organization'] ?? ''));
        $sessionSummary = docs_get_active_session_summary($requestedOrganization !== '' ? $requestedOrganization : null);

        if ($sessionSummary !== null) {
            $requestContext = docs_build_request_user_context();
            $sessionAuth = docs_get_session_auth();
            $organizationForPermissions = $sessionSummary['organization'] ?? $requestedOrganization;
            $sessionSummary['permissions'] = docs_build_permissions_summary(
                $organizationForPermissions,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null
            );

            respond_success(['session' => $sessionSummary]);
        }

        $requestContext = docs_build_request_user_context();
        $requestUser = $requestContext['user'] ?? null;
        if (!is_array($requestUser)) {
            $requestUser = docs_get_request_user_info();
        } else {
            $requestUser = [
                'id' => (string) ($requestUser['id'] ?? ''),
                'username' => (string) ($requestUser['username'] ?? ''),
                'firstName' => (string) ($requestUser['firstName'] ?? ''),
                'lastName' => (string) ($requestUser['lastName'] ?? ''),
            ];
        }

        $primaryId = trim((string) ($requestContext['primaryId'] ?? ''));
        $requestUserId = '';
        if (is_array($requestUser)) {
            $requestUserId = trim((string) ($requestUser['id'] ?? ''));
        }

        $hasPrimaryId = $primaryId !== '';
        $hasRequestUserId = $requestUserId !== '';
        $hasUserIdentity = $hasPrimaryId || $hasRequestUserId;

        $mode = $requestUser !== null ? 'external_id' : 'guest';

        $sessionInfo = [
            'authenticated' => !$hasUserIdentity ? false : true,
            'mode' => $hasUserIdentity ? $mode : 'guest',
            'user' => $hasUserIdentity ? $requestUser : null,
            'forceAccess' => false,
            'initData' => '',
            'filterSource' => $requestContext['filterSource'] ?? null,
            'primaryId' => $hasPrimaryId ? $primaryId : null,
            'requiresTelegramId' => !$hasUserIdentity,
            'role' => 'guest',
        ];

        if (!$hasUserIdentity) {
            $sessionInfo['telegramIdMessage'] = 'Не удалось определить Telegram ID. Откройте мини-приложение из Telegram или войдите через сайт.';
        }

        docs_log_missing_telegram_user_id('session_info', $requestContext, [
            'sessionMode' => $mode,
            'requestUserPresent' => $requestUser !== null,
            'guestFallback' => !$hasUserIdentity,
        ]);

        $accessContext = docs_resolve_access_context($requestedOrganization !== '' ? $requestedOrganization : null, true);
        $sessionInfo['organizations'] = $accessContext['accessible'] ?? [];
        $sessionInfo['organization'] = $accessContext['active'] ?? null;
        $sessionInfo['accessGranted'] = !empty($sessionInfo['organizations']);

        if (!$hasUserIdentity) {
            $sessionInfo['organizations'] = [];
            $sessionInfo['organization'] = null;
            $sessionInfo['accessGranted'] = false;
        }

        $sessionRequestOverview = function_exists('bot_auth_get_request_overview')
            ? bot_auth_get_request_overview()
            : null;

        $sessionLogContext = [
            'mode' => $sessionInfo['mode'],
            'authenticated' => $sessionInfo['authenticated'],
            'user' => $requestUser,
            'organizations' => $sessionInfo['organizations'],
            'activeOrganization' => $sessionInfo['organization'],
            'accessGranted' => $sessionInfo['accessGranted'],
            'filterProvided' => docs_get_request_user_filter() !== null,
            'filterSource' => $requestContext['filterSource'] ?? null,
            'primaryId' => $hasPrimaryId ? $primaryId : null,
            'requiresTelegramId' => !$hasUserIdentity,
            'requestUserIdPresent' => $hasRequestUserId,
        ];

        if (is_array($sessionRequestOverview)) {
            $sessionLogContext['requestFingerprint'] = $sessionRequestOverview['fingerprint'] ?? null;
            $sessionLogContext['requestInitData'] = $sessionRequestOverview['initData'] ?? [];
        }

        log_docs_event('Session info prepared', $sessionLogContext);

        $sessionOrganization = is_string($sessionInfo['organization'] ?? null)
            ? $sessionInfo['organization']
            : ($requestedOrganization !== '' ? $requestedOrganization : null);
        $sessionInfo['permissions'] = docs_build_permissions_summary(
            $sessionOrganization,
            $requestContext,
            docs_get_session_auth()
        );

        respond_success(['session' => $sessionInfo]);
        break;

    case 'organizations':
        $requestContext = docs_build_request_user_context();
        docs_log_missing_telegram_user_id('organizations', $requestContext);

        $organizations = load_organizations();
        log_docs_event('Organizations resolved', [
            'count' => count($organizations),
            'sample' => array_slice($organizations, 0, 10),
            'documentsRootExists' => is_dir(DOCUMENTS_ROOT),
            'documentsRoot' => DOCUMENTS_ROOT,
        ]);
        respond_success(['organizations' => $organizations]);
        break;

    case 'mini_app_upload_pdf':
        docs_handle_mini_app_upload_pdf($method);
        break;

    case 'mini_app_user_journal':
        docs_handle_mini_app_user_journal($method);
        break;

    case 'mini_app_log':
        docs_handle_mini_app_client_log($method);
        break;
    case 'mini_app_entry_log':
        docs_handle_mini_app_entry_log($method);
        break;

    case 'mini_app_pdf_log':
        docs_handle_mini_app_pdf_log($method);
        break;

    case 'mini_app_doc_load_log':
        docs_handle_mini_app_doc_load_log($method);
        break;

    case 'mini_app_tasks':
        $requestContext = docs_build_request_user_context();
        $sessionAuth = docs_get_session_auth();
        $telegramInitDataContext = [];
        if (isset($requestContext['telegramInitData']) && is_array($requestContext['telegramInitData'])) {
            $telegramInitDataContext = $requestContext['telegramInitData'];
        }

        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $clientPlatform = docs_detect_client_platform($userAgent);
        $isIosClient = $clientPlatform === 'ios';
        $iosDebugSteps = [];
        $debugTelegramIdCandidate = '';
        if (!empty($requestContext['primaryId'])) {
            $debugTelegramIdCandidate = (string) $requestContext['primaryId'];
        } elseif (isset($requestContext['raw']['telegram_user_id']) && $requestContext['raw']['telegram_user_id'] !== '') {
            $debugTelegramIdCandidate = (string) $requestContext['raw']['telegram_user_id'];
        }

        if ($isIosClient) {
            $iosDebugSteps[] = array_filter([
                'stage' => 'request_context',
                'platform' => $clientPlatform,
                'filterSource' => $requestContext['filterSource'] ?? null,
                'primaryIdPresent' => !empty($requestContext['primaryId']),
                'rawTelegramUserId' => isset($requestContext['raw']['telegram_user_id'])
                    ? (string) $requestContext['raw']['telegram_user_id']
                    : null,
                'identityProvided' => !empty($requestContext['identity']),
                'userPresent' => isset($requestContext['user']) && is_array($requestContext['user']),
                'telegramInitData' => array_filter([
                    'present' => !empty($telegramInitDataContext['present']),
                    'valid' => !empty($telegramInitDataContext['valid']),
                    'error' => $telegramInitDataContext['error'] ?? null,
                    'sourceType' => $telegramInitDataContext['sourceType'] ?? null,
                    'authDate' => isset($telegramInitDataContext['authDate'])
                        ? (int) $telegramInitDataContext['authDate']
                        : null,
                ], static function ($value) {
                    return $value !== null && $value !== '' && $value !== false;
                }),
            ], static function ($value) {
                return $value !== null && $value !== '' && $value !== false;
            });
        }

        if (!empty($telegramInitDataContext['present']) && empty($telegramInitDataContext['valid'])) {
            $errorCode = isset($telegramInitDataContext['error']) ? (string) $telegramInitDataContext['error'] : 'invalid';
            $status = 401;
            $message = 'Не удалось подтвердить данные Telegram. Откройте мини-приложение заново из чата с ботом.';
            $extra = [
                'telegramInitDataError' => $errorCode,
                'telegramInitDataPresent' => true,
                'requiresTelegramReauth' => true,
            ];

            if ($errorCode === 'expired') {
                $message = 'Данные Telegram устарели. Откройте мини-приложение заново из чата с ботом.';
            } elseif ($errorCode === 'missing_token') {
                $message = 'Мини-приложение не настроено: отсутствует токен Telegram-бота.';
                $status = 500;
                $extra['requiresTelegramReauth'] = false;
                $extra['requiresConfiguration'] = true;
            } elseif ($errorCode === 'invalid_auth_date') {
                $message = 'Дата авторизации Telegram некорректна. Откройте мини-приложение заново из Telegram.';
            }

            respond_error($message, $status, $extra);
        }

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $payload = [];
        if (strtoupper($method) === 'POST') {
            $payload = load_json_payload();
            if (empty($payload) && !empty($_POST) && is_array($_POST)) {
                $payload = $_POST;
            }
        }

        $queryKeysForLog = array_values(array_unique(array_map('strval', array_keys($_GET ?? []))));
        $payloadKeysForLog = array_values(array_unique(array_map('strval', array_keys(is_array($payload) ? $payload : []))));

        docs_log_missing_telegram_user_id('mini_app_tasks', $requestContext, [
            'queryKeys' => $queryKeysForLog,
            'payloadKeys' => $payloadKeysForLog,
        ]);

        if ($isIosClient) {
            $iosDebugSteps[] = array_filter([
                'stage' => 'request_payload',
                'queryKeys' => $queryKeysForLog,
                'payloadKeys' => $payloadKeysForLog,
            ], static function ($value) {
                if (is_array($value)) {
                    return !empty($value);
                }

                return $value !== null && $value !== '';
            });
        }

        $filter = $requestContext['filter'] ?? null;

        $mergeFilter = static function (?array $base, ?array $extra): ?array {
            if ($extra === null || empty($extra)) {
                return empty($base) ? null : $base;
            }

            if ($base === null) {
                $base = [];
            }

            $result = $base;

            if (isset($extra['ids']) && is_array($extra['ids'])) {
                $resultIds = [];
                if (isset($result['ids']) && is_array($result['ids'])) {
                    foreach ($result['ids'] as $existing) {
                        $normalized = normalize_identifier_value($existing);
                        if ($normalized !== '') {
                            $resultIds[$normalized] = true;
                        }
                    }
                }
                foreach ($extra['ids'] as $candidate) {
                    $normalized = normalize_identifier_value($candidate);
                    if ($normalized === '') {
                        continue;
                    }
                    $resultIds[$normalized] = true;
                }
                if (!empty($resultIds)) {
                    $result['ids'] = array_values(array_keys($resultIds));
                } else {
                    unset($result['ids']);
                }
            }

            if (!empty($extra['username']) && (empty($result['username']) || !is_string($result['username']))) {
                $result['username'] = $extra['username'];
            }

            if (isset($result['username'])) {
                $normalizedUsername = normalize_username_value($result['username']);
                if ($normalizedUsername === '') {
                    unset($result['username']);
                } else {
                    $result['username'] = $normalizedUsername;
                }
            }

            if (!empty($extra['nameTokens']) && is_array($extra['nameTokens'])
                && (empty($result['nameTokens']) || !is_array($result['nameTokens']))) {
                $tokens = array_values(array_unique(array_filter(array_map(static function ($token) {
                    if ($token === null) {
                        return '';
                    }

                    $string = trim((string) $token);
                    if ($string === '') {
                        return '';
                    }

                    return mb_strtolower($string, 'UTF-8');
                }, $extra['nameTokens']))));

                if (!empty($tokens)) {
                    $result['nameTokens'] = $tokens;
                }
            }

            if (isset($result['ids']) && is_array($result['ids'])) {
                $result['ids'] = array_values(array_filter(array_map(static function ($value) {
                    $normalized = normalize_identifier_value($value);

                    return $normalized !== '' ? $normalized : null;
                }, $result['ids'])));
                if (empty($result['ids'])) {
                    unset($result['ids']);
                }
            }

            if (isset($result['nameTokens']) && is_array($result['nameTokens'])) {
                $result['nameTokens'] = array_values(array_unique(array_filter($result['nameTokens'], static function ($token) {
                    return $token !== null && $token !== '';
                })));
                if (empty($result['nameTokens'])) {
                    unset($result['nameTokens']);
                }
            }

            return empty($result) ? null : $result;
        };

        $sources = [];
        if (!empty($_GET) && is_array($_GET)) {
            $sources[] = $_GET;
        }
        if (!empty($_POST) && is_array($_POST)) {
            $sources[] = $_POST;
        }
        if (is_array($payload) && !empty($payload)) {
            $sources[] = $payload;
        }
        if (isset($requestContext['raw']) && is_array($requestContext['raw']) && !empty($requestContext['raw'])) {
            $sources[] = $requestContext['raw'];
        }

        foreach ($sources as $source) {
            $candidate = extract_assignee_filter_from_array($source);
            $filter = $mergeFilter($filter, $candidate);
        }

        if ($isIosClient) {
            $iosDebugSteps[] = [
                'stage' => 'filter_resolved',
                'filter' => summarize_assignee_filter_for_log($filter),
                'sourcesAnalyzed' => count($sources),
            ];
        }

        $filterIds = [];
        if (is_array($filter) && isset($filter['ids']) && is_array($filter['ids'])) {
            $filterIds = array_values(array_filter(array_map(static function ($value) {
                $normalized = normalize_identifier_value($value);

                return $normalized !== '' ? $normalized : null;
            }, $filter['ids'])));
        }

        if ($filter === null || empty($filterIds)) {
            if ($isIosClient) {
                $iosDebugSteps[] = [
                    'stage' => 'filter_missing',
                    'idsPresent' => !empty($filterIds),
                ];
                log_docs_event('Mini app tasks (iOS) debug summary', array_filter([
                    'userAgent' => $userAgent !== '' ? $userAgent : null,
                    'platform' => $clientPlatform,
                    'telegramUserId' => $debugTelegramIdCandidate !== '' ? $debugTelegramIdCandidate : null,
                    'steps' => $iosDebugSteps,
                ], static function ($value) {
                    return $value !== null && $value !== [];
                }));
            }
            respond_error('Не удалось определить Telegram ID. Откройте мини-приложение из Telegram.', 400, [
                'requiresTelegramId' => true,
            ]);
        }

        $filter['ids'] = $filterIds;
        $shouldTraceMiniAppUser = docs_should_trace_mini_app_user($filter);
        if ($shouldTraceMiniAppUser) {
            docs_write_mini_app_debug_log('Mini app filter resolved', [
                'filter' => summarize_assignee_filter_for_log($filter),
                'queryKeys' => $queryKeysForLog,
                'payloadKeys' => $payloadKeysForLog,
            ]);
        }

        $accessContext = docs_resolve_access_context(null, true);
        $organizations = $accessContext['accessible'] ?? [];
        if (empty($organizations)) {
            $organizations = load_organizations();
        }

        $organizations = array_values(array_unique(array_filter($organizations, static function ($value) {
            return is_string($value) && $value !== '';
        })));

        $tasks = [];
        $organizationSummaries = [];
        $totalOrganizations = count($organizations);
        $resolveTimestamp = static function ($value): ?int {
            if ($value === null) {
                return null;
            }

            $string = trim((string) $value);
            if ($string === '') {
                return null;
            }

            $timestamp = @strtotime($string);

            return $timestamp !== false ? $timestamp : null;
        };

        $visitLogged = false;
        $directorModeActive = false;
        $directorOrganizations = [];
        $directorModeReasons = [];

        foreach ($organizations as $organization) {
            $folder = sanitize_folder_name($organization);
            $records = load_registry($folder);
            $settings = load_admin_settings($folder);
            $responsibles = isset($settings['responsibles']) && is_array($settings['responsibles'])
                ? $settings['responsibles']
                : [];
            $subordinatesRaw = isset($settings['block3']) && is_array($settings['block3'])
                ? array_values($settings['block3'])
                : [];
            $subordinateDirectory = docs_build_subordinate_directory($subordinatesRaw, $responsibles);
            $directors = isset($settings['block2']) && is_array($settings['block2'])
                ? $settings['block2']
                : [];
            $prepared = docs_prepare_records_for_response($records, $organization, $folder);
            $responsiblesWithCounts = docs_enrich_responsibles_with_counts(
                $responsibles,
                is_array($prepared) ? $prepared : []
            );
            $canManageOrganizationInstructions = docs_user_can_manage_instructions(
                $organization,
                $requestContext,
                is_array($sessionAuth) ? $sessionAuth : null,
                $directors
            );
            $directorReasonsForOrganization = [];
            if ($canManageOrganizationInstructions) {
                $directorReasonsForOrganization[] = 'can_manage_instructions';
            }
            if (!empty($directors) && docs_user_is_block2_member($directors, $requestContext)) {
                $directorReasonsForOrganization[] = 'block2';
            }

            $isDirectorForOrganization = !empty($directorReasonsForOrganization);
            $effectiveFilter = $filter;
            if ($isDirectorForOrganization) {
                $filteredRecords = [];
                if (is_array($prepared)) {
                    foreach ($prepared as $record) {
                        if (is_array($record)) {
                            $filteredRecords[] = $record;
                        }
                    }
                }
            } else {
                if ($shouldTraceMiniAppUser && is_array($prepared)) {
                    foreach ($prepared as $record) {
                        if (is_array($record)) {
                            docs_trace_mini_app_task_visibility(
                                $record,
                                $effectiveFilter,
                                $responsiblesWithCounts,
                                $organization,
                                $folder,
                                'prepared'
                            );
                        }
                    }
                }
                $filteredRecords = filter_documents_for_assignee($prepared, $effectiveFilter, $responsiblesWithCounts);
            }

            if ($isDirectorForOrganization) {
                $directorModeActive = true;
                $directorOrganizations[] = $organization;
                foreach ($directorReasonsForOrganization as $reason) {
                    $directorModeReasons[$reason] = true;
                }
            }

            if ($isIosClient) {
                $iosDebugSteps[] = [
                    'stage' => 'organization_processed',
                    'organization' => $organization,
                    'recordsCount' => is_array($records) ? count($records) : 0,
                    'preparedCount' => is_array($prepared) ? count($prepared) : 0,
                    'matchedCount' => is_array($filteredRecords) ? count($filteredRecords) : 0,
                    'responsiblesCount' => is_array($responsibles) ? count($responsibles) : 0,
                    'directorsCount' => is_array($directors) ? count($directors) : 0,
                    'directorMode' => $isDirectorForOrganization,
                    'filterBypassed' => $isDirectorForOrganization,
                ];
            }

            $matchedCount = is_array($filteredRecords) ? count($filteredRecords) : 0;
            if ($shouldTraceMiniAppUser && is_array($filteredRecords)) {
                $foundTrace = false;
                foreach ($filteredRecords as $record) {
                    if (!is_array($record)) {
                        continue;
                    }
                    docs_trace_mini_app_task_visibility(
                        $record,
                        $effectiveFilter,
                        $responsiblesWithCounts,
                        $organization,
                        $folder,
                        'filtered'
                    );
                    if (isset($record['id']) && (string) $record['id'] === 'doc_a012f5b66c5d0a3f') {
                        $foundTrace = true;
                    }
                }
                if (!$foundTrace) {
                    docs_write_mini_app_debug_log('Mini app task visibility trace', [
                        'stage' => 'filtered_missing',
                        'organization' => $organization,
                        'folder' => $folder,
                        'recordId' => 'doc_a012f5b66c5d0a3f',
                        'filter' => summarize_assignee_filter_for_log($effectiveFilter),
                    ]);
                }
            }

            $organizationSummaries[] = [
                'name' => $organization,
                'count' => $matchedCount,
                'responsibles' => $responsiblesWithCounts,
                'subordinates' => $subordinateDirectory,
                'directors' => $directors,
                'canManageInstructions' => $canManageOrganizationInstructions,
            ];

            if (empty($matchedCount)) {
                continue;
            }

            docs_register_mini_app_user_visit($organization, $folder, $requestContext);
            $visitLogged = true;

            foreach ($filteredRecords as $record) {
                if (!is_array($record)) {
                    continue;
                }

                if (!isset($record['organization']) || $record['organization'] === '') {
                    $record['organization'] = $organization;
                }

                $tasks[] = $record;
            }
        }

        if (!$visitLogged) {
            $fallbackOrganization = null;
            if (isset($accessContext['active']) && is_string($accessContext['active']) && $accessContext['active'] !== '') {
                $fallbackOrganization = $accessContext['active'];
            } elseif (!empty($organizations)) {
                $fallbackOrganization = $organizations[0];
            }

            if (is_string($fallbackOrganization) && $fallbackOrganization !== '') {
                $fallbackFolder = sanitize_folder_name($fallbackOrganization);
                docs_register_mini_app_user_visit($fallbackOrganization, $fallbackFolder, $requestContext);
            }
        }

        if (!empty($tasks)) {
            usort($tasks, static function (array $a, array $b) use ($resolveTimestamp): int {
                $regA = $resolveTimestamp($a['registrationDate'] ?? null);
                $regB = $resolveTimestamp($b['registrationDate'] ?? null);
                if ($regA !== null && $regB !== null && $regA !== $regB) {
                    return $regB <=> $regA;
                }
                if ($regA !== null && $regB === null) {
                    return -1;
                }
                if ($regA === null && $regB !== null) {
                    return 1;
                }

                $dueA = $resolveTimestamp($a['dueDate'] ?? null);
                $dueB = $resolveTimestamp($b['dueDate'] ?? null);
                if ($dueA !== null && $dueB !== null && $dueA !== $dueB) {
                    return $dueA <=> $dueB;
                }
                if ($dueA !== null && $dueB === null) {
                    return -1;
                }
                if ($dueA === null && $dueB !== null) {
                    return 1;
                }

                $entryA = isset($a['entryNumber']) ? (int) $a['entryNumber'] : 0;
                $entryB = isset($b['entryNumber']) ? (int) $b['entryNumber'] : 0;
                if ($entryA !== $entryB) {
                    return $entryA <=> $entryB;
                }

                return strcmp((string) ($a['id'] ?? ''), (string) ($b['id'] ?? ''));
            });
        }

        $todayTimestamp = $resolveTimestamp(date('Y-m-d')) ?? time();
        $stats = [
            'total' => count($tasks),
            'completed' => 0,
            'overdue' => 0,
            'active' => 0,
            'statuses' => docs_init_status_counters(),
        ];

        $directorOrganizations = array_values(array_unique(array_filter($directorOrganizations, static function ($value) {
            return is_string($value) && $value !== '';
        })));
        $directorModeSummary = [
            'active' => $directorModeActive,
            'allTasks' => $directorModeActive,
        ];
        if (!empty($directorOrganizations)) {
            $directorModeSummary['organizations'] = $directorOrganizations;
        }
        if (!empty($directorModeReasons)) {
            $directorModeSummary['reasons'] = array_values(array_keys($directorModeReasons));
        }

        foreach ($tasks as $record) {
            $rawStatus = isset($record['status']) ? (string) $record['status'] : '';
            $statusLower = mb_strtolower($rawStatus, 'UTF-8');
            $statusKey = docs_status_key_from_status($rawStatus);
            if ($statusKey !== null && array_key_exists($statusKey, $stats['statuses'])) {
                $stats['statuses'][$statusKey]++;
            }

            $isDone = $statusKey === 'done'
                || ($statusKey === null && $statusLower !== '' && mb_stripos($statusLower, 'выполн') !== false);

            if ($isDone) {
                $stats['completed']++;
                continue;
            }

            if ($statusKey === 'cancelled') {
                continue;
            }

            $stats['active']++;
            $dueTimestamp = $resolveTimestamp($record['dueDate'] ?? null);
            if ($dueTimestamp !== null && $dueTimestamp < $todayTimestamp) {
                $stats['overdue']++;
            }
        }

        if ($isIosClient) {
            $iosDebugSteps[] = [
                'stage' => 'stats_computed',
                'tasksCount' => count($tasks),
                'stats' => $stats,
                'organizationsSummary' => $organizationSummaries,
            ];
        }

        $telegramUserId = '';
        if (isset($filter['ids']) && is_array($filter['ids']) && !empty($filter['ids'])) {
            $telegramUserId = (string) $filter['ids'][0];
        } elseif (!empty($requestContext['primaryId'])) {
            $telegramUserId = (string) $requestContext['primaryId'];
        }

        if ($debugTelegramIdCandidate === '' && $telegramUserId !== '') {
            $debugTelegramIdCandidate = $telegramUserId;
        }

        $userInfo = null;
        if (isset($requestContext['user']) && is_array($requestContext['user']) && !empty($requestContext['user'])) {
            $userInfo = array_filter([
                'id' => isset($requestContext['user']['id']) && $requestContext['user']['id'] !== ''
                    ? (string) $requestContext['user']['id']
                    : ($telegramUserId !== '' ? $telegramUserId : null),
                'username' => $requestContext['user']['username'] ?? null,
                'firstName' => $requestContext['user']['firstName'] ?? null,
                'lastName' => $requestContext['user']['lastName'] ?? null,
                'fullName' => $requestContext['user']['fullName'] ?? null,
            ], static function ($value) {
                return $value !== null && $value !== '';
            });
        } elseif ($telegramUserId !== '') {
            $userInfo = ['id' => $telegramUserId];
        }

        $telegramInitDataSummary = [
            'present' => !empty($telegramInitDataContext['present']),
            'valid' => !empty($telegramInitDataContext['valid']),
        ];

        if (!empty($telegramInitDataContext['error'])) {
            $telegramInitDataSummary['error'] = (string) $telegramInitDataContext['error'];
        }

        if (isset($telegramInitDataContext['authDate']) && $telegramInitDataContext['authDate'] !== null) {
            $telegramInitDataSummary['authDate'] = (int) $telegramInitDataContext['authDate'];
        }

        if (!empty($telegramInitDataContext['present']) && !empty($telegramInitDataContext['sourceType'])) {
            $telegramInitDataSummary['source'] = (string) $telegramInitDataContext['sourceType'];
        }

        if ($isIosClient) {
            log_docs_event('Mini app tasks (iOS) debug summary', array_filter([
                'userAgent' => $userAgent !== '' ? $userAgent : null,
                'platform' => $clientPlatform,
                'telegramUserId' => $debugTelegramIdCandidate !== '' ? $debugTelegramIdCandidate : null,
                'steps' => $iosDebugSteps,
            ], static function ($value) {
                return $value !== null && $value !== [];
            }));
        }

        $globalPermission = false;
        $sessionAuthArray = is_array($sessionAuth) ? $sessionAuth : null;
        $canManageSubordinates = docs_user_can_manage_subordinates($sessionAuthArray);
        $sessionRole = is_array($sessionAuth) ? strtolower((string) ($sessionAuth['role'] ?? '')) : '';
        if ($sessionRole === 'admin') {
            $globalPermission = true;
        } else {
            foreach ($organizationSummaries as $summary) {
                if (!empty($summary['canManageInstructions'])) {
                    $globalPermission = true;
                    break;
                }
            }
        }

        respond_success([
            'tasks' => array_values($tasks),
            'organizations' => $organizationSummaries,
            'total' => count($tasks),
            'stats' => $stats,
            'generatedAt' => date('c'),
            'telegramUserId' => $telegramUserId !== '' ? $telegramUserId : null,
            'user' => $userInfo,
            'filterSource' => $requestContext['filterSource'] ?? null,
            'organizationsChecked' => $totalOrganizations,
            'telegramInitData' => $telegramInitDataSummary,
            'canManageInstructions' => $globalPermission,
            'canManageSubordinates' => $canManageSubordinates,
            'permissions' => [
                'canManageInstructions' => $globalPermission,
                'canCreateDocuments' => false,
                'canManageSubordinates' => $canManageSubordinates,
                'canDeleteDocuments' => false,
            ],
            'directorMode' => $directorModeSummary,
        ]);
        break;

    case 'mini_app_update_task':
        $requestContext = docs_build_request_user_context();
        docs_log_missing_telegram_user_id('mini_app_update_task', $requestContext);

        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $requestStartedAt = microtime(true);

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload)) {
            $payload = [];
        }

        $organizationCandidate = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        if ($organizationCandidate === '') {
            respond_error('Не указана организация.');
        }

        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор задачи.');
        }

        $updateType = strtolower(sanitize_text_field((string) ($payload['updateType'] ?? ''), 40));
        if ($updateType === '') {
            respond_error('Не указан тип обновления.');
        }

        $clientRequestId = sanitize_text_field((string) ($payload['clientRequestId'] ?? ''), 120);

        docs_log_file_debug('Mini app update task request', [
            'clientRequestId' => $clientRequestId !== '' ? $clientRequestId : null,
            'updateType' => $updateType,
            'organization' => $organizationCandidate,
            'documentId' => $documentId,
            'payloadKeys' => array_values(array_unique(array_map('strval', array_keys($payload)))),
            'assigneeEntriesCount' => isset($payload['assignees']) && is_array($payload['assignees'])
                ? count($payload['assignees'])
                : null,
            'assigneeIdsCount' => isset($payload['assigneeIds']) && is_array($payload['assigneeIds'])
                ? count($payload['assigneeIds'])
                : null,
            'subordinateEntriesCount' => isset($payload['subordinates']) && is_array($payload['subordinates'])
                ? count($payload['subordinates'])
                : null,
            'subordinateIdsCount' => isset($payload['subordinateIds']) && is_array($payload['subordinateIds'])
                ? count($payload['subordinateIds'])
                : null,
            'requestUserId' => $requestContext['primaryId'] ?? null,
            'filterSource' => $requestContext['filterSource'] ?? null,
        ]);

        if ($updateType === 'view') {
            $trigger = isset($payload['trigger'])
                ? sanitize_text_field((string) $payload['trigger'], 120)
                : '';
            $viewedAtCandidate = isset($payload['viewedAt']) ? (string) $payload['viewedAt'] : '';
            $viewedAtNormalized = $viewedAtCandidate !== ''
                ? docs_normalize_datetime_iso($viewedAtCandidate)
                : null;

            $details = [];
            if ($trigger !== '') {
                $details['trigger'] = $trigger;
            }
            if ($viewedAtNormalized !== null) {
                $details['viewedAt'] = $viewedAtNormalized;
            }

            $registrationResult = docs_register_task_view_event($organizationCandidate, $documentId, $requestContext, $details);
            $recorded = !empty($registrationResult['recorded']);
            $alreadyRecorded = !empty($registrationResult['alreadyRecorded']);

            if (!$recorded && !$alreadyRecorded) {
                respond_error('Не удалось зафиксировать просмотр.', 403);
            }

            $response = [
                'recorded' => $recorded,
                'alreadyRecorded' => $alreadyRecorded,
            ];
            if (isset($registrationResult['viewedAt'])) {
                $response['viewedAt'] = $registrationResult['viewedAt'];
            }
            if (isset($registrationResult['assigneeKey'])) {
                $response['assigneeKey'] = $registrationResult['assigneeKey'];
            }
            if (isset($registrationResult['id'])) {
                $response['id'] = $registrationResult['id'];
            }
            if (isset($registrationResult['name'])) {
                $response['name'] = $registrationResult['name'];
            }

            respond_success($response);
        }

        $folder = sanitize_folder_name($organizationCandidate);
        [$registryHandle, $records] = docs_lock_registry($folder);
        if ($registryHandle === null) {
            $records = load_registry($folder);
        }
        docs_log_file_debug('Mini app update task registry loaded', [
            'clientRequestId' => $clientRequestId !== '' ? $clientRequestId : null,
            'organization' => $organizationCandidate,
            'recordsCount' => is_array($records) ? count($records) : null,
            'durationMs' => (int) round((microtime(true) - $requestStartedAt) * 1000),
        ]);
        $recordIndex = null;
        foreach ($records as $index => $record) {
            if (!is_array($record) || !isset($record['id'])) {
                continue;
            }
            if ((string) $record['id'] === $documentId) {
                $recordIndex = $index;
                break;
            }
        }

        if ($recordIndex === null) {
            respond_error('Документ не найден.', 404);
        }

        $originalDirector = null;
        $originalDirectors = null;
        if (isset($records[$recordIndex]['director']) && is_array($records[$recordIndex]['director'])) {
            $originalDirector = $records[$recordIndex]['director'];
        }
        if (isset($records[$recordIndex]['directors']) && is_array($records[$recordIndex]['directors'])) {
            $originalDirectors = $records[$recordIndex]['directors'];
        }

        $settings = load_admin_settings($folder);
        $responsibles = isset($settings['responsibles']) && is_array($settings['responsibles'])
            ? $settings['responsibles']
            : [];
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
        $subordinatesRaw = isset($settings['block3']) && is_array($settings['block3'])
            ? $settings['block3']
            : [];
        $subordinates = docs_build_subordinate_directory($subordinatesRaw, $responsibles);

        docs_log_file_debug('Mini app update task settings loaded', [
            'clientRequestId' => $clientRequestId !== '' ? $clientRequestId : null,
            'organization' => $organizationCandidate,
            'responsiblesCount' => count($responsibles),
            'directorsCount' => count($block2),
            'subordinatesCount' => count($subordinates),
            'durationMs' => (int) round((microtime(true) - $requestStartedAt) * 1000),
        ]);

        $message = 'Данные обновлены.';
        $assignedAssignees = [];

        $isDirector = docs_user_is_block2_member($block2, $requestContext);
        $isTaskAssignee = docs_request_matches_record_assignee($records[$recordIndex], $requestContext);
        $isTaskSubordinate = docs_request_matches_record_subordinate($records[$recordIndex], $requestContext);
        $canManageAssignments = $isDirector || $isTaskAssignee || $isTaskSubordinate;
        $canManageSubordinates = $isDirector || $isTaskAssignee || $isTaskSubordinate;
        $assignmentAuthorRole = docs_resolve_assignment_author_role_from_context($isDirector, $isTaskAssignee, $isTaskSubordinate);
        $assignmentAuthor = docs_build_assignment_author_label($requestContext['user'] ?? null);
        $assignmentAuthorMeta = docs_extract_assignment_author_meta($requestContext['user'] ?? null);
        $kruglikTraceEnabled = ((string) ($records[$recordIndex]['id'] ?? '') === 'doc_25c118e109b59dd4')
            || ((string) ($records[$recordIndex]['registryNumber'] ?? '') === '907');

        if ($kruglikTraceEnabled) {
            docs_write_kruglik_log('mini_app_update_task permissions', [
                'updateType' => $updateType,
                'organization' => $organizationCandidate,
                'documentId' => $documentId,
                'requestUser' => $requestContext['user'] ?? null,
                'requestPrimaryId' => $requestContext['primaryId'] ?? null,
                'requestFilterSource' => $requestContext['filterSource'] ?? null,
                'isDirector' => $isDirector,
                'isTaskAssignee' => $isTaskAssignee,
                'isTaskSubordinate' => $isTaskSubordinate,
                'canManageAssignments' => $canManageAssignments,
                'canManageSubordinates' => $canManageSubordinates,
                'currentAssignees' => docs_extract_assignees($records[$recordIndex]),
                'currentSubordinates' => $records[$recordIndex]['subordinates'] ?? null,
            ]);
        }

        if ($updateType === 'assign') {
            if (!$isDirector) {
                respond_error('Недостаточно прав для назначения ответственного.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $rawCandidates = [];
            if (isset($payload['assigneeIds']) && is_array($payload['assigneeIds'])) {
                foreach ($payload['assigneeIds'] as $candidate) {
                    if (is_scalar($candidate)) {
                        $rawCandidates[] = (string) $candidate;
                    }
                }
            } else {
                $singleCandidate = $payload['assigneeId'] ?? '';
                if (is_scalar($singleCandidate)) {
                    $rawCandidates[] = (string) $singleCandidate;
                }
            }

            $sanitizedCandidates = [];
            foreach ($rawCandidates as $candidate) {
                $sanitized = sanitize_text_field($candidate, 200);
                if ($sanitized !== '') {
                    $sanitizedCandidates[] = $sanitized;
                }
            }

            if (empty($sanitizedCandidates)) {
                respond_error('Не выбраны ответственные.');
            }

            $assignees = [];
            $seenCandidates = [];
            foreach ($sanitizedCandidates as $candidate) {
                $normalizedCandidate = docs_normalize_identifier_candidate_value($candidate);
                if ($normalizedCandidate === '') {
                    continue;
                }
                if (isset($seenCandidates[$normalizedCandidate])) {
                    continue;
                }

                $matchedResponsible = docs_find_responsible_by_candidate($responsibles, $candidate);
                if ($matchedResponsible === null) {
                    $matchedResponsible = docs_find_subordinate_by_candidate($subordinates, $candidate);
                }
                if ($matchedResponsible === null) {
                    respond_error('Ответственный не найден в справочнике.', 404, [
                        'assigneeId' => $candidate,
                    ]);
                }

                $assignee = docs_build_assignee_from_responsible_entry($matchedResponsible, $candidate);
                if (empty($assignee)) {
                    respond_error('Не удалось подготовить данные ответственного.', 500);
                }

                $seenCandidates[$normalizedCandidate] = true;
                $assignees[] = $assignee;
            }

            if (empty($assignees)) {
                respond_error('Не выбраны ответственные.');
            }

            $previousAssigneesSnapshot = docs_extract_assignees($records[$recordIndex]);
            $newAssignments = [];
            $assignees = docs_assign_author_to_assignees($assignees, $assignmentAuthor, $assignmentAuthorRole, $assignmentAuthorMeta);
            docs_apply_assignees_to_record($records[$recordIndex], $assignees, $newAssignments);

            $updatedAssigneesSnapshot = docs_extract_assignees($records[$recordIndex]);
            $changedAssignments = docs_collect_changed_assignees($previousAssigneesSnapshot, $updatedAssigneesSnapshot);

            $assignedCount = count($assignees);
            $message = $assignedCount > 1 ? 'Ответственные назначены.' : 'Ответственный назначен.';
            $assignedAssignees = $changedAssignments;
        } elseif ($updateType === 'assign_add') {
            if (!$canManageAssignments) {
                respond_error('Недостаточно прав для назначения ответственного.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $candidateEntries = [];
            if (isset($payload['assignees']) && is_array($payload['assignees'])) {
                foreach ($payload['assignees'] as $entry) {
                    if (!is_array($entry)) {
                        continue;
                    }

                    $candidateValue = '';
                    if (isset($entry['id']) && is_scalar($entry['id'])) {
                        $candidateValue = (string) $entry['id'];
                    } elseif (isset($entry['assigneeId']) && is_scalar($entry['assigneeId'])) {
                        $candidateValue = (string) $entry['assigneeId'];
                    }

                    $sanitizedCandidate = sanitize_text_field($candidateValue, 200);
                    if ($sanitizedCandidate === '') {
                        continue;
                    }

                    $candidateEntries[] = [
                        'id' => $sanitizedCandidate,
                        'assignmentComment' => sanitize_assignment_comment(isset($entry['assignmentComment'])
                            ? (string) $entry['assignmentComment']
                            : ''),
                        'assignmentDueDate' => sanitize_date_field(isset($entry['assignmentDueDate'])
                            ? (string) $entry['assignmentDueDate']
                            : ''),
                        'assignmentInstruction' => sanitize_instruction(isset($entry['assignmentInstruction'])
                            ? (string) $entry['assignmentInstruction']
                            : ''),
                    ];
                }
            }

            if (empty($candidateEntries)) {
                $rawCandidates = [];
                if (isset($payload['assigneeIds']) && is_array($payload['assigneeIds'])) {
                    foreach ($payload['assigneeIds'] as $candidate) {
                        if (is_scalar($candidate)) {
                            $rawCandidates[] = (string) $candidate;
                        }
                    }
                } else {
                    $singleCandidate = $payload['assigneeId'] ?? '';
                    if (is_scalar($singleCandidate)) {
                        $rawCandidates[] = (string) $singleCandidate;
                    }
                }

                foreach ($rawCandidates as $candidate) {
                    $sanitized = sanitize_text_field($candidate, 200);
                    if ($sanitized !== '') {
                        $candidateEntries[] = [
                            'id' => $sanitized,
                            'assignmentComment' => '',
                            'assignmentDueDate' => '',
                            'assignmentInstruction' => '',
                        ];
                    }
                }
            }

            if (empty($candidateEntries)) {
                respond_error('Не выбраны ответственные.');
            }

            $existingAssignees = docs_extract_assignees($records[$recordIndex]);
            $previousAssigneesSnapshot = $existingAssignees;
            $responsibleEntries = [];
            $subordinateEntries = [];
            foreach ($existingAssignees as $existingAssignee) {
                if (!is_array($existingAssignee)) {
                    continue;
                }
                $roleValue = strtolower((string) ($existingAssignee['role'] ?? ''));
                if ($roleValue === 'subordinate') {
                    $subordinateEntries[] = $existingAssignee;
                } else {
                    $responsibleEntries[] = $existingAssignee;
                }
            }

            $existingIndex = [];
            $indexed = docs_index_assignees($responsibleEntries);
            foreach ($indexed as $key => $entry) {
                $normalizedKey = mb_strtolower((string) $key, 'UTF-8');
                if ($normalizedKey !== '') {
                    $existingIndex[$normalizedKey] = $entry;
                }
            }

            $newAssignments = [];
            $updatedEntries = [];
            $seenCandidates = [];

            foreach ($candidateEntries as $candidateEntry) {
                $candidate = $candidateEntry['id'] ?? '';
                $normalizedCandidate = docs_normalize_identifier_candidate_value($candidate);
                if ($normalizedCandidate === '') {
                    continue;
                }
                if (isset($seenCandidates[$normalizedCandidate])) {
                    continue;
                }

                $matchedResponsible = docs_find_responsible_by_candidate($responsibles, $candidate);
                if ($matchedResponsible === null) {
                    $matchedResponsible = docs_find_subordinate_by_candidate($subordinates, $candidate);
                }
                if ($matchedResponsible === null) {
                    respond_error('Ответственный не найден в справочнике.', 404, [
                        'assigneeId' => $candidate,
                    ]);
                }

                $assignment = docs_build_assignee_from_responsible_entry($matchedResponsible, $candidate);
                if (empty($assignment)) {
                    respond_error('Не удалось подготовить данные ответственного.', 500);
                }

                if (array_key_exists('assignmentComment', $candidateEntry)) {
                    $assignment['assignmentComment'] = $candidateEntry['assignmentComment'];
                }

                if (array_key_exists('assignmentDueDate', $candidateEntry)) {
                    $assignment['assignmentDueDate'] = $candidateEntry['assignmentDueDate'];
                }

                if (array_key_exists('assignmentInstruction', $candidateEntry)) {
                    $assignment['assignmentInstruction'] = $candidateEntry['assignmentInstruction'];
                }

                $seenCandidates[$normalizedCandidate] = true;

                $keys = docs_collect_assignee_index_keys($assignment);
                $matchedKey = null;
                foreach ($keys as $key) {
                    $normalizedKey = mb_strtolower($key, 'UTF-8');
                    if ($normalizedKey !== '' && isset($existingIndex[$normalizedKey])) {
                        $matchedKey = $normalizedKey;
                        break;
                    }
                }

                if ($matchedKey !== null) {
                    $existingEntry = $existingIndex[$matchedKey];

                    if (!isset($assignment['assignmentComment']) || $assignment['assignmentComment'] === '') {
                        if (isset($existingEntry['assignmentComment'])) {
                            unset($existingEntry['assignmentComment']);
                        }
                    } else {
                        $existingEntry['assignmentComment'] = $assignment['assignmentComment'];
                    }

                    if (!isset($assignment['assignmentDueDate']) || $assignment['assignmentDueDate'] === '') {
                        if (isset($existingEntry['assignmentDueDate'])) {
                            unset($existingEntry['assignmentDueDate']);
                        }
                    } else {
                        $existingEntry['assignmentDueDate'] = $assignment['assignmentDueDate'];
                    }

                    if (!isset($assignment['assignmentInstruction']) || $assignment['assignmentInstruction'] === '') {
                        if (isset($existingEntry['assignmentInstruction'])) {
                            unset($existingEntry['assignmentInstruction']);
                        }
                    } else {
                        $existingEntry['assignmentInstruction'] = $assignment['assignmentInstruction'];
                    }

                    $existingIndex[$matchedKey] = $existingEntry;

                    foreach ($responsibleEntries as &$responsibleEntry) {
                        $resKeys = docs_collect_assignee_index_keys($responsibleEntry);
                        $found = false;
                        foreach ($resKeys as $resKey) {
                            if (mb_strtolower($resKey, 'UTF-8') === $matchedKey) {
                                $responsibleEntry = $existingEntry;
                                $found = true;
                                break;
                            }
                        }
                        if ($found) {
                            break;
                        }
                    }
                    unset($responsibleEntry);

                    $updatedEntries[] = $existingEntry;
                    continue;
                }

                $assigned = docs_assign_author_to_assignees([$assignment], $assignmentAuthor, $assignmentAuthorRole, $assignmentAuthorMeta);
                $assignedEntry = $assigned[0] ?? [];
                if (empty($assignedEntry)) {
                    continue;
                }

                $responsibleEntries[] = $assignedEntry;
                $newAssignments[] = $assignedEntry;
                $updatedEntries[] = $assignedEntry;

                $assignedKeys = docs_collect_assignee_index_keys($assignedEntry);
                foreach ($assignedKeys as $key) {
                    $normalizedKey = mb_strtolower($key, 'UTF-8');
                    if ($normalizedKey !== '') {
                        $existingIndex[$normalizedKey] = $assignedEntry;
                    }
                }
            }

            if (empty($updatedEntries)) {
                respond_error('Ответственный уже назначен.');
            }

            $combinedAssignees = array_merge($responsibleEntries, $subordinateEntries);
            $newAssignmentsSnapshot = [];
            docs_apply_assignees_to_record($records[$recordIndex], $combinedAssignees, $newAssignmentsSnapshot);

            $updatedAssigneesSnapshot = docs_extract_assignees($records[$recordIndex]);
            $changedAssignments = docs_collect_changed_assignees($previousAssigneesSnapshot, $updatedAssigneesSnapshot);

            if (!empty($newAssignments)) {
                $message = count($newAssignments) > 1 ? 'Ответственные назначены.' : 'Ответственный назначен.';
            } else {
                $message = 'Данные ответственного обновлены.';
            }

            if (!empty($changedAssignments)) {
                $assignedAssignees = array_merge($assignedAssignees, $changedAssignments);
            }
        } elseif ($updateType === 'assign_remove') {
            if (!$isDirector && !$canManageAssignments) {
                respond_error('Недостаточно прав для изменения ответственных.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $rawCandidates = [];
            if (isset($payload['removeAssigneeIds']) && is_array($payload['removeAssigneeIds'])) {
                foreach ($payload['removeAssigneeIds'] as $candidate) {
                    if (is_scalar($candidate)) {
                        $rawCandidates[] = (string) $candidate;
                    }
                }
            } else {
                $singleCandidate = $payload['removeAssigneeId'] ?? '';
                if (is_scalar($singleCandidate)) {
                    $rawCandidates[] = (string) $singleCandidate;
                }
            }

            $removalKeys = [];
            foreach ($rawCandidates as $candidate) {
                $sanitized = sanitize_text_field($candidate, 200);
                if ($sanitized === '') {
                    continue;
                }
                $normalizedId = docs_normalize_identifier_candidate_value($sanitized);
                if ($normalizedId !== '') {
                    $removalKeys[] = 'id::' . $normalizedId;
                }
                $normalizedName = docs_normalize_name_candidate_value($sanitized);
                if ($normalizedName !== '') {
                    $removalKeys[] = 'name::' . $normalizedName;
                }
            }

            if (empty($removalKeys)) {
                respond_error('Не выбраны ответственные.');
            }

            $existingAssignees = docs_extract_assignees($records[$recordIndex]);
            $responsibleEntries = [];
            $subordinateEntries = [];
            foreach ($existingAssignees as $existingAssignee) {
                if (!is_array($existingAssignee)) {
                    continue;
                }
                $roleValue = strtolower((string) ($existingAssignee['role'] ?? ''));
                if ($roleValue === 'subordinate') {
                    $subordinateEntries[] = $existingAssignee;
                } else {
                    $responsibleEntries[] = $existingAssignee;
                }
            }

            $remainingResponsibles = [];
            $removedEntries = [];
            $blockedEntries = [];
            foreach ($responsibleEntries as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $keys = docs_collect_assignee_index_keys($entry);
                $shouldRemove = false;
                foreach ($keys as $key) {
                    $normalizedKey = mb_strtolower($key, 'UTF-8');
                    foreach ($removalKeys as $target) {
                        if ($normalizedKey === mb_strtolower($target, 'UTF-8')) {
                            $shouldRemove = true;
                            break 2;
                        }
                    }
                }
                if ($shouldRemove && !$isDirector && !docs_entry_assigned_by_user($entry, $requestContext)) {
                    $blockedEntries[] = $entry;
                    $remainingResponsibles[] = $entry;
                    continue;
                }
                if ($shouldRemove) {
                    $removedEntries[] = $entry;
                } else {
                    $remainingResponsibles[] = $entry;
                }
            }

            if (empty($removedEntries)) {
                if (!empty($blockedEntries)) {
                    respond_error('Можно удалить только ответственных, которых назначили вы.', 403, [
                        'requiresAuthor' => true,
                    ]);
                }
                respond_error('Ответственный не найден среди назначенных.', 404);
            }

            $combinedAssignees = array_merge($remainingResponsibles, $subordinateEntries);
            $newAssignments = [];
            docs_apply_assignees_to_record($records[$recordIndex], $combinedAssignees, $newAssignments);

            $removedCount = count($removedEntries);
            $message = $removedCount > 1 ? 'Ответственные удалены.' : 'Ответственный удалён.';
        } elseif ($updateType === 'subordinates') {
            if (!$isDirector) {
                if ($kruglikTraceEnabled) {
                    docs_write_kruglik_log('subordinates denied: requires director', [
                        'organization' => $organizationCandidate,
                        'documentId' => $documentId,
                        'requestPrimaryId' => $requestContext['primaryId'] ?? null,
                    ]);
                }
                respond_error('Недостаточно прав для назначения подчинённых.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $candidateEntries = [];
            if (isset($payload['subordinates']) && is_array($payload['subordinates'])) {
                foreach ($payload['subordinates'] as $entry) {
                    if (!is_array($entry)) {
                        continue;
                    }

                    $candidateValue = '';
                    if (isset($entry['id']) && is_scalar($entry['id'])) {
                        $candidateValue = (string) $entry['id'];
                    } elseif (isset($entry['subordinateId']) && is_scalar($entry['subordinateId'])) {
                        $candidateValue = (string) $entry['subordinateId'];
                    } elseif (isset($entry['subordinate']) && is_scalar($entry['subordinate'])) {
                        $candidateValue = (string) $entry['subordinate'];
                    }

                    $sanitizedCandidate = sanitize_text_field($candidateValue, 200);
                    if ($sanitizedCandidate === '') {
                        continue;
                    }

                    $candidateEntries[] = [
                        'id' => $sanitizedCandidate,
                        'assignmentComment' => sanitize_assignment_comment(isset($entry['assignmentComment'])
                            ? (string) $entry['assignmentComment']
                            : ''),
                        'assignmentDueDate' => sanitize_date_field(isset($entry['assignmentDueDate'])
                            ? (string) $entry['assignmentDueDate']
                            : ''),
                    ];
                }
            }

            if (empty($candidateEntries)) {
                $rawCandidates = [];
                if (isset($payload['subordinateIds']) && is_array($payload['subordinateIds'])) {
                    foreach ($payload['subordinateIds'] as $candidate) {
                        if (is_scalar($candidate)) {
                            $rawCandidates[] = (string) $candidate;
                        }
                    }
                } else {
                    $singleCandidate = $payload['subordinateId'] ?? '';
                    if (is_scalar($singleCandidate)) {
                        $rawCandidates[] = (string) $singleCandidate;
                    }
                }

                foreach ($rawCandidates as $candidate) {
                    $sanitized = sanitize_text_field($candidate, 200);
                    if ($sanitized !== '') {
                        $candidateEntries[] = [
                            'id' => $sanitized,
                            'assignmentComment' => '',
                            'assignmentDueDate' => '',
                        ];
                    }
                }
            }

            docs_log_file_debug('Mini app subordinates_add candidates collected', [
                'clientRequestId' => $clientRequestId !== '' ? $clientRequestId : null,
                'organization' => $organizationCandidate,
                'documentId' => $documentId,
                'candidateEntriesCount' => count($candidateEntries),
                'payloadSubordinatesCount' => isset($payload['subordinates']) && is_array($payload['subordinates'])
                    ? count($payload['subordinates'])
                    : null,
                'payloadSubordinateIdsCount' => isset($payload['subordinateIds']) && is_array($payload['subordinateIds'])
                    ? count($payload['subordinateIds'])
                    : null,
                'durationMs' => (int) round((microtime(true) - $requestStartedAt) * 1000),
            ]);

            if (empty($candidateEntries)) {
                respond_error('Не выбраны подчинённые.');
            }

            $assignments = [];
            $seenCandidates = [];
            foreach ($candidateEntries as $candidateEntry) {
                $candidate = $candidateEntry['id'] ?? '';
                $normalizedCandidate = docs_normalize_identifier_candidate_value($candidate);
                if ($normalizedCandidate === '') {
                    continue;
                }
                if (isset($seenCandidates[$normalizedCandidate])) {
                    continue;
                }

                $matchedSubordinate = docs_find_subordinate_by_candidate($subordinates, $candidate);
                if ($matchedSubordinate === null) {
                    respond_error('Подчинённый не найден в справочнике.', 404, [
                        'subordinateId' => $candidate,
                    ]);
                }

                $assignment = docs_build_subordinate_assignment_from_entry($matchedSubordinate, $candidate);
                if (empty($assignment)) {
                    respond_error('Не удалось подготовить данные подчинённого.', 500);
                }

                $comment = $candidateEntry['assignmentComment'] ?? '';
                if ($comment !== '') {
                    $assignment['assignmentComment'] = $comment;
                }

                if (array_key_exists('assignmentDueDate', $candidateEntry)) {
                    $dueDate = $candidateEntry['assignmentDueDate'];
                    if ($dueDate !== '') {
                        $assignment['assignmentDueDate'] = $dueDate;
                    } elseif (isset($assignment['assignmentDueDate'])) {
                        unset($assignment['assignmentDueDate']);
                    }
                }

                $seenCandidates[$normalizedCandidate] = true;
                $assignments[] = $assignment;
            }

            if (empty($assignments)) {
                respond_error('Не выбраны подчинённые.');
            }

            $existingAssignees = docs_extract_assignees($records[$recordIndex]);
            $previousAssigneesSnapshot = $existingAssignees;
            $responsibleEntries = [];
            foreach ($existingAssignees as $existingAssignee) {
                if (!is_array($existingAssignee)) {
                    continue;
                }
                $roleValue = strtolower((string) ($existingAssignee['role'] ?? ''));
                if ($roleValue === 'subordinate') {
                    continue;
                }
                $responsibleEntries[] = $existingAssignee;
            }

            $combinedAssignees = array_merge($responsibleEntries, $assignments);
            $combinedAssignees = docs_assign_author_to_assignees($combinedAssignees, $assignmentAuthor, $assignmentAuthorRole, $assignmentAuthorMeta);

            $newAssignments = [];
            docs_apply_assignees_to_record($records[$recordIndex], $combinedAssignees, $newAssignments);

            $updatedAssigneesSnapshot = docs_extract_assignees($records[$recordIndex]);
            $changedAssignments = docs_collect_changed_assignees($previousAssigneesSnapshot, $updatedAssigneesSnapshot);

            $records[$recordIndex]['subordinates'] = array_values($assignments);
            unset($records[$recordIndex]['subordinate']);

            docs_update_instruction_from_subordinates($records[$recordIndex]);

            $assignedCount = count($assignments);
            $message = $assignedCount > 1 ? 'Подчинённые назначены.' : 'Подчинённый назначен.';
            if (!empty($changedAssignments)) {
                $assignedAssignees = array_merge($assignedAssignees, $changedAssignments);
            }
        } elseif ($updateType === 'subordinates_add') {
            if (!$canManageSubordinates) {
                if ($kruglikTraceEnabled) {
                    docs_write_kruglik_log('subordinates_add denied: no permissions', [
                        'organization' => $organizationCandidate,
                        'documentId' => $documentId,
                        'requestPrimaryId' => $requestContext['primaryId'] ?? null,
                        'isDirector' => $isDirector,
                        'isTaskAssignee' => $isTaskAssignee,
                        'isTaskSubordinate' => $isTaskSubordinate,
                    ]);
                }
                respond_error('Недостаточно прав для назначения подчинённых.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $candidateEntries = [];
            if (isset($payload['subordinates']) && is_array($payload['subordinates'])) {
                foreach ($payload['subordinates'] as $entry) {
                    if (!is_array($entry)) {
                        continue;
                    }

                    $candidateValue = '';
                    if (isset($entry['id']) && is_scalar($entry['id'])) {
                        $candidateValue = (string) $entry['id'];
                    } elseif (isset($entry['subordinateId']) && is_scalar($entry['subordinateId'])) {
                        $candidateValue = (string) $entry['subordinateId'];
                    } elseif (isset($entry['subordinate']) && is_scalar($entry['subordinate'])) {
                        $candidateValue = (string) $entry['subordinate'];
                    }

                    $sanitizedCandidate = sanitize_text_field($candidateValue, 200);
                    if ($sanitizedCandidate === '') {
                        continue;
                    }

                    $candidateEntries[] = [
                        'id' => $sanitizedCandidate,
                        'assignmentComment' => sanitize_assignment_comment(isset($entry['assignmentComment'])
                            ? (string) $entry['assignmentComment']
                            : ''),
                        'assignmentDueDate' => sanitize_date_field(isset($entry['assignmentDueDate'])
                            ? (string) $entry['assignmentDueDate']
                            : ''),
                    ];
                }
            }

            if (empty($candidateEntries)) {
                $rawCandidates = [];
                if (isset($payload['subordinateIds']) && is_array($payload['subordinateIds'])) {
                    foreach ($payload['subordinateIds'] as $candidate) {
                        if (is_scalar($candidate)) {
                            $rawCandidates[] = (string) $candidate;
                        }
                    }
                } else {
                    $singleCandidate = $payload['subordinateId'] ?? '';
                    if (is_scalar($singleCandidate)) {
                        $rawCandidates[] = (string) $singleCandidate;
                    }
                }

                foreach ($rawCandidates as $candidate) {
                    $sanitized = sanitize_text_field($candidate, 200);
                    if ($sanitized !== '') {
                        $candidateEntries[] = [
                            'id' => $sanitized,
                            'assignmentComment' => '',
                            'assignmentDueDate' => '',
                        ];
                    }
                }
            }

            if (empty($candidateEntries)) {
                respond_error('Не выбраны подчинённые.');
            }

            if ($kruglikTraceEnabled) {
                docs_write_kruglik_log('subordinates_add candidates', [
                    'organization' => $organizationCandidate,
                    'documentId' => $documentId,
                    'requestPrimaryId' => $requestContext['primaryId'] ?? null,
                    'candidateEntries' => $candidateEntries,
                ]);
            }

            $assignments = [];
            $seenCandidates = [];
            foreach ($candidateEntries as $candidateEntry) {
                $candidate = $candidateEntry['id'] ?? '';
                $normalizedCandidate = docs_normalize_identifier_candidate_value($candidate);
                if ($normalizedCandidate === '') {
                    continue;
                }
                if (isset($seenCandidates[$normalizedCandidate])) {
                    continue;
                }

                $matchedSubordinate = docs_find_subordinate_by_candidate($subordinates, $candidate);
                if ($matchedSubordinate === null) {
                    if ($kruglikTraceEnabled) {
                        docs_write_kruglik_log('subordinates_add failed: candidate not found', [
                            'organization' => $organizationCandidate,
                            'documentId' => $documentId,
                            'candidate' => $candidate,
                            'subordinatesCount' => count($subordinates),
                        ]);
                    }
                    respond_error('Подчинённый не найден в справочнике.', 404, [
                        'subordinateId' => $candidate,
                    ]);
                }

                $assignment = docs_build_subordinate_assignment_from_entry($matchedSubordinate, $candidate);
                if (empty($assignment)) {
                    respond_error('Не удалось подготовить данные подчинённого.', 500);
                }

                $comment = $candidateEntry['assignmentComment'] ?? '';
                if ($comment !== '') {
                    $assignment['assignmentComment'] = $comment;
                }

                if (array_key_exists('assignmentDueDate', $candidateEntry)) {
                    $dueDate = $candidateEntry['assignmentDueDate'];
                    if ($dueDate !== '') {
                        $assignment['assignmentDueDate'] = $dueDate;
                    } elseif (isset($assignment['assignmentDueDate'])) {
                        unset($assignment['assignmentDueDate']);
                    }
                }

                $seenCandidates[$normalizedCandidate] = true;
                $assignments[] = $assignment;
            }

            if (empty($assignments)) {
                respond_error('Не выбраны подчинённые.');
            }

            $existingAssignees = docs_extract_assignees($records[$recordIndex]);
            $previousAssigneesSnapshot = $existingAssignees;
            $responsibleEntries = [];
            $subordinateEntries = [];
            foreach ($existingAssignees as $existingAssignee) {
                if (!is_array($existingAssignee)) {
                    continue;
                }
                $roleValue = strtolower((string) ($existingAssignee['role'] ?? ''));
                if ($roleValue === 'subordinate') {
                    $subordinateEntries[] = $existingAssignee;
                } else {
                    $responsibleEntries[] = $existingAssignee;
                }
            }

            $existingIndex = [];
            $indexed = docs_index_assignees($subordinateEntries);
            foreach ($indexed as $key => $entry) {
                $normalizedKey = mb_strtolower((string) $key, 'UTF-8');
                if ($normalizedKey !== '') {
                    $existingIndex[$normalizedKey] = $entry;
                }
            }

            $newAssignments = [];
            $updatedEntries = [];

            foreach ($assignments as $assignment) {
                $keys = docs_collect_assignee_index_keys($assignment);
                $matchedKey = null;
                foreach ($keys as $key) {
                    $normalizedKey = mb_strtolower($key, 'UTF-8');
                    if ($normalizedKey !== '' && isset($existingIndex[$normalizedKey])) {
                        $matchedKey = $normalizedKey;
                        break;
                    }
                }

                if ($matchedKey !== null) {
                    $existingEntry = $existingIndex[$matchedKey];
                    if (!isset($assignment['assignmentComment']) || $assignment['assignmentComment'] === '') {
                        if (isset($existingEntry['assignmentComment'])) {
                            unset($existingEntry['assignmentComment']);
                        }
                    } else {
                        $existingEntry['assignmentComment'] = $assignment['assignmentComment'];
                    }

                    if (!isset($assignment['assignmentDueDate']) || $assignment['assignmentDueDate'] === '') {
                        if (isset($existingEntry['assignmentDueDate'])) {
                            unset($existingEntry['assignmentDueDate']);
                        }
                    } else {
                        $existingEntry['assignmentDueDate'] = $assignment['assignmentDueDate'];
                    }

                    $existingIndex[$matchedKey] = $existingEntry;

                    foreach ($subordinateEntries as &$subEntry) {
                        $subKeys = docs_collect_assignee_index_keys($subEntry);
                        $found = false;
                        foreach ($subKeys as $subKey) {
                            if (mb_strtolower($subKey, 'UTF-8') === $matchedKey) {
                                $subEntry = $existingEntry;
                                $found = true;
                                break;
                            }
                        }
                        if ($found) {
                            break;
                        }
                    }
                    unset($subEntry);

                    $updatedEntries[] = $existingEntry;
                    continue;
                }

                if ($kruglikTraceEnabled) {
                    docs_write_kruglik_log('subordinates_add before assign_author', [
                        'organization' => $organizationCandidate,
                        'documentId' => $documentId,
                        'assignmentAuthor' => $assignmentAuthor,
                        'assignmentAuthorMeta' => $assignmentAuthorMeta,
                        'assignmentAuthorIsEmpty' => $assignmentAuthor === '',
                        'assignmentAuthorMetaIsEmpty' => empty($assignmentAuthorMeta),
                    ]);
                }

                $assigned = docs_assign_author_to_assignees([$assignment], $assignmentAuthor, $assignmentAuthorRole, $assignmentAuthorMeta);
                $assignedEntry = $assigned[0] ?? [];
                if (empty($assignedEntry)) {
                    continue;
                }

                $subordinateEntries[] = $assignedEntry;
                $newAssignments[] = $assignedEntry;
                $updatedEntries[] = $assignedEntry;

                $assignedKeys = docs_collect_assignee_index_keys($assignedEntry);
                foreach ($assignedKeys as $key) {
                    $normalizedKey = mb_strtolower($key, 'UTF-8');
                    if ($normalizedKey !== '') {
                        $existingIndex[$normalizedKey] = $assignedEntry;
                    }
                }
            }

            if (empty($updatedEntries)) {
                if ($kruglikTraceEnabled) {
                    docs_write_kruglik_log('subordinates_add failed: already assigned', [
                        'organization' => $organizationCandidate,
                        'documentId' => $documentId,
                        'requestPrimaryId' => $requestContext['primaryId'] ?? null,
                    ]);
                }
                respond_error('Подчинённый уже назначен.');
            }

            docs_log_file_debug('Mini app subordinates_add prepared', [
                'clientRequestId' => $clientRequestId !== '' ? $clientRequestId : null,
                'organization' => $organizationCandidate,
                'documentId' => $documentId,
                'existingSubordinatesCount' => count($subordinateEntries),
                'updatedEntriesCount' => count($updatedEntries),
                'newAssignmentsCount' => count($newAssignments),
                'durationMs' => (int) round((microtime(true) - $requestStartedAt) * 1000),
            ]);

            $combinedAssignees = array_merge($responsibleEntries, $subordinateEntries);
            $newAssignmentsSnapshot = [];
            docs_apply_assignees_to_record($records[$recordIndex], $combinedAssignees, $newAssignmentsSnapshot);

            $updatedAssigneesSnapshot = docs_extract_assignees($records[$recordIndex]);
            $changedAssignments = docs_collect_changed_assignees($previousAssigneesSnapshot, $updatedAssigneesSnapshot);

            $records[$recordIndex]['subordinates'] = array_values($subordinateEntries);
            unset($records[$recordIndex]['subordinate']);

            docs_update_instruction_from_subordinates($records[$recordIndex]);

            if (!empty($newAssignments)) {
                $message = count($newAssignments) > 1 ? 'Подчинённые назначены.' : 'Подчинённый назначен.';
            } else {
                $message = 'Данные подчинённого обновлены.';
            }

            if (!empty($changedAssignments)) {
                $assignedAssignees = array_merge($assignedAssignees, $changedAssignments);
            }
        } elseif ($updateType === 'subordinates_remove') {
            if (!$isDirector && !$canManageSubordinates) {
                respond_error('Недостаточно прав для изменения подчинённых.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $rawCandidates = [];
            if (isset($payload['removeSubordinateIds']) && is_array($payload['removeSubordinateIds'])) {
                foreach ($payload['removeSubordinateIds'] as $candidate) {
                    if (is_scalar($candidate)) {
                        $rawCandidates[] = (string) $candidate;
                    }
                }
            } else {
                $singleCandidate = $payload['removeSubordinateId'] ?? '';
                if (is_scalar($singleCandidate)) {
                    $rawCandidates[] = (string) $singleCandidate;
                }
            }

            $removalKeys = [];
            foreach ($rawCandidates as $candidate) {
                $sanitized = sanitize_text_field($candidate, 200);
                if ($sanitized === '') {
                    continue;
                }
                $normalizedId = docs_normalize_identifier_candidate_value($sanitized);
                if ($normalizedId !== '') {
                    $removalKeys[] = 'id::' . $normalizedId;
                }
                $normalizedName = docs_normalize_name_candidate_value($sanitized);
                if ($normalizedName !== '') {
                    $removalKeys[] = 'name::' . $normalizedName;
                }
            }

            if (empty($removalKeys)) {
                respond_error('Не выбраны подчинённые.');
            }

            $existingAssignees = docs_extract_assignees($records[$recordIndex]);
            $responsibleEntries = [];
            $subordinateEntries = [];
            foreach ($existingAssignees as $existingAssignee) {
                if (!is_array($existingAssignee)) {
                    continue;
                }
                $roleValue = strtolower((string) ($existingAssignee['role'] ?? ''));
                if ($roleValue === 'subordinate') {
                    $subordinateEntries[] = $existingAssignee;
                } else {
                    $responsibleEntries[] = $existingAssignee;
                }
            }

            $remainingSubordinates = [];
            $removedEntries = [];
            $blockedEntries = [];
            foreach ($subordinateEntries as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $keys = docs_collect_assignee_index_keys($entry);
                $shouldRemove = false;
                foreach ($keys as $key) {
                    $normalizedKey = mb_strtolower($key, 'UTF-8');
                    foreach ($removalKeys as $target) {
                        if ($normalizedKey === mb_strtolower($target, 'UTF-8')) {
                            $shouldRemove = true;
                            break 2;
                        }
                    }
                }
                if ($shouldRemove && !$isDirector && !docs_entry_assigned_by_user($entry, $requestContext)) {
                    $blockedEntries[] = $entry;
                    $remainingSubordinates[] = $entry;
                    continue;
                }
                if ($shouldRemove) {
                    $removedEntries[] = $entry;
                } else {
                    $remainingSubordinates[] = $entry;
                }
            }

            if (empty($removedEntries)) {
                if (!empty($blockedEntries)) {
                    respond_error('Можно удалить только подчинённых, которых назначили вы.', 403, [
                        'requiresAuthor' => true,
                    ]);
                }
                respond_error('Подчинённый не найден среди назначенных.', 404);
            }

            $combinedAssignees = array_merge($responsibleEntries, $remainingSubordinates);
            $newAssignments = [];
            docs_apply_assignees_to_record($records[$recordIndex], $combinedAssignees, $newAssignments);

            if (!empty($remainingSubordinates)) {
                $records[$recordIndex]['subordinates'] = array_values($remainingSubordinates);
            } else {
                unset($records[$recordIndex]['subordinates']);
            }
            unset($records[$recordIndex]['subordinate']);

            docs_update_instruction_from_subordinates($records[$recordIndex]);

            $removedCount = count($removedEntries);
            $message = $removedCount > 1 ? 'Подчинённые удалены.' : 'Подчинённый удалён.';
        } elseif ($updateType === 'complete') {
            if (!$isDirector) {
                respond_error('Недостаточно прав для завершения задачи.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $statusAuthor = docs_build_assignment_author_label($requestContext['user'] ?? null);
            $records[$recordIndex]['directorStatus'] = 'done';
            $records[$recordIndex]['directorStatusUpdatedAt'] = date('c');
            $records[$recordIndex]['directorStatusAuthor'] = $statusAuthor;
            $records[$recordIndex]['directorCompletedAt'] = date('Y-m-d');

            $message = 'Задача отмечена выполненной для директора.';
        } elseif ($updateType === 'status') {
            $canManageStatus = docs_user_is_block2_member($block2, $requestContext);
            if (!$canManageStatus) {
                $filter = isset($requestContext['filter']) && is_array($requestContext['filter'])
                    ? $requestContext['filter']
                    : null;
                if ($filter !== null) {
                    $debugTrace = [];
                    $canManageStatus = document_matches_assignee_filter(
                        $records[$recordIndex],
                        $filter,
                        $responsibles,
                        $debugTrace
                    );
                }
                if (!$canManageStatus) {
                    $canManageStatus = docs_request_matches_record_assignee($records[$recordIndex], $requestContext);
                }
            }
            if (!$canManageStatus) {
                respond_error('Недостаточно прав для изменения статуса.', 403, [
                    'requiresDirector' => true,
                    'requiresAssignee' => true,
                ]);
            }

            $rawStatus = isset($payload['status']) ? (string) $payload['status'] : '';
            $nextStatus = sanitize_status($rawStatus);
            $statusAuthor = docs_build_assignment_author_label($requestContext['user'] ?? null);
            $statusAssigneeKey = docs_match_status_change_assignee_key(
                $records[$recordIndex],
                $requestContext,
                $sessionAuthArray,
                $statusAuthor
            );
            $shouldUpdateSharedStatus = $isDirector || $statusAssigneeKey === null || $statusAssigneeKey === '';
            if ($shouldUpdateSharedStatus) {
                $records[$recordIndex]['status'] = $nextStatus;
                $records[$recordIndex]['statusUpdatedAt'] = $nextStatus === '' ? null : date('c');
                docs_append_status_history(
                    $records[$recordIndex],
                    $nextStatus,
                    $statusAuthor,
                    $records[$recordIndex]['statusUpdatedAt'],
                    $statusAssigneeKey
                );
            } elseif ($nextStatus !== '') {
                docs_append_assignee_status_history($records[$recordIndex], $statusAssigneeKey, [
                    'status' => $nextStatus,
                    'changedAt' => date('c'),
                    'changedBy' => $statusAuthor,
                ]);
            }

            $isCompletedStatus = mb_stripos($nextStatus, 'выполн') !== false;
            $existingCompleted = isset($records[$recordIndex]['completedAt'])
                ? sanitize_date_field((string) $records[$recordIndex]['completedAt'])
                : '';
            if ($isCompletedStatus) {
                $records[$recordIndex]['completedAt'] = $existingCompleted !== '' ? $existingCompleted : date('Y-m-d');
            } elseif (isset($records[$recordIndex]['completedAt'])) {
                unset($records[$recordIndex]['completedAt']);
            }

            $message = 'Статус обновлён.';
        } elseif ($updateType === 'due_date') {
            if (!docs_user_is_block2_member($block2, $requestContext)) {
                respond_error('Недостаточно прав для изменения срока.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $rawDueDate = isset($payload['dueDate']) ? (string) $payload['dueDate'] : '';
            $normalizedDueDate = sanitize_date_field($rawDueDate);
            $records[$recordIndex]['dueDate'] = $normalizedDueDate;
            if ($normalizedDueDate === '') {
                $message = 'Срок удалён.';
            } else {
                $message = 'Срок обновлён.';
            }
        } elseif ($updateType === 'instruction') {
            if (!docs_user_is_block2_member($block2, $requestContext)) {
                respond_error('Недостаточно прав для изменения поручения.', 403, [
                    'requiresDirector' => true,
                ]);
            }

            $rawInstruction = isset($payload['instruction']) ? (string) $payload['instruction'] : '';
            $normalizedInstruction = sanitize_instruction($rawInstruction);
            $records[$recordIndex]['instruction'] = $normalizedInstruction;
            if ($normalizedInstruction === '') {
                $message = 'Поручение удалено.';
            } else {
                $message = 'Поручение обновлено.';
            }
        } else {
            respond_error('Неизвестный тип обновления.', 400, [
                'updateType' => $updateType,
            ]);
        }

        if ($originalDirector !== null) {
            $records[$recordIndex]['director'] = $originalDirector;
        }
        if ($originalDirectors !== null) {
            $records[$recordIndex]['directors'] = $originalDirectors;
        }

        $records[$recordIndex]['updatedAt'] = date('c');

        if ($registryHandle !== null) {
            try {
                docs_save_registry_locked($registryHandle, $records);
            } finally {
                docs_unlock_registry($registryHandle);
            }
        } else {
            save_registry($folder, $records);
        }
        docs_log_file_debug('Mini app update task saved', [
            'clientRequestId' => $clientRequestId !== '' ? $clientRequestId : null,
            'organization' => $organizationCandidate,
            'documentId' => $documentId,
            'updateType' => $updateType,
            'durationMs' => (int) round((microtime(true) - $requestStartedAt) * 1000),
        ]);

        $preparedRecords = docs_prepare_records_for_response([$records[$recordIndex]], $organizationCandidate, $folder);
        $updatedRecord = $preparedRecords[0] ?? $records[$recordIndex];
        $updatedAssignees = docs_extract_assignees($updatedRecord);
        $primaryAssignee = $updatedAssignees[0] ?? null;

        log_docs_event('Mini app task updated', [
            'organization' => $organizationCandidate,
            'documentId' => $documentId,
            'updateType' => $updateType,
            'assigneeId' => in_array($updateType, ['assign', 'assign_add'], true)
                ? ($primaryAssignee['id'] ?? null)
                : null,
            'assigneeIds' => in_array($updateType, ['assign', 'assign_add'], true)
                ? array_values(array_filter(array_map(static function ($entry) {
                    if (!is_array($entry)) {
                        return null;
                    }
                    if (!empty($entry['id'])) {
                        return (string) $entry['id'];
                    }
                    if (!empty($entry['telegram'])) {
                        return (string) $entry['telegram'];
                    }
                    if (!empty($entry['chatId'])) {
                        return (string) $entry['chatId'];
                    }
                    if (!empty($entry['email'])) {
                        return (string) $entry['email'];
                    }
                    return null;
                }, $updatedAssignees)))
                : null,
            'subordinateIds' => in_array($updateType, ['subordinates', 'subordinates_add'], true)
                ? array_values(array_filter(array_map(static function ($entry) {
                    if (!is_array($entry)) {
                        return null;
                    }
                    $roleValue = strtolower((string) ($entry['role'] ?? ''));
                    if ($roleValue !== 'subordinate') {
                        return null;
                    }
                    foreach (['id', 'telegram', 'chatId', 'email', 'login', 'number'] as $field) {
                        if (!empty($entry[$field])) {
                            return (string) $entry[$field];
                        }
                    }

                    return null;
                }, $updatedAssignees)))
                : null,
            'status' => $updateType === 'status' || $updateType === 'complete' ? ($updatedRecord['status'] ?? null) : null,
            'dueDate' => $updateType === 'due_date' ? ($updatedRecord['dueDate'] ?? null) : null,
            'telegramUserId' => $requestContext['primaryId'] ?? null,
        ]);

        $responsePayload = [
            'message' => $message,
            'organization' => $organizationCandidate,
            'task' => $updatedRecord,
        ];

        if (in_array($updateType, ['assign', 'assign_add', 'subordinates', 'subordinates_add'], true)
            && !empty($assignedAssignees)) {
            respond_success_with_background_task($responsePayload, static function () use ($assignedAssignees, $updatedRecord, $organizationCandidate): void {
                docs_send_task_assignment_notifications($assignedAssignees, $updatedRecord, $organizationCandidate);
            });
        }

        respond_success($responsePayload);
        break;

    case 'get_admin_settings':
        $requestedOrganization = docs_normalize_organization_candidate($_GET['organization'] ?? '');
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionAuth = docs_get_session_auth();
        $sessionRole = is_array($sessionAuth) ? strtolower((string) ($sessionAuth['role'] ?? '')) : '';
        $isAdminSession = $sessionRole === 'admin';
        $isUserSession = $sessionRole === 'user';
        if ($isAdminSession) {
            docs_require_admin_session($accessContext);
        } elseif ($isUserSession) {
            if (!docs_user_can_manage_subordinates($sessionAuth)) {
                respond_error('Доступ запрещён. Требуются права администратора.', 403, [
                    'requiresAdmin' => true,
                ]);
            }
        } else {
            respond_error('Доступ запрещён. Требуются права администратора.', 403, [
                'requiresAdmin' => true,
            ]);
        }
        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        $settings = load_admin_settings($folder);
        if (!$isAdminSession) {
            $settings = [
                'responsibles' => isset($settings['responsibles']) && is_array($settings['responsibles'])
                    ? $settings['responsibles']
                    : [],
                'block2' => isset($settings['block2']) && is_array($settings['block2'])
                    ? $settings['block2']
                    : [],
                'block3' => isset($settings['block3']) && is_array($settings['block3'])
                    ? $settings['block3']
                    : [],
            ];
        }
        $settingsPath = get_settings_path($folder);

        $responsiblesCount = 0;
        if (isset($settings['responsibles']) && is_array($settings['responsibles'])) {
            $responsiblesCount = count($settings['responsibles']);
        }

        log_docs_event('Admin settings loaded', [
            'organization' => $organization,
            'folder' => $folder,
            'fileExists' => is_file($settingsPath),
            'responsiblesCount' => $responsiblesCount,
            'accessibleOrganizations' => $accessContext['accessible'],
        ]);

        respond_success([
            'organization' => $organization,
            'accessibleOrganizations' => $accessContext['accessible'],
            'settings' => $settings,
        ]);
        break;

    case 'save_admin_settings':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        docs_require_admin_session($accessContext);
        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        $settingsPayload = [];
        if (isset($payload['settings']) && is_array($payload['settings'])) {
            $settingsPayload = $payload['settings'];
        }

        $settings = sanitize_admin_settings($settingsPayload);
        save_admin_settings($folder, $settings);

        respond_success([
            'organization' => $organization,
            'accessibleOrganizations' => $accessContext['accessible'],
            'settings' => $settings,
            'message' => 'Настройки администратора сохранены.',
        ]);
        break;

    case 'load_column_widths':
        if ($method !== 'GET') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($_GET['organization'] ?? ''));
        if ($requestedOrganization === '') {
            respond_error('Не указана организация.');
        }

        $folder = sanitize_folder_name($requestedOrganization);
        $requestContext = docs_build_request_user_context();
        $sessionAuth = docs_get_session_auth();
        $settings = load_admin_settings($folder);
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
        $profile = docs_resolve_column_width_profile(
            $requestedOrganization,
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            $block2
        );

        $widthMap = isset($settings['columnWidths']) && is_array($settings['columnWidths'])
            ? $settings['columnWidths']
            : [];
        $profileSettings = isset($widthMap[$profile]) && is_array($widthMap[$profile])
            ? $widthMap[$profile]
            : [];

        if (empty($profileSettings) && strpos($profile, ':') !== false) {
            $fallbackProfile = strstr($profile, ':', true);
            if ($fallbackProfile !== false && isset($widthMap[$fallbackProfile]) && is_array($widthMap[$fallbackProfile])) {
                $profileSettings = $widthMap[$fallbackProfile];
            }
        }
        $columns = isset($profileSettings['columns'])
            ? docs_sanitize_column_widths($profileSettings['columns'])
            : [];

        $response = [
            'organization' => $requestedOrganization,
            'profile' => $profile,
            'columns' => $columns,
        ];

        if (isset($profileSettings['updatedAt']) && is_string($profileSettings['updatedAt'])) {
            $response['updatedAt'] = $profileSettings['updatedAt'];
        }
        if (isset($profileSettings['updatedBy']) && is_string($profileSettings['updatedBy']) && $profileSettings['updatedBy'] !== '') {
            $response['updatedBy'] = $profileSettings['updatedBy'];
        }

        respond_success($response);
        break;

    case 'save_column_widths':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload)) {
            $payload = [];
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        if ($requestedOrganization === '') {
            respond_error('Не указана организация.');
        }

        $sessionAuth = docs_get_session_auth();
        if (!is_array($sessionAuth)) {
            respond_error('Доступ запрещён. Требуются права администратора или ответственного.', 403, [
                'requiresAdmin' => true,
                'requiresResponsible' => true,
            ]);
        }

        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionRole = strtolower((string) ($sessionAuth['role'] ?? ''));
        if ($sessionRole === 'admin') {
            $sessionAuth = docs_require_admin_session($accessContext);
        } elseif ($sessionRole !== 'user') {
            respond_error('Доступ запрещён. Требуются права администратора или ответственного.', 403, [
                'requiresAdmin' => true,
                'requiresResponsible' => true,
            ]);
        }

        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        $settings = load_admin_settings($folder);
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
        $requestContext = docs_build_request_user_context();
        $profile = docs_resolve_column_width_profile(
            $organization,
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            $block2
        );

        $columnsPayload = isset($payload['columns']) && is_array($payload['columns'])
            ? $payload['columns']
            : [];
        $columns = docs_sanitize_column_widths($columnsPayload);

        $widthMap = isset($settings['columnWidths']) && is_array($settings['columnWidths'])
            ? $settings['columnWidths']
            : [];
        $entry = [
            'columns' => $columns,
            'updatedAt' => date('c'),
        ];

        $updatedBy = docs_build_assignment_author_label($sessionAuth);
        if ($updatedBy !== '') {
            $entry['updatedBy'] = $updatedBy;
        }

        $widthMap[$profile] = $entry;
        $settings['columnWidths'] = $widthMap;
        save_admin_settings($folder, $settings);

        $response = [
            'organization' => $organization,
            'profile' => $profile,
            'columns' => $columns,
            'updatedAt' => $entry['updatedAt'],
            'message' => 'Настройки ширины сохранены.',
        ];
        if (isset($entry['updatedBy'])) {
            $response['updatedBy'] = $entry['updatedBy'];
        }

        respond_success($response);
        break;

    case 'list':
        $requestContext = docs_build_request_user_context();
        $resolvedUserId = $requestContext['primaryId'] ?? null;
        $requestedOrganization = docs_normalize_organization_candidate($_GET['organization'] ?? '');
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $organization = $accessContext['active'];

        docs_log_missing_telegram_user_id('list', $requestContext, [
            'organization' => $organization,
            'forceAccess' => $accessContext['forceAccess'] ?? false,
            'accessibleCount' => isset($accessContext['accessible']) ? count($accessContext['accessible']) : null,
        ]);

        $folder = sanitize_folder_name($organization);
        $records = load_registry($folder);
        $settings = load_admin_settings($folder);
        $responsibles = isset($settings['responsibles']) && is_array($settings['responsibles'])
            ? $settings['responsibles']
            : [];
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
        $sessionAuth = docs_get_session_auth();

        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null
            ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles)
            : $preparedRecords;

        $permissions = docs_build_permissions_summary(
            $organization,
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            $block2
        );

        $registryPath = get_registry_path($folder);
        $storagePath = build_public_path($folder);

        $filterSummary = summarize_assignee_filter_for_log($filter);
        $preparedSummary = summarize_documents_collection_for_log($preparedRecords);
        $filteredSummary = summarize_documents_collection_for_log($filteredRecords);
        $droppedCount = max(0, $preparedSummary['count'] - $filteredSummary['count']);

        $filteredKeys = [];
        foreach ($filteredRecords as $record) {
            if (!is_array($record)) {
                continue;
            }

            $filteredKeys[build_document_record_key($record)] = true;
        }

        $droppedSamples = [];
        foreach ($preparedRecords as $record) {
            if (!is_array($record)) {
                continue;
            }

            $key = build_document_record_key($record);
            if (isset($filteredKeys[$key])) {
                continue;
            }

            $droppedSamples[] = summarize_document_record_for_log($record);
            if (count($droppedSamples) >= 10) {
                break;
            }
        }

        $diagnosticContext = [
            'organization' => $organization,
            'folder' => $folder,
            'registryPath' => $registryPath,
            'storagePath' => $storagePath,
            'filterApplied' => $filter !== null,
            'filterSource' => $accessContext['filterSource'] ?? null,
            'filter' => $filterSummary,
            'recordsPrepared' => $preparedSummary,
            'recordsFiltered' => $filteredSummary,
            'recordsDropped' => $droppedCount,
            'userId' => $resolvedUserId,
        ];

        if (!empty($droppedSamples)) {
            $diagnosticContext['droppedSamples'] = $droppedSamples;
        }

        log_docs_event('Documents filtering diagnostics', $diagnosticContext);

        log_docs_event('Documents list prepared', [
            'organization' => $organization,
            'recordsTotal' => count($records),
            'recordsFiltered' => count($filteredRecords),
            'filterApplied' => $filter !== null,
            'filterSource' => $accessContext['filterSource'] ?? null,
            'filterSummary' => $filterSummary,
            'accessibleOrganizations' => $accessContext['accessible'],
            'responsiblesCount' => count($responsibles),
            'authUser' => $_SERVER['PHP_AUTH_USER'] ?? null,
            'recordsDropped' => $droppedCount,
            'registryPath' => $registryPath,
            'storagePath' => $storagePath,
            'userId' => $resolvedUserId,
        ]);

        respond_success([
            'organization' => $organization,
            'organizations' => $accessContext['accessible'],
            'storageDisplayPath' => 'documents/' . $folder,
            'storagePath' => $storagePath,
            'documents' => array_values($filteredRecords),
            'filterSource' => $accessContext['filterSource'] ?? null,
            'userId' => $resolvedUserId,
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
            'canCreateDocuments' => $permissions['canCreateDocuments'],
            'canDeleteDocuments' => $permissions['canDeleteDocuments'],
        ]);
        break;

    case 'create':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $requestedOrganization = docs_normalize_organization_candidate($_POST['organization'] ?? '');
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $session = docs_require_admin_session($accessContext);
        if (!docs_user_can_create_documents($session)) {
            respond_error('Доступ запрещён. Добавление документов недоступно для вашей роли.', 403, [
                'reason' => 'create_forbidden',
                'adminScope' => $session['adminScope'] ?? null,
            ]);
        }
        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        [$registryHandle, $records] = docs_lock_registry($folder);
        if ($registryHandle === null) {
            $records = load_registry($folder);
        }
        $settings = load_admin_settings($folder);

        $documentId = generate_document_id();
        $entryNumber = generate_entry_number($records);

        $sanitizedStatus = sanitize_status($_POST['status'] ?? '');
        $statusTimestamp = $sanitizedStatus === '' ? null : date('c');

        $record = [
            'id' => $documentId,
            'entryNumber' => $entryNumber,
            'organization' => $organization,
            'registryNumber' => sanitize_text_field($_POST['registry_number'] ?? '', 120),
            'registrationDate' => sanitize_date_field($_POST['registration_date'] ?? ''),
            'direction' => sanitize_text_field($_POST['direction'] ?? '', 60),
            'correspondent' => sanitize_text_field($_POST['correspondent'] ?? '', 200),
            'documentNumber' => sanitize_text_field($_POST['document_number'] ?? '', 120),
            'documentDate' => sanitize_date_field($_POST['document_date'] ?? ''),
            'executor' => sanitize_text_field($_POST['executor'] ?? '', 160),
            'summary' => sanitize_text_field($_POST['summary'] ?? '', 1000),
            'resolution' => sanitize_text_field($_POST['resolution'] ?? '', 1000),
            'dueDate' => sanitize_date_field($_POST['due_date'] ?? ''),
            'status' => $sanitizedStatus,
            'statusUpdatedAt' => $statusTimestamp,
            'instruction' => sanitize_instruction($_POST['instruction'] ?? ''),
            'notes' => sanitize_text_field($_POST['notes'] ?? '', 500),
            'createdAt' => date('c'),
            'updatedAt' => date('c'),
            'files' => [],
        ];

        if ($record['correspondent'] === '') {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Поле «Отправитель / получатель» обязательно для заполнения.', 422);
        }

        if (!empty($record['status'])) {
            $authorLabel = docs_build_assignment_author_label($session);
            docs_append_status_history($record, $record['status'], $authorLabel, $record['statusUpdatedAt'], null);
        }

        $assignedForNotification = [];
        $assignmentAuthorLabel = docs_build_assignment_author_label($session);
        $assignmentAuthorRole = docs_resolve_assignment_author_role_from_session($session);
        $assignmentAuthorMeta = docs_extract_assignment_author_meta($session);
        $assignees = build_assignees_from_request($_POST, true);
        if (!empty($assignees)) {
            $assignees = docs_assign_author_to_assignees($assignees, $assignmentAuthorLabel, $assignmentAuthorRole, $assignmentAuthorMeta);
            docs_apply_assignees_to_record($record, $assignees, $assignedForNotification);
        } else {
            $assignee = build_assignee_from_request($_POST);
            if (!empty($assignee)) {
                $assigneeList = docs_assign_author_to_assignees([$assignee], $assignmentAuthorLabel, $assignmentAuthorRole, $assignmentAuthorMeta);
                docs_apply_assignees_to_record($record, $assigneeList, $assignedForNotification);
            }
        }

        $directorAssignment = null;
        $directorIndexRaw = isset($_POST['director_index']) ? trim((string) $_POST['director_index']) : '';
        if (is_string($directorIndexRaw) && $directorIndexRaw !== '') {
            $directorIndex = filter_var($directorIndexRaw, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 0],
            ]);
            if ($directorIndex !== false
                && isset($settings['block2'])
                && is_array($settings['block2'])
                && isset($settings['block2'][$directorIndex])
                && is_array($settings['block2'][$directorIndex])
            ) {
                $directorEntry = $settings['block2'][$directorIndex];
                $directorAssignment = docs_build_director_assignment_from_entry($directorEntry, $assignmentAuthorLabel, $assignmentAuthorRole);
            }
        }

        if (!empty($directorAssignment)) {
            $record['director'] = $directorAssignment;
            $shouldNotifyDirector = true;
            if (!empty($assignedForNotification)) {
                $existingIndex = docs_index_assignees($assignedForNotification);
                $directorKeys = docs_collect_assignee_index_keys($directorAssignment);
                foreach ($directorKeys as $key) {
                    if ($key !== '' && isset($existingIndex[$key])) {
                        $shouldNotifyDirector = false;
                        break;
                    }
                }
            }

            if ($shouldNotifyDirector) {
                $assignedForNotification[] = $directorAssignment;
            }
        }

        $dir = ensure_organization_directory($folder);

        if (!empty($_FILES['attachments']) && isset($_FILES['attachments']['name'])) {
            $names = $_FILES['attachments']['name'];
            $tmpNames = $_FILES['attachments']['tmp_name'];
            $errors = $_FILES['attachments']['error'];
            $sizes = $_FILES['attachments']['size'];
            $incomingCount = is_array($names) ? count($names) : ($names !== '' ? 1 : 0);

            docs_log_file_debug('files:create payload received', [
                'organization' => $organization,
                'documentId' => $documentId,
                'incomingCount' => $incomingCount,
                'errors' => $errors,
                'sizes' => $sizes,
                'namesSample' => is_array($names) ? array_slice($names, 0, 5) : [$names],
            ]);

            if (is_array($names)) {
                $count = count($names);
                for ($i = 0; $i < $count; $i++) {
                    if (!isset($errors[$i]) || $errors[$i] !== UPLOAD_ERR_OK) {
                        docs_log_file_debug('files:create skipped upload error', [
                            'documentId' => $documentId,
                            'index' => $i,
                            'name' => $names[$i] ?? '',
                            'error' => $errors[$i] ?? null,
                        ]);
                        continue;
                    }

                    $originalName = docs_normalize_uploaded_filename((string) $names[$i]);
                    $tmpPath = (string) $tmpNames[$i];
                    if (!is_uploaded_file($tmpPath)) {
                        docs_log_file_debug('files:create temp file missing', [
                            'documentId' => $documentId,
                            'index' => $i,
                            'name' => $originalName,
                            'tmpPath' => $tmpPath,
                        ]);
                        continue;
                    }

                    $storedName = normalize_file_name($originalName, $record, $i + 1);
                    $target = $dir . '/' . $storedName;

                    if (move_uploaded_file($tmpPath, $target)) {
                        $record['files'][] = [
                            'originalName' => $originalName,
                            'storedName' => $storedName,
                            'size' => (int) ($sizes[$i] ?? filesize($target) ?: 0),
                            'uploadedAt' => date('c'),
                            'url' => build_public_path($folder, $storedName),
                        ];
                        docs_log_file_debug('files:create stored', [
                            'documentId' => $documentId,
                            'index' => $i,
                            'originalName' => $originalName,
                            'storedName' => $storedName,
                            'size' => $sizes[$i] ?? null,
                        ]);
                    } else {
                        docs_log_file_debug('files:create move failed', [
                            'documentId' => $documentId,
                            'index' => $i,
                            'originalName' => $originalName,
                            'storedName' => $storedName,
                            'target' => $target,
                        ]);
                    }
                }
            } elseif ($errors === UPLOAD_ERR_OK) {
                $originalNameSingle = docs_normalize_uploaded_filename((string) $names);
                $tmpPathSingle = (string) $tmpNames;
                if (is_uploaded_file($tmpPathSingle)) {
                    $storedNameSingle = normalize_file_name($originalNameSingle, $record);
                    $targetSingle = $dir . '/' . $storedNameSingle;
                    if (move_uploaded_file($tmpPathSingle, $targetSingle)) {
                        $record['files'][] = [
                            'originalName' => $originalNameSingle,
                            'storedName' => $storedNameSingle,
                            'size' => (int) ($sizes ?? filesize($targetSingle) ?: 0),
                            'uploadedAt' => date('c'),
                            'url' => build_public_path($folder, $storedNameSingle),
                        ];
                        docs_log_file_debug('files:create stored single', [
                            'documentId' => $documentId,
                            'originalName' => $originalNameSingle,
                            'storedName' => $storedNameSingle,
                            'size' => $sizes ?? null,
                        ]);
                    } else {
                        docs_log_file_debug('files:create move failed single', [
                            'documentId' => $documentId,
                            'originalName' => $originalNameSingle,
                            'storedName' => $storedNameSingle,
                            'target' => $targetSingle,
                        ]);
                    }
                } else {
                    docs_log_file_debug('files:create temp file missing single', [
                        'documentId' => $documentId,
                        'name' => $originalNameSingle,
                        'tmpPath' => $tmpPathSingle,
                    ]);
                }
            } else {
                docs_log_file_debug('files:create skipped upload error single', [
                    'documentId' => $documentId,
                    'name' => is_string($names) ? $names : '',
                    'error' => $errors,
                ]);
            }
        } else {
            docs_log_file_debug('files:create no attachments', [
                'organization' => $organization,
                'documentId' => $documentId,
            ]);
        }

        $records[] = $record;
        if ($registryHandle !== null) {
            docs_save_registry_locked($registryHandle, $records);
            docs_unlock_registry($registryHandle);
        } else {
            save_registry($folder, $records);
        }

        $responsibles = load_responsibles_for_folder($folder);
        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null
            ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles)
            : $preparedRecords;

        if (!empty($assignedForNotification)) {
            docs_send_task_assignment_notifications($assignedForNotification, $record, $organization);
        }

        $permissions = docs_build_permissions_summary(
            $organization,
            docs_build_request_user_context(),
            $session,
            isset($settings['block2']) && is_array($settings['block2']) ? $settings['block2'] : []
        );

        $createdDocumentPrepared = docs_prepare_records_for_response([$record], $organization, $folder);
        $createdDocument = !empty($createdDocumentPrepared) && is_array($createdDocumentPrepared[0])
            ? $createdDocumentPrepared[0]
            : $record;

        respond_success([
            'message' => 'Документ добавлен в реестр.',
            'organization' => $organization,
            'organizations' => $accessContext['accessible'],
            'storageDisplayPath' => 'documents/' . $folder,
            'storagePath' => build_public_path($folder),
            'documents' => array_values($filteredRecords),
            'createdDocument' => $createdDocument,
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
        ]);
        break;

    case 'resend_assignment_notification':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload)) {
            $payload = [];
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionAuth = docs_get_session_auth();
        $sessionRole = is_array($sessionAuth) ? strtolower((string) ($sessionAuth['role'] ?? '')) : '';
        $isAdminSession = $sessionRole === 'admin';
        $isUserSession = $sessionRole === 'user';

        if ($isAdminSession) {
            $sessionAuth = docs_require_admin_session($accessContext);
        } elseif (!$isUserSession) {
            respond_error('Доступ запрещён. Требуются права администратора или ответственного.', 403, [
                'requiresAdmin' => true,
                'requiresResponsible' => true,
            ]);
        }

        $organization = $accessContext['active'];
        if ($organization === null || $organization === '') {
            respond_error('Организация не выбрана.');
        }

        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор документа.');
        }

        $assigneeKeyRaw = sanitize_text_field((string) ($payload['assigneeKey'] ?? ''), 200);
        if ($assigneeKeyRaw === '') {
            respond_error('Не указан получатель уведомления.');
        }
        $assigneeKey = mb_strtolower($assigneeKeyRaw, 'UTF-8');

        $folder = sanitize_folder_name($organization);
        $records = load_registry($folder);
        $recordIndex = null;
        foreach ($records as $index => $record) {
            if (!is_array($record)) {
                continue;
            }
            if (isset($record['id']) && (string) $record['id'] === $documentId) {
                $recordIndex = $index;
                break;
            }
        }

        if ($recordIndex === null) {
            respond_error('Документ не найден.', 404, ['documentId' => $documentId]);
        }

        $settings = load_admin_settings($folder);
        $responsibles = isset($settings['responsibles']) && is_array($settings['responsibles'])
            ? $settings['responsibles']
            : [];

        if ($isUserSession) {
            $userFilter = docs_build_session_user_filter_from_auth(is_array($sessionAuth) ? $sessionAuth : []);
            if ($userFilter === null) {
                respond_error('Недостаточно прав для операции.', 403, [
                    'requiresResponsible' => true,
                ]);
            }
            if (!document_matches_assignee_filter($records[$recordIndex], $userFilter, $responsibles)) {
                respond_error('Документ недоступен для вашего аккаунта.', 403, [
                    'requiresResponsible' => true,
                ]);
            }
        }

        $candidates = [];
        $assignees = docs_extract_assignees($records[$recordIndex]);
        foreach ($assignees as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $candidates[] = ['entry' => $entry, 'role' => 'responsible'];
        }

        if (isset($records[$recordIndex]['subordinates']) && is_array($records[$recordIndex]['subordinates'])) {
            foreach ($records[$recordIndex]['subordinates'] as $subordinateEntry) {
                if (!is_array($subordinateEntry)) {
                    continue;
                }
                if (!isset($subordinateEntry['role'])) {
                    $subordinateEntry['role'] = 'subordinate';
                }
                $candidates[] = ['entry' => $subordinateEntry, 'role' => 'subordinate'];
            }
        } elseif (isset($records[$recordIndex]['subordinate']) && is_array($records[$recordIndex]['subordinate'])) {
            $singleSubordinate = $records[$recordIndex]['subordinate'];
            if (!isset($singleSubordinate['role'])) {
                $singleSubordinate['role'] = 'subordinate';
            }
            $candidates[] = ['entry' => $singleSubordinate, 'role' => 'subordinate'];
        }

        if (empty($candidates)) {
            respond_error('Исполнители для документа не найдены.', 404);
        }

        $matchedEntry = null;
        $matchedRole = 'responsible';
        foreach ($candidates as $candidate) {
            $entry = $candidate['entry'];
            $keys = docs_collect_assignee_index_keys($entry);
            foreach ($keys as $key) {
                if (mb_strtolower($key, 'UTF-8') === $assigneeKey) {
                    $matchedEntry = $entry;
                    $matchedRole = $candidate['role'];
                    break 2;
                }
            }
        }

        if ($matchedEntry === null) {
            $assigneeKeyValue = $assigneeKey;
            if (stripos($assigneeKey, 'id::') === 0) {
                $assigneeKeyValue = substr($assigneeKey, 4);
            } elseif (stripos($assigneeKey, 'name::') === 0) {
                $assigneeKeyValue = substr($assigneeKey, 6);
            }

            $assigneeNameCandidate = sanitize_text_field((string) ($payload['assigneeName'] ?? ''), 200);
            $normalizedKeyName = docs_normalize_name_candidate_value($assigneeKeyValue);
            $normalizedAssigneeName = docs_normalize_name_candidate_value($assigneeNameCandidate);

            if ($normalizedKeyName !== '' || $normalizedAssigneeName !== '') {
                foreach ($candidates as $candidate) {
                    $entry = $candidate['entry'];
                    foreach (['name', 'responsible'] as $field) {
                        if (empty($entry[$field])) {
                            continue;
                        }
                        $entryName = docs_normalize_name_candidate_value($entry[$field]);
                        if (
                            $entryName !== ''
                            && (
                                ($normalizedKeyName !== '' && $entryName === $normalizedKeyName)
                                || ($normalizedAssigneeName !== '' && $entryName === $normalizedAssigneeName)
                            )
                        ) {
                            $matchedEntry = $entry;
                            $matchedRole = $candidate['role'];
                            break 2;
                        }
                    }
                }
            }
        }

        if ($matchedEntry === null) {
            respond_error('Исполнитель не найден в документе.', 404, [
                'assigneeKey' => $assigneeKeyRaw,
            ]);
        }

        if (!isset($matchedEntry['role'])) {
            $matchedEntry['role'] = $matchedRole;
        }

        docs_send_task_assignment_notifications([$matchedEntry], $records[$recordIndex], $organization);

        $assigneeName = sanitize_text_field($payload['assigneeName'] ?? ($matchedEntry['name'] ?? ''), 200);
        $message = 'Напоминание отправлено.';
        if ($assigneeName !== '') {
            $message = 'Напоминание отправлено для ' . $assigneeName . '.';
        }

        respond_success(['message' => $message]);
        break;

    case 'resend_director_notification':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload)) {
            $payload = [];
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionAuth = docs_get_session_auth();
        $sessionRole = is_array($sessionAuth) ? strtolower((string) ($sessionAuth['role'] ?? '')) : '';

        if ($sessionRole !== 'admin') {
            respond_error('Доступ запрещён. Требуются права администратора.', 403, [
                'requiresAdmin' => true,
            ]);
        }

        $sessionAuth = docs_require_admin_session($accessContext);

        $organization = $accessContext['active'];
        if ($organization === null || $organization === '') {
            respond_error('Организация не выбрана.');
        }

        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор документа.');
        }

        $directorKeyRaw = sanitize_text_field((string) ($payload['directorKey'] ?? ''), 200);
        if ($directorKeyRaw === '') {
            respond_error('Не указан директор для уведомления.');
        }
        $directorKey = mb_strtolower($directorKeyRaw, 'UTF-8');

        $folder = sanitize_folder_name($organization);
        $records = load_registry($folder);
        $recordIndex = null;
        foreach ($records as $index => $record) {
            if (!is_array($record)) {
                continue;
            }
            if (isset($record['id']) && (string) $record['id'] === $documentId) {
                $recordIndex = $index;
                break;
            }
        }

        if ($recordIndex === null) {
            respond_error('Документ не найден.', 404, ['documentId' => $documentId]);
        }

        $directors = docs_extract_directors($records[$recordIndex]);
        if (empty($directors)) {
            respond_error('Директор для документа не найден.', 404);
        }

        $matchedEntry = null;
        foreach ($directors as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $keys = docs_collect_assignee_index_keys($entry);
            foreach ($keys as $key) {
                if (mb_strtolower($key, 'UTF-8') === $directorKey) {
                    $matchedEntry = $entry;
                    break 2;
                }
            }
        }

        if ($matchedEntry === null) {
            respond_error('Директор не найден в документе.', 404, [
                'directorKey' => $directorKeyRaw,
            ]);
        }

        if (!isset($matchedEntry['role'])) {
            $matchedEntry['role'] = 'director';
        }

        $chatId = docs_resolve_telegram_chat_id_from_assignee($matchedEntry);
        if ($chatId === null) {
            respond_error('У директора не указан Telegram ID.');
        }

        $baseUrl = docs_resolve_application_base_url();
        $appPath = '/js/documents/app/telegram-appdosc.html';
        $startParam = docs_build_task_start_param($records[$recordIndex]);
        $link = docs_build_mini_app_link($baseUrl, $appPath, (string) $chatId, $startParam);

        $message = docs_build_director_reminder_message($records[$recordIndex], $matchedEntry, $organization, $link);
        if ($message === '') {
            respond_error('Не удалось сформировать сообщение для напоминания.', 500);
        }

        $replyMarkup = null;
        if ($link !== '') {
            $replyMarkup = [
                'inline_keyboard' => [
                    [
                        [
                            'text' => 'Открыть задачу',
                            'web_app' => [
                                'url' => $link,
                            ],
                        ],
                    ],
                ],
            ];
        }

        if ($startParam !== '') {
            docs_write_entry_task_log('Мини-приложение: сформирована ссылка на задачу', [
                'scope' => 'director_reminder',
                'organization' => $organization,
                'documentId' => $records[$recordIndex]['id'] ?? null,
                'startParam' => $startParam,
                'chatId' => (string) $chatId,
                'directorKey' => $directorKeyRaw,
            ]);
        }

        $botToken = docs_resolve_telegram_bot_token();
        if ($botToken === null || $botToken === '') {
            respond_error('Токен Telegram-бота не настроен.');
        }

        $result = docs_send_telegram_message((string) $chatId, $message, $botToken, $replyMarkup);
        if (is_array($result) && isset($result['ok']) && !$result['ok']) {
            respond_error('Не удалось отправить напоминание директору.');
        }

        $directorName = sanitize_text_field((string) ($payload['directorName'] ?? ($matchedEntry['name'] ?? '')), 200);
        $responseMessage = 'Напоминание отправлено директору.';
        if ($directorName !== '') {
            $responseMessage = 'Напоминание отправлено директору ' . $directorName . '.';
        }

        respond_success(['message' => $responseMessage]);
        break;

    case 'register_view':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload)) {
            $payload = [];
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        if ($requestedOrganization === '') {
            respond_error('Не указана организация.');
        }

        $sessionAuth = docs_get_session_auth();
        if (!is_array($sessionAuth)) {
            respond_error('Доступ запрещён. Требуются права администратора или ответственного.', 403, [
                'requiresAdmin' => true,
                'requiresResponsible' => true,
            ]);
        }

        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionRole = strtolower((string) ($sessionAuth['role'] ?? ''));
        if ($sessionRole === 'admin') {
            $sessionAuth = docs_require_admin_session($accessContext);
        } elseif ($sessionRole !== 'user') {
            respond_error('Доступ запрещён. Требуются права администратора или ответственного.', 403, [
                'requiresAdmin' => true,
                'requiresResponsible' => true,
            ]);
        }

        $organization = $accessContext['active'];
        if ($organization === null || $organization === '') {
            respond_error('Не удалось определить организацию для фиксации просмотра.');
        }

        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор документа.');
        }

        $trigger = isset($payload['trigger'])
            ? sanitize_text_field((string) $payload['trigger'], 120)
            : '';
        $viewedAtCandidate = isset($payload['viewedAt']) ? (string) $payload['viewedAt'] : '';
        $viewedAtNormalized = $viewedAtCandidate !== ''
            ? docs_normalize_datetime_iso($viewedAtCandidate)
            : null;

        $details = [];
        if ($trigger !== '') {
            $details['trigger'] = $trigger;
        }
        if ($viewedAtNormalized !== null) {
            $details['viewedAt'] = $viewedAtNormalized;
        }
        if ($sessionRole !== '') {
            $details['viewerRole'] = $sessionRole;
        }
        foreach ([
            'assigneeKey',
            'assigneeId',
            'viewerId',
            'viewerName',
            'name',
            'fullName',
            'login',
            'id',
            'telegram',
            'chatId',
        ] as $field) {
            if (isset($payload[$field]) && is_string($payload[$field])) {
                $value = trim($payload[$field]);
                if ($value !== '') {
                    $details[$field] = $value;
                }
            }
        }

        $requestContext = docs_build_request_user_context();
        docs_log_view_status_event('documents:register_view request', [
            'organization' => $organization,
            'documentId' => $documentId,
            'trigger' => $trigger !== '' ? $trigger : null,
            'viewedAt' => $viewedAtNormalized,
            'sessionRole' => $sessionRole,
            'userId' => $requestContext['primaryId'] ?? null,
        ]);
        $registrationResult = docs_register_task_view_event($organization, $documentId, $requestContext, $details);

        $response = [
            'recorded' => $registrationResult['recorded'] ?? false,
            'alreadyRecorded' => $registrationResult['alreadyRecorded'] ?? false,
        ];

        if (isset($registrationResult['viewedAt'])) {
            $response['viewedAt'] = $registrationResult['viewedAt'];
        }
        if (isset($registrationResult['assigneeKey'])) {
            $response['assigneeKey'] = $registrationResult['assigneeKey'];
        }
        if (isset($registrationResult['id'])) {
            $response['id'] = $registrationResult['id'];
        }
        if (isset($registrationResult['name'])) {
            $response['name'] = $registrationResult['name'];
        }

        docs_log_view_status_event('documents:register_view result', [
            'organization' => $organization,
            'documentId' => $documentId,
            'recorded' => $response['recorded'],
            'alreadyRecorded' => $response['alreadyRecorded'],
            'viewedAt' => $response['viewedAt'] ?? null,
            'assigneeKey' => $response['assigneeKey'] ?? null,
            'userId' => $requestContext['primaryId'] ?? null,
        ]);

        respond_success($response);
        break;

    case 'update':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload) || empty($payload)) {
            $payload = [];
        }
        if (!array_key_exists('fields', $payload) && isset($_FILES['fields'])) {
            $fieldsFile = $_FILES['fields'];
            $fieldsTmpPath = is_array($fieldsFile) ? ($fieldsFile['tmp_name'] ?? '') : '';
            if (is_string($fieldsTmpPath) && $fieldsTmpPath !== '' && is_uploaded_file($fieldsTmpPath)) {
                $rawFields = file_get_contents($fieldsTmpPath);
                if ($rawFields !== false) {
                    $decodedFields = json_decode($rawFields, true, 512, JSON_INVALID_UTF8_SUBSTITUTE);
                    if (is_array($decodedFields)) {
                        $payload['fields'] = $decodedFields;
                    }
                }
            }
        }
        $requestContext = docs_build_request_user_context();
        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionAuth = docs_get_session_auth();
        $sessionRole = is_array($sessionAuth) ? strtolower((string) ($sessionAuth['role'] ?? '')) : '';
        $isAdminSession = $sessionRole === 'admin';
        $isUserSession = $sessionRole === 'user';

        if ($isAdminSession) {
            $sessionAuth = docs_require_admin_session($accessContext);
        } elseif (!$isUserSession) {
            respond_error('Доступ запрещён. Требуются права администратора или ответственного.', 403, [
                'requiresAdmin' => true,
                'requiresResponsible' => true,
            ]);
        }
        $sessionAuthArray = is_array($sessionAuth) ? $sessionAuth : null;
        $canManageSubordinates = docs_user_can_manage_subordinates($sessionAuthArray);
        $organization = $accessContext['active'];
        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор документа.');
        }

        $folder = sanitize_folder_name($organization);
        $records = load_registry($folder);
        $settings = load_admin_settings($folder);
        $responsibles = isset($settings['responsibles']) && is_array($settings['responsibles'])
            ? $settings['responsibles']
            : [];
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
        $userFilter = null;
        if ($isUserSession) {
            $userFilter = docs_build_session_user_filter_from_auth(is_array($sessionAuth) ? $sessionAuth : []);
            if ($userFilter === null) {
                respond_error('Не удалось определить права текущего пользователя.', 403, [
                    'requiresResponsible' => true,
                ]);
            }
        }
        $assignmentAuthorLabel = docs_build_assignment_author_label($sessionAuthArray);
        if ($assignmentAuthorLabel === '') {
            $assignmentAuthorLabel = docs_build_assignment_author_label($requestContext['user'] ?? null);
        }
        $assignmentAuthorMeta = docs_extract_assignment_author_meta($sessionAuthArray);
        if (empty($assignmentAuthorMeta)) {
            $assignmentAuthorMeta = docs_extract_assignment_author_meta($requestContext['user'] ?? null);
        }
        $assignmentAuthorRole = docs_resolve_assignment_author_role_from_session($sessionAuthArray);
        $canManageInstructions = docs_user_can_manage_instructions(
            $organization,
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            $block2
        );
        $statusChangeAuthor = '';
        if (is_array($sessionAuth)) {
            $statusChangeAuthor = docs_build_assignment_author_label($sessionAuth);
        }
        if ($statusChangeAuthor === '') {
            $statusChangeAuthor = docs_build_assignment_author_label($requestContext['user'] ?? null);
        }
        $updated = false;
        $assignmentNotifications = [];
        $assignmentNotificationIndex = [];
        $updatedRecordSanitized = null;
        $filesToDelete = [];
        $filesRemaining = [];
        $hasFilesRemainingPayload = array_key_exists('filesRemaining', $payload);
        if (isset($payload['filesToDelete'])) {
            $filesToDelete = $payload['filesToDelete'];
        }
        if (isset($payload['filesRemaining'])) {
            $filesRemaining = $payload['filesRemaining'];
        }
        $fieldsPayload = $payload['fields'] ?? [];
        if (is_string($fieldsPayload)) {
            $decodedFieldsPayload = json_decode($fieldsPayload, true, 512, JSON_INVALID_UTF8_SUBSTITUTE);
            if ($decodedFieldsPayload === null && json_last_error() !== JSON_ERROR_NONE) {
                $payloadSnippet = $fieldsPayload;
                if (mb_strlen($payloadSnippet, 'UTF-8') > 300) {
                    $payloadSnippet = mb_substr($payloadSnippet, 0, 300, 'UTF-8') . '…';
                }
                docs_log_file_debug('documents:update fields decode failed', [
                    'documentId' => $documentId,
                    'error' => json_last_error_msg(),
                    'fieldsSnippet' => $payloadSnippet,
                ]);
            }
            $fieldsPayload = is_array($decodedFieldsPayload) ? $decodedFieldsPayload : [];
        }
        if (!is_array($fieldsPayload)) {
            $fieldsPayload = [];
        }
        $payload['fields'] = $fieldsPayload;
        $clientStatusRaw = null;
        $clientStatusUpdatedAt = null;
        if (array_key_exists('status', $fieldsPayload)) {
            $clientStatusRaw = is_scalar($fieldsPayload['status']) ? (string) $fieldsPayload['status'] : null;
        }
        if (array_key_exists('statusUpdatedAt', $fieldsPayload)) {
            $clientStatusUpdatedAt = is_scalar($fieldsPayload['statusUpdatedAt'])
                ? (string) $fieldsPayload['statusUpdatedAt']
                : null;
        }
        if ($clientStatusRaw !== null || $clientStatusUpdatedAt !== null) {
            docs_log_view_status_event('documents:update status request', [
                'organization' => $organization,
                'documentId' => $documentId,
                'sessionRole' => $sessionRole,
                'isAdminSession' => $isAdminSession,
                'isUserSession' => $isUserSession,
                'userId' => $requestContext['primaryId'] ?? null,
                'statusRaw' => $clientStatusRaw,
                'statusUpdatedAt' => $clientStatusUpdatedAt,
                'fieldsKeys' => array_keys($fieldsPayload),
            ]);
        }
        if (empty($filesToDelete) && isset($fieldsPayload['filesToDelete'])) {
            $filesToDelete = $fieldsPayload['filesToDelete'];
        }
        if (!$hasFilesRemainingPayload && isset($fieldsPayload['filesRemaining'])) {
            $filesRemaining = $fieldsPayload['filesRemaining'];
            $hasFilesRemainingPayload = true;
        }
        if (is_string($filesToDelete)) {
            $decodedFiles = json_decode($filesToDelete, true);
            $filesToDelete = is_array($decodedFiles) ? $decodedFiles : [];
        }
        if (is_string($filesRemaining)) {
            $decodedFiles = json_decode($filesRemaining, true);
            $filesRemaining = is_array($decodedFiles) ? $decodedFiles : [];
        }
        if (!is_array($filesToDelete)) {
            $filesToDelete = [];
        }
        if (!is_array($filesRemaining)) {
            $filesRemaining = [];
        }
        $filesToDelete = array_values(array_filter(array_map(static function ($value) {
            $sanitized = sanitize_text_field((string) $value, 200);
            return $sanitized !== '' ? $sanitized : null;
        }, $filesToDelete)));
        $filesRemaining = array_values(array_filter(array_map(static function ($value) {
            $sanitized = sanitize_text_field((string) $value, 200);
            return $sanitized !== '' ? $sanitized : null;
        }, $filesRemaining)));

        docs_log_file_debug('documents:update payload received', [
            'organization' => $organization,
            'documentId' => $documentId,
            'fieldsKeys' => array_keys($fieldsPayload),
            'filesToDeleteCount' => count($filesToDelete),
            'filesRemainingCount' => count($filesRemaining),
        ]);

        docs_log_file_debug('files:update payload parsed', [
            'organization' => $organization,
            'documentId' => $documentId,
            'filesToDeleteCount' => count($filesToDelete),
            'filesRemainingCount' => count($filesRemaining),
            'filesToDelete' => $filesToDelete,
            'filesRemaining' => $filesRemaining,
            'hasFilesRemainingPayload' => $hasFilesRemainingPayload,
        ]);

        $registryHandle = null;
        foreach ($records as &$record) {
            if (!is_array($record) || !isset($record['id']) || (string) $record['id'] !== $documentId) {
                continue;
            }

            if ($isUserSession && !document_matches_assignee_filter($record, $userFilter, $responsibles)) {
                if ($registryHandle !== null) {
                    docs_unlock_registry($registryHandle);
                }
                respond_error('Документ не назначен текущему пользователю.', 403, [
                    'documentId' => $documentId,
                    'requiresResponsible' => true,
                ]);
            }

            $fields = $payload['fields'] ?? [];
            if (!is_array($fields)) {
                $fields = [];
            }

            $map = [
                'registryNumber' => fn($value) => sanitize_text_field($value, 120),
                'registrationDate' => fn($value) => sanitize_date_field($value),
                'direction' => fn($value) => sanitize_text_field($value, 60),
                'correspondent' => fn($value) => sanitize_text_field($value, 200),
                'documentNumber' => fn($value) => sanitize_text_field($value, 120),
                'documentDate' => fn($value) => sanitize_date_field($value),
                'executor' => fn($value) => sanitize_text_field($value, 160),
                'summary' => fn($value) => sanitize_text_field($value, 1000),
                'resolution' => fn($value) => sanitize_text_field($value, 1000),
                'dueDate' => fn($value) => sanitize_date_field($value),
                'status' => fn($value) => sanitize_status($value),
                'statusUpdatedAt' => static function ($value) {
                    $normalized = docs_normalize_datetime_iso(is_scalar($value) ? (string) $value : null);
                    return $normalized ?? '';
                },
                'instruction' => fn($value) => sanitize_instruction($value),
                'notes' => fn($value) => sanitize_text_field($value, 500),
                'assignee' => fn($value) => sanitize_assignee_payload(is_array($value) ? $value : [], true),
                'assignees' => fn($value) => sanitize_assignees_payload(is_array($value) ? $value : [], false),
                'subordinates' => fn($value) => sanitize_assignees_payload(is_array($value) ? $value : [], false),
                'director' => fn($value) => sanitize_assignee_payload(is_array($value) ? $value : [], true),
                'directors' => fn($value) => sanitize_assignees_payload(is_array($value) ? $value : [], false),
                'completedAt' => fn($value) => sanitize_date_field($value) ?: date('Y-m-d'),
            ];

            $sanitizedFields = [];
            foreach ($fields as $key => $value) {
                if (!isset($map[$key])) {
                    continue;
                }
                $sanitizedFields[$key] = $map[$key]($value);
            }

            if (array_key_exists('correspondent', $sanitizedFields) && $sanitizedFields['correspondent'] === '') {
                unset($sanitizedFields['correspondent']);
            }

            docs_log_file_debug('documents:update fields sanitized', [
                'documentId' => $documentId,
                'sanitizedKeys' => array_keys($sanitizedFields),
            ]);

            if ($isUserSession) {
                $submittedKeys = array_keys($sanitizedFields);
                $allowedFields = ['status', 'statusUpdatedAt'];
                if ($canManageInstructions) {
                    $allowedFields[] = 'instruction';
                }
                if ($canManageSubordinates) {
                    $allowedFields[] = 'subordinates';
                }
                $forbiddenKeys = array_diff($submittedKeys, $allowedFields);
                if (!empty($forbiddenKeys)) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('Ответственным разрешено изменять только статус.', 403, [
                        'forbiddenFields' => array_values($forbiddenKeys),
                        'requiresAdmin' => true,
                    ]);
                }
            }

            if ($isAdminSession) {
                unset($sanitizedFields['instruction']);
            }

            $statusUpdatedAtOverride = null;
            if ($isAdminSession && array_key_exists('statusUpdatedAt', $sanitizedFields)) {
                $statusUpdatedAtOverride = $sanitizedFields['statusUpdatedAt'] !== ''
                    ? $sanitizedFields['statusUpdatedAt']
                    : null;
            }
            unset($sanitizedFields['statusUpdatedAt']);

            $previousDirectors = docs_extract_directors($record);
            $previousDirectorIndex = empty($previousDirectors)
                ? []
                : docs_index_assignees($previousDirectors);

            $hasAssigneesField = array_key_exists('assignees', $sanitizedFields);
            $hasAssigneeField = array_key_exists('assignee', $sanitizedFields);
            if ($hasAssigneesField || $hasAssigneeField) {
                if (!$isAdminSession) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('Недостаточно прав для изменения ответственных.', 403, [
                        'requiresAdmin' => true,
                    ]);
                }
                $previousAssigneesSnapshot = docs_extract_assignees($record);
                $existingIndex = docs_index_assignees($previousAssigneesSnapshot);

                $sanitizedAssignees = $hasAssigneesField && is_array($sanitizedFields['assignees'])
                    ? array_values($sanitizedFields['assignees'])
                    : [];
                $primaryAssigneePayload = $hasAssigneeField && is_array($sanitizedFields['assignee'])
                    ? $sanitizedFields['assignee']
                    : [];

                if (!empty($primaryAssigneePayload)) {
                    array_unshift($sanitizedAssignees, $primaryAssigneePayload);
                }

                foreach ($sanitizedAssignees as &$assigneeEntry) {
                    if (!is_array($assigneeEntry)) {
                        continue;
                    }

                    $matched = null;
                    $candidateKeys = [];
                    foreach (['id', 'telegram', 'chatId', 'number', 'email'] as $field) {
                        if (empty($assigneeEntry[$field])) {
                            continue;
                        }
                        $normalized = docs_normalize_identifier_candidate_value($assigneeEntry[$field]);
                        if ($normalized !== '') {
                            $candidateKeys[] = 'id::' . $normalized;
                        }
                    }
                    if (!empty($assigneeEntry['name'])) {
                        $nameKey = docs_normalize_name_candidate_value($assigneeEntry['name']);
                        if ($nameKey !== '') {
                            $candidateKeys[] = 'name::' . $nameKey;
                        }
                    }

                    foreach ($candidateKeys as $candidateKey) {
                        if (isset($existingIndex[$candidateKey])) {
                            $matched = $existingIndex[$candidateKey];
                            break;
                        }
                    }

                    $isUnchangedAssignment = $matched !== null && docs_assignment_details_unchanged($matched, $assigneeEntry);
                    if ($isUnchangedAssignment && isset($matched['assignedAt']) && $matched['assignedAt'] !== '') {
                        $assigneeEntry['assignedAt'] = $matched['assignedAt'];
                    }

                    $validatedOverride = $isAdminSession
                        ? docs_validate_assigned_by_override($record, $folder, $assigneeEntry)
                        : null;
                    if ($validatedOverride !== null) {
                        $assigneeEntry['assignedBy'] = $validatedOverride['assignedBy'];
                        if (!empty($validatedOverride['assignedByRole'])) {
                            $assigneeEntry['assignedByRole'] = $validatedOverride['assignedByRole'];
                        }
                        docs_write_response_log('documents:update assignedBy override accepted', [
                            'documentId' => $documentId,
                            'organization' => $organization,
                            'source' => $validatedOverride['source'],
                            'assignee' => sanitize_text_field((string) ($assigneeEntry['name'] ?? ''), 200),
                            'assignedBy' => $validatedOverride['assignedBy'],
                        ]);
                    } elseif (!empty($assigneeEntry['assignedBy'])) {
                        $assigneeEntry['assignedBy'] = '';
                        $assigneeEntry['assignedByRole'] = '';
                        docs_write_response_log('documents:update assignedBy override rejected', [
                            'documentId' => $documentId,
                            'organization' => $organization,
                            'assignee' => sanitize_text_field((string) ($assigneeEntry['name'] ?? ''), 200),
                        ]);
                    }

                    if (!isset($assigneeEntry['assignedAt']) || $assigneeEntry['assignedAt'] === '') {
                        $assigneeEntry['assignedAt'] = date('c');
                    }

                    if (!$isUnchangedAssignment && $validatedOverride === null) {
                        $assigneeEntry['assignedBy'] = $assignmentAuthorLabel;
                        if ($assignmentAuthorRole !== '') {
                            $assigneeEntry['assignedByRole'] = $assignmentAuthorRole;
                        } else {
                            unset($assigneeEntry['assignedByRole']);
                        }
                    } elseif ((!isset($assigneeEntry['assignedBy']) || $assigneeEntry['assignedBy'] === '') && $assignmentAuthorLabel !== '') {
                        $assigneeEntry['assignedBy'] = $assignmentAuthorLabel;
                    }
                    if (!isset($assigneeEntry['assignedByTelegram']) || $assigneeEntry['assignedByTelegram'] === '') {
                        if (!empty($assignmentAuthorMeta['assignedByTelegram'])) {
                            $assigneeEntry['assignedByTelegram'] = $assignmentAuthorMeta['assignedByTelegram'];
                        }
                    }
                    if (!isset($assigneeEntry['assignedById']) || $assigneeEntry['assignedById'] === '') {
                        if (!empty($assignmentAuthorMeta['assignedById'])) {
                            $assigneeEntry['assignedById'] = $assignmentAuthorMeta['assignedById'];
                        }
                    }
                    if (!isset($assigneeEntry['assignedByLogin']) || $assigneeEntry['assignedByLogin'] === '') {
                        if (!empty($assignmentAuthorMeta['assignedByLogin'])) {
                            $assigneeEntry['assignedByLogin'] = $assignmentAuthorMeta['assignedByLogin'];
                        }
                    }
                    if ((!isset($assigneeEntry['assignedByRole']) || $assigneeEntry['assignedByRole'] === '') && $assignmentAuthorRole !== '') {
                        $assigneeEntry['assignedByRole'] = $assignmentAuthorRole;
                    }

                    docs_log_self_assign_marker_warning($assigneeEntry, [
                        'documentId' => $documentId,
                        'organization' => $organization,
                        'branch' => 'assignees_update',
                    ]);
                }
                unset($assigneeEntry);

                $newAssignments = [];
                docs_apply_assignees_to_record($record, $sanitizedAssignees, $newAssignments);

                $updatedAssigneesSnapshot = docs_extract_assignees($record);
                $changedAssignments = docs_collect_changed_assignees($previousAssigneesSnapshot, $updatedAssigneesSnapshot);

                $newAssignmentKeyIndex = [];
                if (!empty($changedAssignments)) {
                    foreach ($changedAssignments as $assignmentEntry) {
                        if (!is_array($assignmentEntry) || empty($assignmentEntry)) {
                            continue;
                        }
                        $keys = docs_collect_assignee_index_keys($assignmentEntry);
                        foreach ($keys as $key) {
                            if ($key !== '') {
                                $newAssignmentKeyIndex[$key] = true;
                            }
                        }
                    }
                }

                unset($sanitizedFields['assignees'], $sanitizedFields['assignee']);
                unset($sanitizedFields['subordinates']);

                $hasDirectorField = array_key_exists('director', $sanitizedFields);
                $hasDirectorsField = array_key_exists('directors', $sanitizedFields);
                if ($hasDirectorField || $hasDirectorsField) {
                    $sanitizedDirectorEntries = [];
                    if ($hasDirectorsField && is_array($sanitizedFields['directors']) && !empty($sanitizedFields['directors'])) {
                        $sanitizedDirectorEntries = array_values(array_filter($sanitizedFields['directors'], static function ($entry) {
                            return is_array($entry) && !empty($entry);
                        }));
                    }
                    if ($hasDirectorField && is_array($sanitizedFields['director']) && !empty($sanitizedFields['director'])) {
                        array_unshift($sanitizedDirectorEntries, $sanitizedFields['director']);
                    }

                    if (!empty($sanitizedDirectorEntries)) {
                        $assignedDirectors = docs_assign_author_to_assignees($sanitizedDirectorEntries, $assignmentAuthorLabel, $assignmentAuthorRole, $assignmentAuthorMeta);
                        $record['director'] = $assignedDirectors[0];
                        if (count($assignedDirectors) > 1) {
                            $record['directors'] = $assignedDirectors;
                        } else {
                            unset($record['directors']);
                        }

                        foreach ($assignedDirectors as $directorEntry) {
                            if (!is_array($directorEntry) || empty($directorEntry)) {
                                continue;
                            }

                            $keys = docs_collect_assignee_index_keys($directorEntry);
                            $duplicate = false;
                            foreach ($keys as $key) {
                                if ($key === '') {
                                    continue;
                                }
                                if (
                                    isset($assignmentNotificationIndex[$key])
                                    || isset($previousDirectorIndex[$key])
                                    || isset($newAssignmentKeyIndex[$key])
                                ) {
                                    $duplicate = true;
                                    break;
                                }
                            }

                            foreach ($keys as $key) {
                                if ($key !== '') {
                                    $assignmentNotificationIndex[$key] = true;
                                }
                            }

                            if ($duplicate) {
                                continue;
                            }

                            $assignmentNotifications[] = $directorEntry;
                        }
                    } else {
                        unset($record['director'], $record['directors']);
                    }

                    unset($sanitizedFields['director'], $sanitizedFields['directors']);
                }

                if (!empty($changedAssignments)) {
                    foreach ($changedAssignments as $assignmentEntry) {
                        if (!is_array($assignmentEntry) || empty($assignmentEntry)) {
                            continue;
                        }

                        $keys = docs_collect_assignee_index_keys($assignmentEntry);
                        $duplicate = false;
                        foreach ($keys as $key) {
                            if ($key !== '' && isset($assignmentNotificationIndex[$key])) {
                                $duplicate = true;
                                break;
                            }
                        }

                        if ($duplicate) {
                            continue;
                        }

                        foreach ($keys as $key) {
                            if ($key !== '') {
                                $assignmentNotificationIndex[$key] = true;
                            }
                        }

                        $assignmentNotifications[] = $assignmentEntry;
                    }
                }
            }

            $hasSubordinatesField = array_key_exists('subordinates', $sanitizedFields);
            if ($hasSubordinatesField && !($hasAssigneesField || $hasAssigneeField)) {
                if (!$canManageSubordinates) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('Недостаточно прав для изменения подчинённых.', 403, [
                        'requiresSubordinateManagement' => true,
                    ]);
                }

                $sanitizedSubordinates = is_array($sanitizedFields['subordinates'])
                    ? array_values($sanitizedFields['subordinates'])
                    : [];
                if (!empty($sanitizedSubordinates)) {
                    $previousAssigneesForSubordinates = docs_extract_assignees($record);
                    $existingSubordinatesIndex = [];
                    foreach ($previousAssigneesForSubordinates as $existingEntry) {
                        if (!is_array($existingEntry) || empty($existingEntry)) {
                            continue;
                        }
                        if (docs_normalize_assignment_role((string) ($existingEntry['role'] ?? '')) !== 'subordinate') {
                            continue;
                        }
                        foreach (docs_collect_assignee_index_keys($existingEntry) as $normalizedKey) {
                            if ($normalizedKey !== '') {
                                $existingSubordinatesIndex[$normalizedKey] = $existingEntry;
                            }
                        }
                    }

                    foreach ($sanitizedSubordinates as &$subordinateEntry) {
                        if (!is_array($subordinateEntry)) {
                            continue;
                        }

                        $subordinateEntry['role'] = 'subordinate';

                        $matchedSubordinate = null;
                        foreach (docs_collect_assignee_index_keys($subordinateEntry) as $candidateKey) {
                            if ($candidateKey !== '' && isset($existingSubordinatesIndex[$candidateKey])) {
                                $matchedSubordinate = $existingSubordinatesIndex[$candidateKey];
                                break;
                            }
                        }

                        $isUnchangedSubordinate = $matchedSubordinate !== null
                            && docs_assignment_details_unchanged($matchedSubordinate, $subordinateEntry);
                        if ($isUnchangedSubordinate && isset($matchedSubordinate['assignedAt']) && $matchedSubordinate['assignedAt'] !== '') {
                            $subordinateEntry['assignedAt'] = $matchedSubordinate['assignedAt'];
                        }

                        $validatedOverride = $isAdminSession
                            ? docs_validate_assigned_by_override($record, $folder, $subordinateEntry)
                            : null;
                        if ($validatedOverride !== null) {
                            $subordinateEntry['assignedBy'] = $validatedOverride['assignedBy'];
                            if (!empty($validatedOverride['assignedByRole'])) {
                                $subordinateEntry['assignedByRole'] = $validatedOverride['assignedByRole'];
                            }
                            docs_write_response_log('documents:update subordinate assignedBy override accepted', [
                                'documentId' => $documentId,
                                'organization' => $organization,
                                'source' => $validatedOverride['source'],
                                'subordinate' => sanitize_text_field((string) ($subordinateEntry['name'] ?? ''), 200),
                                'assignedBy' => $validatedOverride['assignedBy'],
                            ]);
                        } elseif (!empty($subordinateEntry['assignedBy'])) {
                            $subordinateEntry['assignedBy'] = '';
                            $subordinateEntry['assignedByRole'] = '';
                            docs_write_response_log('documents:update subordinate assignedBy override rejected', [
                                'documentId' => $documentId,
                                'organization' => $organization,
                                'subordinate' => sanitize_text_field((string) ($subordinateEntry['name'] ?? ''), 200),
                            ]);
                        }

                        if (!isset($subordinateEntry['assignedAt']) || $subordinateEntry['assignedAt'] === '') {
                            $subordinateEntry['assignedAt'] = date('c');
                        }

                        if (!$isUnchangedSubordinate && $validatedOverride === null) {
                            $subordinateEntry['assignedBy'] = $assignmentAuthorLabel;
                            if ($assignmentAuthorRole !== '') {
                                $subordinateEntry['assignedByRole'] = $assignmentAuthorRole;
                            } else {
                                unset($subordinateEntry['assignedByRole']);
                            }
                        } elseif ((!isset($subordinateEntry['assignedBy']) || $subordinateEntry['assignedBy'] === '') && $assignmentAuthorLabel !== '') {
                            $subordinateEntry['assignedBy'] = $assignmentAuthorLabel;
                        }
                        if (!isset($subordinateEntry['assignedByTelegram']) || $subordinateEntry['assignedByTelegram'] === '') {
                            if (!empty($assignmentAuthorMeta['assignedByTelegram'])) {
                                $subordinateEntry['assignedByTelegram'] = $assignmentAuthorMeta['assignedByTelegram'];
                            }
                        }
                        if (!isset($subordinateEntry['assignedById']) || $subordinateEntry['assignedById'] === '') {
                            if (!empty($assignmentAuthorMeta['assignedById'])) {
                                $subordinateEntry['assignedById'] = $assignmentAuthorMeta['assignedById'];
                            }
                        }
                        if (!isset($subordinateEntry['assignedByLogin']) || $subordinateEntry['assignedByLogin'] === '') {
                            if (!empty($assignmentAuthorMeta['assignedByLogin'])) {
                                $subordinateEntry['assignedByLogin'] = $assignmentAuthorMeta['assignedByLogin'];
                            }
                        }
                        if ((!isset($subordinateEntry['assignedByRole']) || $subordinateEntry['assignedByRole'] === '') && $assignmentAuthorRole !== '') {
                            $subordinateEntry['assignedByRole'] = $assignmentAuthorRole;
                        }

                        docs_log_self_assign_marker_warning($subordinateEntry, [
                            'documentId' => $documentId,
                            'organization' => $organization,
                            'branch' => 'subordinates_update',
                        ]);
                    }
                    unset($subordinateEntry);
                }

                $existingAssignees = docs_extract_assignees($record);
                $responsibleEntries = [];
                foreach ($existingAssignees as $existingAssignee) {
                    if (!is_array($existingAssignee)) {
                        continue;
                    }
                    $roleValue = strtolower((string) ($existingAssignee['role'] ?? ''));
                    if ($roleValue === 'subordinate') {
                        continue;
                    }
                    $responsibleEntries[] = $existingAssignee;
                }

                $combinedAssignees = array_merge($responsibleEntries, $sanitizedSubordinates);
                $previousAssigneesForSubordinates = $previousAssigneesForSubordinates ?? docs_extract_assignees($record);
                $newAssignments = [];
                docs_apply_assignees_to_record($record, $combinedAssignees, $newAssignments);

                if (!empty($sanitizedSubordinates)) {
                    $record['subordinates'] = array_values($sanitizedSubordinates);
                } else {
                    unset($record['subordinates']);
                }
                unset($record['subordinate']);

                $updatedAssigneesForSubordinates = docs_extract_assignees($record);
                $changedSubordinateAssignments = docs_collect_changed_assignees(
                    $previousAssigneesForSubordinates,
                    $updatedAssigneesForSubordinates
                );

                docs_update_instruction_from_subordinates($record);

                if (!empty($changedSubordinateAssignments)) {
                    foreach ($changedSubordinateAssignments as $assignmentEntry) {
                        if (!is_array($assignmentEntry) || empty($assignmentEntry)) {
                            continue;
                        }
                        $keys = docs_collect_assignee_index_keys($assignmentEntry);
                        $duplicate = false;
                        foreach ($keys as $key) {
                            if ($key !== '' && isset($assignmentNotificationIndex[$key])) {
                                $duplicate = true;
                                break;
                            }
                        }
                        if ($duplicate) {
                            continue;
                        }
                        foreach ($keys as $key) {
                            if ($key !== '') {
                                $assignmentNotificationIndex[$key] = true;
                            }
                        }
                        $assignmentNotifications[] = $assignmentEntry;
                    }
                }

                unset($sanitizedFields['subordinates']);
            } elseif ($hasSubordinatesField) {
                unset($sanitizedFields['subordinates']);
            }

            foreach ($sanitizedFields as $key => $sanitized) {
                if ($key === 'status') {
                    if ($sanitized === '') {
                        continue;
                    }
                    $previousStatus = isset($record['status']) ? (string) $record['status'] : '';
                    $statusAssigneeKey = docs_match_status_change_assignee_key(
                        $record,
                        $requestContext,
                        $sessionAuthArray,
                        $statusChangeAuthor
                    );
                    $assigneeStatusTimestamp = $statusUpdatedAtOverride
                        ?? (is_string($clientStatusUpdatedAt) && $clientStatusUpdatedAt !== '' ? $clientStatusUpdatedAt : null)
                        ?? date('c');
                    $shouldUpdateSharedStatus = !$isUserSession
                        || $statusAssigneeKey === null
                        || $statusAssigneeKey === '';
                    if ($shouldUpdateSharedStatus) {
                        if ($previousStatus !== $sanitized) {
                            $record['status'] = $sanitized;
                            $record['statusUpdatedAt'] = $statusUpdatedAtOverride ?? date('c');
                            docs_append_status_history(
                                $record,
                                $sanitized,
                                $statusChangeAuthor,
                                $record['statusUpdatedAt'],
                                $statusAssigneeKey
                            );
                            docs_log_view_status_event('documents:update status applied', [
                                'organization' => $organization,
                                'documentId' => $documentId,
                                'previousStatus' => $previousStatus,
                                'nextStatus' => $sanitized,
                                'statusUpdatedAt' => $record['statusUpdatedAt'],
                                'statusUpdatedAtClient' => $clientStatusUpdatedAt,
                                'userId' => $requestContext['primaryId'] ?? null,
                            ]);
                        } else {
                            if ($statusAssigneeKey !== null && $statusAssigneeKey !== '') {
                                docs_append_assignee_status_history($record, $statusAssigneeKey, [
                                    'status' => $sanitized,
                                    'changedAt' => $assigneeStatusTimestamp,
                                    'changedBy' => $statusChangeAuthor,
                                ]);
                                docs_log_view_status_event('documents:update assignee status applied', [
                                    'organization' => $organization,
                                    'documentId' => $documentId,
                                    'status' => $sanitized,
                                    'assigneeKey' => $statusAssigneeKey,
                                    'statusUpdatedAt' => $assigneeStatusTimestamp,
                                    'userId' => $requestContext['primaryId'] ?? null,
                                ]);
                            }
                            if ($statusUpdatedAtOverride !== null) {
                                $record['statusUpdatedAt'] = $statusUpdatedAtOverride;
                                docs_log_view_status_event('documents:update status timestamp updated', [
                                    'organization' => $organization,
                                    'documentId' => $documentId,
                                    'status' => $previousStatus,
                                    'statusUpdatedAt' => $record['statusUpdatedAt'],
                                    'statusUpdatedAtClient' => $clientStatusUpdatedAt,
                                    'userId' => $requestContext['primaryId'] ?? null,
                                ]);
                                continue;
                            }
                            docs_log_view_status_event('documents:update status unchanged', [
                                'organization' => $organization,
                                'documentId' => $documentId,
                                'status' => $previousStatus,
                                'statusUpdatedAtClient' => $clientStatusUpdatedAt,
                                'userId' => $requestContext['primaryId'] ?? null,
                            ]);
                        }
                    } else {
                        docs_append_assignee_status_history($record, $statusAssigneeKey, [
                            'status' => $sanitized,
                            'changedAt' => $assigneeStatusTimestamp,
                            'changedBy' => $statusChangeAuthor,
                        ]);
                        docs_log_view_status_event('documents:update assignee status applied', [
                            'organization' => $organization,
                            'documentId' => $documentId,
                            'status' => $sanitized,
                            'assigneeKey' => $statusAssigneeKey,
                            'statusUpdatedAt' => $assigneeStatusTimestamp,
                            'userId' => $requestContext['primaryId'] ?? null,
                        ]);
                    }
                    continue;
                }

                if ($key === 'completedAt') {
                    if ($sanitized === '') {
                        continue;
                    }
                    $record[$key] = $sanitized;
                    continue;
                }

                $record[$key] = $sanitized;
            }

            if ($statusUpdatedAtOverride !== null && $isAdminSession && !array_key_exists('status', $sanitizedFields)) {
                $record['statusUpdatedAt'] = $statusUpdatedAtOverride;
                docs_log_view_status_event('documents:update status timestamp updated', [
                    'organization' => $organization,
                    'documentId' => $documentId,
                    'status' => isset($record['status']) ? (string) $record['status'] : '',
                    'statusUpdatedAt' => $record['statusUpdatedAt'],
                    'statusUpdatedAtClient' => $clientStatusUpdatedAt,
                    'userId' => $requestContext['primaryId'] ?? null,
                ]);
            }

            $filesUpdated = false;
            if ($isAdminSession) {
                if (!isset($record['files']) || !is_array($record['files'])) {
                    $record['files'] = [];
                }

                if (!empty($filesToDelete) || $hasFilesRemainingPayload) {
                    $initialFileCount = count($record['files']);
                    $deleteLookup = !empty($filesToDelete) ? array_fill_keys($filesToDelete, true) : [];
                    $remainingLookup = !empty($filesRemaining) ? array_fill_keys($filesRemaining, true) : [];
                    $remainingFiles = [];
                    foreach ($record['files'] as $file) {
                        if (!is_array($file)) {
                            continue;
                        }
                        $storedName = isset($file['storedName']) ? (string) $file['storedName'] : '';
                        $originalName = isset($file['originalName']) ? (string) $file['originalName'] : '';
                        $urlName = '';
                        if (!empty($file['url'])) {
                            $urlPath = parse_url((string) $file['url'], PHP_URL_PATH);
                            if (is_string($urlPath) && $urlPath !== '') {
                                $urlName = rawurldecode(basename($urlPath));
                            }
                        }
                        $candidateNames = array_values(array_filter([$storedName, $originalName, $urlName], static function ($value) {
                            return is_string($value) && $value !== '';
                        }));
                        $matchesDelete = false;
                        $matchesRemaining = !$hasFilesRemainingPayload;
                        foreach ($candidateNames as $candidateName) {
                            if (isset($deleteLookup[$candidateName])) {
                                $matchesDelete = true;
                            }
                            if (isset($remainingLookup[$candidateName])) {
                                $matchesRemaining = true;
                            }
                        }
                        docs_log_file_debug('files:update match check', [
                            'documentId' => $documentId,
                            'storedName' => $storedName,
                            'originalName' => $originalName,
                            'urlName' => $urlName,
                            'candidateNames' => $candidateNames,
                            'matchesDelete' => $matchesDelete,
                            'matchesRemaining' => $matchesRemaining,
                            'hasFilesRemainingPayload' => $hasFilesRemainingPayload,
                        ]);
                        if ($matchesDelete || !$matchesRemaining) {
                            docs_log_file_debug('files:update file removed from record', [
                                'documentId' => $documentId,
                                'storedName' => $storedName,
                                'originalName' => $originalName,
                                'urlName' => $urlName,
                                'candidateNames' => $candidateNames,
                                'reason' => $matchesDelete ? 'matchesDelete' : 'notInRemaining',
                            ]);
                            $filesUpdated = true;
                            continue;
                        }
                        $remainingFiles[] = $file;
                    }
                    $record['files'] = $remainingFiles;
                    docs_log_file_debug('files:update summary', [
                        'documentId' => $documentId,
                        'initialFilesCount' => $initialFileCount,
                        'remainingFilesCount' => count($record['files']),
                        'filesUpdated' => $filesUpdated,
                    ]);
                }

                if (!empty($_FILES['attachments']) && isset($_FILES['attachments']['name'])) {
                    $dir = ensure_organization_directory($folder);
                    $names = $_FILES['attachments']['name'];
                    $tmpNames = $_FILES['attachments']['tmp_name'];
                    $errors = $_FILES['attachments']['error'];
                    $sizes = $_FILES['attachments']['size'];
                    $existingFileCount = count($record['files']);
                    $incomingCount = is_array($names) ? count($names) : ($names !== '' ? 1 : 0);

                    docs_log_file_debug('files:update upload payload', [
                        'documentId' => $documentId,
                        'incomingCount' => $incomingCount,
                        'errors' => $errors,
                        'sizes' => $sizes,
                        'namesSample' => is_array($names) ? array_slice($names, 0, 5) : [$names],
                        'existingFileCount' => $existingFileCount,
                    ]);

                    if (is_array($names)) {
                        $count = count($names);
                        for ($i = 0; $i < $count; $i++) {
                            if (!isset($errors[$i]) || $errors[$i] !== UPLOAD_ERR_OK) {
                                docs_log_file_debug('files:update skipped upload error', [
                                    'documentId' => $documentId,
                                    'index' => $i,
                                    'name' => $names[$i] ?? '',
                                    'error' => $errors[$i] ?? null,
                                ]);
                                continue;
                            }

                            $originalName = docs_normalize_uploaded_filename((string) $names[$i]);
                            $tmpPath = (string) $tmpNames[$i];
                            if (!is_uploaded_file($tmpPath)) {
                                docs_log_file_debug('files:update temp file missing', [
                                    'documentId' => $documentId,
                                    'index' => $i,
                                    'name' => $originalName,
                                    'tmpPath' => $tmpPath,
                                ]);
                                continue;
                            }

                            $storedName = normalize_file_name($originalName, $record, $existingFileCount + $i + 1);
                            $target = $dir . '/' . $storedName;

                            if (move_uploaded_file($tmpPath, $target)) {
                                $record['files'][] = [
                                    'originalName' => $originalName,
                                    'storedName' => $storedName,
                                    'size' => (int) ($sizes[$i] ?? filesize($target) ?: 0),
                                    'uploadedAt' => date('c'),
                                    'url' => build_public_path($folder, $storedName),
                                ];
                                $filesUpdated = true;
                                docs_log_file_debug('files:update stored', [
                                    'documentId' => $documentId,
                                    'index' => $i,
                                    'originalName' => $originalName,
                                    'storedName' => $storedName,
                                    'size' => $sizes[$i] ?? null,
                                ]);
                            } else {
                                docs_log_file_debug('files:update move failed', [
                                    'documentId' => $documentId,
                                    'index' => $i,
                                    'originalName' => $originalName,
                                    'storedName' => $storedName,
                                    'target' => $target,
                                ]);
                            }
                        }
                    } elseif ($errors === UPLOAD_ERR_OK) {
                        $originalNameSingle = docs_normalize_uploaded_filename((string) $names);
                        $tmpPathSingle = (string) $tmpNames;
                        if (is_uploaded_file($tmpPathSingle)) {
                            $storedNameSingle = normalize_file_name($originalNameSingle, $record, $existingFileCount + 1);
                            $targetSingle = $dir . '/' . $storedNameSingle;
                            if (move_uploaded_file($tmpPathSingle, $targetSingle)) {
                                $record['files'][] = [
                                    'originalName' => $originalNameSingle,
                                    'storedName' => $storedNameSingle,
                                    'size' => (int) ($sizes ?? filesize($targetSingle) ?: 0),
                                    'uploadedAt' => date('c'),
                                    'url' => build_public_path($folder, $storedNameSingle),
                                ];
                                $filesUpdated = true;
                                docs_log_file_debug('files:update stored single', [
                                    'documentId' => $documentId,
                                    'originalName' => $originalNameSingle,
                                    'storedName' => $storedNameSingle,
                                    'size' => $sizes ?? null,
                                ]);
                            } else {
                                docs_log_file_debug('files:update move failed single', [
                                    'documentId' => $documentId,
                                    'originalName' => $originalNameSingle,
                                    'storedName' => $storedNameSingle,
                                    'target' => $targetSingle,
                                ]);
                            }
                        } else {
                            docs_log_file_debug('files:update temp file missing single', [
                                'documentId' => $documentId,
                                'name' => $originalNameSingle,
                                'tmpPath' => $tmpPathSingle,
                            ]);
                        }
                    } else {
                        docs_log_file_debug('files:update skipped upload error single', [
                            'documentId' => $documentId,
                            'name' => is_string($names) ? $names : '',
                            'error' => $errors,
                        ]);
                    }
                }
            }

            $record['updatedAt'] = date('c');
            $updated = true;
            $updatedRecordSanitized = $record;
            docs_log_file_debug('documents:update record updated', [
                'documentId' => $documentId,
                'updatedAt' => $record['updatedAt'] ?? null,
                'savedRegistryNumber' => $record['registryNumber'] ?? null,
                'savedRegistrationDate' => $record['registrationDate'] ?? null,
            ]);
            break;
        }
        unset($record);

        if (!$updated) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Документ не найден.');
        }

        if ($registryHandle !== null) {
            docs_save_registry_locked($registryHandle, $records);
            docs_unlock_registry($registryHandle);
        } else {
            save_registry($folder, $records);
        }

        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null
            ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles)
            : $preparedRecords;

        $notificationRecord = null;
        if (!empty($assignmentNotifications)) {
            if (!empty($preparedRecords)) {
                foreach ($preparedRecords as $preparedRecord) {
                    if (!is_array($preparedRecord)) {
                        continue;
                    }

                    if ((string) ($preparedRecord['id'] ?? '') === $documentId) {
                        $notificationRecord = $preparedRecord;
                        break;
                    }
                }
            }

            if ($notificationRecord === null && is_array($updatedRecordSanitized)) {
                $notificationRecord = $updatedRecordSanitized;
            }
        }

        $permissions = docs_build_permissions_summary(
            $organization,
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            $block2
        );

        $responsePayload = [
            'message' => 'Данные документа обновлены.',
            'organization' => $organization,
            'organizations' => $accessContext['accessible'],
            'storageDisplayPath' => 'documents/' . $folder,
            'storagePath' => build_public_path($folder),
            'documents' => array_values($filteredRecords),
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
            'canCreateDocuments' => $permissions['canCreateDocuments'],
            'canDeleteDocuments' => $permissions['canDeleteDocuments'],
        ];

        if (!empty($assignmentNotifications) && $notificationRecord !== null) {
            respond_success_with_background_task($responsePayload, function () use (
                $assignmentNotifications,
                $notificationRecord,
                $organization
            ): void {
                docs_send_task_assignment_notifications($assignmentNotifications, $notificationRecord, $organization);
            });
        }

        respond_success($responsePayload);
        break;


    case 'response_viewer_log':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }

        $requestContext = docs_build_request_user_context();
        $sessionAuth = docs_get_session_auth();
        $stage = sanitize_text_field((string) ($payload['stage'] ?? ''), 80);
        $details = isset($payload['details']) && is_array($payload['details']) ? $payload['details'] : [];
        $organizationCandidate = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $activeOrganization = $organizationCandidate !== '' ? $organizationCandidate : docs_resolve_access_context('')['active'];

        docs_write_response_log('Лог просмотра ответа: ' . ($stage !== '' ? $stage : 'unknown'), [
            'stage' => $stage,
            'organization' => $activeOrganization,
            'user' => [
                'label' => docs_resolve_current_user_label($requestContext, is_array($sessionAuth) ? $sessionAuth : null),
                'key' => docs_resolve_current_user_key($requestContext, is_array($sessionAuth) ? $sessionAuth : null),
                'telegramId' => isset($requestContext['telegramId']) ? (string) $requestContext['telegramId'] : '',
            ],
            'details' => docs_normalize_debug_details($details),
        ]);

        respond_success([
            'logged' => true,
            'stage' => $stage !== '' ? $stage : 'unknown',
        ]);
        break;


    case 'response_upload':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $requestedOrganization = docs_normalize_organization_candidate($_POST['organization'] ?? '');
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        $documentId = sanitize_text_field((string) ($_POST['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор документа.');
        }

        $requestContext = docs_build_request_user_context();
        $sessionAuth = docs_get_session_auth();

        [$registryHandle, $records] = docs_lock_registry($folder);
        if ($registryHandle === null) {
            $records = load_registry($folder);
        }

        $recordIndex = null;
        foreach ($records as $index => $record) {
            if (is_array($record) && (string) ($record['id'] ?? '') === $documentId) {
                $recordIndex = $index;
                break;
            }
        }

        if ($recordIndex === null) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Документ не найден.', 404);
        }

        $assignmentEntry = docs_find_assignment_entry_with_upload_fallback(
            $records[$recordIndex],
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            false
        );
        $requestCandidates = docs_collect_request_identity_candidates($requestContext);
        $hasGlobalUploadAccess = (bool) ($accessContext['forceAccess'] ?? false)
            || (bool) ($accessContext['accessGranted'] ?? false)
            || is_array($sessionAuth);
        $hasDocumentUploadAccess = $assignmentEntry !== null
            || docs_user_has_assignee_view_access(
                is_array($records[$recordIndex]) ? $records[$recordIndex] : [],
                $requestContext
            );
        if (!$hasGlobalUploadAccess && !$hasDocumentUploadAccess) {
            docs_write_response_log('Отклонена загрузка файла Ответ к задаче: доступ запрещён', [
                'organization' => $organization,
                'folder' => $folder,
                'documentId' => $documentId,
                'requestUser' => [
                    'label' => docs_resolve_current_user_label($requestContext, is_array($sessionAuth) ? $sessionAuth : null),
                    'key' => docs_resolve_current_user_key($requestContext, is_array($sessionAuth) ? $sessionAuth : null),
                    'telegramId' => isset($requestContext['telegramId']) ? (string) $requestContext['telegramId'] : '',
                ],
                'authorization' => [
                    'globalAccess' => $hasGlobalUploadAccess,
                    'documentAssigneeAccess' => $hasDocumentUploadAccess,
                ],
                'requestCandidates' => $requestCandidates,
                'assignmentSnapshot' => docs_collect_assignment_log_snapshot(
                    is_array($records[$recordIndex]) ? $records[$recordIndex] : []
                ),
                'dataSources' => docs_collect_response_log_sources($folder),
            ]);
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Доступ запрещён.', 403);
        }

        if (!isset($records[$recordIndex]['responses']) || !is_array($records[$recordIndex]['responses'])) {
            $records[$recordIndex]['responses'] = [];
        }

        $responseMessageRaw = isset($_POST['responseMessage']) ? (string) $_POST['responseMessage'] : '';
        $responseMessage = trim(str_replace("\r\n", "\n", str_replace("\r", "\n", $responseMessageRaw)));
        if ($responseMessage !== '') {
            $responseMessage = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $responseMessage) ?? '';
            if (mb_strlen($responseMessage, 'UTF-8') > 12000) {
                $responseMessage = mb_substr($responseMessage, 0, 12000, 'UTF-8');
            }
            $responseMessage = trim($responseMessage);
        }

        $hasAttachments = !empty($_FILES['attachments']) && isset($_FILES['attachments']['name']);
        $hasResponseMessage = $responseMessage !== '';
        if (!$hasAttachments && !$hasResponseMessage) {
            docs_write_response_log('Отклонена загрузка файла Ответ к задаче: файлы не переданы', [
                'organization' => $organization,
                'folder' => $folder,
                'documentId' => $documentId,
                'requestUser' => [
                    'label' => docs_resolve_current_user_label($requestContext, is_array($sessionAuth) ? $sessionAuth : null),
                    'key' => docs_resolve_current_user_key($requestContext, is_array($sessionAuth) ? $sessionAuth : null),
                    'telegramId' => isset($requestContext['telegramId']) ? (string) $requestContext['telegramId'] : '',
                ],
                'filesKeys' => array_keys($_FILES),
                'postKeys' => array_keys($_POST),
                'hasResponseMessage' => $hasResponseMessage,
                'dataSources' => docs_collect_response_log_sources($folder),
            ]);
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Добавьте файл или введите текст ответа.', 422);
        }

        $responseDir = docs_get_document_responses_dir($folder, $documentId, true);
        $resolvedUploadAuthor = docs_resolve_response_upload_author($folder, $requestContext, is_array($sessionAuth) ? $sessionAuth : null);
        $uploaderKey = (string) ($resolvedUploadAuthor['key'] ?? '');
        $uploaderLabel = (string) ($resolvedUploadAuthor['label'] ?? 'Пользователь');
        $uploaderSource = (string) ($resolvedUploadAuthor['source'] ?? 'fallback');
        $uploadedAt = date('c');
        $names = $hasAttachments ? $_FILES['attachments']['name'] : [];
        $tmpNames = $hasAttachments ? $_FILES['attachments']['tmp_name'] : [];
        $errors = $hasAttachments ? $_FILES['attachments']['error'] : [];
        $sizes = $hasAttachments ? $_FILES['attachments']['size'] : [];
        $sequenceBase = count($records[$recordIndex]['responses']);
        $uploadedStoredNames = [];
        docs_write_response_log('Определён автор загрузки ответа', [
            'organization' => $organization,
            'folder' => $folder,
            'documentId' => $documentId,
            'selectedSource' => $uploaderSource,
            'uploadedBy' => $uploaderLabel,
            'uploadedByKey' => $uploaderKey,
            'telegramUserId' => (string) ($resolvedUploadAuthor['telegramUserId'] ?? ''),
            'matchedResponsible' => (string) ($resolvedUploadAuthor['matchedResponsible'] ?? ''),
        ]);
        docs_write_response_log('Старт загрузки файла Ответ к задаче', [
            'organization' => $organization,
            'folder' => $folder,
            'documentId' => $documentId,
            'uploader' => [
                'label' => $uploaderLabel,
                'key' => $uploaderKey,
                'source' => $uploaderSource,
            ],
            'uploaderResolution' => [
                'selectedSource' => $uploaderSource,
                'postUploadedBy' => sanitize_text_field((string) ($_POST['uploadedBy'] ?? ''), 200),
                'postUploadedByKey' => sanitize_text_field((string) ($_POST['uploadedByKey'] ?? ''), 200),
                'telegramUserId' => (string) ($resolvedUploadAuthor['telegramUserId'] ?? ''),
                'matchedResponsible' => (string) ($resolvedUploadAuthor['matchedResponsible'] ?? ''),
            ],
            'dataSources' => docs_collect_response_log_sources($folder),
            'responseDirectory' => $responseDir,
            'requestCandidates' => $requestCandidates,
            'matchedAssignmentEntry' => is_array($assignmentEntry) ? docs_normalize_debug_details($assignmentEntry) : null,
            'assignmentSnapshot' => docs_collect_assignment_log_snapshot(
                is_array($records[$recordIndex]) ? $records[$recordIndex] : []
            ),
            'requestMeta' => [
                'contentType' => isset($_SERVER['CONTENT_TYPE']) ? (string) $_SERVER['CONTENT_TYPE'] : '',
                'contentLength' => isset($_SERVER['CONTENT_LENGTH']) ? (string) $_SERVER['CONTENT_LENGTH'] : '',
                'userAgent' => isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '',
                'postMaxSize' => ini_get('post_max_size') ?: '',
                'uploadMaxFilesize' => ini_get('upload_max_filesize') ?: '',
                'maxFileUploads' => ini_get('max_file_uploads') ?: '',
            ],
            'hasResponseMessage' => $hasResponseMessage,
            'responseMessageLength' => mb_strlen($responseMessage, 'UTF-8'),
            'rawFiles' => $hasAttachments ? docs_normalize_debug_details($_FILES['attachments']) : [],
        ]);

        $uploadErrors = [];
        $processUpload = function ($name, $tmpPath, $error, $size, $sequence) use (&$records, $recordIndex, $responseDir, $folder, $documentId, $uploadedAt, $uploaderKey, $uploaderLabel, &$uploadedStoredNames, &$uploadErrors, $organization) {
            $normalizedName = docs_normalize_uploaded_filename((string) $name);
            if ($error !== UPLOAD_ERR_OK) {
                $uploadErrors[] = [
                    'name' => $normalizedName,
                    'error' => $error,
                ];
                docs_write_response_log('Ошибка загрузки файла Ответ к задаче: upload error', [
                    'organization' => $organization,
                    'folder' => $folder,
                    'documentId' => $documentId,
                    'file' => [
                        'name' => $normalizedName,
                        'size' => (int) $size,
                        'tmpPath' => (string) $tmpPath,
                        'sequence' => (int) $sequence,
                    ],
                    'error' => $error,
                ]);
                return;
            }

            if (!is_uploaded_file($tmpPath)) {
                $uploadErrors[] = [
                    'name' => $normalizedName,
                    'error' => 'tmp_unavailable',
                ];
                docs_write_response_log('Ошибка загрузки файла Ответ к задаче: tmp file unavailable', [
                    'organization' => $organization,
                    'folder' => $folder,
                    'documentId' => $documentId,
                    'file' => [
                        'name' => $normalizedName,
                        'size' => (int) $size,
                        'tmpPath' => (string) $tmpPath,
                        'sequence' => (int) $sequence,
                    ],
                ]);
                return;
            }
            $originalName = $normalizedName;
            $storedName = docs_normalize_response_file_name($originalName, $records[$recordIndex], $sequence);
            $target = $responseDir . '/' . $storedName;
            if (!@move_uploaded_file($tmpPath, $target)) {
                $uploadErrors[] = [
                    'name' => $normalizedName,
                    'error' => 'move_failed',
                ];
                docs_write_response_log('Ошибка загрузки файла Ответ к задаче: move failed', [
                    'organization' => $organization,
                    'folder' => $folder,
                    'documentId' => $documentId,
                    'file' => [
                        'name' => $normalizedName,
                        'storedName' => $storedName,
                        'size' => (int) $size,
                        'tmpPath' => (string) $tmpPath,
                        'target' => $target,
                        'sequence' => (int) $sequence,
                    ],
                ]);
                return;
            }
            $uploadedStoredNames[] = $storedName;
            $records[$recordIndex]['responses'][] = [
                'originalName' => $originalName,
                'storedName' => $storedName,
                'size' => (int) ($size ?: (is_file($target) ? filesize($target) : 0)),
                'uploadedAt' => $uploadedAt,
                'uploadedBy' => $uploaderLabel,
                'uploadedByKey' => $uploaderKey,
                'url' => build_public_path($folder, 'Ответы/' . $documentId . '/' . $storedName),
            ];
        };

        if ($hasAttachments && is_array($names)) {
            foreach ($names as $i => $name) {
                $processUpload($name, (string) ($tmpNames[$i] ?? ''), (int) ($errors[$i] ?? UPLOAD_ERR_NO_FILE), (int) ($sizes[$i] ?? 0), $sequenceBase + $i + 1);
            }
        } elseif ($hasAttachments) {
            $processUpload($names, (string) $tmpNames, (int) $errors, (int) $sizes, $sequenceBase + 1);
        }

        if ($hasResponseMessage) {
            $messageSequence = $sequenceBase + count($uploadedStoredNames) + 1;
            $messageTimestamp = date('Y-m-d_H-i-s');
            $originalName = docs_normalize_uploaded_filename('Ответ-сообщение_' . $messageTimestamp . '.txt');
            $storedName = docs_normalize_response_file_name($originalName, $records[$recordIndex], $messageSequence);
            $target = $responseDir . '/' . $storedName;
            $messageBody = $responseMessage . "\n";
            $bytesWritten = @file_put_contents($target, $messageBody);

            if ($bytesWritten === false) {
                $uploadErrors[] = [
                    'name' => $originalName,
                    'error' => 'message_write_failed',
                ];
                docs_write_response_log('Ошибка загрузки файла Ответ к задаче: message write failed', [
                    'organization' => $organization,
                    'folder' => $folder,
                    'documentId' => $documentId,
                    'file' => [
                        'name' => $originalName,
                        'storedName' => $storedName,
                        'target' => $target,
                        'sequence' => (int) $messageSequence,
                    ],
                ]);
            } else {
                $uploadedStoredNames[] = $storedName;
                $records[$recordIndex]['responses'][] = [
                    'originalName' => $originalName,
                    'storedName' => $storedName,
                    'size' => (int) (is_file($target) ? filesize($target) : $bytesWritten),
                    'uploadedAt' => $uploadedAt,
                    'uploadedBy' => $uploaderLabel,
                    'uploadedByKey' => $uploaderKey,
                    'url' => build_public_path($folder, 'Ответы/' . $documentId . '/' . $storedName),
                ];
            }
        }

        if (empty($uploadedStoredNames)) {
            $uploadErrorCode = null;
            foreach ($uploadErrors as $uploadError) {
                if (isset($uploadError['error']) && is_int($uploadError['error'])) {
                    $uploadErrorCode = (int) $uploadError['error'];
                    break;
                }
            }

            $uploadErrorMessage = 'Не удалось загрузить файлы ответа.';
            if ($uploadErrorCode === UPLOAD_ERR_INI_SIZE || $uploadErrorCode === UPLOAD_ERR_FORM_SIZE) {
                $uploadErrorMessage = 'Файл слишком большой. Уменьшите размер фото или отправьте файл до 2 МБ.';
            } elseif ($uploadErrorCode === UPLOAD_ERR_PARTIAL) {
                $uploadErrorMessage = 'Файл загружен не полностью. Проверьте интернет и повторите попытку.';
            } elseif ($uploadErrorCode === UPLOAD_ERR_NO_FILE) {
                $uploadErrorMessage = 'Файл не выбран. Попробуйте выбрать файл ещё раз.';
            }

            docs_write_response_log('Не удалось сохранить файл Ответ к задаче', [
                'organization' => $organization,
                'folder' => $folder,
                'documentId' => $documentId,
                'uploadErrors' => $uploadErrors,
                'dataSources' => docs_collect_response_log_sources($folder),
                'responseDirectory' => $responseDir,
                'requestCandidates' => $requestCandidates,
                'assignmentSnapshot' => docs_collect_assignment_log_snapshot(
                    is_array($records[$recordIndex]) ? $records[$recordIndex] : []
                ),
            ]);
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error($uploadErrorMessage, 422, [
                'uploadErrors' => $uploadErrors,
            ]);
        }

        $records[$recordIndex]['updatedAt'] = date('c');
        if ($registryHandle !== null) {
            docs_save_registry_locked($registryHandle, $records);
            docs_unlock_registry($registryHandle);
        } else {
            save_registry($folder, $records);
        }

        $settings = load_admin_settings($folder);
        $responsibles = load_responsibles_for_folder($folder);
        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles) : $preparedRecords;
        $block2 = isset($settings['block2']) && is_array($settings['block2']) ? $settings['block2'] : [];
        $permissions = docs_build_permissions_summary($organization, $requestContext, is_array($sessionAuth) ? $sessionAuth : null, $block2, $settings);

        $uploadedRecord = null;
        foreach ($preparedRecords as $preparedRecord) {
            if (is_array($preparedRecord) && (string) ($preparedRecord['id'] ?? '') === $documentId) {
                $uploadedRecord = $preparedRecord;
                break;
            }
        }

        docs_write_response_log('Файл Ответ к задаче сохранён', [
            'organization' => $organization,
            'folder' => $folder,
            'documentId' => $documentId,
            'uploadedStoredNames' => $uploadedStoredNames,
            'dataSources' => docs_collect_response_log_sources($folder),
            'responseDirectory' => $responseDir,
        ]);

        $responsePayload = [
            'message' => 'Ответы загружены.',
            'organization' => $organization,
            'documents' => array_values($filteredRecords),
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
            'canCreateDocuments' => $permissions['canCreateDocuments'],
            'canDeleteDocuments' => $permissions['canDeleteDocuments'],
        ];

        if (is_array($uploadedRecord) && !empty($uploadedStoredNames)) {
            respond_success_with_background_task($responsePayload, function () use ($uploadedRecord, $folder, $organization, $requestContext, $uploadedStoredNames): void {
                docs_notify_assignment_author_about_response($uploadedRecord, $folder, $organization, $requestContext, $uploadedStoredNames);
            });
        }

        respond_success($responsePayload);
        break;

    case 'response_text_update':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }

        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        $storedName = sanitize_text_field((string) ($payload['storedName'] ?? ''), 255);
        $responseMessageRaw = isset($payload['text']) ? (string) $payload['text'] : '';
        $responseMessage = trim(str_replace("\r\n", "\n", str_replace("\r", "\n", $responseMessageRaw)));
        if ($responseMessage !== '') {
            $responseMessage = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $responseMessage) ?? '';
            if (mb_strlen($responseMessage, 'UTF-8') > 12000) {
                $responseMessage = mb_substr($responseMessage, 0, 12000, 'UTF-8');
            }
            $responseMessage = trim($responseMessage);
        }
        if ($documentId === '' || $storedName === '') {
            respond_error('Не хватает данных для обновления текста ответа.', 422);
        }
        if (!docs_is_text_response_file($storedName)) {
            respond_error('Редактировать можно только TXT-файлы.', 422);
        }
        if ($responseMessage === '') {
            respond_error('Введите текст ответа.', 422);
        }

        $requestContext = docs_build_request_user_context();
        $sessionAuth = docs_get_session_auth();
        $resolvedSessionAuth = is_array($sessionAuth) ? $sessionAuth : null;
        $uploaderLabel = docs_resolve_current_user_label($requestContext, $resolvedSessionAuth);

        [$registryHandle, $records] = docs_lock_registry($folder);
        if ($registryHandle === null) {
            $records = load_registry($folder);
        }

        $found = false;
        $updated = false;
        foreach ($records as &$record) {
            if (!is_array($record) || (string) ($record['id'] ?? '') !== $documentId) {
                continue;
            }
            $found = true;
            if (!isset($record['responses']) || !is_array($record['responses'])) {
                $record['responses'] = [];
            }
            foreach ($record['responses'] as &$response) {
                if (!is_array($response) || (string) ($response['storedName'] ?? '') !== $storedName) {
                    continue;
                }
                if (!docs_is_current_user_response_owner($response, $requestContext, $resolvedSessionAuth)) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('Редактировать этот текст может только пользователь, который его создал.', 403);
                }

                $path = docs_get_document_responses_dir($folder, $documentId, false) . '/' . $storedName;
                if (!is_file($path)) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('TXT-файл не найден.', 404);
                }

                $messageBody = $responseMessage . "\n";
                $bytesWritten = @file_put_contents($path, $messageBody);
                if ($bytesWritten === false) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('Не удалось обновить TXT-файл.', 500);
                }

                $response['size'] = (int) (is_file($path) ? filesize($path) : $bytesWritten);
                $response['uploadedAt'] = date('c');
                $response['uploadedBy'] = $uploaderLabel;
                $updated = true;
                break;
            }
            unset($response);
            if ($updated) {
                $record['updatedAt'] = date('c');
            }
            break;
        }
        unset($record);

        if (!$found) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Документ не найден.', 404);
        }
        if (!$updated) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('TXT-файл не найден.', 404);
        }

        if ($registryHandle !== null) {
            docs_save_registry_locked($registryHandle, $records);
            docs_unlock_registry($registryHandle);
        } else {
            save_registry($folder, $records);
        }

        $settings = load_admin_settings($folder);
        $responsibles = load_responsibles_for_folder($folder);
        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles) : $preparedRecords;
        $block2 = isset($settings['block2']) && is_array($settings['block2']) ? $settings['block2'] : [];
        $permissions = docs_build_permissions_summary($organization, $requestContext, $resolvedSessionAuth, $block2, $settings);

        respond_success([
            'message' => 'Текстовый ответ обновлён.',
            'organization' => $organization,
            'documents' => array_values($filteredRecords),
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
            'canCreateDocuments' => $permissions['canCreateDocuments'],
            'canDeleteDocuments' => $permissions['canDeleteDocuments'],
        ]);
        break;

    case 'response_delete':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $organization = $accessContext['active'];
        $folder = sanitize_folder_name($organization);
        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        $storedName = sanitize_text_field((string) ($payload['storedName'] ?? ''), 255);
        if ($documentId === '' || $storedName === '') {
            respond_error('Не хватает данных для удаления ответа.', 422);
        }

        $requestContext = docs_build_request_user_context();
        $sessionAuth = docs_get_session_auth();
        $resolvedSessionAuth = is_array($sessionAuth) ? $sessionAuth : null;

        [$registryHandle, $records] = docs_lock_registry($folder);
        if ($registryHandle === null) {
            $records = load_registry($folder);
        }

        $found = false;
        $deleted = false;
        foreach ($records as &$record) {
            if (!is_array($record) || (string) ($record['id'] ?? '') !== $documentId) {
                continue;
            }
            $found = true;
            $responses = isset($record['responses']) && is_array($record['responses']) ? $record['responses'] : [];
            $remaining = [];
            foreach ($responses as $response) {
                if (!is_array($response) || (string) ($response['storedName'] ?? '') !== $storedName) {
                    $remaining[] = $response;
                    continue;
                }
                if (!docs_is_current_user_response_owner($response, $requestContext, $resolvedSessionAuth)) {
                    if ($registryHandle !== null) {
                        docs_unlock_registry($registryHandle);
                    }
                    respond_error('Удалять этот ответ может только пользователь, который его загрузил.', 403);
                }
                $path = docs_get_document_responses_dir($folder, $documentId, false) . '/' . $storedName;
                if (is_file($path)) {
                    @unlink($path);
                }
                $deleted = true;
            }
            $record['responses'] = array_values($remaining);
            $record['updatedAt'] = date('c');
            break;
        }
        unset($record);

        if (!$found) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Документ не найден.', 404);
        }
        if (!$deleted) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Файл ответа не найден.', 404);
        }

        $responseDir = docs_get_document_responses_dir($folder, $documentId, false);
        if (is_dir($responseDir)) {
            $items = @scandir($responseDir);
            if (is_array($items) && count(array_diff($items, ['.', '..'])) === 0) {
                @rmdir($responseDir);
            }
        }

        if ($registryHandle !== null) {
            docs_save_registry_locked($registryHandle, $records);
            docs_unlock_registry($registryHandle);
        } else {
            save_registry($folder, $records);
        }

        $settings = load_admin_settings($folder);
        $responsibles = load_responsibles_for_folder($folder);
        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles) : $preparedRecords;
        $block2 = isset($settings['block2']) && is_array($settings['block2']) ? $settings['block2'] : [];
        $permissions = docs_build_permissions_summary($organization, $requestContext, is_array($sessionAuth) ? $sessionAuth : null, $block2, $settings);

        respond_success([
            'message' => 'Ответ удалён.',
            'organization' => $organization,
            'documents' => array_values($filteredRecords),
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
            'canCreateDocuments' => $permissions['canCreateDocuments'],
            'canDeleteDocuments' => $permissions['canDeleteDocuments'],
        ]);
        break;

    case 'delete':
        if ($method !== 'POST') {
            respond_error('Некорректный метод запроса.', 405);
        }

        $payload = load_json_payload();
        if (!is_array($payload) || empty($payload)) {
            $payload = $_POST;
        }
        if (!is_array($payload) || empty($payload)) {
            $payload = [];
        }
        $requestedOrganization = docs_normalize_organization_candidate((string) ($payload['organization'] ?? ''));
        $accessContext = docs_resolve_access_context($requestedOrganization);
        $sessionAuth = docs_require_admin_session($accessContext);
        $organization = $accessContext['active'];
        $documentId = sanitize_text_field((string) ($payload['documentId'] ?? ''), 200);
        if ($documentId === '') {
            respond_error('Не указан идентификатор документа.');
        }

        $requestContext = docs_build_request_user_context();
        $folder = sanitize_folder_name($organization);
        $settings = load_admin_settings($folder);
        if (docs_session_user_is_restricted_for_deletion($sessionAuth, $settings)) {
            respond_error('Удаление документов недоступно для вашего аккаунта.', 403, [
                'reason' => 'delete_restricted',
                'organization' => $organization,
            ]);
        }
        [$registryHandle, $records] = docs_lock_registry($folder);
        if ($registryHandle === null) {
            $records = load_registry($folder);
        }
        $dir = ensure_organization_directory($folder);

        $found = false;
        foreach ($records as $index => $record) {
            if (!is_array($record) || !isset($record['id']) || (string) $record['id'] !== $documentId) {
                continue;
            }

            if (isset($record['files']) && is_array($record['files'])) {
                foreach ($record['files'] as $file) {
                    if (!is_array($file) || !isset($file['storedName'])) {
                        continue;
                    }
                    $path = $dir . '/' . $file['storedName'];
                    if (is_file($path)) {
                        @unlink($path);
                    }
                }
            }

            docs_delete_directory_recursive(docs_get_document_responses_dir($folder, $documentId, false));

            unset($records[$index]);
            $found = true;
            break;
        }

        if (!$found) {
            if ($registryHandle !== null) {
                docs_unlock_registry($registryHandle);
            }
            respond_error('Документ не найден.');
        }

        if ($registryHandle !== null) {
            docs_save_registry_locked($registryHandle, $records);
            docs_unlock_registry($registryHandle);
        } else {
            save_registry($folder, $records);
        }

        $responsibles = load_responsibles_for_folder($folder);
        $block2 = isset($settings['block2']) && is_array($settings['block2'])
            ? $settings['block2']
            : [];
        $preparedRecords = docs_prepare_records_for_response($records, $organization, $folder);
        $filter = $accessContext['forceAccess'] ? null : ($accessContext['filter'] ?? null);
        $filteredRecords = $filter !== null
            ? filter_documents_for_assignee($preparedRecords, $filter, $responsibles)
            : $preparedRecords;

        $permissions = docs_build_permissions_summary(
            $organization,
            $requestContext,
            is_array($sessionAuth) ? $sessionAuth : null,
            $block2,
            $settings
        );

        respond_success([
            'message' => 'Документ удалён из реестра.',
            'organization' => $organization,
            'organizations' => $accessContext['accessible'],
            'storageDisplayPath' => 'documents/' . $folder,
            'storagePath' => build_public_path($folder),
            'documents' => array_values($filteredRecords),
            'permissions' => $permissions,
            'canManageInstructions' => $permissions['canManageInstructions'],
            'canCreateDocuments' => $permissions['canCreateDocuments'],
            'canDeleteDocuments' => $permissions['canDeleteDocuments'],
        ]);
        break;

    default:
        respond_error('Неизвестное действие.', 400);
}
