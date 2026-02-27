// db.js — Offline-first + MySQL sync via XAMPP PHP API

const DB_KEY    = 'dcm_db_v3';
const QUEUE_KEY = 'dcm_sync_queue_v1';

// Ruta absoluta calculada desde donde está index.html
// Funciona sin importar cómo se importa el módulo
function apiUrl(path) {
  // Obtiene la ruta base del index.html (sin el nombre de archivo)
  const base = window.location.href.replace(/\/[^/]*$/, '');
  return `${base}/api/${path}`;
}

// ════════════════════════════════════════════════════════════
// LOCALSTORAGE
// ════════════════════════════════════════════════════════════

function safeParse(raw, fb) {
  try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
}

export function loadDB() {
  const db = safeParse(localStorage.getItem(DB_KEY), null);
  return (db && typeof db === 'object') ? db : { racks: [], equipos: [], conexiones: [] };
}

export function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.error('[DB]', e); }
}

function loadQueue()  { return safeParse(localStorage.getItem(QUEUE_KEY), []); }
function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} }

// ════════════════════════════════════════════════════════════
// CARGA INICIAL DESDE MYSQL
// ════════════════════════════════════════════════════════════

export async function loadFromServer(db) {
  try {
    // 1. Ping — verifica que XAMPP y la BD están listos
    let pingData;
    try {
      const pr = await fetch(apiUrl('ping.php'), { method: 'GET' });
      pingData = await pr.json();
    } catch (e) {
      console.error('[DB] No se pudo contactar XAMPP:', e.message);
      console.error('[DB] URL intentada:', apiUrl('ping.php'));
      return false;
    }

    if (!pingData.ok) {
      console.error('[DB] Ping falló:', pingData.error);
      return false;
    }
    console.log('[DB] Ping OK — PHP', pingData.php, '— tablas:', pingData.tables);

    // 2. Carga en paralelo
    const [rRes, eRes, cRes] = await Promise.all([
      fetch(apiUrl('racks.php')),
      fetch(apiUrl('equipos.php')),
      fetch(apiUrl('conexiones.php')),
    ]);

    const rData = await rRes.json();
    const eData = await eRes.json();
    const cData = await cRes.json();

    if (!rData.ok || !eData.ok || !cData.ok) {
      console.error('[DB] Error cargando datos:', rData.error || eData.error || cData.error);
      return false;
    }

    db.racks      = rData.racks      ?? [];
    db.equipos    = eData.equipos    ?? [];
    db.conexiones = cData.conexiones ?? [];
    saveDB(db);

    console.log('[DB] MySQL cargado —',
      db.racks.length, 'racks,',
      db.equipos.length, 'equipos,',
      db.conexiones.length, 'conexiones');
    return true;

  } catch (e) {
    console.error('[DB] loadFromServer excepción:', e.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// COLA DE SINCRONIZACIÓN (escrituras → MySQL)
// ════════════════════════════════════════════════════════════

let syncing   = false;
let syncTimer = null;

function enqueue(op) {
  const q = loadQueue();
  q.push({ ...op, ts: Date.now() });
  saveQueue(q);
  kickSync();
}

function kickSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; syncNow().catch(() => {}); }, 150);
}

export function kickManualSync() { kickSync(); }

