<?php
// api/racks.php — CRUD de Racks (site_id -> sites.id)
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_rack_id() {
    return 'RACK-' . substr(bin2hex(random_bytes(6)), 0, 12);
}

try {
    // GET /api/racks.php[?siteId=SITE-A]
    if ($method === 'GET') {
        $siteId = isset($_GET['siteId']) ? trim((string)$_GET['siteId']) : null;
        if ($siteId) {
            $st = $pdo->prepare("SELECT id, site_id, nombre, ubicacion, unidades FROM racks WHERE site_id = ? ORDER BY id");
            $st->execute([$siteId]);
        } else {
            $st = $pdo->query("SELECT id, site_id, nombre, ubicacion, unidades FROM racks ORDER BY site_id, id");
        }
        $rows  = $st->fetchAll();
        $racks = array_map(fn($r) => [
            'id'        => $r['id'],
            'siteId'    => $r['site_id'],
            'nombre'    => $r['nombre'],
            'ubicacion' => $r['ubicacion'],
            'unidades'  => (int)$r['unidades'],
        ], $rows);
        out(['ok' => true, 'racks' => $racks]);
    }

    // POST /api/racks.php
    if ($method === 'POST') {
        $in        = json_in();
        $id        = trim((string)($in['id'] ?? ''));
        $siteId    = trim((string)($in['siteId'] ?? ''));
        $nombre    = (string)($in['nombre'] ?? '');
        $ubicacion = (string)($in['ubicacion'] ?? '');
        $unidades  = (int)($in['unidades'] ?? 42);

        if ($siteId === '') out(['ok' => false, 'error' => 'siteId es obligatorio'], 400);
        if ($unidades <= 0) out(['ok' => false, 'error' => 'unidades debe ser > 0'], 400);

        // Validar que el site existe
        $st = $pdo->prepare("SELECT 1 FROM sites WHERE id = ? LIMIT 1");
        $st->execute([$siteId]);
        if (!$st->fetchColumn()) out(['ok' => false, 'error' => "El site '$siteId' no existe."], 409);

        if ($id === '') $id = gen_rack_id();

        try {
            $pdo->prepare("INSERT INTO racks (id, site_id, nombre, ubicacion, unidades) VALUES (?, ?, ?, ?, ?)")
                ->execute([$id, $siteId, $nombre, $ubicacion, $unidades]);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), '1062') !== false)
                out(['ok' => false, 'error' => "Ya existe un rack con id '$id'."], 409);
            throw $e;
        }
        out(['ok' => true, 'rack' => ['id' => $id, 'siteId' => $siteId, 'nombre' => $nombre, 'ubicacion' => $ubicacion, 'unidades' => $unidades]], 201);
    }

    // PUT /api/racks.php?id=R1
    if ($method === 'PUT') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id'], 400);
        $in = json_in();
        $fields = []; $vals = [];
        if (array_key_exists('siteId', $in))    { $fields[] = 'site_id = ?';   $vals[] = trim((string)$in['siteId']); }
        if (array_key_exists('nombre', $in))    { $fields[] = 'nombre = ?';    $vals[] = (string)$in['nombre']; }
        if (array_key_exists('ubicacion', $in)) { $fields[] = 'ubicacion = ?'; $vals[] = (string)$in['ubicacion']; }
        if (array_key_exists('unidades', $in))  {
            $u = (int)$in['unidades'];
            if ($u <= 0) out(['ok' => false, 'error' => 'unidades debe ser > 0'], 400);
            $fields[] = 'unidades = ?'; $vals[] = $u;
        }
        if (!$fields) out(['ok' => false, 'error' => 'Sin campos para actualizar'], 400);
        $vals[] = $id;
        $pdo->prepare("UPDATE racks SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);
        out(['ok' => true]);
    }

    // DELETE /api/racks.php?id=R1
    if ($method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') out(['ok' => false, 'error' => 'Falta id'], 400);
        $pdo->prepare("DELETE FROM racks WHERE id = ?")->execute([$id]);
        out(['ok' => true]);
    }

    out(['ok' => false, 'error' => 'Metodo no permitido'], 405);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Error de servidor: ' . $e->getMessage()], 500);
}
