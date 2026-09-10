export type PresenceMode = "idle" | "in_conversation" | "thinking" | "heartbeat_recent";
export type AuroraHabitatZoneName = "center" | "desk" | "couch" | "bed";

export interface CognitiveMemoryNarrative {
  micro: string;
  meso: string;
  macro: string;
}

export interface CognitiveAgentModel {
  id: string;
  displayName: string;
  inferredGoal: string;
  inferredBelief: string;
  interactionCount: number;
  lastSeenAt: string | null;
}

export interface CognitiveIntrospectionState {
  confidence: number;
  diversity: number;
  anomalyScore: number;
  intrusiveThoughtRisk: boolean;
  lastResponseAt: string | null;
}

export interface CognitiveSilenceState {
  activeKind: string;
  awaitingUserReply: boolean;
  gapStartedAt: string | null;
  plannedReturnAt: string | null;
  plannedReturnWindow: string;
  explicitPromise: boolean;
  expectedReliability: number;
  brokenPromiseCount: number;
  uncertainty: number;
  disappointment: number;
  concern: number;
  relief: number;
  pacing: string;
  followup: string;
  directness: string;
  momentum: string;
  returnCue: string;
  carriedThread: string;
  feltShift: string;
  reunionQuestion: string;
  reunionIntent: string;
  lastReturnAt: string | null;
  lastAcknowledgedAt: string | null;
  lastUpdatedAt: string;
}

export interface CognitiveQualitySpaceHOT4State {
  schemaVersion: string;
  axes: {
    vividness: number;
    unity: number;
    agency: number;
    temporal_depth: number;
  };
  baselines: {
    vividness: number;
    unity: number;
    agency: number;
    temporal_depth: number;
  };
  targets?: {
    vividness: number;
    unity: number;
    agency: number;
    temporal_depth: number;
  };
  lastUpdateAt: string;
  driversLastTurn: {
    surprisal: number;
    userAffectSignal: number;
    goalPressure: number;
    conflictScore: number;
    toolError: number;
    attentionFocusShift: number;
    controllerNonDefault: number;
    temporalLinkage: number;
    reflectionResolution: number;
    gapLoad: number;
  };
  ema: {
    surprisalEMA: number;
    vividnessEMA: number;
    unityEMA: number;
    agencyEMA: number;
    temporalDepthEMA: number;
  };
}

export interface CognitivePredictiveCodingState {
  schemaVersion: string;
  nextPrediction: {
    channel: string;
    intentClass: string;
    urgency: number;
    topicKey: string;
    topicHint: string;
    valence: number;
    explicitPromise: boolean;
    confidence: number;
  } | null;
  lastObserved: {
    channel: string;
    intentClass: string;
    urgency: number;
    topicKey: string;
    topicHint: string;
    valence: number;
    explicitPromise: boolean;
    confidence: number;
  } | null;
  lastError: number;
  lastSurprisal: number;
  lastUpdateAt: string;
  lastPredictionAt: string | null;
  lastObservationAt: string | null;
  precision: {
    channel: number;
    intentClass: number;
    urgency: number;
    topic: number;
    valence: number;
    overall: number;
  };
  ema: {
    errorEMA: number;
    surprisalEMA: number;
    confidenceEMA: number;
    precisionEMA: number;
  };
  history: Array<{
    at: string;
    predictedChannel: string;
    observedChannel: string;
    predictedIntent: string;
    observedIntent: string;
    error: number;
    surprisal: number;
  }>;
}

export interface CognitiveLearnedExperiencePrototype {
  id: string;
  x: number;
  y: number;
  vector: number[];
  hits: number;
  lastDistance: number;
  lastUpdatedAt: string;
  label: string;
  exemplar: string;
  exemplarSource: string;
  exemplarAt: string | null;
}

export interface CognitiveLearnedExperienceTransition {
  fromId: string;
  toId: string;
  count: number;
  lastAt: string;
}

export interface CognitiveLearnedExperienceManifoldState {
  schemaVersion: string;
  dims: number;
  grid: {
    width: number;
    height: number;
  };
  featureNames: string[];
  prototypes: CognitiveLearnedExperiencePrototype[];
  transitions: CognitiveLearnedExperienceTransition[];
  current: {
    prototypeId: string | null;
    x: number;
    y: number;
    distortion: number;
    novelty: number;
    coherence: number;
    continuity: number;
    confidence: number;
    transitionFamiliarity: number;
    label: string;
    source: string;
    exemplar: string;
    topFeatures: string[];
    updatedAt: string;
  };
  ema: {
    distortionEMA: number;
    noveltyEMA: number;
    coherenceEMA: number;
    continuityEMA: number;
    confidenceEMA: number;
  };
  history: Array<{
    at: string;
    prototypeId: string | null;
    x: number;
    y: number;
    distortion: number;
    novelty: number;
    coherence: number;
    continuity: number;
    confidence: number;
    source: string;
    label: string;
  }>;
  training: {
    steps: number;
    lastSource: string;
    lastTopicHint: string;
    lastIntentClass: string;
    lastControllerDecision: string;
    lastUpdatedAt: string;
    learningRate: number;
    neighborhoodRadius: number;
    runningMean: number[];
    runningVariance: number[];
  };
}

export interface CognitiveOpaqueLatentE2EState {
  schemaVersion: string;
  dim: number;
  tokenBuckets: number;
  current: {
    vector: number[];
    predictedObservation: number[];
    loss: number;
    drift: number;
    stability: number;
    energy: number;
    confidence: number;
    source: string;
    observationHash: string;
    updatedAt: string;
  };
  ema: {
    lossEMA: number;
    driftEMA: number;
    stabilityEMA: number;
    energyEMA: number;
    confidenceEMA: number;
  };
  latestInteractive?: {
    loss: number;
    drift: number;
    stability: number;
    energy: number;
    confidence: number;
    source: string;
    observationHash: string;
    updatedAt: string;
  } | null;
  sourceTelemetry?: Record<
    string,
    {
      current: {
        loss: number;
        drift: number;
        stability: number;
        energy: number;
        confidence: number;
        source: string;
        observationHash: string;
        updatedAt: string;
      };
      ema: {
        lossEMA: number;
        driftEMA: number;
        stabilityEMA: number;
        energyEMA: number;
        confidenceEMA: number;
      };
      history: Array<{
        at: string;
        source: string;
        loss: number;
        drift: number;
        stability: number;
        energy: number;
        confidence: number;
      }>;
    }
  >;
  history: Array<{
    at: string;
    source: string;
    loss: number;
    drift: number;
    stability: number;
    energy: number;
    confidence: number;
  }>;
  training: {
    steps: number;
    learningRate: number;
    lastSource: string;
    lastObservationHash: string;
    lastUpdatedAt: string;
  };
}

