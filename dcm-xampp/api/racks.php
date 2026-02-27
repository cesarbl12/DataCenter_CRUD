<?php
// api/racks.php — CRUD de Racks
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    // ── GET /api/racks.php[?site=A] ──────────────────────────
    if ($method === 'GET') {
        $site = isset($_GET['site']) ? strtoupper(trim($_GET['site'])) : null;

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

        $racks = array_map(fn($r) => [
            'id'        => $r['id'],
            'siteId'    => $r['site_id'],
            'nombre'    => $r['nombre'],
            'ubicacion' => $r['ubicacion'],
            'unidades'  => (int) $r['unidades'],
        ], $st->fetchAll());

        out(['ok' => true, 'racks' => $racks]);
    }

    // ── POST /api/racks.php ──────────────────────────────────
    if ($method === 'POST') {
        $in        = json_in();
        $id        = trim((string) ($in['id']        ?? ''));
        $siteId    = strtoupper(trim((string) ($in['siteId']    ?? '')));
        $nombre    = (string) ($in['nombre']    ?? '');
        $ubicacion = (string) ($in['ubicacion'] ?? '');
        $unidades  = (int)    ($in['unidades']  ?? 0);

        if ($id === '' || $siteId === '' || $unidades <= 0)
            out(['ok' => false, 'error' => 'Faltan campos obligatorios (id, siteId, unidades)'], 400);

        $st = $pdo->prepare(
            "INSERT INTO racks (id, site_id, nombre, ubicacion, unidades)
             VALUES (?, ?, ?, ?, ?)"
        );
        $st->execute([$id, $siteId, $nombre, $ubicacion, $unidades]);

        out(['ok' => true]);
    }

    // ── PUT /api/racks.php?id=R1 ─────────────────────────────
    if ($method === 'PUT') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id en query string'], 400);

        $in     = json_in();
        $fields = [];
        $vals   = [];

        if (isset($in['siteId']))    { $fields[] = 'site_id = ?';   $vals[] = strtoupper(trim((string) $in['siteId'])); }
        if (isset($in['nombre']))    { $fields[] = 'nombre = ?';    $vals[] = (string) $in['nombre']; }
        if (isset($in['ubicacion'])) { $fields[] = 'ubicacion = ?'; $vals[] = (string) $in['ubicacion']; }
        if (isset($in['unidades']))  { $fields[] = 'unidades = ?';  $vals[] = (int) $in['unidades']; }

        if (!$fields) out(['ok' => false, 'error' => 'No hay campos para actualizar'], 400);

        $vals[] = $id;
        $pdo->prepare("UPDATE racks SET " . implode(', ', $fields) . " WHERE id = ?")
            ->execute($vals);

        out(['ok' => true]);
    }

    // ── DELETE /api/racks.php?id=R1 ──────────────────────────
    if ($method === 'DELETE') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id en query string'], 400);

        // FK CASCADE en MySQL borrará equipos y conexiones en cascada
        $pdo->prepare("DELETE FROM racks WHERE id = ?")->execute([$id]);

        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Método no permitido'], 405);

} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
