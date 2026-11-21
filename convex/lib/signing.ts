/**
 * HMAC-SHA256 request signing, shared by both directions of the n8n integration.
 *
 *   X-LendLoop-Timestamp: <unix seconds>
 *   X-LendLoop-Signature: v1=<hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))>
 *
 * - The timestamp is inside the signed string and must be within 5 minutes,
 *   so a captured request can't be replayed later.
 * - Verification uses crypto.subtle.verify (constant-time) and accepts a
 *   comma-separated list of secrets so a secret can be rotated without downtime.
 * - Uses Web Crypto only, so it runs in Convex's default runtime and in tests.
 */

const enc = new TextEncoder();
export const MAX_SKEW_SECONDS = 300;
export const MAX_BODY_BYTES = 64 * 1024;

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${timestamp}.${body}`));
  return `v1=${toHex(mac)}`;
}

export async function signedHeaders(secret: string, body: string, now: number = Date.now()) {
  const timestamp = Math.floor(now / 1000).toString();
  return {
    "content-type": "application/json",
    "x-lendloop-timestamp": timestamp,
    "x-lendloop-signature": await sign(secret, timestamp, body),
  };
}

/** Parses "a,b" env values into a list of secrets (current first, previous during rotation). */
export function secretList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type VerifyResult = { ok: true; body: string } | { ok: false; status: number; reason: string };

/** Verifies an incoming request. Reads the raw body exactly once. */
export async function verifyRequest(req: Request, secrets: string[], now: number = Date.now()): Promise<VerifyResult> {
  if (secrets.length === 0) return { ok: false, status: 500, reason: "signing secret not configured" };

  const timestamp = req.headers.get("x-lendloop-timestamp") ?? "";
  const signature = req.headers.get("x-lendloop-signature") ?? "";
  if (!/^\d{9,11}$/.test(timestamp)) return { ok: false, status: 401, reason: "missing or malformed timestamp" };
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, reason: "timestamp outside allowed window" };
  }
  const match = /^v1=([0-9a-f]{64})$/.exec(signature);
  if (!match) return { ok: false, status: 401, reason: "missing or malformed signature" };

  const body = await req.text();
  if (enc.encode(body).length > MAX_BODY_BYTES) return { ok: false, status: 413, reason: "body too large" };

  const mac = fromHex(match[1]);
  const data = enc.encode(`${timestamp}.${body}`);
  for (const secret of secrets) {
    if (await crypto.subtle.verify("HMAC", await hmacKey(secret), mac, data)) return { ok: true, body };
  }
  return { ok: false, status: 401, reason: "signature mismatch" };
}
