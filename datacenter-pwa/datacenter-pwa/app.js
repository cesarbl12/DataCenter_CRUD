/* ================================================================
   app.js — Lógica principal de la aplicación
   Data Center Manager PWA
   Equivalente a DataCenterApp.java
================================================================ */

import {
  db,
  getRacksBySite, getRackById, insertRack, updateRack, deleteRack,
  getEquiposByRack, getEquipoById, insertEquipo, updateEquipo, deleteEquipo,
  getConexionesByEquipo, insertConexion, updateConexion, deleteConexion,
  validateEquipo,
} from './db.js';

// ════════════════════════════════════════════════════════════════
// APP STATE
// ════════════════════════════════════════════════════════════════

const state = {
  site:     'A',
  rack:     null,    // Rack seleccionado
  equipo:   null,    // Equipo seleccionado
  conexion: null,    // Conexión seleccionada
  darkMode: true,
};

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════

/** Escapa HTML para prevenir XSS */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function safeText(s) { return (s && String(s).trim()) ? s : '—'; }
function safe(s)      { return (s || '').toLowerCase(); }

function pillClass(estado) {
  if (!estado) return 'pill-inactive';
  switch (estado.toLowerCase()) {
    case 'activo':   return 'pill-active';
    case 'error':    return 'pill-error';
    default:         return 'pill-inactive';
  }
}

function ledClass(estado) {
  if (!estado) return 'led-inactive';
  switch (estado.toLowerCase()) {
    case 'activo': return 'led-active';
    case 'error':  return 'led-error';
    default:       return 'led-inactive';
  }
}

function ledDotClass(estado) {
  if (!estado) return 'led-inactivo';
  switch (estado.toLowerCase().replace(/\s/g,'')) {
    case 'activo': return 'led-activo';
    case 'error':  return 'led-error';
    default:       return 'led-inactivo';
  }
}

function portClass(puerto) {
  if (!puerto) return 'port-generic';
  const p = puerto.toLowerCase();
  if (p.includes('sfp')||p.includes('fiber')||p.includes('fibra')||p.includes('lc')||p.includes('sc'))
    return 'port-fiber';
  if (p.includes('serial')||p.includes('console')||p.includes('consola')||p.includes('rs232')||p.includes('com'))
    return 'port-serial';
  if (p.includes('rj45')||p.includes('eth')||p.includes('gi')||p.includes('fa')||p.includes('te'))
    return 'port-eth';
  return 'port-generic';
}

// ════════════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════════════

function applyTheme() {
  if (state.darkMode) {
    document.body.classList.remove('light');
    document.getElementById('btnTheme').textContent = '☀️';
  } else {
    document.body.classList.add('light');
    document.getElementById('btnTheme').textContent = '🌙';
  }
  try { localStorage.setItem('dcm_theme', state.darkMode ? 'dark' : 'light'); } catch(e) {}
}

document.getElementById('btnTheme').addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  applyTheme();
});

// ════════════════════════════════════════════════════════════════
// SITE SELECTOR
// ════════════════════════════════════════════════════════════════

function buildSiteSelector() {
  const container = document.getElementById('siteBtns');
  container.innerHTML = '';
  ['A','B','C','D','E'].forEach(s => {
    const b = document.createElement('button');
    b.className = 'btn-site' + (s === state.site ? ' active' : '');
    b.textContent = s;
    b.onclick = () => {
      state.site = s;
      state.rack = null; state.equipo = null; state.conexion = null;
      buildSiteSelector();
      refreshAll();
    };
    container.appendChild(b);
  });
}

// ════════════════════════════════════════════════════════════════
// RENDER: RACK LIST — Panel izquierdo
// ════════════════════════════════════════════════════════════════

