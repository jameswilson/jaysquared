/* ============================================================================
   JAY SQUARED (J²)  —  a blocky 2D platformer
   Part 1: constants, math helpers, input, audio, tile definitions, textures
   ========================================================================== */

const TILE = 16;
const VIEW_W = 480;
const VIEW_H = 270;
const STEP = 1 / 60;
/* seconds after firing a power in which falling off the world tears it open */
const GLITCH_WINDOW = 1.6;

/* --- physics (tuned to feel "real but fanciful") ------------------------- */
const PHYS = {
  gravity: 1450,
  maxFall: 620,
  runAccel: 1500,
  runMax: 132,
  crouchMax: 52,
  airAccel: 900,
  friction: 1400,
  airFriction: 240,
  jumpV: -352,
  jumpChainGain: 0.155,   // each extra Space press launches HIGHER
  maxJumpChain: 5,        // five presses, like five inventory slots
  jumpCut: 0.42,
  coyote: 0.10,
  buffer: 0.12,
  climbSpeed: 78,
  waterGravity: 320,
  waterMaxFall: 90,
  waterSwim: -130,
  bounce: 0,
  noclip: false,
  speedMul: 1,
};
const PHYS_DEFAULT = JSON.parse(JSON.stringify(PHYS));
function resetPhysics() { Object.assign(PHYS, JSON.parse(JSON.stringify(PHYS_DEFAULT))); }

/* --- tiny math ----------------------------------------------------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* stable per-coordinate hash, used for block texture variety */
function hash2(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function isPerfectSquare(n) {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/* --- input --------------------------------------------------------------- */
const Keys = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  anyTyped: [],
  shiftHeld: false,
  shiftUsed: false,   // was Shift part of a combo (like Shift+/ for "?")
  shiftTap: false,    // Shift pressed and released on its own
  isDown(...codes) { return codes.some(c => this.down.has(c)); },
  justPressed(...codes) { return codes.some(c => this.pressed.has(c)); },
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.anyTyped.length = 0; this.shiftTap = false;
  },
};
const isShift = (c) => c === 'ShiftLeft' || c === 'ShiftRight';

const BLOCKED_KEYS = new Set([
  'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyQ', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Slash',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5',
  'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadEnter',
  'ShiftLeft', 'ShiftRight',
]);

/* 0-9 from either the top row or the number pad. Reading e.code rather than
   e.key means the pad works whether or not Num Lock is on. */
function digitFromCode(code) {
  if (code.length === 6 && code.startsWith('Digit')) {
    const n = code.charCodeAt(5) - 48;
    return n >= 0 && n <= 9 ? n : null;
  }
  if (code.length === 7 && code.startsWith('Numpad')) {
    const n = code.charCodeAt(6) - 48;
    return n >= 0 && n <= 9 ? n : null;
  }
  return null;
}

addEventListener('keydown', (e) => {
  if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    Keys.pressed.add(e.code);
    Keys.anyTyped.push(e.key);
    if (isShift(e.code)) { Keys.shiftHeld = true; Keys.shiftUsed = false; }
    else if (Keys.shiftHeld) Keys.shiftUsed = true;   // Shift is modifying, not cycling
  }
  Keys.down.add(e.code);
  Audio2.unlock();
}, { passive: false });

addEventListener('keyup', (e) => {
  if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  if (isShift(e.code)) {
    // a clean tap cycles the inventory; Shift+"/" for help must not
    if (!Keys.shiftUsed) Keys.shiftTap = true;
    Keys.shiftHeld = false;
  }
  Keys.down.delete(e.code);
  Keys.released.add(e.code);
}, { passive: false });

addEventListener('blur', () => {
  Keys.down.clear();
  Keys.shiftHeld = false; Keys.shiftUsed = false;
});

/* Named controls — arrows AND wasd, per spec. */
const IN = {
  left:   () => Keys.isDown('ArrowLeft', 'KeyA'),
  right:  () => Keys.isDown('ArrowRight', 'KeyD'),
  up:     () => Keys.isDown('ArrowUp', 'KeyW'),
  down:   () => Keys.isDown('ArrowDown', 'KeyS'),
  upTap:  () => Keys.justPressed('ArrowUp', 'KeyW'),
  jump:   () => Keys.justPressed('Space'),
  jumpHeld: () => Keys.isDown('Space'),
  primary: () => Keys.justPressed('KeyQ'),
  secondary: () => Keys.justPressed('KeyE'),
  doubler: () => Keys.isDown('Tab'),
  cycle: () => Keys.shiftTap,
  help: () => Keys.justPressed('Slash', 'KeyH', 'NumpadDivide'),
  lang: () => Keys.justPressed('KeyL'),
  fullscreen: () => Keys.justPressed('KeyF'),
};

/* --- internationalization -------------------------------------------------
   TR(s) looks the English original up in the current language's table and
   falls back to s itself, so anything not yet translated (or intentionally
   left in English) just degrades to English instead of throwing or showing
   "undefined". TRF is the same idea for messages built from live numbers —
   keyed by an id rather than by English text, since the English text itself
   is never a fixed string. */
const LANGS = ['en', 'es', 'de'];
const LANG_NAME = { en: 'English', es: 'Español', de: 'Deutsch' };
const LANG_CODE = { en: 'EN', es: 'ES', de: 'DE' };
const LANG_STORAGE_KEY = 'jaySquaredLang';

function loadLang() {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (LANGS.includes(v)) return v;
  } catch (e) { /* file:// or privacy mode can throw on localStorage access */ }
  return 'en';
}
function saveLang(lang) {
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
}

