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

function sanitizeHtmlForExport(string $html): string
{
    if ($html === '') {
        return '';
    }

    if (class_exists(DOMDocument::class)) {
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);

        $xpath = new DOMXPath($dom);
        foreach (['//script', '//style', '//iframe', '//object', '//embed', '//link'] as $query) {
            $nodes = $xpath->query($query);
            if (!$nodes instanceof DOMNodeList) {
                continue;
            }
            foreach (iterator_to_array($nodes) as $node) {
                if ($node->parentNode) {
                    $node->parentNode->removeChild($node);
                }
            }
        }

        $allNodes = $xpath->query('//*');
        if ($allNodes instanceof DOMNodeList) {
            foreach ($allNodes as $node) {
                if (!$node instanceof DOMElement || !$node->hasAttributes()) {
                    continue;
                }
                $attributes = iterator_to_array($node->attributes);
                foreach ($attributes as $attribute) {
                    $name = strtolower((string)$attribute->name);
                    $value = strtolower(trim((string)$attribute->value));
                    if (str_starts_with($name, 'on')) {
                        $node->removeAttribute($attribute->name);
                        continue;
                    }
                    if (in_array($name, ['href', 'src'], true) && str_starts_with($value, 'javascript:')) {
                        $node->removeAttribute($attribute->name);
                    }
                }
            }
        }

        $cleaned = $dom->saveHTML();
        return is_string($cleaned) ? trim($cleaned) : '';
    }

    $html = preg_replace('/<script\\b[^>]*>(.*?)<\\/script>/is', '', $html) ?? '';
    return trim($html);
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
$html = sanitizeHtmlForExport($html);

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