function renderRackList() {
  const el = document.getElementById('rackList');
  const racks = getRacksBySite(state.site);

  if (!racks.length) {
    el.innerHTML = '<div class="empty-state">Sin racks en este site.<br>Crea uno con ＋ Nuevo</div>';
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
    `;
    div.onclick = () => selectRack(rack);
    div.addEventListener('contextmenu', e => { e.preventDefault(); showRackContextMenu(e, rack); });
    el.appendChild(div);
  });
}

function selectRack(rack) {
  state.rack    = rack;
  state.equipo  = null;
  state.conexion = null;
  renderRackList();
  renderRackView();
  renderEquipoList();
  renderEquipoDetail();
  renderConexList();
  renderConexDetail();
}

// ════════════════════════════════════════════════════════════════
// RENDER: RACK VIEW — diagrama visual de Us
// ════════════════════════════════════════════════════════════════

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
    return;
  }

  btnNew.style.display = '';
  const rack   = state.rack;
  const equipos = getEquiposByRack(rack.id);
  const usados  = equipos.reduce((s, e) => s + Math.max(1, e.uSize || 0), 0);
  const libres  = Math.max(0, rack.unidades - usados);

  titleEl.textContent = `RACK ${rack.id} · ${rack.nombre || ''}`;
  statsEl.innerHTML = `
    <span class="rack-stat-item">UBICACIÓN: <span class="rack-stat-val">${esc(rack.ubicacion || '—')}</span></span>
    <span class="rack-stat-item">TOTAL: <span class="rack-stat-val">${rack.unidades}U</span></span>
    <span class="rack-stat-item">USADOS: <span class="rack-stat-val">${usados}U</span></span>
    <span class="rack-stat-item">LIBRES: <span class="rack-stat-val">${libres}U</span></span>
    <span class="rack-stat-item">EQUIPOS: <span class="rack-stat-val">${equipos.length}</span></span>
  `;

  // Mapa de ocupación por número de U
  const occupied = {};
  equipos.forEach(eq => {
    if (eq.uPos == null) return;
    for (let u = eq.uPos; u < eq.uPos + Math.max(1, eq.uSize || 1); u++) {
      occupied[u] = eq;
    }
  });

  canvas.innerHTML = '';
  let u = 1;
  while (u <= rack.unidades) {
    const eq = occupied[u];
    if (!eq) {
      canvas.appendChild(buildEmptyUnit(u));
      u++;
    } else {
      if (u !== eq.uPos) { u++; continue; }
      canvas.appendChild(buildEquipoBlock(eq));
      u += Math.max(1, eq.uSize || 1);
    }
  }
}

/** Slot vacío — clic para instalar */
function buildEmptyUnit(u) {
  const div = document.createElement('div');
  div.className = 'rack-unit rack-unit-empty';
  div.innerHTML = `
    <span class="screw">◎</span>
    <span class="u-num">${String(u).padStart(2,'0')}</span>
    <span class="slot-empty-text">· · · · · · · · · [ EMPTY SLOT ] · · · · · · · · ·</span>
    <span class="install-hint">CLICK TO INSTALL</span>
    <span class="screw">◎</span>
  `;
  div.onclick = () => openInstallDialog(u);
  return div;
}

/** Bloque de equipo (ocupa 1 o más Us) */
function buildEquipoBlock(eq) {
  const size   = Math.max(1, eq.uSize || 1);
  const led    = ledClass(eq.estado);
  const isSelected = state.equipo?.id === eq.id;

  const block = document.createElement('div');
  block.className = 'equipo-block' + (isSelected ? ' selected' : '');

  // Fila principal (primera U del equipo)
  const header = document.createElement('div');
  header.className = 'eq-header';
  header.innerHTML = `
    <div class="led-strip ${led}" style="height:${size * 34}px;align-self:flex-start;flex-shrink:0;"></div>
    <span class="screw">◎</span>
    <span class="u-num" style="min-width:26px;">${String(eq.uPos).padStart(2,'0')}</span>
    <div style="width:2px;height:26px;background:rgba(0,0,0,0.6);flex-shrink:0;"></div>
    <span class="eq-name">${esc(eq.id)}</span>
    <span class="eq-model">${esc(eq.modelo || '')}</span>
    <span class="port-badge ${portClass(eq.puertoConexion)}">${esc(eq.puertoConexion || '')}</span>
    <div style="flex:1;"></div>
    <span class="eq-svc">${esc(eq.servicio || '')}</span>
    <span class="pill ${pillClass(eq.estado)}">${esc((eq.estado || '').toUpperCase())}</span>
    <span class="screw">◎</span>
  `;
  block.appendChild(header);

  // Filas extra (ventilación) para Us adicionales
  for (let i = 1; i < size; i++) {
    const line = document.createElement('div');
    line.className = 'eq-line';
    line.innerHTML = `
      <div class="led-strip ${led}" style="height:${34}px;flex-shrink:0;"></div>
      <span class="eq-vent">  ▐░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▌</span>
      <div style="flex:1;"></div>
      <span class="u-sec">${String(eq.uPos + i).padStart(2,'0')}  </span>
    `;
    block.appendChild(line);
  }

  block.onclick = (e) => {
    e.stopPropagation();
    selectEquipo(eq);
  };
  block.addEventListener('contextmenu', e => {
    e.preventDefault();
    showEquipoContextMenu(e, eq);
  });

  return block;
}

// ════════════════════════════════════════════════════════════════
// RENDER: EQUIPO LIST
// ════════════════════════════════════════════════════════════════

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
  let list = getEquiposByRack(state.rack.id);

  if (_eqFilter) {
    const q = _eqFilter.toLowerCase();
    list = list.filter(e =>
      safe(e.id).includes(q)             ||
      safe(e.modelo).includes(q)         ||
      safe(e.numeroSerie).includes(q)    ||
      safe(e.puertoConexion).includes(q) ||
      safe(e.servicio).includes(q)       ||
      safe(e.estado).includes(q)
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
      <span class="eq-u-badge">${eq.uPos != null ? 'U'+eq.uPos : '?'}</span>
      <span class="eq-list-name">${esc(eq.id)}</span>
      <span class="eq-list-model">${esc(eq.modelo || '')}</span>
      <span class="pill ${pillClass(eq.estado)}">${esc((eq.estado || '').toUpperCase())}</span>
    `;
    div.onclick = () => selectEquipo(eq);
    div.addEventListener('contextmenu', e => { e.preventDefault(); showEquipoContextMenu(e, eq); });
    el.appendChild(div);
  });
}

