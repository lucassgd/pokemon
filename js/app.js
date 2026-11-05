'use strict';
/* DexNum — aprende el número de Pokédex de todos los Pokémon.
 *
 * Método de aprendizaje:
 *  1. Bloques de 10 (001–010, 011–020…): los números se memorizan mejor por decenas.
 *  2. Presentación: ves las 10 fichas con pistas (posición en la decena, evolución…).
 *  3. Práctica inmediata: primero preguntas fáciles (elegir), luego difíciles (teclear).
 *  4. Repetición espaciada (sistema Leitner): cada Pokémon vuelve cuando estás a punto
 *     de olvidarlo. Si fallas, baja de nivel y vuelve antes.
 */

const N = POKEDEX.length;
const GENS = [[1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025]];
const GEN_REGION = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
const TYPES = {
  1: ['Normal', '#9a9a7a'], 2: ['Lucha', '#c03028'], 3: ['Volador', '#8f7ad8'], 4: ['Veneno', '#a040a0'],
  5: ['Tierra', '#c9a75a'], 6: ['Roca', '#b8a038'], 7: ['Bicho', '#98a820'], 8: ['Fantasma', '#705898'],
  9: ['Acero', '#9a9ab8'], 10: ['Fuego', '#f08030'], 11: ['Agua', '#6890f0'], 12: ['Planta', '#68b848'],
  13: ['Eléctrico', '#e0b800'], 14: ['Psíquico', '#f85888'], 15: ['Hielo', '#78c8c8'], 16: ['Dragón', '#7038f8'],
  17: ['Siniestro', '#705848'], 18: ['Hada', '#e080b0'],
};
const HOUR = 3600e3, DAY = 24 * HOUR;
// Intervalos de repaso por nivel (caja Leitner). Nivel ≥ 4 = dominado.
const INTERVALS = [0, 4 * HOUR, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 40 * DAY];
const MAX_BOX = INTERVALS.length - 1;
const MASTERED = 4;
const REVIEW_SIZE = 25;
const TIME_ATTACK_SECONDS = 60;
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

const P = id => POKEDEX[id - 1];
const nameOf = id => P(id)[0];
const genOf = id => P(id)[1];
const fmt = id => '#' + String(id).padStart(3, '0');
const blockOf = id => Math.floor((id - 1) / 10);
const blockRange = b => [b * 10 + 1, Math.min(N, b * 10 + 10)];
const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[rand(a.length)];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const $ = sel => document.querySelector(sel);
const app = $('#app');

/* ---------- Estado persistente ---------- */
const KEY = 'dexnum-v1';
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD local
function defaultState() {
  return {
    v: 1,
    cards: {},             // id -> { b: nivel, d: próxima fecha, ok, ko }
    settings: { gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], sound: true, vibrate: true, dailyGoal: 50 },
    stats: { streak: 0, lastDay: null, todayDate: null, today: 0, answers: 0, correct: 0, bestTime: 0 },
  };
}
let S = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) {
      const d = defaultState();
      return { ...d, ...s, settings: { ...d.settings, ...s.settings }, stats: { ...d.stats, ...s.stats } };
    }
  } catch (e) { /* estado corrupto o sin acceso: empezar de cero */ }
  return defaultState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }

const enabledIds = () => S.settings.gens.flatMap(g => range(...GENS[g - 1]));
const isEnabled = id => S.settings.gens.includes(genOf(id));
const card = id => S.cards[id];
const learnedIds = () => Object.keys(S.cards).map(Number).filter(isEnabled);
const level = id => (card(id) ? card(id).b : 0);
function dueIds() {
  const now = Date.now();
  return learnedIds().filter(id => card(id).d <= now).sort((a, b) => card(a).d - card(b).d);
}
function nextBlock() {
  for (let b = 0; b <= blockOf(N); b++) {
    const ids = range(...blockRange(b)).filter(id => isEnabled(id) && !card(id));
    if (ids.length) return { b, ids };
  }
  return null;
}
function bumpDay() {
  const s = S.stats, t = today();
  if (s.todayDate !== t) { s.todayDate = t; s.today = 0; }
}
function recordAnswer(ok) {
  bumpDay();
  const s = S.stats;
  s.answers++; s.today++; if (ok) s.correct++;
  if (s.lastDay !== today()) {
    const y = new Date(Date.now() - DAY).toLocaleDateString('sv');
    s.streak = s.lastDay === y ? s.streak + 1 : 1;
    s.lastDay = today();
  }
}
function schedule(id, ok) {
  const c = S.cards[id] || (S.cards[id] = { b: 0, d: 0, ok: 0, ko: 0 });
  if (ok) { c.b = Math.min(MAX_BOX, c.b + 1); c.ok++; }
  else { c.b = Math.max(1, Math.floor(c.b / 2)); c.ko++; }
  // Pequeño desorden (±10 %) para que los repasos no lleguen siempre en el mismo grupo.
  c.d = Date.now() + INTERVALS[c.b] * (0.9 + Math.random() * 0.2);
}

