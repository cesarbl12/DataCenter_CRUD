// db.js — Online-only. locacion -> site -> rack -> equipo -> conexion

function apiUrl(path) {
  return new URL(`api/${path}`, window.location.href).toString();
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name   = 'ApiError';
    this.status = status;
    this.data   = data;
  }
}

async function jfetch(url, opts = {}) {
  const res  = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false)
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Init / Load
// ─────────────────────────────────────────────────────────────

export function loadDB() {
  return { locaciones: [], sites: [], racks: [], equipos: [], conexiones: [] };
}

export function saveDB(_db) {}
export function kickManualSync() {}

export async function loadFromServer(db) {
  try {
    const ping = await jfetch(apiUrl('ping.php'), { method: 'GET' });
    if (!ping.ok) return false;

    const [lData, sData, rData, eData, cData] = await Promise.all([
      jfetch(apiUrl('locaciones.php'), { method: 'GET' }),
      jfetch(apiUrl('sites.php'),      { method: 'GET' }),
      jfetch(apiUrl('racks.php'),      { method: 'GET' }),
      jfetch(apiUrl('equipos.php'),    { method: 'GET' }),
      jfetch(apiUrl('conexiones.php'), { method: 'GET' }),
    ]);

    db.locaciones = lData.locaciones || [];
    db.sites      = sData.sites      || [];
    db.racks      = rData.racks      || [];
    db.equipos    = eData.equipos    || [];
    db.conexiones = cData.conexiones || [];

    // Diagnóstico — abrir DevTools > Console para ver estos logs
    console.debug('[DB] locaciones:', JSON.stringify(db.locaciones));
    console.debug('[DB] sites:', JSON.stringify(db.sites.map(s => ({ id: s.id, locacionId: s.locacionId }))));
    console.debug('[DB] racks:', JSON.stringify(db.racks.map(r => ({ id: r.id, siteId: r.siteId }))));

    // Sanidad: si hay racks con siteId que no existe en sites, crear un site huerfano automaticamente
    // Esto protege contra migraciones parciales o datos inconsistentes
    const siteIds = new Set(db.sites.map(s => s.id));
    const locIds  = new Set(db.locaciones.map(l => l.id));
    const orphanSiteIds = [...new Set(db.racks.map(r => r.siteId).filter(sid => sid && !siteIds.has(sid)))];
    if (orphanSiteIds.length) {
      console.warn('[DB] Racks con siteId huerfano (sin site en BD):', orphanSiteIds);
      // Crear una locacion y sites virtuales para no perder racks
      if (!db.locaciones.find(l => l.id === '__orphan__')) {
        db.locaciones.push({ id: '__orphan__', nombre: 'Sin Locacion (migrar)' });
      }
      orphanSiteIds.forEach(sid => {
        if (!db.sites.find(s => s.id === sid)) {
          db.sites.push({ id: sid, locacionId: '__orphan__', nombre: sid });
        }
      });
    }

    return true;
  } catch (e) {
    console.error('[DB] loadFromServer:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────

export function getLocaciones(db)           { return db.locaciones || []; }
export function getLocacionById(db, id)     { return (db.locaciones || []).find(l => l.id === id) || null; }

export function getSitesByLocacion(db, locId) { return (db.sites || []).filter(s => s.locacionId === locId); }
export function getSiteById(db, id)           { return (db.sites || []).find(s => s.id === id) || null; }

export function getRacksBySite(db, siteId)  { return (db.racks || []).filter(r => r.siteId === siteId); }
export function getRackById(db, id)         { return (db.racks || []).find(r => r.id === id) || null; }

export function getEquiposByRack(db, rackId) {
  return (db.equipos || []).filter(e => e.rackId === rackId)
    .sort((a, b) => (a.uPos ?? 9999) - (b.uPos ?? 9999));
}
export function getEquipoById(db, id) { return (db.equipos || []).find(e => e.id === id) || null; }

export function getConexionesByEquipo(db, equipoId) {
  return (db.conexiones || []).filter(c => c.equipoId === equipoId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ─────────────────────────────────────────────────────────────
// CRUD LOCACIONES
// ─────────────────────────────────────────────────────────────

export async function insertLocacion(db, loc) {
  const payload = { nombre: loc.nombre };
  const data    = await jfetch(apiUrl('locaciones.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.locacion || { nombre: loc.nombre, id: data.id };
  db.locaciones.push(created);
  return created;
}

export async function updateLocacion(db, loc) {
  const { id, ...updates } = loc;
  await jfetch(apiUrl(`locaciones.php?id=${encodeURIComponent(id)}`), { method: 'PUT', body: JSON.stringify(updates) });
  const idx = db.locaciones.findIndex(l => l.id === id);
  if (idx >= 0) db.locaciones[idx] = { ...db.locaciones[idx], ...updates };
  return true;
}

export async function deleteLocacion(db, locId) {
  await jfetch(apiUrl(`locaciones.php?id=${encodeURIComponent(locId)}`), { method: 'DELETE' });
  // cascade local
  const siteIds = db.sites.filter(s => s.locacionId === locId).map(s => s.id);
  const rackIds = db.racks.filter(r => siteIds.includes(r.siteId)).map(r => r.id);
  const eqIds   = db.equipos.filter(e => rackIds.includes(e.rackId)).map(e => e.id);
  db.conexiones = db.conexiones.filter(c => !eqIds.includes(c.equipoId));
  db.equipos    = db.equipos.filter(e => !rackIds.includes(e.rackId));
  db.racks      = db.racks.filter(r => !siteIds.includes(r.siteId));
  db.sites      = db.sites.filter(s => s.locacionId !== locId);
  db.locaciones = db.locaciones.filter(l => l.id !== locId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CRUD SITES
// ─────────────────────────────────────────────────────────────

export async function insertSite(db, site) {
  const payload = { locacionId: site.locacionId, nombre: site.nombre };
  const data    = await jfetch(apiUrl('sites.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.site || { ...payload, id: data.id };
  db.sites.push(created);
  return created;
}

export async function updateSite(db, site) {
  const { id, ...updates } = site;
  await jfetch(apiUrl(`sites.php?id=${encodeURIComponent(id)}`), { method: 'PUT', body: JSON.stringify(updates) });
  const idx = db.sites.findIndex(s => s.id === id);
  if (idx >= 0) db.sites[idx] = { ...db.sites[idx], ...updates };
  return true;
}

export async function deleteSite(db, siteId) {
  await jfetch(apiUrl(`sites.php?id=${encodeURIComponent(siteId)}`), { method: 'DELETE' });
  const rackIds = db.racks.filter(r => r.siteId === siteId).map(r => r.id);
  const eqIds   = db.equipos.filter(e => rackIds.includes(e.rackId)).map(e => e.id);
  db.conexiones = db.conexiones.filter(c => !eqIds.includes(c.equipoId));
  db.equipos    = db.equipos.filter(e => !rackIds.includes(e.rackId));
  db.racks      = db.racks.filter(r => r.siteId !== siteId);
  db.sites      = db.sites.filter(s => s.id !== siteId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CRUD RACKS
// ─────────────────────────────────────────────────────────────

export async function insertRack(db, rack) {
  const payload = { ...rack };
  delete payload.id;
  const data    = await jfetch(apiUrl('racks.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.rack || { ...payload, id: data.id };
  db.racks.push(created);
  return created;
}

export async function updateRack(db, rack) {
  const { id, ...updates } = rack;
  await jfetch(apiUrl(`racks.php?id=${encodeURIComponent(id)}`), { method: 'PUT', body: JSON.stringify(updates) });
  const idx = db.racks.findIndex(r => r.id === id);
  if (idx >= 0) db.racks[idx] = { ...db.racks[idx], ...updates };
  return true;
}

export async function deleteRack(db, rackId) {
  await jfetch(apiUrl(`racks.php?id=${encodeURIComponent(rackId)}`), { method: 'DELETE' });
  const eqIds = db.equipos.filter(e => e.rackId === rackId).map(e => e.id);
  db.conexiones = db.conexiones.filter(c => !eqIds.includes(c.equipoId));
  db.equipos    = db.equipos.filter(e => e.rackId !== rackId);
  db.racks      = db.racks.filter(r => r.id !== rackId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CRUD EQUIPOS
// ─────────────────────────────────────────────────────────────

export async function insertEquipo(db, eq) {
  const payload = { ...eq };
  delete payload.id;
  if (!payload.rackId || payload.rackId === '0')
    throw new ApiError('rackId invalido. Selecciona un rack existente.', 400, {});
  const data    = await jfetch(apiUrl('equipos.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.equipo || { ...payload, id: data.id };
  db.equipos.push(created);
  return created;
}

export async function updateEquipo(db, eq) {
  const { id, ...updates } = eq;
  // Solo mandamos los campos que realmente cambian al servidor
  // para evitar sobreescribir campos como rackId accidentalmente
  const allowed = ['rackId','modelo','numeroSerie','puertoConexion','servicio','estado','uPos','uSize'];
  const payload = {};
  for (const k of allowed) { if (k in updates) payload[k] = updates[k]; }
  await jfetch(apiUrl(`equipos.php?id=${encodeURIComponent(id)}`), { method: 'PUT', body: JSON.stringify(payload) });
  const idx = db.equipos.findIndex(e => e.id === id);
  if (idx >= 0) db.equipos[idx] = { ...db.equipos[idx], ...payload };
  return true;
}

export async function deleteEquipo(db, equipoId) {
  await jfetch(apiUrl(`equipos.php?id=${encodeURIComponent(equipoId)}`), { method: 'DELETE' });
  db.conexiones = db.conexiones.filter(c => c.equipoId !== equipoId);
  db.equipos    = db.equipos.filter(e => e.id !== equipoId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CRUD CONEXIONES
// ─────────────────────────────────────────────────────────────

export async function insertConexion(db, conn) {
  const payload = { ...conn };
  const data    = await jfetch(apiUrl('conexiones.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.conexion || payload;
  if (!db.conexiones.find(c => c.id === created.id && c.equipoId === created.equipoId))
    db.conexiones.push(created);
  return created;
}

export async function updateConexion(db, conn) {
  const { id, equipoId, ...updates } = conn;
  await jfetch(apiUrl(`conexiones.php?equipoId=${encodeURIComponent(equipoId)}&id=${encodeURIComponent(id)}`),
    { method: 'PUT', body: JSON.stringify(updates) });
  const idx = db.conexiones.findIndex(c => c.id === id && c.equipoId === equipoId);
  if (idx >= 0) db.conexiones[idx] = { ...db.conexiones[idx], ...updates };
  return true;
}

export async function deleteConexion(db, equipoId, connId) {
  await jfetch(apiUrl(`conexiones.php?equipoId=${encodeURIComponent(equipoId)}&id=${encodeURIComponent(connId)}`),
    { method: 'DELETE' });
  db.conexiones = db.conexiones.filter(c => !(c.id === connId && c.equipoId === equipoId));
  return true;
}

// ─────────────────────────────────────────────────────────────
// Validacion
// ─────────────────────────────────────────────────────────────

export function validateEquipo(eq, rack, existentes, ignoreId) {
  if (!eq.modelo?.trim())         return 'El modelo es obligatorio.';
  if (!eq.numeroSerie?.trim())    return 'El numero de serie es obligatorio.';
  if (!eq.puertoConexion?.trim()) return 'El puerto de conexion es obligatorio.';
  if (!eq.servicio?.trim())       return 'El servicio es obligatorio.';
  if (!eq.estado)                 return 'El estado es obligatorio.';
  if (eq.uPos == null)            return 'uPos es obligatorio.';
  if (eq.uSize == null)           return 'uSize es obligatorio.';

  const uPos  = parseInt(eq.uPos);
  const uSize = Math.max(1, parseInt(eq.uSize));
  const U     = rack.unidades;

  if (uPos < 1 || uPos > U) return `uPos debe estar entre 1 y ${U}.`;
  const end = uPos + uSize - 1;
  if (end > U) return `El equipo se sale del rack (U${uPos}+${uSize}-1=${end}, max ${U}).`;

  for (const other of existentes) {
    if (ignoreId && ignoreId === other.id) continue;
    if (other.uPos == null || other.uSize == null) continue;
    const oStart = parseInt(other.uPos);
    const oEnd   = oStart + Math.max(1, parseInt(other.uSize)) - 1;
    if (uPos <= oEnd && end >= oStart)
      return `Colision con ${other.id} (U${oStart}-U${oEnd}).`;
  }
  return null;
}
