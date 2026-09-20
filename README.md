# Lensr

> AI-powered intent-aware search engine. Ask anything in natural language — get a structured, category-specific answer card with sources, not just a list of blue links.

- **Stack:** React 19 · TanStack Start · Tailwind CSS v4 · FastAPI · LangGraph
- **AI Models:** Claude 4.6 Sonnet (Reasoning) & Claude 4.5 Haiku (Routing) via AWS Bedrock
- **Infrastructure:** Microsoft Azure (Container Apps, PostgreSQL pgvector, Key Vault, Blob Storage)

---

## 🚀 What it does

Lensr classifies every query into one of **35 backend intents** and renders a purpose-built result card. The pipeline searches the web in real-time, scrapes relevant pages, and synthesizes a structured JSON response tailored to the detected intent.

### Key Features
- **Intent-aware Results:** Dedicated cards for shopping, trips, movies, recipes, books, places, events, and more.
- **Dual Search Modes:** 
  - **Fast Mode:** Quick snippet-based answers in under 5 seconds.
  - **Deep Mode (Requires Sign-In):** Multi-step search, scraping, and reflection using Claude 4.6 Sonnet for highly accurate synthesis.
- **Dynamic Visual Enrichments:** Backend generates charts, tables, or timelines that appear below the answer.
- **Real Sources:** Every answer cites its web sources with clickable links.
- **Live SSE Streaming:** Full visibility into the pipeline (intent → keywords → search → scrape → synthesize).

---

## 🛠️ Architecture & Tech Stack

Lensr is built with a clear separation of concerns, utilizing an agentic multi-stage pipeline on the backend and a highly interactive streaming frontend.

### Frontend
- **Framework:** [TanStack Start](https://tanstack.com/start) & React 19
- **Styling:** Tailwind CSS v4, shadcn/ui, Framer Motion
- **Authentication:** Better-Auth (Google OAuth)

### Backend
- **Framework:** Python FastAPI
- **Agent Orchestration:** [LangGraph](https://langchain-ai.github.io/langgraph/)
- **Search & Scraping:** Google SERP API (Serper.dev) + custom HTTP/2 scraping pool.

### Cloud Infrastructure (Microsoft Azure)
The entire application is provisioned using **Azure Bicep** (Infrastructure-as-Code) and deployed via GitHub Actions.
- **Azure Container Apps:** Serverless, auto-scaling hosting for both the Node.js frontend and Python backend.
- **Azure PostgreSQL Flexible Server:** Powers user accounts, saved searches, and the semantic cache (via `pgvector`).
- **Azure Key Vault:** Securely stores API keys and database credentials, accessed dynamically via Managed Identities.
- **Azure Blob Storage:** Handles user-uploaded images using secure, time-limited SAS tokens.

---

## 🔄 End-to-End Request Flow

1. **User Request:** You enter a search query (or upload an image) in the browser.
2. **Frontend App:** The web app securely passes the request to the backend using Server-Sent Events (SSE).
3. **Backend Agent (Python + LangGraph):**
   - **Router:** Claude 4.5 Haiku instantly classifies the intent of your search.
   - **Cache Check:** Checks the Azure PostgreSQL `pgvector` database to see if a similar question was recently answered.
   - **Search & Scrape:** Searches the web and scrapes the actual content of the top results.
   - **Synthesizer:** Claude 4.6 Sonnet reads the scraped content and synthesizes a highly accurate markdown answer.
4. **Display:** The frontend streams the text live to the screen, along with images, source citations, and interactive UI widgets.

---

## 🔒 Security Practices

- **Zero Hardcoded Secrets:** All credentials are stored in Azure Key Vault and mapped via Managed Identities or GitHub Actions secrets at deploy-time.
- **SQL Injection Immunity:** All database queries utilize strict parameterization.
- **SSRF Protection:** The backend scraper explicitly blocks requests to private/internal network addresses.
- **Timing Attack Prevention:** Internal cross-service API requests are authenticated using constant-time cryptographic comparisons (`hmac.compare_digest` / `crypto.timingSafeEqual`).
