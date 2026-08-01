export type MailAttachment = { filename: string; content: string; contentType?: string };

export type Mailer = {
  send: (opts: {
    from: string;
    to: string;
    cc?: string;
    subject: string;
    html: string;
    messageId: string;
    attachments?: MailAttachment[];
  }) => Promise<{ smtpResponse: string }>;
  close: () => Promise<void>;
};

type SmtpSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close?: () => void | Promise<void>;
};

type CloudflareConnect = (
  address: { hostname: string; port: number },
  options: { secureTransport: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
) => SmtpSocket;

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function encodeHeader(value: string): string {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${toBase64Utf8(value)}?=`;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function getEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function normalizeRecipients(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => getEmailAddress(part))
    .filter(Boolean);
}

function buildMimeMessage(opts: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  messageId: string;
  attachments?: MailAttachment[];
}): string {
  const headers = [
    `From: ${sanitizeHeader(opts.from)}`,
    `To: ${sanitizeHeader(opts.to)}`,
    opts.cc ? `Cc: ${sanitizeHeader(opts.cc)}` : "",
    `Subject: ${encodeHeader(sanitizeHeader(opts.subject))}`,
    `Message-ID: ${sanitizeHeader(opts.messageId)}`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
  ].filter(Boolean);

  if (!opts.attachments?.length) {
    return [
      ...headers,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(toBase64Utf8(opts.html)),
    ].join("\r\n");
  }

  const boundary = `=_aicssyc_${crypto.randomUUID().replaceAll("-", "")}`;
  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64Utf8(opts.html)),
    ...opts.attachments.flatMap((attachment) => [
      `--${boundary}`,
      `Content-Type: ${sanitizeHeader(attachment.contentType || "application/octet-stream")}; name="${sanitizeHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${sanitizeHeader(attachment.filename)}"`,
      "",
      wrapBase64(toBase64Utf8(attachment.content)),
    ]),
    `--${boundary}--`,
    "",
  ];

  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

function dotStuff(message: string): string {
  return message.replace(/(^|\r\n)\./g, "$1..");
}

async function loadCloudflareConnect(): Promise<CloudflareConnect | null> {
  try {
    const specifier = ["cloudflare", "sockets"].join(":");
    const mod = (await import(/* @vite-ignore */ specifier)) as { connect?: CloudflareConnect };
    if (typeof mod.connect !== "function") return null;
    return mod.connect;
  } catch {
    return null;
  }
}

async function createCloudflareSmtpMailer(user: string, password: string): Promise<Mailer> {
  const connect = await loadCloudflareConnect();
  if (!connect) return createNodeSmtpMailer(user, password);

  return {
    send: async (opts) => {
      const socket = connect(
        { hostname: "smtp.gmail.com", port: 465 },
        { secureTransport: "on", allowHalfOpen: false },
      );
      const reader = socket.readable.getReader();
      const writer = socket.writable.getWriter();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      const readResponse = async () => {
        while (true) {
          const firstLineEnd = buffer.indexOf("\r\n");
          if (firstLineEnd >= 0) {
            const firstLine = buffer.slice(0, firstLineEnd);
            const firstMatch = firstLine.match(/^(\d{3})([ -])/);
            if (firstMatch) {
              const code = firstMatch[1];
              if (firstMatch[2] === " ") {
                buffer = buffer.slice(firstLineEnd + 2);
                return { code: Number(code), text: firstLine };
              }
              const completeMarker = `\r\n${code} `;
              const responseEnd = buffer.indexOf(completeMarker);
              if (responseEnd >= 0) {
                const endOfFinalLine = buffer.indexOf("\r\n", responseEnd + 2);
                if (endOfFinalLine >= 0) {
                  const text = buffer.slice(0, endOfFinalLine).replaceAll("\r\n", "\n");
                  buffer = buffer.slice(endOfFinalLine + 2);
                  return { code: Number(code), text };
                }
              }
            }
          }
          const { value, done } = await reader.read();
          if (done) throw new Error("SMTP connection closed unexpectedly.");
          buffer += decoder.decode(value, { stream: true });
        }
      };

      const expect = async (allowed: number[]) => {
        const response = await readResponse();
        if (!allowed.includes(response.code)) throw new Error(response.text);
        return response;
      };

      const command = async (line: string, allowed: number[]) => {
        await writer.write(encoder.encode(`${line}\r\n`));
        return expect(allowed);
      };

      try {
        await expect([220]);
        await command("EHLO outreachieee.lovable.app", [250]);
        await command(`AUTH PLAIN ${toBase64Utf8(`\0${user}\0${password}`)}`, [235]);
        await command(`MAIL FROM:<${getEmailAddress(opts.from)}>`, [250]);
        for (const recipient of [...normalizeRecipients(opts.to), ...normalizeRecipients(opts.cc)]) {
          await command(`RCPT TO:<${recipient}>`, [250, 251]);
        }
        await command("DATA", [354]);
        await writer.write(encoder.encode(`${dotStuff(buildMimeMessage(opts))}\r\n.\r\n`));
        const dataResp = await expect([250]);
        await command("QUIT", [221]).catch(() => undefined);
        return { smtpResponse: dataResp.text };
      } finally {
        writer.releaseLock();
        reader.releaseLock();
        await socket.close?.();
      }
    },
    close: async () => {},
  };
}

async function createNodeSmtpMailer(user: string, password: string): Promise<Mailer> {
  try {
    const specifier = ["node", "tls"].join(":");
    const tls = (await import(/* @vite-ignore */ specifier)) as typeof import("node:tls");

    return {
      send: async (opts) =>
        new Promise<{ smtpResponse: string }>((resolve, reject) => {
          const socket = tls.connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
          let buffer = "";
          let settled = false;

          const cleanup = () => {
            socket.removeAllListeners("data");
            socket.removeAllListeners("error");
            socket.removeAllListeners("timeout");
            socket.removeAllListeners("close");
          };

          const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            socket.destroy();
            reject(error);
          };

          const readResponse = (): Promise<{ code: number; text: string }> =>
            new Promise((responseResolve, responseReject) => {
              let done = false;
              const finish = (value: { code: number; text: string }) => {
                if (done) return;
                done = true;
                socket.off("data", onData);
                socket.off("error", onError);
                responseResolve(value);
              };
              const failResponse = (error: Error) => {
                if (done) return;
                done = true;
                socket.off("data", onData);
                socket.off("error", onError);
                responseReject(error);
              };
              const tryParse = () => {
                const firstLineEnd = buffer.indexOf("\r\n");
                if (firstLineEnd < 0) return;
                const firstLine = buffer.slice(0, firstLineEnd);
                const firstMatch = firstLine.match(/^(\d{3})([ -])/);
                if (!firstMatch) return;
                const code = firstMatch[1];
                if (firstMatch[2] === " ") {
                  buffer = buffer.slice(firstLineEnd + 2);
                  finish({ code: Number(code), text: firstLine });
                  return;
                }
                const marker = `\r\n${code} `;
                const responseEnd = buffer.indexOf(marker);
                if (responseEnd < 0) return;
                const endOfFinalLine = buffer.indexOf("\r\n", responseEnd + 2);
                if (endOfFinalLine < 0) return;
                const text = buffer.slice(0, endOfFinalLine).replaceAll("\r\n", "\n");
                buffer = buffer.slice(endOfFinalLine + 2);
                finish({ code: Number(code), text });
              };

              const onData = (chunk: Buffer) => {
                buffer += chunk.toString("utf8");
                tryParse();
              };
              const onError = (error: Error) => failResponse(error);
              socket.on("data", onData);
              socket.once("error", onError);
              tryParse();
            });

          const expect = async (allowed: number[]) => {
            const response = await readResponse();
            if (!allowed.includes(response.code)) throw new Error(response.text);
            return response;
          };

          const command = async (line: string, allowed: number[]) => {
            socket.write(`${line}\r\n`);
            return expect(allowed);
          };

          socket.setTimeout(30_000, () => fail(new Error("SMTP connection timed out.")));
          socket.once("error", fail);
          socket.once("close", () => {
            if (!settled) fail(new Error("SMTP connection closed unexpectedly."));
          });

          void (async () => {
            try {
              await expect([220]);
              await command("EHLO outreachieee.lovable.app", [250]);
              await command(`AUTH PLAIN ${toBase64Utf8(`\0${user}\0${password}`)}`, [235]);
              await command(`MAIL FROM:<${getEmailAddress(opts.from)}>`, [250]);
              for (const recipient of [...normalizeRecipients(opts.to), ...normalizeRecipients(opts.cc)]) {
                await command(`RCPT TO:<${recipient}>`, [250, 251]);
              }
              await command("DATA", [354]);
              socket.write(`${dotStuff(buildMimeMessage(opts))}\r\n.\r\n`);
              const dataResp = await expect([250]);
              await command("QUIT", [221]).catch(() => undefined);
              if (!settled) {
                settled = true;
                cleanup();
                socket.end();
                resolve({ smtpResponse: dataResp.text });
              }
            } catch (error: any) {
              fail(error instanceof Error ? error : new Error(error?.message ?? "SMTP send failed."));
            }
          })();
        }),
      close: async () => {},
    };
  } catch (error) {
    console.error("Node SMTP fallback unavailable:", error);
    throw new Error("SMTP transport is unavailable in this runtime. Publish the app, then try sending again.");
  }
}

export async function createMailer(): Promise<Mailer> {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!user || !password) throw new Error("SMTP not configured (GMAIL_USER/GMAIL_APP_PASSWORD).");
  return createCloudflareSmtpMailer(user, password);
}