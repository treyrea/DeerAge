import React from "react";
import { AppErrorBoundary } from "./AppErrorBoundary";

jest.mock("../state/deerScoringStore", () => ({
  useDeerScoringStore: { getState: () => ({ reset: () => undefined }) },
}));

const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    toJSON: () => unknown;
    unmount: () => void;
  };
};

function Boom(): React.ReactElement {
  throw new Error("render failed");
}

function render(element: React.ReactElement) {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  if (!renderer) throw new Error("renderer did not start");
  return renderer;
}

test("a render throw shows Back to home instead of a blank screen", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const renderer = render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  const tree = JSON.stringify(renderer.toJSON());
  expect(tree).toContain("Something went wrong");
  expect(tree).toContain("Back to home");
  TestRenderer.act(() => renderer.unmount());
  error.mockRestore();
});

test("children render when nothing throws", () => {
  const renderer = render(
    <AppErrorBoundary>
      <React.Fragment>ok</React.Fragment>
    </AppErrorBoundary>,
  );
  expect(JSON.stringify(renderer.toJSON())).toContain("ok");
  TestRenderer.act(() => renderer.unmount());
});
