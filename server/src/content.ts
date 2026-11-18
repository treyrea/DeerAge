/**
 * Published announcements and open polls.
 * One vote per RevenueCat app user id, split subscriber vs free.
 */

import { randomBytes } from "node:crypto";
import { readAccess, revenueCatConfigured } from "./entitlement.js";
import { allowBucket, ensureRedis, hashObject, kv, readJson, redisGet, redisSet } from "./kv.js";
import {
  ApiError,
  type Incoming,
  type Outgoing,
  asRecord,
  callerKey,
  catchApi,
  cleanText,
  fail,
  limitFromEnv,
  ok,
  queryParam,
  requireAdmin,
  requireAppUserId,
  userKey,
} from "./wire.js";

const ANNOUNCEMENTS = "deerage:announcements";
const POLLS = "deerage:polls";
const MAX_ITEMS = 100;
const NO_STORE = { "cache-control": "no-store" };

export type Segment = "subscriber" | "free";

type AnnouncementStatus = "draft" | "published" | "closed";
type PollStatus = "draft" | "open" | "closed";

interface Announcement {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  publishedAt: string | null;
  updatedAt: string;
}

interface PollOption {
  id: string;
  label: string;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  status: PollStatus;
  publishedAt: string | null;
  updatedAt: string;
}

let segmentOverride: ((appUserId: string) => Promise<Segment>) | null = null;

export function setSegmentLookupForTests(next: ((appUserId: string) => Promise<Segment>) | null): void {
  segmentOverride = next;
}

export async function segmentFor(appUserId: string): Promise<Segment> {
  if (segmentOverride) return segmentOverride(appUserId);
  if (!revenueCatConfigured()) {
    throw new ApiError(503, "not_configured", "Subscriptions aren't available right now.");
  }
  try {
    const access = await readAccess(appUserId);
    return access.entitled ? "subscriber" : "free";
  } catch {
    throw new ApiError(502, "upstream", "Couldn't check the plan just now. Try again.");
  }
}

export async function segmentOrUnknown(appUserId: string): Promise<Segment | "unknown"> {
  if (segmentOverride) return segmentOverride(appUserId);
  if (!revenueCatConfigured()) return "unknown";
  try {
    const access = await readAccess(appUserId);
    return access.entitled ? "subscriber" : "free";
  } catch {
    return "unknown";
  }
}

function nid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function isAnnouncement(value: unknown): value is Announcement {
  if (!value || typeof value !== "object") return false;
  const item = value as Announcement;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.body === "string";
}

function isPoll(value: unknown): value is Poll {
  if (!value || typeof value !== "object") return false;
  const item = value as Poll;
  return typeof item.id === "string" && typeof item.question === "string" && Array.isArray(item.options);
}

async function announcements(): Promise<Announcement[]> {
  const items = await readJson<unknown>(ANNOUNCEMENTS, []);
  return Array.isArray(items) ? items.filter(isAnnouncement) : [];
}

async function pollList(): Promise<Poll[]> {
  const items = await readJson<unknown>(POLLS, []);
  return Array.isArray(items) ? items.filter(isPoll) : [];
}

function byNewest<T extends { publishedAt: string | null; updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
}

function announcementStatus(value: unknown, fallback: AnnouncementStatus): AnnouncementStatus {
  if (value == null) return fallback;
  if (value === "draft" || value === "published" || value === "closed") return value;
  throw new ApiError(400, "invalid_request", "Status must be draft, published, or closed.");
}

function pollStatus(value: unknown, fallback: PollStatus): PollStatus {
  if (value == null) return fallback;
  if (value === "draft" || value === "open" || value === "closed") return value;
  throw new ApiError(400, "invalid_request", "Status must be draft, open, or closed.");
}

function voteKey(pollId: string, appUserId: string): string {
  return `deerage:pollvote:${pollId}:${userKey(appUserId)}`;
}

function tallyKey(pollId: string): string {
  return `deerage:polltally:${pollId}`;
}

async function gateAdmin(req: Incoming): Promise<void> {
  ensureRedis();
  await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
  requireAdmin(req);
}

