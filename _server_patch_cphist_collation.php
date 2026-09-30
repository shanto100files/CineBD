<?php
// Server patch (2026-09-30): collation alignment for app_coupon_redemptions
// Table was created with the DB default (utf8mb4_general_ci) while every other
// table uses utf8mb4_unicode_ci -> "Illegal mix of collations" when joining users.
// 1) ALTER the live table to utf8mb4_unicode_ci.
// 2) Fix the CREATE DDL inside appEnsureCouponRedemptionsTable() in api/app.php
//    so fresh installs get the right collation.
// Idempotency marker: cphist-collation-marker
require '/var/www/cinepix/admin/includes/db.php';
$db = new SQLite3Wrapper();

$cur = $db->querySingle("SELECT TABLE_COLLATION FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_coupon_redemptions'");
echo "current: $cur\n";
if ($cur !== 'utf8mb4_unicode_ci') {
    $db->exec("ALTER TABLE app_coupon_redemptions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "altered to utf8mb4_unicode_ci\n";
} else {
    echo "already utf8mb4_unicode_ci\n";
}

$f = '/var/www/cinepix/api/app.php';
$s = file_get_contents($f);
if (strpos($s, 'cphist-collation-marker') === false) {
    $old = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\")";
    $new = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\") /* cphist-collation-marker */";
    $n = 0;
    $s2 = str_replace($old, $new, $s, $n);
    if ($n !== 1) { fwrite(STDERR, "DDL anchor matched $n times - skipping app.php edit\n"); }
    else {
        copy($f, $f . '.bak_cphistcol');
        file_put_contents($f, $s2);
        exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $code);
        echo implode("\n", $out) . "\n";
        if ($code !== 0) { copy($f . '.bak_cphistcol', $f); fwrite(STDERR, "lint failed - rolled back\n"); exit(1); }
        echo "app.php DDL fixed\n";
    }
} else {
    echo "app.php already marked\n";
}
echo "done\n";
