# Higher or Lower — Claude Code Instructions

## Project Overview
A web-based Higher or Lower guessing game. Players compare two items (countries, cities, mountains, planets) by a metric (population, area, GDP, height) and guess which is higher. Built with Next.js, TypeScript, Tailwind CSS, and PostgreSQL via Prisma.

## Planning
See @PHASES.md for the full development roadmap. Always check the current phase and its checklist before starting any work. Complete all checklist items in a phase before moving to the next.


- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v3
- **Database:** PostgreSQL
- **ORM:** Prisma v5
- **Package manager:** npm
- **Animation:** Framer Motion
- **Realtime:** Ably WebSockets (`ably` npm package)

## Project Structure
```
app/                  # Next.js App Router pages & API routes
  page.tsx            # Home / start screen (create lobby or join via link)
  lobby/
    [roomCode]/
      page.tsx        # Lobby waiting room — shows players, host starts game
  game/
    [roomCode]/
      page.tsx        # Main game screen (synced per room)
  results/
    [roomCode]/
      page.tsx        # End screen — room leaderboard
  api/
    items/route.ts    # GET random items by category
    scores/route.ts   # GET leaderboard / POST score
    seed/route.ts     # POST seed DB from external APIs
    lobby/
      route.ts        # POST create lobby → returns roomCode
    lobby/
      [roomCode]/
        route.ts      # GET lobby state / POST join lobby
    ably/
      token/route.ts  # GET Ably auth token (server-side)
components/           # Reusable UI components
lib/
  prisma.ts           # Prisma client singleton
  worldbank.ts        # World Bank API fetcher
  ably.ts             # Ably client singleton
  roomCode.ts         # Generate short random room codes
prisma/
  schema.prisma       # DB schema
  seed.ts             # Seed script
types/index.ts        # Shared TypeScript types
```

## Development Commands
```bash
npm install           # Install dependencies
npm run dev           # Start dev server (localhost:3000)
npm run build         # Production build
npm run typecheck     # npx tsc --noEmit
npx prisma migrate dev --name <name>   # Run migrations
npx prisma generate   # Regenerate Prisma client
npx prisma studio     # Open DB GUI
npx ts-node prisma/seed.ts             # Seed database
```

## Verification After Changes
Always run in this order:
1. `npm run typecheck`
2. `npm run build`
3. Test the affected route in browser

## Environment Variables
```env
DATABASE_URL=postgresql://user:password@host:5432/higherorlower
NEXT_PUBLIC_APP_URL=http://localhost:3000
ABLY_API_KEY=your-ably-api-key
NEXT_PUBLIC_ABLY_API_KEY=your-ably-api-key   # only if using client-side key (prefer server token auth)
TMDB_API_KEY=your-tmdb-api-key
```

## Database Schema (Prisma)
Five models: `Category`, `Item`, `Score`, `Lobby`, `Player`.
- `Item`: id, name, value (Float), metric, unit, imageUrl, categoryId
- `Score`: id, playerName, score (Int), categoryId, createdAt
- `Lobby`: id, roomCode (unique, 6-char), hostId, status (waiting/playing/finished), categoryId, createdAt
- `Player`: id, username, lobbyId, score (Int), isHost (Boolean), isReady (Boolean), createdAt
- Always use `cuid()` for IDs
- `roomCode` is always 6 uppercase alphanumeric chars (e.g. "AB12CD")

## API Routes
- `GET /api/items?category=countries&limit=2` — returns 2 random items
- `POST /api/scores` — save score `{ playerName, score, categoryId }`
- `GET /api/scores?category=countries&limit=10` — leaderboard
- `POST /api/seed?category=countries` — seed from World Bank API
- `POST /api/lobby` — create lobby `{ username, categoryId }` → returns `{ roomCode, playerId }`
- `GET /api/lobby/[roomCode]` — get lobby state (players, status, category)
- `POST /api/lobby/[roomCode]` — join lobby `{ username }` → returns `{ playerId }`
- `PATCH /api/lobby/[roomCode]` — `{ action }` where action is `select-category`, `start-game`, `player-finished`, or `finish-game`
- `DELETE /api/lobby/[roomCode]` — host-only `{ playerId }`; deletes the lobby (cascades players) and broadcasts `lobby-deleted`
- `GET /api/ably/token` — returns Ably token request for client auth

