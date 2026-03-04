<?php
// api/equipos.php — CRUD de Equipos (compatible PHP 7.0+)
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_equipo_id() {
    return 'EQ-' . substr(bin2hex(random_bytes(6)), 0, 12);
}

try {

    // ── GET /api/equipos.php[?rackId=R1] ─────────────────────
    if ($method === 'GET') {
        $rackId = isset($_GET['rackId']) ? trim((string)$_GET['rackId']) : null;

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

        $rows   = $st->fetchAll();
        $equipos = [];
        foreach ($rows as $r) {
            $equipos[] = [
                'id'             => $r['id'],
                'rackId'         => $r['rack_id'],
                'modelo'         => $r['modelo'],
                'numeroSerie'    => $r['numero_serie'],
                'puertoConexion' => $r['puerto_conexion'],
                'servicio'       => $r['servicio'],
                'estado'         => $r['estado'],
                'uPos'           => (int)$r['u_pos'],
                'uSize'          => (int)$r['u_size'],
            ];
        }

        out(['ok' => true, 'equipos' => $equipos]);
    }

    // ── POST /api/equipos.php ────────────────────────────────
    if ($method === 'POST') {
        $in = json_in();

        $id             = trim((string)($in['id'] ?? '')); // opcional
        $rackId         = trim((string)($in['rackId'] ?? ($in['rack_id'] ?? '')));
        $modelo         = (string)($in['modelo'] ?? '');
        $numeroSerie    = (string)($in['numeroSerie'] ?? ($in['numero_serie'] ?? ''));
        $puertoConexion = (string)($in['puertoConexion'] ?? ($in['puerto_conexion'] ?? ''));
        $servicio       = (string)($in['servicio'] ?? '');
        $estado         = (string)($in['estado'] ?? 'Inactivo');
        $uPos           = (int)($in['uPos'] ?? ($in['u_pos'] ?? 1));
        $uSize          = (int)($in['uSize'] ?? ($in['u_size'] ?? 1));

        if ($rackId === '' || $rackId === '0') out(['ok'=>false,'error'=>'rackId inválido. Selecciona un rack existente.'], 400);

        if ($id === '') $id = gen_equipo_id();
        if ($uPos < 1) $uPos = 1;
        if ($uSize < 1) $uSize = 1;

        // Validar rack existe
        $st = $pdo->prepare("SELECT 1 FROM racks WHERE id = ? LIMIT 1");
        $st->execute([$rackId]);
        if (!$st->fetchColumn()) {
            out(['ok'=>false,'error'=>"El rack '$rackId' no existe. Crea el rack primero."], 409);
        }

        try {
            $pdo->prepare(
                "INSERT INTO equipos
                   (id, rack_id, modelo, numero_serie, puerto_conexion, servicio, estado, u_pos, u_size)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([$id, $rackId, $modelo, $numeroSerie, $puertoConexion, $servicio, $estado, $uPos, $uSize]);
        } catch (PDOException $e) {
            $msg = $e->getMessage();
            if (strpos($msg, '1062') !== false || strpos(strtolower($msg), 'duplicate') !== false) {
                out(['ok'=>false,'error'=>"Ya existe un equipo con id '$id'."], 409);
            }
            throw $e;
        }

        out([
            'ok'     => true,
            'equipo' => [
                'id'=>$id,'rackId'=>$rackId,'modelo'=>$modelo,'numeroSerie'=>$numeroSerie,
                'puertoConexion'=>$puertoConexion,'servicio'=>$servicio,'estado'=>$estado,'uPos'=>$uPos,'uSize'=>$uSize
            ]
        ], 201);
    }

    // ── PUT /api/equipos.php?id=SVR-01 ───────────────────────
    if ($method === 'PUT') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok'=>false,'error'=>'Falta id en query string'], 400);

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

        if (array_key_exists('rackId', $in)) {
            $newRack = trim((string)$in['rackId']);
            if ($newRack === '' || $newRack === '0') out(['ok'=>false,'error'=>'rackId inválido'], 400);

            $st = $pdo->prepare("SELECT 1 FROM racks WHERE id = ? LIMIT 1");
            $st->execute([$newRack]);
            if (!$st->fetchColumn()) out(['ok'=>false,'error'=>"El rack '$newRack' no existe."], 409);
        }

        foreach ($map as $jsKey => $col) {
            if (array_key_exists($jsKey, $in)) {
                $fields[] = "$col = ?";
                $v = $in[$jsKey];
                $vals[] = ($jsKey === 'uPos' || $jsKey === 'uSize') ? (int)$v : (string)$v;
            }
        }

        if (!$fields) out(['ok'=>false,'error'=>'No hay campos para actualizar'], 400);

        $vals[] = $id;
        $pdo->prepare("UPDATE equipos SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);

        out(['ok'=>true]);
    }

    // ── DELETE /api/equipos.php?id=SVR-01 ────────────────────
    if ($method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok'=>false,'error'=>'Falta id en query string'], 400);

        $pdo->prepare("DELETE FROM equipos WHERE id = ?")->execute([$id]);
        out(['ok'=>true]);
    }

    out(['ok'=>false,'error'=>'Método no permitido'], 405);

} catch (Throwable $e) {
    out(['ok'=>false,'error'=>'Error de servidor: '.$e->getMessage()], 500);
}
