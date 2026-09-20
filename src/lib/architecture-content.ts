export const ARCHITECTURE_MD = `
# Lensr Architecture

Lensr is a modern, AI-powered search engine built to provide high-quality, structured answers instead of just a list of links. The architecture is designed to be fast, scalable, and modular.

---

## 🔄 End-to-End Flow

1. **User Request:** You enter a search query (or upload an image) in the browser.
2. **Frontend App (TanStack Start):** The web app securely passes your request to the backend using Server-Sent Events (SSE) to stream the response back in real-time.
3. **Backend Agent (Python + LangGraph):** 
   - **Router:** A fast LLM (Claude 4.5 Haiku) classifies the intent of your search (e.g. Shopping, Trip Planning, General).
   - **Cache Check:** The system instantly checks if a similar question was recently answered using Semantic Cache (pgvector).
   - **Search & Scrape:** The backend searches the web (Google SERP) and scrapes the actual content of the top results.
   - **Synthesizer:** A powerful reasoning LLM (Claude 4.6 Sonnet) reads the scraped content and synthesizes a final, highly accurate markdown answer.
4. **Display:** The frontend streams the text live to your screen, along with images, source citations, and interactive UI widgets.

---

## 🛠️ Tools & Technologies

- **Frontend Framework:** [TanStack Start](https://tanstack.com/start) & React 19
- **Styling & UI:** Tailwind CSS v4, shadcn/ui, Framer Motion
- **Backend Framework:** Python FastAPI & [LangGraph](https://langchain-ai.github.io/langgraph/) (Agentic workflows)
- **AI Models:** 
  - Reasoning & Vision: **Claude 4.6 Sonnet** (via AWS Bedrock)
  - Fast Routing: **Claude 4.5 Haiku** (via AWS Bedrock)
- **Web Search:** Google SERP API (Serper.dev)
- **Authentication:** Better-Auth (Google OAuth & Email)

---

## ☁️ Azure Infrastructure

The entire application runs on Microsoft Azure, provisioned automatically via Bicep Infrastructure-as-Code.

- **Azure Container Apps:** Hosts both the Frontend and Backend in a serverless, auto-scaling environment.
- **Azure PostgreSQL Flexible Server:** Stores user accounts, saved searches, and powers the Semantic Cache using the \`pgvector\` extension.
- **Azure Key Vault:** Securely stores all sensitive API keys and database credentials.
- **Azure Blob Storage:** Stores user-uploaded images for visual searches.
- **Azure Log Analytics:** Aggregates logs and performance metrics across the system.
`;
