"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAurora } from "@/components/AuroraContext";
import {
  persistAuroraVisionObservation,
  queueAuroraVisionKeepalive
} from "@/lib/auroraClient";
import type {
  AuroraVisionObservationInput,
  AuroraVisionObservationPerson,
  CognitiveWorldGroundingState
} from "@/lib/types";

type CameraKernelStatus = "idle" | "requesting" | "active" | "blocked" | "error" | "stopped" | "unsupported";

type FaceDetectionLike = {
  detect: (
    source: CanvasImageSource
  ) => Promise<Array<{ boundingBox?: { x: number; y: number; width: number; height: number } }>>;
};

type FrameFeatures = {
  width: number;
  height: number;
  luminance: number;
  variance: number;
  motion: number;
  brightRatio: number;
  lowSaturationBrightRatio: number;
  blueGlowRatio: number;
  redAlertRatio: number;
  saturation: number;
  hash: string;
};

type BufferedFrame = {
  at: string;
  pixels: Uint8ClampedArray;
};

type DetectedFace = {
  x: number;
  y: number;
  width: number;
  height: number;
  areaRatio: number;
  centerY: number;
};

type HumanPresenceHeuristic = {
  confidence: number;
  proximity: number;
  centerY: number;
  skinRatio: number;
  organicRatio: number;
};

type RegionSampleMetrics = {
  samples: number;
  averageRed: number;
  averageGreen: number;
  averageBlue: number;
  luminance: number;
  saturation: number;
  variance: number;
  darkRatio: number;
  brightRatio: number;
};

type VisionHostLock = {
  ownerId: string;
  updatedAt: number;
};

const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 120;
const RAW_BUFFER_RETENTION_SECONDS = 90;
const EMBEDDING_RETENTION_SECONDS = 900;
const MAX_BUFFERED_FRAMES = 240;
const BASELINE_SAMPLE_MS = 850;
const FOCUSED_SAMPLE_MS = 520;
const ACTIVE_SAMPLE_MS = 340;
const BASELINE_UPLOAD_MS = 3600;
const ACTIVE_UPLOAD_MS = 1400;
const FACE_DETECTION_INTERVAL_MS = 1200;
const HOST_HEARTBEAT_POLL_MS = 15_000;
const HOST_HEARTBEAT_MAX_SILENCE_MS = 45_000;
const CAMERA_FRAME_STALE_MS = 12_000;
const CAMERA_RECOVERY_RETRY_MS = 2_500;
const VISION_HOST_LOCK_KEY = "aurora_vision_host_lock_v1";
const VISION_HOST_LOCK_HEARTBEAT_MS = 2_000;
const VISION_HOST_LOCK_STALE_MS = 8_000;
const REMOTE_ANALYSIS_ENABLED =
  typeof process.env.NEXT_PUBLIC_AURORA_VISION_REMOTE_ANALYSIS_ENABLED === "string" &&
  /^(1|true|yes|on)$/i.test(process.env.NEXT_PUBLIC_AURORA_VISION_REMOTE_ANALYSIS_ENABLED);
const REMOTE_ANALYSIS_CAPTURE_WIDTH = 512;
const REMOTE_ANALYSIS_BASELINE_INTERVAL_MS = 30_000;
const REMOTE_ANALYSIS_ACTIVE_INTERVAL_MS = 12_000;
const REMOTE_ANALYSIS_HIGH_JPEG_QUALITY = 0.78;
const REMOTE_ANALYSIS_LOW_JPEG_QUALITY = 0.68;
const REMOTE_ANALYSIS_DEFAULT_DETAIL: "low" | "high" | "original" | "auto" =
  process.env.NEXT_PUBLIC_AURORA_VISION_REMOTE_ANALYSIS_DETAIL === "high" ||
  process.env.NEXT_PUBLIC_AURORA_VISION_REMOTE_ANALYSIS_DETAIL === "original" ||
  process.env.NEXT_PUBLIC_AURORA_VISION_REMOTE_ANALYSIS_DETAIL === "auto"
    ? process.env.NEXT_PUBLIC_AURORA_VISION_REMOTE_ANALYSIS_DETAIL
    : "low";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sanitizeLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\s+/g, "_").slice(0, 48) : fallback;
}

function hashBins(values: number[]): string {
  return values
    .map((value) => Math.round(clamp(value, 0, 1) * 15).toString(16))
    .join("");
}

function attentionModeFromScene(scene: AuroraVisionObservationInput["scene"]): NonNullable<AuroraVisionObservationInput["scene"]>["attentionMode"] {
  const safety = Number(scene?.safetyUrgency ?? 0);
  const uncertainty = Number(scene?.uncertainty ?? 0);
  const taskFocus = Number(scene?.taskFocus ?? 0);
  const novelty = Number(scene?.novelty ?? 0);
  if (safety >= 0.68) {
    return "heightened_safety_awareness";
  }
  if (uncertainty >= 0.64) {
    return "uncertainty_reinspection";
  }
  if (taskFocus >= 0.66) {
    return "focused_task_perception";
  }
  if (novelty >= 0.56) {
    return "active_inspection";
  }
  return "baseline_monitoring";
}

function sampleDelayForAttention(attentionMode: NonNullable<AuroraVisionObservationInput["scene"]>["attentionMode"]): number {
  if (attentionMode === "focused_task_perception") {
    return FOCUSED_SAMPLE_MS;
  }
  if (attentionMode === "baseline_monitoring") {
    return BASELINE_SAMPLE_MS;
  }
  return ACTIVE_SAMPLE_MS;
}

function uploadDelayForAttention(attentionMode: NonNullable<AuroraVisionObservationInput["scene"]>["attentionMode"]): number {
  return attentionMode === "baseline_monitoring" ? BASELINE_UPLOAD_MS : ACTIVE_UPLOAD_MS;
}

function remoteAnalysisIntervalForAttention(
  attentionMode: NonNullable<AuroraVisionObservationInput["scene"]>["attentionMode"]
): number {
  return attentionMode === "baseline_monitoring"
    ? REMOTE_ANALYSIS_BASELINE_INTERVAL_MS
    : REMOTE_ANALYSIS_ACTIVE_INTERVAL_MS;
}

function remoteAnalysisDetailForScene(
  scene: NonNullable<AuroraVisionObservationInput["scene"]>
): "low" | "high" | "original" | "auto" {
  if (REMOTE_ANALYSIS_DEFAULT_DETAIL !== "low") {
    return REMOTE_ANALYSIS_DEFAULT_DETAIL;
  }
  if (
    scene.attentionMode === "uncertainty_reinspection" ||
    scene.attentionMode === "heightened_safety_awareness" ||
    scene.faceVisibility === "partial_face" ||
    scene.faceVisibility === "face_unclear" ||
    scene.faceVisibility === "shadowed_face"
  ) {
    return "high";
  }
  return "low";
}

function preferredCameraDeviceId(devices: MediaDeviceInfo[]): string | null {
  const ranked = [...devices]
    .filter((device) => device.kind === "videoinput")
    .sort((left, right) => {
      const leftLabel = left.label.toLowerCase();
      const rightLabel = right.label.toLowerCase();
      const score = (label: string) =>
        /\blogitech\b|\bc920\b|\bc922\b|\bbrio\b/.test(label)
          ? 4
          : /\bexternal\b|\busb\b/.test(label)
            ? 3
            : /\bbuiltin\b|\bfacetime\b/.test(label)
              ? 1
              : 2;
      return score(rightLabel) - score(leftLabel);
    });
  return ranked[0]?.deviceId ?? null;
}

function createFaceDetector(): FaceDetectionLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  const detectorCtor = (
    window as Window & {
      FaceDetector?: new (options?: Record<string, unknown>) => FaceDetectionLike;
    }
  ).FaceDetector;
  if (!detectorCtor) {
    return null;
  }
  try {
    return new detectorCtor({ fastMode: true, maxDetectedFaces: 3 });
  } catch {
    return null;
  }
}

