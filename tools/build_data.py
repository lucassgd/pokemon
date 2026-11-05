# Genera js/data.js a partir de los CSV de PokeAPI (data/v2/csv).
# Uso: python3 tools/build_data.py <carpeta_csv> js/data.js
import csv, json, sys
d = sys.argv[1]
en, es, gn = {}, {}, {}
for r in csv.DictReader(open(f'{d}/pokemon_species_names.csv', encoding='utf-8')):
    i = int(r['pokemon_species_id'])
    if r['local_language_id']=='9': en[i]=r['name']
    if r['local_language_id']=='7': es[i]=r['name']; gn[i]=r['genus']
types = {}
for r in csv.DictReader(open(f'{d}/pokemon_types.csv')):
    i=int(r['pokemon_id'])
    if i<=1025: types.setdefault(i,[]).append(int(r['type_id']))
sp = {int(r['id']):r for r in csv.DictReader(open(f'{d}/pokemon_species.csv'))}
out=[]
miss=0
for i in range(1,1026):
    s=sp[i]
    if i not in gn: miss+=1
    row=[es.get(i,en[i]), int(s['generation_id']), types[i], gn.get(i,''), int(s['evolves_from_species_id'] or 0)]
    if es.get(i,en[i])!=en[i]: row.append(en[i])
    out.append(row)
diff=[(i,en[i],es.get(i)) for i in range(1,1026) if es.get(i)!=en[i]]
print('missing es genus',miss,'name diffs',len(diff),diff[:15], file=sys.stderr)
js='// Datos: [nombre (ES), generación, tipos, categoría, evoluciona de, nombre EN si difiere]\n// Fuente: PokeAPI (https://github.com/PokeAPI/pokeapi)\nconst POKEDEX = ' + json.dumps(out, ensure_ascii=False, separators=(',',':')) + ';\n'
open(sys.argv[2],'w',encoding='utf-8').write(js)
