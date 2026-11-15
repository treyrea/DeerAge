/**
 * Shared request types for the Vercel functions and the local dev server.
 * Secrets are read from the environment, never from the request body.
 */

import { LimitStoreError } from "./limits.js";

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
  text?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function fail(status: number, code: string, message: string, extra?: Record<string, unknown>): Outgoing {
  return { status, body: { ok: false, code, message, ...extra } };
}

export function ok(body: Record<string, unknown>, headers?: Record<string, string>): Outgoing {
  return { status: 200, body: { ok: true, ...body }, headers };
}

export function header(req: Incoming, name: string): string {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function queryParam(req: Incoming, name: string): string {
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

export function callerKey(req: Incoming): string {
  const body = req.body;
  const fromBody = body && typeof body === "object" && "appUserId" in body && typeof (body as { appUserId?: unknown }).appUserId === "string"
    ? (body as { appUserId: string }).appUserId
    : "";
  const id = (fromBody || queryParam(req, "appUserId")).trim();
  if (id) return id.slice(0, 180);
  const forwarded = header(req, "x-forwarded-for").split(",")[0]?.trim() ?? "";
  if (forwarded) return `ip:${forwarded.slice(0, 80)}`;
  return "anon";
}

export function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function requireAdmin(req: Incoming): void {
  const expected = process.env.ADMIN_TOKEN?.trim() ?? "";
  if (!expected) {
    throw new ApiError(503, "not_configured", "Admin access is not configured.");
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header(req, "authorization").trim());
  const provided = match?.[1] ?? "";
  if (!tokensMatch(provided, expected)) {
    throw new ApiError(401, "unauthorized", "Admin token required.");
  }
}

export function limitFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const USER_RE = /^[A-Za-z0-9_.:$+-]{6,200}$/;

export function requireAppUserId(value: unknown): string {
  if (typeof value !== "string" || !USER_RE.test(value.trim())) {
    throw new ApiError(400, "invalid_request", "A valid app user id is required.");
  }
  return value.trim();
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", "Missing text.");
  }
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!text || text.length > max) {
    throw new ApiError(400, "invalid_request", "Text is empty or too long.");
  }
  return text;
}

export function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "JSON object required.");
  }
  return body as Record<string, unknown>;
}

export function userKey(appUserId: string): string {
  return encodeURIComponent(appUserId).slice(0, 180);
}

export function catchApi(error: unknown, fallback: string): Outgoing {
  if (error instanceof ApiError) return fail(error.status, error.code, error.message, error.extra);
  if (error instanceof LimitStoreError) {
    return fail(503, "not_configured", "This feature is not available right now.");
  }
  return fail(502, "upstream", fallback);
}