/* ---------- Sonido y vibración ---------- */
let actx = null;
function beep(ok) {
  if (S.settings.vibrate && !ok && navigator.vibrate) navigator.vibrate(120);
  if (!S.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = ok ? [660, 990] : [220, 160];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = ok ? 'triangle' : 'square'; o.frequency.value = f;
      const t = actx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.16);
    });
  } catch (e) { /* sin audio */ }
}

/* ---------- Fragmentos de HTML ---------- */
const img = (id, cls = 'spr') => `<img class="${cls}" src="${SPRITE(id)}" alt="" loading="lazy" onerror="this.classList.add('err')">`;
const typeChips = id => P(id)[2].map(t => `<span class="chip" style="background:${TYPES[t][1]}">${TYPES[t][0]}</span>`).join('');
const ordinal = n => ['1.º', '2.º', '3.º', '4.º', '5.º', '6.º', '7.º', '8.º', '9.º', '10.º'][n - 1];

function hintFor(id) {
  const [a, b] = blockRange(blockOf(id));
  const pos = id - a + 1;
  const [g0, g1] = GENS[genOf(id) - 1];
  const lines = [`Decena <b>${fmt(a)}–${fmt(b)}</b>: es el <b>${ordinal(pos)}</b> (empieza por ${nameOf(a)}).`];
  const pre = P(id)[4];
  if (pre) lines.push(`Evoluciona de <b>${nameOf(pre)}</b> (${fmt(pre)})${pre === id - 1 ? ', justo el anterior' : ''}.`);
  const nextEvo = id < N && P(id + 1)[4] === id ? id + 1 : 0;
  if (nextEvo) lines.push(`Evoluciona a <b>${nameOf(nextEvo)}</b> (${fmt(nextEvo)}).`);
  if (id === g0) lines.push(`¡Es el <b>primero</b> de la ${genOf(id)}.ª generación!`);
  else if (id === g1) lines.push(`¡Es el <b>último</b> de la ${genOf(id)}.ª generación!`);
  else lines.push(`Gen ${genOf(id)} (${GEN_REGION[genOf(id) - 1]}): ${fmt(g0)}–${fmt(g1)}.`);
  return lines.join('<br>');
}

function dexCard(id, withHint = true) {
  const p = P(id);
  return `<div class="dexcard">
    <div class="num"><span class="h">#</span>${String(id).padStart(3, '0')}</div>
    ${img(id)}
    <div class="name">${p[0]}</div>
    ${p[5] ? `<div class="alt">(${p[5]})</div>` : ''}
    <div class="genus">${p[3]}</div>
    <div class="chips">${typeChips(id)}<span class="chip gray">Gen ${p[1]}</span></div>
    ${withHint ? `<div class="hint">${hintFor(id)}</div>` : ''}
  </div>`;
}

