/* ============================================================
   VULPOIUL TRASNIT — script.js
   Motor Bayesian + Firebase + i18n + Wikipedia + Scoring
   ============================================================ */

"use strict";

// ── Firebase SDK ──────────────────────────────────────────────
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs,
         query, orderBy, limit, doc, getDoc, setDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);   // din config.js
const db  = getFirestore(app);

// ── Constante ─────────────────────────────────────────────────
const MAX_QUESTIONS   = 20;
const GUESS_THRESHOLD = 0.75;
const LEADERBOARD_TOP = 10;

// ── Starea jocului ────────────────────────────────────────────
let state = {
  lang:             "ro",
  category:         null,
  scores:           {},
  asked:            new Set(),
  questionCount:    0,
  gameActive:       false,
  currentQuestion:  null,
  topChar:          null,
  hydrationShown:   false,
  fakeGuessShown:   false,
};

// ── Helpers DOM ───────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── i18n ──────────────────────────────────────────────────────
function t(key) {
  const keys = key.split(".");
  let obj = TRANSLATIONS[state.lang] || TRANSLATIONS["ro"];
  for (const k of keys) { obj = obj?.[k]; }
  return obj ?? key;
}

function detectLang() {
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  return ["ro","en","fr","es","de"].includes(nav) ? nav : "ro";
}

// ── Sunete ────────────────────────────────────────────────────
function playSound(name) {
  const map = {
    click: "sounds/click.mp3.mp3",
    win:   "sounds/win.mp3.mp3",
    lose:  "sounds/lose.mp3.mp3"
  };
  const src = map[name];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.4;
  audio.play().catch(() => {});
}

// Sunete amuzante (Web Audio API)
const _AudioCtx = window.AudioContext || window.webkitAudioContext;
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx && _AudioCtx) _audioCtx = new _AudioCtx();
  return _audioCtx;
}

function playFunnySound() {
  if (Math.random() > 0.30) return;  // 30% sansa
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const pick = Math.random();
    if      (pick < 0.33) playBlip(ctx);
    else if (pick < 0.66) playWobble(ctx);
    else                  playBurp(ctx);
  } catch(e) {}
}

function playBlip(ctx) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(700, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.start(); osc.stop(ctx.currentTime + 0.35);
}

function playWobble(ctx) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(160, ctx.currentTime);
  osc.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
  osc.frequency.setValueAtTime(85,  ctx.currentTime + 0.25);
  gain.gain.setValueAtTime(0.10, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(); osc.stop(ctx.currentTime + 0.4);
}

function playBurp(ctx) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(130, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.45);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  osc.start(); osc.stop(ctx.currentTime + 0.45);
}

// ── Animatii Gicu ─────────────────────────────────────────────
const MOODS = {
  thinking: "🦊", happy: "😄", sad: "😢",
  surprised: "😮", laughing: "😂", angry: "😤"
};

function setMood(mood) {
  // Badge emoji in colt
  const badge = $("foxFace");
  if (badge) {
    badge.textContent = MOODS[mood] || "🦊";
    badge.className   = "fox-mood-badge " + mood;
  }
  // Efect CSS pe imaginea reala
  const img = $("gicuImg");
  if (img) img.className = `gicu-real-img mood-${mood}`;
}

function animateFox(mood = "thinking") {
  setMood(mood);
  const el = $("foxCharacter");
  if (!el) return;
  el.classList.add("bounce");
  setTimeout(() => el.classList.remove("bounce"), 400);
}

// ── Remarci Gicu (non-repetitive) ────────────────────────────
const _usedRemarks = {};

function getRemarkFor(type) {
  const pool = REMARKS[state.lang]?.[type] || REMARKS["ro"]?.[type] || [];
  if (!pool.length) return "";
  if (!_usedRemarks[type]) _usedRemarks[type] = [];
  let available = pool.filter((_, i) => !_usedRemarks[type].includes(i));
  if (!available.length) {
    _usedRemarks[type] = [];
    available = pool.map((_, i) => i);
  }
  const idx = available[Math.floor(Math.random() * available.length)];
  _usedRemarks[type].push(idx);
  return pool[idx];
}

function showRemark(type, duration = 3000) {
  const remark = getRemarkFor(type);
  const bubble = $("reactionBubble");
  const text   = $("reactionText");
  if (!bubble || !text || !remark) return;
  text.textContent = remark;
  bubble.classList.add("is-visible");
  clearTimeout(bubble._hideTimer);
  bubble._hideTimer = setTimeout(() => bubble.classList.remove("is-visible"), duration);
}

// ── Wikipedia imagine ─────────────────────────────────────────
async function fetchWikiImage(slug) {
  if (!slug) return null;
  try {
    const url  = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.thumbnail?.source || data.originalimage?.source || null;
  } catch { return null; }
}

// ── Algoritm Bayesian ─────────────────────────────────────────
function initScores(category) {
  const chars = CHARACTERS.filter(c => c.category === category);
  const n     = chars.length;
  const init  = 1 / (n || 1);
  const scores = {};
  chars.forEach(c => { scores[c.id] = init; });
  return scores;
}

function normalize(scores) {
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  if (sum === 0) return scores;
  const out = {};
  for (const [k, v] of Object.entries(scores)) out[k] = v / sum;
  return out;
}

function entropy(probs) {
  let h = 0;
  for (const p of probs) { if (p > 0) h -= p * Math.log2(p); }
  return h;
}

function updateScores(scores, questionId, userAnswer) {
  const newScores = {};
  for (const [charId, prob] of Object.entries(scores)) {
    const char = CHARACTERS.find(c => c.id === charId);
    const attr = char?.attributes?.[questionId] ?? 0.5;
    const diff = Math.abs(attr - userAnswer);
    const likelihood = 1 - diff * 0.9 + 0.05;
    newScores[charId] = prob * likelihood;
  }
  return normalize(newScores);
}

function informationGain(questionId, scores) {
  const H = entropy(Object.values(scores));
  const buckets = { 0: {}, 0.5: {}, 1: {} };
  for (const [charId, prob] of Object.entries(scores)) {
    const char = CHARACTERS.find(c => c.id === charId);
    const v    = char?.attributes?.[questionId] ?? 0.5;
    const b    = v < 0.3 ? 0 : v > 0.7 ? 1 : 0.5;
    buckets[b][charId] = prob;
  }
  let weightedH = 0;
  for (const bucket of Object.values(buckets)) {
    const vals = Object.values(bucket);
    const w    = vals.reduce((a, b) => a + b, 0);
    if (w > 0) weightedH += w * entropy(vals.map(p => p / w));
  }
  return H - weightedH;
}

function pickBestQuestion() {
  const catChars = CHARACTERS.filter(c => c.category === state.category);
  const catQuestions = QUESTIONS.filter(q => {
    if (q.category !== "all" && q.category !== state.category) return false;
    if (state.asked.has(q.id)) return false;
    if (q.category === "all") {
      // Skip global questions where ALL characters in this category share the same value
      const vals = catChars.map(c => c.attributes?.[q.id] ?? 0.5);
      return vals.some(v => v !== vals[0]);
    }
    return true;
  });
  if (!catQuestions.length) return null;
  let bestIG = -1, bestQ = null;
  for (const q of catQuestions) {
    const ig = informationGain(q.id, state.scores);
    if (ig > bestIG) { bestIG = ig; bestQ = q; }
  }
  return bestQ;
}

