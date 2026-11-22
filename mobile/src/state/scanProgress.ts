/** The running scan's progress, fed by the status polls. Not persisted. */

import { create } from "zustand";
import { parseServerProgress, type ScanMode, type ServerProgress } from "../lib/scan-progress";

interface ScanProgressState {
  mode: ScanMode | null;
  startedAt: number;
  server: ServerProgress | null;
  receivedAt: number | null;
  done: boolean;
  start: (mode: ScanMode) => void;
  /** value is the job's progress; serverNow lets the phone allow for the time since the server wrote it. */
  report: (value: unknown, serverNow?: unknown) => void;
  finish: () => void;
}

export const useScanProgress = create<ScanProgressState>((set, get) => ({
  mode: null,
  startedAt: 0,
  server: null,
  receivedAt: null,
  done: false,
  start: (mode) => set({ mode, startedAt: Date.now(), server: null, receivedAt: null, done: false }),
  report: (value, serverNow) => {
    const next = parseServerProgress(value);
    if (!next) return;
    const current = get().server;
    if (current && current.stage === next.stage && current.etaMs === next.etaMs) return;
    const writtenAt = Number((value as { at?: unknown }).at);
    const now = Number(serverNow);
    const age = Number.isFinite(writtenAt) && Number.isFinite(now) ? Math.min(30_000, Math.max(0, now - writtenAt)) : 0;
    set({ server: next, receivedAt: Date.now() - age });
  },
  finish: () => set({ done: true }),
}));
