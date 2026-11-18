/**
 * Local stand-in for the DeerAge proxy. No keys and no model calls.
 * EXPO_PUBLIC_API_BASE_URL should point here during the simulator run.
 */
import http from "node:http";

const port = Number(process.env.PORT || 8787);

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const ageResult = {
  ok: true,
  pipeline: "hydrogen",
  ageLabel: "4.5",
  isRange: false,
  estimatedAgeYears: 4.5,
  estimatedAge: "4.5",
  ageClass: "4.5",
  fieldCall: "SHOOTER",
  fieldCallNote: "Reads 4.5, at or above your lease minimum of 4.5.",
  overallConfidence: 0,
  meetsMinimumAge: true,
  minimumAgeThreshold: 4.5,
  shooterPassLabel: "SHOOTER",
  shooterPassReason: "Reads 4.5.",
  cueBullets: [{ area: "Body", text: "Chest is deep." }],
  imageQuality: "good",
};

function drain(req) {
  return new Promise((resolve) => {
    req.on("data", () => {});
    req.on("end", resolve);
    req.on("error", resolve);
  });
}

const server = http.createServer(async (req, res) => {
  // Read the photo body before answering. A large POST otherwise fills the
  // socket and the app waits until its 30s abort, still on the spinner.
  if (req.method === "POST") await drain(req);
  console.log(req.method, req.url);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/api/config") {
    return send(res, 200, {
      ok: true,
      minVersion: "1.0.0",
      latestVersion: "1.0.9",
      recommendedVersion: "",
      minSupportedVersion: "1.0.0",
      model: "mock",
      flags: {
        feed: true,
        polls: true,
        pushPrompt: true,
        emailPrompt: true,
        legacyCard: false,
        harvestCheck: false,
        ratingPrompt: false,
        shootOrPass: true,
        preShotRecord: false,
      },
      products: { offeringId: "default", seasonPassId: "deerage_season", monthlyId: "deerage_monthly", winBackOfferId: "" },
    });
  }
  if (req.method === "GET" && url.pathname === "/api/access") {
    return send(res, 200, { ok: true, entitled: false, freeUsesRemaining: 3, scanCredits: 0 });
  }
  if (req.method === "GET" && url.pathname === "/api/feed") {
    return send(res, 200, {
      announcements: [{ id: "note-1", title: "Season note", body: "A sample update for the simulator.", publishedAt: "2026-11-01T00:00:00Z" }],
      polls: [{
        id: "poll-1",
        question: "What should DeerAge add next?",
        publishedAt: "2026-11-01T00:00:00Z",
        options: [{ id: "a", label: "Jawbone check" }, { id: "b", label: "Leave it" }],
        myVote: null,
      }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/poll-vote") {
    return send(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/replies") {
    return send(res, 200, {
      messages: [{
        id: "msg-1",
        status: "received",
        reply: "We got the report.",
        replyAt: null,
        read: false,
        offerRescan: false,
        originalCall: "SHOOTER",
        originalAge: "4.5",
        rescan: null,
      }],
      unread: 1,
    });
  }
  if (req.method === "POST" && (url.pathname === "/api/replies" || url.pathname === "/api/push-token" || url.pathname === "/api/email-optin" || url.pathname === "/api/call-report")) {
    return send(res, 200, { ok: true, photoStored: false });
  }
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/analyze") {
    const fail = url.searchParams.get("fail") === "1";
    if (fail) return send(res, 502, { ok: false, code: "upstream", message: "Analysis failed. Try again in a moment." });
    return send(res, 202, { ok: true, jobId: "job_aaaaaaaaaaaaaaaa", mode: "age", entitled: false, freeUsesRemaining: 2, scanCredits: 0 });
  }
  if (req.method === "GET" && url.pathname === "/api/analyze-status") {
    return send(res, 200, {
      ok: true,
      status: "done",
      final: { result: ageResult, estimatedCostUsd: 0, mode: "age" },
    });
  }
  return send(res, 404, { ok: false, code: "invalid_request", message: "Not found." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock api on ${port}`);
});
