<?php
declare(strict_types=1);

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$files = [
    __DIR__ . '/app/telegram-appdosc.html',
    __DIR__ . '/app/telegram-appdosc.js',
];

$hashSource = [];
foreach ($files as $path) {
    if (is_file($path)) {
        $hashSource[] = basename($path) . ':' . (string) filemtime($path);
    }
}

$timeNonce = (string) round(microtime(true) * 1000);
$versionBase = implode('|', $hashSource) . '|' . $timeNonce;
$version = sha1($versionBase);

echo 'window.__ASSET_VERSION__ = "' . $version . '";';

