<?php
// Server patch (2026-09-30): coupon redemption history
// 1) New table app_coupon_redemptions (id, coupon_id, code, user_id, device_id,
//    profile_id, profile_name, providers, days, created_at) for a per-user
//    redemption log (app_user_provider_unlocks is a per-provider inventory that
//    merges re-redeems, so it cannot answer "who redeemed what, when").
// 2) appRedeemCoupon() now logs one row per successful redemption (after the
//    unlock rows are written, before used_count++). Failure is non-fatal
//    (@-suppressed) so the unlock flow can never break because of logging.
//    device_id is read from the JSON body if the client sends it.
// 3) appEnsureCouponRedemptionsTable() is called from appRedeemCoupon() (lazy
//    CREATE TABLE IF NOT EXISTS, same pattern as appEnsureAdClickTable).
// Idempotency marker: coupon-history-marker

$f = '/var/www/cinepix/api/app.php';
if (!is_file($f)) { fwrite(STDERR, "missing $f\n"); exit(1); }
$s = file_get_contents($f);
if (strpos($s, 'coupon-history-marker') !== false) { echo "already patched\n"; exit(0); }
if (strpos($s, 'function appRedeemCoupon') === false) { fwrite(STDERR, "appRedeemCoupon not found\n"); exit(1); }

// --- step 1: ensure-function appended right before appRedeemCoupon() ---
$ensureFn = <<<'PHP'
/* coupon-history-marker: per-redemption log table */
function appEnsureCouponRedemptionsTable($db) {
    static $done = false;
    if ($done) return;
    $db->exec("CREATE TABLE IF NOT EXISTS app_coupon_redemptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coupon_id INT NOT NULL,
        code VARCHAR(64) NOT NULL,
        user_id INT NOT NULL,
        device_id VARCHAR(128) NOT NULL DEFAULT '',
        profile_id VARCHAR(64) NOT NULL DEFAULT '',
        profile_name VARCHAR(64) NOT NULL DEFAULT '',
        providers TEXT,
        days INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cr_user (user_id),
        INDEX idx_cr_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $done = true;
}

PHP;
$anchor = 'function appRedeemCoupon() {';
$n = 0;
$s = str_replace($anchor, $ensureFn . $anchor, $s, $n);
if ($n !== 1) { fwrite(STDERR, "anchor(appRedeemCoupon) matched $n times - aborting\n"); exit(1); }

// --- step 2: log row inside appRedeemCoupon, before used_count++ ---
$oldHook = "    \$db->exec(\"UPDATE app_provider_coupons SET used_count = used_count + 1 WHERE id=\" . (int)\$coupon['id']);";
$newHook = "    /* coupon-history-marker: log this redemption (best-effort, never blocks unlocks) */\n"
         . "    appEnsureCouponRedemptionsTable(\$db);\n"
         . "    try {\n"
         . "        \$ins = \$db->prepare(\"INSERT INTO app_coupon_redemptions (coupon_id, code, user_id, device_id, profile_id, profile_name, providers, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\");\n"
         . "        \$ins->bindValue(1, (int)\$coupon['id'], SQLITE3_INTEGER);\n"
         . "        \$ins->bindValue(2, \$safeCode, SQLITE3_TEXT);\n"
         . "        \$ins->bindValue(3, (int)\$uid, SQLITE3_INTEGER);\n"
         . "        \$ins->bindValue(4, mb_substr(trim((string)(\$input['device_id'] ?? '')), 0, 128), SQLITE3_TEXT);\n"
         . "        \$ins->bindValue(5, mb_substr(\$profileId, 0, 64), SQLITE3_TEXT);\n"
         . "        \$ins->bindValue(6, mb_substr(\$profileName, 0, 64), SQLITE3_TEXT);\n"
         . "        \$ins->bindValue(7, implode(', ', \$values), SQLITE3_TEXT);\n"
         . "        \$ins->bindValue(8, \$days, SQLITE3_INTEGER);\n"
         . "        \$ins->execute();\n"
         . "    } catch (Throwable \$e) { /* logging must never break redeem */ }\n"
         . "    \$db->exec(\"UPDATE app_provider_coupons SET used_count = used_count + 1 WHERE id=\" . (int)\$coupon['id']);";
$n = 0;
$s = str_replace($oldHook, $newHook, $s, $n);
if ($n !== 1) { fwrite(STDERR, "anchor(used_count) matched $n times - aborting\n"); exit(1); }

copy($f, $f . '.bak_cphist');
file_put_contents($f, $s);
exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $code);
echo implode("\n", $out) . "\n";
if ($code !== 0) { copy($f . '.bak_cphist', $f); fwrite(STDERR, "lint failed - rolled back\n"); exit(1); }
echo "patched OK\n";
