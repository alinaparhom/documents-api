<?php
// admin_data.php
// Новый вариант: по расписанию запускаем Node-скрипт sadm.js,
// который формирует файл свода и отправляет его получателям.
// Если файл запускается из cron (`php admin_data.php cron`),
// перебираем все конфигурации *.admin.json.

use PHPMailer\PHPMailer\PHPMailer;

function loadEnvFileIfNeeded(string $path): void
{
    static $loaded = [];

    if (isset($loaded[$path])) {
        return;
    }
    $loaded[$path] = true;

    if (!is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = array_map('trim', explode('=', $line, 2));
        if ($key === '') {
            continue;
        }

        $value = trim($value, " \t\n\r\0\x0B\"'");
        if (getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

function getDefaultBotToken(): string
{
    loadEnvFileIfNeeded(__DIR__ . '/.env');
    $token = trim((string)(getenv('TELEGRAM_BOT_TOKEN') ?: ''));
    return $token;
}

function adminDataReadJsonFile(string $path): ?array
{
    foreach ([$path, $path . '.bak'] as $candidate) {
        $raw = is_file($candidate) && is_readable($candidate) ? @file_get_contents($candidate) : false;
        if (!is_string($raw) || trim($raw) === '') {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            continue;
        }
        if ($candidate !== $path) {
            error_log('admin_data JSON recovery: loaded backup for ' . basename($path));
        }
        return $decoded;
    }
    return null;
}

function adminDataReplaceJsonContentAtomically(string $path, string $json, int $defaultMode = 0664): bool
{
    $directory = dirname($path);
    if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
        return false;
    }
    if (trim($json) === '' || !is_array(json_decode($json, true))) {
        return false;
    }

    $tempPath = tempnam($directory, '.admin_data_json_');
    if (!is_string($tempPath) || $tempPath === '') {
        return false;
    }
    try {
        $content = rtrim($json) . PHP_EOL;
        $handle = @fopen($tempPath, 'wb');
        if ($handle === false) {
            return false;
        }
        $length = strlen($content);
        $offset = 0;
        while ($offset < $length) {
            $written = @fwrite($handle, substr($content, $offset));
            if ($written === false || $written < 1) {
                fclose($handle);
                return false;
            }
            $offset += $written;
        }
        $flushed = @fflush($handle);
        $synced = !function_exists('fsync') || @fsync($handle);
        fclose($handle);
        if (!$flushed || !$synced) {
            return false;
        }
        $mode = is_file($path) ? ((int)@fileperms($path) & 0777) : $defaultMode;
        @chmod($tempPath, $mode > 0 ? $mode : $defaultMode);
        return @rename($tempPath, $path);
    } finally {
        if (is_file($tempPath)) {
            @unlink($tempPath);
        }
    }
}

function adminDataWriteJsonFile(string $path, array $payload, int $defaultMode = 0664): bool
{
    $json = json_encode(
        $payload,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    if (!is_string($json)) {
        return false;
    }

    $directory = dirname($path);
    if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
        return false;
    }
    $lockHandle = @fopen($path . '.write.lock', 'c+');
    if ($lockHandle === false || !@flock($lockHandle, LOCK_EX)) {
        if (is_resource($lockHandle)) {
            fclose($lockHandle);
        }
        return false;
    }

    try {
        $current = is_file($path) && is_readable($path) ? @file_get_contents($path) : false;
        if (is_string($current) && trim($current) !== '' && is_array(json_decode($current, true))) {
            if (!adminDataReplaceJsonContentAtomically($path . '.bak', $current, $defaultMode)) {
                return false;
            }
        } elseif (is_file($path)) {
            $backup = adminDataReadJsonFile($path . '.bak');
            if (!is_array($backup)) {
                return false;
            }
        }
        return adminDataReplaceJsonContentAtomically($path, $json, $defaultMode);
    } finally {
        @flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}

// Токен бота Telegram по умолчанию (берём из .env)
define('DEFAULT_BOT_TOKEN', getDefaultBotToken());

/**
 * Отправить текстовое сообщение в Telegram
 */
function sendTelegramMessage(string $group, string $token, string $text): bool
{
    $parts  = explode('|', $group, 2);
    $chatId = $parts[0];
    $thread = $parts[1] ?? '';
    $url    = "https://api.telegram.org/bot{$token}/sendMessage";
    $post   = ['chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'HTML'];
    if ($thread !== '') $post['message_thread_id'] = $thread;

    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_POSTFIELDS=>$post, CURLOPT_RETURNTRANSFER=>true]);
    $resp = curl_exec($ch);
    $err  = curl_errno($ch);
    curl_close($ch);
    if ($err) return false;
    $j = json_decode($resp, true);
    return $j['ok'] ?? false;
}

// ---------------------------------------------------------------
// Запуск из cron
if (php_sapi_name() === 'cli' && isset($argv[1]) && $argv[1] === 'protocol2-mail-cron') {
    chdir(__DIR__);
    $options = protocol2MailCronCliOptions(array_slice($argv, 2));
    $lockDirectory = __DIR__ . '/lg';
    if (!is_dir($lockDirectory)) {
        @mkdir($lockDirectory, 0775, true);
    }
    $cronLock = @fopen($lockDirectory . '/protocol2-mail-cron.lock', 'c');
    if (!is_resource($cronLock)) {
        $result = [
            'success' => false,
            'checked' => 0,
            'sent' => 0,
            'failed' => 1,
            'skipped' => 0,
            'details' => [],
            'error' => 'Не удалось открыть файл блокировки постоянного cron.',
        ];
    } elseif (!flock($cronLock, LOCK_EX | LOCK_NB)) {
        fclose($cronLock);
        $result = [
            'success' => true,
            'locked' => true,
            'checked' => 0,
            'sent' => 0,
            'failed' => 0,
            'skipped' => 0,
            'details' => [],
            'message' => 'Предыдущий проход рассылок ещё выполняется.',
        ];
    } else {
        try {
            $result = runProtocol2MailCron($options);
        } finally {
            flock($cronLock, LOCK_UN);
            fclose($cronLock);
        }
    }
    if (empty($options['quiet']) || !empty($result['failed']) || empty($result['success'])) {
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    }
    exit(!empty($result['failed']) ? 1 : 0);
}

if (php_sapi_name() === 'cli' && isset($argv[1]) && $argv[1] === 'cron') {
    chdir(__DIR__);
    $cronLock = @fopen(__DIR__ . '/lg/admin-data-cron.lock', 'c');
    if (!is_resource($cronLock) || !flock($cronLock, LOCK_EX | LOCK_NB)) {
        if (is_resource($cronLock)) {
            fclose($cronLock);
        }
        exit;
    }
    try {
        runMailingCron();
        runMonitoringRassilaCron();
        runStatistikRassilaCron();
        runKamera3dRassilaCron();
        runKodmMailingCron();
        runScopeOfWorksDailyFinesCron();
        runRassylkaModelStatusCron();
        runProtocol2MailCron();
        runSo4vedRassilaCron();
        // Последней — рассылка вида сверху площадок складирования: в момент
        // слота она держит процесс минуты (headless-Chromium рендерит кадр
        // модели), а весь блок работает под общим flock, поэтому следующие
        // тики cron в это время выходят сразу. С конца очереди задержка
        // безопасна: остальные рассылки к этому моменту уже отработали.
        runStorageTopviewCron();
    } finally {
        flock($cronLock, LOCK_UN);
        fclose($cronLock);
    }
    exit;
}

function protocol2MailCronCliOptions(array $args): array
{
    $options = [];
    foreach ($args as $arg) {
        $arg = trim((string)$arg);
        if ($arg === '') {
            continue;
        }
        if (in_array($arg, ['--dry-run', 'dry_run=1', 'dry_run=true'], true)) {
            $options['dry_run'] = true;
            continue;
        }
        if (in_array($arg, ['--check-only', 'check_only=1', 'check_only=true'], true)) {
            $options['check_only'] = true;
            continue;
        }
        if (in_array($arg, ['--force', 'force=1', 'force=true'], true)) {
            $options['force'] = true;
            continue;
        }
        if (in_array($arg, ['--quiet', 'quiet=1', 'quiet=true'], true)) {
            $options['quiet'] = true;
            continue;
        }
        if (!str_contains($arg, '=')) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $arg, 2));
        if (in_array($key, ['template_id', 'customer_slug', 'customer_id', 'object_id', 'protocol2_path'], true) && $value !== '') {
            $options[$key] = $value;
        }
    }
    return $options;
}

function protocol2MailCronScriptPath(array $options = []): array
{
    $candidates = [];
    $add = static function (string $path) use (&$candidates): void {
        $path = trim($path);
        if ($path === '') {
            return;
        }
        if (!in_array($path, $candidates, true)) {
            $candidates[] = $path;
        }
    };

    $optionPath = trim((string)($options['protocol2_path'] ?? ''));
    if ($optionPath !== '') {
        $add($optionPath);
    }

    $envPath = trim((string)(getenv('P2_PROTOCOL2_PATH') ?: ''));
    if ($envPath !== '') {
        $add($envPath);
    }

    $cwd = getcwd();
    if (is_string($cwd) && $cwd !== '') {
        $add($cwd . '/protocol2.php');
    }

    $scriptDir = dirname((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
    if ($scriptDir !== '' && $scriptDir !== '.') {
        $add($scriptDir . '/protocol2.php');
    }

    $add(__DIR__ . '/protocol2.php');

    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            $realPath = realpath($candidate);
            return [$realPath !== false ? $realPath : $candidate, $candidates];
        }
    }

    return ['', $candidates];
}

function protocol2MailCronPhpBinary(): string
{
    $versioned = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;
    $candidates = [];
    $add = static function (string $path) use (&$candidates): void {
        $path = trim($path);
        if ($path !== '' && !in_array($path, $candidates, true)) {
            $candidates[] = $path;
        }
    };

    $currentBinary = (string)(PHP_BINARY ?: '');
    $currentName = strtolower(basename($currentBinary));
    if ($currentBinary !== '' && preg_match('/^php(?:[0-9.]+)?$/', $currentName)) {
        $add($currentBinary);
    }

    if (defined('PHP_BINDIR')) {
        $add(rtrim((string)PHP_BINDIR, '/\\') . '/php');
    }

    $add('/usr/bin/php' . $versioned);
    $add('/usr/local/bin/php' . $versioned);
    $add('/opt/homebrew/bin/php' . $versioned);
    $add('/usr/bin/php');
    $add('/usr/local/bin/php');
    $add('/opt/homebrew/bin/php');

    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_executable($candidate)) {
            return realpath($candidate) ?: $candidate;
        }
    }

    return 'php';
}

