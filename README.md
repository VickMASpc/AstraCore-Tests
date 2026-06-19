# AstraCore

AstraCore is a TypeScript WhatsApp bot with two intentionally separated products:

- Professional Gemini AI Workspace
- Legacy RPG Mode

The project uses Node.js 20+, TypeScript, `@google/genai`, a Baileys-compatible WhatsApp transport, Drizzle ORM, SQLite-first persistence, Zod, Pino, Vitest, and Docker-ready packaging.

## Product Boundaries

- Professional AI and RPG use separate commands.
- Professional AI and RPG use separate Gemini model settings.
- Professional AI and RPG use separate state and context flows.
- RPG never uses Google Search, Gemini code execution, or professional AI memory.
- Professional AI never mixes RPG scene state into workspace answers.

## Quick Start

Use these commands to clone the project, create the local environment file, install dependencies, validate the code, and start the bot.

```bash
git clone https://github.com/VickMASpc/AstraCore-Tests.git
cd AstraCore-Tests
cp .env.example .env
mkdir -p data
npm ci
npm run typecheck
npm test
npm run build
npm start
```

`npm start` runs the compiled bot from `dist/src/app.js`. For active development, use the TypeScript watcher instead:

```bash
npm run dev
```

## Startup Requirements

Before starting the bot, make sure you have:

- Node.js 20 or newer.
- npm, normally included with Node.js.
- A Gemini API key.
- A WhatsApp account or number that can link a new device.
- Optional: Docker and Docker Compose if you prefer containerized startup.

Check your local versions:

```bash
node --version
npm --version
```

## Configure `.env`

Copy the template first:

```bash
cp .env.example .env
```

Then edit `.env` and set at least these values:

```bash
# Required for Gemini responses
GEMINI_API_KEY=your_gemini_api_key_here

# Comma-separated owner numbers, including country code, no plus sign
OWNER_NUMBERS=15551234567

# Keep the SQLite default unless you know you need a different local path
DATABASE_URL=file:./data/astracore.sqlite
DATABASE_DIALECT=sqlite

# WhatsApp auth/session files are persisted here
WHATSAPP_AUTH_DIR=./data/wa-auth
```

You can patch the common placeholders quickly from the shell:

```bash
perl -0pi -e 's/GEMINI_API_KEY=.*/GEMINI_API_KEY=your_gemini_api_key_here/' .env
perl -0pi -e 's/OWNER_NUMBERS=.*/OWNER_NUMBERS=15551234567/' .env
```

Replace the example values with your real key and owner number before running the bot.

## Start the Bot Locally

### 1. Install dependencies

```bash
npm ci
```

### 2. Validate the project

```bash
npm run typecheck
npm test
npm run build
```

### 3. Start in production mode

```bash
npm start
```

### 4. Or start in development mode

```bash
npm run dev
```

The application loads `.env`, initializes the SQLite schema, builds the command router, and starts the WhatsApp transport during boot.

## WhatsApp Login / Pairing

AstraCore stores the WhatsApp multi-file auth session in `WHATSAPP_AUTH_DIR`. The default path is `./data/wa-auth`.

### Option A: QR code login

Set QR output on and start the bot:

```bash
perl -0pi -e 's/WHATSAPP_PRINT_QR=.*/WHATSAPP_PRINT_QR=true/' .env
npm run dev
```

Then scan the QR code with WhatsApp from your phone. After login, keep the `data/wa-auth` directory so the bot can reuse the session.

### Option B: Pairing code login

Set a phone number for pairing. Use country code and digits only, with no `+`, spaces, or punctuation.

```bash
perl -0pi -e 's/WHATSAPP_PAIRING_NUMBER=.*/WHATSAPP_PAIRING_NUMBER=15551234567/' .env
perl -0pi -e 's/WHATSAPP_PRINT_QR=.*/WHATSAPP_PRINT_QR=false/' .env
npm run dev
```

When the pairing code appears in the logs, enter it in WhatsApp on your phone. Keep `./data/wa-auth` after the first successful login.

## Docker Startup

Docker Compose uses `.env`, exposes the status server on port `3000`, and mounts `./data` into the container so SQLite and WhatsApp auth persist.

