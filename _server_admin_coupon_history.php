<?php
$pageTitle = 'Coupon History';

require_once __DIR__ . '/includes/db.php';
$db = getDB();
$currentPage = 'coupon_history.php';

/* Lazy table create — same pattern as ad-click cards (idempotent, cheap) */
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

/* -------- filters -------- */
$filter = $_GET['filter'] ?? 'all';
$q      = trim($_GET['q'] ?? '');
$where  = '';
if ($filter === 'today')    $where = ' WHERE r.created_at >= CURDATE()';
if ($filter === 'week')     $where = ' WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
if ($filter === 'premium')  $where = ' WHERE u.premium = 1';
if ($q !== '') {
    $safe = $db->escapeString($q);
    $where = ' WHERE (u.username LIKE \'%' . $safe . '%\' OR u.email LIKE \'%' . $safe . '%\' OR r.code LIKE \'%' . $safe . '%\')';
}

$stats = [
    'total'   => (int)$db->querySingle("SELECT COUNT(*) FROM app_coupon_redemptions"),
    'today'   => (int)$db->querySingle("SELECT COUNT(*) FROM app_coupon_redemptions WHERE created_at >= CURDATE()"),
    'users'   => (int)$db->querySingle("SELECT COUNT(DISTINCT user_id) FROM app_coupon_redemptions"),
    'active'  => (int)$db->querySingle("SELECT COUNT(DISTINCT user_id) FROM app_user_provider_unlocks WHERE expires_at > NOW()"),
];

