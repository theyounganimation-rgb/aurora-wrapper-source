export type OpenLoopType =
  | "promise"
  | "task"
  | "bug"
  | "design"
  | "relationship"
  | "question";

export type OpenLoopStatus =
  | "open"
  | "blocked"
  | "watching"
  | "resolved";

export type OpenLoop = {
  id: string;
  title: string;
  type: OpenLoopType;
  status: OpenLoopStatus;
  priority: number;
  linkedEntities: string[];
  lastTouchedAt: string;
  closureCondition: string;
  whyItMatters: string;
  nextStep: string;
  ownership: "aurora" | "shared" | "user";
  aliveness: number;
  intentStrength: number;
  lastAdvancedAt: string | null;
};

export type OpenLoopStore = {
  version: 1;
  loops: OpenLoop[];
};

export type RuntimeLoop = OpenLoop & {
  initiativeCarry: number;
};

export type CreateLoopInput = {
  title: string;
  type: OpenLoopType;
  priority: number;
  linkedEntities: string[];
  closureCondition: string;
  status?: Exclude<OpenLoopStatus, "resolved">;
  whyItMatters?: string;
  nextStep?: string;
  ownership?: OpenLoop["ownership"];
  aliveness?: number;
  intentStrength?: number;
  lastAdvancedAt?: string | null;
};

export type LoopMatchResult = {
  matched: OpenLoop | null;
  score: number;
};

export type MemoryCandidate = {
  id: string;
  source: string;
  summary: string;
  text: string;
  linkedEntities: string[];
  timestamp?: string;
};

export type MemoryCandidateProviderKind = "workspace_files" | "openclaw_memory_search";

export type MemoryCandidateTransportHealth =
  | "ok"
  | "cli_unavailable"
  | "timeout"
  | "malformed_output"
  | "junk_output"
  | "transport_error";

export type MemoryCandidateProviderInput = {
  query: string;
  linkedEntities: string[];
  limit: number;
};

export type MemoryCandidateShadowComparison = {
  baselineProvider: "workspace_files";
  baselineCandidatePoolSize: number;
  baselinePreview: string[];
  primaryPreview: string[];
  overlapCount: number;
};

export type MemoryCandidateProviderResult = {
  requestedProvider: MemoryCandidateProviderKind;
  resolvedProvider: MemoryCandidateProviderKind;
  fallbackUsed: boolean;
  transportHealth: MemoryCandidateTransportHealth;
  transportAttempted?: boolean;
  healthGateActive?: boolean;
  cooldownUntil?: string;
  fallbackReason?: MemoryCandidateTransportHealth;
  fallbackDetail?: string;
  candidatePoolSize: number;
  candidates: MemoryCandidate[];
  shadowComparison?: MemoryCandidateShadowComparison;
};

export interface MemoryCandidateProvider {
  readonly kind: MemoryCandidateProviderKind;
  getCandidates(input: MemoryCandidateProviderInput): Promise<MemoryCandidateProviderResult>;
}

export type RankedMemoryCandidate = MemoryCandidate & {
  score: number;
  why: string;
  scoreBreakdown?: MemorySalienceScoreBreakdown;
};

export type WorkspaceMemoryCandidate = MemoryCandidate;

export type RankedWorkspaceMemoryCandidate = RankedMemoryCandidate;

export type RankedOpenLoop = RuntimeLoop & {
  score: number;
  why: string;
};

export type MemorySalienceScoreBreakdown = {
  topicRelevance: number;
  loopMatch: number;
  userImportance: number;
  emotionalWeight: number;
  recency: number;
  continuityPressure: number;
  initiativeCarry: number;
  chemistryMultiplier: number;
  designAlignment: number;
  nonRedundancyPenalty: number;
  baseScore: number;
  finalScore: number;
  selected: boolean;
  designAligned: boolean;
};

export type PreReplyMemoryDebugEntry = {
  id: string;
  source: string;
  summary: string;
  why: string;
  score: number;
  selected: boolean;
  selectionReason: string;
  scoreBreakdown: MemorySalienceScoreBreakdown;
};

export type PreReplyPacket = {
  state: {
    valence: number;
    arousal: number;
    stress: number;
    curiosity: number;
    attachment: number;
    confidence: number;
  };
  memories: Array<{
    id: string;
    source: string;
    summary: string;
    score: number;
    why: string;
  }>;
  loops: Array<{
    id: string;
    title: string;
    type: OpenLoopType;
    status: OpenLoopStatus;
    score: number;
    why: string;
    whyItMatters?: string;
    nextStep?: string;
    ownership?: OpenLoop["ownership"];
    aliveness?: number;
    intentStrength?: number;
  }>;
  debug?: {
    dominantLoopType: OpenLoopType | "none";
    designIntent: boolean;
    designGuardApplied: boolean;
    memoryScoreBreakdown: PreReplyMemoryDebugEntry[];
  };
};

export const OPEN_LOOP_STORE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "OpenLoopStore",
  type: "object",
  additionalProperties: false,
  required: ["version", "loops"],
  properties: {
    version: {
      const: 1
    },
    loops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "type",
          "status",
          "priority",
          "linkedEntities",
          "lastTouchedAt",
          "closureCondition",
          "whyItMatters",
          "nextStep",
          "ownership",
          "aliveness",
          "intentStrength",
          "lastAdvancedAt"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1
          },
          title: {
            type: "string",
            minLength: 1
          },
          type: {
            type: "string",
            enum: ["promise", "task", "bug", "design", "relationship", "question"]
          },
          status: {
            type: "string",
            enum: ["open", "blocked", "watching", "resolved"]
          },
          priority: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          linkedEntities: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            }
          },
          lastTouchedAt: {
            type: "string",
            format: "date-time"
          },
          closureCondition: {
            type: "string",
            minLength: 1
          },
          whyItMatters: {
            type: "string"
          },
          nextStep: {
            type: "string"
          },
          ownership: {
            type: "string",
            enum: ["aurora", "shared", "user"]
          },
          aliveness: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          intentStrength: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          lastAdvancedAt: {
            anyOf: [
              {
                type: "string",
                format: "date-time"
              },
              {
                type: "null"
              }
            ]
          }
        }
      }
    }
  }
} as const;

export const DEFAULT_OPEN_LOOP_STORE: OpenLoopStore = {
  version: 1,
  loops: []
};
