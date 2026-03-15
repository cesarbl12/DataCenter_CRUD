-- ============================================================
-- migrate.sql — Migración de BD antigua al nuevo esquema
-- Convierte site_id CHAR(1) ('A','B',...) a la nueva estructura
-- locaciones -> sites -> racks -> equipos -> conexiones
--
-- Cómo usar:
--   1. Abre phpMyAdmin → SQL
--   2. Pega y ejecuta este script COMPLETO
--   3. Verifica que no haya errores antes de usar la app
-- ============================================================

USE dcm;

-- ── Paso 1: Crear tabla locaciones si no existe ───────────────
CREATE TABLE IF NOT EXISTS locaciones (
  id     VARCHAR(50)  NOT NULL,
  nombre VARCHAR(100) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Paso 2: Crear tabla sites si no existe ────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id          VARCHAR(50)  NOT NULL,
  locacion_id VARCHAR(50)  NOT NULL,
  nombre      VARCHAR(100) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  CONSTRAINT fk_site_locacion
    FOREIGN KEY (locacion_id) REFERENCES locaciones(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Paso 3: Insertar locacion por defecto ─────────────────────
INSERT IGNORE INTO locaciones (id, nombre) VALUES
  ('LOC-1', 'Sede Principal');

-- ── Paso 4: Crear sites para cada letra que exista en racks ──
-- Detecta automáticamente todas las letras usadas como site_id
-- y las convierte a SITE-A, SITE-B, etc.
INSERT IGNORE INTO sites (id, locacion_id, nombre)
SELECT DISTINCT
  CONCAT('SITE-', UPPER(TRIM(site_id))),
  'LOC-1',
  CONCAT('Site ', UPPER(TRIM(site_id)))
FROM racks
WHERE site_id IS NOT NULL AND TRIM(site_id) != '';

-- ── Paso 5: Quitar FK vieja de racks (si existe) ─────────────
-- Necesario para poder modificar la columna
SET @fk_exists = (
  SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = 'dcm'
    AND TABLE_NAME   = 'racks'
    AND COLUMN_NAME  = 'site_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);

SET @sql = IF(@fk_exists IS NOT NULL,
  CONCAT('ALTER TABLE racks DROP FOREIGN KEY ', @fk_exists),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Paso 6: Ampliar columna site_id a VARCHAR(50) ────────────
ALTER TABLE racks
  MODIFY COLUMN site_id VARCHAR(50) NOT NULL DEFAULT '';

-- ── Paso 7: Actualizar los site_id de racks al nuevo formato ─
-- 'A' -> 'SITE-A', 'B' -> 'SITE-B', etc.
UPDATE racks
SET site_id = CONCAT('SITE-', UPPER(TRIM(site_id)))
WHERE LENGTH(TRIM(site_id)) = 1
  AND TRIM(site_id) REGEXP '^[A-Za-z]$';

-- ── Paso 8: Volver a poner la FK con el nuevo tipo ────────────
ALTER TABLE racks
  ADD CONSTRAINT fk_rack_site
    FOREIGN KEY (site_id) REFERENCES sites(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Verificación final ────────────────────────────────────────
SELECT 'locaciones' AS tabla, COUNT(*) AS filas FROM locaciones
UNION ALL SELECT 'sites',     COUNT(*) FROM sites
UNION ALL SELECT 'racks',     COUNT(*) FROM racks
UNION ALL SELECT 'equipos',   COUNT(*) FROM equipos
UNION ALL SELECT 'conexiones',COUNT(*) FROM conexiones;

-- Muestra racks con su nuevo site_id para confirmar
SELECT r.id, r.nombre, r.site_id, s.nombre AS site_nombre, l.nombre AS locacion
FROM racks r
LEFT JOIN sites      s ON s.id = r.site_id
LEFT JOIN locaciones l ON l.id = s.locacion_id
ORDER BY r.site_id, r.id;
