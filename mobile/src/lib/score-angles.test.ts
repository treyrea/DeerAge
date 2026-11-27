import { angleScoreMatches, beginAngleScore, consumeAngleScore, offerRackScore, scoreSetFromFrames } from "./score-angles";

describe("rack angles", () => {
  it("keeps a burst as one angle and reads a pending multi-angle score once", () => {
    expect(scoreSetFromFrames([
      { imageUri: "file://a" },
      { imageUri: "file://b" },
    ])).toEqual([{ imageUri: "file://a", angleLabel: "First angle" }]);
    beginAngleScore({
      rescoreOf: "job_abcdef0123456789",
      shots: [
        { imageUri: "file://a", angleLabel: "First angle" },
        { imageUri: "file://side", angleLabel: "Other side" },
      ],
    });
    const pending = consumeAngleScore();
    expect(pending?.rescoreOf).toBe("job_abcdef0123456789");
    expect(pending?.shots).toHaveLength(2);
    expect(consumeAngleScore()).toBeNull();
  });

  it("only waives the follow-up whose photos are the ones just queued", () => {
    const queued = {
      rescoreOf: "job_abcdef0123456789",
      shots: [
        { imageUri: "file://a", angleLabel: "First angle" },
        { imageUri: "file://side", angleLabel: "Other side" },
      ],
    };
    expect(angleScoreMatches(queued, [{ imageUri: "file://a" }, { imageUri: "file://side" }])).toBe(true);
    expect(angleScoreMatches(queued, [{ imageUri: "file://burst" }])).toBe(false);
    expect(angleScoreMatches({ rescoreOf: null, shots: queued.shots }, queued.shots.map((shot) => ({ imageUri: shot.imageUri })))).toBe(true);
  });

  it("hides Score this rack for a doe, no antlers, or a mount", () => {
    expect(offerRackScore({})).toBe(true);
    expect(offerRackScore({ antlers: "YES" })).toBe(true);
    expect(offerRackScore({ antlers: "NO" })).toBe(false);
    expect(offerRackScore({ stop: "no_antlers" })).toBe(false);
    expect(offerRackScore({ stop: "not_live" })).toBe(false);
    expect(offerRackScore(null)).toBe(false);
  });
});