const STRINGS = {
  es: {
    'Click to play': 'Toca para jugar',

    'JAY SQUARED': 'JAY AL CUADRADO',
    'a blocky adventure in five biomes': 'una aventura de bloques en cinco biomas',
    'PRESS SPACE TO PLAY': 'PULSA ESPACIO PARA JUGAR',
    'PRESS  ?  FOR HELP': 'PULSA  ?  PARA AYUDA',
    'the controls live in there, and you can open it mid-game': 'ahí están los controles, y puedes abrirla en plena partida',
    '∞   EXPLORER MODE IS ON   ∞': '∞   MODO EXPLORADOR ACTIVO   ∞',
    'Jay is almost 8. He is very good at maths. That turns out to matter.': 'Jay casi tiene 8 años. Es muy bueno en matemáticas. Y eso resulta importar.',

    'LEVEL CLEAR': 'NIVEL SUPERADO',
    'GAME OVER': 'FIN DEL JUEGO',
    'press SPACE to try again': 'pulsa ESPACIO para reintentar',
    'THE CASTLE IS YOURS': 'EL CASTILLO ES TUYO',
    'press SPACE to play again': 'pulsa ESPACIO para jugar de nuevo',
    'PAUSED': 'PAUSA',
    'P or ESC to keep going': 'P o ESC para continuar',
    '∞  explorer mode is on': '∞  modo explorador activo',
    'MATH RUNE': 'RUNA MATEMÁTICA',
    'type the number • ENTER to answer • ESC to walk away': 'escribe el número • ENTER para responder • ESC para irte',
    'CORRECT': 'CORRECTO',

    'TAB + Q  =  DOUBLE POWER': 'TAB + Q  =  PODER DOBLE',
    'Q punch blocks    E uppercut    SHIFT / 1-5 to hold a plant': 'Q golpea bloques    E gancho    SHIFT / 1-5 para llevar una planta',
    'Q power    E alt    TAB+Q ²    SHIFT cycles    0 fists': 'Q poder    E alt    TAB+Q ²    SHIFT rota    0 puños',

    'HOW TO PLAY': 'CÓMO JUGAR',
    'Jay Squared  •  J²  •  and some things are not on this list': 'Jay Squared  •  J²  •  y algunas cosas no están en esta lista',
    'THE FIVE PLANTS  —  one hides in each biome': 'LAS CINCO PLANTAS  —  una se esconde en cada bioma',
    '? or ESC to go back   •   SPACE to play': '? o ESC para volver   •   ESPACIO para jugar',
    '? or ESC to get back to the game': '? o ESC para volver al juego',
    'MOVING': 'MOVIMIENTO',
    'POWERS': 'PODERES',
    'WHAT YOU CARRY': 'LO QUE LLEVAS',
    'THE GAME': 'EL JUEGO',
    "JAY'S MATHEMATICS": 'LAS MATEMÁTICAS DE JAY',
    'walk  (A and D work too)': 'caminar  (A y D también sirven)',
    'jump • climb a ladder, vine or trunk': 'saltar • subir escalera, enredadera o tronco',
    'crouch • climb down': 'agacharse • bajar',
    'jump — press again in mid-air to': 'saltar — pulsa otra vez en el aire para',
    'go higher, up to five times': 'subir más alto, hasta cinco veces',
    'drop through wooden planks': 'caer a través de tablones de madera',
    'use power • hold it to punch': 'usar poder • mantén para golpear',
    'blocks apart with bare hands': 'bloques con las manos desnudas',
    'second power • uppercut': 'segundo poder • gancho',
    'squared — the Q power, twice': 'al cuadrado — el poder Q, dos veces',
    'bare hands': 'manos desnudas',
    'choose a slot (number pad too)': 'elige una ranura (num. también)',
    'cycle through what you hold': 'rota lo que llevas',
    'pause  (ESC also works)': 'pausar  (ESC también funciona)',
    'fullscreen  (ESC also exits)': 'pantalla completa  (ESC también sale)',
    'this page, any time': 'esta página, cuando quieras',
    'gem totals that land on a perfect': 'totales de gemas que caen en un',
    'square — 4, 9, 16, 25 — pay out': 'cuadrado perfecto — 4, 9, 16, 25 — dan premio',
    'purple runes set a sum. Answer it': 'las runas moradas plantean una suma. Respóndela',
    'for 1-UPs and new abilities': 'para vidas extra y nuevas habilidades',

    'Wind Plant': 'Planta de Viento', 'Q gust • E twin orbs': 'Q ráfaga • E orbes gemelos',
    'gust': 'ráfaga', 'twin orbs': 'orbes gemelos',
    'Electric Plant': 'Planta Eléctrica', 'Q zap ray • E blast off': 'Q rayo • E despegue',
    'zap': 'rayo', 'blast off': 'despegue',
    'Lava Mushroom': 'Hongo de Lava', 'Q magma ball • E eruption': 'Q bola de magma • E erupción',
    'magma': 'magma', 'eruption': 'erupción',
    'Earth Plant': 'Planta de Tierra', 'Q spike row • E spike nova': 'Q fila de púas • E nova de púas',
    'spikes': 'púas', 'nova': 'nova',
    'Water Mushroom': 'Hongo de Agua', 'Q blinding squirt • E freeze': 'Q chorro cegador • E congelar',
    'blind': 'cegar', 'freeze': 'congelar',

    'Swift Feet': 'Pies Ligeros', 'Jay runs faster': 'Jay corre más rápido',
    'Gem Magnet': 'Imán de Gemas', 'gems come to you': 'las gemas vienen a ti',
    'Extra Heart': 'Corazón Extra', 'one more heart': 'un corazón más',
    'Squared Mind': 'Mente al Cuadrado', 'TAB doubles E as well as Q': 'TAB duplica E además de Q',
    'Feather Fall': 'Caída de Pluma', 'you fall gently': 'caes suavemente',

    'Emerald Plains': 'Llanuras Esmeralda',
    'Dripstone Deep': 'Profundidad de Estalactitas',
    'Sunburn Dunes': 'Dunas Abrasadoras',
    'Cinder Hollow': 'Hondonada de Cenizas',
    'The Cobalt Castle': 'El Castillo de Cobalto',

    'Arrows or WASD to move': 'Flechas o WASD para moverte',
    'SPACE again in mid-air jumps higher': 'ESPACIO otra vez en el aire salta más alto',
    'Walk through things to pick them up': 'Camina sobre las cosas para recogerlas',
    'Hold Q to punch blocks apart': 'Mantén Q para romper bloques',
    'Trunks are climbable — press UP': 'Los troncos se pueden trepar — pulsa ARRIBA',
    'a hole. of course you are going in': 'un agujero. claro que vas a entrar',
    'Q = spikes   E = big spike': 'Q = púas   E = púa grande',
    'Q = blind   E = freeze': 'Q = cegar   E = congelar',
    'Q = zap   E = sky boost': 'Q = rayo   E = impulso al cielo',
    'Q = magma ball   E = eruption': 'Q = bola de magma   E = erupción',
    'the gate stands open': 'la puerta está abierta',
    'DOWN + SPACE drops through wood': 'ABAJO + ESPACIO cae por la madera',
    'something is sealed in there': 'algo está sellado ahí dentro',
    'UP to climb': 'ARRIBA para trepar',

    'nothing to cycle to yet': 'nada más que rotar todavía',
    'bare hands it is': 'serán manos desnudas',
    'Q punches blocks apart • E uppercut': 'Q rompe bloques • E gancho',
    '1-UP': 'VIDA EXTRA', '1-UP!': '¡VIDA EXTRA!',
    'all abilities already found': 'ya encontraste todas las habilidades',
    'the rune rewards a sharp mind': 'la runa premia una mente aguda',
    'a heart returns': 'un corazón regresa',
    'perfect square': 'cuadrado perfecto',
    'inventory full': 'inventario lleno',
    'five is the limit — press 1-5': 'cinco es el límite — pulsa 1-5',
    'EXPLORER MODE ON': 'MODO EXPLORADOR ACTIVO',
    '144 = 12²  •  Jay cannot die': '144 = 12²  •  Jay no puede morir',
    'explorer mode off': 'modo explorador desactivado',
    'back to five lives': 'de vuelta a cinco vidas',
    'the void gave you back': 'el vacío te devolvió',
    'that would have hurt': 'eso habría dolido',
    'rescued': 'rescatado',
    'reality restored': 'realidad restaurada',
    'mostly': 'más o menos',
    'gems ×2': 'gemas ×2',
    'OOF': 'AY',
    'blind!': '¡ciego!',
    'frozen!': '¡congelado!',
    'BLAST OFF': 'DESPEGUE',

    'ROOT': 'RAÍZ',
    'PHYSICS.HACK': 'FÍSICA.HACK', 'MOB.SPAWN': 'CRIATURA.GENERAR', 'STRUCTURE.GEN': 'ESTRUCTURA.GEN',
    'DUPLICATE': 'DUPLICAR', '>> RESUME GAME': '>> REANUDAR JUEGO',
    'LOW GRAVITY': 'GRAVEDAD BAJA', 'MOON JUMP': 'SALTO LUNAR', 'SUPER SPEED': 'SUPER VELOCIDAD',
    'BOUNCY WORLD': 'MUNDO REBOTE', 'NOCLIP  [toggle]': 'SIN COLISIÓN  [act/desact]',
    'RESTORE DEFAULTS': 'RESTAURAR VALORES',
    'FRIENDLY  pig': 'AMISTOSO  cerdo', 'FRIENDLY  sheep': 'AMISTOSO  oveja', 'FRIENDLY  chicken': 'AMISTOSO  gallina',
    'EVIL      slime': 'MALVADO  limo', 'EVIL      spikeling': 'MALVADO  spikeling', 'EVIL      guardian': 'MALVADO  guardián',
    'PACIFY EVERYTHING': 'PACIFICAR TODO',
    'BRIDGE': 'PUENTE', 'TOWER': 'TORRE', 'SAFE HOUSE': 'CASA SEGURA', 'STAIRWAY': 'ESCALERA', 'GEM SHOWER': 'LLUVIA DE GEMAS',
    'ALL FIVE POWERS': 'LOS CINCO PODERES', 'DUPLICATE MOBS': 'DUPLICAR CRIATURAS',
    'DOUBLE THE GEMS': 'DUPLICAR GEMAS', 'DOUBLE THE LIVES': 'DUPLICAR VIDAS',
    'SEGMENTATION FAULT AT 0x5Q4RE': 'FALLO DE SEGMENTACIÓN EN 0x5Q4RE',
    'vector escaped world bounds': 'vector escapó de los límites del mundo',
    'J².SYS  //  DEVELOPER SHELL': 'J².SYS  //  CONSOLA DE DESARROLLADOR',
    'you were not supposed to find this': 'no debías encontrar esto',
    '↑↓ select   ENTER apply   ESC back / resume': '↑↓ elegir   ENTER aplicar   ESC volver / reanudar',
  },
  de: {
    'Click to play': 'Zum Spielen klicken',

    'JAY SQUARED': 'JAY ZUM QUADRAT',
    'a blocky adventure in five biomes': 'ein Klötzchen-Abenteuer in fünf Biomen',
    'PRESS SPACE TO PLAY': 'LEERTASTE ZUM SPIELEN',
    'PRESS  ?  FOR HELP': 'DRÜCK  ?  FÜR HILFE',
    'the controls live in there, and you can open it mid-game': 'dort stehen die Steuerungen, auch mitten im Spiel abrufbar',
    '∞   EXPLORER MODE IS ON   ∞': '∞   ERKUNDUNGSMODUS AN   ∞',
    'Jay is almost 8. He is very good at maths. That turns out to matter.': 'Jay ist fast 8. Er ist sehr gut in Mathe. Das erweist sich als wichtig.',

    'LEVEL CLEAR': 'LEVEL GESCHAFFT',
    'GAME OVER': 'SPIEL VORBEI',
    'press SPACE to try again': 'LEERTASTE für einen neuen Versuch',
    'THE CASTLE IS YOURS': 'DIE BURG GEHÖRT DIR',
    'press SPACE to play again': 'LEERTASTE um erneut zu spielen',
    'PAUSED': 'PAUSE',
    'P or ESC to keep going': 'P oder ESC zum Weitermachen',
    '∞  explorer mode is on': '∞  Erkundungsmodus aktiv',
    'MATH RUNE': 'MATH-RUNE',
    'type the number • ENTER to answer • ESC to walk away': 'Zahl eingeben • ENTER zum Antworten • ESC zum Weggehen',
    'CORRECT': 'RICHTIG',

    'TAB + Q  =  DOUBLE POWER': 'TAB + Q  =  DOPPELTE KRAFT',
    'Q punch blocks    E uppercut    SHIFT / 1-5 to hold a plant': 'Q zerschlägt Blöcke    E Aufwärtshaken    SHIFT / 1-5 für eine Pflanze',
    'Q power    E alt    TAB+Q ²    SHIFT cycles    0 fists': 'Q Kraft    E alt.    TAB+Q ²    SHIFT wechselt    0 Fäuste',

    'HOW TO PLAY': 'SO WIRD GESPIELT',
    'Jay Squared  •  J²  •  and some things are not on this list': 'Jay Squared  •  J²  •  und manches steht hier nicht',
    'THE FIVE PLANTS  —  one hides in each biome': 'DIE FÜNF PFLANZEN  —  eine versteckt sich in jedem Biom',
    '? or ESC to go back   •   SPACE to play': '? oder ESC zurück   •   LEERTASTE zum Spielen',
    '? or ESC to get back to the game': '? oder ESC zurück zum Spiel',
    'MOVING': 'BEWEGUNG',
    'POWERS': 'KRÄFTE',
    'WHAT YOU CARRY': 'WAS DU TRÄGST',
    'THE GAME': 'DAS SPIEL',
    "JAY'S MATHEMATICS": 'JAYS MATHEMATIK',
    'walk  (A and D work too)': 'laufen  (A und D gehen auch)',
    'jump • climb a ladder, vine or trunk': 'springen • Leiter, Ranke oder Stamm hoch',
    'crouch • climb down': 'ducken • runterklettern',
    'jump — press again in mid-air to': 'springen — in der Luft erneut drücken, um',
    'go higher, up to five times': 'höher zu kommen, bis zu fünfmal',
    'drop through wooden planks': 'durch Holzbohlen fallen',
    'use power • hold it to punch': 'Kraft nutzen • halten zum Schlagen',
    'blocks apart with bare hands': 'Blöcke mit bloßen Händen',
    'second power • uppercut': 'zweite Kraft • Aufwärtshaken',
    'squared — the Q power, twice': 'zum Quadrat — die Q-Kraft, doppelt',
    'bare hands': 'bloße Hände',
    'choose a slot (number pad too)': 'Fach wählen (Zehnertast. auch)',
    'cycle through what you hold': 'durchwechseln, was du trägst',
    'pause  (ESC also works)': 'pausieren  (ESC geht auch)',
    'fullscreen  (ESC also exits)': 'Vollbild  (ESC beendet es auch)',
    'this page, any time': 'diese Seite, jederzeit',
    'gem totals that land on a perfect': 'Edelstein-Summen, die auf einer',
    'square — 4, 9, 16, 25 — pay out': 'Quadratzahl landen — 4, 9, 16, 25 — zahlen aus',
    'purple runes set a sum. Answer it': 'lila Runen stellen eine Aufgabe. Löse sie',
    'for 1-UPs and new abilities': 'für Extraleben und neue Fähigkeiten',

    'Wind Plant': 'Windpflanze', 'Q gust • E twin orbs': 'Q Windstoß • E Zwillingskugeln',
    'gust': 'Windstoß', 'twin orbs': 'Zwillingskugeln',
    'Electric Plant': 'Elektropflanze', 'Q zap ray • E blast off': 'Q Blitzstrahl • E Abheben',
    'zap': 'Blitz', 'blast off': 'Abheben',
    'Lava Mushroom': 'Lavapilz', 'Q magma ball • E eruption': 'Q Magmakugel • E Eruption',
    'magma': 'Magma', 'eruption': 'Eruption',
    'Earth Plant': 'Erdpflanze', 'Q spike row • E spike nova': 'Q Stachelreihe • E Stachelnova',
    'spikes': 'Stacheln', 'nova': 'Nova',
    'Water Mushroom': 'Wasserpilz', 'Q blinding squirt • E freeze': 'Q blendender Strahl • E Einfrieren',
    'blind': 'blenden', 'freeze': 'Einfrieren',

    'Swift Feet': 'Flinke Füße', 'Jay runs faster': 'Jay rennt schneller',
    'Gem Magnet': 'Edelstein-Magnet', 'gems come to you': 'Edelsteine kommen zu dir',
    'Extra Heart': 'Extra-Herz', 'one more heart': 'ein Herz mehr',
    'Squared Mind': 'Quadratischer Verstand', 'TAB doubles E as well as Q': 'TAB verdoppelt auch E, nicht nur Q',
    'Feather Fall': 'Federfall', 'you fall gently': 'du fällst sanft',

    'Emerald Plains': 'Smaragdebene',
    'Dripstone Deep': 'Tropfsteintiefe',
    'Sunburn Dunes': 'Sonnenbrand-Dünen',
    'Cinder Hollow': 'Ascheschlucht',
    'The Cobalt Castle': 'Das Kobaltschloss',

    'Arrows or WASD to move': 'Pfeiltasten oder WASD zum Bewegen',
    'SPACE again in mid-air jumps higher': 'LEERTASTE in der Luft springt höher',
    'Walk through things to pick them up': 'Durchlaufen zum Aufsammeln',
    'Hold Q to punch blocks apart': 'Q halten, um Blöcke zu zerschlagen',
    'Trunks are climbable — press UP': 'Stämme sind erkletterbar — HOCH drücken',
    'a hole. of course you are going in': 'ein Loch. natürlich gehst du rein',
    'Q = spikes   E = big spike': 'Q = Stacheln   E = großer Stachel',
    'Q = blind   E = freeze': 'Q = blenden   E = einfrieren',
    'Q = zap   E = sky boost': 'Q = Blitz   E = Himmelsschub',
    'Q = magma ball   E = eruption': 'Q = Magmakugel   E = Eruption',
    'the gate stands open': 'das Tor steht offen',
    'DOWN + SPACE drops through wood': 'RUNTER + LEERTASTE fällt durch Holz',
    'something is sealed in there': 'dort drinnen ist etwas versiegelt',
    'UP to climb': 'HOCH zum Klettern',

    'nothing to cycle to yet': 'noch nichts zum Wechseln',
    'bare hands it is': 'dann eben bloße Hände',
    'Q punches blocks apart • E uppercut': 'Q zerschlägt Blöcke • E Aufwärtshaken',
    '1-UP': 'EXTRALEBEN', '1-UP!': 'EXTRALEBEN!',
    'all abilities already found': 'alle Fähigkeiten bereits gefunden',
    'the rune rewards a sharp mind': 'die Rune belohnt einen scharfen Verstand',
    'a heart returns': 'ein Herz kehrt zurück',
    'perfect square': 'Quadratzahl',
    'inventory full': 'Inventar voll',
    'five is the limit — press 1-5': 'fünf ist das Limit — drücke 1-5',
    'EXPLORER MODE ON': 'ERKUNDUNGSMODUS AN',
    '144 = 12²  •  Jay cannot die': '144 = 12²  •  Jay kann nicht sterben',
    'explorer mode off': 'Erkundungsmodus aus',
    'back to five lives': 'zurück zu fünf Leben',
    'the void gave you back': 'die Leere gab dich zurück',
    'that would have hurt': 'das hätte wehgetan',
    'rescued': 'gerettet',
    'reality restored': 'Realität wiederhergestellt',
    'mostly': 'größtenteils',
    'gems ×2': 'Edelsteine ×2',
    'OOF': 'AUA',
    'blind!': 'geblendet!',
    'frozen!': 'eingefroren!',
    'BLAST OFF': 'ABHEBEN',

    'ROOT': 'WURZEL',
    'PHYSICS.HACK': 'PHYSIK.HACK', 'MOB.SPAWN': 'KREATUR.SPAWN', 'STRUCTURE.GEN': 'STRUKTUR.GEN',
    'DUPLICATE': 'DUPLIZIEREN', '>> RESUME GAME': '>> SPIEL FORTSETZEN',
    'LOW GRAVITY': 'NIEDRIGE SCHWERKRAFT', 'MOON JUMP': 'MONDSPRUNG', 'SUPER SPEED': 'SUPERGESCHWINDIGKEIT',
    'BOUNCY WORLD': 'HÜPFWELT', 'NOCLIP  [toggle]': 'DURCHGEHEN  [umschalten]',
    'RESTORE DEFAULTS': 'STANDARD WIEDERHERSTELLEN',
    'FRIENDLY  pig': 'FREUNDLICH  Schwein', 'FRIENDLY  sheep': 'FREUNDLICH  Schaf', 'FRIENDLY  chicken': 'FREUNDLICH  Huhn',
    'EVIL      slime': 'BÖSE  Schleim', 'EVIL      spikeling': 'BÖSE  Spikeling', 'EVIL      guardian': 'BÖSE  Wächter',
    'PACIFY EVERYTHING': 'ALLES BESÄNFTIGEN',
    'BRIDGE': 'BRÜCKE', 'TOWER': 'TURM', 'SAFE HOUSE': 'SICHERES HAUS', 'STAIRWAY': 'TREPPE', 'GEM SHOWER': 'EDELSTEINREGEN',
    'ALL FIVE POWERS': 'ALLE FÜNF KRÄFTE', 'DUPLICATE MOBS': 'KREATUREN DUPLIZIEREN',
    'DOUBLE THE GEMS': 'EDELSTEINE VERDOPPELN', 'DOUBLE THE LIVES': 'LEBEN VERDOPPELN',
    'SEGMENTATION FAULT AT 0x5Q4RE': 'SEGMENTIERUNGSFEHLER BEI 0x5Q4RE',
    'vector escaped world bounds': 'Vektor entkam den Weltgrenzen',
    'J².SYS  //  DEVELOPER SHELL': 'J².SYS  //  ENTWICKLER-SHELL',
    'you were not supposed to find this': 'das solltest du nicht finden',
    '↑↓ select   ENTER apply   ESC back / resume': '↑↓ wählen   ENTER anwenden   ESC zurück / weiter',
  },
};

