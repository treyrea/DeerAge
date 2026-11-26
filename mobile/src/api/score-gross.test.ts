import { serverGrossForMissingTines } from "./score-gross";

describe("server gross when tines are missing", () => {
  it("keeps a positive gross and ignores a zero or a rack that already has tines", () => {
    expect(serverGrossForMissingTines({}, {}, 0, 132)).toBe(132);
    expect(serverGrossForMissingTines({}, {}, 0, "140.5")).toBe(140.5);
    expect(serverGrossForMissingTines({}, {}, 0, 0)).toBeNull();
    expect(serverGrossForMissingTines({}, {}, 0, null)).toBeNull();
    expect(serverGrossForMissingTines({ g1: 4 }, { g1: 3 }, 0, 132)).toBeNull();
    expect(serverGrossForMissingTines({}, {}, 1, 132)).toBeNull();
    expect(serverGrossForMissingTines({ g2: 0, g3: 0 }, { g1: 0 }, 0, 98)).toBe(98);
  });
});