export async function handleFeedRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    await allowBucket("feed", callerKey(req), limitFromEnv("FEED_RATE_LIMIT_PER_MINUTE", 40));
    const appUserIdRaw = queryParam(req, "appUserId").trim();
    const appUserId = /^[A-Za-z0-9_.:$+-]{6,200}$/.test(appUserIdRaw) ? appUserIdRaw : "";
    const [items, polls] = await Promise.all([announcements(), pollList()]);
    const published = byNewest(items.filter((item) => item.status === "published")).slice(0, 30);
    const open = byNewest(polls.filter((poll) => poll.status === "open")).slice(0, 30);
    const myVotes: Record<string, string | null> = {};
    if (appUserId && open.length > 0) {
      const values = await kv().pipeline(open.map((poll) => ["GET", voteKey(poll.id, appUserId)]));
      open.forEach((poll, index) => {
        const value = values[index];
        myVotes[poll.id] = typeof value === "string" ? value : null;
      });
    }
    return ok({
      announcements: published.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        publishedAt: item.publishedAt,
      })),
      polls: open.map((poll) => ({
        id: poll.id,
        question: poll.question,
        publishedAt: poll.publishedAt,
        options: poll.options.map((option) => ({ id: option.id, label: option.label })),
        myVote: appUserId ? (myVotes[poll.id] ?? null) : null,
      })),
    }, NO_STORE);
  } catch (error) {
    return catchApi(error, "Updates aren't available right now.");
  }
}

export async function handlePollVoteRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("vote", appUserId, limitFromEnv("VOTE_RATE_LIMIT_PER_MINUTE", 12));
    const pollId = cleanText(body.pollId, 40);
    const optionId = cleanText(body.optionId, 40);
    const polls = await pollList();
    const poll = polls.find((item) => item.id === pollId);
    if (!poll || poll.status !== "open") {
      throw new ApiError(404, "invalid_request", "That poll is not open.");
    }
    if (!poll.options.some((option) => option.id === optionId)) {
      throw new ApiError(400, "invalid_request", "Pick one of the listed options.");
    }
    const segment = await segmentFor(appUserId);
    const key = voteKey(pollId, appUserId);
    const setResult = await kv().command(["SET", key, optionId, "NX"]);
    if (setResult !== "OK") {
      const existing = await redisGet(key);
      if (existing === optionId) return ok({ pollId, optionId, alreadyVoted: true });
      throw new ApiError(409, "already_voted", "You already voted on this.", {
        pollId,
        optionId: existing,
      });
    }
    try {
      await kv().command(["HINCRBY", tallyKey(pollId), `${optionId}:${segment}`, 1]);
    } catch (error) {
      await kv().command(["DEL", key]);
      throw error;
    }
    return ok({ pollId, optionId, alreadyVoted: false, segment });
  } catch (error) {
    return catchApi(error, "That vote didn't save.");
  }
}

export async function handleAdminAnnouncementsRequest(req: Incoming): Promise<Outgoing> {
  try {
    await gateAdmin(req);
    if (req.method === "GET") {
      const items = byNewest(await announcements());
      return ok({ announcements: items }, NO_STORE);
    }
    if (req.method === "POST") return ok({ announcement: await createAnnouncement(asRecord(req.body)) });
    if (req.method === "PATCH") return ok({ announcement: await updateAnnouncement(asRecord(req.body)) });
    return fail(405, "invalid_request", "Use GET, POST, or PATCH.");
  } catch (error) {
    return catchApi(error, "Couldn't save that announcement.");
  }
}

async function createAnnouncement(body: Record<string, unknown>): Promise<Announcement> {
  const items = await announcements();
  if (items.length >= MAX_ITEMS) {
    throw new ApiError(400, "invalid_request", "Too many announcements. Close an old one before adding another.");
  }
  const now = new Date().toISOString();
  const status = announcementStatus(body.status, "published");
  const item: Announcement = {
    id: nid("ann"),
    title: cleanText(body.title, 120),
    body: cleanText(body.body, 2000),
    status,
    publishedAt: status === "published" ? now : null,
    updatedAt: now,
  };
  items.push(item);
  await redisSet(ANNOUNCEMENTS, JSON.stringify(items));
  return item;
}

async function updateAnnouncement(body: Record<string, unknown>): Promise<Announcement> {
  const id = cleanText(body.id, 40);
  const items = await announcements();
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new ApiError(404, "invalid_request", "Announcement not found.");
  if (body.title != null) item.title = cleanText(body.title, 120);
  if (body.body != null) item.body = cleanText(body.body, 2000);
  if (body.status != null) {
    item.status = announcementStatus(body.status, item.status);
    if (item.status === "published" && !item.publishedAt) item.publishedAt = new Date().toISOString();
  }
  item.updatedAt = new Date().toISOString();
  await redisSet(ANNOUNCEMENTS, JSON.stringify(items));
  return item;
}

export async function handleAdminPollsRequest(req: Incoming): Promise<Outgoing> {
  try {
    await gateAdmin(req);
    if (req.method === "GET") return ok({ polls: byNewest(await pollList()) }, NO_STORE);
    if (req.method === "POST") return ok({ poll: await createPoll(asRecord(req.body)) });
    if (req.method === "PATCH") return ok({ poll: await updatePoll(asRecord(req.body)) });
    return fail(405, "invalid_request", "Use GET, POST, or PATCH.");
  } catch (error) {
    return catchApi(error, "Couldn't save that poll.");
  }
}

