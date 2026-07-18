# Higher or Lower

A multiplayer web guessing game — compare countries, cities, mountains, planets, and movies by a metric (population, area, GDP, height, etc.) and guess whether the next item is higher or lower.

## Stack

- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS v3
- PostgreSQL + Prisma v5
- Ably (realtime lobby/game sync)
- Framer Motion

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, ABLY_API_KEY, TMDB_API_KEY
npx prisma migrate dev --name init
npm run seed            # seeds mountains, planets, cities, countries, movies
npm run dev
```

Open http://localhost:3000.

## Scripts

```bash
npm run dev         # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run seed         # seed the database
npx prisma studio    # DB browser
```

## Project status

See [PHASES.md](./phases.md) for the full roadmap and checklist. Currently complete through **Phase 4 (Lobby UI)**:

- Project scaffolding, Prisma schema, and DB singleton
- Seed data for countries (World Bank / REST Countries), cities, mountains, planets, and movies (TMDB)
- API routes: items, scores, seed, lobby (create/join/select-category/start), categories, Ably token auth
- Home page (create/join lobby), lobby page with live player list, category picker, and invite link via Ably realtime

Phases 5–8 (core game loop, tiebreaker, results, polish/deploy) have an initial pass in `app/game` and still need testing against a real Postgres + Ably setup.
