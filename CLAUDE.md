# Vulpoiul Trăsnit — Status Proiect

## Ce este acest proiect
Joc tip Akinator cu personajul Gicu (vulpoi inteligent, arogant, stângaci, prins la furat găini).
Target: 14+ ani | 5 limbi | 11 categorii | Google Play via PWA+TWA | Monetizare AdMob+Premium

## Stack
- Frontend: Vanilla JS + HTML5 + CSS3 (fără framework)
- Database: Firebase Firestore (proiect: vulpoiul-trasnit-3133c)
- Hosting: Vercel + GitHub
- Imagini personaje: Wikipedia REST API (gratuit, fără cheie)
- Google Play: TWA via Bubblewrap CLI

## Fișiere CREATE ✅
- `config.js` — credențiale Firebase
- `data/translations.js` — texte UI în RO/EN/FR/ES/DE
- `data/remarks.js` — 8+ remarci Gicu per tip răspuns (DA/NU/NU ȘTIU/PROBABIL) în 5 limbi
- `data/questions.js` — 60+ întrebări în 5 limbi pentru toate categoriile
- `data/characters.js` — 120+ personaje cu atribute pentru algoritmul Bayesian

## Fișiere DE CREAT ⏳
- `data/facts.js` — fapte educative "Știai că...?" per personaj
- `script.js` — rescris complet: Bayesian engine + Firebase + i18n + Wikipedia API + scoring
- `index.html` — actualizat cu ecranele: limbă, categorii, joc, rezultat, învățare, leaderboard
- `style.css` — extins cu stiluri noi pentru ecranele adăugate
- `manifest.json` — PWA manifest pentru Google Play
- `sw.js` — Service Worker pentru funcționare offline

## Fișiere EXISTENTE (păstrate)
- `gicu_zambet.png` — imaginea vulpoiului Gicu
- `logo_gicu.png.png` — logo (extensie dublă, tratată în cod)
- `gicu_placeholder.svg` — SVG ilustrat Gicu cu ochelari
- `sounds/click.mp3.mp3` — sunet click
- `sounds/win.mp3.mp3` — sunet victorie
- `sounds/lose.mp3.mp3` — sunet înfrângere

## Categorii (11)
animals, birds, athletes, professions, artists, cartoons, historical, fruits, vegetables, objects, superheroes

## Algoritm
Bayesian Inference + Information Gain | Max 20 întrebări | Prag ghicire: 75%

## Flux joc
Lang select → Category select → Game (max 20 Q) → Result (corect/greșit) → Learn/Leaderboard
