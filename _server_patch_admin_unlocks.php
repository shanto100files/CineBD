<?php
/**
 * PATCH 2026-09-30: admin App Users page — coupon unlock transparency.
 *  1) Users query: unlock_count + unlock_badges (provider, days, profile).
 *  2) Providers cell: pink coupon-unlock badges above admin-grant chips.
 */

$file = '/var/www/cinepix/admin/app_users.php';
$c = file_get_contents($file);
if ($c === false) { fwrite(STDERR, "READ-FAIL\n"); exit(1); }
@copy($file, $file . '.bak_unlocks');

// ---------- 1) users query: unlock aggregates ----------
$old1 = "        GROUP_CONCAT(aup.provider_value SEPARATOR ', ') as custom_providers\n    FROM users u\n    LEFT JOIN app_user_providers aup ON u.id = aup.user_id";
$new1 = "        GROUP_CONCAT(aup.provider_value SEPARATOR ', ') as custom_providers,\n        (SELECT COUNT(*) FROM app_user_provider_unlocks uu WHERE uu.user_id = u.id AND uu.expires_at > NOW()) AS unlock_count,\n        (SELECT GROUP_CONCAT(x.badge SEPARATOR ', ') FROM (SELECT CONCAT(p.display_name, ' (', GREATEST(1, DATEDIFF(uu.expires_at, NOW())), 'd', IF(uu.profile_name IS NOT NULL AND uu.profile_name != '', CONCAT(', ', uu.profile_name), ''), ')') AS badge FROM app_user_provider_unlocks uu JOIN app_providers p ON p.value = uu.provider_value WHERE uu.user_id = u.id AND uu.expires_at > NOW()) x) AS unlock_badges\n    FROM users u\n    LEFT JOIN app_user_providers aup ON u.id = aup.user_id";
if (strpos($c, $old1) === false) { fwrite(STDERR, "1-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($old1, $new1, $c);

// ---------- 2) providers cell: unlock badges first ----------
$old2 = "                <td style=\"padding:10px 14px;max-width:200px\">\n                    <?php if (\$u['custom_providers']): ?>";
$new2 = "                <td style=\"padding:10px 14px;max-width:200px\">\n                    <?php if (!empty(\$u['unlock_badges'])): ?>\n                        <?php foreach (explode(', ', \$u['unlock_badges']) as \$ub): ?>\n                            <span style=\"background:rgba(236,72,153,.12);color:#f472b6;padding:1px 7px;border-radius:12px;font-size:10px;font-weight:600;display:inline-block;margin:1px 2px\" title=\"Coupon unlock\"><?= htmlspecialchars(\$ub) ?> 🎫</span>\n                        <?php endforeach; ?>\n                    <?php endif; ?>\n                    <?php if (\$u['custom_providers']): ?>";
if (strpos($c, $old2) === false) { fwrite(STDERR, "2-OLD-NOT-FOUND\n"); exit(1); }
$c = str_replace($old2, $new2, $c);

file_put_contents($file, $c);
echo "PATCHED: $file\n";
echo "1: users query gains unlock_count + unlock_badges\n";
echo "2: providers cell shows coupon unlock badges\n";

$chk = shell_exec("php -l $file 2>&1");
echo $chk;
if (strpos((string)$chk, 'No syntax errors') === false) {
    @copy($file . '.bak_unlocks', $file);
    echo "SYNTAX-FAIL-ROLLED-BACK\n";
    exit(1);
}
echo "OK\n";
