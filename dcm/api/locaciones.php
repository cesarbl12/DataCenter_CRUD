<?php
// api/locaciones.php — CRUD de Locaciones
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function gen_loc_id() {
    return 'LOC-' . substr(bin2hex(random_bytes(6)), 0, 10);
}

try {
    // GET /api/locaciones.php
    if ($method === 'GET') {
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
