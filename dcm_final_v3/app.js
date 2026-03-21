// app.js — Data Center Manager
import * as DB from './db.js';
import { openImportModal } from './import.js';

// ════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ════════════════════════════════════════════════════════

const db = DB.loadDB();

const state = {
  locacion: null,   // objeto locacion seleccionada
  site:     null,   // objeto site seleccionado
  rack:     null,
  equipo:   null,
  conexion: null,
  darkMode: true,
};

// ════════════════════════════════════════════════════════
// HELPERS / UTILS
// ════════════════════════════════════════════════════════

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function safe(s)     { return (s || '').toLowerCase(); }
function safeText(s) { return s?.trim() ? s : '—'; }

function pillClass(estado) {
  const e = (estado||'').toLowerCase();
  if (e==='activo') return 'pill-active';
  if (e==='error')  return 'pill-error';
  return 'pill-inactive';
}
function ledClass(estado) {
  const e = (estado||'').toLowerCase();
  if (e==='activo') return 'led-active';
  if (e==='error')  return 'led-error';
  return 'led-inactive';
}
function ledDotClass(estado) {
  const e = (estado||'').toLowerCase().replace(/\s/g,'');
  if (e==='activo') return 'led-dot-activo';
  if (e==='error')  return 'led-dot-error';
  return 'led-dot-inactivo';
}
function portClass(puerto) {
  if (!puerto) return 'port-generic';
  const p = puerto.toLowerCase();
  if (p.includes('sfp')||p.includes('fiber')||p.includes('fibra')||p.includes('lc')||p.includes('sc')) return 'port-fiber';
  if (p.includes('serial')||p.includes('console')||p.includes('consola')||p.includes('rs232')||p.includes('com')) return 'port-serial';
  if (p.includes('rj45')||p.includes('eth')||p.includes('gi')||p.includes('fa')||p.includes('te')) return 'port-eth';
  return 'port-generic';
}

function isValidEntity(obj) {
  return obj && typeof obj==='object' && typeof obj.id==='string' && obj.id.trim()!=='';
}

function syncStateSelection() {
  // locacion
  const locs = DB.getLocaciones(db);
  if (!locs.length) { state.locacion=null; state.site=null; state.rack=null; state.equipo=null; state.conexion=null; return; }
  if (!isValidEntity(state.locacion) || !locs.find(l=>l.id===state.locacion.id))
    state.locacion = locs[0];

  // site — busca en TODOS los sites (no solo del locacion actual)
  // por si el state.site pertenece a otro locacion despues de un reload
  const allSites   = db.sites || [];
  const sitesOfLoc = allSites.filter(s => s.locacionId === state.locacion.id);
  if (!sitesOfLoc.length) {
    // Si el site actual existe en bd aunque sea de otro locacion, mantenerlo
    const existingAny = isValidEntity(state.site) && allSites.find(s => s.id === state.site.id);
    if (!existingAny) { state.site=null; state.rack=null; state.equipo=null; state.conexion=null; return; }
  } else {
    if (!isValidEntity(state.site) || !sitesOfLoc.find(s=>s.id===state.site.id))
      state.site = sitesOfLoc[0];
  }

  // rack
  const racks = DB.getRacksBySite(db, state.site.id);
  if (!racks.length) { state.rack=null; state.equipo=null; state.conexion=null; return; }
  if (!isValidEntity(state.rack) || !racks.find(r=>r.id===state.rack.id)) {
    state.rack = racks[0]; state.equipo=null; state.conexion=null;
  }

  if (state.equipo && !db.equipos.find(e=>e.id===state.equipo.id)) { state.equipo=null; state.conexion=null; }
  if (state.conexion && !db.conexiones.find(c=>c.id===state.conexion.id && c.equipoId===state.equipo?.id)) state.conexion=null;
}

// ════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════

function applyTheme() {
  document.body.classList.toggle('light', !state.darkMode);
  document.getElementById('btnTheme').textContent = state.darkMode ? '☀️' : '🌙';
  try { localStorage.setItem('dcm_theme', state.darkMode ? 'dark' : 'light'); } catch (_) {}
}

document.getElementById('btnTheme').addEventListener('click', () => { state.darkMode=!state.darkMode; applyTheme(); });

// ════════════════════════════════════════════════════════
// PERSISTENCIA — locacion y site en localStorage
// ════════════════════════════════════════════════════════

function saveSessionState() {
  try {
    localStorage.setItem('dcm_locacion', state.locacion?.id || '');
    localStorage.setItem('dcm_site',     state.site?.id     || '');
    localStorage.setItem('dcm_rack',     state.rack?.id     || '');
    localStorage.setItem('dcm_equipo',   state.equipo?.id   || '');
  } catch(_) {}
}

function loadSessionState() {
  try {
    return {
      locacionId: localStorage.getItem('dcm_locacion') || null,
      siteId:     localStorage.getItem('dcm_site')     || null,
      rackId:     localStorage.getItem('dcm_rack')     || null,
      equipoId:   localStorage.getItem('dcm_equipo')   || null,
    };
  } catch(_) { return { locacionId: null, siteId: null, rackId: null, equipoId: null }; }
}

// ════════════════════════════════════════════════════════
// BÚSQUEDA GLOBAL
// ════════════════════════════════════════════════════════

