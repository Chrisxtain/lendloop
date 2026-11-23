#!/usr/bin/env node
// Runs n8n without Docker, with the same settings as docker-compose.yml.
//   node scripts/n8n-local.mjs import   # import workflows, seed the Resend credential placeholder once, publish all three
//   node scripts/n8n-local.mjs start    # start n8n on http://localhost:5678
//   node scripts/n8n-local.mjs <any n8n CLI args>   # e.g. execute --id=lendloopOverdue1
// Uses N8N_BIN if set (path to an installed n8n binary), otherwise `npx n8n@2.48.7`.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const fileEnv = Object.fromEntries(
  readFileSync(new URL("../n8n/.env", import.meta.url), "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const userFolder = process.env.N8N_USER_FOLDER ?? join(homedir(), ".n8n-lendloop");
const cmd = process.argv[2] ?? "start";
const env = {
  ...process.env,
  ...fileEnv,
  GENERIC_TIMEZONE: "UTC",
  N8N_BLOCK_ENV_ACCESS_IN_NODE: "false",
  NODE_FUNCTION_ALLOW_BUILTIN: "crypto",
  N8N_DIAGNOSTICS_ENABLED: "false",
  N8N_PERSONALIZATION_ENABLED: "false",
  N8N_USER_FOLDER: userFolder,
  // One-off CLI commands use their own task-broker port so they can run next to a started n8n.
  ...(cmd === "start" ? {} : { N8N_RUNNERS_BROKER_PORT: process.env.N8N_RUNNERS_BROKER_PORT ?? "5690" }),
};

const [bin, pre] = process.env.N8N_BIN ? [process.env.N8N_BIN, []] : ["npx", ["--yes", "n8n@2.48.7"]];
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, [...pre, ...args], { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`n8n ${args[0]} exited with ${code}`))));
  });

if (cmd === "import") {
  await run(["import:workflow", "--separate", "--input=n8n/workflows"]);
  // Seed the credential placeholder only once, so a real key set in the UI is never overwritten.
  const marker = join(userFolder, ".lendloop-credential-seeded");
  if (!existsSync(marker)) {
    await run(["import:credentials", "--input=n8n/credentials/resend-api.placeholder.json"]);
    mkdirSync(userFolder, { recursive: true });
    writeFileSync(marker, new Date().toISOString());
  }
  // Importing unpublishes workflows; n8n 2.x only runs an error workflow when it is published.
  for (const id of ["lendloopNotify01", "lendloopOverdue1", "lendloopErrors01"]) await run(["publish:workflow", `--id=${id}`]);
} else {
  await run(cmd === "start" ? ["start"] : process.argv.slice(2));
}
