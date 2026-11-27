/**
 * The words on a Probably-a-doe or Could-be-a-young-buck result.
 * Same quiet type as the age result: headline, then the age line, then one note.
 */

import React from "react";
import { Text, View } from "react-native";
import type { AntlerlessRead as AntlerlessCopy } from "../types/deer-scoring";

export function AntlerlessRead({
  read,
  ink,
  muted,
}: {
  read: AntlerlessCopy;
  ink: string;
  muted: string;
}) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text testID="antlerless-headline" style={{ color: ink, fontSize: 34, fontWeight: "800", letterSpacing: 0.2 }}>
        {read.headline}
      </Text>
      {read.ageLine ? (
        <Text testID="antlerless-age" style={{ color: ink, fontSize: 22, fontWeight: "700", marginTop: 8, lineHeight: 28 }}>
          {read.ageLine}
        </Text>
      ) : null}
      {read.reason ? (
        <Text style={{ color: muted, fontSize: 17, lineHeight: 24, marginTop: 14 }}>{read.reason}</Text>
      ) : null}
      {read.note ? (
        <Text style={{ color: muted, fontSize: 17, lineHeight: 24, marginTop: 14 }}>{read.note}</Text>
      ) : null}
    </View>
  );
}