function initGlobalSearch() {
  const input   = document.getElementById('globalSearch');
  const dropdown= document.getElementById('searchDropdown');
  const clearBtn= document.getElementById('searchClearBtn');
  if (!input) return;

  let _debounce = null;

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }

  function openDropdown(html) {
    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function doSearch(q) {
    q = q.trim().toLowerCase();
    clearBtn.style.display = q ? '' : 'none';
    if (!q) { closeDropdown(); return; }

    // Scope: si hay locacion/site seleccionado, filtrar primero ahí
    // pero también buscar en toda la BD si no hay suficientes resultados
    const scopeSiteId   = state.site?.id     || null;
    const scopeLocId    = state.locacion?.id  || null;

    // Racks — filtrar por site si hay scope
    const allRacks = db.racks.filter(r => {
      const site  = DB.getSiteById(db, r.siteId);
      if (scopeLocId && site && site.locacionId !== scopeLocId) return false;
      if (scopeSiteId && r.siteId !== scopeSiteId) return false;
      return safe(r.id).includes(q) || safe(r.nombre).includes(q) || safe(r.ubicacion).includes(q);
    });

    // Equipos — filtrar por site del rack
    const allEquipos = db.equipos.filter(e => {
      const rack = DB.getRackById(db, e.rackId);
      const site = rack ? DB.getSiteById(db, rack.siteId) : null;
      if (scopeLocId && site && site.locacionId !== scopeLocId) return false;
      if (scopeSiteId && rack && rack.siteId !== scopeSiteId) return false;
      return safe(e.id).includes(q)||safe(e.modelo).includes(q)||
             safe(e.numeroSerie).includes(q)||safe(e.servicio).includes(q)||safe(e.estado).includes(q);
    });

    // Conexiones
    const allConexiones = db.conexiones.filter(c => {
      const equipo = DB.getEquipoById(db, c.equipoId);
      const rack   = equipo ? DB.getRackById(db, equipo.rackId) : null;
      const site   = rack   ? DB.getSiteById(db, rack.siteId)   : null;
      if (scopeLocId && site && site.locacionId !== scopeLocId) return false;
      if (scopeSiteId && rack && rack.siteId !== scopeSiteId) return false;
      return safe(c.id).includes(q)||safe(c.tipo).includes(q)||safe(c.destino).includes(q)||safe(c.estado).includes(q);
    });

    const total = allRacks.length + allEquipos.length + allConexiones.length;
    if (!total) {
      openDropdown('<div class="search-empty">Sin resultados para <b>' + esc(q) + '</b></div>');
      return;
    }

    let html = '';

    // Scope pills
    const scopeLabel = scopeSiteId
      ? `<span class="search-scope-pill">Site: ${esc(state.site?.nombre||scopeSiteId)}</span>`
      : scopeLocId
      ? `<span class="search-scope-pill">Loc: ${esc(state.locacion?.nombre||scopeLocId)}</span>`
      : `<span class="search-scope-pill search-scope-all">Toda la BD</span>`;
    html += `<div class="search-scope-row">${scopeLabel}<span class="search-total">${total} resultado(s)</span></div>`;

    // RACKS
    if (allRacks.length) {
      html += `<div class="search-group-label">🗄 RACKS (${allRacks.length})</div>`;
      html += allRacks.slice(0,5).map(r => {
        const site = DB.getSiteById(db, r.siteId);
        const loc  = site ? DB.getLocacionById(db, site.locacionId) : null;
        return `<div class="search-result-item" data-type="rack" data-id="${esc(r.id)}">
          <span class="sr-icon">🗄</span>
          <span class="sr-main">${esc(r.nombre||r.id)}</span>
          <span class="sr-sub">${esc(r.id)} · ${esc(site?.nombre||'?')} · ${esc(loc?.nombre||'?')}</span>
          <span class="sr-badge">${r.unidades}U</span>
        </div>`;
      }).join('');
      if (allRacks.length > 5) html += `<div class="search-more">+${allRacks.length-5} racks más</div>`;
    }

    // EQUIPOS
    if (allEquipos.length) {
      html += `<div class="search-group-label">💾 EQUIPOS (${allEquipos.length})</div>`;
      html += allEquipos.slice(0,6).map(e => {
        const rack = DB.getRackById(db, e.rackId);
        return `<div class="search-result-item" data-type="equipo" data-id="${esc(e.id)}">
          <span class="sr-icon">💾</span>
          <span class="sr-main">${esc(e.id)}</span>
          <span class="sr-sub">${esc(e.modelo||'—')} · ${esc(rack?.nombre||e.rackId)}</span>
          <span class="pill ${pillClass(e.estado)} sr-pill">${esc((e.estado||'').toUpperCase())}</span>
        </div>`;
      }).join('');
      if (allEquipos.length > 6) html += `<div class="search-more">+${allEquipos.length-6} equipos más</div>`;
    }

    // CONEXIONES
    if (allConexiones.length) {
      html += `<div class="search-group-label">🔌 CONEXIONES (${allConexiones.length})</div>`;
      html += allConexiones.slice(0,5).map(c => {
        const eq = DB.getEquipoById(db, c.equipoId);
        return `<div class="search-result-item" data-type="conexion" data-eqid="${esc(c.equipoId)}" data-id="${esc(c.id)}">
          <span class="sr-icon">🔌</span>
          <span class="sr-main">${esc(c.id)}</span>
          <span class="sr-sub">${esc(c.tipo||'—')} → ${esc(c.destino||'—')} · ${esc(eq?.id||c.equipoId)}</span>
          <span class="pill ${pillClass(c.estado)} sr-pill">${esc((c.estado||'').toUpperCase())}</span>
        </div>`;
      }).join('');
      if (allConexiones.length > 5) html += `<div class="search-more">+${allConexiones.length-5} conexiones más</div>`;
    }

    openDropdown(html);

    // Click handlers on results
    dropdown.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const type  = el.dataset.type;
        const id    = el.dataset.id;
        const eqId  = el.dataset.eqid;

        if (type === 'rack') {
          const rack = DB.getRackById(db, id);
          if (!rack) return;
          const site = DB.getSiteById(db, rack.siteId);
          const loc  = site ? DB.getLocacionById(db, site.locacionId) : null;
          if (loc)  state.locacion = loc;
          if (site) state.site     = site;
          state.rack    = rack;
          state.equipo  = null;
          state.conexion= null;
          saveSessionState();
          refreshAll();
        }
        else if (type === 'equipo') {
          const eq   = DB.getEquipoById(db, id);
          if (!eq) return;
          const rack = DB.getRackById(db, eq.rackId);
          const site = rack ? DB.getSiteById(db, rack.siteId) : null;
          const loc  = site ? DB.getLocacionById(db, site.locacionId) : null;
          if (loc)  state.locacion = loc;
          if (site) state.site     = site;
          if (rack) state.rack     = rack;
          state.equipo   = eq;
          state.conexion = null;
          saveSessionState();
          refreshAll();
        }
        else if (type === 'conexion') {
          const eq   = DB.getEquipoById(db, eqId);
          const conn = eq ? db.conexiones.find(c => c.id===id && c.equipoId===eqId) : null;
          if (!eq||!conn) return;
          const rack = DB.getRackById(db, eq.rackId);
          const site = rack ? DB.getSiteById(db, rack.siteId) : null;
          const loc  = site ? DB.getLocacionById(db, site.locacionId) : null;
          if (loc)  state.locacion = loc;
          if (site) state.site     = site;
          if (rack) state.rack     = rack;
          state.equipo   = eq;
          state.conexion = conn;
          saveSessionState();
          refreshAll();
        }

        // Limpiar búsqueda después de seleccionar
        input.value = '';
        clearBtn.style.display = 'none';
        closeDropdown();
      });
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => doSearch(input.value), 180);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value=''; clearBtn.style.display='none'; closeDropdown(); }
    if (e.key === 'Enter') {
      const first = dropdown.querySelector('.search-result-item');
      if (first) first.click();
    }
    // Navegar con flechas
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...dropdown.querySelectorAll('.search-result-item')];
      if (!items.length) return;
      const focused = dropdown.querySelector('.search-result-item.focused');
      let idx = focused ? items.indexOf(focused) : -1;
      if (focused) focused.classList.remove('focused');
      idx = e.key === 'ArrowDown' ? Math.min(idx+1, items.length-1) : Math.max(idx-1, 0);
      items[idx].classList.add('focused');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    closeDropdown();
    input.focus();
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', e => {
    if (!document.getElementById('globalSearchWrap')?.contains(e.target)) closeDropdown();
  });

  // Shortcut Ctrl+F / Cmd+F abre la búsqueda global
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.key==='f') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

// ════════════════════════════════════════════════════════
// LOCACION DROPDOWN (topbar)
// ════════════════════════════════════════════════════════

function buildLocacionDropdown() {
  const wrap = document.getElementById('locacionDropdownWrap');
  const locs = DB.getLocaciones(db);

  const currentName = state.locacion ? esc(state.locacion.nombre) : 'Sin locaciones';

  wrap.innerHTML = `
    <div class="loc-dropdown" id="locDropdown">
      <button class="loc-dropdown-btn" id="locDropdownBtn">
        <span class="loc-icon">📍</span>
        <span id="locDropdownLabel">${currentName}</span>
        <span class="loc-arrow">▾</span>
      </button>
      <div class="loc-dropdown-menu" id="locDropdownMenu">
        ${locs.map(l => `
          <div class="loc-menu-item ${state.locacion?.id===l.id?'active':''}" data-id="${esc(l.id)}">
            <span class="loc-menu-name">${esc(l.nombre)}</span>
            ${(typeof __canWrite==='undefined'||__canWrite()) ? '<span class="loc-menu-actions"><button class="loc-menu-btn" data-action="edit" data-id="'+esc(l.id)+'" title="Editar">✏</button><button class="loc-menu-btn danger" data-action="delete" data-id="'+esc(l.id)+'" title="Eliminar">🗑</button></span>' : ''}
          </div>`).join('')}
        ${(typeof __canWrite==='undefined'||__canWrite()) ? (locs.length ? '<div class="loc-menu-sep"></div>' : '') + '<div class="loc-menu-item loc-menu-action" data-action="new"><span>＋ Nueva locación</span></div>' : ''}
      </div>
    </div>`;

  const btn  = document.getElementById('locDropdownBtn');
  const menu = document.getElementById('locDropdownMenu');

  btn.onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); };

  menu.addEventListener('click', e => {
    e.stopPropagation();
    const item   = e.target.closest('[data-action],[data-id]');
    if (!item) return;
    const action = item.dataset.action;
    const id     = item.dataset.id;

    if (action === 'new') {
      menu.classList.remove('open');
      openLocacionModal(null);
      return;
    }
    if (action === 'edit') {
      menu.classList.remove('open');
      const loc = DB.getLocacionById(db, id);
      if (loc) openLocacionModal(loc);
      return;
    }
    if (action === 'delete') {
      menu.classList.remove('open');
      const loc = DB.getLocacionById(db, id);
      if (loc) showConfirm(`¿Eliminar locación "${loc.nombre}" y todo su contenido?`, async () => {
        await DB.deleteLocacion(db, loc.id);
        if (state.locacion?.id === loc.id) state.locacion = null;
        syncStateSelection();
        refreshAll();
      });
      return;
    }
    // select locacion
    if (id) {
      const loc = DB.getLocacionById(db, id);
      if (loc) {
        state.locacion = loc; state.site=null; state.rack=null; state.equipo=null; state.conexion=null;
        syncStateSelection();
        saveSessionState();
        menu.classList.remove('open');
        refreshAll();
      }
    }
  });

  // close on outside click
  document.addEventListener('click', () => menu.classList.remove('open'), { once: false });
}