function selectEquipo(eq) {
  state.equipo   = eq;
  state.conexion = null;
  renderEquipoList();
  renderRackView();   // re-pintar selección en rack view
  renderEquipoDetail();
  renderConexList();
  renderConexDetail();
  document.getElementById('btnEditEquipo').style.display = '';
  document.getElementById('btnNewConex').style.display   = '';
}

// ── Búsqueda ──────────────────────────────────────────────────

window.filterEquipos = () => {
  _eqFilter = document.getElementById('searchEq').value;
  renderEquipoList();
};
window.clearEquipoFilter = () => {
  _eqFilter = '';
  document.getElementById('searchEq').value = '';
  renderEquipoList();
};

// ════════════════════════════════════════════════════════════════
// RENDER: EQUIPO DETAIL
// ════════════════════════════════════════════════════════════════

function renderEquipoDetail() {
  const el = document.getElementById('equipoDetail');
  const btnEdit = document.getElementById('btnEditEquipo');

  if (!state.equipo) {
    el.innerHTML = '<div class="placeholder"><div class="placeholder-icon">💾</div>Selecciona un equipo</div>';
    btnEdit.style.display = 'none';
    return;
  }

  const eq = state.equipo;
  const pos = eq.uPos != null ? `U${eq.uPos}  (${eq.uSize}U)` : '—';

  el.innerHTML = `
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-key">NOMBRE</span>
        <span class="detail-val">${esc(safeText(eq.id))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">MODELO</span>
        <span class="detail-val">${esc(safeText(eq.modelo))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">N° SERIE</span>
        <span class="detail-val">${esc(safeText(eq.numeroSerie))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">PUERTO</span>
        <span class="detail-val">
          <span class="port-badge ${portClass(eq.puertoConexion)}">${esc(safeText(eq.puertoConexion))}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-key">SERVICIO</span>
        <span class="detail-val">${esc(safeText(eq.servicio))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">ESTADO</span>
        <span class="detail-val">
          <span class="pill ${pillClass(eq.estado)}">${esc((eq.estado || '').toUpperCase())}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-key">POSICIÓN</span>
        <span class="detail-val">${esc(pos)}</span>
      </div>
    </div>
    <div class="action-row">
      <button class="btn sm" onclick="openEquipoModal(window.__state.equipo)">✏ Editar</button>
      <button class="btn sm danger" onclick="confirmDeleteEquipo()">🗑 Eliminar</button>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════
// RENDER: CONEXION LIST
// ════════════════════════════════════════════════════════════════

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
  let list = getConexionesByEquipo(state.equipo.id);

  if (_connFilter) {
    const q = _connFilter.toLowerCase();
    list = list.filter(c =>
      safe(c.id).includes(q)      ||
      safe(c.tipo).includes(q)    ||
      safe(c.estado).includes(q)  ||
      safe(c.destino).includes(q)
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
    div.addEventListener('contextmenu', e => { e.preventDefault(); showConnContextMenu(e, conn); });
    el.appendChild(div);
  });
}

function selectConexion(conn) {
  state.conexion = conn;
  renderConexList();
  renderConexDetail();
}

window.filterConexiones = () => {
  _connFilter = document.getElementById('searchConn').value;
  renderConexList();
};
window.clearConnFilter = () => {
  _connFilter = '';
  document.getElementById('searchConn').value = '';
  renderConexList();
};

// ════════════════════════════════════════════════════════════════
// RENDER: CONEXION DETAIL
// ════════════════════════════════════════════════════════════════

function renderConexDetail() {
  const el = document.getElementById('conexDetail');

  if (!state.conexion) {
    el.innerHTML = '<div class="placeholder"><div class="placeholder-icon">🔌</div>Selecciona una conexión</div>';
    return;
  }

  const c = state.conexion;
  el.innerHTML = `
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-key">ID / PUERTO</span>
        <span class="detail-val">${esc(safeText(c.id))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">TIPO</span>
        <span class="detail-val">
          <span class="port-badge ${portClass(c.tipo)}">${esc(safeText(c.tipo))}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-key">ESTADO</span>
        <span class="detail-val">
          <span class="pill ${pillClass(c.estado)}">${esc((c.estado || '').toUpperCase())}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-key">DESTINO</span>
        <span class="detail-val">${esc(safeText(c.destino))}</span>
      </div>
    </div>
    <div class="action-row">
      <button class="btn sm" onclick="openConexModal(window.__state.conexion)">✏ Editar</button>
      <button class="btn sm danger" onclick="confirmDeleteConex()">🗑 Eliminar</button>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════

function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML    = bodyHTML;
  document.getElementById('modalFooter').innerHTML  = footerHTML;
  document.getElementById('overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('active');
}
window.closeModal = closeModal;

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});

