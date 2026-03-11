// import.js — Importacion CSV  (2 modos: Infraestructura | Conexiones)
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
function c(row, idx, fallback) {
  if (fallback===undefined) fallback='N/A';
  if (idx==null||idx<0||idx>=row.length) return fallback;
  const v=(row[idx]!=null?row[idx]:'').toString().trim();
  if (v===''||v.toUpperCase()==='NO SE AGREGA') return fallback;
  return v;
}

const TIPO_VALIDOS = ['RJ45','SFP+','SFP','Serial','Console','Fiber','USB','Other'];
function normTipo(raw) {
  if (!raw||raw.trim()==='') return 'Other';
  const match = TIPO_VALIDOS.find(t=>t.toLowerCase()===raw.trim().toLowerCase());
  return match||'Other';
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─────────────────────────────────────────────────────────────
// RESOLVERS
// ─────────────────────────────────────────────────────────────
function findLocacion(db,nombre){
  const n=nombre.trim().toLowerCase();
  return db.locaciones.find(l=>l.nombre.toLowerCase()===n)||null;
}
function findSite(db,nombre){
  const n=nombre.trim().toLowerCase();
  return db.sites.find(s=>s.nombre.toLowerCase()===n)||null;
}
function findRack(db,nombre){
  const n=nombre.trim().toLowerCase();
  return db.racks.find(r=>r.nombre.toLowerCase()===n)||db.racks.find(r=>r.id===nombre.trim())||null;
}
function findEquipo(db,id){
  const v=(id||'').trim().toLowerCase();
  return db.equipos.find(e=>e.id===id.trim())
      || db.equipos.find(e=>(e.numeroSerie||'').toLowerCase()===v)
      || db.equipos.find(e=>(e.modelo||'').toLowerCase()===v)
      || null;
}

// ─────────────────────────────────────────────────────────────
// PARSE INFRAESTRUCTURA
// Col 0-1: LOCACIONES (id auto, nombre)
// Col 2-4: SITES      (id auto, locacion_id, nombre)
// Col 5-9: RACKS      (id auto, site_id, nombre, ubicacion, unidades)
// Col 10-18: EQUIPOS  (id auto, rack_id, modelo, serie, puerto, servicio, estado, u_pos, u_size)
// ─────────────────────────────────────────────────────────────
function parseInfra(rows, db) {
  const hasSectionRow = rows[0]&&rows[0].join(',').toUpperCase().includes('LOCACION');
  const dataStart = hasSectionRow ? 2 : 1;
  const dataRows  = rows.slice(dataStart).filter(r=>r.some(v=>v.trim()!==''&&v.toUpperCase()!=='NO SE AGREGA'));

  // Indices fijos segun formato CSV
  const L_NOMBRE=1;
  const S_LOC_REF=3, S_NOMBRE=4;
  const R_SITE_REF=6, R_NOMBRE=7, R_UBICACION=8, R_UNIDADES=9;
  const E_RACK_REF=11,E_MODELO=12,E_SERIE=13,E_PUERTO=14,E_SERVICIO=15,E_ESTADO=16,E_UPOS=17,E_USIZE=18;

  const locaciones=[],sites=[],racks=[],equipos=[];
  const seenLoc=new Map(),seenSite=new Map(),seenRack=new Map();
  const autoUPos={};

  dataRows.forEach((row,i)=>{
    const rowNum=i+dataStart+1;

    // LOCACION
    const locNombre=c(row,L_NOMBRE,'').trim();
    let locKey=null;
    if(locNombre!==''){
      const key=locNombre.toLowerCase();
      if(seenLoc.has(key)){locKey=seenLoc.get(key);}
      else{
        const exist=findLocacion(db,locNombre);
        locKey=exist?exist.id:('__LOC__'+locNombre);
        seenLoc.set(key,locKey);
        locaciones.push({_row:rowNum,nombre:locNombre,_existId:exist?exist.id:null,_key:locKey});
      }
    }

    // SITE
    const siteNombre=c(row,S_NOMBRE,'').trim();
    let siteKey=null;
    if(siteNombre!==''){
      const key=siteNombre.toLowerCase();
      if(seenSite.has(key)){siteKey=seenSite.get(key);}
      else{
        const exist=findSite(db,siteNombre);
        let parentLocKey=locKey;
        if(!parentLocKey){
          const locRef=c(row,S_LOC_REF,'');
          if(locRef!==''){const f=[...seenLoc.entries()].find(([k])=>k===locRef.toLowerCase());if(f)parentLocKey=f[1];}
        }
        siteKey=exist?exist.id:('__SITE__'+siteNombre);
        seenSite.set(key,siteKey);
        sites.push({_row:rowNum,nombre:siteNombre,_locKey:parentLocKey,_existId:exist?exist.id:null,_key:siteKey});
      }
    }

    // RACK
    const rackNombre=c(row,R_NOMBRE,'').trim();
    let rackKey=null;
    if(rackNombre!==''){
      const key=rackNombre.toLowerCase();
      if(seenRack.has(key)){rackKey=seenRack.get(key);}
      else{
        const exist=findRack(db,rackNombre);
        let parentSiteKey=siteKey;
        if(!parentSiteKey){
          const siteRef=c(row,R_SITE_REF,'');
          if(siteRef!==''){const f=[...seenSite.entries()].find(([k])=>k===siteRef.toLowerCase());if(f)parentSiteKey=f[1];}
        }
        const ubicacion=c(row,R_UBICACION,'N/A');
        const uRaw=c(row,R_UNIDADES,'');
        const unidades=(uRaw!==''&&parseInt(uRaw)>0)?parseInt(uRaw):42;
        rackKey=exist?exist.id:('__RACK__'+rackNombre);
        seenRack.set(key,rackKey);
        racks.push({_row:rowNum,nombre:rackNombre,ubicacion,unidades,_siteKey:parentSiteKey,_existId:exist?exist.id:null,_key:rackKey});
        if(!autoUPos[rackKey])autoUPos[rackKey]=1;
      }
    }

    // EQUIPO
    const modelo=c(row,E_MODELO,'').trim();
    if(modelo!==''){
      const rackRef=c(row,E_RACK_REF,'');
      let eqRackKey=rackKey;
      if(!eqRackKey&&rackRef!==''){
        const f=[...seenRack.entries()].find(([k])=>k===rackRef.toLowerCase());
        if(f){eqRackKey=f[1];}
        else{const er=findRack(db,rackRef);if(er)eqRackKey=er.id;}
      }
      const numeroSerie=c(row,E_SERIE,'N/A');
      const puertoConexion=c(row,E_PUERTO,'N/A');
      const servicio=c(row,E_SERVICIO,'N/A');
      const estadoRaw=c(row,E_ESTADO,'');
      const estado=estadoRaw===''?'Inactivo':estadoRaw;
      const uSizeRaw=c(row,E_USIZE,'');
      const uSize=(uSizeRaw!==''&&parseInt(uSizeRaw)>0)?parseInt(uSizeRaw):1;
      const rk=eqRackKey||'__unknown__';
      if(!autoUPos[rk])autoUPos[rk]=1;
      const uPosRaw=c(row,E_UPOS,'');
      let uPos;
      if(uPosRaw!==''&&parseInt(uPosRaw)>0){uPos=parseInt(uPosRaw);autoUPos[rk]=uPos+uSize;}
      else{uPos=autoUPos[rk];autoUPos[rk]+=uSize;}
      equipos.push({_row:rowNum,modelo,numeroSerie,puertoConexion,servicio,estado,uPos,uSize,_rackKey:eqRackKey});
    }
  });

  return {locaciones,sites,racks,equipos};
}

// ─────────────────────────────────────────────────────────────
// PARSE CONEXIONES
// ─────────────────────────────────────────────────────────────
function parseConexiones(rows) {
  const header=rows[0]?rows[0].map(h=>h.trim().toLowerCase()):[];
  const hasHeader=header.some(h=>h.includes('id')||h.includes('equipo')||h.includes('tipo'));
  const dataRows=hasHeader?rows.slice(1):rows;
  let iEqId=1,iId=0,iTipo=2,iEst=3,iDest=4;
  if(hasHeader){
    header.forEach((h,i)=>{
      const k=h.replace(/[\s_]/g,'');
      if(['equipoid','equipo','equipo_id','numeroserie','num_serie','sn','deviceid'].includes(k)) iEqId=i;
      else if(['id','puerto','idpuerto','port','interface'].includes(k)) iId=i;
      else if(k==='tipo'||k==='type') iTipo=i;
      else if(k==='estado'||k==='status'||k==='state') iEst=i;
      else if(['destino','destination','dest','destino'].includes(k)) iDest=i;
    });
  }
  return dataRows
    .filter(r=>r.some(v=>v.trim()!==''&&v.toUpperCase()!=='NO SE AGREGA'))
    .map((r,i)=>{
      const id=c(r,iId,'').trim();
      const equipoId=c(r,iEqId,'').trim();
      const tipo=normTipo(c(r,iTipo,''));
      const estadoRaw=c(r,iEst,'');
      const estado=estadoRaw===''?'Inactivo':estadoRaw;
      const destino=c(r,iDest,'N/A');
      return{_row:i+(hasHeader?2:1),id,equipoId,tipo,estado,destino,_idMissing:!id,_eqMissing:!equipoId};
    });
}

// ─────────────────────────────────────────────────────────────
// PREVIEW
// ─────────────────────────────────────────────────────────────
function buildPreviewInfra(data) {
  let html='';
  if(data.locaciones.length){
    html+='<div class="preview-section-title">LOCACIONES ('+data.locaciones.length+')</div>';
    html+='<table><thead><tr><th>#</th><th>Nombre</th><th>Estado</th></tr></thead><tbody>';
    html+=data.locaciones.map(l=>'<tr><td>'+l._row+'</td><td class="cell-ok">'+esc(l.nombre)+'</td><td class="'+(l._existId?'cell-na':'cell-new')+'">'+(l._existId?'Ya existe ('+l._existId+')':'Nuevo')+'</td></tr>').join('');
    html+='</tbody></table>';
  }
  if(data.sites.length){
    html+='<div class="preview-section-title">SITES ('+data.sites.length+')</div>';
    html+='<table><thead><tr><th>#</th><th>Nombre</th><th>Locacion</th><th>Estado</th></tr></thead><tbody>';
    html+=data.sites.map(s=>'<tr><td>'+s._row+'</td><td class="cell-ok">'+esc(s.nombre)+'</td><td class="'+(s._locKey?'cell-ok':'cell-warn')+'">'+esc(s._locKey||'Sin locacion')+'</td><td class="'+(s._existId?'cell-na':'cell-new')+'">'+(s._existId?'Ya existe':'Nuevo')+'</td></tr>').join('');
    html+='</tbody></table>';
  }
  if(data.racks.length){
    html+='<div class="preview-section-title">RACKS ('+data.racks.length+')</div>';
    html+='<table><thead><tr><th>#</th><th>Nombre</th><th>Ubicacion</th><th>U</th><th>Site</th><th>Estado</th></tr></thead><tbody>';
    html+=data.racks.map(r=>'<tr><td>'+r._row+'</td><td class="cell-ok">'+esc(r.nombre)+'</td><td class="'+(r.ubicacion==='N/A'?'cell-na':'cell-ok')+'">'+esc(r.ubicacion)+'</td><td class="'+(r.unidades===42?'cell-na':'cell-ok')+'">'+r.unidades+'</td><td class="'+(r._siteKey?'cell-ok':'cell-warn')+'">'+esc(r._siteKey||'Sin site')+'</td><td class="'+(r._existId?'cell-na':'cell-new')+'">'+(r._existId?'Ya existe':'Nuevo')+'</td></tr>').join('');
    html+='</tbody></table>';
  }
  if(data.equipos.length){
    html+='<div class="preview-section-title">EQUIPOS ('+data.equipos.length+')</div>';
    html+='<table><thead><tr><th>#</th><th>Modelo</th><th>N Serie</th><th>Puerto</th><th>Servicio</th><th>Estado</th><th>uPos</th><th>uSz</th><th>Rack</th></tr></thead><tbody>';
    html+=data.equipos.map(e=>'<tr><td>'+e._row+'</td><td class="cell-ok">'+esc(e.modelo)+'</td><td class="'+(e.numeroSerie==='N/A'?'cell-na':'cell-ok')+'">'+esc(e.numeroSerie)+'</td><td class="'+(e.puertoConexion==='N/A'?'cell-na':'cell-ok')+'">'+esc(e.puertoConexion)+'</td><td class="'+(e.servicio==='N/A'?'cell-na':'cell-ok')+'">'+esc(e.servicio)+'</td><td class="'+(e.estado==='Inactivo'?'cell-na':'cell-ok')+'">'+esc(e.estado)+'</td><td class="cell-ok">'+e.uPos+'</td><td class="'+(e.uSize===1?'cell-na':'cell-ok')+'">'+e.uSize+'</td><td class="'+(e._rackKey?'cell-ok':'cell-warn')+'">'+esc(e._rackKey||'Sin rack')+'</td></tr>').join('');
    html+='</tbody></table>';
  }
  if(!data.locaciones.length&&!data.sites.length&&!data.racks.length&&!data.equipos.length)
    html='<div class="import-hint">No se detectaron datos validos. Revisa el formato del CSV.</div>';
  return html;
}

function buildPreviewConexiones(data) {
  if(!data.length) return '<div class="import-hint">Sin conexiones para previsualizar.</div>';
  let html='<table><thead><tr><th>#</th><th>EquipoId</th><th>Id/Puerto</th><th>Tipo</th><th>Estado</th><th>Destino</th></tr></thead><tbody>';
  html+=data.slice(0,60).map(c=>'<tr><td>'+c._row+'</td><td class="'+(c._eqMissing?'cell-warn':'cell-ok')+'">'+esc(c.equipoId||'(vacio)')+'</td><td class="'+(c._idMissing?'cell-warn':'cell-ok')+'">'+esc(c.id||'(vacio)')+'</td><td class="cell-ok">'+esc(c.tipo)+'</td><td class="'+(c.estado==='Inactivo'?'cell-na':'cell-ok')+'">'+esc(c.estado)+'</td><td class="'+(c.destino==='N/A'?'cell-na':'cell-ok')+'">'+esc(c.destino)+'</td></tr>').join('');
  html+='</tbody></table>';
  if(data.length>60) html+='<div class="import-hint">Mostrando 60 de '+data.length+' filas.</div>';
  return html;
}

// ─────────────────────────────────────────────────────────────
// IMPORTACION — INFRAESTRUCTURA
// ─────────────────────────────────────────────────────────────
async function importInfra(db, data) {
  let ok=0;
  const errors=[];
  const keyToId={};

  for(const loc of data.locaciones){
    if(loc._existId){keyToId[loc._key]=loc._existId;continue;}
    try{const created=await DB.insertLocacion(db,{nombre:loc.nombre});keyToId[loc._key]=created.id;ok++;}
    catch(e){errors.push('Locacion "'+loc.nombre+'" (fila '+loc._row+'): '+e.message);}
  }
  for(const site of data.sites){
    if(site._existId){keyToId[site._key]=site._existId;continue;}
    const locacionId=site._locKey?(keyToId[site._locKey]||null):null;
    if(!locacionId){errors.push('Site "'+site.nombre+'" (fila '+site._row+'): sin locacion resuelta.');continue;}
    try{const created=await DB.insertSite(db,{locacionId,nombre:site.nombre});keyToId[site._key]=created.id;ok++;}
    catch(e){errors.push('Site "'+site.nombre+'" (fila '+site._row+'): '+e.message);}
  }
  for(const rack of data.racks){
    if(rack._existId){keyToId[rack._key]=rack._existId;continue;}
    const siteId=rack._siteKey?(keyToId[rack._siteKey]||null):null;
    if(!siteId){errors.push('Rack "'+rack.nombre+'" (fila '+rack._row+'): sin site resuelto.');continue;}
    try{const created=await DB.insertRack(db,{siteId,nombre:rack.nombre,ubicacion:rack.ubicacion,unidades:rack.unidades});keyToId[rack._key]=created.id;ok++;}
    catch(e){errors.push('Rack "'+rack.nombre+'" (fila '+rack._row+'): '+e.message);}
  }
  if(data.racks.length>0) await DB.loadFromServer(db);
  for(const eq of data.equipos){
    let rackId=eq._rackKey?(keyToId[eq._rackKey]||null):null;
    if(!rackId&&eq._rackKey&&!eq._rackKey.startsWith('__RACK__'))rackId=eq._rackKey;
    if(!rackId){errors.push('Equipo "'+eq.modelo+'" (fila '+eq._row+'): sin rack resuelto.');continue;}
    try{await DB.insertEquipo(db,{rackId,modelo:eq.modelo,numeroSerie:eq.numeroSerie,puertoConexion:eq.puertoConexion,servicio:eq.servicio,estado:eq.estado,uPos:eq.uPos,uSize:eq.uSize});ok++;}
    catch(e){errors.push('Equipo "'+eq.modelo+'" (fila '+eq._row+'): '+e.message);}
  }
  return{ok,err:errors.length,errors};
}

// ─────────────────────────────────────────────────────────────
// IMPORTACION — CONEXIONES
// ─────────────────────────────────────────────────────────────
async function importConexiones(db, data) {
  let ok=0;
  const errors=[];
  for(const conn of data){
    if(conn._idMissing){errors.push('Fila '+conn._row+': id/puerto es obligatorio.');continue;}
    if(conn._eqMissing){errors.push('Fila '+conn._row+': equipo_id es obligatorio.');continue;}
    const equipo=findEquipo(db,conn.equipoId);
    if(!equipo){errors.push('Fila '+conn._row+': equipo "'+conn.equipoId+'" no existe en la BD.');continue;}
    try{await DB.insertConexion(db,{id:conn.id,equipoId:equipo.id,tipo:conn.tipo,estado:conn.estado,destino:conn.destino});ok++;}
    catch(e){errors.push('Fila '+conn._row+' ('+conn.id+'): '+e.message);}
  }
  return{ok,err:errors.length,errors};
}

// ─────────────────────────────────────────────────────────────
// HINTS
// ─────────────────────────────────────────────────────────────
const HINT_INFRA = '<b>Formato CSV Infraestructura</b> — columnas en orden:<br>'
  + '<span class="hint-col">id</span><span class="hint-col">nombre</span>'
  + '<span class="hint-sep">|</span>'
  + '<span class="hint-col">id</span><span class="hint-col">locacion_id</span><span class="hint-col">nombre</span>'
  + '<span class="hint-sep">|</span>'
  + '<span class="hint-col">id</span><span class="hint-col">site_id</span><span class="hint-col">nombre</span><span class="hint-col">ubicacion</span><span class="hint-col">unidades</span>'
  + '<span class="hint-sep">|</span>'
  + '<span class="hint-col">id</span><span class="hint-col">rack_id</span><span class="hint-col">modelo</span><span class="hint-col">serie</span><span class="hint-col">puerto</span><span class="hint-col">servicio</span><span class="hint-col">estado</span><span class="hint-col">u_pos</span><span class="hint-col">u_size</span><br>'
  + 'Los campos <b>id</b> se ignoran. Celdas vacias usan valores por defecto.';

const HINT_CONN = '<b>Formato CSV Conexiones</b> — columnas: '
  + '<span class="hint-col">equipo_id</span><span class="hint-col">id/puerto</span><span class="hint-col">tipo</span><span class="hint-col">estado</span><span class="hint-col">destino</span><br>'
  + 'Tipo valido: RJ45, SFP+, SFP, Serial, Console, Fiber, USB — otro valor va a <i>Other</i><br>'
  + 'Estado vacio → <i>Inactivo</i> &nbsp;·&nbsp; Destino vacio → <i>N/A</i>';

// ─────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────
export function openImportModal(db, onDone) {
  let activeTab = 'infra';
  let parsedData = null;
  let rawRows = null;

  const { openModal, closeModal } = window._modalAPI;

  function getHTML() {
    return '<div class="import-tabs">'
      + '<div class="import-tab '+(activeTab==='infra'?'active':'')+'" data-tab="infra">Infraestructura</div>'
      + '<div class="import-tab '+(activeTab==='conexiones'?'active':'')+'" data-tab="conexiones">Conexiones</div>'
      + '</div>'
      + '<div class="import-hint-block">'+(activeTab==='infra'?HINT_INFRA:HINT_CONN)+'</div>'
      + '<div class="import-drop-zone" id="importDropZone">'
      + '<div class="drop-icon">&#128194;</div>'
      + '<div>Arrastra tu archivo <b>.csv</b> aqui</div>'
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
    return '<button class="btn" onclick="closeModal()">X Cancelar</button>'
      + '<button class="btn" id="btnImportClear" style="display:none" onclick="window._importClear()">Limpiar</button>'
      + '<button class="btn primary" id="btnImportRun" disabled onclick="window._importRun()">Importar</button>';
  }

  openModal('IMPORTAR CSV', getHTML(), getFooter());

  function showResult(type, msg) {
    const el=document.getElementById('importResult');
    if(!el)return;
    el.className='import-result '+type;
    el.innerHTML=msg;
    el.style.display='';
  }

  function updateStats(obj) {
    const el=document.getElementById('importStats');
    if(!el)return;
    el.innerHTML=Object.entries(obj).map(([k,v])=>'<div class="import-stat">'+k+': <b>'+v+'</b></div>').join('');
  }

  function renderPreview() {
    const wrap=document.getElementById('importPreviewWrap');
    const prev=document.getElementById('importPreview');
    if(!parsedData)return;
    if(activeTab==='infra'){
      const d=parsedData;
      updateStats({Locaciones:d.locaciones.length,Sites:d.sites.length,Racks:d.racks.length,Equipos:d.equipos.length});
      prev.innerHTML=buildPreviewInfra(d);
      document.getElementById('btnImportRun').disabled=false;
    } else {
      const missing=parsedData.filter(c=>c._idMissing||c._eqMissing);
      updateStats({Conexiones:parsedData.length,'Sin id/equipo':missing.length});
      prev.innerHTML=buildPreviewConexiones(parsedData);
      document.getElementById('btnImportRun').disabled=parsedData.length===0;
    }
    wrap.style.display='';
  }

  function loadFile(file) {
    if(!file.name.toLowerCase().endsWith('.csv')){showResult('error','Solo se aceptan archivos .csv');return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        rawRows=parseCSV(ev.target.result);
        if(rawRows.length<2){showResult('error','Archivo vacio o sin datos.');return;}
        parsedData=activeTab==='infra'?parseInfra(rawRows,db):parseConexiones(rawRows);
        const zone=document.getElementById('importDropZone');
        zone.innerHTML='<div class="drop-icon">&#9989;</div><div><b>'+file.name+'</b></div><div style="opacity:.6;margin-top:4px;">'+(rawRows.length-2)+' filas de datos</div>';
        zone.style.borderColor='rgba(0,200,110,0.5)';
        zone.style.background='rgba(0,200,110,0.04)';
        zone.onclick=null;
        renderPreview();
        document.getElementById('btnImportClear').style.display='';
        document.getElementById('importResult').style.display='none';
        document.getElementById('btnImportRun').disabled=false;
      }catch(err){showResult('error','Error al parsear el CSV: '+err.message);}
    };
    reader.readAsText(file,'UTF-8');
  }

  function rebind() {
    document.querySelectorAll('.import-tab').forEach(tab=>{
      tab.onclick=()=>{
        activeTab=tab.dataset.tab;
        parsedData=rawRows=null;
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
    parsedData=rawRows=null;
    document.getElementById('modalBody').innerHTML=getHTML();
    document.getElementById('btnImportRun').disabled=true;
    document.getElementById('btnImportClear').style.display='none';
    rebind();
  };

  window._importRun=async()=>{
    if(!parsedData)return;
    const btnRun=document.getElementById('btnImportRun');
    const btnClear=document.getElementById('btnImportClear');
    btnRun.disabled=true;
    btnRun.textContent='Importando...';
    if(btnClear)btnClear.style.display='none';
    try{
      const result=activeTab==='infra'
        ?await importInfra(db,parsedData)
        :await importConexiones(db,parsedData);
      await DB.loadFromServer(db);
      onDone&&onDone();
      const errDetail=result.errors.length
        ?'<br><br><span style="opacity:.75;font-size:10px;">'+result.errors.slice(0,8).map(e=>'• '+e).join('<br>')+(result.errors.length>8?'<br>...y '+(result.errors.length-8)+' mas':'')+'</span>'
        :'';
      showResult(
        result.err===0?'ok':(result.ok>0?'warn':'error'),
        result.err===0
          ?('<b>'+result.ok+' registro(s)</b> importados correctamente.')
          :(result.ok+' importados · '+result.err+' con error.'+errDetail)
      );
    }catch(e){showResult('error','Error inesperado: '+(e?.message||e));}
    finally{btnRun.textContent='Importar';btnRun.disabled=false;}
  };

  rebind();
}
