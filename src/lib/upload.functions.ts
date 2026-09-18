import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db.server";
import { generateSignedUrl } from "@/lib/storage.server";

export const getUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { fileName: string }) => data)
  .handler(async ({ data }) => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    if (!session?.user) throw new Error("Unauthorized");

    const sanitized = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${session.user.id}/${Date.now()}-${sanitized}`;

    const writeUrl = await import("@/lib/storage.server").then((m) =>
      m.generateWriteUrl(storagePath, 15),
    );
    return { storagePath, writeUrl };
  });

export const saveImageRecord = createServerFn({ method: "POST" })
  .inputValidator((data: { storagePath: string }) => data)
  .handler(async ({ data }) => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    if (!session?.user) throw new Error("Unauthorized");

    const readUrl = await generateSignedUrl(data.storagePath, 60);

    await db.query(
      "INSERT INTO public.uploaded_images (user_id, storage_path, public_url, created_at) VALUES ($1, $2, $3, now())",
      [session.user.id, data.storagePath, readUrl],
    );

    return { url: readUrl };
  });
