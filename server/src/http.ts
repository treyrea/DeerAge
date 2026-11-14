/**
 * Shared HTTP handlers for the Vercel functions and the local dev server.
 * No AI provider keys are read from the request. They come from the environment.
 */

import { getAccess, runAnalysis, type AnalyzeBody } from "./analyze";
import { publicConfig } from "./config";

export interface Incoming {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

export interface Outgoing {
  status: number;
  body: unknown;
}

function header(req: Incoming, name: string): string {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function queryParam(req: Incoming, name: string): string {
  const fromQuery = req.query?.[name];
  if (Array.isArray(fromQuery)) return fromQuery[0] ?? "";
  if (typeof fromQuery === "string") return fromQuery;
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get(name) ?? "";
  } catch {
    return "";
  }
}

export async function handleAnalyzeRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") {
    return { status: 405, body: { ok: false, code: "invalid_request", message: "Use POST." } };
  }
  const body = (req.body ?? {}) as AnalyzeBody;
  const result = await runAnalysis(body, {
    evalToken: header(req, "x-deerage-eval-token"),
  });
  return { status: result.status, body: result.body };
}

export async function handleConfigRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") {
    return { status: 405, body: { ok: false, code: "invalid_request", message: "Use GET." } };
  }
  return { status: 200, body: publicConfig() };
}

export async function handleAccessRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") {
    return { status: 405, body: { ok: false, code: "invalid_request", message: "Use GET." } };
  }
  const appUserId = queryParam(req, "appUserId");
  const result = await getAccess(appUserId);
  return { status: result.status, body: result.body };
}

export async function route(req: Incoming): Promise<Outgoing> {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/api/analyze") return handleAnalyzeRequest(req);
  if (path === "/api/config") return handleConfigRequest(req);
  if (path === "/api/access") return handleAccessRequest(req);
  return { status: 404, body: { ok: false, code: "invalid_request", message: "Not found." } };
}