// ════════════════════════════════════════════════════════
// SITE SELECTOR (topbar buttons - dynamic per locacion)
// ════════════════════════════════════════════════════════

function buildSiteSelector() {
  const container = document.getElementById('siteBtns');
  container.innerHTML = '';
  if (!state.locacion) return;

  const sites = DB.getSitesByLocacion(db, state.locacion.id);
  sites.forEach(s => {
    const b = document.createElement('button');
    b.className = 'btn-site' + (state.site?.id === s.id ? ' active' : '');
    b.textContent = s.nombre;
    b.title = s.nombre;
    b.onclick = () => {
      state.site = s; state.rack=null; state.equipo=null; state.conexion=null;
      buildSiteSelector();
      syncStateSelection();
      saveSessionState();
      refreshAll();
    };
    b.addEventListener('contextmenu', e => { e.preventDefault(); showSiteCtxMenu(e, s); });
    container.appendChild(b);
  });

  // + new site button (solo para usuarios con permiso de escritura)
  if (typeof __canWrite === 'undefined' || __canWrite()) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-site btn-site-add';
    addBtn.textContent = '＋';
    addBtn.title = 'Nuevo site';
    addBtn.onclick = () => openSiteModal(null);
    container.appendChild(addBtn);
  }
}

function showSiteCtxMenu(e, site) {
  if (typeof __canWrite !== 'undefined' && !__canWrite()) return;
  buildCtxMenu(e.clientX, e.clientY, [
    { label: '✏ Editar site',  action: () => openSiteModal(site) },
    'sep',
    { label: '🗑 Eliminar site', danger: true, action: () => {
      showConfirm(`¿Eliminar site "${site.nombre}" y todos sus racks?`, async () => {
        await DB.deleteSite(db, site.id);
        if (state.site?.id === site.id) { state.site=null; state.rack=null; state.equipo=null; state.conexion=null; }
        syncStateSelection();
        refreshAll();
      });
    }},
  ]);
}

// ════════════════════════════════════════════════════════
// PANEL IZQUIERDO — Lista de Racks
// ════════════════════════════════════════════════════════

function renderRackList() {
  const el    = document.getElementById('rackList');
  if (!state.site) {
    el.innerHTML = '<div class="empty-state">Selecciona un site</div>';
    return;
  }
  const racks = DB.getRacksBySite(db, state.site.id);
  if (!racks.length) {
    el.innerHTML = '<div class="empty-state">Sin racks en este site.<br>Pulsa + Nuevo para crear uno.</div>';
    return;
  }
  el.innerHTML = '';
  racks.forEach(rack => {
    const div = document.createElement('div');
    div.className = 'rack-item' + (state.rack?.id === rack.id ? ' selected' : '');
    div.innerHTML = `
      <div class="rack-info">
        <div class="rack-name">${esc(rack.nombre || rack.id)}</div>
        <div class="rack-meta"><span class="rack-id-inline">${esc(rack.id)}</span> · ${esc(rack.ubicacion||'—')}</div>
      </div>
      <div class="rack-ubadge">${rack.unidades}U</div>
      <div class="rack-actions">
        ${(typeof __canWrite==='undefined'||__canWrite()) ? '<button class="btn-rack-edit" title="Editar" data-id="'+esc(rack.id)+'">✏</button><button class="btn-rack-delete" title="Eliminar" data-id="'+esc(rack.id)+'">🗑</button>' : ''}
      </div>`;
    div.querySelector('.rack-actions').addEventListener('click', e => e.stopPropagation());
    div.querySelector('.btn-rack-edit')?.addEventListener('click', e => { e.stopPropagation(); selectRack(rack); openRackModal(rack); });
    div.querySelector('.btn-rack-delete')?.addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`¿Eliminar rack ${rack.id} y todo su contenido?`, async () => {
        await DB.deleteRack(db, rack.id);
        if (state.rack?.id === rack.id) { state.rack=null; state.equipo=null; state.conexion=null; }
        syncStateSelection(); refreshAll();
      });
    });
    div.onclick = () => selectRack(rack);
    div.addEventListener('contextmenu', e => { e.preventDefault(); showRackCtxMenu(e, rack); });
    el.appendChild(div);
  });
}

function selectRack(rack) { state.rack=rack; state.equipo=null; state.conexion=null; refreshAll(); }

// ════════════════════════════════════════════════════════
// PANEL CENTRAL — Vista Rack
// ════════════════════════════════════════════════════════

function renderRackView() {
  const titleEl = document.getElementById('rackViewTitle');
  const statsEl = document.getElementById('rackStats');
  const canvas  = document.getElementById('rackCanvas');
  const btnNew  = document.getElementById('btnNewEquipo');

  if (!state.rack) {
    titleEl.textContent = 'RACK VIEW';
    statsEl.innerHTML   = '';
    canvas.innerHTML    = '<div class="empty-state">Selecciona un rack</div>';
    btnNew.style.display = 'none';
    document.getElementById('btnEditRack').style.display = 'none';
    return;
  }
  if (typeof __canWrite === 'undefined' || __canWrite()) {
    btnNew.style.display = '';
    document.getElementById('btnEditRack').style.display = '';
  }

  const rack    = state.rack;
  const equipos = DB.getEquiposByRack(db, rack.id);
  const usados  = equipos.reduce((s,e)=>s+Math.max(1,e.uSize||0),0);
  const libres  = Math.max(0, rack.unidades - usados);

  titleEl.textContent = `RACK ${rack.id} · ${rack.nombre||''}`;
  statsEl.innerHTML = `
    <span>UBICACION: <b class="rack-stat-val">${esc(rack.ubicacion||'—')}</b></span>
    <span>TOTAL: <b class="rack-stat-val">${rack.unidades}U</b></span>
    <span>USADOS: <b class="rack-stat-val">${usados}U</b></span>
    <span>LIBRES: <b class="rack-stat-val">${libres}U</b></span>
    <span>EQUIPOS: <b class="rack-stat-val">${equipos.length}</b></span>`;

  const occupied = {};
  equipos.forEach(eq => { if(eq.uPos==null)return; for(let u=eq.uPos;u<eq.uPos+Math.max(1,eq.uSize||1);u++) occupied[u]=eq; });

  canvas.innerHTML = '';
  let u = 1;
  while (u <= rack.unidades) {
    const eq = occupied[u];
    if (!eq) { canvas.appendChild(buildRackUnit(u)); u++; }
    else {
      if (u !== eq.uPos) { u++; continue; }
      canvas.appendChild(buildEquipoBlock(eq));
      u += Math.max(1, eq.uSize||1);
    }
  }
}

function buildRackUnit(u) {
  const div = document.createElement('div');
  div.className    = 'rack-unit rack-unit-empty';
  div.dataset.upos = u;
  div.innerHTML = `
    <span class="screw">◎</span>
    <span class="u-num">${String(u).padStart(2,'0')}</span>
    <span class="slot-empty-text">· · · · · · · · · [ EMPTY SLOT ] · · · · · · · · ·</span>
    <span class="install-hint">CLICK TO INSTALL</span>
    <span class="screw">◎</span>`;
  div.onclick = () => openInstallDialog(u);
  div.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; div.classList.add('drag-over'); });
  div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
  div.addEventListener('drop', e => { e.preventDefault(); div.classList.remove('drag-over'); handleDrop(parseInt(div.dataset.upos)); });
  return div;
}

