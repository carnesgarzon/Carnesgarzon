# Tablero Carne de Res · Grupo Garzón

Tablero de control de la categoría Carnes Rojas: desposte, rendimiento, merma total (actas + ajustes de Kardex) y margen por tienda. Es un solo archivo `index.html`; los datos viven en Supabase.

> **Usa un repositorio privado.** `index.html` y el SQL traen los datos iniciales de ventas, compras y ajustes de la cadena (01–14/10/2026). Netlify publica desde repositorios privados sin problema.

## Contenido

| Ruta | Para qué sirve |
|---|---|
| `index.html` | El tablero completo. Es lo que publica Netlify. |
| `netlify.toml` | Le dice a Netlify que publique la raíz tal cual, sin paso de compilación. |
| `supabase/supabase_tablero_res.sql` | Crea tablas, seguridad y datos iniciales. Se corre **una vez** en el SQL Editor de Supabase; repetirlo no duplica nada. |
| `src/` | Código fuente (`app.html`, `core.js`, `cloud.js`) y scripts que regeneran `index.html` y el SQL. Solo hace falta si se edita el código. |

## Puesta en marcha (una sola vez)

1. **GitHub:** crea un repositorio privado con tu cuenta, por ejemplo `tablero-carne-res`. Usa *Add file → Upload files* y arrastra todo el contenido de esta carpeta. Confirma con *Commit changes*.
2. **Supabase:** en tu proyecto abre el SQL Editor, pega `supabase/supabase_tablero_res.sql` completo y dale *Run*. Al final debe mostrar 1 acta, 1009 ventas y 274 ajustes.
3. **Netlify:** *Add new site → Import an existing project → GitHub*. Autoriza tu cuenta de GitHub, elige el repositorio y deja vacío el comando de build. El directorio de publicación lo toma de `netlify.toml`.
4. **Conectar:** abre el sitio publicado, ve a *Cargar archivos* y pega la URL del proyecto de Supabase y la clave publicable (anon). La conexión queda guardada en ese navegador; en otra computadora se repite este paso.

Para no pegar la conexión en cada computadora, puedes escribirla en `src/cloud.js` (`const SUPABASE = { url: '', key: '' }`) y regenerar `index.html`. La clave publicable puede ir en el código: la seguridad la dan las reglas del SQL, que no permiten borrar.

## Actualizaciones

- **Cuando recibas un `index.html` nuevo:** en GitHub abre `index.html` → *Upload files* (o arrástralo sobre el repositorio) → *Commit changes*. Netlify publica la nueva versión sola en uno o dos minutos. Tus datos no se tocan porque están en Supabase.
- **Historial:** cada commit queda guardado en GitHub; si una versión falla, Netlify permite volver a la anterior desde *Deploys*.

## Carga mensual

Arrastra en *Cargar archivos* los PDF de desposte (Reporte de Producción), el VentasxDpto y el Ajustes de Kardex. Nada se duplica:

- Acta repetida (tienda + documento + fecha) → se reemplaza.
- Ventas → se actualizan por tienda + código + día.
- Ajustes → los de un rango que se solapa quedan como historial (`vigente = false`).
- Quitar un acta → queda `anulado = true` en Supabase (recuperable).

## Regenerar desde el código (opcional)

```bash
python3 src/build.py     # arma index.html
python3 src/gen_sql.py   # arma supabase/supabase_tablero_res.sql
```
