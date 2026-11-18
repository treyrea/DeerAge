/**
 * One free re-scan of a photo the hunter agreed to keep.
 * Calls the current age pipeline. Does not change it, and does not bill a fair-use slot.
 */

import { runAgeCall, type AgeOutcome } from "./age-pipeline.js";

type RescanRunner = (image: string, minimum: number) => Promise<AgeOutcome>;

let runner: RescanRunner = (image, minimum) => runAgeCall(image, minimum);

export function setRescanRunnerForTests(next: RescanRunner | null): void {
  runner = next ?? ((image, minimum) => runAgeCall(image, minimum));
}

export async function rescanKeptPhoto(image: string, minimum: number): Promise<AgeOutcome> {
  return runner(image, minimum);
}
