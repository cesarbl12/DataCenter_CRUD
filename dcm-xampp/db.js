// db.js — Online-only (sin Offline-First)
// Mantiene un objeto db en memoria (pasado por referencia desde app.js),
// pero TODAS las escrituras van directo al servidor (PHP/MySQL) y luego
// se refleja en el objeto db local.

function apiUrl(path) {
  return new URL(`api/${path}`, window.location.href).toString();
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data);
  }
  return data;
}

export function loadDB() {
  // Online-only: arranca vacío; app.js llamará loadFromServer()
  return { racks: [], equipos: [], conexiones: [] };
}

export function saveDB(_db) {
  // No-op (sin LocalStorage)
}

export function kickManualSync() {
  // No-op (sin cola)
}

// ─────────────────────────────────────────────────────────────
// Carga completa desde servidor (MySQL)
// ─────────────────────────────────────────────────────────────

export async function loadFromServer(db) {
  try {
    const ping = await jfetch(apiUrl('ping.php'), { method: 'GET' });
    if (!ping.ok) return false;

    const [rData, eData, cData] = await Promise.all([
      jfetch(apiUrl('racks.php'), { method: 'GET' }),
      jfetch(apiUrl('equipos.php'), { method: 'GET' }),
      jfetch(apiUrl('conexiones.php'), { method: 'GET' }),
    ]);

    db.racks = rData.racks || [];
    db.equipos = eData.equipos || [];
    db.conexiones = cData.conexiones || [];
    return true;
  } catch (e) {
    console.error('[DB] loadFromServer:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers de consulta en memoria (usados por app.js)
// ─────────────────────────────────────────────────────────────

export function getRacksBySite(db, siteId) {
  return (db.racks || []).filter(r => r.siteId === siteId);
}
export function getRackById(db, id) {
  return (db.racks || []).find(r => r.id === id) || null;
}

export function getEquiposByRack(db, rackId) {
  return (db.equipos || [])
    .filter(e => e.rackId === rackId)
    .sort((a, b) => (a.uPos ?? 9999) - (b.uPos ?? 9999));
}
export function getEquipoById(db, id) {
  return (db.equipos || []).find(e => e.id === id) || null;
}

export function getConexionesByEquipo(db, equipoId) {
  return (db.conexiones || [])
    .filter(c => c.equipoId === equipoId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ─────────────────────────────────────────────────────────────
// CRUD RACKS (server → actualiza db)
// ─────────────────────────────────────────────────────────────

export async function insertRack(db, rack) {
  const payload = { ...rack };
  // id es auto en servidor, no lo mandes (si viene)
  delete payload.id;

  const data = await jfetch(apiUrl('racks.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.rack || { ...payload, id: data.id };

  // Actualiza db local
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

  // cascada local
  const eqIds = db.equipos.filter(e => e.rackId === rackId).map(e => e.id);
  db.conexiones = db.conexiones.filter(c => !eqIds.includes(c.equipoId));
  db.equipos = db.equipos.filter(e => e.rackId !== rackId);
  db.racks = db.racks.filter(r => r.id !== rackId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CRUD EQUIPOS (server → actualiza db)
// ─────────────────────────────────────────────────────────────

export async function insertEquipo(db, eq) {
  const payload = { ...eq };
  // id es auto en servidor, no lo mandes
  delete payload.id;

  // Guardrail: rackId debe ser string válido
  if (!payload.rackId || payload.rackId === '0') {
    throw new ApiError('rackId inválido. Selecciona un rack existente.', 400, {});
  }

  const data = await jfetch(apiUrl('equipos.php'), { method: 'POST', body: JSON.stringify(payload) });
  const created = data.equipo || { ...payload, id: data.id };

  db.equipos.push(created);
  return created;
}

export async function updateEquipo(db, eq) {
  const { id, ...updates } = eq;
  await jfetch(apiUrl(`equipos.php?id=${encodeURIComponent(id)}`), { method: 'PUT', body: JSON.stringify(updates) });

  const idx = db.equipos.findIndex(e => e.id === id);
  if (idx >= 0) db.equipos[idx] = { ...db.equipos[idx], ...updates };
  return true;
}

export async function deleteEquipo(db, equipoId, doSave = true) {
  await jfetch(apiUrl(`equipos.php?id=${encodeURIComponent(equipoId)}`), { method: 'DELETE' });

  db.conexiones = db.conexiones.filter(c => c.equipoId !== equipoId);
  db.equipos = db.equipos.filter(e => e.id !== equipoId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CRUD CONEXIONES (server → actualiza db)
// ─────────────────────────────────────────────────────────────

export async function insertConexion(db, conn) {
  const payload = { ...conn };
  await jfetch(apiUrl('conexiones.php'), { method: 'POST', body: JSON.stringify(payload) });

  db.conexiones.push(payload);
  return true;
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
// Validación (igual que antes)
// ─────────────────────────────────────────────────────────────

export function validateEquipo(eq, rack, existentes, ignoreId) {
  if (!eq.modelo?.trim())         return 'El modelo es obligatorio.';
  if (!eq.numeroSerie?.trim())    return 'El número de serie es obligatorio.';
  if (!eq.puertoConexion?.trim()) return 'El puerto de conexión es obligatorio.';
  if (!eq.servicio?.trim())       return 'El servicio es obligatorio.';
  if (!eq.estado)                 return 'El estado es obligatorio.';
  if (eq.uPos == null)            return 'uPos es obligatorio.';
  if (eq.uSize == null)           return 'uSize es obligatorio.';

  const uPos  = parseInt(eq.uPos);
  const uSize = Math.max(1, parseInt(eq.uSize));
  const U     = rack.unidades;

  if (uPos < 1 || uPos > U) return `uPos debe estar entre 1 y ${U}.`;
  const end = uPos + uSize - 1;
  if (end > U) return `El equipo se sale del rack (U${uPos}+${uSize}-1 = ${end}, max ${U}).`;

  for (const other of existentes) {
    if (ignoreId && ignoreId === other.id) continue;
    if (other.uPos == null || other.uSize == null) continue;
    const oStart = parseInt(other.uPos);
    const oEnd   = oStart + Math.max(1, parseInt(other.uSize)) - 1;
    if (uPos <= oEnd && end >= oStart) {
      return `Colisión con ${other.id} (U${oStart}–U${oEnd}).`;
    }
  }
  return null;
}
