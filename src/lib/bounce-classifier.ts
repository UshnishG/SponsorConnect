// Classifies SMTP responses and bounce DSN diagnostics into our email_status enum.
// Used both for immediate SMTP-rejection classification and for asynchronous
// bounce classification from Mailer-Daemon DSN reports.

export type EmailFailureStatus =
  | "INVALID_EMAIL"
  | "MAILBOX_NOT_FOUND"
  | "DOMAIN_NOT_FOUND"
  | "MAILBOX_FULL"
  | "BLOCKED"
  | "TEMPORARY_FAILURE"
  | "FAILED";

export type ClassifiedFailure = {
  status: EmailFailureStatus;
  reason: string; // human-friendly reason
};

const RULES: Array<{ status: EmailFailureStatus; reason: string; patterns: RegExp[] }> = [
  {
    status: "DOMAIN_NOT_FOUND",
    reason: "Domain does not exist",
    patterns: [
      /dns\s+lookup\s+fail/i,
      /no\s+such\s+domain/i,
      /domain\s+not\s+found/i,
      /nxdomain/i,
      /no\s+mx\s+record/i,
      /unrouteable\s+address/i,
      /host\s+or\s+domain\s+name\s+not\s+found/i,
      /5\.1\.2/,
    ],
  },
  {
    status: "MAILBOX_NOT_FOUND",
    reason: "Mailbox not found",
    patterns: [
      /mailbox\s+(does\s+not\s+exist|not\s+found|unavailable)/i,
      /no\s+such\s+user/i,
      /account\s+that\s+you\s+tried\s+to\s+reach\s+does\s+not\s+exist/i,
      /recipient\s+address\s+rejected.*user\s+unknown/i,
      /user\s+unknown/i,
      /5\.1\.1/,
    ],
  },
  {
    status: "INVALID_EMAIL",
    reason: "Mail ID is invalid",
    patterns: [
      /invalid\s+recipient/i,
      /recipient\s+address\s+rejected/i,
      /bad\s+address\s+syntax/i,
      /invalid\s+address/i,
      /malformed\s+address/i,
      /5\.1\.3/,
      /5\.1\.7/,
    ],
  },
  {
    status: "MAILBOX_FULL",
    reason: "Recipient mailbox is full",
    patterns: [
      /mailbox\s+full/i,
      /over\s+quota/i,
      /quota\s+exceeded/i,
      /insufficient\s+system\s+storage/i,
      /5\.2\.2/,
      /4\.2\.2/,
    ],
  },
  {
    status: "BLOCKED",
    reason: "Recipient server rejected this email",
    patterns: [
      /blocked/i,
      /spam/i,
      /blacklist(ed)?/i,
      /reputation/i,
      /policy\s+reject/i,
      /message\s+rejected/i,
      /5\.7\.1/,
      /5\.7\.26/,
    ],
  },
  {
    status: "TEMPORARY_FAILURE",
    reason: "Temporary server issue. Retry later.",
    patterns: [
      /try\s+again\s+later/i,
      /temporary\s+failure/i,
      /temporarily\s+deferred/i,
      /greylist/i,
      /4\.\d\.\d/,
      /^4\d\d\b/,
    ],
  },
];

/**
 * Classify a raw SMTP/bounce diagnostic string into a status + human reason.
 * Falls back to FAILED with the raw first line if nothing matches.
 */
export function classifyFailure(raw: string | null | undefined): ClassifiedFailure {
  const text = (raw ?? "").trim();
  if (!text) return { status: "FAILED", reason: "Delivery failed" };

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return { status: rule.status, reason: rule.reason };
    }
  }

  const firstLine = text.split(/\r?\n/)[0]?.slice(0, 240) ?? "Delivery failed";
  return { status: "FAILED", reason: firstLine };
}

export function humanStatusLabel(status: string): string {
  switch (status) {
    case "QUEUED": return "Queued";
    case "SENDING": return "Sending";
    case "SENT": return "Sent";
    case "DELIVERED_TO_SERVER": return "Delivered to server";
    case "INVALID_EMAIL": return "Invalid email";
    case "MAILBOX_NOT_FOUND": return "Mailbox not found";
    case "DOMAIN_NOT_FOUND": return "Domain not found";
    case "MAILBOX_FULL": return "Mailbox full";
    case "BLOCKED": return "Blocked";
    case "TEMPORARY_FAILURE": return "Temporary failure";
    case "FAILED": return "Failed";
    default: return status;
  }
}
