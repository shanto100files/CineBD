<?php
// Server patch (2026-09-30): badge separator collision fix in admin/app_users.php
// The unlock_badges GROUP_CONCAT separator ', ' also appears inside badge text
// ("Name 18+ (7d, 18+)") so PHP explode(', ') split one badge into two chips.
// Fix: use ' ;; ' as separator in both SQL and PHP explode.
// Idempotency marker: badges-sep-marker
$f = '/var/www/cinepix/admin/app_users.php';
$s = file_get_contents($f);
if (strpos($s, 'badges-sep-marker') !== false) { echo "already patched\n"; exit(0); }

$pairs = [
    ["SEPARATOR ', ') FROM app_user_provider_unlocks", "SEPARATOR ' ;; ') FROM app_user_provider_unlocks /* badges-sep-marker */"],
    ["explode(', ', \$u['unlock_badges'])", "explode(' ;; ', \$u['unlock_badges'])"],
];
$changed = 0;
foreach ($pairs as $i => [$old, $new]) {
    $n = 0;
    $s = str_replace($old, $new, $s, $n);
    if ($n !== 1) { fwrite(STDERR, "pair $i matched $n times - aborting\n"); exit(1); }
    $changed += $n;
}
copy($f, $f . '.bak_badgesfix2');
file_put_contents($f, $s);
exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $code);
echo implode("\n", $out) . "\n";
if ($code !== 0) { copy($f . '.bak_badgesfix2', $f); fwrite(STDERR, "lint failed - rolled back\n"); exit(1); }
echo "patched OK ($changed replacements)\n";
