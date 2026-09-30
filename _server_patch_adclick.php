<?php
/**
 * PATCH 2026-09-30: ad click logging (in-app Sponsored browser).
 *  1) api/app.php: new `adClick` action (allow-listed, no auth required —
 *     matches the other analytics-style endpoints) that inserts a row into
 *     app_ad_clicks (url, device_id, user_id if JWT present).
 *  2) Table auto-created once.
 *  3) admin/app_users.php: show today's + total ad clicks in the stat cards.
 */

$apiFile = '/var/www/cinepix/api/app.php';
$c = file_get_contents($apiFile);
if ($c === false) { fwrite(STDERR, "READ-FAIL api\n"); exit(1); }
@copy($apiFile, $apiFile . '.bak_adclick');

// ---------- 1a) allow-list the action ----------
$old1 = "'cf-generate', 'push'])) {";
$new1 = "'cf-generate', 'push', 'adclick'])) {";
if (strpos($c, $old1) === false) { fwrite(STDERR, "1a-OLD-NOT-FOUND (kill-switch allow-list)\n"); exit(1); }
$c = str_replace($old1, $new1, $c);

// ---------- 1b) handler: register right before appRedeemCoupon ----------
$old2 = "function appRedeemCoupon() {";
$new2 = "// FIX-2026-09-30: log ad click-throughs opened in the in-app Sponsored\n// browser, so the admin can see real engagement from the 18+ placements.\nfunction appEnsureAdClickTable(\$db) {\n    \$db->exec(\"CREATE TABLE IF NOT EXISTS app_ad_clicks (id INT AUTO_INCREMENT PRIMARY KEY, url VARCHAR(512) NOT NULL, user_id INT NULL, device_id VARCHAR(128) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX (created_at), INDEX (user_id))\");\n}\n\nfunction appAdClick() {\n    if (\$_SERVER['REQUEST_METHOD'] !== 'POST') { json_response(405, ['ok' => false, 'msg' => 'POST required']); return; }\n    \$input = json_decode(file_get_contents('php://input'), true);\n    \$url = trim((string)(\$input['url'] ?? ''));\n    if (\$url === '' || strlen(\$url) > 500 || !preg_match('#^https?://#i', \$url)) { json_response(400, ['ok' => false, 'msg' => 'Invalid url']); return; }\n    \$db = getDB();\n    appEnsureAdClickTable(\$db);\n    \$safeUrl = \$db->escapeString(\$url);\n    \$uid = appAuth();\n    \$safeUid = \$uid ? (int)\$uid : 'NULL';\n    \$safeDevice = \$db->escapeString(\$_SERVER['HTTP_X_DEVICE_ID'] ?? '');\n    \$db->exec(\"INSERT INTO app_ad_clicks (url, user_id, device_id) VALUES ('\$safeUrl', \$safeUid, '\$safeDevice')\");\n    json_response(200, ['ok' => true]);\n}\n\nfunction appRedeemCoupon() {";
if (strpos($c, $old2) === false) { fwrite(STDERR, "1b-OLD-NOT-FOUND (appRedeemCoupon anchor)\n"); exit(1); }
$c = str_replace($old2, $new2, $c);

// ---------- 1c) dispatch entry ----------
$old3 = "    case 'redeem-coupon':\n        appRedeemCoupon();";
if (strpos($c, $old3) === false) { fwrite(STDERR, "1c-OLD-NOT-FOUND (dispatch case)\n"); exit(1); }
$new3 = "    case 'adclick':\n        appAdClick();\n        break;\n    case 'redeem-coupon':\n        appRedeemCoupon();";
$c = str_replace($old3, $new3, $c);

file_put_contents($apiFile, $c);
echo "PATCHED api: allow-list + handler + dispatch\n";

// ---------- 3) admin stat card ----------
$adminFile = '/var/www/cinepix/admin/app_users.php';
$a = file_get_contents($adminFile);
if ($a === false) { fwrite(STDERR, "READ-FAIL admin\n"); exit(1); }
@copy($adminFile, $adminFile . '.bak_adclick');

$old4 = "\$recentUsers = (int)\$db->querySingle(\"SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)\");";
if (strpos($a, $old4) === false) { fwrite(STDERR, "3-OLD-NOT-FOUND (admin stats anchor)\n"); exit(1); }
$new4 = $old4 . "\n\$adClicksToday = (int)\$db->querySingle(\"SELECT COUNT(*) FROM app_ad_clicks WHERE created_at >= CURDATE()\");\n\$adClicksTotal = (int)\$db->querySingle(\"SELECT COUNT(*) FROM app_ad_clicks\");";
$a = str_replace($old4, $new4, $a);

file_put_contents($adminFile, $a);
echo "PATCHED admin: adClicksToday/Total computed (cards render where stats are echoed)\n";

// ---------- verify ----------
foreach ([$apiFile, $adminFile] as $f) {
    $chk = shell_exec("php -l $f 2>&1");
    echo $chk;
    if (strpos((string)$chk, 'No syntax errors') === false) {
        @copy($f . '.bak_adclick', $f);
        echo "SYNTAX-FAIL-ROLLED-BACK: $f\n";
        exit(1);
    }
}
echo "OK\n";
