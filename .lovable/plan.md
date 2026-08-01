
## Overview

Transform the AICSSYC Outreach Email Builder from a single-SMTP tool into a multi-user platform with Google login, per-user Gmail sending, email logging, and admin analytics. Built on **Lovable Cloud** (managed Postgres + Auth + secrets). Existing UI, templates, and branding are preserved.

Note: current stack is **TanStack Start** (not Qwik). Plan is adapted accordingly. Database will use Cloud's Postgres directly (via Supabase client + RLS), not Drizzle — same schema, same guarantees, but zero extra setup and full integration with Cloud auth.

---

## Phase 1 — Auth, per-user Gmail sending, email logging

**Google OAuth setup (you do this, I'll guide you in chat):**
1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Enable **Gmail API** in the API Library
4. Add scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.send`
5. Add redirect URI I'll provide once Cloud is enabled
6. Give me the **Client ID** and **Client Secret** — I'll store them as secrets

**What I build:**
- Enable Lovable Cloud
- Configure Google as auth provider (identity)
- Add a `/auth` sign-in page ("Sign in with Google"), branded
- Protected `_authenticated` route group; move composer to `/` behind it
- Database:
  - `profiles` (id → auth.users, name, email, avatar_url, is_active, created_at, last_login)
  - `user_roles` enum `app_role` = admin | core_team | volunteer, security-definer `has_role()`
  - `email_logs` (id, user_id, sender_email, recipient_name, recipient_email, subject, template_type, status, sent_at)
  - RLS: users see own logs; admins see all
  - Trigger: auto-create profile + assign `volunteer` on signup
- Separate Google OAuth flow for Gmail send scope (stores per-user refresh token in a `gmail_tokens` table, RLS-locked)
- Server function `sendEmailAsUser`: uses stored refresh token → mints access token → Gmail API `messages.send` with the current template, auto-CC `ieeecomputersocietysrmist@gmail.com`, From = logged-in user
- **Fallback**: if user hasn't granted Gmail scope, fall back to existing shared SMTP (`GMAIL_USER` / `GMAIL_APP_PASSWORD`) but From stays shared account (with a UI notice)
- Every send writes an `email_logs` row (success or failed), UTC timestamps
- Toast notifications on send outcome
- Daily send limits enforced server-side: Volunteer 50, Core Team 300, Admin unlimited
- Avatar dropdown in header (name, role badge, sign out, "Connect Gmail" if not granted)

---

## Phase 2 — User dashboard

- `/dashboard` route (protected)
- Sidebar nav (Composer, Dashboard, [Admin])
- Cards: Total sent, Sent today, Last email sent time
- Recent activity timeline
- Table: Date | Recipient | Subject | Template | Status — with search + pagination
- Responsive mobile layout

---

## Phase 3 — Admin dashboard & user management

- `/admin` (admin-only, gated by `has_role`)
- Overview cards: Total Emails Sent, Active Users, Sent Today, Unique Recipients
- User analytics table: User | Role | Emails Sent | Last Active
- Email history table with filters: date range, user, template, status, recipient search
- CSV export of filtered logs
- `/admin/users`: avatar, name, email, role, emails sent, last login
  - Change role (dropdown)
  - Enable/disable user (blocks sending via RLS/policy check)
- Role badges throughout UI

---

## Technical notes (for reference)

- **Storage**: Cloud Postgres via `@supabase/supabase-js`; RLS on every table
- **Server functions** (`createServerFn` + `requireSupabaseAuth`) for: send email, list logs, admin queries, role updates, user enable/disable
- **Server route** `/api/public/oauth/gmail-callback` for the Gmail scope OAuth callback (verifies state, exchanges code, stores refresh token)
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (added after you get them); existing `GMAIL_USER` / `GMAIL_APP_PASSWORD` kept for fallback
- Existing template files (`email-template.ts`, composer UI) unchanged in look; only the send transport swaps

---

## What I need from you to start Phase 1

1. Approve this plan
2. I'll enable Lovable Cloud and set up DB + auth scaffolding
3. Then I'll give you the exact redirect URI + step-by-step for Google Cloud Console
4. You paste Client ID + Secret into the secure form I open
5. I finish Phase 1 wiring and we test end-to-end

Reply "go" (or edit) and I'll start.
