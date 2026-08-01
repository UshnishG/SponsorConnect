
-- 1) Status enum
CREATE TYPE public.email_status AS ENUM (
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED_TO_SERVER',
  'FAILED',
  'INVALID_EMAIL',
  'MAILBOX_NOT_FOUND',
  'DOMAIN_NOT_FOUND',
  'MAILBOX_FULL',
  'BLOCKED',
  'TEMPORARY_FAILURE'
);

-- 2) New table
CREATE TABLE public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  recipient_name TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  template_type TEXT,
  gmail_message_id TEXT UNIQUE,
  status public.email_status NOT NULL DEFAULT 'QUEUED',
  failure_reason TEXT,
  smtp_response TEXT,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  bounce_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_messages_user_idx ON public.email_messages(user_id, created_at DESC);
CREATE INDEX email_messages_status_idx ON public.email_messages(status);
CREATE INDEX email_messages_gmid_idx ON public.email_messages(gmail_message_id);
CREATE INDEX email_messages_recipient_idx ON public.email_messages(recipient_email);

-- 3) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;

-- 4) RLS
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own emails" ON public.email_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own emails" ON public.email_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own emails" ON public.email_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own emails" ON public.email_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 5) updated_at trigger
CREATE TRIGGER email_messages_touch_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) Data migration from old email_logs
INSERT INTO public.email_messages (
  id, user_id, sender_email, recipient_name, recipient_email, subject, body,
  template_type, status, failure_reason, created_at, updated_at, processed
)
SELECT
  id,
  user_id,
  sender_email,
  recipient_name,
  recipient_email,
  subject,
  '' AS body,
  template_type,
  CASE
    WHEN status = 'success' THEN 'DELIVERED_TO_SERVER'::public.email_status
    ELSE 'FAILED'::public.email_status
  END,
  error_message,
  sent_at,
  sent_at,
  TRUE
FROM public.email_logs
ON CONFLICT (id) DO NOTHING;

-- 7) Update today_send_count RPC to point at new table (counts sent/delivered as "successful sends")
CREATE OR REPLACE FUNCTION public.today_send_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.email_messages
  WHERE user_id = _user_id
    AND status IN ('SENT', 'DELIVERED_TO_SERVER')
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- 8) Drop old table
DROP TABLE public.email_logs;