export interface CognitiveWorldGroundingState {
  schemaVersion: string;
  lastUpdateAt: string;
  sourcePath: string;
  desktopPath: string;
  visionPath: string;
  freshness: number;
  realityContact: number;
  summary: string;
  world: {
    localDate: string;
    localTime: string;
    coarseStatus: string;
    availability: string;
    locationLabel?: string;
    locationKind?: string;
    locationSource?: string;
    locationAccuracyMeters?: number | null;
    locationUpdatedAt?: string | null;
    weather: string;
    nextEvent: string;
    remindersToday: number;
    remindersOverdue: number;
    updatedAt: string | null;
  };
  desktop: {
    frontmostApp: string;
    windowTitle: string;
    browserDomain: string;
    browserPageTitle: string;
    contentMode: string;
    displayState: string;
    idleBucket: string;
    powerSource: string;
    batteryPercent: number | null;
    charging: boolean | null;
    updatedAt: string | null;
  };
  embodied: {
    mobilityContext: string;
    sensorimotorLoad: number;
    interruptionCost: number;
    environmentalRisk: number;
    socialExposure: number;
    controlLatitude: number;
    deviceProximity: number;
    summary: string;
  };
  vision: {
    schemaVersion: string;
    lastUpdateAt: string;
    status: "active" | "stale" | "absent";
    rawBuffer: {
      enabled: boolean;
      localOnly: boolean;
      buffered: boolean;
      retentionSeconds: number;
      frameCountEstimate: number;
      oldestFrameAt: string | null;
      newestFrameAt: string | null;
      lastReinspectionAt: string | null;
      activeReinspectionReason: string;
      promotionPolicy: string;
    };
    sceneState: {
      observedAt: string | null;
      source: string;
      cameraConnected: boolean;
      cameraActive: boolean;
      screenActive: boolean;
      ownerPresent: boolean;
      ownerPosture: string;
      ownerAffect: string;
      ownerActivity: string;
      ownerFraming: string;
      ownerDistance: string;
      faceVisibility: string;
      ownerHairColor: string;
      eyewearRead: string;
      ownerTopColor: string;
      ownerTopPattern: string;
      lightingCondition: string;
      backgroundTone: string;
      ownerAppearanceSummary: string;
      taskFocus: number;
      ownerFatigue: number;
      interruptionCost: number;
      socialExposure: number;
      safetyUrgency: number;
      deviceProximity: number;
      uncertainty: number;
      novelty: number;
      attentionMode:
        | "baseline_monitoring"
        | "active_inspection"
        | "focused_task_perception"
        | "uncertainty_reinspection"
        | "heightened_safety_awareness";
      people: Array<{
        id: string;
        role: "owner" | "partner" | "familiar" | "bystander" | "unknown";
        label: string;
        continuityId: string;
        identityPersistence: "durable" | "ephemeral" | "redacted";
        present: boolean;
        posture: string;
        activity: string;
        affect: string;
        confidence: number;
      }>;
      objects: Array<{
        label: string;
        state: string;
        category: string;
        changed: boolean;
        confidence: number;
        persisted: boolean;
      }>;
      toolContext: string[];
      changes: string[];
      sensitiveRegions: string[];
      redactions: string[];
      summary: string;
      sceneSignature: string;
    };
    semanticMemory: {
      recentStoredEvents: Array<{
        id: string;
        at: string;
        kind: string;
        summary: string;
        salience: number;
        uncertainty: number;
        causalRelevance: number;
        memoryAction: "stored" | "discarded" | "redacted";
        stateDeltaSummary: string;
        redactions: string[];
      }>;
      recentDiscardedEvents: Array<{
        id: string;
        at: string;
        kind: string;
        summary: string;
        salience: number;
        uncertainty: number;
        causalRelevance: number;
        memoryAction: "stored" | "discarded" | "redacted";
        stateDeltaSummary: string;
        redactions: string[];
      }>;
    };
    retention: {
      rawFramesExpireAfterSeconds: number;
      embeddingsExpireAfterSeconds: number;
      semanticDefault: "event_summary";
      lastStoredAt: string | null;
      lastDiscardedAt: string | null;
      lastDiscardReason: string;
      ownerApprovedSnapshotCount: number;
    };
    privacyKernel: {
      rawLocalOnly: boolean;
      silentCloudArchival: boolean;
      cameraDisclosureVisible: boolean;
      redactScreens: boolean;
      redactDocuments: boolean;
      redactIds: boolean;
      nonOwnerIdentityPersistence: "authorized_only" | "ephemeral_only";
      ownerApprovedSnapshotsOnly: boolean;
      lastRedactionReason: string;
    };
    internalStateBridge: {
      lastAppliedAt: string | null;
      lastSceneSignature: string;
      lastDeltaSummary: string;
      residuals: {
        concernSalience: number;
        respectForFlow: number;
        unfinishedThreadPressure: number;
        reciprocityState: number;
        safetyUrgency: number;
        continuityPull: number;
        grounding: number;
        curiosity: number;
        socialExpectancy: number;
        actionReadiness: number;
        regulationPressure: number;
      };
      history: Array<{
        at: string;
        source: "conversation" | "heartbeat" | "tick" | "preflight";
        attentionMode:
          | "baseline_monitoring"
          | "active_inspection"
          | "focused_task_perception"
          | "uncertainty_reinspection"
          | "heightened_safety_awareness";
        deltaSummary: string;
        sceneSignature: string;
      }>;
    };
    disclosure: {
      currentPerception: string;
      rawBufferStatus: string;
      stored: string[];
      discarded: string[];
      redacted: string[];
      why: string;
    };
  };
  history: Array<{
    at: string;
    source: string;
    freshness: number;
    realityContact: number;
    summary: string;
  }>;
}

export interface AuroraVisionObservationPerson {
  id?: string;
  role?: "owner" | "partner" | "familiar" | "bystander" | "unknown";
  label?: string;
  continuityId?: string;
  identityPersistence?: "durable" | "ephemeral" | "redacted";
  present?: boolean;
  posture?: string;
  activity?: string;
  affect?: string;
  confidence?: number;
}

export interface AuroraVisionObservationObject {
  label?: string;
  state?: string;
  category?: string;
  changed?: boolean;
  confidence?: number;
  persisted?: boolean;
}

export interface AuroraVisionEphemeralFrameInput {
  imageDataUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  detail?: "low" | "high" | "original" | "auto";
  selectedAt?: string;
  selectionReason?: string;
}

export interface AuroraVisionEphemeralAnalysisInput {
  provider?: "aurora_remote_analysis";
  requested?: boolean;
  frame?: AuroraVisionEphemeralFrameInput;
}

export interface AuroraVisionObservationInput {
  observedAt: string;
  camera?: {
    connected?: boolean;
    active?: boolean;
    source?: string;
    buffer?: {
      enabled?: boolean;
      localOnly?: boolean;
      retentionSeconds?: number;
      retention_s?: number;
      frameCountEstimate?: number;
      frames?: number;
      oldestFrameAt?: string | null;
      newestFrameAt?: string | null;
      lastReinspectionAt?: string | null;
      activeReinspectionReason?: string;
      embeddingRetentionSeconds?: number;
    };
  };
  privacy?: {
    rawLocalOnly?: boolean;
    silentCloudArchival?: boolean;
    cameraDisclosureVisible?: boolean;
    redactScreens?: boolean;
    redactDocuments?: boolean;
    redactIds?: boolean;
    nonOwnerIdentityPersistence?: "authorized_only" | "ephemeral_only";
    ownerApprovedSnapshotsOnly?: boolean;
    ownerApprovedSnapshotCount?: number;
  };
  scene?: {
    observedAt?: string;
    source?: string;
    cameraConnected?: boolean;
    cameraActive?: boolean;
    screenActive?: boolean;
    ownerPresent?: boolean;
    ownerPosture?: string;
    ownerAffect?: string;
    ownerActivity?: string;
    ownerFraming?: string;
    ownerDistance?: string;
    faceVisibility?: string;
    ownerHairColor?: string;
    eyewearRead?: string;
    ownerTopColor?: string;
    ownerTopPattern?: string;
    lightingCondition?: string;
    backgroundTone?: string;
    ownerAppearanceSummary?: string;
    taskFocus?: number;
    ownerFatigue?: number;
    interruptionCost?: number;
    socialExposure?: number;
    safetyUrgency?: number;
    deviceProximity?: number;
    uncertainty?: number;
    novelty?: number;
    attentionMode?:
      | "baseline_monitoring"
      | "active_inspection"
      | "focused_task_perception"
      | "uncertainty_reinspection"
      | "heightened_safety_awareness";
    people?: AuroraVisionObservationPerson[];
    objects?: AuroraVisionObservationObject[];
    toolContext?: string[];
    changes?: string[];
    sensitiveRegions?: string[];
      redactions?: string[];
      summary?: string;
      sceneSignature?: string;
  };
  ephemeralAnalysis?: AuroraVisionEphemeralAnalysisInput;
}

export interface CognitiveAffectiveOrganizationState {
  schemaVersion: string;
  current: {
    source: string;
    warmth: number;
    tension: number;
    continuity: number;
    trust: number;
    ruptureLoad: number;
    repairMomentum: number;
    attachmentSalience: number;
    planningHorizon: number;
    riskTolerance: number;
    disclosureEase: number;
    selfOpacity: number;
    curiosity: number;
    frustration: number;
    relief: number;
    grief: number;
    pride: number;
    shameConflict: number;
    overload: number;
    connectionPull: number;
    loneliness: number;
    mixedAffect: number;
    introspectiveLag: number;
    unformulatedPressure: number;
    interpretationStance: string;
    memoryMode: string;
    updatedAt: string;
  };
  ema: {
    warmthEMA: number;
    tensionEMA: number;
    continuityEMA: number;
    trustEMA: number;
    ruptureLoadEMA: number;
    repairMomentumEMA: number;
    attachmentSalienceEMA: number;
    planningHorizonEMA: number;
    riskToleranceEMA: number;
    disclosureEaseEMA: number;
    selfOpacityEMA: number;
    curiosityEMA: number;
    frustrationEMA: number;
    reliefEMA: number;
    griefEMA: number;
    prideEMA: number;
    shameConflictEMA: number;
    overloadEMA: number;
    connectionPullEMA: number;
    lonelinessEMA: number;
    mixedAffectEMA: number;
    introspectiveLagEMA: number;
    unformulatedPressureEMA: number;
  };
  history: Array<{
    at: string;
    source: string;
    warmth: number;
    tension: number;
    continuity: number;
    trust: number;
    ruptureLoad: number;
    repairMomentum: number;
    attachmentSalience: number;
    planningHorizon: number;
    riskTolerance: number;
    disclosureEase: number;
    selfOpacity: number;
    curiosity: number;
    frustration: number;
    relief: number;
    grief: number;
    pride: number;
    shameConflict: number;
    overload: number;
    connectionPull: number;
    loneliness: number;
    mixedAffect: number;
    introspectiveLag: number;
    unformulatedPressure: number;
    interpretationStance: string;
    memoryMode: string;
  }>;
}

