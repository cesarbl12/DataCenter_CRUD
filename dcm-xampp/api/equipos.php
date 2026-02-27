<?php
// api/equipos.php — CRUD de Equipos
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    // ── GET /api/equipos.php[?rackId=R1] ─────────────────────
    if ($method === 'GET') {
        $rackId = isset($_GET['rackId']) ? trim($_GET['rackId']) : null;

        if ($rackId) {
            $st = $pdo->prepare(
                "SELECT id, rack_id, modelo, numero_serie, puerto_conexion,
                        servicio, estado, u_pos, u_size
                   FROM equipos
                  WHERE rack_id = ?
                  ORDER BY u_pos, id"
            );
            $st->execute([$rackId]);
        } else {
            $st = $pdo->query(
                "SELECT id, rack_id, modelo, numero_serie, puerto_conexion,
                        servicio, estado, u_pos, u_size
                   FROM equipos
                  ORDER BY rack_id, u_pos, id"
            );
        }

        $equipos = array_map(fn($r) => [
            'id'             => $r['id'],
            'rackId'         => $r['rack_id'],
            'modelo'         => $r['modelo'],
            'numeroSerie'    => $r['numero_serie'],
            'puertoConexion' => $r['puerto_conexion'],
            'servicio'       => $r['servicio'],
            'estado'         => $r['estado'],
            'uPos'           => (int) $r['u_pos'],
            'uSize'          => (int) $r['u_size'],
        ], $st->fetchAll());

        out(['ok' => true, 'equipos' => $equipos]);
    }

    // ── POST /api/equipos.php ────────────────────────────────
    if ($method === 'POST') {
        $in             = json_in();
        $id             = trim((string) ($in['id']             ?? ''));
        $rackId         = trim((string) ($in['rackId']         ?? ''));
        $modelo         = (string) ($in['modelo']         ?? '');
        $numeroSerie    = (string) ($in['numeroSerie']    ?? '');
        $puertoConexion = (string) ($in['puertoConexion'] ?? '');
        $servicio       = (string) ($in['servicio']       ?? '');
        $estado         = (string) ($in['estado']         ?? 'Inactivo');
        $uPos           = (int)    ($in['uPos']           ?? 1);
        $uSize          = (int)    ($in['uSize']          ?? 1);

        if ($id === '' || $rackId === '')
            out(['ok' => false, 'error' => 'Faltan campos obligatorios (id, rackId)'], 400);

        $pdo->prepare(
            "INSERT INTO equipos
               (id, rack_id, modelo, numero_serie, puerto_conexion, servicio, estado, u_pos, u_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([$id, $rackId, $modelo, $numeroSerie, $puertoConexion, $servicio, $estado, $uPos, $uSize]);

        out(['ok' => true]);
    }

    // ── PUT /api/equipos.php?id=SVR-01 ───────────────────────
    if ($method === 'PUT') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id en query string'], 400);

        $in  = json_in();
        $map = [
            'rackId'         => 'rack_id',
            'modelo'         => 'modelo',
            'numeroSerie'    => 'numero_serie',
            'puertoConexion' => 'puerto_conexion',
            'servicio'       => 'servicio',
            'estado'         => 'estado',
            'uPos'           => 'u_pos',
            'uSize'          => 'u_size',
        ];

        $fields = [];
        $vals   = [];

        foreach ($map as $jsKey => $col) {
            if (array_key_exists($jsKey, $in)) {
                $fields[] = "$col = ?";
                $v = $in[$jsKey];
                $vals[] = ($jsKey === 'uPos' || $jsKey === 'uSize') ? (int) $v : (string) $v;
            }
        }

        if (!$fields) out(['ok' => false, 'error' => 'No hay campos para actualizar'], 400);

        $vals[] = $id;
        $pdo->prepare("UPDATE equipos SET " . implode(', ', $fields) . " WHERE id = ?")
            ->execute($vals);

        out(['ok' => true]);
    }

    // ── DELETE /api/equipos.php?id=SVR-01 ────────────────────
    if ($method === 'DELETE') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id en query string'], 400);

        // FK CASCADE borrará las conexiones del equipo
        $pdo->prepare("DELETE FROM equipos WHERE id = ?")->execute([$id]);

        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Método no permitido'], 405);

} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
