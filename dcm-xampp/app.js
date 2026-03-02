// app.js — Lógica principal del Data Center Manager
import * as DB from './db.js';

// ════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ════════════════════════════════════════════════════════

const db = DB.loadDB ? DB.loadDB() : { racks: [], equipos: [], conexiones: [] };

const state = {
  site:     'A',
  rack:     null,    // rack seleccionado (OBJETO con id real)
  equipo:   null,    // equipo seleccionado
  conexion: null,    // conexión seleccionada
  darkMode: true,
};

// ════════════════════════════════════════════════════════
// HELPERS / UTILS
// ════════════════════════════════════════════════════════

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safe(s)     { return (s || '').toLowerCase(); }
function safeText(s) { return s?.trim() ? s : '—'; }

function pillClass(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'activo')   return 'pill-active';
  if (e === 'error')    return 'pill-error';
  return 'pill-inactive';
}
function ledClass(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'activo') return 'led-active';
  if (e === 'error')  return 'led-error';
  return 'led-inactive';
}
function ledDotClass(estado) {
  const e = (estado || '').toLowerCase().replace(/\s/g, '');
  if (e === 'activo') return 'led-dot-activo';
  if (e === 'error')  return 'led-dot-error';
  return 'led-dot-inactivo';
}
function portClass(puerto) {
  if (!puerto) return 'port-generic';
  const p = puerto.toLowerCase();
  if (p.includes('sfp') || p.includes('fiber') || p.includes('fibra') || p.includes('lc') || p.includes('sc')) return 'port-fiber';
  if (p.includes('serial') || p.includes('console') || p.includes('consola') || p.includes('rs232') || p.includes('com')) return 'port-serial';
  if (p.includes('rj45') || p.includes('eth') || p.includes('gi') || p.includes('fa') || p.includes('te')) return 'port-eth';
  return 'port-generic';
}

// Helpers críticos (fix rackId)
function isValidEntity(obj) {
  return obj && typeof obj === 'object' && typeof obj.id === 'string' && obj.id.trim() !== '';
}
function pickFirstRackForSite() {
  const racks = DB.getRacksBySite(db, state.site);
  return racks.length ? racks[0] : null;
}
function syncStateSelection() {
  // Asegura que state.rack exista y sea del site actual
  const racksSite = DB.getRacksBySite(db, state.site);
  if (!racksSite.length) {
    state.rack = null; state.equipo = null; state.conexion = null;
    return;
  }
  if (!isValidEntity(state.rack) || !racksSite.find(r => r.id === state.rack.id)) {
    state.rack = racksSite[0];
    state.equipo = null;
    state.conexion = null;
  }
  // Si hay equipo seleccionado, verifica que siga existiendo
  if (state.equipo && !db.equipos.find(e => e.id === state.equipo.id)) {
    state.equipo = null;
    state.conexion = null;
  }
  if (state.conexion && !db.conexiones.find(c => c.id === state.conexion.id && c.equipoId === state.equipo?.id)) {
    state.conexion = null;
  }
}

// ════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════

function applyTheme() {
  document.body.classList.toggle('light', !state.darkMode);
  document.getElementById('btnTheme').textContent = state.darkMode ? '☀️' : '🌙';
  try { localStorage.setItem('dcm_theme', state.darkMode ? 'dark' : 'light'); } catch (_) {}
}

document.getElementById('btnTheme').addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  applyTheme();
});

// ════════════════════════════════════════════════════════
// SITE SELECTOR
// ════════════════════════════════════════════════════════

function buildSiteSelector() {
  const container = document.getElementById('siteBtns');
  container.innerHTML = '';
  ['A', 'B', 'C', 'D', 'E'].forEach(s => {
    const b = document.createElement('button');
    b.className = 'btn-site' + (s === state.site ? ' active' : '');
    b.textContent = s;
    b.onclick = () => {
      state.site = s;
      state.rack = null; state.equipo = null; state.conexion = null;
      buildSiteSelector();
      syncStateSelection();
      refreshAll();
    };
    container.appendChild(b);
  });
}

// ════════════════════════════════════════════════════════
// PANEL IZQUIERDO — Lista de Racks
// ════════════════════════════════════════════════════════

