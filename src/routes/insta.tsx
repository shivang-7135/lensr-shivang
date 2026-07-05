import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/insta")({
  head: () => ({ meta: [{ title: "Insta caption helper — Lensr" }] }),
  component: InstaPage,
});

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function InstaPage() {
  const nav = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setAuthed(!!data.session))
      .catch(() => setAuthed(false));
  }, []);

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(f: File) {
    // Validate file size
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(
        `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max size is ${MAX_FILE_SIZE_MB} MB.`,
      );
      return;
    }
    setError(null);
    // Revoke previous preview URL
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) {
        setError("Please sign in.");
        setUploading(false);
        return;
      }
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("insta-images").upload(path, file);
      if (upErr) {
        setError(upErr.message);
        setUploading(false);
        return;
      }
      const { error: insertErr } = await supabase
        .from("uploaded_images")
        .insert({ user_id: uid, storage_path: path });
      if (insertErr) {
        console.error("Failed to record uploaded image:", insertErr.message);
        // Non-fatal: continue with caption generation
      }
      const { data: signed } = await supabase.storage
        .from("insta-images")
        .createSignedUrl(path, 3600);
      if (!signed?.signedUrl) {
        setError("Failed to generate image URL. Please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
      // Pass the image URL as a separate param (avoids URL-encoding issues in query string)
      nav({
        to: "/results",
        search: {
          q: "caption + place ideas for my photo",
          image_url: signed.signedUrl,
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

        {authed === false && (
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