function frameFeaturesFromPixels(
  pixels: Uint8ClampedArray,
  previousPixels: Uint8ClampedArray | null,
  width: number,
  height: number
): FrameFeatures {
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let motionSum = 0;
  let brightCount = 0;
  let lowSaturationBrightCount = 0;
  let blueGlowCount = 0;
  let redAlertCount = 0;
  let saturationSum = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

    luminanceSum += luminance;
    luminanceSquareSum += luminance * luminance;
    saturationSum += saturation;

    if (luminance >= 0.84) {
      brightCount += 1;
      if (saturation <= 0.18) {
        lowSaturationBrightCount += 1;
      }
    }
    if (blue >= 150 && blue > red + 18 && blue > green + 10 && luminance >= 0.5) {
      blueGlowCount += 1;
    }
    if (red >= 168 && green <= 118 && blue <= 110) {
      redAlertCount += 1;
    }

    if (previousPixels && previousPixels.length === pixels.length) {
      const previousRed = previousPixels[index] ?? 0;
      const previousGreen = previousPixels[index + 1] ?? 0;
      const previousBlue = previousPixels[index + 2] ?? 0;
      const previousLuminance =
        (previousRed * 0.2126 + previousGreen * 0.7152 + previousBlue * 0.0722) / 255;
      motionSum += Math.abs(luminance - previousLuminance);
    }
  }

  const pixelCount = Math.max(1, width * height);
  const luminance = luminanceSum / pixelCount;
  const variance = clamp(luminanceSquareSum / pixelCount - luminance * luminance, 0, 1);
  return {
    width,
    height,
    luminance,
    variance,
    motion: clamp(motionSum / pixelCount * 3.4, 0, 1),
    brightRatio: brightCount / pixelCount,
    lowSaturationBrightRatio: lowSaturationBrightCount / pixelCount,
    blueGlowRatio: blueGlowCount / pixelCount,
    redAlertRatio: redAlertCount / pixelCount,
    saturation: saturationSum / pixelCount,
    hash: hashBins([
      luminance,
      variance * 10,
      Math.min(1, motionSum / pixelCount * 2),
      brightCount / pixelCount,
      blueGlowCount / pixelCount,
      redAlertCount / pixelCount
    ])
  };
}

function estimateHumanPresence(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): HumanPresenceHeuristic {
  let centerSamples = 0;
  let centerSkinSamples = 0;
  let centerOrganicSamples = 0;
  let weightedSkinY = 0;
  let weightedOrganicY = 0;

  for (let y = 0; y < height; y += 2) {
    const inVerticalBand = y >= height * 0.08 && y <= height * 0.92;
    if (!inVerticalBand) {
      continue;
    }

    for (let x = 0; x < width; x += 2) {
      const inCenterBand = x >= width * 0.2 && x <= width * 0.8;
      if (!inCenterBand) {
        continue;
      }

      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
      const cb = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
      const cr = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
      const skinLike =
        red > 45 &&
        green > 30 &&
        blue > 15 &&
        red > green &&
        red > blue &&
        Math.abs(red - green) > 14 &&
        cb >= 82 &&
        cb <= 135 &&
        cr >= 133 &&
        cr <= 177;
      const organicLike =
        luminance >= 0.08 &&
        luminance <= 0.94 &&
        saturation >= 0.12 &&
        blue <= red + 58 &&
        blue <= green + 64;

      centerSamples += 1;
      if (skinLike) {
        centerSkinSamples += 1;
        weightedSkinY += y / Math.max(1, height);
      }
      if (organicLike) {
        centerOrganicSamples += 1;
        weightedOrganicY += y / Math.max(1, height);
      }
    }
  }

  const skinRatio = centerSamples > 0 ? centerSkinSamples / centerSamples : 0;
  const organicRatio = centerSamples > 0 ? centerOrganicSamples / centerSamples : 0;
  const centerY =
    centerSkinSamples > 0
      ? weightedSkinY / centerSkinSamples
      : centerOrganicSamples > 0
        ? weightedOrganicY / centerOrganicSamples
        : 0.5;
  const confidence = clamp(skinRatio * 8.8 + organicRatio * 0.72, 0, 1);

  return {
    confidence,
    proximity: clamp(organicRatio * 1.7 + skinRatio * 3.4, 0, 1),
    centerY,
    skinRatio,
    organicRatio
  };
}

function buildCameraSourceLabel(deviceLabel: string, ingressLabel: string, fallback: string): string {
  return sanitizeLabel(`${deviceLabel || fallback}_${ingressLabel}`, fallback);
}

function classifyLighting(features: FrameFeatures, screenLikelihood: number): string {
  if (features.luminance <= 0.2) {
    return "dim";
  }
  if (screenLikelihood >= 0.52 && features.blueGlowRatio >= 0.08) {
    return "screen_lit";
  }
  if (features.luminance >= 0.72) {
    return "bright";
  }
  if (features.luminance >= 0.48) {
    return "balanced";
  }
  return "soft";
}

function classifyOwnerFraming(dominantFaceAreaRatio: number, proximity: number, ownerPresent: boolean): string {
  if (!ownerPresent) {
    return "unknown";
  }
  if (dominantFaceAreaRatio >= 0.16 || proximity >= 0.7) {
    return "close_up";
  }
  if (dominantFaceAreaRatio >= 0.05 || proximity >= 0.46) {
    return "upper_body";
  }
  return "room_view";
}

function classifyOwnerDistance(dominantFaceAreaRatio: number, proximity: number, ownerPresent: boolean): string {
  if (!ownerPresent) {
    return "unknown";
  }
  if (dominantFaceAreaRatio >= 0.18 || proximity >= 0.76) {
    return "very_close";
  }
  if (dominantFaceAreaRatio >= 0.09 || proximity >= 0.58) {
    return "close";
  }
  if (dominantFaceAreaRatio >= 0.04 || proximity >= 0.4) {
    return "mid_distance";
  }
  return "far";
}

function rgbToHsl(red: number, green: number, blue: number): { hue: number; saturation: number; lightness: number } {
  const r = clamp(red / 255, 0, 1);
  const g = clamp(green / 255, 0, 1);
  const b = clamp(blue / 255, 0, 1);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { hue: 0, saturation: 0, lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }
  return { hue: hue * 60, saturation, lightness };
}

function classifyColor(red: number, green: number, blue: number): string {
  const { hue, saturation, lightness } = rgbToHsl(red, green, blue);
  if (lightness <= 0.16) {
    return "black";
  }
  if (saturation <= 0.12) {
    if (lightness >= 0.82) {
      return "white";
    }
    if (lightness >= 0.58) {
      return "light_gray";
    }
    return "gray";
  }
  if (hue < 15 || hue >= 345) {
    return lightness < 0.34 ? "dark_red" : "red";
  }
  if (hue < 35) {
    return lightness < 0.4 ? "brown" : "orange";
  }
  if (hue < 62) {
    return "yellow";
  }
  if (hue < 165) {
    return "green";
  }
  if (hue < 255) {
    return lightness < 0.3 ? "dark_blue" : "blue";
  }
  if (hue < 315) {
    return "purple";
  }
  return "pink";
}

function sampleRegionMetrics(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  region: { left: number; top: number; right: number; bottom: number }
): RegionSampleMetrics {
  const left = Math.max(0, Math.floor(clamp(region.left, 0, 1) * width));
  const right = Math.min(width, Math.ceil(clamp(region.right, 0, 1) * width));
  const top = Math.max(0, Math.floor(clamp(region.top, 0, 1) * height));
  const bottom = Math.min(height, Math.ceil(clamp(region.bottom, 0, 1) * height));

  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let saturationSum = 0;
  let darkCount = 0;
  let brightCount = 0;
  let samples = 0;

  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

      redSum += red;
      greenSum += green;
      blueSum += blue;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      saturationSum += saturation;
      if (luminance <= 0.18) {
        darkCount += 1;
      }
      if (luminance >= 0.78) {
        brightCount += 1;
      }
      samples += 1;
    }
  }

  if (samples === 0) {
    return {
      samples: 0,
      averageRed: 0,
      averageGreen: 0,
      averageBlue: 0,
      luminance: 0,
      saturation: 0,
      variance: 0,
      darkRatio: 0,
      brightRatio: 0
    };
  }

  const luminance = luminanceSum / samples;
  return {
    samples,
    averageRed: redSum / samples,
    averageGreen: greenSum / samples,
    averageBlue: blueSum / samples,
    luminance,
    saturation: saturationSum / samples,
    variance: clamp(luminanceSquareSum / samples - luminance * luminance, 0, 1),
    darkRatio: darkCount / samples,
    brightRatio: brightCount / samples
  };
}

function readVisionHostLock(): VisionHostLock | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(VISION_HOST_LOCK_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<VisionHostLock> | null;
    if (!parsed || typeof parsed.ownerId !== "string" || typeof parsed.updatedAt !== "number") {
      return null;
    }
    return {
      ownerId: parsed.ownerId,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return null;
  }
}