function buildEquipoBlock(eq) {
  const size       = Math.max(1, eq.uSize||1);
  const led        = ledClass(eq.estado);
  const isSelected = state.equipo?.id === eq.id;

  const block = document.createElement('div');
  block.className    = 'equipo-block' + (isSelected?' selected':'');
  block.dataset.eqid = eq.id;
  block.dataset.upos = eq.uPos;
  block.draggable    = true;

  block.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eq.id);
    const ghost = block.cloneNode(true);
    ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${block.offsetWidth}px;opacity:0.75;pointer-events:none;background:rgba(42,91,215,0.25);border:1px solid rgba(42,91,215,0.8);border-radius:10px;overflow:hidden;`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth/2, 17);
    setTimeout(()=>ghost.remove(),0);
    block.classList.add('dragging');
    _drag.equipoId = eq.id; _drag.fromUPos = eq.uPos;
  });
  block.addEventListener('dragend', () => { block.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); });
  block.addEventListener('dragover', e => { if(_drag.equipoId&&_drag.equipoId!==eq.id){e.preventDefault();e.dataTransfer.dropEffect='move';block.classList.add('drag-over');} });
  block.addEventListener('dragleave', ()=>block.classList.remove('drag-over'));
  block.addEventListener('drop', e => { e.preventDefault(); block.classList.remove('drag-over'); if(_drag.equipoId&&_drag.equipoId!==eq.id) handleSwap(eq.id); });

  const header = document.createElement('div');
  header.className = 'eq-header';
  header.innerHTML = `
    <div class="led-strip ${led}" style="height:${size*34}px;align-self:flex-start;"></div>
    <span class="screw">◎</span>
    <span class="u-num">${String(eq.uPos).padStart(2,'0')}</span>
    <div class="rack-led-divider"></div>
    <span class="eq-name">${esc(eq.id)}</span>
    <span class="eq-model">${esc(eq.modelo||'')}</span>
    <span class="port-badge ${portClass(eq.puertoConexion)}">${esc(eq.puertoConexion||'')}</span>
    <div style="flex:1;"></div>
    <span class="eq-svc">${esc(eq.servicio||'')}</span>
    <span class="pill ${pillClass(eq.estado)}">${esc((eq.estado||'').toUpperCase())}</span>
    <span class="screw">◎</span>`;
  block.appendChild(header);

  for (let i=1;i<size;i++) {
    const line = document.createElement('div');
    line.className = 'eq-line';
    line.innerHTML = `<span class="eq-vent">  ▐░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▌</span><div style="flex:1;"></div><span class="u-sec">${String(eq.uPos+i).padStart(2,'0')}  </span>`;
    block.appendChild(line);
  }
  block.onclick = e => { e.stopPropagation(); selectEquipo(eq); };
  block.addEventListener('contextmenu', e => { e.preventDefault(); showEquipoCtxMenu(e, eq); });
  return block;
}

// ── DRAG STATE ────────────────────────────────────────────
const _drag = { equipoId: null, fromUPos: null };

// Restaura state.locacion/site/rack desde los datos frescos del servidor usando IDs guardados
// Evita que loadFromServer rompa la seleccion actual del usuario
function _restoreState(locId, siteId, rackId) {
  // Restaurar locacion
  if (locId) {
    const loc = DB.getLocacionById(db, locId);
    if (loc) state.locacion = loc;
  }
  if (!isValidEntity(state.locacion)) {
    const locs = DB.getLocaciones(db);
    state.locacion = locs[0] || null;
  }

  // Restaurar site
  if (siteId && state.locacion) {
    const site = DB.getSiteById(db, siteId);
    if (site && site.locacionId === state.locacion.id) state.site = site;
    else {
      // El site existe pero puede haber cambiado de locacion — buscarlo directamente
      const siteAny = db.sites.find(s => s.id === siteId);
      if (siteAny) state.site = siteAny;
    }
  }
  if (!isValidEntity(state.site) && state.locacion) {
    const sites = DB.getSitesByLocacion(db, state.locacion.id);
    state.site = sites[0] || null;
  }

  // Restaurar rack
  if (rackId && state.site) {
    const rack = db.racks.find(r => r.id === rackId);
    if (rack) state.rack = rack;
  }
  if (!isValidEntity(state.rack) && state.site) {
    const racks = DB.getRacksBySite(db, state.site.id);
    state.rack = racks[0] || null;
  }

  // Limpiar equipo/conexion si ya no existen
  if (state.equipo && !db.equipos.find(e => e.id === state.equipo.id)) {
    state.equipo = null; state.conexion = null;
  }
  if (state.conexion && !db.conexiones.find(c => c.id === state.conexion.id && c.equipoId === state.equipo?.id)) {
    state.conexion = null;
  }
}

async function handleDrop(targetUPos) {
  if (!_drag.equipoId || !state.rack) return;
  const eq = DB.getEquipoById(db, _drag.equipoId);
  if (!eq) return;
  const existentes = DB.getEquiposByRack(db, state.rack.id);
  const err = DB.validateEquipo({...eq, uPos: targetUPos}, state.rack, existentes, eq.id);
  if (err) { showAlert(`No se puede mover: ${err}`); _drag.equipoId=null; _drag.fromUPos=null; return; }
  // Guardar referencias actuales antes del reload
  const savedLocId  = state.locacion?.id;
  const savedSiteId = state.site?.id;
  const savedRackId = state.rack?.id;
  try {
    await DB.updateEquipo(db, { id: eq.id, uPos: targetUPos });
    await DB.loadFromServer(db);
    _restoreState(savedLocId, savedSiteId, savedRackId);
    if (state.equipo?.id===eq.id) state.equipo = DB.getEquipoById(db, eq.id);
    refreshAll();
  } catch(e) {
    await DB.loadFromServer(db);
    _restoreState(savedLocId, savedSiteId, savedRackId);
    refreshAll();
    showAlert('Error al mover: '+(e?.message||e));
  }
  finally { _drag.equipoId=null; _drag.fromUPos=null; }
}

async function handleSwap(targetEqId) {
  if (!_drag.equipoId || !state.rack) return;
  const eqA = DB.getEquipoById(db, _drag.equipoId);
  const eqB = DB.getEquipoById(db, targetEqId);
  if (!eqA||!eqB) return;
  const posA=eqA.uPos, posB=eqB.uPos;
  const sizeA=Math.max(1,eqA.uSize||1), sizeB=Math.max(1,eqB.uSize||1);
  const U=state.rack.unidades;
  const endA=posB+sizeA-1, endB=posA+sizeB-1;
  if (posB<1||endA>U) { showAlert(`No cabe ${eqA.id} en U${posB} (termina en U${endA}, max ${U}).`); _drag.equipoId=null; _drag.fromUPos=null; return; }
  if (posA<1||endB>U) { showAlert(`No cabe ${eqB.id} en U${posA} (termina en U${endB}, max ${U}).`); _drag.equipoId=null; _drag.fromUPos=null; return; }
  const terceros = DB.getEquiposByRack(db,state.rack.id).filter(e=>e.id!==eqA.id&&e.id!==eqB.id);
  for (const other of terceros) {
    const oS=parseInt(other.uPos), oE=oS+Math.max(1,parseInt(other.uSize))-1;
    if (posB<=oE&&endA>=oS) { showAlert(`Colision de ${eqA.id} con ${other.id}.`); _drag.equipoId=null; _drag.fromUPos=null; return; }
    if (posA<=oE&&endB>=oS) { showAlert(`Colision de ${eqB.id} con ${other.id}.`); _drag.equipoId=null; _drag.fromUPos=null; return; }
  }
  // Guardar referencias antes del reload
  const savedLocId2  = state.locacion?.id;
  const savedSiteId2 = state.site?.id;
  const savedRackId2 = state.rack?.id;
  try {
    await DB.updateEquipo(db,{ id: eqA.id, uPos: posB });
    await DB.updateEquipo(db,{ id: eqB.id, uPos: posA });
    await DB.loadFromServer(db);
    _restoreState(savedLocId2, savedSiteId2, savedRackId2);
    if(state.equipo?.id===eqA.id) state.equipo=DB.getEquipoById(db,eqA.id);
    if(state.equipo?.id===eqB.id) state.equipo=DB.getEquipoById(db,eqB.id);
    refreshAll();
  } catch(e) {
    await DB.loadFromServer(db);
    _restoreState(savedLocId2, savedSiteId2, savedRackId2);
    refreshAll();
    showAlert('Error al intercambiar: '+(e?.message||e));
  }
  finally { _drag.equipoId=null; _drag.fromUPos=null; }
}

// ════════════════════════════════════════════════════════
// PANEL CENTRAL — Lista Equipos
// ════════════════════════════════════════════════════════

function renderEquipoList() {
  const titleEl = document.getElementById('equiposTitle');
  const el      = document.getElementById('equipoList');
  if (!state.rack) { titleEl.textContent='EQUIPOS'; el.innerHTML='<div class="empty-state">Selecciona un rack</div>'; return; }
  titleEl.textContent = `EQUIPOS · ${state.rack.id}`;
  const list = DB.getEquiposByRack(db, state.rack.id);
  if (!list.length) { el.innerHTML='<div class="empty-state">Sin equipos</div>'; return; }
  el.innerHTML='';
  list.forEach(eq => {
    const div=document.createElement('div');
    div.className='eq-list-item'+(state.equipo?.id===eq.id?' selected':'');
    div.innerHTML=`<span class="eq-u-badge">${eq.uPos!=null?'U'+eq.uPos:'?'}</span><span class="eq-list-name">${esc(eq.id)}</span><span class="eq-list-model">${esc(eq.modelo||'')}</span><span class="pill ${pillClass(eq.estado)}">${esc((eq.estado||'').toUpperCase())}</span>`;
    div.onclick=()=>selectEquipo(eq);
    div.addEventListener('contextmenu',e=>{e.preventDefault();showEquipoCtxMenu(e,eq);});
    el.appendChild(div);
  });
}

function selectEquipo(eq) {
  state.equipo=eq; state.conexion=null; refreshAll();
  if (typeof __canWrite === 'undefined' || __canWrite()) {
    document.getElementById('btnEditEquipo').style.display='';
    document.getElementById('btnNewConex').style.display='';
  }
}

// ════════════════════════════════════════════════════════
// PANEL DERECHO — Detalle Equipo
// ════════════════════════════════════════════════════════

function renderEquipoDetail() {
  const el = document.getElementById('equipoDetail');
  document.getElementById('btnEditEquipo').style.display = state.equipo?'':'none';
  if (!state.equipo) { el.innerHTML='<div class="placeholder"><div class="placeholder-icon">💾</div>Selecciona un equipo</div>'; return; }
  const eq  = state.equipo;
  const pos = eq.uPos!=null?`U${eq.uPos} (${eq.uSize}U)`:'—';
  el.innerHTML=`
    <div class="detail-box">
      <div class="detail-row"><span class="detail-key">NOMBRE</span>   <span class="detail-val">${esc(safeText(eq.id))}</span></div>
      <div class="detail-row"><span class="detail-key">MODELO</span>   <span class="detail-val">${esc(safeText(eq.modelo))}</span></div>
      <div class="detail-row"><span class="detail-key">N° SERIE</span> <span class="detail-val">${esc(safeText(eq.numeroSerie))}</span></div>
      <div class="detail-row"><span class="detail-key">PUERTO</span>   <span class="detail-val"><span class="port-badge ${portClass(eq.puertoConexion)}">${esc(safeText(eq.puertoConexion))}</span></span></div>
      <div class="detail-row"><span class="detail-key">SERVICIO</span> <span class="detail-val">${esc(safeText(eq.servicio))}</span></div>
      <div class="detail-row"><span class="detail-key">ESTADO</span>   <span class="detail-val"><span class="pill ${pillClass(eq.estado)}">${esc((eq.estado||'').toUpperCase())}</span></span></div>
      <div class="detail-row"><span class="detail-key">POSICION</span> <span class="detail-val">${esc(pos)}</span></div>
    </div>
    ${(typeof __canWrite==='undefined'||__canWrite()) ? '<div class="action-row"><button class="btn sm" onclick="openEquipoModal(window._selectedEquipo)">✏ Editar</button><button class="btn sm danger" onclick="confirmDeleteEquipo()">🗑 Eliminar</button></div>' : ''}
    `;
  window._selectedEquipo = eq;
}

// ════════════════════════════════════════════════════════
// PANEL DERECHO — Conexiones
// ════════════════════════════════════════════════════════

function renderConexList() {
  const titleEl=document.getElementById('conexTitle');
  const el=document.getElementById('conexList');
  if (!state.equipo) { titleEl.textContent='CONEXIONES'; el.innerHTML='<div class="empty-state">Selecciona un equipo</div>'; return; }
  titleEl.textContent=`CONEXIONES · ${state.equipo.id}`;
  const list=DB.getConexionesByEquipo(db,state.equipo.id);
  if (!list.length) { el.innerHTML='<div class="empty-state">Sin conexiones</div>'; return; }
  el.innerHTML='';
  list.forEach(conn=>{
    const div=document.createElement('div');
    div.className='conn-item'+(state.conexion?.id===conn.id?' selected':'');
    div.innerHTML=`<span class="led-dot ${ledDotClass(conn.estado)}">●</span><span class="port-badge ${portClass(conn.tipo)}">${esc(conn.tipo||'????')}</span><span class="conn-id">${esc(conn.id)}</span><span class="conn-arrow">────►</span><span class="conn-dest">${esc(conn.destino||'—')}</span>`;
    div.onclick=()=>selectConexion(conn);
    div.addEventListener('contextmenu',e=>{e.preventDefault();showConnCtxMenu(e,conn);});
    el.appendChild(div);
  });
}

function selectConexion(conn) { state.conexion=conn; renderConexList(); renderConexDetail(); }

function renderConexDetail() {
  const el=document.getElementById('conexDetail');
  if (!state.conexion) { el.innerHTML='<div class="placeholder"><div class="placeholder-icon">🔌</div>Selecciona una conexión</div>'; return; }
  const c=state.conexion;
  el.innerHTML=`
    <div class="detail-box">
      <div class="detail-row"><span class="detail-key">ID / PUERTO</span><span class="detail-val">${esc(safeText(c.id))}</span></div>
      <div class="detail-row"><span class="detail-key">TIPO</span>       <span class="detail-val"><span class="port-badge ${portClass(c.tipo)}">${esc(safeText(c.tipo))}</span></span></div>
      <div class="detail-row"><span class="detail-key">ESTADO</span>     <span class="detail-val"><span class="pill ${pillClass(c.estado)}">${esc((c.estado||'').toUpperCase())}</span></span></div>
      <div class="detail-row"><span class="detail-key">DESTINO</span>    <span class="detail-val">${esc(safeText(c.destino))}</span></div>
    </div>
    ${(typeof __canWrite==='undefined'||__canWrite()) ? '<div class="action-row"><button class="btn sm" onclick="openConexModal(window._selectedConex)">✏ Editar</button><button class="btn sm danger" onclick="confirmDeleteConex()">🗑 Eliminar</button></div>' : ''}
    `;
  window._selectedConex = c;
}

// ════════════════════════════════════════════════════════
// MODAL ENGINE
// ════════════════════════════════════════════════════════

function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML    = bodyHTML;
  document.getElementById('modalFooter').innerHTML  = footerHTML;
  document.getElementById('overlay').classList.add('active');
  // focus first input
  setTimeout(()=>{ const f=document.querySelector('#modal input:not([disabled]),#modal select'); if(f) f.focus(); },50);
}
function closeModal() { document.getElementById('overlay').classList.remove('active'); }
window.closeModal = closeModal;
window._modalAPI  = { openModal, closeModal };

document.getElementById('overlay').addEventListener('click', e => { if(e.target===document.getElementById('overlay')) closeModal(); });

// ════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  const overlay = document.getElementById('overlay');
  const isOpen  = overlay.classList.contains('active');

  // ESC — close modal
  if (e.key === 'Escape') { if(isOpen) closeModal(); return; }

  // ENTER — click primary button in modal
  if (e.key === 'Enter' && isOpen) {
    // Don't intercept enter in textarea
    if (e.target.tagName === 'TEXTAREA') return;
    // Don't intercept enter in select (browser handles it)
    const primary = document.querySelector('#modalFooter .btn.primary');
    if (primary && !primary.disabled) { e.preventDefault(); primary.click(); }
    return;
  }

  // TAB is native — browser handles focus cycling, no override needed
});

// ════════════════════════════════════════════════════════
// ALERT / CONFIRM
// ════════════════════════════════════════════════════════

function showAlert(msg) {
  openModal('Aviso',
    `<p style="font-family:var(--mono);font-size:13px;line-height:1.7;">${esc(msg)}</p>`,
    `<button class="btn primary" onclick="closeModal()">OK</button>`
  );
}
window.showAlert = showAlert;

function showConfirm(msg, onOk) {
  openModal('Confirmar',
    `<p style="font-family:var(--mono);font-size:13px;line-height:1.7;">${esc(msg)}</p>`,
    `<button class="btn" onclick="closeModal()">✕ Cancelar</button>
     <button class="btn danger" id="btnConfirmOk">✔ Confirmar</button>`
  );
  setTimeout(()=>{ const b=document.getElementById('btnConfirmOk'); if(b) b.onclick=async()=>{closeModal();await onOk();}; },0);
}
window.showConfirm = showConfirm;

function showDiagnosticToast() {
  if (document.getElementById('diagToast')) return;
  const t=document.createElement('div');
  t.id='diagToast';
  t.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid #ff4d4d;border-radius:8px;padding:12px 20px;font-family:var(--mono);font-size:12px;color:#ff9966;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.6);display:flex;gap:12px;align-items:center;max-width:480px;';
  t.innerHTML=`<span>No se pudo conectar a MySQL. Verifica que XAMPP este activo y la BD <b>dcm</b> exista.</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ff9966;cursor:pointer;font-size:16px;">✕</button>`;
  document.body.appendChild(t);
  setTimeout(()=>t?.remove(),8000);
}
window.showDiagnosticToast = showDiagnosticToast;