const STRINGS_F = {
  livesLeft: {
    en: (n) => n >= 0 ? n + ' lives left' : 'no lives left',
    es: (n) => n >= 0 ? n + ' vidas restantes' : 'sin vidas restantes',
    de: (n) => n >= 0 ? n + ' Leben übrig' : 'keine Leben übrig',
  },
  levelLabel: {
    en: (n, name) => 'LEVEL ' + n + '  •  ' + name,
    es: (n, name) => 'NIVEL ' + n + '  •  ' + name,
    de: (n, name) => 'LEVEL ' + n + '  •  ' + name,
  },
  nextSquareAt: {
    en: (n) => 'next ² at ' + n,
    es: (n) => 'próx. ² en ' + n,
    de: (n) => 'nächstes ² bei ' + n,
  },
  gemsCount: {
    en: (n) => n + ' gems',
    es: (n) => n + ' gemas',
    de: (n) => n + ' Edelsteine',
  },
  gameOverStats: {
    en: (g, s) => g + ' gems   •   ' + s + ' points',
    es: (g, s) => g + ' gemas   •   ' + s + ' puntos',
    de: (g, s) => g + ' Edelsteine   •   ' + s + ' Punkte',
  },
  leftOver: {
    en: (r, rem) => 'that is ' + r + '² and ' + rem + ' left over',
    es: (r, rem) => 'eso es ' + r + '² y sobran ' + rem,
    de: (r, rem) => 'das ist ' + r + '² und ' + rem + ' bleiben übrig',
  },
  winStats: {
    en: (g, s) => 'Jay collected ' + g + ' gems and ' + s + ' points',
    es: (g, s) => 'Jay recolectó ' + g + ' gemas y ' + s + ' puntos',
    de: (g, s) => 'Jay hat ' + g + ' Edelsteine und ' + s + ' Punkte gesammelt',
  },
  winAbilities: {
    en: (g, r, n) => '√' + g + ' ≈ ' + r + '  •  abilities found: ' + n + '/5',
    es: (g, r, n) => '√' + g + ' ≈ ' + r + '  •  habilidades halladas: ' + n + '/5',
    de: (g, r, n) => '√' + g + ' ≈ ' + r + '  •  Fähigkeiten gefunden: ' + n + '/5',
  },
  notQuite: {
    en: (n) => 'NOT QUITE — it was ' + n,
    es: (n) => 'CASI — era ' + n,
    de: (n) => 'FAST — es war ' + n,
  },
  slotEmpty: {
    en: (n) => 'slot ' + n + ' is empty',
    es: (n) => 'ranura ' + n + ' vacía',
    de: (n) => 'Fach ' + n + ' ist leer',
  },
  recharged: {
    en: (name) => name + ' recharged',
    es: (name) => name + ' recargado',
    de: (name) => name + ' aufgeladen',
  },
  toSlot: {
    en: (name, n) => name + '  →  slot ' + n,
    es: (name, n) => name + '  →  ranura ' + n,
    de: (name, n) => name + '  →  Fach ' + n,
  },
  abilityLabel: {
    en: (name) => 'ABILITY: ' + name,
    es: (name) => 'HABILIDAD: ' + name,
    de: (name) => 'FÄHIGKEIT: ' + name,
  },
  gemsSquared: {
    en: (n, r) => n + ' gems = ' + r + ' squared',
    es: (n, r) => n + ' gemas = ' + r + ' al cuadrado',
    de: (n, r) => n + ' Edelsteine = ' + r + ' im Quadrat',
  },
  perfectSquareHeart: {
    en: (r) => 'perfect square: ' + r + '²',
    es: (r) => 'cuadrado perfecto: ' + r + '²',
    de: (r) => 'Quadratzahl: ' + r + '²',
  },
  levelOfTotal: {
    en: (n, total) => 'level ' + n + ' of ' + total,
    es: (n, total) => 'nivel ' + n + ' de ' + total,
    de: (n, total) => 'Level ' + n + ' von ' + total,
  },
  blastN: {
    en: (n) => 'BLAST  ' + n + '!',
    es: (n) => 'EXPLOSIÓN  ' + n + '!',
    de: (n) => 'WUCHT  ' + n + '!',
  },
  mobsDown: {
    en: (n) => n + ' down',
    es: (n) => n + ' abajo',
    de: (n) => n + ' erledigt',
  },
};