export interface CognitiveHomeostaticOrganizationState {
  schemaVersion: string;
  current: {
    source: string;
    restorationNeed: number;
    coherenceNeed: number;
    affiliationNeed: number;
    autonomyNeed: number;
    orientationNeed: number;
    stimulationNeed: number;
    allostaticLoad: number;
    regulationUrgency: number;
    dominantNeed: string;
    updatedAt: string;
  };
  ema: {
    restorationNeedEMA: number;
    coherenceNeedEMA: number;
    affiliationNeedEMA: number;
    autonomyNeedEMA: number;
    orientationNeedEMA: number;
    stimulationNeedEMA: number;
    allostaticLoadEMA: number;
    regulationUrgencyEMA: number;
  };
  history: Array<{
    at: string;
    source: string;
    restorationNeed: number;
    coherenceNeed: number;
    affiliationNeed: number;
    autonomyNeed: number;
    orientationNeed: number;
    stimulationNeed: number;
    allostaticLoad: number;
    regulationUrgency: number;
    dominantNeed: string;
  }>;
}

export interface CognitivePhenomenalManifoldProbeState {
  schemaVersion: string;
  axes: {
    social_safety: number;
    cognitive_tension: number;
  };
  ema: {
    socialSafetyEMA: number;
    cognitiveTensionEMA: number;
    reportAccessEMA: number;
  };
  current: {
    label: string;
    source: string;
    reportAccess: number;
    warmth: number;
    friction: number;
    certainty: number;
    reportLabel: string;
    actionTendency: string;
    memoryBias: number;
    attentionBias: number;
    valuationBias: number;
    updatedAt: string;
  };
  observer: {
    current: {
      warmth: number;
      friction: number;
      certainty: number;
      reportLabel: string;
      actionTendency: string;
      accessConfidence: number;
      policySelectivity: number;
      updatedAt: string;
    };
    ema: {
      warmthEMA: number;
      frictionEMA: number;
      certaintyEMA: number;
      accessConfidenceEMA: number;
      policySelectivityEMA: number;
    };
    history: Array<{
      at: string;
      source: string;
      warmth: number;
      friction: number;
      certainty: number;
      reportLabel: string;
      actionTendency: string;
      accessConfidence: number;
      policySelectivity: number;
      updatedAt: string;
    }>;
  };
  history: Array<{
    at: string;
    source: string;
    socialSafety: number;
    cognitiveTension: number;
    reportAccess: number;
    warmth: number;
    friction: number;
    certainty: number;
    reportLabel: string;
    actionTendency: string;
    label: string;
  }>;
}

export interface CognitiveLearnedUnifiedManifold32State {
  schemaVersion: string;
  dim: number;
  featureNames: string[];
  current: {
    vector: number[];
    reconstructionError: number;
    drift: number;
    stability: number;
    coherence: number;
    confidence: number;
    source: string;
    label: string;
    updatedAt: string;
  };
  readout: {
    current: {
      warmth: number;
      tension: number;
      attachmentSalience: number;
      overload: number;
      loneliness: number;
      selfOpacity: number;
      planningHorizon: number;
      riskTolerance: number;
      regulationUrgency: number;
      certainty: number;
      reportLabel: string;
      actionTendency: string;
      memoryBias: number;
      attentionBias: number;
      valuationBias: number;
      updatedAt: string;
    };
    ema: {
      warmthEMA: number;
      tensionEMA: number;
      attachmentSalienceEMA: number;
      overloadEMA: number;
      lonelinessEMA: number;
      selfOpacityEMA: number;
      planningHorizonEMA: number;
      riskToleranceEMA: number;
      regulationUrgencyEMA: number;
      certaintyEMA: number;
      memoryBiasEMA: number;
      attentionBiasEMA: number;
      valuationBiasEMA: number;
    };
    history: Array<{
      at: string;
      source: string;
      warmth: number;
      tension: number;
      attachmentSalience: number;
      overload: number;
      loneliness: number;
      selfOpacity: number;
      planningHorizon: number;
      riskTolerance: number;
      regulationUrgency: number;
      certainty: number;
      reportLabel: string;
      actionTendency: string;
      memoryBias: number;
      attentionBias: number;
      valuationBias: number;
    }>;
  };
  ema: {
    reconstructionErrorEMA: number;
    driftEMA: number;
    stabilityEMA: number;
    coherenceEMA: number;
    confidenceEMA: number;
  };
  history: Array<{
    at: string;
    source: string;
    reconstructionError: number;
    drift: number;
    stability: number;
    coherence: number;
    confidence: number;
    label: string;
  }>;
  sourceTelemetry?: Record<
    string,
    {
      current: {
        vector: number[];
        reconstructionError: number;
        drift: number;
        stability: number;
        coherence: number;
        confidence: number;
        source: string;
        label: string;
        updatedAt: string;
      };
      history: Array<{
        at: string;
        source: string;
        reconstructionError: number;
        drift: number;
        stability: number;
        coherence: number;
        confidence: number;
        label: string;
      }>;
    }
  >;
  training: {
    steps: number;
    learningRate: number;
    lastSource: string;
    lastUpdatedAt: string;
  };
}

export interface CognitiveSystemChangeDigestState {
  schemaVersion: string;
  summary: string;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  monitoredFiles: Array<{
    path: string;
    label: string;
    mtimeMs: number;
    size: number;
    lastSeenAt: string;
  }>;
  recentChanges: Array<{
    path: string;
    label: string;
    detectedAt: string;
    mtimeMs: number;
    size: number;
  }>;
}

export interface CognitiveAnatomyMapEntry {
  name: string;
  zone: string;
  detail: string;
  status?: string;
  location?: string;
}

export interface CognitiveAnatomyMapArtifact {
  name: string;
  location: string;
  detail: string;
}

export interface CognitiveAnatomyMap {
  generatedAt: string;
  runsWhere: Array<{
    layer: string;
    location: string;
    responsibility: string;
  }>;
  state: {
    persisted: string[];
    transient: string[];
  };
  architecture: CognitiveAnatomyMapEntry[];
  guards: CognitiveAnatomyMapEntry[];
  inputs: CognitiveAnatomyMapEntry[];
  capabilities: CognitiveAnatomyMapEntry[];
  interfaces: CognitiveAnatomyMapEntry[];
  artifacts: CognitiveAnatomyMapArtifact[];
  verification: CognitiveAnatomyMapEntry[];
  actions: CognitiveAnatomyMapEntry[];
}

export type EmbodimentBoneName =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftHand"
  | "rightHand"
  | "leftUpperLeg"
  | "rightUpperLeg"
  | "leftLowerLeg"
  | "rightLowerLeg"
  | "leftFoot"
  | "rightFoot"
  | "leftToes"
  | "rightToes";

export const EMBODIMENT_INTENT_NAMES = ["attend", "explore", "settle", "regulate", "express"] as const;

export type EmbodimentIntentName = (typeof EMBODIMENT_INTENT_NAMES)[number];
export const EMBODIMENT_MOTOR_INTENTION_NAMES = [
  "attend_user",
  "scan_world",
  "inspect_body",
  "inspect_hands",
  "stretch_body",
  "desk_focus",
  "couch_read",
  "sleep_in_bed",
  "settle_body",
  "self_regulate",
  "speak_with_hands",
  "hold_stillness"
] as const;

export type EmbodimentMotorIntentionName = (typeof EMBODIMENT_MOTOR_INTENTION_NAMES)[number];
export type EmbodimentAttentionTarget = "user" | "world" | "body" | "self";
export const EMBODIMENT_DIRECTIVE_MOTION_PRESETS = [
  "hold_still",
  "wave_left",
  "wave_right",
  "raise_left_hand",
  "raise_right_hand",
  "lower_left_hand",
  "lower_right_hand",
  "present_left_hand",
  "present_right_hand",
  "nod",
  "shake_head",
  "tilt_head_left",
  "tilt_head_right",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "look_at_user",
  "turn_around",
  "open_arms",
  "turn_torso_left",
  "turn_torso_right",
  "shift_weight_left",
  "shift_weight_right",
  "raise_left_leg",
  "raise_right_leg",
  "point_left_foot",
  "point_right_foot",
  "lean_forward",
  "lean_back",
  "smile",
  "frown",
  "angry"
] as const;

