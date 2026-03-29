<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo 'Method Not Allowed';
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    http_response_code(400);
    echo 'Пустой запрос.';
    exit;
}

if (strlen($raw) > 2_500_000) {
    http_response_code(413);
    echo 'Слишком большой документ.';
    exit;
}

try {
    /** @var array<string,mixed>|null $payload */
    $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $exception) {
    http_response_code(400);
    echo 'Некорректный JSON.';
    exit;
}

if (!is_array($payload)) {
    http_response_code(400);
    echo 'Некорректный JSON.';
    exit;
}

$format = strtolower(trim((string)($payload['format'] ?? 'pdf')));
if (!in_array($format, ['pdf', 'doc'], true)) {
    http_response_code(400);
    echo 'Поддерживаются только форматы pdf и doc.';
    exit;
}

$html = (string)($payload['html'] ?? '');
if ($html === '') {
    http_response_code(400);
    echo 'Отсутствует HTML документа.';
    exit;
}

if (strlen($html) > 2_000_000) {
    http_response_code(413);
    echo 'HTML слишком большой.';
    exit;
}

$fileName = trim((string)($payload['fileName'] ?? 'document'));
$fileName = preg_replace('/[^\p{L}\p{N}\-_ ]/u', '', $fileName) ?: 'document';
$fileName = mb_substr(trim($fileName), 0, 80) ?: 'document';

if ($format === 'doc') {
    header('Content-Type: application/msword; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . rawurlencode($fileName) . '.doc"');
    echo $html;
    exit;
}

$autoload = __DIR__ . '/../../vendor/autoload.php';
if (is_file($autoload)) {
    require_once $autoload;
}

if (!class_exists(\Dompdf\Dompdf::class)) {
    http_response_code(500);
    echo 'PDF недоступен: установите dompdf (composer require dompdf/dompdf) или выберите DOC.';
    exit;
}

$dompdf = new \Dompdf\Dompdf([
    'isRemoteEnabled' => true,
    'isHtml5ParserEnabled' => true,
    'defaultPaperSize' => 'A4',
]);

$dompdf->loadHtml($html, 'UTF-8');
$dompdf->setPaper('A4', 'portrait');
$dompdf->render();

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . rawurlencode($fileName) . '.pdf"');
echo $dompdf->output();
