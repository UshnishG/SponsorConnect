ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS footer_image_url text;

INSERT INTO public.email_templates (key, label, description, subject, body_md, header_tagline, event_dates, sign_off, secondary_cta_label, secondary_cta_url, logo_urls, header_image_url, footer_image_url)
VALUES (
  'lead_interview',
  'Lead Interview Invitation',
  'Invite prospective leads for their domain interview panel',
  'Invitation to Lead Interviews — {{domain}} | IEEE Computer Society SRMIST',
  E'We are delighted to inform you that your application for the position of **Lead — {{domain}}** at IEEE Computer Society SRMIST has been shortlisted for the interview round.\n\n**Interview details**\n\n- **Domain:** {{domain}}\n- **Date:** 2 August 2026\n- **Time:** 8:00 PM onwards\n- **Duration:** 15 minutes per candidate\n- **Panel:** All acting heads, along with Ushnish Ghosal and Shloka Nangare\n\nPlease join the WhatsApp group below — your exact interview slot, joining link and any further updates will be shared there. Kindly join at the earliest so you do not miss any announcement.\n\nWe request you to be available a few minutes before your slot and to be prepared to speak about your interest in the **{{domain}}** domain, your relevant experience, and your ideas for the chapter.\n\nWe look forward to speaking with you.',
  'Lead Interviews 2026 — IEEE Computer Society SRMIST',
  '2 August 2026 · 8:00 PM onwards',
  E'Warm regards,\n\n**IEEE Computer Society SRMIST**\nRecruitment Panel',
  'Join WhatsApp Group',
  'https://chat.whatsapp.com/B9ns6VVTaZLEavaHhdyxT2',
  '{}',
  'https://project--cef9e6b1-a811-4309-a193-897e6560c296.lovable.app/__l5e/assets-v1/4985a4d4-5e57-4bf9-a3ac-c8d5b02e4815/ieee-header-banner.png',
  'https://project--cef9e6b1-a811-4309-a193-897e6560c296.lovable.app/__l5e/assets-v1/a575afbf-dca8-4091-bcb4-b5add537cd10/ieee-footer-banner.png'
)
ON CONFLICT (key) DO NOTHING;