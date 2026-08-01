import { marked } from "marked";
import srmLogoAsset from "@/assets/srm-logo.png.asset.json";

const BASE_URL = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:8080");
const AICSSYC_LOGO = `${BASE_URL}/__l5e/assets-v1/9a130604-9ee4-4773-893a-f387e16da8fa/aicssyc-logo.png`;
const IEEE_CS_LOGO = `${BASE_URL}/__l5e/assets-v1/bc5fc91c-5700-4a7a-aced-4c00be793bc4/ieee-cs-logo.jpeg`;
const FOOTER_IMAGE = `${BASE_URL}/__l5e/assets-v1/996f6ae7-67d5-454a-bbe7-b88f6e1dda40/ieee-cs-footer.png`;
const SRM_LOGO = `${BASE_URL}${srmLogoAsset.url}`;

const WEBSITE_URL = "https://aicssyc.in";
const STUDENT_BROCHURE_URL = "https://drive.google.com/file/d/1bHyUQEx5I0ZHnZOr7-C1FaOIHxFJSJCu/view";
const SPONSORSHIP_BROCHURE_URL = "https://drive.google.com/file/d/1p2iaEtGZCoaajdGABGirQJ282XCRaZth/view?usp=sharing";

/** Any string key — built-ins ("ambassador"/"sponsorship") or custom template slugs. */
export type TemplateType = string;

export const BUILTIN_TEMPLATE_KEYS = ["lead_interviews", "sponsorship_outreach", "campus_ambassador_outreach"] as const;
export type BuiltinTemplateKey = (typeof BUILTIN_TEMPLATE_KEYS)[number];

export const BUILTIN_SECONDARY_CTA: Record<BuiltinTemplateKey, { label: string; url: string } | undefined> = {
  campus_ambassador_outreach: { label: "Student Brochure", url: STUDENT_BROCHURE_URL },
  sponsorship_outreach: { label: "Sponsorship Brochure", url: SPONSORSHIP_BROCHURE_URL },
  lead_interviews: undefined,
};

interface BuildOptions {
  templateType: TemplateType;
  markdownBody: string;
  recipientName?: string;
  headerTagline?: string;
  eventDates?: string;
  signOff?: string;
  /** Optional secondary CTA override; if omitted, falls back to built-in mapping (or hidden). */
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  ctaButtons?: Array<{label: string; url: string; style?: 'filled' | 'outline'}>;
  socialLinks?: Array<{platform: string; url: string}>;
  /** Optional list of logo image URLs shown in the header (overrides the default 3 logos). */
  logoUrls?: string[];
  /** Optional CSS background (color or gradient) for the header band. */
  headerBg?: string;
  /** Optional full-width banner image used INSTEAD of the logo row + tagline block. */
  headerImageUrl?: string;
  /** Optional full-width banner image replacing the default IEEE CS footer strip. */
  footerImageUrl?: string;
  /** Whether to show the AICSSYC logo below the sign off */
  showAicssycLogo?: boolean;
}



