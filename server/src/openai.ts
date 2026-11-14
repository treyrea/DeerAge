import { addUsage, type TokenUsage } from "./cost";
import { modelName } from "./config";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail: "low" | "auto" | "high" };
}

export async function visionJson(options: {
  prompt: string;
  images: string[];
  detail: "low" | "auto" | "high";
  maxTokens: number;
  timeoutMs: number;
  retries?: number;
  usage: TokenUsage;
}): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new UpstreamError("OpenAI is not configured.", 503, false);
  }

  const content: ContentPart[] = [{ type: "text", text: options.prompt }];
  for (const image of options.images) {
    const bare = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${bare}`, detail: options.detail },
    });
  }

  const run = async (): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName(),
          temperature: 0.1,
          max_tokens: options.maxTokens,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content }],
        }),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new UpstreamError(`OpenAI ${response.status}`, response.status, retryable);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      addUsage(options.usage, Number(payload.usage?.prompt_tokens) || 0, Number(payload.usage?.completion_tokens) || 0);
      const text = payload.choices?.[0]?.message?.content ?? "";
      return parseJson(text);
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new UpstreamError("The analysis timed out.", 504, true);
      }
      throw new UpstreamError("The analysis service could not be reached.", 502, true);
    } finally {
      clearTimeout(timer);
    }
  };

  const attempts = Math.max(1, (options.retries ?? 0) + 1);
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const retryable = error instanceof UpstreamError && error.retryable;
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw last;
}

function parseJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new UpstreamError("The analysis response was unreadable.", 502, false);
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}
