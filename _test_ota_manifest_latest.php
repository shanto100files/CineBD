<?php
// Manifest verification for OTA release (player tap/hold double-apply fix)
// Prints the current release id per runtime + bundle magic check for 5.7.15.
$rvs = ['5.7.6', '5.7.7', '5.7.8', '5.7.9', '5.7.10', '5.7.12', '5.7.13', '5.7.15'];
$url = 'https://cinepix.top/ota-endpoint/index.php?action=manifest';
$lastId = null;
foreach ($rvs as $rv) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-App-Key: 78a0e573dfd894d443685159b2e71e2f',
            'expo-platform: android',
            'expo-runtime-version: ' . $rv,
        ],
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['currentUpdateId' => null]));
    $body = curl_exec($ch);
    curl_close($ch);
    $id = null; $critical = null;
    if (preg_match('/"id"\s*:\s*"([^"]+)"/', (string)$body, $m)) $id = $m[1];
    if (preg_match('/"critical"\s*:\s*(true|false)/', (string)$body, $m)) $critical = $m[1];
    $lastId = $id;
    echo "$rv id=" . substr((string)$id, 0, 8) . " critical=$critical " . ($critical === 'true' ? 'OK' : 'CHECK') . "\n";
}
if ($lastId) {
    $u = "https://cinepix.top/ota-endpoint/index.php?appKey=78a0e573dfd894d443685159b2e71e2f&file=5.7.15/$lastId/bundle";
    $b = @file_get_contents($u);
    echo "bundle: " . ($b === false ? 'DL-FAIL' : (bin2hex(substr($b, 0, 4)) === 'c61fbc03' ? 'magic-ok len=' . strlen($b) : 'BAD-MAGIC')) . "\n";
}