function getTopChar() {
  let best = null, bestProb = 0;
  for (const [id, prob] of Object.entries(state.scores)) {
    if (prob > bestProb) { bestProb = prob; best = id; }
  }
  return { id: best, prob: bestProb };
}

// ── Scoring ───────────────────────────────────────────────────
function calcStars(questionsUsed) {
  if (questionsUsed <= 7)  return 3;
  if (questionsUsed <= 14) return 2;
  return 1;
}

function renderStars(n) {
  return "⭐".repeat(n) + "☆".repeat(3 - n);
}

// ── Firebase: Contor Global 1.000.000 ────────────────────────
async function loadGlobalCounter() {
  try {
    const ref  = doc(db, "counters", "global");
    const snap = await getDoc(ref);
    const count = snap.exists() ? (snap.data().count || 0) : 0;
    displayCounter(count);
  } catch(e) { console.warn("Counter load error:", e); }
}

async function incrementGlobalCounter() {
  try {
    const ref  = doc(db, "counters", "global");
    const snap = await getDoc(ref);
    const newCount = (snap.exists() ? (snap.data().count || 0) : 0) + 1;
    await setDoc(ref, { count: newCount }, { merge: true });
    displayCounter(newCount);
  } catch(e) { console.warn("Counter increment error:", e); }
}

function displayCounter(count) {
  const el = $("globalCounter");
  if (!el) return;
  el.textContent = Number(count).toLocaleString("ro-RO") + " / 1.000.000";
}

// ── Firebase: Leaderboard ─────────────────────────────────────
async function saveToLeaderboard(playerName, stars, questionsUsed) {
  try {
    await addDoc(collection(db, "leaderboard"), {
      name: playerName, stars, questionsUsed,
      category: state.category, lang: state.lang,
      timestamp: Date.now()
    });
  } catch(e) { console.warn("Leaderboard save error:", e); }
}