// ── RACK MODAL (crear / editar) ──────────────────────────────

function openRackModal(rack) {
  const isEdit = !!rack;
  const r = rack ?? { id:'', siteId: state.site, nombre:'', ubicacion:'', unidades: 42 };

  openModal(
    isEdit ? `EDITAR RACK · ${r.id}` : `NUEVO RACK · Site ${state.site}`,
    `<div class="form-grid">
      <label class="form-label">ID:</label>
      <input type="text" id="mRackId" value="${esc(r.id)}" placeholder="ej: R1"
        ${isEdit ? 'readonly style="opacity:0.6"' : ''}>
      <label class="form-label">Nombre:</label>
      <input type="text" id="mRackNombre" value="${esc(r.nombre)}" placeholder="nombre del rack">
      <label class="form-label">Ubicación:</label>
      <input type="text" id="mRackUbic" value="${esc(r.ubicacion)}" placeholder="ej: Sala A, Fila 1">
      <label class="form-label">Unidades:</label>
      <input type="number" id="mRackUnidades" value="${r.unidades}" min="1" max="60" style="max-width:80px;">
    </div>
    <div id="mRackErr" class="error-text"></div>`,
    `<button class="btn" onclick="closeModal()">✕ Cancelar</button>
     <button class="btn primary" onclick="saveRack(${isEdit})">${isEdit ? '💾 Guardar' : '＋ Crear'}</button>`
  );
}
window.openRackModal = openRackModal;

window.saveRack = function(isEdit) {
  const id        = document.getElementById('mRackId').value.trim();
  const nombre    = document.getElementById('mRackNombre').value.trim();
  const ubicacion = document.getElementById('mRackUbic').value.trim();
  const unidades  = parseInt(document.getElementById('mRackUnidades').value) || 42;

  if (!id) { document.getElementById('mRackErr').textContent = '⚠ El id es obligatorio.'; return; }

  const rack = { id, siteId: state.site, nombre, ubicacion, unidades };
  let ok;
  if (isEdit) {
    ok = updateRack(rack);
    if (!ok) { document.getElementById('mRackErr').textContent = '⚠ No se pudo actualizar.'; return; }
    if (state.rack?.id === id) state.rack = rack;
  } else {
    ok = insertRack(rack);
    if (!ok) { document.getElementById('mRackErr').textContent = '⚠ ID ya existe.'; return; }
  }
  closeModal();
  refreshAll();
};

// ── EQUIPO MODAL (crear / editar) ────────────────────────────

