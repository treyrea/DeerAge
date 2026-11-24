import React, { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { dotCenter } from "../api/body-overlays";
import { leadCueLines, leadOverlays, type LeadCueLine } from "../lib/lead-cues";
import { CREAM, GOLD, INK } from "../theme/contrast";
import type { BodyFeatureOverlay } from "../types/deer-scoring";
import { regionRows } from "../utils/body-cues";

const DOT = 26;
const PHOTO_HEIGHT = 320;

interface ResultLeadProps {
  imageUri: string;
  call?: string;
  callColor?: string;
  overlays?: BodyFeatureOverlay[];
  cues?: LeadCueLine[];
  onPressPhoto?: () => void;
  callTestID?: string;
}

function cueSuffix(name: string, cue: string): string {
  if (!cue || cue.toLowerCase() === name.toLowerCase()) return "";
  return ` · ${cue}`;
}

/** Large photo, the call on it, then the cues the read actually returned. */
export function ResultLead({
  imageUri,
  call,
  callColor = CREAM,
  overlays = [],
  cues = [],
  onPressPhoto,
  callTestID,
}: ResultLeadProps) {
  const rows = regionRows(leadOverlays(overlays));
  const lines = rows.length > 0 ? [] : leadCueLines(cues);
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let live = true;
    if (!imageUri) return undefined;
    try {
      Image.getSize(
        imageUri,
        (width, height) => {
          if (live && width > 0 && height > 0) setPhotoSize({ width, height });
        },
        () => undefined,
      );
    } catch {
      // A bad thumbnail must not take down the result.
    }
    return () => {
      live = false;
    };
  }, [imageUri]);

  const photo = (
    <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#1C1B17" }}>
      <Image
        source={{ uri: imageUri }}
        style={{ width: "100%", height: PHOTO_HEIGHT }}
        resizeMode="contain"
        accessible={false}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setFrame({ width, height });
        }}
      />
      {call ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(18, 20, 16, 0.72)" }}>
          <Text
            testID={callTestID}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            numberOfLines={1}
            style={{ color: callColor, fontSize: 32, fontWeight: "800", textAlign: "center" }}
          >
            {call}
          </Text>
        </View>
      ) : null}
      {rows.length > 0 && frame.width > 0 ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          {rows.map((row) => {
            const center = dotCenter(frame.width, frame.height, photoSize.width, photoSize.height, row.anchor, DOT / 2);
            return (
              <View
                key={row.featureId}
                style={{
                  position: "absolute",
                  left: center.x - DOT / 2,
                  top: center.y - DOT / 2,
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  backgroundColor: GOLD,
                  borderWidth: 1.5,
                  borderColor: INK,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: INK, fontSize: 13, fontWeight: "700" }}>{row.number}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ marginBottom: 14 }}>
      {onPressPhoto ? (
        <Pressable accessibilityRole="button" accessibilityLabel="View full size photo" onPress={onPressPhoto}>
          {photo}
        </Pressable>
      ) : photo}
      {rows.map((row) => (
        <Text key={row.featureId} style={{ color: CREAM, fontSize: 16, lineHeight: 22, marginTop: 8 }}>
          {`${row.number}. ${row.name}${cueSuffix(row.name, row.cue)}`}
        </Text>
      ))}
      {lines.map((line) => (
        <Text key={`${line.area}-${line.text}`} style={{ color: CREAM, fontSize: 16, lineHeight: 22, marginTop: 8 }}>
          {`${line.area}: ${line.text}`}
        </Text>
      ))}
    </View>
  );
}
