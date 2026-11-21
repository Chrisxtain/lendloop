#!/usr/bin/env node
// Runs n8n without Docker, with the same settings as docker-compose.yml.
//   node scripts/n8n-local.mjs import   # import ./n8n/workflows
//   node scripts/n8n-local.mjs start    # start n8n on http://localhost:5678
// Uses N8N_BIN if set (path to an installed n8n binary), otherwise `npx n8n@2.48.7`.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const fileEnv = Object.fromEntries(
  readFileSync(new URL("../n8n/.env", import.meta.url), "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const env = {
  ...process.env,
  ...fileEnv,
  GENERIC_TIMEZONE: "UTC",
  N8N_BLOCK_ENV_ACCESS_IN_NODE: "false",
  NODE_FUNCTION_ALLOW_BUILTIN: "crypto",
  N8N_DIAGNOSTICS_ENABLED: "false",
  N8N_PERSONALIZATION_ENABLED: "false",
  N8N_USER_FOLDER: process.env.N8N_USER_FOLDER ?? join(homedir(), ".n8n-lendloop"),
};

const cmd = process.argv[2] ?? "start";
const args = cmd === "import" ? ["import:workflow", "--separate", "--input=n8n/workflows"] : process.argv.slice(2);
const [bin, pre] = process.env.N8N_BIN ? [process.env.N8N_BIN, []] : ["npx", ["--yes", "n8n@2.48.7"]];
const child = spawn(bin, [...pre, ...args], { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