async function loadLeaderboard() {
  try {
    const q = query(
      collection(db, "leaderboard"),
      orderBy("stars", "desc"),
      orderBy("questionsUsed", "asc"),
      limit(LEADERBOARD_TOP)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch(e) { console.warn("Leaderboard load error:", e); return []; }
}

// ── Firebase: Learning ────────────────────────────────────────
async function saveToLearningQueue(data) {
  try {
    await addDoc(collection(db, "learn_queue"), { ...data, timestamp: Date.now() });
  } catch(e) { console.warn("Learn queue error:", e); }
}

// ── Thought Bubbles (Hip-Hop) ─────────────────────────────────
const THOUGHT_PHRASES = {
  ro: [
    "🎤 Gicu' pe beat...",
    "🔥 Calculez flow-ul...",
    "💯 Real talk, analizez...",
    "🧢 Reprezint cotetul...",
    "📿 Boss moves în derulare...",
    "🎵 Geniu' gândește...",
    "🔮 Detectez vibrațiile...",
    "💎 Calculez cu stil...",
    "🎶 Logica e pe repeat...",
    "🦊 Gicu știe. Aproape.",
  ],
  en: [
    "🎤 Gicu on the beat...",
    "🔥 Flow detected...",
    "💯 Real talk, analyzing...",
    "🧢 Representing hard...",
    "📿 Boss moves loading...",
    "🎵 Genius thinking...",
    "🔮 Detecting vibes...",
    "💎 Calculating with style...",
    "🎶 Logic on repeat...",
    "🦊 Gicu knows. Almost.",
  ],
  fr: [
    "🎤 Gicu sur le beat...",
    "🔥 Flow en calcul...",
    "💯 Vérité pure, j'analyse...",
    "🧢 Gicu représente...",
    "📿 Boss moves en cours...",
    "🎵 Le génie réfléchit...",
    "🔮 Détection des vibes...",
    "💎 Calcul avec style...",
    "🎶 La logique tourne...",
    "🦊 Gicu sait. Presque.",
  ],
  es: [
    "🎤 Gicu en el beat...",
    "🔥 Flow detectado...",
    "💯 Real talk, analizando...",
    "🧢 Representando fuerte...",
    "📿 Boss moves cargando...",
    "🎵 El genio piensa...",
    "🔮 Detectando vibes...",
    "💎 Calculando con estilo...",
    "🎶 Lógica en bucle...",
    "🦊 Gicu sabe. Casi.",
  ],
  de: [
    "🎤 Gicu am Beat...",
    "🔥 Flow berechnet...",
    "💯 Real talk, wird analysiert...",
    "🧢 Vertretung läuft...",
    "📿 Boss moves am Laden...",
    "🎵 Das Genie denkt...",
    "🔮 Vibes werden detektiert...",
    "💎 Berechnung mit Stil...",
    "🎶 Logik auf Repeat...",
    "🦊 Gicu weiß es. Fast.",
  ],
};

function updateThoughtBubbles() {
  const phrases  = THOUGHT_PHRASES[state.lang] || THOUGHT_PHRASES["en"];
  const shuffled = [...phrases].sort(() => Math.random() - 0.5);
  const ids = ["tb1", "tb2", "tb3"];
  ids.forEach((id, i) => {
    const b = $(id);
    if (!b) return;
    b.classList.remove("is-visible");
    setTimeout(() => {
      b.textContent = shuffled[i] || "";
      b.classList.add("is-visible");
      setTimeout(() => b.classList.remove("is-visible"), 2600);
    }, i * 160);
  });
}

// ── Gâștele îl iau la mișto ───────────────────────────────────
const GOOSE_TAUNTS = {
  ro: [
    "🪿 GA-GA-GA! Nu o să ghicești! GA-GA! 😤",
    "🐔 Haha! Vulpoiul calculează! Noi râdem cu lacrimi! 😂",
    "🪿 GICU E BLOCAT! GA GA GA GA!",
    "🐓 Gâsca nr.3 zice că greșești! GA!",
    "🪿 Aaaaaa, vulpoiule! Gâștele nu uită NICIODATĂ! 😏",
    "🐔 Hai, hai, Gicu'! Noi tot râdem de tine! 🤣",
    "🪿 Pst... gâsca șefă a pariat că nu ghicești. GA!",
    "🐔 Calculează, calculează! Noi mâncăm porumb și râdem! 😈",
  ],
  en: [
    "🪿 HONK HONK! You'll never guess! HONK! 😤",
    "🐔 Haha! The fox calculates! We cry laughing! 😂",
    "🪿 GICU IS STUCK! HONK HONK HONK!",
    "🐓 Goose #3 says you're wrong! HONK!",
    "🪿 Ohhhh foxy! Geese NEVER forget! 😏",
    "🐔 Come on Gicu! We're still laughing at you! 🤣",
    "🪿 Psst... the lead goose bet you won't guess! HONK!",
    "🐔 Calculate, calculate! We eat corn and laugh! 😈",
  ],
  fr: [
    "🪿 COIN COIN! Tu ne devineras jamais! COIN! 😤",
    "🐔 Haha! Le renard calcule! On pleure de rire! 😂",
    "🪿 GICU EST BLOQUÉ! COIN COIN COIN!",
    "🐓 L'oie n°3 dit que tu te trompes! COIN!",
    "🪿 Ohhh renard! Les oies N'OUBLIENT JAMAIS! 😏",
    "🐔 Allez Gicu! On rit encore de toi! 🤣",
    "🪿 Psst... l'oie chef a parié que tu ne devines pas! COIN!",
    "🐔 Calcule, calcule! On mange du maïs et on rit! 😈",
  ],
  es: [
    "🪿 CLOC CLOC! ¡Nunca adivinarás! ¡CLOC! 😤",
    "🐔 ¡Jaja! ¡El zorro calcula! ¡Lloramos de risa! 😂",
    "🪿 ¡GICU ESTÁ ATRAPADO! ¡CLOC CLOC CLOC!",
    "🐓 ¡El ganso #3 dice que estás equivocado! ¡CLOC!",
    "🪿 ¡Ohhh zorrito! ¡Los gansos NUNCA olvidan! 😏",
    "🐔 ¡Vamos Gicu! ¡Todavía nos reímos de ti! 🤣",
    "🪿 ¡Psst... el ganso jefe apostó que no adivinas! ¡CLOC!",
    "🐔 ¡Calcula, calcula! ¡Comemos maíz y reímos! 😈",
  ],
  de: [
    "🪿 GACK GACK! Du wirst es nie erraten! GACK! 😤",
    "🐔 Haha! Der Fuchs rechnet! Wir weinen vor Lachen! 😂",
    "🪿 GICU IST GEFANGEN! GACK GACK GACK!",
    "🐓 Gans Nr.3 sagt du liegst falsch! GACK!",
    "🪿 Ohhhh Füchslein! Gänse vergessen NIE! 😏",
    "🐔 Los Gicu! Wir lachen noch immer über dich! 🤣",
    "🪿 Psst... die Anführergans hat gewettet, du rätst nicht! GACK!",
    "🐔 Rechne, rechne! Wir essen Mais und lachen! 😈",
  ],
};

// ── Portrete haioase animale (la taunt) ──────────────────────
const ANIMAL_PORTRAITS = [
  { main:"🐔", acc:"🙃", ro:"Găina Ochii-Cruciș", en:"Cross-Eyed Hen",          fr:"La Poule Louche",          es:"La Gallina Bizca",          de:"Die Schielende Henne" },
  { main:"🦢", acc:"💇", ro:"Gâsca cu Breton",    en:"Goose with Bangs",         fr:"L'Oie au Frange",          es:"El Ganso con Flequillo",    de:"Die Gans mit Pony" },
  { main:"🐓", acc:"🪩", ro:"Cocoșul Chel",        en:"The Bald Rooster",         fr:"Le Coq Chauve",            es:"El Gallo Calvo",            de:"Der Kahle Hahn" },
  { main:"🪿", acc:"😎", ro:"Gâsca cu Ochelari",   en:"Cool Goose",               fr:"L'Oie Cool",               es:"El Ganso Con Gafas",        de:"Die Coole Gans" },
  { main:"🐔", acc:"🤣", ro:"Găina Non-Stop-Râs",  en:"Non-Stop Laughing Hen",    fr:"La Poule Rit Sans Arrêt",  es:"La Gallina que Ríe",        de:"Die Immer-Lachende Henne" },
  { main:"🐓", acc:"👑", ro:"Cocoșul Rege",         en:"Rooster King",             fr:"Le Coq Roi",               es:"El Gallo Rey",              de:"Der Hahn König" },
  { main:"🪿", acc:"🎩", ro:"Gâsca Magicianul",    en:"Magician Goose",           fr:"L'Oie Magicien",           es:"El Ganso Mago",             de:"Die Zauberer-Gans" },
  { main:"🐔", acc:"💎", ro:"Găina Bogată",         en:"The Rich Hen",             fr:"La Poule Riche",           es:"La Gallina Rica",           de:"Die Reiche Henne" },
];

let _gooseTimerId = null;

function startGooseTaunts() {
  stopGooseTaunts();
  _gooseTimerId = setInterval(showGooseTaunt, 14000 + Math.random() * 8000);
}

function stopGooseTaunts() {
  if (_gooseTimerId) { clearInterval(_gooseTimerId); _gooseTimerId = null; }
  const el = $("gooseTaunt");
  if (el) el.style.display = "none";
}

function showGooseTaunt() {
  if (!state.gameActive) return;
  const pool    = GOOSE_TAUNTS[state.lang] || GOOSE_TAUNTS["ro"];
  const taunt   = pool[Math.floor(Math.random() * pool.length)];
  const portrait = ANIMAL_PORTRAITS[Math.floor(Math.random() * ANIMAL_PORTRAITS.length)];
  const el      = $("gooseTaunt");
  const text    = $("gooseTauntText");
  const portEl  = $("goosePortrait");
  if (!el || !text) return;
  text.textContent = taunt;
  if (portEl) {
    const name = portrait[state.lang] || portrait.ro;
    portEl.innerHTML = `<div class="animal-portrait-img">${portrait.main}${portrait.acc}</div><div class="animal-portrait-name">${name}</div>`;
  }
  el.style.display = "flex";
  setTimeout(() => { if (el) el.style.display = "none"; }, 5500);
}

// ── Pauza de Hidratare (dupa Q10) ────────────────────────────
const HYDRATION_FACTS = {
  ro: [
    "🌍 Știai că mierea nu se strică niciodată? Arheologii au găsit miere de 3.000 de ani în mormintele egiptene și era încă comestibilă. Gicu ar fi invidios, dar el n-are miere în coteț.",
    "🧠 Creierul uman generează suficientă electricitate cât să aprindă un bec! Creierul lui Gicu generează mai multă — dar merge toată în calcule de evadare.",
    "🐙 Caracatițele au 3 inimi și sânge albastru. Gicu are 1 inimă rănită și sânge portocaliu de vulpoi rasat.",
    "🌙 Urmele lui Neil Armstrong de pe Lună din 1969 vor rămâne acolo milioane de ani — nu e vânt! Urmele lui Gicu din coteț dispar zilnic, sub gâște.",
    "🐘 Elefanții nu pot sări. Gicu nu poate nici el — dar din alte motive (lacătul vrăjitoarei).",
    "🍕 Fiecare persoană mănâncă ~35 de tone de mâncare în viață. Gicu ar mânca mai mult dacă ar fi liber.",
    "🦈 Rechinii există de 450 de milioane de ani — înainte de dinozauri! Gicu există mai puțin, dar face mai mult zgomot.",
    "⚡ Trăsnetul lovește Pământul de 100 de ori pe secundă. Niciodată în coteț. Vrăjitoarea are protecție magică.",
    "🐬 Delfinii au nume individuale — se strigă unii pe alții cu sunete specifice, ca oamenii! Gâștele îl strigă pe Gicu cu alte sunete.",
    "🦋 Fluturii gustă cu picioarele. Gicu gustă libertatea cu... imaginația. Deocamdată.",
  ],
  en: [
    "🌍 Honey never spoils! Archaeologists found 3,000-year-old honey in Egyptian tombs and it was still edible. Gicu would be jealous, but he has no honey in the henhouse.",
    "🧠 The human brain generates enough electricity to power a lightbulb! Gicu's brain generates even more — but it all goes into escape calculations.",
    "🐙 Octopuses have 3 hearts and blue blood. Gicu has 1 wounded heart and orange fox blood.",
    "🌙 Neil Armstrong's 1969 Moon footprints will stay there for millions of years — no wind! Gicu's henhouse footprints disappear daily under geese.",
    "🐘 Elephants can't jump. Neither can Gicu — but for different reasons (the witch's lock).",
    "🍕 Each person eats ~35 tons of food in their lifetime. Gicu would eat more if he were free.",
    "🦈 Sharks have existed for 450 million years — before dinosaurs! Gicu has existed much less, but makes more noise.",
    "⚡ Lightning strikes Earth 100 times per second. Never in the henhouse. The witch has magic protection.",
    "🐬 Dolphins have individual names — they call each other by specific sounds, like humans! Geese call Gicu with very different sounds.",
    "🦋 Butterflies taste with their feet. Gicu tastes freedom with... imagination. For now.",
  ],
  fr: [
    "🌍 Le miel ne se périme jamais! Des archéologues ont trouvé du miel vieux de 3.000 ans en Égypte et il était comestible. Gicu serait jaloux, mais il n'a pas de miel dans son poulailler.",
    "🧠 Le cerveau humain génère assez d'électricité pour allumer une ampoule! Celui de Gicu en génère plus — mais tout va dans les calculs d'évasion.",
    "🐙 Les pieuvres ont 3 cœurs et du sang bleu. Gicu a 1 cœur blessé et du sang orange de renard.",
    "🌙 Les empreintes de Neil Armstrong de 1969 resteront sur la Lune des millions d'années — pas de vent! Celles de Gicu disparaissent chaque jour sous les oies.",
    "🐘 Les éléphants ne peuvent pas sauter. Gicu non plus — mais pour d'autres raisons (le cadenas de la sorcière).",
    "🍕 Chaque personne mange ~35 tonnes de nourriture dans sa vie. Gicu en mangerait plus s'il était libre.",
    "🦈 Les requins existent depuis 450 millions d'années — avant les dinosaures! Gicu existe bien moins, mais fait plus de bruit.",
    "⚡ La foudre frappe la Terre 100 fois par seconde. Jamais dans le poulailler. La sorcière a une protection magique.",
    "🐬 Les dauphins ont des noms individuels — ils s'appellent par des sons spécifiques! Les oies appellent Gicu avec des sons très différents.",
    "🦋 Les papillons goûtent avec leurs pattes. Gicu goûte la liberté avec... son imagination. Pour l'instant.",
  ],
  es: [
    "🌍 ¡La miel nunca caduca! Arqueólogos encontraron miel de 3.000 años en Egipto y era comestible. Gicu estaría celoso, pero no tiene miel en el gallinero.",
    "🧠 ¡El cerebro humano genera suficiente electricidad para encender una bombilla! El de Gicu genera más — pero todo va a cálculos de escape.",
    "🐙 Los pulpos tienen 3 corazones y sangre azul. Gicu tiene 1 corazón herido y sangre naranja de zorro.",
    "🌙 Las huellas de Neil Armstrong de 1969 permanecerán en la Luna millones de años — ¡sin viento! Las de Gicu desaparecen cada día bajo los gansos.",
    "🐘 Los elefantes no pueden saltar. Gicu tampoco — pero por otras razones (el candado de la bruja).",
    "🍕 Cada persona come ~35 toneladas de comida en su vida. Gicu comería más si fuera libre.",
    "🦈 ¡Los tiburones existen desde hace 450 millones de años — antes que los dinosaurios! Gicu existe mucho menos, pero hace más ruido.",
    "⚡ El rayo golpea la Tierra 100 veces por segundo. Nunca en el gallinero. La bruja tiene protección mágica.",
    "🐬 ¡Los delfines tienen nombres individuales — se llaman con sonidos específicos! Los gansos llaman a Gicu con sonidos muy diferentes.",
    "🦋 Las mariposas prueban con sus patas. Gicu prueba la libertad con... su imaginación. Por ahora.",
  ],
  de: [
    "🌍 Honig verdirbt nie! Archäologen fanden 3.000 Jahre alten Honig in Ägypten und er war noch essbar. Gicu wäre neidisch, aber er hat keinen Honig im Hühnerstall.",
    "🧠 Das menschliche Gehirn erzeugt genug Strom für eine Glühbirne! Gicus Gehirn erzeugt mehr — aber alles fließt in Fluchtberechnungen.",
    "🐙 Oktopusse haben 3 Herzen und blaues Blut. Gicu hat 1 verwundetes Herz und orangefarbenes Fuchsblut.",
    "🌙 Neil Armstrongs Mondabdrücke von 1969 bleiben Millionen Jahre — kein Wind! Gicus Abdrücke verschwinden täglich unter den Gänsen.",
    "🐘 Elefanten können nicht springen. Gicu auch nicht — aber aus anderen Gründen (das Schloss der Hexe).",
    "🍕 Jeder Mensch isst ~35 Tonnen Essen in seinem Leben. Gicu würde mehr essen, wenn er frei wäre.",
    "🦈 Haie existieren seit 450 Millionen Jahren — vor den Dinosauriern! Gicu existiert viel kürzer, macht aber mehr Lärm.",
    "⚡ Blitze treffen die Erde 100 Mal pro Sekunde. Nie im Hühnerstall. Die Hexe hat magischen Schutz.",
    "🐬 Delfine haben individuelle Namen — sie rufen sich mit spezifischen Lauten! Die Gänse rufen Gicu mit ganz anderen Lauten.",
    "🦋 Schmetterlinge schmecken mit ihren Füßen. Gicu schmeckt Freiheit mit... seiner Vorstellungskraft. Für jetzt.",
  ],
};

function getRandomHydrationFacts(count = 3) {
  const pool = HYDRATION_FACTS[state.lang] || HYDRATION_FACTS["ro"];
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

function showHydrationBreak() {
  state.hydrationShown = true;
  const facts     = getRandomHydrationFacts(3);
  const container = $("hydrationFacts");
  if (container) {
    container.innerHTML = facts
      .map(f => `<div class="hydration-fact">${f}</div>`)
      .join("");
  }
  const modal = $("modalHydration");
  if (modal) modal.style.display = "flex";
}

// ── Fals Ghicit (la Q10) ──────────────────────────────────────
const FAKE_CHARS = {
  ro: [
    "Gâsca Liderul Cotețului (cea cu coroana de paie)",
    "Vrăjitoarea din Pădure, cu tot cu pălărie și pisică",
    "Lacătul Magic de la Ușa Cotețului",
    "Gaina nr. 7 — cea care mă urăște cel mai tare",
    "Paiele din Colțul de Nord-Est al Cotețului",
    "Umbra Unui Gardian Invizibil",
    "Musteața Vrăjitoarei (cea dreaptă, nu stânga)",
    "Un Fotograf de la National Geographic în vizită",
  ],
  en: [
    "The Lead Goose of the Henhouse (with straw crown)",
    "The Witch Herself, complete with hat and cat",
    "The Magic Lock on the Henhouse Door",
    "Hen #7 — the one who hates me the most",
    "The Straw in the Northeast Corner of the Henhouse",
    "The Shadow of an Invisible Guard",
    "The Witch's Mustache (the right one, not the left)",
    "A National Geographic Photographer on a visit",
  ],
  fr: [
    "L'Oie Chef du Poulailler (avec couronne de paille)",
    "La Sorcière elle-même, avec chapeau et chat",
    "Le Cadenas Magique de la Porte du Poulailler",
    "La Poule n°7 — celle qui me déteste le plus",
    "La Paille dans le Coin Nord-Est du Poulailler",
    "L'Ombre d'un Gardien Invisible",
    "La Moustache de la Sorcière (la droite, pas la gauche)",
    "Un Photographe de National Geographic en visite",
  ],
  es: [
    "El Ganso Jefe del Gallinero (con corona de paja)",
    "La Bruja misma, con sombrero y gato incluidos",
    "El Candado Mágico de la Puerta del Gallinero",
    "La Gallina #7 — la que más me odia",
    "La Paja en el Rincón Noreste del Gallinero",
    "La Sombra de un Guardián Invisible",
    "El Bigote de la Bruja (el derecho, no el izquierdo)",
    "Un Fotógrafo de National Geographic de visita",
  ],
  de: [
    "Die Anführergans des Hühnerstalls (mit Strohkrone)",
    "Die Hexe höchstpersönlich, mit Hut und Katze",
    "Das Magische Schloss an der Hühnerstalltür",
    "Huhn Nr.7 — das, das mich am meisten hasst",
    "Das Stroh in der Nordostecke des Hühnerstalls",
    "Der Schatten eines unsichtbaren Wächters",
    "Der Schnurrbart der Hexe (der rechte, nicht der linke)",
    "Ein National-Geographic-Fotograf auf Besuch",
  ],
};

const FAKE_EXCUSES = {
  ro: [
    "Gicu a alunecat pe paie și a apăsat butonul greșit cu laba. Accident profesional documentat.",
    "Gicu recunoaște: gâsca nr.4 l-a distras exact în momentul calculului. Martor: toate gâștele.",
    "Gicu a confundat fișierele din creier. Se întâmplă. De vreo 7 ori pe zi. Nu numărăm.",
    "Gicu jură că calculatorul din cap a scos fum. E posibil. Cotețul e supraîncălzit.",
    "Gicu recunoaște: a ghicit asta ca să iasă mai repede. Scuza este oficială și semnată.",
    "Gâsca șefă a râs exact când Gicu calcula. Gicu a intrat în panică. Classic.",
    "Gicu insistă că aceasta E răspunsul corect. Gâștele râd. Gicu recalculează.",
    "Procesorul din creierul lui Gicu a restartat brusc. Gicu dă vina pe curentul din coteț.",
  ],
  en: [
    "Gicu slipped on straw and pressed the wrong button with his paw. Professionally documented accident.",
    "Gicu admits goose #4 distracted him exactly when calculating. Witness: all the geese.",
    "Gicu mixed up the brain files. It happens. About 7 times a day. Not counting.",
    "Gicu swears the calculator in his head blew smoke. Possible. The henhouse is overheated.",
    "Gicu admits: he guessed this to get out faster. The excuse is official and signed.",
    "The lead goose laughed exactly when Gicu was calculating. Gicu panicked. Classic.",
    "Gicu insists this IS the correct answer. The geese laugh. Gicu recalculates.",
    "The processor in Gicu's brain suddenly restarted. Gicu blames the draft in the henhouse.",
  ],
  fr: [
    "Gicu a glissé sur la paille et appuyé sur le mauvais bouton. Accident professionnel documenté.",
    "Gicu admet que l'oie n°4 l'a distrait exactement quand il calculait. Témoin: toutes les oies.",
    "Gicu a mélangé les fichiers dans son cerveau. Ça arrive. Environ 7 fois par jour. Sans compter.",
    "Gicu jure que la calculatrice dans sa tête a fumé. Possible. Le poulailler est surchauffé.",
    "Gicu admet: il a deviné ça pour sortir plus vite. L'excuse est officielle et signée.",
    "L'oie chef a ri exactement quand Gicu calculait. Gicu a paniqué. Classic.",
    "Gicu insiste que c'EST la bonne réponse. Les oies rient. Gicu recalcule.",
    "Le processeur dans le cerveau de Gicu a redémarré. Gicu accuse le courant d'air.",
  ],
  es: [
    "Gicu resbaló sobre la paja y presionó el botón equivocado. Accidente profesional documentado.",
    "Gicu admite que el ganso #4 lo distrajo justo cuando calculaba. Testigo: todos los gansos.",
    "Gicu mezcló los archivos en su cerebro. Pasa. Unas 7 veces al día. Sin contar.",
    "Gicu jura que la calculadora en su cabeza echó humo. Posible. El gallinero está sobrecalentado.",
    "Gicu admite: adivinó esto para salir más rápido. La excusa es oficial y firmada.",
    "El ganso jefe rio exactamente cuando Gicu calculaba. Gicu entró en pánico. Classic.",
    "Gicu insiste en que ESTA es la respuesta correcta. Los gansos ríen. Gicu recalcula.",
    "El procesador en el cerebro de Gicu reinició de repente. Gicu culpa a la corriente.",
  ],
  de: [
    "Gicu ist auf Stroh ausgerutscht und hat mit der Pfote den falschen Knopf gedrückt. Offiziell dokumentiert.",
    "Gicu gibt zu, dass Gans Nr.4 ihn genau beim Berechnen abgelenkt hat. Zeuge: alle Gänse.",
    "Gicu hat die Gehirndateien verwechselt. Passiert. Etwa 7 Mal am Tag. Ohne Zählen.",
    "Gicu schwört, der Rechner in seinem Kopf hat geraucht. Möglich. Der Hühnerstall ist überhitzt.",
    "Gicu gibt zu: Er hat das geraten, um schneller rauszukommen. Die Entschuldigung ist offiziell.",
    "Die Anführergans lachte genau beim Berechnen. Gicu geriet in Panik. Classic.",
    "Gicu besteht darauf, dass dies DIE richtige Antwort ist. Die Gänse lachen. Gicu rechnet neu.",
    "Der Prozessor in Gicus Gehirn startete plötzlich neu. Gicu gibt dem Zugwind die Schuld.",
  ],
};

const FAKE_FACES  = ["🦊😵", "🦊🤪", "🦊🥴", "🦊😤", "🦊🤯", "🦊😱", "🦊🫠"];
const FAKE_TITLES = {
  ro: ["GATA! ȘTIU!", "L-AM GHICIT!", "GICU ȘTIE!", "EUREKA! (APROAPE)", "CALCULUL E COMPLET!"],
  en: ["GOT IT! I KNOW!", "I GUESSED IT!", "GICU KNOWS!", "EUREKA! (ALMOST)", "CALCULATION COMPLETE!"],
  fr: ["ÇA Y EST! JE SAIS!", "J'AI DEVINÉ!", "GICU SAIT!", "EURÊKA! (PRESQUE)", "CALCUL TERMINÉ!"],
  es: ["¡YA SÉ!", "¡LO ADIVINÉ!", "¡GICU SABE!", "¡EUREKA! (CASI)", "¡CÁLCULO COMPLETO!"],
  de: ["ICH WEISS ES!", "ICH HAB'S ERRATEN!", "GICU WEISS ES!", "HEUREKA! (FAST)", "BERECHNUNG KOMPLETT!"],
};

function showFakeGuess() {
  state.fakeGuessShown = true;
  const lang    = state.lang;
  const fakes   = FAKE_CHARS[lang]   || FAKE_CHARS["ro"];
  const excuses = FAKE_EXCUSES[lang] || FAKE_EXCUSES["ro"];
  const titles  = FAKE_TITLES[lang]  || FAKE_TITLES["ro"];

  const char   = fakes[Math.floor(Math.random() * fakes.length)];
  const excuse = excuses[Math.floor(Math.random() * excuses.length)];
  const face   = FAKE_FACES[Math.floor(Math.random() * FAKE_FACES.length)];
  const title  = titles[Math.floor(Math.random() * titles.length)];

  const faceEl   = $("fakeGuessFace");
  const titleEl  = $("fakeGuessTitle");
  const charEl   = $("fakeGuessChar");
  const excuseEl = $("fakeGuessExcuse");
  if (faceEl)   faceEl.textContent   = face;
  if (titleEl)  titleEl.textContent  = title;
  if (charEl)   charEl.textContent   = char;
  if (excuseEl) excuseEl.textContent = excuse;

  const modal = $("modalFakeGuess");
  if (modal) modal.style.display = "flex";
}

// ── Taunts Gicu in ecranul de categorii ───────────────────────
const CATEGORY_TAUNTS = {
  ro: [
    "Gândește-te la ceva. Dacă poți. Eu aștept, n-am încotro. 😒",
    "Alege o categorie. Asta n-o să mă oprească. Probabil. 🤔",
    "Ha! Oricare ai alege, Gicu' știe. Aproape sigur. 🧢",
    "Gicu' este pregătit. Gicu' este calm. Gicu' e lângă o gâscă, dar calm. 📿",
    "Selectează. Eu ghicesc. Tu te minunezi. Ordinea naturală. 🦊",
    "Hmm... ce vei alege? Gicu calculează deja. Cu laba stângă. 🎤",
  ],
  en: [
    "Think of something. If you can. I'll wait, no choice. 😒",
    "Pick a category. Won't stop me. Probably. 🤔",
    "Ha! Whatever you choose, Gicu knows. Almost certainly. 🧢",
    "Gicu is ready. Gicu is calm. Stuck next to a goose, but calm. 📿",
    "Select. I guess. You marvel. The natural order. 🦊",
    "Hmm... what will you choose? Gicu is already calculating. With the left paw. 🎤",
  ],
  fr: [
    "Pense à quelque chose. Si tu peux. J'attends, pas le choix. 😒",
    "Choisis une catégorie. Ça ne m'arrêtera pas. Probablement. 🤔",
    "Ha! Quoi que tu choisisses, Gicu sait. Presque certainement. 🧢",
    "Gicu est prêt. Gicu est calme. Coincé près d'une oie, mais calme. 📿",
    "Sélectionne. Je devine. Tu t'émerveilles. L'ordre naturel. 🦊",
    "Hmm... que vas-tu choisir? Gicu calcule déjà. Avec la patte gauche. 🎤",
  ],
  es: [
    "Piensa en algo. Si puedes. Esperaré, no tengo otra opción. 😒",
    "Elige una categoría. No me detendrá. Probablemente. 🤔",
    "¡Ha! Lo que elijas, Gicu lo sabe. Casi seguro. 🧢",
    "Gicu está listo. Gicu está tranquilo. Junto a un ganso, pero tranquilo. 📿",
    "Selecciona. Adivino. Te maravillas. El orden natural. 🦊",
    "Hmm... ¿qué elegirás? Gicu ya está calculando. Con la pata izquierda. 🎤",
  ],
  de: [
    "Denk an etwas. Wenn du kannst. Ich warte, habe keine Wahl. 😒",
    "Wähle eine Kategorie. Wird mich nicht aufhalten. Wahrscheinlich. 🤔",
    "Ha! Was auch immer du wählst, Gicu weiß es. Fast sicher. 🧢",
    "Gicu ist bereit. Gicu ist ruhig. Neben einer Gans, aber ruhig. 📿",
    "Wähle. Ich rate. Du staunst. Die natürliche Ordnung. 🦊",
    "Hmm... was wirst du wählen? Gicu berechnet schon. Mit der linken Pfote. 🎤",
  ],
};

// ── Navigare ecrane ───────────────────────────────────────────
const SCREENS = [
  "screenIntro", "screenCategory", "screenGame",
  "screenResult", "screenLearn", "screenLeaderboard"
];

function showScreen(id) {
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.classList.toggle("is-active", s === id);
  });
  // Inchide modalele la orice schimbare de ecran
  ["modalHydration","modalFakeGuess"].forEach(m => {
    const el = $(m);
    if (el) el.style.display = "none";
  });
}

// ── Ecran: Selectie Limba (in screenIntro) ────────────────────
function renderLangScreen() {
  const langs = [
    { code:"ro", flag:"https://flagcdn.com/w40/ro.png", name:"Română" },
    { code:"en", flag:"https://flagcdn.com/w40/gb.png", name:"English" },
    { code:"fr", flag:"https://flagcdn.com/w40/fr.png", name:"Français" },
    { code:"es", flag:"https://flagcdn.com/w40/es.png", name:"Español" },
    { code:"de", flag:"https://flagcdn.com/w40/de.png", name:"Deutsch" },
  ];
  const container = $("langCards");
  if (!container) return;
  container.innerHTML = langs.map(l => `
    <button class="lang-card" data-lang="${l.code}" type="button">
      <img src="${l.flag}" class="lang-flag-img" alt="${l.name}" />
      <span class="lang-name">${l.name}</span>
    </button>
  `).join("");

  container.querySelectorAll(".lang-card").forEach(btn => {
    btn.addEventListener("click", () => {
      state.lang = btn.dataset.lang;
      playSound("click");
      applyTranslations();
      renderCategoryScreen();
      showScreen("screenCategory");
    });
  });
}

// ── Ecran: Selectie Categorie ─────────────────────────────────
function renderCategoryScreen() {
  const catOrder = [
    "animals","birds","athletes","professions","artists",
    "cartoons","historical","fruits","vegetables","objects","superheroes",
    "anime","football","celebrities_ro"
  ];
  const container = $("categoryCards");
  if (!container) return;
  container.innerHTML = catOrder.map(slug => `
    <button class="category-card" data-cat="${slug}" type="button">
      <span class="category-icon">${CATEGORY_ICONS[slug]}</span>
      <span class="category-name">${t("categories." + slug)}</span>
    </button>
  `).join("");

  container.querySelectorAll(".category-card").forEach(btn => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.cat;
      playSound("click");
      startGame();
      showScreen("screenGame");
    });
  });

  // Taunt Gicu pe ecranul de categorii
  const tauntEl = $("categoryTaunt");
  if (tauntEl) {
    const pool  = CATEGORY_TAUNTS[state.lang] || CATEGORY_TAUNTS["ro"];
    const taunt = pool[Math.floor(Math.random() * pool.length)];
    tauntEl.textContent = `"${taunt}"`;
  }
}