$rows = [];
$res = $db->query("
    SELECT r.*, u.username, u.email, u.premium,
        (SELECT COUNT(*) FROM app_user_provider_unlocks uu
          WHERE uu.user_id = r.user_id AND uu.source_code = r.code AND uu.expires_at > NOW()) AS active_unlocks
    FROM app_coupon_redemptions r
    LEFT JOIN users u ON u.id = r.user_id
    $where
    ORDER BY r.id DESC
    LIMIT 200
");
while ($r = $res->fetchArray(SQLITE3_ASSOC)) $rows[] = $r;

require_once __DIR__ . '/includes/header.php';
?>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
    <h1 style="font-size:22px;font-weight:700;color:#e0e0e0;margin:0">
        <i class="fas fa-ticket-alt" style="color:#f472b6;margin-right:8px"></i>Coupon History
    </h1>
    <a href="/admin/app_users.php" class="btn btn-ghost btn-sm"><i class="fas fa-users"></i> App Users</a>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">
    <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:#f472b6"><?= $stats['total'] ?></div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px"><i class="fas fa-receipt"></i> Total Redemptions</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:#34d399"><?= $stats['today'] ?></div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px"><i class="fas fa-calendar-day"></i> Today</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:#60a5fa"><?= $stats['users'] ?></div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px"><i class="fas fa-users"></i> Unique Users</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:#fbbf24"><?= $stats['active'] ?></div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px"><i class="fas fa-unlock-alt"></i> Users With Active Unlocks</div>
    </div>
</div>

<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <?php foreach ([['all', 'All'], ['today', 'Today'], ['week', 'Last 7 Days'], ['premium', 'Premium Users']] as [$key, $label]):
        $cnt = ['all' => $stats['total'], 'today' => $stats['today'], 'week' => null, 'premium' => null][$key]; ?>
        <a href="?filter=<?= $key ?>" class="btn <?= $filter === $key ? 'btn-primary' : 'btn-ghost' ?> btn-sm">
            <?= $label ?><?= $cnt !== null ? " ($cnt)" : '' ?>
        </a>
    <?php endforeach; ?>
</div>

<form method="GET" style="margin-bottom:16px;display:flex;gap:8px">
    <input type="hidden" name="filter" value="<?= htmlspecialchars($filter) ?>">
    <input type="text" name="q" placeholder="Search username, email or coupon code..." value="<?= htmlspecialchars($q) ?>"
           style="flex:1;padding:10px 14px;background:#13151d;border:1px solid #2a2d3a;border-radius:8px;color:#e0e0e0;font-size:14px">
    <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-search"></i></button>
    <?php if ($q !== ''): ?><a href="?filter=<?= $filter ?>" class="btn btn-ghost btn-sm"><i class="fas fa-times"></i></a><?php endif; ?>
</form>

<div class="card" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;min-width:760px">
        <thead>
            <tr style="border-bottom:1px solid #2a2d3a">
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">When</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">User</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">Coupon</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">Profile</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">Providers Unlocked</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">Still Active</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase">Device</th>
            </tr>
        </thead>
        <tbody>
        <?php if (empty($rows)): ?>
            <tr><td colspan="7" style="padding:28px;text-align:center;color:#6b7280;font-size:13px">
                <i class="fas fa-ticket-alt" style="font-size:22px;display:block;margin-bottom:8px;opacity:.5"></i>
                No redemptions yet.
            </td></tr>
        <?php endif; ?>
        <?php foreach ($rows as $r): ?>
            <tr style="border-bottom:1px solid #1a1d27">
                <td style="padding:10px 14px;white-space:nowrap">
                    <div style="color:#e0e0e0;font-size:12px;font-weight:600"><?= date('d M Y', strtotime($r['created_at'])) ?></div>
                    <div style="color:#6b7280;font-size:11px"><?= date('h:i A', strtotime($r['created_at'])) ?></div>
                </td>
                <td style="padding:10px 14px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,<?= $r['premium'] ? '#f59e0b,#f97316' : '#3b82f6,#8b5cf6' ?>);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">
                            <?= strtoupper(substr((string)($r['username'] ?? '?'), 0, 1)) ?>
                        </div>
                        <div>
                            <div style="color:#e0e0e0;font-weight:600;font-size:12px"><?= htmlspecialchars((string)($r['username'] ?? 'Deleted #' . $r['user_id'])) ?></div>
                            <div style="color:#6b7280;font-size:10px"><?= htmlspecialchars((string)($r['email'] ?? '')) ?></div>
                        </div>
                    </div>
                </td>
                <td style="padding:10px 14px">
                    <span style="background:rgba(236,72,153,.12);color:#f472b6;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;display:inline-block"><?= htmlspecialchars($r['code']) ?></span>
                    <div style="color:#6b7280;font-size:10px;margin-top:3px"><?= (int)$r['days'] ?> days</div>
                </td>
                <td style="padding:10px 14px">
                    <?php if (!empty($r['profile_name'])): ?>
                        <span style="background:rgba(139,92,246,.15);color:#a78bfa;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600"><?= htmlspecialchars($r['profile_name']) ?></span>
                    <?php else: ?><span style="color:#6b7280;font-size:11px">—</span><?php endif; ?>
                </td>
                <td style="padding:10px 14px;font-size:11px;color:#d1d5db;max-width:340px"><?= htmlspecialchars((string)$r['providers']) ?></td>
                <td style="padding:10px 14px;text-align:center">
                    <?php if ((int)$r['active_unlocks'] > 0): ?>
                        <span style="color:#34d399;font-size:11px;font-weight:700"><i class="fas fa-check-circle"></i> Yes</span>
                    <?php else: ?>
                        <span style="color:#6b7280;font-size:11px"><i class="fas fa-times-circle"></i> Expired</span>
                    <?php endif; ?>
                </td>
                <td style="padding:10px 14px;font-size:10px;color:#6b7280;max-width:150px;word-break:break-all"><?= htmlspecialchars((string)$r['device_id']) ?: '—' ?></td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
</div>
<div style="color:#6b7280;font-size:11px;margin-top:10px">
    Showing latest <?= count($rows) ?> redemption<?= count($rows) == 1 ? '' : 's' ?> (max 200).
</div>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
