/**
 * Post announcements and polls, read results, and send a push.
 *
 *   DEERAGE_API_BASE_URL=https://<deerage-api> ADMIN_TOKEN=... npx tsx src/admin-cli.ts help
 *
 * Loads server/.env when those variables are not already set. Never prints the token.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(resolve(process.cwd(), ".env"));

function parseArgs(argv: string[]) {
  const command = argv[0] ?? "help";
  const flags = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      bools.add(name);
      continue;
    }
    const list = flags.get(name) ?? [];
    list.push(next);
    flags.set(name, list);
    i += 1;
  }
  return { command, flags, bools };
}

function one(flags: Map<string, string[]>, name: string): string {
  return flags.get(name)?.[0] ?? "";
}

function requireValue(value: string, label: string): string {
  if (!value) {
    console.error(`Missing --${label}`);
    process.exitCode = 1;
  }
  return value;
}

function baseUrl(): string {
  const raw = process.env.DEERAGE_API_BASE_URL?.trim() ?? "";
  if (!raw) {
    console.error("Set DEERAGE_API_BASE_URL to the deerage-api origin, with no trailing slash.");
    process.exit(1);
  }
  return raw.replace(/\/$/, "");
}

function token(): string {
  const value = process.env.ADMIN_TOKEN?.trim() ?? "";
  if (!value) {
    console.error("Set ADMIN_TOKEN. It is the same value as on Vercel. Do not commit it.");
    process.exit(1);
  }
  return value;
}

async function call(method: string, path: string, body?: unknown): Promise<void> {
  if (process.exitCode) return;
  const headers: Record<string, string> = { Authorization: `Bearer ${token()}` };
  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl()}${path}`, { method, headers, body: payload });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("csv")) {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  } else {
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  }
  if (!response.ok) process.exitCode = 1;
}

function help(): void {
  console.log(`DeerAge admin

Environment
  DEERAGE_API_BASE_URL   deerage-api origin, no trailing slash
  ADMIN_TOKEN            bearer token set on Vercel. Never commit it.

Commands
  announcement:create --title "..." --body "..." [--status published]
  announcement:update --id ann_... [--title ...] [--body ...] [--status closed]
  announcement:list
  poll:create --question "..." --option "A" --option "B" [--status open]
  poll:update --id poll_... [--question ...] [--status closed]
  poll:list
  poll:results --id poll_...
  push --title "..." --body "..." [--audience all|subscriber|free] [--dry-run]
  emails
  harvests
  config:get
  config:set [--min-supported 1.0.8] [--recommended 1.0.9] [--banner "The rut is on"]
             [--paywall-headline "..."] [--paywall-subhead "..."] [--home-tip "..."]
             [--region-note "Hunting {hunt}. Home is {home}. {sourced}"]
             [--lease-text "{age} · {call} · lease minimum {minimum}"]
             [--lease-button "Text this to my lease manager"]
             [--flag shootOrPass=true]

Omitted announcement status is published. Omitted poll status is open.
poll:results splits votes into subscriber and free.
push --dry-run counts tokens and does not send.
emails prints CSV.
`);
}

async function main() {
  const { command, flags, bools } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "announcement:list") return call("GET", "/api/admin/announcements");
  if (command === "announcement:create") {
    return call("POST", "/api/admin/announcements", {
      title: requireValue(one(flags, "title"), "title"),
      body: requireValue(one(flags, "body"), "body"),
      status: one(flags, "status") || "published",
    });
  }
  if (command === "announcement:update") {
    const body: Record<string, string> = { id: requireValue(one(flags, "id"), "id") };
    if (one(flags, "title")) body.title = one(flags, "title");
    if (one(flags, "body")) body.body = one(flags, "body");
    if (one(flags, "status")) body.status = one(flags, "status");
    return call("PATCH", "/api/admin/announcements", body);
  }
  if (command === "poll:list") return call("GET", "/api/admin/polls");
  if (command === "poll:create") {
    const options = flags.get("option") ?? [];
    if (options.length < 2) {
      console.error("Pass at least two --option values.");
      process.exitCode = 1;
      return;
    }
    return call("POST", "/api/admin/polls", {
      question: requireValue(one(flags, "question"), "question"),
      options,
      status: one(flags, "status") || "open",
    });
  }
  if (command === "poll:update") {
    const body: Record<string, unknown> = { id: requireValue(one(flags, "id"), "id") };
    if (one(flags, "question")) body.question = one(flags, "question");
    if (one(flags, "status")) body.status = one(flags, "status");
    if (flags.get("option")) body.options = flags.get("option");
    return call("PATCH", "/api/admin/polls", body);
  }
  if (command === "poll:results") {
    const id = requireValue(one(flags, "id"), "id");
    return call("GET", `/api/admin/poll-results?pollId=${encodeURIComponent(id)}`);
  }
  if (command === "push") {
    const dryRun = bools.has("dry-run") || one(flags, "dry-run") === "true";
    const body: Record<string, unknown> = {
      audience: one(flags, "audience") || "all",
      dryRun,
    };
    if (!dryRun || one(flags, "title")) body.title = one(flags, "title");
    if (!dryRun || one(flags, "body")) body.body = one(flags, "body");
    if (!dryRun) {
      requireValue(one(flags, "title"), "title");
      requireValue(one(flags, "body"), "body");
    }
    return call("POST", "/api/admin/push", body);
  }
  if (command === "emails") return call("GET", "/api/admin/emails");
  if (command === "harvests") return call("GET", "/api/admin/harvests");
  if (command === "config:get") return call("GET", "/api/admin/config");
  if (command === "config:set") {
    const body: Record<string, unknown> = {};
    if (one(flags, "min-supported")) body.minSupportedVersion = one(flags, "min-supported");
    if (one(flags, "recommended")) body.recommendedVersion = one(flags, "recommended");
    if (one(flags, "min")) body.minVersion = one(flags, "min");
    if (one(flags, "latest")) body.latestVersion = one(flags, "latest");
    if (flags.has("banner")) body.seasonalBanner = one(flags, "banner");
    if (bools.has("clear-banner")) body.seasonalBanner = "";
    if (flags.has("paywall-headline")) body.paywallHeadline = one(flags, "paywall-headline");
    if (flags.has("paywall-subhead")) body.paywallSubhead = one(flags, "paywall-subhead");
    if (flags.has("region-note")) body.regionHeadsUp = one(flags, "region-note");
    if (flags.has("lease-text")) body.leaseManagerText = one(flags, "lease-text");
    if (flags.has("lease-button")) body.leaseManagerButton = one(flags, "lease-button");
    const tips = flags.get("home-tip");
    if (tips) body.homeTips = tips;
    const flagArgs = flags.get("flag") ?? [];
    if (flagArgs.length > 0) {
      const flagsBody: Record<string, boolean> = {};
      for (const entry of flagArgs) {
        const [name, value] = entry.split("=");
        if (!name || (value !== "true" && value !== "false")) {
          console.error("Use --flag name=true or --flag name=false");
          process.exitCode = 1;
          return;
        }
        flagsBody[name] = value === "true";
      }
      body.flags = flagsBody;
    }
    return call("PATCH", "/api/admin/config", body);
  }
  help();
  process.exitCode = 1;
}

function runningAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    if (import.meta.url === pathToFileURL(entry).href) return true;
  } catch {
    // A non-path argv still falls through to the filename check.
  }
  return entry.endsWith("admin-cli.ts") || entry.endsWith("admin-cli.js");
}

if (runningAsCli()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Admin command failed.");
    process.exitCode = 1;
  });
}
