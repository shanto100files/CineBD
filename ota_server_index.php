<?php
// Self-hosted expo-updates (OTA) endpoint - deployed at
// /var/www/cinepix/ota-endpoint/index.php on cinepix.top (Apache :8888).
$OTA_ROOT = '/var/www/cinepix/ota';
$APP_KEY = '78a0e573dfd894d443685159b2e71e2f';

$key = $_SERVER['HTTP_X_APP_KEY'] ?? ($_GET['appKey'] ?? '');
if ($key !== $APP_KEY) { http_response_code(403); die('forbidden'); }

$platform = $_SERVER['HTTP_EXPO_PLATFORM'] ?? ($_GET['platform'] ?? 'android');
$runtimeVersion = $_SERVER['HTTP_EXPO_RUNTIME_VERSION'] ?? ($_GET['runtimeVersion'] ?? '');
$currentId = $_SERVER['HTTP_EXPO_CURRENT_UPDATE_ID'] ?? '';

if (isset($_GET['file'])) {
    $rel = rawurldecode($_GET['file']);
    $full = realpath($OTA_ROOT . '/' . $rel);
    $rootReal = realpath($OTA_ROOT);
    if (!$full || !$rootReal || strpos($full, $rootReal) !== 0 || !is_file($full)) { http_response_code(404); die('not found'); }
    if (substr($full, -13) === 'releases.json') { http_response_code(404); die('not found'); }
    $ext = strtolower(pathinfo($full, PATHINFO_EXTENSION));
    $cts = ['hbc'=>'application/javascript','js'=>'application/javascript','json'=>'application/json','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','gif'=>'image/gif','webp'=>'image/webp','ttf'=>'application/octet-stream','otf'=>'application/octet-stream'];
    header('Content-Type: ' . ($cts[$ext] ?? 'application/octet-stream'));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . filesize($full));
    readfile($full);
    exit;
}

if (($_GET['action'] ?? '') === 'manifest') {
    if (!$runtimeVersion || !preg_match('/^[A-Za-z0-9._-]+$/', $runtimeVersion)) {
        http_response_code(400); header('Content-Type: application/json'); die('{"error":"bad runtime version"}');
    }
    header('Content-Type: application/json');
    header('Cache-Control: private, max-age=0, must-revalidate');
    $relFile = $OTA_ROOT . '/' . $runtimeVersion . '/releases.json';
    if (!is_file($relFile)) { http_response_code(204); exit; }
    $rel = json_decode(file_get_contents($relFile), true);
    if (!$rel || empty($rel['id'])) { http_response_code(204); exit; }
    if ($currentId && $currentId === $rel['id']) { http_response_code(204); exit; }
    $dir = $OTA_ROOT . '/' . $runtimeVersion . '/' . $rel['id'];
    $metaFile = $dir . '/metadata.json';
    if (!is_file($metaFile)) { http_response_code(204); exit; }
    $meta = json_decode(file_get_contents($metaFile), true);
    $fm = $meta['fileMetadata'][$platform] ?? $meta['fileMetadata'] ?? null;
    if (!$fm) { http_response_code(204); exit; }
    // SDK 57: bundle is a plain path string; older SDKs used {path:...}.
    $bundlePath = is_string($fm['bundle'] ?? null) ? $fm['bundle'] : ($fm['bundle']['path'] ?? '');
    if (!$bundlePath) { http_response_code(204); exit; }

    $base = 'https://cinepix.top/ota-endpoint/index.php?file=' . rawurlencode($runtimeVersion) . '/' . rawurlencode($rel['id']) . '/';
    $mkUrl = function ($p) use ($base) { return $base . implode('/', array_map('rawurlencode', explode('/', str_replace('\\', '/', $p)))); };

    $assets = [];
    foreach (($fm['assets'] ?? []) as $a) {
        $ext = $a['ext'] ?? '';
        $ct = ($ext === 'png') ? 'image/png' : (($ext === 'jpg' || $ext === 'jpeg') ? 'image/jpeg' : 'application/octet-stream');
        $assets[] = ['key' => str_replace('\\', '/', $a['path']), 'contentType' => $ct, 'url' => $mkUrl($a['path']), 'fileExtension' => '.' . $ext];
    }
    $manifest = [
        'id' => $rel['id'],
        'createdAt' => $rel['createdAt'],
        'runtimeVersion' => $runtimeVersion,
        'launchAsset' => ['key' => 'bundle', 'contentType' => 'application/javascript', 'url' => $mkUrl($bundlePath), 'fileExtension' => '.hbc'],
        'assets' => $assets,
        'metadata' => new stdClass(),
        'extra' => new stdClass(),
    ];
    echo json_encode($manifest);
    exit;
}

http_response_code(400); die('bad request');
