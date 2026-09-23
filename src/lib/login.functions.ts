import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Public (unauthenticated) server function: emails a sign-in code + magic link
 * via the app's Gmail SMTP. Returns `{ via: "supabase" }` when this deployment
 * lacks the service role key / Gmail credentials, so the client can fall back to
 * Supabase's built-in mailer.
 */
export const requestLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const { sendLoginEmail } = await import("./login-email.server");
    return sendLoginEmail(data.email);
  });
