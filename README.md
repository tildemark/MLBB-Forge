# ⚔️ MLBB Forge

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
git clone [https://github.com/tildemark/mlbb-forge.git](https://github.com/tildemark/mlbb-forge.git)
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
NEXT_PUBLIC_CDN_URL="[https://cdn.sanchez.ph/mlbb/](https://cdn.sanchez.ph/mlbb/)"

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

## ⚖️ Legal Disclaimer
**MLBB Forge is a fan-made, non-commercial community tool.** This site is not affiliated with, endorsed, sponsored, or specifically approved by Moonton. All game assets, hero portraits, item icons, and trademarked names belong to Moonton. This project exists solely as an educational and community-driven resource.
