"""Arma ../index.html a partir de app.html + core.js + cloud.js + seed.json (datos iniciales).
Uso: python3 src/build.py   (desde la raíz del repositorio)"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
rd = lambda f: open(os.path.join(D, f), encoding='utf-8').read()
seed = json.load(open(os.path.join(D, 'seed.json'), encoding='utf-8'))
vk = ['t','dp','g','c','a','u','f','kv','cv','sv','kc','sc','pd']
ak = ['t','c','a','mot','tipo','dp','g','sub','kg','usd','desde','hasta']
r = lambda x: round(x, 4) if isinstance(x, float) else x
S = {'fecha':'2026-10-15', 'vk':vk, 'ak':ak, 'despostes':seed['despostes'],
     'ventas':[[r(v[k]) for k in vk] for v in seed['ventas']], 'ajustes':[[r(v[k]) for k in ak] for v in seed['ajustes']]}
core = rd('core.js').replace("if (typeof module !== 'undefined') module.exports = Core;", "")
html = rd('app.html').replace('/*__CLOUD__*/', rd('cloud.js')).replace('/*__CORE__*/', core).replace('/*__SEED__*/', json.dumps(S, ensure_ascii=False, separators=(',',':')))
open(os.path.join(D, '..', 'index.html'), 'w', encoding='utf-8').write(html)
print('index.html generado:', len(html), 'bytes')
