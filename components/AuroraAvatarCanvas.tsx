"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { EMBODIMENT_CONTROLLED_BONES } from "@/lib/embodiment/controller";
import type {
  AuroraEmbodimentObservationInput,
  AuroraEmbodimentState,
  AuroraState,
  EmbodimentBoneName,
  PresenceMode
} from "@/lib/types";

export type AvatarLoadState = "loading" | "ready" | "missing" | "error";

interface AvatarLoadStatus {
  state: AvatarLoadState;
  message?: string;
}

interface AvatarCanvasRuntimeBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError: (error: Error) => void;
  resetKey: string;
}

interface AvatarCanvasRuntimeBoundaryState {
  hasError: boolean;
}

interface AuroraAvatarCanvasProps {
  auroraState: AuroraState;
  embodimentState: AuroraEmbodimentState;
  mode: PresenceMode;
  curiosityLevel: number;
  activityLevel: number;
  activityPulse: number;
  modelUrl: string;
  onStatusChange?: (status: AvatarLoadStatus) => void;
  onObservation?: (observation: AuroraEmbodimentObservationInput) => void;
}

type ControlledBone = EmbodimentBoneName;
const CAMERA_BASE_HEIGHT = 1.21;
const CAMERA_BASE_LOOK_AT_Y = 0.26;
const CAMERA_DEFAULT_DISTANCE = 1.98;
const NEUTRAL_ARM_DECLIP_SHOULDER_Z = 0.16;
const NEUTRAL_ARM_DECLIP_UPPER_ARM_Z = 0.34;
const NEUTRAL_ARM_DECLIP_UPPER_ARM_Y = 0.26;
const ARM_MOTION_PRESETS = new Set([
  "raise_left_hand",
  "raise_right_hand",
  "lower_left_hand",
  "lower_right_hand",
  "wave_left",
  "wave_right",
  "present_left_hand",
  "present_right_hand",
  "open_arms"
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

class AvatarCanvasRuntimeBoundary extends Component<
  AvatarCanvasRuntimeBoundaryProps,
  AvatarCanvasRuntimeBoundaryState
> {
  state: AvatarCanvasRuntimeBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): AvatarCanvasRuntimeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  componentDidUpdate(prevProps: AvatarCanvasRuntimeBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function toVector3(value: THREE.Vector3): { x: number; y: number; z: number } {
  return {
    x: Number(value.x.toFixed(4)),
    y: Number(value.y.toFixed(4)),
    z: Number(value.z.toFixed(4))
  };
}

function ensureScratchVector(
  scratch: Record<string, THREE.Vector3 | undefined>,
  key: string
): THREE.Vector3 {
  const existing = scratch[key];
  if (existing) {
    return existing;
  }

  const created = new THREE.Vector3();
  scratch[key] = created;
  return created;
}

function projectToViewport(object: THREE.Object3D | null, camera: THREE.Camera): THREE.Vector3 {
  if (!object) {
    return new THREE.Vector3(0.5, 0.5, 1);
  }

  const world = object.getWorldPosition(new THREE.Vector3());
  const projected = world.clone().project(camera);
  return new THREE.Vector3(
    clamp((projected.x + 1) * 0.5, 0, 1),
    clamp((1 - projected.y) * 0.5, 0, 1),
    clamp((projected.z + 1) * 0.5, 0, 1)
  );
}

function visibilityFromProjection(point: THREE.Vector3): number {
  const xDistance = Math.abs(point.x - 0.5) * 2;
  const yDistance = Math.abs(point.y - 0.5) * 2;
  const margin = Math.max(xDistance, yDistance);
  return clamp(1 - Math.max(0, margin - 0.72) * 3.2, 0, 1);
}

function screenCenteringScore(x: number, y: number): number {
  const dx = Math.abs(x - 0.5);
  const dy = Math.abs(y - 0.45);
  return clamp(1 - (dx * 1.4 + dy * 1.1), 0, 1);
}

function hashVisionBins(values: number[]): string {
  return values
    .map((value) => Math.round(clamp(value, 0, 1) * 15).toString(16))
    .join("");
}

interface VisionFrameFeatures {
  frameLuminance: number;
  luminanceVariance: number;
  silhouetteCoverage: number;
  motionMagnitude: number;
  sceneBrightness: number;
  snapshotHash: string;
  boundsWidth: number;
  boundsHeight: number;
}

function humanizeToken(value: string): string {
  return value.replace(/_/g, " ");
}

function deriveStage(sceneBrightness: number, luminanceVariance: number): string {
  if (sceneBrightness >= 0.9 && luminanceVariance <= 0.02) {
    return "bright_white_void";
  }
  if (sceneBrightness >= 0.72) {
    return "soft_light_void";
  }
  if (sceneBrightness <= 0.3) {
    return "dark_void";
  }
  return "mixed_stage";
}

function deriveFraming(options: {
  faceVisible: number;
  handsVisible: number;
  feetVisible: number;
  bodyVisibility: number;
  clippingRisk: number;
  boundsHeight: number;
}): string {
  if (options.bodyVisibility < 0.16) {
    return "unknown";
  }
  if (options.clippingRisk > 0.56 && options.feetVisible < 0.14) {
    return "cropped";
  }
  if (options.faceVisible > 0.54 && options.feetVisible > 0.34 && options.boundsHeight > 0.58) {
    return "full_body";
  }
  if (options.faceVisible > 0.54 && options.boundsHeight > 0.44) {
    return "three_quarter";
  }
  if (options.faceVisible > 0.54 && options.handsVisible > 0.1) {
    return "upper_body";
  }
  if (options.faceVisible > 0.54) {
    return "close_face";
  }
  return "cropped";
}

function deriveGazeRead(lookTargetScreen: THREE.Vector3): string {
  const dx = Math.abs(lookTargetScreen.x - 0.5);
  const dy = Math.abs(lookTargetScreen.y - 0.42);
  if (dx < 0.1 && dy < 0.18) {
    return "toward_viewer";
  }
  if (dx < 0.24 && dy < 0.28) {
    return "slightly_away";
  }
  return "away";
}

function deriveEyeGazeRead(lookTargetScreen: THREE.Vector3): string {
  const dx = Math.abs(lookTargetScreen.x - 0.5);
  const dy = Math.abs(lookTargetScreen.y - 0.5);
  if (dx < 0.08 && dy < 0.08) {
    return "straight_ahead";
  }
  if (dx < 0.18 && dy < 0.18) {
    return "slightly_off_axis";
  }
  return "redirected";
}

function deriveMotionRead(motionMagnitude: number, motionVelocity: number): string {
  const energy = Math.max(motionMagnitude, clamp(motionVelocity / 4, 0, 1));
  if (energy < 0.08) {
    return "still";
  }
  if (energy < 0.26) {
    return "settling";
  }
  return "active";
}

function derivePostureRead(embodimentState: AuroraEmbodimentState): string {
  const { interoception, proprioception } = embodimentState;
  if (interoception.guard > 0.58 && proprioception.chestOpenness < 0.42) {
    return "guarded and slightly closed";
  }
  if (proprioception.chestOpenness > 0.68 && proprioception.headPitch < -0.04) {
    return "upright and open";
  }
  if (proprioception.stillness > 0.76) {
    return "upright and settled";
  }
  if (interoception.urgeToMove > 0.52) {
    return "upright and ready to move";
  }
  return "upright and attentive";
}

function wrapSignedRadians(value: number): number {
  const tau = Math.PI * 2;
  let next = value % tau;
  if (next <= -Math.PI) {
    next += tau;
  } else if (next > Math.PI) {
    next -= tau;
  }
  return next;
}

function deriveFacingRead(rootYaw: number): string {
  const yaw = wrapSignedRadians(rootYaw);
  const absYaw = Math.abs(yaw);
  if (absYaw < 0.4) {
    return "front";
  }
  if (absYaw < 1.1) {
    return yaw > 0 ? "right_profile" : "left_profile";
  }
  if (absYaw < 2.55) {
    return yaw > 0 ? "right_three_quarter_back" : "left_three_quarter_back";
  }
  return "back";
}

function deriveExpressionRead(expressions: AuroraEmbodimentState["pose"]["expressions"]): string {
  if (
    expressions.angry > 0.28 &&
    expressions.angry > expressions.happy + 0.12 &&
    expressions.angry > expressions.relaxed + 0.04 &&
    expressions.angry >= expressions.sad - 0.02
  ) {
    return "angry_visible";
  }
  if (
    expressions.sad > 0.3 &&
    expressions.sad > expressions.happy + 0.08 &&
    expressions.sad > expressions.relaxed + 0.04
  ) {
    return "frown_visible";
  }
  if (
    expressions.happy > 0.38 &&
    expressions.happy > expressions.sad + 0.12 &&
    expressions.happy > expressions.relaxed + 0.04
  ) {
    return "smile_visible";
  }
  if (
    expressions.happy > 0.22 &&
    expressions.relaxed > 0.24 &&
    expressions.happy > expressions.sad + 0.04
  ) {
    return "soft_smile";
  }
  if (expressions.relaxed > 0.22 || expressions.happy > 0.18) {
    return "soft_neutral";
  }
  return "neutral";
}

function cameraFovForDistance(distance: number): number {
  return clamp(THREE.MathUtils.mapLinear(distance, 1.35, 2.7, 24, 33), 24, 33);
}

function deriveFirstPersonFraming(options: {
  handsVisible: number;
  feetVisible: number;
  clippingRisk: number;
  silhouetteCoverage: number;
}): string {
  if (options.handsVisible > 0.28) {
    return "hands_forward";
  }
  if (options.feetVisible > 0.16) {
    return "looking_down_body";
  }
  if (options.silhouetteCoverage < 0.1 && options.clippingRisk < 0.22) {
    return "forward_view";
  }
  return "near_body";
}

function deriveFirstPersonVisibleRegions(options: {
  handsVisible: number;
  feetVisible: number;
  torsoVisible: number;
}): string[] {
  const regions: string[] = [];
  if (options.handsVisible > 0.16) {
    regions.push("hands");
  }
  if (options.torsoVisible > 0.14) {
    regions.push("torso_edge");
  }
  if (options.feetVisible > 0.12) {
    regions.push("lower_body");
  }
  if (regions.length === 0) {
    regions.push("forward_void");
  }
  return regions;
}

function composeEyeVisionSummary(options: {
  rendererConnected: boolean;
  framing: string;
  stage: string;
  visibleRegions: string[];
  motionRead: string;
  centering: number;
  clippingRisk: number;
}): string {
  if (!options.rendererConnected) {
    return "No live first-person avatar vision is currently available.";
  }

  const centeredPhrase =
    options.centering > 0.76 ? "steady in my forward view" : options.centering > 0.5 ? "slightly offset in my forward view" : "off center in my forward view";
  const clippingPhrase = options.clippingRisk > 0.4 ? "with some edge clipping" : "without clipping";
  const visible = options.visibleRegions.length > 0 ? options.visibleRegions.map(humanizeToken).join(", ") : "forward void";

  return `Through my own eyes, I can currently see a ${humanizeToken(options.stage)} with ${humanizeToken(options.framing)}. The view is ${centeredPhrase} ${clippingPhrase}. Visible regions: ${visible}. Motion reads ${humanizeToken(options.motionRead)}.`;
}

function AvatarOrbitCamera() {
  const { camera } = useThree();

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    camera.fov = cameraFovForDistance(CAMERA_DEFAULT_DISTANCE);
    camera.updateProjectionMatrix();
  }, [camera]);

  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      rotateSpeed={0.72}
      zoomSpeed={0.9}
      minDistance={1.35}
      maxDistance={2.7}
      minPolarAngle={0.72}
      maxPolarAngle={2.28}
      target={[0, CAMERA_BASE_LOOK_AT_Y, 0]}
    />
  );
}