function render(html) { app.innerHTML = `<div class="screen">${html}</div>`; window.scrollTo(0, 0); }
function on(sel, fn) { app.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn)); }
function relTime(ms) {
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} días`;
}

/* ---------- Inicio ---------- */
function home() {
  stopTimer();
  bumpDay();
  const all = enabledIds();
  const learned = learnedIds();
  const mastered = learned.filter(id => level(id) >= MASTERED).length;
  const due = dueIds();
  const nb = nextBlock();
  const pct = n => (100 * n / all.length).toFixed(2) + '%';
  let nextDue = '';
  if (!due.length && learned.length) {
    const soon = Math.min(...learned.map(id => card(id).d));
    nextDue = `Próximo repaso en ${relTime(soon - Date.now())}`;
  }
  const goal = S.settings.dailyGoal;
  const st = S.stats;

  render(`
    <div class="top">
      <h1>Dex<span>Num</span></h1>
      <span class="pill">🔥 ${st.lastDay === today() || st.lastDay === new Date(Date.now() - DAY).toLocaleDateString('sv') ? st.streak : 0}</span>
      <button class="icon-btn" id="settings" aria-label="Ajustes">⚙️</button>
    </div>

    <div class="panel">
      <div class="stats">
        <div><b>${mastered}</b><small>dominados</small></div>
        <div><b>${learned.length}</b><small>aprendidos</small></div>
        <div><b>${all.length}</b><small>en juego</small></div>
      </div>
      <div class="bar" style="margin-top:12px">
        <i style="width:${pct(mastered)};background:var(--ok)"></i>
        <i style="width:${pct(learned.length - mastered)};background:var(--warn)"></i>
      </div>
      <div class="row small muted" style="margin-top:10px">
        <span class="grow">Hoy: ${st.today}/${goal} respuestas</span>
        <span>${st.answers ? Math.round(100 * st.correct / st.answers) : 0}% aciertos</span>
      </div>
      <div class="bar" style="margin-top:6px;height:6px"><i style="width:${Math.min(100, 100 * st.today / goal)}%;background:var(--blue)"></i></div>
    </div>

    <button class="btn big primary" id="review" ${due.length ? '' : 'disabled'}>
      <span class="emo">🔁</span>
      <span>Repasar${due.length ? ` · ${due.length}` : ''}
        <span class="sub">${due.length ? 'Pokémon a punto de olvidarse' : (nextDue || 'Aprende un bloque para empezar')}</span></span>
    </button>

    ${nb ? `
    <button class="btn big orange" id="learn">
      <span class="emo">📘</span>
      <span>Aprender ${fmt(nb.ids[0])}–${fmt(nb.ids[nb.ids.length - 1])}
        <span class="sub">${nb.ids.length} Pokémon nuevos${due.length > 30 ? ' · mejor repasa primero' : ''}</span></span>
    </button>
    <div class="strip">${nb.ids.map(id => `<div class="mini">${img(id, '')}${id}</div>`).join('')}</div>`
    : `<div class="panel center">🏆 ¡Has visto todos los Pokémon de las generaciones elegidas!</div>`}

    <div class="grid2">
      <button class="btn" id="time"><span class="emo">⏱️</span>Contrarreloj<span class="sub">Récord: ${st.bestTime}</span></button>
      <button class="btn" id="practice"><span class="emo">🎯</span>Práctica libre<span class="sub">Sin afectar repasos</span></button>
      <button class="btn" id="map"><span class="emo">🗺️</span>Mapa Pokédex<span class="sub">Tu progreso</span></button>
      <button class="btn" id="help"><span class="emo">💡</span>Cómo funciona<span class="sub">Método</span></button>
    </div>
  `);
  on('#settings', settings);
  on('#review', () => startSession('review', due.slice(0, REVIEW_SIZE)));
  on('#learn', () => learnIntro(nb.ids, 0));
  on('#time', startTimeAttack);
  on('#practice', practiceMenu);
  on('#map', () => dexMap(0));
  on('#help', help);
}

/* ---------- Presentación de un bloque ---------- */
function learnIntro(ids, i) {
  const id = ids[i];
  render(`
    <div class="top">
      <button class="icon-btn" id="back">✕</button>
      <h2>Nuevo bloque · ${i + 1}/${ids.length}</h2>
    </div>
    <div class="strip">${ids.map((x, k) => `<button class="mini ${k === i ? 'cur' : ''}" data-k="${k}">${img(x, '')}${x}</button>`).join('')}</div>
    ${dexCard(id)}
    <div class="spacer"></div>
    <div class="row">
      <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>◀</button>
      ${i < ids.length - 1
        ? `<button class="btn primary" id="next" style="flex:3">Siguiente ▶</button>`
        : `<button class="btn primary" id="go" style="flex:3">¡A practicar! 💪</button>`}
    </div>
  `);
  on('#back', home);
  on('#prev', () => learnIntro(ids, i - 1));
  on('#next', () => learnIntro(ids, i + 1));
  on('#go', () => startSession('learn', ids));
  on('.strip .mini', e => learnIntro(ids, +e.currentTarget.dataset.k));
  // Precarga de sprites del bloque
  ids.forEach(x => { new Image().src = SPRITE(x); });
}

/* ---------- Motor de preguntas ---------- */
let Q = null;      // sesión actual
let timerId = null;

function startSession(mode, ids, opts = {}) {
  const items = [];
  if (mode === 'learn') {
    // Dos rondas: reconocimiento (fácil) y recuerdo (difícil).
    shuffle([...ids]).forEach(id => items.push({ id, kind: pick(['num2name', 'name2numMC']) }));
    shuffle([...ids]).forEach(id => items.push({ id, kind: pick(['type', 'type', 'next', 'num2name']) }));
  } else if (mode === 'review') {
    shuffle([...ids]).forEach(id => items.push({ id, kind: kindForLevel(level(id)) }));
  } else if (mode === 'practice') {
    shuffle([...ids]).slice(0, 20).forEach(id => items.push({ id, kind: opts.kind || pick(['num2name', 'name2numMC', 'type', 'next', 'order']) }));
  }
  Q = { mode, items, i: 0, done: 0, total: items.length, firstTry: {}, retries: {}, wrong: new Set(), streak: 0, opts, pool: ids };
  ask();
}
function kindForLevel(b) {
  if (b <= 1) return pick(['num2name', 'name2numMC', 'type']);
  return pick(['type', 'type', 'type', 'num2name', 'next', 'order']);
}

function nearby(id, spread, n, valid = () => true) {
  const c = [];
  for (let d = 1; d <= spread; d++) { if (id - d >= 1) c.push(id - d); if (id + d <= N) c.push(id + d); }
  return shuffle(c.filter(valid)).slice(0, n);
}
function numberDistractors(id) {
  const s = String(id).padStart(3, '0');
  const set = new Set();
  // Números con las cifras cambiadas de orden (errores típicos: 152 ↔ 125).
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const a = s.split(''); [a[i], a[j]] = [a[j], a[i]];
    const v = +a.join(''); if (v !== id && v >= 1 && v <= N) set.add(v);
  }
  const out = shuffle([...set]).slice(0, 1);
  nearby(id, 12, 10).forEach(v => { if (out.length < 3 && !out.includes(v)) out.push(v); });
  return out;
}

function header() {
  const pct = Q.mode === 'time' ? 0 : 100 * Q.done / Q.total;
  return `<div class="top">
    <button class="icon-btn" id="quit">✕</button>
    ${Q.mode === 'time'
      ? `<span class="pill">⭐ ${Q.score}</span><span class="grow combo">${Q.streak >= 3 ? `x${Q.streak} 🔥` : ''}</span><span class="timer" id="timer"></span>`
      : `<div class="progress"><i style="width:${pct}%"></i></div><span class="pill">${Q.done}/${Q.total}</span>`}
  </div>`;
}

function ask() {
  if (Q.mode !== 'time' && Q.i >= Q.items.length) return finish();
  const it = Q.items[Q.i];
  let { id, kind } = it;
  if (kind === 'next' && N < 2) kind = 'num2name';
  const h = header();

  if (kind === 'num2name') {
    const opts = shuffle([id, ...nearby(id, 12, 3)]);
    render(`${h}
      <div class="prompt"><div class="q">¿Qué Pokémon es el…</div><div class="bignum">${fmt(id)}</div></div>
      <div class="opts">${opts.map(o => `<button class="opt" data-v="${o}">${img(o)}<span class="nm">${nameOf(o)}</span></button>`).join('')}</div>`);
    bindChoice(id);
  } else if (kind === 'name2numMC') {
    const opts = shuffle([id, ...numberDistractors(id)]);
    render(`${h}
      <div class="prompt"><div class="q">¿Qué número tiene…</div>${img(id)}<div class="pname">${nameOf(id)}</div></div>
      <div class="opts">${opts.map(o => `<button class="opt" data-v="${o}"><span class="nn">${fmt(o)}</span></button>`).join('')}</div>`);
    bindChoice(id);
  } else if (kind === 'next') {
    const after = id > 1 && (id === N || Math.random() < 0.6);
    const anchor = after ? id - 1 : id + 1;
    const opts = shuffle([id, ...nearby(anchor, 6, 3, v => v !== id)]);
    render(`${h}
      <div class="prompt"><div class="q">¿Quién va justo <b>${after ? 'después' : 'antes'}</b> de…</div>
        ${img(anchor)}<div class="pname">${nameOf(anchor)} <span class="muted">${fmt(anchor)}</span></div></div>
      <div class="opts">${opts.map(o => `<button class="opt" data-v="${o}">${img(o)}<span class="nm">${nameOf(o)}</span></button>`).join('')}</div>`);
    bindChoice(id);
  } else if (kind === 'order') {
    const set = shuffle([id, ...nearby(id, 25, 3)]);
    render(`${h}
      <div class="prompt"><div class="q">Tócalos en orden de Pokédex (de menor a mayor)</div></div>
      <div class="opts">${set.map(o => `<button class="opt" data-v="${o}"><span class="ord"></span>${img(o)}<span class="nm">${nameOf(o)}</span></button>`).join('')}</div>
      <button class="btn ghost" id="undo">Deshacer</button>`);
    bindOrder(id, set);
  } else {
    render(`${h}
      <div class="prompt"><div class="q">Escribe el número de…</div>${img(id)}<div class="pname">${nameOf(id)}</div></div>
      <div class="display" id="disp"></div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button data-d="${d}">${d}</button>`).join('')}
        <button data-d="del">⌫</button><button data-d="0">0</button><button data-d="ok" class="ok">OK</button></div>`);
    bindPad(id);
  }
  on('#quit', () => { if (Q.mode === 'time') endTimeAttack(); else home(); });
  if (Q.mode === 'time') tick();
}