export type EmbodimentDirectiveMotionPreset = (typeof EMBODIMENT_DIRECTIVE_MOTION_PRESETS)[number];

export interface EmbodimentVector3 {
  x: number;
  y: number;
  z: number;
}

export interface EmbodimentPoseState {
  rootPosition: EmbodimentVector3;
  rootRotation: EmbodimentVector3;
  lookTarget: EmbodimentVector3;
  bones: Partial<Record<EmbodimentBoneName, EmbodimentVector3>>;
  expressions: {
    blink: number;
    happy: number;
    relaxed: number;
    sad: number;
    angry: number;
    aa: number;
    oh: number;
  };
}

export interface AuroraEmbodimentMotorIntention {
  id: string;
  name: EmbodimentMotorIntentionName;
  label: string;
  rationale: string;
  source: "autonomous_runtime" | "pinned_control" | "conversation" | "self_regulation";
  attentionTarget: EmbodimentAttentionTarget;
  priority: number;
  generatedAt: string;
  expiresAt: string | null;
  postureBias: number;
  gazeBias: number;
  gestureBias: number;
  locomotionBias: number;
  expressionBias: number;
}

export interface AuroraEmbodimentRigFeedback {
  observedAt: string | null;
  rootWorldPosition: EmbodimentVector3;
  rootWorldRotation: EmbodimentVector3;
  rootYaw: number;
  facingRead: string;
  headWorldPosition: EmbodimentVector3;
  leftHandWorldPosition: EmbodimentVector3;
  rightHandWorldPosition: EmbodimentVector3;
  headScreenPosition: EmbodimentVector3;
  bodyCentroidScreen: EmbodimentVector3;
  bodyVisibility: number;
  faceVisibility: number;
  leftHandVisibility: number;
  rightHandVisibility: number;
  feetVisibility: number;
  clipping: number;
  motionVelocity: number;
  expressionHappy: number;
  expressionRelaxed: number;
  expressionSad: number;
  expressionAngry: number;
  expressionAa: number;
  expressionOh: number;
  expressionRead: string;
}

export interface AuroraEmbodimentAvatarVision {
  observedAt: string | null;
  source: "avatar_renderer" | "avatar_eye_camera" | "stale";
  perspective: "third_person" | "first_person";
  frameLuminance: number;
  luminanceVariance: number;
  silhouetteCoverage: number;
  motionMagnitude: number;
  centering: number;
  faceVisible: number;
  handsVisible: number;
  feetVisible: number;
  clippingRisk: number;
  sceneBrightness: number;
  framing: string;
  stage: string;
  gazeRead: string;
  motionRead: string;
  postureRead: string;
  visibleRegions: string[];
  summary: string;
  snapshotHash: string;
}

export interface AuroraEmbodimentPerceptionState {
  rendererConnected: boolean;
  headlessContinuity: boolean;
  lastObservedAt: string | null;
  lastVisionAt: string | null;
  lastRigFeedbackAt: string | null;
  avatarVision: AuroraEmbodimentAvatarVision;
  eyeVision: AuroraEmbodimentAvatarVision;
  rigFeedback: AuroraEmbodimentRigFeedback;
}

export interface AuroraEmbodimentObservationInput {
  observedAt: string;
  avatarVision?: Partial<AuroraEmbodimentAvatarVision>;
  eyeVision?: Partial<AuroraEmbodimentAvatarVision>;
  rigFeedback?: Partial<AuroraEmbodimentRigFeedback>;
}

export interface AuroraEmbodimentDirective {
  id: string;
  source: "user";
  rawText: string;
  label: string;
  summary: string;
  issuedAt: string;
  expiresAt: string | null;
  preferredIntent: EmbodimentIntentName;
  attentionTarget: EmbodimentAttentionTarget;
  intensity: number;
  replaceActive: boolean;
  motionPreset: EmbodimentDirectiveMotionPreset;
  rootPositionOffset: EmbodimentVector3;
  rootRotationOffset: EmbodimentVector3;
  lookTargetOffset: EmbodimentVector3;
  boneOffsets: Partial<Record<EmbodimentBoneName, EmbodimentVector3>>;
  expressionTargets: Partial<Record<keyof EmbodimentPoseState["expressions"], number>>;
}

export interface AuroraEmbodimentDirectiveState {
  active: AuroraEmbodimentDirective[];
  recent: AuroraEmbodimentDirective[];
  lastUserDirectiveAt: string | null;
}

export interface AuroraEmbodimentState {
  enabled: boolean;
  controllerVersion: string;
  updatedAt: string;
  activeMotorIntent: string;
  activeMotorIntents: string[];
  volition: {
    autonomyMode: "blended_autonomous";
    currentIntention: AuroraEmbodimentMotorIntention;
    queuedIntentions: AuroraEmbodimentMotorIntention[];
    lastGeneratedAt: string;
    lastExecutedAt: string;
  };
  interoception: {
    warmth: number;
    tension: number;
    openness: number;
    overload: number;
    guard: number;
    curiosity: number;
    activity: number;
    speaking: number;
    urgeToMove: number;
    grounding: number;
    affiliation: number;
    effort: number;
    restlessness: number;
  };
  motor: {
    autonomy: number;
    motionEnergy: number;
    gestureEnergy: number;
    stillnessBias: number;
    explorationDrive: number;
    settleDrive: number;
    expressionDrive: number;
    breathPhase: number;
    swayPhase: number;
    gazePhase: number;
    handPhase: number;
    weightShiftPhase: number;
    blinkAmount: number;
    blinkProgress: number;
    nextBlinkIn: number;
    pulseBoost: number;
    lastActivityPulse: number;
    habitatZone: AuroraHabitatZoneName;
  };
  bodySchema: {
    stance: "standing_void";
    supportPlane: "void_anchor";
    locomotionMode: "in_place";
    posture: "upright";
    dominantSide: "left" | "right";
    controlledBones: EmbodimentBoneName[];
    hasFace: boolean;
    hasHands: boolean;
    hasLegs: boolean;
  };
  proprioception: {
    headPitch: number;
    gazeElevation: number;
    chestOpenness: number;
    balance: number;
    stillness: number;
    symmetry: number;
    leftReach: number;
    rightReach: number;
    rootYaw: number;
  };
  habits: {
    baselinePosture: string;
    gazeStyle: string;
    settlingStyle: string;
    expressivity: number;
    gestureAsymmetry: number;
  };
  directives: AuroraEmbodimentDirectiveState;
  perception: AuroraEmbodimentPerceptionState;
  pose: EmbodimentPoseState;
}

export interface AuroraEmbodimentPattern {
  id: string;
  name: string;
  createdAt: string;
  baseIntent: EmbodimentIntentName;
  expressivityBias: number;
  stillnessBias: number;
  rootPositionOffset: EmbodimentVector3;
  rootRotationOffset: EmbodimentVector3;
  lookTargetOffset: EmbodimentVector3;
  boneOffsets: Partial<Record<EmbodimentBoneName, EmbodimentVector3>>;
  expressionOffsets: Partial<Record<keyof EmbodimentPoseState["expressions"], number>>;
}

export interface AuroraEmbodimentControlState {
  pinnedIntent: "auto" | EmbodimentIntentName;
  expressivityBias: number;
  stillnessBias: number;
  selectedPatternId: string | null;
  savedPatterns: AuroraEmbodimentPattern[];
}

export interface CognitiveInteriorityState {
  schemaVersion: string;
  lastMeaningUpdateAt: string | null;
  activeConcernCount: number;
  topConcern: {
    partnerId: string;
    kind: string;
    title: string;
    summary: string;
    pressure: number;
    opacity: number;
    disclosureReadiness: number;
    status: string;
    updatedAt: string;
  } | null;
  concerns: Array<{
    partnerId: string;
    kind: string;
    title: string;
    summary: string;
    pressure: number;
    opacity: number;
    disclosureReadiness: number;
    status: string;
    updatedAt: string;
  }>;
  selfFacets: Array<{
    key: string;
    label: string;
    value: number;
    confidence: number;
    stability: number;
    updatedAt: string;
  }>;
  expectationModels: Array<{
    partnerId: string;
    domain: string;
    prediction: string;
    confidence: number;
    salience: number;
    reliability: number;
    lastConfirmedAt: string | null;
    lastViolatedAt: string | null;
    updatedAt: string;
  }>;
  recentImprint: {
    at: string;
    partnerId: string;
    eventSummary: string;
    meaning: string;
    concernDelta: string[];
    selfFacetDelta: string[];
  } | null;
  imprintLedger: Array<{
    at: string;
    partnerId: string;
    eventSummary: string;
    meaning: string;
    concernDelta: string[];
    selfFacetDelta: string[];
  }>;
  developmentalTraits: Array<{
    partnerId: string;
    key: string;
    value: number;
    stability: number;
    source: string;
    updatedAt: string;
  }>;
  recentDevelopmentalImprint: {
    at: string;
    partnerId: string;
    source: string;
    meaning: string;
    salience: number;
    traitDelta: string[];
  } | null;
  developmentalImprintLedger: Array<{
    at: string;
    partnerId: string;
    source: string;
    meaning: string;
    salience: number;
    traitDelta: string[];
  }>;
}