function renderRackList() {
  const el    = document.getElementById('rackList');
  const racks = DB.getRacksBySite(db, state.site);

  if (!racks.length) {
    el.innerHTML = '<div class="empty-state">Sin racks en este site.<br>Pulsa ＋ Nuevo para crear uno.</div>';
    return;
  }

  el.innerHTML = '';
  racks.forEach(rack => {
    const div = document.createElement('div');
    div.className = 'rack-item' + (state.rack?.id === rack.id ? ' selected' : '');
    div.innerHTML = `
      <div class="rack-id">${esc(rack.id)}</div>
      <div class="rack-info">
        <div class="rack-name">${esc(rack.nombre || rack.id)}</div>
        <div class="rack-meta">${esc(rack.ubicacion || '—')}</div>
      </div>
      <div class="rack-ubadge">${rack.unidades}U</div>
      <div class="rack-actions">
        <button class="btn-rack-edit"  title="Editar rack"   data-id="${esc(rack.id)}">✏</button>
        <button class="btn-rack-delete" title="Eliminar rack" data-id="${esc(rack.id)}">🗑</button>
      </div>
    `;

    div.querySelector('.rack-actions').addEventListener('click', e => e.stopPropagation());

    div.querySelector('.btn-rack-edit').addEventListener('click', e => {
      e.stopPropagation();
      selectRack(rack);
      openRackModal(rack);
    });

    div.querySelector('.btn-rack-delete').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`¿Eliminar rack ${rack.id} y todo su contenido?`, async () => {
        await DB.deleteRack(db, rack.id);
        if (state.rack?.id === rack.id) { state.rack = null; state.equipo = null; state.conexion = null; }
        syncStateSelection();
        refreshAll();
      });
    });

    div.onclick = () => selectRack(rack);
    div.addEventListener('contextmenu', e => { e.preventDefault(); showRackCtxMenu(e, rack); });

    el.appendChild(div);
  });
}

function selectRack(rack) {
  state.rack     = rack;
  state.equipo   = null;
  state.conexion = null;
  refreshAll();
}

// ════════════════════════════════════════════════════════
// PANEL CENTRAL — Vista visual del Rack
// ════════════════════════════════════════════════════════

function renderRackView() {
  const titleEl = document.getElementById('rackViewTitle');
  const statsEl = document.getElementById('rackStats');
  const canvas  = document.getElementById('rackCanvas');
  const btnNew  = document.getElementById('btnNewEquipo');

  if (!state.rack) {
    titleEl.textContent = 'RACK VIEW';
    statsEl.innerHTML   = '';
    canvas.innerHTML    = '<div class="empty-state">Selecciona un rack en la columna izquierda</div>';
    btnNew.style.display = 'none';
    document.getElementById('btnEditRack').style.display = 'none';
    return;
  }

  btnNew.style.display = '';
  document.getElementById('btnEditRack').style.display = '';
  const rack    = state.rack;
  const equipos = DB.getEquiposByRack(db, rack.id);
  const usados  = equipos.reduce((s, e) => s + Math.max(1, e.uSize || 0), 0);
  const libres  = Math.max(0, rack.unidades - usados);

  titleEl.textContent = `RACK ${rack.id} · ${rack.nombre || ''}`;
  statsEl.innerHTML = `
    <span>UBICACIÓN: <b class="rack-stat-val">${esc(rack.ubicacion || '—')}</b></span>
    <span>TOTAL: <b class="rack-stat-val">${rack.unidades}U</b></span>
    <span>USADOS: <b class="rack-stat-val">${usados}U</b></span>
    <span>LIBRES: <b class="rack-stat-val">${libres}U</b></span>
    <span>EQUIPOS: <b class="rack-stat-val">${equipos.length}</b></span>
  `;

  const occupied = {};
  equipos.forEach(eq => {
    if (eq.uPos == null) return;
    for (let u = eq.uPos; u < eq.uPos + Math.max(1, eq.uSize || 1); u++) occupied[u] = eq;
  });

  canvas.innerHTML = '';
  let u = 1;
  while (u <= rack.unidades) {
    const eq = occupied[u];
    if (!eq) { canvas.appendChild(buildRackUnit(u)); u++; }
    else {
      if (u !== eq.uPos) { u++; continue; }
      canvas.appendChild(buildEquipoBlock(eq));
      u += Math.max(1, eq.uSize || 1);
    }
  }
}