function writeVisionHostLock(lock: VisionHostLock): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(VISION_HOST_LOCK_KEY, JSON.stringify(lock));
  } catch {
    // Best effort.
  }
}

function clearVisionHostLock(ownerId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = readVisionHostLock();
    if (!current || current.ownerId !== ownerId) {
      return;
    }
    window.localStorage.removeItem(VISION_HOST_LOCK_KEY);
  } catch {
    // Best effort.
  }
}

function classifyHairColor(metrics: RegionSampleMetrics): string {
  if (metrics.samples < 20 || metrics.brightRatio > 0.6) {
    return "unknown";
  }
  const { hue, saturation, lightness } = rgbToHsl(metrics.averageRed, metrics.averageGreen, metrics.averageBlue);
  if (lightness <= 0.2) {
    return "black";
  }
  if (saturation <= 0.14) {
    return lightness >= 0.56 ? "gray" : "dark_gray";
  }
  if (lightness <= 0.34) {
    return "dark_brown";
  }
  if (hue < 22) {
    return "auburn";
  }
  if (hue < 42) {
    return lightness >= 0.62 ? "blonde" : "brown";
  }
  return lightness >= 0.6 ? "light_brown" : "brown";
}

function classifyTopPattern(metrics: RegionSampleMetrics): string {
  if (metrics.samples < 24) {
    return "unknown";
  }
  if (metrics.variance <= 0.014 && metrics.saturation <= 0.34) {
    return "solid";
  }
  if (metrics.variance <= 0.026) {
    return "mostly_solid";
  }
  if (metrics.variance >= 0.06 || metrics.saturation >= 0.44) {
    return "high_contrast";
  }
  return "mixed";
}

function classifyBackgroundTone(metrics: RegionSampleMetrics): string {
  if (metrics.samples < 24) {
    return "unknown";
  }
  if (metrics.variance >= 0.05) {
    return "busy_background";
  }
  if (metrics.luminance <= 0.18) {
    return "dark_background";
  }
  if (metrics.luminance >= 0.78) {
    return "light_background";
  }
  return `${classifyColor(metrics.averageRed, metrics.averageGreen, metrics.averageBlue)}_background`;
}

function classifyFaceVisibility(
  faceDetected: boolean,
  dominantFaceAreaRatio: number,
  lightingCondition: string,
  ownerPresent: boolean
): string {
  if (!ownerPresent) {
    return "unknown";
  }
  if (!faceDetected) {
    return "body_visible_face_unclear";
  }
  if (lightingCondition === "dim") {
    return dominantFaceAreaRatio >= 0.06 ? "shadowed_face" : "partial_face";
  }
  if (dominantFaceAreaRatio >= 0.08) {
    return "clear_face";
  }
  if (dominantFaceAreaRatio >= 0.03) {
    return "partial_face";
  }
  return "face_unclear";
}

function classifyEyewear(faceMetrics: RegionSampleMetrics, eyeBandMetrics: RegionSampleMetrics): string {
  if (faceMetrics.samples < 20 || eyeBandMetrics.samples < 12) {
    return "unknown";
  }
  const darkerThanFace = eyeBandMetrics.luminance <= faceMetrics.luminance - 0.07;
  const lowSaturation = eyeBandMetrics.saturation <= 0.18;
  const strongBand = eyeBandMetrics.darkRatio >= Math.min(0.62, faceMetrics.darkRatio + 0.18);
  return darkerThanFace && lowSaturation && strongBand ? "glasses_likely" : "no_strong_eyewear_read";
}

function ownerAppearanceSummaryFromScene(scene: NonNullable<AuroraVisionObservationInput["scene"]>): string {
  if (!scene.ownerPresent) {
    return "";
  }
  const parts = [
    scene.ownerDistance && scene.ownerDistance !== "unknown" ? scene.ownerDistance.replace(/_/g, " ") : "",
    scene.ownerFraming && scene.ownerFraming !== "unknown" ? scene.ownerFraming.replace(/_/g, " ") : "",
    scene.faceVisibility && scene.faceVisibility !== "unknown" ? scene.faceVisibility.replace(/_/g, " ") : "",
    scene.lightingCondition && scene.lightingCondition !== "unknown" ? scene.lightingCondition.replace(/_/g, " ") : "",
    scene.ownerHairColor && scene.ownerHairColor !== "unknown" ? `${scene.ownerHairColor.replace(/_/g, " ")} hair read` : "",
    scene.eyewearRead === "glasses_likely" ? "possible glasses" : "",
    scene.ownerTopColor && scene.ownerTopColor !== "unknown"
      ? `${scene.ownerTopColor.replace(/_/g, " ")} ${scene.ownerTopPattern && scene.ownerTopPattern !== "unknown" ? scene.ownerTopPattern.replace(/_/g, " ") + " " : ""}top`
      : "",
    scene.backgroundTone && scene.backgroundTone !== "unknown" ? scene.backgroundTone.replace(/_/g, " ") : ""
  ].filter(Boolean);
  return parts.join(", ");
}

function sceneSummaryFromObservation(scene: NonNullable<AuroraVisionObservationInput["scene"]>): string {
  const parts = [
    scene.ownerPresent ? `owner:${scene.ownerActivity || "present"}` : "owner:absent",
    scene.ownerPosture ? `posture:${scene.ownerPosture}` : "",
    scene.ownerAffect ? `affect:${scene.ownerAffect}` : "",
    scene.ownerAppearanceSummary ? `appearance:${scene.ownerAppearanceSummary}` : "",
    (scene.toolContext?.length ?? 0) > 0 ? `context:${scene.toolContext?.join(", ")}` : "",
    (scene.changes?.length ?? 0) > 0 ? `changes:${scene.changes?.join(", ")}` : "",
    scene.attentionMode ? `attention:${scene.attentionMode}` : "",
    typeof scene.interruptionCost === "number" ? `interrupt:${scene.interruptionCost.toFixed(2)}` : "",
    typeof scene.uncertainty === "number" ? `uncertainty:${scene.uncertainty.toFixed(2)}` : ""
  ].filter(Boolean);
  return parts.join(" | ") || "No live camera scene is currently integrated.";
}

function refreshObservationTimestamp(observation: AuroraVisionObservationInput, observedAt: string): AuroraVisionObservationInput {
  return {
    ...observation,
    observedAt,
    camera: observation.camera
      ? {
          ...observation.camera,
          buffer: observation.camera.buffer
            ? {
                ...observation.camera.buffer,
                newestFrameAt: observedAt,
                oldestFrameAt: observation.camera.buffer.oldestFrameAt ?? observedAt,
                lastReinspectionAt: observation.camera.buffer.lastReinspectionAt ?? observedAt
              }
            : observation.camera.buffer
        }
      : observation.camera,
    scene: observation.scene
      ? {
          ...observation.scene,
          observedAt
        }
      : observation.scene
  };
}

function stripEphemeralAnalysis(observation: AuroraVisionObservationInput): AuroraVisionObservationInput {
  const { ephemeralAnalysis: _ephemeralAnalysis, ...rest } = observation;
  return rest;
}