function bindChoice(id) {
  let locked = false;
  on('.opt', e => {
    if (locked) return; locked = true;
    const v = +e.currentTarget.dataset.v;
    app.querySelectorAll('.opt').forEach(b => {
      const bv = +b.dataset.v;
      b.classList.add(bv === id ? 'right' : bv === v ? 'wrong' : 'dim');
      // Tras responder, mostrar el número de cada opción para aprender también de los errores.
      if (!b.querySelector('.nn')) b.insertAdjacentHTML('beforeend', `<span class="small muted">${fmt(bv)}</span>`);
    });
    answer(id, v === id, v !== id ? `Elegiste ${nameOf(v)} (${fmt(v)}).` : '');
  });
}

function bindOrder(id, set) {
  const sorted = [...set].sort((a, b) => a - b);
  const picked = [];
  let locked = false;
  const paint = () => app.querySelectorAll('.opt').forEach(b => {
    const k = picked.indexOf(+b.dataset.v);
    b.classList.toggle('picked', k >= 0);
    b.querySelector('.ord').textContent = k >= 0 ? `${k + 1}.º` : '';
  });
  on('.opt', e => {
    if (locked) return;
    const v = +e.currentTarget.dataset.v;
    if (picked.includes(v)) return;
    picked.push(v); paint();
    if (picked.length === set.length) {
      locked = true;
      const ok = picked.every((x, k) => x === sorted[k]);
      app.querySelectorAll('.opt').forEach(b => {
        const bv = +b.dataset.v;
        b.classList.remove('picked');
        b.classList.add(picked.indexOf(bv) === sorted.indexOf(bv) ? 'right' : 'wrong');
        b.querySelector('.ord').textContent = fmt(bv);
      });
      answer(id, ok, ok ? '' : `Orden correcto: ${sorted.map(x => `${nameOf(x)} ${fmt(x)}`).join(' → ')}`);
    }
  });
  on('#undo', () => { if (!locked) { picked.pop(); paint(); } });
}