async function jfetch(url, opts = {}) {
  const res  = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function opToRequest({ entity, action, payload }) {
  const enc = s => encodeURIComponent(s ?? '');

  if (entity === 'racks') {
    if (action === 'insert') return { url: apiUrl('racks.php'),                             method: 'POST',   body: payload };
    if (action === 'update') return { url: apiUrl(`racks.php?id=${enc(payload.id)}`),       method: 'PUT',    body: payload.data };
    if (action === 'delete') return { url: apiUrl(`racks.php?id=${enc(payload.id)}`),       method: 'DELETE' };
  }
  if (entity === 'equipos') {
    if (action === 'insert') return { url: apiUrl('equipos.php'),                           method: 'POST',   body: payload };
    if (action === 'update') return { url: apiUrl(`equipos.php?id=${enc(payload.id)}`),     method: 'PUT',    body: payload.data };
    if (action === 'delete') return { url: apiUrl(`equipos.php?id=${enc(payload.id)}`),     method: 'DELETE' };
  }
  if (entity === 'conexiones') {
    if (action === 'insert') return { url: apiUrl('conexiones.php'),                                                                         method: 'POST',   body: payload };
    if (action === 'update') return { url: apiUrl(`conexiones.php?equipoId=${enc(payload.equipoId)}&id=${enc(payload.id)}`),                 method: 'PUT',    body: payload.data };
    if (action === 'delete') return { url: apiUrl(`conexiones.php?equipoId=${enc(payload.equipoId)}&id=${enc(payload.id)}`),                 method: 'DELETE' };
  }
  throw new Error('Unknown op: ' + entity + '/' + action);
}

async function syncNow() {
  if (syncing || !navigator.onLine) return;
  const q = loadQueue();
  if (!q.length) return;
  syncing = true;
  try {
    while (q.length) {
      const op  = q[0];
      const req = opToRequest(op);
      const opts = { method: req.method };
      if (req.body && (req.method === 'POST' || req.method === 'PUT'))
        opts.body = JSON.stringify(req.body);
      await jfetch(req.url, opts);
      q.shift();
      saveQueue(q);
    }
  } catch (e) {
    console.warn('[SYNC] Reintentará:', e.message);
  } finally {
    syncing = false;
  }
}

window.addEventListener('online',  () => kickSync());
setInterval(() => kickSync(), 5000);

// ════════════════════════════════════════════════════════════
// RACKS
// ════════════════════════════════════════════════════════════

export function getRacksBySite(db, siteId) {
  return db.racks.filter(r => r.siteId === siteId);
}
export function getRackById(db, id) {
  return db.racks.find(r => r.id === id) || null;
}
export function insertRack(db, rack) {
  if (db.racks.find(r => r.id === rack.id)) return false;
  db.racks.push({ ...rack });
  saveDB(db);
  enqueue({ entity: 'racks', action: 'insert', payload: rack });
  return true;
}
export function updateRack(db, rack) {
  const idx = db.racks.findIndex(r => r.id === rack.id);
  if (idx < 0) return false;
  db.racks[idx] = { ...db.racks[idx], ...rack };
  saveDB(db);
  const { id, ...updates } = rack;
  enqueue({ entity: 'racks', action: 'update', payload: { id, data: updates } });
  return true;
}
export function deleteRack(db, rackId) {
  const eqIds = db.equipos.filter(e => e.rackId === rackId).map(e => e.id);
  db.conexiones = db.conexiones.filter(c => !eqIds.includes(c.equipoId));
  db.equipos    = db.equipos.filter(e => e.rackId !== rackId);
  db.racks      = db.racks.filter(r => r.id !== rackId);
  saveDB(db);
  enqueue({ entity: 'racks', action: 'delete', payload: { id: rackId } });
  return true;
}

// ════════════════════════════════════════════════════════════
// EQUIPOS
// ════════════════════════════════════════════════════════════

export function getEquiposByRack(db, rackId) {
  return db.equipos.filter(e => e.rackId === rackId).sort((a, b) => (a.uPos ?? 9999) - (b.uPos ?? 9999));
}
export function getEquipoById(db, id) {
  return db.equipos.find(e => e.id === id) || null;
}
export function insertEquipo(db, eq) {
  if (db.equipos.find(e => e.id === eq.id)) return false;
  db.equipos.push({ ...eq });
  saveDB(db);
  enqueue({ entity: 'equipos', action: 'insert', payload: eq });
  return true;
}
export function updateEquipo(db, eq) {
  const idx = db.equipos.findIndex(e => e.id === eq.id);
  if (idx < 0) return false;
  db.equipos[idx] = { ...db.equipos[idx], ...eq };
  saveDB(db);
  const { id, ...updates } = eq;
  enqueue({ entity: 'equipos', action: 'update', payload: { id, data: updates } });
  return true;
}
export function deleteEquipo(db, equipoId, doSave = true) {
  db.conexiones = db.conexiones.filter(c => c.equipoId !== equipoId);
  db.equipos    = db.equipos.filter(e => e.id !== equipoId);
  if (doSave) saveDB(db);
  enqueue({ entity: 'equipos', action: 'delete', payload: { id: equipoId } });
  return true;
}

// ════════════════════════════════════════════════════════════
// CONEXIONES
// ════════════════════════════════════════════════════════════

export function getConexionesByEquipo(db, equipoId) {
  return db.conexiones.filter(c => c.equipoId === equipoId).sort((a, b) => a.id.localeCompare(b.id));
}
export function insertConexion(db, conn) {
  if (db.conexiones.find(c => c.id === conn.id && c.equipoId === conn.equipoId)) return false;
  db.conexiones.push({ ...conn });
  saveDB(db);
  enqueue({ entity: 'conexiones', action: 'insert', payload: conn });
  return true;
}
export function updateConexion(db, conn) {
  const idx = db.conexiones.findIndex(c => c.id === conn.id && c.equipoId === conn.equipoId);
  if (idx < 0) return false;
  db.conexiones[idx] = { ...db.conexiones[idx], ...conn };
  saveDB(db);
  const { id, equipoId, ...updates } = conn;
  enqueue({ entity: 'conexiones', action: 'update', payload: { id, equipoId, data: updates } });
  return true;
}
export function deleteConexion(db, equipoId, connId) {
  db.conexiones = db.conexiones.filter(c => !(c.id === connId && c.equipoId === equipoId));
  saveDB(db);
  enqueue({ entity: 'conexiones', action: 'delete', payload: { equipoId, id: connId } });
  return true;
}

// ════════════════════════════════════════════════════════════
// VALIDACIÓN
// ════════════════════════════════════════════════════════════

export function validateEquipo(eq, rack, existentes, ignoreId) {
  if (!eq.id?.trim())             return 'El nombre del equipo es obligatorio.';
  if (!eq.modelo?.trim())         return 'El modelo es obligatorio.';
  if (!eq.numeroSerie?.trim())    return 'El número de serie es obligatorio.';
  if (!eq.puertoConexion?.trim()) return 'El puerto de conexión es obligatorio.';
  if (!eq.servicio?.trim())       return 'El servicio es obligatorio.';
  if (!eq.estado)                 return 'El estado es obligatorio.';
  if (eq.uPos == null)            return 'uPos es obligatorio.';
  if (eq.uSize == null)           return 'uSize es obligatorio.';

  const uPos = parseInt(eq.uPos);
  const uSize = Math.max(1, parseInt(eq.uSize));
  const U = rack.unidades;

  if (uPos < 1 || uPos > U) return `uPos debe estar entre 1 y ${U}.`;
  const end = uPos + uSize - 1;
  if (end > U) return `El equipo se sale del rack (U${uPos}+${uSize}-1 = ${end}, max ${U}).`;

  for (const other of existentes) {
    if (ignoreId && ignoreId === other.id) continue;
    if (other.uPos == null || other.uSize == null) continue;
    const oStart = parseInt(other.uPos);
    const oEnd   = oStart + Math.max(1, parseInt(other.uSize)) - 1;
    if (uPos <= oEnd && end >= oStart)
      return `Colisión con ${other.id} (U${oStart}–U${oEnd}).`;
  }
  return null;
}