export default function AuroraVisionKernel({
  ingressLabel = "dashboard_preview"
}: {
  ingressLabel?: string;
} = {}) {
  const { auroraState, refreshState } = useAurora();
  const vision = auroraState.cognition.extensions?.worldGrounding?.vision as CognitiveWorldGroundingState["vision"] | undefined;
  const [status, setStatus] = useState<CameraKernelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [lastUploadedAt, setLastUploadedAt] = useState<string | null>(null);
  const [optimisticObservation, setOptimisticObservation] = useState<AuroraVisionObservationInput | null>(null);
  const [ingestedVision, setIngestedVision] = useState<CognitiveWorldGroundingState["vision"] | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimeoutRef = useRef<number | null>(null);
  const uploadInFlightRef = useRef(false);
  const queuedObservationRef = useRef<AuroraVisionObservationInput | null>(null);
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const rawBufferRef = useRef<BufferedFrame[]>([]);
  const faceDetectorRef = useRef<FaceDetectionLike | null>(null);
  const lastFaceDetectionsRef = useRef<DetectedFace[]>([]);
  const lastFaceDetectionAtRef = useRef(0);
  const lastSceneHashRef = useRef("");
  const lastUploadAtRef = useRef(0);
  const lastRemoteAnalysisAtRef = useRef(0);
  const lastObservationRef = useRef<AuroraVisionObservationInput | null>(null);
  const stateRefreshInFlightRef = useRef(false);
  const lastStateRefreshAtRef = useRef(0);
  const pageVisibilityRef = useRef<DocumentVisibilityState>("visible");
  const preferredDeviceIdRef = useRef<string | null>(null);
  const streamSessionRef = useRef(0);
  const recoveryInFlightRef = useRef(false);
  const lastRecoveryAttemptAtRef = useRef(0);
  const lastFrameObservedAtRef = useRef(0);
  const hasEverStreamedRef = useRef(false);
  const lastInactiveSentAtRef = useRef(0);
  const recoveryTimeoutRef = useRef<number | null>(null);
  const hostInstanceIdRef = useRef("");
  const leaderHeartbeatRef = useRef<number | null>(null);
  const recoverCameraRef = useRef<(reason: string) => void>(() => undefined);
  const [isHostLeader, setIsHostLeader] = useState(false);

  const ensureHostInstanceId = useCallback(() => {
    if (hostInstanceIdRef.current) {
      return hostInstanceIdRef.current;
    }
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `vision_host_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    hostInstanceIdRef.current = generated;
    return generated;
  }, []);

  const clearRecoveryTimeout = useCallback(() => {
    if (recoveryTimeoutRef.current !== null) {
      window.clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = null;
    }
  }, []);

  const clearLeaderHeartbeat = useCallback(() => {
    if (leaderHeartbeatRef.current !== null) {
      window.clearInterval(leaderHeartbeatRef.current);
      leaderHeartbeatRef.current = null;
    }
  }, []);

  const refreshVisionLeadership = useCallback(
    (force = false): boolean => {
      const ownerId = ensureHostInstanceId();
      const current = readVisionHostLock();
      const nowMs = Date.now();
      const currentFresh = Boolean(current && nowMs - current.updatedAt <= VISION_HOST_LOCK_STALE_MS);
      if (!force && currentFresh && current?.ownerId !== ownerId) {
        setIsHostLeader(false);
        return false;
      }
      writeVisionHostLock({
        ownerId,
        updatedAt: nowMs
      });
      setIsHostLeader(true);
      return true;
    },
    [ensureHostInstanceId]
  );

  const releaseVisionLeadership = useCallback(() => {
    setIsHostLeader(false);
    clearLeaderHeartbeat();
    clearVisionHostLock(ensureHostInstanceId());
  }, [clearLeaderHeartbeat, ensureHostInstanceId]);

  const scheduleRecovery = useCallback(
    (reason: string, delayMs = CAMERA_RECOVERY_RETRY_MS) => {
      if (typeof window === "undefined") {
        return;
      }
      clearRecoveryTimeout();
      recoveryTimeoutRef.current = window.setTimeout(() => {
        recoveryTimeoutRef.current = null;
        recoverCameraRef.current(reason);
      }, delayMs);
    },
    [clearRecoveryTimeout]
  );

  const syncAuroraState = useCallback(() => {
    const nowMs = Date.now();
    if (stateRefreshInFlightRef.current || nowMs - lastStateRefreshAtRef.current < 5000) {
      return;
    }

    stateRefreshInFlightRef.current = true;
    lastStateRefreshAtRef.current = nowMs;
    void refreshState()
      .catch(() => undefined)
      .finally(() => {
        stateRefreshInFlightRef.current = false;
      });
  }, [refreshState]);

  const effectiveVision = ingestedVision ?? vision;
  const liveLocalObservation = status === "active" ? optimisticObservation : null;
  const liveLocalScene = liveLocalObservation?.scene ?? null;
  const optimisticPerception = optimisticObservation?.scene?.summary || null;
  const optimisticBuffer = optimisticObservation?.camera?.buffer;
  const optimisticRawBufferStatus = optimisticBuffer
    ? `${optimisticBuffer.frameCountEstimate} recent raw frame${
        optimisticBuffer.frameCountEstimate === 1 ? "" : "s"
      } buffered locally for ${optimisticBuffer.retentionSeconds}s rolling reinspection.`
    : null;
  const optimisticRetentionWhy = optimisticObservation
    ? "Live scene is being analyzed locally; Aurora's durable semantic state is syncing."
    : null;
  const optimisticRedactions = optimisticObservation?.scene?.redactions ?? [];

  const currentPerception = useMemo(
    () =>
      liveLocalScene?.summary ||
      effectiveVision?.disclosure.currentPerception ||
      optimisticPerception ||
      "No live camera scene is currently integrated.",
    [effectiveVision?.disclosure.currentPerception, liveLocalScene?.summary, optimisticPerception]
  );
  const rawBufferStatus =
    liveLocalObservation?.camera?.buffer
      ? optimisticRawBufferStatus
      : effectiveVision?.disclosure.rawBufferStatus || optimisticRawBufferStatus || "Raw frames are not currently buffered.";
  const retentionDecision =
    liveLocalScene
      ? optimisticRetentionWhy
      : effectiveVision?.disclosure.why || optimisticRetentionWhy || "No durable memory decision yet.";
  const displayAttentionMode =
    liveLocalScene?.attentionMode ||
    effectiveVision?.sceneState.attentionMode ||
    optimisticObservation?.scene?.attentionMode ||
    "baseline_monitoring";
  const displayStatus =
    liveLocalScene?.cameraActive && liveLocalScene.cameraConnected
      ? "local_live"
      : effectiveVision?.status || (status === "active" ? "local_live" : "absent");

  const stopLoop = useCallback(() => {
    if (loopTimeoutRef.current !== null) {
      window.clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
  }, []);

  const disposeCurrentStream = useCallback(() => {
    stopLoop();
    clearRecoveryTimeout();
    streamSessionRef.current += 1;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [clearRecoveryTimeout, stopLoop]);

  const enqueueObservation = useCallback((observation: AuroraVisionObservationInput) => {
    queuedObservationRef.current = observation;
    if (uploadInFlightRef.current) {
      return;
    }

    uploadInFlightRef.current = true;
    const flush = async () => {
      while (queuedObservationRef.current) {
        const next = queuedObservationRef.current;
        queuedObservationRef.current = null;
        try {
          const cognition = await persistAuroraVisionObservation(next);
          lastObservationRef.current = stripEphemeralAnalysis(next);
          lastUploadAtRef.current = Date.now();
          setLastUploadedAt(next.observedAt);
          const persistedVision = cognition?.extensions?.worldGrounding?.vision ?? null;
          if (persistedVision) {
            setIngestedVision(persistedVision);
          }
          syncAuroraState();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Vision ingest failed.";
          setErrorMessage(message);
          const track = streamRef.current?.getVideoTracks()[0];
          const streamHealthy = Boolean(track && track.readyState === "live");
          setStatus((current) => {
            if (streamHealthy) {
              return current === "blocked" ? current : "active";
            }
            return current === "active" ? "error" : current;
          });
          if (!streamHealthy) {
            scheduleRecovery("ingest_failure");
          }
        }
      }
      uploadInFlightRef.current = false;
    };

    void flush();
  }, [scheduleRecovery, syncAuroraState]);

  const sendInactiveObservation = useCallback(
    (keepalive = true) => {
      lastInactiveSentAtRef.current = Date.now();
      const nowAt = new Date().toISOString();
      const observation: AuroraVisionObservationInput = {
        observedAt: nowAt,
        camera: {
          connected: false,
          active: false,
          source: buildCameraSourceLabel(deviceLabel, ingressLabel, "camera_offline"),
          buffer: {
            enabled: true,
            localOnly: true,
            retentionSeconds: RAW_BUFFER_RETENTION_SECONDS,
            frameCountEstimate: 0,
            oldestFrameAt: null,
            newestFrameAt: null,
            embeddingRetentionSeconds: EMBEDDING_RETENTION_SECONDS
          }
        },
        privacy: {
          rawLocalOnly: true,
          silentCloudArchival: false,
          cameraDisclosureVisible: true,
          redactScreens: true,
          redactDocuments: true,
          redactIds: true,
          nonOwnerIdentityPersistence: "authorized_only",
          ownerApprovedSnapshotsOnly: true
        },
        scene: {
          observedAt: nowAt,
          source: buildCameraSourceLabel(deviceLabel, ingressLabel, "camera_offline"),
          cameraConnected: false,
          cameraActive: false,
          ownerPresent: false,
          ownerPosture: "unknown",
          ownerAffect: "unknown",
          ownerActivity: "unknown",
          ownerFraming: "unknown",
          ownerDistance: "unknown",
          faceVisibility: "unknown",
          ownerHairColor: "unknown",
          eyewearRead: "unknown",
          ownerTopColor: "unknown",
          ownerTopPattern: "unknown",
          lightingCondition: "unknown",
          backgroundTone: "unknown",
          ownerAppearanceSummary: "",
          taskFocus: 0.04,
          ownerFatigue: 0.08,
          interruptionCost: 0.08,
          socialExposure: 0.04,
          safetyUrgency: 0.06,
          deviceProximity: 0.04,
          uncertainty: 0.42,
          novelty: 0.08,
          attentionMode: "baseline_monitoring",
          people: [],
          objects: [],
          toolContext: [],
          changes: ["camera stream ended"],
          sensitiveRegions: [],
          redactions: [],
          summary: "Camera inactive; no live scene is currently available.",
          sceneSignature: `camera_off_${nowAt}`
        }
      };
      setOptimisticObservation(observation);
      setIngestedVision(null);

      if (keepalive) {
        queueAuroraVisionKeepalive(observation);
      } else {
        enqueueObservation(observation);
      }
    },
    [deviceLabel, enqueueObservation, ingressLabel]
  );

  const stopCamera = useCallback(
    (options: { sendInactive?: boolean; keepalive?: boolean; updateStatus?: boolean } = {}) => {
      disposeCurrentStream();
      rawBufferRef.current = [];
      previousPixelsRef.current = null;
      lastRemoteAnalysisAtRef.current = 0;
      setOptimisticObservation(null);
      setIngestedVision(null);
      if (options.sendInactive !== false) {
        sendInactiveObservation(options.keepalive ?? true);
      }
      if (options.updateStatus !== false) {
        setStatus("stopped");
      }
    },
    [disposeCurrentStream, sendInactiveObservation]
  );

  const buildRemoteAnalysisObservation = useCallback(
    (
      observation: AuroraVisionObservationInput,
      selectionReason: string
    ): AuroraVisionObservationInput => {
      if (!REMOTE_ANALYSIS_ENABLED) {
        return observation;
      }
      if ((observation.scene?.sensitiveRegions?.length ?? 0) > 0) {
        return observation;
      }
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        return observation;
      }

      const captureCanvas = document.createElement("canvas");
      const sourceWidth = Math.max(video.videoWidth || REMOTE_ANALYSIS_CAPTURE_WIDTH, REMOTE_ANALYSIS_CAPTURE_WIDTH);
      const sourceHeight = Math.max(video.videoHeight || Math.round(REMOTE_ANALYSIS_CAPTURE_WIDTH * 0.75), 1);
      const aspectRatio = sourceWidth / sourceHeight;
      captureCanvas.width = REMOTE_ANALYSIS_CAPTURE_WIDTH;
      captureCanvas.height = Math.max(288, Math.round(REMOTE_ANALYSIS_CAPTURE_WIDTH / Math.max(aspectRatio, 0.5)));

      const captureContext = captureCanvas.getContext("2d");
      if (!captureContext) {
        return observation;
      }

      captureContext.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      const detail = observation.scene ? remoteAnalysisDetailForScene(observation.scene) : "low";
      const imageDataUrl = captureCanvas.toDataURL(
        "image/jpeg",
        detail === "high" || detail === "original"
          ? REMOTE_ANALYSIS_HIGH_JPEG_QUALITY
          : REMOTE_ANALYSIS_LOW_JPEG_QUALITY
      );
      if (!imageDataUrl) {
        return observation;
      }

      return {
        ...observation,
        ephemeralAnalysis: {
          provider: "aurora_remote_analysis",
          requested: true,
          frame: {
            imageDataUrl,
            mimeType: "image/jpeg",
            width: captureCanvas.width,
            height: captureCanvas.height,
            detail,
            selectedAt: observation.observedAt,
            selectionReason
          }
        }
      };
    },
    []
  );

  const sampleFrame = useCallback(async (): Promise<{
    observation: AuroraVisionObservationInput;
    attentionMode: NonNullable<AuroraVisionObservationInput["scene"]>["attentionMode"];
    sceneHash: string;
  } | null> => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState < 2) {
      return null;
    }
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = ANALYSIS_WIDTH;
    canvas.height = ANALYSIS_HEIGHT;
    canvasRef.current = canvas;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const imageData = context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const pixels = new Uint8ClampedArray(imageData.data);
    lastFrameObservedAtRef.current = Date.now();
    const observedAt = new Date().toISOString();
    const features = frameFeaturesFromPixels(
      pixels,
      previousPixelsRef.current,
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT
    );
    previousPixelsRef.current = pixels;

    rawBufferRef.current.push({ at: observedAt, pixels });
    const retentionMs = RAW_BUFFER_RETENTION_SECONDS * 1000;
    const cutoff = Date.now() - retentionMs;
    rawBufferRef.current = rawBufferRef.current
      .filter((item) => Date.parse(item.at) >= cutoff)
      .slice(-MAX_BUFFERED_FRAMES);

    const shouldDetectFaces =
      faceDetectorRef.current &&
      Date.now() - lastFaceDetectionAtRef.current >= FACE_DETECTION_INTERVAL_MS;
    if (shouldDetectFaces) {
      lastFaceDetectionAtRef.current = Date.now();
      try {
        const detections = await faceDetectorRef.current!.detect(video);
        const sourceWidth = Math.max(1, video.videoWidth || ANALYSIS_WIDTH);
        const sourceHeight = Math.max(1, video.videoHeight || ANALYSIS_HEIGHT);
        lastFaceDetectionsRef.current = detections
          .map((item) => item.boundingBox)
          .filter((box): box is { x: number; y: number; width: number; height: number } => Boolean(box))
          .map((box) => ({
            x: clamp(box.x / sourceWidth, 0, 1),
            y: clamp(box.y / sourceHeight, 0, 1),
            width: clamp(box.width / sourceWidth, 0, 1),
            height: clamp(box.height / sourceHeight, 0, 1),
            areaRatio: clamp((box.width * box.height) / (sourceWidth * sourceHeight), 0, 1),
            centerY: clamp((box.y + box.height * 0.5) / sourceHeight, 0, 1)
          }));
      } catch {
        lastFaceDetectionsRef.current = [];
      }
    }

    const faces = [...lastFaceDetectionsRef.current].sort(
      (left, right) => right.width * right.height - left.width * left.height
    );
    const dominantFace = faces[0] ?? null;
    const dominantFaceAreaRatio = dominantFace
      ? dominantFace.areaRatio
      : 0;
    const faceCenterY = dominantFace
      ? dominantFace.centerY
      : 0.5;
    const screenLikelihood = clamp(features.blueGlowRatio * 2.8 + features.brightRatio * 1.3 - features.motion * 0.18, 0, 1);
    const documentLikelihood = clamp(features.lowSaturationBrightRatio * 3.2 - features.blueGlowRatio * 1.4, 0, 1);
    const idLikelihood = clamp(documentLikelihood * 0.58 + features.brightRatio * 0.12, 0, 1);
    const humanPresence = estimateHumanPresence(pixels, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const faceDerivedOwnerPresent = faces.length > 0;
    const heuristicOwnerPresent =
      !faceDerivedOwnerPresent &&
      humanPresence.confidence >= 0.52 &&
      (screenLikelihood <= 0.9 || humanPresence.skinRatio >= 0.012);
    const ownerPresent = faceDerivedOwnerPresent || heuristicOwnerPresent;
    const ownerPresenceConfidence = faceDerivedOwnerPresent
      ? clamp(0.46 + dominantFaceAreaRatio * 2.3, 0.52, 0.98)
      : heuristicOwnerPresent
        ? clamp(humanPresence.confidence, 0.52, 0.82)
        : 0;

    const ownerPosture = !ownerPresent
      ? "unknown"
      : faceDerivedOwnerPresent
        ? faceCenterY >= 0.62
          ? "slumped"
          : dominantFaceAreaRatio >= 0.16
            ? "leaning_close"
            : "upright"
        : humanPresence.centerY >= 0.63
          ? "slumped"
          : humanPresence.proximity >= 0.56
            ? "leaning_close"
            : "upright";
    const taskFocus = ownerPresent
      ? clamp(
          screenLikelihood * 0.58 +
            (1 - features.motion) * 0.2 +
            (faceDerivedOwnerPresent ? dominantFaceAreaRatio * 0.34 : humanPresence.confidence * 0.26),
          0,
          1
        )
      : clamp(screenLikelihood * 0.18, 0, 0.24);
    const ownerFatigue = ownerPresent
      ? clamp(
          (ownerPosture === "slumped" ? 0.54 : 0.16) +
            (features.luminance <= 0.24 ? 0.08 : 0) +
            (features.motion <= 0.05 ? 0.08 : 0),
          0,
          1
        )
      : 0.12;
    const ownerAffect = !ownerPresent
      ? "unknown"
      : ownerFatigue >= 0.58
        ? "fatigued"
        : taskFocus >= 0.62
          ? "focused"
          : features.motion >= 0.22
            ? "engaged"
            : "neutral";
    const ownerActivity = !ownerPresent
      ? "unknown"
      : taskFocus >= 0.62
        ? "desk_focus"
        : features.motion >= 0.24
          ? "moving"
          : "present";
    const ownerFraming = classifyOwnerFraming(dominantFaceAreaRatio, humanPresence.proximity, ownerPresent);
    const ownerDistance = classifyOwnerDistance(dominantFaceAreaRatio, humanPresence.proximity, ownerPresent);
    const lightingCondition = classifyLighting(features, screenLikelihood);
    const faceVisibility = classifyFaceVisibility(faceDerivedOwnerPresent, dominantFaceAreaRatio, lightingCondition, ownerPresent);
    const torsoRegion = dominantFace
      ? {
          left: dominantFace.x - dominantFace.width * 0.12,
          right: dominantFace.x + dominantFace.width * 1.12,
          top: dominantFace.y + dominantFace.height * 1.02,
          bottom: dominantFace.y + dominantFace.height * 2.75
        }
      : {
          left: 0.28,
          right: 0.72,
          top: 0.42,
          bottom: 0.92
        };
    const faceRegion = dominantFace
      ? {
          left: dominantFace.x,
          right: dominantFace.x + dominantFace.width,
          top: dominantFace.y,
          bottom: dominantFace.y + dominantFace.height
        }
      : null;
    const eyeBandRegion = dominantFace
      ? {
          left: dominantFace.x + dominantFace.width * 0.08,
          right: dominantFace.x + dominantFace.width * 0.92,
          top: dominantFace.y + dominantFace.height * 0.22,
          bottom: dominantFace.y + dominantFace.height * 0.48
        }
      : null;
    const hairRegion = dominantFace
      ? {
          left: dominantFace.x + dominantFace.width * 0.08,
          right: dominantFace.x + dominantFace.width * 0.92,
          top: dominantFace.y - dominantFace.height * 0.42,
          bottom: dominantFace.y + dominantFace.height * 0.08
        }
      : null;
    const backgroundRegion = {
      left: 0.02,
      right: 0.22,
      top: 0.04,
      bottom: 0.32
    };
    const torsoMetrics = sampleRegionMetrics(pixels, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, torsoRegion);
    const faceMetrics =
      faceRegion ? sampleRegionMetrics(pixels, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, faceRegion) : null;
    const eyeBandMetrics =
      eyeBandRegion ? sampleRegionMetrics(pixels, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, eyeBandRegion) : null;
    const hairMetrics =
      hairRegion ? sampleRegionMetrics(pixels, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, hairRegion) : null;
    const backgroundMetrics = sampleRegionMetrics(pixels, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, backgroundRegion);
    const ownerHairColor = ownerPresent && hairMetrics ? classifyHairColor(hairMetrics) : "unknown";
    const eyewearRead =
      ownerPresent && faceMetrics && eyeBandMetrics ? classifyEyewear(faceMetrics, eyeBandMetrics) : "unknown";
    const ownerTopColor =
      ownerPresent && screenLikelihood < 0.84 && torsoMetrics.samples >= 24
        ? classifyColor(torsoMetrics.averageRed, torsoMetrics.averageGreen, torsoMetrics.averageBlue)
        : "unknown";
    const ownerTopPattern = ownerPresent ? classifyTopPattern(torsoMetrics) : "unknown";
    const backgroundTone = classifyBackgroundTone(backgroundMetrics);
    const interruptionCost = clamp(taskFocus * 0.74 + (faces.length > 1 ? 0.16 : 0.04), 0, 1);
    const socialExposure = clamp((ownerPresent ? 0.18 : 0.08) + Math.max(0, faces.length - 1) * 0.24, 0, 1);
    const safetyUrgency = clamp(features.redAlertRatio * 3.4 + features.motion * 0.16, 0, 1);
    const deviceProximity = faceDerivedOwnerPresent
      ? clamp(Math.sqrt(dominantFaceAreaRatio) * 1.9, 0, 1)
      : ownerPresent
        ? clamp(humanPresence.proximity * 0.9 + humanPresence.skinRatio * 1.6, 0, 0.86)
        : clamp(screenLikelihood * 0.18, 0, 0.28);
    const uncertainty = clamp(
      (ownerPresent ? 0.14 : 0.36) +
        (features.luminance <= 0.18 ? 0.16 : 0) +
        (faceDetectorRef.current ? 0 : 0.14) +
        (features.motion >= 0.28 ? 0.08 : 0) -
        (heuristicOwnerPresent ? humanPresence.confidence * 0.12 : 0),
      0,
      1
    );
    const novelty =
      lastSceneHashRef.current && lastSceneHashRef.current !== features.hash
        ? clamp(features.motion * 0.52 + 0.28 + Math.abs(features.luminance - (lastObservationRef.current?.scene?.taskFocus ?? 0)) * 0.12, 0, 1)
        : clamp(features.motion * 0.46 + Math.abs(features.variance - 0.08) * 0.08, 0, 1);

    const sensitiveRegions = [
      screenLikelihood >= 0.4 ? "screen" : "",
      documentLikelihood >= 0.46 ? "document" : "",
      idLikelihood >= 0.58 ? "id_card" : ""
    ].filter(Boolean);
    const redactions = [
      screenLikelihood >= 0.4 ? "screen_abstracted" : "",
      documentLikelihood >= 0.46 ? "document_text_redacted" : "",
      idLikelihood >= 0.58 ? "id_text_redacted" : ""
    ].filter(Boolean);
    const objects = [
      screenLikelihood >= 0.42
        ? {
            label: "active_screen",
            state: "visible_glow",
            category: "device",
            changed: lastSceneHashRef.current !== features.hash,
            confidence: clamp(0.46 + screenLikelihood * 0.42, 0, 1),
            persisted: false
          }
        : null,
      documentLikelihood >= 0.46
        ? {
            label: "document_surface",
            state: "visible",
            category: "document",
            changed: lastSceneHashRef.current !== features.hash,
            confidence: clamp(0.42 + documentLikelihood * 0.4, 0, 1),
            persisted: false
          }
        : null
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const toolContext = [
      screenLikelihood >= 0.42 ? "active_screen" : "",
      taskFocus >= 0.62 ? "desk_task" : ""
    ].filter(Boolean);
    const changes = [
      lastSceneHashRef.current && lastSceneHashRef.current !== features.hash ? "scene geometry shifted" : "",
      screenLikelihood >= 0.48 ? "screen glow present in scene" : "",
      ownerPresent && ownerPosture === "slumped" ? "owner posture reduced" : ""
    ].filter(Boolean);
    const people: AuroraVisionObservationPerson[] =
      faces.length > 0
        ? faces.slice(0, 3).map(
            (face, index): AuroraVisionObservationPerson => ({
              id: index === 0 ? "owner" : `person_${index + 1}`,
              role: index === 0 ? "owner" : "bystander",
              label: index === 0 ? "owner" : "person",
              continuityId: index === 0 ? "owner" : `person_${index + 1}`,
              identityPersistence: index === 0 ? "durable" : "redacted",
              present: true,
              posture: index === 0 ? ownerPosture : "unknown",
              activity: index === 0 ? ownerActivity : "present",
              affect: index === 0 ? ownerAffect : "unknown",
              confidence: clamp(face.areaRatio * 4, 0.35, 0.98)
            })
          )
        : heuristicOwnerPresent
          ? [
              {
                id: "owner",
                role: "owner",
                label: "owner",
                continuityId: "owner",
                identityPersistence: "durable",
                present: true,
                posture: ownerPosture,
                activity: ownerActivity,
                affect: ownerAffect,
                confidence: Number(ownerPresenceConfidence.toFixed(4))
              }
            ]
          : [];

    const scene: NonNullable<AuroraVisionObservationInput["scene"]> = {
      observedAt,
      source: buildCameraSourceLabel(deviceLabel, ingressLabel, "camera"),
      cameraConnected: true,
      cameraActive: true,
      ownerPresent,
      ownerPosture,
      ownerAffect,
      ownerActivity,
      ownerFraming,
      ownerDistance,
      faceVisibility,
      ownerHairColor,
      eyewearRead,
      ownerTopColor,
      ownerTopPattern,
      lightingCondition,
      backgroundTone,
      ownerAppearanceSummary: "",
      taskFocus,
      ownerFatigue,
      interruptionCost,
      socialExposure,
      safetyUrgency,
      deviceProximity,
      uncertainty,
      novelty,
      people,
      objects,
      toolContext,
      changes,
      sensitiveRegions,
      redactions,
      summary: "",
      sceneSignature: "",
      screenActive: undefined
    };
    scene.attentionMode = attentionModeFromScene(scene);
    scene.ownerAppearanceSummary = ownerAppearanceSummaryFromScene(scene);
    scene.summary = sceneSummaryFromObservation(scene);
    scene.sceneSignature = [
      features.hash,
      ownerPresent ? "present" : "absent",
      ownerPosture,
      ownerActivity,
      scene.attentionMode
    ].join(":");

    const observation: AuroraVisionObservationInput = {
      observedAt,
      camera: {
        connected: true,
        active: true,
        source: buildCameraSourceLabel(deviceLabel, ingressLabel, "camera"),
        buffer: {
          enabled: true,
          localOnly: true,
          retentionSeconds: RAW_BUFFER_RETENTION_SECONDS,
          frameCountEstimate: rawBufferRef.current.length,
          oldestFrameAt: rawBufferRef.current[0]?.at ?? null,
          newestFrameAt: rawBufferRef.current.at(-1)?.at ?? observedAt,
          lastReinspectionAt:
            scene.attentionMode === "uncertainty_reinspection" || scene.attentionMode === "active_inspection"
              ? observedAt
              : null,
          activeReinspectionReason:
            scene.attentionMode === "uncertainty_reinspection"
              ? "uncertainty-driven reinspection"
              : scene.attentionMode === "active_inspection"
                ? "novelty-triggered scene change"
                : scene.attentionMode === "heightened_safety_awareness"
                  ? "safety-focused rescan"
                  : "",
          embeddingRetentionSeconds: EMBEDDING_RETENTION_SECONDS
        }
      },
      privacy: {
        rawLocalOnly: true,
        silentCloudArchival: false,
        cameraDisclosureVisible: true,
        redactScreens: true,
        redactDocuments: true,
        redactIds: true,
        nonOwnerIdentityPersistence: "authorized_only",
        ownerApprovedSnapshotsOnly: true
      },
      scene
    };

    return {
      observation,
      attentionMode: scene.attentionMode,
      sceneHash: scene.sceneSignature
    };
  }, [deviceLabel, ingressLabel]);

  const runLoop = useCallback(async () => {
    const sample = await sampleFrame();
    if (!sample) {
      loopTimeoutRef.current = window.setTimeout(() => {
        void runLoop();
      }, BASELINE_SAMPLE_MS);
      return;
    }

    const nowMs = Date.now();
    const uploadDue = nowMs - lastUploadAtRef.current >= uploadDelayForAttention(sample.attentionMode);
    const sceneChanged = sample.sceneHash !== lastSceneHashRef.current;
    if (sceneChanged || uploadDue) {
      lastSceneHashRef.current = sample.sceneHash;
      setOptimisticObservation(sample.observation);
      const remoteAnalysisDue =
        REMOTE_ANALYSIS_ENABLED &&
        Boolean(sample.observation.scene?.ownerPresent) &&
        (sample.observation.scene?.sensitiveRegions?.length ?? 0) === 0 &&
        nowMs - lastRemoteAnalysisAtRef.current >= remoteAnalysisIntervalForAttention(sample.attentionMode) &&
        (sceneChanged || sample.attentionMode !== "baseline_monitoring" || lastRemoteAnalysisAtRef.current === 0);
	      const uploadObservation = remoteAnalysisDue
	        ? buildRemoteAnalysisObservation(
	            sample.observation,
	            sceneChanged ? "scene_changed" : (sample.attentionMode ?? "baseline_monitoring")
	          )
	        : sample.observation;
      if (uploadObservation.ephemeralAnalysis?.frame?.imageDataUrl) {
        lastRemoteAnalysisAtRef.current = nowMs;
      }
      enqueueObservation(uploadObservation);
    }

    loopTimeoutRef.current = window.setTimeout(() => {
      void runLoop();
    }, sampleDelayForAttention(sample.attentionMode));
  }, [buildRemoteAnalysisObservation, enqueueObservation, sampleFrame]);

  const startCamera = useCallback(
    async (preferredDeviceId?: string | null) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        setErrorMessage("This browser cannot provide camera access.");
        return;
      }

      if (preferredDeviceId !== undefined) {
        preferredDeviceIdRef.current = preferredDeviceId;
      }
      disposeCurrentStream();
      setStatus("requesting");
      setErrorMessage("");

      try {
        if (!refreshVisionLeadership(true)) {
          setStatus("idle");
          setErrorMessage("Another Aurora /vision page is currently owning the camera host.");
          recoveryInFlightRef.current = false;
          return;
        }
        const sessionId = streamSessionRef.current + 1;
        streamSessionRef.current = sessionId;
        const requestStream = async (deviceId: string | null | undefined) =>
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 15, max: 24 }
            }
          });

        let stream: MediaStream;
        try {
          stream = await requestStream(preferredDeviceId);
        } catch (initialError) {
          const initialMessage = initialError instanceof Error ? initialError.message : "";
          const initialName =
            initialError && typeof initialError === "object" && "name" in initialError
              ? String((initialError as { name?: unknown }).name ?? "")
              : "";
          const retryWithoutPinnedDevice =
            Boolean(preferredDeviceId) &&
            /(overconstrained|notfound|notreadable|abort|device)/i.test(
              `${initialName} ${initialMessage}`.trim()
            );
          if (!retryWithoutPinnedDevice) {
            throw initialError;
          }
          preferredDeviceIdRef.current = null;
          stream = await requestStream(null);
        }
        streamRef.current = stream;
        const [track] = stream.getVideoTracks();
        const actualLabel = track?.label?.trim() || "Camera";
        setDeviceLabel(actualLabel);
        track?.addEventListener("ended", () => {
          if (sessionId !== streamSessionRef.current) {
            return;
          }
          setErrorMessage("Camera stream ended. Reacquiring.");
          setStatus("requesting");
          recoverCameraRef.current("track_ended");
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        faceDetectorRef.current = createFaceDetector();
        lastFrameObservedAtRef.current = Date.now();
        hasEverStreamedRef.current = true;
        setStatus("active");
        recoveryInFlightRef.current = false;
        void runLoop();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start camera.";
        setErrorMessage(message);
        const permissionBlocked = /denied|notallowed|permission/i.test(message);
        setStatus(permissionBlocked ? "blocked" : "error");
        recoveryInFlightRef.current = false;
        if (/notreadable|trackstart|device in use|could not start video source|starting video input failed/i.test(message)) {
          setErrorMessage("Camera is busy or another /vision tab is holding it. Close extra Aurora vision pages, then retry.");
        }
        if (!permissionBlocked) {
          scheduleRecovery("start_error");
        }
      }
    },
    [disposeCurrentStream, refreshVisionLeadership, runLoop, scheduleRecovery]
  );

  const recoverCamera = useCallback(
    async (reason: string) => {
      const nowMs = Date.now();
      if (recoveryInFlightRef.current || nowMs - lastRecoveryAttemptAtRef.current < 2000) {
        return;
      }
      recoveryInFlightRef.current = true;
      lastRecoveryAttemptAtRef.current = nowMs;
      setErrorMessage(`Camera recovery in progress (${reason.replace(/_/g, " ")}).`);
      await startCamera(preferredDeviceIdRef.current);
      if (!streamRef.current) {
        const nowMs = Date.now();
        const shouldFlushInactive =
          hasEverStreamedRef.current && nowMs - lastInactiveSentAtRef.current >= HOST_HEARTBEAT_MAX_SILENCE_MS;
        if (shouldFlushInactive) {
          sendInactiveObservation(false);
        }
        recoveryInFlightRef.current = false;
      }
    },
    [sendInactiveObservation, startCamera]
  );

  useEffect(() => {
    recoverCameraRef.current = (reason: string) => {
      void recoverCamera(reason);
    };
  }, [recoverCamera]);

  useEffect(() => {
    ensureHostInstanceId();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      if (!refreshVisionLeadership(false)) {
        setStatus("idle");
        setErrorMessage("Another Aurora /vision page is already active. Close extra vision pages or click Start camera here to take over.");
        return;
      }
      void startCamera(null);
      return;
    }
    if (!refreshVisionLeadership(false)) {
      setStatus("idle");
      setErrorMessage("Another Aurora /vision page is already active. Close extra vision pages or click Start camera here to take over.");
      return;
    }
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const deviceId = preferredCameraDeviceId(devices);
        preferredDeviceIdRef.current = deviceId;
        return startCamera(deviceId);
      })
      .catch(() => startCamera(null));
    return () => {
      releaseVisionLeadership();
      stopCamera({ sendInactive: false, updateStatus: false });
    };
  }, [ensureHostInstanceId, refreshVisionLeadership, releaseVisionLeadership, startCamera, stopCamera]);

  useEffect(() => {
    const handlePageHide = () => {
      releaseVisionLeadership();
      const latest = lastObservationRef.current ?? optimisticObservation;
      if (!latest?.camera?.active || !latest.scene?.cameraActive) {
        return;
      }
      const refreshed = refreshObservationTimestamp(latest, new Date().toISOString());
      lastObservationRef.current = refreshed;
      queueAuroraVisionKeepalive(refreshed);
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [optimisticObservation, releaseVisionLeadership]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

      const handleVisibilityChange = () => {
      pageVisibilityRef.current = document.visibilityState;
      if (document.visibilityState !== "hidden") {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track || track.readyState !== "live") {
          setStatus("requesting");
          recoverCameraRef.current("visibility_restore");
        }
        return;
      }

      const latest = lastObservationRef.current ?? optimisticObservation;
      if (!latest || !latest.camera?.active || !latest.scene?.cameraActive) {
        return;
      }

      const refreshed = refreshObservationTimestamp(latest, new Date().toISOString());
      lastObservationRef.current = refreshed;
      setOptimisticObservation(refreshed);
      queueAuroraVisionKeepalive(refreshed);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [optimisticObservation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!isHostLeader) {
      clearLeaderHeartbeat();
      return;
    }
    refreshVisionLeadership(true);
    leaderHeartbeatRef.current = window.setInterval(() => {
      refreshVisionLeadership(true);
    }, VISION_HOST_LOCK_HEARTBEAT_MS);
    return () => {
      clearLeaderHeartbeat();
    };
  }, [clearLeaderHeartbeat, isHostLeader, refreshVisionLeadership]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const ownerId = ensureHostInstanceId();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== VISION_HOST_LOCK_KEY) {
        return;
      }
      const current = readVisionHostLock();
      if (!current || current.ownerId === ownerId) {
        return;
      }
      if (isHostLeader) {
        stopCamera({ sendInactive: false, updateStatus: false });
      }
      setIsHostLeader(false);
      setStatus((existing) => (existing === "blocked" ? existing : "idle"));
      setErrorMessage("Another Aurora /vision page took over the camera host.");
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [ensureHostInstanceId, isHostLeader, stopCamera]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tick = () => {
      const latest = lastObservationRef.current ?? optimisticObservation;
      if (!latest?.camera?.active || !latest.scene?.cameraActive) {
        return;
      }

      const nowMs = Date.now();
      const lastUploadAgeMs = nowMs - lastUploadAtRef.current;
      if (lastUploadAgeMs < HOST_HEARTBEAT_MAX_SILENCE_MS) {
        return;
      }

      const refreshed = refreshObservationTimestamp(latest, new Date(nowMs).toISOString());
      lastObservationRef.current = refreshed;
      setOptimisticObservation(refreshed);
      lastUploadAtRef.current = nowMs;
      setLastUploadedAt(refreshed.observedAt);

      if (pageVisibilityRef.current === "hidden") {
        queueAuroraVisionKeepalive(refreshed);
        return;
      }

      enqueueObservation(refreshed);
    };

    const intervalId = window.setInterval(tick, HOST_HEARTBEAT_POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [enqueueObservation, optimisticObservation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (pageVisibilityRef.current === "hidden") {
        return;
      }
      if (status !== "active") {
        return;
      }

      const stream = streamRef.current;
      const track = stream?.getVideoTracks()[0];
      const video = videoRef.current;
      const hasLiveTrack = Boolean(track && track.readyState === "live");
      const hasRenderableVideo = Boolean(video && video.srcObject && video.videoWidth > 0 && video.readyState >= 2);
      const lastFrameAgeMs = Date.now() - lastFrameObservedAtRef.current;
      const recentlySawFrames = lastFrameAgeMs < CAMERA_FRAME_STALE_MS;
      if (hasLiveTrack && hasRenderableVideo && recentlySawFrames) {
        return;
      }
      if (hasLiveTrack && recentlySawFrames) {
        return;
      }

      setStatus("requesting");
      setErrorMessage("Camera health check failed. Reacquiring.");
      scheduleRecovery("health_check", 300);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [scheduleRecovery, status]);

  const statusLabel =
    status === "active"
      ? "Live"
      : status === "requesting"
        ? "Connecting"
        : status === "blocked"
          ? "Permission blocked"
          : status === "unsupported"
            ? "Unsupported"
            : status === "stopped"
              ? "Stopped"
              : status === "error"
                ? "Error"
                : "Idle";

  return (
    <section className="vision-kernel" aria-label="Aurora camera perception">
      <header className="vision-kernel__header">
        <div>
          <p className="vision-kernel__eyebrow">Perception Kernel</p>
          <h2>Aurora Camera</h2>
        </div>
        <div className={`vision-kernel__status vision-kernel__status--${status}`}>
          <span className="vision-kernel__status-dot" aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
      </header>

      <div className="vision-kernel__preview-shell">
        <video ref={videoRef} className="vision-kernel__preview" autoPlay muted playsInline />
        <div className="vision-kernel__preview-overlay">
          <span>{deviceLabel || "Awaiting camera handshake"}</span>
          <span>{effectiveVision?.privacyKernel.cameraDisclosureVisible ? "Visible to owner" : "Disclosure unavailable"}</span>
        </div>
      </div>

      <div className="vision-kernel__meta">
        <div>
          <span className="vision-kernel__meta-label">Current perception</span>
          <p>{currentPerception}</p>
        </div>
        <div>
          <span className="vision-kernel__meta-label">Raw buffer</span>
          <p>{rawBufferStatus}</p>
        </div>
        <div>
          <span className="vision-kernel__meta-label">Retention decision</span>
          <p>{retentionDecision}</p>
        </div>
      </div>

      <div className="vision-kernel__chips">
        <span>status {displayStatus}</span>
        <span>attention {displayAttentionMode}</span>
        <span>stored {(effectiveVision?.semanticMemory.recentStoredEvents.length ?? 0).toString()}</span>
        <span>discarded {(effectiveVision?.semanticMemory.recentDiscardedEvents.length ?? 0).toString()}</span>
      </div>

      {(effectiveVision?.disclosure.redacted.length || optimisticRedactions.length) ? (
        <div className="vision-kernel__list">
          <span className="vision-kernel__meta-label">Redactions</span>
          <ul>
            {(effectiveVision?.disclosure.redacted.length ? effectiveVision.disclosure.redacted : optimisticRedactions)
              .slice(0, 4)
              .map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="vision-kernel__footer">
        <button
          type="button"
          className="vision-kernel__action"
          onClick={() => {
            if (status === "active" || status === "requesting") {
              releaseVisionLeadership();
              stopCamera({ sendInactive: true, keepalive: false });
              return;
            }
            if (!refreshVisionLeadership(true)) {
              setErrorMessage("Unable to acquire the Aurora /vision host lock.");
              return;
            }
            if (navigator.mediaDevices?.enumerateDevices) {
              void navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => startCamera(preferredCameraDeviceId(devices)))
                .catch(() => startCamera(null));
              return;
            }
            void startCamera(null);
          }}
        >
          {status === "active" || status === "requesting" ? "Stop camera" : "Start camera"}
        </button>
        <span className="vision-kernel__footnote">
          {lastUploadedAt ? `Last injected ${new Date(lastUploadedAt).toLocaleTimeString()}` : "No direct camera observation uploaded yet."}
        </span>
      </div>

      {errorMessage ? <p className="vision-kernel__error">{errorMessage}</p> : null}
    </section>
  );
}
