/**
 * Gemini generateContent call, matching the tested runner's request:
 * model gemini-4-hydrogen, inline JPEG, maxOutputTokens 16384,
 * key in the x-goog-api-key header (never the URL, never a log).
 */

import { addUsage, type TokenUsage } from "../cost.js";
import { UpstreamError } from "../openai.js";
import { HYDROGEN_MODEL } from "../aging-switch.js";
import { clampCallTimeout, DEFAULT_CALL_TIMEOUT_MS } from "./aging.js";
import { createScanBudget, ScanBudget, ScanDeadlineError } from "./budget.js";
import type { ModelCaller } from "./pipeline.js";

export const GEMINI_MAX_OUTPUT_TOKENS = 16384;
export { DEFAULT_CALL_TIMEOUT_MS, ScanDeadlineError };

export function geminiEndpoint(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${HYDROGEN_MODEL}:generateContent`;
}

export function geminiRequestBody(prompt: string, imageBase64: string): Record<string, unknown> {
  const bare = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  return {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: bare } },
        { text: prompt },
      ],
    }],
    generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS },
  };
}

export function extractGeminiText(payload: unknown): string {
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }).candidates ?? [];
  const parts = candidates[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part?.thought !== true && typeof part?.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

export function geminiCaller(
  imageBase64: string,
  usage: TokenUsage,
  options?: { timeoutMs?: number; budget?: ScanBudget; fetchImpl?: typeof fetch },
): ModelCaller {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!key) throw new UpstreamError("The analysis service is not configured.", 503, false);
  const timeoutMs = clampCallTimeout(options?.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS);
  const budget = options?.budget ?? createScanBudget(timeoutMs);
  return async (prompt: string, accept?: (text: string) => boolean) => {
    const text = await generateGeminiText({
      key,
      prompt,
      imageBase64,
      usage,
      timeoutMs,
      budget,
      accept,
      fetchImpl: options?.fetchImpl,
    });
    return { text };
  };
}

function isRetryableGemini(error: unknown): boolean {
  if (!(error instanceof UpstreamError)) return false;
  return error.retryable || error.status === 429 || error.status === 504 || error.status >= 500;
}

/**
 * One model call. At most one retry, and only for a timeout, 429, 5xx, or an
 * empty or unparsed body. A 4xx other than 429 is not retried. A call that
 * cannot finish before the scan deadline is not started.
 */
export async function generateGeminiText(input: {
  key: string;
  prompt: string;
  imageBase64: string;
  usage: TokenUsage;
  timeoutMs: number;
  budget: ScanBudget;
  accept?: (text: string) => boolean;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  let lastText: string | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!input.budget.canStart()) {
      if (lastError) throw lastError;
      if (lastText != null) return lastText;
      throw new ScanDeadlineError();
    }
    try {
      const text = await once(input);
      const accepted = text.trim().length > 0 && (input.accept ? input.accept(text) : true);
      if (accepted) return text;
      lastText = text;
      lastError = null;
      logAttempt(attempt, text.trim() ? "unparsed" : "empty", 0);
    } catch (error) {
      if (!isRetryableGemini(error)) throw error;
      lastError = error;
      lastText = null;
      const status = error instanceof UpstreamError ? error.status : 0;
      logAttempt(attempt, status === 504 ? "timeout" : "http", status);
    }
  }
  if (lastText != null) return lastText;
  if (lastError) throw lastError;
  throw new ScanDeadlineError();
}

function logAttempt(attempt: number, reason: string, status: number) {
  console.log(JSON.stringify({
    event: "provider_error",
    provider: "gemini",
    model: HYDROGEN_MODEL,
    status,
    attempt,
    waitedMs: 0,
    reason,
  }));
}

async function once(input: {
  key: string;
  prompt: string;
  imageBase64: string;
  usage: TokenUsage;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(geminiEndpoint(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": input.key,
        "content-type": "application/json",
      },
      body: JSON.stringify(geminiRequestBody(input.prompt, input.imageBase64)),
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new UpstreamError(`Gemini ${response.status}`, response.status, retryable);
    }
    const payload = await response.json() as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const usageMeta = payload.usageMetadata ?? {};
    const promptTokens = Number(usageMeta.promptTokenCount) || 0;
    const completionTokens = Number(usageMeta.candidatesTokenCount) || 0;
    const thoughtTokens = Number(usageMeta.thoughtsTokenCount) || 0;
    addUsage(input.usage, promptTokens, completionTokens + thoughtTokens);
    return extractGeminiText(payload);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new UpstreamError("The analysis timed out.", 504, true);
    }
    throw new UpstreamError("The analysis service could not be reached.", 502, true);
  } finally {
    clearTimeout(timer);
  }
}