// ── Start Joc ─────────────────────────────────────────────────
function startGame() {
  state.scores         = initScores(state.category);
  state.asked          = new Set();
  state.questionCount  = 0;
  state.gameActive     = true;
  state.topChar        = null;
  state.hydrationShown = false;
  state.fakeGuessShown = false;
  Object.keys(_usedRemarks).forEach(k => _usedRemarks[k] = []);

  updateEnergyBar(100);
  updateQuestionCounter();
  setMood("thinking");
  showRemark("thinking", 2500);
  startGooseTaunts();
  incrementGlobalCounter();
  nextQuestion();
}

// ── Ciclul de intrebari ───────────────────────────────────────
function nextQuestion() {
  const { id: topId, prob: topProb } = getTopChar();

  if (topProb >= GUESS_THRESHOLD || state.questionCount >= MAX_QUESTIONS) {
    stopGooseTaunts();
    state.topChar = CHARACTERS.find(c => c.id === topId);
    setTimeout(() => doGuess(), 600);
    return;
  }

  const q = pickBestQuestion();
  if (!q) {
    stopGooseTaunts();
    state.topChar = CHARACTERS.find(c => c.id === topId);
    setTimeout(() => doGuess(), 600);
    return;
  }

  state.currentQuestion = q;
  displayQuestion(q);
  setAnswerButtonsEnabled(true);
}

