/**
 * Architecture documentation content for the App Info page.
 *
 * Rendered at runtime by react-markdown on the /app-info route.
 * Kept as a TS constant so it's bundled with the app — no raw file
 * loader or server-side read needed.
 */

export const ARCHITECTURE_MD = `
# Lensr — Architecture & System Design

> **A production-grade, intent-aware AI search engine** built with security, scalability, and observability at its core.
> Every layer — from TLS-only traffic to SSRF-hardened scrapers — is designed
> to meet enterprise standards while delivering sub-second perceived latency.

---

## 1. System Overview

**Lensr** is not a wrapper around an LLM chat interface. It is a full-stack
search engine that:

1. Accepts natural language queries or uploaded images.
2. Classifies the query into one of **35+ domain-specific intents** using a
   fast classifier (AWS Bedrock — Claude 3 Haiku).
3. Runs **speculative parallel execution**: Google search starts *before*
   classification finishes, so results are already arriving when the intent
   is known.
4. Routes to a **specialised agent** that executes an adaptive research
   pipeline — fan-out search, progressive HTTP/2 web scraping, heuristic
   quality checks, reflection loops, and structured synthesis.
5. Streams intermediate reasoning, tool calls, and partial answers to the
   client via **Server-Sent Events (SSE)** for real-time transparency.
6. Delivers a **category-specific result card** (Shopping, Trip, Movies,
   Recipes, Price History, Books, Places, Events, Insta, or General),
   followed by asynchronous visual enrichment (charts, timelines,
   comparison matrices).

### Key Differentiators

| Capability | Description |
|---|---|
| **Intent-aware routing** | 35+ intents, each with purpose-built result cards |
| **Dual research modes** | Fast (\u003c5 s, Haiku) and Deep (10–20 s, Sonnet 3.5) |
| **Speculative parallelism** | Search starts before classification completes |
| **Semantic caching** | pgvector + Titan Embeddings v2 for sub-second repeat queries |
| **Guaranteed media & CTAs** | Every result has real images and actionable links |
| **Live pipeline visibility** | SSE-streamed intent → plan → search → scrape → reflect → answer |
| **Multi-agent architecture** | 36 LangGraph agents with reflection loops and quality gates |

---

## 2. High-Level Architecture

\`\`\`
┌───────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                      │
│  React 19 · TanStack Start v1 · TanStack Router · Tailwind CSS v4        │
│  Radix UI · Framer Motion · Recharts · react-markdown                     │
│                                                                           │
│  Routes: /         (search)     /results  (SSE stream)                    │
│          /insta    (upload)     /auth     (sign-in)                        │
│          /saved    (history)    /admin    (API keys)                       │
│          /app-info (this page)                                             │
└──────────┬──────────────────────────────────────────┬─────────────────────┘
           │ Better-Auth (email + Google OAuth)       │ POST /api/search
           ▼                                          ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│  Azure Database for          │    │  TanStack Start Server               │
│  PostgreSQL Flexible Server  │    │  (Vercel / Azure Container Apps)     │
│                              │    │                                      │
│  • better-auth tables        │    │  POST /api/search                    │
│  • user_roles                │    │    → CORS + body validation          │
│  • api_keys (admin CRUD)     │    │    → proxy to Python backend         │
│  • saved_searches            │    │    → returns SSE stream              │
│  • search_cache (pgvector)   │    │                                      │
│  • uploaded_images           │    │  Server RPCs (createServerFn):       │
│                              │    │    • listApiKeys · upsertApiKey      │
│  Extensions: pgvector,       │    │    • deleteApiKey · checkIsAdmin     │
│  has_role() SECURITY DEFINER │    │                                      │
└──────────────────────────────┘    └──────────────────┬───────────────────┘
                                                       │ HTTPS
                                                       │ X-Backend-Secret
                                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              Python Backend (FastAPI + LangGraph)                          │
│              Azure Container Apps — Sweden Central                         │
│                                                                           │
│  POST /search → text/event-stream (SSE)                                   │
│  POST /cache/clear → admin cache reset                                    │
│  GET  /healthz → liveness probe                                           │
│                                                                           │
│  ┌──────────────┐                                                         │
│  │ Router Graph  │── classify intent (Bedrock Haiku, \u003c1 s) ──┐            │
│  │              │── speculative search (parallel)    ──┤            │
│  │              │── semantic cache check             ──┘            │
│  └──────────────┘                                                         │
│    ┌── shopping_agent ─┐                                                  │
│    ├── trip_agent ─────┤   36 specialised LangGraph agents:               │
│    ├── price_agent ────┤     plan → fan-out search → scrape               │
│    ├── insta_agent ────┤     → reflect → synthesize                       │
│    ├── movies_agent ───┤                                                  │
│    ├── books_agent ────┤   Fast Mode: Haiku synthesis, no scraping         │
│    ├── places_agent ───┤   Deep Mode: Sonnet synthesis, full pipeline     │
│    └── general_agent ──┘                                                  │
│                                                                           │
│  External Service Calls:                                                  │
│    • AWS Bedrock  (Claude 3.5 Sonnet, Haiku, Vision, Titan Embeddings)    │
│    • Serper.dev   (Google SERP API)                                       │
│    • DuckDuckGo   (fallback search)                                       │
│    • Arize Phoenix (OpenTelemetry tracing)                                │
│    • trafilatura  (web content extraction)                                │
└───────────────────────────────────────────────────────────────────────────┘
\`\`\`

---

## 3. Azure Cloud Infrastructure

All production infrastructure is provisioned via **Azure Bicep** IaC in
the \`infra/\` directory. Region: **Sweden Central** (\`swedencentral\`).

| Azure Service | Resource Name | Purpose |
|---|---|---|
| **Container Apps** | \`lensrprod-backend\` | Python FastAPI backend (0.25 vCPU, 0.5 GiB, auto-scale 0→2) |
| **Container Apps** | \`lensrprod-frontend\` | TanStack Start SSR server (0.25 vCPU, 0.5 GiB, auto-scale 0→2) |
| **Managed Environment** | \`lensrprod-env\` | Shared Container Apps environment with Log Analytics integration |
| **PostgreSQL Flexible Server** | \`lensrprod-db\` | Primary database with pgvector extension for semantic search |
| **Key Vault** | \`lensrprod-kv\` | Centralised secrets (AWS keys, API tokens, DB creds). Accessed via Managed Identity |
| **Blob Storage** | \`lensrstorageprod\` | User-uploaded images (\`user-uploads\` container), SAS-protected URLs |
| **Application Insights** | \`lensrprod-insights\` | APM, distributed tracing, error monitoring |
| **Log Analytics** | \`lensrprod-logs\` | Centralised log aggregation (30-day retention, 1 GB/day cap) |

### Container App Configuration

- **Image Registry**: GitHub Container Registry (\`ghcr.io\`)
- **Backend**: Port 8000, liveness probe on \`GET /healthz\` (15 s initial delay, 10 s period)
- **Frontend**: Port 3000, environment variable \`VITE_API_BASE_URL\` dynamically set from backend FQDN
- **Scale-to-zero**: Both apps scale down to 0 replicas when idle, reducing costs

---

## 4. Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| TanStack Start | v1 | Full-stack SSR framework with Nitro server engine |
| React | 19 | Component rendering with concurrent features |
| TanStack Router | v1 | Type-safe file-based routing |
| TanStack Query | v5 | Server state caching and synchronization |
| Tailwind CSS | v4 | Utility-first styling with custom design tokens |
| Radix UI (shadcn/ui) | Latest | Accessible, unstyled UI primitives |
| Framer Motion | 12.x | Animations and layout transitions |
| Recharts | 2.x | Interactive data visualisation (charts, radar, etc.) |
| Better-Auth | Latest | Authentication (email/password + Google OAuth) |
| Lucide React | Latest | Icon library |
| Zod | 3.x | Runtime schema validation |
| react-markdown | 10.x | Markdown rendering (this page!) |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| FastAPI | ≥0.115 | Async web framework |
| LangGraph | ≥0.2 | Multi-agent state machine orchestration |
| LangChain | ≥0.3 | LLM abstraction and chain composition |
| langchain-aws | ≥0.2 | AWS Bedrock integration for LangChain |
| boto3 | ≥1.35 | AWS SDK (Bedrock, STS) |
| httpx | ≥0.27 | Async HTTP/2 client for web scraping |
| trafilatura | ≥1.12 | Clean text extraction from HTML |
| psycopg | ≥3.2 | PostgreSQL async driver |
| SQLAlchemy | ≥2.0 | ORM and connection management |
| Uvicorn | ≥0.32 | ASGI server |

### Observability

| Technology | Purpose |
|---|---|
| Arize Phoenix | LLM-specific tracing with OpenInference semantic conventions |
| Azure Application Insights | APM, distributed tracing, error monitoring |
| OpenTelemetry SDK | Instrumentation layer for both exporters |
| Umami | Lightweight, privacy-focused frontend analytics |

---

## 5. Request Flow: Query → Result Card

### Fast Mode (\u003c5 seconds)

\`\`\`
User types query
    │
    ├─── POST /api/search {query, fast_mode: true}
    │         │
    │    TanStack Start validates CORS, body size, query length
    │         │
    │    Proxy to FastAPI + X-Backend-Secret
    │         │
    │    ┌────┴────┐
    │    │ PARALLEL │
    │    ├─────────┤
    │    │ Classify intent (Haiku, \u003c1 s)
    │    │ Seed Google searches (Serper, 2 queries)
    │    │ Check semantic cache (pgvector)
    │    └────┬────┘
    │         │
    │    If cache hit → return cached result instantly
    │         │
    │    Merge search results → deduplicate
    │         │
    │    Synthesize with Claude 3 Haiku (1024 tokens)
    │         │
    │    Stream partial_structured fields (tldr → key_facts → detail)
    │         │
    └─── SSE: final event + background enrichment generation
\`\`\`

### Deep Mode (10–20 seconds)

\`\`\`
User types query (authenticated)
    │
    ├─── POST /api/search {query, fast_mode: false}
    │         │
    │    ┌────┴────┐
    │    │ PARALLEL │
    │    ├─────────┤
    │    │ Classify intent (Haiku)
    │    │ Seed Google searches (2 queries)
    │    └────┬────┘
    │         │
    │    _combined_plan: Extract keywords + plan 3–4 diverse queries (Sonnet)
    │         │
    │    ┌────┴────┐
    │    │ PARALLEL │
    │    ├─────────┤
    │    │ Fan-out Google search (3–4 planned queries)
    │    │ Scrape top 6 URLs (HTTP/2 + trafilatura)
    │    │ Emit early partial_answer from snippets
    │    └────┬────┘
    │         │
    │    Evidence sufficiency check (heuristic)
    │         │
    │    ┌── If insufficient ──┐
    │    │  Reflect: "What's missing?" (Sonnet)
    │    │  Follow-up search (3 queries)
    │    │  Scrape new pages
    │    └──────────┬──────────┘
    │               │
    │    Synthesize structured JSON with Claude 3.5 Sonnet (4096 tokens)
    │         │
    │    Stream partial_structured → final event
    │         │
    └─── Background: cache result, generate enrichment, export traces
\`\`\`

---

## 6. Multi-Agent System

### Router Graph

The top-level router classifies queries into **35+ intents** using a compact
few-shot prompt and Claude 3 Haiku. Classification completes in \u003c1 second
and runs **concurrently** with speculative search to eliminate idle time.

### Adaptive Pipeline

Every agent follows a shared pipeline (\`backend/app/agents/_pipeline.py\`)
with these phases:

| Phase | Fast Mode | Deep Mode |
|---|---|---|
| **1. Intent Classification** | Haiku (\u003c1 s) | Haiku (\u003c1 s) |
| **2. Query Planning** | Deterministic seed queries | Sonnet-planned diverse queries |
| **3. Web Search** | 2 parallel Serper queries | 3–4 fan-out Serper queries |
| **4. Web Scraping** | Skipped (snippets only) | Top 6 URLs via HTTP/2 + trafilatura |
| **5. Reflection Loop** | Skipped | Sonnet evaluates evidence gaps, follow-up search |
| **6. Synthesis** | Haiku (1024 tokens, 80–120 words) | Sonnet 3.5 (4096 tokens, 200+ words) |
| **7. Enrichment** | Haiku-generated charts/tables | Haiku-generated charts/tables |

### Specialised Agents

| Agent | Intent Examples | Output Schema |
|---|---|---|
| **Shopping** | "best noise cancelling headphones under \\$300" | Product picks, pros/cons, comparison table |
| **Trip Planning** | "5 day italy itinerary in october" | Day-by-day itinerary, budget hints, packing tips |
| **Price History** | "macbook air price trend" | Price points, buy score, sale windows |
| **Movies & TV** | "movies like inception" | Film cards with ratings, streaming badges |
| **Recipes** | "chicken tikka masala recipe" | Prep/cook times, ingredients, step-by-step |
| **Books** | "best sci-fi books 2024" | Book cards, ratings, Goodreads CTAs |
| **Places** | "best coffee shops in stockholm" | Location cards, highlights, Maps CTAs |
| **Events** | "tech conferences europe 2025" | Event cards, dates, ticket pricing |
| **Insta** | Image upload | Styled captions, hashtags, photo spot ideas |
| **General** | All other 26+ intents | TL;DR, key facts, detailed markdown |

---

## 7. LLM Configuration

### Model Tiers via AWS Bedrock

| Tier | Model | Use Case | Max Tokens | Temperature |
|---|---|---|---|---|
| **Router** | Claude 3 Haiku | Intent classification, fast planning | 256 | 0.0 |
| **Fast Synthesis** | Claude 3 Haiku | Fast mode answers, enrichment | 1024 | 0.3 |
| **Reasoning** | Claude 3.5 Sonnet v2 | Deep mode synthesis, planning, reflection | 4096 | 0.3 |
| **Vision** | Claude 3.5 Sonnet v2 | Image analysis for Instagram captioning | 1024 | 0.4 |
| **Embeddings** | Amazon Titan Embed v2 | Semantic cache vectors (1024 dimensions) | — | — |

### Connection Management

- **Singleton instances**: Each model tier creates one boto3 client, reused across requests (saves ~100–200 ms/call)
- **Startup warmup**: Background task pings each model on boot to pre-establish TLS connections
- **Retry policy**: 3 automatic retries for transient 429/5xx errors
- **TCP keepalive**: Enabled to maintain persistent Bedrock connections

---

## 8. Semantic Caching

The caching system provides **sub-second responses** for repeated or similar
queries using PostgreSQL pgvector:

1. **Exact match**: Normalised query string lookup against \`search_cache.query_normalized\`
2. **Semantic match**: Titan Embeddings v2 vector (1024-dim) compared via cosine distance
   - Threshold: 0.88 similarity (\`1 - (embedding <=> query_embedding) > 0.88\`)
3. **Cache policy**: Active in Fast Mode only; Deep Mode always runs fresh research
4. **TTL**: 24 hours, with automatic cleanup via \`cleanup_expired_cache()\`
5. **Background storage**: Fire-and-forget task stores query + embedding + result after synthesis

---

## 9. Security & Compliance

### Transport Security

- All traffic is TLS-encrypted (HTTPS only)
- Backend-to-frontend communication authenticated via \`X-Backend-Secret\` header
- Timing-safe comparison (\`hmac.compare_digest\`) prevents timing attacks on secret validation

### SSRF Protection

The web scraper includes comprehensive SSRF defences:
- Blocks private IP ranges: \`10.x\`, \`172.16–31.x\`, \`192.168.x\`
- Blocks link-local: \`169.254.x\` (AWS metadata endpoint)
- Blocks: \`localhost\`, \`.internal\`, \`.local\`, \`metadata.google.internal\`
- Blocks all IPv6 addresses
- Response size cap: 5 MB per page

### Authentication & Authorisation

- **Better-Auth** handles user authentication (email/password + Google OAuth)
- **Role-based access**: \`user\` (default) and \`admin\` roles stored in \`user_roles\` table
- **Admin-gated features**: API key management, cache clearing
- **Deep Mode**: Requires authentication (prevents anonymous abuse of Sonnet API costs)

### Secret Management

- **Azure Key Vault** (\`lensrprod-kv\`) stores all production secrets
- Loaded at startup via \`DefaultAzureCredential\` (Managed Identity in production)
- No secrets in environment variables in production — all pulled from Key Vault
- Client-side code has zero access to secrets

### Data Protection

- Row-Level Security on all PostgreSQL tables
- Users can only access their own saved searches and uploads
- Image uploads use time-limited SAS URLs (15 min write, 60 min read)
- No PII stored beyond email addresses for authentication

### Input Validation

- Query length capped at 2000 characters
- Request body size capped at 8 KB
- Image uploads capped at 10 MB (JPG/PNG/WebP only)
- All inputs validated with Pydantic (backend) and Zod (frontend)

---

## 10. Observability

### Dual-Exporter Tracing Architecture

\`\`\`
Backend Request
    │
    ├── OpenTelemetry SDK
    │       │
    │       ├── Arize Phoenix Exporter
    │       │     • LLM-specific tracing (OpenInference semantics)
    │       │     • Tracks: model, tokens, latency per LLM call
    │       │     • Groups traces by browser tab session_id
    │       │     • Auto-instruments LangChain calls
    │       │
    │       └── Azure Monitor Exporter
    │             • Application Insights integration
    │             • Performance metrics, error rates, dependencies
    │             • Azure-native alerting and dashboards
    │
    └── Structured Logging
          • Python logging with JSON formatter
          • Shipped to Azure Log Analytics (30-day retention)
\`\`\`

### Frontend Analytics

- **Umami** (self-hosted, privacy-focused) for page views and user flows
- No cookies, no PII collection, GDPR-compliant by design

---

## 11. CI/CD Pipeline

### Continuous Integration (\`ci.yml\` — every push/PR to \`main\`)

| Step | Frontend | Backend |
|---|---|---|
| **Lint** | ESLint | Ruff (check + format) |
| **Type Check** | TypeScript (\`tsc --noEmit\`) | mypy |
| **Build** | \`npm run build\` | Docker image build |

### Continuous Deployment (\`azure-deploy.yml\` — push to \`production\`)

1. Run full lint + typecheck + build tests
2. Build and push Docker images to GitHub Container Registry
3. Authenticate to Azure via **OIDC / federated credentials** (no stored secrets)
4. Update Azure Container Apps with new images via \`az containerapp update\`

### Deployment Targets

| Component | Primary | Fallback |
|---|---|---|
| **Frontend** | Vercel (\`lensr.studio\`) | Azure Container Apps (\`lensrprod-frontend\`) |
| **Backend** | Azure Container Apps (\`lensrprod-backend\`) | Fly.io (Stockholm) / Render (Ohio) |

---

## 12. Database Schema

### Core Tables

| Table | Purpose |
|---|---|
| \`user\` / \`session\` / \`account\` / \`verification\` | Better-Auth managed tables |
| \`user_roles\` | Role assignments (\`admin\` / \`user\`), checked via \`has_role()\` |
| \`api_keys\` | Dynamic backend API key storage, admin-managed via UI |
| \`saved_searches\` | User search history with full response JSON |
| \`uploaded_images\` | Azure Blob paths and SAS read URLs for user uploads |
| \`search_cache\` | Semantic cache: normalised query, 1024-dim embedding, structured JSON, TTL |

### Key Functions

- \`match_search_cache(embedding, threshold, count)\`: Cosine similarity search over cached results
- \`cleanup_expired_cache()\`: Purges expired cache entries
- \`has_role(user_id, role)\`: \`SECURITY DEFINER\` function for safe role checking without recursive RLS

---

## 13. Project Structure

\`\`\`
lensr/
├── src/                          # Frontend (TanStack Start)
│   ├── routes/
│   │   ├── index.tsx             # Home: SearchBar + CategoryGrid
│   │   ├── results.tsx           # SSE consumer + result rendering
│   │   ├── insta.tsx             # Image upload → caption agent
│   │   ├── auth.tsx              # Sign-in/up (email + Google OAuth)
│   │   ├── app-info.tsx          # Architecture documentation (this page)
│   │   ├── _authenticated/
│   │   │   ├── saved.tsx         # User's saved searches
│   │   │   └── admin.tsx         # API key management
│   │   └── api/
│   │       ├── search.ts         # SSE proxy to Python backend
│   │       ├── cache-clear.ts    # Admin cache reset proxy
│   │       └── public/
│   │           └── backend-keys.ts  # Backend key retrieval
│   ├── components/
│   │   ├── SiteHeader.tsx        # Responsive nav with scroll-aware hide
│   │   ├── SearchBar.tsx         # Animated search input
│   │   ├── ResultsStream.tsx     # Core SSE event processor (30 KB)
│   │   ├── CategoryGrid.tsx      # 20-category discovery grid
│   │   ├── results/              # Per-intent result cards
│   │   │   ├── ShoppingResult.tsx
│   │   │   ├── TripResult.tsx
│   │   │   ├── PriceHistoryResult.tsx
│   │   │   ├── MoviesResult.tsx
│   │   │   ├── RecipesResult.tsx
│   │   │   ├── BooksResult.tsx
│   │   │   ├── PlacesResult.tsx
│   │   │   ├── EventsResult.tsx
│   │   │   ├── InstaResult.tsx
│   │   │   ├── GeneralResult.tsx
│   │   │   ├── EnrichmentRenderer.tsx
│   │   │   └── SourcesGrid.tsx
│   │   └── ui/                   # shadcn/ui components (46 primitives)
│   └── lib/
│       ├── auth-client.ts        # Better-Auth client setup
│       ├── auth.functions.ts     # Server-side auth helpers
│       ├── storage.server.ts     # Azure Blob SAS URL generation
│       ├── architecture-content.ts  # This documentation as TS export
│       └── search/
│           ├── types.ts          # SSE + structured payload types
│           ├── categories.ts     # 20-category definitions
│           └── citations.tsx     # Source citation renderer
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app + SSE endpoint
│   │   ├── config.py             # Pydantic settings + Key Vault loader
│   │   ├── llm.py                # Bedrock model singletons + warmup
│   │   ├── router_graph.py       # Intent classification + dispatch
│   │   ├── observability.py      # Dual OTel exporter setup
│   │   ├── agents/
│   │   │   ├── _pipeline.py      # Shared adaptive search pipeline
│   │   │   ├── _enrichment.py    # Post-answer visual generation
│   │   │   ├── shopping.py
│   │   │   ├── trip.py
│   │   │   ├── price_history.py
│   │   │   ├── insta.py
│   │   │   ├── general.py
│   │   │   └── ... (36 agents total)
│   │   └── tools/
│   │       ├── serper.py         # Google Search API client
│   │       ├── scraper.py        # SSRF-safe web scraper
│   │       ├── cache.py          # pgvector semantic cache
│   │       └── embeddings.py     # Titan Embeddings v2 client
│   ├── Dockerfile                # Multi-stage Python 3.12-slim
│   ├── pyproject.toml
│   └── render.yaml               # Alternative Render deployment
├── infra/
│   ├── main.bicep                # Azure infrastructure as code
│   ├── parameters.json           # Production parameter values
│   └── azure-schema.sql          # Database schema + pgvector setup
├── .github/workflows/
│   ├── ci.yml                    # Lint + typecheck + build on every PR
│   └── azure-deploy.yml          # Build, push, deploy on push to production
├── docs/
│   └── ARCHITECTURE.md           # Detailed architecture reference
├── vercel.json                   # Vercel deployment + security headers
├── Dockerfile                    # Frontend container (Node 22-slim)
└── package.json                  # Frontend dependencies
\`\`\`

---

## 14. Why This Architecture is Production-Grade

### Performance

- **Speculative execution**: Search starts before classification finishes — zero idle time
- **Connection pooling**: Singleton Bedrock clients with TCP keepalive
- **Startup warmup**: TLS connections pre-established on boot
- **HTTP/2 multiplexing**: Multiple concurrent scrapes over a single connection
- **Semantic caching**: Sub-second responses for similar queries
- **Progressive streaming**: Users see partial results within 1–2 seconds

### Reliability

- **Auto-scaling**: 0→2 replicas based on HTTP traffic
- **Health probes**: Kubernetes-style liveness checks on the backend
- **Graceful degradation**: Sonnet fallback → Haiku fallback → raw snippets
- **DuckDuckGo fallback**: If Serper.dev is unavailable
- **Retry policies**: 3 automatic retries on transient Bedrock errors

### Security

- End-to-end TLS encryption
- Timing-safe secret comparison
- SSRF-hardened web scraper
- Azure Key Vault for secrets (no env vars in production)
- Input validation at every layer (Zod + Pydantic)
- Role-based access control with security-definer functions
- Time-limited SAS tokens for blob storage

### Observability

- Dual tracing: Arize Phoenix (LLM-specific) + Azure Application Insights (APM)
- Structured logging to Azure Log Analytics
- Session-grouped traces for end-to-end request debugging
- Privacy-focused frontend analytics (Umami, no cookies)

### Cost Efficiency

- Scale-to-zero Container Apps (pay only when active)
- Semantic caching reduces Bedrock API calls by ~40%
- Haiku for fast classification (\u003c\\$0.001/query)
- Sonnet only for Deep mode synthesis (authenticated users only)
- 1 GB/day log quota prevents runaway monitoring costs

---

*Built with ❤️ by Shivang Sinha — powered by TanStack Start, LangGraph, AWS Bedrock, and Azure.*
`;