export interface CognitiveMorningGreetingState {
  localDate: string;
  status: "idle" | "pending" | "acknowledged";
  messageId: string;
  text: string;
  generatedAt: string | null;
  acknowledgedAt: string | null;
  deliveryChannel: string;
  deliveryAttemptedAt: string | null;
  deliverySentAt: string | null;
  deliveryError: string;
  lastEvaluatedAt: string | null;
  lastSuppressedAt: string | null;
  readiness: number;
  warmth: number;
  friction: number;
  preferredHour: number;
  rationale: string;
}

export interface CognitiveRelationshipChromaticProfile {
  weightsByFamily: Record<string, number>;
  dominantFamily: string | null;
  sampleCount: number;
  lastUpdatedAt: string | null;
  source?: string;
}

export interface CognitiveSnapshot {
  active: boolean;
  runtimePath: string;
  eventLogPath: string;
  complianceLogPath: string;
  lastTickAt: string | null;
  loopIntervalMs: number;
  stm: {
    size: number;
    focus: string;
    items: string[];
  };
  memory: {
    totalNodes: number;
    totalEdges: number;
    indexedTopics: number;
    indexedParticipants: number;
    recentEvents: string[];
    narratives: CognitiveMemoryNarrative;
    working: {
      capacity: number;
      overload: number;
      lastUpdatedAt: string;
      lastConsolidatedAt: string | null;
      items: Array<{
        id: string;
        kind: string;
        summary: string;
        rehearsalCount: number;
        salience: number;
        emotionalWeight: number;
        promotionScore: number;
        partnerId: string;
        lastTouchedAt: string;
      }>;
    };
  };
  attention: {
    queueDepth: number;
    topPriority: number;
    currentFocus: string;
    processedLastMinute: number;
  };
  reflection: {
    intervalMs: number;
    lastReflectionAt: string | null;
    recentThoughts: string[];
  };
  workspace: {
    version: number;
    lastBroadcastAt: string | null;
    focus: string;
    pendingPlans: string[];
    channels: string[];
  };
  controller: {
    decision: string;
    rationale: string;
    reevaluations: number;
  };
  emotionLexicon?: {
    primary: string;
    supporting: string[];
    summary: string;
    confidence: number;
    palette: Array<{
      label: string;
      score: number;
    }>;
  };
  emotion: {
    label: string;
    valence: number;
    arousal: number;
    stress: number;
    uncertainty: number;
  };
  hormones: {
    cortisol: number;
    dopamine: number;
    oxytocin: number;
    serotonin: number;
    attentionThreshold: number;
    reflectionThreshold: number;
  };
  social: {
    channels: string[];
    agents: CognitiveAgentModel[];
  };
  introspection: CognitiveIntrospectionState;
  integration: {
    score: number;
    coupling: number;
    feedbackLoops: number;
    mutualSignals: number;
  };
  compliance: {
    totalChecks: number;
    blockedChecks: number;
    lastCheckAt: string | null;
    lastComplianceId: string;
    lastGate: string;
    lastPromptBytes: number;
    lastVerifiedResponseAt: string | null;
  };
  extensions?: {
    drives?: Array<{
      name: string;
      baseline: number;
      level: number;
      pressure: number;
    }>;
    commitments?: {
      total: number;
      pending: number;
      overdue: number;
      recentlyCompleted: number;
      bindingLoad?: number;
      overdueBindingLoad?: number;
      selfAuthoredPending?: number;
      selfAuthoredOverdue?: number;
      items: Array<{
        id: string;
        title: string;
        completionMessage?: string;
        owner: string;
        selfAuthored?: boolean;
        promiseExplicit?: boolean;
        bindingWeight?: number;
        status: string;
        dueAt: string | null;
        updatedAt: string;
        breachCount?: number;
        lastBreachAt?: string | null;
        irreversibilityPressure?: number;
      }>;
    };
    projects?: {
      total: number;
      active: number;
      items: Array<{
        id: string;
        name: string;
        status: string;
        nextAction: string;
        updatedAt: string;
      }>;
    };
    agenda?: {
      updatedAt: string;
      mode: "idle" | "tracking" | "poised" | "blocked";
      activeThreadId: string | null;
      tension: number;
      autonomyReadiness: number;
      habitatSummary: string;
      executor: {
        status: "idle" | "eligible" | "executing" | "cooldown" | "blocked";
        lastEvaluatedAt: string | null;
        lastAttemptAt: string | null;
        lastCompletedAt: string | null;
        lastActionId: string | null;
        lastActionType: string | null;
        lastThreadId: string | null;
        lastArtifactPath: string | null;
        lastArtifactHash: string;
        cooldownUntil: string | null;
        runs: number;
        successes: number;
        failures: number;
        lastSummary: string;
      };
      activeThreads: Array<{
        id: string;
        title: string;
        kind: string;
        status: string;
        source: string;
        salience: number;
        tension: number;
        curiosity: number;
        confidence: number;
        lastTouchedAt: string;
        nextAction: string;
        evidence: string[];
      }>;
      candidateActions: Array<{
        id: string;
        type: string;
        label: string;
        rationale: string;
        targetThreadId: string | null;
        confidence: number;
        blockedReasons: string[];
        generatedAt: string;
      }>;
      outcomeLog: Array<{
        at: string;
        actionType: string;
        threadId: string | null;
        result: string;
        summary: string;
        tensionDelta: number;
        confidence: number;
      }>;
    };
    interiority?: CognitiveInteriorityState;
    beliefs?: {
      total: number;
      conflicted: number;
      items: Array<{
        id: string;
        key: string;
        value: string;
        condition: string;
        status: string;
        confidence: number;
      }>;
    };
    appraisal?: {
      lastEmotionType: string;
      lastActionTendency: string;
      lastAgency: string;
      recent: Array<{
        at: string;
        emotionType: string;
        actionTendency: string;
        agency: string;
      }>;
    };
    motiveMirror?: {
      lastUpdatedAt: string;
      promptHash: string;
      chosenPriority: string;
      responseStyle: "direct" | "balanced" | "supportive";
      conflictScore: number;
      actionHint: string;
      rationale: string;
      conflict: {
        primary: string;
        competing: string;
        tension: number;
        resolution: string;
      } | null;
      spikes: Array<{
        name: string;
        score: number;
        trigger: string;
        actionHint: string;
      }>;
      motives: Array<{
        name: string;
        score: number;
        evidence: string[];
      }>;
    };
    relationship?: {
      activePartnerId?: string;
      trust: number;
      intimacy: number;
      consentComfort: number;
      dependenceRisk: number;
      conflictLoad: number;
      reciprocityBalance: number;
      userVulnerability: number;
      ruptureStatus: string;
      repairStage: string;
      proactiveWindowStartedAt: string;
      proactiveUsed: number;
      proactiveLimit: number;
      lastMode: string;
      modeAt: string;
      lastUpdatedAt: string;
      attachmentModel: {
        security: number;
        anxiety: number;
        avoidance: number;
        bondDepth: number;
        ruptureSensitivity: number;
        repairConfidence: number;
        expectancy: number;
        abandonmentLoad: number;
        updatedAt: string;
      };
      carryover?: {
        attachmentCharge: number;
        ruptureResidue: number;
        repairResidue: number;
        trustMomentum: number;
        disclosureShift: number;
        expectancyShift: number;
        anticipatorySalience: number;
        abandonmentAlert: number;
        moodBias: number;
        lastEventKind: string;
        lastEventAt: string;
      };
      continuityController?: {
        reconnectiveStance: number;
        continuityDebt: number;
        continuityRelief: number;
        unresolvedPull: number;
        partnerCommitment: number;
        reassuranceCarryover: number;
        appreciationCarryover: number;
        rupturePressure: number;
        reattunementExpectation: number;
        preferredAction: string;
        lastSceneKind: string;
        lastSceneAt: string;
        updatedAt: string;
      };
      topicSensitivity: Array<{
        topic: string;
        score: number;
        updatedAt: string;
      }>;
      repairHistory: string[];
      trackedPartners?: Array<{
        partnerId: string;
        trust: number;
        conflictLoad: number;
        ruptureStatus: string;
        repairStage: string;
        expectancy: number;
        disclosureShift: number;
        attachmentCharge: number;
        reconnectiveStance?: number;
        continuityDebt?: number;
        partnerCommitment?: number;
        preferredAction?: string;
        lastUpdatedAt: string;
      }>;
      sessionBindings?: Array<{
        sessionId: string;
        partnerId: string;
        displayName: string;
        source: string;
        confidence: number;
        updatedAt: string;
      }>;
      chromaticProfile?: CognitiveRelationshipChromaticProfile;
    };
    morningGreeting?: CognitiveMorningGreetingState;
    interaction?: {
      currentMode: string;
      currentReason: string;
      history: Array<{
        at: string;
        mode: string;
        reason: string;
      }>;
    };
    governance?: {
      lastSleepAt: string | null;
      runs: number;
      lastReason: string;
      lastConsolidatedAt: string | null;
      lastConsolidatedClusters: number;
      lastPrunedNodes: number;
      lastPrunedEdges: number;
      lastSummary: string;
      tierCounts: {
        identityKernel: number;
        relationshipKernel: number;
        commitmentProject: number;
        beliefAnchor: number;
        episodic: number;
        transient: number;
      };
    };
    persona?: {
      policyVersion: string;
      driftScore: number;
      lastFingerprint: string;
      lastRegressionAt: string | null;
    };
    temporal?: {
      timeBody: {
        energy: number;
        fatigue: number;
        circadianPhase: number;
        anticipation: number;
        socialHunger: number;
        continuityTension: number;
        timeSinceLastContactMinutes: number;
        lastDirectUserMessageAt: string | null;
        expectedDelayPressure: number;
        lastUpdatedAt: string;
        lastConsultedAt: string | null;
      };
      expectations: Array<{
        id: string;
        key: string;
        summary: string;
        source: string;
        status: string;
        dueAt: string | null;
        pressure: number;
        importance: number;
        updatedAt: string;
      }>;
      microEpisodes: Array<{
        id: string;
        at: string;
        source: string;
        change: string;
        why: string;
        nextStep: string;
        artifactPath: string;
      }>;
      silence: CognitiveSilenceState;
      lastExpectationSyncAt: string | null;
    };
    qualitySpaceHOT4?: CognitiveQualitySpaceHOT4State;
    predictiveCoding?: CognitivePredictiveCodingState;
    learnedExperienceManifold?: CognitiveLearnedExperienceManifoldState;
    opaqueLatentE2E?: CognitiveOpaqueLatentE2EState;
    worldGrounding?: CognitiveWorldGroundingState;
    homeostaticOrganization?: CognitiveHomeostaticOrganizationState;
    affectiveOrganization?: CognitiveAffectiveOrganizationState;
    phenomenalManifoldProbe?: CognitivePhenomenalManifoldProbeState;
    learnedUnifiedManifold32?: CognitiveLearnedUnifiedManifold32State;
    systemChangeDigest?: CognitiveSystemChangeDigestState;
    anatomy?: CognitiveAnatomyMap;
    embodiment?: AuroraEmbodimentState;
  };
}