// ════════════════════════════════════════════════════════
// CONTEXT MENUS
// ════════════════════════════════════════════════════════

function closeCtxMenu() { document.querySelectorAll('.ctx-menu').forEach(m=>m.remove()); }

function buildCtxMenu(x, y, items) {
  closeCtxMenu();
  const menu=document.createElement('div');
  menu.className='ctx-menu';
  menu.style.left=x+'px'; menu.style.top=y+'px';
  items.forEach(item=>{
    if (item==='sep') { const s=document.createElement('div'); s.className='ctx-sep'; menu.appendChild(s); }
    else { const el=document.createElement('div'); el.className='ctx-item'+(item.danger?' danger':''); el.textContent=item.label; el.onclick=()=>{closeCtxMenu();item.action();}; menu.appendChild(el); }
  });
  document.body.appendChild(menu);
  const rect=menu.getBoundingClientRect();
  if (rect.right>window.innerWidth)  menu.style.left=(x-rect.width)+'px';
  if (rect.bottom>window.innerHeight) menu.style.top=(y-rect.height)+'px';
  setTimeout(()=>document.addEventListener('click',closeCtxMenu,{once:true}),0);
}

function showRackCtxMenu(e,rack) {
  buildCtxMenu(e.clientX,e.clientY,[
    ...(typeof __canWrite==='undefined'||__canWrite() ? [
      {label:'✏ Editar rack',   action:()=>{selectRack(rack);openRackModal(rack);}},
      {label:'+ Nuevo equipo',  action:()=>{selectRack(rack);openEquipoModal(null);}}
    ] : []),
    'sep',
    {label:'🗑 Eliminar rack', danger:true, action:()=>showConfirm(`¿Eliminar rack ${rack.id}?`,async()=>{await DB.deleteRack(db,rack.id);if(state.rack?.id===rack.id){state.rack=null;state.equipo=null;state.conexion=null;}syncStateSelection();refreshAll();})},
  ]);
}
function showEquipoCtxMenu(e,eq) {
  buildCtxMenu(e.clientX,e.clientY,[
    ...(typeof __canWrite==='undefined'||__canWrite() ? [
      {label:'✏ Editar equipo',   action:()=>{selectEquipo(eq);openEquipoModal(eq);}},
      {label:'+ Nueva conexion',  action:()=>{selectEquipo(eq);openConexModal(null);}}
    ] : []),
    'sep',
    {label:'🗑 Eliminar equipo', danger:true, action:()=>showConfirm(`¿Eliminar ${eq.id}?`,async()=>{await DB.deleteEquipo(db,eq.id);if(state.equipo?.id===eq.id){state.equipo=null;state.conexion=null;}syncStateSelection();refreshAll();})},
  ]);
}
function showConnCtxMenu(e,conn) {
  buildCtxMenu(e.clientX,e.clientY,[
    ...(typeof __canWrite==='undefined'||__canWrite() ? [
      {label:'✏ Editar conexion', action:()=>{selectConexion(conn);openConexModal(conn);}}
    ] : []),
    'sep',
    {label:'🗑 Eliminar conexion', danger:true, action:()=>showConfirm(`¿Eliminar conexion ${conn.id}?`,async()=>{await DB.deleteConexion(db,conn.equipoId,conn.id);if(state.conexion?.id===conn.id)state.conexion=null;refreshAll();})},
  ]);
}

