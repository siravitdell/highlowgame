# 🗺️ Development Phases — Higher or Lower

## Phase 1 — Project Setup
> Goal: working Next.js app connected to PostgreSQL, nothing broken

- [ ] Init Next.js 14 with TypeScript + Tailwind (`npx create-next-app@latest`)
- [ ] Install dependencies: `prisma`, `@prisma/client`, `ably`, `framer-motion`
- [ ] Set up `.env` with `DATABASE_URL`, `ABLY_API_KEY`, `TMDB_API_KEY`
- [ ] Create Prisma schema — models: `Category`, `Item`, `Score`, `Lobby`, `Player`
- [ ] Run first migration: `npx prisma migrate dev --name init`
- [ ] Create `lib/prisma.ts` singleton
- [ ] Verify: `npx prisma studio` opens and shows empty tables

---

## Phase 2 — Seed Data
> Goal: database populated with real items for all categories

- [ ] `lib/worldbank.ts` — fetch countries population + GDP from World Bank API
- [ ] `lib/restcountries.ts` — fetch countries area from REST Countries API
- [ ] `lib/tmdb.ts` — fetch top 100 movies (box office + budget) from TMDB API
- [ ] `prisma/data/mountains.json` — static list of top 50 mountains with height
- [ ] `prisma/data/planets.json` — static list of planets with diameter + distance
- [ ] `prisma/data/cities.json` — static list of top 100 cities with population + elevation
- [ ] `prisma/seed.ts` — seed all categories and items into DB
- [ ] Run `npx ts-node prisma/seed.ts` and verify item counts in Prisma Studio

---

## Phase 3 — API Routes
> Goal: all endpoints working, testable via browser or Postman

- [ ] `GET /api/items?categoryId=countries-population&limit=2` — returns 2 random items
- [ ] `POST /api/lobby` — create lobby `{ username, categoryId }` → `{ roomCode, playerId }`
- [ ] `GET /api/lobby/[roomCode]` — get lobby state (players, status, category)
- [ ] `POST /api/lobby/[roomCode]` — join lobby `{ username }` → `{ playerId }` (max 8 players)
- [ ] `POST /api/scores` — save score `{ playerName, score, categoryId }`
- [ ] `GET /api/scores?categoryId=countries-population&limit=10` — leaderboard
- [ ] `GET /api/ably/token` — return Ably token request for client auth
- [ ] Verify: all routes return correct shape, errors handled with proper HTTP codes

---

## Phase 4 — Lobby UI
> Goal: players can create a room, share invite link, and see each other join in real time

- [ ] Home page (`/`) — username input + "Create Lobby" button + "Join with code" input
- [ ] Create lobby → redirect to `/lobby/[roomCode]`
- [ ] Lobby page — show invite link with copy button
- [ ] Category picker (host only) — group → metric selection, updates live
- [ ] Player list — shows avatars, usernames, host badge, ready status
- [ ] Connect Ably — subscribe to `room:[roomCode]` channel
- [ ] Broadcast `player-joined` when new player arrives → update player list in real time
- [ ] Broadcast `category-selected` when host picks category → all players see update
- [ ] "Start Game" button (host only) → broadcast `game-start` → all navigate to `/game/[roomCode]`
- [ ] Save `{ username, playerId, roomCode }` to `localStorage`

---

## Phase 5 — Core Game
> Goal: all players play the same questions simultaneously, scores update live

- [ ] Game page (`/game/[roomCode]`) — fetch category + first 2 items on load
- [ ] Two-card layout — left card shows full value, right card blurred
- [ ] Higher / Lower buttons
- [ ] On answer: reveal right card value, show ✅ or ❌ overlay
- [ ] Score logic: correct = +1, wrong = +0, always continue
- [ ] After answer: broadcast `score-update { playerId, username, score }` via Ably
- [ ] Scoreboard strip at top — updates live from `score-update` events
- [ ] 15-second countdown timer per round (shrinking bar)
- [ ] Auto-submit wrong answer if timer runs out
- [ ] After 10 rounds: all players broadcast `game-end` → navigate to `/results/[roomCode]`

---

## Phase 6 — Tiebreaker
> Goal: tied players get bonus questions until one winner emerges

- [ ] After round 10, server compares scores and detects tied top players
- [ ] If tie: broadcast `tiebreaker-start { tiedPlayerIds, question }` via Ably
- [ ] Non-tied players see "Waiting for tiebreaker…" screen
- [ ] Tied players see gold-themed bonus round UI
- [ ] Tiebreaker question drawn from same item pool, never repeated from main game
- [ ] After tiebreaker answer: broadcast `tiebreaker-result`
  - If winner found: `{ winnerId, username }` → proceed to results
  - If still tied: `{ stillTied: true }` → repeat with new question
- [ ] Repeat until winner found

---

## Phase 7 — Results Page
> Goal: clear winner display with podium and full leaderboard

- [ ] Results page (`/results/[roomCode]`) — fetch final scores from DB
- [ ] Podium display for top 3 (gold / silver / bronze)
- [ ] Full ranked list — all players, scores, tiebreaker winner marked with ⚡
- [ ] "Play Again" button → host creates new lobby with same players
- [ ] Global leaderboard section — top 10 scores per category all-time

---

## Phase 8 — Polish & Deploy
> Goal: production-ready, deployed, shareable on GitHub

- [ ] Mobile responsive UI (all screens work on phone)
- [ ] Loading states and skeleton screens
- [ ] Error handling — room not found, room full, connection lost
- [ ] Framer Motion animations — card reveal, correct/wrong flash, score bump
- [ ] Add `README.md` with screenshots and setup instructions
- [ ] Deploy to **Vercel** (Next.js hosting)
- [ ] Set up **Neon** PostgreSQL (free serverless tier)
- [ ] Add all env vars to Vercel dashboard
- [ ] Final test: full game flow end-to-end with 2+ real players

---

## Summary

| Phase | Focus | Est. Complexity |
|-------|-------|----------------|
| 1 | Project setup | Low |
| 2 | Seed data | Medium |
| 3 | API routes | Medium |
| 4 | Lobby UI + Ably | High |
| 5 | Core game | High |
| 6 | Tiebreaker | Medium |
| 7 | Results page | Low |
| 8 | Polish + deploy | Medium |