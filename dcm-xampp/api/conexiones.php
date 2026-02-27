<?php
// api/conexiones.php — CRUD de Conexiones
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    // ── GET /api/conexiones.php[?equipoId=SVR-01] ────────────
    if ($method === 'GET') {
        $equipoId = isset($_GET['equipoId']) ? trim($_GET['equipoId']) : null;

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

        $conexiones = array_map(fn($r) => [
            'id'       => $r['id'],
            'equipoId' => $r['equipo_id'],
            'tipo'     => $r['tipo'],
            'estado'   => $r['estado'],
            'destino'  => $r['destino'],
        ], $st->fetchAll());

        out(['ok' => true, 'conexiones' => $conexiones]);
    }

    // ── POST /api/conexiones.php ─────────────────────────────
    if ($method === 'POST') {
        $in       = json_in();
        $equipoId = trim((string) ($in['equipoId'] ?? ''));
        $id       = trim((string) ($in['id']       ?? ''));
        $tipo     = (string) ($in['tipo']    ?? '');
        $estado   = (string) ($in['estado']  ?? 'Inactivo');
        $destino  = (string) ($in['destino'] ?? '');

        if ($equipoId === '' || $id === '')
            out(['ok' => false, 'error' => 'Faltan campos obligatorios (equipoId, id)'], 400);

        $pdo->prepare(
            "INSERT INTO conexiones (id, equipo_id, tipo, estado, destino)
             VALUES (?, ?, ?, ?, ?)"
        )->execute([$id, $equipoId, $tipo, $estado, $destino]);

        out(['ok' => true]);
    }

    // ── PUT /api/conexiones.php?equipoId=SVR-01&id=eth0 ──────
    if ($method === 'PUT') {
        $equipoId = trim((string) ($_GET['equipoId'] ?? ''));
        $id       = trim((string) ($_GET['id']       ?? ''));

        if ($equipoId === '' || $id === '')
            out(['ok' => false, 'error' => 'Faltan equipoId/id en query string'], 400);

        $in     = json_in();
        $fields = [];
        $vals   = [];

        if (array_key_exists('tipo',    $in)) { $fields[] = 'tipo = ?';    $vals[] = (string) $in['tipo']; }
        if (array_key_exists('estado',  $in)) { $fields[] = 'estado = ?';  $vals[] = (string) $in['estado']; }
        if (array_key_exists('destino', $in)) { $fields[] = 'destino = ?'; $vals[] = (string) $in['destino']; }

        if (!$fields) out(['ok' => false, 'error' => 'No hay campos para actualizar'], 400);

        $vals[] = $equipoId;
        $vals[] = $id;
        $pdo->prepare(
            "UPDATE conexiones SET " . implode(', ', $fields) . " WHERE equipo_id = ? AND id = ?"
        )->execute($vals);

        out(['ok' => true]);
    }

    // ── DELETE /api/conexiones.php?equipoId=SVR-01&id=eth0 ───
    if ($method === 'DELETE') {
        $equipoId = trim((string) ($_GET['equipoId'] ?? ''));
        $id       = trim((string) ($_GET['id']       ?? ''));

        if ($equipoId === '' || $id === '')
            out(['ok' => false, 'error' => 'Faltan equipoId/id en query string'], 400);

        $pdo->prepare(
            "DELETE FROM conexiones WHERE equipo_id = ? AND id = ?"
        )->execute([$equipoId, $id]);

        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Método no permitido'], 405);

} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