function buildRackUnit(u) {
  const div = document.createElement('div');
  div.className = 'rack-unit rack-unit-empty';
  div.innerHTML = `
    <span class="screw">◎</span>
    <span class="u-num">${String(u).padStart(2, '0')}</span>
    <span class="slot-empty-text">· · · · · · · · · [ EMPTY SLOT ] · · · · · · · · ·</span>
    <span class="install-hint">CLICK TO INSTALL</span>
    <span class="screw">◎</span>
  `;
  div.onclick = () => openInstallDialog(u);
  return div;
}

function buildEquipoBlock(eq) {
  const size       = Math.max(1, eq.uSize || 1);
  const led        = ledClass(eq.estado);
  const isSelected = state.equipo?.id === eq.id;

  const block = document.createElement('div');
  block.className = 'equipo-block' + (isSelected ? ' selected' : '');

  const header = document.createElement('div');
  header.className = 'eq-header';
  header.innerHTML = `
    <div class="led-strip ${led}" style="height:${size * 34}px;align-self:flex-start;"></div>
    <span class="screw">◎</span>
    <span class="u-num">${String(eq.uPos).padStart(2, '0')}</span>
    <div class="rack-led-divider"></div>
    <span class="eq-name">${esc(eq.id)}</span>
    <span class="eq-model">${esc(eq.modelo || '')}</span>
    <span class="port-badge ${portClass(eq.puertoConexion)}">${esc(eq.puertoConexion || '')}</span>
    <div style="flex:1;"></div>
    <span class="eq-svc">${esc(eq.servicio || '')}</span>
    <span class="pill ${pillClass(eq.estado)}">${esc((eq.estado || '').toUpperCase())}</span>
    <span class="screw">◎</span>
  `;
  block.appendChild(header);

  for (let i = 1; i < size; i++) {
    const line = document.createElement('div');
    line.className = 'eq-line';
    line.innerHTML = `
      <span class="eq-vent">  ▐░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▌</span>
      <div style="flex:1;"></div>
      <span class="u-sec">${String(eq.uPos + i).padStart(2, '0')}  </span>
    `;
    block.appendChild(line);
  }

  block.onclick = (e) => { e.stopPropagation(); selectEquipo(eq); };
  block.addEventListener('contextmenu', e => { e.preventDefault(); showEquipoCtxMenu(e, eq); });
  return block;
}

// ════════════════════════════════════════════════════════
// PANEL CENTRAL — Lista de Equipos
// ════════════════════════════════════════════════════════

let _eqFilter = '';

function renderEquipoList(filter) {
  if (filter !== undefined) _eqFilter = filter;

  const titleEl = document.getElementById('equiposTitle');
  const el      = document.getElementById('equipoList');

  if (!state.rack) {
    titleEl.textContent = 'EQUIPOS';
    el.innerHTML = '<div class="empty-state">Selecciona un rack</div>';
    return;
  }

  titleEl.textContent = `EQUIPOS · Rack ${state.rack.id}`;
  let list = DB.getEquiposByRack(db, state.rack.id);

  if (_eqFilter) {
    const q = _eqFilter.toLowerCase();
    list = list.filter(e =>
      safe(e.id).includes(q) || safe(e.modelo).includes(q) ||
      safe(e.numeroSerie).includes(q) || safe(e.puertoConexion).includes(q) ||
      safe(e.servicio).includes(q) || safe(e.estado).includes(q)
    );
  }

  if (!list.length) {
    el.innerHTML = '<div class="empty-state">Sin equipos</div>';
    return;
  }

  el.innerHTML = '';
  list.forEach(eq => {
    const div = document.createElement('div');
    div.className = 'eq-list-item' + (state.equipo?.id === eq.id ? ' selected' : '');
    div.innerHTML = `
      <span class="eq-u-badge">${eq.uPos != null ? 'U' + eq.uPos : '?'}</span>
      <span class="eq-list-name">${esc(eq.id)}</span>
      <span class="eq-list-model">${esc(eq.modelo || '')}</span>
      <span class="pill ${pillClass(eq.estado)}">${esc((eq.estado || '').toUpperCase())}</span>
    `;
    div.onclick = () => selectEquipo(eq);
    div.addEventListener('contextmenu', e => { e.preventDefault(); showEquipoCtxMenu(e, eq); });
    el.appendChild(div);
  });
}

