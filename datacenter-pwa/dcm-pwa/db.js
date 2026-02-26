// db.js — Capa de datos con persistencia en localStorage
// Equivalente a DatabaseManager.java + RackManager.java

const DB_KEY = 'dcm_db_v3';

// ── Inicializar / cargar DB ──────────────────────────────────────────────────

export function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[DB] Error al cargar:', e);
  }
  return { racks: [], equipos: [], conexiones: [] };
}

export function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('[DB] Error al guardar:', e);
  }
}

// ── Racks ────────────────────────────────────────────────────────────────────

/**
 * @param {object} db
 * @param {string} siteId  — A, B, C, D o E
 * @returns {Rack[]}
 */
export function getRacksBySite(db, siteId) {
  return db.racks.filter(r => r.siteId === siteId);
}

export function getRackById(db, id) {
  return db.racks.find(r => r.id === id) || null;
}

/**
 * Inserta un nuevo rack.
 * @returns {boolean} false si el id ya existe
 */
export function insertRack(db, rack) {
  if (db.racks.find(r => r.id === rack.id)) return false;
  db.racks.push({ ...rack });
  saveDB(db);
  return true;
}

export function updateRack(db, rack) {
  const idx = db.racks.findIndex(r => r.id === rack.id);
  if (idx < 0) return false;
  db.racks[idx] = { ...rack };
  saveDB(db);
  return true;
}

/** Elimina rack + equipos en cascada (y sus conexiones). */
export function deleteRack(db, id) {
  const idx = db.racks.findIndex(r => r.id === id);
  if (idx < 0) return false;
  // cascade
  const eqIds = db.equipos.filter(e => e.rackId === id).map(e => e.id);
  eqIds.forEach(eid => deleteEquipo(db, eid, /* save= */ false));
  db.racks.splice(idx, 1);
  saveDB(db);
  return true;
}

// ── Equipos ──────────────────────────────────────────────────────────────────

export function getEquiposByRack(db, rackId) {
  return db.equipos
    .filter(e => e.rackId === rackId)
    .sort((a, b) => (a.uPos ?? 9999) - (b.uPos ?? 9999));
}

export function getEquipoById(db, id) {
  return db.equipos.find(e => e.id === id) || null;
}

export function insertEquipo(db, eq) {
  if (db.equipos.find(e => e.id === eq.id)) return false;
  db.equipos.push({ ...eq });
  saveDB(db);
  return true;
}

export function updateEquipo(db, eq) {
  const idx = db.equipos.findIndex(e => e.id === eq.id);
  if (idx < 0) return false;
  db.equipos[idx] = { ...eq };
  saveDB(db);
  return true;
}

/** @param {boolean} [doSave=true] — permite omitir save en cascadas */
export function deleteEquipo(db, id, doSave = true) {
  db.equipos    = db.equipos.filter(e => e.id !== id);
  db.conexiones = db.conexiones.filter(c => c.equipoId !== id);
  if (doSave) saveDB(db);
  return true;
}

// ── Conexiones ───────────────────────────────────────────────────────────────

export function getConexionesByEquipo(db, equipoId) {
  return db.conexiones
    .filter(c => c.equipoId === equipoId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function insertConexion(db, conn) {
  if (db.conexiones.find(c => c.id === conn.id && c.equipoId === conn.equipoId)) return false;
  db.conexiones.push({ ...conn });
  saveDB(db);
  return true;
}

export function updateConexion(db, conn) {
  const idx = db.conexiones.findIndex(c => c.id === conn.id && c.equipoId === conn.equipoId);
  if (idx < 0) return false;
  db.conexiones[idx] = { ...conn };
  saveDB(db);
  return true;
}

export function deleteConexion(db, equipoId, connId) {
  const idx = db.conexiones.findIndex(c => c.id === connId && c.equipoId === equipoId);
  if (idx < 0) return false;
  db.conexiones.splice(idx, 1);
  saveDB(db);
  return true;
}

// ── Validación de equipo (equivalente a DataCenterApp.validarEquipo) ─────────

/**
 * @param {object} eq          — equipo a validar
 * @param {object} rack        — rack destino
 * @param {object[]} existentes — equipos ya en el rack
 * @param {string|null} ignoreId — id a ignorar en colisiones (modo edición)
 * @returns {string|null}  mensaje de error, o null si es válido
 */
export function validateEquipo(eq, rack, existentes, ignoreId) {
  if (!eq.id?.trim())              return 'El nombre del equipo es obligatorio.';
  if (!eq.modelo?.trim())          return 'El modelo es obligatorio.';
  if (!eq.numeroSerie?.trim())     return 'El número de serie es obligatorio.';
  if (!eq.puertoConexion?.trim())  return 'El puerto de conexión es obligatorio.';
  if (!eq.servicio?.trim())        return 'El servicio es obligatorio.';
  if (!eq.estado)                  return 'El estado es obligatorio.';
  if (eq.uPos == null)             return 'uPos es obligatorio.';
  if (eq.uSize == null)            return 'uSize es obligatorio.';

  const uPos  = parseInt(eq.uPos);
  const uSize = Math.max(1, parseInt(eq.uSize));
  const U     = rack.unidades;

  if (uPos < 1 || uPos > U)             return `uPos debe estar entre 1 y ${U}.`;
  const end = uPos + uSize - 1;
  if (end > U) return `El equipo se sale del rack: uPos+uSize-1 = ${end} (max ${U}).`;

  for (const other of existentes) {
    if (ignoreId && ignoreId === other.id)        continue;
    if (other.uPos == null || other.uSize == null) continue;
    const oStart = parseInt(other.uPos);
    const oEnd   = oStart + Math.max(1, parseInt(other.uSize)) - 1;
    if (uPos <= oEnd && end >= oStart)
      return `Colisión con ${other.id} (U${oStart}–U${oEnd}).`;
  }
  return null;
}