function displayQuestion(q) {
  const elegantText = $("elegantText");
  const label       = $("questionLabel");
  if (elegantText) {
    elegantText.textContent = q[state.lang] || q["en"];
    elegantText.classList.add("fadeIn");
    setTimeout(() => elegantText.classList.remove("fadeIn"), 500);
  }
  if (label) {
    label.textContent = `${t("questionLabel") !== "questionLabel" ? t("questionLabel") : "Întrebarea"} ${state.questionCount + 1} ${t("of") !== "of" ? t("of") : "din"} ${MAX_QUESTIONS}`;
  }
  // Thought bubbles cu delay
  setTimeout(updateThoughtBubbles, 450);
}

function updateQuestionCounter() {
  const label = $("questionLabel");
  if (label) label.textContent = `Întrebarea ${state.questionCount} din ${MAX_QUESTIONS}`;
}

function updateEnergyBar(pct) {
  ["energyFill","energyFill2"].forEach(id => {
    const el = $(id);
    if (el) el.style.width = pct + "%";
  });
  ["energyValue","energyValue2"].forEach(id => {
    const el = $(id);
    if (el) el.textContent = Math.round(pct) + "%";
  });
}

// ── Procesare raspuns ─────────────────────────────────────────
function handleAnswer(type) {
  if (!state.gameActive || !state.currentQuestion) return;
  playSound("click");
  playFunnySound();

  const answerValues = { yes: 1, no: 0, unknown: 0.5, probably: 0.75 };
  const val          = answerValues[type] ?? 0.5;
  const moodMap      = { yes:"happy", no:"sad", unknown:"surprised", probably:"thinking" };

  animateFox(moodMap[type] || "thinking");
  showRemark(type, 4500);

  state.scores = updateScores(state.scores, state.currentQuestion.id, val);
  state.asked.add(state.currentQuestion.id);
  state.questionCount++;

  const energyPct = 100 - (state.questionCount / MAX_QUESTIONS * 100);
  updateEnergyBar(energyPct);
  setAnswerButtonsEnabled(false);

  setTimeout(() => {
    setAnswerButtonsEnabled(true);
    // Dupa intrebarea 10: pauza de hidratare (urmeaza fals ghicit dupa)
    if (state.questionCount === 10 && !state.hydrationShown) {
      showHydrationBreak();
    } else {
      nextQuestion();
    }
  }, 3200);
}

