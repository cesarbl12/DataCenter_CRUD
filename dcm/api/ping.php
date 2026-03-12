<?php
require __DIR__ . '/config.php';

try {
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    out([
        'ok'     => true,
        'php'    => PHP_VERSION,
        'db'     => DB_NAME,
        'tables' => $tables,
    ]);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => $e->getMessage()], 500);
}
