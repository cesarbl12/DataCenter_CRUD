-- ============================================================
-- reset_total.sql — Reseteo GARANTIZADO de la BD dcm
-- Elimina tabla por tabla (respetando FKs) y las recrea limpias
--
-- Cómo usar:
--   1. phpMyAdmin → selecciona la BD "dcm" en la lista izquierda
--   2. Clic en pestaña "SQL"
--   3. Pega TODO este script y clic en "Continuar"
-- ============================================================

USE dcm;

-- Desactivar verificación de FKs para poder borrar en cualquier orden
SET FOREIGN_KEY_CHECKS = 0;

-- Eliminar todas las tablas existentes
DROP TABLE IF EXISTS conexiones;
DROP TABLE IF EXISTS equipos;
DROP TABLE IF EXISTS racks;
DROP TABLE IF EXISTS sites;
DROP TABLE IF EXISTS locaciones;

-- Reactivar FKs
SET FOREIGN_KEY_CHECKS = 1;

-- ── Crear tablas nuevas ───────────────────────────────────────

CREATE TABLE locaciones (
  id     VARCHAR(50)  NOT NULL,
  nombre VARCHAR(100) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sites (
  id          VARCHAR(50)  NOT NULL,
  locacion_id VARCHAR(50)  NOT NULL,
  nombre      VARCHAR(100) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  CONSTRAINT fk_site_locacion
    FOREIGN KEY (locacion_id) REFERENCES locaciones(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE racks (
  id        VARCHAR(50)  NOT NULL,
  site_id   VARCHAR(50)  NOT NULL,
  nombre    VARCHAR(100) NOT NULL DEFAULT '',
  ubicacion VARCHAR(100) NOT NULL DEFAULT '',
  unidades  INT          NOT NULL DEFAULT 42,
  PRIMARY KEY (id),
  CONSTRAINT fk_rack_site
    FOREIGN KEY (site_id) REFERENCES sites(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE equipos (
  id              VARCHAR(100) NOT NULL,
  rack_id         VARCHAR(50)  NOT NULL,
  modelo          VARCHAR(100) NOT NULL DEFAULT '',
  numero_serie    VARCHAR(100) NOT NULL DEFAULT '',
  puerto_conexion VARCHAR(100) NOT NULL DEFAULT '',
  servicio        VARCHAR(100) NOT NULL DEFAULT '',
  estado          VARCHAR(20)  NOT NULL DEFAULT 'Inactivo',
  u_pos           INT          NOT NULL DEFAULT 1,
  u_size          INT          NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_equipo_rack
    FOREIGN KEY (rack_id) REFERENCES racks(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE conexiones (
  id        VARCHAR(100) NOT NULL,
  equipo_id VARCHAR(100) NOT NULL,
  tipo      VARCHAR(50)  NOT NULL DEFAULT '',
  estado    VARCHAR(20)  NOT NULL DEFAULT 'Inactivo',
  destino   VARCHAR(150) NOT NULL DEFAULT '',
  PRIMARY KEY (id, equipo_id),
  CONSTRAINT fk_conexion_equipo
    FOREIGN KEY (equipo_id) REFERENCES equipos(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Datos de ejemplo ─────────────────────────────────────────

INSERT INTO locaciones (id, nombre) VALUES
  ('LOC-1', 'Sede Principal'),
  ('LOC-2', 'Sucursal Norte');

INSERT INTO sites (id, locacion_id, nombre) VALUES
  ('SITE-A', 'LOC-1', 'Site A'),
  ('SITE-B', 'LOC-1', 'Site B'),
  ('SITE-C', 'LOC-2', 'Site C');

INSERT INTO racks (id, site_id, nombre, ubicacion, unidades) VALUES
  ('R1', 'SITE-A', 'Rack Principal',  'Sala A - Fila 1', 42),
  ('R2', 'SITE-A', 'Rack Secundario', 'Sala A - Fila 2', 24),
  ('R3', 'SITE-B', 'Rack Core',       'Sala B - Fila 1', 42);

INSERT INTO equipos (id, rack_id, modelo, numero_serie, puerto_conexion, servicio, estado, u_pos, u_size) VALUES
  ('SW-CORE-01', 'R1', 'Cisco Catalyst 9300',    'FJC2342A001', 'Gi1/0/1', 'Core Network', 'Activo', 1, 2),
  ('SRV-WEB-01', 'R1', 'Dell PowerEdge R740',    'SN-00123',    'eth0',    'Web',          'Activo', 4, 2),
  ('SRV-DB-01',  'R1', 'HPE ProLiant DL380',     'SN-00456',    'eth0',    'Database',     'Activo', 7, 2),
  ('FW-01',      'R2', 'Fortinet FortiGate 60F', 'FG60F000001', 'WAN1',    'Firewall',     'Activo', 1, 1);

INSERT INTO conexiones (id, equipo_id, tipo, estado, destino) VALUES
  ('Gi1/0/1', 'SW-CORE-01', 'RJ45', 'Activo', 'SRV-WEB-01:eth0'),
  ('Gi1/0/2', 'SW-CORE-01', 'RJ45', 'Activo', 'SRV-DB-01:eth0'),
  ('sfp0',    'SW-CORE-01', 'SFP+', 'Activo', 'FW-01:WAN1'),
  ('eth0',    'SRV-WEB-01', 'RJ45', 'Activo', 'SW-CORE-01:Gi1/0/1'),
  ('eth0',    'SRV-DB-01',  'RJ45', 'Activo', 'SW-CORE-01:Gi1/0/2');

-- ── Verificación ─────────────────────────────────────────────
SELECT 'locaciones' AS tabla, COUNT(*) AS filas FROM locaciones
UNION ALL SELECT 'sites',      COUNT(*) FROM sites
UNION ALL SELECT 'racks',      COUNT(*) FROM racks
UNION ALL SELECT 'equipos',    COUNT(*) FROM equipos
UNION ALL SELECT 'conexiones', COUNT(*) FROM conexiones;
