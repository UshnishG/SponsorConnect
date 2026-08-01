-- Create new enum with only admin and volunteer
CREATE TYPE public.app_role_new AS ENUM ('admin', 'volunteer');

-- Switch user_roles column to the new enum
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role_new USING role::text::public.app_role_new;

-- Drop the old enum and all dependent objects (has_role function + policies)
DROP TYPE public.app_role CASCADE;

-- Rename the new enum to the canonical name
ALTER TYPE public.app_role_new RENAME TO app_role;

-- Recreate the has_role helper with the new enum
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- Recreate the policies that were dropped by CASCADE
CREATE POLICY "Users view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own logs"
  ON public.email_logs
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Recreate the new-user trigger function to ensure it only assigns admin or volunteer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  email_lower text := lower(NEW.email);
BEGIN
  IF email_lower NOT LIKE '%@srmist.edu.in' THEN
    RAISE EXCEPTION 'Only @srmist.edu.in email addresses are allowed';
  END IF;

  INSERT INTO public.profiles (id, name, email, avatar_url, last_login)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  IF email_lower = 'ug9320@srmist.edu.in' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'volunteer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;