# DexNum · Aprende la Pokédex

Juego para móvil para memorizar el **número de Pokédex de los 1025 Pokémon** (Gen 1–9).
Es una web app (PWA): se instala en el móvil como una app, funciona sin conexión y no necesita servidor ni cuenta. El progreso se guarda en el propio dispositivo.

## Método de aprendizaje

1. **Bloques de 10** (001–010, 011–020…): memorizar por decenas es mucho más fácil que números sueltos. Cada ficha da pistas: posición dentro de la decena, de quién evoluciona y a quién, si abre/cierra generación.
2. **Práctica inmediata** del bloque: primero *reconocer* (elegir entre 4), luego *recordar* (teclear el número). Lo fallado vuelve a salir en la misma sesión.
3. **Repetición espaciada** (Leitner): cada acierto aleja el siguiente repaso (4 h → 1 d → 3 d → 7 d → 16 d → 40 d); cada fallo lo acerca. Nivel 4+ = dominado.
4. Los distractores son **Pokémon de números cercanos** y **números con cifras cambiadas** (152 ↔ 125), para que aprendas el número exacto y no solo "más o menos".

## Modos

- 📘 **Aprender**: siguiente bloque de 10 Pokémon.
- 🔁 **Repasar**: los Pokémon que toca repasar hoy.
- ⏱️ **Contrarreloj**: 60 s, rachas de 5+ puntúan doble, fallo = −3 s.
- 🎯 **Práctica libre**: por generación, por centenas, tus aprendidos o los que más fallas; eliges el tipo de pregunta.
- 🗺️ **Mapa Pokédex**: cuadrícula por generación coloreada según lo que dominas.
- ⚙️ **Ajustes**: generaciones en juego, sonido, vibración, objetivo diario, exportar/importar progreso.

Tipos de pregunta: número → Pokémon, Pokémon → número (elegir o teclear), quién va antes/después, ordenar 4 Pokémon.

## Jugar en el móvil

1. Publica la carpeta en GitHub Pages (ya hay un workflow en `.github/workflows/pages.yml`: activa *Settings → Pages → Source: GitHub Actions* y haz merge a `main`).
2. Abre la URL en el móvil:
   - **Android (Chrome)**: menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.
   - **iPhone (Safari)**: botón compartir → *Añadir a pantalla de inicio*.

En local: `python3 -m http.server` en esta carpeta y abre `http://localhost:8000`.

## Estructura

- `index.html`, `css/style.css`, `js/app.js`: la app (JavaScript sin dependencias).
- `js/data.js`: datos de los 1025 Pokémon (nombre en español, generación, tipos, categoría, preevolución), generados con `tools/build_data.py` a partir de los CSV de [PokeAPI](https://github.com/PokeAPI/pokeapi).
- `sw.js`, `manifest.json`: modo offline e instalación. Los sprites se cargan de [PokeAPI/sprites](https://github.com/PokeAPI/sprites) y se guardan en caché al verlos.

Proyecto de fans sin ánimo de lucro. Pokémon y sus nombres son marcas de Nintendo, Game Freak y The Pokémon Company.
