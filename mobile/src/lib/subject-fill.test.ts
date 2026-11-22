import { detectSubjects, isSubjectFillAvailable } from "./subject-fill";

describe("subject fill native wrapper", () => {
  it("fails silent when the native module is not in this build", async () => {
    expect(isSubjectFillAvailable()).toBe(false);
    expect(await detectSubjects("file:///tmp/missing.jpg")).toEqual({
      boxes: [],
      imageWidth: 0,
      imageHeight: 0,
    });
  });
});