function bindPad(id) {
  let val = '';
  let locked = false;
  const disp = $('#disp');
  const paint = () => {
    const w = Math.max(3, val.length);
    disp.innerHTML = `<span class="h">#</span>${val ? val.padStart(w, '0').replace(/^0+(?=.)/, m => `<span class="ph">${m}</span>`) : '<span class="ph">000</span>'}`;
  };
  paint();
  const submit = () => {
    if (!val || locked) { disp.classList.remove('shake'); void disp.offsetWidth; disp.classList.add('shake'); return; }
    locked = true;
    const v = +val;
    let note = '';
    if (v !== id) {
      const d = v - id;
      note = `Pusiste ${fmt(v)}${v >= 1 && v <= N ? ` (${nameOf(v)})` : ''}. `;
      note += Math.abs(d) <= 10 ? `¡Casi! Te ${d > 0 ? 'pasaste' : 'quedaste corto'} por ${Math.abs(d)}.` : '';
    }
    answer(id, v === id, note);
  };
  on('.pad button', e => {
    if (locked) return;
    const d = e.currentTarget.dataset.d;
    if (d === 'del') val = val.slice(0, -1);
    else if (d === 'ok') return submit();
    else if (val.length < 4 && !(val === '' && d === '0')) val += d;
    paint();
  });
  // Teclado físico (tablet/ordenador)
  keyHandler = e => {
    if (locked) return;
    if (/^\d$/.test(e.key) && val.length < 4 && !(val === '' && e.key === '0')) val += e.key;
    else if (e.key === 'Backspace') val = val.slice(0, -1);
    else if (e.key === 'Enter') return submit();
    else return;
    paint();
  };
}
let keyHandler = null;
document.addEventListener('keydown', e => keyHandler && keyHandler(e));

function answer(id, ok, note) {
  keyHandler = null;
  beep(ok);
  recordAnswer(ok);
  const it = Q.items[Q.i];

  if (Q.mode === 'time') {
    Q.answered++;
    if (ok) { Q.streak++; Q.score += Q.streak >= 5 ? 2 : 1; }
    else { Q.streak = 0; Q.endAt -= 3000; Q.misses.push(id); }
    save();
    setTimeout(nextTimeQuestion, ok ? 350 : 1400);
    if (!ok) showSheet(id, ok, note, true);
    return;
  }

  if (!(id in Q.firstTry)) Q.firstTry[id] = ok;
  if (Q.mode === 'review' && !it.retry) schedule(id, ok);
  if (ok) Q.done++;
  else {
    Q.wrong.add(id);
    // Vuelve a aparecer más tarde en la sesión (máx. 2 veces por Pokémon) para reforzar.
    Q.retries[id] = (Q.retries[id] || 0) + 1;
    if (Q.retries[id] <= 2) {
    const pos = Math.min(Q.items.length, Q.i + 3 + rand(3));
    Q.items.splice(pos, 0, { id, kind: pick(['num2name', 'name2numMC', 'type']), retry: true });
    Q.total++;
    }
  }
  Q.streak = ok ? Q.streak + 1 : 0;
  save();
  showSheet(id, ok, note);
}

function showSheet(id, ok, note, auto = false) {
  const praise = ['¡Correcto!', '¡Genial!', '¡Bien!', '¡Exacto!', '¡Eso es!'];
  const el = document.createElement('div');
  el.className = `sheet ${ok ? 'ok' : 'bad'}`;
  el.innerHTML = `
    <div class="title">${ok ? pick(praise) + (Q.streak >= 3 ? ` 🔥 x${Q.streak}` : '') : 'No era…'}</div>
    <div class="ans">${img(id)}<div><div class="n">${fmt(id)}</div><div class="nm">${nameOf(id)}</div></div></div>
    ${note ? `<div class="small" style="margin-bottom:10px">${note}</div>` : ''}
    ${!ok ? `<div class="hint small" style="margin:0 0 12px">${hintFor(id)}</div>` : ''}
    ${auto ? '' : `<button class="btn ${ok ? 'primary' : ''}" id="cont" style="${ok ? 'background:var(--ok);color:#05210f' : ''}">Continuar</button>`}`;
  app.appendChild(el);
  if (auto) { setTimeout(() => el.remove(), 1300); return; }
  const go = () => { el.remove(); Q.i++; ask(); };
  el.querySelector('#cont').addEventListener('click', go);
  keyHandler = e => { if (e.key === 'Enter' || e.key === ' ') { keyHandler = null; go(); } };
  if (ok) setTimeout(() => { if (el.isConnected) { keyHandler = null; go(); } }, 900);
}

