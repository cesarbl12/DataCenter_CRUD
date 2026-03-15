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
// api/locaciones.php — CRUD de Locaciones
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_loc_id() {
    return 'LOC-' . substr(bin2hex(random_bytes(6)), 0, 10);
}

try {
    // GET /api/locaciones.php
    if ($method === 'GET') {
        $u = $_SESSION['dcm_user'] ?? null;
        $rol = $u['rol'] ?? '';
        // lector y crud: solo ven sus locaciones asignadas
        if (in_array($rol, ['lector','crud'])) {
            $uid  = intval($u['id'] ?? 0);
            $asig = $pdo->prepare("SELECT locacion_id FROM usuario_locaciones WHERE usuario_id=?");
            $asig->execute([$uid]);
            $ids  = array_column($asig->fetchAll(), 'locacion_id');
            if (empty($ids)) {
                out(['ok' => true, 'locaciones' => []]);
            }
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $rows = $pdo->prepare("SELECT id, nombre FROM locaciones WHERE id IN ($placeholders) ORDER BY nombre");
            $rows->execute($ids);
            $locs = array_map(fn($r) => ['id' => $r['id'], 'nombre' => $r['nombre']], $rows->fetchAll());
            out(['ok' => true, 'locaciones' => $locs]);
        }
        // superadmin y admin: ven todas
        $rows = $pdo->query("SELECT id, nombre FROM locaciones ORDER BY nombre")->fetchAll();
        $locs = array_map(fn($r) => ['id' => $r['id'], 'nombre' => $r['nombre']], $rows);
        out(['ok' => true, 'locaciones' => $locs]);
    }

    // POST /api/locaciones.php
    if ($method === 'POST') {
        $in     = json_in();
        $id     = trim((string)($in['id'] ?? ''));
        $nombre = trim((string)($in['nombre'] ?? ''));
        if ($nombre === '') out(['ok' => false, 'error' => 'El nombre es obligatorio'], 400);
        if ($id === '') $id = gen_loc_id();

        try {
            $pdo->prepare("INSERT INTO locaciones (id, nombre) VALUES (?, ?)")->execute([$id, $nombre]);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), '1062') !== false)
                out(['ok' => false, 'error' => "Ya existe una locacion con id '$id'."], 409);
            throw $e;
        }
        out(['ok' => true, 'locacion' => ['id' => $id, 'nombre' => $nombre]], 201);
    }

    // PUT /api/locaciones.php?id=LOC-1
    if ($method === 'PUT') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id'], 400);
        $in     = json_in();
        $nombre = trim((string)($in['nombre'] ?? ''));
        if ($nombre === '') out(['ok' => false, 'error' => 'El nombre es obligatorio'], 400);
        $pdo->prepare("UPDATE locaciones SET nombre = ? WHERE id = ?")->execute([$nombre, $id]);
        out(['ok' => true]);
    }

    // DELETE /api/locaciones.php?id=LOC-1
    if ($method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id'], 400);
        $pdo->prepare("DELETE FROM locaciones WHERE id = ?")->execute([$id]);
        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Metodo no permitido'], 405);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
