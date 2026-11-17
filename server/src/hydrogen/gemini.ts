/**
 * Gemini generateContent call, matching the tested runner's request:
 * model gemini-4-hydrogen, inline JPEG, maxOutputTokens 16384,
 * key in the x-goog-api-key header (never the URL, never a log).
 */

import { addUsage, type TokenUsage } from "../cost.js";
import { UpstreamError } from "../openai.js";
import { withBackoff } from "../retry.js";
import { HYDROGEN_MODEL } from "../aging-switch.js";
import type { ModelCaller } from "./pipeline.js";

export const GEMINI_MAX_OUTPUT_TOKENS = 16384;
/** Three attempts, with backoff, still fit inside the 300s function budget. */
const CALL_TIMEOUT_MS = 20_000;

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

export function geminiCaller(imageBase64: string, usage: TokenUsage): ModelCaller {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!key) throw new UpstreamError("The analysis service is not configured.", 503, false);
  return async (prompt: string) => {
    const text = await withRetry(key, prompt, imageBase64, usage);
    return { text };
  };
}

async function withRetry(key: string, prompt: string, imageBase64: string, usage: TokenUsage): Promise<string> {
  return withBackoff(() => once(key, prompt, imageBase64, usage), {
    attempts: 3,
    retryable: (error) => error instanceof UpstreamError && (error.retryable || error.status === 504),
    onError: (error, attempt, waitedMs) => {
      const status = error instanceof UpstreamError ? error.status : 0;
      console.log(JSON.stringify({
        event: "provider_error",
        provider: "gemini",
        model: HYDROGEN_MODEL,
        status,
        attempt,
        waitedMs,
      }));
    },
  });
}

async function once(key: string, prompt: string, imageBase64: string, usage: TokenUsage): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await fetch(geminiEndpoint(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify(geminiRequestBody(prompt, imageBase64)),
    });
    if (!response.ok) {
      throw new UpstreamError(`Gemini ${response.status}`, response.status, response.status >= 500);
    }
    const payload = await response.json() as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const usageMeta = payload.usageMetadata ?? {};
    const promptTokens = Number(usageMeta.promptTokenCount) || 0;
    const completionTokens = Number(usageMeta.candidatesTokenCount) || 0;
    const thoughtTokens = Number(usageMeta.thoughtsTokenCount) || 0;
    addUsage(usage, promptTokens, completionTokens + thoughtTokens);
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
