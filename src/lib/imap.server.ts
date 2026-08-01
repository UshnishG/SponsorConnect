// Minimal IMAP4rev1 client over Cloudflare's `cloudflare:sockets`.
// Just enough to LOGIN, SELECT INBOX, UID SEARCH, UID FETCH BODY.PEEK[],
// UID STORE +FLAGS \Seen, LOGOUT. Not a general-purpose library.

type SmtpSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close?: () => void | Promise<void>;
};

type Connect = (
  address: { hostname: string; port: number },
  options: { secureTransport: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
) => SmtpSocket;

async function loadConnect(): Promise<Connect | null> {
  try {
    const specifier = ["cloudflare", "sockets"].join(":");
    const mod = (await import(/* @vite-ignore */ specifier)) as { connect?: Connect };
    if (typeof mod.connect !== "function") return null;
    return mod.connect;
  } catch (e) {
    console.error("[IMAP] cloudflare:sockets import failed:", e);
    return null;
  }
}

export type FetchedMessage = {
  uid: number;
  raw: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class ImapClient {
  private socket: SmtpSocket | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = "";
  private tagCounter = 0;

  constructor(private opts: { host: string; port: number; user: string; password: string }) {}

  async connect(): Promise<void> {
    const connect = await loadConnect();
    if (!connect) throw new Error("IMAP transport unavailable in this runtime.");
    this.socket = connect(
      { hostname: this.opts.host, port: this.opts.port },
      { secureTransport: "on", allowHalfOpen: false },
    );
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();

    // Server greeting: "* OK ..."
    await this.readUntilLine((l) => l.startsWith("* OK"));
    // LOGIN
    await this.command(`LOGIN ${quote(this.opts.user)} ${quote(this.opts.password)}`);
    await this.command("SELECT INBOX");
  }

  private nextTag(): string {
    this.tagCounter += 1;
    return `A${this.tagCounter.toString().padStart(4, "0")}`;
  }

  private async writeLine(line: string): Promise<void> {
    if (!this.writer) throw new Error("IMAP not connected");
    await this.writer.write(encoder.encode(line + "\r\n"));
  }

  private async readChunk(): Promise<void> {
    if (!this.reader) throw new Error("IMAP not connected");
    const { value, done } = await this.reader.read();
    if (done) throw new Error("IMAP connection closed");
    this.buffer += decoder.decode(value, { stream: true });
  }

  /** Read whole lines (CRLF-terminated) as they arrive, yielding one line at a time. */
  private async readLine(): Promise<string> {
    while (true) {
      const idx = this.buffer.indexOf("\r\n");
      if (idx >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        return line;
      }
      await this.readChunk();
    }
  }

  /** Read exactly n bytes (used for literal `{N}` responses). */
  private async readBytes(n: number): Promise<string> {
    while (this.buffer.length < n) await this.readChunk();
    const out = this.buffer.slice(0, n);
    this.buffer = this.buffer.slice(n);
    return out;
  }

  private async readUntilLine(predicate: (line: string) => boolean): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (predicate(line)) return lines;
    }
  }

  /** Send tagged command, collect all response lines including the tagged reply. */
  async command(command: string): Promise<string[]> {
    const tag = this.nextTag();
    await this.writeLine(`${tag} ${command}`);
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.startsWith(`${tag} `)) {
        if (!/^\S+\s+OK/i.test(line)) {
          throw new Error(`IMAP command failed: ${command} -> ${line}`);
        }
        return lines;
      }
    }
  }

  /** UID SEARCH — returns list of matching UIDs. */
  async searchBounceUnseen(): Promise<number[]> {
    // "OR" only takes two args in IMAP — nest for multi.
    // (FROM mailer-daemon OR FROM "Mail Delivery Subsystem" OR SUBJECT "Delivery Status Notification")
    const query =
      'UID SEARCH UNSEEN OR OR FROM "mailer-daemon" FROM "Mail Delivery Subsystem" SUBJECT "Delivery Status Notification"';
    const lines = await this.command(query);
    for (const line of lines) {
      const m = line.match(/^\* SEARCH([\s\d]*)$/);
      if (m) {
        return m[1]
          .trim()
          .split(/\s+/)
          .filter((s) => s.length > 0)
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n));
      }
    }
    return [];
  }

  /** UID FETCH BODY.PEEK[] for a single UID; parses `{N}` literal. */
  async fetchRaw(uid: number): Promise<string | null> {
    const tag = this.nextTag();
    await this.writeLine(`${tag} UID FETCH ${uid} (BODY.PEEK[])`);
    let raw: string | null = null;
    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) {
        if (!/^\S+\s+OK/i.test(line)) return null;
        return raw;
      }
      // Look for a literal declaration like: * 42 FETCH (UID 42 BODY[] {12345}
      const litMatch = line.match(/\{(\d+)\}\s*$/);
      if (litMatch) {
        const size = Number(litMatch[1]);
        raw = await this.readBytes(size);
        // consume trailing line (usually ")" closing the parenthesised list)
        await this.readLine();
      }
    }
  }

  async markSeen(uid: number): Promise<void> {
    try {
      await this.command(`UID STORE ${uid} +FLAGS (\\Seen)`);
    } catch (e) {
      console.warn(`[IMAP] failed to mark UID ${uid} seen:`, e);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.command("LOGOUT").catch(() => undefined);
    } finally {
      try { this.writer?.releaseLock(); } catch {}
      try { this.reader?.releaseLock(); } catch {}
      try { await this.socket?.close?.(); } catch {}
      this.socket = null;
      this.reader = null;
      this.writer = null;
    }
  }
}

function quote(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function fetchBounceMessages(opts: {
  host?: string;
  port?: number;
  user: string;
  password: string;
  maxMessages?: number;
}): Promise<FetchedMessage[]> {
  const client = new ImapClient({
    host: opts.host ?? "imap.gmail.com",
    port: opts.port ?? 993,
    user: opts.user,
    password: opts.password,
  });
  const out: FetchedMessage[] = [];
  try {
    await client.connect();
    const uids = await client.searchBounceUnseen();
    const limit = Math.min(uids.length, opts.maxMessages ?? 25);
    for (let i = 0; i < limit; i++) {
      const uid = uids[i];
      const raw = await client.fetchRaw(uid);
      if (raw) out.push({ uid, raw });
    }
    // Only mark as seen AFTER we've fetched them all (idempotency: if fetch
    // half-fails, next run picks them up again).
    for (const m of out) await client.markSeen(m.uid);
  } finally {
    await client.logout();
  }
  return out;
}
