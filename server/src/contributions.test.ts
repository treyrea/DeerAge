import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import sharp from "sharp";
import {
  CONTRIB_INDEX,
  contributionImagePath,
  handleAdminContributions,
  handleContributionAge,
  handleContributionImage,
  loadContribution,
  realAgeOf,
  saveContributionForJob,
  stripPhoto,
  userHash,
} from "./contributions.js";
import { normalizeContribute, patchContribute } from "./contribute-config.js";
import { saveJob } from "./jobs.js";
import { setKvForTests, type Kv } from "./kv.js";
import { handleAdminConfigRequest, inviteUrlOf, publicConfigPayload } from "./remote-config.js";

class MemoryKv implements Kv {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  async command(args: (string | number)[]): Promise<unknown> {
    const [opRaw, keyRaw, ...rest] = args;
    const op = String(opRaw).toUpperCase();
    const key = String(keyRaw ?? "");
    if (op === "GET") return this.strings.get(key) ?? null;
    if (op === "SET") { this.strings.set(key, String(rest[0] ?? "")); return "OK"; }
    if (op === "DEL") { this.strings.delete(key); return 1; }
    if (op === "INCR") { const next = Number(this.strings.get(key) ?? 0) + 1; this.strings.set(key, String(next)); return next; }
    if (op === "SADD") { const set = this.sets.get(key) ?? new Set(); rest.forEach((v) => set.add(String(v))); this.sets.set(key, set); return 1; }
    if (op === "SCARD") return this.sets.get(key)?.size ?? 0;
    if (op === "SMEMBERS") return [...(this.sets.get(key) ?? [])];
    return 1;
  }
  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const command of commands) out.push(await this.command(command));
    return out;
  }
}

let store: MemoryKv;
const savedAdmin = process.env.ADMIN_TOKEN;
let photo = "";
let jobN = 0;

function nextJobId(): string {
  jobN += 1;
  return `job_${jobN.toString(16).padStart(16, "0")}`;
}

