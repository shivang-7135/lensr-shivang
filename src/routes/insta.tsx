import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { SiteHeader } from "@/components/SiteHeader";
import { getUploadUrl, saveImageRecord } from "@/lib/upload.functions";

export const Route = createFileRoute("/insta")({
  head: () => ({ meta: [{ title: "Insta caption helper — Lensr" }] }),
  component: InstaPage,
});

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function InstaPage() {
  const nav = useNavigate();
  const { data: session, isPending } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authed = !!session;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(f: File) {
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(
        `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max size is ${MAX_FILE_SIZE_MB} MB.`,
      );
      return;
    }
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      if (!authed) {
        setError("Please sign in.");
        setUploading(false);
        return;
      }

      // 1. Get SAS write URL
      const { storagePath, writeUrl } = await getUploadUrl({ data: { fileName: file.name } });

      // 2. Upload file directly to Azure Blob Storage
      const res = await fetch(writeUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      // 3. Save DB record and get read URL
      const { url: readUrl } = await saveImageRecord({ data: { storagePath } });

      setUploading(false);
      nav({
        to: "/results",
        search: {
          q: "caption + place ideas for my photo",
          image_url: readUrl,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-12">
        <h1 className="display text-4xl font-bold mb-2">Insta caption + places</h1>
        <p className="text-muted-foreground mb-8">
          Drop a photo, get caption styles and nearby spot ideas.
        </p>

        {!isPending && !authed && (
          <div className="border border-border bg-card rounded-lg p-4 mb-6 text-sm">
            Sign in first to upload photos.{" "}
            <a href="/auth" className="underline">
              Sign in →
            </a>
          </div>
        )}

        <label className="block border-2 border-dashed border-foreground/40 rounded-xl p-10 text-center cursor-pointer hover:border-accent transition">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
          />
          {preview ? (
            <img src={preview} alt="preview" className="max-h-80 mx-auto rounded-lg" />
          ) : (
            <div>
              <div className="text-4xl mb-2">📸</div>
              <p className="font-medium">Click to choose a photo</p>
              <p className="text-xs text-muted-foreground mt-1">JPG / PNG up to ~10MB</p>
            </div>
          )}
        </label>

        {error && <p className="text-sm text-destructive mt-4">{error}</p>}

        <button
          disabled={!file || uploading || !authed}
          onClick={upload}
          className="mt-6 w-full bg-foreground text-background rounded-lg py-3 font-medium hover:bg-accent hover:text-accent-foreground transition disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Generate captions"}
        </button>
      </main>
    </div>
  );
}