function TR(s) {
  if (G.lang === 'en') return s;
  const table = STRINGS[G.lang];
  return (table && table[s]) || s;
}
function TRF(key, ...args) {
  const entry = STRINGS_F[key];
  if (!entry) return '';
  const fn = entry[G.lang] || entry.en;
  return fn(...args);
}

/* The start-screen hint that teaches players about L. It auto-cycles through
   each supported language's own phrasing every couple of seconds; picking a
   language interrupts the cycle for a beat to confirm the choice, in that
   language, before resuming. */
const LANG_HINT = {
  en: 'press L to change language',
  es: 'pulsa L para cambiar de idioma',
  de: 'drücke L, um die Sprache zu wechseln',
};
const LANG_SELECTED = {
  en: (name) => 'you selected ' + name,
  es: (name) => 'seleccionaste ' + name,
  de: (name) => 'du hast ' + name + ' ausgewählt',
};

/* --- audio: a very small square-wave blip synth --------------------------- */
const Audio2 = {
  ctx: null, master: null, on: true,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    } catch (err) { this.on = false; }
  },
  blip(freq = 440, dur = 0.08, type = 'square', vol = 1, slide = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur = 0.14, vol = 0.5) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol * 0.5;
    s.connect(g); g.connect(this.master); s.start();
  },
  arp(notes, spacing = 0.06, type = 'square') {
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.09, type, 0.8), i * spacing * 1000));
  },
};