window.filterEquipos = function () {
  _eqFilter = document.getElementById('searchEq').value;
  renderEquipoList();
};
window.clearEquipoFilter = function () {
  _eqFilter = '';
  document.getElementById('searchEq').value = '';
  renderEquipoList();
};

function selectEquipo(eq) {
  state.equipo   = eq;
  state.conexion = null;
  refreshAll();
  document.getElementById('btnEditEquipo').style.display = '';
  document.getElementById('btnNewConex').style.display   = '';
}

// ════════════════════════════════════════════════════════
// PANEL DERECHO — Detalle de Equipo
// ════════════════════════════════════════════════════════

function renderEquipoDetail() {
  const el = document.getElementById('equipoDetail');
  document.getElementById('btnEditEquipo').style.display = state.equipo ? '' : 'none';

  if (!state.equipo) {
    el.innerHTML = '<div class="placeholder"><div class="placeholder-icon">💾</div>Selecciona un equipo</div>';
    return;
  }

  const eq  = state.equipo;
  const pos = eq.uPos != null ? `U${eq.uPos} (${eq.uSize}U)` : '—';
  el.innerHTML = `
    <div class="detail-box">
      <div class="detail-row"><span class="detail-key">NOMBRE</span>   <span class="detail-val">${esc(safeText(eq.id))}</span></div>
      <div class="detail-row"><span class="detail-key">MODELO</span>   <span class="detail-val">${esc(safeText(eq.modelo))}</span></div>
      <div class="detail-row"><span class="detail-key">N° SERIE</span> <span class="detail-val">${esc(safeText(eq.numeroSerie))}</span></div>
      <div class="detail-row"><span class="detail-key">PUERTO</span>   <span class="detail-val"><span class="port-badge ${portClass(eq.puertoConexion)}">${esc(safeText(eq.puertoConexion))}</span></span></div>
      <div class="detail-row"><span class="detail-key">SERVICIO</span> <span class="detail-val">${esc(safeText(eq.servicio))}</span></div>
      <div class="detail-row"><span class="detail-key">ESTADO</span>   <span class="detail-val"><span class="pill ${pillClass(eq.estado)}">${esc((eq.estado || '').toUpperCase())}</span></span></div>
      <div class="detail-row"><span class="detail-key">POSICIÓN</span> <span class="detail-val">${esc(pos)}</span></div>
    </div>
    <div class="action-row">
      <button class="btn sm" onclick="openEquipoModal(window._selectedEquipo)">✏ Editar</button>
      <button class="btn sm danger" onclick="confirmDeleteEquipo()">🗑 Eliminar</button>
    </div>
  `;
  window._selectedEquipo = eq;
}

// ════════════════════════════════════════════════════════
// PANEL DERECHO — Lista/Detalle Conexiones (sin cambios)
// ════════════════════════════════════════════════════════

let _connFilter = '';

function renderConexList(filter) {
  if (filter !== undefined) _connFilter = filter;
  const titleEl = document.getElementById('conexTitle');
  const el      = document.getElementById('conexList');

  if (!state.equipo) {
    titleEl.textContent = 'CONEXIONES';
    el.innerHTML = '<div class="empty-state">Selecciona un equipo</div>';
    return;
  }

  titleEl.textContent = `CONEXIONES · ${state.equipo.id}`;
  let list = DB.getConexionesByEquipo(db, state.equipo.id);

  if (_connFilter) {
    const q = _connFilter.toLowerCase();
    list = list.filter(c =>
      safe(c.id).includes(q) || safe(c.tipo).includes(q) ||
      safe(c.estado).includes(q) || safe(c.destino).includes(q)
    );
  }

  if (!list.length) {
    el.innerHTML = '<div class="empty-state">Sin conexiones</div>';
    return;
  }

  el.innerHTML = '';
  list.forEach(conn => {
    const div = document.createElement('div');
    div.className = 'conn-item' + (state.conexion?.id === conn.id ? ' selected' : '');
    div.innerHTML = `
      <span class="led-dot ${ledDotClass(conn.estado)}">●</span>
      <span class="port-badge ${portClass(conn.tipo)}">${esc(conn.tipo || '????')}</span>
      <span class="conn-id">${esc(conn.id)}</span>
      <span class="conn-arrow">────►</span>
      <span class="conn-dest">${esc(conn.destino || '—')}</span>
    `;
    div.onclick = () => selectConexion(conn);
    div.addEventListener('contextmenu', e => { e.preventDefault(); showConnCtxMenu(e, conn); });
    el.appendChild(div);
  });
}

