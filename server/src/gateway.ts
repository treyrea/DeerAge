/**
 * Vercel AI Gateway, OpenAI-compatible.
 * The key is AI_GATEWAY_API_KEY. Model ids come from the environment.
 * A timeout is not retried. A 429 or 5xx may be tried once.
 */

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface ModelCall {
  role: string;
  model: string;
  text: string;
  usd: number;
  ms: number;
  promptTokens: number;
  completionTokens: number;
}

export type ReasoningEffort = "low" | "medium" | null;

const ROLES = {
  fast: ["FAST_MODEL", "gpt-5.6-sol"],
  age: ["AGE_MODEL", "anthropic/claude-fable-5.2"],
  ageFallback: ["AGE_FALLBACK_MODEL", "google/gemini-4-carbon"],
  boxes: ["MASK_BOX_MODEL", "openai/gpt-6.1-sol"],
  masked: ["AGE_MODEL", "anthropic/claude-fable-5.2"],
  score: ["SCORE_MODEL", "google/gemini-4-carbon"],
  scoreFallback: ["SCORE_FALLBACK_MODEL", "anthropic/claude-fable-5.2"],
} as const;

export type ModelRole = keyof typeof ROLES;

export function modelFor(role: ModelRole): string {
  const [envName, fallback] = ROLES[role];
  return process.env[envName]?.trim() || fallback;
}

export function gatewayBase(): string {
  return (process.env.AI_GATEWAY_BASE_URL?.trim() || "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "");
}

export function parseFinal(text: string): Record<string, unknown> | null {
  const marked = text.match(/FINAL\s*(\{[\s\S]*\})\s*$/);
  const raw = marked?.[1] ?? text.trim().match(/\{[\s\S]*\}\s*$/)?.[0];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function imageUrl(image: string): string {
  const bare = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  return `data:image/jpeg;base64,${bare}`;
}

export async function callModel(options: {
  role: ModelRole;
  prompt: string;
  images: string[];
  maxTokens: number;
  timeoutMs: number;
  effort: ReasoningEffort;
  allowStatusRetry?: boolean;
}): Promise<ModelCall> {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) throw new GatewayError("The AI gateway is not configured.", 503, false);
  const model = modelFor(options.role);
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: options.prompt },
    ...options.images.map((image) => ({
      type: "image_url",
      image_url: { url: imageUrl(image), detail: "auto" },
    })),
  ];
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content }],
    max_completion_tokens: options.maxTokens,
  };
  if (options.effort) body.reasoning_effort = options.effort;

  const once = async (): Promise<ModelCall> => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(`${gatewayBase()}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new GatewayError(`Gateway ${response.status}`, response.status, false);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const usd = typeof payload.usage?.cost === "number" ? payload.usage.cost : 0;
      const call: ModelCall = {
        role: options.role,
        model,
        text,
        usd,
        ms: Date.now() - started,
        promptTokens,
        completionTokens,
      };
      console.log(JSON.stringify({ event: "analysis_cost", ...call, text: undefined }));
      return call;
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new GatewayError(timedOut ? "The model timed out." : "The model call failed.", timedOut ? 504 : 502, timedOut);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await once();
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : 0;
    const timedOut = error instanceof GatewayError && error.timedOut;
    if (timedOut || !options.allowStatusRetry || (status !== 429 && status < 500)) throw error;
    return once();
  }
}
