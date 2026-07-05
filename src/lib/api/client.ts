/**
 * Type-safe API client for Lensr backend.
 *
 * Usage:
 *   1. Run `npm run generate:api` with the backend running to generate types
 *   2. Import this client to make type-safe requests
 *
 * For now, the SSE streaming endpoint (/search) remains handled by
 * the raw fetch in ResultsStream.tsx since openapi-fetch doesn't support SSE.
 * This client is for future REST endpoints (cache-clear, health, etc.)
 */
import createClient from "openapi-fetch";

// When generated types are available, uncomment:
// import type { paths } from "./generated";
// export const api = createClient<paths>({ baseUrl: "/api" });

/**
 * Placeholder export — the real typed client will be created once
 * `npm run generate:api` is executed against a running backend.
 */
export const API_BASE_URL = "/api";