function setAnswerButtonsEnabled(enabled) {
  ["btnYes","btnNo","btnUnknown","btnProbably"].forEach(id => {
    const btn = $(id);
    if (btn) btn.disabled = !enabled;
  });
}

// ── Ghicire ───────────────────────────────────────────────────
async function doGuess() {
  if (!state.topChar) return;
  state.gameActive = false;
  setAnswerButtonsEnabled(false);
  stopGooseTaunts();

  animateFox("laughing");
  showRemark("guess", 2000);

  const charName = state.topChar[state.lang] || state.topChar["en"];
  const elegant  = $("elegantText");
  if (elegant) elegant.textContent = `Mă gândesc că este... ${charName}?`;

  // Reset sectiuni rezultat
  ["resultCorrectBanner","resultWrongSection","resultScoreSection","resultNameSection"].forEach(id => {
    const el = $(id);
    if (el) el.style.display = "none";
  });

  const nameEl  = $("resultCharName");
  const guessEl = $("resultGuessText");
  if (nameEl)  nameEl.textContent  = charName;
  if (guessEl) guessEl.textContent = `Mă gândesc că este... ${charName}?`;

  const imgEl = $("resultCharImg");
  if (imgEl) {
    imgEl.src = "./gicu_placeholder.svg";
    fetchWikiImage(state.topChar.wikipedia).then(url => {
      if (url) imgEl.src = url;
    });
  }

  const fact     = FACTS[state.topChar.id]?.[state.lang] || FACTS[state.topChar.id]?.["en"];
  const factPanel = document.querySelector("#factPanelResult");
  if (factPanel) factPanel.style.display = fact ? "block" : "none";
  const factEl = $("resultFact");
  if (factEl && fact) factEl.textContent = fact;

  const stars   = calcStars(state.questionCount);
  const starsEl = $("resultStars");
  if (starsEl) starsEl.textContent = renderStars(stars);
  const qUsedEl = $("resultQuestionsUsed");
  if (qUsedEl) qUsedEl.textContent = `${state.questionCount} întrebări folosite`;

  showScreen("screenResult");
}