function freshOptions(value: unknown): PollOption[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new ApiError(400, "invalid_request", "A poll needs 2 to 6 options.");
  }
  const labels = value.map((entry) => {
    if (typeof entry === "string") return cleanText(entry, 80);
    if (entry && typeof entry === "object" && "label" in entry) {
      return cleanText((entry as { label: unknown }).label, 80);
    }
    throw new ApiError(400, "invalid_request", "Each option needs a label.");
  });
  if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) {
    throw new ApiError(400, "invalid_request", "Options should be different.");
  }
  return labels.map((label) => ({ id: nid("opt"), label }));
}

async function createPoll(body: Record<string, unknown>): Promise<Poll> {
  const items = await pollList();
  if (items.length >= MAX_ITEMS) {
    throw new ApiError(400, "invalid_request", "Too many polls. Close an old one before adding another.");
  }
  const now = new Date().toISOString();
  const status = pollStatus(body.status, "open");
  const poll: Poll = {
    id: nid("poll"),
    question: cleanText(body.question, 200),
    options: freshOptions(body.options),
    status,
    publishedAt: status === "open" ? now : null,
    updatedAt: now,
  };
  items.push(poll);
  await redisSet(POLLS, JSON.stringify(items));
  return poll;
}

async function replaceOptions(poll: Poll, value: unknown): Promise<PollOption[]> {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new ApiError(400, "invalid_request", "A poll needs 2 to 6 options.");
  }
  const tallies = hashObject(await kv().command(["HGETALL", tallyKey(poll.id)]));
  const votedIds = new Set(
    Object.entries(tallies)
      .filter(([, count]) => Number(count) > 0)
      .map(([field]) => field.split(":")[0] ?? ""),
  );
  const next: PollOption[] = value.map((entry) => {
    if (typeof entry === "string") return { id: nid("opt"), label: cleanText(entry, 80) };
    if (entry && typeof entry === "object" && "label" in entry) {
      const label = cleanText((entry as { label: unknown }).label, 80);
      const id = typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id : "";
      const kept = poll.options.find((option) => option.id === id);
      return kept ? { id: kept.id, label } : { id: nid("opt"), label };
    }
    throw new ApiError(400, "invalid_request", "Each option needs a label.");
  });
  const ids = new Set(next.map((option) => option.id));
  for (const voted of votedIds) {
    if (voted && !ids.has(voted)) {
      throw new ApiError(400, "invalid_request", "Options that already have votes stay on the poll.");
    }
  }
  if (new Set(next.map((option) => option.label.toLowerCase())).size !== next.length) {
    throw new ApiError(400, "invalid_request", "Options should be different.");
  }
  return next;
}

async function updatePoll(body: Record<string, unknown>): Promise<Poll> {
  const id = cleanText(body.id, 40);
  const items = await pollList();
  const poll = items.find((entry) => entry.id === id);
  if (!poll) throw new ApiError(404, "invalid_request", "Poll not found.");
  if (body.question != null) poll.question = cleanText(body.question, 200);
  if (body.options != null) poll.options = await replaceOptions(poll, body.options);
  if (body.status != null) {
    poll.status = pollStatus(body.status, poll.status);
    if (poll.status === "open" && !poll.publishedAt) poll.publishedAt = new Date().toISOString();
  }
  poll.updatedAt = new Date().toISOString();
  await redisSet(POLLS, JSON.stringify(items));
  return poll;
}

export async function handleAdminPollResultsRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await gateAdmin(req);
    const pollId = cleanText(queryParam(req, "pollId") || asRecord(req.body ?? {}).pollId, 40);
    const poll = (await pollList()).find((item) => item.id === pollId);
    if (!poll) throw new ApiError(404, "invalid_request", "Poll not found.");
    const tallies = hashObject(await kv().command(["HGETALL", tallyKey(poll.id)]));
    const results = poll.options.map((option) => {
      const subscriber = Number(tallies[`${option.id}:subscriber`] ?? 0) || 0;
      const free = Number(tallies[`${option.id}:free`] ?? 0) || 0;
      return { id: option.id, label: option.label, subscriber, free, total: subscriber + free };
    });
    const totalVotes = results.reduce((sum, row) => sum + row.total, 0);
    return ok({
      poll: {
        id: poll.id,
        question: poll.question,
        status: poll.status,
        publishedAt: poll.publishedAt,
      },
      results,
      totalVotes,
    }, NO_STORE);
  } catch (error) {
    return catchApi(error, "Couldn't read poll results.");
  }
}
