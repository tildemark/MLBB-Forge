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

## 🏗️ Project Architecture
 * /app: Next.js App Router pages, layouts, and API routes.
 * /components: Reusable UI components (split into /ui for shadcn elements and /forge for domain-specific components like ItemSlot).
 * /lib: Core utility functions, Prisma client instantiation, and the **Math Engine** (/lib/math).
 * /scripts: Node/TypeScript scripts for scraping the Fandom API and populating the database.
 * /prisma: Database schema definition (schema.prisma).

## ⚖️ Legal Disclaimer
**MLBB Forge is a fan-made, non-commercial community tool.** This site is not affiliated with, endorsed, sponsored, or specifically approved by Moonton. All game assets, hero portraits, item icons, and trademarked names belong to Moonton. This project exists solely as an educational and community-driven resource.