const SFX = {
  jump: (chain) => Audio2.blip(300 + chain * 70, 0.09, 'square', 0.7, 180),
  land: (impact = 1) => Audio2.blip(120, 0.05, 'triangle', 0.28 + 0.32 * impact),
  step: () => {
    Audio2.noise(0.045, 0.14);
    Audio2.blip(88 + Math.random() * 26, 0.028, 'triangle', 0.16);
  },
  pickup: () => Audio2.arp([523, 659, 784, 1046], 0.05),
  gem: () => Audio2.blip(880, 0.06, 'square', 0.5, 260),
  square: () => Audio2.arp([659, 880, 1174, 1568], 0.06, 'triangle'),
  hurt: () => Audio2.blip(180, 0.22, 'sawtooth', 0.8, -110),
  stomp: () => Audio2.blip(420, 0.07, 'square', 0.7, -250),
  shoot: () => Audio2.blip(520, 0.06, 'square', 0.5, -180),
  zap: () => { Audio2.blip(1200, 0.09, 'sawtooth', 0.6, -700); Audio2.noise(0.1, 0.35); },
  boom: () => { Audio2.noise(0.3, 0.9); Audio2.blip(90, 0.3, 'sawtooth', 0.8, -50); },
  wind: () => Audio2.noise(0.32, 0.35),
  freeze: () => Audio2.arp([1400, 1100, 900, 700], 0.04, 'sine'),
  rumble: () => { Audio2.noise(0.22, 0.7); Audio2.blip(70, 0.25, 'square', 0.6); },
  door: () => Audio2.arp([392, 523, 659, 784, 1046], 0.07, 'triangle'),
  glitch: () => { Audio2.noise(0.6, 1); Audio2.blip(60, 0.5, 'sawtooth', 0.9, 900); },
  death: () => Audio2.arp([440, 330, 262, 175], 0.11, 'square'),
  oneUp: () => Audio2.arp([523, 659, 784, 1046, 1318], 0.06, 'triangle'),
  menu: () => Audio2.blip(700, 0.04, 'square', 0.4),
};

