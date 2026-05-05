<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function initDb(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT "",
        is_active INTEGER NOT NULL DEFAULT 1,
        permissions TEXT NOT NULL DEFAULT "[]",
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )');
}

function normalizePermissions(array $input): array {
    $allowed = [
        'users.view','users.create','users.edit','users.delete',
        'access.manage','documents.view','documents.edit','tasks.assign',
        'reports.view','settings.manage'
    ];
    $result = [];
    foreach ($input as $item) {
        $val = trim((string)$item);
        if ($val !== '' && in_array($val, $allowed, true)) {
            $result[$val] = true;
        }
    }
    return array_keys($result);
}

$databasePath = __DIR__ . '/app/data/admin.sqlite';
if (!is_dir(dirname($databasePath))) {
    @mkdir(dirname($databasePath), 0775, true);
}

try {
    $pdo = new PDO('sqlite:' . $databasePath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    initDb($pdo);
} catch (Throwable $e) {
    respond(500, ['ok' => false, 'error' => 'Ошибка БД', 'details' => $e->getMessage()]);
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = trim((string)($_GET['action'] ?? 'list'));

if ($method === 'GET' && $action === 'permissions_catalog') {
    respond(200, ['ok' => true, 'permissions' => [
        ['key' => 'users.view', 'title' => 'Просмотр пользователей'],
        ['key' => 'users.create', 'title' => 'Создание пользователей'],
        ['key' => 'users.edit', 'title' => 'Редактирование пользователей'],
        ['key' => 'users.delete', 'title' => 'Удаление пользователей'],
        ['key' => 'access.manage', 'title' => 'Управление доступом'],
        ['key' => 'documents.view', 'title' => 'Просмотр документов'],
        ['key' => 'documents.edit', 'title' => 'Редактирование документов'],
        ['key' => 'tasks.assign', 'title' => 'Назначение задач'],
        ['key' => 'reports.view', 'title' => 'Просмотр отчётов'],
        ['key' => 'settings.manage', 'title' => 'Настройки системы'],
    ]]);
}

if ($method === 'GET' && $action === 'list') {
    $rows = $pdo->query('SELECT id, login, full_name, is_active, permissions, created_at, updated_at FROM users ORDER BY id DESC')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $row['permissions'] = json_decode((string)$row['permissions'], true) ?: [];
        $row['is_active'] = (int)$row['is_active'] === 1;
    }
    respond(200, ['ok' => true, 'users' => $rows]);
}

$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}

if ($method === 'POST' && $action === 'create') {
    $login = trim((string)($input['login'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $fullName = trim((string)($input['full_name'] ?? ''));
    $permissions = normalizePermissions((array)($input['permissions'] ?? []));
    if ($login === '' || mb_strlen($login) < 3) {
        respond(422, ['ok' => false, 'error' => 'Логин должен быть не короче 3 символов']);
    }
    if (mb_strlen($password) < 6) {
        respond(422, ['ok' => false, 'error' => 'Пароль должен быть не короче 6 символов']);
    }
    $now = gmdate('c');
    $stmt = $pdo->prepare('INSERT INTO users(login,password_hash,full_name,is_active,permissions,created_at,updated_at) VALUES(:login,:password_hash,:full_name,1,:permissions,:created_at,:updated_at)');
    try {
        $stmt->execute([
            ':login' => $login,
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ':full_name' => $fullName,
            ':permissions' => json_encode($permissions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':created_at' => $now,
            ':updated_at' => $now,
        ]);
    } catch (Throwable $e) {
        respond(409, ['ok' => false, 'error' => 'Логин уже существует']);
    }
    respond(201, ['ok' => true]);
}

if ($method === 'POST' && $action === 'update') {
    $id = (int)($input['id'] ?? 0);
    if ($id <= 0) {
        respond(422, ['ok' => false, 'error' => 'Некорректный ID']);
    }
    $login = trim((string)($input['login'] ?? ''));
    $fullName = trim((string)($input['full_name'] ?? ''));
    $isActive = !empty($input['is_active']) ? 1 : 0;
    $permissions = normalizePermissions((array)($input['permissions'] ?? []));
    $password = (string)($input['password'] ?? '');
    $now = gmdate('c');

    if ($password !== '') {
        $stmt = $pdo->prepare('UPDATE users SET login=:login, full_name=:full_name, is_active=:is_active, permissions=:permissions, password_hash=:password_hash, updated_at=:updated_at WHERE id=:id');
        $stmt->execute([
            ':id' => $id, ':login' => $login, ':full_name' => $fullName, ':is_active' => $isActive,
            ':permissions' => json_encode($permissions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT), ':updated_at' => $now,
        ]);
    } else {
        $stmt = $pdo->prepare('UPDATE users SET login=:login, full_name=:full_name, is_active=:is_active, permissions=:permissions, updated_at=:updated_at WHERE id=:id');
        $stmt->execute([
            ':id' => $id, ':login' => $login, ':full_name' => $fullName, ':is_active' => $isActive,
            ':permissions' => json_encode($permissions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':updated_at' => $now,
        ]);
    }
    respond(200, ['ok' => true]);
}

if ($method === 'POST' && $action === 'delete') {
    $id = (int)($input['id'] ?? 0);
    if ($id <= 0) {
        respond(422, ['ok' => false, 'error' => 'Некорректный ID']);
    }
    $stmt = $pdo->prepare('DELETE FROM users WHERE id=:id');
    $stmt->execute([':id' => $id]);
    respond(200, ['ok' => true]);
}

respond(404, ['ok' => false, 'error' => 'Неизвестный маршрут']);
