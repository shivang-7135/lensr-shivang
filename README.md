# Lensr — Intent-Aware AI Search

> **Ask in natural language. Get a structured answer card, not 10 blue links.**
> Lensr classifies every query into 35+ intents, searches the live web, scrapes and synthesizes with Claude — and streams the result back over SSE with sources, charts, and interactive widgets.

[![Branch: production](https://img.shields.io/badge/branch-production-0ea5e9?style=flat-square)](https://github.com/shivang-7135/lensr-shivang/tree/production)
[![Deploy: Azure Container Apps](https://img.shields.io/badge/deploy-Azure_Container_Apps-0078D4?style=flat-square&logo=microsoftazure)](./infra/main.bicep)
[![Stack: React 19 + FastAPI + LangGraph](https://img.shields.io/badge/stack-React_19_%7C_FastAPI_%7C_LangGraph-black?style=flat-square)](./)
[![AI: Claude via Bedrock](https://img.shields.io/badge/AI-Claude_4.6_Sonnet_%26_4.5_Haiku_@_Bedrock-6b46c1?style=flat-square)](./backend/app/llm.py)
[![License: Private](https://img.shields.io/badge/license-private-lightgrey?style=flat-square)](#license)

**Live:** [lensr.studio](https://lensr.studio) · **API:** `POST /search` (SSE) · **Branch:** `production` — push here auto-deploys to Azure

---

## Table of Contents

- [Why Lensr](#why-lensr)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Supported Intents (35)](#supported-intents-35)
- [Request Lifecycle](#request-lifecycle)
- [Monorepo Structure](#monorepo-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [SSE Event Protocol](#sse-event-protocol)
- [Infrastructure (Azure Bicep)](#infrastructure-azure-bicep)
- [CI/CD — `production` Branch](#cicd--production-branch)
- [Security](#security)
- [Observability](#observability)
- [Performance](#performance)
- [Scripts](#scripts)
- [License](#license)

---

## Why Lensr

Traditional search returns links. Lensr returns **answers**.

| Traditional Search | Lensr |
|---|---|
| 10 blue links, you do the synthesis | Structured answer card tailored to intent |
| Same layout for every query | 35 intent-specific layouts (shopping, trips, recipes, finance, …) |
| Stale or hallucinated citations | Live Google SERP + scraping + cited sources |
| No streaming, no transparency | Live SSE timeline: `intent → search → scrape → synthesize` |

---

## Key Features

- **35 Intent-Specific Cards** — Shopping, price history, trip planning, recipes, books, movies, places, events, tech, health, finance, news, sports, how-to, learning, jobs, local, comparison, gift, legal, gaming, DIY, fitness, pets, music, productivity, weather, real estate, automotive, food, fashion, parenting, dating, insta, general.
- **Dual Search Modes**
  - **Fast Mode** — Snippet-first, cached, <5s. Checks semantic cache (pgvector), limited scraping, quick synthesis.
  - **Deep Mode (signed-in)** — Full LangGraph pipeline: multi-query planning, parallel search + scrape (HTTP/2 pool + Trafilatura), reflection, Claude 4.6 Sonnet synthesis.
- **Live SSE Streaming** — Every stage streams to the UI (`stage`, `intent_detected`, `tool_call`, `partial_answer`, `final`). The timeline activates instantly — search starts before intent classification finishes.
- **Semantic Cache** — `pgvector` cosine similarity (threshold 0.88, 24h TTL) on `DATABASE_URL`. Fast-mode hits return an `Instant Cache` final event.
- **Dynamic Enrichments** — Backend emits charts, tables, and timelines rendered below the answer via `EnrichmentRenderer` + Recharts.
- **Real Sources & Citations** — Every answer carries clickable sources; citations are rendered inline.
- **Vision Search** — Upload an image → signed Blob Storage URL → Claude Vision (Sonnet 4.6) via the `insta` agent.
- **Auth & Personalization** — Better-Auth (Google OAuth), saved searches, history.
- **Production Hardened** — HMAC timing-safe auth, SSRF guards, parameterized SQL, no hardcoded secrets.

---

## Architecture

```
Browser (TanStack Start / React 19)
   │  SSE  POST /api/search  ──►  Frontend Server (Nitro / Node)
   │                               │  x-backend-secret (hmac.compare_digest)
   │                               ▼
   │                          FastAPI (app/main.py)
   │                               │
   │              ┌────────────────┼────────────────┐
   │              │                │                │
   │         router_llm        cache_lookup    google_search (Serper)
   │      (Claude 4.5 Haiku)  (pgvector)       ↕ concurrent
   │              │                │                │
   │              └──────► _classify() ◄───────────┘
   │                         │ DISPATCH[intent]
   │                         ▼
   │              Per-Intent LangGraph (backend/app/agents/*.py)
   │              shopping / trip / recipes / books / … / general
   │                         │  search → scrape → synthesize
   │                         │  (Claude 4.6 Sonnet)
   │                         ▼
   │                    StreamingResponse (text/event-stream)
   │                               │
   └◄─────── ResultsStream + AgentTimeline + ResultCard ──────┘
```

**Frontend streaming proxy:** `src/routes/api/search.ts` forwards to `BACKEND_BASE_URL` with `x-backend-secret`. If unset, returns 503.  
**Backend streaming core:** `backend/app/router_graph.py:run_stream()` — emits `stage:plan` immediately, fires `google_search` in background, runs `classify` + `cache_lookup` concurrently.

> Full narrative version is also rendered in-app via `src/lib/architecture-content.ts` (`/app-info`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | TanStack Start + TanStack Router, React 19, Vite 6, Nitro (preset `node-server` on Azure, `vercel` locally), Tailwind CSS v4, shadcn/ui (Radix), Framer Motion, Recharts, React Markdown + remark-gfm |
| **Auth** | Better-Auth 1.7 (Google OAuth), `pg` direct SQL |
| **Backend** | Python 3.11+, FastAPI 0.115, Uvicorn, Pydantic 2 + pydantic-settings, LangGraph 0.2 + LangChain AWS, `httpx[http2]` scraper pool, Trafilatura, SQLAlchemy 2, `psycopg[binary]` pgvector |
| **AI** | AWS Bedrock — `global.anthropic.claude-sonnet-4-6` (reasoning + vision), `global.anthropic.claude-haiku-4-5-20251001-v1:0` (routing) |
| **Search** | Serper.dev (Google SERP JSON) + optional Tavily, custom scraper (`backend/app/tools/scraper.py`) |
| **Data** | Azure PostgreSQL Flexible Server + `pgvector` (`infra/azure-schema.sql`), semantic cache `search_cache`, saved searches |
| **Storage** | Azure Blob Storage (SAS URLs) via `@azure/storage-blob` + `src/lib/storage.server.ts` |
| **Infra** | Azure Bicep (`infra/main.bicep`, `backendApp.bicep`, `frontendApp.bicep`), Azure Container Apps (auto-scale 1–3, 0.25 CPU / 0.5Gi), Key Vault, Log Analytics, Application Insights |
| **Observability** | Arize Phoenix via OpenTelemetry (`arize-phoenix-otel`, `openinference-instrumentation-langchain`), Azure Monitor Exporter, `backend/app/observability.py` |
| **CI/CD** | GitHub Actions — `ci.yml` + `azure-deploy.yml` (build, lint, typecheck, Docker → GHCR → `az containerapp update`) |

---

## Supported Intents (35)

Classified by `CLASSIFY_SYS` in `backend/app/router_graph.py` (Haiku, 5s timeout, fallback `general`):

| Category | Intents |
|---|---|
| Commerce | `shopping`, `price_history`, `gift`, `comparison` |
| Travel & Local | `trip`, `places`, `food`, `local`, `weather`, `events` |
| Media | `movies`, `books`, `music`, `gaming`, `insta` |
| Knowledge | `tech`, `learning`, `howto`, `diy`, `news`, `general` |
| Health | `health`, `fitness`, `recipes` |
| Professional | `finance`, `jobs`, `legal`, `real_estate` |
| Lifestyle | `automotive`, `pets`, `fashion`, `parenting`, `dating`, `productivity`, `sports` |

Dispatch table `DISPATCH` maps each intent to `backend/app/agents/<intent>.py:run_stream`.  
Frontend category grid (`src/lib/search/categories.ts`) exposes 19 curated shortcuts; all 35 intents are reachable via natural language.

---

## Request Lifecycle

1. **User types** query (or uploads image) on `src/routes/index.tsx` → `SearchBar` + `CategoryGrid`.
2. **Frontend** `POST /api/search` (or `/api/public/backend-keys` for image SAS) → proxies to `POST {BACKEND_BASE_URL}/search` with `x-backend-secret`, `session_id`, `fast_mode`, `image_url`.
3. **Backend** `app/main.py:search()` validates secret (timing-safe), creates `request_id`, calls `router_graph.run_stream()`.
4. **Router** immediately yields `stage:plan`, spawns `google_search(query)` in background, concurrently runs `_classify(query)` (Haiku) and `cache_lookup(query)` (fast-mode only, 3s timeout).
5. **Cache hit** → cancel background tasks, yield `intent_detected` + `cache_hit` + `final(cached)` with `model: "Instant Cache"`.
6. **Cache miss** → await classification, yield `intent_detected`, dispatch to `DISPATCH[intent]` agent. Agent reuses background search task, runs additional Serper queries, scrapes top docs, synthesizes via Sonnet, yields `tool_call`/`partial_answer`/`final`.
7. **Cache store** — fire-and-forget `cache_store()` for future hits.
8. **Frontend** `ResultsStream` + `AgentTimeline` + `ResearchPanel` render live deltas; `ResultCard` picks the intent-specific component (`ShoppingResult`, `TripResult`, `RecipesResult`, `BooksResult`, `MoviesResult`, `PlacesResult`, `EventsResult`, `PriceHistoryResult`, `InstaResult`, `GeneralResult`, …) plus `EnrichmentRenderer` and `SourcesGrid`.

---

## Monorepo Structure

```
.
├── src/                          # Frontend — TanStack Start (React 19)
│   ├── routes/
│   │   ├── index.tsx             # Search home
│   │   ├── results.tsx           # SSE results page
│   │   ├── insta.tsx             # Image upload flow
│   │   ├── app-info.tsx          # Architecture docs (ARCHITECTURE_MD)
│   │   ├── api/search.ts         # SSE proxy → backend
│   │   └── _authenticated/       # Saved, admin (Better-Auth guard)
│   ├── components/
│   │   ├── SearchBar.tsx / CategoryGrid.tsx / SiteHeader.tsx
│   │   ├── ResultsStream.tsx / AgentTimeline.tsx / ResearchPanel.tsx
│   │   └── results/              # Per-intent result cards + enrichments
│   ├── lib/
│   │   ├── auth.ts / auth-client.ts / auth.functions.ts
│   │   ├── db.server.ts / storage.server.ts / config.server.ts
│   │   ├── search/categories.ts / search/types.ts
│   │   └── api/client.ts
│   ├── router.tsx / start.ts / server.ts
│   └── styles.css
├── backend/                      # Backend — FastAPI + LangGraph
│   ├── app/
│   │   ├── main.py               # FastAPI + SSE + /cache/clear
│   │   ├── config.py             # Settings (pydantic-settings)
│   │   ├── llm.py                # Bedrock ChatBedrockConverse + warmup
│   │   ├── observability.py      # Phoenix OTel + App Insights
│   │   ├── router_graph.py       # classify → dispatch (35 intents)
│   │   ├── agents/               # 35 per-intent graphs (_pipeline.py shared)
│   │   └── tools/                # serper.py, scraper.py, cache.py, embeddings.py
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── .env.example
├── infra/                        # Azure IaC (Bicep)
│   ├── main.bicep                # Env, Logs, Insights, Key Vault, modules
│   ├── backendApp.bicep          # Container App: :8000, secrets → env
│   ├── frontendApp.bicep         # Container App: :3000, Better-Auth + DB
│   ├── azure-schema.sql          # pgvector + search_cache DDL
│   └── parameters.json           # lensrprod, swedencentral, images, CORS
├── .github/workflows/
│   ├── ci.yml
│   └── azure-deploy.yml          # production → GHCR → Azure
├── Dockerfile                    # Frontend multi-stage (node:22-slim)
├── vite.config.ts                # tanstackStart + tailwindcss + nitro
├── components.json / tsconfig.json / eslint.config.js
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 22+, npm 10+
- Python 3.11+ (3.12 recommended), pip
- PostgreSQL with `pgvector` (or Azure PostgreSQL Flexible Server)
- AWS Bedrock access (Claude Sonnet 4.6 + Haiku 4.5) — or local mock
- Serper.dev API key (and optionally Tavily)

### 1. Clone & branch

```bash
git clone https://github.com/shivang-7135/lensr-shivang.git
cd lensr-shivang
git checkout production
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env  # fill in values (see table below)
uvicorn app.main:app --reload --port 8000
# health check: curl http://localhost:8000/healthz
```

### 3. Frontend

```bash
# from repo root
npm install
cp .env.example .env  # if present, else create (see table below)
npm run dev           # http://localhost:3000
```

Set `BACKEND_BASE_URL=http://localhost:8000` and `BACKEND_SHARED_SECRET` to the **same** value as `backend/.env`.

### 4. Generate API types (optional)

```bash
npm run generate:api  # pulls http://localhost:8000/openapi.json → src/lib/api/generated.ts
```

---

## Environment Variables

### Backend — `backend/.env` (see `backend/.env.example`)

| Variable | Required | Description |
|---|---|---|
| `AWS_REGION` | Yes | Bedrock region, e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Yes* | Static creds; omitted when using Azure Managed Identity / IAM role |
| `BEDROCK_MODEL_REASONING` | Yes | `global.anthropic.claude-sonnet-4-6` |
| `BEDROCK_MODEL_ROUTER` | Yes | `global.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `BEDROCK_MODEL_VISION` | Yes | `global.anthropic.claude-sonnet-4-6` |
| `SERPER_API_KEY` | Yes | https://serper.dev — without it searches return empty |
| `TAVILY_API_KEY` | No | Fallback search provider |
| `DATABASE_URL` | No | `postgresql+psycopg://user:pass@host:5432/lensr` — enables semantic cache + saved searches |
| `BACKEND_SHARED_SECRET` | Yes | Long random string; must match frontend's `BACKEND_SHARED_SECRET`. Refused in non-local env if insecure |
| `CORS_ALLOW_ORIGIN` | No | Comma-separated; default `http://localhost:3000`, prod `https://lensr.studio,https://www.lensr.studio` — `*` warns |
| `AZURE_KEYVAULT_URL` | No | When set, secrets are pulled via `DefaultAzureCredential` |
| `CACHE_ENABLED` | No | Default `true` |
| `CACHE_SIMILARITY_THRESHOLD` | No | Default `0.88` |
| `CACHE_TTL_HOURS` | No | Default `24` |
| `PHOENIX_API_KEY` / `PHOENIX_COLLECTOR_ENDPOINT` | No | Arize Phoenix tracing |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | No | Azure Monitor |
| `OTEL_SERVICE_NAME` | No | Default `lensr-backend` |

### Frontend — `.env` (Nitro / TanStack Start server)

| Variable | Required | Description |
|---|---|---|
| `BACKEND_BASE_URL` | Yes | Backend origin, e.g. `http://localhost:8000` or `https://lensrprod-backend.<env>.azurecontainerapps.io` |
| `BACKEND_SHARED_SECRET` | Yes | Must equal backend's value |
| `DATABASE_URL` | Yes | Same Postgres as backend (Better-Auth + pgvector) |
| `BETTER_AUTH_SECRET` | Yes | Random 32+ chars; generated per-env in Bicep (`lensr_auth_${uniqueString(...)}`) |
| `BETTER_AUTH_URL` | Yes | Frontend origin, e.g. `http://localhost:3000` or `https://lensr.studio` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth (Better-Auth) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | No | Legacy Supabase keys (still in `frontendApp.bicep`; remove if fully on Postgres) |
| `NITRO_PRESET` | No | `vercel` (default) locally, `node-server` in Docker/Azure |

> Secrets in Azure are **never** hardcoded — they live in Key Vault (`SERPER-API-KEY`, `DATABASE-URL`, `AWS-*`, `BEDROCK-MODEL-*`, `APPLICATIONINSIGHTS-CONNECTION-STRING`, `PHOENIX-API-KEY`, `GOOGLE-CLIENT-*`) and are injected as Container Apps secrets.

---

## API Reference

### `POST /search` → `text/event-stream`

Proxied by `src/routes/api/search.ts`. Direct backend call also works with `x-backend-secret`.

**Request**

```json
{
  "query": "best noise-cancelling headphones under $300",
  "intent_hint": "shopping",
  "fast_mode": false,
  "session_id": "client-uuid-for-phoenix-grouping",
  "image_url": "https://...signed-blob-url (insta only)"
}
```

- `query` — 1–2000 chars, required
- `intent_hint` — optional 100-char hint (frontend category click)
- `fast_mode` — `true` enables cache + parallel snippet path
- `session_id` — groups Phoenix traces; auto-generated if omitted
- `image_url` — appended to query when `intent == insta` for Vision

**Headers**

```
Content-Type: application/json
x-backend-secret: <BACKEND_SHARED_SECRET>
```

**cURL**

```bash
curl -N -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -H "x-backend-secret: $BACKEND_SHARED_SECRET" \
  -d '{"query":"5-day trip to Lisbon in October","fast_mode":false}'
```

### `GET /healthz`

```json
{"ok": true}
```

### `POST /cache/clear` (admin, requires `x-backend-secret`)

Clears `public.search_cache`. Returns `{"cleared": 42, "message": "Cleared 42 cached entries"}`.

### `GET /debug` (diagnostic)

Verifies `DefaultAzureCredential` → Key Vault `AWS-REGION` fetch. Remove or guard before public prod.

---

## SSE Event Protocol

Each event is `data: <json>\n\n`. Types emitted by `router_graph.py` and per-intent agents:

| `type` | Payload | When |
|---|---|---|
| `stage` | `{"stage":"plan"}` | Immediately on connect — activates UI timeline |
| `intent_detected` | `{"intent":"shopping"}` | After Haiku classification (or cache hit) |
| `cache_hit` | `{"cached": true}` | Fast-mode semantic cache hit |
| `tool_call` / `tool_result` | `{"tool":"serper","input":{}}` | Per search/scrape step (agent-dependent) |
| `partial_answer` | `{"delta":"markdown chunk..."}` | Streaming synthesis deltas |
| `final` | `{"intent","model","structured","markdown","sources","cached?"}` | Terminal event — `structured` is intent-specific JSON, `sources` are `{title,url,snippet}` |
| `error` | `{"message":"...","request_id":"abcd1234"}` | Sanitized; internal details are logged server-side only |

Frontend consumes via `ResultsStream.tsx` → `src/lib/search/types.ts` → intent `ResultCard`.

---

## Infrastructure (Azure Bicep)

Provisioned from `infra/main.bicep` (IaC, `swedencentral`, env `lensrprod`):

| Resource | Name | Purpose |
|---|---|---|
| Log Analytics | `lensr-logs` | 30-day retention, 1 GB/day cap |
| Application Insights | `lensr-insights` | Web kind, wired to Log Analytics |
| Container Apps Env | `lensr-env` | Shared env, `logAnalyticsConfiguration` |
| Key Vault | `lensr-kv` | All secrets; RBAC via access policy |
| Backend App | `lensrprod-backend` | `:8000`, 0.25 CPU / 0.5 Gi, 1–3 replicas |
| Frontend App | `lensrprod-frontend` | `:3000`, 0.25 CPU / 0.5 Gi, 1–3 replicas |
| PostgreSQL | *(external / flexible server)* | `pgvector`, `search_cache`, Better-Auth tables — DDL in `infra/azure-schema.sql` |
| Blob Storage | *(external)* | Image uploads (SAS) |

Deploy manually:

```bash
az group create -n lensr-sweden-prod -l swedencentral
az deployment group create \
  -g lensr-sweden-prod \
  -f infra/main.bicep \
  -p infra/parameters.json \
  -p githubToken=$GHCR_PAT
```

Images are `ghcr.io/shivang-7135/lensr-backend:latest` and `ghcr.io/shivang-7135/lensr-frontend:latest` (overridden per SHA in CI).

---

## CI/CD — `production` Branch

> **This is the deploy branch.** Every push to `production` triggers `.github/workflows/azure-deploy.yml`.

```mermaid
flowchart LR
  push[push → production] --> build[build-and-test]
  build --> be[deploy-backend]
  build --> fe[deploy-frontend]
  subgraph build [Build & Test]
    node22[Node 22 · npm install · lint · tsc · build]
    py312[Python 3.12 · pip install -e . · ruff check/format · mypy]
  end
  be --> ghcr1[docker build backend → GHCR :sha + :latest]
  fe --> ghcr2[docker build frontend → GHCR :sha + :latest]
  ghcr1 --> az1[az login OIDC → az containerapp update lensrprod-backend 1-3 replicas]
  ghcr2 --> az2[az login OIDC → az containerapp update lensrprod-frontend 1-3 replicas]
```

**Jobs:**

1. `build-and-test` — Node 22 + Python 3.12, ESLint, `tsc --noEmit`, `vite build` (`NITRO_PRESET=node-server`), `ruff check` + `ruff format --check`, `mypy --ignore-missing-imports` (continue-on-error).
2. `deploy-backend` — `docker build ./backend` → `ghcr.io/.../lensr-backend:$SHA` + `:latest` → `az containerapp update --name lensrprod-backend --resource-group lensr-sweden-prod`.
3. `deploy-frontend` — `docker build .` (multi-stage `node:22-slim`) → `ghcr.io/.../lensr-frontend:$SHA` + `:latest` → `az containerapp update --name lensrprod-frontend`.

Auth uses `azure/login@v2` OIDC (`client-id`/`tenant-id`/`subscription-id` in workflow) + `GITHUB_TOKEN` for GHCR.

---

## Security

- **No hardcoded secrets** — Key Vault + `DefaultAzureCredential` / Container Apps secrets; GitHub Actions secrets at deploy time.
- **Timing-safe auth** — `hmac.compare_digest` (Python) / `crypto.timingSafeEqual` (Node) on `x-backend-secret`.
- **CORS allowlist** — Comma-separated `CORS_ALLOW_ORIGIN`; `*` is rejected with a warning and startup log.
- **SSRF protection** — Scraper blocks private/internal ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`).
- **SQL injection immunity** — Parameterized queries only (`psycopg` + `pg`).
- **Secret validation** — Startup refuses insecure `BACKEND_SHARED_SECRET` (`""`, `change-me`, …) unless `CORS_ALLOW_ORIGIN` is localhost.
- **Error sanitization** — SSE `error` events and `all_errors` handler return `request_id` only; stack traces stay server-side.

---

## Observability

- **Arize Phoenix** — `backend/app/observability.py:setup_tracing()` instruments LangChain via `openinference-instrumentation-langchain` + `arize-phoenix-otel` OTLP exporter. Session grouping via `session_id_var` → `get_langchain_session_metadata()` → `RunnableConfig(metadata)`.
- **Azure Monitor** — `APPLICATIONINSIGHTS_CONNECTION_STRING` → `azure-monitor-opentelemetry-exporter`.
- **LLM warmup** — `app/llm.py:warmup()` pre-warms Bedrock connections on lifespan startup; pools are shut down gracefully (`shutdown_clients`, `shutdown_scraper`).
- **Logs** — Container Apps → Log Analytics (`PerGB2018`, 30 days).

---

## Performance

- **Instant timeline** — `stage:plan` yielded before any LLM call so UI never stalls.
- **Concurrent start** — `google_search(query)` fires immediately in background; `cache_lookup` + `_classify` run concurrently.
- **Classification timeout** — Haiku call capped at 5s; fallback `general`.
- **Cache timeout** — `cache_lookup` capped at 3s (fast-mode only).
- **HTTP/2 pools** — Persistent `httpx` clients for Serper + scraper; Trafilatura extraction.
- **Fire-and-forget cache store** — `asyncio.create_task(_store_in_cache(...))` after `final`.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server (TanStack Start) |
| `npm run build` | Production build (`vite build`) |
| `npm run build:dev` | Build with `vite build --mode development` |
| `npm run preview` | Preview built output |
| `npm run lint` | ESLint |
| `npm run format` | Prettier `--write` |
| `npm run typecheck` | `tsc --noEmit --skipLibCheck` |
| `npm run generate:api` | `openapi-typescript http://localhost:8000/openapi.json -o src/lib/api/generated.ts` |
| `pip install -e ".[dev]"` | Backend + dev deps (ruff, mypy, pytest) |
| `ruff check app/` / `ruff format --check app/` | Backend lint/format |
| `mypy app/ --ignore-missing-imports` | Backend typecheck |
| `pytest` | Backend tests |

---

## License

Private — all rights reserved. No license granted for redistribution.

---

<p align="center">
  Built with React 19 · TanStack Start · FastAPI · LangGraph · Claude on Bedrock · Azure<br/>
  <code>production</code> is the deploy branch — keep it green.
</p>