function protocol2MailCronHistoryEntry(array $result, string $at): array
{
    $details = [];
    foreach (is_array($result['details'] ?? null) ? $result['details'] : [] as $detail) {
        if (!is_array($detail)) {
            continue;
        }
        $details[] = [
            'status' => trim((string)($detail['status'] ?? 'info')),
            'template_id' => trim((string)($detail['template_id'] ?? '')),
            'message' => trim((string)($detail['message'] ?? 'Без сообщения')),
            'next_run_at' => trim((string)($detail['next_run_at'] ?? '')),
        ];
    }

    return [
        'at' => $at,
        'kind' => 'cron',
        'success' => !empty($result['success']),
        'checked' => max(0, (int)($result['checked'] ?? 0)),
        'sent' => max(0, (int)($result['sent'] ?? 0)),
        'failed' => max(0, (int)($result['failed'] ?? 0)),
        'skipped' => max(0, (int)($result['skipped'] ?? 0)),
        'details' => array_slice($details, -10),
    ];
}

function protocol2MailCronCustomerSlugs(array $options = []): array
{
    $requestedSlug = strtolower(trim((string)($options['customer_slug'] ?? '')));
    if ($requestedSlug !== '') {
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $requestedSlug)) {
            throw new RuntimeException('Некорректный идентификатор заказчика для cron.');
        }
        return [$requestedSlug === 'cust-1' ? 'su-21' : $requestedSlug];
    }

    $storageRoot = __DIR__ . '/js/protocol2/files';
    $slugs = [];
    foreach (glob($storageRoot . '/*', GLOB_ONLYDIR | GLOB_NOSORT) ?: [] as $directory) {
        $slug = strtolower(basename($directory));
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            continue;
        }
        $hasDatabase = is_file($directory . '/database.json')
            || is_file($directory . '/core.json')
            || is_file($directory . '/work.json');
        if ($hasDatabase) {
            $slugs[$slug === 'cust-1' ? 'su-21' : $slug] = true;
        }
    }

    if ($slugs === []) {
        return ['su-21'];
    }

    $result = array_keys($slugs);
    sort($result, SORT_STRING);
    return $result;
}

function protocol2MailCronRunCustomer(string $script, array $options, string $customerSlug): array
{
    $args = ['cron=1', 'customer_slug=' . $customerSlug];
    foreach (['check_only', 'dry_run'] as $flag) {
        if (!empty($options[$flag])) {
            $args[] = $flag . '=1';
        }
    }
    if (!empty($options['force'])) {
        $args[] = 'force=1';
    }
    foreach (['template_id', 'customer_id', 'object_id'] as $field) {
        $value = trim((string)($options[$field] ?? ''));
        if ($value !== '') {
            $args[] = $field . '=' . $value;
        }
    }

    $cmd = escapeshellarg(protocol2MailCronPhpBinary()) . ' ' . escapeshellarg($script) . ' mail_schedule_run';
    foreach ($args as $arg) {
        $cmd .= ' ' . escapeshellarg($arg);
    }
    $output = [];
    $exitCode = 0;
    @exec($cmd . ' 2>&1', $output, $exitCode);
    $json = trim((string)end($output));
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) {
        return [
            'success' => false,
            'checked' => 0,
            'sent' => 0,
            'failed' => 1,
            'skipped' => 0,
            'details' => [],
            'error' => trim(implode("\n", $output)) ?: 'Не удалось получить ответ protocol2 cron.',
            'exit_code' => $exitCode,
        ];
    }
    $decoded['exit_code'] = $exitCode;
    return $decoded;
}

function runProtocol2MailCron(array $options = []): array
{
    [$script, $scriptCandidates] = protocol2MailCronScriptPath($options);
    $statusPath = __DIR__ . '/lg/protocol2-mail-cron-status.json';
    $previousStatus = adminDataReadJsonFile($statusPath);
    $previousStatus = is_array($previousStatus) ? $previousStatus : [];
    $result = [
        'success' => true,
        'checked' => 0,
        'sent' => 0,
        'failed' => 0,
        'skipped' => 0,
        'details' => [],
        'customers_checked' => 0,
    ];
    $commandLabel = ($script !== '' ? $script : 'protocol2.php') . ' mail_schedule_run cron=1';

    if ($script === '' || !is_file($script)) {
        $result['success'] = false;
        $result['failed'] = 1;
        $result['error'] = 'protocol2.php не найден. Проверенные пути: ' . implode(', ', $scriptCandidates);
    } else {
        try {
            $customerSlugs = protocol2MailCronCustomerSlugs($options);
        } catch (Throwable $error) {
            $customerSlugs = [];
            $result['success'] = false;
            $result['failed'] = 1;
            $result['error'] = $error->getMessage();
        }
        foreach ($customerSlugs as $customerSlug) {
            $customerResult = protocol2MailCronRunCustomer($script, $options, $customerSlug);
            $result['customers_checked']++;
            foreach (['checked', 'sent', 'failed', 'skipped'] as $counter) {
                $result[$counter] += max(0, (int)($customerResult[$counter] ?? 0));
            }
            foreach (is_array($customerResult['details'] ?? null) ? $customerResult['details'] : [] as $detail) {
                if (!is_array($detail)) {
                    continue;
                }
                $detail['customer_slug'] = $customerSlug;
                $result['details'][] = $detail;
            }
            if (empty($customerResult['success'])) {
                $result['success'] = false;
                $customerError = trim((string)($customerResult['error'] ?? ''));
                if ($customerError !== '' && empty($result['error'])) {
                    $result['error'] = $customerSlug . ': ' . $customerError;
                }
                if (empty($customerResult['failed'])) {
                    $result['failed']++;
                }
            }
        }
    }

    $checkedAt = date(DATE_ATOM);
    $history = is_array($previousStatus['history'] ?? null) ? $previousStatus['history'] : [];
    $history[] = protocol2MailCronHistoryEntry($result, $checkedAt);
    $status = array_merge($previousStatus, [
        'configured' => true,
        'installed_at' => (string)($previousStatus['installed_at'] ?? ''),
        'cron_entry' => (string)($previousStatus['cron_entry'] ?? ''),
        'updated_at' => $checkedAt,
        'last_cron_at' => $checkedAt,
        'command' => $commandLabel,
        'summary' => $result,
        // В админке показываем пять последних фактических проходов cron.
        'history' => array_slice($history, -5),
    ]);
    unset($status['result']);
    if (!is_dir(dirname($statusPath))) {
        @mkdir(dirname($statusPath), 0775, true);
    }
    if (!adminDataWriteJsonFile($statusPath, $status)) {
        $result['success'] = false;
        $result['failed']++;
        $result['error'] = 'Не удалось атомарно сохранить статус Protocol2 cron.';
    }
    return $result;
}

/**
 * Ежедневная сводка штрафов «Фронт работ».
 *
 * Настройки берутся из lg/scope-of-work/mailing-settings.json, там же хранится
 * токен и анти-дубликат за день. Используем тот же обработчик, что и HTTP endpoint
 * scope-of-works.php?frontworks_cron=daily_fines_digest&token=...
 */
function runScopeOfWorksDailyFinesCron(): void
{
    $script = __DIR__ . '/scope-of-works.php';
    if (!is_file($script)) {
        return;
    }

    if (!defined('FRONTWORKS_CRON_ENTRY')) {
        define('FRONTWORKS_CRON_ENTRY', 'admin_cron');
    }

    try {
        require_once $script;
        if (!function_exists('frontworks_read_mailing_settings') || !function_exists('frontworks_handle_daily_fines_digest_cron')) {
            return;
        }

        $settings = frontworks_read_mailing_settings();
        $schedule = is_array($settings['schedule'] ?? null) ? $settings['schedule'] : [];
        $token = frontworks_clean_string($schedule['cronToken'] ?? '', 80);
        if ($token === '') {
            return;
        }

        $result = frontworks_handle_daily_fines_digest_cron(['token' => $token]);
        if (empty($result['ok']) && ($result['status'] ?? '') !== 'skipped') {
            @file_put_contents(
                __DIR__ . '/lg/service.log',
                '[' . date('Y-m-d H:i') . '] scope-of-works fines cron failed: ' . json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
                FILE_APPEND
            );
        }
    } catch (\Throwable $e) {
        @file_put_contents(
            __DIR__ . '/lg/service.log',
            '[' . date('Y-m-d H:i') . '] scope-of-works fines cron fatal: ' . $e->getMessage() . PHP_EOL,
            FILE_APPEND
        );
    }
}

/**
 * Плановая рассылка статуса модели в Telegram.
 *
 * Логика и настройки вынесены в rassylka.php (там же — приём уведомлений о
 * смене статуса «Моделирован» и шифрованное хранение токена). Подключаем файл
 * в режиме cron-include (константа RASSYLKA_CRON_ENTRY), чтобы он только объявил
 * функции и не запускал свой HTTP/CLI-обработчик. Вызывается из общего cron:
 *   * * * * * /usr/bin/php /.../admin_data.php cron >> /.../lg/cron.log 2>&1
 */
function runRassylkaModelStatusCron(): void
{
    $script = __DIR__ . '/rassylka.php';
    if (!is_file($script)) {
        return;
    }
    if (!defined('RASSYLKA_CRON_ENTRY')) {
        define('RASSYLKA_CRON_ENTRY', 'admin_cron');
    }
    require_once $script;
    if (function_exists('rassylka_run_modelstatus_cron')) {
        try {
            rassylka_run_modelstatus_cron();
        } catch (\Throwable $e) {
            @file_put_contents(
                __DIR__ . '/lg/service.log',
                '[' . date('Y-m-d H:i') . '] rassylka cron fatal: ' . $e->getMessage() . PHP_EOL,
                FILE_APPEND
            );
        }
    }
}

header('Content-Type: application/json; charset=utf-8');

function normalizeMailingsArray($raw): array
{
    $result = [];
    if (!is_array($raw)) {
        return $result;
    }
    foreach ($raw as $item) {
        if (!is_array($item)) {
            continue;
        }
        $result[] = [
            'what'  => trim((string)($item['what'] ?? '')),
            'email' => trim((string)($item['email'] ?? '')),
            'group' => trim((string)($item['group'] ?? '')),
            'token' => trim((string)($item['token'] ?? '')),
            'bot'   => trim((string)($item['bot'] ?? '')),
            'time'  => trim((string)($item['time'] ?? '')),
            'days'  => trim((string)($item['days'] ?? '')),
            'objectName'   => trim((string)($item['objectName'] ?? '')),
            'pageUrl'      => trim((string)($item['pageUrl'] ?? '')),
            'modelPath'    => trim((string)($item['modelPath'] ?? '')),
            'csv'          => trim((string)($item['csv'] ?? '')),
            'excel'        => trim((string)($item['excel'] ?? '')),
            'procentovka'  => trim((string)($item['procentovka'] ?? '')),
            'budget'       => trim((string)($item['budget'] ?? '')),
            'organization' => trim((string)($item['organization'] ?? '')),
        ];
    }
    return $result;
}

