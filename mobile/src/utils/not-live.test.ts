import {
  isNotLiveRejection,
  notLiveTips,
  quickCheckRejectionTitle,
  rejectionTitle,
} from "./not-live";

const MOUNT = "This looks like a mount, not a live deer. Point DeerAge at a live buck standing broadside.";
const DECOY = "This looks like a decoy or a target, not a live deer. Point DeerAge at a live buck standing broadside.";
const DRAWING = "This looks like a drawing, not a live deer. Point DeerAge at a live buck standing broadside.";
const HARVESTED = "DeerAge ages live standing deer. This deer looks harvested or dead, so there is no pre-shot call. For an accurate age, check the teeth on the lower jawbone.";
const NOT_A_DEER = "This photo doesn't show a deer.";
const ZOOM = "Get closer or zoom in until the body fills the frame.";

describe("not a live deer", () => {
  it("reads a mount message as not live", () => {
    expect(isNotLiveRejection("not_deer", MOUNT)).toBe(true);
    expect(isNotLiveRejection("not_deer", MOUNT.toUpperCase())).toBe(true);
    expect(quickCheckRejectionTitle({ reason: "not_deer", message: MOUNT })).toBe("NOT A LIVE DEER");
    expect(rejectionTitle("retake", DECOY, "Try another photo")).toBe("NOT A LIVE DEER");
    expect(rejectionTitle("retake", DRAWING, "Try another photo")).toBe("NOT A LIVE DEER");
    expect(quickCheckRejectionTitle({ reason: "head_mount" })).toBe("NOT A LIVE DEER");
  });

  it("reads a harvested message as not live", () => {
    expect(isNotLiveRejection("retake", HARVESTED)).toBe(true);
    expect(isNotLiveRejection("too_small", HARVESTED)).toBe(true);
    expect(quickCheckRejectionTitle({ reason: "too_small", message: HARVESTED })).toBe("NOT A LIVE DEER");
    expect(rejectionTitle("retake", HARVESTED, "Try another photo")).toBe("NOT A LIVE DEER");
    expect(notLiveTips(HARVESTED)).toEqual(["Check the teeth on the lower jawbone."]);
  });

  it("keeps a true non-deer as NOT A DEER", () => {
    expect(isNotLiveRejection("not_deer", NOT_A_DEER)).toBe(false);
    expect(quickCheckRejectionTitle({ reason: "not_deer", message: NOT_A_DEER })).toBe("NOT A DEER");
    expect(rejectionTitle("not_deer", NOT_A_DEER, "NOT A DEER")).toBe("NOT A DEER");
    expect(quickCheckRejectionTitle({
      reason: "not_deer",
      message: "No deer found\nGet the whole deer in frame, broadside if you can, and try again.",
    })).toBe("NOT A DEER");
  });

  it("keeps a real retake or zoom message as GET CLOSER", () => {
    expect(isNotLiveRejection("too_small", ZOOM)).toBe(false);
    expect(isNotLiveRejection("retake", ZOOM)).toBe(false);
    expect(quickCheckRejectionTitle({ reason: "too_small", message: ZOOM })).toBe("GET CLOSER OR ZOOM IN");
    expect(rejectionTitle("retake", ZOOM, "GET CLOSER OR ZOOM IN")).toBe("GET CLOSER OR ZOOM IN");
    expect(rejectionTitle("retake", "Try a side-on shot so the chest, belly, and rump are all visible.", "Try another photo")).toBe("Try another photo");
    expect(notLiveTips(ZOOM)).toBeNull();
  });

  it("does not retitle an unrelated error that happens to mention a mount", () => {
    expect(isNotLiveRejection("network", MOUNT)).toBe(false);
    expect(rejectionTitle("network", MOUNT, "YOU'RE OFFLINE")).toBe("YOU'RE OFFLINE");
    expect(isNotLiveRejection("not_deer", "The amount of light is poor.")).toBe(false);
  });
});
