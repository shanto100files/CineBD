<?php
/**
 * PATCH 2026-09-30 (MySQL-safe): profile-aware provider visibility + coupon transparency.
 *
 * Root cause of the user's report:
 *  1) myproviders (free branch): when ANY granted/coupon unlock existed, the
 *     open catalog (default active plugins) was REPLACED by that list — after
 *     redeeming an 18+ coupon (e.g. ADULT7) the account's default plugins
 *     disappeared from every profile (family/18+/default).
 *  2) Coupon unlocks were never linked to the profile that redeemed them.
 *
 * Fixes:
 *  A) app.php free branch: UNION the open catalog into the granted list.
 *  B) app_user_provider_unlocks: add profile_id/profile_name columns; the
 *     redeem handler records the profile sent by the app.
 */

$file = '/var/www/cinepix/api/app.php';
$c = file_get_contents($file);
if ($c === false) { fwrite(STDERR, "READ-FAIL\n"); exit(1); }
@copy($file, $file . '.bak_profilepatch');

// ---------- A) free branch: open catalog UNION instead of REPLACE ----------
$oldA = "        \$granted = \$db->query(\"SELECT p.value, p.display_name, p.icon, NULL AS coupon_expires_at, NULL AS coupon_days FROM app_user_providers up JOIN app_providers p ON up.provider_value=p.value WHERE up.user_id=\$uid AND p.disabled=0 UNION ALL SELECT p.value, p.display_name, p.icon, u.expires_at AS coupon_expires_at, c.days AS coupon_days FROM app_user_provider_unlocks u JOIN app_providers p ON u.provider_value=p.value LEFT JOIN app_provider_coupons c ON c.code=u.source_code WHERE u.user_id=\$uid AND u.expires_at > NOW() AND p.disabled=0 ORDER BY display_name\");";
$newA = "        // FIX-2026-09-30: the granted list REPLACED the open catalog — after\n        // redeeming an 18+ coupon the account's DEFAULT active plugins vanished.\n        // UNION the open catalog in (dedup by value) so defaults always stay\n        // visible alongside admin grants and coupon unlocks.\n        \$granted = \$db->query(\"SELECT value, display_name, icon, MAX(coupon_expires_at) AS coupon_expires_at, MAX(coupon_days) AS coupon_days FROM (SELECT p.value AS value, p.display_name, p.icon, NULL AS coupon_expires_at, NULL AS coupon_days FROM app_user_providers up JOIN app_providers p ON up.provider_value=p.value WHERE up.user_id=\$uid AND p.disabled=0 UNION ALL SELECT p.value AS value, p.display_name, p.icon, u.expires_at AS coupon_expires_at, c.days AS coupon_days FROM app_user_provider_unlocks u JOIN app_providers p ON u.provider_value=p.value LEFT JOIN app_provider_coupons c ON c.code=u.source_code WHERE u.user_id=\$uid AND u.expires_at > NOW() AND p.disabled=0 UNION ALL SELECT p.value AS value, p.display_name, p.icon, NULL AS coupon_expires_at, NULL AS coupon_days FROM app_providers p WHERE p.disabled=0 AND p.access_mode='all') t GROUP BY value, display_name, icon ORDER BY display_name\");";
if (strpos($c, $oldA) === false) { fwrite(STDERR, "A-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($oldA, $newA, $c);

// ---------- B1) unlock table: profile columns (MySQL-safe) ----------
$oldB1 = "function appSweepExpiredUnlocks(\$db, \$uid) {";
$newB1 = "// FIX-2026-09-30: remember which profile redeemed a coupon so the admin\n// panel can show per-account coupon unlocks accurately.\nfunction appEnsureUnlockProfileColumns(\$db) {\n    \$hasProfileId = (int)\$db->querySingle(\"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_user_provider_unlocks' AND COLUMN_NAME='profile_id'\");\n    if (!\$hasProfileId) { \$db->exec(\"ALTER TABLE app_user_provider_unlocks ADD COLUMN profile_id VARCHAR(64) NULL\"); }\n    \$hasProfileName = (int)\$db->querySingle(\"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_user_provider_unlocks' AND COLUMN_NAME='profile_name'\");\n    if (!\$hasProfileName) { \$db->exec(\"ALTER TABLE app_user_provider_unlocks ADD COLUMN profile_name VARCHAR(64) NULL\"); }\n}\n\nfunction appSweepExpiredUnlocks(\$db, \$uid) {";
if (strpos($c, $oldB1) === false) { fwrite(STDERR, "B1-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($oldB1, $newB1, $c);

// ---------- B2) redeem handler: accept + persist profile ----------
$oldB2 = "    \$values = array_values(array_filter(array_map('trim', explode(',', (string)\$coupon['provider_values']))));";
$newB2 = "    \$profileId = trim((string)(\$input['profile_id'] ?? ''));\n    \$profileName = trim((string)(\$input['profile_name'] ?? ''));\n    appEnsureUnlockProfileColumns(\$db);\n    \$values = array_values(array_filter(array_map('trim', explode(',', (string)\$coupon['provider_values']))));";
if (strpos($c, $oldB2) === false) { fwrite(STDERR, "B2-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($oldB2, $newB2, $c);

$oldB3 = "    \$stmt = \$db->prepare(\"INSERT INTO app_user_provider_unlocks (user_id, provider_value, source_code, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY)) ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, DATE_ADD(NOW(), INTERVAL ? DAY)), source_code = VALUES(source_code)\");";
$newB3 = "    \$stmt = \$db->prepare(\"INSERT INTO app_user_provider_unlocks (user_id, provider_value, source_code, profile_id, profile_name, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY)) ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, DATE_ADD(NOW(), INTERVAL ? DAY)), source_code = VALUES(source_code)\");";
if (strpos($c, $oldB3) === false) { fwrite(STDERR, "B3-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($oldB3, $newB3, $c);

$oldB4 = "        \$stmt->reset(); \$stmt->bindValue(1, \$uid, SQLITE3_INTEGER); \$stmt->bindValue(2, \$spv, SQLITE3_TEXT);\n        \$stmt->bindValue(3, \$safeCode, SQLITE3_TEXT); \$stmt->bindValue(4, \$days, SQLITE3_INTEGER); \$stmt->bindValue(5, \$days, SQLITE3_INTEGER);\n        \$stmt->execute();";
$newB4 = "        \$sPid = \$profileId !== '' ? mb_substr(\$profileId, 0, 64) : '';\n        \$sPname = \$profileName !== '' ? mb_substr(\$profileName, 0, 64) : '';\n        \$stmt->reset(); \$stmt->bindValue(1, \$uid, SQLITE3_INTEGER); \$stmt->bindValue(2, \$spv, SQLITE3_TEXT);\n        \$stmt->bindValue(3, \$safeCode, SQLITE3_TEXT); \$stmt->bindValue(4, \$sPid, SQLITE3_TEXT); \$stmt->bindValue(5, \$sPname, SQLITE3_TEXT);\n        \$stmt->bindValue(6, \$days, SQLITE3_INTEGER); \$stmt->bindValue(7, \$days, SQLITE3_INTEGER);\n        \$stmt->execute();";
if (strpos($c, $oldB4) === false) { fwrite(STDERR, "B4-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($oldB4, $newB4, $c);

file_put_contents($file, $c);
echo "PATCHED: $file\n";
echo "A: open-catalog UNION in free myproviders\n";
echo "B: unlock profile columns + redeem records profile\n";

// ---------- verify ----------
$chk = shell_exec("php -l $file 2>&1");
echo $chk;
if (strpos((string)$chk, 'No syntax errors') === false) {
    @copy($file . '.bak_profilepatch', $file);
    echo "SYNTAX-FAIL-ROLLED-BACK\n";
    exit(1);
}

// Live-test the new UNION query shape on MySQL (free-branch for uid=99999999 = empty grants + catalog).
require_once '/var/www/cinepix/admin/includes/db.php';
$tdb = getDB();
$q = "SELECT value, display_name, icon, MAX(coupon_expires_at) AS coupon_expires_at, MAX(coupon_days) AS coupon_days FROM (SELECT p.value AS value, p.display_name, p.icon, NULL AS coupon_expires_at, NULL AS coupon_days FROM app_user_providers up JOIN app_providers p ON up.provider_value=p.value WHERE up.user_id=99999999 AND p.disabled=0 UNION ALL SELECT p.value AS value, p.display_name, p.icon, u.expires_at AS coupon_expires_at, c.days AS coupon_days FROM app_user_provider_unlocks u JOIN app_providers p ON u.provider_value=p.value LEFT JOIN app_provider_coupons c ON c.code=u.source_code WHERE u.user_id=99999999 AND u.expires_at > NOW() AND p.disabled=0 UNION ALL SELECT p.value AS value, p.display_name, p.icon, NULL AS coupon_expires_at, NULL AS coupon_days FROM app_providers p WHERE p.disabled=0 AND p.access_mode='all') t GROUP BY value, display_name, icon ORDER BY display_name";
$tr = $tdb->query($q);
if (!$tr) { echo "UNION-QUERY-FAIL\n"; exit(1); }
$n = 0; while ($tr->fetchArray(SQLITE3_ASSOC)) { $n++; }
echo "UNION-QUERY-OK rows=$n (expect 7 = open catalog)\n";
echo "OK\n";
