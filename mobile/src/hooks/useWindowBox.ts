import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import type { WindowBox } from "./useSubjectFill";

function sameBox(a: WindowBox | null, b: WindowBox): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Measure a view in window coordinates, for mapping the guide onto a snapshot. */
export function useWindowBox() {
  const ref = useRef<View>(null);
  const [box, setBox] = useState<WindowBox | null>(null);

  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      const next = { x, y, width, height };
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    });
  }, []);

  return { ref, box, onLayout };
}
