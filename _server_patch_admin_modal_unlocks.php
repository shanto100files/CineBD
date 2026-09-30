<?php
/**
 * PATCH 2026-09-30 (part 2): admin app_users.php — coupon unlocks in modal.
 *  1) get_user_info action: include active coupon unlocks
 *     (provider display name, source code, profile name, days left).
 *  2) openUserModal JS: render a "Coupon unlocks" list above the checkbox
 *     grid, so a coupon-only account no longer reads as "Default".
 */

$file = '/var/www/cinepix/admin/app_users.php';
$c = file_get_contents($file);
if ($c === false) { fwrite(STDERR, "READ-FAIL\n"); exit(1); }
@copy($file, $file . '.bak_unlocks_modal');

// ---------- 1) get_user_info: attach unlocks ----------
$old1 = "                'providers' => \$providers,\n                'stats' => [";
if (strpos($c, $old1) === false) { fwrite(STDERR, "1-OLD-NOT-FOUND (locate get_user_info providers key)\n"); exit(1); }
$new1 = "                // FIX-2026-09-30: expose active coupon unlocks so the modal
                // shows exactly what the account redeemed (and via which profile).\n                'unlocks' => (function () use (\$db, \$userId) {\n                    \$out = [];\n                    \$unRes = \$db->query(\"SELECT uu.provider_value, uu.source_code, uu.profile_name, GREATEST(1, DATEDIFF(uu.expires_at, NOW())) AS days_left FROM app_user_provider_unlocks uu WHERE uu.user_id=\$userId AND uu.expires_at > NOW() ORDER BY uu.provider_value\");\n                    if (\$unRes) { while (\$ur = \$unRes->fetchArray(SQLITE3_ASSOC)) { \$out[] = \$ur; } }\n                    return \$out;\n                })(),\n                'providers' => \$providers,\n                'stats' => [";
$c = str_replace($old1, $new1, $c);

// ---------- 2) modal JS: coupon unlocks section ----------
$old2 = "        const userProviders = d.providers;\n        const isDefault = userProviders.length === 0;";
$new2 = "        // FIX-2026-09-30: coupon unlocks (per profile) shown above the grid.\n        let unlockHtml = '';\n        const unlockList = d.unlocks || [];\n        if (unlockList.length > 0) {\n            unlockHtml += '<div style=\"grid-column:1/-1;margin:2px 0 6px\"><div style=\"font-size:12px;font-weight:700;color:#f472b6;margin-bottom:6px\"><i class=\"fas fa-ticket-alt\"></i> Coupon unlocks (' + unlockList.length + ')</div>';\n            unlockList.forEach(un => {\n                unlockHtml += '<div style=\"display:flex;justify-content:space-between;gap:8px;padding:6px 10px;background:#13151d;border:1px solid rgba(236,72,153,.25);border-radius:6px;font-size:11px;color:#e0e0e0;margin-bottom:4px\">';\n                unlockHtml += '<span>' + (un.provider_value || '?') + '</span>';\n                unlockHtml += '<span style=\"color:#9ca3af\">' + (un.source_code ? 'code ' + un.source_code : '') + (un.profile_name ? ' &bull; profile: ' + un.profile_name : '') + ' &bull; ' + un.days_left + 'd left</span>';\n                unlockHtml += '</div>';\n            });\n            unlockHtml += '</div>';\n        }\n        const userProviders = d.providers;\n        const isDefault = userProviders.length === 0;";
if (strpos($c, $old2) === false) { fwrite(STDERR, "2-OLD-NOT-FOUND (locate modal provider list)\n"); exit(1); }
$c = str_replace($old2, $new2, $c);

$old3 = "        document.getElementById('providerCheckboxes').innerHTML = html;";
$new3 = "        document.getElementById('providerCheckboxes').innerHTML = unlockHtml + html;";
if (strpos($c, $old3) === false) { fwrite(STDERR, "3-OLD-NOT-FOUND (locate providerCheckboxes render)\n"); exit(1); }
$c = str_replace($old3, $new3, $c);

file_put_contents($file, $c);
echo "PATCHED: $file\n";
echo "1: get_user_info returns unlocks[]\n";
echo "2+3: modal renders Coupon unlocks section\n";

$chk = shell_exec("php -l $file 2>&1");
echo $chk;
if (strpos((string)$chk, 'No syntax errors') === false) {
    @copy($file . '.bak_unlocks_modal', $file);
    echo "SYNTAX-FAIL-ROLLED-BACK\n";
    exit(1);
}
echo "OK\n";
