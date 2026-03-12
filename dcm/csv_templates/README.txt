═══════════════════════════════════════════════════════════════
  DC MANAGER — GUÍA DE FORMATOS CSV PARA IMPORTACIÓN MASIVA
═══════════════════════════════════════════════════════════════

ARCHIVO 1: infraestructura.csv
─────────────────────────────────────────────────────────────
Importa en un solo archivo: Locaciones, Sites, Racks y Equipos.

ESTRUCTURA DE COLUMNAS (orden fijo, no cambiar):
┌────────────────────┬──────────────────────┬──────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│  LOCACIONES (0-1)  │    SITES (2-4)        │          RACKS (5-9)                 │                     EQUIPOS (10-18)                          │
├──────┬─────────────┼──────┬────────────┬───┼──────┬────────┬────────┬──────┬────┤──────┬────────┬────────┬──────────┬────────┬─────────┬──────┬──────┬──────┤
│ id   │ nombre      │ id   │ locacion_id│nom│ id   │site_id │nombre  │ubic  │ u  │ id   │rack_id │modelo  │num_serie │puerto  │servicio │estado│u_pos │u_size│
│ AUTO │ OBLIGATORIO │ AUTO │ ref locac. │OBL│ AUTO │ref site│OBLIGAT │opt   │opt │ AUTO │ ref    │OBLIGAT │opcional  │opcional│opcional │opt   │ AUTO │opt   │
└──────┴─────────────┴──────┴────────────┴───┴──────┴────────┴────────┴──────┴────┘──────┴────────┴────────┴──────────┴────────┴─────────┴──────┴──────┴──────┘

REGLAS:
  • id (cols 0,2,5,10):     Siempre poner "NO SE AGREGA" — el sistema los genera.
  • locacion.nombre:        OBLIGATORIO. Si la locacion ya existe se reutiliza.
  • site.locacion_id:       Nombre de la locacion padre (misma fila o anterior).
  • site.nombre:            OBLIGATORIO.
  • rack.site_id:           Nombre del site padre (misma fila o anterior).
  • rack.nombre:            OBLIGATORIO.
  • rack.ubicacion:         Opcional. Vacío → "N/A".
  • rack.unidades:          Opcional. Vacío → 42.
  • equipo.rack_id:         Nombre del rack padre (misma fila o anterior).
  • equipo.modelo:          OBLIGATORIO para crear un equipo. Si está vacío se ignora la fila de equipo.
  • equipo.numero_serie:    Opcional. Vacío → "N/A".
  • equipo.puerto_conexion: Opcional. Vacío → "N/A".
  • equipo.servicio:        Opcional. Vacío → "N/A".
  • equipo.estado:          Opcional. Vacío → "Inactivo". Valores: Activo / Inactivo.
  • equipo.u_pos:           Opcional. Vacío → asignación automática secuencial por rack.
  • equipo.u_size:          Opcional. Vacío → 1.

TIPS:
  • Una fila puede tener solo datos de equipo (locacion/site/rack vacíos) si ya están definidos arriba.
  • Una fila puede tener solo locacion/site/rack sin equipo (modelo vacío).
  • Celdas vacías y celdas con "NO SE AGREGA" se tratan igual.
  • Las locaciones/sites/racks que ya existen en la BD se reutilizan automáticamente.
  • La primera fila (LOCACIONES, SITES, RACKS, EQUIPOS) y la segunda fila (id, nombre...) son el encabezado.

EJEMPLO MÍNIMO — solo racks y equipos (locaciones y sites ya existen en BD):
  LOCACIONES,,SITES,,,RACKS,,,,,EQUIPOS,,,,,,,,
  id,nombre,id,locacion_id,nombre,id,site_id,nombre,ubicacion,unidades,id,rack_id,modelo,numero_serie,puerto_conexion,servicio,estado,u_pos,u_size
  NO SE AGREGA,,NO SE AGREGA,,NO SE AGREGA,NO SE AGREGA,Site A,Rack Nuevo 01,,24,NO SE AGREGA,Rack Nuevo 01,Switch 24p,SW-001,,,Activo,,1

═══════════════════════════════════════════════════════════════

ARCHIVO 2: conexiones.csv
─────────────────────────────────────────────────────────────
Importa conexiones para equipos ya existentes en la BD.
DEBE importarse DESPUÉS del CSV de infraestructura.

ESTRUCTURA DE COLUMNAS:
  equipo_id     OBLIGATORIO  ID del equipo (puede ser el numero_serie o el modelo si es único)
  id            OBLIGATORIO  Puerto o identificador de la conexión (ej: Gi1/0/1, eth0, sfp0)
  tipo          Opcional     RJ45 / SFP+ / SFP / Serial / Console / Fiber / USB
                             Cualquier otro valor → "Other"
  estado        Opcional     Activo / Inactivo — Vacío → "Inactivo"
  destino       Opcional     Destino de la conexión (ej: SW-CORE:Gi1/0/2) — Vacío → "N/A"

REGLAS:
  • equipo_id busca por: ID interno del equipo, numero_serie, o modelo (en ese orden).
  • El campo id/puerto identifica unicamente la conexion dentro del equipo.
  • tipo inválido o vacío → "Other".
  • No hay columna "NO SE AGREGA" en este CSV — todos los campos se leen directo.

═══════════════════════════════════════════════════════════════
