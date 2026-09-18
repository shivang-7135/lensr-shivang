-- Azure PostgreSQL Schema for Lensr
-- This schema consolidates application tables and functions for the migration to Azure.
-- Note: better-auth tables are auto-created by the library.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,  -- references better-auth user.id
    role public.app_role NOT NULL DEFAULT 'user',
    UNIQUE(user_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

CREATE TABLE public.saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    intent TEXT NOT NULL DEFAULT 'general',
    response_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_saved_searches_user ON public.saved_searches(user_id, created_at DESC);

CREATE TABLE public.uploaded_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.api_keys (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT
);

CREATE TABLE public.search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    query_normalized TEXT NOT NULL,  -- lowercase, trimmed
    embedding vector(1024),          -- Titan Embeddings v2 = 1024 dims
    intent TEXT NOT NULL,
    structured JSONB NOT NULL,       -- full structured result payload
    markdown TEXT,
    sources JSONB DEFAULT '[]'::jsonb,
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

CREATE INDEX idx_search_cache_embedding ON public.search_cache
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_search_cache_expires ON public.search_cache (expires_at);

CREATE UNIQUE INDEX idx_search_cache_normalized ON public.search_cache (query_normalized);

CREATE OR REPLACE FUNCTION public.match_search_cache(
    query_embedding vector(1024),
    match_threshold FLOAT DEFAULT 0.88,
    match_count INT DEFAULT 1
)
RETURNS TABLE (
    id UUID,
    query TEXT,
    intent TEXT,
    structured JSONB,
    markdown TEXT,
    sources JSONB,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        sc.id,
        sc.query,
        sc.intent,
        sc.structured,
        sc.markdown,
        sc.sources,
        1 - (sc.embedding <=> query_embedding) AS similarity
    FROM public.search_cache sc
    WHERE sc.expires_at > now()
        AND 1 - (sc.embedding <=> query_embedding) > match_threshold
    ORDER BY sc.embedding <=> query_embedding
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.search_cache WHERE expires_at < now();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id TEXT, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