window.confirmDeleteEquipo = function() {
  if (!state.equipo) return;
  const eq=state.equipo;
  showConfirm(`¿Eliminar equipo ${eq.id}?`,async()=>{await DB.deleteEquipo(db,eq.id);state.equipo=null;state.conexion=null;syncStateSelection();refreshAll();});
};
window.confirmDeleteConex = function() {
  if (!state.conexion) return;
  const c=state.conexion;
  showConfirm(`¿Eliminar conexion ${c.id}?`,async()=>{await DB.deleteConexion(db,c.equipoId,c.id);state.conexion=null;refreshAll();});
};

// ════════════════════════════════════════════════════════
// MODALES CRUD — LOCACION
// ════════════════════════════════════════════════════════

function openLocacionModal(loc) {
  const isEdit = !!loc;
  const body = `
    <div class="form-grid">
      <label class="form-label">Nombre:</label>
      <input type="text" id="mLocNombre" value="${isEdit?esc(loc.nombre):''}" placeholder="Nombre de la locación">
    </div>
    <div id="mLocErr" class="error-text"></div>`;
  const footer = `
    <button class="btn" onclick="closeModal()">✕ Cancelar</button>
    <button class="btn primary" onclick="saveLocacion(${isEdit},'${isEdit?esc(loc.id):''}')">${isEdit?'💾 Guardar':'＋ Crear'}</button>`;
  openModal(isEdit?`EDITAR LOCACION · ${loc.nombre}`:'NUEVA LOCACION', body, footer);
}

window.saveLocacion = async function(isEdit, id) {
  const nombre = document.getElementById('mLocNombre').value.trim();
  const errEl  = document.getElementById('mLocErr');
  if (!nombre) { errEl.textContent='El nombre es obligatorio.'; return; }
  try {
    if (isEdit) { await DB.updateLocacion(db,{id,nombre}); if(state.locacion?.id===id) state.locacion.nombre=nombre; }
    else        { const c=await DB.insertLocacion(db,{nombre}); state.locacion=c; state.site=null; state.rack=null; state.equipo=null; state.conexion=null; }
    closeModal(); syncStateSelection(); refreshAll();
  } catch(e) { errEl.textContent='Error: '+(e?.message||e); }
};

// ════════════════════════════════════════════════════════
// MODALES CRUD — SITE
// ════════════════════════════════════════════════════════

function openSiteModal(site) {
  const isEdit = !!site;
  const body = `
    <div class="form-grid">
      <label class="form-label">Nombre:</label>
      <input type="text" id="mSiteNombre" value="${isEdit?esc(site.nombre):''}" placeholder="Nombre del site (ej: Site A)">
    </div>
    <div id="mSiteErr" class="error-text"></div>`;
  const footer = `
    <button class="btn" onclick="closeModal()">✕ Cancelar</button>
    <button class="btn primary" onclick="saveSite(${isEdit},'${isEdit?esc(site.id):''}')">${isEdit?'💾 Guardar':'＋ Crear'}</button>`;
  openModal(isEdit?`EDITAR SITE · ${site.nombre}`:`NUEVO SITE · ${state.locacion?.nombre||''}`, body, footer);
}
window.openSiteModal = openSiteModal;

window.saveSite = async function(isEdit, id) {
  const nombre = document.getElementById('mSiteNombre').value.trim();
  const errEl  = document.getElementById('mSiteErr');
  if (!nombre) { errEl.textContent='El nombre es obligatorio.'; return; }
  if (!state.locacion) { errEl.textContent='No hay locacion seleccionada.'; return; }
  try {
    if (isEdit) { await DB.updateSite(db,{id,nombre}); }
    else        { const c=await DB.insertSite(db,{locacionId:state.locacion.id,nombre}); state.site=c; state.rack=null; state.equipo=null; state.conexion=null; }
    closeModal(); syncStateSelection(); refreshAll();
  } catch(e) { errEl.textContent='Error: '+(e?.message||e); }
};

// ════════════════════════════════════════════════════════
// MODALES CRUD — RACK
// ════════════════════════════════════════════════════════