// ── Ecran Rezultat ────────────────────────────────────────────
function handleCorrectGuess() {
  playSound("win");
  animateFox("happy");
  const banner = $("resultCorrectBanner");
  if (banner) banner.style.display = "flex";
  const wrong = $("resultWrongSection");
  if (wrong) wrong.style.display = "none";
  const score = $("resultScoreSection");
  if (score) score.style.display = "block";

  const stars     = calcStars(state.questionCount);
  const savedName = localStorage.getItem("gicu_player_name");
  if (savedName) {
    saveToLeaderboard(savedName, stars, state.questionCount);
  } else {
    const nameSection = $("resultNameSection");
    if (nameSection) nameSection.style.display = "block";
  }
}

function handleWrongGuess() {
  playSound("lose");
  animateFox("sad");
  const banner = $("resultCorrectBanner");
  if (banner) banner.style.display = "none";
  const wrong = $("resultWrongSection");
  if (wrong) wrong.style.display = "block";
  const score = $("resultScoreSection");
  if (score) score.style.display = "none";
}

// ── Ecran Invatare ────────────────────────────────────────────
function goToLearnScreen() {
  const wrongName = state.topChar?.[state.lang] || state.topChar?.["en"] || "?";
  const diffFromEl = $("learnDiffFrom");
  if (diffFromEl) diffFromEl.textContent = wrongName;
  const learnIn = $("learnInput");
  if (learnIn) learnIn.value = "";
  const learnQ = $("learnQuestionInput");
  if (learnQ) learnQ.value = "";
  const thanks = $("learnThanksMsg");
  if (thanks) thanks.style.display = "none";
  showScreen("screenLearn");
}

async function submitLearnData() {
  const newName = $("learnInput")?.value?.trim();
  const diffQ   = $("learnQuestionInput")?.value?.trim();
  if (!newName || !diffQ) {
    alert("Te rugăm completează ambele câmpuri!");
    return;
  }
  await saveToLearningQueue({
    character_name: newName,
    category:       state.category,
    existing_char:  state.topChar?.id,
    diff_question:  diffQ,
    lang:           state.lang,
  });
  animateFox("happy");
  const thanks = $("learnThanksMsg");
  if (thanks) thanks.style.display = "block";
  setTimeout(() => resetToStart(), 3000);
}

// ── Leaderboard ───────────────────────────────────────────────
async function renderLeaderboard() {
  showScreen("screenLeaderboard");
  const list    = $("leaderboardList");
  const loading = $("leaderboardLoading");
  if (list)    list.innerHTML        = "";
  if (loading) loading.style.display = "block";

  const entries = await loadLeaderboard();
  if (loading) loading.style.display = "none";

  if (!entries.length) {
    if (list) list.innerHTML = `<p class="leader-empty">Niciun scor încă. Fii primul!</p>`;
    return;
  }
  if (list) list.innerHTML = entries.map((e, i) => `
    <div class="leader-row">
      <span class="leader-rank">${i + 1}</span>
      <span class="leader-name">${e.name}</span>
      <span class="leader-stars">${renderStars(e.stars)}</span>
      <span class="leader-q">${e.questionsUsed}Q</span>
    </div>
  `).join("");
}

