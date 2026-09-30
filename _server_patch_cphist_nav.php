<?php
// Server patch (2026-09-30): add "Coupon History" nav item under Mobile App section
// Idempotency marker: cphist-nav-marker
$f = '/var/www/cinepix/admin/includes/header.php';
$s = file_get_contents($f);
if (strpos($s, 'cphist-nav-marker') !== false) { echo "already patched\n"; exit(0); }

$anchor = <<<'HTML'
            <a href="/admin/app_reports.php" class="nav-item <?= $currentPage == 'app_reports.php' ? 'active' : '' ?>">
HTML;
$new = <<<'HTML'
            <a href="/admin/coupon_history.php" class="nav-item <?= $currentPage == 'coupon_history.php' ? 'active' : '' ?>">
                <i class="fas fa-ticket-alt"></i><span>Coupon History</span>
            </a>
            <a href="/admin/app_reports.php" class="nav-item <?= $currentPage == 'app_reports.php' ? 'active' : '' ?>">
HTML;
$n = 0;
$s2 = str_replace($anchor, $new, $s, $n);
if ($n !== 1) { fwrite(STDERR, "anchor matched $n times - aborting\n"); exit(1); }
$s2 = "<?php\n// cphist-nav-marker: Coupon History nav added 2026-09-30\n" . substr($s2, 5);
copy($f, $f . '.bak_cphistnav');
file_put_contents($f, $s2);
exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $code);
echo implode("\n", $out) . "\n";
if ($code !== 0) { copy($f . '.bak_cphistnav', $f); fwrite(STDERR, "lint failed - rolled back\n"); exit(1); }
echo "patched OK\n";
