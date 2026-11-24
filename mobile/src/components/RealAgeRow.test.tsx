import React from "react";
import { Platform } from "react-native";
import { REAL_AGES, REAL_AGE_SOURCES } from "../lib/help-improve";

type TestRoot = {
  toJSON: () => unknown;
  root: {
    findByProps: (props: Record<string, unknown>) => { props: { onPress: () => void } };
    findAllByProps: (props: Record<string, unknown>) => unknown[];
  };
};

const TestRenderer = require("react-test-renderer") as {
  create: (element: React.ReactElement) => TestRoot;
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
};

jest.mock("../state/hunterProfile", () => ({
  useHunterProfile: (select: (state: { helpImprove: boolean }) => unknown) => select({ helpImprove: true }),
}));

jest.mock("../state/remoteConfig", () => ({
  useRemoteConfig: (select: (state: { contributeEnabled: boolean }) => unknown) =>
    select({ contributeEnabled: true }),
}));

const mockSendRealAge = jest.fn(async (_jobId: string, _age: string, _source: string) => true);

jest.mock("../api/contribution", () => ({
  sendRealAge: (jobId: string, age: string, source: string) => mockSendRealAge(jobId, age, source),
}));

import { RealAgeRow } from "./RealAgeRow";

const labels = (tree: TestRoot) => JSON.stringify(tree.toJSON());

describe("RealAgeRow on Android", () => {
  const original = Platform.OS;

  beforeAll(() => {
    Platform.OS = "android";
  });

  afterAll(() => {
    Platform.OS = original;
  });

  beforeEach(() => {
    mockSendRealAge.mockClear();
  });

  it("lists all seven ages in the picker, not just the first two", () => {
    let tree!: TestRoot;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<RealAgeRow jobId="job-1" color="#F5F5DC" />);
    });
    expect(labels(tree)).not.toContain("1.5");

    TestRenderer.act(() => {
      tree.root.findByProps({ testID: "real-age-row" }).props.onPress();
    });

    const shown = labels(tree);
    for (const age of REAL_AGES) {
      expect(shown).toContain(age);
    }
    expect(tree.root.findAllByProps({ testID: "real-age-picker" }).length).toBeGreaterThan(0);
    expect(shown).toContain("Cancel");
  });

  it("saves the selected age after the source step", async () => {
    let tree!: TestRoot;
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<RealAgeRow jobId="job-1" color="#F5F5DC" />);
    });

    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: "real-age-row" }).props.onPress();
    });
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: "real-age-option-4.5" }).props.onPress();
    });
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: `real-age-option-${REAL_AGE_SOURCES[0].label}` }).props.onPress();
    });

    expect(mockSendRealAge).toHaveBeenCalledWith("job-1", "4.5", "jawbone");
    expect(labels(tree)).toContain("Real age saved: 4.5. Thanks.");
  });
});
