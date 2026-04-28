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

## Fișiere CREATE ✅ (toate gata)
- `config.js` — credențiale Firebase
- `data/translations.js` — texte UI în RO/EN/FR/ES/DE + CATEGORY_ICONS
- `data/remarks.js` — 8+ remarci Gicu per tip răspuns în 5 limbi
- `data/questions.js` — 60+ întrebări în 5 limbi pentru toate categoriile
- `data/characters.js` — 120+ personaje cu atribute pentru algoritmul Bayesian
- `data/facts.js` — fapte educative "Știai că...?" per personaj în 5 limbi
- `script.js` — rescris complet cu toate features noi
- `index.html` — actualizat cu intro vrăjitoare, rapper Gicu, modals
- `style.css` — extins cu toate stilurile noi
- `manifest.json` — PWA manifest
- `sw.js` — Service Worker offline
- `firestore-rules.txt` — reguli de copiat în Firebase Console

## Features Implementate ✅
1. Intro vrăjitoare cu pădure animată + poveste Gicu
2. Contor global Firebase: 0 → 1.000.000 jocuri
3. Rapper Gicu (🧢🦊📿) pe toate ecranele
4. 3 thought bubbles hip-hop animate la fiecare întrebare
5. Gâște care îl iau la mișto (mesaje random la 14s interval)
6. Pauza de hidratare după Q10 (3 fapte amuzante)
7. Fals ghicit după hidratare (modal cu față distorsionată)
8. Remarci non-repetitive (pool 8+ per tip răspuns)
9. Sunete amuzante Web Audio API (30% șansă per răspuns)
10. Taunt Gicu pe ecranul de categorii

## IMPORTANT: Pași rămași de făcut MANUAL
### 1. Firestore Rules (CRITIC — fără asta Firebase nu funcționează)
- Firebase Console → Firestore Database → Rules → Edit rules → Paste → Publish
- Conținutul de copiat se află în fișierul `firestore-rules.txt`

### 2. GitHub Desktop → Upload fișiere
- Deschide GitHub Desktop
- Vezi fișierele modificate (index.html, script.js, style.css, CLAUDE.md, firestore-rules.txt)
- Commit → Push → Vercel deployează automat

## Fișiere EXISTENTE (păstrate)
- `gicu_zambet.png`, `logo_gicu.png.png`, `gicu_placeholder.svg`
- `sounds/click.mp3.mp3`, `sounds/win.mp3.mp3`, `sounds/lose.mp3.mp3`

## Categorii (11)
animals, birds, athletes, professions, artists, cartoons, historical, fruits, vegetables, objects, superheroes

## Algoritm
Bayesian Inference + Information Gain | Max 20 întrebări | Prag ghicire: 75%

## Flux joc
Intro (limbă) → Categorie → Joc (max 20 Q) → [Q10: Hidratare → Fals Ghicit] → Rezultat → Learn/Leaderboard