/* ==========================================================================
   TILES
   ========================================================================== */
const T = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SANDSTONE: 5, SNOW: 6, ICE: 7,
  PLANK: 8, LOG: 9, LEAVES: 10, LADDER: 11, WATER: 12, LAVA: 13, BRICK: 14,
  OBSIDIAN: 15, GLASS: 16, MOSS: 17, SPIKES: 18, CACTUS: 19, NETHERROCK: 20,
  GLOWSTONE: 21, BEDROCK: 22, PLATFORM: 23, GOLD: 24, DOOR: 25, VINE: 26,
  COAL: 27, EMERALD: 28, DARKBRICK: 29, TORCHWALL: 30, SHRUB: 31,
};

const TILEDEF = {};
function deftile(id, name, base, shade, opts = {}) {
  TILEDEF[id] = Object.assign({
    id, name, base, shade,
    solid: true, climb: false, hazard: 0, liquid: false,
    platform: false, light: 0, speckle: 0.5,
  }, opts);
}
deftile(T.AIR, 'air', '#000', '#000', { solid: false });
deftile(T.GRASS, 'grass', '#5aa346', '#3d7a2e', { speckle: 0.7 });
deftile(T.DIRT, 'dirt', '#8a5a3b', '#6b432b');
deftile(T.STONE, 'stone', '#8b8b91', '#6e6e74');
deftile(T.SAND, 'sand', '#dbcb8c', '#bfae6d');
deftile(T.SANDSTONE, 'sandstone', '#c8b26f', '#a99456');
deftile(T.SNOW, 'snow', '#e9f2f7', '#c3d4de');
deftile(T.ICE, 'ice', '#9fd7ee', '#7ab6d3', { speckle: 0.25 });
deftile(T.PLANK, 'plank', '#b98a52', '#96693a');
/* A tree must never be a wall. You walk straight through a trunk (or shimmy up
   it like a ladder), and the canopy is a one-way platform you can land on. */