function openEquipoModal(eq) {
  if (!state.rack) { showAlert('Primero selecciona un rack.'); return; }
  const isEdit = !!eq;
  const e = eq ?? {
    id:'', rackId: state.rack.id, modelo:'', numeroSerie:'',
    puertoConexion:'', servicio:'', estado:'Activo', uPos:1, uSize:1,
  };

  openModal(
    isEdit ? `EDITAR EQUIPO · ${e.id}` : `NUEVO EQUIPO · Rack ${state.rack.id}`,
    `<div class="hint" style="margin-bottom:10px;">
       Rack: <strong>${esc(state.rack.id)}</strong> · Site: <strong>${esc(state.site)}</strong>
     </div>
     <div class="form-grid">
       <label class="form-label">Nombre:</label>
       <input type="text" id="mEqId" value="${esc(e.id)}" placeholder="ej: SVR-01"
         ${isEdit ? 'readonly style="opacity:0.6"' : ''}>
       <label class="form-label">Modelo:</label>
       <input type="text" id="mEqModelo" value="${esc(e.modelo||'')}" placeholder="ej: Dell PowerEdge R740">
       <label class="form-label">N° Serie:</label>
       <input type="text" id="mEqSerie" value="${esc(e.numeroSerie||'')}" placeholder="ej: SN-00123">
       <label class="form-label">Puerto:</label>
       <input type="text" id="mEqPuerto" value="${esc(e.puertoConexion||'')}" placeholder="ej: Gi1/0/1, eth0">
       <label class="form-label">Servicio:</label>
       <input type="text" id="mEqServicio" value="${esc(e.servicio||'')}" placeholder="ej: Web, DB, DNS">
       <label class="form-label">Estado:</label>
       <select id="mEqEstado">
         <option ${e.estado==='Activo'   ?'selected':''}>Activo</option>
         <option ${e.estado==='Inactivo' ?'selected':''}>Inactivo</option>
         <option ${e.estado==='Error'    ?'selected':''}>Error</option>
       </select>
       <label class="form-label">uPos:</label>
       <input type="number" id="mEqUPos" value="${e.uPos||1}" min="1" max="${state.rack.unidades}" style="max-width:80px;">
       <label class="form-label">uSize:</label>
       <input type="number" id="mEqUSize" value="${e.uSize||1}" min="1" max="20" style="max-width:80px;">
     </div>
     <div id="mEqErr" class="error-text"></div>`,
    `<button class="btn" onclick="closeModal()">✕ Cancelar</button>
     <button class="btn primary" onclick="saveEquipo(${isEdit},'${esc(e.id)}')">${isEdit ? '💾 Guardar' : '＋ Crear'}</button>`
  );
}
window.openEquipoModal = openEquipoModal;

window.saveEquipo = function(isEdit, oldId) {
  const rack = state.rack;
  if (!rack) return;

  const eq = {
    id:             document.getElementById('mEqId').value.trim(),
    rackId:         rack.id,
    modelo:         document.getElementById('mEqModelo').value.trim(),
    numeroSerie:    document.getElementById('mEqSerie').value.trim(),
    puertoConexion: document.getElementById('mEqPuerto').value.trim(),
    servicio:       document.getElementById('mEqServicio').value.trim(),
    estado:         document.getElementById('mEqEstado').value,
    uPos:           parseInt(document.getElementById('mEqUPos').value),
    uSize:          parseInt(document.getElementById('mEqUSize').value),
  };

  const existentes = getEquiposByRack(rack.id);
  const err = validateEquipo(eq, rack, existentes, isEdit ? oldId : null);
  if (err) { document.getElementById('mEqErr').textContent = '⚠ ' + err; return; }

  const ok = isEdit ? updateEquipo(eq) : insertEquipo(eq);
  if (!ok) {
    document.getElementById('mEqErr').textContent = '⚠ No se pudo ' + (isEdit ? 'actualizar' : 'crear') + '.';
    return;
  }
  state.equipo = eq;
  closeModal();
  refreshAll();
};

// ── CONEXION MODAL (crear / editar) ──────────────────────────