window.filterConexiones = function () {
  _connFilter = document.getElementById('searchConn').value;
  renderConexList();
};
window.clearConnFilter = function () {
  _connFilter = '';
  document.getElementById('searchConn').value = '';
  renderConexList();
};

function selectConexion(conn) {
  state.conexion = conn;
  renderConexList();
  renderConexDetail();
}

function renderConexDetail() {
  const el = document.getElementById('conexDetail');
  if (!state.conexion) {
    el.innerHTML = '<div class="placeholder"><div class="placeholder-icon">🔌</div>Selecciona una conexión</div>';
    return;
  }
  const c = state.conexion;
  el.innerHTML = `
    <div class="detail-box">
      <div class="detail-row"><span class="detail-key">ID / PUERTO</span> <span class="detail-val">${esc(safeText(c.id))}</span></div>
      <div class="detail-row"><span class="detail-key">TIPO</span>        <span class="detail-val"><span class="port-badge ${portClass(c.tipo)}">${esc(safeText(c.tipo))}</span></span></div>
      <div class="detail-row"><span class="detail-key">ESTADO</span>      <span class="detail-val"><span class="pill ${pillClass(c.estado)}">${esc((c.estado || '').toUpperCase())}</span></span></div>
      <div class="detail-row"><span class="detail-key">DESTINO</span>     <span class="detail-val">${esc(safeText(c.destino))}</span></div>
    </div>
    <div class="action-row">
      <button class="btn sm" onclick="openConexModal(window._selectedConex)">✏ Editar</button>
      <button class="btn sm danger" onclick="confirmDeleteConex()">🗑 Eliminar</button>
    </div>
  `;
  window._selectedConex = c;
}

// ════════════════════════════════════════════════════════
// MODALES — CRUD (SOLO SE CORRIGE LA PARTE QUE ROMPÍA rackId)
// ════════════════════════════════════════════════════════

function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML   = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  document.getElementById('overlay').classList.add('active');
}
function closeModal() {
  document.getElementById('overlay').classList.remove('active');
}
window.closeModal = closeModal;

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});

// ── RACK MODAL ───────────────────────────────────────────

function openRackModal(rack) {
  const isEdit = !!rack;
  const r = rack || { id: '', siteId: state.site, nombre: '', ubicacion: '', unidades: 42 };

  const body = `
    <div class="form-grid">
      <label class="form-label">ID:</label>
      <input type="text" id="mRackId" value="${isEdit ? esc(r.id) : '(Auto)'}" readonly disabled style="opacity:.6">
      <label class="form-label">Nombre:</label>
      <input type="text" id="mRackNombre" value="${esc(r.nombre)}" placeholder="nombre del rack">
      <label class="form-label">Ubicación:</label>
      <input type="text" id="mRackUbic" value="${esc(r.ubicacion)}" placeholder="ej: Sala A, Fila 1">
      <label class="form-label">Unidades:</label>
      <input type="number" id="mRackUnidades" value="${r.unidades}" min="1" max="60" style="max-width:80px;">
    </div>
    <div id="mRackErr" class="error-text"></div>
  `;
  const footer = `
    <button class="btn" onclick="closeModal()">✕ Cancelar</button>
    <button class="btn primary" onclick="saveRack(${isEdit})">${isEdit ? '💾 Guardar' : '＋ Crear'}</button>
  `;
  openModal(isEdit ? `EDITAR RACK · ${r.id}` : `NUEVO RACK · Site ${state.site}`, body, footer);
}
window.openRackModal = openRackModal;