function openRackModal(rack) {
  const isEdit = !!rack;
  const r = rack||{nombre:'',ubicacion:'',unidades:42};
  const body = `
    <p class="hint" style="margin-bottom:10px;">Site: <b>${state.site?.nombre||'—'}</b> · Locacion: <b>${state.locacion?.nombre||'—'}</b></p>
    <div class="form-grid">
      <label class="form-label">ID:</label>
      <input type="text" id="mRackId" value="${isEdit?esc(r.id):'(Auto)'}" readonly disabled style="opacity:.6">
      <label class="form-label">Nombre:</label>
      <input type="text" id="mRackNombre" value="${esc(r.nombre)}" placeholder="nombre del rack">
      <label class="form-label">Ubicacion:</label>
      <input type="text" id="mRackUbic" value="${esc(r.ubicacion)}" placeholder="ej: Sala A, Fila 1">
      <label class="form-label">Unidades:</label>
      <input type="number" id="mRackUnidades" value="${r.unidades}" min="1" max="60" style="max-width:80px;">
    </div>
    <div id="mRackErr" class="error-text"></div>`;
  const footer = `
    <button class="btn" onclick="closeModal()">✕ Cancelar</button>
    <button class="btn primary" onclick="saveRack(${isEdit})">${isEdit?'💾 Guardar':'＋ Crear'}</button>`;
  openModal(isEdit?`EDITAR RACK · ${r.id}`:`NUEVO RACK · ${state.site?.nombre||''}`, body, footer);
}
window.openRackModal = openRackModal;

window.saveRack = async function(isEdit) {
  const nombre    = document.getElementById('mRackNombre').value.trim();
  const ubicacion = document.getElementById('mRackUbic').value.trim();
  const unidades  = parseInt(document.getElementById('mRackUnidades').value)||42;
  const errEl     = document.getElementById('mRackErr');
  if (!state.site) { errEl.textContent='No hay site seleccionado.'; return; }
  try {
    if (isEdit) {
      const id=state.rack?.id; if(!id){errEl.textContent='Sin id de rack.';return;}
      await DB.updateRack(db,{id,siteId:state.site.id,nombre,ubicacion,unidades});
      await DB.loadFromServer(db);
      state.rack=db.racks.find(r=>r.id===id)||null;
    } else {
      const created=await DB.insertRack(db,{siteId:state.site.id,nombre,ubicacion,unidades});
      if(isValidEntity(created)) state.rack=created;
      else { await DB.loadFromServer(db); const rs=DB.getRacksBySite(db,state.site.id); state.rack=rs.find(r=>r.nombre===nombre&&r.ubicacion===ubicacion)||rs[rs.length-1]||null; }
      state.equipo=null; state.conexion=null;
    }
    closeModal(); syncStateSelection(); refreshAll();
  } catch(e) { errEl.textContent='Error: '+(e?.message||e); }
};

// ════════════════════════════════════════════════════════
// MODALES CRUD — EQUIPO
// ════════════════════════════════════════════════════════

function openEquipoModal(eq) {
  if (!state.rack||!isValidEntity(state.rack)) { showAlert('Primero selecciona un rack valido.'); return; }
  const isEdit=!!eq;
  const e=eq||{modelo:'',numeroSerie:'',puertoConexion:'',servicio:'',estado:'Activo',uPos:1,uSize:1};
  const body=`
    <p class="hint" style="margin-bottom:10px;">Rack: <b>${state.rack.id}</b> · Site: <b>${state.site?.nombre||'—'}</b></p>
    <div class="form-grid">
      <label class="form-label">ID:</label>
      <input type="text" id="mEqId" value="${isEdit?esc(e.id):'(Auto)'}" readonly disabled style="opacity:.6">
      <label class="form-label">Modelo:</label>
      <input type="text" id="mEqModelo" value="${esc(e.modelo||'')}" placeholder="ej: Dell PowerEdge R740">
      <label class="form-label">N Serie:</label>
      <input type="text" id="mEqSerie" value="${esc(e.numeroSerie||'')}" placeholder="ej: SN-00123">
      <label class="form-label">Puerto:</label>
      <input type="text" id="mEqPuerto" value="${esc(e.puertoConexion||'')}" placeholder="ej: Gi1/0/1, eth0">
      <label class="form-label">Servicio:</label>
      <input type="text" id="mEqServicio" value="${esc(e.servicio||'')}" placeholder="ej: Web, DB, DNS">
      <label class="form-label">Estado:</label>
      <select id="mEqEstado">
        <option ${e.estado==='Activo'?'selected':''}>Activo</option>
        <option ${e.estado==='Inactivo'?'selected':''}>Inactivo</option>
        <option ${e.estado==='Error'?'selected':''}>Error</option>
      </select>
      <label class="form-label">uPos:</label>
      <input type="number" id="mEqUPos" value="${e.uPos||1}" min="1" max="${state.rack.unidades}" style="max-width:80px;">
      <label class="form-label">uSize:</label>
      <input type="number" id="mEqUSize" value="${e.uSize||1}" min="1" max="20" style="max-width:80px;">
    </div>
    <div id="mEqErr" class="error-text"></div>`;
  const footer=`
    <button class="btn" onclick="closeModal()">✕ Cancelar</button>
    <button class="btn primary" onclick="saveEquipo(${isEdit},'${isEdit?esc(e.id):''}')">${isEdit?'💾 Guardar':'＋ Crear'}</button>`;
  openModal(isEdit?`EDITAR EQUIPO · ${e.id}`:`NUEVO EQUIPO · Rack ${state.rack.id}`, body, footer);
}
window.openEquipoModal = openEquipoModal;

window.saveEquipo = async function(isEdit, oldId) {
  const rack=state.rack;
  if(!rack||!isValidEntity(rack)){showAlert('Rack invalido.');return;}
  const errEl=document.getElementById('mEqErr');
  const eq={rackId:rack.id,modelo:document.getElementById('mEqModelo').value.trim(),numeroSerie:document.getElementById('mEqSerie').value.trim(),puertoConexion:document.getElementById('mEqPuerto').value.trim(),servicio:document.getElementById('mEqServicio').value.trim(),estado:document.getElementById('mEqEstado').value,uPos:parseInt(document.getElementById('mEqUPos').value),uSize:parseInt(document.getElementById('mEqUSize').value)};
  const existentes=DB.getEquiposByRack(db,rack.id);
  const err=DB.validateEquipo(eq,rack,existentes,isEdit?oldId:null);
  if(err){errEl.textContent='⚠ '+err;return;}
  try {
    if(isEdit){await DB.updateEquipo(db,{id:oldId,...eq});await DB.loadFromServer(db);state.equipo=db.equipos.find(e=>e.id===oldId)||null;}
    else{const created=await DB.insertEquipo(db,eq);if(isValidEntity(created))state.equipo=created;else{await DB.loadFromServer(db);const list=db.equipos.filter(e=>e.rackId===rack.id);state.equipo=list.find(e=>e.uPos===eq.uPos&&e.modelo===eq.modelo&&e.numeroSerie===eq.numeroSerie)||list[list.length-1]||null;}}
    closeModal(); syncStateSelection(); refreshAll();
  } catch(e){errEl.textContent='Error: '+(e?.message||e);}
};

function openInstallDialog(uPos) {
  if(!state.rack||!isValidEntity(state.rack))return;
  const fakeEq={modelo:'',numeroSerie:'',puertoConexion:'',servicio:'',estado:'Activo',uPos,uSize:1};
  if(!state.rack||!isValidEntity(state.rack)){showAlert('Primero selecciona un rack valido.');return;}
  const body=`
    <p class="hint" style="margin-bottom:10px;">Rack: <b>${state.rack.id}</b> · Slot U${uPos}</p>
    <div class="form-grid">
      <label class="form-label">ID:</label>
      <input type="text" id="mEqId" value="(Auto)" readonly disabled style="opacity:.6">
      <label class="form-label">Modelo:</label>
      <input type="text" id="mEqModelo" value="" placeholder="ej: Dell PowerEdge R740">
      <label class="form-label">N Serie:</label>
      <input type="text" id="mEqSerie" value="" placeholder="ej: SN-00123">
      <label class="form-label">Puerto:</label>
      <input type="text" id="mEqPuerto" value="" placeholder="ej: Gi1/0/1, eth0">
      <label class="form-label">Servicio:</label>
      <input type="text" id="mEqServicio" value="" placeholder="ej: Web, DB, DNS">
      <label class="form-label">Estado:</label>
      <select id="mEqEstado"><option selected>Activo</option><option>Inactivo</option><option>Error</option></select>
      <label class="form-label">uPos:</label>
      <input type="number" id="mEqUPos" value="${uPos}" min="1" max="${state.rack.unidades}" style="max-width:80px;">
      <label class="form-label">uSize:</label>
      <input type="number" id="mEqUSize" value="1" min="1" max="20" style="max-width:80px;">
    </div>
    <div id="mEqErr" class="error-text"></div>`;
  const footer=`<button class="btn" onclick="closeModal()">✕ Cancelar</button><button class="btn primary" onclick="saveEquipo(false,'')">＋ Instalar</button>`;
  openModal(`INSTALAR EN U${uPos} · Rack ${state.rack.id}`, body, footer);
}