function finish() {
  keyHandler = null;
  const ids = [...new Set(Q.items.map(x => x.id))];
  if (Q.mode === 'learn') ids.forEach(id => { if (!card(id)) schedule(id, true); });
  save();
  const first = ids.filter(id => Q.firstTry[id]).length;
  const pct = Math.round(100 * first / ids.length);
  const msg = pct === 100 ? '¡Perfecto! 🏆' : pct >= 80 ? '¡Muy bien! 🎉' : pct >= 50 ? '¡Vas mejorando! 💪' : 'Sigue así, se aprende fallando 🌱';
  const mode = Q.mode;
  render(`
    <div class="top"><h2>${mode === 'learn' ? 'Bloque aprendido' : mode === 'review' ? 'Repaso completado' : 'Práctica terminada'}</h2></div>
    <div class="panel center"><div class="big-score">${pct}%</div><div class="muted">acertados a la primera</div><div style="margin-top:8px;font-weight:700">${msg}</div></div>
    ${Q.wrong.size ? `<div class="muted small">A vigilar:</div><div class="list">${[...Q.wrong].sort((a, b) => a - b).map(id => `<div class="li">${img(id, '')}<span class="n">${fmt(id)}</span><span class="nm">${nameOf(id)}</span></div>`).join('')}</div>` : ''}
    ${mode === 'learn' ? `<div class="panel small muted">Estos Pokémon volverán en tus repasos en unas horas, luego en 1 día, 3 días, 1 semana… Cuanto mejor te los sepas, más tardan en volver.</div>` : ''}
    <div class="spacer"></div>
    ${mode === 'practice' ? `<button class="btn orange" id="again">Otra ronda</button>` : ''}
    <button class="btn primary" id="home">Volver al inicio</button>`);
  on('#home', home);
  on('#again', () => startSession('practice', Q.pool, Q.opts));
}

/* ---------- Contrarreloj ---------- */
function startTimeAttack() {
  let pool = learnedIds();
  if (pool.length < 20) pool = enabledIds();
  Q = { mode: 'time', pool, items: [], i: 0, score: 0, streak: 0, answered: 0, misses: [], endAt: Date.now() + TIME_ATTACK_SECONDS * 1000 };
  nextTimeQuestion(true);
  stopTimer();
  timerId = setInterval(tick, 200);
}
function nextTimeQuestion(first) {
  if (!Q || Q.mode !== 'time') return;
  if (Date.now() >= Q.endAt) return endTimeAttack();
  Q.items = [{ id: pick(Q.pool), kind: pick(['num2name', 'name2numMC', 'next', 'num2name', 'name2numMC']) }];
  Q.i = 0;
  if (first !== true) app.querySelector('.sheet')?.remove();
  ask();
}
function tick() {
  if (!Q || Q.mode !== 'time') return stopTimer();
  const left = Math.max(0, Q.endAt - Date.now());
  const el = $('#timer');
  if (el) { el.textContent = (left / 1000).toFixed(1) + 's'; el.classList.toggle('low', left < 10000); }
  if (left <= 0) endTimeAttack();
}
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function endTimeAttack() {
  stopTimer();
  keyHandler = null;
  if (!Q || Q.mode !== 'time') return;
  const { score, answered, misses } = Q;
  Q = null;
  const record = score > S.stats.bestTime;
  if (record) S.stats.bestTime = score;
  save();
  const uniq = [...new Set(misses)].sort((a, b) => a - b);
  render(`
    <div class="top"><h2>¡Tiempo!</h2></div>
    <div class="panel center"><div class="big-score">${score}</div><div class="muted">puntos · ${answered} respuestas</div>
      <div style="margin-top:8px;font-weight:700">${record ? '🏆 ¡Nuevo récord!' : `Récord: ${S.stats.bestTime}`}</div></div>
    <div class="small muted center">Racha de 5+ aciertos = 2 puntos por acierto · Fallo = −3 s</div>
    ${uniq.length ? `<div class="muted small">Fallados:</div><div class="list">${uniq.map(id => `<div class="li">${img(id, '')}<span class="n">${fmt(id)}</span><span class="nm">${nameOf(id)}</span></div>`).join('')}</div>` : ''}
    <div class="spacer"></div>
    <button class="btn orange" id="again">Otra vez</button>
    <button class="btn primary" id="home">Volver al inicio</button>`);
  on('#again', startTimeAttack);
  on('#home', home);
}

