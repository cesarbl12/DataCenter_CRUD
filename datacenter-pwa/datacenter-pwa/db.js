/* ================================================================
   db.js — Capa de datos
   Data Center Manager PWA
   Equivalente a DatabaseManager.java + RackManager.java
   Persistencia: localStorage (clave 'dcm_db_v3')
================================================================ */

const DB_KEY = 'dcm_db_v3';

// ── Carga / guarda ────────────────────────────────────────────────

export function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[DB] Error cargando BD:', e);
  }
  return { racks: [], equipos: [], conexiones: [] };
}

export function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('[DB] Error guardando BD:', e);
  }
}

// Instancia global mutable
export const db = loadDB();

// ── RACKS ─────────────────────────────────────────────────────────

/**
 * @returns {Array} racks del site indicado
 */
export function getRacksBySite(siteId) {
  return db.racks.filter(r => r.siteId === siteId);
}

/**
 * @returns {Object|null}
 */
export function getRackById(id) {
  return db.racks.find(r => r.id === id) ?? null;
}

/**
 * @param {{ id, siteId, nombre, ubicacion, unidades }} rack
 * @returns {boolean} false si el id ya existe
 */
export function insertRack(rack) {
  if (db.racks.find(r => r.id === rack.id)) return false;
  db.racks.push({ ...rack });
  saveDB(db);
  return true;
}

/**
 * @returns {boolean} false si no existe
 */
export function updateRack(rack) {
  const idx = db.racks.findIndex(r => r.id === rack.id);
  if (idx < 0) return false;
  db.racks[idx] = { ...rack };
  saveDB(db);
  return true;
}

/**
 * Elimina el rack y en cascada sus equipos y conexiones.
 * @returns {boolean}
 */
export function deleteRack(id) {
  const idx = db.racks.findIndex(r => r.id === id);
  if (idx < 0) return false;
  // Cascade: equipos y sus conexiones
  const equipoIds = db.equipos.filter(e => e.rackId === id).map(e => e.id);
  equipoIds.forEach(eid => deleteEquipo(eid));
  db.racks.splice(idx, 1);
  saveDB(db);
  return true;
}

// ── EQUIPOS ───────────────────────────────────────────────────────

/**
 * @returns {Array} ordenado por uPos, luego id
 */
export function getEquiposByRack(rackId) {
  return db.equipos
    .filter(e => e.rackId === rackId)
    .sort((a, b) => (a.uPos ?? 9999) - (b.uPos ?? 9999) || a.id.localeCompare(b.id));
}

export function getEquipoById(id) {
  return db.equipos.find(e => e.id === id) ?? null;
}

/**
 * @param {{ id, rackId, modelo, numeroSerie, puertoConexion, servicio, estado, uPos, uSize }} equipo
 * @returns {boolean}
 */
export function insertEquipo(equipo) {
  if (db.equipos.find(e => e.id === equipo.id)) return false;
  db.equipos.push({ ...equipo });
  saveDB(db);
  return true;
}

export function updateEquipo(equipo) {
  const idx = db.equipos.findIndex(e => e.id === equipo.id);
  if (idx < 0) return false;
  db.equipos[idx] = { ...equipo };
  saveDB(db);
  return true;
}

/**
 * Elimina el equipo y en cascada sus conexiones.
 * @returns {boolean}
 */
export function deleteEquipo(id) {
  db.equipos = db.equipos.filter(e => e.id !== id);
  db.conexiones = db.conexiones.filter(c => c.equipoId !== id);
  saveDB(db);
  return true;
}

// ── CONEXIONES ────────────────────────────────────────────────────

/**
 * @returns {Array} ordenado por id
 */
export function getConexionesByEquipo(equipoId) {
  return db.conexiones
    .filter(c => c.equipoId === equipoId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @param {{ id, equipoId, tipo, estado, destino }} conn
 * @returns {boolean} false si ya existe el par (id, equipoId)
 */
export function insertConexion(conn) {
  if (db.conexiones.find(c => c.id === conn.id && c.equipoId === conn.equipoId)) return false;
  db.conexiones.push({ ...conn });
  saveDB(db);
  return true;
}

export function updateConexion(conn) {
  const idx = db.conexiones.findIndex(c => c.id === conn.id && c.equipoId === conn.equipoId);
  if (idx < 0) return false;
  db.conexiones[idx] = { ...conn };
  saveDB(db);
  return true;
}

export function deleteConexion(equipoId, connId) {
  const idx = db.conexiones.findIndex(c => c.id === connId && c.equipoId === equipoId);
  if (idx < 0) return false;
  db.conexiones.splice(idx, 1);
  saveDB(db);
  return true;
}

// ── VALIDACIÓN (equivalente a DataCenterApp.validarEquipo) ────────

/**
 * Valida un equipo antes de insertar/actualizar.
 * @param {Object} eq         equipo a validar
 * @param {Object} rack       rack donde se instalará
 * @param {Array}  existentes lista actual de equipos del rack
 * @param {string|null} ignoreId  id a ignorar en colisiones (modo edición)
 * @returns {string|null}  mensaje de error, o null si es válido
 */
export function validateEquipo(eq, rack, existentes, ignoreId) {
  if (!eq.id?.trim())             return 'El nombre del equipo es obligatorio.';
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

  if (uPos < 1 || uPos > U)
    return `uPos debe estar entre 1 y ${U}.`;

  const end = uPos + uSize - 1;
  if (end > U)
    return `El equipo se sale del rack: uPos+uSize-1 = ${end} (max ${U}).`;

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
