import React from "react";
import { Text, View } from "react-native";
import { bulletsFrom, fieldRead, type CueBullet, type FieldCall } from "../utils/field-call";

interface FieldCallCardProps {
  ageYears: number;
  confidence: number;
  minimum: number;
  cueBullets?: unknown;
  fallbackCues?: string[];
  fieldCall?: FieldCall;
  note?: string;
  scoreLabel?: string;
  bodyOnlyAge?: number | null;
  betterAngle?: string;
  ageLabel?: string;
  hunterCue?: string;
}

const CALL_COLOR: Record<FieldCall, string> = {
  SHOOTER: "#D4AF37",
  "LET WALK": "#E5D4B8",
  BORDERLINE: "#F5F5DC",
};

export const FieldCallCard = ({
  ageYears,
  confidence,
  minimum,
  cueBullets,
  fallbackCues = [],
  fieldCall,
  note,
  scoreLabel,
  bodyOnlyAge,
  betterAngle,
  ageLabel,
  hunterCue,
}: FieldCallCardProps) => {
  const read = fieldRead(ageYears, confidence, minimum);
  const call = fieldCall ?? read.fieldCall;
  const shownAge = ageLabel?.trim() || read.ageClass;
  const isRange = Boolean(ageLabel && /[–-]/.test(ageLabel));
  const lines: CueBullet[] = bulletsFrom(cueBullets, fallbackCues);
  return (
    <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#8B7355" }}>
      <Text style={{ color: "#8B7355", fontSize: 13, fontWeight: "700" }}>
        Your lease minimum: {read.leaseMinimum >= 6.5 ? "6.5+" : read.leaseMinimum.toFixed(1)}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }}>
        <View>
          <Text style={{ color: "#F5F5DC", fontSize: 40, fontWeight: "800" }}>{shownAge}</Text>
          <Text style={{ color: "#E5D4B8", fontSize: 13 }}>{isRange ? "Age range" : "Age class"}</Text>
        </View>
        <Text style={{ color: CALL_COLOR[call], fontSize: 28, fontWeight: "800", marginBottom: 4 }}>{call}</Text>
      </View>
      <Text style={{ color: "#E5D4B8", marginTop: 12, lineHeight: 20 }}>{note || read.fieldCallNote}</Text>
      {isRange ? (
        <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 20 }}>The body fits both ages.</Text>
      ) : null}
      {hunterCue ? (
        <Text style={{ color: "#F5F5DC", marginTop: 8, lineHeight: 20 }}>{hunterCue}</Text>
      ) : null}
      {lines.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700", marginBottom: 6 }}>WHY THIS AGE CLASS</Text>
          {lines.map((line) => (
            <Text key={`${line.area}-${line.text}`} style={{ color: "#F5F5DC", marginBottom: 6, lineHeight: 20 }}>
              {line.area}: {line.text}
            </Text>
          ))}
        </View>
      ) : null}
      {bodyOnlyAge != null ? (
        <Text style={{ color: "#E5D4B8", marginTop: 8 }}>Body-only read: {bodyOnlyAge}</Text>
      ) : null}
      {betterAngle ? (
        <Text style={{ color: "#D4AF37", marginTop: 8, lineHeight: 20 }}>{betterAngle}</Text>
      ) : null}
      {scoreLabel ? (
        <Text style={{ color: "#8B7355", marginTop: 10, fontSize: 13 }}>{scoreLabel}</Text>
      ) : null}
      {confidence > 0 ? (
        <Text style={{ color: "#8B7355", marginTop: 4, fontSize: 13 }}>{confidence}% read from the photo</Text>
      ) : null}
    </View>
  );
};