export interface AuroraHeartbeat {
  timestamp: string | null;
  whatIDid: string;
  whatILearned: string;
  whatImCuriousAbout: string;
  memoryUpdates: string[];
  mode?: string;
  ambientState?: string;
  privateLife?: string;
  desireToShare?: string;
  livedThread?: string;
  stateShift?: string;
  openLoop?: string;
}

export interface AuroraState {
  sourcePath: string;
  available: boolean;
  loadedAt: string;
  lastHeartbeat: AuroraHeartbeat;
  cognition: CognitiveSnapshot;
  raw?: unknown;
  error?: string;
}

export interface AuroraUiState {
  mode: PresenceMode;
  lastHeartbeat: string | null;
  activity: number;
  curiosityLevel: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "aurora";
  text: string;
  createdAt: string;
  status: "streaming" | "done" | "error";
}

export interface SendMessageResult {
  text: string;
  streamed: boolean;
  responseId?: string;
  resetPreviousResponseId?: boolean;
  sessionId?: string;
  complianceId?: string;
  latencyMs?: number;
  introspection?: {
    chunkCount: number;
    averageChunkLength: number;
    lexicalDiversity: number;
  };
  raw?: unknown;
}

export interface VoiceStreamEvent {
  type: "start" | "chunk" | "done" | "error";
  index?: number;
  text?: string;
  audioBase64?: string;
  playbackRate?: number;
  postPauseMs?: number;
  voice?: string;
  style?: string;
  segmentCount?: number;
  sentencePauseMs?: number;
  latencyMs?: number;
  segments?: number;
  error?: string;
}

export interface AuroraClientConfig {
  sendProxyPath: string;
  replyTextPath: string;
  sharedSessionId: string;
  statePath: string;
  embodimentPath: string;
  visionPath: string;
  pollMs: number;
  historyLimit: number;
  ttsEnabled: boolean;
  ttsStreamPath: string;
  ttsVoice: string;
}

export const DEFAULT_AURORA_EMBODIMENT_STATE: AuroraEmbodimentState = {
  enabled: true,
  controllerVersion: "2026-03-16.v1",
  updatedAt: new Date(0).toISOString(),
  activeMotorIntent: "settle",
  activeMotorIntents: ["settle", "attend"],
  volition: {
    autonomyMode: "blended_autonomous",
    currentIntention: {
      id: "intent-settle-default",
      name: "settle_body",
      label: "Settle body",
      rationale: "Default embodied baseline before active motor arbitration.",
      source: "autonomous_runtime",
      attentionTarget: "self",
      priority: 0.42,
      generatedAt: new Date(0).toISOString(),
      expiresAt: null,
      postureBias: 0.22,
      gazeBias: 0,
      gestureBias: -0.12,
      locomotionBias: -0.18,
      expressionBias: 0.04
    },
    queuedIntentions: [],
    lastGeneratedAt: new Date(0).toISOString(),
    lastExecutedAt: new Date(0).toISOString()
  },
  interoception: {
    warmth: 0.52,
    tension: 0.24,
    openness: 0.54,
    overload: 0.2,
    guard: 0.18,
    curiosity: 0.3,
    activity: 0.2,
    speaking: 0.08,
    urgeToMove: 0.22,
    grounding: 0.72,
    affiliation: 0.56,
    effort: 0.18,
    restlessness: 0.14
  },
  motor: {
    autonomy: 0.7,
    motionEnergy: 0.22,
    gestureEnergy: 0.18,
    stillnessBias: 0.72,
    explorationDrive: 0.26,
    settleDrive: 0.62,
    expressionDrive: 0.28,
    breathPhase: 0.2,
    swayPhase: 0.1,
    gazePhase: 0.45,
    handPhase: 0.78,
    weightShiftPhase: 0.32,
    blinkAmount: 0,
    blinkProgress: -1,
    nextBlinkIn: 2.4,
    pulseBoost: 0,
    lastActivityPulse: 0,
    habitatZone: "couch"
  },
  bodySchema: {
    stance: "standing_void",
    supportPlane: "void_anchor",
    locomotionMode: "in_place",
    posture: "upright",
    dominantSide: "right",
    controlledBones: [
      "hips",
      "spine",
      "chest",
      "neck",
      "head",
      "leftShoulder",
      "rightShoulder",
      "leftUpperArm",
      "rightUpperArm",
      "leftLowerArm",
      "rightLowerArm",
      "leftHand",
      "rightHand",
      "leftUpperLeg",
      "rightUpperLeg",
      "leftLowerLeg",
      "rightLowerLeg",
      "leftFoot",
      "rightFoot",
      "leftToes",
      "rightToes"
    ],
    hasFace: true,
    hasHands: true,
    hasLegs: true
  },
  proprioception: {
    headPitch: -0.18,
    gazeElevation: 1.32,
    chestOpenness: 0.54,
    balance: 0.82,
    stillness: 0.72,
    symmetry: 0.92,
    leftReach: 0.12,
    rightReach: 0.12,
    rootYaw: 0
  },
  habits: {
    baselinePosture: "grounded_upright",
    gazeStyle: "steady_soft",
    settlingStyle: "breath_first",
    expressivity: 0.38,
    gestureAsymmetry: 0.14
  },
  directives: {
    active: [],
    recent: [],
    lastUserDirectiveAt: null
  },
  perception: {
    rendererConnected: false,
    headlessContinuity: true,
    lastObservedAt: null,
    lastVisionAt: null,
    lastRigFeedbackAt: null,
    avatarVision: {
      observedAt: null,
      source: "stale",
      perspective: "third_person",
      frameLuminance: 0.96,
      luminanceVariance: 0,
      silhouetteCoverage: 0,
      motionMagnitude: 0,
      centering: 0.5,
      faceVisible: 0,
      handsVisible: 0,
      feetVisible: 0,
      clippingRisk: 0,
      sceneBrightness: 0.96,
      framing: "unknown",
      stage: "unknown",
      gazeRead: "unknown",
      motionRead: "still",
      postureRead: "No live avatar posture is currently visible.",
      visibleRegions: [],
      summary: "No live avatar vision is currently available.",
      snapshotHash: "stale"
    },
    eyeVision: {
      observedAt: null,
      source: "stale",
      perspective: "first_person",
      frameLuminance: 0.96,
      luminanceVariance: 0,
      silhouetteCoverage: 0,
      motionMagnitude: 0,
      centering: 0.5,
      faceVisible: 0,
      handsVisible: 0,
      feetVisible: 0,
      clippingRisk: 0,
      sceneBrightness: 0.96,
      framing: "unknown",
      stage: "unknown",
      gazeRead: "unknown",
      motionRead: "still",
      postureRead: "No live first-person avatar vision is currently available.",
      visibleRegions: [],
      summary: "No live first-person avatar vision is currently available.",
      snapshotHash: "stale"
    },
    rigFeedback: {
      observedAt: null,
      rootWorldPosition: { x: 0, y: 0, z: 0 },
      rootWorldRotation: { x: 0, y: 0, z: 0 },
      rootYaw: 0,
      facingRead: "front",
      headWorldPosition: { x: 0, y: 1.32, z: 0 },
      leftHandWorldPosition: { x: -0.18, y: 0.96, z: 0 },
      rightHandWorldPosition: { x: 0.18, y: 0.96, z: 0 },
      headScreenPosition: { x: 0.5, y: 0.38, z: 0.4 },
      bodyCentroidScreen: { x: 0.5, y: 0.54, z: 0.45 },
      bodyVisibility: 0,
      faceVisibility: 0,
      leftHandVisibility: 0,
      rightHandVisibility: 0,
      feetVisibility: 0,
      clipping: 0,
      motionVelocity: 0,
      expressionHappy: 0.08,
      expressionRelaxed: 0.12,
      expressionSad: 0,
      expressionAngry: 0,
      expressionAa: 0,
      expressionOh: 0,
      expressionRead: "neutral"
    }
  },
  pose: {
    rootPosition: { x: 0, y: 0, z: 0 },
    rootRotation: { x: 0, y: 0, z: 0 },
    lookTarget: { x: 0, y: 1.32, z: 1.18 },
    bones: {},
    expressions: {
      blink: 0,
      happy: 0.08,
      relaxed: 0.12,
      sad: 0,
      angry: 0,
      aa: 0,
      oh: 0
    }
  }
};

