ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS logo_urls text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS header_bg text;