#!/usr/bin/env node
// Smoke test for the signed n8n -> Convex endpoints against a live deployment.
// Reads LENDLOOP_CONVEX_SITE_URL and LENDLOOP_API_SECRET from n8n/.env (git-ignored).
//   node scripts/smoke-automation.mjs
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../n8n/.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const base = env.LENDLOOP_CONVEX_SITE_URL;
const secret = env.LENDLOOP_API_SECRET;
if (!base || !secret) throw new Error("n8n/.env needs LENDLOOP_CONVEX_SITE_URL and LENDLOOP_API_SECRET");

function headers(body, key = secret, ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
  return { "content-type": "application/json", "x-lendloop-timestamp": String(ts), "x-lendloop-signature": `v1=${sig}` };
}

async function check(name, path, init, expected) {
  const res = await fetch(base + path, { method: "POST", ...init });
  const text = await res.text();
  const pass = res.status === expected;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}: HTTP ${res.status} ${text.slice(0, 120)}`);
  if (!pass) process.exitCode = 1;
}

const body = "{}";
await check("signed request", "/automation/overdue-loans", { headers: headers(body), body }, 200);
await check("unsigned request", "/automation/overdue-loans", { body }, 401);
await check("wrong secret", "/automation/overdue-loans", { headers: headers(body, "not-the-secret"), body }, 401);
await check("replayed (10 min old)", "/automation/overdue-loans", { headers: headers(body, secret, Math.floor(Date.now() / 1000) - 600), body }, 401);
const bad = JSON.stringify({ kind: "reminder_sent" });
await check("signed but invalid body", "/automation/events", { headers: headers(bad), body: bad }, 400);
