-- ============================================================
-- setup.sql — Data Center Manager — MySQL/XAMPP
--
-- Cómo usar:
--   1. Abre phpMyAdmin (http://localhost/phpmyadmin)
--   2. Haz clic en "SQL" y pega este script completo
--   3. Ejecuta
-- ============================================================

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS dcm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE dcm;

-- ── Tabla: racks ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS racks (
  id        VARCHAR(50)  NOT NULL,
  site_id   CHAR(1)      NOT NULL COMMENT 'A–E',
  nombre    VARCHAR(100) NOT NULL DEFAULT '',
  ubicacion VARCHAR(100) NOT NULL DEFAULT '',
  unidades  INT          NOT NULL DEFAULT 42,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Tabla: equipos ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipos (
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

-- ── Tabla: conexiones ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conexiones (
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

-- ── Datos de ejemplo (opcional, puedes borrar este bloque) ────
INSERT IGNORE INTO racks (id, site_id, nombre, ubicacion, unidades) VALUES
  ('R1', 'A', 'Rack Principal',  'Sala A — Fila 1', 42),
  ('R2', 'A', 'Rack Secundario', 'Sala A — Fila 2', 24),
  ('R3', 'B', 'Rack Core',       'Sala B — Fila 1', 42);

INSERT IGNORE INTO equipos (id, rack_id, modelo, numero_serie, puerto_conexion, servicio, estado, u_pos, u_size) VALUES
  ('SW-CORE-01', 'R1', 'Cisco Catalyst 9300',  'FJC2342A001', 'Gi1/0/1',  'Core Network', 'Activo', 1, 2),
  ('SRV-WEB-01', 'R1', 'Dell PowerEdge R740',  'SN-00123',    'eth0',     'Web',          'Activo', 4, 2),
  ('SRV-DB-01',  'R1', 'HPE ProLiant DL380',   'SN-00456',    'eth0',     'Database',     'Activo', 7, 2),
  ('FW-01',      'R2', 'Fortinet FortiGate 60F','FG60F000001', 'WAN1',     'Firewall',     'Activo', 1, 1);

INSERT IGNORE INTO conexiones (id, equipo_id, tipo, estado, destino) VALUES
  ('Gi1/0/1', 'SW-CORE-01', 'RJ45',  'Activo',   'SRV-WEB-01:eth0'),
  ('Gi1/0/2', 'SW-CORE-01', 'RJ45',  'Activo',   'SRV-DB-01:eth0'),
  ('sfp0',    'SW-CORE-01', 'SFP+',  'Activo',   'FW-01:WAN1'),
  ('eth0',    'SRV-WEB-01', 'RJ45',  'Activo',   'SW-CORE-01:Gi1/0/1'),
  ('eth0',    'SRV-DB-01',  'RJ45',  'Activo',   'SW-CORE-01:Gi1/0/2');
