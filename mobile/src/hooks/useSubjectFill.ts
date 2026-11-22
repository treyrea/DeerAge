import { useEffect, useRef, useState, type RefObject } from "react";
import type { Camera } from "react-native-vision-camera";
import * as FileSystem from "expo-file-system/legacy";
import { detectSubjects, isSubjectFillAvailable } from "../lib/subject-fill";
import {
  anySubjectFillsGuide,
  guideInPreview,
  mapImageBoxToPreview,
  type NormBox,
} from "../lib/frame-fill";

const CHECK_EVERY_MS = 400;

export interface WindowBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseSubjectFillInput {
  enabled: boolean;
  cameraRef: RefObject<Camera | null>;
  preview: WindowBox | null;
  guide: WindowBox | null;
}

/**
 * Throttled on-device fill check (about 2–3 times a second). Stays false
 * (gold brackets) if the native detector is missing, a check fails, or the
 * subject does not fill the guide. No server calls.
 */
export function useSubjectFill({ enabled, cameraRef, preview, guide }: UseSubjectFillInput): boolean {
  const [filled, setFilled] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setFilled(false);
      return;
    }
    if (!isSubjectFillAvailable()) {
      setFilled(false);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled || inFlight.current) return;
      const camera = cameraRef.current;
      const previewBox = preview;
      const guideBox = guide;
      if (!camera || !previewBox || !guideBox) return;
      const guideNorm = guideInPreview(guideBox, previewBox);
      if (!guideNorm) return;

      inFlight.current = true;
      let snapshotPath: string | undefined;
      try {
        const snapshot = await camera.takeSnapshot({ quality: 30 });
        snapshotPath = snapshot.path.startsWith("file://") ? snapshot.path : `file://${snapshot.path}`;
        const detected = await detectSubjects(snapshotPath);
        if (cancelled) return;
        const subjects: NormBox[] = detected.boxes.map((box) => {
          if (detected.imageWidth > 0 && detected.imageHeight > 0) {
            return mapImageBoxToPreview(box, detected.imageWidth, detected.imageHeight, previewBox.width, previewBox.height);
          }
          return box;
        });
        setFilled(anySubjectFillsGuide(subjects, guideNorm));
      } catch {
        if (!cancelled) setFilled(false);
      } finally {
        inFlight.current = false;
        if (snapshotPath) {
          FileSystem.deleteAsync(snapshotPath, { idempotent: true }).catch(() => undefined);
        }
      }
    };

    void tick();
    const timer = setInterval(() => { void tick(); }, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, cameraRef, preview, guide]);

  return filled;
}
