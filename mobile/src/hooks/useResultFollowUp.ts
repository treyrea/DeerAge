import { useEffect, useRef } from "react";
import {
  REVIEW_PROMPT_DELAY_MS,
  isQualifyingGoodResult,
  maybeRequestStoreReview,
  type ReviewSubject,
} from "../lib/reviewPrompt";
import { scheduleCommunityPrompt } from "../state/communityStore";

function subjectKey(subject?: ReviewSubject | null): string {
  if (!subject) return "";
  return [
    subject.resultId ?? "",
    subject.fieldCall ?? "",
    String(subject.confidence ?? ""),
    subject.imageQuality ?? "",
    subject.isRange ? "1" : "0",
    subject.outcome ?? "",
  ].join("|");
}

/**
 * A finished read stays on screen. The rating sheet waits until the result
 * has been visible for a moment, and only for a confident age call.
 * Plans and the community note still wait until he leaves.
 */
export function useResultFollowUp(enabled: boolean, subject?: ReviewSubject | null) {
  const rescan = useRef(false);
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const key = subjectKey(subject);

  useEffect(() => {
    if (!enabled || rescan.current) return undefined;
    const current = subjectRef.current;
    if (!current || !isQualifyingGoodResult({ ...current, moment: "scan" })) return undefined;
    const scan: ReviewSubject = { ...current, moment: "scan" };
    void maybeRequestStoreReview(scan, { request: false });
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || rescan.current) return;
      void maybeRequestStoreReview(scan);
    }, REVIEW_PROMPT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    const started = Date.now();
    return () => {
      if (rescan.current) return;
      if (Date.now() - started < 800) return;
      scheduleCommunityPrompt();
    };
  }, [enabled]);

  return {
    markRescan: () => {
      rescan.current = true;
    },
    noteSavedOrShared: (moment: "save" | "share") => {
      if (rescan.current) return;
      const current = subjectRef.current;
      if (!current) return;
      void maybeRequestStoreReview({ ...current, moment });
    },
  };
}
