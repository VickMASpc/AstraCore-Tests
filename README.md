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

## Setup

1. Install Node.js 20+.
2. Install dependencies with `npm ci`.
3. Copy `.env.example` to `.env`.
4. Set `GEMINI_API_KEY`.
5. Adjust `OWNER_NUMBERS`, `DATABASE_URL`, and WhatsApp options.
6. Run `npm run typecheck`, `npm test`, and `npm run build`.
7. Start with `npm start` or `npm run dev`.

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

## WhatsApp Pairing

- Multi-file auth is stored under `WHATSAPP_AUTH_DIR`.
- QR data is only exposed by the status server when `WHATSAPP_PRINT_QR=true`.
- If `WHATSAPP_PAIRING_NUMBER` is set, the transport requests a pairing code after connection opens.
- Session data is never logged.

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

## Database Backup

SQLite default:

- Database file defaults to `./data/astracore.sqlite`.
- Backup the main `.sqlite` file and, if present, `-wal` and `-shm`.
- See [docs/backup-restore.md](/C:/Users/Victor/Documents/BotWhat/docs/backup-restore.md).

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

## Docker

Build and run with Docker:

```bash
docker compose up --build
```

The compose setup mounts `./data` for SQLite and WhatsApp auth persistence.

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
