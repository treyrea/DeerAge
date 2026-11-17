/**
 * Three failures open the provider for 60 seconds.
 * Upstash is used when Redis is configured. Otherwise the state stays in this process.
 */

import { redisConfigured } from "../limits.js";
import { redisGet, redisSet } from "../kv.js";

const OPEN_AFTER = 3;
const OPEN_MS = 60_000;

interface CircuitState {
  failures: number;
  openUntil: number;
}

const memory = new Map<string, CircuitState>();

export function resetCircuitsForTests(): void {
  memory.clear();
}

function key(provider: string): string {
  return `deerage:circuit:${provider}`;
}

async function read(provider: string): Promise<CircuitState> {
  const local = memory.get(provider) ?? { failures: 0, openUntil: 0 };
  if (!redisConfigured()) return local;
  try {
    const raw = await redisGet(key(provider));
    if (!raw) return local;
    const parsed = JSON.parse(raw) as CircuitState;
    if (!parsed || typeof parsed.failures !== "number") return local;
    return { failures: parsed.failures, openUntil: Number(parsed.openUntil) || 0 };
  } catch {
    return local;
  }
}

async function write(provider: string, state: CircuitState): Promise<void> {
  memory.set(provider, state);
  if (!redisConfigured()) return;
  try {
    await redisSet(key(provider), JSON.stringify(state));
  } catch {
    // The in-memory copy still opens the circuit in this process.
  }
}

export async function circuitOpen(provider: string, now = Date.now()): Promise<boolean> {
  const state = await read(provider);
  return state.openUntil > now;
}

export async function circuitNote(provider: string, ok: boolean, now = Date.now()): Promise<void> {
  if (ok) {
    await write(provider, { failures: 0, openUntil: 0 });
    return;
  }
  const state = await read(provider);
  const failures = state.failures + 1;
  await write(provider, {
    failures,
    openUntil: failures >= OPEN_AFTER ? now + OPEN_MS : state.openUntil,
  });
}
