/* ---------- Supabase (nube) ----------
   Pega aquí la URL y la clave publicable de tu proyecto, o conéctalo desde "Cargar archivos"
   (en ese caso se guarda solo en este navegador). */
const SUPABASE = { url: '', key: '' };
const Cloud = { cfg:null, estado:'local', error:'', pend:[], sync:null,
  init(){ let c = { ...SUPABASE }; try { const s = JSON.parse(localStorage.getItem('tablero-res-sb')||'null'); if (s && s.url && s.key) c = s; } catch(e){}
    this.cfg = (c.url && c.key) ? { url:limpiaUrl(c.url), key:String(c.key).trim() } : null; this.estado = this.cfg ? 'conectando' : 'local'; },
  headers(prefer){ const h = { apikey:this.cfg.key, 'Content-Type':'application/json' }; if (/^eyJ/.test(this.cfg.key)) h.Authorization = 'Bearer ' + this.cfg.key; if (prefer) h.Prefer = prefer; return h; },
  async req(path, { method='GET', body, prefer } = {}){
    let r; try { r = await fetch(`${this.cfg.url}/rest/v1/${path}`, { method, headers:this.headers(prefer), body: body == null ? undefined : JSON.stringify(body) }); }
    catch(e) { throw new Error('No hay conexión con Supabase: sin internet, o la página no permite conexiones externas (la vista previa del chat no las permite).'); }
    if (!r.ok) { let m = r.statusText, code = ''; try { const j = await r.json(); m = j.message || j.hint || m; code = j.code || ''; } catch(e){}
      const hint = (r.status === 404 || /PGRST20[25]|42P01|does not exist|Could not find/.test(code + ' ' + m)) ? ' Corre primero supabase_tablero_res.sql en el SQL Editor del proyecto.' : (r.status === 401 || r.status === 403) ? ' Revisa que la clave sea la publicable (anon) de ese proyecto.' : '';
      throw new Error(`Supabase respondió ${r.status}: ${m}.${hint}`); }
    const t = await r.text(); return t ? JSON.parse(t) : null; },
  async all(table, filter, order){ const out = []; for (let off = 0; ; off += 1000) { const rows = await this.req(`${table}?select=*${filter}&order=${order}&limit=1000&offset=${off}`); out.push(...rows); if (rows.length < 1000) return out; } },
  async upsert(table, rows, conflict){ for (let i = 0; i < rows.length; i += 500) await this.req(`${table}?on_conflict=${conflict}`, { method:'POST', body:rows.slice(i, i+500), prefer:'resolution=merge-duplicates,return=minimal' }); }
};
function limpiaUrl(u){ return String(u).trim().replace(/\/+$/,'').replace(/\/rest\/v1$/,''); }
const toV = r => ({ tienda:r.t, codigo:r.c, fecha:r.f, departamento:r.dp||null, grupo:r.g||null, articulo:r.a, tipo_articulo:r.u||null, kg_venta:r.kv||0, costo_venta:r.cv||0, venta:r.sv||0, kg_compra:r.kc||0, compra:r.sc||0, promo:r.pd||0 });
const fromV = x => ({ t:x.tienda, c:String(x.codigo), f:x.fecha, dp:x.departamento||'', g:x.grupo||'', a:x.articulo||'', u:x.tipo_articulo||'', kv:+x.kg_venta, cv:+x.costo_venta, sv:+x.venta, kc:+x.kg_compra, sc:+x.compra, pd:+x.promo||0 });
const fromA = x => ({ t:x.tienda, c:String(x.codigo), a:x.articulo||'', mot:x.motivo, tipo:x.tipo||'', dp:x.departamento||'', g:x.grupo||'', sub:x.subgrupo||'', kg:+x.kg, usd:+x.usd, desde:x.desde, hasta:x.hasta });
const filaAj = r => ({ t:r.t, c:r.c, a:r.a, mot:r.mot, tipo:r.tipo, dp:r.dp, g:r.g, sub:r.sub, kg:r.kg, usd:r.usd });
const toD = d => ({ id:d.id, tienda:d.tienda, fecha:d.fecha, nombre:d.nombre, merma_kg:d.merma, subtotal:d.subtotal, fuente:d.fuente||null, padres:d.padres, hijos:d.hijos.map(({ fam, ...h }) => h), anulado:false });
const fromD = x => Core.validarDesposte({ tienda:x.tienda, fecha:x.fecha, nombre:x.nombre||'', merma:+x.merma_kg, subtotal:+x.subtotal, fuente:x.fuente||'', padres:x.padres||[], hijos:x.hijos||[] });
async function ejecutar(op){
  switch (op.k) {
    case 'desp':   return Cloud.upsert('res_despostes', op.rows.map(toD), 'id');
    case 'ven':    return Cloud.upsert('res_ventas', op.rows.map(toV), 'tienda,codigo,fecha');
    case 'aj':     return Cloud.req('rpc/res_reemplazar_ajustes', { method:'POST', body:{ p_desde:op.desde, p_hasta:op.hasta, p_archivo:op.archivo||null, p_filas:op.filas } });
    case 'anular': return Cloud.req(`res_despostes?id=eq.${encodeURIComponent(op.id)}`, { method:'PATCH', body:{ anulado:true }, prefer:'return=minimal' });
    case 'cfg':    return Cloud.upsert('res_config', [{ clave:'ov', valor:S.ov }, { clave:'ovMot', valor:S.ovMot }, { clave:'est', valor:S.est }], 'clave');
    case 'log':    return Cloud.req('res_cargas', { method:'POST', body:op.row, prefer:'return=minimal' });
  }
}
// Escribe en la nube; si falla, queda en cola (guardada en este navegador) y se reintenta al recargar
async function nube(op){
  if (!Cloud.cfg) return null;
  try { await ejecutar(op); if (!Cloud.pend.length) { Cloud.estado = 'ok'; Cloud.error = ''; Cloud.sync = new Date(); } return true; }
  catch(e) { if (op.k === 'log') return false;   // la bitácora no es crítica: no se encola
    if (!(op.k === 'cfg' && Cloud.pend.some(p => p.k === 'cfg'))) Cloud.pend.push(op); Cloud.estado = 'pendiente'; Cloud.error = e.message; await DB.set('pend', Cloud.pend); return false; }
}
async function syncPend(){ const q = Cloud.pend.slice(); Cloud.pend = []; for (const op of q) { try { await ejecutar(op); } catch(e) { Cloud.pend.push(op); Cloud.error = e.message; } } await DB.set('pend', Cloud.pend); return !Cloud.pend.length; }
async function cargarNube(){
  Cloud.estado = 'conectando'; pintarEstado();
  try {
    if (Cloud.pend.length && !(await syncPend())) { Cloud.estado = 'pendiente'; return false; }   // no pisar datos locales que aún no subieron
    const [d, v, a, c] = await Promise.all([ Cloud.all('res_despostes', '&anulado=eq.false', 'id'), Cloud.all('res_ventas', '', 'tienda,codigo,fecha'), Cloud.all('res_ajustes', '&vigente=eq.true', 'id'), Cloud.all('res_config', '', 'clave') ]);
    S.despostes = d.map(fromD); S.ventas = v.map(fromV); S.ajustes = a.map(fromA);
    const cf = Object.fromEntries(c.map(x => [x.clave, x.valor])); S.ov = cf.ov || {}; S.ovMot = cf.ovMot || {}; S.est = cf.est || {};
    Cloud.estado = 'ok'; Cloud.error = ''; Cloud.sync = new Date(); dirty(); await save(); return true;
  } catch(e) { Cloud.estado = 'error'; Cloud.error = e.message; return false; }
}
async function subirTodo(){
  await ejecutar({ k:'desp', rows:S.despostes }); await ejecutar({ k:'ven', rows:S.ventas });
  const grupos = {}; S.ajustes.forEach(r => (grupos[r.desde + '|' + r.hasta] ||= []).push(r));
  for (const [k, rows] of Object.entries(grupos)) { const [desde, hasta] = k.split('|'); await ejecutar({ k:'aj', desde, hasta, archivo:'Subida desde el navegador', filas:rows.map(filaAj) }); }
  await ejecutar({ k:'cfg' });
}
function estadoNube(){
  const hora = Cloud.sync ? Cloud.sync.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' }) : '';
  const M = { local:['w','Solo en este navegador'], conectando:['n','Conectando con Supabase…'], ok:['g','Guardado en Supabase' + (hora ? ' · ' + hora : '')],
    pendiente:['w', `${Cloud.pend.length} carga(s) sin subir a Supabase`], error:['c','Supabase sin conexión · usando copia local'] }[Cloud.estado] || ['n',''];
  return { cls:M[0], txt:M[1] };
}
function pintarEstado(){ const el = document.getElementById('nube'); if (!el) return; const e = estadoNube(); el.className = 'chip st-' + e.cls; el.innerHTML = `<i class="dotst"></i>${e.txt}`; }
