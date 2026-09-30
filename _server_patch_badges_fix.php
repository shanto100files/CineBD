<?php
// Server patch (2026-09-30): fix unlock_badges subquery in admin/app_users.php
// Bug: the badge subquery used a correlated DERIVED table
//      (SELECT GROUP_CONCAT(x.badge ...) FROM (SELECT ... WHERE uu.user_id = u.id) x)
//      MySQL/MariaDB cannot reference outer alias u.id inside a FROM-derived table
//      -> "Unknown column 'u.id' in 'WHERE'" -> the whole users-list query throws
//      -> page dies mid-render -> user list disappears (empty below search box).
// Fix: direct correlated scalar subquery with GROUP_CONCAT(DISTINCT CONCAT(...)).
// Idempotency marker: badges-fix-marker
$f = '/var/www/cinepix/admin/app_users.php';
if (!is_file($f)) { fwrite(STDERR, "missing $f\n"); exit(1); }
$s = file_get_contents($f);
if (strpos($s, 'badges-fix-marker') !== false) { echo "already patched\n"; exit(0); }

$broken = "(SELECT GROUP_CONCAT(x.badge SEPARATOR ', ') FROM (SELECT CONCAT(p.display_name, ' (', GREATEST(1, DATEDIFF(uu.expires_at, NOW())), 'd', IF(uu.profile_name IS NOT NULL AND uu.profile_name != '', CONCAT(', ', uu.profile_name), ''), ')') AS badge FROM app_user_provider_unlocks uu JOIN app_providers p ON p.value = uu.provider_value WHERE uu.user_id = u.id AND uu.expires_at > NOW()) x) AS unlock_badges";
$fixed  = "/* badges-fix-marker */ (SELECT GROUP_CONCAT(DISTINCT CONCAT(p.display_name, ' (', GREATEST(1, DATEDIFF(uu.expires_at, NOW())), 'd', IF(uu.profile_name IS NOT NULL AND uu.profile_name != '', CONCAT(', ', uu.profile_name), ''), ')') SEPARATOR ', ') FROM app_user_provider_unlocks uu JOIN app_providers p ON p.value = uu.provider_value WHERE uu.user_id = u.id AND uu.expires_at > NOW()) AS unlock_badges";

if (strpos($s, $broken) === false) { fwrite(STDERR, "pattern not found - aborting\n"); exit(1); }
copy($f, $f . '.bak_badgesfix');
$s2 = str_replace($broken, $fixed, $s);
file_put_contents($f, $s2);
exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $code);
echo implode("\n", $out) . "\n";
if ($code !== 0) { copy($f . '.bak_badgesfix', $f); fwrite(STDERR, "lint failed - rolled back\n"); exit(1); }
echo "patched OK\n";

// Also verify no other admin file uses the same broken derived-table pattern
exec("grep -rln 'GROUP_CONCAT(x.badge' /var/www/cinepix/admin/ 2>/dev/null", $hits);
echo "other-files-with-pattern: " . (count($hits) ? implode(',', $hits) : 'none') . "\n";
