# ⚔️ MLBB Forge

**MLBB Forge** is a production-ready, high-performance theorycrafting sandbox for Mobile Legends: Bang Bang (MLBB).

Inspired by the deep UI/UX of tools like *D3Planner*, MLBB Forge lets players build loadouts, test item synergies, and simulate exact game mechanics (Effective HP, DPS, Burst Damage) before stepping foot in the Land of Dawn.

🌍 **Live:** [https://forge.sanchez.ph](https://forge.sanchez.ph)

---

## ✨ Features

### Sandbox
- **Three-Pane Layout** — Left (hero + emblem + spell), Center (gear grid + builds), Right (live stat sheet)
- **Level 1–15 Slider** — Stats update live with MLBB's linear growth formula
- **Drag-to-Reorder Item Slots** — Rearrange equipped items directly in the grid
- **Deep Math Engine** — Flat vs % pen ordering, 40/45% CDR hard cap, Golden Staff crit→atkspd conversion, Effective HP (eHP)
- **Synergy & Anti-Synergy Warnings** — Detects conflicting builds (e.g. Golden Staff + Berserker's Fury)
- **Combat Conditions** — Toggleable situational buffs (War Axe stacks, target below 50% HP, etc.)
- **Skill Damage Breakdown** — Per-skill damage at current stats with phys/magic scaling

### Builds
- **Curated Meta Builds** — Fetched from mlbb.gg with item icons, spell, emblem and talents in a single compact row; one-click Apply loads the full build
- **Community Builds** — Authenticated users publish named builds with title, description and tags; Popular / Top Rated / archetype tabs
- **Vote System** — Upvote / downvote community builds (rate-limited 200/hour)
- **My Builds (Garage)** — Personal saved build list per hero; publish your own or save a copy of any community build (BookmarkPlus → BookmarkCheck)
- **Clone / Remove** — Save any public build to your garage, remove it with one click
- **Delete Own Build** — Trash icon on My Builds tab removes the build from DB and cache

### Sharing
- **URL Build Sharing** — Share button on every build card copies `/share/<slug>`; the share page renders full OG tags (title, hero name, items, 1200×630 image) so Facebook/Twitter previews work correctly, then JS-redirects humans to `/?b=<encoded>` which restores the full loadout client-side
- **Guest-Compatible** — No login needed to browse, calculate, or use a shared link

### Auth & Infrastructure
- **OAuth Login** — Google + Discord via Auth.js (NextAuth v5); session available both server and client side
- **Redis Caching** — Hero builds cached 60 s, invalidated on publish/delete/vote; graceful degradation if Redis is down
- **Rate Limiting** — Publish/clone: 10/day per user; votes: 200/hour per user

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Lucide Icons |
| Database | PostgreSQL + Prisma 7 |
| Cache / Rate-limit | ioredis (Redis) |
| Auth | Auth.js v5 (NextAuth) — Google + Discord OAuth |
| Hosting | Oracle Cloud Infrastructure (Always Free) |
| CDN | OCI Object Storage → `https://cdn.sanchez.ph/mlbb/` |

---

## 🚀 Local Development

### Prerequisites
- Node.js 18.17+
- PostgreSQL (local or Docker)
- Redis (local or Docker)

### 1. Clone & install
```bash
git clone https://github.com/tildemark/mlbb-forge.git
cd mlbb-forge
npm install
```

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in:

```env
# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_CDN_URL="https://cdn.sanchez.ph/mlbb/"

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mlbb_forge"
POSTGRES_USER="..."
POSTGRES_PASSWORD="..."
POSTGRES_DB="mlbb_forge"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth.js
AUTH_SECRET="generate-a-strong-secret"
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
AUTH_DISCORD_ID="..."
AUTH_DISCORD_SECRET="..."
```

### 3. Database setup
```bash
npx prisma db push
npx prisma generate
```

### 4. Run
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🕷️ Scraper Scripts

```bash
npm run scrape:heroes    # hero metadata + portraits → CDN + DB
npm run scrape:items     # item data + icons
npm run scrape:emblems   # emblem trees + talent nodes
npm run scrape:spells    # battle spells + icons
npm run scrape:skills    # hero abilities + skill icons (add hero names to target specific heroes)
```

OCI storage env vars required for scrapers:

```env
OCI_REGION="us-phoenix-1"
OCI_S3_ENDPOINT="..."
OCI_BUCKET="..."
OCI_ACCESS_KEY_ID="..."
OCI_SECRET_ACCESS_KEY="..."
SCRAPE_PATCH="1.8.88"
```

Utility scripts in `scripts/` (run with `npx tsx scripts/<name>.ts`) cover image repair, emblem probing, OCI connectivity tests, and ad-hoc DB checks. The `tmp-*` files are one-off debugging probes.

---

## 🏗️ Project Structure

```
app/              Next.js App Router pages + API routes
  api/og/         Dynamic OG image generator (1200×630)
  share/[slug]/   Build share page with full OG meta + JS redirect
components/
  ForgeSandbox    Root client shell; decodes ?b= URL param on mount
  panes/          LeftPane · CenterPane · RightPane
  ui/             shadcn primitives (Sheet, Tooltip, ScrollArea, Slider)
lib/
  actions.ts      All server actions (builds, votes, auth, clone, rate-limit)
  build-config.ts Shared archetype constants + BuildTab type
  calc.ts         Math engine (eHP, penetration, CDR cap, atk speed cap)
  redis.ts        ioredis singleton with graceful degradation helpers
  share.ts        encodeShareState / decodeShareState (base64url)
  store.ts        Zustand global state
  utils.ts        cdnUrl helper + cn
prisma/
  schema.prisma   Full DB schema
scripts/          Scraper + maintenance scripts
```

---

## ⚖️ Legal Disclaimer

**MLBB Forge is a fan-made, non-commercial community tool.** Not affiliated with or endorsed by Moonton. All game assets, hero portraits, item icons, and trademarked names belong to Moonton. This project exists solely as an educational and community-driven resource.


**MLBB Forge** is a production-ready, high-performance "Min-Max Sandbox" and theorycrafting tool for Mobile Legends: Bang Bang (MLBB). 

Inspired by the deep UI/UX of ARPG tools like *D3Planner*, MLBB Forge allows players to build loadouts, test item synergies, and simulate exact game mechanics (Effective HP, Actual DPS, Burst Damage, Healing Output) before ever stepping foot in the Land of Dawn.

🌍 **Live Demo:** [https://forge.sanchez.ph](https://forge.sanchez.ph)

---

## ✨ Key Features

* **D3-Inspired Three-Pane UI:** A desktop-optimized, widescreen layout for hardcore theorycrafting.
    * *Left Pane:* Hero Selection, Level Slider (1-15), Emblem Matrix, and Battle Spells.
    * *Center Pane:* The 6-slot gear grid and live Skill Damage scaling breakdown.
    * *Right Pane:* Live stat sheet detailing Offense, Defense, and Utility metrics.
* **Deep Math Engine:** Highly accurate calculations mapping to live MLBB mechanics, including Flat vs. Percentage Penetration order, 40/45% CDR hard caps, and Effective HP (eHP).
* **Synergy & Anti-Synergy Warnings:** Intelligent alerts that warn users if they build conflicting items (e.g., *Golden Staff* + *Berserker's Fury*).
* **Combat Conditions:** Toggleable buffs and debuffs (e.g., "Target below 50% HP," "War Axe fully stacked") to see situational stat changes.
* **Guest-First Experience:** 100% functional calculator without a login. Builds are persisted in `localStorage` or shareable via compressed URL parameters.
* **Community Hub:** Log in via Google or Discord to publish, vote on, and save builds.

---

## 🛠️ Tech Stack & Infrastructure

* **Frontend:** [Next.js](https://nextjs.org/) (App Router), TypeScript, React.
* **Styling & UI:** [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) (Sheets, HoverCards, Dialogs), Lucide Icons.
* **Database & ORM:** PostgreSQL + [Prisma](https://www.prisma.io/).
* **Caching & Rate Limiting:** Redis.
* **Authentication:** [Auth.js](https://authjs.dev/) (formerly NextAuth).
* **Hosting:** Oracle Cloud Infrastructure (OCI) Always Free Tier.
* **Asset Pipeline:** Custom scraper utilizing the MediaWiki API to fetch data. Images are proxied to OCI Object Storage and served via a custom CDN (`https://cdn.sanchez.ph/mlbb/`).

---

## 🚀 Getting Started (Local Development)

### Prerequisites
* Node.js (v18.17+)
* PostgreSQL running locally or via Docker
* Redis running locally or via Docker

### 1. Clone the repository
```bash
git clone https://github.com/tildemark/mlbb-forge.git
cd mlbb-forge

```
### 2. Install dependencies
```bash
npm install

```
### 3. Environment Variables
Create a .env file in the root directory and add the following variables:
```env
# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_CDN_URL="https://cdn.sanchez.ph/mlbb/"

# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/mlbb_forge?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-strong-secret-key-here"

# OAuth Providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"

```
### 4. Database Setup
Push the Prisma schema to your local database and generate the Prisma Client:
```bash
npx prisma db push
npx prisma generate

```
### 5. Run the Application
```bash
npm run dev

```
Open http://localhost:3000 in your browser to see the app running.

If `npm run dev` exits with `Another next dev server is already running`, there is already a `next dev` process using this workspace. Stop the old process and start again:

```bash
lsof -iTCP:3000 -sTCP:LISTEN -n -P
kill <pid>
npm run dev
```

Next.js will sometimes briefly report `3001` and still exit if it detects an existing dev server for the same app directory. The fix is to stop the earlier process, not to start a second one.

## 🕷️ Scraper Scripts

The main dataset ingestion commands are exposed through `package.json`:

```bash
npm run scrape:heroes
npm run scrape:items
npm run scrape:emblems
npm run scrape:spells
npm run scrape:skills
```

What each scraper does:

* `npm run scrape:heroes`: pulls hero metadata from `Module:Hero/data`, mirrors portraits to the CDN, and upserts hero records into PostgreSQL.
* `npm run scrape:items`: pulls item data from `Module:Equipment/data`, mirrors item icons, and upserts item stats.
* `npm run scrape:emblems`: parses emblem trees and talent nodes from the `Emblems` page.
* `npm run scrape:spells`: scrapes battle spells from the `Battle spells` page and uploads spell icons.
* `npm run scrape:skills`: scrapes hero ability data and skill icons. You can also target specific heroes with `npx tsx scripts/scrape-skills.ts -- Miya Layla`.

Useful scraper-related environment variables:

```env
SCRAPE_PATCH="1.8.88"
NEXT_PUBLIC_CDN_URL="https://cdn.sanchez.ph/mlbb/"
OCI_REGION="us-phoenix-1"
OCI_S3_ENDPOINT="your-oci-s3-endpoint"
OCI_BUCKET="your-bucket-name"
OCI_ACCESS_KEY_ID="your-access-key"
OCI_SECRET_ACCESS_KEY="your-secret-key"
```

Additional utility scripts in `scripts/` are meant for maintenance and debugging and are run directly with `tsx`:

```bash
npx tsx scripts/fix-hero-images.ts
npx tsx scripts/patch-hero-images.ts
npx tsx scripts/probe-emblems.ts
npx tsx scripts/test-oci.ts
```

What the utility scripts are for:

* `fix-hero-images.ts`: retries missing or broken hero portrait uploads.
* `patch-hero-images.ts`: force-patches a hard-coded list of hero portraits using multiple wiki-image lookup strategies.
* `probe-emblems.ts`: dumps source wikitext for emblem and spell-related pages to help debug parser changes.
* `test-oci.ts`: verifies OCI object storage connectivity by listing objects and uploading a small test file.

The `tmp-*` files under `scripts/` are ad hoc probes and one-off debugging utilities, not stable project commands.

`db:seed` is still listed in `package.json`, but `scripts/seed-db.ts` is currently missing. Treat that command as unavailable until the seed script is restored.

## 🏗️ Project Architecture
 * /app: Next.js App Router pages, layouts, and API routes.
 * /components: Reusable UI components (split into /ui for shadcn elements and /forge for domain-specific components like ItemSlot).
 * /lib: Core utility functions, Prisma client instantiation, and the **Math Engine** (/lib/math).
 * /scripts: Node/TypeScript scripts for scraping the Fandom API and populating the database.
 * /prisma: Database schema definition (schema.prisma).

## 🗺️ Roadmap / Missing Features

The following features are designed and specced in `data/agent.md` but not yet implemented:

### Core Sandbox
- [x] **Skill Damage Breakdown** — Center pane section showing per-skill damage at current stats (base damage + physical/magic scaling against a configurable target). `SkillScaling` records exist in the DB but the UI is not built yet.
- [x] **Combat Conditions / Toggleable Buffs** — Item-specific conditional buffs (e.g. "Target below 50% HP" for Blade of Despair, "War Axe fully stacked") that adjust live stats when toggled on.
- [x] **Synergy & Anti-Synergy Warnings** — Detect conflicting item combinations (e.g. Golden Staff + Berserker's Fury) and surface warnings in the equipment grid.

### Auth & Community
- [x] **OpenMLBB Community Builds** — Fetches real player-submitted builds from the [OpenMLBB public API](https://openmlbb.fastapicloud.dev/api/docs) and shows them in a "Community" tab. Resolves numeric `equip_ids` → slugs → our DB items client-side.
- [ ] **Auth.js Login** — Google / Discord OAuth via Auth.js. Schema models (`User`, `Account`, `Session`) exist; no `auth.ts`, sign-in UI, or `[...nextauth]` route has been created yet.
- [ ] **Publish Build** — Authenticated users can name and publish their current loadout as a community build.
- [ ] **Upvote / Downvote** — `upvotes`/`downvotes` columns exist on `Build`; no API route or UI button yet.
- [ ] **Personal Garage** — Saved build list scoped to the logged-in user.

### Sharing & Persistence
- [ ] **URL Build Sharing** — Compress the current hero + items + emblem + spell + level into a shareable URL parameter so guests can share builds without logging in.
- [ ] **`seed-db.ts`** — Referenced in `package.json` as `npm run db:seed` but the script is a stub. Needs implementation to seed a fresh database from the `data/seeds/*.json` snapshots.

### Infrastructure
- [ ] **Redis** — `REDIS_URL` is wired in `.env.example` and listed in the stack, but no Redis client or usage exists anywhere in the codebase (rate-limiting, trending build cache).

---

## ⚖️ Legal Disclaimer
**MLBB Forge is a fan-made, non-commercial community tool.** This site is not affiliated with, endorsed, sponsored, or specifically approved by Moonton. All game assets, hero portraits, item icons, and trademarked names belong to Moonton. This project exists solely as an educational and community-driven resource.