// ── Traduceri dinamice ────────────────────────────────────────
function applyTranslations() {
  // Elemente cu ID direct
  const byId = {
    "btnYes":               "btnYes",
    "btnNo":                "btnNo",
    "btnUnknown":           "btnUnknown",
    "btnProbably":          "btnProbably",
    "btnYesGuess":          "btnYesGuess",
    "btnNoGuess":           "btnNoGuess",
    "btnSaveScore":         "btnSaveScore",
    "btnGoLearn":           "btnGoLearn",
    "btnLearnSave":         "btnLearnSave",
    "btnLeaderboardBack":   "btnBack",
    "btnHydrationContinue": "btnHydrationContinue",
    "btnFakeGuessContinue": "btnFakeGuessContinue",
    "leaderboardLoading":   "leaderboardLoading",
  };
  for (const [id, key] of Object.entries(byId)) {
    const el = $(id);
    if (!el) continue;
    const txt = t(key);
    if (txt && txt !== key) el.textContent = txt;
  }

  // Placeholdere
  const placeholders = {
    "learnInput":        "learnPlaceholder",
    "learnQuestionInput":"learnQuestionPlaceholder",
    "playerNameInput":   "namePlaceholder",
  };
  for (const [id, key] of Object.entries(placeholders)) {
    const el = $(id);
    if (el) el.placeholder = t(key);
  }

  // Elemente fără ID — prin querySelector
  const q = sel => document.querySelector(sel);
  const qAll = sel => document.querySelectorAll(sel);

  const set = (sel, key) => { const el = q(sel); if (el) el.textContent = t(key); };
  const setHTML = (sel, key) => { const el = q(sel); if (el) el.innerHTML = t(key); };

  set("#screenCategory .screen-subtitle",     "selectCategory");
  set(".fox-caption",                          "foxCaption");
  set(".result-ask",                           "wasIRight");
  set("#resultGuessText",                      "guessPrefix");
  set("#resultWrongSection p",                 "wrongResultText");
  set(".learn-title",                          "learnTitle");
  set(".leaderboard-title",                    "leaderboardTitle");
  set("#resultNameSection p",                  "enterName");
  set("#learnThanksMsg p:first-child",         "learnThanks");
  set(".learn-thanks__sub",                    "learnDesc");

  // Banner corect
  const banner = q("#resultCorrectBanner span:last-child");
  if (banner) banner.textContent = t("correctBanner");

  // Fact label
  const factLabel = q(".fact-label");
  if (factLabel) factLabel.textContent = "💡 " + t("didYouKnow");

  // Hydration modal
  const hydTitle = q("#modalHydration .modal-title");
  if (hydTitle) hydTitle.textContent = t("hydrationTitle");
  setHTML("#modalHydration .modal-subtitle", "hydrationSubtitle");

  // Learn screen quote
  const learnQuoteEl = q("#screenLearn > div > p[style]");
  if (learnQuoteEl) learnQuoteEl.textContent = t("learnQuote");

  // Learn labels (primul și al doilea)
  const learnLabels = document.querySelectorAll(".learn-label");
  if (learnLabels[0]) learnLabels[0].textContent = t("learnLabelChar");
  if (learnLabels[1]) learnLabels[1].innerHTML = t("learnLabelQuestion") + ' <strong id="learnDiffFrom">—</strong>:';

  // Energy labels pe ambele ecrane
  qAll(".energy__label span:first-child").forEach(el => {
    el.textContent = t("energy");
  });

  // Butoane repetate (new game, share, leaderboard)
  qAll(".btn-new-game").forEach(b => b.textContent = "🔄 " + t("btnRestart"));
  qAll(".btn-share").forEach(b => b.textContent = "📤 " + t("btnShare"));
  qAll(".btn-leaderboard").forEach(b => b.textContent = "🏆 " + t("btnLeaderboard"));
}

// ── Reset ─────────────────────────────────────────────────────
function resetToStart() {
  stopGooseTaunts();
  state = {
    ...state,
    category: null, scores: {}, asked: new Set(),
    questionCount: 0, gameActive: false,
    currentQuestion: null, topChar: null,
    hydrationShown: false, fakeGuessShown: false,
  };
  updateEnergyBar(100);
  renderLangScreen();
  showScreen("screenIntro");
}

// ── Event Listeners ───────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  state.lang = detectLang();
  applyTranslations();
  renderLangScreen();
  loadGlobalCounter();
  showScreen("screenIntro");

  // Butoane raspuns
  $("btnYes")?.addEventListener("click",      () => handleAnswer("yes"));
  $("btnNo")?.addEventListener("click",       () => handleAnswer("no"));
  $("btnUnknown")?.addEventListener("click",  () => handleAnswer("unknown"));
  $("btnProbably")?.addEventListener("click", () => handleAnswer("probably"));

  // Gicu clickabil (da thought bubbles + remark)
  $("foxCharacter")?.addEventListener("click", () => {
    playSound("click");
    animateFox("laughing");
    showRemark("thinking", 2500);
    updateThoughtBubbles();
  });

  // Ecran rezultat
  $("btnYesGuess")?.addEventListener("click", handleCorrectGuess);
  $("btnNoGuess")?.addEventListener("click",  handleWrongGuess);
  $("btnGoLearn")?.addEventListener("click",  goToLearnScreen);
  $("btnLearnSave")?.addEventListener("click", submitLearnData);

  // Modal Hidratare → dupa continue, arata fals ghicit
  $("btnHydrationContinue")?.addEventListener("click", () => {
    const modal = $("modalHydration");
    if (modal) modal.style.display = "none";
    showFakeGuess();
  });

  // Modal Fals Ghicit → dupa continue, continua jocul
  $("btnFakeGuessContinue")?.addEventListener("click", () => {
    const modal = $("modalFakeGuess");
    if (modal) modal.style.display = "none";
    setAnswerButtonsEnabled(true);
    nextQuestion();
  });

  // Joc nou
  $$(".btn-new-game").forEach(btn => btn.addEventListener("click", () => {
    playSound("click");
    renderCategoryScreen();
    showScreen("screenCategory");
  }));

  // Leaderboard
  $$(".btn-leaderboard").forEach(btn => btn.addEventListener("click", renderLeaderboard));
  $("btnLeaderboardBack")?.addEventListener("click", () => showScreen("screenCategory"));

  // Salvare scor cu nume
  $("btnSaveScore")?.addEventListener("click", () => {
    const name = $("playerNameInput")?.value?.trim();
    if (!name) return;
    localStorage.setItem("gicu_player_name", name);
    const stars = calcStars(state.questionCount);
    saveToLeaderboard(name, stars, state.questionCount);
    const ns = $("resultNameSection");
    if (ns) ns.style.display = "none";
    const ss = $("resultScoreSection");
    if (ss) ss.style.display = "block";
  });

  // Partajare
  $$(".btn-share").forEach(btn => btn.addEventListener("click", () => {
    const charName = state.topChar?.[state.lang] || "?";
    const stars    = calcStars(state.questionCount);
    const text     = `Am jucat Vulpoiul Trăsnit și Gicu a ghicit "${charName}" în ${state.questionCount} întrebări! ${renderStars(stars)} #VulpoiulTrasnit`;
    if (navigator.share) {
      navigator.share({ title:"Vulpoiul Trăsnit", text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      alert("Copiat în clipboard!");
    }
  }));
});
