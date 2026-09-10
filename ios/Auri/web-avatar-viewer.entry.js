import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin } from "./vendor/three-vrm-animation.module.js";

const STATUS_VISIBLE = "true";
const ZERO_ROTATION = { x: 0, y: 0, z: 0 };
const CAMERA_PHYSICS = {
  translationImpulse: 0.15,
  rotationImpulse: 0.095,
  positionSmoothing: 6.1,
  rotationSmoothing: 6.5,
  maxPositionOffset: 0.037,
  maxRotationOffset: 0.046,
  positionDeadzone: 0.0025,
  rotationDeadzone: 0.01
};
const BODY_PHYSICS = {
  spinePitch: 0.44,
  spineYaw: 0.48,
  spineRoll: 0.54,
  chestPitch: 0.72,
  chestYaw: 0.56,
  chestRoll: 0.78,
  neckPitch: 0.12,
  neckYaw: 0.14,
  headPitch: 0.08,
  headYaw: 0.08,
  shoulderPitch: 0.18,
  shoulderRoll: 0.42,
  upperArmPitch: 0.2,
  upperArmYaw: 0.14,
  upperArmRoll: 0.3,
  lowerArmPitch: 0.12,
  handPitch: 0.08,
  hipsPitch: 0.2,
  hipsYaw: 0.18,
  hipsRoll: 0.28,
  upperLegPitch: 0.16,
  upperLegRoll: 0.16,
  lowerLegPitch: 0.08,
  footPitch: 0.06,
  pitchLimit: 0.075,
  yawLimit: 0.07,
  rollLimit: 0.1
};
const BUST_PHYSICS = {
  positionMultiplier: 2.65,
  rotationMultiplier: 2.45,
  positionSmoothing: 6.8,
  rotationSmoothing: 6.9,
  maxPositionOffset: 0.105,
  maxRotationOffset: 0.13,
  sleepMultiplier: 0.28
};
const BUST_FOLLOW = {
  rootPitchFromDepth: 2.75,
  rootPitchFromLift: -1.28,
  rootYawFromSide: 3.15,
  rootYawFromTurn: 1.28,
  rootRollFromSide: -4.05,
  rootRollFromTurn: -1.18,
  secondaryMultiplier: 1.18,
  endMultiplier: 1.34,
  maxPitch: 0.25,
  maxYaw: 0.29,
  maxRoll: 0.34,
  sleepMultiplier: 0.34
};
const BUST_NATIVE_SPRING = {
  stiffness: 0.24,
  dragForce: 0.04,
  gravityPower: 0.16
};
const POSE_BLEND = {
  smoothing: 11,
  transitionSmoothing: 24
};
const NATURAL_BLINK_MAX = 0.72;
const CLOSED_EYE_MAX = 0.88;
const AUTHORED_VRMA_FILES = {
  idle_pose: "animations/idle_pose.vrma",
  angry_pose: "animations/angry_pose.vrma",
  happy_pose: [
    "animations/happy_pose.vrma",
    "animations/Happy_pose.vrma",
    "animations/Happy_Pose.vrma"
  ],
  dead_pose: "animations/dead_pose.vrma"
};
const AUTHORED_TRANSITION_FILES = {
  idle_angry_transition: [
    "animations/idle_angry_transition.vrma",
    "animations/Idle_angry_transition.vrma",
    "animations/Idle_Angry_Transition.vrma"
  ],
  idle_happy_transition: [
    "animations/idle_happy_transition.vrma",
    "animations/Idle_happy_transition.vrma",
    "animations/Idle_Happy_Transition.vrma"
  ]
};
const UPPER_BODY_POSES = {
  idle_pose: {
    leftShoulder: { x: 0.05, y: 0, z: -0.06 },
    rightShoulder: { x: 0.05, y: 0, z: 0.06 },
    leftUpperArm: { x: 0.12, y: -0.14, z: -1.12 },
    rightUpperArm: { x: 0.12, y: 0.14, z: 1.12 },
    leftLowerArm: { x: -0.44, y: -0.03, z: -0.1 },
    rightLowerArm: { x: -0.44, y: 0.03, z: 0.1 },
    leftHand: { x: 0.16, y: -0.05, z: -0.08 },
    rightHand: { x: 0.16, y: 0.05, z: 0.08 },
    leftThumbMetacarpal: { x: 0.34, y: 0.22, z: 0.04 },
    rightThumbMetacarpal: { x: 0.34, y: -0.22, z: -0.04 },
    leftThumbProximal: { x: 0.28, y: 0.14, z: 0.02 },
    rightThumbProximal: { x: 0.28, y: -0.14, z: -0.02 },
    leftThumbDistal: { x: 0.2, y: 0.06, z: 0 },
    rightThumbDistal: { x: 0.2, y: -0.06, z: 0 }
  },
  angry_pose: {
    leftShoulder: { x: 0.08, y: 0, z: -0.1 },
    rightShoulder: { x: 0.08, y: 0, z: 0.1 },
    leftUpperArm: { x: -0.02, y: -0.28, z: -1.02 },
    rightUpperArm: { x: -0.02, y: 0.28, z: 1.02 },
    leftLowerArm: { x: -1.42, y: -0.06, z: -1.16 },
    rightLowerArm: { x: -1.42, y: 0.06, z: 1.16 },
    leftHand: { x: 0.08, y: -0.12, z: -0.26 },
    rightHand: { x: 0.08, y: 0.12, z: 0.26 },
    leftThumbMetacarpal: { x: 0.22, y: 0.12, z: 0.08 },
    rightThumbMetacarpal: { x: 0.22, y: -0.12, z: -0.08 },
    leftThumbProximal: { x: 0.18, y: 0.08, z: 0.04 },
    rightThumbProximal: { x: 0.18, y: -0.08, z: -0.04 },
    leftThumbDistal: { x: 0.12, y: 0.04, z: 0 },
    rightThumbDistal: { x: 0.12, y: -0.04, z: 0 }
  }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return min + (Math.random() * (max - min));
}

function addRotation(base = ZERO_ROTATION, offset = ZERO_ROTATION) {
  return {
    x: (base.x || 0) + (offset.x || 0),
    y: (base.y || 0) + (offset.y || 0),
    z: (base.z || 0) + (offset.z || 0)
  };
}

function damp(current, target, smoothing, delta) {
  const blend = 1 - Math.exp(-smoothing * delta);
  return current + ((target - current) * blend);
}

function postStatus(state, message = "") {
  const handler = window.webkit?.messageHandlers?.auriAvatarStatus;
  if (handler) {
    handler.postMessage({ state, message });
  }
}

function roundCameraComponent(value) {
  return Math.round(value * 10000) / 10000;
}

function normalizedCameraVector(vector) {
  return {
    x: roundCameraComponent(vector.x),
    y: roundCameraComponent(vector.y),
    z: roundCameraComponent(vector.z)
  };
}

function setOverlay(overlay, message, visible) {
  overlay.textContent = message;
  overlay.dataset.visible = visible ? STATUS_VISIBLE : "false";
}

function createGroundShadowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.42)");
  gradient.addColorStop(0.45, "rgba(0, 0, 0, 0.20)");
  gradient.addColorStop(0.82, "rgba(0, 0, 0, 0.05)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildViewer() {
  const canvas = document.getElementById("auri-avatar-canvas");
  const overlay = document.getElementById("auri-avatar-overlay");
  const bootstrap = window.AuriAvatarBootstrap || {};

  if (!canvas || !overlay || !bootstrap.modelURL) {
    return;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "default"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 20);
  camera.position.set(0, 0.86, 2.45);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.85;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 2.35;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x60708a, 1.55);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(1.8, 2.7, 2.3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcad7ff, 0.72);
  fill.position.set(-1.9, 1.6, 1.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.38);
  rim.position.set(0.2, 2.4, -2.1);
  scene.add(rim);

  const rootAnchor = new THREE.Group();
  scene.add(rootAnchor);
  const physicsCenter = new THREE.Object3D();
  const bustPhysicsCenter = new THREE.Object3D();
  const groundShadowTexture = createGroundShadowTexture();
  const groundShadowMaterial = new THREE.MeshBasicMaterial({
    map: groundShadowTexture || null,
    color: 0x000000,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundShadowMaterial);
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.set(0, 0.01, 0);
  groundShadow.renderOrder = -2;
  rootAnchor.add(groundShadow);

  const clock = new THREE.Clock();
  const size = new THREE.Vector2();
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const extent = new THREE.Vector3();
  const workingEuler = new THREE.Euler();
  const targetQuaternion = new THREE.Quaternion();
  const baseQuaternion = new THREE.Quaternion();
  const additiveQuaternion = new THREE.Quaternion();
  const composedQuaternion = new THREE.Quaternion();
  const previousCameraPosition = new THREE.Vector3();
  const previousCameraQuaternion = new THREE.Quaternion();
  const cameraDelta = new THREE.Vector3();
  const cameraQuaternionDelta = new THREE.Quaternion();
  const cameraRotationDelta = new THREE.Euler();
  const physicsPositionTarget = new THREE.Vector3();
  const physicsRotationTarget = new THREE.Vector3();
  const physicsPositionOffset = new THREE.Vector3();
  const physicsRotationOffset = new THREE.Vector3();
  const bustPhysicsPositionTarget = new THREE.Vector3();
  const bustPhysicsRotationTarget = new THREE.Vector3();
  const bustPhysicsPositionOffset = new THREE.Vector3();
  const bustPhysicsRotationOffset = new THREE.Vector3();

  let vrm = null;
  let elapsed = 0;
  let disposed = false;
  const queuedInitialState = window.__AuriLatestState && typeof window.__AuriLatestState === "object"
    ? window.__AuriLatestState
    : null;
  let state = {
    mood: "cozy",
    isSleeping: false,
    lightsOff: false,
    wantsAttention: false,
    wantsSleep: false,
    needsMedicine: false,
    tired: 0,
    isPaused: false,
    modelURL:
      typeof queuedInitialState?.modelURL === "string" && queuedInitialState.modelURL.length > 0
        ? queuedInitialState.modelURL
        : bootstrap.modelURL,
    presentationMode: "room",
    framingYOffset: 0,
    ...(queuedInitialState || {})
  };
  let expressionState = {
    blink: 0,
    happy: 0,
    relaxed: 0,
    sad: 0,
    angry: 0
  };
  let blinkSchedule = null;
  let blinkWasForcedClosed = false;
  let avatarFraming = {
    width: 0.9,
    height: 1.52,
    depth: 0.56,
    centerY: 0.76
  };
  let hasLoadedAvatar = false;
  let authoredPoses = {};
  let authoredTransitions = {};
  let hasSpringBonePhysics = false;
  let hasCameraMotionSample = false;
  let bustJointCount = 0;
  let bustBoneBindings = [];
  let pendingRestoredCameraState = null;
  let lastPostedCameraState = null;
  let cameraPersistTimer = null;
  let lastTapAt = 0;
  let lastTapPoint = null;
  let activeTapTouch = null;
  let activeTapMoved = false;
  let avatarLoadVersion = 0;
  let animationFrameHandle = null;
  let displayedPose = null;
  let activePoseTransition = null;
  let lastResolvedPoseState = null;

  function disposeLoadedAvatar() {
    if (!vrm) {
      authoredPoses = {};
      authoredTransitions = {};
      bustBoneBindings = [];
      bustJointCount = 0;
      hasSpringBonePhysics = false;
      hasLoadedAvatar = false;
      displayedPose = null;
      activePoseTransition = null;
      lastResolvedPoseState = null;
      return;
    }

    physicsCenter.removeFromParent();
    bustPhysicsCenter.removeFromParent();
    rootAnchor.remove(vrm.scene);
    authoredPoses = {};
    authoredTransitions = {};
    bustBoneBindings = [];
    bustJointCount = 0;
    hasSpringBonePhysics = false;
    hasLoadedAvatar = false;
    displayedPose = null;
    activePoseTransition = null;
    lastResolvedPoseState = null;
    vrm = null;
  }

  function fitCameraToAvatar(options = false) {
    const preserveView = typeof options === "boolean" ? options : !!options?.preserveView;
    const preserveDistance = typeof options === "object" && !!options?.preserveDistance;
    const onboardingPresentation = state.presentationMode === "onboarding";
    const chatPresentation = state.presentationMode === "chat";
    const framingYOffset = Number.isFinite(state.framingYOffset) ? state.framingYOffset : 0;
    const heightScale = onboardingPresentation ? 0.92 : (chatPresentation ? 0.68 : 1.02);
    const widthScale = onboardingPresentation ? 1.08 : (chatPresentation ? 0.86 : 1.24);
    const minimumWidth = onboardingPresentation ? 0.72 : (chatPresentation ? 0.56 : 0.82);
    const depthPadding = onboardingPresentation ? 0.38 : (chatPresentation ? 0.16 : 0.48);
    const aspect = Math.max(camera.aspect, 0.001);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * aspect);
    const paddedHeight = Math.max(avatarFraming.height * heightScale, 1);
    const paddedWidth = Math.max(
      avatarFraming.width * widthScale,
      minimumWidth
    );
    const distanceForHeight = (paddedHeight * 0.5) / Math.tan(verticalFov * 0.5);
    const distanceForWidth = (paddedWidth * 0.5) / Math.tan(horizontalFov * 0.5);
    const distance = Math.max(distanceForHeight, distanceForWidth)
      + (avatarFraming.depth * depthPadding);
    const lookAtY = avatarFraming.centerY - (avatarFraming.height * (onboardingPresentation ? 0.03 : 0.08)) + framingYOffset;
    const previousOffset = camera.position.clone().sub(controls.target);
    const previousTarget = controls.target.clone();

    controls.minDistance = distance * 0.18;
    controls.maxDistance = distance * 2.6;

    if (!onboardingPresentation && !chatPresentation && preserveDistance && hasLoadedAvatar && previousOffset.lengthSq() > 0.0001) {
      const nextDistance = clamp(previousOffset.length(), controls.minDistance, controls.maxDistance);
      controls.target.set(0, lookAtY, 0);
      camera.position.copy(controls.target).add(previousOffset.normalize().multiplyScalar(nextDistance));
    } else if (!onboardingPresentation && !chatPresentation && preserveView && hasLoadedAvatar && previousOffset.lengthSq() > 0.0001) {
      controls.target.copy(previousTarget);
      const nextDistance = clamp(previousOffset.length(), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(previousOffset.normalize().multiplyScalar(nextDistance));
    } else {
      controls.target.set(0, lookAtY, 0);
      camera.position.set(0, lookAtY + 0.05, distance);
    }

    controls.update();
    hasCameraMotionSample = false;
  }

  function currentCameraState() {
    return {
      position: normalizedCameraVector(camera.position),
      target: normalizedCameraVector(controls.target)
    };
  }

  function sameCameraState(a, b) {
    if (!a || !b) {
      return false;
    }

    return (
      a.position.x === b.position.x &&
      a.position.y === b.position.y &&
      a.position.z === b.position.z &&
      a.target.x === b.target.x &&
      a.target.y === b.target.y &&
      a.target.z === b.target.z
    );
  }

  function postCameraState(force = false) {
    if (state.presentationMode !== "room") {
      return;
    }

    const handler = window.webkit?.messageHandlers?.auriAvatarCamera;
    if (!handler) {
      return;
    }

    const payload = currentCameraState();
    if (!force && sameCameraState(payload, lastPostedCameraState)) {
      return;
    }

    handler.postMessage(payload);
    lastPostedCameraState = payload;
  }

  function scheduleCameraStatePost(force = false) {
    if (state.presentationMode !== "room") {
      if (cameraPersistTimer) {
        window.clearTimeout(cameraPersistTimer);
        cameraPersistTimer = null;
      }
      return;
    }

    if (cameraPersistTimer) {
      window.clearTimeout(cameraPersistTimer);
      cameraPersistTimer = null;
    }

    if (force) {
      postCameraState(true);
      return;
    }

    cameraPersistTimer = window.setTimeout(() => {
      cameraPersistTimer = null;
      postCameraState(false);
    }, 140);
  }

  function restoreCameraState(nextCameraState) {
    if (!nextCameraState?.position || !nextCameraState?.target) {
      return false;
    }

    const nextTarget = nextCameraState.target;
    const nextPosition = nextCameraState.position;
    controls.target.set(nextTarget.x || 0, nextTarget.y || 0, nextTarget.z || 0);
    camera.position.set(nextPosition.x || 0, nextPosition.y || 0, nextPosition.z || 0);

    cameraDelta.copy(camera.position).sub(controls.target);
    if (cameraDelta.lengthSq() < 0.000001) {
      return false;
    }

    const clampedDistance = clamp(cameraDelta.length(), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(cameraDelta.normalize().multiplyScalar(clampedDistance));
    camera.lookAt(controls.target);
    controls.update();
    previousCameraPosition.copy(camera.position);
    previousCameraQuaternion.copy(camera.quaternion);
    hasCameraMotionSample = true;
    lastPostedCameraState = currentCameraState();
    return true;
  }

  function restorePendingCameraStateIfNeeded() {
    if (state.presentationMode !== "room" || !hasLoadedAvatar || !pendingRestoredCameraState) {
      return false;
    }

    const restored = restoreCameraState(pendingRestoredCameraState);
    if (restored) {
      pendingRestoredCameraState = null;
    }
    return restored;
  }

  function resetCameraView() {
    if (!hasLoadedAvatar) {
      return;
    }

    fitCameraToAvatar(false);
    pendingRestoredCameraState = null;
    scheduleCameraStatePost(true);
  }

  function beginTapTracking(event) {
    if (event.touches.length !== 1) {
      activeTapTouch = null;
      activeTapMoved = false;
      return;
    }

    const touch = event.touches[0];
    activeTapTouch = {
      x: touch.clientX,
      y: touch.clientY
    };
    activeTapMoved = false;
  }

  function updateTapTracking(event) {
    if (!activeTapTouch || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const dx = touch.clientX - activeTapTouch.x;
    const dy = touch.clientY - activeTapTouch.y;
    if ((dx * dx) + (dy * dy) > (18 * 18)) {
      activeTapMoved = true;
    }
  }

  function endTapTracking(event) {
    if (!activeTapTouch || activeTapMoved || event.changedTouches.length !== 1) {
      activeTapTouch = null;
      activeTapMoved = false;
      return;
    }

    const touch = event.changedTouches[0];
    const tapPoint = { x: touch.clientX, y: touch.clientY };
    const now = performance.now();
    const isCloseToPreviousTap = lastTapPoint
      ? (((tapPoint.x - lastTapPoint.x) ** 2) + ((tapPoint.y - lastTapPoint.y) ** 2)) <= (24 * 24)
      : false;

    if (now - lastTapAt < 320 && isCloseToPreviousTap) {
      lastTapAt = 0;
      lastTapPoint = null;
      resetCameraView();
    } else {
      lastTapAt = now;
      lastTapPoint = tapPoint;
    }

    activeTapTouch = null;
    activeTapMoved = false;
  }

  function cancelTapTracking() {
    activeTapTouch = null;
    activeTapMoved = false;
  }

  function poseRotation(x = 0, y = 0, z = 0) {
    workingEuler.set(x, y, z);
    return targetQuaternion.setFromEuler(workingEuler).toArray();
  }

  function scheduleNextBlink(fromTime = elapsed, isQuickFollowUp = false) {
    return {
      start: fromTime + (isQuickFollowUp ? randomBetween(0.08, 0.22) : randomBetween(2.4, 5.8)),
      duration: isQuickFollowUp ? randomBetween(0.09, 0.14) : randomBetween(0.12, 0.19),
      peak: isQuickFollowUp ? randomBetween(0.74, 0.9) : randomBetween(0.84, 1),
      followUpPending: !isQuickFollowUp && Math.random() < 0.18
    };
  }

  function nextBlinkTarget(eyesClosed) {
    if (eyesClosed) {
      blinkWasForcedClosed = true;
      blinkSchedule = scheduleNextBlink(elapsed);
      return 1;
    }

    if (blinkWasForcedClosed) {
      blinkWasForcedClosed = false;
      blinkSchedule = scheduleNextBlink(elapsed);
    } else if (!blinkSchedule) {
      blinkSchedule = scheduleNextBlink(elapsed);
    }

    if (elapsed < blinkSchedule.start) {
      return 0;
    }

    const progress = (elapsed - blinkSchedule.start) / Math.max(blinkSchedule.duration, 0.001);
    if (progress >= 1) {
      const shouldFollowUp = blinkSchedule.followUpPending;
      const nextAnchor = blinkSchedule.start + blinkSchedule.duration;
      blinkSchedule = scheduleNextBlink(nextAnchor, shouldFollowUp);
      return 0;
    }

    return Math.sin(progress * Math.PI) * blinkSchedule.peak;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitCameraToAvatar(true);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(document.body);
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", () => scheduleCameraStatePost(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      scheduleCameraStatePost(true);
    }
  });
  controls.addEventListener("change", () => scheduleCameraStatePost(false));
  controls.addEventListener("end", () => scheduleCameraStatePost(true));
  canvas.addEventListener("dblclick", resetCameraView);
  canvas.addEventListener("touchstart", beginTapTracking, { passive: true });
  canvas.addEventListener("touchmove", updateTapTracking, { passive: true });
  canvas.addEventListener("touchend", endTapTracking, { passive: true });
  canvas.addEventListener("touchcancel", cancelTapTracking, { passive: true });

  function updateLighting() {
    const dimmed = state.lightsOff;
    hemisphere.intensity = dimmed ? 0.42 : 1.55;
    key.intensity = dimmed ? 0.52 : 1.45;
    fill.intensity = dimmed ? 0.25 : 0.72;
    rim.intensity = dimmed ? 0.15 : 0.38;
  }

  function configureSpringBonePhysics(loadedVrm) {
    physicsCenter.position.set(0, 0, 0);
    physicsCenter.rotation.set(0, 0, 0);
    physicsCenter.updateMatrixWorld(true);
    bustPhysicsCenter.position.set(0, 0, 0);
    bustPhysicsCenter.rotation.set(0, 0, 0);
    bustPhysicsCenter.updateMatrixWorld(true);
    bustJointCount = 0;
    bustBoneBindings = [];
    const seenBustBones = new Set();
    const manager = loadedVrm.springBoneManager;

    function pushBustBinding(bone) {
      const boneName = bone?.name || "";
      if (!boneName || seenBustBones.has(boneName)) {
        return;
      }

      if (!/(?:Bust|Breast)/i.test(boneName)) {
        return;
      }

      seenBustBones.add(boneName);
      const segmentMultiplier = /Bust2_end|Breast2_end/i.test(boneName)
        ? BUST_FOLLOW.endMultiplier
        : /Bust2|Breast2/i.test(boneName)
          ? BUST_FOLLOW.secondaryMultiplier
          : 1;
      bustBoneBindings.push({
        bone,
        side: /_L_/.test(boneName) ? 1 : -1,
        depthScale: /Bust1|Breast1/i.test(boneName)
          ? 1
          : /Bust2_end|Breast2_end/i.test(boneName)
            ? 0.24
            : /Bust2|Breast2/i.test(boneName)
              ? 0.58
              : 0.44,
        segmentMultiplier,
        lastOffset: new THREE.Quaternion(),
        hasOffset: false
      });
    }

    if (manager && manager.joints.size > 0) {
      for (const joint of manager.joints) {
        const boneName = joint.bone?.name || "";
        if (/(?:Bust|Breast)/i.test(boneName)) {
          joint.settings.stiffness = Math.min(joint.settings.stiffness, BUST_NATIVE_SPRING.stiffness);
          joint.settings.dragForce = Math.min(joint.settings.dragForce, BUST_NATIVE_SPRING.dragForce);
          joint.settings.gravityPower = Math.max(joint.settings.gravityPower, BUST_NATIVE_SPRING.gravityPower);
          joint.center = physicsCenter;
          bustJointCount += 1;
          pushBustBinding(joint.bone);
        } else {
          joint.center = physicsCenter;
        }
      }
    }

    loadedVrm.scene?.traverse((object) => {
      if (!object?.isBone) {
        return;
      }

      pushBustBinding(object);
    });

    scene.updateMatrixWorld(true);
    manager?.reset();
    hasSpringBonePhysics = Boolean((manager && manager.joints.size > 0) || bustBoneBindings.length > 0);
    hasCameraMotionSample = false;
  }

  function clearBustBoneOverrides() {
    if (bustBoneBindings.length === 0) {
      return;
    }

    for (const binding of bustBoneBindings) {
      if (!binding.hasOffset) {
        continue;
      }

      additiveQuaternion.copy(binding.lastOffset).invert();
      binding.bone.quaternion.multiply(additiveQuaternion);
      binding.lastOffset.identity();
      binding.hasOffset = false;
    }
  }

  function resetCameraDrivenPhysics() {
    clearBustBoneOverrides();
    physicsPositionTarget.set(0, 0, 0);
    physicsRotationTarget.set(0, 0, 0);
    physicsPositionOffset.set(0, 0, 0);
    physicsRotationOffset.set(0, 0, 0);
    physicsCenter.position.set(0, 0, 0);
    physicsCenter.rotation.set(0, 0, 0);
    physicsCenter.updateMatrixWorld(true);
    bustPhysicsPositionTarget.set(0, 0, 0);
    bustPhysicsRotationTarget.set(0, 0, 0);
    bustPhysicsPositionOffset.set(0, 0, 0);
    bustPhysicsRotationOffset.set(0, 0, 0);
    bustPhysicsCenter.position.set(0, 0, 0);
    bustPhysicsCenter.rotation.set(0, 0, 0);
    bustPhysicsCenter.updateMatrixWorld(true);
    previousCameraPosition.copy(camera.position);
    previousCameraQuaternion.copy(camera.quaternion);
    hasCameraMotionSample = true;
  }

  function applyBustBoneOverrides() {
    if (bustBoneBindings.length === 0 || state.mood === "gone") {
      return;
    }

    const motionX = bustPhysicsPositionOffset.x + (bustPhysicsRotationOffset.y * 0.12);
    const motionY = bustPhysicsPositionOffset.y + (Math.abs(bustPhysicsRotationOffset.x) * 0.05);
    const motionZ = bustPhysicsPositionOffset.z - (bustPhysicsRotationOffset.x * 0.22);
    const motionTurn = bustPhysicsRotationOffset.y + (bustPhysicsPositionOffset.x * 0.18);
    const sleepMultiplier = state.isSleeping ? BUST_FOLLOW.sleepMultiplier : 1;

    for (const binding of bustBoneBindings) {
      const depth = binding.depthScale * binding.segmentMultiplier;
      const pitch = clamp(
        (
          (motionZ * BUST_FOLLOW.rootPitchFromDepth) +
          (motionY * BUST_FOLLOW.rootPitchFromLift)
        ) * depth * sleepMultiplier,
        -BUST_FOLLOW.maxPitch * depth,
        BUST_FOLLOW.maxPitch * depth
      );
      const yaw = clamp(
        (
          (motionX * BUST_FOLLOW.rootYawFromSide * binding.side) +
          (motionTurn * BUST_FOLLOW.rootYawFromTurn * binding.side)
        ) * depth * sleepMultiplier,
        -BUST_FOLLOW.maxYaw * depth,
        BUST_FOLLOW.maxYaw * depth
      );
      const roll = clamp(
        (
          (motionX * BUST_FOLLOW.rootRollFromSide * binding.side) +
          (motionTurn * BUST_FOLLOW.rootRollFromTurn * binding.side)
        ) * depth * sleepMultiplier,
        -BUST_FOLLOW.maxRoll * depth,
        BUST_FOLLOW.maxRoll * depth
      );

      workingEuler.set(pitch, yaw, roll, "XYZ");
      additiveQuaternion.setFromEuler(workingEuler);
      binding.bone.quaternion.multiply(additiveQuaternion);
      binding.lastOffset.copy(additiveQuaternion);
      binding.hasOffset = true;
    }
  }

  function mergePose(basePose, overlayPose) {
    const result = { ...basePose };
    for (const [boneName, transform] of Object.entries(overlayPose || {})) {
      result[boneName] = {
        ...(result[boneName] || {}),
        ...transform
      };
    }
    return result;
  }

  function blendPose(currentPose, targetPose, smoothing, delta) {
    if (!currentPose) {
      return targetPose;
    }

    const blend = 1 - Math.exp(-smoothing * delta);
    const result = {};
    const boneNames = new Set([
      ...Object.keys(currentPose || {}),
      ...Object.keys(targetPose || {})
    ]);

    for (const boneName of boneNames) {
      const currentTransform = currentPose?.[boneName] || {};
      const targetTransform = targetPose?.[boneName] || currentTransform;
      const nextTransform = {};

      if (currentTransform.rotation && targetTransform.rotation) {
        baseQuaternion.fromArray(currentTransform.rotation);
        targetQuaternion.fromArray(targetTransform.rotation);
        baseQuaternion.slerp(targetQuaternion, blend);
        nextTransform.rotation = baseQuaternion.toArray();
      } else if (targetTransform.rotation) {
        nextTransform.rotation = Array.from(targetTransform.rotation);
      } else if (currentTransform.rotation) {
        nextTransform.rotation = Array.from(currentTransform.rotation);
      }

      if (targetTransform.position) {
        nextTransform.position = Array.from(targetTransform.position);
      } else if (currentTransform.position) {
        nextTransform.position = Array.from(currentTransform.position);
      }

      result[boneName] = nextTransform;
    }

    return result;
  }

  function appendRotationOffset(pose, boneName, offset = ZERO_ROTATION) {
    if (!pose[boneName]) {
      pose[boneName] = {};
    }

    const currentRotation = pose[boneName].rotation || poseRotation();
    baseQuaternion.fromArray(currentRotation);
    workingEuler.set(offset.x || 0, offset.y || 0, offset.z || 0);
    additiveQuaternion.setFromEuler(workingEuler);
    composedQuaternion.copy(baseQuaternion).multiply(additiveQuaternion);
    pose[boneName].rotation = composedQuaternion.toArray();
  }

  function applyAdditivePose(pose, offsets) {
    for (const [boneName, offset] of Object.entries(offsets || {})) {
      appendRotationOffset(pose, boneName, offset);
    }
  }

  function buildBodyPhysicsOffsets(deadPose, sleepingPose) {
    if (deadPose || !hasSpringBonePhysics) {
      return null;
    }

    const sleepFactor = sleepingPose ? 0.22 : 1;
    const pitch = clamp(
      ((-physicsPositionOffset.y * 1.7) + (physicsRotationOffset.x * 2.1)) * sleepFactor,
      -BODY_PHYSICS.pitchLimit,
      BODY_PHYSICS.pitchLimit
    );
    const yaw = clamp(
      ((physicsPositionOffset.x * 1.35) + (physicsRotationOffset.y * 1.55)) * sleepFactor,
      -BODY_PHYSICS.yawLimit,
      BODY_PHYSICS.yawLimit
    );
    const roll = clamp(
      ((-physicsPositionOffset.x * 2.4) - (physicsRotationOffset.y * 2.15)) * sleepFactor,
      -BODY_PHYSICS.rollLimit,
      BODY_PHYSICS.rollLimit
    );

    return {
      hips: {
        x: pitch * BODY_PHYSICS.hipsPitch,
        y: yaw * BODY_PHYSICS.hipsYaw,
        z: roll * BODY_PHYSICS.hipsRoll
      },
      spine: {
        x: pitch * BODY_PHYSICS.spinePitch,
        y: yaw * BODY_PHYSICS.spineYaw,
        z: roll * BODY_PHYSICS.spineRoll
      },
      chest: {
        x: pitch * BODY_PHYSICS.chestPitch,
        y: yaw * BODY_PHYSICS.chestYaw,
        z: roll * BODY_PHYSICS.chestRoll
      },
      neck: {
        x: -pitch * BODY_PHYSICS.neckPitch,
        y: -yaw * BODY_PHYSICS.neckYaw,
        z: -roll * 0.06
      },
      head: {
        x: -pitch * BODY_PHYSICS.headPitch,
        y: -yaw * BODY_PHYSICS.headYaw,
        z: -roll * 0.04
      },
      leftShoulder: {
        x: -pitch * BODY_PHYSICS.shoulderPitch,
        y: -yaw * 0.06,
        z: roll * BODY_PHYSICS.shoulderRoll
      },
      rightShoulder: {
        x: -pitch * BODY_PHYSICS.shoulderPitch,
        y: -yaw * 0.06,
        z: roll * BODY_PHYSICS.shoulderRoll
      },
      leftUpperArm: {
        x: -pitch * BODY_PHYSICS.upperArmPitch,
        y: -yaw * BODY_PHYSICS.upperArmYaw,
        z: -roll * BODY_PHYSICS.upperArmRoll
      },
      rightUpperArm: {
        x: -pitch * BODY_PHYSICS.upperArmPitch,
        y: -yaw * BODY_PHYSICS.upperArmYaw,
        z: -roll * BODY_PHYSICS.upperArmRoll
      },
      leftLowerArm: {
        x: -pitch * BODY_PHYSICS.lowerArmPitch,
        y: 0,
        z: -roll * 0.08
      },
      rightLowerArm: {
        x: -pitch * BODY_PHYSICS.lowerArmPitch,
        y: 0,
        z: -roll * 0.08
      },
      leftHand: {
        x: -pitch * BODY_PHYSICS.handPitch,
        y: -yaw * 0.05,
        z: -roll * 0.05
      },
      rightHand: {
        x: -pitch * BODY_PHYSICS.handPitch,
        y: -yaw * 0.05,
        z: -roll * 0.05
      },
      leftUpperLeg: {
        x: -pitch * BODY_PHYSICS.upperLegPitch,
        y: 0,
        z: -roll * BODY_PHYSICS.upperLegRoll
      },
      rightUpperLeg: {
        x: -pitch * BODY_PHYSICS.upperLegPitch,
        y: 0,
        z: -roll * BODY_PHYSICS.upperLegRoll
      },
      leftLowerLeg: {
        x: pitch * BODY_PHYSICS.lowerLegPitch,
        y: 0,
        z: 0
      },
      rightLowerLeg: {
        x: pitch * BODY_PHYSICS.lowerLegPitch,
        y: 0,
        z: 0
      },
      leftFoot: {
        x: pitch * BODY_PHYSICS.footPitch,
        y: 0,
        z: 0
      },
      rightFoot: {
        x: pitch * BODY_PHYSICS.footPitch,
        y: 0,
        z: 0
      }
    };
  }

  function loadAuthoredVRMA(name, relativePath, mode = "pose") {
    return new Promise((resolve, reject) => {
      if (!vrm) {
        resolve();
        return;
      }

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      loader.load(
        new URL(relativePath, window.location.href).href,
        (gltf) => {
          const vrmAnimation = gltf.userData?.vrmAnimations?.[0];
          if (!vrmAnimation) {
            reject(new Error(`No VRM animation found for ${name}`));
            return;
          }

          if (mode === "transition") {
            const transition = {
              duration: 0,
              bones: {}
            };

            for (const [boneName, track] of vrmAnimation.humanoidTracks.rotation.entries()) {
              const times = Array.from(track.times || []);
              const values = Array.from(track.values || []);
              if (times.length === 0 || values.length < 4) {
                continue;
              }

              transition.bones[boneName] = { times, values };
              transition.duration = Math.max(
                transition.duration,
                times[times.length - 1] || 0
              );
            }

            authoredTransitions[name] = transition;
            resolve();
            return;
          }

          const pose = {};
          for (const [boneName, track] of vrmAnimation.humanoidTracks.rotation.entries()) {
            if (track.values.length >= 4) {
              pose[boneName] = {
                ...(pose[boneName] || {}),
                rotation: Array.from(track.values.slice(0, 4))
              };
            }
          }
          authoredPoses[name] = pose;
          resolve();
        },
        undefined,
        (error) => {
          reject(error instanceof Error ? error : new Error(`Failed to load ${name}`));
        }
      );
    });
  }

  async function loadAuthoredVRMAWithFallbacks(name, fileSpec, mode = "pose") {
    const candidates = Array.isArray(fileSpec) ? fileSpec : [fileSpec];
    let lastError = null;

    for (const candidate of candidates) {
      try {
        await loadAuthoredVRMA(name, candidate, mode);
        return candidate;
      } catch (error) {
        lastError = error;
      }
    }

    throw (lastError instanceof Error ? lastError : new Error(`Failed to load ${name}`));
  }

  async function loadAuthoredPoseAnimations() {
    authoredPoses = {};
    authoredTransitions = {};
    const poseEntries = Object.entries(AUTHORED_VRMA_FILES);
    for (const [name, relativePath] of poseEntries) {
      try {
        const loadedPath = await loadAuthoredVRMAWithFallbacks(name, relativePath, "pose");
        console.info(`[Auri VRM] loaded authored pose: ${name}`);
        if (Array.isArray(relativePath) && loadedPath !== relativePath[0]) {
          console.info(`[Auri VRM] using fallback path for ${name}: ${loadedPath}`);
        }
      } catch (error) {
        console.warn(`Failed to load authored VRMA: ${name}`, error);
      }
    }

    const transitionEntries = Object.entries(AUTHORED_TRANSITION_FILES);
    for (const [name, relativePath] of transitionEntries) {
      try {
        const loadedPath = await loadAuthoredVRMAWithFallbacks(name, relativePath, "transition");
        console.info(`[Auri VRM] loaded authored transition: ${name}`);
        if (Array.isArray(relativePath) && loadedPath !== relativePath[0]) {
          console.info(`[Auri VRM] using fallback path for ${name}: ${loadedPath}`);
        }
      } catch (error) {
        console.warn(`Failed to load authored transition VRMA: ${name}`, error);
      }
    }
  }

  function sampleTransitionPose(transition, elapsedTime) {
    if (!transition) {
      return null;
    }

    const sampledPose = {};
    const clampedTime = clamp(elapsedTime, 0, Math.max(transition.duration, 0));

    for (const [boneName, track] of Object.entries(transition.bones || {})) {
      const times = track.times || [];
      const values = track.values || [];
      if (times.length === 0 || values.length < 4) {
        continue;
      }

      let startIndex = 0;
      while (startIndex < (times.length - 1) && clampedTime > times[startIndex + 1]) {
        startIndex += 1;
      }
      const endIndex = Math.min(startIndex + 1, times.length - 1);
      const startOffset = startIndex * 4;
      const endOffset = endIndex * 4;

      if (startIndex === endIndex || times[endIndex] <= times[startIndex]) {
        sampledPose[boneName] = {
          rotation: values.slice(startOffset, startOffset + 4)
        };
        continue;
      }

      const blend = clamp(
        (clampedTime - times[startIndex]) / Math.max(times[endIndex] - times[startIndex], 0.0001),
        0,
        1
      );
      baseQuaternion.fromArray(values.slice(startOffset, startOffset + 4));
      targetQuaternion.fromArray(values.slice(endOffset, endOffset + 4));
      baseQuaternion.slerp(targetQuaternion, blend);
      sampledPose[boneName] = {
        rotation: baseQuaternion.toArray()
      };
    }

    return sampledPose;
  }

  function authoredPoseForState(poseState) {
    switch (poseState) {
      case "angry":
        return authoredPoses.angry_pose || null;
      case "happy":
        return authoredPoses.happy_pose || null;
      case "dead":
        return authoredPoses.dead_pose || null;
      case "idle":
      default:
        return authoredPoses.idle_pose || null;
    }
  }

  function transitionKeyForPoseChange(fromState, toState) {
    if (fromState === "idle" && toState === "angry") {
      return "idle_angry_transition";
    }
    if (fromState === "idle" && toState === "happy") {
      return "idle_happy_transition";
    }
    return null;
  }

  function transitionPoseForState(targetPoseState, delta) {
    if (targetPoseState !== lastResolvedPoseState) {
      const transitionKey = transitionKeyForPoseChange(lastResolvedPoseState, targetPoseState);
      const transition = transitionKey ? authoredTransitions[transitionKey] : null;
      activePoseTransition = transition
        ? {
            key: transitionKey,
            toState: targetPoseState,
            elapsed: 0
          }
        : null;
      lastResolvedPoseState = targetPoseState;
    }

    if (!activePoseTransition || activePoseTransition.toState !== targetPoseState) {
      return null;
    }

    const transition = authoredTransitions[activePoseTransition.key];
    if (!transition || transition.duration <= 0) {
      activePoseTransition = null;
      return null;
    }

    activePoseTransition.elapsed = clamp(
      activePoseTransition.elapsed + delta,
      0,
      transition.duration
    );
    const pose = sampleTransitionPose(transition, activePoseTransition.elapsed);
    if (activePoseTransition.elapsed >= transition.duration) {
      activePoseTransition = null;
    }
    return pose;
  }

  function expressionTargets() {
    if (state.isSleeping) {
      return {
        happy: 0,
        relaxed: 0.16,
        sad: 0.02,
        angry: 0
      };
    }

    if (state.needsMedicine) {
      return {
        happy: 0,
        relaxed: 0,
        sad: 1,
        angry: 0
      };
    }

    if (state.wantsSleep || state.tired >= 0.66) {
      return {
        happy: 0,
        relaxed: 0.08,
        sad: 0.44,
        angry: 0
      };
    }

    if (state.wantsAttention) {
      return {
        happy: 0,
        relaxed: 0,
        sad: 0.12,
        angry: 0.92
      };
    }

    switch (state.mood) {
      case "bright":
        return { happy: 0.14, relaxed: 0.08, sad: 0, angry: 0 };
      case "sleepy":
        return { happy: 0, relaxed: 0.22, sad: 0.08, angry: 0 };
      case "needy":
        return { happy: 0, relaxed: 0, sad: 0.34, angry: 0.14 };
      case "fading":
        return { happy: 0, relaxed: 0, sad: 0.56, angry: 0.06 };
      case "gone":
        return { happy: 0, relaxed: 0, sad: 0, angry: 0 };
      default:
        return { happy: 0.06, relaxed: 0.04, sad: 0, angry: 0 };
    }
  }

  function applyExpressionState(delta) {
    if (!vrm?.expressionManager) {
      return;
    }

    const targets = expressionTargets();
    const eyesClosed = state.isSleeping || state.mood === "gone";
    const blinkWave = nextBlinkTarget(eyesClosed);

    expressionState.blink = damp(expressionState.blink, blinkWave, eyesClosed ? 7 : 18, delta);
    expressionState.happy = damp(expressionState.happy, targets.happy, 7.5, delta);
    expressionState.relaxed = damp(expressionState.relaxed, targets.relaxed, 7.5, delta);
    expressionState.sad = damp(expressionState.sad, targets.sad, 7.5, delta);
    expressionState.angry = damp(expressionState.angry, targets.angry, 7.5, delta);

    const expressions = vrm.expressionManager;
    const blinkMax = eyesClosed ? CLOSED_EYE_MAX : NATURAL_BLINK_MAX;
    const blinkValue = clamp(expressionState.blink, 0, blinkMax);
    const hasSplitBlink = Boolean(
      expressions.getExpression?.("blinkLeft") || expressions.getExpression?.("blinkRight")
    );

    if (hasSplitBlink) {
      expressions.setValue("blink", 0);
      if (expressions.getExpression?.("blinkLeft")) {
        expressions.setValue("blinkLeft", blinkValue);
      }
      if (expressions.getExpression?.("blinkRight")) {
        expressions.setValue("blinkRight", blinkValue);
      }
    } else {
      expressions.setValue("blink", blinkValue);
    }
    expressions.setValue("happy", clamp(expressionState.happy, 0, 1));
    expressions.setValue("relaxed", clamp(expressionState.relaxed, 0, 1));
    expressions.setValue("sad", clamp(expressionState.sad, 0, 1));
    if (expressions.getExpression?.("angry")) {
      expressions.setValue("angry", clamp(expressionState.angry, 0, 1));
    }
  }

  function applyPose(delta) {
    if (!vrm?.humanoid) {
      return;
    }

    const deadPose = state.mood === "gone";
    const wantsAttentionPose = state.wantsAttention && !state.isSleeping && !deadPose;
    const happyPose = state.mood === "bright" && !wantsAttentionPose && !state.isSleeping && !deadPose;
    const defaultAuthoredIdlePose = !wantsAttentionPose && !state.isSleeping && !deadPose;
    const upperBodyPose = wantsAttentionPose ? UPPER_BODY_POSES.angry_pose : UPPER_BODY_POSES.idle_pose;
    const sleepingPose = state.isSleeping;
    const fadingPose = state.mood === "fading";
    const sleepyPitch = state.isSleeping ? 0.22 : 0;
    const sadPitch = !wantsAttentionPose && (state.mood === "needy" || state.mood === "fading") ? 0.08 : 0;
    const totalPitch = sleepyPitch + sadPitch;
    const torsoPitch = sleepingPose ? 0.1 : wantsAttentionPose ? 0.02 : fadingPose ? 0.05 : 0;
    const torsoYaw = wantsAttentionPose ? 0.01 : 0;
    const torsoRoll = 0;
    const headPitch = totalPitch + (wantsAttentionPose ? 0.05 : 0) + (fadingPose ? 0.04 : 0);
    const headYaw = wantsAttentionPose ? 0.01 : 0;
    const headRoll = 0;
    const legSpread = wantsAttentionPose ? 0.01 : 0.02;
    const legPitch = sleepingPose ? -0.01 : 0;
    const kneeRelax = sleepingPose ? 0.02 : 0;
    const idleArmSwayEnabled = !wantsAttentionPose && !sleepingPose && state.mood !== "gone";
    const idleArmWave = idleArmSwayEnabled ? Math.sin(elapsed * 1.1) : 0;
    const idleHandWave = idleArmSwayEnabled ? Math.sin((elapsed * 1.1) + 0.9) : 0;
    const leftIdleArmOffset = idleArmSwayEnabled
      ? {
          shoulder: { x: 0.004 * idleArmWave, y: 0, z: 0.008 * idleArmWave },
          upperArm: { x: 0.012 * idleArmWave, y: -0.01 * idleArmWave, z: 0.02 * idleArmWave },
          lowerArm: { x: -0.014 * idleArmWave, y: 0, z: -0.012 * idleHandWave },
          hand: { x: 0.01 * idleHandWave, y: 0, z: -0.012 * idleHandWave }
        }
      : {
          shoulder: ZERO_ROTATION,
          upperArm: ZERO_ROTATION,
          lowerArm: ZERO_ROTATION,
          hand: ZERO_ROTATION
        };
    const rightIdleArmOffset = idleArmSwayEnabled
      ? {
          shoulder: { x: 0.004 * idleArmWave, y: 0, z: -0.008 * idleArmWave },
          upperArm: { x: 0.012 * idleArmWave, y: 0.01 * idleArmWave, z: -0.02 * idleArmWave },
          lowerArm: { x: -0.014 * idleArmWave, y: 0, z: 0.012 * idleHandWave },
          hand: { x: 0.01 * idleHandWave, y: 0, z: 0.012 * idleHandWave }
        }
      : {
          shoulder: ZERO_ROTATION,
          upperArm: ZERO_ROTATION,
          lowerArm: ZERO_ROTATION,
          hand: ZERO_ROTATION
        };
    const leftShoulderRotation = addRotation(upperBodyPose.leftShoulder, leftIdleArmOffset.shoulder);
    const rightShoulderRotation = addRotation(upperBodyPose.rightShoulder, rightIdleArmOffset.shoulder);
    const leftUpperArmRotation = addRotation(upperBodyPose.leftUpperArm, leftIdleArmOffset.upperArm);
    const rightUpperArmRotation = addRotation(upperBodyPose.rightUpperArm, rightIdleArmOffset.upperArm);
    const leftLowerArmRotation = addRotation(upperBodyPose.leftLowerArm, leftIdleArmOffset.lowerArm);
    const rightLowerArmRotation = addRotation(upperBodyPose.rightLowerArm, rightIdleArmOffset.lowerArm);
    const leftHandRotation = addRotation(upperBodyPose.leftHand, leftIdleArmOffset.hand);
    const rightHandRotation = addRotation(upperBodyPose.rightHand, rightIdleArmOffset.hand);

    if (vrm.scene) {
      vrm.scene.position.y = 0;
      vrm.scene.rotation.y = 0;
    }

    const onboardingPresentation = state.presentationMode === "onboarding";
    const groundedRootOffset = clamp(
      avatarFraming.height * (onboardingPresentation ? 0.2 : 0.16),
      onboardingPresentation ? 0.24 : 0.18,
      onboardingPresentation ? 0.42 : 0.32
    );
    const deadGroundedRootOffset = clamp(avatarFraming.height * 0.58, 0.90, 1.08);
    rootAnchor.rotation.set(0, 0, 0);
    rootAnchor.position.x = 0;
    rootAnchor.position.y = deadPose ? -deadGroundedRootOffset : -groundedRootOffset;
    rootAnchor.position.z = 0;

    const baseShadowWidth = deadPose
      ? clamp(avatarFraming.width * 1.1, 0.92, 1.42)
      : clamp(avatarFraming.width * 0.72, 0.58, 1.04);
    const baseShadowDepth = deadPose
      ? clamp(avatarFraming.width * 0.42, 0.34, 0.62)
      : clamp(avatarFraming.width * 0.30, 0.22, 0.44);
    groundShadow.scale.set(baseShadowWidth, baseShadowDepth, 1);
    groundShadow.position.y = deadPose ? 0.035 : 0.01;
    groundShadow.position.z = deadPose ? 0.03 : 0;
    groundShadow.material.opacity = state.lightsOff
      ? (deadPose ? 0.24 : 0.28)
      : (deadPose ? 0.16 : 0.18);
    groundShadow.visible = true;

    let normalizedPose = {
      hips: { rotation: poseRotation(sleepingPose ? -0.02 : 0, 0, 0) },
      spine: { rotation: poseRotation((totalPitch * 0.22) + torsoPitch, torsoYaw, torsoRoll) },
      chest: { rotation: poseRotation((totalPitch * 0.12) + (wantsAttentionPose ? 0.04 : 0), torsoYaw * 0.6, 0) },
      leftShoulder: {
        rotation: poseRotation(leftShoulderRotation.x, leftShoulderRotation.y, leftShoulderRotation.z)
      },
      rightShoulder: {
        rotation: poseRotation(rightShoulderRotation.x, rightShoulderRotation.y, rightShoulderRotation.z)
      },
      leftUpperArm: {
        rotation: poseRotation(leftUpperArmRotation.x, leftUpperArmRotation.y, leftUpperArmRotation.z)
      },
      rightUpperArm: {
        rotation: poseRotation(rightUpperArmRotation.x, rightUpperArmRotation.y, rightUpperArmRotation.z)
      },
      leftLowerArm: {
        rotation: poseRotation(leftLowerArmRotation.x, leftLowerArmRotation.y, leftLowerArmRotation.z)
      },
      rightLowerArm: {
        rotation: poseRotation(rightLowerArmRotation.x, rightLowerArmRotation.y, rightLowerArmRotation.z)
      },
      leftHand: {
        rotation: poseRotation(leftHandRotation.x, leftHandRotation.y, leftHandRotation.z)
      },
      rightHand: {
        rotation: poseRotation(rightHandRotation.x, rightHandRotation.y, rightHandRotation.z)
      },
      neck: { rotation: poseRotation((totalPitch * 0.26) + (wantsAttentionPose ? 0.02 : 0), headYaw * 0.5, 0) },
      head: { rotation: poseRotation(headPitch, headYaw, headRoll) },
      leftUpperLeg: { rotation: poseRotation(legPitch, 0, legSpread) },
      rightUpperLeg: { rotation: poseRotation(legPitch, 0, -legSpread) },
      leftLowerLeg: { rotation: poseRotation(kneeRelax, 0, 0) },
      rightLowerLeg: { rotation: poseRotation(kneeRelax, 0, 0) },
      leftFoot: { rotation: poseRotation(-0.06, 0, 0) },
      rightFoot: { rotation: poseRotation(-0.06, 0, 0) },
      leftThumbMetacarpal: {
        rotation: poseRotation(
          upperBodyPose.leftThumbMetacarpal.x,
          upperBodyPose.leftThumbMetacarpal.y,
          upperBodyPose.leftThumbMetacarpal.z
        )
      },
      rightThumbMetacarpal: {
        rotation: poseRotation(
          upperBodyPose.rightThumbMetacarpal.x,
          upperBodyPose.rightThumbMetacarpal.y,
          upperBodyPose.rightThumbMetacarpal.z
        )
      },
      leftThumbProximal: {
        rotation: poseRotation(
          upperBodyPose.leftThumbProximal.x,
          upperBodyPose.leftThumbProximal.y,
          upperBodyPose.leftThumbProximal.z
        )
      },
      rightThumbProximal: {
        rotation: poseRotation(
          upperBodyPose.rightThumbProximal.x,
          upperBodyPose.rightThumbProximal.y,
          upperBodyPose.rightThumbProximal.z
        )
      },
      leftThumbDistal: {
        rotation: poseRotation(
          upperBodyPose.leftThumbDistal.x,
          upperBodyPose.leftThumbDistal.y,
          upperBodyPose.leftThumbDistal.z
        )
      },
      rightThumbDistal: {
        rotation: poseRotation(
          upperBodyPose.rightThumbDistal.x,
          upperBodyPose.rightThumbDistal.y,
          upperBodyPose.rightThumbDistal.z
        )
      }
    };

    if (defaultAuthoredIdlePose && authoredPoses.idle_pose) {
      normalizedPose = mergePose(normalizedPose, authoredPoses.idle_pose);
    }

    const targetPoseState = deadPose
      ? "dead"
      : wantsAttentionPose
        ? "angry"
        : happyPose
          ? "happy"
          : "idle";
    const transitionPose = transitionPoseForState(targetPoseState, delta);
    const targetAuthoredPose = transitionPose || authoredPoseForState(targetPoseState);

    if (targetAuthoredPose) {
      normalizedPose = mergePose(normalizedPose, targetAuthoredPose);
    }

    const bodyPhysicsOffsets = buildBodyPhysicsOffsets(deadPose, sleepingPose);
    if (bodyPhysicsOffsets) {
      applyAdditivePose(normalizedPose, bodyPhysicsOffsets);
    }

    displayedPose = blendPose(
      displayedPose,
      normalizedPose,
      transitionPose ? POSE_BLEND.transitionSmoothing : POSE_BLEND.smoothing,
      delta
    );
    vrm.humanoid.setNormalizedPose(displayedPose || normalizedPose);
  }

  function updateCameraDrivenPhysics(delta) {
    if (!hasSpringBonePhysics) {
      return;
    }

    if (state.mood === "gone") {
      resetCameraDrivenPhysics();
      return;
    }

    if (!hasCameraMotionSample) {
      resetCameraDrivenPhysics();
      return;
    }

    cameraDelta.copy(camera.position).sub(previousCameraPosition);
    if (cameraDelta.lengthSq() < (CAMERA_PHYSICS.positionDeadzone * CAMERA_PHYSICS.positionDeadzone)) {
      cameraDelta.set(0, 0, 0);
    }
    physicsPositionTarget.copy(cameraDelta).multiplyScalar(-CAMERA_PHYSICS.translationImpulse);
    physicsPositionTarget.clampLength(0, CAMERA_PHYSICS.maxPositionOffset);

    cameraQuaternionDelta.copy(previousCameraQuaternion).invert().multiply(camera.quaternion);
    cameraRotationDelta.setFromQuaternion(cameraQuaternionDelta, "XYZ");
    if (Math.abs(cameraRotationDelta.x) < CAMERA_PHYSICS.rotationDeadzone) {
      cameraRotationDelta.x = 0;
    }
    if (Math.abs(cameraRotationDelta.y) < CAMERA_PHYSICS.rotationDeadzone) {
      cameraRotationDelta.y = 0;
    }
    if (Math.abs(cameraRotationDelta.z) < CAMERA_PHYSICS.rotationDeadzone) {
      cameraRotationDelta.z = 0;
    }
    physicsRotationTarget.x = clamp(
      cameraRotationDelta.x * CAMERA_PHYSICS.rotationImpulse,
      -CAMERA_PHYSICS.maxRotationOffset,
      CAMERA_PHYSICS.maxRotationOffset
    );
    physicsRotationTarget.y = clamp(
      -cameraRotationDelta.y * CAMERA_PHYSICS.rotationImpulse,
      -CAMERA_PHYSICS.maxRotationOffset,
      CAMERA_PHYSICS.maxRotationOffset
    );
    physicsRotationTarget.z = clamp(
      cameraRotationDelta.z * CAMERA_PHYSICS.rotationImpulse * 0.2,
      -(CAMERA_PHYSICS.maxRotationOffset * 0.5),
      CAMERA_PHYSICS.maxRotationOffset * 0.5
    );

    physicsPositionOffset.set(
      damp(physicsPositionOffset.x, physicsPositionTarget.x, CAMERA_PHYSICS.positionSmoothing, delta),
      damp(physicsPositionOffset.y, physicsPositionTarget.y, CAMERA_PHYSICS.positionSmoothing, delta),
      damp(physicsPositionOffset.z, physicsPositionTarget.z, CAMERA_PHYSICS.positionSmoothing, delta)
    );
    physicsRotationOffset.set(
      damp(physicsRotationOffset.x, physicsRotationTarget.x, CAMERA_PHYSICS.rotationSmoothing, delta),
      damp(physicsRotationOffset.y, physicsRotationTarget.y, CAMERA_PHYSICS.rotationSmoothing, delta),
      damp(physicsRotationOffset.z, physicsRotationTarget.z, CAMERA_PHYSICS.rotationSmoothing, delta)
    );

    physicsCenter.position.copy(physicsPositionOffset);
    physicsCenter.rotation.set(
      physicsRotationOffset.x,
      physicsRotationOffset.y,
      physicsRotationOffset.z
    );
    physicsCenter.updateMatrixWorld(true);

    if (bustBoneBindings.length > 0) {
      const bustSleepMultiplier = state.isSleeping ? BUST_PHYSICS.sleepMultiplier : 1;
      bustPhysicsPositionTarget.set(
        clamp(
          (physicsPositionOffset.x + (physicsRotationOffset.y * 0.2)) * BUST_PHYSICS.positionMultiplier * bustSleepMultiplier,
          -BUST_PHYSICS.maxPositionOffset,
          BUST_PHYSICS.maxPositionOffset
        ),
        clamp(
          ((-physicsPositionOffset.y * 0.62) + (Math.abs(physicsRotationOffset.x) * 0.12)) * BUST_PHYSICS.positionMultiplier * bustSleepMultiplier,
          -(BUST_PHYSICS.maxPositionOffset * 0.7),
          BUST_PHYSICS.maxPositionOffset * 0.7
        ),
        clamp(
          ((physicsPositionOffset.z * 0.82) - (physicsRotationOffset.x * 0.16)) * BUST_PHYSICS.positionMultiplier * bustSleepMultiplier,
          -(BUST_PHYSICS.maxPositionOffset * 0.85),
          BUST_PHYSICS.maxPositionOffset * 0.85
        )
      );

      bustPhysicsRotationTarget.set(
        clamp(
          physicsRotationOffset.x * BUST_PHYSICS.rotationMultiplier * bustSleepMultiplier,
          -BUST_PHYSICS.maxRotationOffset,
          BUST_PHYSICS.maxRotationOffset
        ),
        clamp(
          physicsRotationOffset.y * BUST_PHYSICS.rotationMultiplier * bustSleepMultiplier,
          -BUST_PHYSICS.maxRotationOffset,
          BUST_PHYSICS.maxRotationOffset
        ),
        clamp(
          physicsRotationOffset.z * BUST_PHYSICS.rotationMultiplier * bustSleepMultiplier,
          -(BUST_PHYSICS.maxRotationOffset * 0.8),
          BUST_PHYSICS.maxRotationOffset * 0.8
        )
      );

      bustPhysicsPositionOffset.set(
        damp(bustPhysicsPositionOffset.x, bustPhysicsPositionTarget.x, BUST_PHYSICS.positionSmoothing, delta),
        damp(bustPhysicsPositionOffset.y, bustPhysicsPositionTarget.y, BUST_PHYSICS.positionSmoothing, delta),
        damp(bustPhysicsPositionOffset.z, bustPhysicsPositionTarget.z, BUST_PHYSICS.positionSmoothing, delta)
      );
      bustPhysicsRotationOffset.set(
        damp(bustPhysicsRotationOffset.x, bustPhysicsRotationTarget.x, BUST_PHYSICS.rotationSmoothing, delta),
        damp(bustPhysicsRotationOffset.y, bustPhysicsRotationTarget.y, BUST_PHYSICS.rotationSmoothing, delta),
        damp(bustPhysicsRotationOffset.z, bustPhysicsRotationTarget.z, BUST_PHYSICS.rotationSmoothing, delta)
      );

      bustPhysicsCenter.position.set(
        physicsPositionOffset.x + bustPhysicsPositionOffset.x,
        physicsPositionOffset.y + bustPhysicsPositionOffset.y,
        physicsPositionOffset.z + bustPhysicsPositionOffset.z
      );
      bustPhysicsCenter.rotation.set(
        physicsRotationOffset.x + bustPhysicsRotationOffset.x,
        physicsRotationOffset.y + bustPhysicsRotationOffset.y,
        physicsRotationOffset.z + bustPhysicsRotationOffset.z
      );
      bustPhysicsCenter.updateMatrixWorld(true);
    }

    previousCameraPosition.copy(camera.position);
    previousCameraQuaternion.copy(camera.quaternion);
  }

  function renderFrame(delta) {
    elapsed += delta;

    controls.update();
    updateLighting();
    updateCameraDrivenPhysics(delta);

    if (vrm) {
      clearBustBoneOverrides();
      applyPose(delta);
      applyExpressionState(delta);
      vrm.update(delta);
      applyBustBoneOverrides();
    }

    renderer.render(scene, camera);
  }

  function stopFrameLoop() {
    if (animationFrameHandle === null) {
      return;
    }

    window.cancelAnimationFrame(animationFrameHandle);
    animationFrameHandle = null;
  }

  function startFrameLoop() {
    if (disposed || state.isPaused || animationFrameHandle !== null) {
      return;
    }

    clock.getDelta();
    animationFrameHandle = window.requestAnimationFrame(frame);
  }

  function frame() {
    animationFrameHandle = null;
    if (disposed || state.isPaused) {
      return;
    }

    renderFrame(Math.min(clock.getDelta(), 1 / 24));
    startFrameLoop();
  }

  function centerAvatar(loadedVrm) {
    bounds.setFromObject(loadedVrm.scene);
    bounds.getSize(extent);
    const targetHeight = 1.7;
    const scale = targetHeight / Math.max(extent.y, 0.001);
    loadedVrm.scene.scale.setScalar(scale);

    bounds.setFromObject(loadedVrm.scene);
    bounds.getCenter(center);

    loadedVrm.scene.position.x -= center.x;
    loadedVrm.scene.position.y -= bounds.min.y;
    loadedVrm.scene.position.z -= center.z;

    bounds.setFromObject(loadedVrm.scene);
    bounds.getSize(extent);
    bounds.getCenter(center);
    avatarFraming = {
      width: extent.x,
      height: extent.y,
      depth: extent.z,
      centerY: center.y
    };
    hasLoadedAvatar = true;
    fitCameraToAvatar(false);
    restorePendingCameraStateIfNeeded();
  }

  function loadAvatar(modelURL = state.modelURL || bootstrap.modelURL) {
    avatarLoadVersion += 1;
    const loadVersion = avatarLoadVersion;
    disposeLoadedAvatar();
    setOverlay(overlay, "Loading avatar…", true);
    postStatus("loading", "Loading avatar");

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      modelURL,
      (gltf) => {
        if (disposed || loadVersion !== avatarLoadVersion) {
          return;
        }
        const loadedVrm = gltf.userData?.vrm;
        if (!loadedVrm) {
          setOverlay(overlay, "This file loaded, but it did not expose VRM data.", true);
          postStatus("error", "No VRM data found");
          return;
        }

        vrm = loadedVrm;
        VRMUtils.rotateVRM0(vrm);
        VRMUtils.combineSkeletons(vrm.scene);
        centerAvatar(vrm);
        rootAnchor.add(vrm.scene);
        vrm.scene.add(physicsCenter);
        vrm.scene.add(bustPhysicsCenter);
        scene.updateMatrixWorld(true);
        configureSpringBonePhysics(vrm);
        loadAuthoredPoseAnimations();
        updateLighting();
        resize();
        restorePendingCameraStateIfNeeded();
        scheduleCameraStatePost(true);
        if (state.isPaused) {
          renderFrame(0);
        }
        setOverlay(overlay, "", false);
        postStatus("ready", "");
      },
      undefined,
      (error) => {
        if (disposed || loadVersion !== avatarLoadVersion) {
          return;
        }
        const message = error instanceof Error ? error.message : "VRM loading failed.";
        setOverlay(overlay, message, true);
        postStatus("error", message);
      }
    );
  }

  window.updateAuriAvatarState = (nextState) => {
    if (nextState && typeof nextState === "object") {
      window.__AuriLatestState = nextState;
    }
    const wasPaused = state.isPaused;
    const previousPresentationMode = state.presentationMode;
    const previousFramingYOffset = Number.isFinite(state.framingYOffset) ? state.framingYOffset : 0;
    const requestedModelURL = typeof nextState?.modelURL === "string" && nextState.modelURL.length > 0
      ? nextState.modelURL
      : state.modelURL;
    const didModelChange = requestedModelURL !== state.modelURL;
    state = {
      ...state,
      ...nextState,
      modelURL: requestedModelURL
    };
    if (didModelChange) {
      loadAvatar(state.modelURL);
    }

    const didPresentationModeChange = previousPresentationMode !== state.presentationMode;
    const nextFramingYOffset = Number.isFinite(state.framingYOffset) ? state.framingYOffset : 0;
    const didFramingYOffsetChange = previousFramingYOffset !== nextFramingYOffset;
    if (didPresentationModeChange && hasLoadedAvatar && !didModelChange) {
      if (state.presentationMode !== "room") {
        pendingRestoredCameraState = null;
      }
      fitCameraToAvatar(false);
    } else if (didFramingYOffsetChange && hasLoadedAvatar && !didModelChange) {
      fitCameraToAvatar({ preserveDistance: true });
    }

    if (state.isPaused) {
      stopFrameLoop();
    } else if (wasPaused) {
      hasCameraMotionSample = false;
      previousCameraPosition.copy(camera.position);
      previousCameraQuaternion.copy(camera.quaternion);
      startFrameLoop();
    }
  };

  window.restoreAuriAvatarCamera = (nextCameraState) => {
    pendingRestoredCameraState = nextCameraState;
    if (restorePendingCameraStateIfNeeded()) {
      scheduleCameraStatePost(true);
    }
  };

  window.disposeAuriAvatar = () => {
    disposed = true;
    stopFrameLoop();
    scheduleCameraStatePost(true);
    resizeObserver.disconnect();
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("dblclick", resetCameraView);
    canvas.removeEventListener("touchstart", beginTapTracking);
    canvas.removeEventListener("touchmove", updateTapTracking);
    canvas.removeEventListener("touchend", endTapTracking);
    canvas.removeEventListener("touchcancel", cancelTapTracking);
    controls.dispose();
    renderer.dispose();
  };

  resize();
  loadAvatar(state.modelURL);
  startFrameLoop();
}

window.addEventListener("DOMContentLoaded", buildViewer, { once: true });
