<?php
declare(strict_types=1);

define('DOCS_OCR_CLI_BOOTSTRAP', true);

$options = getopt('', ['max-jobs:', 'max-runtime:', 'organization:']);
$request = [
    'action' => 'ocr_worker_cli',
];

if (is_array($options)) {
    if (isset($options['max-jobs']) && is_scalar($options['max-jobs'])) {
        $request['max_jobs'] = (string) $options['max-jobs'];
    }
    if (isset($options['max-runtime']) && is_scalar($options['max-runtime'])) {
        $request['max_runtime'] = (string) $options['max-runtime'];
    }
    if (isset($options['organization']) && is_scalar($options['organization'])) {
        $request['organization'] = (string) $options['organization'];
    }
}

$_GET = $request;
$_POST = [];
$_REQUEST = $request;
$_SERVER['REQUEST_METHOD'] = 'CLI';

require __DIR__ . '/docs.php';