/* ---------- Práctica libre ---------- */
function practiceMenu() {
  const learned = learnedIds();
  const kinds = [['', 'Mezcla'], ['num2name', 'Nº → Pokémon'], ['name2numMC', 'Pokémon → Nº (elegir)'], ['type', 'Pokémon → Nº (teclear)'], ['next', 'Anterior / siguiente'], ['order', 'Ordenar']];
  let kind = '';
  const draw = () => {
    render(`
      <div class="top"><button class="icon-btn" id="back">←</button><h2>Práctica libre</h2></div>
      <div class="muted small">Tipo de pregunta</div>
      <div class="tabs" style="flex-wrap:wrap">${kinds.map(([k, l]) => `<button class="tab ${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="muted small">¿Qué quieres practicar? (20 preguntas al azar)</div>
      <button class="btn primary" data-pool="learned" ${learned.length < 4 ? 'disabled' : ''}>Mis aprendidos (${learned.length})</button>
      <button class="btn" data-pool="weak" ${weakIds().length < 4 ? 'disabled' : ''}>Los que más fallo (${weakIds().length})</button>
      <div class="gens">${GENS.map((g, i) => `<button data-pool="g${i + 1}">Gen ${i + 1}<small>${GEN_REGION[i]} · ${g[0]}–${g[1]}</small></button>`).join('')}</div>
      <div class="gens">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => `<button data-pool="c${c}">${c * 100 || 1}–${Math.min(N, c * 100 + 99)}</button>`).join('')}</div>`);
    on('#back', home);
    on('.tab', e => { kind = e.currentTarget.dataset.k; draw(); });
    on('[data-pool]', e => {
      const p = e.currentTarget.dataset.pool;
      let ids;
      if (p === 'learned') ids = learned;
      else if (p === 'weak') ids = weakIds();
      else if (p[0] === 'g') ids = range(...GENS[+p.slice(1) - 1]);
      else { const c = +p.slice(1); ids = range(Math.max(1, c * 100), Math.min(N, c * 100 + 99)); }
      startSession('practice', ids, { kind });
    });
  };
  draw();
}
function weakIds() {
  return learnedIds().filter(id => card(id).ko > 0 && card(id).ko >= card(id).ok / 3)
    .sort((a, b) => card(b).ko - card(a).ko).slice(0, 40);
}

/* ---------- Mapa ---------- */
function dexMap(g) {
  const [a, b] = GENS[g];
  const ids = range(a, b);
  const cls = id => { const l = level(id); return !card(id) ? 'l0' : l >= MASTERED ? 'l4' : l >= 3 ? 'l3' : l >= 2 ? 'l2' : 'l1'; };
  const learnedHere = ids.filter(id => card(id)).length;
  const masteredHere = ids.filter(id => level(id) >= MASTERED).length;
  render(`
    <div class="top"><button class="icon-btn" id="back">←</button><h2>Mapa Pokédex</h2></div>
    <div class="tabs">${GENS.map((_, i) => `<button class="tab ${i === g ? 'on' : ''}" data-g="${i}">Gen ${i + 1}</button>`).join('')}</div>
    <div class="row small"><span class="grow"><b>${GEN_REGION[g]}</b> ${fmt(a)}–${fmt(b)}</span><span class="muted">${masteredHere} dominados · ${learnedHere}/${ids.length} vistos</span></div>
    <div class="legend"><span><i style="background:var(--panel)"></i>Nuevo</span><span><i style="background:#4a2a1a"></i>Aprendiendo</span><span><i style="background:#5a4515"></i>Medio</span><span><i style="background:#1d4a2c"></i>Bien</span><span><i style="background:#166534"></i>Dominado</span></div>
    <div class="dexgrid">${ids.map(id => `<button class="cell ${cls(id)}" data-id="${id}">${img(id, '')}<span>${id}</span></button>`).join('')}</div>`);
  on('#back', home);
  on('.tab', e => dexMap(+e.currentTarget.dataset.g));
  on('.cell', e => showDetail(+e.currentTarget.dataset.id));
}
function showDetail(id) {
  const m = $('#modal');
  const c = card(id);
  m.innerHTML = `<div class="box">${dexCard(id)}
    <div class="panel small" style="margin-top:8px">${c
      ? `Nivel ${c.b}/${MAX_BOX} · ${c.ok} aciertos · ${c.ko} fallos<br>Próximo repaso: ${c.d <= Date.now() ? 'ahora' : 'en ' + relTime(c.d - Date.now())}`
      : 'Aún no lo has aprendido.'}</div>
    <button class="btn" style="margin-top:8px" id="mclose">Cerrar</button></div>`;
  m.classList.remove('hidden');
  const close = () => m.classList.add('hidden');
  m.onclick = e => { if (e.target === m || e.target.id === 'mclose') close(); };
}

/* ---------- Ajustes ---------- */
function settings() {
  const st = S.settings;
  render(`
    <div class="top"><button class="icon-btn" id="back">←</button><h2>Ajustes</h2></div>
    <div class="muted small">Generaciones en juego</div>
    <div class="gens">${GENS.map((g, i) => `<button class="${st.gens.includes(i + 1) ? 'on' : ''}" data-g="${i + 1}">Gen ${i + 1}<small>${GEN_REGION[i]}</small></button>`).join('')}</div>
    <div class="panel">
      <div class="toggle"><span>Sonido</span><button class="sw ${st.sound ? 'on' : ''}" data-t="sound"></button></div>
      <div class="toggle"><span>Vibrar al fallar</span><button class="sw ${st.vibrate ? 'on' : ''}" data-t="vibrate"></button></div>
      <div class="toggle"><span>Objetivo diario</span>
        <span class="row"><button class="icon-btn" id="gdown">−</button><b>${st.dailyGoal}</b><button class="icon-btn" id="gup">+</button></span></div>
    </div>
    <div class="muted small">Copia de seguridad del progreso</div>
    <div class="row"><button class="btn" id="export">Exportar</button><button class="btn" id="import">Importar</button></div>
    <textarea id="io" class="hidden" placeholder="Pega aquí tu copia de seguridad"></textarea>
    <button class="btn ghost" id="reset" style="color:var(--bad)">Borrar todo el progreso</button>
    <div class="small muted center">Datos: PokeAPI · Pokémon es marca de Nintendo / Game Freak / The Pokémon Company. Proyecto de fans sin ánimo de lucro.</div>`);
  on('#back', home);
  on('.gens button', e => {
    const g = +e.currentTarget.dataset.g;
    st.gens = st.gens.includes(g) ? st.gens.filter(x => x !== g) : [...st.gens, g].sort((a, b) => a - b);
    if (!st.gens.length) st.gens = [g];
    save(); settings();
  });
  on('.sw', e => { const t = e.currentTarget.dataset.t; st[t] = !st[t]; save(); settings(); });
  on('#gdown', () => { st.dailyGoal = Math.max(10, st.dailyGoal - 10); save(); settings(); });
  on('#gup', () => { st.dailyGoal = Math.min(500, st.dailyGoal + 10); save(); settings(); });
  on('#export', () => {
    const io = $('#io'); io.classList.remove('hidden'); io.value = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    io.select(); try { navigator.clipboard.writeText(io.value); } catch (e) { /* copia manual */ }
  });
  on('#import', () => {
    const io = $('#io');
    if (io.classList.contains('hidden') || !io.value.trim()) { io.classList.remove('hidden'); io.value = ''; io.focus(); return; }
    try {
      const s = JSON.parse(decodeURIComponent(escape(atob(io.value.trim()))));
      if (s.v !== 1 || typeof s.cards !== 'object') throw new Error('formato');
      localStorage.setItem(KEY, JSON.stringify(s)); S = load(); alert('Progreso importado ✔'); home();
    } catch (e) { alert('Ese texto no es una copia válida.'); }
  });
  on('#reset', () => { if (confirm('¿Seguro? Se borrará todo tu progreso.')) { S = defaultState(); save(); home(); } });
}

/* ---------- Ayuda ---------- */
function help() {
  render(`
    <div class="top"><button class="icon-btn" id="back">←</button><h2>Cómo funciona</h2></div>
    <div class="panel"><b>📘 1. Aprende por decenas</b><p class="muted small">Los Pokémon se agrupan en bloques de 10 (001–010, 011–020…). Memorizar “Pikachu es el 5.º de la decena 021–030” es mucho más fácil que un número suelto. Además verás pistas: de quién evoluciona, si abre o cierra generación…</p></div>
    <div class="panel"><b>💪 2. Practica justo después</b><p class="muted small">Primero reconoces (elegir entre 4), luego recuerdas (teclear el número). Recordar sin ayuda es lo que fija la memoria. Lo que falles vuelve a salir en la misma sesión.</p></div>
    <div class="panel"><b>🔁 3. Repasa cuando toca</b><p class="muted small">Repetición espaciada: cada acierto sube de nivel al Pokémon y lo aleja (4 h → 1 día → 3 días → 1 semana → 16 días → 40 días). Cada fallo lo hace volver antes. Desde el nivel 4 se considera dominado.</p></div>
    <div class="panel"><b>🗓️ Consejo</b><p class="muted small">Haz primero los repasos pendientes y luego un bloque nuevo (o dos). 10 minutos al día > 2 horas un domingo. A ese ritmo te sabes los 1025 en unos 3–4 meses.</p></div>
    <div class="panel"><b>⏱️ Contrarreloj y 🎯 Práctica</b><p class="muted small">Para jugar y medirte. No cambian tu calendario de repasos.</p></div>
    <button class="btn primary" id="back2">¡Entendido!</button>`);
  on('#back', home); on('#back2', home);
}

/* ---------- Arranque ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden && app.querySelector('#review')) home(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
home();
