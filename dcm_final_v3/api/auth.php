<?php
// api/auth.php — Autenticacion, sesion y CRUD de usuarios
session_start();
require_once __DIR__ . '/config.php';

// ── SETUP: crea tabla + superadmin si no existe ─────────────
if (isset($_GET['setup'])) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (
        id         INT          NOT NULL AUTO_INCREMENT,
        username   VARCHAR(60)  NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        rol        ENUM('superadmin','crud','lector') NOT NULL DEFAULT 'lector',
        nombre     VARCHAR(100) NOT NULL DEFAULT '',
        activo     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Tabla de locaciones permitidas por usuario (para roles lector y crud)
    $pdo->exec("CREATE TABLE IF NOT EXISTS usuario_locaciones (
        usuario_id  INT         NOT NULL,
        locacion_id VARCHAR(50) NOT NULL,
        PRIMARY KEY (usuario_id, locacion_id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $exists = $pdo->query("SELECT COUNT(*) FROM usuarios WHERE rol='superadmin'")->fetchColumn();
    if (!$exists) {
        $hash = password_hash('Admin1234', PASSWORD_BCRYPT);
        $pdo->prepare("INSERT INTO usuarios (username,password,rol,nombre) VALUES (?,?,?,?)")
            ->execute(['admin', $hash, 'superadmin', 'Super Administrador']);
        out(['ok' => true, 'created' => true, 'msg' => 'Superadmin creado. usuario=admin password=Admin1234']);
    } else {
        out(['ok' => true, 'created' => false, 'msg' => 'Tabla ya existia.']);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

// ── HELPER SESSION ──────────────────────────────────────────
function currentUser(): ?array {
    return $_SESSION['dcm_user'] ?? null;
}
function requireAuth(): array {
    $u = currentUser();
    if (!$u) out(['ok' => false, 'error' => 'No autenticado.'], 401);
    return $u;
}
function requireSuperadmin(): array {
    $u = requireAuth();
    if ($u['rol'] !== 'superadmin') out(['ok' => false, 'error' => 'Sin permisos.'], 403);
    return $u;
}

// ════════════════════════════════════════════════════════════
// GET — /api/auth.php?action=me  → sesion actual
// GET — /api/auth.php?action=users → lista usuarios (superadmin)
// ════════════════════════════════════════════════════════════
if ($method === 'GET') {
    if ($action === 'me') {
        $u = currentUser();
        if (!$u) out(['ok' => false, 'user' => null], 200);
        out(['ok' => true, 'user' => $u]);
    }

    if ($action === 'users') {
        requireSuperadmin();
        $rows = $pdo->query("SELECT id,username,nombre,rol,activo,created_at FROM usuarios ORDER BY id")
                    ->fetchAll();
        // Attach assigned locaciones for each user
        foreach ($rows as &$u) {
            $locs = $pdo->prepare("SELECT locacion_id FROM usuario_locaciones WHERE usuario_id=?");
            $locs->execute([$u['id']]);
            $u['locaciones'] = array_column($locs->fetchAll(), 'locacion_id');
        }
        out(['ok' => true, 'users' => $rows]);
    }

    // GET locaciones de un usuario especifico
    if ($action === 'user_locaciones') {
        requireSuperadmin();
        $uid = intval($_GET['id'] ?? 0);
        if (!$uid) out(['ok' => false, 'error' => 'ID requerido.'], 400);
        $rows = $pdo->prepare("SELECT locacion_id FROM usuario_locaciones WHERE usuario_id=?");
        $rows->execute([$uid]);
        out(['ok' => true, 'locaciones' => array_column($rows->fetchAll(), 'locacion_id')]);
    }

    out(['ok' => false, 'error' => 'Accion desconocida.'], 400);
}

// ════════════════════════════════════════════════════════════
// POST — login / logout / crear usuario
// ════════════════════════════════════════════════════════════
if ($method === 'POST') {
    $in = json_in();

    // LOGIN
    if ($action === 'login') {
        $username = trim($in['username'] ?? '');
        $password = trim($in['password'] ?? '');
        if (!$username || !$password) out(['ok' => false, 'error' => 'Usuario y contrasena requeridos.'], 400);

        $row = $pdo->prepare("SELECT * FROM usuarios WHERE username=? AND activo=1");
        $row->execute([$username]);
        $user = $row->fetch();

        if (!$user || !password_verify($password, $user['password']))
            out(['ok' => false, 'error' => 'Usuario o contrasena incorrectos.'], 401);

        $safe = ['id' => $user['id'], 'username' => $user['username'],
                 'nombre' => $user['nombre'], 'rol' => $user['rol']];
        $_SESSION['dcm_user'] = $safe;
        out(['ok' => true, 'user' => $safe]);
    }

    // LOGOUT
    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    // SET LOCACIONES de un usuario (solo superadmin)
    if ($action === 'set_locaciones') {
        requireSuperadmin();
        $in  = json_in();
        $uid = intval($in['usuario_id'] ?? 0);
        $locIds = $in['locaciones'] ?? [];
        if (!$uid) out(['ok' => false, 'error' => 'usuario_id requerido.'], 400);
        // Delete existing and re-insert
        $pdo->prepare("DELETE FROM usuario_locaciones WHERE usuario_id=?")->execute([$uid]);
        foreach ($locIds as $locId) {
            $locId = trim((string)$locId);
            if ($locId === '') continue;
            $pdo->prepare("INSERT IGNORE INTO usuario_locaciones (usuario_id,locacion_id) VALUES (?,?)")
                ->execute([$uid, $locId]);
        }
        out(['ok' => true]);
    }

    // CREAR USUARIO (solo superadmin)
    if ($action === 'create') {
        requireSuperadmin();
        $username = trim($in['username'] ?? '');
        $password = trim($in['password'] ?? '');
        $nombre   = trim($in['nombre']   ?? '');
        $rol      = trim($in['rol']      ?? 'lector');

        if (!$username) out(['ok' => false, 'error' => 'Username es obligatorio.'], 400);
        if (strlen($password) < 6) out(['ok' => false, 'error' => 'La contrasena debe tener al menos 6 caracteres.'], 400);
        if (!in_array($rol, ['superadmin','crud','lector']))
            out(['ok' => false, 'error' => 'Rol invalido.'], 400);

        $check = $pdo->prepare("SELECT id FROM usuarios WHERE username=?");
        $check->execute([$username]);
        if ($check->fetch()) out(['ok' => false, 'error' => 'El usuario ya existe.'], 409);

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $st = $pdo->prepare("INSERT INTO usuarios (username,password,rol,nombre) VALUES (?,?,?,?)");
        $st->execute([$username, $hash, $rol, $nombre]);
        $newId = $pdo->lastInsertId();
        out(['ok' => true, 'user' => ['id' => $newId, 'username' => $username, 'nombre' => $nombre, 'rol' => $rol, 'activo' => 1]], 201);
    }

    out(['ok' => false, 'error' => 'Accion desconocida.'], 400);
}

// ════════════════════════════════════════════════════════════
// PUT — editar usuario (superadmin) o cambiar propia contraseña
// ════════════════════════════════════════════════════════════
if ($method === 'PUT') {
    $me = requireAuth();
    $in = json_in();
    $targetId = intval($_GET['id'] ?? 0);
    if (!$targetId) out(['ok' => false, 'error' => 'ID requerido.'], 400);

    // Solo superadmin puede editar otros; cualquiera puede cambiar su propio password
    if ($me['rol'] !== 'superadmin' && $me['id'] !== $targetId)
        out(['ok' => false, 'error' => 'Sin permisos.'], 403);

    $row = $pdo->prepare("SELECT * FROM usuarios WHERE id=?");
    $row->execute([$targetId]);
    $target = $row->fetch();
    if (!$target) out(['ok' => false, 'error' => 'Usuario no encontrado.'], 404);

    $fields = []; $vals = [];

    // Superadmin puede cambiar nombre, rol, activo
    if ($me['rol'] === 'superadmin') {
        if (isset($in['nombre']))  { $fields[]='nombre=?';  $vals[]=$in['nombre']; }
        if (isset($in['rol']) && in_array($in['rol'],['superadmin','crud','lector'])) {
            // No permitir que el superadmin se cambie su propio rol
            if ($me['id'] !== $targetId) { $fields[]='rol=?'; $vals[]=$in['rol']; }
        }
        if (isset($in['activo'])) { $fields[]='activo=?'; $vals[]=(int)$in['activo']; }
        if (isset($in['username'])) {
            $chk = $pdo->prepare("SELECT id FROM usuarios WHERE username=? AND id!=?");
            $chk->execute([$in['username'], $targetId]);
            if ($chk->fetch()) out(['ok' => false, 'error' => 'Username ya existe.'], 409);
            $fields[]='username=?'; $vals[]=$in['username'];
        }
    }

    // Cambio de contraseña (cualquiera sobre si mismo, superadmin sobre cualquiera)
    if (isset($in['password'])) {
        if (strlen($in['password']) < 6) out(['ok' => false, 'error' => 'Contrasena minimo 6 caracteres.'], 400);
        $fields[]='password=?';
        $vals[]=password_hash($in['password'], PASSWORD_BCRYPT);
    }

    if (!$fields) out(['ok' => false, 'error' => 'Nada que actualizar.'], 400);
    $vals[] = $targetId;
    $pdo->prepare("UPDATE usuarios SET ".implode(',',$fields)." WHERE id=?")->execute($vals);

    // Refrescar sesion si se edito el usuario actual
    if ($me['id'] === $targetId) {
        $fresh = $pdo->prepare("SELECT id,username,nombre,rol FROM usuarios WHERE id=?");
        $fresh->execute([$targetId]);
        $freshData = $fresh->fetch();
        $_SESSION['dcm_user'] = $freshData;
    }
    out(['ok' => true]);
}

// ════════════════════════════════════════════════════════════
// DELETE — eliminar usuario (solo superadmin)
// ════════════════════════════════════════════════════════════
if ($method === 'DELETE') {
    $me = requireSuperadmin();
    $targetId = intval($_GET['id'] ?? 0);
    if (!$targetId) out(['ok' => false, 'error' => 'ID requerido.'], 400);
    if ($me['id'] === $targetId) out(['ok' => false, 'error' => 'No puedes eliminarte a ti mismo.'], 403);

    $pdo->prepare("DELETE FROM usuarios WHERE id=?")->execute([$targetId]);
    out(['ok' => true]);
}
