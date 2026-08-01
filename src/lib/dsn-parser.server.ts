// Minimal MIME + Delivery Status Notification (RFC 3464) parser.
// Only extracts what BounceMonitor needs: original Message-ID (or References /
// In-Reply-To), the failed recipient, and a diagnostic / status code.

export type ParsedBounce = {
  originalMessageId: string | null;
  recipient: string | null;
  diagnostic: string | null; // raw human-ish reason (Diagnostic-Code or Status)
  statusCode: string | null; // e.g. "5.1.1"
};

type MimeHeaders = Record<string, string>;

function decodeHeaderValue(raw: string): string {
  return raw
    .replace(/\r?\n[ \t]+/g, " ") // unfold
    .trim();
}

function parseHeaders(block: string): MimeHeaders {
  const out: MimeHeaders = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    // Later occurrences with the same name are rare; keep first.
    if (!(key in out)) out[key] = val;
  }
  return out;
}

function splitHeadersBody(part: string): { headers: MimeHeaders; body: string } {
  const m = part.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) {
    return { headers: parseHeaders(part), body: "" };
  }
  return {
    headers: parseHeaders(part.slice(0, m.index)),
    body: part.slice(m.index + m[0].length),
  };
}

function getBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const m = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function splitMultipart(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  const parts: string[] = [];
  const chunks = body.split(delim);
  for (const chunk of chunks) {
    // strip leading CRLF and trailing "--" close delimiter marker
    if (chunk === "" || chunk === "--" || chunk.startsWith("--")) continue;
    const cleaned = chunk.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (cleaned) parts.push(cleaned);
  }
  return parts;
}

function extractAngle(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/<([^>]+)>/);
  return m ? m[1].trim() : value.trim().replace(/^"|"$/g, "");
}

/** Best-effort parse of a DSN-style bounce email. */
export function parseBounceMessage(raw: string): ParsedBounce {
  const result: ParsedBounce = {
    originalMessageId: null,
    recipient: null,
    diagnostic: null,
    statusCode: null,
  };

  const { headers, body } = splitHeadersBody(raw);
  // Sometimes DSN references the original id via References / In-Reply-To
  const inReply = extractAngle(headers["in-reply-to"]);
  const references = extractAngle(headers["references"]);
  if (inReply) result.originalMessageId = inReply;
  else if (references) result.originalMessageId = references;

  const boundary = getBoundary(headers["content-type"]);
  const parts = boundary ? splitMultipart(body, boundary) : [body];

  for (const part of parts) {
    const { headers: pHeaders, body: pBody } = splitHeadersBody(part);
    const ct = (pHeaders["content-type"] ?? "").toLowerCase();

    if (ct.startsWith("message/delivery-status")) {
      // Per RFC 3464: per-message fields, then blank line, then per-recipient blocks
      const blocks = pBody.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        const fields = parseHeaders(block);
        if (fields["final-recipient"] && !result.recipient) {
          // Format: "rfc822; user@example.com"
          const m = fields["final-recipient"].match(/;\s*(.+)$/);
          result.recipient = (m ? m[1] : fields["final-recipient"]).trim();
        }
        if (fields["original-recipient"] && !result.recipient) {
          const m = fields["original-recipient"].match(/;\s*(.+)$/);
          result.recipient = (m ? m[1] : fields["original-recipient"]).trim();
        }
        if (fields["status"] && !result.statusCode) {
          result.statusCode = fields["status"].trim();
        }
        if (fields["diagnostic-code"] && !result.diagnostic) {
          const m = fields["diagnostic-code"].match(/;\s*(.+)$/s);
          result.diagnostic = (m ? m[1] : fields["diagnostic-code"]).trim();
        }
      }
    } else if (ct.startsWith("message/rfc822") || ct.startsWith("text/rfc822-headers")) {
      // Original message headers — extract Message-ID
      const inner = splitHeadersBody(pBody);
      const mid = extractAngle(inner.headers["message-id"]);
      if (mid && !result.originalMessageId) result.originalMessageId = mid;
    } else if (ct.startsWith("text/plain") && !result.diagnostic) {
      // fall back: look for common SMTP-shaped lines in the human-readable part
      const smtpLine = pBody.match(/([45]\d\d[\s-][^\r\n]+)/);
      if (smtpLine) result.diagnostic = smtpLine[1].trim();
    }
  }

  // Last-resort: scan whole raw for a Message-ID we might have missed.
  if (!result.originalMessageId) {
    const m = raw.match(/^Message-ID:\s*<([^>]+)>/mi);
    if (m) result.originalMessageId = m[1].trim();
  }

  return result;
}
