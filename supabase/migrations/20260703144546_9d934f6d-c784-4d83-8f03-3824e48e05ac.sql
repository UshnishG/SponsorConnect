
-- Revoke anon EXECUTE on SECURITY DEFINER functions (they must not be public)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.today_send_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;

-- Split the single ALL policy on gmail_tokens into per-command owner-scoped policies
DROP POLICY IF EXISTS "Users manage own gmail tokens" ON public.gmail_tokens;

CREATE POLICY "Users view own gmail tokens"
  ON public.gmail_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own gmail tokens"
  ON public.gmail_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own gmail tokens"
  ON public.gmail_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own gmail tokens"
  ON public.gmail_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
