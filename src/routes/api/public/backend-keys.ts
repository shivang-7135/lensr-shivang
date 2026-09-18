import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { db } from "@/lib/db.server";

export const APIRoute = createAPIFileRoute("/api/public/backend-keys")({
  GET: async ({ request }) => {
    const authHeader =
      request.headers.get("authorization") || request.headers.get("x-backend-secret");
    const secret = process.env.BACKEND_SHARED_SECRET;

    if (!secret || authHeader !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { rows } = await db.query("SELECT name, value FROM public.api_keys");
      const map: Record<string, string> = {};
      for (const row of rows) map[row.name] = row.value || "";
      return json(map, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("Error fetching keys:", e);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});