```bash
cp .env.example .env
mkdir -p data
# Edit GEMINI_API_KEY, OWNER_NUMBERS, and WhatsApp pairing/QR settings first.
docker compose up --build
```

Run it in the background:

```bash
docker compose up --build -d
```

View logs:

```bash
docker compose logs -f astracore
```

Stop the container:

```bash
docker compose down
```

## Useful Commands

```bash
npm run dev         # Start the bot with tsx watch for development
npm run build       # Compile TypeScript into dist/
npm start           # Run the compiled bot from dist/src/app.js
npm run typecheck   # Type-check without emitting files
npm test            # Run the Vitest test suite
npm run test:watch  # Run Vitest in watch mode
npm run db:generate # Generate Drizzle migration files
npm run db:migrate  # Run the database migration script
```

## Environment Variables

Core:

- `BOT_NAME`
- `BOT_PREFIX`
- `OWNER_NUMBERS`
- `DATABASE_URL`
- `DATABASE_DIALECT`
- `LOG_LEVEL`

WhatsApp:

- `WHATSAPP_AUTH_DIR`
- `WHATSAPP_PAIRING_NUMBER`
- `WHATSAPP_PRINT_QR`
- `PUBLIC_STATUS_SERVER`
- `PORT`

Gemini:

- `GEMINI_API_KEY`
- `GEMINI_API_VERSION`
- `GEMINI_AI_MODEL`
- `GEMINI_FAST_MODEL`
- `GEMINI_RPG_MODEL`
- `DEEP_RESEARCH_PLANNER_MODEL`
- `DEEP_RESEARCH_DETAIL_MODEL`
- `DEEP_RESEARCH_SOURCE_MODEL`
- `DEEP_RESEARCH_WRITER_MODEL`
- `DEEP_RESEARCH_FACTCHECK_MODEL`
- `DEEP_RESEARCH_FINAL_MODEL`

Feature flags:

- `ENABLE_GOOGLE_SEARCH`
- `ENABLE_CODE_EXECUTION`
- `ENABLE_PUBLIC_REPO_ANALYSIS`
- `ENABLE_STRUCTURED_OUTPUT`

AI and rate limits:

- `AI_MAX_CONTEXT_MESSAGES`
- `AI_MAX_GROUP_CONTEXT_MESSAGES`
- `AI_MAX_RESPONSE_CHARS`
- `AI_REPLY_CHUNK_SIZE`
- `RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR`
- `DEEP_RESEARCH_RATE_LIMIT_PER_USER_PER_DAY`
- `REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY`
- `GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR`
- `RPG_RATE_LIMIT_PER_USER_PER_MINUTE`

Profile and memory:

- `MAX_USER_MEMORY_ITEMS`
- `MAX_GROUP_MEMORY_ITEMS`
- `MAX_USER_PROFILE_FACTS`
- `MAX_GROUP_PROFILE_FACTS`
- `MEMORY_REVIEW_INTERVAL_DAYS`

## Gemini Setup

- Use the official Gemini API only.
- Set `GEMINI_API_KEY` in `.env`.
- Professional AI uses `GEMINI_AI_MODEL`.
- Profile extraction uses `GEMINI_FAST_MODEL`.
- RPG narration uses `GEMINI_RPG_MODEL`.
- Deep research stage overrides default to `GEMINI_AI_MODEL` when left blank.
- Google Search grounding requires `ENABLE_GOOGLE_SEARCH=true`.
- Gemini code execution requires `ENABLE_CODE_EXECUTION=true`.

## Commands

Professional AI:

- `!ai`, `!ask`, `!pro`
- `!explain`
- `!summarize`
- `!draft`
- `!compare`
- `!plan`
- `!code`
- `!aireset`

Research:

- `!research <topic>`
- `!deepresearch <topic>`
- `!sources`

Research behavior:

- `!research <topic>` runs a single Google Search-grounded research pass and stores the final report plus sources.
- `!deepresearch <topic>` runs a multi-stage pipeline:
  planner -> detail/source/writer in parallel -> fact-check -> final synthesis