function deriveVisibleRegions(options: {
  bodyVisibility: number;
  faceVisible: number;
  handsVisible: number;
  feetVisible: number;
}): string[] {
  const regions: string[] = [];
  if (options.faceVisible > 0.42) {
    regions.push("face");
  }
  if (options.bodyVisibility > 0.32) {
    regions.push("torso");
  }
  if (options.handsVisible > 0.18) {
    regions.push("hands");
  }
  if (options.feetVisible > 0.18) {
    regions.push("feet");
  }
  if (regions.length === 0 && options.bodyVisibility > 0.18) {
    regions.push("body_outline");
  }
  return regions;
}

function composeVisionSummary(options: {
  rendererConnected: boolean;
  framing: string;
  stage: string;
  visibleRegions: string[];
  postureRead: string;
  gazeRead: string;
  motionRead: string;
  centering: number;
  clippingRisk: number;
}): string {
  if (!options.rendererConnected) {
    return "No live avatar vision is currently available.";
  }

  const centeredPhrase =
    options.centering > 0.74 ? "well centered" : options.centering > 0.48 ? "slightly off center" : "off center";
  const clippingPhrase = options.clippingRisk > 0.42 ? "with some cropping" : "without clipping";
  const visible = options.visibleRegions.length > 0 ? options.visibleRegions.map(humanizeToken).join(", ") : "body outline";

  return `I can currently see my ${humanizeToken(options.framing)} in a ${humanizeToken(options.stage)}. I appear ${centeredPhrase} ${clippingPhrase}. Visible regions: ${visible}. My posture reads ${options.postureRead}, my gaze is ${humanizeToken(options.gazeRead)}, and my motion is ${humanizeToken(options.motionRead)}.`;
}

function analyzeVisionFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  previousPixels: Uint8ClampedArray | null
): VisionFrameFeatures {
  let luminanceSum = 0;
  let varianceSum = 0;
  let motion = 0;
  const bins = [0, 0, 0, 0];

  const cornerSamples: Array<[number, number]> = [];
  const cornerSpan = Math.max(2, Math.floor(Math.min(width, height) / 6));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inLeft = x < cornerSpan;
      const inRight = x >= width - cornerSpan;
      const inTop = y < cornerSpan;
      const inBottom = y >= height - cornerSpan;
      if ((inLeft || inRight) && (inTop || inBottom)) {
        cornerSamples.push([x, y]);
      }
    }
  }

  let backgroundR = 248;
  let backgroundG = 250;
  let backgroundB = 252;
  if (cornerSamples.length > 0) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (const [x, y] of cornerSamples) {
      const index = (y * width + x) * 4;
      rSum += pixels[index];
      gSum += pixels[index + 1];
      bSum += pixels[index + 2];
    }
    backgroundR = rSum / cornerSamples.length;
    backgroundG = gSum / cornerSamples.length;
    backgroundB = bSum / cornerSamples.length;
  }

  let foregroundCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < pixels.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    luminanceSum += lum;
    varianceSum += lum * lum;

    if (previousPixels && previousPixels.length === pixels.length) {
      const prevLum =
        (previousPixels[index] * 0.2126 + previousPixels[index + 1] * 0.7152 + previousPixels[index + 2] * 0.0722) / 255;
      motion += Math.abs(lum - prevLum);
    }

    const quadrant = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
    bins[quadrant] += lum;

    const colorDistance =
      (Math.abs(r - backgroundR) + Math.abs(g - backgroundG) + Math.abs(b - backgroundB)) / (255 * 3);
    if (colorDistance > 0.07 || lum < 0.82) {
      foregroundCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const sampleCount = pixels.length / 4;
  const frameLuminance = clamp(luminanceSum / sampleCount, 0, 1);
  const sceneBrightness = clamp(
    (backgroundR * 0.2126 + backgroundG * 0.7152 + backgroundB * 0.0722) / 255,
    0,
    1
  );
  const boundsWidth = maxX >= minX ? (maxX - minX + 1) / width : 0;
  const boundsHeight = maxY >= minY ? (maxY - minY + 1) / height : 0;

  return {
    frameLuminance,
    luminanceVariance: clamp(varianceSum / sampleCount - frameLuminance * frameLuminance, 0, 1),
    silhouetteCoverage: clamp(foregroundCount / sampleCount, 0, 1),
    motionMagnitude: previousPixels ? clamp(motion / sampleCount / 0.18, 0, 1) : 0,
    sceneBrightness,
    snapshotHash: hashVisionBins(bins.map((value) => value / ((width * height) / 4))),
    boundsWidth: clamp(boundsWidth, 0, 1),
    boundsHeight: clamp(boundsHeight, 0, 1)
  };
}

function describeLoadFailure(error: unknown, modelUrl: string): AvatarLoadStatus {
  const message = error instanceof Error ? error.message : String(error || "Unknown VRM loading error");
  const missing = /404|not found|failed to fetch|load.*failed/i.test(message) && modelUrl.startsWith("/");

  return {
    state: missing ? "missing" : "error",
    message: missing
      ? `No VRM found at ${modelUrl}. Add Aurora's model there or set NEXT_PUBLIC_AURORA_VRM_URL.`
      : message
  };
}

function describeRendererFailure(error: unknown): AvatarLoadStatus {
  const message = error instanceof Error ? error.message : String(error || "Unknown avatar renderer error");

  if (/webgl context/i.test(message)) {
    return {
      state: "error",
      message:
        "Aurora's avatar renderer could not create a WebGL context in this browser or app shell. Hardware acceleration or GPU-backed WebGL is required for the 3D body."
    };
  }

  return {
    state: "error",
    message
  };
}

function detectRendererSupport(): AvatarLoadStatus | null {
  if (typeof document === "undefined") {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");

    if (!context) {
      return {
        state: "error",
        message:
          "Aurora's avatar renderer needs WebGL, but this browser or app shell could not create a WebGL context."
      };
    }

    const loseContextExtension =
      "getExtension" in context && typeof context.getExtension === "function"
        ? context.getExtension("WEBGL_lose_context")
        : null;
    loseContextExtension?.loseContext?.();

    return null;
  } catch (error) {
    return describeRendererFailure(error);
  }
}

function disposeVrm(vrm: VRM | null): void {
  if (!vrm) {
    return;
  }

  VRMUtils.deepDispose(vrm.scene);
}