function openConexModal(conn) {
  if (!state.equipo) { showAlert('Selecciona un equipo primero.'); return; }
  const isEdit = !!conn;
  const c = conn ?? { id:'', tipo:'', estado:'Activo', destino:'' };

  openModal(
    isEdit ? `EDITAR CONEXIÓN · ${c.id}` : `NUEVA CONEXIÓN · ${state.equipo.id}`,
    `<div class="hint" style="margin-bottom:10px;">
       Equipo: <strong>${esc(state.equipo.id)}</strong>
     </div>
     <div class="form-grid">
       <label class="form-label">ID / Puerto:</label>
       <input type="text" id="mConId" value="${esc(c.id)}" placeholder="ej: eth0, sfp1"
         ${isEdit ? 'readonly style="opacity:0.6"' : ''}>
       <label class="form-label">Tipo:</label>
       <input type="text" id="mConTipo" value="${esc(c.tipo||'')}" placeholder="ej: RJ45, SFP+, Serial">
       <label class="form-label">Estado:</label>
       <select id="mConEstado">
         <option ${c.estado==='Activo'   ?'selected':''}>Activo</option>
         <option ${c.estado==='Inactivo' ?'selected':''}>Inactivo</option>
         <option ${c.estado==='Error'    ?'selected':''}>Error</option>
       </select>
       <label class="form-label">Destino:</label>
       <input type="text" id="mConDestino" value="${esc(c.destino||'')}" placeholder="ej: SW-01:Gi1/0/2">
     </div>
     <div id="mConErr" class="error-text"></div>`,
    `<button class="btn" onclick="closeModal()">✕ Cancelar</button>
     <button class="btn primary" onclick="saveConex(${isEdit},'${esc(c.id)}')">${isEdit ? '💾 Guardar' : '＋ Crear'}</button>`
  );
}
window.openConexModal = openConexModal;

window.saveConex = function(isEdit, oldId) {
  const eq = state.equipo;
  if (!eq) return;
  const id = document.getElementById('mConId').value.trim();
  if (!id) { document.getElementById('mConErr').textContent = '⚠ El id es obligatorio.'; return; }

  const conn = {
    id,
    equipoId: eq.id,
    tipo:     document.getElementById('mConTipo').value.trim(),
    estado:   document.getElementById('mConEstado').value,
    destino:  document.getElementById('mConDestino').value.trim(),
  };

  const ok = isEdit ? updateConexion(conn) : insertConexion(conn);
  if (!ok) {
    document.getElementById('mConErr').textContent = '⚠ No se pudo ' + (isEdit ? 'actualizar' : 'crear') + ' (¿id repetido?).';
    return;
  }
  if (state.conexion?.id === oldId) state.conexion = conn;
  closeModal();
  renderConexList();
  renderConexDetail();
};

// ── INSTALL DIALOG (clic en slot vacío del rack view) ─────────

function openInstallDialog(uClick) {
  if (!state.rack) return;
  const rack      = state.rack;
  const totalU    = rack.unidades;
  const existentes = getEquiposByRack(rack.id);

  const occupied = new Set();
  existentes.forEach(e => {
    for (let u = e.uPos; u < e.uPos + Math.max(1, e.uSize || 1); u++) occupied.add(u);
  });

  const selected = new Set([uClick]);

  openModal(
    `INSTALAR EQUIPO EN U${uClick}`,
    `<div class="hint" style="margin-bottom:10px;">Rack: <strong>${esc(rack.id)}</strong></div>
     <div class="form-grid">
       <label class="form-label">Nombre:</label>
       <input type="text" id="iEqId" placeholder="nombre (clave)">
       <label class="form-label">Modelo:</label>
       <input type="text" id="iEqModelo" placeholder="modelo">
       <label class="form-label">N° Serie:</label>
       <input type="text" id="iEqSerie" placeholder="número de serie">
       <label class="form-label">Puerto:</label>
       <input type="text" id="iEqPuerto" placeholder="puerto (ej: Gi1/0/1)">
       <label class="form-label">Servicio:</label>
       <input type="text" id="iEqServicio" placeholder="servicio">
       <label class="form-label">Estado:</label>
       <select id="iEqEstado">
         <option>Activo</option><option>Inactivo</option><option>Error</option>
       </select>
     </div>
     <div class="sep"></div>
     <div class="section-label">SLOTS — click para seleccionar múltiples Us</div>
     <div id="iSlotInfo" class="hint" style="margin-bottom:6px;">U${uClick} seleccionada</div>
     <div id="iSlotGrid" class="slot-grid"></div>
     <div id="iEqErr" class="error-text"></div>`,
    `<button class="btn" onclick="closeModal()">✕ Cancelar</button>
     <button class="btn primary" id="iBtnCreate" onclick="saveInstall()" disabled>＋ Instalar</button>`
  );

  // Construir grid de slots
  const grid = document.getElementById('iSlotGrid');
  for (let u = 1; u <= totalU; u++) {
    const btn = document.createElement('button');
    btn.dataset.u    = u;
    btn.textContent  = 'U' + u;
    const isOcc = occupied.has(u);
    btn.className    = 'slot-btn' + (isOcc ? ' occupied' : selected.has(u) ? ' selected' : '');
    btn.disabled     = isOcc;
    if (!isOcc) btn.onclick = () => {
      selected.has(u) ? selected.delete(u) : selected.add(u);
      updateInstallSlotGrid(selected, occupied);
    };
    grid.appendChild(btn);
  }

  // Escuchar cambios en campos de texto
  ['iEqId','iEqModelo','iEqSerie','iEqPuerto','iEqServicio'].forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.addEventListener('input', () => checkInstallReady(selected));
  });

  // Guardar referencia para saveInstall
  window.__installSelected = selected;
  window.__installOccupied = occupied;
  checkInstallReady(selected);
}

