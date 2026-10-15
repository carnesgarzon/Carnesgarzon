"""Genera supabase_tablero_res.sql: esquema, seguridad, función de reemplazo de ajustes y datos iniciales."""
import json

import os
D = os.path.dirname(os.path.abspath(__file__))
seed = json.load(open(os.path.join(D, 'seed.json'), encoding='utf-8'))

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(round(v, 6)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"

ESQUEMA = r"""
-- =====================================================================
--  TABLERO CARNE DE RES · Grupo Garzón · Perecederos
--  Pegar completo en Supabase → SQL Editor → Run. Se puede correr de nuevo
--  sin duplicar nada (usa IF NOT EXISTS / ON CONFLICT).
--  Regla de oro: desde la página NO se borra nada.
--    · Quitar un acta = marcarla anulada (anulado = true).
--    · Recargar ajustes de un rango = los anteriores quedan vigente = false.
-- =====================================================================

-- 1) ACTAS DE DESPOSTE (Reporte de Producción)
create table if not exists public.res_despostes (
  id              text primary key,                 -- TIENDA|doc padre|fecha
  tienda          text not null,
  fecha           date not null,
  nombre          text,
  merma_kg        numeric,
  subtotal        numeric,
  fuente          text,                             -- nombre del PDF
  padres          jsonb not null default '[]',      -- productos a utilizar
  hijos           jsonb not null default '[]',      -- productos terminados
  anulado         boolean not null default false,
  cargado_en      timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists res_despostes_tienda_fecha on public.res_despostes (tienda, fecha);

-- 2) VENTAS Y COMPRAS DIARIAS (VentasxDpto) · una fila por tienda + código + día
create table if not exists public.res_ventas (
  tienda          text not null,
  codigo          text not null,
  fecha           date not null,
  departamento    text,
  grupo           text,
  articulo        text,
  tipo_articulo   text,
  kg_venta        numeric not null default 0,
  costo_venta     numeric not null default 0,
  venta           numeric not null default 0,
  kg_compra       numeric not null default 0,
  compra          numeric not null default 0,
  promo           numeric not null default 0,
  actualizado_en  timestamptz not null default now(),
  primary key (tienda, codigo, fecha)
);
create index if not exists res_ventas_fecha on public.res_ventas (fecha);

-- 3) AJUSTES DE KARDEX · el reporte trae rango (desde/hasta), no fecha por movimiento
create table if not exists public.res_ajustes (
  id              bigint generated always as identity primary key,
  tienda          text not null,
  codigo          text not null,
  articulo        text,
  motivo          text not null,
  tipo            text,                             -- ENTRADA / SALIDA
  departamento    text,
  grupo           text,
  subgrupo        text,
  kg              numeric not null default 0,       -- con signo
  usd             numeric not null default 0,       -- columna Total en USD
  desde           date not null,
  hasta           date not null,
  archivo         text,
  vigente         boolean not null default true,
  cargado_en      timestamptz not null default now(),
  reemplazado_en  timestamptz
);
create index if not exists res_ajustes_vigentes on public.res_ajustes (tienda, desde, hasta) where vigente;

-- 4) CONFIGURACIÓN (mapeo de artículos, motivos y estándar teórico)
create table if not exists public.res_config (
  clave           text primary key,
  valor           jsonb not null default '{}',
  actualizado_en  timestamptz not null default now()
);

-- 5) BITÁCORA DE CARGAS
create table if not exists public.res_cargas (
  id              bigint generated always as identity primary key,
  archivo         text,
  tipo            text,
  detalle         text,
  filas           integer,
  cargado_en      timestamptz not null default now()
);

-- Fecha de última actualización automática
create or replace function public.res_tocar() returns trigger
language plpgsql set search_path = public as $$
begin new.actualizado_en := now(); return new; end $$;

drop trigger if exists res_despostes_tocar on public.res_despostes;
create trigger res_despostes_tocar before update on public.res_despostes for each row execute function public.res_tocar();
drop trigger if exists res_ventas_tocar on public.res_ventas;
create trigger res_ventas_tocar before update on public.res_ventas for each row execute function public.res_tocar();
drop trigger if exists res_config_tocar on public.res_config;
create trigger res_config_tocar before update on public.res_config for each row execute function public.res_tocar();

-- Reemplazo de ajustes de un rango: los vigentes de las mismas tiendas que se solapan
-- quedan como historial (vigente = false) y entran los nuevos. Todo en una transacción.
create or replace function public.res_reemplazar_ajustes(p_desde date, p_hasta date, p_archivo text, p_filas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep integer; v_ins integer;
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas inválido';
  end if;
  update res_ajustes a set vigente = false, reemplazado_en = now()
   where a.vigente
     and a.tienda in (select distinct x->>'t' from jsonb_array_elements(p_filas) x)
     and a.desde <= p_hasta and a.hasta >= p_desde;
  get diagnostics v_rep = row_count;
  insert into res_ajustes (tienda, codigo, articulo, motivo, tipo, departamento, grupo, subgrupo, kg, usd, desde, hasta, archivo)
  select r.t, r.c, r.a, r.mot, r.tipo, r.dp, r.g, r.sub, coalesce(r.kg, 0), coalesce(r.usd, 0), p_desde, p_hasta, p_archivo
    from jsonb_to_recordset(p_filas) as r(t text, c text, a text, mot text, tipo text, dp text, g text, sub text, kg numeric, usd numeric);
  get diagnostics v_ins = row_count;
  return jsonb_build_object('reemplazados', v_rep, 'insertados', v_ins);
end $$;

-- Vista para análisis en SQL: un renglón por corte de cada acta vigente
create or replace view public.res_cortes_desposte with (security_invoker = true) as
select d.id, d.tienda, d.fecha,
       h->>'art'                as corte,
       (h->>'kg')::numeric      as kg,
       (h->>'costo')::numeric   as costo,
       (h->>'precio')::numeric  as pmvp,
       (h->>'total')::numeric   as total
  from public.res_despostes d, jsonb_array_elements(d.hijos) h
 where not d.anulado;

-- =====================================================================
--  SEGURIDAD: la página usa la clave pública. Puede leer, insertar y
--  actualizar, pero NO borrar. Sin políticas de DELETE y sin permiso DELETE.
-- =====================================================================
alter table public.res_despostes enable row level security;
alter table public.res_ventas    enable row level security;
alter table public.res_ajustes   enable row level security;
alter table public.res_config    enable row level security;
alter table public.res_cargas    enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.res_despostes, public.res_ventas, public.res_config to anon, authenticated;
grant select on public.res_ajustes to anon, authenticated;
grant select, insert on public.res_cargas to anon, authenticated;
grant select on public.res_cortes_desposte to anon, authenticated;
revoke delete, truncate on public.res_despostes, public.res_ventas, public.res_ajustes, public.res_config, public.res_cargas from anon, authenticated;

revoke all on function public.res_reemplazar_ajustes(date, date, text, jsonb) from public;
grant execute on function public.res_reemplazar_ajustes(date, date, text, jsonb) to anon, authenticated;
revoke all on function public.res_tocar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['res_despostes','res_ventas','res_ajustes','res_config','res_cargas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_leer', t);
  end loop;
  foreach t in array array['res_despostes','res_ventas','res_config','res_cargas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insertar', t);
    execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', t || '_insertar', t);
  end loop;
  foreach t in array array['res_despostes','res_ventas','res_config'] loop
    execute format('drop policy if exists %I on public.%I', t || '_actualizar', t);
    execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', t || '_actualizar', t);
  end loop;
end $$;
"""

out = [ESQUEMA, "\n-- =====================================================================\n--  DATOS INICIALES (archivos del 15/10/2026). Si ya existen, no se duplican.\n-- =====================================================================\n"]

# Despostes
for d in seed['despostes']:
    hijos = [{k: v for k, v in h.items() if k != 'fam'} for h in d['hijos']]
    out.append("insert into public.res_despostes (id, tienda, fecha, nombre, merma_kg, subtotal, fuente, padres, hijos) values ("
               + ", ".join([q(d['id']), q(d['tienda']), q(d['fecha']), q(d['nombre']), q(d['merma']), q(d['subtotal']), q(d.get('fuente')),
                            q(json.dumps(d['padres'], ensure_ascii=False)) + '::jsonb', q(json.dumps(hijos, ensure_ascii=False)) + '::jsonb'])
               + ") on conflict (id) do nothing;\n")

# Ventas
vals = []
for v in seed['ventas']:
    vals.append("(" + ", ".join(q(x) for x in [v['t'], v['c'], v['f'], v['dp'], v['g'], v['a'], v['u'], v['kv'], v['cv'], v['sv'], v['kc'], v['sc'], v['pd']]) + ")")
for i in range(0, len(vals), 500):
    out.append("insert into public.res_ventas (tienda, codigo, fecha, departamento, grupo, articulo, tipo_articulo, kg_venta, costo_venta, venta, kg_compra, compra, promo) values\n"
               + ",\n".join(vals[i:i+500]) + "\non conflict (tienda, codigo, fecha) do nothing;\n")

# Ajustes: solo si la tabla está vacía (evita duplicar al correr el script otra vez)
aj = seed['ajustes']
desde, hasta = aj[0]['desde'], aj[0]['hasta']
filas = json.dumps([{k: r[k] for k in ['t','c','a','mot','tipo','dp','g','sub','kg','usd']} for r in aj], ensure_ascii=False)
out.append(f"do $$ begin\n  if not exists (select 1 from public.res_ajustes) then\n    perform public.res_reemplazar_ajustes({q(desde)}::date, {q(hasta)}::date, 'AjustesKardex.xlsx', {q(filas)}::jsonb);\n  end if;\nend $$;\n")
out.append("insert into public.res_cargas (archivo, tipo, detalle, filas) select 'Datos iniciales', 'SEMILLA', '1 acta Pirineos, VentasxDpto 01-14/10 (5 tiendas), Ajustes de Kardex 01-14/10 (14 tiendas)', "
           + str(len(seed['despostes']) + len(seed['ventas']) + len(aj)) + " where not exists (select 1 from public.res_cargas);\n")

out.append("""
-- Verificación: debe mostrar 1 acta, 1009 ventas y 274 ajustes vigentes
select (select count(*) from public.res_despostes where not anulado) as actas,
       (select count(*) from public.res_ventas) as ventas,
       (select count(*) from public.res_ajustes where vigente) as ajustes;
""")
open(os.path.join(D, '..', 'supabase', 'supabase_tablero_res.sql'), 'w', encoding='utf-8').write("".join(out))
print('ok', sum(len(x) for x in out))
