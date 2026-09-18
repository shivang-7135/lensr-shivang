import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const Route = createFileRoute("/api/public/backend-keys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader =
          request.headers.get("authorization") || request.headers.get("x-backend-secret") || "";
        const expected = process.env.BACKEND_SHARED_SECRET || "";

        if (!expected || !safeCompare(authHeader, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { rows } = await db.query("SELECT name, value FROM public.api_keys");
          const map: Record<string, string> = {};
          for (const row of rows) map[row.name] = row.value || "";
          return Response.json(map, { headers: { "Cache-Control": "no-store" } });
        } catch (e) {
          console.error("Error fetching keys:", e);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
