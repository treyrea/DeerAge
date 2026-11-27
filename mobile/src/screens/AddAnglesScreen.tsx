/**
 * Extra stills of the same rack. One photo per angle, not another burst.
 */

import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { softPulse } from "../lib/haptics";
import {
  ANGLE_HINTS,
  FIRST_ANGLE,
  MAX_SCORE_IMAGES,
  MULTI_ANGLE_ENABLED,
  beginAngleScore,
  nextExtraAngle,
  scoreSetFromFrames,
  withExtraAngle,
  type AngleShot,
} from "../lib/score-angles";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { BLIND } from "../utils/blind-verdict";
import { tapSquare } from "../theme/tap";

type NavigationProp = NativeStackNavigationProp<any>;

export const AddAnglesScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const result = useDeerScoringStore((s) => s.currentResult);
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const stopCapture = useDeerScoringStore((s) => s.stopCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);

  useEffect(() => {
    if (!MULTI_ANGLE_ENABLED) navigation.goBack();
  }, [navigation]);


  const [shots, setShots] = useState<AngleShot[]>(() => scoreSetFromFrames(result?.capturedFrames ?? []));
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const nextLabel = nextExtraAngle(shots.map((shot) => shot.angleLabel));
  const hint = nextLabel && nextLabel in ANGLE_HINTS ? ANGLE_HINTS[nextLabel as keyof typeof ANGLE_HINTS] : "";
  const extras = shots.filter((shot) => shot.angleLabel !== FIRST_ANGLE).length;

  if (!MULTI_ANGLE_ENABLED) return null;

  const keep = (uri: string) => {
    if (!nextLabel) return;
    setShots((current) => withExtraAngle(current, uri, nextLabel));
    setNote("");
    setCameraOpen(false);
    softPulse();
  };

  const openCamera = async () => {
    softPulse();
    if (!hasPermission) {
      const allowed = await requestPermission();
      if (!allowed) {
        setNote("Camera access is off. Choose a photo instead.");
        return;
      }
    }
    if (!device) {
      setNote("No camera on this phone. Choose a photo instead.");
      return;
    }
    setCameraOpen(true);
  };

  const choosePhoto = async () => {
    softPulse();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNote("Photo access is off. Take a photo instead.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 1,
    });
    const uri = picked.canceled ? "" : picked.assets[0]?.uri ?? "";
    if (!uri) return;
    keep(uri);
  };

  const takePhoto = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: "off", enableShutterSound: false });
      keep(photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`);
    } catch {
      setNote("That photo didn't come through. Try again.");
      setCameraOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const score = async () => {
    if (extras < 1 || busy) return;
    setBusy(true);
    softPulse();
    setAnalysisMode("score");
    beginAngleScore({ rescoreOf: result?.scoreJobId ?? null, shots });
    startCapture();
    shots.forEach((shot, index) => {
      addFrame({
        frameIndex: index,
        imageUri: shot.imageUri,
        angleLabel: shot.angleLabel,
        detectedAntlers: true,
        confidence: "Med",
        partialOcclusion: false,
      });
    });
    stopCapture();
    const processPromise = processFrames();
    navigation.navigate("Processing");
    try {
      await processPromise;
    } catch {
      // The processing screen shows the failure.
    }
  };

  if (cameraOpen && device) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Camera ref={cameraRef} style={{ flex: 1 }} device={device} isActive photo />
        <View style={{ position: "absolute", top: insets.top + 8, left: 8, right: 8, flexDirection: "row", alignItems: "center" }}>
          <Pressable accessibilityLabel="Close camera" onPress={() => setCameraOpen(false)} hitSlop={8} style={tapSquare}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center", marginRight: 44 }}>{nextLabel}</Text>
        </View>
        <View style={{ position: "absolute", bottom: insets.bottom + 24, left: 0, right: 0, alignItems: "center" }}>
          <Pressable
            accessibilityLabel="Take photo"
            onPress={() => { void takePhoto(); }}
            disabled={busy}
            style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" }} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BLIND.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
        <Pressable accessibilityLabel="Close" onPress={() => navigation.goBack()} hitSlop={8} style={tapSquare}>
          <Ionicons name="close" size={26} color={BLIND.muted} />
        </Pressable>
        <Text style={{ color: BLIND.ink, fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center", marginRight: 44 }}>Add more angles</Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12 }}>
        <Text style={{ color: BLIND.muted, fontSize: 15 }}>Same rack. One still per angle. {shots.length} of {MAX_SCORE_IMAGES}.</Text>
        {nextLabel ? (
          <View style={{ marginTop: 28 }}>
            <Text style={{ color: BLIND.ink, fontSize: 32, fontWeight: "700" }}>{nextLabel}</Text>
            {hint ? <Text style={{ color: BLIND.muted, fontSize: 17, lineHeight: 24, marginTop: 8 }}>{hint}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              onPress={() => { void openCamera(); }}
              style={{ marginTop: 28, minHeight: 52, borderRadius: 14, backgroundColor: "#1C1B17", borderWidth: 1.5, borderColor: "#3A3832", alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: BLIND.ink, fontSize: 17, fontWeight: "700" }}>Take photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Photo library"
              onPress={() => { void choosePhoto(); }}
              style={{ marginTop: 12, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: BLIND.ink, fontSize: 17, fontWeight: "600" }}>Photo library</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: BLIND.ink, fontSize: 22, fontWeight: "700", marginTop: 28 }}>Four angles is the limit.</Text>
        )}
        {note ? <Text style={{ color: BLIND.walk, fontSize: 15, marginTop: 16 }}>{note}</Text> : null}
        <View style={{ flexDirection: "row", marginTop: 28 }}>
          {shots.map((shot) => (
            <Image key={shot.angleLabel} source={{ uri: shot.imageUri }} style={{ width: 64, height: 64, borderRadius: 10, marginRight: 8, backgroundColor: "#1C1B17" }} />
          ))}
        </View>
      </View>
      {extras > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Score these angles"
          onPress={() => { void score(); }}
          disabled={busy}
          style={{ marginHorizontal: 24, minHeight: 56, borderRadius: 14, backgroundColor: BLIND.button, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: BLIND.buttonInk, fontSize: 17, fontWeight: "700" }}>Score these angles</Text>
        </Pressable>
      ) : null}
    </View>
  );
};
