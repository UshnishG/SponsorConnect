declare module "cloudflare:sockets" {
  export type Socket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close?: () => void | Promise<void>;
  };

  export function connect(
    address: { hostname: string; port: number },
    options: { secureTransport: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
  ): Socket;
}