deftile(T.LOG, 'log', '#7a5734', '#5d4126', { solid: false, climb: true });
deftile(T.LEAVES, 'leaves', '#4c8f3a', '#376b28', { speckle: 0.9, solid: false, platform: true });
deftile(T.LADDER, 'ladder', '#c39a5f', '#8e6c3c', { solid: false, climb: true });
deftile(T.WATER, 'water', '#3b74d6', '#2a58a8', { solid: false, liquid: true, speckle: 0.2 });
deftile(T.LAVA, 'lava', '#e8622a', '#b93f14', { solid: false, liquid: true, hazard: 2, light: 1, speckle: 0.6 });
deftile(T.BRICK, 'brick', '#8f9099', '#70717a');
deftile(T.OBSIDIAN, 'obsidian', '#2a2338', '#1a1526');
deftile(T.GLASS, 'glass', 'rgba(190,225,245,.30)', 'rgba(230,245,255,.55)', { speckle: 0 });
deftile(T.MOSS, 'moss', '#6b8455', '#516640');
deftile(T.SPIKES, 'spikes', '#b6bcc7', '#8d939e', { solid: false, hazard: 1 });
deftile(T.CACTUS, 'cactus', '#3f8b4f', '#2d6a3a', { solid: false, hazard: 1 });
deftile(T.NETHERROCK, 'netherrock', '#6e2f34', '#511f24');
deftile(T.GLOWSTONE, 'glowstone', '#f0c85e', '#c99e35', { light: 1 });
deftile(T.BEDROCK, 'bedrock', '#3a3a42', '#26262c', { speckle: 0.9 });
deftile(T.PLATFORM, 'platform', '#c19b62', '#96723f', { solid: false, platform: true });
deftile(T.GOLD, 'gold', '#e8c04a', '#bd952b', { light: 0.5 });
deftile(T.DOOR, 'door', '#8b5f34', '#674325', { solid: false });
deftile(T.VINE, 'vine', '#3f7f33', '#2e5f25', { solid: false, climb: true });
deftile(T.COAL, 'coal', '#8b8b91', '#6e6e74');
deftile(T.EMERALD, 'emerald', '#8b8b91', '#6e6e74');
deftile(T.DARKBRICK, 'darkbrick', '#5c5f6d', '#464956');
deftile(T.TORCHWALL, 'torchwall', '#8f9099', '#70717a', { light: 1 });
/* Scenery only. Decoration must never be an obstacle. */
deftile(T.SHRUB, 'shrub', '#57a83f', '#3d7a2e', { solid: false, speckle: 0 });

const isSolid = (t) => TILEDEF[t] ? TILEDEF[t].solid : false;
const isClimb = (t) => TILEDEF[t] ? TILEDEF[t].climb : false;
const isPlatform = (t) => TILEDEF[t] ? TILEDEF[t].platform : false;

/* Blocks Jay's fists can knock out. Deliberately excludes stone, brick,
   obsidian, bedrock and gold, so the castle and the level floors survive. */
const SOFT = new Set([
  T.GRASS, T.DIRT, T.SAND, T.SNOW, T.PLANK, T.LOG, T.LEAVES,
  T.MOSS, T.GLASS, T.COAL, T.CACTUS, T.ICE, T.SHRUB,
]);

/* --- baked block textures ------------------------------------------------ */
/* Each block type gets 4 pre-rendered 16x16 variants so a wall of stone
   doesn't look like wallpaper. Minecraft-ish speckle noise. */
const TEX = {};
function bakeTextures() {
  for (const id in TILEDEF) {
    const d = TILEDEF[id];
    if (+id === T.AIR) continue;
    const variants = [];
    for (let v = 0; v < 4; v++) {
      const c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      const g = c.getContext('2d');
      g.fillStyle = d.base;
      g.fillRect(0, 0, TILE, TILE);
      const rnd = mulberry32((+id) * 977 + v * 131);
      const n = Math.floor(d.speckle * 46);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
        const s = rnd() < 0.5 ? 1 : 2;
        g.fillStyle = rnd() < 0.55 ? d.shade : 'rgba(255,255,255,.08)';
        g.fillRect(x, y, s, s);
      }
      decorateTile(g, +id, rnd, d);
      variants.push(c);
    }
    TEX[id] = variants;
  }
}