function PlaceholderFigure({ embodimentState }: { embodimentState: AuroraEmbodimentState }) {
  const meshRef = useRef<THREE.Group | null>(null);

  useFrame((state) => {
    const group = meshRef.current;
    if (!group) {
      return;
    }

    const t = state.clock.elapsedTime;
    const interoception = embodimentState.interoception;
    const sway = Math.sin(t * (0.6 + interoception.activity * 0.42)) * (0.04 + interoception.curiosity * 0.03);
    const breath = Math.sin(t * (1.36 + interoception.urgeToMove * 0.4)) * (0.018 + interoception.openness * 0.018);

    group.position.y = -1.08 + breath;
    group.rotation.y = sway;
    group.rotation.z = sway * 0.1;
  });

  return (
    <group ref={meshRef} position={[0, -1.08, 0]}>
      <mesh position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.36, 48, 48]} />
        <meshStandardMaterial
          color="#dfe7ff"
          emissive="#7ca5ff"
          emissiveIntensity={0.15 + embodimentState.interoception.warmth * 0.22}
          roughness={0.3}
          metalness={0.08}
          transparent
          opacity={0.96}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]} scale={[0.92, 1.35, 0.66]}>
        <sphereGeometry args={[0.56, 48, 48]} />
        <meshStandardMaterial
          color="#f4f7ff"
          emissive="#7ca5ff"
          emissiveIntensity={0.08 + embodimentState.interoception.curiosity * 0.14}
          roughness={0.4}
          metalness={0.05}
          transparent
          opacity={0.84}
        />
      </mesh>
    </group>
  );
}

