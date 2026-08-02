# Higher or Lower

A realtime multiplayer web guessing game — compare countries, cities, mountains, planets, and movies by a metric (population, area, GDP, height, box office, etc.) and guess whether the next item is higher or lower. Play in a shared room with friends; scores sync live, and ties are broken with a sudden-death bonus round.

## Features

- **Lobbies** — create a room, share an invite link, players join in real time
- **10 categories** across Countries, Cities, Mountains, Planets, and Movies
- **Live multiplayer** — player list, category selection, scores, and round state all sync instantly via Ably
- **Tiebreaker** — tied players get a sudden-death bonus round; ties repeat until someone pulls ahead
- **Results** — podium, full standings, and an all-time leaderboard per category
- **Play Again** — host can start a new lobby with one click; everyone else auto-follows

## Stack

- Next.js 14 (App Router) + TypeScript (strict mode)
- Tailwind CSS v3
- PostgreSQL + Prisma v5
- Ably (realtime pub/sub — lobby and game state sync)
- Framer Motion (card reveal, correct/wrong flash, score bump)

## Getting started

### 1. Prerequisites

- Node.js 18+
- A PostgreSQL database — either local (native install or Docker) or a free hosted instance like [Neon](https://neon.tech)
- A free [Ably](https://ably.com) account (for realtime sync)
- A free [REST Countries](https://restcountries.com) API key (for the Countries → Area category)
- Optional: a free [TMDB](https://www.themoviedb.org/documentation/api) API key (for the Movies category — every other category works without it)

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/higherorlower
NEXT_PUBLIC_APP_URL=http://localhost:3000
ABLY_API_KEY=your-ably-api-key
TMDB_API_KEY=your-tmdb-api-key
REST_COUNTRIES_API_KEY=your-restcountries-api-key
```

### 3. Set up the database

```bash
npx prisma migrate dev --name init
npx prisma generate
npm run seed
```

The seed script populates Mountains, Planets, Cities, and Countries (Population/GDP/Area). Movies are skipped automatically if `TMDB_API_KEY` isn't set.

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000. Open a second browser tab (or an incognito window) to test the multiplayer flow — create a lobby in one tab, join with the invite link in the other.

## Scripts

```bash
npm run dev            # dev server (localhost:3000)
npm run build           # production build
npm run typecheck       # tsc --noEmit
npm run seed            # seed the database
npx prisma studio       # DB browser
npx prisma migrate dev  # run a new migration after schema changes
```

## Project structure

See [CLAUDE.md](./CLAUDE.md) for the full architecture reference (routes, DB schema, Ably event contract, conventions). See [phases.md](./phases.md) for the development roadmap.

## Deploying

1. **Database** — create a free [Neon](https://neon.tech) Postgres project, copy its connection string.
2. **Realtime** — create an [Ably](https://ably.com) app, grab an API key with `publish, subscribe, presence` capabilities.
3. **Push to GitHub** if you haven't already.
4. **Vercel** — import the repo at [vercel.com/new](https://vercel.com/new), add the environment variables from `.env.example` (using your Neon/Ably/REST Countries/TMDB values) in the Vercel project settings, then deploy.
5. After the first deploy, run migrations against the production database: `DATABASE_URL=<neon-url> npx prisma migrate deploy`, then seed it: `DATABASE_URL=<neon-url> npm run seed`.
6. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL so invite links resolve correctly.

## Project status

All 8 phases from [phases.md](./phases.md) are implemented and tested against a real Postgres + Ably setup: project scaffolding, seed data, API routes, lobby UI, core game loop, tiebreaker, results page, and polish (responsive UI, loading states, connection-loss handling, animations). Deployment (Vercel + Neon) is documented above but not yet performed — that step needs your own hosting accounts.