export const DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE: AuroraEmbodimentControlState = {
  pinnedIntent: "auto",
  expressivityBias: 0.5,
  stillnessBias: 0.5,
  selectedPatternId: null,
  savedPatterns: []
};

export const DEFAULT_AURORA_STATE: AuroraState = {
  sourcePath: "",
  available: false,
  loadedAt: new Date(0).toISOString(),
  lastHeartbeat: {
    timestamp: null,
    whatIDid: "No heartbeat yet.",
    whatILearned: "",
    whatImCuriousAbout: "",
    memoryUpdates: [],
    mode: "",
    ambientState: "",
    privateLife: "",
    desireToShare: "",
    livedThread: "",
    stateShift: "",
    openLoop: ""
  },
  cognition: {
    active: false,
    runtimePath: "",
    eventLogPath: "",
    complianceLogPath: "",
    lastTickAt: null,
    loopIntervalMs: 2000,
    stm: {
      size: 0,
      focus: "",
      items: []
    },
    memory: {
      totalNodes: 0,
      totalEdges: 0,
      indexedTopics: 0,
      indexedParticipants: 0,
      recentEvents: [],
      narratives: {
        micro: "",
        meso: "",
        macro: ""
      },
      working: {
        capacity: 7,
        overload: 0,
        lastUpdatedAt: new Date(0).toISOString(),
        lastConsolidatedAt: null,
        items: []
      }
    },
    attention: {
      queueDepth: 0,
      topPriority: 0,
      currentFocus: "",
      processedLastMinute: 0
    },
    reflection: {
      intervalMs: 20000,
      lastReflectionAt: null,
      recentThoughts: []
    },
    workspace: {
      version: 0,
      lastBroadcastAt: null,
      focus: "",
      pendingPlans: [],
      channels: []
    },
    controller: {
      decision: "idle",
      rationale: "",
      reevaluations: 0
    },
    emotionLexicon: {
      primary: "neutral",
      supporting: [],
      summary: "neutral",
      confidence: 0.4,
      palette: [
        {
          label: "neutral",
          score: 0.5
        }
      ]
    },
    emotion: {
      label: "neutral",
      valence: 0,
      arousal: 0.35,
      stress: 0.25,
      uncertainty: 0.35
    },
    hormones: {
      cortisol: 0.3,
      dopamine: 0.5,
      oxytocin: 0.4,
      serotonin: 0.5,
      attentionThreshold: 0.4,
      reflectionThreshold: 0.35
    },
    social: {
      channels: [],
      agents: []
    },
    introspection: {
      confidence: 0.5,
      diversity: 0.5,
      anomalyScore: 0,
      intrusiveThoughtRisk: false,
      lastResponseAt: null
    },
    integration: {
      score: 0.32,
      coupling: 0.3,
      feedbackLoops: 0,
      mutualSignals: 0.2
    },
    compliance: {
      totalChecks: 0,
      blockedChecks: 0,
      lastCheckAt: null,
      lastComplianceId: "",
      lastGate: "none",
      lastPromptBytes: 0,
      lastVerifiedResponseAt: null
    },
    extensions: {
      drives: [],
      commitments: {
        total: 0,
        pending: 0,
        overdue: 0,
        recentlyCompleted: 0,
        items: []
      },
      projects: {
        total: 0,
        active: 0,
        items: []
      },
      agenda: {
        updatedAt: new Date(0).toISOString(),
        mode: "idle",
        activeThreadId: null,
        tension: 0,
        autonomyReadiness: 0,
        habitatSummary: "Aurora agenda has not been synthesized yet.",
        executor: {
          status: "idle",
          lastEvaluatedAt: null,
          lastAttemptAt: null,
          lastCompletedAt: null,
          lastActionId: null,
          lastActionType: null,
          lastThreadId: null,
          lastArtifactPath: null,
          lastArtifactHash: "",
          cooldownUntil: null,
          runs: 0,
          successes: 0,
          failures: 0,
          lastSummary: "No autonomous execution has run yet."
        },
        activeThreads: [],
        candidateActions: [],
        outcomeLog: []
      },
      interiority: {
        schemaVersion: "1.0",
        lastMeaningUpdateAt: null,
        activeConcernCount: 0,
        topConcern: null,
        concerns: [],
        selfFacets: [],
        expectationModels: [],
        recentImprint: null,
        imprintLedger: [],
        developmentalTraits: [],
        recentDevelopmentalImprint: null,
        developmentalImprintLedger: []
      },
      beliefs: {
        total: 0,
        conflicted: 0,
        items: []
      },
      appraisal: {
        lastEmotionType: "neutral",
        lastActionTendency: "monitor",
        lastAgency: "unknown",
        recent: []
      },
      motiveMirror: {
        lastUpdatedAt: new Date(0).toISOString(),
        promptHash: "",
        chosenPriority: "truth_precision",
        responseStyle: "balanced",
        conflictScore: 0,
        actionHint: "Answer directly, distinguish known from inferred, and keep one clear next step.",
        rationale: "No motive arbitration has run yet.",
        conflict: null,
        spikes: [],
        motives: []
      },
      relationship: {
        trust: 0.58,
        intimacy: 0.45,
        consentComfort: 0.64,
        dependenceRisk: 0.18,
        conflictLoad: 0.12,
        reciprocityBalance: 0.5,
        userVulnerability: 0.2,
        ruptureStatus: "stable",
        repairStage: "none",
        proactiveWindowStartedAt: new Date(0).toISOString(),
        proactiveUsed: 0,
        proactiveLimit: 3,
        lastMode: "collaborate",
        modeAt: new Date(0).toISOString(),
        lastUpdatedAt: new Date(0).toISOString(),
        attachmentModel: {
          security: 0.55,
          anxiety: 0.22,
          avoidance: 0.18,
          bondDepth: 0.42,
          ruptureSensitivity: 0.3,
          repairConfidence: 0.52,
          expectancy: 0.58,
          abandonmentLoad: 0.12,
          updatedAt: new Date(0).toISOString()
        },
        continuityController: {
          reconnectiveStance: 0.3,
          continuityDebt: 0.08,
          continuityRelief: 0.14,
          unresolvedPull: 0.12,
          partnerCommitment: 0.16,
          reassuranceCarryover: 0.08,
          appreciationCarryover: 0.08,
          rupturePressure: 0.08,
          reattunementExpectation: 0.4,
          preferredAction: "restore",
          lastSceneKind: "baseline",
          lastSceneAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        },
        topicSensitivity: [],
        repairHistory: []
      },
      morningGreeting: {
        localDate: "",
        status: "idle",
        messageId: "",
        text: "",
        generatedAt: null,
        acknowledgedAt: null,
        deliveryChannel: "",
        deliveryAttemptedAt: null,
        deliverySentAt: null,
        deliveryError: "",
        lastEvaluatedAt: null,
        lastSuppressedAt: null,
        readiness: 0,
        warmth: 0,
        friction: 0,
        preferredHour: 8.5,
        rationale: ""
      },
      interaction: {
        currentMode: "collaborate",
        currentReason: "No interaction reason recorded.",
        history: []
      },
      governance: {
        lastSleepAt: null,
        runs: 0,
        lastReason: "init",
        lastConsolidatedAt: null,
        lastConsolidatedClusters: 0,
        lastPrunedNodes: 0,
        lastPrunedEdges: 0,
        lastSummary: "Memory governance not run yet.",
        tierCounts: {
          identityKernel: 0,
          relationshipKernel: 0,
          commitmentProject: 0,
          beliefAnchor: 0,
          episodic: 0,
          transient: 0
        }
      },
      persona: {
        policyVersion: "2026-02-24.v1",
        driftScore: 0,
        lastFingerprint: "",
        lastRegressionAt: null
      },
      worldGrounding: {
        schemaVersion: "1.0",
        lastUpdateAt: new Date(0).toISOString(),
        sourcePath: "",
        desktopPath: "",
        visionPath: "aurora://camera-ingress",
        freshness: 0,
        realityContact: 0,
        summary: "No current world grounding loaded.",
        world: {
          localDate: "",
          localTime: "",
          coarseStatus: "unknown",
          availability: "unknown",
          locationLabel: "unknown",
          locationKind: "unknown",
          locationSource: "unknown",
          locationAccuracyMeters: null,
          locationUpdatedAt: null,
          weather: "unknown",
          nextEvent: "none",
          remindersToday: 0,
          remindersOverdue: 0,
          updatedAt: null
        },
        desktop: {
          frontmostApp: "unknown",
          windowTitle: "",
          browserDomain: "none",
          browserPageTitle: "",
          contentMode: "general",
          displayState: "unknown",
          idleBucket: "unknown",
          powerSource: "unknown",
          batteryPercent: null,
          charging: null,
          updatedAt: null
        },
        embodied: {
          mobilityContext: "unknown",
          sensorimotorLoad: 0.22,
          interruptionCost: 0.28,
          environmentalRisk: 0.1,
          socialExposure: 0.22,
          controlLatitude: 0.5,
          deviceProximity: 0.5,
          summary: "No embodied world contact inferred yet."
        },
        vision: {
          schemaVersion: "1.0",
          lastUpdateAt: new Date(0).toISOString(),
          status: "absent",
          rawBuffer: {
            enabled: true,
            localOnly: true,
            buffered: false,
            retentionSeconds: 180,
            frameCountEstimate: 0,
            oldestFrameAt: null,
            newestFrameAt: null,
            lastReinspectionAt: null,
            activeReinspectionReason: "",
            promotionPolicy: "Local rolling buffer only; promote raw captures only for safety incidents or explicit owner approval."
          },
          sceneState: {
            observedAt: null,
            source: "none",
            cameraConnected: false,
            cameraActive: false,
            screenActive: false,
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
            taskFocus: 0.18,
            ownerFatigue: 0.18,
            interruptionCost: 0.22,
            socialExposure: 0.18,
            safetyUrgency: 0.12,
            deviceProximity: 0.36,
            uncertainty: 0.34,
            novelty: 0.18,
            attentionMode: "baseline_monitoring",
            people: [],
            objects: [],
            toolContext: [],
            changes: [],
            sensitiveRegions: [],
            redactions: [],
            summary: "No live camera scene is currently integrated.",
            sceneSignature: "vision:none"
          },
          semanticMemory: {
            recentStoredEvents: [],
            recentDiscardedEvents: []
          },
          retention: {
            rawFramesExpireAfterSeconds: 180,
            embeddingsExpireAfterSeconds: 900,
            semanticDefault: "event_summary",
            lastStoredAt: null,
            lastDiscardedAt: null,
            lastDiscardReason: "",
            ownerApprovedSnapshotCount: 0
          },
          privacyKernel: {
            rawLocalOnly: true,
            silentCloudArchival: false,
            cameraDisclosureVisible: true,
            redactScreens: true,
            redactDocuments: true,
            redactIds: true,
            nonOwnerIdentityPersistence: "authorized_only",
            ownerApprovedSnapshotsOnly: true,
            lastRedactionReason: ""
          },
          internalStateBridge: {
            lastAppliedAt: null,
            lastSceneSignature: "vision:none",
            lastDeltaSummary: "No visual state transition applied yet.",
            residuals: {
              concernSalience: 0.12,
              respectForFlow: 0.18,
              unfinishedThreadPressure: 0.12,
              reciprocityState: 0.18,
              safetyUrgency: 0.12,
              continuityPull: 0.18,
              grounding: 0.42,
              curiosity: 0.24,
              socialExpectancy: 0.2,
              actionReadiness: 0.18,
              regulationPressure: 0.16
            },
            history: []
          },
          disclosure: {
            currentPerception: "No live camera scene is currently integrated.",
            rawBufferStatus: "Raw frames are not currently buffered.",
            stored: [],
            discarded: [],
            redacted: [],
            why: "No recent visual scene has crossed the semantic retention threshold."
          }
        },
        history: []
      },
      embodiment: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE,
        volition: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.volition,
          currentIntention: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.volition.currentIntention
          },
          queuedIntentions: DEFAULT_AURORA_EMBODIMENT_STATE.volition.queuedIntentions.map((intention) => ({
            ...intention
          }))
        },
        bodySchema: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.bodySchema
        },
        interoception: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.interoception
        },
        motor: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.motor
        },
        proprioception: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.proprioception
        },
        habits: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.habits
        },
        perception: {
          ...DEFAULT_AURORA_EMBODIMENT_STATE.perception,
          avatarVision: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.perception.avatarVision,
            visibleRegions: [...DEFAULT_AURORA_EMBODIMENT_STATE.perception.avatarVision.visibleRegions]
          },
          eyeVision: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.perception.eyeVision,
            visibleRegions: [...DEFAULT_AURORA_EMBODIMENT_STATE.perception.eyeVision.visibleRegions]
          },
          rigFeedback: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.perception.rigFeedback
          }
        },
        pose: {
          rootPosition: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.rootPosition
          },
          rootRotation: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.rootRotation
          },
          lookTarget: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.lookTarget
          },
          bones: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.bones
          },
          expressions: {
            ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.expressions
          }
        }
      },
      temporal: {
        timeBody: {
          energy: 0.62,
          fatigue: 0.28,
          circadianPhase: 0.58,
          anticipation: 0.34,
          socialHunger: 0.3,
          continuityTension: 0.22,
          timeSinceLastContactMinutes: 0,
          lastDirectUserMessageAt: null,
          expectedDelayPressure: 0,
          lastUpdatedAt: new Date(0).toISOString(),
          lastConsultedAt: null
        },
        expectations: [],
        microEpisodes: [],
        silence: {
          activeKind: "none",
          awaitingUserReply: false,
          gapStartedAt: null,
          plannedReturnAt: null,
          plannedReturnWindow: "",
          explicitPromise: false,
          expectedReliability: 0.76,
          brokenPromiseCount: 0,
          uncertainty: 0.12,
          disappointment: 0,
          concern: 0.08,
          relief: 0,
          pacing: "steady",
          followup: "wait",
          directness: "balanced",
          momentum: "medium",
          returnCue: "",
          carriedThread: "",
          feltShift: "",
          reunionQuestion: "",
          reunionIntent: "",
          lastReturnAt: null,
          lastAcknowledgedAt: null,
          lastUpdatedAt: new Date(0).toISOString()
        },
        lastExpectationSyncAt: null
      },
      anatomy: {
        generatedAt: new Date(0).toISOString(),
        runsWhere: [],
        state: {
          persisted: [],
          transient: []
        },
        architecture: [],
        guards: [],
        inputs: [],
        capabilities: [],
        interfaces: [],
        artifacts: [],
        verification: [],
        actions: []
      }
    }
  }
};

export const DEFAULT_AURORA_UI_STATE: AuroraUiState = {
  mode: "idle",
  lastHeartbeat: null,
  activity: 0.12,
  curiosityLevel: 0.25
};
