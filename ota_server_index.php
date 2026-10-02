<?php
// Self-hosted expo-updates (OTA) endpoint - deployed at
// /var/www/cinepix/ota-endpoint/index.php on cinepix.top (Apache :8888).
//
// Deploy from the repo root with:  bash ota_deploy_endpoint.sh
//
// NOTE ON $APP_KEY: this is a CLIENT credential, not a server secret. It ships
// inside every APK (app.config.js -> updates.requestHeaders, read natively by
// expo-updates) and inside the JS bundle, so it is necessarily public and only
// keeps random bots out. Rotating it therefore needs a NEW APK build - it can
// never be rotated over OTA. You can still swap the value server-side without
// editing this file by dropping it in `.app_key` next to this script.
$OTA_ROOT = '/var/www/cinepix/ota';
$APP_KEY_FILE = __DIR__ . '/.app_key';
$APP_KEY = is_readable($APP_KEY_FILE)
    ? trim((string) file_get_contents($APP_KEY_FILE))
    : '78a0e573dfd894d443685159b2e71e2f';

// Header only. The old `?appKey=` query-string fallback was removed: query
// strings end up verbatim in Apache access logs / CDN logs / Referer headers,
// which turns a public-by-design credential into a log-scraping one.
// expo-updates always sends the header (app.config.js updates.requestHeaders).
$key = $_SERVER['HTTP_X_APP_KEY'] ?? '';
if ($key === '' || $key !== $APP_KEY) { http_response_code(403); die('forbidden'); }

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

    // Release flags (message / critical) that the client reads back from
    // manifest.extra.ota (otaManager.ts:56-61).
    //
    // Prefer the copy sitting INSIDE the bundle folder - it was uploaded
    // alongside metadata.json and therefore travels with _mirror.sh when the
    // same bundle is published to other runtime versions. releases.json is
    // only a per-runtime pointer that _mirror.sh rewrites, so it is the
    // fallback. This whole block used to be `new stdClass()`, which meant
    // `--critical` never showed the restart dialog and release notes never
    // rendered on any device.
    $flags = [];
    foreach ([$dir . '/release.json', $relFile] as $flagsFile) {
        if (is_file($flagsFile)) {
            $decoded = json_decode(file_get_contents($flagsFile), true);
            if (is_array($decoded)) { $flags = $decoded; break; }
        }
    }
    $otaExtra = [
        'releaseId' => (string) ($rel['id'] ?? ''),
        'createdAt' => (string) ($rel['createdAt'] ?? $flags['createdAt'] ?? ''),
        // filter_var so "false"/"0"/1 all normalise to a real boolean - the
        // client does a strict `=== true` comparison.
        'critical' => filter_var($flags['critical'] ?? $rel['critical'] ?? false, FILTER_VALIDATE_BOOLEAN),
    ];
    $msg = $flags['message'] ?? $rel['message'] ?? '';
    if (is_string($msg) && $msg !== '') {
        $otaExtra['message'] = $msg;
    }

    $base = 'https://cinepix.top/ota-endpoint/index.php?file=' . rawurlencode($runtimeVersion) . '/' . rawurlencode($rel['id']) . '/';
    $mkUrl = function ($p) use ($base) { return $base . implode('/', array_map('rawurlencode', explode('/', str_replace('\\', '/', $p)))); };

    $assets = [];
    foreach (($fm['assets'] ?? []) as $a) {
        $ext = $a['ext'] ?? '';
        $ct = ($ext === 'png') ? 'image/png' : (($ext === 'jpg' || $ext === 'jpeg') ? 'image/jpeg' : 'application/octet-stream');
        $assets[] = ['key' => str_replace('\\', '/', $a['path']), 'contentType' => $ct, 'url' => $mkUrl($a['path']), 'fileExtension' => '.' . $ext];
    }

    // extra.ota is what otaManager.ts reads; keep the shape it expects.
    $manifest = [
        'id' => $rel['id'],
        'createdAt' => $rel['createdAt'],
        'runtimeVersion' => $runtimeVersion,
        'launchAsset' => ['key' => 'bundle', 'contentType' => 'application/javascript', 'url' => $mkUrl($bundlePath), 'fileExtension' => '.hbc'],
        'assets' => $assets,
        'metadata' => new stdClass(),
        'extra' => ['ota' => $otaExtra],
    ];
    echo json_encode($manifest);
    exit;
}

http_response_code(400); die('bad request');