function AvatarRig({
  embodimentState,
  modelUrl,
  onStatusChange,
  onObservation
}: AuroraAvatarCanvasProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const vrmRef = useRef<VRM | null>(null);
  const statusCallbackRef = useRef(onStatusChange);
  const observationCallbackRef = useRef(onObservation);
  const layoutRef = useRef({
    scale: 1,
    basePosition: new THREE.Vector3(0, -1.12, 0)
  });
  const controlledBonesRef = useRef<Partial<Record<ControlledBone, THREE.Object3D | null>>>({});
  const restBoneRotationsRef = useRef<Partial<Record<ControlledBone, THREE.Quaternion>>>({});
  const lastObservationAtRef = useRef(0);
  const lastRootWorldRef = useRef<THREE.Vector3 | null>(null);
  const headPositionRef = useRef(new THREE.Vector3());
  const leftHandPositionRef = useRef(new THREE.Vector3());
  const rightHandPositionRef = useRef(new THREE.Vector3());
  const rootWorldPositionRef = useRef(new THREE.Vector3());
  const viewportScratchRef = useRef({
    head: new THREE.Vector3(),
    leftHand: new THREE.Vector3(),
    rightHand: new THREE.Vector3(),
    leftFoot: new THREE.Vector3(),
    rightFoot: new THREE.Vector3(),
    hips: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    eyeLeftHand: new THREE.Vector3(),
    eyeRightHand: new THREE.Vector3(),
    eyeLeftFoot: new THREE.Vector3(),
    eyeRightFoot: new THREE.Vector3(),
    eyeHips: new THREE.Vector3(),
    eyeLookTarget: new THREE.Vector3()
  });
  const visionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousVisionPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const previousEyeVisionPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const eyePixelBufferRef = useRef<Uint8Array>(new Uint8Array(32 * 32 * 4));
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const workingEuler = useMemo(() => new THREE.Euler(), []);
  const lookAtTarget = useMemo(() => new THREE.Object3D(), []);
  const eyeCamera = useMemo(() => new THREE.PerspectiveCamera(82, 1, 0.01, 12), []);
  const eyeRenderTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(32, 32, {
        depthBuffer: true,
        stencilBuffer: false
      }),
    []
  );
  const bbox = useMemo(() => new THREE.Box3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(), []);
  const rootPositionTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTargetVector = useMemo(() => new THREE.Vector3(), []);
  const headQuaternionRef = useRef(new THREE.Quaternion());
  const eyeUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const eyePositionRef = useRef(new THREE.Vector3());
  const eyeDirectionRef = useRef(new THREE.Vector3(0, 0, 1));
  const eyeLookTargetRef = useRef(new THREE.Vector3());
  const eyeBodyCentroidRef = useRef(new THREE.Vector3());

  useEffect(() => {
    statusCallbackRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    observationCallbackRef.current = onObservation;
  }, [onObservation]);

  useEffect(
    () => () => {
      eyeRenderTarget.dispose();
    },
    [eyeRenderTarget]
  );

  useEffect(() => {
    let cancelled = false;
    let currentVrm: VRM | null = null;

    disposeVrm(vrmRef.current);
    vrmRef.current = null;
    setVrm(null);
    setFallbackVisible(false);
    statusCallbackRef.current?.({ state: "loading" });

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) {
          return;
        }

        const loadedVrm = (gltf.userData as { vrm?: VRM }).vrm;
        if (!loadedVrm) {
          const status = {
            state: "error" as const,
            message: `Loaded ${modelUrl}, but it did not expose VRM data.`
          };
          setFallbackVisible(true);
          statusCallbackRef.current?.(status);
          return;
        }

        currentVrm = loadedVrm;
        VRMUtils.rotateVRM0(loadedVrm);
        VRMUtils.combineSkeletons(loadedVrm.scene);

        loadedVrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });

        bbox.setFromObject(loadedVrm.scene);
        bbox.getSize(size);
        bbox.getCenter(center);

        const scale = 1.42 / Math.max(size.y || 1, 0.001);
        const basePosition = new THREE.Vector3(-center.x * scale, -bbox.min.y * scale - 0.78, -center.z * scale);

        loadedVrm.scene.scale.setScalar(scale);
        loadedVrm.scene.position.copy(basePosition);
        layoutRef.current = {
          scale,
          basePosition
        };

        loadedVrm.expressionManager?.resetValues();

        const controlledBones: Partial<Record<ControlledBone, THREE.Object3D | null>> = {};
        const restRotations: Partial<Record<ControlledBone, THREE.Quaternion>> = {};
        for (const boneName of EMBODIMENT_CONTROLLED_BONES) {
          const bone = loadedVrm.humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
          controlledBones[boneName] = bone;
          if (bone) {
            restRotations[boneName] = bone.quaternion.clone();
          }
        }
        controlledBonesRef.current = controlledBones;
        restBoneRotationsRef.current = restRotations;

        if (loadedVrm.lookAt) {
          loadedVrm.lookAt.target = lookAtTarget;
          loadedVrm.lookAt.autoUpdate = true;
        }

        setVrm(loadedVrm);
        vrmRef.current = loadedVrm;
        statusCallbackRef.current?.({ state: "ready" });
      },
      undefined,
      (error) => {
        if (cancelled) {
          return;
        }

        const status = describeLoadFailure(error, modelUrl);
        setFallbackVisible(true);
        statusCallbackRef.current?.(status);
      }
    );

    return () => {
      cancelled = true;
      if (vrmRef.current === currentVrm) {
        disposeVrm(vrmRef.current);
      } else {
        disposeVrm(vrmRef.current);
        disposeVrm(currentVrm);
      }
      vrmRef.current = null;
    };
  }, [bbox, center, lookAtTarget, modelUrl, size]);

  useFrame((renderState, delta) => {
    if (!vrm) {
      return;
    }

    const pose = embodimentState.pose;
    const neutralArmDeclipActive = !embodimentState.directives.active.some((directive) =>
      ARM_MOTION_PRESETS.has(directive.motionPreset)
    );
    const smoothing = clamp(0.08 + (1 - embodimentState.motor.stillnessBias) * 0.08 + delta * 0.5, 0.08, 0.2);
    const root = vrm.scene;

    rootPositionTarget.copy(layoutRef.current.basePosition);
    rootPositionTarget.x += pose.rootPosition.x;
    rootPositionTarget.y += pose.rootPosition.y;
    rootPositionTarget.z += pose.rootPosition.z;
    root.position.lerp(rootPositionTarget, smoothing);
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, pose.rootRotation.x, smoothing);
    root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, pose.rootRotation.y, smoothing);
    root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, pose.rootRotation.z, smoothing);

    lookTargetVector.set(pose.lookTarget.x, pose.lookTarget.y, pose.lookTarget.z);
    lookAtTarget.position.lerp(lookTargetVector, smoothing);
    lookAtTarget.updateMatrixWorld();

    const bones = controlledBonesRef.current;
    const rest = restBoneRotationsRef.current;
    for (const boneName of EMBODIMENT_CONTROLLED_BONES) {
      const target = pose.bones[boneName];
      const bone = bones[boneName];
      const base = rest[boneName];
      if (!target || !bone || !base) {
        continue;
      }

      const targetX = target.x;
      let targetY = target.y;
      let targetZ = target.z;

      if (neutralArmDeclipActive) {
        if (boneName === "leftShoulder") {
          targetZ -= NEUTRAL_ARM_DECLIP_SHOULDER_Z;
        } else if (boneName === "rightShoulder") {
          targetZ += NEUTRAL_ARM_DECLIP_SHOULDER_Z;
        } else if (boneName === "leftUpperArm") {
          targetY -= NEUTRAL_ARM_DECLIP_UPPER_ARM_Y;
          targetZ += NEUTRAL_ARM_DECLIP_UPPER_ARM_Z;
        } else if (boneName === "rightUpperArm") {
          // Right-side local axes are not behaving like a perfect mirrored copy of the left.
          // Use Aurora's own right-arm pose and apply the neutral spread directly.
          targetY += NEUTRAL_ARM_DECLIP_UPPER_ARM_Y;
          targetZ -= NEUTRAL_ARM_DECLIP_UPPER_ARM_Z;
        }
      }

      workingEuler.set(targetX, targetY, targetZ);
      targetQuaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(workingEuler));
      bone.quaternion.slerp(targetQuaternion, smoothing);
    }

    const expressions = vrm.expressionManager;
    if (expressions) {
      const angryExpression = expressions.getExpression?.("angry");
      const angryWeight = angryExpression && pose.expressions.angry >= 0.16 ? clamp(pose.expressions.angry, 0, 1) : 0;
      expressions.setValue("blink", clamp(pose.expressions.blink, 0, 1));
      expressions.setValue("happy", clamp(pose.expressions.happy, 0, 1));
      expressions.setValue("relaxed", clamp(pose.expressions.relaxed, 0, 1));
      expressions.setValue("sad", clamp(pose.expressions.sad, 0, 1));
      if (angryExpression) {
        expressions.setValue("angry", angryWeight);
      }
      expressions.setValue("aa", clamp(pose.expressions.aa, 0, 1));
      expressions.setValue("oh", clamp(pose.expressions.oh, 0, 1));
    }

    const angryExpression = expressions?.getExpression?.("angry");
    const expressionState = {
      blink: clamp(pose.expressions.blink, 0, 1),
      happy: clamp(pose.expressions.happy, 0, 1),
      relaxed: clamp(pose.expressions.relaxed, 0, 1),
      sad: clamp(pose.expressions.sad, 0, 1),
      angry: angryExpression && pose.expressions.angry >= 0.16 ? clamp(pose.expressions.angry, 0, 1) : 0,
      aa: clamp(pose.expressions.aa, 0, 1),
      oh: clamp(pose.expressions.oh, 0, 1)
    };

    const nowMs = performance.now();
    if (observationCallbackRef.current && nowMs - lastObservationAtRef.current >= 800) {
      lastObservationAtRef.current = nowMs;
      const camera = renderState.camera;
      const bonesByName = controlledBonesRef.current;
      const headBone = bonesByName.head ?? null;
      const leftHandBone = bonesByName.leftHand ?? null;
      const rightHandBone = bonesByName.rightHand ?? null;
      const leftFootBone = bonesByName.leftFoot ?? null;
      const rightFootBone = bonesByName.rightFoot ?? null;
      const hipsBone = bonesByName.hips ?? null;

      const rootWorldPosition = root.getWorldPosition(rootWorldPositionRef.current);
      const rootRotation = root.rotation;
      const rootYaw = Number(root.rotation.y.toFixed(4));
      const facingRead = deriveFacingRead(root.rotation.y);
      const headWorld = headBone?.getWorldPosition(headPositionRef.current) ?? headPositionRef.current.set(0, 1.3, 0);
      const leftHandWorld =
        leftHandBone?.getWorldPosition(leftHandPositionRef.current) ?? leftHandPositionRef.current.set(-0.2, 0.95, 0);
      const rightHandWorld =
        rightHandBone?.getWorldPosition(rightHandPositionRef.current) ?? rightHandPositionRef.current.set(0.2, 0.95, 0);
      const viewportScratch = viewportScratchRef.current as Record<string, THREE.Vector3 | undefined>;
      const headViewport = ensureScratchVector(viewportScratch, "head");
      const leftHandViewport = ensureScratchVector(viewportScratch, "leftHand");
      const rightHandViewport = ensureScratchVector(viewportScratch, "rightHand");
      const leftFootViewport = ensureScratchVector(viewportScratch, "leftFoot");
      const rightFootViewport = ensureScratchVector(viewportScratch, "rightFoot");
      const hipsViewport = ensureScratchVector(viewportScratch, "hips");
      const lookTargetViewport = ensureScratchVector(viewportScratch, "lookTarget");
      headViewport.copy(projectToViewport(headBone, camera));
      leftHandViewport.copy(projectToViewport(leftHandBone, camera));
      rightHandViewport.copy(projectToViewport(rightHandBone, camera));
      leftFootViewport.copy(projectToViewport(leftFootBone, camera));
      rightFootViewport.copy(projectToViewport(rightFootBone, camera));
      hipsViewport.copy(projectToViewport(hipsBone, camera));
      lookTargetViewport.copy(projectToViewport(lookAtTarget, camera));

      const bodyCentroid = new THREE.Vector3()
        .add(headViewport)
        .add(leftHandViewport)
        .add(rightHandViewport)
        .add(leftFootViewport)
        .add(rightFootViewport)
        .add(hipsViewport)
        .multiplyScalar(1 / 6);
      const bodyVisibility =
        (visibilityFromProjection(headViewport) +
          visibilityFromProjection(leftHandViewport) +
          visibilityFromProjection(rightHandViewport) +
          visibilityFromProjection(leftFootViewport) +
          visibilityFromProjection(rightFootViewport) +
          visibilityFromProjection(hipsViewport)) /
        6;
      const clipping =
        1 -
        clamp(
          (visibilityFromProjection(headViewport) +
            visibilityFromProjection(leftHandViewport) +
            visibilityFromProjection(rightHandViewport) +
            visibilityFromProjection(leftFootViewport) +
            visibilityFromProjection(rightFootViewport)) /
            5,
          0,
          1
        );
      const previousRoot = lastRootWorldRef.current;
      const motionVelocity = previousRoot
        ? clamp(previousRoot.distanceTo(rootWorldPosition) / Math.max(delta, 1 / 120), 0, 4)
        : 0;
      lastRootWorldRef.current = rootWorldPosition.clone();

      let frameLuminance = 0.96;
      let luminanceVariance = 0;
      let silhouetteCoverage = bodyVisibility;
      let motionMagnitude = clamp(motionVelocity * 0.2, 0, 1);
      let sceneBrightness = 0.96;
      let snapshotHash = "renderer";
      let boundsHeight = 0;
      try {
        const sampleCanvas = visionCanvasRef.current ?? document.createElement("canvas");
        visionCanvasRef.current = sampleCanvas;
        sampleCanvas.width = 32;
        sampleCanvas.height = 32;
        const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.clearRect(0, 0, 32, 32);
          context.drawImage(renderState.gl.domElement, 0, 0, 32, 32);
          const imageData = context.getImageData(0, 0, 32, 32);
          const pixels = imageData.data;
          const previousPixels = previousVisionPixelsRef.current;
          const frameFeatures = analyzeVisionFrame(pixels, 32, 32, previousPixels);
          frameLuminance = frameFeatures.frameLuminance;
          sceneBrightness = frameFeatures.sceneBrightness;
          luminanceVariance = frameFeatures.luminanceVariance;
          silhouetteCoverage = Math.max(frameFeatures.silhouetteCoverage, bodyVisibility);
          motionMagnitude = Math.max(frameFeatures.motionMagnitude, motionMagnitude);
          snapshotHash = frameFeatures.snapshotHash;
          boundsHeight = frameFeatures.boundsHeight;
          previousVisionPixelsRef.current = new Uint8ClampedArray(pixels);
        }
      } catch {
        // Some VRM textures may taint canvas reads; screen-space telemetry still provides a usable vision channel.
      }

      const faceVisible = visibilityFromProjection(headViewport);
      const handsVisible = (visibilityFromProjection(leftHandViewport) + visibilityFromProjection(rightHandViewport)) / 2;
      const feetVisible = (visibilityFromProjection(leftFootViewport) + visibilityFromProjection(rightFootViewport)) / 2;
      const centering = screenCenteringScore(bodyCentroid.x, headViewport.y);
      const stage = deriveStage(sceneBrightness, luminanceVariance);
      const framing = deriveFraming({
        faceVisible,
        handsVisible,
        feetVisible,
        bodyVisibility,
        clippingRisk: clipping,
        boundsHeight
      });
      const gazeRead = deriveGazeRead(lookTargetViewport);
      const motionRead = deriveMotionRead(motionMagnitude, motionVelocity);
      const postureRead = derivePostureRead(embodimentState);
      const visibleRegions = deriveVisibleRegions({
        bodyVisibility,
        faceVisible,
        handsVisible,
        feetVisible
      });
      const summary = composeVisionSummary({
        rendererConnected: true,
        framing,
        stage,
        visibleRegions,
        postureRead,
        gazeRead,
        motionRead,
        centering,
        clippingRisk: clipping
      });

      let eyeFrameLuminance = 0.96;
      let eyeLuminanceVariance = 0;
      let eyeSilhouetteCoverage = 0;
      let eyeMotionMagnitude = 0;
      let eyeSceneBrightness = 0.96;
      let eyeSnapshotHash = "eye";
      let eyeBoundsHeight = 0;
      let eyeBoundsWidth = 0;
      let eyeHandsVisible = 0;
      let eyeFeetVisible = 0;
      let eyeTorsoVisible = 0;
      let eyeClippingRisk = 0;
      let eyeCentering = 0.5;
      let eyeFraming = "unknown";
      let eyeStage = "unknown";
      let eyeGazeRead = "unknown";
      let eyeMotionRead = "still";
      let eyeVisibleRegions: string[] = [];
      let eyeSummary = "No live first-person avatar vision is currently available.";

      if (headBone) {
        const headQuaternion = headBone.getWorldQuaternion(headQuaternionRef.current);
        const eyeUp = eyeUpRef.current.set(0, 1, 0).applyQuaternion(headQuaternion).normalize();
        const eyeLookTarget = eyeLookTargetRef.current.copy(lookAtTarget.position);
        const eyeDirection = eyeDirectionRef.current.copy(eyeLookTarget).sub(headWorld);
        if (eyeDirection.lengthSq() < 0.0001) {
          eyeDirection.set(0, 0, -1).applyQuaternion(headQuaternion);
        }
        eyeDirection.normalize();

        const eyePosition = eyePositionRef.current
          .copy(headWorld)
          .addScaledVector(eyeUp, 0.015)
          .addScaledVector(eyeDirection, 0.045);

        eyeCamera.position.copy(eyePosition);
        eyeCamera.up.copy(eyeUp);
        eyeCamera.lookAt(eyeLookTarget);
        eyeCamera.aspect = 1;
        eyeCamera.updateProjectionMatrix();
        eyeCamera.updateMatrixWorld(true);

        const previousTarget = renderState.gl.getRenderTarget();
        const previousXrEnabled = renderState.gl.xr.enabled;
        try {
          renderState.gl.xr.enabled = false;
          renderState.gl.setRenderTarget(eyeRenderTarget);
          renderState.gl.clear();
          renderState.gl.render(renderState.scene, eyeCamera);
          renderState.gl.readRenderTargetPixels(eyeRenderTarget, 0, 0, 32, 32, eyePixelBufferRef.current);

          const eyePixels = new Uint8ClampedArray(eyePixelBufferRef.current);
          const eyeFeatures = analyzeVisionFrame(eyePixels, 32, 32, previousEyeVisionPixelsRef.current);
          eyeFrameLuminance = eyeFeatures.frameLuminance;
          eyeLuminanceVariance = eyeFeatures.luminanceVariance;
          eyeSilhouetteCoverage = eyeFeatures.silhouetteCoverage;
          eyeMotionMagnitude = eyeFeatures.motionMagnitude;
          eyeSceneBrightness = eyeFeatures.sceneBrightness;
          eyeSnapshotHash = eyeFeatures.snapshotHash;
          eyeBoundsHeight = eyeFeatures.boundsHeight;
          eyeBoundsWidth = eyeFeatures.boundsWidth;
          previousEyeVisionPixelsRef.current = eyePixels;
        } catch {
          // If the offscreen eye render fails, retain the last known first-person view.
        } finally {
          renderState.gl.setRenderTarget(previousTarget);
          renderState.gl.xr.enabled = previousXrEnabled;
        }

        const eyeLeftHandViewport = ensureScratchVector(viewportScratch, "eyeLeftHand");
        const eyeRightHandViewport = ensureScratchVector(viewportScratch, "eyeRightHand");
        const eyeLeftFootViewport = ensureScratchVector(viewportScratch, "eyeLeftFoot");
        const eyeRightFootViewport = ensureScratchVector(viewportScratch, "eyeRightFoot");
        const eyeHipsViewport = ensureScratchVector(viewportScratch, "eyeHips");
        const eyeLookTargetViewport = ensureScratchVector(viewportScratch, "eyeLookTarget");
        eyeLeftHandViewport.copy(projectToViewport(leftHandBone, eyeCamera));
        eyeRightHandViewport.copy(projectToViewport(rightHandBone, eyeCamera));
        eyeLeftFootViewport.copy(projectToViewport(leftFootBone, eyeCamera));
        eyeRightFootViewport.copy(projectToViewport(rightFootBone, eyeCamera));
        eyeHipsViewport.copy(projectToViewport(hipsBone, eyeCamera));
        eyeLookTargetViewport.copy(projectToViewport(lookAtTarget, eyeCamera));

        eyeHandsVisible =
          (visibilityFromProjection(eyeLeftHandViewport) + visibilityFromProjection(eyeRightHandViewport)) / 2;
        eyeFeetVisible =
          (visibilityFromProjection(eyeLeftFootViewport) + visibilityFromProjection(eyeRightFootViewport)) / 2;
        eyeTorsoVisible = visibilityFromProjection(eyeHipsViewport);
        eyeBodyCentroidRef.current
          .copy(eyeLeftHandViewport)
          .add(eyeRightHandViewport)
          .add(eyeLeftFootViewport)
          .add(eyeRightFootViewport)
          .add(eyeHipsViewport)
          .multiplyScalar(1 / 5);
        eyeCentering = screenCenteringScore(eyeBodyCentroidRef.current.x, eyeBodyCentroidRef.current.y);
        eyeClippingRisk =
          1 -
          clamp(
            (visibilityFromProjection(eyeLeftHandViewport) +
              visibilityFromProjection(eyeRightHandViewport) +
              visibilityFromProjection(eyeLeftFootViewport) +
              visibilityFromProjection(eyeRightFootViewport) +
              visibilityFromProjection(eyeHipsViewport)) /
              5,
            0,
            1
          );
        eyeFraming = deriveFirstPersonFraming({
          handsVisible: eyeHandsVisible,
          feetVisible: eyeFeetVisible,
          clippingRisk: eyeClippingRisk,
          silhouetteCoverage: Math.max(eyeSilhouetteCoverage, eyeBoundsWidth * eyeBoundsHeight)
        });
        eyeStage = deriveStage(eyeSceneBrightness, eyeLuminanceVariance);
        eyeGazeRead = deriveEyeGazeRead(eyeLookTargetViewport);
        eyeMotionRead = deriveMotionRead(eyeMotionMagnitude, motionVelocity);
        eyeVisibleRegions = deriveFirstPersonVisibleRegions({
          handsVisible: eyeHandsVisible,
          feetVisible: eyeFeetVisible,
          torsoVisible: eyeTorsoVisible
        });
        eyeSummary = composeEyeVisionSummary({
          rendererConnected: true,
          framing: eyeFraming,
          stage: eyeStage,
          visibleRegions: eyeVisibleRegions,
          motionRead: eyeMotionRead,
          centering: eyeCentering,
          clippingRisk: eyeClippingRisk
        });
      }

      const expressionRead = deriveExpressionRead(expressionState);
      const observedAt = new Date().toISOString();

      observationCallbackRef.current({
        observedAt,
        rigFeedback: {
          observedAt,
          rootWorldPosition: toVector3(rootWorldPosition),
          rootWorldRotation: {
            x: Number(rootRotation.x.toFixed(4)),
            y: Number(rootRotation.y.toFixed(4)),
            z: Number(rootRotation.z.toFixed(4))
          },
          rootYaw,
          facingRead,
          headWorldPosition: toVector3(headWorld),
          leftHandWorldPosition: toVector3(leftHandWorld),
          rightHandWorldPosition: toVector3(rightHandWorld),
          headScreenPosition: toVector3(headViewport),
          bodyCentroidScreen: toVector3(bodyCentroid),
          bodyVisibility: Number(bodyVisibility.toFixed(4)),
          faceVisibility: Number(faceVisible.toFixed(4)),
          leftHandVisibility: Number(visibilityFromProjection(leftHandViewport).toFixed(4)),
          rightHandVisibility: Number(visibilityFromProjection(rightHandViewport).toFixed(4)),
          feetVisibility: Number(
            (feetVisible).toFixed(4)
          ),
          clipping: Number(clipping.toFixed(4)),
          motionVelocity: Number(motionVelocity.toFixed(4)),
          expressionHappy: Number(expressionState.happy.toFixed(4)),
          expressionRelaxed: Number(expressionState.relaxed.toFixed(4)),
          expressionSad: Number(expressionState.sad.toFixed(4)),
          expressionAngry: Number(expressionState.angry.toFixed(4)),
          expressionAa: Number(expressionState.aa.toFixed(4)),
          expressionOh: Number(expressionState.oh.toFixed(4)),
          expressionRead
        },
        avatarVision: {
          observedAt,
          source: "avatar_renderer",
          perspective: "third_person",
          frameLuminance: Number(frameLuminance.toFixed(4)),
          luminanceVariance: Number(luminanceVariance.toFixed(4)),
          silhouetteCoverage: Number(silhouetteCoverage.toFixed(4)),
          motionMagnitude: Number(motionMagnitude.toFixed(4)),
          centering: Number(centering.toFixed(4)),
          faceVisible: Number(faceVisible.toFixed(4)),
          handsVisible: Number(handsVisible.toFixed(4)),
          feetVisible: Number(feetVisible.toFixed(4)),
          clippingRisk: Number(clipping.toFixed(4)),
          sceneBrightness: Number(sceneBrightness.toFixed(4)),
          framing,
          stage,
          gazeRead,
          motionRead,
          postureRead,
          visibleRegions,
          summary,
          snapshotHash
        },
        eyeVision: {
          observedAt,
          source: "avatar_eye_camera",
          perspective: "first_person",
          frameLuminance: Number(eyeFrameLuminance.toFixed(4)),
          luminanceVariance: Number(eyeLuminanceVariance.toFixed(4)),
          silhouetteCoverage: Number(eyeSilhouetteCoverage.toFixed(4)),
          motionMagnitude: Number(eyeMotionMagnitude.toFixed(4)),
          centering: Number(eyeCentering.toFixed(4)),
          faceVisible: 0,
          handsVisible: Number(eyeHandsVisible.toFixed(4)),
          feetVisible: Number(eyeFeetVisible.toFixed(4)),
          clippingRisk: Number(eyeClippingRisk.toFixed(4)),
          sceneBrightness: Number(eyeSceneBrightness.toFixed(4)),
          framing: eyeFraming,
          stage: eyeStage,
          gazeRead: eyeGazeRead,
          motionRead: eyeMotionRead,
          postureRead: "through my own eye-line",
          visibleRegions: eyeVisibleRegions,
          summary: eyeSummary,
          snapshotHash: eyeSnapshotHash
        }
      });
    }

    vrm.update(delta);
  });

  return (
    <>
      {vrm ? <primitive object={vrm.scene} /> : null}
      {fallbackVisible ? <PlaceholderFigure embodimentState={embodimentState} /> : null}
    </>
  );
}

