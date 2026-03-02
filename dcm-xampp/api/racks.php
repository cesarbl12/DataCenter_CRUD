<?php
// api/racks.php — CRUD de Racks (compatible PHP 7.0+)
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_rack_id() {
    return 'RACK-' . substr(bin2hex(random_bytes(6)), 0, 12);
}

try {

    // ── GET /api/racks.php[?site=A] ──────────────────────────
    if ($method === 'GET') {
        $site = isset($_GET['site']) ? strtoupper(trim((string)$_GET['site'])) : null;

        if ($site) {
            $st = $pdo->prepare(
                "SELECT id, site_id, nombre, ubicacion, unidades
                   FROM racks
                  WHERE site_id = ?
                  ORDER BY id"
            );
            $st->execute([$site]);
        } else {
            $st = $pdo->query(
                "SELECT id, site_id, nombre, ubicacion, unidades
                   FROM racks
                  ORDER BY site_id, id"
            );
        }

        $rows  = $st->fetchAll();
        $racks = [];
        foreach ($rows as $r) {
            $racks[] = [
                'id'        => $r['id'],
                'siteId'    => $r['site_id'],
                'nombre'    => $r['nombre'],
                'ubicacion' => $r['ubicacion'],
                'unidades'  => (int)$r['unidades'],
            ];
        }

        out(['ok' => true, 'racks' => $racks]);
    }

    // ── POST /api/racks.php ──────────────────────────────────
    if ($method === 'POST') {
        $in        = json_in();
        $id        = trim((string)($in['id'] ?? ''));       // opcional
        $siteId    = strtoupper(trim((string)($in['siteId'] ?? '')));
        $nombre    = (string)($in['nombre'] ?? '');
        $ubicacion = (string)($in['ubicacion'] ?? '');
        $unidades  = (int)($in['unidades'] ?? 42);

        if ($siteId === '' || $unidades <= 0) {
            out(['ok' => false, 'error' => 'Faltan campos obligatorios (siteId, unidades)'], 400);
        }
        if (!in_array($siteId, ['A','B','C','D','E'], true)) {
            out(['ok' => false, 'error' => 'siteId inválido (usa A–E)'], 400);
        }

        if ($id === '') $id = gen_rack_id();

        try {
            $pdo->prepare(
                "INSERT INTO racks (id, site_id, nombre, ubicacion, unidades)
                 VALUES (?, ?, ?, ?, ?)"
            )->execute([$id, $siteId, $nombre, $ubicacion, $unidades]);
        } catch (PDOException $e) {
            $msg = $e->getMessage();
            if (strpos($msg, '1062') !== false || strpos(strtolower($msg), 'duplicate') !== false) {
                out(['ok' => false, 'error' => "Ya existe un rack con id '$id'."], 409);
            }
            throw $e;
        }

        out([
            'ok'   => true,
            'rack' => ['id'=>$id,'siteId'=>$siteId,'nombre'=>$nombre,'ubicacion'=>$ubicacion,'unidades'=>$unidades],
        ], 201);
    }

    // ── PUT /api/racks.php?id=R1 ─────────────────────────────
    if ($method === 'PUT') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id en query string'], 400);

        $in     = json_in();
        $fields = [];
        $vals   = [];

        if (array_key_exists('siteId', $in)) {
            $site = strtoupper(trim((string)$in['siteId']));
            if (!in_array($site, ['A','B','C','D','E'], true)) out(['ok'=>false,'error'=>'siteId inválido (A–E)'], 400);
            $fields[] = 'site_id = ?';
            $vals[]   = $site;
        }
        if (array_key_exists('nombre', $in))    { $fields[] = 'nombre = ?';    $vals[] = (string)$in['nombre']; }
        if (array_key_exists('ubicacion', $in)) { $fields[] = 'ubicacion = ?'; $vals[] = (string)$in['ubicacion']; }
        if (array_key_exists('unidades', $in))  {
            $u = (int)$in['unidades'];
            if ($u <= 0) out(['ok'=>false,'error'=>'unidades debe ser > 0'], 400);
            $fields[] = 'unidades = ?';
            $vals[]   = $u;
        }

        if (!$fields) out(['ok' => false, 'error' => 'No hay campos para actualizar'], 400);

        $vals[] = $id;
        $pdo->prepare("UPDATE racks SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);

        out(['ok' => true]);
    }

    // ── DELETE /api/racks.php?id=R1 ──────────────────────────
    if ($method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id en query string'], 400);

        $pdo->prepare("DELETE FROM racks WHERE id = ?")->execute([$id]);
        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Método no permitido'], 405);

} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