function normalizeReportRoles($raw): array
{
    $allowed = ['мастер', 'бригадир', 'прораб', 'начальник участка', 'директор'];
    $result = [];
    $source = [];
    if (is_array($raw)) {
        $source = $raw;
    } elseif (is_string($raw)) {
        $source = array_map('trim', explode(',', $raw));
    }
    foreach ($source as $role) {
        $role = trim((string)$role);
        if ($role === '') {
            continue;
        }
        if (!in_array($role, $allowed, true)) {
            continue;
        }
        if (!in_array($role, $result, true)) {
            $result[] = $role;
        }
    }
    return $result;
}

/**
 * Список доступных разделов мини-приложения БИММАКС.
 * id — идентификатор окна, label — подпись для админ-панели.
 */
function bimmaxSectionCatalog(): array
{
    return [
        'prorab'     => 'Прорабы',
        'planfact'   => 'Отчёт план/факт',
        'groupsection' => 'Группы и секции',
        'zavod'        => 'Завод',
    ];
}

/**
 * Приводит список назначенных разделов БИММАКС к набору известных идентификаторов
 * без дубликатов. Принимает массив или строку с разделителями-запятыми.
 */
function normalizeBimmaxSections($raw): array
{
    $catalog = bimmaxSectionCatalog();
    $source = [];
    if (is_array($raw)) {
        $source = $raw;
    } elseif (is_string($raw)) {
        $source = explode(',', $raw);
    }
    $result = [];
    foreach ($source as $section) {
        $section = trim((string)$section);
        if ($section === '' || !isset($catalog[$section])) {
            continue;
        }
        if (!in_array($section, $result, true)) {
            $result[] = $section;
        }
    }
    return $result;
}

function entryHasPassword(array $entry): bool
{
    $candidates = [
        $entry['hasPassword'] ?? null,
        $entry['password_hash'] ?? '',
        $entry['passwordHash'] ?? '',
        $entry['password_plain'] ?? '',
        $entry['password'] ?? '',
    ];

    foreach ($candidates as $candidate) {
        if (is_bool($candidate) && $candidate) {
            return true;
        }
        if (is_string($candidate) && trim($candidate) !== '') {
            return true;
        }
    }

    return false;
}

/** Найти исполняемый файл node */
function findNode(): string
{
    $cmd = trim(shell_exec('command -v node'));    
    if ($cmd === '') $cmd = trim(shell_exec('command -v nodejs'));
    if ($cmd === '') {
        $home = getenv('HOME');
        if ($home) {
            $paths = glob($home.'/.nvm/versions/node/*/bin/node');
            if ($paths) $cmd = reset($paths);
        }
    }
    return $cmd;
}

/**
 * Отправить один элемент рассылки.
 * jsonFile - путь к конфигу, idx - индекс записи в массиве mailing
 */
function ensureLogFile(string $path): string
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $path;
}

function processEntry(string $jsonFile, int $idx, array $entry, string $desc, ?string $logFile = null): void
{
    $node = findNode();
    if ($node === '') {
        $path = ensureLogFile($logFile ?? (__DIR__.'/lg/service.log'));
        file_put_contents($path, '['.date('Y-m-d H:i')."] node not found for $desc".PHP_EOL, FILE_APPEND);
        return;
    }
    // список допустимых типов рассылок
    $allowed = [
        'Свод по объектам',
        'Свод по секциям',
        'Свод процент выполнения',
        'Отчёт по ответственным',
        // новая рассылка протокола задач
        'Рассылка протокол задачи'
    ];
    if (!in_array($entry['what'] ?? '', $allowed, true)) {
        file_put_contents(
            __DIR__.'/lg/service.log',
            '['.date('Y-m-d H:i')."] mailing $desc пропущена: неизвестный тип".PHP_EOL,
            FILE_APPEND
        );
        return;
    }
     $script = __DIR__.'/js/buttom/mailing.js';
    $cmd = "$node $script " . escapeshellarg($jsonFile) . ' ' . escapeshellarg((string)$idx) . ' 2>&1';
    $logPath = ensureLogFile($logFile ?? (__DIR__.'/lg/service.log'));
    file_put_contents($logPath, '['.date('Y-m-d H:i')."] start node for $desc".PHP_EOL, FILE_APPEND);
    exec($cmd, $out, $ret);
    file_put_contents($logPath, '['.date('Y-m-d H:i')."] node output for $desc: ".implode('; ', $out).PHP_EOL, FILE_APPEND);
    if ($ret !== 0) {
        file_put_contents($logPath, '['.date('Y-m-d H:i')."] node error for $desc".PHP_EOL, FILE_APPEND);
    }
}

function logPodr(string $message): void
{
    // Логирование в podr.log отключено по требованиям безопасности.
}

function describePathState(string $path): string
{
    if ($path === '') {
        return 'не задан';
    }

    $normalized = ltrim($path, '/');
    $fullPath = __DIR__ . '/' . $normalized;
    $exists = file_exists($fullPath);
    $isDir = is_dir($fullPath);

    if (!$exists) {
        return "$path (нет файла)";
    }

    if ($isDir) {
        return "$path (папка)";
    }

    $size = @filesize($fullPath);
    $sizeText = $size === false ? 'неизвестно' : ($size.' байт');
    return "$path (файл, $sizeText)";
}

function describeContractorSources(array $sources): string
{
    $keys = ['csv', 'excel', 'procentovka', 'budget', 'modelPath'];
    $parts = [];

    foreach ($keys as $key) {
        $path = $sources[$key] ?? '';
        $parts[] = "$key: " . describePathState($path);
    }

    return implode('; ', $parts);
}

function describeRecipients(array $emails, array $groups): string
{
    $shorten = static function (array $items): string {
        if (!$items) return '—';
        $slice = array_slice($items, 0, 3);
        $more  = count($items) - count($slice);
        $label = implode(', ', $slice);
        return $more > 0 ? "$label (+$more)" : $label;
    };

    return 'email: '.count($emails).' ('. $shorten($emails) .'), группы: '.count($groups).' ('.$shorten($groups).')';
}

function describeAllowedGroupsDebug(array $allowedGroups): string
{
    if (!$allowedGroups) return '—';
    $parts = [];
    foreach ($allowedGroups as $group) {
        $id = trim((string)($group['id'] ?? ''));
        $title = trim((string)($group['title'] ?? ''));
        $kind = trim((string)($group['kind'] ?? ''));
        $parts[] = $id === '' ? '[пусто]' : ($title !== '' ? "$id ($title".($kind !== '' ? ", $kind" : '').')' : $id);
    }
    return implode('; ', $parts);
}

function normalizeContractorAllowedGroups(array $entry): array
{
    $allowedGroupsRaw = $entry['allowedGroups'] ?? ($entry['allowed_groups'] ?? []);
    $allowedGroups = [];

    if (is_array($allowedGroupsRaw)) {
        foreach ($allowedGroupsRaw as $group) {
            if (!is_array($group)) {
                continue;
            }
            $groupId = trim((string)($group['id'] ?? $group['section_id'] ?? $group['sectionId'] ?? $group['groupId'] ?? $group['group_id'] ?? ''));
            if ($groupId === '') {
                continue;
            }
            $groupTitle = trim((string)($group['title'] ?? $group['name'] ?? $group['label'] ?? $group['section_title'] ?? $group['group_title'] ?? ''));
            if ($groupTitle === '') {
                $groupTitle = $groupId;
            }
            $groupKind = trim((string)($group['kind'] ?? $group['type'] ?? $group['section_kind'] ?? ''));
            $allowedGroups[] = [
                'id'    => $groupId,
                'title' => $groupTitle,
                'kind'  => $groupKind !== '' ? $groupKind : null,
            ];
        }
    }

    if (!$allowedGroups) {
        $fallbackId = trim((string)($entry['sectionId'] ?? $entry['section_id'] ?? ''));
        if ($fallbackId !== '') {
            $fallbackTitle = trim((string)($entry['sectionTitle'] ?? $entry['section_title'] ?? $fallbackId));
            $fallbackKind  = trim((string)($entry['sectionKind'] ?? $entry['section_kind'] ?? ''));
            $allowedGroups[] = [
                'id'    => $fallbackId,
                'title' => $fallbackTitle !== '' ? $fallbackTitle : $fallbackId,
                'kind'  => $fallbackKind !== '' ? $fallbackKind : null,
            ];
        }
    }

    return $allowedGroups;
}

function buildContractorSections(array $allowedGroups): array
{
    $sections = [];

    foreach ($allowedGroups as $group) {
        if (!is_array($group)) {
            continue;
        }

        $id    = trim((string)($group['id'] ?? ''));
        if ($id === '') {
            continue;
        }

        $title = trim((string)($group['title'] ?? ''));
        if ($title === '') {
            $title = $id;
        }

        $sections[] = [
            'id'         => $id,
            'title'      => $title,
            'titleShort' => $group['titleShort'] ?? $title,
            'kind'       => $group['kind'] ?? null,
        ];
    }

    return $sections;
}

function deriveObjectNameFromFile(string $filename): string
{
    $name = pathinfo($filename, PATHINFO_FILENAME); // example: "Депо9.admin"
    return preg_replace('/\.admin$/u', '', $name);
}

function isMailingScheduledNow(array $entry, string $currentTime, int $currentDay): bool
{
    $time = trim($entry['time'] ?? '');
    if ($time === '' || $time !== $currentTime) return false;

    $days = trim($entry['days'] ?? '');
    if ($days !== '') {
        $map = ['Вс'=>0,'Пн'=>1,'Вт'=>2,'Ср'=>3,'Чт'=>4,'Пт'=>5,'Сб'=>6];
        $allow = array_map(fn($d) => $map[$d] ?? null, array_map('trim', explode(',', $days)));
        if (!in_array($currentDay, $allow, true)) return false;
    }

    return true;
}

function resolveContractorPath(array $variants): string
{
    foreach ($variants as $path) {
        if ($path === '') continue;
        if (file_exists(__DIR__ . '/' . $path)) {
            return $path;
        }
    }
    return $variants[0] ?? '';
}

function deriveContractorSiteSlug(string $site, string $objectName): string
{
    $candidates = [];

    $site = trim($site);
    if ($site !== '') {
        $parsed = parse_url($site);
        $path = $parsed['path'] ?? $site;
        if ($path !== '') {
            $candidates[] = basename($path);
            $candidates[] = trim($path, '/');
        }
    }

    $candidates[] = trim($objectName);

    foreach ($candidates as $candidate) {
        if ($candidate === '') continue;
        $slug = preg_replace('/\.php$/i', '', $candidate);
        $slug = trim($slug, '/');
        if ($slug === '') continue;
        if (preg_match('/su-[\w.-]+/i', $slug, $m)) {
            return $m[0];
        }
        return $slug;
    }

    return 'su-21-9';
}

