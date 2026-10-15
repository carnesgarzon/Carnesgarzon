/* ==== NÚCLEO: catálogo, lectores y cálculos (sin dependencias de UI) ==== */
const Core = (() => {
  const TIENDAS = ['ACARIGUA','ALTO CHAMA','BARINAS','CABIMAS','EJIDO','GUANARE','LA PEDREGOSA','LAS AMERICAS','PARAMILLO','PIRINEOS','PUEBLO NUEVO','ROTARIA','SAN JOSECITO','SANTA BARBARA'];

  // Grupos según el SubGrupo del ERP (Especialidades, Primera, Segunda, Tercera, Subproductos) + merma
  const CLASES = {
    ESPECIAL: { nombre:'Cortes especiales', orden:1, carne:true,  vendible:true },
    PRIMERA:  { nombre:'Carne de primera',  orden:2, carne:true,  vendible:true },
    SEGUNDA:  { nombre:'Carne de segunda',  orden:3, carne:true,  vendible:true },
    TERCERA:  { nombre:'Cortes de tercera', orden:4, carne:false, vendible:true },
    VISCERA:  { nombre:'Vísceras',          orden:5, carne:false, vendible:true },
    GRASA:    { nombre:'Grasa y sebo',      orden:6, carne:false, vendible:false },
    MERMA:    { nombre:'Merma técnica',     orden:7, carne:false, vendible:false },
  };
  // canal:false = no sale del desposte de canal (comprado ya cortado o viene de trastes)
  const FAMILIAS = [
    { id:'LOMITO',   nombre:'Lomito',              clase:'ESPECIAL', canal:true },
    { id:'SOLOMO',   nombre:'Solomo',              clase:'ESPECIAL', canal:true },
    { id:'PUNTA',    nombre:'Punta trasera',       clase:'ESPECIAL', canal:true },
    { id:'POLLO',    nombre:'Pollo de res',        clase:'ESPECIAL', canal:true },
    { id:'ESP_OTROS',nombre:'Otros especiales',    clase:'ESPECIAL', canal:true },
    { id:'DISPROCAR',nombre:'Cortes Disprocar',    clase:'ESPECIAL', canal:false },
    { id:'PRIMERA',  nombre:'Carne de primera',    clase:'PRIMERA',  canal:true },
    { id:'SEGUNDA',  nombre:'Carne de segunda',    clase:'SEGUNDA',  canal:true },
    { id:'LAGARTO',  nombre:'Lagarto',             clase:'SEGUNDA',  canal:true },
    { id:'ASADO',    nombre:'Asado de tira',       clase:'TERCERA',  canal:true },
    { id:'COSTILLA', nombre:'Costilla',            clase:'TERCERA',  canal:true },
    { id:'OSOBUCO',  nombre:'Osobuco',             clase:'TERCERA',  canal:true },
    { id:'HUESO',    nombre:'Hueso',               clase:'TERCERA',  canal:true },
    { id:'TER_OTROS',nombre:'Otros de tercera',    clase:'TERCERA',  canal:true },
    { id:'VISCERAS', nombre:'Vísceras (trastes)',  clase:'VISCERA',  canal:false },
    { id:'GRASA',    nombre:'Grasa / sebo',        clase:'GRASA',    canal:true },
    { id:'MERMA',    nombre:'Merma técnica',       clase:'MERMA',    canal:true },
  ];
  const PADRES = [
    { re:/NOVILLO.*TIPO AA.*DESPOSTABLE/, id:'NOV_AA', nombre:'Novillo tipo AA despostable', canal:true },
    { re:/NOVILLO.*TIPO A DESPOSTABLE/, id:'NOV_A', nombre:'Novillo tipo A despostable', canal:true },
    { re:/DESPOSTABLE|MEDIA CANAL|CUARTO (ANTERIOR|TRASERO|POSTERIOR|DELANTERO)/, id:'OTRO_PADRE', nombre:'Otra materia prima despostable', canal:true },
    { re:/TRASTES/, id:'TRASTES', nombre:'Trastes completos', canal:false },
  ];
  const REGLAS = [
    [/^MERMA|\bMERMA PK/, 'MERMA'],
    [/DISPROCAR/, 'DISPROCAR'],
    [/HIGADO|PATAS|CALLO|LENGUA|BOFE|COLA RES|CORAZON|RINON|PAJARILLA|PANZA|MONDONGO|CRIADILLA|SESOS/, 'VISCERAS'],
    [/HUESO/, 'HUESO'],
    [/GRASA|SEBO/, 'GRASA'],
    [/OSOBUCO/, 'OSOBUCO'],
    [/LAGARTO/, 'LAGARTO'],
    [/CROQUETA|HAMBURG|MOLIDA|GUISAR|SEGUNDA/, 'SEGUNDA'],
    [/LOMITO/, 'LOMITO'],
    [/SOLOMO/, 'SOLOMO'],
    [/PUNTA/, 'PUNTA'],
    [/POLLO DE RES/, 'POLLO'],
    [/ASADO.*TIRA/, 'ASADO'],
    [/COSTILLA/, 'COSTILLA'],
    [/LOMO D.?AGUJA/, 'ESP_OTROS'],
    [/PRIMERA|BISTEC|PULPA|PULPON|MUCHACHO|GANSO|MECHAR|AGUJA|MEDALLON|PINCHO|CHOCOZUELA|PALOMA|FALDA/, 'PRIMERA'],
  ];
  const SUBGRUPO = { 'ESPECIALIDADES CARNE':'ESP_OTROS', 'PRIMERA':'PRIMERA', 'SEGUNDA':'SEGUNDA', 'TERCERA':'TER_OTROS', 'SUBPRODUCTOS RES':'VISCERAS' };

  // Motivos de ajuste de Kardex → MERMA | CONSUMO (operativo, no es merma) | TRANSFORMACION (no es merma) | OTRO
  const MOTIVO_CLASES = {
    MERMA:          { nombre:'Merma', merma:true },
    CONSUMO:        { nombre:'Consumo operativo', merma:false },
    TRANSFORMACION: { nombre:'Transformación / reclasificación', merma:false },
    OTRO:           { nombre:'Sin clasificar', merma:false },
  };
  function motivoClase(m, ov) {
    const n = norm(m); if (ov && ov[n]) return ov[n];
    if (/TRANSFORMA|PRODUCCION|CRUCE|RECLASIF|CAMBIO DE COD/.test(n)) return 'TRANSFORMACION';
    if (/DONACION|APOYO|COMIDA|PERSONAL|PROMO|MERCADEO|DEGUSTA|MUESTRA|CONSUMO INTERNO/.test(n)) return 'CONSUMO';
    if (/AVERIA|MERMA|PERDIDA|VENCI|DETERIOR|ROBO|HURTO|DESCOMP|DANO|ROTURA|CADUC/.test(n)) return 'MERMA';
    return 'OTRO';
  }

  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const num = s => { if (typeof s === 'number') return s; const t = String(s ?? '').replace(/,/g,'').trim(); const v = parseFloat(t); return isNaN(v) ? 0 : v; };
  const esNum = s => /^-?[\d,]*\.?\d+$/.test(String(s).trim());
  const fam = id => FAMILIAS.find(f => f.id === id);
  const famClase = id => (fam(id) || {}).clase;
  const famCanal = id => !!(fam(id) || {}).canal;

  function padreDe(nombre) { const n = norm(nombre); for (const p of PADRES) if (p.re.test(n)) return p; return null; }
  function familiaPorRegla(nombre, subgrupo) {
    const n = norm(nombre); if (padreDe(n)) return null;
    for (const [re, f] of REGLAS) if (re.test(n)) return f;
    return subgrupo ? (SUBGRUPO[norm(subgrupo)] || null) : null;
  }
  function kgPorUnidad(nombre) { const n = norm(nombre); let m = n.match(/(\d+(?:\.\d+)?)\s*KG\b/); if (m) return +m[1]; m = n.match(/(\d+)\s*G(R|RS)?\b/); if (m) return +m[1]/1000; return 0; }
  const isoDMY = s => { const m = String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

  /* ---------- PDF "Reporte de Producción" ---------- items: [{p,x,y,w,s}] de pdf.js */
  function parseDesposte(items, fuente) {
    const it = items.filter(i => String(i.s).trim()).map(i => ({ ...i, s: String(i.s).trim(), cx: i.x + i.w/2, Y: -i.p*2000 + i.y }));
    it.sort((a,b) => b.Y - a.Y || a.x - b.x);
    const lineas = [];
    for (const i of it) { const L = lineas.find(l => Math.abs(l.Y - i.Y) < 2.5); if (L) L.items.push(i); else lineas.push({ Y:i.Y, items:[i] }); }
    lineas.forEach(l => { l.items.sort((a,b)=>a.x-b.x); l.txt = l.items.map(i=>i.s).join(' '); });
    lineas.sort((a,b)=>b.Y-a.Y);
    const docs = []; let cur = null, seccion = null, cols = null, hdrVals = [];
    const nuevo = () => ({ tienda:'', nombre:'', merma:0, fecha:'', subtotal:0, padres:[], hijos:[], avisos:[], fuente });
    const nearest = (i, cs) => { let best=null, d=1e9; for (const c of cs) { const dd = Math.abs(c.cx - i.cx); if (dd < d) { d = dd; best = c; } } return best; };
    for (const L of lineas) {
      const t = norm(L.txt);
      if (/^ORGANIZACION\b/.test(t) && /TIENDA/.test(t)) { if (cur) docs.push(cur); cur = nuevo(); seccion = 'HDR'; cols = L.items.map(i => ({ k: norm(i.s), cx: i.cx })); hdrVals = []; continue; }
      if (!cur) continue;
      if (/^PRODUCTOS A UTILIZAR/.test(t)) { seccion = 'MU'; cols = null; continue; }
      if (/^PRODUCTOS TERMINADOS/.test(t)) { seccion = 'MP'; cols = null; continue; }
      if (/^TOTAL:|^PAG \d|COPYRIGHT|^GRUPO:|^RIF:|^FECHA:|REPORTE DE PRODUCCION/.test(t)) continue;
      if (seccion === 'HDR') {
        for (const i of L.items) { const c = nearest(i, cols); hdrVals.push({ k:c.k, s:i.s }); }
        const get = k => hdrVals.filter(v => v.k.startsWith(k)).map(v => v.s);
        cur.tienda = norm(get('TIENDA').join(' '));
        cur.nombre = get('NOMBRE').join(' ').replace(/\s+/g,' ').trim();
        cur.merma = num(get('MERMA')[0]);
        cur.fecha = isoDMY(get('FECHA')[0]);
        cur.subtotal = num(get('SUBTOTAL')[0]);
        continue;
      }
      if ((seccion === 'MU' || seccion === 'MP') && !cols && /ARTICULO/.test(t)) { cols = L.items.map(i => ({ k: norm(i.s), cx: i.cx })); continue; }
      if ((seccion === 'MU' || seccion === 'MP') && cols) {
        const numCols = cols.filter(c => !/^(TIPO|ARTICULO)$/.test(c.k));
        const row = {}; const txt = [];
        L.items.forEach((i, idx) => {
          if (esNum(i.s) && !(seccion==='MP' && idx===0)) { const c = nearest(i, numCols); row[c.k] = i.s; }
          else if (idx <= 1 && /^[A-Z]{2,3}$/.test(i.s) && !row.TIPO) row.TIPO = i.s;
          else txt.push(i.s);
        });
        if (!txt.length) continue;
        if (seccion === 'MU') cur.padres.push({ doc: row['NUMERO DOC.'] || '', tipo: row.TIPO || '', art: txt.join(' '), kg: num(row.CANTIDAD), costo: num(row.COSTOS), sub: num(row['SUB TOTAL']) });
        else cur.hijos.push({ tipo: row.TIPO || '', art: txt.join(' '), costo: num(row.COSTOS), kg: num(row.CANTIDAD), total: num(row.TOTAL), precio: num(row.PRECIO), margen: num(row.MARGEN) });
      }
    }
    if (cur) docs.push(cur);
    docs.forEach(validarDesposte);
    return docs;
  }
  function validarDesposte(d) {
    d.avisos = [];
    if (!TIENDAS.includes(d.tienda)) d.avisos.push(`Tienda "${d.tienda}" no reconocida`);
    if (!d.fecha) d.avisos.push('Sin fecha de producción');
    if (!d.padres.length) d.avisos.push('Sin productos a utilizar (padre)');
    if (!d.hijos.length) d.avisos.push('Sin productos terminados');
    const kgP = d.padres.reduce((s,p)=>s+p.kg,0), kgH = d.hijos.reduce((s,h)=>s+h.kg,0);
    if (Math.abs(kgP - kgH) > 0.05) d.avisos.push(`Cuadre de kilos: padre ${kgP.toFixed(3)} vs hijos+merma ${kgH.toFixed(3)}`);
    d.hijos.forEach(h => { h.fam = familiaPorRegla(h.art); if (!h.fam) d.avisos.push(`Corte sin familia: ${h.art}`); });
    d.padres.forEach(p => { const pp = padreDe(p.art); p.padre = pp ? pp.id : 'SIN_MAPEO'; });
    d.id = `${d.tienda}|${d.padres.map(p=>p.doc).join('+')}|${d.fecha}`;
    return d;
  }

  /* ---------- Excel: detecta VentasxDpto o Ajustes de Kardex ---------- */
  function headerRow(aoa, must) { for (let r = 0; r < Math.min(aoa.length, 30); r++) { const row = (aoa[r]||[]).map(norm); if (must.every(m => row.some(c => c === m || c.startsWith(m)))) return r; } return -1; }
  function tipoExcel(aoa) {
    if (headerRow(aoa, ['MOTIVO','TIENDA','CANT.']) >= 0) return 'AJUSTES';
    if (headerRow(aoa, ['TIENDA','CODIGO','CANT. VENTA']) >= 0) return 'VENTAS';
    return null;
  }
  const fechaCel = f => {
    if (f instanceof Date) return `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`;
    if (typeof f === 'number') return new Date(Math.round((f - 25569) * 864e5)).toISOString().slice(0,10);
    return isoDMY(f) || String(f).slice(0,10);
  };
  function parseVentas(aoa) {
    const h = headerRow(aoa, ['TIENDA','CODIGO','CANT. VENTA']);
    if (h < 0) throw new Error('No encontré la fila de encabezados (Tienda, Codigo, Cant. Venta…). ¿Es el reporte VentasxDpto?');
    const H = aoa[h].map(norm); const ix = k => H.indexOf(k);
    const C = { t:ix('TIENDA'), d:ix('DEPARTAMENTO'), g:ix('GRUPO'), c:ix('CODIGO'), a:ix('ARTICULO'), u:ix('TIPO ARTICULO'), f:ix('FECHA'), kv:ix('CANT. VENTA'), cv:ix('COSTO VENTA'), sv:ix('SUBTOTAL VENTA'), kc:ix('CANT. COMPRA'), sc:ix('SUBTOTAL COMPRA'), pd:ix('PROMO DSCTO.') };
    const faltan = Object.entries(C).filter(([k,v]) => v < 0 && !['pd','d','u'].includes(k)).map(([k])=>k);
    if (faltan.length) throw new Error('Faltan columnas: ' + faltan.join(', '));
    const out = [];
    for (let r = h+1; r < aoa.length; r++) {
      const R = aoa[r]; if (!R || R[C.c] == null || R[C.t] == null || R[C.f] == null) continue;
      out.push({ t:norm(R[C.t]), dp:norm(R[C.d]), g:norm(R[C.g]), c:String(R[C.c]), a:String(R[C.a]).trim(), u:norm(R[C.u]), f:fechaCel(R[C.f]),
        kv:num(R[C.kv]), cv:num(R[C.cv]), sv:num(R[C.sv]), kc:num(R[C.kc]), sc:num(R[C.sc]), pd: C.pd>=0 ? num(R[C.pd]) : 0 });
    }
    return out;
  }
  function parseAjustes(aoa) {
    const h = headerRow(aoa, ['MOTIVO','TIENDA','CANT.']);
    if (h < 0) throw new Error('No encontré la fila de encabezados (Motivo, Tienda, Cant.…). ¿Es el reporte Ajustes de Kardex?');
    let desde = '', hasta = '';
    for (let r = 0; r < h; r++) { const s = (aoa[r]||[]).join(' '); const m = s.match(/Desde:\s*(\d{2}\/\d{2}\/\d{4}).*Hasta:\s*(\d{2}\/\d{2}\/\d{4})/i); if (m) { desde = isoDMY(m[1]); hasta = isoDMY(m[2]); } }
    if (!hasta) throw new Error('No encontré el rango de fechas ("Desde: … Hasta: …") en el encabezado del reporte');
    const H = aoa[h].map(norm); const ix = k => H.indexOf(k);
    const C = { mot:ix('MOTIVO'), tm:ix('TIPO MOTIVO'), tipo:ix('TIPO'), t:ix('TIENDA'), c:ix('CODIGO'), a:ix('ARTICULO'), kg:ix('CANT.'), g:ix('GRUPO'), sub:ix('SUBGRUPO'), dp:ix('DEPARTAMENTO'), usd:ix('TOTAL') };
    const faltan = Object.entries(C).filter(([k,v]) => v < 0 && ['mot','t','c','a','kg','usd'].includes(k)).map(([k])=>k);
    if (faltan.length) throw new Error('Faltan columnas: ' + faltan.join(', '));
    const out = [];
    for (let r = h+1; r < aoa.length; r++) {
      const R = aoa[r]; if (!R || R[C.c] == null || R[C.t] == null || R[C.mot] == null) continue;
      out.push({ t:norm(R[C.t]), c:String(R[C.c]), a:String(R[C.a]).trim(), mot:String(R[C.mot]).trim(), tipo:norm(R[C.tipo]), dp:norm(R[C.dp]), g:norm(R[C.g]), sub:norm(R[C.sub]),
        kg:num(R[C.kg]), usd:num(R[C.usd]), desde, hasta });
    }
    return out;
  }

  /* ---------- Catálogo efectivo (reglas + correcciones manuales) ---------- */
  function clasificarArticulo(a, overrides) {
    const o = overrides && overrides[a.c];
    const p = padreDe(a.a);
    if (o === 'EXCLUIR') return { rol:'EXCLUIDO', fam:null, origen:'manual' };
    if (o) return { rol: o === 'PADRE' ? 'PADRE' : 'HIJO', fam: o === 'PADRE' ? null : o, origen:'manual', padre: o === 'PADRE' ? (p ? p.id : 'OTRO_PADRE') : null };
    if (p) return { rol:'PADRE', fam:null, padre:p.id, canal:p.canal, origen:'regla' };
    const f = familiaPorRegla(a.a, a.sub);
    return { rol: f ? 'HIJO' : 'SIN_MAPEO', fam: f, origen: f ? 'regla' : 'pendiente' };
  }
  const factorKg = r => r.u === 'UNIDAD' ? kgPorUnidad(r.a) : 1;
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);

  /* ---------- KPIs de un acta ---------- */
  function kpiDesposte(d, preciosReal) {
    const kgPadre = sum(d.padres, p => p.kg), costoPadre = sum(d.padres, p => p.sub);
    const hijos = d.hijos.map(h => ({ ...h, clase: famClase(h.fam) || 'SIN' }));
    const noVend = h => h.clase === 'MERMA' || h.clase === 'GRASA' || !(h.precio > 0);
    const kgMerma = sum(hijos.filter(noVend), h => h.kg);
    const vend = hijos.filter(h => !noVend(h));
    const kgVend = sum(vend, h => h.kg);
    const kgCarne = sum(vend.filter(h => CLASES[h.clase]?.carne), h => h.kg);
    const valorLista = sum(vend, h => h.kg * h.precio);
    let valorReal = 0; const famsSinVenta = [];
    vend.forEach(h => { const pr = preciosReal && preciosReal[h.fam]; if (pr) valorReal += h.kg * pr; else { valorReal += h.kg * h.precio; famsSinVenta.push(h.fam); } });
    const f = valorLista > 0 ? costoPadre / valorLista : 0;
    const cortes = hijos.map(h => ({ ...h, vendible: !noVend(h), rend: kgPadre ? h.kg / kgPadre : 0, costoVRV: noVend(h) ? 0 : h.precio * f, precioReal: preciosReal && preciosReal[h.fam] || null }));
    return { kgPadre, costoPadre, costoKgPadre: kgPadre ? costoPadre / kgPadre : 0, kgVend, kgMerma, kgCarne, kgDif: kgPadre - sum(hijos, h=>h.kg),
      rendVend: kgPadre ? kgVend / kgPadre : 0, rendCarne: kgPadre ? kgCarne / kgPadre : 0, pctMerma: kgPadre ? kgMerma / kgPadre : 0,
      costoKgUtil: kgVend ? costoPadre / kgVend : 0, valorLista, margenLista: valorLista ? 1 - f : 0,
      valorReal, margenReal: valorReal ? 1 - costoPadre / valorReal : 0, famsSinVenta, costoERP: sum(hijos, h => h.total), factorVRV: f, cortes };
  }

  /* ---------- Ventas/compras ---------- */
  function aggVentas(rows, overrides) {
    const porFam = {}, porArt = {}, porDia = {};
    const padres = { kg:0, sc:0 }, trastes = { kg:0, sc:0 }, sinMapeo = new Set();
    const tot = { sv:0, cv:0, kv:0, pd:0, sc:0, kvCanal:0 };
    for (const r of rows) {
      const k = clasificarArticulo(r, overrides);
      if (k.rol === 'EXCLUIDO') continue;
      tot.sv += r.sv; tot.cv += r.cv; tot.pd += r.pd; tot.sc += r.sc;
      if (k.rol === 'PADRE') { const b = k.padre === 'TRASTES' ? trastes : padres; b.kg += r.kc; b.sc += r.sc; }
      if (k.rol === 'SIN_MAPEO') sinMapeo.add(r.c + ' · ' + r.a);
      const kg = r.kv * factorKg(r);
      if (k.rol === 'HIJO') {
        tot.kv += kg; if (famCanal(k.fam)) tot.kvCanal += kg;
        const F = porFam[k.fam] ||= { fam:k.fam, kv:0, sv:0, cv:0 }; F.kv += kg; F.sv += r.sv; F.cv += r.cv;
      }
      const A = porArt[r.c] ||= { c:r.c, a:r.a, fam:k.fam, rol:k.rol, origen:k.origen, kv:0, sv:0, cv:0, kc:0, sc:0 };
      A.kv += kg; A.sv += r.sv; A.cv += r.cv; A.kc += r.kc; A.sc += r.sc;
      const D = porDia[r.f] ||= { f:r.f, sv:0, cv:0, kv:0 }; D.sv += r.sv; D.cv += r.cv; if (k.rol==='HIJO') D.kv += kg;
    }
    Object.values(porFam).forEach(F => { F.precio = F.kv ? F.sv / F.kv : 0; F.margen = F.sv ? 1 - F.cv / F.sv : 0; });
    return { tot, porFam, porArt, porDia, padres, trastes, sinMapeo:[...sinMapeo] };
  }

  /* ---------- Ajustes de Kardex ----------
     Merma operativa de la canal (K) = −Σ kg netos de motivos de MERMA en familias que salen del desposte (canal:true).
     Vísceras y cortes comprados (Disprocar) se reportan aparte. */
  function aggAjustes(rows, ovArt, ovMot) {
    const porMot = {}, porFam = {};
    const r0 = () => ({ kg:0, usd:0, ent:0, sal:0, n:0 });
    const canal = { MERMA:r0(), CONSUMO:r0(), TRANSFORMACION:r0(), OTRO:r0() }, otros = { MERMA:r0(), CONSUMO:r0(), TRANSFORMACION:r0(), OTRO:r0() };
    for (const r of rows) {
      const cl = motivoClase(r.mot, ovMot);
      const k = clasificarArticulo(r, ovArt); if (k.rol === 'EXCLUIDO') continue;
      const esCanal = k.rol === 'HIJO' && famCanal(k.fam);
      const B = (esCanal ? canal : otros)[cl];
      B.kg += r.kg; B.usd += r.usd; B.n++; if (r.kg >= 0) B.ent += r.kg; else B.sal += r.kg;
      const M = porMot[r.mot] ||= { mot:r.mot, cl, kg:0, usd:0, ent:0, sal:0, n:0, kgCanal:0 };
      M.kg += r.kg; M.usd += r.usd; M.n++; if (r.kg >= 0) M.ent += r.kg; else M.sal += r.kg; if (esCanal) M.kgCanal += r.kg;
      if (k.fam) { const F = porFam[k.fam] ||= { fam:k.fam, merma:0, transf:0, consumo:0 }; if (cl === 'MERMA') F.merma += r.kg; else if (cl === 'TRANSFORMACION') F.transf += r.kg; else if (cl === 'CONSUMO') F.consumo += r.kg; }
    }
    return { canal, otros, porMot, porFam,
      K: -canal.MERMA.kg, Kusd: -canal.MERMA.usd, consumo: -canal.CONSUMO.kg, transf: canal.TRANSFORMACION.kg,
      Kvisc: -otros.MERMA.kg, Kotros: -otros.MERMA.usd };
  }

  /* Merma total y rendimiento neto
     t = merma técnica del acta (kg no vendibles / kg canal)
     o = merma operativa = K / (kg vendidos de canal + K)   → parte del producto disponible que se perdió después del desposte
     Rend. neto = (1 − t) × (1 − o);  Merma total = 1 − Rend. neto = t + (1 − t) × o */
  function mermaTotal(t, K, kgVendCanal) {
    const o = kgVendCanal > 0 ? Math.max(0, K) / (kgVendCanal + Math.max(0, K)) : null;
    if (t == null) return { t:null, o, neto:null, total:null };
    const neto = (1 - t) * (1 - (o ?? 0));
    return { t, o, neto, total: 1 - neto, parcial: o == null };
  }

  return { TIENDAS, FAMILIAS, CLASES, PADRES, MOTIVO_CLASES, norm, num, padreDe, familiaPorRegla, kgPorUnidad, motivoClase, tipoExcel,
    parseDesposte, validarDesposte, parseVentas, parseAjustes, clasificarArticulo, factorKg, kpiDesposte, aggVentas, aggAjustes, mermaTotal, famClase, famCanal, sum };
})();
if (typeof module !== 'undefined') module.exports = Core;
