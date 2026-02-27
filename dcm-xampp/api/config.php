<?php
// api/config.php

// ── CORS absoluto — debe ir ANTES de cualquier output ───────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

// Preflight: el navegador manda OPTIONS antes de PUT/DELETE
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true, 'preflight' => true]);
    exit;
}

// ── MySQL / XAMPP ────────────────────────────────────────────
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'dcm');
define('DB_USER', 'root');
define('DB_PASS', '');          // XAMPP sin contraseña

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'DB: ' . $e->getMessage()]);
    exit;
}

function json_in(): array {
    $raw = (string) file_get_contents('php://input');
    if ($raw === '') return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function out(array $payload, int $code = 200): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
