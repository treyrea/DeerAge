/**
 * Shared HTTP handlers for the Vercel functions and the local dev server.
 * No AI provider keys are read from the request. They come from the environment.
 */

import { handleAdminAnnouncementsRequest, handleAdminPollResultsRequest, handleAdminPollsRequest, handleFeedRequest, handlePollVoteRequest } from "./content.js";
import { getAccess, handleJobStatus, runAnalysis, type AnalyzeBody } from "./analyze.js";
import { handleAdminFeedbackRequest, handleAdminReply, handleCallReport, handleDeleteReportPhoto, handleGrant, handleOwed, handleReportCases, handleReportImage, handleReportStep, handleReplies, handleRescan, handleRescanAnswer } from "./feedback.js";
import { handleSecondLook } from "./second-look.js";
import { handleAdminHarvestsRequest, handleHarvestRequest } from "./harvest.js";
import { handleAdminConfigRequest, publicConfigPayload } from "./remote-config.js";
import { handleVerifyRecord } from "./record.js";
import { handleAdminEmailsRequest, handleAdminPushRequest, handleEmailOptInRequest, handleEmailUnsubscribeRequest, handlePushTokenRequest } from "./outreach.js";
import { header, queryParam, type Incoming, type Outgoing } from "./wire.js";

export type { Incoming, Outgoing } from "./wire.js";

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
  return { status: 200, body: await publicConfigPayload() };
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
  if (path === "/api/score") {
    const body = req.body && typeof req.body === "object" ? { ...(req.body as Record<string, unknown>), mode: "score" } : { mode: "score" };
    return handleAnalyzeRequest({ ...req, body });
  }
  if (path === "/api/analyze-status" || path === "/api/score-status") {
    if (req.method !== "GET") return { status: 405, body: { ok: false, code: "invalid_request", message: "Use GET." } };
    return handleJobStatus(queryParam(req, "id"));
  }
  if (path === "/api/config") return handleConfigRequest(req);
  if (path === "/api/access") return handleAccessRequest(req);
  if (path === "/api/feed") return handleFeedRequest(req);
  if (path === "/api/poll-vote") return handlePollVoteRequest(req);
  if (path === "/api/push-token") return handlePushTokenRequest(req);
  if (path === "/api/email-optin") return handleEmailOptInRequest(req);
  if (path === "/api/email-unsubscribe") return handleEmailUnsubscribeRequest(req);
  if (path === "/api/admin/announcements") return handleAdminAnnouncementsRequest(req);
  if (path === "/api/admin/polls") return handleAdminPollsRequest(req);
  if (path === "/api/admin/poll-results") return handleAdminPollResultsRequest(req);
  if (path === "/api/admin/push") return handleAdminPushRequest(req);
  if (path === "/api/admin/emails") return handleAdminEmailsRequest(req);
  if (path === "/api/harvest") return handleHarvestRequest(req);
  if (path === "/api/admin/harvests") return handleAdminHarvestsRequest(req);
  if (path === "/api/call-report") return handleCallReport(req);
  if (path === "/api/admin/feedback") return handleAdminFeedbackRequest(req);
  if (path === "/api/admin/reply") return handleAdminReply(req);
  if (path === "/api/admin/report-step") return handleReportStep(req);
  if (path === "/api/admin/owed") return handleOwed(req);
  if (path === "/api/admin/grant") return handleGrant(req);
  if (path === "/api/admin/report-cases") return handleReportCases(req);
  if (path === "/api/admin/report-image") return handleReportImage(req);
  if (path === "/api/replies") return handleReplies(req);
  if (path === "/api/rescan") return handleRescan(req);
  if (path === "/api/rescan-answer") return handleRescanAnswer(req);
  if (path === "/api/report-photo") return handleDeleteReportPhoto(req);
  if (path === "/api/second-look") return handleSecondLook(req);
  if (path === "/api/admin/config") return handleAdminConfigRequest(req);
  if (path === "/api/verify-record") return handleVerifyRecord(req);
  return { status: 404, body: { ok: false, code: "invalid_request", message: "Not found." } };
}
