import React from "react";
import { Text, View } from "react-native";
import { bulletsFrom, fieldRead, type CueBullet, type FieldCall } from "../utils/field-call";

interface FieldCallCardProps {
  ageYears: number;
  confidence: number;
  ageClass: string;
  cueBullets?: unknown;
  fallbackCues?: string[];
  fieldCall?: FieldCall;
  maturity?: "young" | "mature";
  note?: string;
  scoreLabel?: string;
  title?: string;
}

const CALL_COLOR: Record<FieldCall, string> = {
  Shooter: "#D4AF37",
  Pass: "#E5D4B8",
  Borderline: "#F5F5DC",
};

export const FieldCallCard = ({
  ageYears,
  confidence,
  ageClass,
  cueBullets,
  fallbackCues = [],
  fieldCall,
  maturity,
  note,
  scoreLabel,
  title,
}: FieldCallCardProps) => {
  const read = fieldRead(ageYears, confidence);
  const call = fieldCall ?? read.fieldCall;
  const stage = maturity ?? read.maturity;
  const lines: CueBullet[] = bulletsFrom(cueBullets, fallbackCues);
  return (
    <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#8B7355" }}>
      <Text style={{ color: "#D4AF37", fontSize: 13, fontWeight: "700", letterSpacing: 0.6 }}>
        {stage === "mature" ? "MATURE" : "YOUNG"}
      </Text>
      <Text style={{ color: CALL_COLOR[call], fontSize: 32, fontWeight: "800", marginTop: 4 }}>{title ?? call}</Text>
      {!title && call === "Borderline" ? (
        <Text style={{ color: "#E5D4B8", fontSize: 16, marginTop: 2 }}>Take a closer look</Text>
      ) : null}
      <Text style={{ color: "#E5D4B8", marginTop: 10, lineHeight: 20 }}>{note || read.fieldCallNote}</Text>
      {lines.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          {lines.map((line) => (
            <Text key={`${line.area}-${line.text}`} style={{ color: "#F5F5DC", marginBottom: 6, lineHeight: 20 }}>
              {line.area}: {line.text}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={{ color: "#8B7355", marginTop: 12, fontSize: 13 }}>
        Age class {ageClass}
        {confidence > 0 ? ` · ${confidence}% read` : ""}
        {scoreLabel ? ` · ${scoreLabel}` : ""}
      </Text>
    </View>
  );
};