function updateInstallSlotGrid(selected, occupied) {
  document.querySelectorAll('#iSlotGrid .slot-btn').forEach(btn => {
    const u = parseInt(btn.dataset.u);
    btn.className = 'slot-btn' + (occupied.has(u) ? ' occupied' : selected.has(u) ? ' selected' : '');
  });
  const arr = [...selected].sort((a,b) => a-b);
  document.getElementById('iSlotInfo').textContent = arr.length
    ? arr.map(u => 'U'+u).join(', ') + `  (${arr.length}U)`
    : 'Ningún slot seleccionado';
  checkInstallReady(selected);
}

function checkInstallReady(selected) {
  const btn = document.getElementById('iBtnCreate');
  if (!btn) return;
  const fields     = ['iEqId','iEqModelo','iEqSerie','iEqPuerto','iEqServicio'];
  const allFilled  = fields.every(f => document.getElementById(f)?.value.trim());
  btn.disabled     = selected.size === 0 || !allFilled;
}

window.saveInstall = function() {
  const rack = state.rack;
  if (!rack) return;
  const selected = window.__installSelected;
  const arr = [...selected].sort((a,b) => a-b);
  if (!arr.length) return;

  const uPos  = arr[0];
  const uSize = arr[arr.length-1] - uPos + 1;

  const eq = {
    id:             document.getElementById('iEqId').value.trim(),
    rackId:         rack.id,
    modelo:         document.getElementById('iEqModelo').value.trim(),
    numeroSerie:    document.getElementById('iEqSerie').value.trim(),
    puertoConexion: document.getElementById('iEqPuerto').value.trim(),
    servicio:       document.getElementById('iEqServicio').value.trim(),
    estado:         document.getElementById('iEqEstado').value,
    uPos, uSize,
  };

  const existentes = getEquiposByRack(rack.id);
  const err = validateEquipo(eq, rack, existentes, null);
  if (err) { document.getElementById('iEqErr').textContent = '⚠ ' + err; return; }

  if (!insertEquipo(eq)) {
    document.getElementById('iEqErr').textContent = '⚠ No se pudo crear (¿nombre repetido?).';
    return;
  }
  state.equipo = eq;
  closeModal();
  refreshAll();
};

// ════════════════════════════════════════════════════════════════
// CONTEXT MENUS
// ════════════════════════════════════════════════════════════════

let _ctxMenu = null;

function removeCtxMenu() {
  _ctxMenu?.remove();
  _ctxMenu = null;
}

document.addEventListener('click', removeCtxMenu);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); removeCtxMenu(); }
});

function showCtxMenu(x, y, items) {
  removeCtxMenu();
  const div = document.createElement('div');
  div.className = 'ctx-menu';
  div.style.left = Math.min(x, window.innerWidth  - 210) + 'px';
  div.style.top  = Math.min(y, window.innerHeight - 200) + 'px';

  items.forEach(item => {
    if (item === 'sep') {
      const s = document.createElement('div'); s.className = 'ctx-sep'; div.appendChild(s);
    } else {
      const d = document.createElement('div');
      d.className = 'ctx-item' + (item.danger ? ' danger' : '');
      d.textContent = item.label;
      d.onclick = e => { e.stopPropagation(); removeCtxMenu(); item.action(); };
      div.appendChild(d);
    }
  });
  document.body.appendChild(div);
  _ctxMenu = div;
}

