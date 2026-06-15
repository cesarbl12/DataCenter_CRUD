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
// api/racks.php — CRUD de Racks (site_id -> sites.id)
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_rack_id() {
    return 'RACK-' . substr(bin2hex(random_bytes(6)), 0, 12);
}

// Helper: asegurar que la columna orden existe (migración automática)
function ensure_orden_column($pdo) {
    try {
        $st = $pdo->query("SELECT orden FROM racks LIMIT 0");
    } catch (\Throwable $e) {
        $pdo->exec("ALTER TABLE racks ADD COLUMN orden INT NOT NULL DEFAULT 0");
    }
}
ensure_orden_column($pdo);

try {
    // GET /api/racks.php[?siteId=SITE-A]
    if ($method === 'GET') {
        $siteId = isset($_GET['siteId']) ? trim((string)$_GET['siteId']) : null;
        if ($siteId) {
            $st = $pdo->prepare("SELECT id, site_id, nombre, ubicacion, unidades, orden FROM racks WHERE site_id = ? ORDER BY orden, id");
            $st->execute([$siteId]);
        } else {
            $st = $pdo->query("SELECT id, site_id, nombre, ubicacion, unidades, orden FROM racks ORDER BY site_id, orden, id");
        }
        $rows  = $st->fetchAll();
        $racks = array_map(fn($r) => [
            'id'        => $r['id'],
            'siteId'    => $r['site_id'],
            'nombre'    => $r['nombre'],
            'ubicacion' => $r['ubicacion'],
            'unidades'  => (int)$r['unidades'],
            'orden'     => (int)$r['orden'],
        ], $rows);
        out(['ok' => true, 'racks' => $racks]);
    }

    // POST /api/racks.php
    if ($method === 'POST') {
        // --- Acción especial: reordenar racks ---
        $action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';
        if ($action === 'reorder') {
            $in    = json_in();
            $order = $in['order'] ?? [];  // array de {id, orden}
            if (!is_array($order) || !count($order)) out(['ok' => false, 'error' => 'Se requiere array "order" con [{id, orden}, ...]'], 400);
            $st = $pdo->prepare("UPDATE racks SET orden = ? WHERE id = ?");
            foreach ($order as $item) {
                $rid = trim((string)($item['id'] ?? ''));
                $ord = (int)($item['orden'] ?? 0);
                if ($rid === '') continue;
                $st->execute([$ord, $rid]);
            }
            out(['ok' => true]);
        }

        $in        = json_in();
        $id        = trim((string)($in['id'] ?? ''));
        $siteId    = trim((string)($in['siteId'] ?? ''));
        $nombre    = (string)($in['nombre'] ?? '');
        $ubicacion = (string)($in['ubicacion'] ?? '');
        $unidades  = (int)($in['unidades'] ?? 42);
        $orden     = (int)($in['orden'] ?? 0);

        if ($siteId === '') out(['ok' => false, 'error' => 'siteId es obligatorio'], 400);
        if ($unidades <= 0) out(['ok' => false, 'error' => 'unidades debe ser > 0'], 400);

        // Validar que el site existe
        $st = $pdo->prepare("SELECT 1 FROM sites WHERE id = ? LIMIT 1");
        $st->execute([$siteId]);
        if (!$st->fetchColumn()) out(['ok' => false, 'error' => "El site '$siteId' no existe."], 409);

        if ($id === '') $id = gen_rack_id();

        // Si orden es 0, auto-asignar al final
        if ($orden <= 0) {
            $st = $pdo->prepare("SELECT COALESCE(MAX(orden), 0) + 1 FROM racks WHERE site_id = ?");
            $st->execute([$siteId]);
            $orden = (int)$st->fetchColumn();
        }

        try {
            $pdo->prepare("INSERT INTO racks (id, site_id, nombre, ubicacion, unidades, orden) VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([$id, $siteId, $nombre, $ubicacion, $unidades, $orden]);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), '1062') !== false)
                out(['ok' => false, 'error' => "Ya existe un rack con id '$id'."], 409);
            throw $e;
        }
        out(['ok' => true, 'rack' => ['id' => $id, 'siteId' => $siteId, 'nombre' => $nombre, 'ubicacion' => $ubicacion, 'unidades' => $unidades, 'orden' => $orden]], 201);
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
        if (array_key_exists('orden', $in)) { $fields[] = 'orden = ?'; $vals[] = (int)$in['orden']; }
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