async function setConfig(contribute: Record<string, unknown>): Promise<void> {
  const res = await handleAdminConfigRequest({ method: "PATCH", headers: { authorization: "Bearer admin-test" }, body: { contribute } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

async function doneJob(id: string): Promise<void> {
  await saveJob({
    id,
    status: "done",
    mode: "age",
    provisional: null,
    error: null,
    final: { ok: true, model: "gemini-4-hydrogen", record: { receipt: "secret-ish" }, result: { ageLabel: "4.5", ageYears: 4.5, fieldCall: "SHOOTER", reasons: ["Deep chest."], shotReceipt: "x" } },
  });
}

beforeEach(async () => {
  store = new MemoryKv();
  setKvForTests(store);
  process.env.ADMIN_TOKEN = "admin-test";
  if (!photo) {
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 90, b: 60 } } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Hunter", Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "30/1 15/1 0/1" } })
      .toBuffer();
    photo = jpeg.toString("base64");
  }
});

afterEach(() => {
  setKvForTests(null);
  if (savedAdmin === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = savedAdmin;
});

test("stored photos lose all EXIF, including GPS", async () => {
  const before = await sharp(Buffer.from(photo, "base64")).metadata();
  assert.ok(before.exif && before.exif.length > 0, "the test photo starts with EXIF");
  const clean = await stripPhoto(`data:image/jpeg;base64,${photo}`);
  assert.ok(clean);
  const after = await sharp(Buffer.from(clean!, "base64")).metadata();
  assert.equal(after.exif, undefined);
  assert.equal(after.xmp, undefined);
  assert.equal(await stripPhoto("not an image"), null);
});

test("nothing is stored while the owner switch is off (the default)", async () => {
  const id = nextJobId();
  await doneJob(id);
  assert.equal(normalizeContribute(undefined).enabled, false);
  assert.equal(await saveContributionForJob({ jobId: id, appUserId: "hunter-1", mode: "age", minimum: 4.5, images: [photo] }), "off");
  assert.equal(store.sets.get(CONTRIB_INDEX), undefined);
  assert.equal([...store.strings.keys()].some((key) => key.startsWith("deerage:contrib")), false);
});

test("with the switch on, a finished scan is saved without the user id or receipts", async () => {
  await setConfig({ enabled: true });
  const id = nextJobId();
  await doneJob(id);
  assert.equal(await saveContributionForJob({ jobId: id, appUserId: "hunter-1", mode: "age", minimum: 4.5, images: [photo, photo] }), "saved");
  const record = await loadContribution(id);
  assert.ok(record);
  assert.deepEqual(record!.files, ["0.jpg", "1.jpg"]);
  assert.equal(record!.userHash, userHash("hunter-1"));
  assert.equal(JSON.stringify(record).includes("hunter-1"), false);
  assert.equal(JSON.stringify(record).includes("receipt"), false);
  assert.equal(record!.result.ageLabel, "4.5");
  assert.equal(record!.result.model, "gemini-4-hydrogen");
});

test("an unfinished scan and a full store save nothing", async () => {
  await setConfig({ enabled: true, maxStored: 1 });
  const running = nextJobId();
  await saveJob({ id: running, status: "running", mode: "age", provisional: null, final: null, error: null });
  assert.equal(await saveContributionForJob({ jobId: running, appUserId: "h", mode: "age", minimum: 4.5, images: [photo] }), "no_result");
  const first = nextJobId();
  await doneJob(first);
  assert.equal(await saveContributionForJob({ jobId: first, appUserId: "h", mode: "age", minimum: 4.5, images: [photo] }), "saved");
  const second = nextJobId();
  await doneJob(second);
  assert.equal(await saveContributionForJob({ jobId: second, appUserId: "h", mode: "age", minimum: 4.5, images: [photo] }), "full");
});

test("a real age sent before the photo finishes saving is kept; another user can't set it", async () => {
  await setConfig({ enabled: true });
  const id = nextJobId();
  const early = await handleContributionAge({ method: "POST", headers: {}, body: { jobId: id, appUserId: "hunter-2", realAge: 5.5, source: "jawbone" } });
  assert.equal(early.status, 200);
  assert.equal((early.body as { pending?: boolean }).pending, true);
  await doneJob(id);
  await saveContributionForJob({ jobId: id, appUserId: "hunter-2", mode: "age", minimum: 4.5, images: [photo] });
  assert.equal((await loadContribution(id))!.realAge?.age, "5.5");
  assert.equal((await loadContribution(id))!.realAge?.source, "jawbone");
  const other = await handleContributionAge({ method: "POST", headers: {}, body: { jobId: id, appUserId: "someone-else", realAge: "2.5" } });
  assert.equal(other.status, 404);
  const fixed = await handleContributionAge({ method: "POST", headers: {}, body: { jobId: id, appUserId: "hunter-2", realAge: "6.5", source: "known" } });
  assert.equal(fixed.status, 200);
  assert.equal((await loadContribution(id))!.realAge?.age, "6.5");
});

test("real ages are whole age classes only, and bad requests are refused", async () => {
  assert.equal(realAgeOf("4.5"), "4.5");
  assert.equal(realAgeOf(8.5), "7.5+");
  assert.equal(realAgeOf("4"), null);
  assert.equal(realAgeOf("old"), null);
  await setConfig({ enabled: true });
  const bad = await handleContributionAge({ method: "POST", headers: {}, body: { jobId: "nope", appUserId: "h", realAge: "4.5" } });
  assert.equal(bad.status, 400);
  await setConfig({ enabled: false });
  const off = await handleContributionAge({ method: "POST", headers: {}, body: { jobId: nextJobId(), appUserId: "h", realAge: "4.5" } });
  assert.deepEqual(off.body, { ok: true, saved: false });
});

test("the admin list needs the token and gives signed photo links that expire", async () => {
  await setConfig({ enabled: true });
  const id = nextJobId();
  await doneJob(id);
  await saveContributionForJob({ jobId: id, appUserId: "h", mode: "age", minimum: 4.5, images: [photo] });
  const denied = await handleAdminContributions({ method: "GET", headers: {}, url: "/api/admin/contributions" });
  assert.equal(denied.status, 401);
  const list = await handleAdminContributions({ method: "GET", headers: { authorization: "Bearer admin-test" }, url: "/api/admin/contributions" });
  assert.equal(list.status, 200);
  const body = list.body as { total: number; contributions: Array<{ photos: string[] }> };
  assert.equal(body.total, 1);
  const link = new URL(`https://x${body.contributions[0].photos[0]}`);
  const query = Object.fromEntries(link.searchParams.entries());
  const image = await handleContributionImage({ method: "GET", headers: {}, url: link.pathname + link.search, query });
  assert.equal(image.status, 200);
  assert.ok(image.text && image.text.length > 100);
  const tampered = await handleContributionImage({ method: "GET", headers: {}, url: "/", query: { ...query, sig: "0".repeat(64) } });
  assert.equal(tampered.status, 403);
  const old = new URL(`https://x${contributionImagePath(id, "0.jpg", -1000)}`);
  const expired = await handleContributionImage({ method: "GET", headers: {}, url: "/", query: Object.fromEntries(old.searchParams.entries()) });
  assert.equal(expired.status, 403);
});

test("contribute and invite settings are validated, and the app sees only what it needs", async () => {
  assert.throws(() => patchContribute(normalizeContribute(undefined), { enabled: "yes" }));
  assert.throws(() => patchContribute(normalizeContribute(undefined), { maxStored: -1 }));
  assert.equal(inviteUrlOf("https://apps.apple.com/us/app/deerage/id6755117006"), "https://apps.apple.com/us/app/deerage/id6755117006");
  assert.equal(inviteUrlOf("javascript:alert(1)"), "");
  assert.equal(inviteUrlOf("http://example.com"), "");
  const res = await handleAdminConfigRequest({ method: "PATCH", headers: { authorization: "Bearer admin-test" }, body: { inviteMessage: "Try DeerAge.", contribute: { enabled: true, maxStored: 50 } } });
  assert.equal(res.status, 200);
  const bad = await handleAdminConfigRequest({ method: "PATCH", headers: { authorization: "Bearer admin-test" }, body: { inviteUrl: "http://bad" } });
  assert.equal(bad.status, 400);
  const pub = await publicConfigPayload() as unknown as { contribute: Record<string, unknown>; copy: { inviteMessage: string } };
  assert.deepEqual(pub.contribute, { enabled: true });
  assert.equal(pub.copy.inviteMessage, "Try DeerAge.");
});
