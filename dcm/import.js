// import.js — Importación CSV para Racks, Equipos y Conexiones
import * as DB from './db.js';

// ─────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false, cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cell += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) { row.push(cell.trim()); cell = ''; }
      else cell += ch;
    }
    row.push(cell.trim());
    result.push(row);
  }
  return result;
}

function na(val) {
  return (!val || val.toString().trim() === '') ? 'N/A' : val.toString().trim();
}

function normKey(s) {
  return s.toString().toLowerCase()
    .replace(/[áéíóúñ]/g, c => ({a:'a',e:'e',i:'i',o:'o',u:'u',n:'n'}[{a:'a',á:'a',e:'e',é:'e',i:'i',í:'i',o:'o',ó:'o',u:'u',ú:'u',ñ:'n'}[c]] || c))
    .replace(/[.\s/\-_]/g, '');
}

function findHeader(headers, ...aliases) {
  for (const a of aliases) {
    const i = headers.findIndex(h => normKey(h) === normKey(a));
    if (i >= 0) return i;
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────
// RESOLVER RACK: nombre o id del CSV -> id real en db
// ─────────────────────────────────────────────────────────────
function resolveRackId(db, raw) {
  if (!raw || raw.trim() === '' || raw === 'N/A') return null;
  const v = raw.trim();
  // 1. Coincidencia exacta por id
  const byId = db.racks.find(r => r.id === v);
  if (byId) return byId.id;
  // 2. Exacta por nombre
  const byNombre = db.racks.find(r => r.nombre === v);
  if (byNombre) return byNombre.id;
  // 3. Case-insensitive por nombre
  const low = v.toLowerCase();
  const byLow = db.racks.find(r => r.nombre.toLowerCase() === low);
  if (byLow) return byLow.id;
  // 4. Parcial
  const byPartial = db.racks.find(r =>
    r.nombre.toLowerCase().includes(low) || low.includes(r.nombre.toLowerCase())
  );
  if (byPartial) return byPartial.id;
  return null;
}

// ─────────────────────────────────────────────────────────────
// NORMALIZACION
// ─────────────────────────────────────────────────────────────
function normalizeRacks(rows, headers) {
  const iNombre   = findHeader(headers, 'rack', 'nombre', 'name');
  const iUbic     = findHeader(headers, 'ubicacion', 'ubicacion', 'location');
  const iUnidades = findHeader(headers, 'unidades', 'units', 'u');
  const iSite     = findHeader(headers, 'siteid', 'site', 'site_id');
  return rows.map((r, i) => {
    const nombre    = na(r[iNombre]);
    const ubicacion = na(r[iUbic]);
    const unidades  = (r[iUnidades] && parseInt(r[iUnidades]) > 0) ? parseInt(r[iUnidades]) : 42;
    const raw       = (r[iSite] || '').trim().toUpperCase();
    const siteId    = ['A','B','C','D','E'].includes(raw) ? raw : 'A';
    return { _row: i+1, nombre, ubicacion, unidades, siteId };
  });
}

function normalizeEquipos(rows, headers, db, fallbackRackId) {
  const iRack   = findHeader(headers, 'rack', 'rackid', 'rack_id');
  const iModelo = findHeader(headers, 'equipo', 'modelo', 'model');
  const iSerie  = findHeader(headers, 'numserieequipo', 'numeroserie', 'numserie', 'serie', 'serialnumber', 'numserieequipo');
  const iPuerto = findHeader(headers, 'puerto', 'puertoconexion', 'port', 'interface');
  const iSvc    = findHeader(headers, 'servicio', 'service', 'svc');
  const iEst    = findHeader(headers, 'estado', 'status', 'state');
  const iUPos   = findHeader(headers, 'upos', 'u_pos', 'upos');
  const iUSize  = findHeader(headers, 'usize', 'u_size', 'usize');

  let autoUPos = 1;
  return rows.map((r, i) => {
    const rawRack = iRack >= 0 ? (r[iRack] || '') : '';
    const rackId  = resolveRackId(db, rawRack) || fallbackRackId || null;
    const modelo         = na(r[iModelo]);
    const numeroSerie    = na(r[iSerie]);
    const puertoConexion = na(r[iPuerto]);
    const servicio       = na(r[iSvc]);
    const estado         = (r[iEst] && r[iEst].trim()) ? r[iEst].trim() : 'N/A';
    const uSize          = (r[iUSize] && parseInt(r[iUSize]) > 0) ? parseInt(r[iUSize]) : 1;
    let uPos;
    if (iUPos >= 0 && r[iUPos] && parseInt(r[iUPos]) > 0) {
      uPos = parseInt(r[iUPos]); autoUPos = uPos + uSize;
    } else {
      uPos = autoUPos; autoUPos += uSize;
    }
    return { _row: i+1, _rawRack: rawRack, rackId: rackId || 'N/A', modelo, numeroSerie, puertoConexion, servicio, estado, uPos, uSize };
  });
}

function normalizeConexiones(rows, headers) {
  const iId      = findHeader(headers, 'idpuerto', 'id', 'puerto', 'port', 'idpuerto');
  const iTipo    = findHeader(headers, 'tipo', 'type');
  const iEst     = findHeader(headers, 'estado', 'status', 'state');
  const iDestino = findHeader(headers, 'destino', 'destination', 'dest');
  const iEqId    = findHeader(headers, 'equipoid', 'equipo_id', 'equipo', 'device');
  return rows.map((r, i) => ({
    _row: i+1,
    id:       na(r[iId]),
    tipo:     na(r[iTipo]),
    estado:   na(r[iEst]),
    destino:  na(r[iDestino]),
    equipoId: iEqId >= 0 ? na(r[iEqId]) : 'N/A',
  }));
}

// ─────────────────────────────────────────────────────────────
// PREVIEW TABLE
// ─────────────────────────────────────────────────────────────
function buildPreviewTable(data, type) {
  if (!data.length) return '<div class="import-hint">Sin filas para previsualizar.</div>';
  const map = {
    racks:      { keys:['_row','nombre','ubicacion','unidades','siteId'],                                           labels:['#','Nombre','Ubicacion','Unidades','Site'] },
    equipos:    { keys:['_row','rackId','modelo','numeroSerie','puertoConexion','servicio','estado','uPos','uSize'], labels:['#','Rack','Modelo','N Serie','Puerto','Servicio','Estado','uPos','uSize'] },
    conexiones: { keys:['_row','equipoId','id','tipo','estado','destino'],                                          labels:['#','EquipoId','Id/Puerto','Tipo','Estado','Destino'] },
  }[type];
  const rows  = data.slice(0, 50);
  const thead = `<thead><tr>${map.labels.map(l=>`<th>${l}</th>`).join('')}</tr></thead>`;
  const tbody = rows.map(row => {
    const cells = map.keys.map(c => {
      if (c === '_row') return `<td>${row._row}</td>`;
      const v   = String(row[c] ?? '');
      const cls = v === 'N/A' ? 'cell-na' : 'cell-ok';
      return `<td class="${cls}" title="${v}">${v}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  return `<table>${thead}<tbody>${tbody}</tbody></table>`;
}

// ─────────────────────────────────────────────────────────────
// IMPORTACION A BD
// ─────────────────────────────────────────────────────────────
async function importRacks(db, data) {
  let ok=0, err=0, errors=[];
  for (const r of data) {
    try { await DB.insertRack(db, { siteId:r.siteId, nombre:r.nombre, ubicacion:r.ubicacion, unidades:r.unidades }); ok++; }
    catch(e) { err++; errors.push(`Fila ${r._row}: ${e.message}`); }
  }
  return { ok, err, errors };
}

async function importEquipos(db, data) {
  let ok=0, err=0, errors=[];
  for (const r of data) {
    try {
      await DB.insertEquipo(db, { rackId:r.rackId, modelo:r.modelo, numeroSerie:r.numeroSerie,
        puertoConexion:r.puertoConexion, servicio:r.servicio, estado:r.estado, uPos:r.uPos, uSize:r.uSize });
      ok++;
    } catch(e) { err++; errors.push(`Fila ${r._row} (${r.modelo}): ${e.message}`); }
  }
  return { ok, err, errors };
}

async function importConexiones(db, data) {
  let ok=0, err=0, errors=[];
  for (const r of data) {
    try { await DB.insertConexion(db, { id:r.id, equipoId:r.equipoId, tipo:r.tipo, estado:r.estado, destino:r.destino }); ok++; }
    catch(e) { err++; errors.push(`Fila ${r._row} (${r.id}): ${e.message}`); }
  }
  return { ok, err, errors };
}

// ─────────────────────────────────────────────────────────────
// MODAL PRINCIPAL
// ─────────────────────────────────────────────────────────────
export function openImportModal(db, onDone) {
  let activeTab  = 'racks';
  let parsedData = null;
  let rawRows    = null;
  let rawHeaders = null;

  const hints = {
    racks:      `Columnas esperadas: <b>RACK</b> (nombre), <b>UBICACION</b>, <b>UNIDADES</b>, <b>SITE</b> (A-E)<br>Vacios: Nombre/Ubicacion=N/A, Unidades=42, Site=A`,
    equipos:    `Columnas esperadas: <b>RACK</b>, <b>EQUIPO</b>, <b>NUM.SERIE EQUIPO</b>, <b>PUERTO</b>, <b>SERVICIO</b>, <b>ESTADO</b>, <b>uPos</b>, <b>uSize</b><br>RACK puede ser el nombre del rack. uPos vacio=auto, uSize vacio=1`,
    conexiones: `Columnas esperadas: <b>Id/Puerto</b>, <b>Tipo</b>, <b>Estado</b>, <b>Destino</b>, <b>EquipoId</b><br>Cualquier celda vacia = N/A`,
  };

  function getRackOptions() {
    return db.racks.map(r =>
      `<option value="${r.id}">${r.nombre || r.id} — ${r.id} (Site ${r.siteId})</option>`
    ).join('');
  }

  function getHTML() {
    return `
      <div class="import-tabs">
        <div class="import-tab ${activeTab==='racks'?'active':''}"      data-tab="racks">Racks</div>
        <div class="import-tab ${activeTab==='equipos'?'active':''}"    data-tab="equipos">Equipos</div>
        <div class="import-tab ${activeTab==='conexiones'?'active':''}" data-tab="conexiones">Conexiones</div>
      </div>
      <div class="import-hint" style="margin-bottom:12px;">${hints[activeTab]}</div>
      <div class="import-drop-zone" id="importDropZone">
        <div class="drop-icon">&#128194;</div>
        <div>Arrastra tu archivo <b>.csv</b> aqui</div>
        <div style="margin-top:6px;opacity:.6">o haz clic para seleccionar</div>
        <input type="file" id="importFileInput" accept=".csv" style="display:none">
      </div>
      <div id="importPreviewWrap" style="display:none">
        <div id="rackFallbackContainer"></div>
        <div class="import-stats" id="importStats"></div>
        <div class="import-preview" id="importPreview"></div>
      </div>
      <div class="import-result" id="importResult"></div>
    `;
  }

  function getFooter() {
    return `
      <button class="btn" onclick="closeModal()">X Cancelar</button>
      <button class="btn" id="btnImportClear" style="display:none" onclick="window._importClear()">Limpiar</button>
      <button class="btn primary" id="btnImportRun" disabled onclick="window._importRun()">Importar</button>
    `;
  }

  const { openModal, closeModal } = window._modalAPI;
  openModal('IMPORTAR CSV', getHTML(), getFooter());

  function showResult(type, msg) {
    const el = document.getElementById('importResult');
    if (!el) return;
    el.className = `import-result ${type}`;
    el.innerHTML = msg;
    el.style.display = '';
  }

  function updateStats(data, colCount) {
    const stats = document.getElementById('importStats');
    if (!stats) return;
    const naCount = data.reduce((acc, row) =>
      acc + Object.entries(row).filter(([k,v]) => k !== '_row' && k !== '_rawRack' && v === 'N/A').length, 0
    );
    stats.innerHTML = `
      <div class="import-stat">Filas: <b>${data.length}</b></div>
      <div class="import-stat">Columnas: <b>${colCount}</b></div>
      <div class="import-stat" style="color:#ffaa33;">Campos N/A: <b>${naCount}</b></div>
    `;
  }

  function countUnresolved(data) {
    return data.filter(r => !db.racks.find(rack => rack.id === r.rackId)).length;
  }

  function renderPreview(data) {
    const preview = document.getElementById('importPreview');
    const fbWrap  = document.getElementById('rackFallbackContainer');

    updateStats(data, rawHeaders ? rawHeaders.length : 0);
    preview.innerHTML = buildPreviewTable(data, activeTab);
    document.getElementById('importPreviewWrap').style.display = '';

    if (activeTab === 'equipos') {
      const unresolved = countUnresolved(data);
      if (unresolved > 0) {
        // Hay racks sin resolver: mostrar selector obligatorio
        fbWrap.innerHTML = `
          <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;
            background:rgba(255,170,51,0.08);border:1px solid rgba(255,170,51,0.3);">
            <div style="font-family:var(--mono);font-size:11px;color:#ffaa33;margin-bottom:8px;">
              ${unresolved} equipo(s) no tienen rack resuelto del CSV. Selecciona un rack destino:
            </div>
            <select id="rackFallbackSelect" style="width:100%">
              <option value="">-- Selecciona un rack --</option>
              ${getRackOptions()}
            </select>
          </div>`;
        document.getElementById('btnImportRun').disabled = true;
        document.getElementById('rackFallbackSelect').addEventListener('change', () => {
          const fallback = document.getElementById('rackFallbackSelect').value;
          if (rawRows && rawHeaders) {
            parsedData = normalizeEquipos(rawRows, rawHeaders, db, fallback || null);
            document.getElementById('importPreview').innerHTML = buildPreviewTable(parsedData, 'equipos');
            updateStats(parsedData, rawHeaders.length);
          }
          document.getElementById('btnImportRun').disabled = !fallback;
        });
      } else {
        fbWrap.innerHTML = '';
        document.getElementById('btnImportRun').disabled = false;
      }
    } else {
      document.getElementById('btnImportRun').disabled = false;
    }
  }

  function rebind() {
    document.querySelectorAll('.import-tab').forEach(tab => {
      tab.onclick = () => {
        activeTab = tab.dataset.tab;
        parsedData = rawRows = rawHeaders = null;
        document.getElementById('modalBody').innerHTML = getHTML();
        document.getElementById('btnImportRun').disabled = true;
        document.getElementById('btnImportClear').style.display = 'none';
        rebind();
      };
    });

    const zone      = document.getElementById('importDropZone');
    const fileInput = document.getElementById('importFileInput');
    zone.onclick    = () => fileInput.click();
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    fileInput.onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); };
  }

  function loadFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) { showResult('error', 'Solo se aceptan archivos .csv'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const rows = parseCSV(ev.target.result);
        if (rows.length < 2) { showResult('error', 'El archivo esta vacio o solo tiene encabezados.'); return; }
        rawHeaders = rows[0];
        rawRows    = rows.slice(1);

        if (activeTab === 'racks')      parsedData = normalizeRacks(rawRows, rawHeaders);
        if (activeTab === 'equipos')    parsedData = normalizeEquipos(rawRows, rawHeaders, db, null);
        if (activeTab === 'conexiones') parsedData = normalizeConexiones(rawRows, rawHeaders);

        const zone = document.getElementById('importDropZone');
        zone.innerHTML = `<div class="drop-icon">&#9989;</div><div><b>${file.name}</b></div><div style="opacity:.6;margin-top:4px;">${rawRows.length} filas detectadas</div>`;
        zone.style.borderColor = 'rgba(0,200,110,0.5)';
        zone.style.background  = 'rgba(0,200,110,0.05)';
        zone.onclick = null;

        renderPreview(parsedData);
        document.getElementById('btnImportClear').style.display = '';
        document.getElementById('importResult').style.display = 'none';
      } catch(err) {
        showResult('error', 'Error al parsear el CSV: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  window._importClear = () => {
    parsedData = rawRows = rawHeaders = null;
    document.getElementById('modalBody').innerHTML = getHTML();
    document.getElementById('btnImportRun').disabled = true;
    document.getElementById('btnImportClear').style.display = 'none';
    rebind();
  };

  window._importRun = async () => {
    if (!parsedData?.length) return;

    // Para equipos: aplicar fallback final antes de importar
    if (activeTab === 'equipos') {
      const sel      = document.getElementById('rackFallbackSelect');
      const fallback = sel ? sel.value : '';
      parsedData = normalizeEquipos(rawRows, rawHeaders, db, fallback || null);
      const bad = parsedData.filter(r => !db.racks.find(rack => rack.id === r.rackId));
      if (bad.length > 0) {
        showResult('error', `${bad.length} equipo(s) no tienen rack valido. Selecciona un rack destino.`);
        return;
      }
    }

    const btnRun   = document.getElementById('btnImportRun');
    const btnClear = document.getElementById('btnImportClear');
    btnRun.disabled = true;
    btnRun.textContent = 'Importando...';
    if (btnClear) btnClear.style.display = 'none';

    try {
      let result;
      if (activeTab === 'racks')      result = await importRacks(db, parsedData);
      if (activeTab === 'equipos')    result = await importEquipos(db, parsedData);
      if (activeTab === 'conexiones') result = await importConexiones(db, parsedData);

      await DB.loadFromServer(db);
      onDone && onDone();

      const errDetail = result.errors.length
        ? `<br><br><span style="opacity:.7;font-size:10px;">${result.errors.slice(0,5).map(e=>`• ${e}`).join('<br>')}${result.errors.length > 5 ? `<br>...y ${result.errors.length-5} mas` : ''}</span>`
        : '';

      showResult(result.err === 0 ? 'ok' : 'error',
        result.err === 0
          ? `Correcto: ${result.ok} registros importados.`
          : `${result.ok} importados, ${result.err} con error.${errDetail}`
      );
    } catch(e) {
      showResult('error', 'Error inesperado: ' + (e?.message || e));
    } finally {
      btnRun.textContent = 'Importar';
      btnRun.disabled = false;
    }
  };

  rebind();
}
