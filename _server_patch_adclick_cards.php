<?php
/**
 * PATCH 2026-09-30: App Users page — ad click stat cards.
 * The $adClicksToday/$adClicksTotal computations were already added; this
 * renders two cards (Today / Total) at the end of the stats grid, styled
 * like the existing ones (pink/rose to match the coupon-unlock theme).
 */

$file = '/var/www/cinepix/admin/app_users.php';
$c = file_get_contents($file);
if ($c === false) { fwrite(STDERR, "READ-FAIL\n"); exit(1); }
if (strpos($c, 'adClicksToday') === false) {
    fwrite(STDERR, "PREREQ-MISSING: run _server_patch_adclick.php first\n");
    exit(1);
}
if (strpos($c, 'ad-click-cards-marker') !== false) {
    echo "ALREADY-PATCHED\n";
    exit(0);
}
@copy($file, $file . '.bak_adcards');

$old = "    <div class=\"card\" style=\"padding:16px;text-align:center\">\n        <div style=\"font-size:28px;font-weight:800;color:#ec4899\"><?= \$recentUsers ?></div>\n        <div style=\"font-size:12px;color:#9ca3af;margin-top:4px\"><i class=\"fas fa-user-plus\"></i> New (7 days)</div>\n    </div>\n</div>";
$new = "    <div class=\"card\" style=\"padding:16px;text-align:center\">\n        <div style=\"font-size:28px;font-weight:800;color:#ec4899\"><?= \$recentUsers ?></div>\n        <div style=\"font-size:12px;color:#9ca3af;margin-top:4px\"><i class=\"fas fa-user-plus\"></i> New (7 days)</div>\n    </div>\n    <!-- ad-click-cards-marker -->\n    <div class=\"card\" style=\"padding:16px;text-align:center;border:1px solid <?= \$adClicksToday > 0 ? 'rgba(236,72,153,.45)' : '#2a2d3a' ?>\">\n        <div style=\"font-size:28px;font-weight:800;color:#f472b6\"><?= \$adClicksToday ?></div>\n        <div style=\"font-size:12px;color:#9ca3af;margin-top:4px\"><i class=\"fas fa-ticket-alt\" style=\"color:#f472b6\"></i> Ad Clicks Today</div>\n    </div>\n    <div class=\"card\" style=\"padding:16px;text-align:center\">\n        <div style=\"font-size:28px;font-weight:800;color:#a78bfa\"><?= \$adClicksTotal ?></div>\n        <div style=\"font-size:12px;color:#9ca3af;margin-top:4px\"><i class=\"fas fa-mouse-pointer\"></i> Ad Clicks Total</div>\n    </div>\n</div>";

if (strpos($c, $old) === false) { fwrite(STDERR, "OLD-NOT-FOUND (stats grid tail)\n"); exit(1); }
$c = str_replace($old, $new, $c);

file_put_contents($file, $c);
echo "PATCHED: ad click stat cards added\n";

$chk = shell_exec("php -l $file 2>&1");
echo $chk;
if (strpos((string)$chk, 'No syntax errors') === false) {
    @copy($file . '.bak_adcards', $file);
    echo "SYNTAX-FAIL-ROLLED-BACK\n";
    exit(1);
}
echo "OK\n";
