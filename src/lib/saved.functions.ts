import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db.server";

export const getSavedSearches = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session?.user) throw new Error("Unauthorized");

  const { rows } = await db.query(
    "SELECT id, query, intent, created_at FROM public.saved_searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [session.user.id],
  );
  return rows;
});