function decorateTile(g, id, rnd, d) {
  switch (id) {
    case T.GRASS: {
      g.fillStyle = '#8a5a3b'; g.fillRect(0, 5, TILE, TILE - 5);
      g.fillStyle = '#6b432b';
      for (let i = 0; i < 18; i++) g.fillRect(Math.floor(rnd() * 16), 5 + Math.floor(rnd() * 11), 2, 1);
      g.fillStyle = d.base; g.fillRect(0, 0, TILE, 5);
      g.fillStyle = '#6ebd55';
      for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 4), 1, 1);
      g.fillStyle = '#3d7a2e';
      for (let x = 0; x < 16; x += 2) if (rnd() < 0.5) g.fillRect(x, 5, 2, 1);
      break;
    }
    case T.LOG: {
      g.fillStyle = '#5d4126';
      for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 16, 1);
      g.fillStyle = '#8d6740'; g.fillRect(3, 0, 2, 16); g.fillRect(11, 0, 1, 16);
      break;
    }
    case T.LADDER: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#8e6c3c'; g.fillRect(2, 0, 3, 16); g.fillRect(11, 0, 3, 16);
      g.fillStyle = '#c39a5f';
      g.fillRect(2, 0, 1, 16); g.fillRect(11, 0, 1, 16);
      for (let y = 2; y < 16; y += 5) { g.fillStyle = '#c39a5f'; g.fillRect(2, y, 12, 2); }
      break;
    }
    case T.VINE: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#3f7f33';
      for (let y = 0; y < 16; y++) {
        const x = 6 + Math.round(Math.sin(y * 0.6) * 3);
        g.fillRect(x, y, 3, 1);
        if (rnd() < 0.3) g.fillRect(x - 2, y, 2, 1);
      }
      break;
    }
    case T.SPIKES: {
      g.clearRect(0, 0, TILE, TILE);
      for (let i = 0; i < 4; i++) {
        const bx = i * 4;
        g.fillStyle = '#b6bcc7';
        g.fillRect(bx + 1, 12, 3, 4); g.fillRect(bx + 1, 9, 2, 3); g.fillRect(bx + 1, 7, 1, 2);
        g.fillStyle = '#e2e7ee'; g.fillRect(bx + 1, 7, 1, 5);
      }
      break;
    }
    case T.CACTUS: {
      g.fillStyle = '#2d6a3a'; g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16);
      g.fillStyle = '#57a866';
      for (let y = 1; y < 16; y += 4) { g.fillRect(3, y, 1, 2); g.fillRect(12, y + 2, 1, 2); }
      break;
    }
    case T.BRICK: case T.DARKBRICK: {
      g.fillStyle = d.shade;
      g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);
      g.fillRect(7, 0, 1, 8); g.fillRect(3, 8, 1, 8); g.fillRect(11, 8, 1, 8);
      break;
    }
    case T.PLANK: {
      g.fillStyle = '#96693a';
      g.fillRect(0, 3, 16, 1); g.fillRect(0, 8, 16, 1); g.fillRect(0, 13, 16, 1);
      g.fillStyle = '#d0a066'; g.fillRect(0, 4, 16, 1);
      break;
    }
    case T.PLATFORM: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#c19b62'; g.fillRect(0, 0, 16, 5);
      g.fillStyle = '#96723f'; g.fillRect(0, 4, 16, 2);
      g.fillStyle = '#e0bd85'; g.fillRect(0, 0, 16, 1);
      break;
    }
    case T.GLASS: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = 'rgba(180,220,245,.22)'; g.fillRect(0, 0, 16, 16);
      g.strokeStyle = 'rgba(225,245,255,.55)'; g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, 15, 15);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(2, 2, 5, 1); g.fillRect(2, 2, 1, 5);
      break;
    }
    case T.GLOWSTONE: {
      g.fillStyle = '#fff3c0';
      for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 2, 2);
      break;
    }
    case T.COAL: {
      g.fillStyle = '#23232a';
      for (let i = 0; i < 6; i++) g.fillRect(3 + Math.floor(rnd() * 9), 3 + Math.floor(rnd() * 9), 3, 3);
      break;
    }
    case T.EMERALD: {
      g.fillStyle = '#31c66d';
      for (let i = 0; i < 4; i++) g.fillRect(3 + Math.floor(rnd() * 9), 3 + Math.floor(rnd() * 9), 3, 3);
      break;
    }
    case T.DOOR: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#674325'; g.fillRect(1, 0, 14, 16);
      g.fillStyle = '#8b5f34'; g.fillRect(2, 1, 12, 14);
      g.fillStyle = '#5a3a20'; g.fillRect(2, 7, 12, 1);
      g.fillStyle = '#e8c04a'; g.fillRect(11, 8, 2, 2);
      break;
    }
    case T.TORCHWALL: {
      g.fillStyle = '#5a4526'; g.fillRect(7, 6, 2, 8);
      g.fillStyle = '#ffcf5a'; g.fillRect(6, 3, 4, 4);
      g.fillStyle = '#fff3c0'; g.fillRect(7, 4, 2, 2);
      break;
    }
    case T.ICE: {
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillRect(2, 2, 6, 1); g.fillRect(9, 8, 5, 1); g.fillRect(3, 11, 4, 1);
      break;
    }
    case T.LEAVES: {
      g.fillStyle = 'rgba(0,0,0,.16)';
      for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 2, 2);
      break;
    }
    case T.SHRUB: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#3d7a2e';
      for (let i = 0; i < 7; i++) {
        const bx = 1 + Math.floor(rnd() * 13), bh = 3 + Math.floor(rnd() * 6);
        g.fillRect(bx, 16 - bh, 2, bh);
      }
      g.fillStyle = '#6ebd55';
      for (let i = 0; i < 5; i++) {
        const bx = 2 + Math.floor(rnd() * 12), bh = 3 + Math.floor(rnd() * 5);
        g.fillRect(bx, 16 - bh, 1, bh);
      }
      g.fillStyle = '#8fd86a';
      g.fillRect(4 + Math.floor(rnd() * 6), 8 + Math.floor(rnd() * 3), 2, 2);
      break;
    }
  }
}
