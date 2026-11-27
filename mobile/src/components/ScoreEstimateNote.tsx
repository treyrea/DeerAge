import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SCORE_ESTIMATE_BLOCKS,
  SCORE_ESTIMATE_SHEET_TITLE,
  scoreEstimateLine,
} from "../lib/score-estimate";
import { softPulse } from "../lib/haptics";
import { BLIND } from "../utils/blind-verdict";
import { tapSquare } from "../theme/tap";

interface ScoreEstimateNoteProps {
  /** Distinct uploaded photos. A burst is one viewpoint, so this stays 1 today. */
  viewpoints?: number | null;
  color?: string;
}

/** One muted line under a rack score. The three-block explanation opens on tap. */
export function ScoreEstimateNote({
  viewpoints = 1,
  color = "rgba(255,255,255,0.72)",
}: ScoreEstimateNoteProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const line = scoreEstimateLine(viewpoints);

  return (
    <>
      <Pressable
        testID="score-estimate-line"
        accessibilityRole="button"
        accessibilityLabel={line}
        accessibilityHint="Shows how this score is estimated"
        onPress={() => {
          softPulse();
          setOpen(true);
        }}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={{ marginTop: 6, minHeight: 32, justifyContent: "center" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color, fontSize: 13, lineHeight: 18, flexShrink: 1 }}>{line}</Text>
          <Ionicons name="information-circle-outline" size={15} color={color} style={{ marginLeft: 4 }} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View style={{ backgroundColor: "#1C1B17", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 16, maxHeight: "80%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ color: BLIND.ink, fontSize: 20, fontWeight: "700", flex: 1 }}>{SCORE_ESTIMATE_SHEET_TITLE}</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} hitSlop={8} style={tapSquare}>
                <Ionicons name="close" size={26} color={BLIND.muted} />
              </Pressable>
            </View>
            <ScrollView>
              {SCORE_ESTIMATE_BLOCKS.map((block) => (
                <View key={block.title} style={{ marginBottom: 16 }}>
                  <Text style={{ color: BLIND.walk, fontSize: 16, fontWeight: "700", marginBottom: 6 }}>{block.title}</Text>
                  <Text style={{ color: BLIND.ink, fontSize: 15, lineHeight: 22 }}>{block.body}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setOpen(false)} style={{ borderRadius: 14, minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#2C2A24", marginTop: 12 }}>
              <Text style={{ color: BLIND.ink, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
