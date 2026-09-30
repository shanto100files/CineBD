<?php
// Live verification for coupon history: 1) render page (creates table), 2) insert a
// temp test redemption exactly like the API hook does, 3) render again and check
// the row renders, 4) delete the test row.
$_SERVER['HTTP_HOST'] = 'cinepix.top';
$_GET['filter'] = 'all';
ob_start();
include '/var/www/cinepix/admin/coupon_history.php';
$html = ob_get_clean();
file_put_contents('/tmp/cph1.html', $html);
echo "RENDER1: bytes=" . strlen($html) . " fatal=" . (int)(strpos($html, 'Fatal error') !== false)
   . " empty-state=" . (int)(strpos($html, 'No redemptions yet') !== false) . "\n";

require_once '/var/www/cinepix/admin/includes/db.php';
$db = new SQLite3Wrapper();
$cols = [];
$q = $db->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_coupon_redemptions' ORDER BY ORDINAL_POSITION");
while ($r = $q->fetchArray(SQLITE3_ASSOC)) $cols[] = $r['COLUMN_NAME'];
echo "TABLE: " . implode(',', $cols) . "\n";

// mimic the API hook insert
$ins = $db->prepare("INSERT INTO app_coupon_redemptions (coupon_id, code, user_id, device_id, profile_id, profile_name, providers, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
$ins->bindValue(1, 999, SQLITE3_INTEGER); $ins->bindValue(2, 'TESTX', SQLITE3_TEXT);
$ins->bindValue(3, 465, SQLITE3_INTEGER); $ins->bindValue(4, 'test-device-abc', SQLITE3_TEXT);
$ins->bindValue(5, 'p18', SQLITE3_TEXT); $ins->bindValue(6, '18+', SQLITE3_TEXT);
$ins->bindValue(7, 'Xmishti 18+, MovieLinkBD 18+', SQLITE3_TEXT); $ins->bindValue(8, 7, SQLITE3_INTEGER);
$ins->execute();
echo "SEED: ok\n";

$_GET['filter'] = 'all';
ob_start();
include '/var/www/cinepix/admin/coupon_history.php';
$html2 = ob_get_clean();
file_put_contents('/tmp/cph2.html', $html2);
echo "RENDER2: bytes=" . strlen($html2) . " fatal=" . (int)(strpos($html2, 'Fatal error') !== false) . "\n";
foreach (['TESTX', 'test1', '18+', 'Xmishti 18+, MovieLinkBD 18+', 'test-device-abc', 'Total Redemptions', 'Unique Users'] as $needle) {
    echo "HAS[$needle]=" . (int)(strpos($html2, $needle) !== false) . "\n";
}
// search filter by username
$_GET['filter'] = 'all'; $_GET['q'] = 'test1';
ob_start();
include '/var/www/cinepix/admin/coupon_history.php';
$html3 = ob_get_clean();
echo "SEARCH test1: rows-with-TESTX=" . (int)(strpos($html3, 'TESTX') !== false) . " bytes=" . strlen($html3) . "\n";

// premium filter should include test1? (test1 premium=0) — just check no fatal
$_GET['q'] = ''; $_GET['filter'] = 'premium';
ob_start();
include '/var/www/cinepix/admin/coupon_history.php';
$html4 = ob_get_clean();
echo "FILTER premium: fatal=" . (int)(strpos($html4, 'Fatal error') !== false) . "\n";

// cleanup test row
$db->exec("DELETE FROM app_coupon_redemptions WHERE code='TESTX' AND user_id=465");
$c = $db->querySingle("SELECT COUNT(*) FROM app_coupon_redemptions");
echo "CLEANUP: rows_now=$c\n";
