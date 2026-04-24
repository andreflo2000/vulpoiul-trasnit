/* ============================================================
   VULPOIUL TRASNIT — script.js
   Motor Bayesian + Firebase + i18n + Wikipedia + Scoring
   ============================================================ */

"use strict";

// ── Firebase SDK (module compat via CDN) ──────────────────────
import { initializeApp }                    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit }
                                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);   // din config.js
const db  = getFirestore(app);

// ── Constante ─────────────────────────────────────────────────
const MAX_QUESTIONS   = 20;
const GUESS_THRESHOLD = 0.75;   // ghicim la 75% probabilitate
const LEADERBOARD_TOP = 10;

// ── Starea jocului ────────────────────────────────────────────
let state = {
  lang:             "ro",
  category:         null,
  scores:           {},         // { charId: probabilitate }
  asked:            new Set(),  // question_group_id-urile deja puse
  questionCount:    0,
  gameActive:       false,
  currentQuestion:  null,
  topChar:          null,       // personajul ghicit
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

// ── Sunet ─────────────────────────────────────────────────────
function playSound(name) {
  const map = { click:"sounds/click.mp3.mp3", win:"sounds/win.mp3.mp3", lose:"sounds/lose.mp3.mp3" };
  const src = map[name];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.4;
  audio.play().catch(() => {});
}

// ── Animatii Gicu ─────────────────────────────────────────────
const foxFace = () => $("foxFace");
const MOODS = { thinking:"🦊", happy:"😄", sad:"😢", surprised:"😮", laughing:"😂", angry:"😤" };

function setMood(mood) {
  const el = foxFace();
  if (!el) return;
  el.textContent = MOODS[mood] || "🦊";
  el.className = "fox-face " + mood;
}

function animateFox(mood = "thinking") {
  setMood(mood);
  const el = $("foxCharacter");
  if (!el) return;
  el.classList.add("bounce");
  setTimeout(() => el.classList.remove("bounce"), 400);
}

// ── Remarci Gicu ──────────────────────────────────────────────
const _usedRemarks = { yes:[], no:[], unknown:[], probably:[], thinking:[], guess:[] };

function getRemarkFor(type) {
  const pool = REMARKS[state.lang]?.[type] || REMARKS["ro"][type] || [];
  if (!pool.length) return "";
  let available = pool.filter((_, i) => !_usedRemarks[type].includes(i));
  if (!available.length) { _usedRemarks[type] = []; available = pool.map((_, i) => i); }
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
  const init  = 1 / n;
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
  // userAnswer: 1=DA, 0=NU, 0.5=NU STIU, 0.75=PROBABIL
  const newScores = {};
  for (const [charId, prob] of Object.entries(scores)) {
    const char = CHARACTERS.find(c => c.id === charId);
    const attr = char?.attributes?.[questionId] ?? 0.5;
    // Likelihood: cât de probabil că userul răspunde 'userAnswer' dacă personajul e charId
    const diff = Math.abs(attr - userAnswer);
    const likelihood = 1 - diff * 0.9 + 0.05;   // între 0.05 și 1
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
    if (w > 0) {
      const normalized = vals.map(p => p / w);
      weightedH += w * entropy(normalized);
    }
  }
  return H - weightedH;
}

function pickBestQuestion() {
  const catQuestions = QUESTIONS.filter(q =>
    (q.category === "all" || q.category === state.category) &&
    !state.asked.has(q.id)
  );
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

// ── Firebase: Leaderboard ─────────────────────────────────────
async function saveToLeaderboard(playerName, stars, questionsUsed) {
  try {
    await addDoc(collection(db, "leaderboard"), {
      name: playerName,
      stars,
      questionsUsed,
      category: state.category,
      lang: state.lang,
      timestamp: Date.now()
    });
  } catch(e) { console.warn("Leaderboard save error:", e); }
}

async function loadLeaderboard() {
  try {
    const q    = query(collection(db, "leaderboard"), orderBy("stars","desc"), orderBy("questionsUsed","asc"), limit(LEADERBOARD_TOP));
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

// ── Navigare ecrane ───────────────────────────────────────────
const SCREENS = ["screenLang","screenCategory","screenGame","screenResult","screenLearn","screenLeaderboard"];

function showScreen(id) {
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.classList.toggle("is-active", s === id);
  });
}

// ── Ecran: Selectie Limba ─────────────────────────────────────
function renderLangScreen() {
  const langs = [
    { code:"ro", flag:"🇷🇴", name:"Română" },
    { code:"en", flag:"🇬🇧", name:"English" },
    { code:"fr", flag:"🇫🇷", name:"Français" },
    { code:"es", flag:"🇪🇸", name:"Español" },
    { code:"de", flag:"🇩🇪", name:"Deutsch" },
  ];
  const container = $("langCards");
  if (!container) return;
  container.innerHTML = langs.map(l => `
    <button class="lang-card" data-lang="${l.code}" type="button">
      <span class="lang-flag">${l.flag}</span>
      <span class="lang-name">${l.name}</span>
    </button>
  `).join("");

  container.querySelectorAll(".lang-card").forEach(btn => {
    btn.addEventListener("click", () => {
      state.lang = btn.dataset.lang;
      playSound("click");
      animateFox("happy");
      applyTranslations();
      renderCategoryScreen();
      showScreen("screenCategory");
    });
  });
}

// ── Ecran: Selectie Categorie ─────────────────────────────────
function renderCategoryScreen() {
  const catOrder = ["animals","birds","athletes","professions","artists","cartoons","historical","fruits","vegetables","objects","superheroes"];
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
}

// ── Start Joc ─────────────────────────────────────────────────
function startGame() {
  state.scores        = initScores(state.category);
  state.asked         = new Set();
  state.questionCount = 0;
  state.gameActive    = true;
  state.topChar       = null;
  Object.keys(_usedRemarks).forEach(k => _usedRemarks[k] = []);

  updateEnergyBar(100);
  updateQuestionCounter();
  setMood("thinking");
  showRemark("thinking", 2500);
  nextQuestion();
}

// ── Ciclul de intrebari ───────────────────────────────────────
function nextQuestion() {
  const { id: topId, prob: topProb } = getTopChar();

  // Ghicim daca suntem siguri sau am epuizat intrebarile
  if (topProb >= GUESS_THRESHOLD || state.questionCount >= MAX_QUESTIONS) {
    state.topChar = CHARACTERS.find(c => c.id === topId);
    setTimeout(() => doGuess(), 600);
    return;
  }

  const q = pickBestQuestion();
  if (!q) {
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
  if (label) label.textContent = `${t("questionLabel")} ${state.questionCount + 1} ${t("of")} ${MAX_QUESTIONS}`;
}

function updateQuestionCounter() {
  const label = $("questionLabel");
  if (label) label.textContent = `${t("questionLabel")} ${state.questionCount} ${t("of")} ${MAX_QUESTIONS}`;
}

function updateEnergyBar(pct) {
  const fill  = $("energyFill");
  const value = $("energyValue");
  if (fill)  fill.style.width  = pct + "%";
  if (value) value.textContent = Math.round(pct) + "%";
}

// ── Procesare raspuns ─────────────────────────────────────────
function handleAnswer(type) {
  if (!state.gameActive || !state.currentQuestion) return;
  playSound("click");

  const answerValues = { yes: 1, no: 0, unknown: 0.5, probably: 0.75 };
  const val = answerValues[type] ?? 0.5;

  const moodMap = { yes:"happy", no:"sad", unknown:"surprised", probably:"thinking" };
  animateFox(moodMap[type] || "thinking");
  showRemark(type, 3000);

  state.scores = updateScores(state.scores, state.currentQuestion.id, val);
  state.asked.add(state.currentQuestion.id);
  state.questionCount++;

  const energyPct = 100 - (state.questionCount / MAX_QUESTIONS * 100);
  updateEnergyBar(energyPct);

  setAnswerButtonsEnabled(false);
  setTimeout(() => {
    setAnswerButtonsEnabled(true);
    nextQuestion();
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

  animateFox("laughing");
  showRemark("guess", 2000);

  const charName = state.topChar[state.lang] || state.topChar["en"];
  const elegant  = $("elegantText");
  if (elegant) elegant.textContent = `${t("guessPrefix")} ${charName}?`;

  // Pregatim ecranul de rezultat
  $("resultCharName").textContent  = charName;
  $("resultGuessText").textContent = `${t("guessPrefix")} ${charName}?`;

  // Imagine Wikipedia
  const imgEl = $("resultCharImg");
  if (imgEl) {
    imgEl.src = "./gicu_placeholder.svg";
    fetchWikiImage(state.topChar.wikipedia).then(url => {
      if (url) { imgEl.src = url; imgEl.style.display = "block"; }
    });
  }

  // Fapte educative
  const fact = FACTS[state.topChar.id]?.[state.lang] || FACTS[state.topChar.id]?.["en"];
  const factEl = $("resultFact");
  if (factEl) {
    factEl.textContent = fact || "";
    factEl.closest(".fact-panel").style.display = fact ? "block" : "none";
  }

  // Stele
  const stars    = calcStars(state.questionCount);
  const starsEl  = $("resultStars");
  if (starsEl) starsEl.textContent = renderStars(stars);

  const qUsedEl = $("resultQuestionsUsed");
  if (qUsedEl) qUsedEl.textContent = `${state.questionCount} ${t("questionsUsed")}`;

  showScreen("screenResult");
}

// ── Ecran Rezultat: butoane ───────────────────────────────────
function handleCorrectGuess() {
  playSound("win");
  animateFox("happy");
  $("resultCorrectBanner").style.display = "block";
  $("resultWrongSection").style.display  = "none";
  $("resultScoreSection").style.display  = "block";

  // Salveaza scorul
  const stars = calcStars(state.questionCount);
  const savedName = localStorage.getItem("gicu_player_name");
  if (savedName) {
    saveToLeaderboard(savedName, stars, state.questionCount);
  } else {
    $("resultNameSection").style.display = "block";
  }
}

function handleWrongGuess() {
  playSound("lose");
  animateFox("sad");
  $("resultCorrectBanner").style.display = "none";
  $("resultWrongSection").style.display  = "block";
  $("resultScoreSection").style.display  = "none";
}

// ── Ecran Invatare ────────────────────────────────────────────
function goToLearnScreen() {
  const wrongName = state.topChar?.[state.lang] || state.topChar?.["en"] || "?";
  $("learnDiffFrom").textContent = wrongName;
  $("learnInput").value          = "";
  $("learnQuestionInput").value  = "";
  showScreen("screenLearn");
}

async function submitLearnData() {
  const newName   = $("learnInput").value.trim();
  const diffQ     = $("learnQuestionInput").value.trim();
  if (!newName || !diffQ) {
    alert("Te rugăm completează ambele câmpuri!");
    return;
  }

  await saveToLearningQueue({
    character_name:   newName,
    category:         state.category,
    existing_char:    state.topChar?.id,
    diff_question:    diffQ,
    lang:             state.lang,
  });

  animateFox("happy");
  showRemark("thinking", 2000);
  $("learnThanksMsg").style.display = "block";
  setTimeout(() => resetToStart(), 3000);
}

// ── Leaderboard ───────────────────────────────────────────────
async function renderLeaderboard() {
  showScreen("screenLeaderboard");
  const list    = $("leaderboardList");
  const loading = $("leaderboardLoading");
  if (list)    list.innerHTML    = "";
  if (loading) loading.style.display = "block";

  const entries = await loadLeaderboard();
  if (loading) loading.style.display = "none";

  if (!entries.length) {
    if (list) list.innerHTML = `<p class="leader-empty">${t("leaderboardEmpty")}</p>`;
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
  const map = {
    "topbarTitle":        "title",
    "btnYes":             "btnYes",
    "btnNo":              "btnNo",
    "btnUnknown":         "btnUnknown",
    "btnProbably":        "btnProbably",
    "energyLabel":        "energy",
    "categoryTitle":      "selectCategory",
    "langTitle":          "selectLang",
    "resultWasRight":     "wasIRight",
    "btnYesGuess":        "btnYesGuess",
    "btnNoGuess":         "btnNoGuess",
    "leaderboardTitle":   "leaderboardTitle",
    "btnLeaderboard":     "btnLeaderboard",
    "factLabel":          "didYouKnow",
  };
  for (const [id, key] of Object.entries(map)) {
    const el = $(id);
    if (el) el.textContent = t(key);
  }
}

// ── Reset ─────────────────────────────────────────────────────
function resetToStart() {
  state = { ...state, category: null, scores: {}, asked: new Set(), questionCount: 0, gameActive: false, currentQuestion: null, topChar: null };
  updateEnergyBar(100);
  renderLangScreen();
  showScreen("screenLang");
}

// ── Event Listeners ───────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  state.lang = detectLang();
  applyTranslations();
  renderLangScreen();
  showScreen("screenLang");

  // Butoane raspuns
  $("btnYes")?.addEventListener("click",     () => handleAnswer("yes"));
  $("btnNo")?.addEventListener("click",      () => handleAnswer("no"));
  $("btnUnknown")?.addEventListener("click", () => handleAnswer("unknown"));
  $("btnProbably")?.addEventListener("click",() => handleAnswer("probably"));

  // Gicu clickabil
  $("foxCharacter")?.addEventListener("click", () => {
    playSound("click");
    animateFox("laughing");
    showRemark("thinking", 2500);
  });

  // Ecran rezultat — DA ghicit
  $("btnYesGuess")?.addEventListener("click", handleCorrectGuess);

  // Ecran rezultat — NU ghicit
  $("btnNoGuess")?.addEventListener("click", handleWrongGuess);

  // Buton du-ma la invatare
  $("btnGoLearn")?.addEventListener("click", goToLearnScreen);

  // Submit invatare
  $("btnLearnSave")?.addEventListener("click", submitLearnData);

  // Joc nou
  $$(".btn-new-game").forEach(btn => btn.addEventListener("click", () => {
    playSound("click");
    renderCategoryScreen();
    showScreen("screenCategory");
  }));

  // Leaderboard
  $$(".btn-leaderboard").forEach(btn => btn.addEventListener("click", renderLeaderboard));

  // Inapoi din leaderboard
  $("btnLeaderboardBack")?.addEventListener("click", () => showScreen("screenCategory"));

  // Salvare scor cu nume
  $("btnSaveScore")?.addEventListener("click", () => {
    const name = $("playerNameInput")?.value?.trim();
    if (!name) return;
    localStorage.setItem("gicu_player_name", name);
    const stars = calcStars(state.questionCount);
    saveToLeaderboard(name, stars, state.questionCount);
    $("resultNameSection").style.display = "none";
    $("resultScoreSection").style.display = "block";
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
