/**
 * Cost is prompt tokens plus completion tokens, at the configured dollars per million.
 * OpenAI already folds image tokens into prompt_tokens, so a separate image price is not applied.
 *
 * Defaults are $4 / 1M input and $20 / 1M output, the working rates for gpt-5.6-sol.
 * After Nov 30, 2026 the list price is about $5 / $30. Update the env vars then.
 * Change both rates whenever OPENAI_MODEL changes.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0 };
}

export function addUsage(target: TokenUsage, promptTokens: number, completionTokens: number) {
  target.promptTokens += Math.max(0, promptTokens);
  target.completionTokens += Math.max(0, completionTokens);
}

function rate(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function inputUsdPerMillion(): number {
  return rate("OPENAI_INPUT_USD_PER_MILLION", 4);
}

export function outputUsdPerMillion(): number {
  return rate("OPENAI_OUTPUT_USD_PER_MILLION", 20);
}

export function costUsd(usage: TokenUsage): number {
  return (usage.promptTokens * inputUsdPerMillion() + usage.completionTokens * outputUsdPerMillion()) / 1_000_000;
}

/** High estimate used to hold a slot against the daily cap before the call returns. */
export function reserveUsd(calls: number, maxOutputTokens: number): number {
  const usage = {
    promptTokens: Math.max(1, calls) * (800 + 2000),
    completionTokens: Math.max(1, calls) * maxOutputTokens,
  };
  return Math.max(costUsd(usage), 0.000001);
}