window.saveRack = async function (isEdit) {
  const nombre    = document.getElementById('mRackNombre').value.trim();
  const ubicacion = document.getElementById('mRackUbic').value.trim();
  const unidades  = parseInt(document.getElementById('mRackUnidades').value) || 42;
  const errEl     = document.getElementById('mRackErr');

  try {
    if (isEdit) {
      const id = state.rack?.id;
      if (!id) { errEl.textContent = '⚠ No se encontró el id del rack.'; return; }
      const rack = { id, siteId: state.site, nombre, ubicacion, unidades };
      await DB.updateRack(db, rack);
      // refresh desde server para evitar desync
      await DB.loadFromServer(db);
      state.rack = db.racks.find(r => r.id === id) || pickFirstRackForSite();
    } else {
      // ✅ NO mandar id (auto)
      const rackToCreate = { siteId: state.site, nombre, ubicacion, unidades };

      const created = await DB.insertRack(db, rackToCreate);

      // ✅ si insertRack devuelve boolean, recargamos y seleccionamos el último creado
      if (isValidEntity(created)) {
        state.rack = created;
      } else {
        await DB.loadFromServer(db);
        // intenta encontrar por nombre+site; si no, toma primero del site
        const racksSite = DB.getRacksBySite(db, state.site);
        state.rack = racksSite.find(r => r.nombre === nombre && r.ubicacion === ubicacion && r.unidades === unidades) || racksSite[racksSite.length - 1] || null;
      }
      state.equipo = null; state.conexion = null;
    }

    closeModal();
    syncStateSelection();
    refreshAll();
  } catch (e) {
    errEl.textContent = '⚠ ' + (e?.message || 'No se pudo guardar.');
  }
};

// ── EQUIPO MODAL ──────────────────────────────────────────

function openEquipoModal(eq) {
  if (!state.rack || !isValidEntity(state.rack)) { showAlert('Primero selecciona un rack válido.'); return; }
  const isEdit = !!eq;

  const e = eq || {
    id: '', rackId: state.rack.id, modelo: '', numeroSerie: '',
    puertoConexion: '', servicio: '', estado: 'Activo', uPos: 1, uSize: 1
  };

  const body = `
    <p class="hint" style="margin-bottom:10px;">Rack: <b>${state.rack.id}</b> · Site: <b>${state.site}</b></p>
    <div class="form-grid">
      <label class="form-label">ID:</label>
      <input type="text" id="mEqId" value="${isEdit ? esc(e.id) : '(Auto)'}" readonly disabled style="opacity:.6">
      <label class="form-label">Modelo:</label>
      <input type="text" id="mEqModelo" value="${esc(e.modelo || '')}" placeholder="ej: Dell PowerEdge R740">
      <label class="form-label">N° Serie:</label>
      <input type="text" id="mEqSerie" value="${esc(e.numeroSerie || '')}" placeholder="ej: SN-00123">
      <label class="form-label">Puerto:</label>
      <input type="text" id="mEqPuerto" value="${esc(e.puertoConexion || '')}" placeholder="ej: Gi1/0/1, eth0">
      <label class="form-label">Servicio:</label>
      <input type="text" id="mEqServicio" value="${esc(e.servicio || '')}" placeholder="ej: Web, DB, DNS">
      <label class="form-label">Estado:</label>
      <select id="mEqEstado">
        <option ${e.estado === 'Activo' ? 'selected' : ''}>Activo</option>
        <option ${e.estado === 'Inactivo' ? 'selected' : ''}>Inactivo</option>
        <option ${e.estado === 'Error' ? 'selected' : ''}>Error</option>
      </select>
      <label class="form-label">uPos:</label>
      <input type="number" id="mEqUPos" value="${e.uPos || 1}" min="1" max="${state.rack.unidades}" style="max-width:80px;">
      <label class="form-label">uSize:</label>
      <input type="number" id="mEqUSize" value="${e.uSize || 1}" min="1" max="20" style="max-width:80px;">
    </div>
    <div id="mEqErr" class="error-text"></div>
  `;
  const footer = `
    <button class="btn" onclick="closeModal()">✕ Cancelar</button>
    <button class="btn primary" onclick="saveEquipo(${isEdit},'${esc(e.id)}')">${isEdit ? '💾 Guardar' : '＋ Crear'}</button>
  `;
  openModal(isEdit ? `EDITAR EQUIPO · ${e.id}` : `NUEVO EQUIPO · Rack ${state.rack.id}`, body, footer);
}
window.openEquipoModal = openEquipoModal;