function showRackContextMenu(e, rack) {
  showCtxMenu(e.clientX, e.clientY, [
    { label: '✏ Editar rack',    action: () => { selectRack(rack); openRackModal(rack); } },
    'sep',
    { label: '🗑 Eliminar rack', danger: true, action: () =>
        showConfirm(`¿Eliminar rack ${rack.id} y todo su contenido?`, () => {
          deleteRack(rack.id);
          if (state.rack?.id === rack.id) { state.rack = null; state.equipo = null; state.conexion = null; }
          refreshAll();
        })
    },
  ]);
}

function showEquipoContextMenu(e, eq) {
  showCtxMenu(e.clientX, e.clientY, [
    { label: '🔍 Ver detalle',     action: () => selectEquipo(eq) },
    { label: '✏ Editar equipo',   action: () => { selectEquipo(eq); openEquipoModal(eq); } },
    { label: '🔌 Ver conexiones', action: () => selectEquipo(eq) },
    'sep',
    { label: '🗑 Eliminar equipo', danger: true, action: () =>
        showConfirm(`¿Eliminar equipo ${eq.id} y sus conexiones?`, () => {
          deleteEquipo(eq.id);
          if (state.equipo?.id === eq.id) { state.equipo = null; state.conexion = null; }
          refreshAll();
        })
    },
  ]);
}

function showConnContextMenu(e, conn) {
  showCtxMenu(e.clientX, e.clientY, [
    { label: '✏ Editar conexión',    action: () => { selectConexion(conn); openConexModal(conn); } },
    'sep',
    { label: '🗑 Eliminar conexión', danger: true, action: () =>
        showConfirm(`¿Eliminar conexión ${conn.id}?`, () => {
          deleteConexion(state.equipo.id, conn.id);
          if (state.conexion?.id === conn.id) state.conexion = null;
          renderConexList(); renderConexDetail();
        })
    },
  ]);
}

// ════════════════════════════════════════════════════════════════
// ALERTS / CONFIRMS
// ════════════════════════════════════════════════════════════════

function showAlert(msg) {
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-box">
      <div class="alert-msg">${esc(msg)}</div>
      <div class="alert-btns">
        <button class="btn primary" onclick="this.closest('.alert-overlay').remove()">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function showConfirm(msg, onOk) {
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-box">
      <div class="alert-msg">${esc(msg)}</div>
      <div class="alert-btns">
        <button class="btn" id="_cfCancel">Cancelar</button>
        <button class="btn danger" id="_cfOk">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_cfCancel').onclick = () => overlay.remove();
  overlay.querySelector('#_cfOk').onclick     = () => { overlay.remove(); onOk(); };
}

window.confirmDeleteEquipo = function() {
  if (!state.equipo) return;
  showConfirm(`¿Eliminar equipo ${state.equipo.id} y sus conexiones?`, () => {
    deleteEquipo(state.equipo.id);
    state.equipo = null; state.conexion = null;
    refreshAll();
  });
};

window.confirmDeleteConex = function() {
  if (!state.conexion || !state.equipo) return;
  showConfirm(`¿Eliminar conexión ${state.conexion.id}?`, () => {
    deleteConexion(state.equipo.id, state.conexion.id);
    state.conexion = null;
    renderConexList(); renderConexDetail();
  });
};

// ════════════════════════════════════════════════════════════════
// BUTTON WIRING
// ════════════════════════════════════════════════════════════════

document.getElementById('btnNewRack').onclick    = () => openRackModal(null);
document.getElementById('btnNewEquipo').onclick  = () => openEquipoModal(null);

// ════════════════════════════════════════════════════════════════
// GLOBAL REFRESH
// ════════════════════════════════════════════════════════════════

function refreshAll() {
  renderRackList();
  renderRackView();
  renderEquipoList();
  renderEquipoDetail();
  renderConexList();
  renderConexDetail();
}

// Exponer state para botones inline en HTML generado dinámicamente
window.__state = state;

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════

(function init() {
  // Cargar preferencia de tema
  try {
    const saved = localStorage.getItem('dcm_theme');
    if (saved === 'light') state.darkMode = false;
  } catch(e) {}

  applyTheme();
  buildSiteSelector();
  refreshAll();
})();