function buildContractorSources(string $objectName, string $org, string $site): array
{
    $orgSafe = trim($org) !== '' ? trim($org) : 'Подрядчик';
    $objectSafe = trim($objectName) !== '' ? trim($objectName) : 'Объект';

    // Определяем slug проекта из пути страницы (например, "/su-21-9.php" -> "su-21-9")
    $siteSlug = deriveContractorSiteSlug($site, $objectSafe);

    $csv = resolveContractorPath([
        "gant/{$orgSafe}.{$objectSafe}.csv",
        "gant/{$objectSafe}.csv",
    ]);

    $excel = resolveContractorPath([
        "gant/lib/{$orgSafe}/{$objectSafe}.xlsx",
        "gant/lib/{$objectSafe}.xlsx",
    ]);

    $procentovka = resolveContractorPath([
        "gant/lib/Procentovka/{$orgSafe}/{$objectSafe}.xlsx",
        "gant/lib/Procentovka/{$objectSafe}.xlsx",
    ]);

    $budget = resolveContractorPath([
        "models.{$siteSlug}/{$orgSafe}/Budget.csv",
        "models.{$siteSlug}/Budget.csv",
    ]);

    $modelPath = resolveContractorPath([
        "models.{$siteSlug}/{$orgSafe}/",
        "models.{$siteSlug}/",
    ]);

    $pageUrl = trim($site) !== '' ? $site : "/{$siteSlug}.php";

    return compact(
        'csv',
        'excel',
        'procentovka',
        'budget',
        'modelPath',
        'pageUrl',
        'objectSafe',
        'orgSafe'
    );
}

/** Основной цикл проверки расписания */
function runMailingCron(): void
{
    require __DIR__ . '/lib/PHPMailer-master/src/Exception.php';
    require __DIR__ . '/lib/PHPMailer-master/src/PHPMailer.php';
    require __DIR__ . '/lib/PHPMailer-master/src/SMTP.php';

    $now         = new DateTime('now', new DateTimeZone('Europe/Minsk'));
    $currentTime = $now->format('H:i');
    $currentDay  = (int)$now->format('w');

    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__, FilesystemIterator::FOLLOW_SYMLINKS));
    foreach ($it as $file) {
        if ($file->getExtension() !== 'json' || substr($file->getFilename(), -11) !== '.admin.json') continue;
        $data = adminDataReadJsonFile($file->getPathname());
        if (!is_array($data)) {
            continue;
        }
        $objectName = deriveObjectNameFromFile($file->getFilename());
        $mailingEntries = is_array($data['mailing'] ?? null) ? $data['mailing'] : [];

        foreach ($mailingEntries as $idx => $entry) {
            $desc = ($entry['what'] ?? '(без описания)') . ' ['.$file->getFilename().']';

            if (!isMailingScheduledNow($entry, $currentTime, $currentDay)) continue;

            $emails = preg_split('/[\s,;]+/', $entry['email'] ?? '', -1, PREG_SPLIT_NO_EMPTY);
            $groups = preg_split('/[\s,;]+/', $entry['group'] ?? '', -1, PREG_SPLIT_NO_EMPTY);
            if (!$emails && !$groups) {
                file_put_contents(__DIR__.'/lg/service.log', '['.date('Y-m-d H:i')."] mailing $desc пропущена: не указаны получатели".PHP_EOL, FILE_APPEND);
                continue;
            }
            processEntry($file->getPathname(), $idx, $entry, $desc);
        }

        $contractors = is_array($data['contractors'] ?? null) ? $data['contractors'] : [];
        foreach ($contractors as $cIdx => $contractor) {
            $orgName = trim((string)($contractor['organization'] ?? $contractor['login'] ?? 'Подрядчик'));
            $site = (string)($contractor['site'] ?? '');
            $contractorMailings = $contractor['mailings'] ?? ($contractor['contractor_mailings'] ?? []);
            if (!is_array($contractorMailings) || !$contractorMailings) continue;

            $allowedGroups = normalizeContractorAllowedGroups($contractor);
            $contractorSections = buildContractorSections($allowedGroups);
            $sectionId = $allowedGroups[0]['id'] ?? trim((string)($contractor['section_id'] ?? ''));
            $sectionTitle = $allowedGroups[0]['title'] ?? trim((string)($contractor['section_title'] ?? ''));

            $sources = buildContractorSources($objectName, $orgName, $site);
            $sourceState = describeContractorSources($sources);
            logPodr("Источники для {$orgName} [{$file->getFilename()}]: {$sourceState}");
            foreach ($contractorMailings as $mIdx => $entry) {
                $desc = ($entry['what'] ?? '(без описания)') . ' ['.$file->getFilename().'] '.$orgName;

                if (!isMailingScheduledNow($entry, $currentTime, $currentDay)) {
                    $schedule = trim(($entry['time'] ?? '').' '.($entry['days'] ?? ''));
                    logPodr("Пропуск рассылки $desc: не время отправки (сейчас {$currentTime}/{$currentDay}, ожидалось {$schedule})");
                    continue;
                }

                $emails = preg_split('/[\s,;]+/', $entry['email'] ?? '', -1, PREG_SPLIT_NO_EMPTY);
                $groups = preg_split('/[\s,;]+/', $entry['group'] ?? '', -1, PREG_SPLIT_NO_EMPTY);
            $recipientSummary = describeRecipients($emails, $groups);
            if (!$emails && !$groups) {
                logPodr("Пропуск рассылки $desc: нет получателей");
                continue;
            }

            $payload = array_merge($entry, [
                'csv' => $sources['csv'],
                'excel' => $sources['excel'],
                'procentovka' => $sources['procentovka'],
                'budget' => $sources['budget'],
                'modelPath' => $sources['modelPath'],
                'pageUrl' => $sources['pageUrl'],
                'allowedGroups' => $allowedGroups,
                'contractorSections' => $contractorSections,
                'sectionId' => $sectionId,
                'sectionTitle' => $sectionTitle,
                // фиксируем название проекта отдельно от подрядчика,
                // чтобы брать корректные секции и пути для каждого файла конфигурации
                'objectName' => $sources['objectSafe'],
                'organization' => $sources['orgSafe'],
            ]);

            $groupInfo = describeAllowedGroupsDebug($allowedGroups);
            logPodr("Подготовка $desc: получатели {$recipientSummary}; группы доступа: {$groupInfo}; секция {$sectionId} ({$sectionTitle}); страница {$payload['pageUrl']}; модель {$payload['modelPath']}");

            $debugSnapshot = [
                'object' => $payload['objectName'],
                'organization' => $payload['organization'],
                'what' => $payload['what'] ?? '',
                'time' => $payload['time'] ?? '',
                'days' => $payload['days'] ?? '',
                'csv' => $payload['csv'],
                'excel' => $payload['excel'],
                'procentovka' => $payload['procentovka'],
                'budget' => $payload['budget'],
                'modelPath' => $payload['modelPath'],
                'pageUrl' => $payload['pageUrl'],
                'allowedGroups' => array_map(fn($g) => $g['id'] ?? '', $allowedGroups),
                'contractorSections' => array_map(fn($g) => $g['id'] ?? '', $contractorSections),
                'recipients' => $recipientSummary,
            ];
            logPodr('Детали рассылки '. $desc .': '. json_encode($debugSnapshot, JSON_UNESCAPED_UNICODE));

            $tmp = tempnam(sys_get_temp_dir(), 'mailing_');
            if ($tmp === false) {
                logPodr("Не удалось создать временный файл для $desc");
                continue;
                }
                file_put_contents($tmp, json_encode(['mailing' => [$payload]], JSON_UNESCAPED_UNICODE));

                logPodr("Запуск рассылки $desc, получатели: {$recipientSummary}; пути: {$sourceState}");
                processEntry($tmp, 0, $payload, $desc, __DIR__.'/Прочее/podr.log');
                @unlink($tmp);
            }
        }
    }
}

/**
 * Серверная рассылка мониторинга. Обрабатывает все файлы
 * <objectName>.monitoringrassila.json в папках models.*\/, 3dArhiv/, lg/
 * (их формат определяет окно #monitoring-settings-modal > div в monitoring.js):
 *   - по расписанию из rows[].schedule.{mon..sun} отправляет PDF/JPG
 *     сводки прогресса в Telegram через scripts/monitoring_cron.php;
 *   - ведёт подробный журнал в Прочее/Мониторинг/МониторингРассылка.log;
 *   - исключает дубли за сутки через lg/monitoring.schedule_state.json;
 *   - не зависит от открытой вкладки/localStorage/браузера.
 *
 * Вызывается из того же cron-задания, что и runMailingCron(), поэтому
 * отдельный cron настраивать не нужно.
 */
