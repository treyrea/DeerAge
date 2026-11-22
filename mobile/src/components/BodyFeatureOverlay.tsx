/**
 * Body Feature Analysis.
 * Numbered dots sit on the photo. The words live in the list underneath.
 */

import React, { useEffect, useRef, useState, type RefObject } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { BodyFeatureOverlay } from "../types/deer-scoring";
import { dotCenter } from "../api/body-overlays";
import { LEAN_WORD, regionRows } from "../utils/body-cues";
import { BLIND } from "../utils/blind-verdict";

const GOLD = "#D4AF37";
const DOT = 22;

interface Props {
  imageUri: string;
  overlays: BodyFeatureOverlay[];
  showOverlays: boolean;
  onToggleOverlays: () => void;
  scrollRef?: RefObject<ScrollView | null>;
  scrollOffset?: RefObject<number>;
}

export const BodyFeatureOverlayComponent: React.FC<Props> = ({
  imageUri,
  overlays,
  showOverlays,
  onToggleOverlays,
  scrollRef,
  scrollOffset,
}) => {
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, View | null>>({});
  const rows = regionRows(overlays);

  useEffect(() => {
    setSelectedId(null);
    setExpandedId(null);
  }, [overlays]);

  useEffect(() => {
    let live = true;
    Image.getSize(
      imageUri,
      (width, height) => {
        if (live) setPhotoSize({ width, height });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [imageUri]);

  const scrollToRow = (featureId: string) => {
    const row = rowRefs.current[featureId];
    const scroller = scrollRef?.current;
    if (!row || !scroller) return;
    row.measureInWindow((_x, rowY, _width, rowHeight) => {
      const frame = scroller as unknown as {
        measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
      };
      frame.measureInWindow((_sx, top, _sw, viewHeight) => {
        const offset = rowY - top;
        if (offset >= 8 && offset + rowHeight <= viewHeight - 8) return;
        scroller.scrollTo({
          y: Math.max(0, (scrollOffset?.current ?? 0) + offset - 12),
          animated: true,
        });
      });
    });
  };

  const focus = (featureId: string, fromDot: boolean) => {
    void Haptics.selectionAsync().catch(() => undefined);
    const row = rows.find((item) => item.featureId === featureId);
    if (selectedId === featureId) {
      if (row?.detail) setExpandedId((current) => (current === featureId ? null : featureId));
    } else {
      setSelectedId(featureId);
      setExpandedId(null);
    }
    if (fromDot) scrollToRow(featureId);
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ color: BLIND.ink, fontSize: 15, fontWeight: "600" }}>Body Feature Analysis</Text>
        {rows.length === 0 ? (
          <Text style={{ color: BLIND.muted, fontSize: 13 }}>No outlines for this photo</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showOverlays ? "Hide overlays" : "Show overlays"}
            onPress={onToggleOverlays}
            style={{ minHeight: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: 2 }}
          >
            <Ionicons name={showOverlays ? "eye" : "eye-off"} size={16} color={BLIND.button} />
            <Text style={{ color: BLIND.button, fontSize: 13, fontWeight: "600", marginLeft: 6 }}>
              {showOverlays ? "Hide" : "Show"} Overlays
            </Text>
          </Pressable>
        )}
      </View>

      <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#1C1B17" }}>
        <Image
          source={{ uri: imageUri }}
          style={{ width: "100%", height: 300 }}
          resizeMode="contain"
          accessible={false}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setImageLayout({ width, height });
          }}
        />
        {showOverlays && imageLayout.width > 0 ? (
          <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            {rows.map((row) => {
              const center = dotCenter(
                imageLayout.width,
                imageLayout.height,
                photoSize.width,
                photoSize.height,
                row.anchor,
                DOT / 2,
              );
              const selected = selectedId === row.featureId;
              const size = selected ? DOT + 4 : DOT;
              return (
                <Pressable
                  key={row.featureId}
                  testID={`body-dot-${row.number}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Region ${row.number}, ${row.name}`}
                  accessibilityState={{ selected }}
                  onPress={() => focus(row.featureId, true)}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    left: center.x - size / 2,
                    top: center.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: GOLD,
                    borderWidth: 1.5,
                    borderColor: "#1A1814",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: selected ? 2 : 1,
                  }}
                >
                  <Text style={{ color: "#1A1814", fontSize: 12, fontWeight: "700" }}>{row.number}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {rows.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          {rows.map((row) => {
            const selected = selectedId === row.featureId;
            const expanded = expandedId === row.featureId && Boolean(row.detail);
            return (
              <View
                key={row.featureId}
                ref={(node) => {
                  rowRefs.current[row.featureId] = node;
                }}
                collapsable={false}
              >
                <Pressable
                  testID={`body-line-${row.number}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.number}. ${row.name}${row.cue ? `, ${row.cue}` : ""}`}
                  accessibilityState={{ selected, expanded }}
                  onPress={() => focus(row.featureId, false)}
                  style={{
                    minHeight: 44,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 8,
                    borderRadius: 10,
                    backgroundColor: selected ? "rgba(212, 175, 55, 0.14)" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: DOT / 2,
                      backgroundColor: GOLD,
                      borderWidth: 1.5,
                      borderColor: "#1A1814",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#1A1814", fontSize: 12, fontWeight: "700" }}>{row.number}</Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ color: BLIND.ink, fontSize: 15, fontWeight: "600", marginLeft: 10, flexShrink: 1 }}
                  >
                    {row.name}
                  </Text>
                  {row.cue ? (
                    <Text numberOfLines={1} style={{ color: BLIND.muted, fontSize: 15, marginLeft: 8, flex: 1 }}>
                      {row.cue}
                    </Text>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  {row.lean ? (
                    <Text style={{ color: leanColor(row.lean), fontSize: 12, fontWeight: "600", marginLeft: 8 }}>
                      {LEAN_WORD[row.lean]}
                    </Text>
                  ) : null}
                </Pressable>
                {expanded ? (
                  <Text style={{ color: BLIND.ink, fontSize: 15, lineHeight: 22, marginLeft: 40, marginRight: 8, marginBottom: 8 }}>
                    {row.detail}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

function leanColor(lean: "older" | "younger" | "neutral"): string {
  if (lean === "older") return BLIND.take;
  if (lean === "younger") return BLIND.walk;
  return BLIND.muted;
}
