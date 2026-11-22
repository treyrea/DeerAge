import * as Haptics from "expo-haptics";

/**
 * One soft pulse.
 * Taps, results, and errors all use this. No heavy impact and no notification pattern.
 */
export function softPulse(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
