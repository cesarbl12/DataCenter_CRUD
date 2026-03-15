<?php
session_start();
if (empty($_SESSION['dcm_user']) || $_SESSION['dcm_user']['rol'] !== 'superadmin') {
    header('Location: login.html');
    exit;
}
$me     = $_SESSION['dcm_user'];
$meJson = json_encode($me, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DC Manager — Gestión de Usuarios</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    /* ── Page layout ── */
    body { display:block; overflow:auto; }

    .users-page {
      min-height: 100vh;
      background: var(--bg);
      display: flex; flex-direction: column;
    }

    /* ── Topbar ── */
    .up-topbar {
      height: 52px; flex-shrink: 0;
      display: flex; align-items: center; gap: 12px;
      padding: 0 20px;
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
    }
    .up-topbar-logo {
      display: flex; align-items: center; gap: 8px;
      font-family: var(--mono); font-size: 13px; font-weight: 700;
      color: var(--text); text-decoration: none; letter-spacing: 0.05em;
    }
    .up-topbar-logo span { color: var(--accent2); }
    .up-topbar-title {
      font-family: var(--mono); font-size: 11px;
      color: var(--text3); letter-spacing: 0.1em;
    }
    .up-topbar-spacer { flex: 1; }
    .up-topbar-user {
      font-family: var(--mono); font-size: 11px; color: var(--text3);
    }
    .up-topbar-user strong { color: var(--accent2); }

    /* ── Main content ── */
    .up-main {
      flex: 1; padding: 32px 40px;
      max-width: 900px; width: 100%; margin: 0 auto;
    }

    .up-header {
      display: flex; align-items: flex-end; justify-content: space-between;
      margin-bottom: 28px;
    }
    .up-header-left h1 {
      font-family: var(--mono); font-size: 20px; font-weight: 700;
      color: var(--text); letter-spacing: 0.05em;
    }
    .up-header-left p {
      font-family: var(--mono); font-size: 11px; color: var(--text3);
      margin-top: 4px; letter-spacing: 0.05em;
    }

    /* ── Table ── */
    .users-table-wrap {
      border: 1px solid var(--border);
      border-radius: 10px; overflow: hidden;
      margin-bottom: 32px;
    }
    .users-table { width: 100%; border-collapse: collapse; }
    .users-table thead tr {
      background: var(--bg3);
      border-bottom: 1px solid var(--border);
    }
    .users-table th {
      font-family: var(--mono); font-size: 10px; font-weight: 700;
      color: var(--text3); letter-spacing: 0.1em; text-transform: uppercase;
      padding: 12px 16px; text-align: left;
    }
    .users-table tbody tr {
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .users-table tbody tr:last-child { border-bottom: none; }
    .users-table tbody tr:hover { background: rgba(42,91,215,0.04); }
    .users-table tbody tr.is-me { background: rgba(42,91,215,0.05); }
    .users-table td { padding: 12px 16px; vertical-align: middle; }

    .ut-avatar {
      width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700;
    }
    .ut-name { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--text); }
    .ut-username { font-family: var(--mono); font-size: 10px; color: var(--text3); margin-top: 2px; }
    .ut-me-tag {
      display: inline-block; font-size: 9px; padding: 1px 7px; border-radius: 10px;
      background: rgba(42,91,215,0.15); color: var(--accent2); margin-left: 6px;
      font-weight: 400; letter-spacing: 0.05em; vertical-align: middle;
    }
    .ut-rol { font-family: var(--mono); font-size: 12px; font-weight: 700; }
    .ut-rol-desc { font-family: var(--mono); font-size: 9px; color: var(--text3); margin-top: 2px; }
    .ut-status { font-family: var(--mono); font-size: 11px; }
    .ut-active   { color: #00e887; }
    .ut-inactive { color: var(--text3); }
    .ut-date { font-family: var(--mono); font-size: 10px; color: var(--text3); }

    /* ── Form card ── */
    .form-card {
      background: var(--bg2);
      border: 1px solid var(--border2);
      border-radius: 12px;
      padding: 28px;
      display: none;
    }
    .form-card.open { display: block; animation: fadeUp 0.15s ease; }
    .form-card-title {
      font-family: var(--mono); font-size: 13px; font-weight: 700;
      color: var(--text); letter-spacing: 0.06em; margin-bottom: 22px;
      display: flex; align-items: center; justify-content: space-between;
    }

    .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .form-grid-1 { margin-bottom: 14px; }

    /* Rol cards grid */
    .rol-cards {
      display: grid; grid-template-columns: repeat(4,1fr); gap: 10px;
      margin-top: 8px; margin-bottom: 20px;
    }
    .rol-card {
      cursor: pointer; border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 12px;
      background: var(--bg3);
      transition: border-color 0.15s, background 0.15s, transform 0.1s;
      display: flex; flex-direction: column; gap: 7px;
      position: relative;
    }
    .rol-card input[type=radio] { display: none; }
    .rol-card:hover { border-color: var(--border2); transform: translateY(-2px); }
    .rol-card.selected {
      border-color: var(--accent);
      background: rgba(42,91,215,0.08);
      box-shadow: 0 0 0 1px rgba(42,91,215,0.25);
    }
    .rol-card.selected::after {
      content:'✓'; position: absolute; top:7px; right:10px;
      font-size:11px; color:var(--accent2); font-weight:700;
    }
    .rol-card-icon { font-size:18px; }
    .rol-card-name { font-family:var(--mono); font-size:12px; font-weight:700; }
    .rol-card-desc { font-family:var(--mono); font-size:9px; color:var(--text3); line-height:1.5; }
    .rol-card.selected .rol-card-desc { color: var(--text2); }

    /* Toggle activo */
    .toggle-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 0;
    }
    .toggle-row label {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-family: var(--mono); font-size: 12px; color: var(--text2);
    }

    .form-actions {
      display: flex; align-items: center; gap: 10px; margin-top: 8px;
    }
    .form-error {
      font-family: var(--mono); font-size: 11px; color: #ff4455;
      flex: 1;
    }

    /* ── Notificación ── */
    .notify {
      position: fixed; bottom: 28px; right: 28px; z-index: 9999;
      padding: 12px 20px; border-radius: 8px;
      font-family: var(--mono); font-size: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      opacity: 0; transform: translateY(10px);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }
    .notify.ok    { background: rgba(0,232,135,0.15); border: 1px solid rgba(0,232,135,0.4); color: #00e887; }
    .notify.error { background: rgba(255,68,85,0.15);  border: 1px solid rgba(255,68,85,0.4);  color: #ff4455; }
    .notify.show  { opacity: 1; transform: none; }

    /* Light mode */
    body.light { background: #f0f2f5; }
    body.light .users-table-wrap { background: #fff; }
    body.light .users-table thead tr { background: #f5f7fa; }
    body.light .form-card { background: #fff; }
    body.light .rol-card  { background: #f8f9fc; }
  </style>
</head>
<body class="dark">
<script>window.__ME__ = <?php echo $meJson; ?>;</script>

<div class="users-page" id="usuarios-app">

  <!-- Topbar -->
  <header class="up-topbar">
    <a class="up-topbar-logo" href="index.php">
      ◼ DC <span>MANAGER</span>
    </a>
    <div class="topbar-sep"></div>
    <span class="up-topbar-title">// GESTIÓN DE USUARIOS</span>
    <div class="up-topbar-spacer"></div>
    <span class="up-topbar-user">
      Conectado como <strong id="meLabel"></strong>
    </span>
    <div class="topbar-sep"></div>
    <a href="index.php" class="btn sm">← Volver al sistema</a>
    <button class="btn sm btn-logout" onclick="doLogout()">⎋ Cerrar sesión</button>
    <div class="topbar-sep"></div>
    <button class="btn-theme" id="btnTheme" title="Tema">☀️</button>
  </header>

  <!-- Main -->
  <main class="up-main">

    <div class="up-header">
      <div class="up-header-left">
        <h1>👥 USUARIOS DEL SISTEMA</h1>
        <p id="userCount">Cargando…</p>
      </div>
      <button class="btn primary" id="btnNewUser" onclick="showForm(null)">＋ Nuevo usuario</button>
    </div>

    <!-- Tabla -->
    <div class="users-table-wrap">
      <table class="users-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol y permisos</th>
            <th>Estado</th>
            <th>Creado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody id="usersTbody">
          <tr><td colspan="5" style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text3)">Cargando usuarios…</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Formulario -->
    <div class="form-card" id="formCard">
      <div class="form-card-title">
        <span id="formTitle">NUEVO USUARIO</span>
        <button class="btn sm" onclick="closeForm()">✕ Cancelar</button>
      </div>

      <div class="form-grid-2">
        <div>
          <label class="field-label-sm">NOMBRE COMPLETO</label>
          <input class="field-input" id="f_nombre" placeholder="Nombre para mostrar">
        </div>
        <div id="f_username_wrap">
          <label class="field-label-sm">USERNAME</label>
          <input class="field-input" id="f_username" placeholder="sin espacios, sin mayúsculas">
        </div>
      </div>

      <div class="form-grid-2">
        <div>
          <label class="field-label-sm" id="f_pwd_label">CONTRASEÑA (mín. 6 caracteres)</label>
          <div style="position:relative">
            <input class="field-input" type="password" id="f_password"
                   placeholder="••••••••" style="padding-right:38px">
            <button type="button" id="f_pwd_eye"
                    onclick="togglePwd()"
                    style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">👁</button>
          </div>
        </div>
        <div id="f_activo_wrap" style="display:none">
          <label class="field-label-sm">ESTADO DE CUENTA</label>
          <div class="toggle-row">
            <label>
              <input type="checkbox" id="f_activo" checked>
              <span id="f_activo_label">Activo</span>
            </label>
          </div>
        </div>
      </div>

      <label class="field-label-sm">ROL Y PERMISOS</label>
      <div class="rol-cards" id="rolCards">
        <label class="rol-card" data-rol="lector">
          <input type="radio" name="f_rol" value="lector" id="rol_lector" checked>
          <span class="rol-card-icon" style="color:#8ba3cc">◇</span>
          <span class="rol-card-name" style="color:#8ba3cc">Lector</span>
          <span class="rol-card-desc">Solo puede visualizar datos. Sin ningún permiso de escritura.</span>
        </label>
        <label class="rol-card" data-rol="crud">
          <input type="radio" name="f_rol" value="crud" id="rol_crud">
          <span class="rol-card-icon" style="color:#00e887">✦</span>
          <span class="rol-card-name" style="color:#00e887">CRUD</span>
          <span class="rol-card-desc">Lectura y escritura completa. Sin acceso a gestión de usuarios.</span>
        </label>
        <label class="rol-card" data-rol="admin">
          <input type="radio" name="f_rol" value="admin" id="rol_admin">
          <span class="rol-card-icon" style="color:#4a8aff">◈</span>
          <span class="rol-card-name" style="color:#4a8aff">Admin</span>
          <span class="rol-card-desc">Solo lectura de todas las locaciones. Sin escritura ni gestión.</span>
        </label>
        <label class="rol-card" data-rol="superadmin">
          <input type="radio" name="f_rol" value="superadmin" id="rol_superadmin">
          <span class="rol-card-icon" style="color:#ff8c42">★</span>
          <span class="rol-card-name" style="color:#ff8c42">Superadmin</span>
          <span class="rol-card-desc">Acceso total al CRUD y gestión completa de usuarios.</span>
        </label>
      </div>

      <!-- Locaciones asignadas: solo para lector y crud -->
      <div id="f_locaciones_wrap" style="display:none;margin-bottom:16px">
        <label class="field-label-sm">LOCACIONES ASIGNADAS <span style="color:var(--accent2)">(requerido para Lector y CRUD)</span></label>
        <div id="f_locaciones_list" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-height:38px">
          <span style="font-family:var(--mono);font-size:10px;color:var(--text3)" id="f_locaciones_empty">Selecciona al menos una locación</span>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn primary" id="btnSave" onclick="saveUser()">＋ Crear usuario</button>
        <button class="btn" onclick="closeForm()">Cancelar</button>
        <span class="form-error" id="formError"></span>
      </div>
    </div>

  </main>
</div>

<!-- Notificación -->
<div class="notify" id="notify"></div>

<!-- Confirm dialog reutiliza el mismo del main app -->
<div class="modal-overlay" id="confirmOverlay" style="display:none">
  <div class="modal" style="max-width:360px">
    <div class="modal-header"><span class="modal-title" id="confirmTitle">Confirmar</span></div>
    <div class="modal-body" id="confirmMsg" style="padding:20px;font-family:var(--mono);font-size:12px;color:var(--text2)"></div>
    <div class="modal-footer">
      <button class="btn primary danger" id="confirmOk">Eliminar</button>
      <button class="btn" onclick="closeConfirm()">Cancelar</button>
    </div>
  </div>
</div>

<script>
// ── Bootstrap ────────────────────────────────────────────
const me = window.__ME__;
document.getElementById('meLabel').textContent = (me.nombre||me.username) + ' [' + me.rol + ']';

// Theme
try {
  const t = localStorage.getItem('dcm_theme');
  if (t === 'light') { document.body.classList.replace('dark','light'); }
} catch(_) {}
document.getElementById('btnTheme').addEventListener('click', () => {
  const isLight = document.body.classList.contains('light');
  document.body.classList.toggle('dark',  isLight);
  document.body.classList.toggle('light', !isLight);
  try { localStorage.setItem('dcm_theme', isLight?'dark':'light'); } catch(_){}
  document.getElementById('btnTheme').textContent = isLight ? '☀️' : '🌙';
});

async function doLogout() {
  try { await fetch('api/auth.php?action=logout', { method:'POST', credentials:'same-origin' }); } catch(_){}
  window.location.href = 'login.html';
}

// ── Data ─────────────────────────────────────────────────
const ROL_LABELS = { superadmin:'Superadmin', admin:'Admin', crud:'CRUD', lector:'Lector' };
const ROL_COLORS = { superadmin:'#ff8c42', admin:'#4a8aff', crud:'#00e887', lector:'#8ba3cc' };
const ROL_DESC   = {
  superadmin: 'Acceso total + gestión de usuarios',
  admin:      'Solo lectura de todas las locaciones',
  crud:       'Lectura y escritura (sin gestión de usuarios)',
  lector:     'Solo visualización',
};

let _users    = [];
let _editId   = null;
let _allLocaciones = [];  // todas las locaciones del sistema

async function loadAllLocaciones() {
  try {
    // Fetch as superadmin — all locaciones
    const res  = await fetch('api/locaciones.php', { credentials:'same-origin' });
    const data = await res.json();
    _allLocaciones = data.locaciones || [];
  } catch(_) { _allLocaciones = []; }
}

async function loadUsers() {
  const res  = await fetch('api/auth.php?action=users', { credentials:'same-origin' });
  const data = await res.json();
  _users = data.users || [];
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('usersTbody');
  document.getElementById('userCount').textContent = _users.length + ' usuario(s) registrado(s)';

  if (!_users.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text3)">Sin usuarios</td></tr>';
    return;
  }

  tbody.innerHTML = _users.map(u => {
    const isMe = u.id == me.id;
    const d    = new Date(u.created_at);
    const date = isNaN(d) ? '—' : d.toLocaleDateString('es-MX');
    return `<tr class="${isMe?'is-me':''}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="ut-avatar" style="background:${ROL_COLORS[u.rol]}1a;color:${ROL_COLORS[u.rol]}">
            ${u.rol==='superadmin'?'★':u.rol==='admin'?'◈':u.rol==='crud'?'✦':'◇'}
          </div>
          <div>
            <div class="ut-name">
              ${esc(u.nombre||'—')}
              ${isMe?'<span class="ut-me-tag">tú</span>':''}
            </div>
            <div class="ut-username">@${esc(u.username)}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="ut-rol" style="color:${ROL_COLORS[u.rol]}">${ROL_LABELS[u.rol]}</span>
        <div class="ut-rol-desc">${esc(ROL_DESC[u.rol]||'')}</div>
      </td>
      <td>
        <span class="ut-status ${u.activo?'ut-active':'ut-inactive'}">
          ${u.activo ? '● Activo' : '○ Inactivo'}
        </span>
      </td>
      <td class="ut-date">${date}</td>
      <td style="text-align:right;white-space:nowrap">
        ${isMe
          ? '<span style="font-family:var(--mono);font-size:10px;color:var(--text3)">cuenta propia</span>'
          : `<button class="btn sm" onclick="showForm(${u.id})">✏ Editar</button>
             <button class="btn sm danger" style="margin-left:6px" onclick="confirmDelete(${u.id},'${esc(u.username)}')">🗑 Eliminar</button>`
        }
      </td>
    </tr>`;
  }).join('');
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Form ─────────────────────────────────────────────────
function showForm(userId) {
  _editId = userId;
  const user   = userId ? _users.find(u => u.id == userId) : null;
  const isEdit = !!user;
  const isSelf = isEdit && user.id == me.id;

  document.getElementById('formTitle').textContent =
    isEdit ? `EDITANDO: @${user.username}` : 'NUEVO USUARIO';
  document.getElementById('btnSave').textContent =
    isEdit ? '💾 Guardar cambios' : '＋ Crear usuario';
  document.getElementById('formError').textContent = '';
  // Populate locaciones checkboxes (will show/hide based on rol selection)
  renderLocacionesSelector(user ? (user.locaciones || []) : []);

  // Nombre
  document.getElementById('f_nombre').value = isEdit ? (user.nombre||'') : '';

  // Username
  const uWrap = document.getElementById('f_username_wrap');
  if (isEdit) {
    uWrap.style.display = 'none';
  } else {
    uWrap.style.display = '';
    document.getElementById('f_username').value = '';
  }

  // Password
  document.getElementById('f_password').value = '';
  document.getElementById('f_password').type  = 'password';
  document.getElementById('f_pwd_eye').textContent = '👁';
  document.getElementById('f_pwd_label').textContent =
    isEdit ? 'NUEVA CONTRASEÑA (vacío = sin cambio)' : 'CONTRASEÑA (mín. 6 caracteres)';

  // Activo — solo en edición de otro usuario
  const aWrap = document.getElementById('f_activo_wrap');
  if (isEdit && !isSelf) {
    aWrap.style.display = '';
    const cb = document.getElementById('f_activo');
    cb.checked = !!user.activo;
    document.getElementById('f_activo_label').textContent = user.activo ? 'Activo' : 'Inactivo';
    cb.onchange = () => { document.getElementById('f_activo_label').textContent = cb.checked ? 'Activo' : 'Inactivo'; };
  } else {
    aWrap.style.display = 'none';
  }

  // Rol cards
  const rolToSelect = isEdit ? user.rol : 'lector';
  document.querySelectorAll('.rol-card').forEach(card => {
    const r     = card.dataset.rol;
    const radio = card.querySelector('input[type=radio]');
    radio.checked = (r === rolToSelect);
    card.classList.toggle('selected', r === rolToSelect);
    // Superadmin no puede cambiar su propio rol
    const disabled = isSelf;
    radio.disabled = disabled;
    card.style.opacity        = disabled ? '0.45' : '';
    card.style.pointerEvents  = disabled ? 'none' : '';
  });

  document.getElementById('formCard').classList.add('open');
  document.getElementById('formCard').scrollIntoView({ behavior:'smooth', block:'nearest' });
  document.getElementById('f_nombre').focus();
}

function closeForm() {
  document.getElementById('formCard').classList.remove('open');
  _editId = null;
}

function renderLocacionesSelector(selectedIds) {
  const wrap    = document.getElementById('f_locaciones_wrap');
  const list    = document.getElementById('f_locaciones_list');
  const emptyEl = document.getElementById('f_locaciones_empty');

  list.innerHTML = '';
  if (!_allLocaciones.length) {
    list.innerHTML = '<span style="font-family:var(--mono);font-size:10px;color:var(--text3)">No hay locaciones en el sistema</span>';
    return;
  }

  _allLocaciones.forEach(loc => {
    const checked = selectedIds.includes(loc.id);
    const label   = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;font-family:var(--mono);font-size:11px;color:var(--text2);padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);transition:border-color .15s';
    label.innerHTML = `<input type="checkbox" name="f_loc" value="${esc(loc.id)}" ${checked?'checked':''}> ${esc(loc.nombre)}`;
    label.querySelector('input').addEventListener('change', updateLocWrap);
    list.appendChild(label);
  });
  updateLocWrap();
}

function updateLocWrap() {
  // Show locaciones section only for lector and crud roles
  const rolRadio = document.querySelector('input[name="f_rol"]:checked');
  const rol      = rolRadio ? rolRadio.value : '';
  const wrap     = document.getElementById('f_locaciones_wrap');
  wrap.style.display = ['lector','crud'].includes(rol) ? '' : 'none';
}

// Also update when rol card is clicked
document.getElementById('rolCards').addEventListener('change', updateLocWrap);

function togglePwd() {
  const inp = document.getElementById('f_password');
  const eye = document.getElementById('f_pwd_eye');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  eye.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ── Bind rol card clicks ─────────────────────────────────
document.getElementById('rolCards').addEventListener('click', e => {
  const card = e.target.closest('.rol-card');
  if (!card || card.style.pointerEvents === 'none') return;
  const radio = card.querySelector('input[type=radio]');
  radio.checked = true;
  document.querySelectorAll('.rol-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
});

// ── Save ─────────────────────────────────────────────────
async function saveUser() {
  const errEl    = document.getElementById('formError');
  const nombre   = document.getElementById('f_nombre').value.trim();
  const password = document.getElementById('f_password').value;
  const rolRadio = document.querySelector('input[name="f_rol"]:checked');
  const rol      = rolRadio ? rolRadio.value : 'lector';
  const activoEl = document.getElementById('f_activo');
  const isEdit   = _editId != null;
  const isSelf   = isEdit && _editId == me.id;

  errEl.textContent = '';

  if (!nombre) { errEl.textContent = 'El nombre completo es obligatorio.'; return; }
  if (!isEdit && password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (isEdit && password && password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

  const btn = document.getElementById('btnSave');
  btn.disabled = true; btn.textContent = 'Guardando…';

  try {
    let res, data;
    if (isEdit) {
      const body = { nombre };
      if (password)     body.password = password;
      if (!isSelf)      body.rol      = rol;
      if (activoEl && document.getElementById('f_activo_wrap').style.display !== 'none')
        body.activo = activoEl.checked ? 1 : 0;
      res  = await fetch(`api/auth.php?action=edit&id=${_editId}`,
        { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      data = await res.json();
    } else {
      const username = document.getElementById('f_username').value.trim();
      if (!username) { errEl.textContent = 'El username es obligatorio.'; btn.disabled=false; btn.textContent='＋ Crear usuario'; return; }
      const body = { username, nombre, password, rol };
      res  = await fetch('api/auth.php?action=create',
        { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      data = await res.json();
    }

    if (!data.ok) {
      errEl.textContent = 'Error: ' + (data.error||'desconocido');
      btn.disabled = false;
      btn.textContent = isEdit ? '💾 Guardar cambios' : '＋ Crear usuario';
      return;
    }

    // Save locaciones if lector or crud
    const savedUserId = isEdit ? _editId : (data.user?.id || null);
    const rolRadioFinal = document.querySelector('input[name="f_rol"]:checked');
    const rolFinal = rolRadioFinal ? rolRadioFinal.value : '';
    if (savedUserId && ['lector','crud'].includes(rolFinal)) {
      const checkedLocs = [...document.querySelectorAll('input[name="f_loc"]:checked')].map(cb => cb.value);
      await fetch('api/auth.php?action=set_locaciones', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ usuario_id: savedUserId, locaciones: checkedLocs })
      });
    }
    notify(isEdit ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', 'ok');
    closeForm();
    await loadUsers();

  } catch(e) {
    errEl.textContent = 'Error de red: ' + e.message;
    btn.disabled = false;
  }
}

// ── Delete ───────────────────────────────────────────────
let _pendingDeleteId = null;

function confirmDelete(id, username) {
  _pendingDeleteId = id;
  document.getElementById('confirmMsg').textContent = `¿Eliminar al usuario @${username}? Esta acción no se puede deshacer.`;
  document.getElementById('confirmOverlay').style.display = 'flex';
  document.getElementById('confirmOk').onclick = async () => {
    closeConfirm();
    try {
      const res  = await fetch('api/auth.php?id='+id, { method:'DELETE', credentials:'same-origin' });
      const data = await res.json();
      if (!data.ok) { notify('Error: '+(data.error||'desconocido'), 'error'); return; }
      notify('Usuario eliminado.', 'ok');
      await loadUsers();
    } catch(e) { notify('Error: '+e.message, 'error'); }
  };
}
function closeConfirm() {
  document.getElementById('confirmOverlay').style.display = 'none';
  _pendingDeleteId = null;
}

// ── Notify ───────────────────────────────────────────────
function notify(msg, type='ok') {
  const el = document.getElementById('notify');
  el.textContent = (type==='ok'?'✓ ':'✕ ') + msg;
  el.className   = `notify ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Init ─────────────────────────────────────────────────
loadAllLocaciones().then(() => loadUsers());
</script>
</body>
</html>