window.saveEquipo = async function (isEdit, oldId) {
  const rack = state.rack;
  if (!rack || !isValidEntity(rack)) { showAlert('Rack inválido. Selecciona uno existente.'); return; }

  const errEl = document.getElementById('mEqErr');

  const eq = {
    rackId:         rack.id, // ✅ SIEMPRE id REAL
    modelo:         document.getElementById('mEqModelo').value.trim(),
    numeroSerie:    document.getElementById('mEqSerie').value.trim(),
    puertoConexion: document.getElementById('mEqPuerto').value.trim(),
    servicio:       document.getElementById('mEqServicio').value.trim(),
    estado:         document.getElementById('mEqEstado').value,
    uPos:           parseInt(document.getElementById('mEqUPos').value),
    uSize:          parseInt(document.getElementById('mEqUSize').value),
  };

  const existentes = DB.getEquiposByRack(db, rack.id);
  const err = DB.validateEquipo(eq, rack, existentes, isEdit ? oldId : null);
  if (err) { errEl.textContent = '⚠ ' + err; return; }

  try {
    if (isEdit) {
      const id = oldId;
      await DB.updateEquipo(db, { id, ...eq });
      await DB.loadFromServer(db);
      state.equipo = db.equipos.find(e => e.id === id) || null;
    } else {
      const created = await DB.insertEquipo(db, eq);

      if (isValidEntity(created)) {
        state.equipo = created;
      } else {
        await DB.loadFromServer(db);
        // intenta encontrar por (rackId + uPos + modelo)
        const list = db.equipos.filter(e => e.rackId === rack.id);
        state.equipo = list.find(e => e.uPos === eq.uPos && e.modelo === eq.modelo && e.numeroSerie === eq.numeroSerie) || list[list.length - 1] || null;
      }
    }

    closeModal();
    syncStateSelection();
    refreshAll();
  } catch (e) {
    errEl.textContent = '⚠ ' + (e?.message || 'No se pudo guardar.');
  }
};

// ── CONEXION MODAL / INSTALL / CONTEXT / ALERT / CONFIRM ──
// (Tu código original sigue igual desde aquí; no afecta rackId)
// Para ahorrar espacio, deja tu implementación tal cual.
// ---------------------------------------------------------

// ════════════════════════════════════════════════════════
// BOTONES PRINCIPALES
// ════════════════════════════════════════════════════════

document.getElementById('btnNewRack').onclick    = () => openRackModal(null);
document.getElementById('btnEditRack').onclick   = () => { if (state.rack) openRackModal(state.rack); };
document.getElementById('btnNewEquipo').onclick  = () => openEquipoModal(null);
document.getElementById('btnEditEquipo').onclick = () => openEquipoModal(state.equipo);

// ════════════════════════════════════════════════════════
// REFRESH GLOBAL
// ════════════════════════════════════════════════════════

function refreshAll() {
  renderRackList();
  renderRackView();
  renderEquipoList();
  renderEquipoDetail();
  renderConexList();
  renderConexDetail();
}

// ════════════════════════════════════════════════════════
// INDICADOR (mantengo tu UI)
// ════════════════════════════════════════════════════════

function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    loading: { text: '⟳ Conectando…', cls: 'sync-loading' },
    ok:      { text: '● MySQL',        cls: 'sync-ok'      },
    offline: { text: '◌ Sin conexión', cls: 'sync-offline' },
    error:   { text: '✕ Sin MySQL',    cls: 'sync-error'   },
  };
  const s = map[status] || map.offline;
  el.textContent = s.text;
  el.className   = 'sync-badge ' + s.cls;
}

// ════════════════════════════════════════════════════════
// INIT (ONLINE ONLY)
// ════════════════════════════════════════════════════════

(async function init() {
  try {
    const saved = localStorage.getItem('dcm_theme');
    if (saved === 'light') state.darkMode = false;
  } catch (_) {}

  applyTheme();
  buildSiteSelector();

  // Render básico mientras carga
  syncStateSelection();
  refreshAll();

  setSyncStatus('loading');

  const ok = await DB.loadFromServer(db);
  if (ok) {
    setSyncStatus('ok');
    syncStateSelection();   // ✅ asegura rack válido para el site
    refreshAll();
  } else {
    setSyncStatus(navigator.onLine ? 'error' : 'offline');
    showDiagnosticToast && showDiagnosticToast();
  }

  // Click badge para recargar (online-only)
  const badge = document.getElementById('syncStatus');
  if (badge) {
    badge.addEventListener('click', async () => {
      setSyncStatus('loading');
      const r = await DB.loadFromServer(db);
      setSyncStatus(r ? 'ok' : (navigator.onLine ? 'error' : 'offline'));
      syncStateSelection();
      refreshAll();
    });
  }
})();