## External Data Sources
- **World Bank API:** `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=300`
- **REST Countries:** `https://restcountries.com/v3.1/all`
- **GeoNames:** static JSON download from geonames.org (cities500.txt)
- **TMDB API:** `https://api.themoviedb.org/3/movie/popular` — free API key required, store as `TMDB_API_KEY`
- **Planets & Mountains:** static JSON files in `prisma/data/planets.json` and `prisma/data/mountains.json`
- No paid APIs required (TMDB free tier is sufficient)

## Code Style & Conventions
- Use `async/await`, never `.then()` chains
- All components in `components/` are named exports
- All API routes use Next.js Route Handlers (`app/api/.../route.ts`)
- Use `'use client'` only when needed (interactivity/hooks)
- Tailwind only — no inline styles or CSS modules
- Never use `any` type — always define proper interfaces/types in `types/index.ts` (e.g. use `Item[]` not `any[]`, use `unknown` + type guard if type is truly unknown)
- Prisma client imported from `@/lib/prisma` (singleton pattern)

## Game Logic Rules
- Two items shown side by side
- Player picks Higher or Lower
- Correct → +1 point, continue to next round
- Wrong → +0 points, continue to next round
- Game ends when all rounds are done
- Timer: 15 seconds per round (shrinking progress bar)
- **Tiebreaker:** If 2+ players share the highest score at the end, a bonus question is shown to tied players only — repeat until one player answers correctly and the others don't, that player wins
- Tiebreaker questions are drawn from the same item pool, never repeated from the main game

## Lobby & Multiplayer Rules
- Max 8 players per lobby
- No sign-in required — username entered on join, stored in `localStorage` as `{ username, playerId, roomCode }`
- Invite link format: `{NEXT_PUBLIC_APP_URL}/lobby/[roomCode]`
- Only the host (first player) can start the game
- All players in a room get the same question sequence (seeded by roomCode)
- Ably channel per room: `room:[roomCode]`
- Ably events:
  - `player-joined` — broadcast when new player joins `{ username, playerCount }`
  - `category-selected` — host picks category `{ categoryId, label, metric, unit }`
  - `game-start` — host triggers, all clients navigate to `/game/[roomCode]`
  - `score-update` — broadcast after each answer `{ playerId, username, score }`
  - `tiebreaker-start` — broadcast when top scores are tied `{ tiedPlayerIds, question }`
  - `tiebreaker-result` — broadcast after tiebreaker answer `{ winnerId, username }` or `{ stillTied: true }`
  - `game-end` — all clients navigate to `/results/[roomCode]`
- Use Ably token auth (`/api/ably/token`) — never expose raw API key to client

## Categories
Each category has a parent group and one or more metrics. Host picks category + metric before starting.

| ID | Group | Metric | Unit | Data Source |
|----|-------|--------|------|-------------|
| countries-population | 🌍 Countries | Population | people | World Bank API |
| countries-area | 🌍 Countries | Area | km² | REST Countries API |
| countries-gdp | 🌍 Countries | GDP | USD | World Bank API |
| cities-population | 🏙️ Cities | Population | people | GeoNames static JSON |
| cities-elevation | 🏙️ Cities | Elevation | m | GeoNames static JSON |
| mountains-height | 🏔️ Mountains | Height | m | Static JSON |
| planets-size | 🪐 Planets | Diameter | km | Static JSON |
| planets-distance | 🪐 Planets | Distance from Sun | million km | Static JSON |
| movies-boxoffice | 🎬 Movies | Box Office | USD | TMDB API (free key) |
| movies-budget | 🎬 Movies | Budget | USD | TMDB API (free key) |

- Host selects group first (e.g. 🌍 Countries), then picks a metric (e.g. Population)
- Category selection happens in the lobby before game starts
- Selected category is stored in `Lobby.categoryId` and broadcast to all players via Ably `category-selected` event
- All players see the chosen category on their screen once host confirms

## Do Not
- Do not use `pages/` directory — App Router only
- Do not use `any` TypeScript type — use specific interfaces, `unknown` with type guards, or generics instead
- Do not call Prisma directly in components — use API routes
- Do not use CSS modules or styled-components
- Do not add new dependencies without asking first
- Do not expose `ABLY_API_KEY` to the client — always use token auth via `/api/ably/token`
- Do not allow more than 8 players per lobby — enforce in `POST /api/lobby/[roomCode]`
- Do not store user session in a cookie or DB — use `localStorage` only