// ════════════════════════════════════════════════════════
// MODALES CRUD — CONEXION
// ════════════════════════════════════════════════════════

function openConexModal(conn) {
  if(!state.equipo){showAlert('Primero selecciona un equipo.');return;}
  const isEdit=!!conn;
  const c=conn||{id:'',equipoId:state.equipo.id,tipo:'RJ45',estado:'Activo',destino:''};
  const tipoOpts=['RJ45','SFP+','SFP','Serial','Console','Fiber','USB','Other'];
  const body=`
    <p class="hint" style="margin-bottom:10px;">Equipo: <b>${esc(state.equipo.id)}</b></p>
    <div class="form-grid">
      <label class="form-label">ID / Puerto:</label>
      <input type="text" id="mCxId" value="${esc(c.id)}" placeholder="ej: eth0, Gi1/0/1" ${isEdit?'readonly disabled style="opacity:.6"':''}>
      <label class="form-label">Tipo:</label>
      <select id="mCxTipo">${tipoOpts.map(t=>`<option ${c.tipo===t?'selected':''}>${t}</option>`).join('')}</select>
      <label class="form-label">Estado:</label>
      <select id="mCxEstado">
        <option ${c.estado==='Activo'?'selected':''}>Activo</option>
        <option ${c.estado==='Inactivo'?'selected':''}>Inactivo</option>
        <option ${c.estado==='Error'?'selected':''}>Error</option>
      </select>
      <label class="form-label">Destino:</label>
      <input type="text" id="mCxDestino" value="${esc(c.destino||'')}" placeholder="ej: SW-CORE-01:Gi1/0/2">
    </div>
    <div id="mCxErr" class="error-text"></div>`;
  const footer=`<button class="btn" onclick="closeModal()">✕ Cancelar</button><button class="btn primary" onclick="saveConexion(${isEdit},'${esc(c.id)}')">${isEdit?'💾 Guardar':'＋ Crear'}</button>`;
  openModal(isEdit?`EDITAR CONEXION · ${c.id}`:`NUEVA CONEXION · ${state.equipo.id}`, body, footer);
}
window.openConexModal = openConexModal;

window.saveConexion = async function(isEdit, oldId) {
  if(!state.equipo)return;
  const errEl=document.getElementById('mCxErr');
  const id      = isEdit ? oldId : document.getElementById('mCxId').value.trim();
  const tipo    = document.getElementById('mCxTipo').value;
  const estado  = document.getElementById('mCxEstado').value;
  const destino = document.getElementById('mCxDestino').value.trim();
  if(!id){errEl.textContent='El ID/Puerto es obligatorio.';return;}
  const conn={id,equipoId:state.equipo.id,tipo,estado,destino};
  try {
    if(isEdit){await DB.updateConexion(db,conn);state.conexion=db.conexiones.find(c=>c.id===id&&c.equipoId===state.equipo.id)||null;}
    else{const existe=db.conexiones.find(c=>c.id===id&&c.equipoId===state.equipo.id);if(existe){errEl.textContent=`Ya existe la conexion '${id}'.`;return;}await DB.insertConexion(db,conn);state.conexion=db.conexiones.find(c=>c.id===id&&c.equipoId===state.equipo.id)||conn;}
    closeModal(); refreshAll();
  } catch(e){errEl.textContent='Error: '+(e?.message||e);}
};

// ════════════════════════════════════════════════════════
// BOTONES PRINCIPALES
// ════════════════════════════════════════════════════════

document.getElementById('btnNewRack').onclick    = () => openRackModal(null);
document.getElementById('btnEditRack').onclick   = () => { if(state.rack) openRackModal(state.rack); };
document.getElementById('btnNewEquipo').onclick  = () => openEquipoModal(null);
document.getElementById('btnEditEquipo').onclick = () => openEquipoModal(state.equipo);
document.getElementById('btnImport').onclick     = () => openImportModal(db, ()=>{ syncStateSelection(); refreshAll(); });

// ════════════════════════════════════════════════════════
// SYNC STATUS
// ════════════════════════════════════════════════════════

function setSyncStatus(status) {
  const el=document.getElementById('syncStatus');
  if(!el)return;
  const map={loading:{text:'⟳ Conectando…',cls:'sync-loading'},ok:{text:'● MySQL',cls:'sync-ok'},offline:{text:'◌ Sin conexion',cls:'sync-offline'},error:{text:'✕ Sin MySQL',cls:'sync-error'}};
  const s=map[status]||map.offline;
  el.textContent=s.text; el.className='sync-badge '+s.cls;
}

// ════════════════════════════════════════════════════════
// REFRESH GLOBAL
// ════════════════════════════════════════════════════════

function refreshAll() {
  buildLocacionDropdown();
  buildSiteSelector();
  renderRackList();
  renderRackView();
  renderEquipoList();
  renderEquipoDetail();
  renderConexList();
  renderConexDetail();
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════

(async function init() {
  try { const saved=localStorage.getItem('dcm_theme'); if(saved==='light') state.darkMode=false; } catch(_){}
  applyTheme();
  initGlobalSearch();
  buildLocacionDropdown();
  buildSiteSelector();
  syncStateSelection();
  refreshAll();
  setSyncStatus('loading');
  const ok = await DB.loadFromServer(db);
  if (ok) {
    setSyncStatus('ok');
    // Restaurar locacion y site guardados en localStorage
    const saved = loadSessionState();
    if (saved.locacionId) {
      const loc = DB.getLocacionById(db, saved.locacionId);
      if (loc) { state.locacion = loc; }
    }
    if (saved.siteId && state.locacion) {
      const site = db.sites.find(s => s.id === saved.siteId && s.locacionId === state.locacion.id);
      if (site) { state.site = site; }
    }
    if (saved.rackId && state.site) {
      const rack = db.racks.find(r => r.id === saved.rackId);
      if (rack) { state.rack = rack; }
    }
    if (saved.equipoId && state.rack) {
      const equipo = db.equipos.find(e => e.id === saved.equipoId && e.rackId === state.rack.id);
      if (equipo) { state.equipo = equipo; }
    }
    syncStateSelection();
    refreshAll();
  } else {
    setSyncStatus(navigator.onLine?'error':'offline');
    showDiagnosticToast && showDiagnosticToast();
  }
  const badge=document.getElementById('syncStatus');
  if(badge) badge.addEventListener('click',async()=>{setSyncStatus('loading');const r=await DB.loadFromServer(db);setSyncStatus(r?'ok':(navigator.onLine?'error':'offline'));syncStateSelection();refreshAll();});
})();

// ════════════════════════════════════════════════════════
// AUTH — Sesion, roles y botones (no modifica logica existente)
// ════════════════════════════════════════════════════════

// s con permiso de escritura
function __canWrite() {
  const u = window.__INITIAL_USER__;
  return u && ['superadmin','crud'].includes(u.rol);
}

// Logout
window.__doLogout = async function() {
  try {
    await fetch('api/auth.php?action=logout', { method: 'POST', credentials: 'same-origin' });
  } catch(_) {}
  window.location.href = 'login.html';
};

// Aplicar UI segun rol — se llama una vez al cargar
function __applyAuthUI() {
  const u = window.__INITIAL_USER__;
  if (!u) { window.location.href = 'login.html'; return; }

  // Info del usuario en topbar
  const infoEl = document.getElementById('authUserInfo');
  if (infoEl) {
    const rolLabel = { superadmin:'SUPERADMIN', crud:'CRUD', lector:'LECTOR' }[u.rol] || u.rol;
    infoEl.textContent = (u.nombre || u.username) + ' · ' + rolLabel;
  }

  // Boton usuarios: solo para superadmin
  const btnUsers = document.getElementById('btnManageUsers');
  if (btnUsers) btnUsers.style.display = (u.rol === 'superadmin') ? '' : 'none';

  // Ocultar controles de escritura para lector y crud (en locaciones solo superadmin)
  if (!__canWrite()) {
    ['btnNewRack','btnEditRack','btnNewEquipo','btnEditEquipo','btnNewConex','btnImport'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __applyAuthUI);
} else {
  // DOM ya listo — pero esperar al init de app.js que puede reconstruir botones
  setTimeout(__applyAuthUI, 0);
}