function runMonitoringRassilaCron(): void
{
    $logFile = __DIR__ . '/Прочее/Мониторинг/МониторингРассылка.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }
    $writeLog = static function (string $event, array $ctx = []) use ($logFile): void {
        $line = json_encode([
            'time' => date(DATE_ATOM),
            'event' => $event,
            'context' => $ctx,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line !== false) {
            @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    };

    $script = __DIR__ . '/scripts/monitoring_cron.php';
    if (!is_file($script)) {
        $writeLog('admin_cron.missing_script', ['script' => $script]);
        return;
    }

    if (!defined('MONITORING_CRON_ENTRY')) {
        // Режим "admin_cron": scripts/monitoring_cron.php завершится через return,
        // а не через exit(), чтобы не прерывать admin_data.php.
        define('MONITORING_CRON_ENTRY', 'admin_cron');
    }

    $writeLog('admin_cron.monitoring.start', [
        'entry' => 'admin_data.php',
        'script' => 'scripts/monitoring_cron.php',
    ]);

    try {
        $result = require $script;
        if (!is_array($result)) {
            $result = ['ok' => false, 'error' => 'unknown_result'];
        }
        $writeLog('admin_cron.monitoring.finish', [
            'ok' => (bool)($result['ok'] ?? false),
            'dispatched' => (int)($result['dispatched'] ?? 0),
            'skipped' => (int)($result['skipped'] ?? 0),
            'errors' => (int)($result['errors'] ?? 0),
            'configs' => (int)($result['configs'] ?? 0),
            'sent' => $result['sent'] ?? [],
        ]);
    } catch (Throwable $e) {
        $writeLog('admin_cron.monitoring.fatal', [
            'error' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ]);
    }
}

/**
 * Серверная рассылка статистики. Использует единый файл настроек
 * lg/statistiksettings.json, который заполняется окном «Настройка: Рассылка
 * статистики» (#statistik-mailing-modal > div) из модального окна «Статистика»
 * (#statistik-modal > div.statistik-modal__orgs):
 *   - по расписанию rows[].schedule.{mon..sun} отправляет в Telegram PDF/JPG
 *     с агрегатом входов и часов (день/неделя/месяц/весь период);
 *   - анти-дубликат за сутки живёт в lg/statistik.schedule_state.json;
 *   - подробный журнал пишется в Прочее/Вход/Статистика.log (одна строка JSON
 *     на событие: cron.start, cron.render_failed, cron.telegram_sent,
 *     cron.telegram_failed, cron.finish и т.д.).
 *
 * Вызывается из того же cron-задания, что и runMailingCron()/
 * runMonitoringRassilaCron(), поэтому отдельный cron настраивать не нужно —
 * достаточно уже существующего:
 *   * * * * * /usr/bin/php /.../admin_data.php cron >> /.../lg/cron.log 2>&1
 */
function runStatistikRassilaCron(): void
{
    $logFile = __DIR__ . '/Прочее/Вход/Статистика.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }
    $writeLog = static function (string $event, array $ctx = []) use ($logFile): void {
        $line = json_encode([
            'time' => date(DATE_ATOM),
            'event' => $event,
            'context' => $ctx,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line !== false) {
            @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    };

    $script = __DIR__ . '/scripts/statistik_cron.php';
    if (!is_file($script)) {
        $writeLog('admin_cron.statistik.missing_script', ['script' => $script]);
        return;
    }

    if (!defined('STATISTIK_CRON_ENTRY')) {
        // Режим "admin_cron": scripts/statistik_cron.php завершится через
        // return, а не через exit(), чтобы не прерывать admin_data.php.
        define('STATISTIK_CRON_ENTRY', 'admin_cron');
    }

    $writeLog('admin_cron.statistik.start', [
        'entry' => 'admin_data.php',
        'script' => 'scripts/statistik_cron.php',
    ]);

    try {
        $result = require $script;
        if (!is_array($result)) {
            $result = ['ok' => false, 'error' => 'unknown_result'];
        }
        $writeLog('admin_cron.statistik.finish', [
            'ok' => (bool)($result['ok'] ?? false),
            'rows' => (int)($result['rows'] ?? 0),
            'sent' => (int)($result['sent'] ?? 0),
            'skipped' => (int)($result['skipped'] ?? 0),
            'errors' => (int)($result['errors'] ?? 0),
        ]);
    } catch (Throwable $e) {
        $writeLog('admin_cron.statistik.fatal', [
            'error' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ]);
    }
}

/**
 * Серверная рассылка видео-облёта 3D-модели (kamera3d). Обрабатывает все
 * файлы <модель>.kamera3d.json в папках models.*\/ и 3dArhiv/:
 *   - по расписанию из sessions[].schedule.{mon..sun} рендерит видео
 *     через scripts/kamera3d_cron.php (Node + Playwright + ffmpeg) и
 *     отправляет sendVideo в указанные Telegram-группы из настроек камеры;
 *   - подробный лог по созданию/отправке пишется самим движком в
 *     Прочее/video.log (одна JSON-строка на событие:
 *     cron.tick, video.create_start, video.create_ok, video.create_failed,
 *     video.send_start, video.send_ok, video.send_failed); служебные
 *     события cron — в Прочее/Камера3D/Кaмера3D.log;
 *   - анти-дубликат за сутки живёт в lg/kamera3d.schedule_state.json.
 *
 * Вызывается из того же cron-задания, что и runMailingCron()/
 * runMonitoringRassilaCron()/runStatistikRassilaCron(), поэтому отдельный
 * cron настраивать не нужно — достаточно уже существующего:
 *   * * * * * /usr/bin/php /.../admin_data.php cron >> /.../lg/cron.log 2>&1
 *
 * Если admin_data.php cron не настроен — kamera3d можно по-прежнему
 * запускать отдельно (scripts/kamera3d_cron.sh, scripts/kamera3d_cron.php
 * или HTTP-обёртка /kamera3d_cron.php через cron-job.org / UptimeRobot).
 */
function runKamera3dRassilaCron(): void
{
    $logFile = __DIR__ . '/Прочее/Камера3D/Кaмера3D.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }
    $writeLog = static function (string $event, array $ctx = []) use ($logFile): void {
        $line = json_encode([
            'time' => date(DATE_ATOM),
            'event' => $event,
            'context' => $ctx,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line !== false) {
            @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    };

    $script = __DIR__ . '/scripts/kamera3d_cron.php';
    if (!is_file($script)) {
        $writeLog('admin_cron.kamera3d.missing_script', ['script' => $script]);
        return;
    }

    if (!defined('KAMERA3D_CRON_ENTRY')) {
        // Режим "admin_cron": scripts/kamera3d_cron.php завершится через
        // return, а не через exit(), чтобы не прерывать admin_data.php.
        define('KAMERA3D_CRON_ENTRY', 'admin_cron');
    }

    $writeLog('admin_cron.kamera3d.start', [
        'entry' => 'admin_data.php',
        'script' => 'scripts/kamera3d_cron.php',
    ]);

    try {
        $result = require $script;
        if (!is_array($result)) {
            $result = ['ok' => false, 'error' => 'unknown_result'];
        }
        $writeLog('admin_cron.kamera3d.finish', [
            'ok' => (bool)($result['ok'] ?? false),
            'configs' => (int)($result['configs'] ?? 0),
            'dispatched' => (int)($result['dispatched'] ?? 0),
            'skipped' => (int)($result['skipped'] ?? 0),
            'errors' => (int)($result['errors'] ?? 0),
            'reason' => $result['reason'] ?? null,
        ]);
    } catch (Throwable $e) {
        $writeLog('admin_cron.kamera3d.fatal', [
            'error' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ]);
    }
}

/**
 * Рассылка отчётов из режима «Моделирование» kod.php (#km-app):
 *   - читает lg/kod-notify.json (токен AES-зашифрован, ключ в lg/.mailing-secret);
 *   - по расписанию отправляет дневной/недельный/месячный отчёт по
 *     отработанному времени и эффективности в Telegram-группы;
 *   - анти-дубликат за сутки/неделю/месяц живёт в lg/kodM.mailing_state.json;
 *   - подробный журнал — Прочее/kodM_mailing.log.
 *
 * Вызывается из того же cron-задания admin_data.php cron, поэтому отдельный
 * cron настраивать не нужно. Конфигурация задаётся через кнопку «Настройки»
 * в шапке #km-app (вкладка «Рассылка»).
 */
function runKodmMailingCron(): void
{
    $logFile = __DIR__ . '/Прочее/kodM_mailing.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }
    $writeLog = static function (string $event, array $ctx = []) use ($logFile): void {
        $line = json_encode([
            'time' => date(DATE_ATOM),
            'event' => $event,
            'context' => $ctx,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line !== false) {
            @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    };

    $script = __DIR__ . '/scripts/kodM_mailing_cron.php';
    if (!is_file($script)) {
        $writeLog('admin_cron.kodm.missing_script', ['script' => $script]);
        return;
    }

    if (!defined('KODM_MAILING_CRON_ENTRY')) {
        define('KODM_MAILING_CRON_ENTRY', 'admin_cron');
    }

    $writeLog('admin_cron.kodm.start', [
        'entry'  => 'admin_data.php',
        'script' => 'scripts/kodM_mailing_cron.php',
    ]);

    try {
        $result = require $script;
        if (!is_array($result)) {
            $result = ['ok' => false, 'error' => 'unknown_result'];
        }
        $writeLog('admin_cron.kodm.finish', [
            'ok'      => (bool)($result['ok'] ?? false),
            'sent'    => $result['sent'] ?? [],
            'skipped' => $result['skipped'] ?? [],
            'errors'  => $result['errors'] ?? [],
        ]);
    } catch (Throwable $e) {
        $writeLog('admin_cron.kodm.fatal', [
            'error' => $e->getMessage(),
            'file'  => $e->getFile(),
            'line'  => $e->getLine(),
        ]);
    }
}

/**
 * Серверная рассылка So4ved (сводные ведомости) в Telegram.
 *
 * Расписания и группы хранятся в lg/*.so4ved.json (заполняются окном
 * «Расписание» из сводных таблиц so4ved.php). Скрипт scripts/so4ved_cron.php
 * рендерит PDF (Node) и отправляет документ в Telegram; анти-дубликат на сутки
 * живёт в lg/so4ved.schedule_state.json.
 *
 * Запускаем отдельным CLI-процессом (а не через require, как остальные рассылки),
 * потому что so4ved_cron.php — самостоятельный скрипт со своим exit() и тяжёлой
 * генерацией PDF через Node. Это ЕДИНСТВЕННАЯ точка запуска рассылки: отдельное
 * crontab-задание для so4ved_cron.php больше не нужно (и не должно стоять) —
 * достаточно уже существующего общего крона:
 *   * * * * * /usr/bin/php /.../admin_data.php cron >> /.../lg/cron.log 2>&1
 * Маркер 'admin_cron' передаётся скрипту, чтобы прямой запуск so4ved_cron.php
 * по «старому» отдельному заданию стал безопасным no-op и не было параллельного
 * двойного рендера.
 */
function runSo4vedRassilaCron(): void
{
    // Записи в Прочее/СводТаб.log отключены. Оставляем no-op-логгер,
    // чтобы не менять управляющий поток запуска рассылки.
    $writeLog = static function (string $event, array $ctx = []): void {
    };

    $script = __DIR__ . '/scripts/so4ved_cron.php';
    if (!is_file($script)) {
        $writeLog('admin_cron.so4ved.missing_script', ['script' => $script]);
        return;
    }

    $writeLog('admin_cron.so4ved.start', [
        'entry'  => 'admin_data.php',
        'script' => 'scripts/so4ved_cron.php',
    ]);

    // Маркер 'admin_cron' — единственный разрешённый способ запуска рассылки.
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script) . ' admin_cron';
    $out = [];
    $ret = 0;
    @exec($cmd . ' 2>&1', $out, $ret);

    $writeLog('admin_cron.so4ved.finish', [
        'exitCode' => $ret,
        'output'   => array_slice($out, -8),
    ]);
}

/**
 * Ежедневная Telegram-рассылка вида сверху 3D-модели со всеми площадками
 * складирования («ППРсклад»). Настройка каждой модели лежит в
 * <модель>.kotlovan3D.json → storageTelegram и задаётся в карточке площадки
 * складирования (ППР → Элементы); движок — scripts/storage_topview_cron.php:
 *   - в назначенное время открывает kamera3d_player.php в headless-Chromium,
 *     снимает кадр и шлёт его в группу (PNG — sendPhoto, PDF — sendDocument);
 *   - анти-дубликат за сутки живёт в lg/storage_topview.schedule_state.json;
 *   - каждый шаг цепочки пишется в Прочее/pprsclad.log под общим run-id
 *     (поле entry = admin_cron у запусков из этого cron-задания).
 *
 * Вызывается из того же cron-задания, что и остальные рассылки, поэтому
 * отдельный cron настраивать не нужно — достаточно уже существующего:
 *   * * * * * /usr/bin/php /.../admin_data.php cron >> /.../lg/cron.log 2>&1
 * Именно это делает рассылку независимой от открытой вкладки: раньше
 * планировщик тикал только пока страница с 3D-моделью пинговала его из
 * браузера (elements3d.js → ensureStorageCronPing), и при закрытой вкладке
 * слот пропускался (в журнале — slot.window_missed).
 *
 * Тик вне слота занимает единицы миллисекунд (конфигурации кэшируются по
 * mtime), а в момент слота движок держит процесс на время рендера. От
 * наложения тиков защищает lg/storage_topview.lock: параллельный запуск
 * (в том числе пинг из браузера) выходит сразу с reason=lock_busy.
 */
function runStorageTopviewCron(): void
{
    $logFile = __DIR__ . '/Прочее/Площадки/Рассылка.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }
    $writeLog = static function (string $event, array $ctx = []) use ($logFile): void {
        $line = json_encode([
            'time' => date(DATE_ATOM),
            'event' => $event,
            'context' => $ctx,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line !== false) {
            @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    };

    $script = __DIR__ . '/scripts/storage_topview_cron.php';
    if (!is_file($script)) {
        $writeLog('admin_cron.storage_topview.missing_script', ['script' => $script]);
        return;
    }

    if (!defined('STORAGE_TOPVIEW_CRON_ENTRY')) {
        // Режим «admin_cron»: движок завершается через return, а не exit()
        // (как при прямом запуске из CLI), иначе admin_data.php оборвался бы
        // на середине cron-задания.
        define('STORAGE_TOPVIEW_CRON_ENTRY', 'admin_cron');
    }

    try {
        $result = require $script;
        if (!is_array($result)) {
            $result = ['ok' => false, 'error' => 'unknown_result'];
        }
        // Ход каждого тика движок подробно пишет в Прочее/pprsclad.log, поэтому
        // сюда попадает только значимое — состоявшаяся рассылка и ошибки.
        // Иначе лог рос бы на 2880 одинаковых строк в сутки.
        $sent = is_array($result['sent'] ?? null) ? $result['sent'] : [];
        $errors = is_array($result['errors'] ?? null) ? $result['errors'] : [];
        if ($sent || $errors) {
            $writeLog('admin_cron.storage_topview.finish', [
                'ok' => (bool)($result['ok'] ?? false),
                'configsFound' => (int)($result['configsFound'] ?? 0),
                'enabled' => (int)($result['enabled'] ?? 0),
                'sent' => $sent,
                'errors' => $errors,
                'run' => $result['run'] ?? '',
            ]);
        }
    } catch (Throwable $e) {
        $writeLog('admin_cron.storage_topview.fatal', [
            'error' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ]);
    }
}

// ---------------------------------------------------------------
// Далее обработка ajax-запросов из панели администратора

/**
 * Доступ к HTTP-API административной панели «Сервис».
 *
 * Панель (js/buttom/serviceAdmin.js) авторизуется через service_auth.php: он
 * сверяет пароль по lg/<Объект>.admin.json, lg/user.json и lg/users.json и при
 * успехе ставит в сессию service_login_active. Проверяем именно этот признак —
 * это единственная система входа, которая ведёт в эту панель.
 *
 * Раньше здесь стояла проверка сессии протокола совещаний: требовались
 * $_SESSION['protocol2_user_id'] и роль admin в
 * js/protocol2/files/<заказчик>/core.json. Это чужая система авторизации —
 * вход в «Сервис» таких ключей не выставляет, поэтому панель отвечала
 * 401 «Недостаточно прав для административного раздела.» абсолютно всем
 * пользователям, включая тех, у кого права есть. protocol2 обращается к
 * admin_data.php только из CLI (`php admin_data.php protocol2-mail-cron`),
 * по HTTP — никогда, так что проверять его сессию здесь нечего.
 *
 * Режим подрядчика сюда не попадает: service_auth.php для группы contractors
 * вызывает reset_service_session_state() и признак входа не ставит.
 */
function requireAdminPanelHttpAccess(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    if (!empty($_SESSION['service_login_active'])) {
        return;
    }

    http_response_code(401);
    echo json_encode(
        ['status' => 'error', 'message' => 'Недостаточно прав для административного раздела.'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

requireAdminPanelHttpAccess();

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?: [];
$action = $_GET['action'] ?? $_POST['action'] ?? ($input['action'] ?? '');
$objectName = $_GET['object'] ?? $_POST['objectName'] ?? ($input['objectName'] ?? '');
$section = $_GET['section'] ?? $_POST['section'] ?? ($input['section'] ?? '');

if ($objectName === '' || $action === '') {
    echo json_encode(['status' => 'error', 'message' => 'Missing action or object']);
    exit;
}

$baseDir = __DIR__.'/lg';
$safeName = preg_replace('/[^a-zA-Z0-9А-Яа-яЁё._-]/u', '_', $objectName);
$filePath = "$baseDir/$safeName.admin.json";
if (!is_dir($baseDir)) mkdir($baseDir, 0755, true);

$mutationLock = null;
if (in_array($action, ['save', 'delete', 'saveButtonAccess', 'saveRoleAccess'], true)) {
    $mutationLock = @fopen($filePath . '.lock', 'c+');
    if ($mutationLock === false || !@flock($mutationLock, LOCK_EX)) {
        if (is_resource($mutationLock)) {
            fclose($mutationLock);
        }
        http_response_code(503);
        echo json_encode(['status' => 'error', 'message' => 'Не удалось заблокировать JSON для безопасного сохранения.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    register_shutdown_function(static function () use ($mutationLock): void {
        if (is_resource($mutationLock)) {
            @flock($mutationLock, LOCK_UN);
            fclose($mutationLock);
        }
    });
}

$data = adminDataReadJsonFile($filePath);
if (!is_array($data)) {
    if (is_file($filePath) || is_file($filePath . '.bak')) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'JSON повреждён или пуст; сохранение отменено.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = [];
}

foreach ($data as $sec => $val) {
    if (isset($val['login'])) $data[$sec] = [$val];
}

if ($action === 'get') {
    $out = [];
    foreach ($data as $sec => $entries) {
        foreach ($entries as $i => $entry) {
            if ($sec === 'mailing') {
               $out[$sec][$i] = [
                    'what'  => $entry['what']  ?? '',
                    'email' => $entry['email'] ?? '',
                    'group' => $entry['group'] ?? '',
                    'token' => $entry['token'] ?? '',
                    'bot'   => $entry['bot']   ?? '',
                    'time'  => $entry['time']  ?? '',
                    'days'  => $entry['days']  ?? '',
                    // пути к связанным файлам, если сохранены
                    'csv'         => $entry['csv']         ?? '',
                    'excel'       => $entry['excel']       ?? '',
                    'procentovka' => $entry['procentovka'] ?? '',
                    'budget'      => $entry['budget']      ?? '',
                    'modelPath'   => $entry['modelPath']   ?? '',
                    'pageUrl'     => $entry['pageUrl']     ?? ''
                ];
            } elseif ($sec === 'contractors') {
                $allowedGroups = [];
                if (!empty($entry['allowed_groups']) && is_array($entry['allowed_groups'])) {
                    foreach ($entry['allowed_groups'] as $group) {
                        if (!is_array($group)) {
                            continue;
                        }
                        $groupId = trim((string)($group['id'] ?? $group['section_id'] ?? $group['groupId'] ?? $group['group_id'] ?? ''));
                        if ($groupId === '') {
                            continue;
                        }
                        $groupTitle = trim((string)($group['title'] ?? $group['name'] ?? $group['label'] ?? $group['section_title'] ?? ''));
                        if ($groupTitle === '') {
                            $groupTitle = $groupId;
                        }
                        $groupKind = trim((string)($group['kind'] ?? $group['type'] ?? ''));
                        $allowedGroups[] = [
                            'id'    => $groupId,
                            'title' => $groupTitle,
                            'kind'  => $groupKind !== '' ? $groupKind : null,
                        ];
                    }
                }
                if (!$allowedGroups) {
                    $fallbackId = trim((string)($entry['section_id'] ?? ''));
                    if ($fallbackId !== '') {
                        $fallbackTitle = trim((string)($entry['section_title'] ?? $fallbackId));
                        $fallbackKind  = trim((string)($entry['section_kind'] ?? ''));
                        $allowedGroups[] = [
                            'id'    => $fallbackId,
                            'title' => $fallbackTitle !== '' ? $fallbackTitle : $fallbackId,
                            'kind'  => $fallbackKind !== '' ? $fallbackKind : null,
                        ];
                    }
                }
                $out[$sec][$i] = [
                    'login'         => $entry['login'] ?? '',
                    'name'          => $entry['name'] ?? '',
                    'organization'  => $entry['organization'] ?? '',
                    'site'          => $entry['site'] ?? '',
                    'sectionId'     => $entry['section_id'] ?? '',
                    'sectionTitle'  => $entry['section_title'] ?? '',
                    'recipientId'   => $entry['recipient_id'] ?? '',
                    'email'         => $entry['email'] ?? '',
                    'responsibleId' => $entry['responsible_id'] ?? '',
                    'responsibleName' => $entry['responsible_name'] ?? '',
                    'responsibleRole' => $entry['responsible_role'] ?? '',
                    'responsiblePhone' => $entry['responsible_phone'] ?? '',
                    'responsibleEmail' => $entry['responsible_email'] ?? '',
                    'responsibleComment' => $entry['responsible_comment'] ?? '',
                    'responsibleTelegramId' => $entry['responsible_telegram_id'] ?? '',
                    'hasToken'      => !empty($entry['token_hash'] ?? ''),
                    'hasPassword'   => !empty($entry['password_hash'] ?? ''),
                    'allowedGroups' => $allowedGroups,
                    'mailings'      => normalizeMailingsArray($entry['mailings'] ?? ($entry['contractor_mailings'] ?? [])),
                ];
            } elseif ($sec === 'responsibles') {
                $out[$sec][$i] = [
                    'userId'   => $entry['user_id'] ?? '',
                    'name'     => $entry['name'] ?? '',
                    'hasToken' => !empty($entry['token_hash'] ?? '')
                ];
            } elseif ($sec === 'roleAccess') {
                // roleAccess хранится на верхнем уровне, обрабатывается отдельно ниже
                continue;
            } elseif ($sec === 'report') {
                $passwordValue = (string)($entry['password_plain'] ?? $entry['password'] ?? $entry['password_hash'] ?? $entry['passwordHash'] ?? '');
                $out[$sec][$i] = [
                    'login'    => $entry['login'] ?? '',
                    'name'     => $entry['name'] ?? '',
                    'password' => $passwordValue,
                    'hasPassword' => entryHasPassword($entry),
                    'comment'  => $entry['comment'] ?? '',
                    'roles'    => normalizeReportRoles($entry['roles'] ?? []),
                    'accessMode' => $entry['accessMode'] ?? 'индивидуально',
                    'buttonAccess' => $entry['buttonAccess'] ?? null
                ];
            } elseif ($sec === 'advances' || $sec === 'prorab' || $sec === 'ppr' || $sec === 'opalubka') {
                $passwordValue = (string)($entry['password_plain'] ?? $entry['password'] ?? $entry['password_hash'] ?? $entry['passwordHash'] ?? '');
                $permissions = trim((string)($entry['permissions'] ?? ''));
                if ($permissions !== 'Просмотр') {
                    $permissions = 'Редактировать';
                }
                $out[$sec][$i] = [
                    'login'    => $entry['login'] ?? '',
                    'name'     => $entry['name'] ?? '',
                    'password' => $passwordValue,
                    'hasPassword' => entryHasPassword($entry),
                    'comment'  => $entry['comment'] ?? '',
                    'permissions' => $permissions
                ];
            } elseif ($sec === 'bimmax') {
                $passwordValue = (string)($entry['password_plain'] ?? $entry['password'] ?? $entry['password_hash'] ?? $entry['passwordHash'] ?? '');
                $permissions = trim((string)($entry['permissions'] ?? ''));
                if ($permissions !== 'Просмотр') {
                    $permissions = 'Редактировать';
                }
                $telegramId = trim((string)($entry['telegram_id'] ?? $entry['telegramId'] ?? ''));
                // Доступные разделы мини-приложения. Для старых записей без поля
                // sections сохраняем прежнее поведение — доступен раздел «Прорабы».
                $sections = array_key_exists('sections', $entry)
                    ? normalizeBimmaxSections($entry['sections'])
                    : ['prorab'];
                $out[$sec][$i] = [
                    'login'      => $entry['login'] ?? '',
                    'name'       => $entry['name'] ?? '',
                    'password'   => $passwordValue,
                    'hasPassword'=> entryHasPassword($entry),
                    'comment'    => $entry['comment'] ?? '',
                    'permissions'=> $permissions,
                    'telegramId' => $telegramId,
                    'telegram_id'=> $telegramId,
                    'sections'   => $sections
                ];
            } else {
                $passwordValue = (string)($entry['password_plain'] ?? $entry['password'] ?? $entry['password_hash'] ?? $entry['passwordHash'] ?? '');
                $out[$sec][$i] = [
                    'login'    => $entry['login'] ?? '',
                    'name'     => $entry['name'] ?? '',
                    'password' => $passwordValue,
                    'hasPassword' => entryHasPassword($entry),
                    'comment'  => $entry['comment'] ?? ''
                ];
            }
        }
    }
    $out['roleAccess'] = $data['roleAccess'] ?? [];
    echo json_encode(['status' => 'success', 'data' => $out], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($data[$section])) $data[$section] = [];

if ($action === 'save') {
    $index = isset($input['index']) ? (int)$input['index'] : -1;
    if ($section === 'mailing') {
        $entry = [
            'what'  => trim($input['what'] ?? ''),
            'email' => trim($input['email'] ?? ''),
            'group' => trim($input['group'] ?? ''),
            'token' => trim($input['token'] ?? ''),
            'bot'   => trim($input['bot'] ?? ''),
            'time'  => trim($input['time'] ?? ''),
            'days'  => trim($input['days'] ?? ''),
            // дополнительные пути к файлам
            'csv'         => trim($input['csv'] ?? ''),
            'excel'       => trim($input['excel'] ?? ''),
            'procentovka' => trim($input['procentovka'] ?? ''),
            'budget'      => trim($input['budget'] ?? ''),
            'modelPath'   => trim($input['modelPath'] ?? ''),
            'pageUrl'     => trim($input['pageUrl'] ?? '')
        ];
        if ($index >= 0 && isset($data[$section][$index])) $data[$section][$index] = $entry; else $data[$section][] = $entry;
    } elseif ($section === 'contractors') {
        $login        = trim($input['login'] ?? '');
        $password     = $input['password'] ?? '';
        $name         = trim($input['name'] ?? '');
        $organization = trim($input['organization'] ?? '');
        $site         = trim($input['site'] ?? '');
        $sectionId    = trim($input['sectionId'] ?? '');
        $sectionTitle = trim($input['sectionTitle'] ?? '');
        $allowedGroupsRaw = $input['allowedGroups'] ?? [];
        $allowedGroups = [];
        $responsibleId   = trim($input['responsibleId'] ?? '');
        $responsibleName = trim($input['responsibleName'] ?? '');
        $responsibleRole = trim($input['responsibleRole'] ?? '');
        $responsiblePhone = trim($input['responsiblePhone'] ?? '');
        $responsibleEmail = trim($input['responsibleEmail'] ?? '');
        $responsibleComment = trim($input['responsibleComment'] ?? '');
        $responsibleTelegramId = trim($input['responsibleTelegramId'] ?? '');
        if (is_array($allowedGroupsRaw)) {
            foreach ($allowedGroupsRaw as $group) {
                if (!is_array($group)) {
                    continue;
                }
                $groupId = trim((string)($group['id'] ?? $group['sectionId'] ?? $group['section_id'] ?? ''));
                if ($groupId === '') {
                    continue;
                }
                $groupTitle = trim((string)($group['title'] ?? $group['name'] ?? $group['label'] ?? ''));
                if ($groupTitle === '') {
                    $groupTitle = $groupId;
                }
                $groupKind = trim((string)($group['kind'] ?? $group['type'] ?? ''));
                $allowedGroups[] = [
                    'id'    => $groupId,
                    'title' => $groupTitle,
                    'kind'  => $groupKind !== '' ? $groupKind : null,
                ];
            }
        }
        if ($sectionId === '' && $allowedGroups) {
            $sectionId = $allowedGroups[0]['id'];
        }
        if ($sectionTitle === '' && $allowedGroups) {
            $sectionTitle = $allowedGroups[0]['title'];
        }
        if (!$allowedGroups && $sectionId !== '') {
            $allowedGroups[] = [
                'id'    => $sectionId,
                'title' => $sectionTitle !== '' ? $sectionTitle : $sectionId,
                'kind'  => null,
            ];
        }
        $recipientId  = trim($input['recipientId'] ?? '');
        $email        = trim($input['email'] ?? '');
        $token        = trim($input['token'] ?? '');
        $mailingsRaw  = $input['mailings'] ?? [];
        $mailings     = normalizeMailingsArray($mailingsRaw);
        if ($login === '') { echo json_encode(['status'=>'error','message'=>'login empty']); exit; }
        if ($name === '') { echo json_encode(['status'=>'error','message'=>'name empty']); exit; }
        if ($organization === '') { echo json_encode(['status'=>'error','message'=>'organization empty']); exit; }
        if ($site === '') { echo json_encode(['status'=>'error','message'=>'site empty']); exit; }
        if ($sectionId === '') { echo json_encode(['status'=>'error','message'=>'section empty']); exit; }
        if (!$allowedGroups) { echo json_encode(['status'=>'error','message'=>'allowed groups empty']); exit; }
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) { echo json_encode(['status'=>'error','message'=>'email invalid']); exit; }
        if ($index >= 0 && isset($data[$section][$index])) {
            $existing = $data[$section][$index];
            if ($token === '') {
                $tokenHash = $existing['token_hash'] ?? '';
            } else {
                $tokenHash = hash('sha256', $token);
            }
            if (trim((string)$password) === '') {
                $passwordHash = $existing['password_hash'] ?? '';
            } else {
                $passwordHash = password_hash($password, PASSWORD_DEFAULT);
                if ($passwordHash === false) { echo json_encode(['status'=>'error','message'=>'password hash error']); exit; }
            }
            if ($passwordHash === '') { echo json_encode(['status'=>'error','message'=>'password empty']); exit; }
            $sectionTitleStored = $sectionTitle !== ''
                ? $sectionTitle
                : trim((string)($existing['section_title'] ?? ''));
            $entry = [
                'login'          => $login,
                'password_hash'  => $passwordHash,
                'name'           => $name,
                'organization'   => $organization,
                'site'           => $site,
                'section_id'     => $sectionId,
                'section_title'  => $sectionTitleStored,
                'allowed_groups' => $allowedGroups,
                'recipient_id'   => $recipientId,
                'responsible_id'   => $responsibleId,
                'responsible_name' => $responsibleName,
                'responsible_role' => $responsibleRole,
                'responsible_phone' => $responsiblePhone,
                'responsible_email' => $responsibleEmail,
                'responsible_comment' => $responsibleComment,
                'responsible_telegram_id' => $responsibleTelegramId,
                'email'          => $email,
                'token_hash'     => $tokenHash,
                'mailings'       => $mailings
            ];
            $data[$section][$index] = $entry;
        } else {
            if (trim((string)$password) === '') { echo json_encode(['status'=>'error','message'=>'password empty']); exit; }
            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            if ($passwordHash === false) { echo json_encode(['status'=>'error','message'=>'password hash error']); exit; }
            $tokenHash = $token === '' ? '' : hash('sha256', $token);
            $entry = [
                'login'          => $login,
                'password_hash'  => $passwordHash,
                'name'           => $name,
                'organization'   => $organization,
                'site'           => $site,
                'section_id'     => $sectionId,
                'section_title'  => $sectionTitle,
                'allowed_groups' => $allowedGroups,
                'recipient_id'   => $recipientId,
                'responsible_id'   => $responsibleId,
                'responsible_name' => $responsibleName,
                'responsible_role' => $responsibleRole,
                'responsible_phone' => $responsiblePhone,
                'responsible_email' => $responsibleEmail,
                'responsible_comment' => $responsibleComment,
                'responsible_telegram_id' => $responsibleTelegramId,
                'email'          => $email,
                'token_hash'     => $tokenHash,
                'mailings'       => $mailings
            ];
            $data[$section][] = $entry;
        }
    } elseif ($section === 'responsibles') {
        $userId = trim($input['userId'] ?? '');
        $name   = trim($input['name'] ?? '');
        $token  = trim($input['token'] ?? '');
        if ($userId === '') { echo json_encode(['status'=>'error','message'=>'userId empty']); exit; }
        if ($index >= 0 && isset($data[$section][$index])) {
            $existing = $data[$section][$index];
            $tokenHash = $token === '' ? ($existing['token_hash'] ?? '') : hash('sha256', $token);
            if ($tokenHash === '') { echo json_encode(['status'=>'error','message'=>'token empty']); exit; }
            $entry = [
                'user_id'    => $userId,
                'name'       => $name,
                'token_hash' => $tokenHash
            ];
            $data[$section][$index] = $entry;
        } else {
            if ($token === '') { echo json_encode(['status'=>'error','message'=>'token empty']); exit; }
            $entry = [
                'user_id'    => $userId,
                'name'       => $name,
                'token_hash' => hash('sha256', $token)
            ];
            $data[$section][] = $entry;
        }
    } else {
        $login    = trim($input['login'] ?? '');
        $password = $input['password'] ?? '';
        $name     = trim($input['name'] ?? '');
        $comment  = trim($input['comment'] ?? '');
        $roles    = $section === 'report' ? normalizeReportRoles($input['roles'] ?? []) : [];
        if ($login === '') { echo json_encode(['status'=>'error','message'=>'login empty']); exit; }
        $accessMode = trim($input['accessMode'] ?? '');
        $permissionsInput = trim((string)($input['permissions'] ?? ''));
        $permissionsValue = $permissionsInput === 'Просмотр' ? 'Просмотр' : 'Редактировать';
        if ($index >= 0 && isset($data[$section][$index])) {
            $existing = $data[$section][$index];
            $entry = [
                'login'         => $login,
                'password_hash' => $password === '' ? ($existing['password_hash'] ?? '') : password_hash($password, PASSWORD_DEFAULT),
                'password_plain'=> $password === '' ? ($existing['password_plain'] ?? '') : $password,
                'name'          => $name,
                'comment'       => $comment
            ];
            if ($section === 'report') {
                $entry['roles'] = $roles;
                $entry['accessMode'] = $accessMode !== '' ? $accessMode : ($existing['accessMode'] ?? 'индивидуально');
                $entry['buttonAccess'] = $existing['buttonAccess'] ?? null;
            }
            if ($section === 'advances' || $section === 'prorab' || $section === 'ppr' || $section === 'opalubka' || $section === 'bimmax') {
                $entry['permissions'] = $permissionsInput !== ''
                    ? $permissionsValue
                    : (($existing['permissions'] ?? 'Редактировать') === 'Просмотр' ? 'Просмотр' : 'Редактировать');
            }
            if ($section === 'bimmax') {
                $rawTelegramId = $input['telegramId'] ?? $input['telegram_id'] ?? null;
                if ($rawTelegramId === null) {
                    $entry['telegram_id'] = trim((string)($existing['telegram_id'] ?? ''));
                } else {
                    $entry['telegram_id'] = trim((string)$rawTelegramId);
                }
                if (array_key_exists('sections', $input)) {
                    $entry['sections'] = normalizeBimmaxSections($input['sections']);
                } else {
                    $entry['sections'] = normalizeBimmaxSections($existing['sections'] ?? null);
                }
            }
            $data[$section][$index] = $entry;
        } else {
            // Пользователи мини-приложения авторизуются по Telegram ID,
            // поэтому пароль для нового bimmax-пользователя необязателен.
            if ($section !== 'bimmax' && $password === '') {
                echo json_encode(['status'=>'error','message'=>'password empty']);
                exit;
            }
            $entry = [
                'login'         => $login,
                'password_hash' => $password === '' ? '' : password_hash($password, PASSWORD_DEFAULT),
                'password_plain'=> $password,
                'name'          => $name,
                'comment'       => $comment
            ];
            if ($section === 'report') {
                $entry['roles'] = $roles;
                $entry['accessMode'] = $accessMode !== '' ? $accessMode : 'индивидуально';
            }
            if ($section === 'advances' || $section === 'prorab' || $section === 'ppr' || $section === 'opalubka' || $section === 'bimmax') {
                $entry['permissions'] = $permissionsValue;
            }
            if ($section === 'bimmax') {
                $entry['telegram_id'] = trim((string)($input['telegramId'] ?? $input['telegram_id'] ?? ''));
                $entry['sections'] = normalizeBimmaxSections($input['sections'] ?? null);
            }
            $data[$section][] = $entry;
        }
    }
    if (!adminDataWriteJsonFile($filePath, $data, 0600)) {
        echo json_encode(['status'=>'error','message'=>'Write error']);
        exit;
    }
    echo json_encode(['status'=>'success']);
    exit;
}

if ($action === 'delete') {
    $index = isset($input['index']) ? (int)$input['index'] : -1;
    if ($index >= 0 && isset($data[$section][$index])) {
        array_splice($data[$section], $index, 1);
        if (empty($data[$section])) unset($data[$section]);
        if (!adminDataWriteJsonFile($filePath, $data, 0600)) {
            echo json_encode(['status'=>'error','message'=>'Write error']);
            exit;
        }
    }
    echo json_encode(['status'=>'success']);
    exit;
}

// Сохранение настроек доступа к кнопкам Plan/Fact для пользователя
if ($action === 'saveButtonAccess') {
    $index = isset($input['index']) ? (int)$input['index'] : -1;
    $login = trim($input['login'] ?? '');
    $buttonAccess = $input['buttonAccess'] ?? [];

    if ($section !== 'report') {
        echo json_encode(['status' => 'error', 'message' => 'Invalid section for button access']);
        exit;
    }

    if ($index < 0 || !isset($data[$section][$index])) {
        echo json_encode(['status' => 'error', 'message' => 'User not found']);
        exit;
    }

    // Проверка что логин совпадает
    $existingLogin = $data[$section][$index]['login'] ?? '';
    if ($existingLogin !== $login) {
        echo json_encode(['status' => 'error', 'message' => 'Login mismatch']);
        exit;
    }

    // Нормализация настроек доступа к кнопкам и таблице
    $normalizedAccess = [
        'buttons2D' => [],
        'buttons3D' => [],
        'tableBlocks' => [],
        'tableElementRows' => [],
        'reportingButtons' => [],
        'reportingFields' => [],
        'window3dViewerButtons' => [],
        'window3dBrigadesButtons' => []
    ];

    if (isset($buttonAccess['buttons2D']) && is_array($buttonAccess['buttons2D'])) {
        foreach ($buttonAccess['buttons2D'] as $btnId => $enabled) {
            $normalizedAccess['buttons2D'][$btnId] = (bool)$enabled;
        }
    }

    if (isset($buttonAccess['buttons3D']) && is_array($buttonAccess['buttons3D'])) {
        foreach ($buttonAccess['buttons3D'] as $btnId => $enabled) {
            $normalizedAccess['buttons3D'][$btnId] = (bool)$enabled;
        }
    }

    if (isset($buttonAccess['tableBlocks']) && is_array($buttonAccess['tableBlocks'])) {
        foreach ($buttonAccess['tableBlocks'] as $blockId => $visible) {
            $normalizedAccess['tableBlocks'][$blockId] = (bool)$visible;
        }
    }

    if (isset($buttonAccess['tableElementRows']) && is_array($buttonAccess['tableElementRows'])) {
        foreach ($buttonAccess['tableElementRows'] as $rowId => $visible) {
            $normalizedAccess['tableElementRows'][$rowId] = (bool)$visible;
        }
    }

    if (isset($buttonAccess['reportingButtons']) && is_array($buttonAccess['reportingButtons'])) {
        foreach ($buttonAccess['reportingButtons'] as $btnId => $enabled) {
            $normalizedAccess['reportingButtons'][$btnId] = (bool)$enabled;
        }
    }

    if (isset($buttonAccess['reportingFields']) && is_array($buttonAccess['reportingFields'])) {
        foreach ($buttonAccess['reportingFields'] as $fieldId => $visible) {
            $normalizedAccess['reportingFields'][$fieldId] = (bool)$visible;
        }
    }

    if (isset($buttonAccess['window3dViewerButtons']) && is_array($buttonAccess['window3dViewerButtons'])) {
        foreach ($buttonAccess['window3dViewerButtons'] as $btnId => $enabled) {
            $normalizedAccess['window3dViewerButtons'][$btnId] = (bool)$enabled;
        }
    }

    if (isset($buttonAccess['window3dBrigadesButtons']) && is_array($buttonAccess['window3dBrigadesButtons'])) {
        foreach ($buttonAccess['window3dBrigadesButtons'] as $btnId => $enabled) {
            $normalizedAccess['window3dBrigadesButtons'][$btnId] = (bool)$enabled;
        }
    }

    // Сохранение accessMode
    $accessMode = trim($input['accessMode'] ?? '');
    if ($accessMode !== '') {
        $data[$section][$index]['accessMode'] = $accessMode;
    }

    // Сохранение настроек в запись пользователя
    $data[$section][$index]['buttonAccess'] = $normalizedAccess;

    if (!adminDataWriteJsonFile($filePath, $data, 0600)) {
        echo json_encode(['status' => 'error', 'message' => 'Write error']);
        exit;
    }
    echo json_encode(['status' => 'success']);
    exit;
}

// Сохранение настроек доступа для роли
if ($action === 'saveRoleAccess') {
    $role = trim($input['role'] ?? '');
    $buttonAccess = $input['buttonAccess'] ?? [];

    $allowedRoles = ['мастер', 'бригадир', 'прораб'];
    if (!in_array($role, $allowedRoles, true)) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid role']);
        exit;
    }

    // Нормализация настроек доступа
    $normalizedAccess = [
        'buttons2D' => [],
        'buttons3D' => [],
        'tableBlocks' => [],
        'tableElementRows' => [],
        'reportingButtons' => [],
        'reportingFields' => [],
        'window3dViewerButtons' => [],
        'window3dBrigadesButtons' => []
    ];

    if (isset($buttonAccess['buttons2D']) && is_array($buttonAccess['buttons2D'])) {
        foreach ($buttonAccess['buttons2D'] as $btnId => $enabled) {
            $normalizedAccess['buttons2D'][$btnId] = (bool)$enabled;
        }
    }
    if (isset($buttonAccess['buttons3D']) && is_array($buttonAccess['buttons3D'])) {
        foreach ($buttonAccess['buttons3D'] as $btnId => $enabled) {
            $normalizedAccess['buttons3D'][$btnId] = (bool)$enabled;
        }
    }
    if (isset($buttonAccess['tableBlocks']) && is_array($buttonAccess['tableBlocks'])) {
        foreach ($buttonAccess['tableBlocks'] as $blockId => $visible) {
            $normalizedAccess['tableBlocks'][$blockId] = (bool)$visible;
        }
    }
    if (isset($buttonAccess['tableElementRows']) && is_array($buttonAccess['tableElementRows'])) {
        foreach ($buttonAccess['tableElementRows'] as $rowId => $visible) {
            $normalizedAccess['tableElementRows'][$rowId] = (bool)$visible;
        }
    }
    if (isset($buttonAccess['reportingButtons']) && is_array($buttonAccess['reportingButtons'])) {
        foreach ($buttonAccess['reportingButtons'] as $btnId => $enabled) {
            $normalizedAccess['reportingButtons'][$btnId] = (bool)$enabled;
        }
    }
    if (isset($buttonAccess['reportingFields']) && is_array($buttonAccess['reportingFields'])) {
        foreach ($buttonAccess['reportingFields'] as $fieldId => $visible) {
            $normalizedAccess['reportingFields'][$fieldId] = (bool)$visible;
        }
    }
    if (isset($buttonAccess['window3dViewerButtons']) && is_array($buttonAccess['window3dViewerButtons'])) {
        foreach ($buttonAccess['window3dViewerButtons'] as $btnId => $enabled) {
            $normalizedAccess['window3dViewerButtons'][$btnId] = (bool)$enabled;
        }
    }
    if (isset($buttonAccess['window3dBrigadesButtons']) && is_array($buttonAccess['window3dBrigadesButtons'])) {
        foreach ($buttonAccess['window3dBrigadesButtons'] as $btnId => $enabled) {
            $normalizedAccess['window3dBrigadesButtons'][$btnId] = (bool)$enabled;
        }
    }

    // Сохранение в roleAccess
    if (!isset($data['roleAccess']) || !is_array($data['roleAccess'])) {
        $data['roleAccess'] = [];
    }
    $data['roleAccess'][$role] = $normalizedAccess;

    if (!adminDataWriteJsonFile($filePath, $data, 0600)) {
        echo json_encode(['status' => 'error', 'message' => 'Write error']);
        exit;
    }
    echo json_encode(['status' => 'success']);
    exit;
}

echo json_encode(['status'=>'error','message'=>'Unknown action']);