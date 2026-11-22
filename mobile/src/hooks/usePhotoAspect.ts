import { useEffect, useState } from "react";
import { Image } from "react-native";

/** Width / height of a local or remote photo, or null until it is known. */
export function usePhotoAspect(uri: string | undefined): number | null {
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setAspect(null);
    if (!uri) return;
    Image.getSize(
      uri,
      (width, height) => {
        if (live && width > 0 && height > 0) setAspect(width / height);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [uri]);
  return aspect;
}