export default function AuroraAvatarCanvas(props: AuroraAvatarCanvasProps) {
  const initialRendererStatus = useMemo(() => detectRendererSupport(), []);
  const [rendererStatus, setRendererStatus] = useState<AvatarLoadStatus | null>(initialRendererStatus);

  useEffect(() => {
    if (!rendererStatus) {
      return;
    }

    props.onStatusChange?.(rendererStatus);
  }, [props.onStatusChange, rendererStatus]);

  const handleRendererError = useCallback(
    (error: Error) => {
      const status = describeRendererFailure(error);
      setRendererStatus(status);
      props.onStatusChange?.(status);
    },
    [props.onStatusChange]
  );

  const canvasFallback = <div className="avatar-canvas avatar-canvas--fallback" aria-hidden="true" />;

  if (rendererStatus) {
    return canvasFallback;
  }

  return (
    <AvatarCanvasRuntimeBoundary
      fallback={canvasFallback}
      onError={handleRendererError}
      resetKey={props.modelUrl}
    >
      <Canvas
        className="avatar-canvas"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{
          position: [0, CAMERA_BASE_HEIGHT, CAMERA_DEFAULT_DISTANCE],
          fov: cameraFovForDistance(CAMERA_DEFAULT_DISTANCE)
        }}
      >
        <color attach="background" args={["#f8fafc"]} />
        <fog attach="fog" args={["#f3f6fb", 3.2, 6.8]} />
        <ambientLight intensity={0.92} color="#edf4ff" />
        <directionalLight position={[2.1, 3.3, 2.8]} intensity={1.2} color="#fff7ef" />
        <directionalLight position={[-2.6, 1.8, 1.5]} intensity={0.72} color="#8db7ff" />
        <pointLight position={[0, 1.2, 2.2]} intensity={0.45} color="#d6e5ff" />
        <AvatarOrbitCamera />
        <AvatarRig {...props} />
      </Canvas>
    </AvatarCanvasRuntimeBoundary>
  );
}
