// import.js — Importacion CSV por entidad separada
// Tabs: Racks | Equipos | Conexiones
import * as DB from './db.js';

// ─────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote=false, cell='';
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){if(inQuote&&line[i+1]==='"'){cell+='"';i++;}else inQuote=!inQuote;}
      else if(ch===','&&!inQuote){row.push(cell.trim());cell='';}
      else cell+=ch;
    }
    row.push(cell.trim());
    result.push(row);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function cv(row, idx, fallback='N/A') {
  if (idx==null||idx<0||idx>=row.length) return fallback;
  const v=(row[idx]!=null?row[idx]:'').toString().trim();
  return (v==='')?fallback:v;
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const TIPO_VALIDOS = ['RJ45','SFP+','SFP','Serial','Console','Fiber','USB','Other'];
function normTipo(raw) {
  if (!raw||raw.trim()==='') return 'Other';
  const match = TIPO_VALIDOS.find(t=>t.toLowerCase()===raw.trim().toLowerCase());
  return match||'Other';
}

// ─────────────────────────────────────────────────────────────
// RESOLVERS
// ─────────────────────────────────────────────────────────────
function findSite(db,nombre){
  const n=nombre.trim().toLowerCase();
  return db.sites.find(s=>s.nombre.toLowerCase()===n)||null;
}
// Llave natural: nombre + site (case-insensitive). Fallback: id interno
// (para compatibilidad con CSVs viejos que pudieran traer el id).
function findRack(db,nombre,siteId){
  const n=nombre.trim().toLowerCase();
  if (siteId) {
    const bySiteAndName = db.racks.find(r=>r.siteId===siteId && r.nombre.toLowerCase()===n);
    if (bySiteAndName) return bySiteAndName;
  }
  return db.racks.find(r=>r.nombre.toLowerCase()===n) || db.racks.find(r=>r.id===nombre.trim()) || null;
}
function findEquipo(db,id){
  const v=(id||'').trim().toLowerCase();
  return db.equipos.find(e=>e.id===id.trim())
      || db.equipos.find(e=>(e.numeroSerie||'').toLowerCase()===v)
      || db.equipos.find(e=>(e.modelo||'').toLowerCase()===v)
      || null;
}

// ─────────────────────────────────────────────────────────────
// PARSERS POR ENTIDAD
// Lee header para encontrar columnas por nombre
// ─────────────────────────────────────────────────────────────

// RACKS — CSV: nombre, site, ubicacion, unidades
function parseRacks(rows, db) {
  const header  = rows[0].map(h=>h.trim().toLowerCase());
  const iNombre = header.findIndex(h=>h==='nombre');
  const iSite   = header.findIndex(h=>h==='site'||h==='site_nombre'||h==='site_id');
  const iUbic   = header.findIndex(h=>h==='ubicacion');
  const iUnid   = header.findIndex(h=>h==='unidades'||h==='u');
  if (iNombre<0) throw new Error('Columna "nombre" no encontrada.');
  if (iSite<0)   throw new Error('Columna "site" no encontrada.');
  return rows.slice(1)
    .filter(r=>r.some(v=>v.trim()!==''))
    .map((r,i)=>{
      const nombre    = cv(r,iNombre,'').trim();
      const siteNom   = cv(r,iSite,'').trim();
      const ubicacion = iUbic>=0 ? cv(r,iUbic,'N/A') : 'N/A';
      const uRaw      = iUnid>=0 ? cv(r,iUnid,'') : '';
      const unidades  = (uRaw!==''&&parseInt(uRaw)>0) ? parseInt(uRaw) : 42;
      const siteObj   = siteNom ? findSite(db,siteNom) : null;
      const exist     = (nombre && siteObj) ? findRack(db,nombre,siteObj.id) : null;
      return { _row:i+2, nombre, site:siteNom, ubicacion, unidades,
               _siteId:siteObj?siteObj.id:null, _existId:exist?exist.id:null,
               _missingNombre:!nombre, _missingSite:!siteNom, _siteNoExiste:!siteObj&&!!siteNom };
    });
}

// EQUIPOS — CSV: modelo, rack, numero_serie, puerto_conexion, servicio, estado, u_pos, u_size
function parseEquipos(rows, db) {
  const header    = rows[0].map(h=>h.trim().toLowerCase());
  const iModelo   = header.findIndex(h=>h==='modelo');
  const iRack     = header.findIndex(h=>h==='rack'||h==='rack_nombre'||h==='rack_id');
  const iSite     = header.findIndex(h=>h==='site'||h==='site_nombre'||h==='site_id');
  const iSerie    = header.findIndex(h=>h==='numero_serie'||h==='serie'||h==='sn');
  const iPuerto   = header.findIndex(h=>h==='puerto_conexion'||h==='puerto');
  const iServicio = header.findIndex(h=>h==='servicio');
  const iEstado   = header.findIndex(h=>h==='estado');
  const iUPos     = header.findIndex(h=>h==='u_pos'||h==='upos');
  const iUSize    = header.findIndex(h=>h==='u_size'||h==='usize'||h==='u');
  if (iModelo<0) throw new Error('Columna "modelo" no encontrada.');
  if (iRack<0)   throw new Error('Columna "rack" no encontrada.');
  const autoUPos = {};
  return rows.slice(1)
    .filter(r=>r.some(v=>v.trim()!==''))
    .map((r,i)=>{
      const modelo      = cv(r,iModelo,'').trim();
      const rackNom     = cv(r,iRack,'').trim();
      const siteNom     = iSite>=0 ? cv(r,iSite,'').trim() : '';
      const numeroSerie = iSerie>=0    ? cv(r,iSerie,'N/A')    : 'N/A';
      const puerto      = iPuerto>=0   ? cv(r,iPuerto,'N/A')   : 'N/A';
      const servicio    = iServicio>=0 ? cv(r,iServicio,'N/A') : 'N/A';
      const estadoRaw   = iEstado>=0   ? cv(r,iEstado,'')      : '';
      const estado      = estadoRaw===''?'Inactivo':estadoRaw;
      const uSizeRaw    = iUSize>=0    ? cv(r,iUSize,'')       : '';
      const uSize       = (uSizeRaw!==''&&parseInt(uSizeRaw)>0)?parseInt(uSizeRaw):1;
      const siteObj     = siteNom ? findSite(db,siteNom) : null;
      const rackObj     = rackNom ? findRack(db,rackNom, siteObj?siteObj.id:null) : null;
      const rk          = (rackObj?rackObj.id:rackNom.toLowerCase())||'__unknown__';
      if (!autoUPos[rk]) autoUPos[rk]=1;
      const uPosRaw     = iUPos>=0 ? cv(r,iUPos,'') : '';
      let uPos;
      if (uPosRaw!==''&&parseInt(uPosRaw)>0){uPos=parseInt(uPosRaw);autoUPos[rk]=uPos+uSize;}
      else {uPos=autoUPos[rk]; autoUPos[rk]+=uSize;}
      // Duplicate detection: by numeroSerie (if not N/A), then by modelo+rack
      let existEquipo = null;
      if (numeroSerie !== 'N/A') {
        existEquipo = db.equipos.find(e => e.numeroSerie === numeroSerie) || null;
      }
      if (!existEquipo && rackObj) {
        existEquipo = db.equipos.find(e =>
          e.rackId === rackObj.id &&
          (e.modelo||'').toLowerCase() === modelo.toLowerCase()
        ) || null;
      }
      return { _row:i+2, modelo, rack:rackNom, numeroSerie, puerto, servicio, estado, uPos, uSize,
               _rackId:rackObj?rackObj.id:null, _existId:existEquipo?existEquipo.id:null,
               _missingModelo:!modelo, _missingRack:!rackNom,
               _rackNoExiste:!rackObj&&!!rackNom };
    });
}

// CONEXIONES — CSV: equipo_id, id, tipo, estado, destino
function parseConexiones(rows, db) {
  const header  = rows[0].map(h=>h.trim().toLowerCase());
  const iEqId   = header.findIndex(h=>['equipo_id','equipo','numeroserie','sn'].includes(h.replace(/\s/g,'')));
  const iId     = header.findIndex(h=>h==='id'||h==='puerto');
  const iTipo   = header.findIndex(h=>h==='tipo'||h==='type');
  const iEstado = header.findIndex(h=>h==='estado'||h==='status');
  const iDest   = header.findIndex(h=>h==='destino'||h==='destination');
  if (iEqId<0) throw new Error('Columna "equipo_id" no encontrada.');
  if (iId<0)   throw new Error('Columna "id" no encontrada.');
  if (iTipo<0) throw new Error('Columna "tipo" no encontrada.');
  return rows.slice(1)
    .filter(r=>r.some(v=>v.trim()!==''))
    .map((r,i)=>{
      const equipoId  = cv(r,iEqId,'').trim();
      const id        = cv(r,iId,'').trim();
      const tipo      = normTipo(iTipo>=0?cv(r,iTipo,''):'');
      const estadoRaw = iEstado>=0 ? cv(r,iEstado,'') : '';
      const estado    = estadoRaw===''?'Inactivo':estadoRaw;
      const destino   = iDest>=0 ? cv(r,iDest,'N/A') : 'N/A';
      const eqObj     = equipoId ? findEquipo(db,equipoId) : null;
      // Duplicate detection: check if this (equipoId, id) connection already exists
      const existConex = (eqObj && id)
        ? (db.conexiones.find(c => c.equipoId === eqObj.id && c.id === id) || null)
        : null;
      return { _row:i+2, equipoId, id, tipo, estado, destino,
               _eqId:eqObj?eqObj.id:null, _existId:existConex?true:false,
               _missingId:!id, _missingEqId:!equipoId,
               _eqNoExiste:!eqObj&&!!equipoId };
    });
}

// ─────────────────────────────────────────────────────────────
// PREVIEW BUILDERS
// ─────────────────────────────────────────────────────────────
function previewRacks(data) {
  if (!data.length) return '<div class="import-hint">Sin datos.</div>';
  let html='<table><thead><tr><th>#</th><th>Nombre</th><th>Site</th><th>Ubicacion</th><th>U</th><th>Resultado</th></tr></thead><tbody>';
  html+=data.map(r=>`<tr>
    <td>${r._row}</td>
    <td class="${r._missingNombre?'cell-warn':'cell-ok'}">${esc(r.nombre||'(vacío)')}</td>
    <td class="${r._missingSite||r._siteNoExiste?'cell-warn':'cell-ok'}">${r._missingSite?'⚠ Requerido':r._siteNoExiste?'⚠ No existe: '+esc(r.site):esc(r.site)}</td>
    <td class="${r.ubicacion==='N/A'?'cell-na':'cell-ok'}">${esc(r.ubicacion)}</td>
    <td class="${r.unidades===42?'cell-na':'cell-ok'}">${r.unidades}</td>
    <td class="${r._missingNombre||r._missingSite||r._siteNoExiste?'cell-warn':r._existId?'cell-na':'cell-new'}">${r._missingNombre||r._missingSite||r._siteNoExiste?'⚠ Con error':r._existId?'Actualizar':'Nuevo'}</td>
  </tr>`).join('');
  return html+'</tbody></table>';
}

function previewEquipos(data) {
  if (!data.length) return '<div class="import-hint">Sin datos.</div>';
  let html='<table><thead><tr><th>#</th><th>Modelo</th><th>Rack</th><th>N° Serie</th><th>Servicio</th><th>Estado</th><th>uPos</th><th>uSz</th><th>Resultado</th></tr></thead><tbody>';
  html+=data.map(e=>`<tr>
    <td>${e._row}</td>
    <td class="${e._missingModelo?'cell-warn':'cell-ok'}">${esc(e.modelo||'(vacío)')}</td>
    <td class="${e._missingRack||e._rackNoExiste?'cell-warn':'cell-ok'}">${e._missingRack?'⚠ Requerido':e._rackNoExiste?'⚠ No existe: '+esc(e.rack):esc(e.rack)}</td>
    <td class="${e.numeroSerie==='N/A'?'cell-na':'cell-ok'}">${esc(e.numeroSerie)}</td>
    <td class="${e.servicio==='N/A'?'cell-na':'cell-ok'}">${esc(e.servicio)}</td>
    <td class="${e.estado==='Inactivo'?'cell-na':'cell-ok'}">${esc(e.estado)}</td>
    <td class="cell-ok">${e.uPos}</td>
    <td class="${e.uSize===1?'cell-na':'cell-ok'}">${e.uSize}</td>
    <td class="${e._missingModelo||e._rackNoExiste?'cell-warn':e._existId?'cell-na':'cell-new'}">${e._missingModelo||e._rackNoExiste?'⚠ Con error':e._existId?'Actualizar':'Nuevo'}</td>
  </tr>`).join('');
  return html+'</tbody></table>';
}

function previewConexiones(data) {
  if (!data.length) return '<div class="import-hint">Sin conexiones.</div>';
  let html='<table><thead><tr><th>#</th><th>Equipo ID</th><th>Puerto</th><th>Tipo</th><th>Estado</th><th>Destino</th><th>Resultado</th></tr></thead><tbody>';
  html+=data.slice(0,80).map(c=>`<tr>
    <td>${c._row}</td>
    <td class="${c._missingEqId||c._eqNoExiste?'cell-warn':'cell-ok'}">${c._missingEqId?'⚠ Vacío':c._eqNoExiste?'⚠ No existe: '+esc(c.equipoId):esc(c.equipoId)}</td>
    <td class="${c._missingId?'cell-warn':'cell-ok'}">${esc(c.id||'⚠ Vacío')}</td>
    <td class="cell-ok">${esc(c.tipo)}</td>
    <td class="${c.estado==='Inactivo'?'cell-na':'cell-ok'}">${esc(c.estado)}</td>
    <td class="${c.destino==='N/A'?'cell-na':'cell-ok'}">${esc(c.destino)}</td>
    <td class="${c._missingId||c._eqNoExiste?'cell-warn':c._existId?'cell-na':'cell-new'}">${c._missingId||c._eqNoExiste?'⚠ Con error':c._existId?'Actualizar':'Nueva'}</td>
  </tr>`).join('');
  html+='</tbody></table>';
  if (data.length>80) html+=`<div class="import-hint">Mostrando 80 de ${data.length} filas.</div>`;
  return html;
}

// ─────────────────────────────────────────────────────────────
// IMPORTADORES POR ENTIDAD
// ─────────────────────────────────────────────────────────────
async function importRacks(db, data) {
  let ok=0; const errors=[];
  for (const r of data) {
    if (r._missingNombre) { errors.push(`Fila ${r._row}: nombre vacío.`); continue; }
    if (r._missingSite)   { errors.push(`Fila ${r._row} "${r.nombre}": site vacío.`); continue; }
    if (r._siteNoExiste)  { errors.push(`Fila ${r._row} "${r.nombre}": site "${r.site}" no existe.`); continue; }
    const siteObj = findSite(db, r.site);
    if (!siteObj) { errors.push(`Fila ${r._row}: site "${r.site}" no encontrado.`); continue; }
    try {
      if (r._existId) {
        await DB.updateRack(db,{id:r._existId, siteId:siteObj.id, nombre:r.nombre, ubicacion:r.ubicacion, unidades:r.unidades});
      } else {
        await DB.insertRack(db,{siteId:siteObj.id, nombre:r.nombre, ubicacion:r.ubicacion, unidades:r.unidades});
      }
      ok++;
    }
    catch(e) { errors.push(`Fila ${r._row} "${r.nombre}": ${e.message}`); }
  }
  return {ok, err:errors.length, errors};
}

async function importEquipos(db, data) {
  let ok=0; const errors=[];
  for (const e of data) {
    if (e._missingModelo) { errors.push(`Fila ${e._row}: modelo vacío.`); continue; }
    if (e._missingRack)   { errors.push(`Fila ${e._row} "${e.modelo}": rack vacío.`); continue; }
    if (e._rackNoExiste)  { errors.push(`Fila ${e._row} "${e.modelo}": rack "${e.rack}" no existe.`); continue; }
    const rackId = e._rackId;
    if (!rackId) { errors.push(`Fila ${e._row}: rack "${e.rack}" no encontrado.`); continue; }
    try {
      if (e._existId) {
        await DB.updateEquipo(db,{id:e._existId, rackId, modelo:e.modelo, numeroSerie:e.numeroSerie,
          puertoConexion:e.puerto, servicio:e.servicio, estado:e.estado, uPos:e.uPos, uSize:e.uSize});
      } else {
        await DB.insertEquipo(db,{rackId, modelo:e.modelo, numeroSerie:e.numeroSerie,
          puertoConexion:e.puerto, servicio:e.servicio, estado:e.estado, uPos:e.uPos, uSize:e.uSize});
      }
      ok++;
    }
    catch(e2) { errors.push(`Fila ${e._row} "${e.modelo}": ${e2.message}`); }
  }
  return {ok, err:errors.length, errors};
}

async function importConexiones(db, data) {
  let ok=0; const errors=[];
  for (const conn of data) {
    if (conn._missingId)   { errors.push(`Fila ${conn._row}: id/puerto vacío.`); continue; }
    if (conn._missingEqId) { errors.push(`Fila ${conn._row}: equipo_id vacío.`); continue; }
    if (conn._eqNoExiste)  { errors.push(`Fila ${conn._row}: equipo "${conn.equipoId}" no existe.`); continue; }
    const eqObj = findEquipo(db, conn.equipoId);
    if (!eqObj) { errors.push(`Fila ${conn._row}: equipo "${conn.equipoId}" no encontrado.`); continue; }
    try {
      if (conn._existId) {
        await DB.updateConexion(db,{id:conn.id, equipoId:eqObj.id, tipo:conn.tipo, estado:conn.estado, destino:conn.destino});
      } else {
        await DB.insertConexion(db,{id:conn.id, equipoId:eqObj.id, tipo:conn.tipo, estado:conn.estado, destino:conn.destino});
      }
      ok++;
    }
    catch(e) { errors.push(`Fila ${conn._row} "${conn.id}": ${e.message}`); }
  }
  return {ok, err:errors.length, errors};
}

// ─────────────────────────────────────────────────────────────
// CONFIG DE TABS — define cada pestaña de forma declarativa
// ─────────────────────────────────────────────────────────────
const TABS = {
  racks: {
    label: 'Racks', emoji: '🗄️',
    parse:   (rows,db) => parseRacks(rows,db),
    preview: (data)    => previewRacks(data),
    import:  (db,data) => importRacks(db,data),
    stats:   (data)    => ({
      Registros: data.length,
      Nuevos: data.filter(d=>!d._existId&&!d._missingNombre&&!d._missingSite&&!d._siteNoExiste).length,
      'Actualizar': data.filter(d=>d._existId).length,
      Errores: data.filter(d=>d._missingNombre||d._missingSite||d._siteNoExiste).length,
    }),
    hint: {
      title: 'Racks',
      note:  'El <b>site debe existir</b> primero. Si ya existe un rack con el mismo <b>nombre</b> en el mismo <b>site</b>, se <b>actualiza</b> en lugar de crear uno nuevo. <b>ubicacion</b> y <b>unidades</b> son opcionales (default: N/A y 42U).',
      cols:  [
        { name:'nombre',    req:true,  desc:'Nombre del rack' },
        { name:'site',      req:true,  desc:'Nombre exacto del site padre' },
        { name:'ubicacion', req:false, desc:'Fila / sala fisica' },
        { name:'unidades',  req:false, desc:'Altura en U (default 42)' },
      ],
      example: [['Rack-Core-01','Site Core','Sala Fria A','42'],['Rack-Edge-01','Site Edge','Sala B','24'],['Rack-01','Site GDL','','']],
    },
  },
  equipos: {
    label: 'Equipos', emoji: '🖥️',
    parse:   (rows,db) => parseEquipos(rows,db),
    preview: (data)    => previewEquipos(data),
    import:  (db,data) => importEquipos(db,data),
    stats:   (data)    => ({
      Registros: data.length,
      Nuevos: data.filter(d=>!d._existId&&!d._missingModelo&&!d._missingRack&&!d._rackNoExiste).length,
      'Actualizar': data.filter(d=>d._existId).length,
      Errores: data.filter(d=>d._missingModelo||d._missingRack||d._rackNoExiste).length,
    }),
    hint: {
      title: 'Equipos',
      note:  'El <b>rack debe existir</b>. Si ya existe un equipo con el mismo <b>número de serie</b> (o el mismo modelo en el mismo rack), se <b>actualiza</b> en lugar de crear uno nuevo. <b>u_pos</b> vacío = asignación automática secuencial.',
      cols:  [
        { name:'modelo',          req:true,  desc:'Modelo del equipo' },
        { name:'rack',            req:true,  desc:'Nombre exacto del rack' },
        { name:'numero_serie',    req:false, desc:'Número de serie (default N/A)' },
        { name:'puerto_conexion', req:false, desc:'Puerto principal (default N/A)' },
        { name:'servicio',        req:false, desc:'Descripcion del servicio' },
        { name:'estado',          req:false, desc:'Activo / Inactivo (default Inactivo)' },
        { name:'u_pos',           req:false, desc:'Posicion en rack (default auto)' },
        { name:'u_size',          req:false, desc:'Altura en U (default 1)' },
      ],
      example: [
        ['Cisco Nexus 9300','Rack-Core-01','SN-001','Te1/0/1','Core LAN','Activo','1','2'],
        ['Dell PowerEdge R750','Rack-Core-01','SN-002','eth0','Servidor DB','Activo','','2'],
        ['APC Smart-UPS 3000','Rack-Core-01','','','Energia','Activo','','2'],
      ],
    },
  },
  conexiones: {
    label: 'Conexiones', emoji: '🔌',
    parse:   (rows,db) => parseConexiones(rows,db),
    preview: (data)    => previewConexiones(data),
    import:  (db,data) => importConexiones(db,data),
    stats:   (data)    => ({
      Registros: data.length,
      Nuevas: data.filter(d=>!d._existId&&!d._missingId&&!d._eqNoExiste).length,
      'Actualizar': data.filter(d=>d._existId).length,
      Errores: data.filter(d=>d._missingId||d._missingEqId||d._eqNoExiste).length,
    }),
    hint: {
      title: 'Conexiones',
      note:  '<b>equipo_id</b> acepta numero de serie, ID interno o modelo. El equipo debe existir en BD. Si la conexion (equipo + puerto) ya existe, se <b>actualiza</b>.',
      cols:  [
        { name:'equipo_id', req:true,  desc:'N° de serie o ID del equipo' },
        { name:'id',        req:true,  desc:'Identificador del puerto (ej. Gi1/0/1)' },
        { name:'tipo',      req:true,  desc:'RJ45 · SFP+ · SFP · Serial · Console · Fiber · USB · Other' },
        { name:'estado',    req:false, desc:'Activo / Inactivo (default Inactivo)' },
        { name:'destino',   req:false, desc:'serie_destino:puerto (default N/A)' },
      ],
      example: [
        ['SN-001','Te1/0/1','SFP+','Activo','SN-002:Te1/0/1'],
        ['SN-001','mgmt','RJ45','Activo',''],
        ['SN-002','eth0','RJ45','Inactivo',''],
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────
// HINT BUILDER — genera la tabla de formato desde config
// ─────────────────────────────────────────────────────────────
function buildHint(cfg) {
  const { title, note, cols, example } = cfg;
  const colHeaders = cols.map(c=>
    `<th class="${c.req?'hint-th-req':'hint-th-opt'}">${c.name}${c.req?'':' <span class="hint-opt-mark">opt</span>'}</th>`
  ).join('');
  const descRow = cols.map(c=>
    `<td class="hint-td hint-desc-val">${esc(c.desc)}</td>`
  ).join('');
  const exRows = example.map(row=>
    '<tr>'+cols.map((_,i)=>`<td class="hint-td hint-ex-val">${esc(row[i]||'')}</td>`).join('')+'</tr>'
  ).join('');
  return `
    <b>CSV — ${title}</b>
    <div class="hint-note">${note}</div>
    <table class="hint-table">
      <thead>
        <tr>${colHeaders}</tr>
        <tr class="hint-desc-row">${descRow}</tr>
      </thead>
      <tbody>
        <tr class="hint-ex-label"><td colspan="${cols.length}">↓ Ejemplo de datos</td></tr>
        ${exRows}
      </tbody>
    </table>
    <div class="hint-legend">
      <span class="hint-leg-item"><span class="hint-leg-dot hint-req-dot"></span>campo requerido</span>
      <span class="hint-leg-item"><span class="hint-leg-dot hint-opt-dot"></span>opcional — vacío usa valor por defecto</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────
export function openImportModal(db, onDone) {
  let activeTab = 'racks';
  let parsedData = null;

  const { openModal } = window._modalAPI;

  function getTabsHTML() {
    return '<div class="import-tabs">'
      + Object.entries(TABS).map(([key,t])=>
          `<div class="import-tab${activeTab===key?' active':''}" data-tab="${key}">${t.emoji} ${t.label}</div>`
        ).join('')
      + '</div>';
  }

  function getHTML() {
    const tab = TABS[activeTab];
    return getTabsHTML()
      + `<div class="import-hint-block">${buildHint(tab.hint)}</div>`
      + '<div class="import-drop-zone" id="importDropZone">'
      + '<div class="drop-icon">&#128194;</div>'
      + `<div>Arrastra tu CSV de <b>${tab.label}</b> aqui</div>`
      + '<div style="margin-top:6px;opacity:.6">o haz clic para seleccionar</div>'
      + '<input type="file" id="importFileInput" accept=".csv" style="display:none">'
      + '</div>'
      + '<div id="importPreviewWrap" style="display:none">'
      + '<div class="import-stats" id="importStats"></div>'
      + '<div class="import-preview" id="importPreview"></div>'
      + '</div>'
      + '<div class="import-result" id="importResult" style="display:none"></div>';
  }

  function getFooter() {
    return '<button class="btn" onclick="closeModal()">✕ Cancelar</button>'
      + '<button class="btn" id="btnImportClear" style="display:none" onclick="window._importClear()">↺ Limpiar</button>'
      + '<button class="btn primary" id="btnImportRun" disabled onclick="window._importRun()">⬆ Importar</button>';
  }

  openModal('IMPORTAR CSV', getHTML(), getFooter());

  function showResult(type, msg) {
    const el=document.getElementById('importResult');
    if (!el) return;
    el.className='import-result '+type;
    el.innerHTML=msg;
    el.style.display='';
  }

  function updateStats(obj) {
    const el=document.getElementById('importStats');
    if (!el) return;
    el.innerHTML=Object.entries(obj).map(([k,v])=>`<div class="import-stat">${k}: <b>${v}</b></div>`).join('');
  }

  function renderPreview() {
    const wrap=document.getElementById('importPreviewWrap');
    const prev=document.getElementById('importPreview');
    if (!parsedData||!wrap||!prev) return;
    const tab = TABS[activeTab];
    updateStats(tab.stats(parsedData));
    prev.innerHTML = tab.preview(parsedData);
    wrap.style.display='';
    document.getElementById('btnImportRun').disabled = parsedData.length===0;
  }

  function loadFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) { showResult('error','Solo se aceptan archivos .csv'); return; }
    const reader=new FileReader();
    reader.onload=ev=>{
      try {
        const rows=parseCSV(ev.target.result);
        if (rows.length<2) { showResult('error','Archivo vacío o sin datos.'); return; }
        parsedData = TABS[activeTab].parse(rows, db);
        const zone=document.getElementById('importDropZone');
        zone.innerHTML=`<div class="drop-icon">&#9989;</div><div><b>${esc(file.name)}</b></div><div style="opacity:.6;margin-top:4px;">${rows.length-1} filas detectadas</div>`;
        zone.style.borderColor='rgba(0,200,110,0.5)';
        zone.style.background='rgba(0,200,110,0.04)';
        zone.onclick=null;
        renderPreview();
        document.getElementById('btnImportClear').style.display='';
        document.getElementById('importResult').style.display='none';
      } catch(err) { showResult('error','Error al parsear: '+err.message); }
    };
    reader.readAsText(file,'UTF-8');
  }

  function rebind() {
    document.querySelectorAll('.import-tab').forEach(tab=>{
      tab.onclick=()=>{
        activeTab=tab.dataset.tab;
        parsedData=null;
        document.getElementById('modalBody').innerHTML=getHTML();
        document.getElementById('btnImportRun').disabled=true;
        document.getElementById('btnImportClear').style.display='none';
        rebind();
      };
    });
    const zone=document.getElementById('importDropZone');
    const fileInput=document.getElementById('importFileInput');
    zone.onclick=()=>fileInput.click();
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragover');if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0]);});
    fileInput.onchange=e=>{if(e.target.files[0])loadFile(e.target.files[0]);};
  }

  window._importClear=()=>{
    parsedData=null;
    document.getElementById('modalBody').innerHTML=getHTML();
    document.getElementById('btnImportRun').disabled=true;
    document.getElementById('btnImportClear').style.display='none';
    rebind();
  };

  window._importRun=async()=>{
    if (!parsedData) return;
    const btnRun=document.getElementById('btnImportRun');
    const btnClear=document.getElementById('btnImportClear');
    btnRun.disabled=true;
    btnRun.textContent='Importando...';
    if (btnClear) btnClear.style.display='none';
    try {
      const result = await TABS[activeTab].import(db, parsedData);
      await DB.loadFromServer(db);
      onDone&&onDone();
      const errDetail = result.errors.length
        ? '<br><br><span style="opacity:.75;font-size:10px;">'
          + result.errors.slice(0,10).map(e=>'• '+esc(e)).join('<br>')
          + (result.errors.length>10?`<br>...y ${result.errors.length-10} más`:'')
          + '</span>'
        : '';
      showResult(
        result.err===0 ? 'ok' : result.ok>0 ? 'warn' : 'error',
        result.err===0
          ? `<b>${result.ok} registro(s)</b> importados correctamente.`
          : `${result.ok} importados · ${result.err} con error.${errDetail}`
      );
    } catch(e) { showResult('error','Error inesperado: '+(e?.message||e)); }
    finally { btnRun.textContent='⬆ Importar'; btnRun.disabled=false; }
  };

  rebind();
}
