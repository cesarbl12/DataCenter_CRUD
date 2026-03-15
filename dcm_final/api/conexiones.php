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
// api/conexiones.php — CRUD de Conexiones (compatible PHP 7.0+)
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {

    // ── GET /api/conexiones.php[?equipoId=EQ-1] ──────────────
    if ($method === 'GET') {
        $equipoId = isset($_GET['equipoId']) ? trim((string)$_GET['equipoId']) : null;

        if ($equipoId) {
            $st = $pdo->prepare(
                "SELECT id, equipo_id, tipo, estado, destino
                   FROM conexiones
                  WHERE equipo_id = ?
                  ORDER BY id"
            );
            $st->execute([$equipoId]);
        } else {
            $st = $pdo->query(
                "SELECT id, equipo_id, tipo, estado, destino
                   FROM conexiones
                  ORDER BY equipo_id, id"
            );
        }

        $rows = $st->fetchAll();
        $conexiones = [];
        foreach ($rows as $r) {
            $conexiones[] = [
                'id'       => $r['id'],
                'equipoId' => $r['equipo_id'],
                'tipo'     => $r['tipo'],
                'estado'   => $r['estado'],
                'destino'  => $r['destino'],
            ];
        }

        out(['ok' => true, 'conexiones' => $conexiones]);
    }

    // ── POST /api/conexiones.php ─────────────────────────────
    if ($method === 'POST') {
        $in = json_in();

        $id       = trim((string)($in['id'] ?? ''));
        $equipoId = trim((string)($in['equipoId'] ?? ($in['equipo_id'] ?? '')));
        $tipo     = (string)($in['tipo'] ?? '');
        $estado   = (string)($in['estado'] ?? 'Inactivo');
        $destino  = (string)($in['destino'] ?? '');

        if ($id === '' || $equipoId === '') out(['ok'=>false,'error'=>'Faltan campos obligatorios (id, equipoId)'], 400);

        try {
            $pdo->prepare(
                "INSERT INTO conexiones (id, equipo_id, tipo, estado, destino)
                 VALUES (?, ?, ?, ?, ?)"
            )->execute([$id, $equipoId, $tipo, $estado, $destino]);
        } catch (PDOException $e) {
            $msg = $e->getMessage();
            if (strpos($msg, '1062') !== false || strpos(strtolower($msg), 'duplicate') !== false) {
                out(['ok'=>false,'error'=>"Ya existe la conexión '$id' para el equipo '$equipoId'."], 409);
            }
            throw $e;
        }

        out(['ok'=>true], 201);
    }

    // ── PUT /api/conexiones.php?equipoId=EQ-1&id=eth0 ────────
    if ($method === 'PUT') {
        $equipoId = trim((string)($_GET['equipoId'] ?? ''));
        $id       = trim((string)($_GET['id'] ?? ''));
        if ($equipoId === '' || $id === '') out(['ok'=>false,'error'=>'Faltan keys (equipoId, id)'], 400);

        $in = json_in();
        $fields = [];
        $vals = [];

        if (array_key_exists('tipo', $in))   { $fields[]='tipo=?';   $vals[]=(string)$in['tipo']; }
        if (array_key_exists('estado', $in)) { $fields[]='estado=?'; $vals[]=(string)$in['estado']; }
        if (array_key_exists('destino', $in)){ $fields[]='destino=?';$vals[]=(string)$in['destino']; }

        if (!$fields) out(['ok'=>false,'error'=>'No hay campos para actualizar'], 400);

        $vals[] = $id;
        $vals[] = $equipoId;

        $pdo->prepare("UPDATE conexiones SET ".implode(', ', $fields)." WHERE id = ? AND equipo_id = ?")->execute($vals);
        out(['ok'=>true]);
    }

    // ── DELETE /api/conexiones.php?equipoId=EQ-1&id=eth0 ─────
    if ($method === 'DELETE') {
        $equipoId = trim((string)($_GET['equipoId'] ?? ''));
        $id       = trim((string)($_GET['id'] ?? ''));
        if ($equipoId === '' || $id === '') out(['ok'=>false,'error'=>'Faltan keys (equipoId, id)'], 400);

        $pdo->prepare("DELETE FROM conexiones WHERE id = ? AND equipo_id = ?")->execute([$id, $equipoId]);
        out(['ok'=>true]);
    }

    out(['ok'=>false,'error'=>'Método no permitido'], 405);

} catch (Throwable $e) {
    out(['ok'=>false,'error'=>'Error de servidor: '.$e->getMessage()], 500);
}