export function markdownToHtml(md: string): string {
  marked.setOptions({ gfm: true, breaks: true });
  // Only escape angle brackets that look like actual HTML tags, not markdown emphasis
  const escapedMarkdown = md.replace(/<(?!\/?(strong|em|b|i|u|a|br|p|ul|ol|li|h[1-6]|blockquote|code|pre|hr|table|tr|td|th|thead|tbody|img|div|span)[ \/>])/gi, "&lt;").replace(/(?<!["=])>/g, "&gt;");
  const raw = marked.parse(escapedMarkdown, { async: false }) as string;

  return sanitizeGeneratedMarkdownHtml(raw);
}

function sanitizeGeneratedMarkdownHtml(html: string): string {
  return html
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+srcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])(.*?)\2/gi, (_match, attr: string, quote: string, value: string) => {
      const trimmed = value.trim();
      if (/^(https?:|mailto:|tel:|#|\/)/i.test(trimmed)) return ` ${attr}=${quote}${escapeAttr(trimmed)}${quote}`;
      return "";
    });
}

export function buildEmailHtml({
  templateType,
  markdownBody,
  recipientName,
  headerTagline,
  eventDates,
  signOff,
  secondaryCtaLabel,
  secondaryCtaUrl,
  ctaButtons,
  logoUrls,
  headerBg,
  headerImageUrl,
  footerImageUrl,
  socialLinks,
  showAicssycLogo,
}: BuildOptions): string {

  const tagline = (headerTagline?.trim() || "").trim();
  const dates = (eventDates?.trim() || "").trim();
  const bodyHtml = markdownToHtml(markdownBody.trim());
  const greeting = recipientName?.trim() ? `Dear ${escapeHtml(recipientName.trim())},` : "";

  // Resolve secondary CTA: explicit override > builtin mapping > none
  const builtin = (BUILTIN_SECONDARY_CTA as Record<string, { label: string; url: string } | undefined>)[templateType];
  const secLabel = (secondaryCtaLabel?.trim() || builtin?.label || "").trim();
  const secUrl = (secondaryCtaUrl?.trim() || builtin?.url || "").trim();
  const hasSecondary = Boolean(secLabel && secUrl);

  const signOffHtml = signOff?.trim() ? markdownToHtml(signOff.trim()) : "";

  // Resolve header logos: explicit override list > default trio
  const resolvedLogos =
    logoUrls && logoUrls.length > 0
      ? logoUrls.filter((u) => /^https?:\/\//i.test(u.trim())).map((u) => u.trim())
      : [
          { src: IEEE_CS_LOGO, alt: "IEEE Computer Society SRMIST" },
          { src: SRM_LOGO, alt: "SRM Institute of Science and Technology" },
        ];
  const logoObjs = Array.isArray(resolvedLogos) && typeof resolvedLogos[0] === "string"
    ? (resolvedLogos as string[]).map((src) => ({ src, alt: "" }))
    : (resolvedLogos as Array<{ src: string; alt: string }>);
  const colWidth = logoObjs.length > 0 ? Math.floor(100 / logoObjs.length) : 100;
  const logoCells = logoObjs
    .map(
      (l) => `<td align="center" valign="middle" width="${colWidth}%" style="padding:6px;">
      <img src="${escapeAttr(l.src)}" alt="${escapeHtml(l.alt)}" style="max-height:42px;max-width:140px;width:auto;display:block;margin:0 auto;" />
    </td>`,
    )
    .join("");

  const headerBackground =
    headerBg && headerBg.trim()
      ? `background:${escapeAttr(headerBg.trim())};border-bottom:3px solid rgba(0,0,0,0.15);`
      : `background:#0b1512;background-image:linear-gradient(135deg,#000000 0%,#062c22 40%,#065f46 100%);border-bottom:3px solid #047857;`;

  const bannerUrl = headerImageUrl && /^https?:\/\//i.test(headerImageUrl.trim()) ? headerImageUrl.trim() : "";
  const footerUrl =
    footerImageUrl && /^https?:\/\//i.test(footerImageUrl.trim()) ? footerImageUrl.trim() : FOOTER_IMAGE;


  const getButtonStyle = (style?: 'filled' | 'outline') => {
    if (style === 'outline') {
      return 'display:block;text-align:center;padding:10px 10px;background:#ffffff;color:#065f46;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;border:2px solid #065f46;';
    }
    return 'display:block;text-align:center;padding:12px 10px;background:linear-gradient(135deg,#000000 0%,#065f46 100%);color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;';
  };

  let ctaButtonsHtml = '';
  if (ctaButtons && ctaButtons.length > 0) {
    if (ctaButtons.length === 2) {
      ctaButtonsHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">
        <tr>
          <td width="50%" valign="top" style="padding-right:6px;">
            <a href="${escapeAttr(ctaButtons[0].url)}" target="_blank" rel="noopener noreferrer" style="${getButtonStyle(ctaButtons[0].style)}">${escapeHtml(ctaButtons[0].label)}</a>
          </td>
          <td width="50%" valign="top" style="padding-left:6px;">
            <a href="${escapeAttr(ctaButtons[1].url)}" target="_blank" rel="noopener noreferrer" style="${getButtonStyle(ctaButtons[1].style)}">${escapeHtml(ctaButtons[1].label)}</a>
          </td>
        </tr>
      </table>`;
    } else {
      ctaButtonsHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">
        ${ctaButtons.map(btn => `
        <tr>
          <td valign="top" style="padding-bottom:12px;">
            <a href="${escapeAttr(btn.url)}" target="_blank" rel="noopener noreferrer" style="${getButtonStyle(btn.style)}">${escapeHtml(btn.label)}</a>
          </td>
        </tr>`).join('')}
      </table>`;
    }
  } else {
    ctaButtonsHtml = hasSecondary
      ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">
        <tr>
          <td width="50%" valign="top" style="padding-right:6px;">
            <a href="${WEBSITE_URL}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;padding:12px 10px;background:linear-gradient(135deg,#000000 0%,#065f46 100%);color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Visit our Website</a>
          </td>
          <td width="50%" valign="top" style="padding-left:6px;">
            <a href="${escapeAttr(secUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;padding:10px 10px;background:#ffffff;color:#065f46;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;border:2px solid #065f46;">${escapeHtml(secLabel)}</a>
          </td>
        </tr>
      </table>`
      : `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">
        <tr>
          <td valign="top">
            <a href="${WEBSITE_URL}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;padding:12px 10px;background:linear-gradient(135deg,#000000 0%,#065f46 100%);color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Visit our Website</a>
          </td>
        </tr>
      </table>`;
  }

  let socialLinksHtml = "";
  if (socialLinks && socialLinks.length > 0) {
    const icons = socialLinks.map(link => {
      const p = link.platform.toLowerCase();
      let slug = 'domain'; // default website
      if (p.includes('linkedin')) slug = 'linkedin';
      else if (p.includes('instagram')) slug = 'instagram-new';
      else if (p.includes('youtube')) slug = 'youtube-play';
      else if (p.includes('facebook')) slug = 'facebook-new';
      else if (p === 'x' || p.includes('twitter')) slug = 'twitterx';
      
      const iconUrl = `https://img.icons8.com/ios-filled/50/065f46/${slug}.png`;
      return `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-right:16px; text-decoration:none;"><img src="${iconUrl}" alt="${escapeAttr(link.platform)}" width="24" height="24" style="display:block; border:none;" /></a>`;
    }).join("");
    socialLinksHtml = `<div>${icons}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(tagline || "AICSSYC 2026")}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          ${
            bannerUrl
              ? `<tr>
            <td style="padding:0;line-height:0;position:relative;">
              <img src="${escapeAttr(bannerUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          ${tagline || dates ? `<tr>
            <td style="background:#ffffff;padding:18px 32px;text-align:center;">
              ${tagline ? `<h1 style="margin:0;font-size:20px;line-height:1.3;color:#1a1a2e;font-weight:700;letter-spacing:0.2px;">${escapeHtml(tagline)}</h1>` : ""}
              ${dates ? `<p style="margin:6px 0 0 0;font-size:13px;color:#065f46;font-weight:600;letter-spacing:0.3px;">${escapeHtml(dates)}</p>` : ""}
            </td>
          </tr>` : ""}`
              : `<tr>
            <td style="${headerBackground}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:24px 32px 22px 32px;vertical-align:top;">
                    ${logoObjs.length > 0 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px 8px;border:1px solid rgba(255,255,255,0.15);">
                      <tr>
                        ${logoCells}
                      </tr>
                    </table>` : ""}

                    ${tagline ? `<h1 style="margin:18px 0 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700;text-align:center;letter-spacing:0.2px;">${escapeHtml(tagline)}</h1>` : ""}
                    ${dates ? `<p style="margin:8px 0 0 0;font-size:13px;color:#a7f3d0;font-weight:600;text-align:center;letter-spacing:0.3px;">${escapeHtml(dates)}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
          }


          <tr>
            <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.65;color:#1f2937;">
              ${greeting ? `<p style="margin:0 0 16px 0;">${greeting}</p>` : ""}
              <div class="md-body">${bodyHtml}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px 32px;">
              ${ctaButtonsHtml}
            </td>
          </tr>

          ${signOffHtml ? `
          <tr>
            <td style="padding:20px 32px ${socialLinksHtml ? '16px' : '28px'} 32px;font-size:15px;line-height:1.65;color:#1f2937;">
              <div class="md-body">${signOffHtml}</div>
            </td>
          </tr>` : `<tr><td style="padding:0 0 20px 0;"></td></tr>`}

          ${showAicssycLogo ? `
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <img src="${escapeAttr(AICSSYC_LOGO)}" alt="AICSSYC Logo" style="display:block;max-width:140px;height:auto;border:none;margin:0;" />
            </td>
          </tr>` : ""}

          ${socialLinksHtml ? `
          <tr>
            <td style="padding:0 32px 28px 32px;">
              ${socialLinksHtml}
            </td>
          </tr>` : ""}

          ${footerUrl ? `
          <tr>
            <td style="padding:0;background:#0b1512;">
              <a href="https://www.ieeecssrm.in/" style="display:block;line-height:0;text-decoration:none;">
                <img src="${escapeAttr(footerUrl)}" alt="IEEE Computer Society SRMIST" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px;background:#0b1512;text-align:center;">
              <a href="https://www.ieeecssrm.in/" style="color:#a7f3d0;font-size:12px;text-decoration:none;font-weight:600;letter-spacing:0.5px;">IEEE Computer Society SRMIST</a>
            </td>
          </tr>` : ""}
        </table>
        <p style="margin:14px 0 0 0;font-size:11px;color:#94a3b8;">© AICSSYC · IEEE Computer Society SRMIST</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
