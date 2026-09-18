import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db.server";

async function requireAdmin() {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session?.user) throw new Error("Unauthorized");

  const { rows } = await db.query(
    "SELECT role FROM public.user_roles WHERE user_id = $1 AND role = 'admin'",
    [session.user.id],
  );
  if (rows.length === 0) throw new Error("Forbidden: Admins only");
  return session.user.id;
}

export const listApiKeys = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { rows } = await db.query(
    "SELECT name, value, description, updated_at FROM public.api_keys ORDER BY name",
  );
  return { keys: rows };
});

export const upsertApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; value: string; description?: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAdmin();
    await db.query(
      `INSERT INTO public.api_keys (name, value, description, updated_by, updated_at) 
       VALUES ($1, $2, $3, $4, now()) 
       ON CONFLICT (name) DO UPDATE SET 
       value = EXCLUDED.value, description = EXCLUDED.description, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [data.name, data.value, data.description || null, userId],
    );
    return { success: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.query("DELETE FROM public.api_keys WHERE name = $1", [data.name]);
    return { success: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return { isAdmin: false };

  const { rows } = await db.query(
    "SELECT role FROM public.user_roles WHERE user_id = $1 AND role = 'admin'",
    [session.user.id],
  );
  return { isAdmin: rows.length > 0 };
});
