<?php
session_start();
function dcm_auth_guard(string $method): void {
    $u = $_SESSION["dcm_user"] ?? null;
    if (!$u) { http_response_code(401); header("Content-Type: application/json"); echo json_encode(["ok"=>false,"error"=>"No autenticado."]); exit; }
    if (in_array($method,["POST","PUT","DELETE"]) && !in_array($u["rol"],["superadmin","crud"])) {
        http_response_code(403); header("Content-Type: application/json"); echo json_encode(["ok"=>false,"error"=>"Sin permisos de escritura."]); exit;
    }
}
dcm_auth_guard($_SERVER["REQUEST_METHOD"] ?? "GET");
// api/sites.php — CRUD de Sites
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_site_id() {
    return 'SITE-' . substr(bin2hex(random_bytes(6)), 0, 10);
}

try {
    // GET /api/sites.php[?locacionId=LOC-1]
    if ($method === 'GET') {
        $locId = isset($_GET['locacionId']) ? trim((string)$_GET['locacionId']) : null;
        if ($locId) {
            $st = $pdo->prepare("SELECT id, locacion_id, nombre FROM sites WHERE locacion_id = ? ORDER BY nombre");
            $st->execute([$locId]);
        } else {
            $st = $pdo->query("SELECT id, locacion_id, nombre FROM sites ORDER BY locacion_id, nombre");
        }
        $rows  = $st->fetchAll();
        $sites = array_map(fn($r) => [
            'id'         => $r['id'],
            'locacionId' => $r['locacion_id'],
            'nombre'     => $r['nombre'],
        ], $rows);
        out(['ok' => true, 'sites' => $sites]);
    }

    // POST /api/sites.php
    if ($method === 'POST') {
        $in         = json_in();
        $id         = trim((string)($in['id'] ?? ''));
        $locacionId = trim((string)($in['locacionId'] ?? ''));
        $nombre     = trim((string)($in['nombre'] ?? ''));

        if ($locacionId === '') out(['ok' => false, 'error' => 'locacionId es obligatorio'], 400);
        if ($nombre === '')     out(['ok' => false, 'error' => 'El nombre es obligatorio'], 400);

        // Validar que locacion existe
        $st = $pdo->prepare("SELECT 1 FROM locaciones WHERE id = ? LIMIT 1");
        $st->execute([$locacionId]);
        if (!$st->fetchColumn()) out(['ok' => false, 'error' => "La locacion '$locacionId' no existe."], 409);

        if ($id === '') $id = gen_site_id();

        try {
            $pdo->prepare("INSERT INTO sites (id, locacion_id, nombre) VALUES (?, ?, ?)")->execute([$id, $locacionId, $nombre]);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), '1062') !== false)
                out(['ok' => false, 'error' => "Ya existe un site con id '$id'."], 409);
            throw $e;
        }
        out(['ok' => true, 'site' => ['id' => $id, 'locacionId' => $locacionId, 'nombre' => $nombre]], 201);
    }

    // PUT /api/sites.php?id=SITE-A
    if ($method === 'PUT') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id'], 400);
        $in     = json_in();
        $fields = []; $vals = [];
        if (array_key_exists('nombre', $in))     { $fields[] = 'nombre = ?';      $vals[] = trim((string)$in['nombre']); }
        if (array_key_exists('locacionId', $in)) { $fields[] = 'locacion_id = ?'; $vals[] = trim((string)$in['locacionId']); }
        if (!$fields) out(['ok' => false, 'error' => 'Sin campos para actualizar'], 400);
        $vals[] = $id;
        $pdo->prepare("UPDATE sites SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);
        out(['ok' => true]);
    }

    // DELETE /api/sites.php?id=SITE-A
    if ($method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id'], 400);
        $pdo->prepare("DELETE FROM sites WHERE id = ?")->execute([$id]);
        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Metodo no permitido'], 405);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