- All deep research stages use Google Search grounding.
- Normal users only receive the final report. Internal planner, paper, and fact-check artifacts are persisted for maintainers and operators, not shown in chat.
- `!sources` returns the source list for the latest stored research result in the current chat, whether it came from `!research` or `!deepresearch`.
- There is no user-facing `!deepresearchdebug` command in the current implementation.

Public repository analysis:

- `!repo <public GitHub URL>`
- `!review <public GitHub URL or pasted code>`

Profile and privacy:

- `!profile me`
- `!profile group`
- `!profile me full`
- `!profile group full`
- `!profile reset me`
- `!profile reset group`
- `!memory add <fact>`
- `!memory list`
- `!memory delete <id>`
- `!memory clear`
- `!privacy`
- `!privacy minimal`
- `!privacy normal`
- `!privacy rich`

RPG:

- `!rpg`, `!rpgajuda`
- `!criarchar [classe] [nome]`
- `!meuchar`
- `!deletarchar`
- `!criarsessao [tema]`
- `!entrar`
- `!narrar [ação]`
- `!fecharsessao`
- `!batalha`
- `!atacar`
- `!roletarussa`
- `!apostar [quantia]`
- `!caraoucoroa [cara/coroa]`

## Health Endpoints

When `PUBLIC_STATUS_SERVER=true`:

- `GET /health` returns JSON health status.
- `GET /` returns current connection status.
- QR data is only included when `WHATSAPP_PRINT_QR=true`.
- Session data, owner numbers, and raw env values are never exposed.

Local checks:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/
```

## Database Backup

SQLite default:

- Database file defaults to `./data/astracore.sqlite`.
- Backup the main `.sqlite` file and, if present, `-wal` and `-shm`.
- See [docs/backup-restore.md](docs/backup-restore.md).

## Rate Limits

- Professional AI commands are limited per user per hour.
- Research and deep research have stricter per-user limits.
- Public repo analysis has a per-user daily limit.
- RPG actions share a per-user per-minute limit.
- `!deepresearch` is intentionally stricter than `!research` because it is slower and more expensive.

## Deep Research Pipeline

`!deepresearch` is source-grounded and fact-checked, but it is not infallible.

Architecture:

```text
user topic
  -> planner (structured brief)
  -> parallel branches
     -> detail researcher
     -> source auditor
     -> writing researcher
  -> fact-check judge
  -> final synthesis author
  -> final report + stored sources
```

Operational notes:

- This path is slower and more expensive than `!research` because it makes multiple Gemini calls with Google Search grounding.
- Fact-check failure stops the run before final synthesis.
- One failed detail/source/writer branch can still produce a partial but usable final report.
- Two or more failed detail/source/writer branches abort the run.
- Final confidence is deterministic in code, not just model-authored prose. The service caps or lowers confidence when verdicts, source counts, failed branches, or blocked stages do not support stronger claims.
- The final report includes uncertainty and source-quality framing, but should not be treated as a guarantee of factual perfection.

Persistence and diagnostics:

- Final user-facing reports still go into the existing research report/source tables so `!sources` stays compatible.
- Deep research also stores a run record and per-stage artifacts, including stage status, model name, blocked flag, latency, sanitized errors, and stage text or JSON when available.
- These traces are intended for maintainers and operators. They are not exposed to normal WhatsApp users by default.

## Security Restrictions

- No unofficial AI APIs.
- No Shizuku or aggregator APIs.
- No media downloaders.
- No sticker downloaders.
- No adult or fun-menu features.
- No runtime code injection.
- No self-modifying source behavior.
- No hardcoded owner numbers.
- No session logging.
- No Gemini key logging.
- No local execution of analyzed repositories.

## PostgreSQL Later

The current runtime is SQLite-first. If you migrate later:

- keep the Drizzle schema as the source of truth
- add a PostgreSQL client layer beside the SQLite client
- move write-heavy audit and AI tables first
- validate WAL/locking assumptions that do not apply to PostgreSQL

## Limitations

- SQLite is the only supported runtime dialect today.
- Public repository analysis is fetch-only and never executes code.
- Gemini tool usage is restricted by feature and environment flags.
- Audit storage currently needs stricter JID hashing enforcement in repository writes before production should be considered fully hardened.
